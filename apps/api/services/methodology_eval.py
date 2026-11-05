# -*- coding: utf-8 -*-
"""
Methodology: the speech standard of a company and the evaluation of its real calls against it.

One row per (call, criterion): `adhered` = the manager said what the standard asks (script_adherence.py, his turns only),
`achieved` = the call audit passed that criterion. Nothing is invented: a call that was not assessed, has no transcript,
or whose turns are not labelled "Менеджер:" / "Клиент:" gets no rows and is counted under its reason instead.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import exists, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from packages.database.models import CallModuleEvaluation, CallRecording, ScriptModule, ScriptVersion

from ..tenant_registry import get_tenant_config
from .call_manager import UNKNOWN_MANAGER, resolve_call_manager
from .call_scorecard import read_scorecard
from .methodology_defaults import DEFAULT_MODULES, LEGACY_CR1_STAGE, NOT_SCRIPTED
from .script_adherence import evaluate_module, has_manager_speech, parse_turns

logger = logging.getLogger("methodology_eval")

MIN_TRANSCRIPT = 80  # characters: shorter is not a conversation
BACKFILL_MAX = 500


def _now() -> datetime:
    return datetime.now(timezone.utc)


def clean_tenant_id(tenant_id: str | None) -> str:
    return (tenant_id or "").strip().upper()


def add_default_modules(db: Session, version_id: str) -> None:
    for spec in DEFAULT_MODULES:
        db.add(
            ScriptModule(
                id=str(uuid.uuid4()),
                script_version_id=version_id,
                target_criterion=spec["target_criterion"],
                stage_name=spec["stage_name"],
                recommended_speech=spec["recommended_speech"],
                semantic_anchors=list(spec["semantic_anchors"]),
                banned_triggers=list(spec["banned_triggers"]),
                min_anchors_required=spec["min_anchors_required"],
            )
        )


def _find_version(db: Session, tenant: str) -> ScriptVersion | None:
    version = db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant, ScriptVersion.is_active.is_(True)).first()
    return version or db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant).order_by(ScriptVersion.created_at.desc()).first()


def _upgrade_legacy_modules(db: Session, tenant: str) -> None:
    """A version made before the audit numbering was adopted (cr1 = "Вход в контакт") and never applied to a call gets the
    current modules. A version that already has evaluations is history and stays as it is."""
    legacy = (
        db.query(ScriptModule.script_version_id)
        .join(ScriptVersion, ScriptVersion.id == ScriptModule.script_version_id)
        .filter(
            ScriptVersion.tenant_id == tenant,
            ScriptModule.target_criterion == "cr1",
            ScriptModule.stage_name == LEGACY_CR1_STAGE,
        )
        .all()
    )
    changed = False
    for (version_id,) in legacy:
        if db.query(CallModuleEvaluation.id).filter(CallModuleEvaluation.script_version_id == version_id).first():
            continue
        db.query(ScriptModule).filter(ScriptModule.script_version_id == version_id).delete()
        add_default_modules(db, version_id)
        changed = True
    if changed:
        db.commit()


def ensure_tenant_script_baseline(db: Session, tenant_id: str) -> ScriptVersion:
    """A company always has a script: the first visit creates v1.0 with neutral templates (no calls are invented)."""
    tenant = clean_tenant_id(tenant_id)
    version = _find_version(db, tenant)
    if version:
        _upgrade_legacy_modules(db, tenant)
        return version
    version = ScriptVersion(
        id=str(uuid.uuid4()),
        tenant_id=tenant,
        version_tag="v1.0",
        title="Базовый речевой стандарт (шаблон)",
        hypothesis="Стартовые формулировки по критериям аудита. Отредактируйте их под скрипт вашей компании: изменения войдут в новую версию.",
        is_active=True,
        activated_at=_now(),
        created_at=_now(),
    )
    db.add(version)
    try:
        db.flush()
        add_default_modules(db, str(version.id))
        db.commit()
    except IntegrityError:  # two first visits at once: the other one created v1.0
        db.rollback()
        found = _find_version(db, tenant)
        if not found:
            raise
        return found
    db.refresh(version)
    return version


def _clear_call(db: Session, call_id: str) -> int:
    n = db.query(CallModuleEvaluation).filter(CallModuleEvaluation.call_id == call_id).delete()
    if n:
        db.commit()
    return n


def evaluate_call(db: Session, call: CallRecording, manager_name: str | None = None) -> str:
    """Write the evaluation rows of one call. Returns the reason code: evaluated | no_applicable | not_assessed |
    no_transcript | no_labels. Safe to repeat: the rows of the call are replaced, under the version it was first judged by."""
    call_id = str(call.id)
    sc: Any = call.scorecard_criteria if isinstance(call.scorecard_criteria, dict) else {}
    card = read_scorecard(sc, float(call.overall_score) if call.overall_score is not None else None, str(call.ai_summary or ""))
    if card["kind"] != "assessed":
        _clear_call(db, call_id)
        return "not_assessed"
    transcript = call.transcript_text or ""
    if len(transcript.strip()) < MIN_TRANSCRIPT:
        _clear_call(db, call_id)
        return "no_transcript"
    name = None if not manager_name or manager_name == UNKNOWN_MANAGER else manager_name
    turns = parse_turns(transcript, name)
    if not has_manager_speech(turns):
        _clear_call(db, call_id)
        return "no_labels"

    tenant = clean_tenant_id(str(call.tenant_id))
    kept = db.query(CallModuleEvaluation.script_version_id).filter(CallModuleEvaluation.call_id == call_id).first()
    version_id = str(kept[0]) if kept else str(ensure_tenant_script_baseline(db, tenant).id)
    modules = db.query(ScriptModule).filter(ScriptModule.script_version_id == version_id).all()

    cr = card["cr"]
    sc_manager_id = str(sc.get("manager_crm_id") or "").strip() or None
    rows: list[CallModuleEvaluation] = []
    for mod in modules:
        key = str(mod.target_criterion).lower()
        if key in NOT_SCRIPTED or not key[2:].isdigit():
            continue
        idx = int(key[2:]) - 1
        if not 0 <= idx < len(cr) or cr[idx] is None:  # the criterion did not apply to this call
            continue
        anchors = [str(a).strip() for a in (mod.semantic_anchors or []) if str(a).strip()]
        banned = [str(b).strip() for b in (mod.banned_triggers or []) if str(b).strip()]
        if not anchors and not banned:
            continue
        res = evaluate_module(anchors, banned, int(mod.min_anchors_required or 0), turns)
        rows.append(
            CallModuleEvaluation(
                id=str(uuid.uuid4()),
                call_id=call_id,
                tenant_id=tenant,
                script_version_id=version_id,
                target_criterion=key,
                is_relevant=True,
                adhered=res.adhered,
                achieved=bool(cr[idx]),
                evidence_quote=res.quote,
                timestamp_sec=res.ts,
                manager_id=sc_manager_id,
                manager_name=(manager_name or UNKNOWN_MANAGER)[:255],
                matched_anchors=res.matched,
                detected_banned=res.banned,
                created_at=_now(),
            )
        )
    db.query(CallModuleEvaluation).filter(CallModuleEvaluation.call_id == call_id).delete()
    db.add_all(rows)
    db.commit()
    return "evaluated" if rows else "no_applicable"


def evaluate_call_safely(db: Session, call: CallRecording, manager_name: str | None = None) -> str:
    """For the ingest path: whatever happens here must never lose or delay the call itself."""
    try:
        return evaluate_call(db, call, manager_name)
    except Exception as err:  # noqa: BLE001
        db.rollback()
        logger.warning("Methodology evaluation of call %s failed: %s", getattr(call, "id", "?"), err)
        return "error"


def backfill_tenant(db: Session, tenant_id: str, limit: int = BACKFILL_MAX) -> dict[str, int]:
    """Evaluate the calls of a company that have no rows yet (history before the methodology, or a failed attempt)."""
    tenant = clean_tenant_id(tenant_id)
    cfg = get_tenant_config(tenant) or {}
    has_rows = exists().where(CallModuleEvaluation.call_id == CallRecording.id)
    calls = (
        db.query(CallRecording)
        .filter(CallRecording.tenant_id == tenant, ~has_rows)
        .order_by(CallRecording.created_at.desc())
        .limit(max(1, min(int(limit), BACKFILL_MAX)))
        .all()
    )
    counts: dict[str, int] = {}
    for call in calls:
        sc: Any = call.scorecard_criteria if isinstance(call.scorecard_criteria, dict) else {}
        name = resolve_call_manager(cfg, sc.get("manager_crm_id"), sc.get("manager"))
        reason = evaluate_call_safely(db, call, name)
        counts[reason] = counts.get(reason, 0) + 1
    return counts


def coverage(db: Session, tenant_id: str) -> dict[str, int]:
    """How much of the company's history the standard has looked at."""
    tenant = clean_tenant_id(tenant_id)
    with_transcript = (
        db.query(func.count(CallRecording.id))
        .filter(CallRecording.tenant_id == tenant, func.length(func.coalesce(CallRecording.transcript_text, "")) >= MIN_TRANSCRIPT)
        .scalar()
    )
    evaluated = (
        db.query(func.count(func.distinct(CallModuleEvaluation.call_id))).filter(CallModuleEvaluation.tenant_id == tenant).scalar()
    )
    return {"calls_with_transcript": int(with_transcript or 0), "calls_evaluated": int(evaluated or 0)}
