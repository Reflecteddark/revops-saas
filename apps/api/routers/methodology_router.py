"""
Methodology router: the speech standard of a company, and what it does to the real calls.

- versions of the standard (v1.0, v2.0 ...) with the hypothesis behind each; a version that has been applied to calls
  is history and cannot be edited, a change is a new version
- one module per speakable audit criterion (phrases to say, stop phrases): apps/api/services/methodology_defaults.py
- every number comes from rows written for REAL calls (apps/api/services/methodology_eval.py): the manager said the
  standard or not (`adhered`), the audit passed the criterion or not (`achieved`). Nothing is invented: no calls, no
  quotes, no percentages. Too few calls means "collecting data" (apps/api/services/methodology_stats.py).
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from packages.database.models import (
    CallModuleEvaluation,
    CallRecording,
    ScriptModule,
    ScriptVersion,
    User,
    UserRole,
)
from packages.database.session import get_db

from ..services.call_audit_extras import has_audio
from ..services.call_manager import UNKNOWN_MANAGER
from ..services.methodology_defaults import CRITERIA_IDS, NOT_SCRIPTED, criterion_meta
from ..services.methodology_eval import add_default_modules, backfill_tenant, coverage, ensure_tenant_script_baseline
from ..services.methodology_stats import (
    COLLECTING,
    HIDDEN_GEM_MARGIN,
    LIFT_MARGIN,
    MIN_CALLS,
    MIN_COHORT,
    MIN_COMPARE,
    VERDICT_LABELS,
    Counts,
    manager_flags,
    pct,
    verdict_for,
)
from .settings_router import get_current_user_or_admin

logger = logging.getLogger("methodology_router")

router = APIRouter(prefix="/methodology", tags=["Methodology & Script Engineering"])

CME = CallModuleEvaluation
NOT_SCRIPTED_VERDICT = "NOT_SCRIPTED"  # measured by the code (cr11), there is no speech standard to follow


def _now() -> datetime:
    return datetime.now(timezone.utc)


def resolve_tenant(user: User, tenant_id: Optional[str]) -> str:
    """A client works only with its own company; only the platform admin may name another one."""
    requested = (tenant_id or "").strip().upper()
    own = (user.tenant_id or "").strip().upper()
    if user.role == UserRole.ADMIN:
        target = requested or ("" if own == "*" else own)
        if not target:
            raise HTTPException(status_code=400, detail="tenant_id is required")
        return target
    if requested and requested != own:
        raise HTTPException(status_code=403, detail="Доступ к методологии другой компании запрещён")
    return own


def tenant_version_id(db: Session, tenant: str, version_id: Optional[str], active: ScriptVersion) -> str:
    """The version asked for must belong to this tenant, otherwise another company's script leaks."""
    if not version_id:
        return str(active.id)
    found = db.query(ScriptVersion.id).filter(ScriptVersion.id == version_id, ScriptVersion.tenant_id == tenant).first()
    if not found:
        raise HTTPException(status_code=404, detail="Script version not found")
    return str(version_id)


def _applied_calls(db: Session, version_id: str) -> int:
    return int(db.query(func.count(func.distinct(CME.call_id))).filter(CME.script_version_id == version_id).scalar() or 0)


def _flag(condition: Any) -> Any:
    return func.sum(case((condition, 1), else_=0))


def _counts(db: Session, tenant: str, version_id: str) -> dict[str, Counts]:
    """One pass over the rows of a version: the cohorts of every criterion."""
    adhered, achieved = CME.adhered.is_(True), CME.achieved.is_(True)
    rows = (
        db.query(
            CME.target_criterion,
            func.count(CME.id),
            _flag(adhered),
            _flag(achieved),
            _flag(adhered & achieved),
            _flag(CME.adhered.is_(False) & achieved),
        )
        .filter(CME.tenant_id == tenant, CME.script_version_id == version_id, CME.is_relevant.is_(True))
        .group_by(CME.target_criterion)
        .all()
    )
    return {str(r[0]): Counts(int(r[1]), int(r[2] or 0), int(r[3] or 0), int(r[4] or 0), int(r[5] or 0)) for r in rows}


# ----------------------------------------------------------------------------------------------- schemas

class CreateVersionRequest(BaseModel):
    version_tag: str = Field(..., min_length=1, max_length=50, description="e.g. v2.1")
    title: str = Field(..., min_length=1, max_length=255, description="Descriptive title of the change")
    hypothesis: Optional[str] = Field(None, max_length=2000, description="Why this change should improve the result")
    set_active: bool = Field(True, description="Whether to activate immediately")
    base_version_id: Optional[str] = Field(None, description="Version to copy the modules from; the active one by default")


class UpdateModuleRequest(BaseModel):
    recommended_speech: str = Field(..., max_length=2000)
    semantic_anchors: list[str] = Field(default_factory=list, max_length=20)
    banned_triggers: list[str] = Field(default_factory=list, max_length=20)
    min_anchors_required: int = Field(2, ge=0, le=20)


def _clean_list(items: list[str]) -> list[str]:
    out: list[str] = []
    for item in items:
        text = " ".join(str(item).split())[:200]
        if text and text not in out:
            out.append(text)
    return out


# ----------------------------------------------------------------------------------------------- versions

@router.get("/versions")
def get_script_versions(
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """Lists the versions of the standard of a company, the active one highlighted."""
    tenant = resolve_tenant(current_user, tenant_id)
    active = ensure_tenant_script_baseline(db, tenant)
    versions = db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant).order_by(ScriptVersion.created_at.desc()).all()
    return {
        "tenant_id": tenant,
        "active_version_id": active.id,
        "versions": [
            {
                "id": v.id,
                "version_tag": v.version_tag,
                "title": v.title,
                "hypothesis": v.hypothesis,
                "is_active": v.is_active,
                "activated_at": v.activated_at.isoformat() if v.activated_at else None,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in versions
        ],
    }


@router.post("/versions")
def create_script_version(
    payload: CreateVersionRequest,
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """A new version, starting as a copy of another one (the active one unless base_version_id says otherwise)."""
    tenant = resolve_tenant(current_user, tenant_id)
    active = ensure_tenant_script_baseline(db, tenant)
    base_id = tenant_version_id(db, tenant, payload.base_version_id, active)
    tag = payload.version_tag.strip()
    if not tag or not payload.title.strip():
        raise HTTPException(status_code=422, detail="Тег и название версии не могут быть пустыми")
    if db.query(ScriptVersion.id).filter(ScriptVersion.tenant_id == tenant, ScriptVersion.version_tag == tag).first():
        raise HTTPException(status_code=409, detail=f"Версия {tag} уже существует")

    if payload.set_active:
        db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant).update({"is_active": False})
    version = ScriptVersion(
        id=str(uuid.uuid4()),
        tenant_id=tenant,
        version_tag=tag,
        title=payload.title.strip(),
        hypothesis=payload.hypothesis,
        is_active=payload.set_active,
        activated_at=_now() if payload.set_active else None,
        created_at=_now(),
    )
    db.add(version)
    db.flush()

    base_modules = db.query(ScriptModule).filter(ScriptModule.script_version_id == base_id).all()
    if base_modules:
        for m in base_modules:
            db.add(
                ScriptModule(
                    id=str(uuid.uuid4()),
                    script_version_id=version.id,
                    target_criterion=m.target_criterion,
                    stage_name=m.stage_name,
                    recommended_speech=m.recommended_speech,
                    semantic_anchors=list(m.semantic_anchors or []),
                    banned_triggers=list(m.banned_triggers or []),
                    min_anchors_required=m.min_anchors_required,
                )
            )
    else:
        add_default_modules(db, str(version.id))
    db.commit()
    return {"status": "created", "version_id": version.id, "version_tag": version.version_tag, "is_active": version.is_active}


@router.put("/versions/{version_id}/activate")
def activate_script_version(
    version_id: str,
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """From now on new calls are judged by this version."""
    tenant = resolve_tenant(current_user, tenant_id)
    version = db.query(ScriptVersion).filter(ScriptVersion.id == version_id, ScriptVersion.tenant_id == tenant).first()
    if not version:
        raise HTTPException(status_code=404, detail="Script version not found")
    db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant).update({"is_active": False})
    version.is_active = True  # type: ignore[assignment]
    version.activated_at = _now()  # type: ignore[assignment]
    db.commit()
    return {"status": "activated", "version_id": version.id, "version_tag": version.version_tag}


# ----------------------------------------------------------------------------------------------- modules

@router.get("/modules")
def get_script_modules(
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """The speech modules of a version. `locked` = the version has been applied to calls, so it is history."""
    tenant = resolve_tenant(current_user, tenant_id)
    active = ensure_tenant_script_baseline(db, tenant)
    target = tenant_version_id(db, tenant, version_id, active)
    modules = db.query(ScriptModule).filter(ScriptModule.script_version_id == target).all()
    modules.sort(key=lambda m: int(m.target_criterion[2:]) if str(m.target_criterion)[2:].isdigit() else 99)
    applied = _applied_calls(db, target)
    return {
        "version_id": target,
        "locked": applied > 0,
        "applied_calls": applied,
        "modules": [
            {
                "id": m.id,
                "target_criterion": m.target_criterion,
                "title": criterion_meta(str(m.target_criterion))["title"],
                "stage_name": m.stage_name,
                "recommended_speech": m.recommended_speech,
                "semantic_anchors": m.semantic_anchors or [],
                "banned_triggers": m.banned_triggers or [],
                "min_anchors_required": m.min_anchors_required,
            }
            for m in modules
        ],
    }


@router.put("/modules/{criterion}")
def update_script_module(
    criterion: str,
    payload: UpdateModuleRequest,
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """Edit a module. Only a version that has not been applied to any call: the numbers of the past must stay true."""
    tenant = resolve_tenant(current_user, tenant_id)
    key = criterion.strip().lower()
    active = ensure_tenant_script_baseline(db, tenant)
    target = tenant_version_id(db, tenant, version_id, active)
    module = db.query(ScriptModule).filter(ScriptModule.script_version_id == target, ScriptModule.target_criterion == key).first()
    if not module:
        raise HTTPException(status_code=404, detail=f"Module for {key} not found")
    applied = _applied_calls(db, target)
    if applied:
        raise HTTPException(
            status_code=409,
            detail=f"Эта версия уже применялась к {applied} звонкам, её нельзя менять. Создайте новую версию («Новая гипотеза») и правьте её.",
        )
    anchors, banned = _clean_list(payload.semantic_anchors), _clean_list(payload.banned_triggers)
    if not anchors and not banned:
        raise HTTPException(status_code=422, detail="Добавьте хотя бы одну формулировку или стоп-фразу: пустой модуль ничего не проверяет")
    if payload.min_anchors_required > len(anchors):
        raise HTTPException(status_code=422, detail=f"Порог ({payload.min_anchors_required}) больше числа формулировок ({len(anchors)})")
    module.recommended_speech = payload.recommended_speech.strip()  # type: ignore[assignment]
    module.semantic_anchors = anchors  # type: ignore[assignment]
    module.banned_triggers = banned  # type: ignore[assignment]
    module.min_anchors_required = payload.min_anchors_required  # type: ignore[assignment]
    db.commit()
    db.refresh(module)
    return {
        "status": "updated",
        "id": module.id,
        "target_criterion": module.target_criterion,
        "recommended_speech": module.recommended_speech,
        "semantic_anchors": module.semantic_anchors,
        "banned_triggers": module.banned_triggers,
        "min_anchors_required": module.min_anchors_required,
    }


# ----------------------------------------------------------------------------------------------- numbers

def _row(cr: str, c: Counts) -> dict[str, Any]:
    meta = criterion_meta(cr)
    scripted = cr not in NOT_SCRIPTED
    verdict = verdict_for(c) if scripted else NOT_SCRIPTED_VERDICT
    return {
        "criterion": cr,
        "title": meta["title"],
        "stage": meta["stage"],
        "has_standard": scripted,
        "total_relevant_calls": c.total,
        "script_calls": c.script,
        "freestyle_calls": c.free,
        "ar_pct": c.ar,
        "swr_pct": c.swr,
        "fwr_pct": c.fwr,
        "total_win_pct": c.win,
        "script_lift_pct": c.lift,
        "enough_data": c.enough,
        "calls_needed": max(0, MIN_CALLS - c.total),
        "verdict_status": verdict,
        "is_sabotage": verdict == "SABOTAGE_HIDDEN_GEM",
        "delta_pct": c.lift,
    }


@router.get("/heatmap")
def get_methodology_heatmap(
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """The 13 audit criteria: how often the standard was said (AR), how the call went with it (SWR) and without it (FWR)."""
    tenant = resolve_tenant(current_user, tenant_id)
    active = ensure_tenant_script_baseline(db, tenant)
    target = tenant_version_id(db, tenant, version_id, active)
    counts = _counts(db, tenant, target)
    return {
        "tenant_id": tenant,
        "version_id": target,
        "matrix": [_row(cr, counts.get(cr, Counts())) for cr in CRITERIA_IDS],
        "coverage": coverage(db, tenant),
        "thresholds": {"min_calls": MIN_CALLS, "min_cohort": MIN_COHORT, "lift_margin": LIFT_MARGIN, "hidden_gem_margin": HIDDEN_GEM_MARGIN},
    }


@router.get("/xray/{criterion}")
def get_methodology_xray(
    criterion: str,
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """One criterion in detail: the two cohorts, the managers, and real quotes of calls where the standard worked."""
    tenant = resolve_tenant(current_user, tenant_id)
    key = criterion.strip().lower()
    if key not in CRITERIA_IDS:
        raise HTTPException(status_code=404, detail="Unknown criterion")
    active = ensure_tenant_script_baseline(db, tenant)
    target = tenant_version_id(db, tenant, version_id, active)
    meta = criterion_meta(key)
    module = db.query(ScriptModule).filter(ScriptModule.script_version_id == target, ScriptModule.target_criterion == key).first()

    c = _counts(db, tenant, target).get(key, Counts())
    verdict = verdict_for(c) if key not in NOT_SCRIPTED else NOT_SCRIPTED_VERDICT

    adhered, achieved = CME.adhered.is_(True), CME.achieved.is_(True)
    mgr_rows = (
        db.query(CME.manager_name, func.count(CME.id), _flag(adhered), _flag(achieved))
        .filter(CME.tenant_id == tenant, CME.script_version_id == target, CME.target_criterion == key, CME.is_relevant.is_(True))
        .group_by(CME.manager_name)
        .all()
    )
    managers: list[dict[str, Any]] = []
    for name, total, script, wins in mgr_rows:
        total, script, wins = int(total), int(script or 0), int(wins or 0)
        known = bool(name) and name != UNKNOWN_MANAGER
        saboteur, champion = manager_flags(total, script, wins) if known else (False, False)
        managers.append(
            {
                "name": name or UNKNOWN_MANAGER,
                "total_calls": total,
                "script_calls": script,
                "ar_pct": pct(script, total),
                "win_pct": pct(wins, total),
                "is_saboteur": saboteur,
                "is_champion": champion,
            }
        )
    managers.sort(key=lambda m: (not m["is_saboteur"], m["ar_pct"], -m["total_calls"]))

    quote_rows = (
        db.query(CME, CallRecording)
        .join(CallRecording, CallRecording.id == CME.call_id)
        .filter(
            CME.tenant_id == tenant,
            CME.script_version_id == target,
            CME.target_criterion == key,
            adhered,
            achieved,
            CME.evidence_quote.isnot(None),
        )
        .order_by(CME.created_at.desc())
        .limit(3)
        .all()
    )
    quotes: list[dict[str, Any]] = []
    for ev, call in quote_rows:
        sc: Any = call.scorecard_criteria if isinstance(call.scorecard_criteria, dict) else {}
        quotes.append(
            {
                "call_id": str(ev.call_id),
                "manager_name": str(ev.manager_name or UNKNOWN_MANAGER),
                "quote": str(ev.evidence_quote or ""),
                "timestamp_sec": ev.timestamp_sec,
                "matched_anchors": list(ev.matched_anchors or []),
                "call_date": str(sc.get("call_started_at") or "") or (call.created_at.isoformat() if call.created_at else None),
                "has_audio": has_audio(sc, call.audio_s3_url),
            }
        )

    return {
        "criterion": key,
        "title": meta["title"],
        "stage": meta["stage"],
        "verdict": verdict,
        "verdict_label": VERDICT_LABELS.get(verdict, "Для этого критерия нет речевого стандарта: его считает код"),
        "module": {
            "recommended_speech": module.recommended_speech if module else "",
            "semantic_anchors": module.semantic_anchors if module else [],
            "banned_triggers": module.banned_triggers if module else [],
        },
        "stats": {
            "total_calls": c.total,
            "script_calls": c.script,
            "freestyle_calls": c.free,
            "script_wins": c.script_wins,
            "freestyle_wins": c.free_wins,
            "ar_pct": c.ar,
            "swr_pct": c.swr,
            "fwr_pct": c.fwr,
            "script_lift_pct": c.lift,
            "enough_data": c.enough,
            "calls_needed": max(0, MIN_CALLS - c.total),
        },
        "managers": managers,
        "golden_quotes": quotes,
    }


# ----------------------------------------------------------------------------------------------- compare

def _metrics(c: Counts) -> dict[str, Any]:
    return {
        "total_calls": c.total,
        "script_calls": c.script,
        "ar_pct": c.ar,
        "swr_pct": c.swr,
        "fwr_pct": c.fwr,
        "lift_pct": c.lift,
        "defect_rate_pct": c.defect,
    }


@router.get("/versions/compare")
def compare_script_versions(
    v1_id: Optional[str] = Query(None, description="Earlier version (the base)"),
    v2_id: Optional[str] = Query(None, description="Later version (after the change)"),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """Two versions side by side. They are judged on DIFFERENT calls (before / after), so the season and the mix of calls
    can move the numbers too; a criterion is compared only when both versions have enough calls."""
    tenant = resolve_tenant(current_user, tenant_id)
    active = ensure_tenant_script_baseline(db, tenant)
    v2 = db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant, ScriptVersion.id == (v2_id or active.id)).first()
    if not v2:
        raise HTTPException(status_code=404, detail="Script version not found")
    if v1_id:
        v1 = db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant, ScriptVersion.id == v1_id).first()
        if not v1:
            raise HTTPException(status_code=404, detail="Script version not found")
    else:
        v1 = (
            db.query(ScriptVersion)
            .filter(ScriptVersion.tenant_id == tenant, ScriptVersion.created_at < v2.created_at)
            .order_by(ScriptVersion.created_at.desc())
            .first()
        ) or v2

    c1, c2 = _counts(db, tenant, str(v1.id)), _counts(db, tenant, str(v2.id))
    comparison: list[dict[str, Any]] = []
    improved = degraded = compared = 0
    lift_sum = defect_sum = 0.0
    for cr in CRITERIA_IDS:
        if cr in NOT_SCRIPTED:
            continue
        meta = criterion_meta(cr)
        s1, s2 = c1.get(cr, Counts()), c2.get(cr, Counts())
        d_lift = round(s2.lift - s1.lift, 1)
        d_defect = round(s2.defect - s1.defect, 1)
        if v1.id == v2.id or min(s1.total, s2.total) < MIN_COMPARE:
            verdict, label = "COLLECTING_DATA", f"Сбор данных: нужно от {MIN_COMPARE} звонков в каждой версии"
        else:
            compared += 1
            lift_sum += d_lift
            defect_sum += -d_defect
            if d_lift >= LIFT_MARGIN or d_defect <= -15.0:
                verdict, label = "IMPROVEMENT_CONFIRMED", f"Улучшение: буст {d_lift:+.1f}%, брак {d_defect:+.1f}%"
                improved += 1
            elif s2.ar < 40.0 and s2.swr >= 60.0:
                verdict, label = "SABOTAGE_NEW_VERSION", "Скрипт новой версии сильный, но его говорят редко"
            elif s2.ar >= 50.0 and d_lift <= -LIFT_MARGIN:
                verdict, label = "HYPOTHESIS_FAILED", f"Гипотеза не сработала: буст {d_lift:+.1f}%"
                degraded += 1
            else:
                verdict, label = "STABLE_NEUTRAL", "Без существенных изменений"
        comparison.append(
            {
                "criterion": cr,
                "title": meta["title"],
                "stage": meta["stage"],
                "v1_metrics": _metrics(s1),
                "v2_metrics": _metrics(s2),
                "delta_lift_pct": d_lift,
                "delta_defect_rate_pct": d_defect,
                "intervention_verdict": verdict,
                "verdict_label": label,
            }
        )

    avg_lift = round(lift_sum / compared, 1) if compared else 0.0
    avg_defect = round(defect_sum / compared, 1) if compared else 0.0
    if v1.id == v2.id:
        status, text = "NEUTRAL", "Выбрана одна и та же версия: сравнивать нечего"
    elif not compared:
        status, text = "COLLECTING_DATA", f"Пока мало данных: нужно от {MIN_COMPARE} звонков по критерию в обеих версиях"
    elif improved > degraded and avg_lift > 0:
        status, text = "NET_POSITIVE", f"Обновление помогло: улучшено критериев {improved}, средний буст {avg_lift:+.1f}%"
    elif degraded > improved:
        status, text = "NET_NEGATIVE", f"Обновление не помогло: просело критериев {degraded}. Стоит вернуться к прежней версии"
    else:
        status, text = "NEUTRAL", "Показатели версий близки"

    def _ver(v: ScriptVersion) -> dict[str, Any]:
        return {"id": v.id, "version_tag": v.version_tag, "title": v.title, "created_at": v.created_at.isoformat() if v.created_at else None}

    return {
        "tenant_id": tenant,
        "v1": _ver(v1),
        "v2": _ver(v2),
        "comparison": comparison,
        "summary": {
            "overall_status": status,
            "summary_verdict": text,
            "improved_criteria_count": improved,
            "degraded_criteria_count": degraded,
            "neutral_criteria_count": compared - improved - degraded,
            "compared_criteria_count": compared,
            "avg_lift_delta_pct": avg_lift,
            "avg_defect_reduction_pct": avg_defect,
            "note": "Версии оцениваются на разных звонках (до и после), на цифры влияют сезон и состав звонков.",
        },
    }


# ----------------------------------------------------------------------------------------------- history

@router.post("/backfill")
def backfill_history(
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_or_admin),
):
    """Judge the calls the company already has (up to 500 per run) that have not been judged yet. Safe to repeat."""
    tenant = resolve_tenant(current_user, tenant_id)
    ensure_tenant_script_baseline(db, tenant)
    counts = backfill_tenant(db, tenant)
    return {
        "tenant_id": tenant,
        "evaluated": counts.get("evaluated", 0) + counts.get("no_applicable", 0),
        "skipped": {k: v for k, v in counts.items() if k not in ("evaluated", "no_applicable")},
        "coverage": coverage(db, tenant),
    }
