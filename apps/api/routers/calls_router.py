"""
Calls Router: Speech AI Auditing, 13 Evaluation Criteria, Google Sheets Sync, and Live Ingestion.
"""

import logging
import os
import re
import secrets
import time
import uuid
import requests
from datetime import datetime, timedelta, timezone
from ipaddress import ip_address, ip_network
from pathlib import Path
from collections.abc import Sequence
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, field_validator
from sqlalchemy import DateTime, bindparam, text
from sqlalchemy.orm import Session

from packages.analytics_engine.speech_scoring import evaluate_speech_scorecard
from packages.database.models import CallRecording, Deal, DealStage, User, UserRole
from packages.database.session import get_db

from ..auth import get_current_user, is_admin_role, security
from ..cache_client import (
    delete_cached_json_sync,
    get_cached_json_sync,
    set_cached_json_sync,
)
from ..schemas import SpeechEvaluationRequest
from ..services import call_audio
from ..services.audio_duration import mp3_duration_seconds
from ..services.call_audit_extras import audit_extras, clean_audio_url, has_audio, pick_extras
from ..services.call_manager import in_crm_team, resolve_call_manager
from ..services.methodology_eval import evaluate_call_safely
from ..services.call_scorecard import MAY_NOT_APPLY, call_texts, read_scorecard, scaled_score
from ..services.raw_calls_row import build_raw_calls_row
from ..services.tz import local_str, tenant_tz, to_local
from ..services.crm_deal_normalizer import parse_numeric_price
from ..services.crm_links import crm_deal_url
from ..services.deal_keys import deal_pk_for, find_tenant_deal
from ..services.deal_sla import deal_sla_state
from ..services.workspaces import get_or_create_workspace, normalize_crm_type
from ..tenant_registry import get_tenant_config, get_tenant_spreadsheet_id
from ..websocket_manager import manager
from .admin_router import ALLOWED_ADMIN_KEYS
from .deals_router import get_deals_lookup

logger = logging.getLogger("calls_router")

router = APIRouter(prefix="/calls", tags=["Speech AI & 13 Criteria Scorecard"])

INTERNAL_NETS = [
    ip_network("10.0.0.0/8"),
    ip_network("172.16.0.0/12"),
    ip_network("192.168.0.0/16"),
    ip_network("127.0.0.0/8"),
    ip_network("::1/128"),
]


def _is_internal_ip(ip_str: str) -> bool:
    try:
        ip = ip_address(ip_str)
        return any(ip in net for net in INTERNAL_NETS)
    except ValueError:
        return False


# Headers a reverse proxy / tunnel adds; a direct container-to-container call (n8n, worker) has none.
_PROXY_HEADERS = ("cf-connecting-ip", "x-forwarded-for", "x-real-ip", "forwarded")


def is_internal_request(request: Request) -> bool:
    """True only for direct calls from the docker network.

    Public traffic reaches the API through the Cloudflare tunnel from the docker gateway (172.x.0.1),
    so an internal source IP alone proves nothing: proxied requests are never internal.
    """
    client_ip = request.client.host if request.client else ""
    if not client_ip or not _is_internal_ip(client_ip):
        return False
    return not any(request.headers.get(h) for h in _PROXY_HEADERS)


def get_calls_data_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    raw_tenant = (request.query_params.get("tenant_id") or "TNT-001").strip()
    if raw_tenant.lower().startswith("demo_") or raw_tenant.lower().startswith("demo-"):
        return None

    admin_key = request.headers.get("x-admin-key") or request.headers.get("x-revops-admin-key")
    if admin_key and any(secrets.compare_digest(admin_key, k) for k in ALLOWED_ADMIN_KEYS if k):
        return User(
            id="admin-sys",
            tenant_id="*",
            email="admin@revops.io",
            full_name="System Administrator",
            role=UserRole.ADMIN,
            is_active=True
        )

    if credentials:
        return get_current_user(credentials, db)

    # If no Bearer credentials, check access_token cookie
    token = request.cookies.get("access_token")
    if token:
        try:
            import jwt
            from ..auth import ALGORITHM, SECRET_KEY
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_id = str(payload.get("sub") or "")
            tenant_id = str(payload.get("tenant_id") or "").strip().upper()
            if user_id:
                u = db.query(User).filter(User.id == user_id).first()
                if u:
                    return u
                is_admin_token = is_admin_role(payload.get("role", ""))
                if not tenant_id and not is_admin_token:
                    # same rule as auth.get_current_user: a client token without a company must not become TNT-001
                    raise HTTPException(status_code=401, detail="Токен не содержит компанию (tenant)")
                return User(
                    id=user_id,
                    tenant_id=tenant_id or "TNT-001",
                    email=user_id,
                    full_name=str(payload.get("name") or "User"),
                    role=UserRole.ADMIN if is_admin_role(payload.get("role", "")) else UserRole.KAM,
                    is_active=True
                )
        except Exception:
            pass

    # The `revops_client_auth` cookie is an opaque, unvalidated string and must never grant tenant access.
    return None


class CallIngestPayload(BaseModel):
    id: str | None = None
    deal_id: str | None = None
    deal_title: str | None = None
    client: str | None = None
    manager: str | None = None
    manager_crm_id: str | None = None  # the CRM user id of the call: the manager is resolved by it first
    call_started_at: str | None = None  # ISO 8601 with a zone; without it the call is dated by its arrival
    stage: str | None = None
    duration_sec: int | None = None
    duration: str | None = None
    amount: str | None = None  # unknown stays unknown; it used to default to an invented "500 000 ₽"
    score: int | None = None
    next_step: int | None = None  # None -> taken from cr1; it used to default to 1 ("next step fixed")
    audit_failed: int | None = None  # the AI could not read the call
    is_unanswered: int | None = None  # nobody talked: IVR, voicemail, a drop
    zoom_scheduled: int | None = None
    cr: Sequence[int | None] | None = None  # None = the criterion did not apply to this call (CR5, CR6, CR13 only)
    error_summary: str | None = None
    recommendation: str | None = None
    transcript: str | None = None
    # Audit contract v2 (docs/audit/spec_contract_v2.md). Passed/applicable are derived from `cr`, not taken from n8n.
    audio_url: str | None = None  # stays on the server: the cabinet plays it through /calls/{id}/audio
    call_type: str | None = None
    summary: str | None = None
    evidence: dict[str, Any] | None = None  # {"cr1": {"why": "...", "quote": "..."}, ...}
    ended_by: str | None = None
    reached_decision_maker: bool | None = None
    audit_model: str | None = None
    audit_version: int | None = None
    sync_to_sheets: bool = True
    # Required: a call without a tenant must never silently land in another client's data.
    tenant_id: str

    @field_validator("cr")
    @classmethod
    def only_cr5_cr6_cr13_may_be_null(cls, value: Sequence[int | None] | None) -> Sequence[int | None] | None:
        if value is not None and len(value) == 13 and any(v is None and i not in MAY_NOT_APPLY for i, v in enumerate(value)):
            raise ValueError("only CR5, CR6 and CR13 may be null")
        return value


def parse_call_time(value: Any) -> datetime | None:
    """An ISO 8601 moment, or None when the value cannot be read."""
    try:
        return datetime.fromisoformat(str(value).strip()) if value else None
    except ValueError:
        return None


def call_view(payload: CallIngestPayload) -> dict[str, Any]:
    """The verdict of an incoming call: every path that receives a call shows it the same way."""
    has_cr = bool(payload.cr and len(payload.cr) == 13)
    if has_cr:
        cr: list[int | None] = [int(x) if x is not None else None for x in payload.cr]  # type: ignore[union-attr]
        score = payload.score if payload.score is not None else scaled_score(cr)
        next_step = payload.next_step if payload.next_step is not None else cr[0]
    else:
        cr, score, next_step = [None] * 13, None, None

    card = read_scorecard(
        {
            "cr": cr,
            "score": score,
            "next_step": next_step,
            "audit_failed": payload.audit_failed,
            "is_unanswered": payload.is_unanswered,
        },
        None,
        error_summary=payload.error_summary,
    )
    card["risk_amount"] = (payload.amount or "0 ₽") if card["at_risk"] else "0 ₽"
    return card


def verify_internal_or_admin(request: Request) -> bool:
    """Allows requests from internal networks or with valid admin key."""
    if is_internal_request(request):
        return True

    secret = (
        request.headers.get("x-admin-key")
        or request.headers.get("x-revops-secret")
        or request.headers.get("x-revops-admin-key")
    )
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        secret = auth_header.split(" ", 1)[1]

    if secret and any(secrets.compare_digest(secret, k) for k in ALLOWED_ADMIN_KEYS):
        return True

    raise HTTPException(
        status_code=403,
        detail="Доступ запрещён: эндпоинт доступен только из локальной сети n8n или с ключом администратора"
    )


# --- Per-call claims for the n8n audit pipeline -------------------------------------------------------------
# The poll trigger fires every 5 min, a batch can run longer, and n8n staticData is read at execution start and
# written at the end, so overlapping executions never see each other. The claim lives in the DB instead.
CLAIM_STALE_AFTER = timedelta(minutes=60)  # a claim left by a crashed execution is taken over after this
CLAIM_MAX_ATTEMPTS = 3  # every attempt is a paid audit; a call that keeps failing is not retried forever

_CLAIM_SQL = text("""
    INSERT INTO call_processing_claims (tenant_id, call_id, status, attempts, claimed_at, updated_at)
    VALUES (:tenant_id, :call_id, 'in_progress', 1, :now, :now)
    ON CONFLICT (tenant_id, call_id) DO UPDATE
    SET attempts = call_processing_claims.attempts + 1, claimed_at = :now, updated_at = :now
    WHERE call_processing_claims.status = 'in_progress'
      AND call_processing_claims.claimed_at < :stale_before
      AND call_processing_claims.attempts < :max_attempts
    RETURNING attempts
""").bindparams(bindparam("now", type_=DateTime), bindparam("stale_before", type_=DateTime))

_DONE_SQL = text("""
    INSERT INTO call_processing_claims (tenant_id, call_id, status, attempts, claimed_at, updated_at)
    VALUES (:tenant_id, :call_id, 'done', 1, :now, :now)
    ON CONFLICT (tenant_id, call_id) DO UPDATE SET status = 'done', updated_at = :now
""").bindparams(bindparam("now", type_=DateTime))


class CallClaimPayload(BaseModel):
    tenant_id: str
    call_id: str


def _claim_key(payload: CallClaimPayload) -> tuple[str, str]:
    tenant_id, call_id = payload.tenant_id.strip().upper(), payload.call_id.strip()
    if not tenant_id or not call_id or len(tenant_id) > 36 or len(call_id) > 150:
        raise HTTPException(status_code=422, detail="tenant_id (<=36) and call_id (<=150) are required")
    return tenant_id, call_id


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def mark_call_processed(db: Session, tenant_id: str, call_id: str) -> None:
    db.execute(_DONE_SQL, {"tenant_id": tenant_id, "call_id": call_id, "now": _utcnow()})
    db.commit()


@router.post("/claim")
def claim_call_for_audit(payload: CallClaimPayload, request: Request, db: Session = Depends(get_db)):
    """Atomic per-call lock: only the execution that gets claimed=true audits the call."""
    verify_internal_or_admin(request)
    tenant_id, call_id = _claim_key(payload)
    now = _utcnow()
    row = db.execute(_CLAIM_SQL, {
        "tenant_id": tenant_id, "call_id": call_id, "now": now,
        "stale_before": now - CLAIM_STALE_AFTER, "max_attempts": CLAIM_MAX_ATTEMPTS,
    }).first()
    db.commit()
    return {"claimed": row is not None, "attempt": row[0] if row else None}


@router.post("/claim/done")
def complete_call_claim(payload: CallClaimPayload, request: Request, db: Session = Depends(get_db)):
    """The audit was delivered (CRM note written): the call is never audited again."""
    verify_internal_or_admin(request)
    mark_call_processed(db, *_claim_key(payload))
    return {"status": "done"}


# In-memory cache for live calls from Google Sheets keyed by tenant_id (TTL: 15s)
_CALLS_CACHE: dict[str, Any] = {}

# The cache is shared by callers with different limits (the Pulse asks for 20, the audit tab for 500), so it holds the
# whole list. It used to hold what the first caller asked for, and the next one silently got fewer calls.
SHEET_CALLS_MAX = 2000
ANALYTICS_CALLS_LIMIT = 500  # the audit tab and the insights count the same calls


def get_service_account_path() -> Path | None:
    env_path = os.getenv("GOOGLE_SERVICE_ACCOUNT_PATH")
    if env_path and Path(env_path).exists():
        return Path(env_path)
    candidates = [
        Path("/opt/revops-enterprise-os/service_account.json"),
        Path(__file__).resolve().parent.parent.parent.parent / "revops-enterprise-os" / "service_account.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "service_account.json",
        Path(__file__).resolve().parent.parent.parent / "service_account.json",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _sheet_call_date(r: list[str]) -> str:
    """call_date holds the day only; the hour is in call_hour (AG), so hourly views have something to work with."""
    day = r[3].strip() if len(r) > 3 else ""
    hour = r[32].strip() if len(r) > 32 else ""
    if len(day) == 10 and hour.isdigit() and int(hour) < 24:
        return f"{day} {int(hour):02d}:00:00"
    return day


def fetch_calls_from_sheets(tenant_id: str = "TNT-001", limit: int = 50) -> list[dict[str, Any]]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    now = time.time()
    cache_key = f"calls:{clean_tenant}"

    # 1. Check Redis cache first (strictly scoped to tenant_id)
    cached_redis = get_cached_json_sync(cache_key)
    if cached_redis is not None and isinstance(cached_redis, list) and len(cached_redis) > 0:
        _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": cached_redis}
        return cached_redis[:limit]  # the cache holds the whole list: see SHEET_CALLS_MAX

    cached = _CALLS_CACHE.get(clean_tenant)
    if isinstance(cached, dict) and (now - cached.get("timestamp", 0) < 15):
        return cached.get("calls", [])[:limit]

    sa_path = get_service_account_path()
    if not sa_path:
        logger.warning(f"service_account.json not found, skipping Google Sheets fetch (tenant: {clean_tenant})")
        return cached.get("calls", [])[:limit] if isinstance(cached, dict) else []

    cfg = get_tenant_config(clean_tenant) or {}
    sheet_id = cfg.get("spreadsheet_id") or get_tenant_spreadsheet_id(clean_tenant)
    if not sheet_id:
        empty_calls: list[dict[str, Any]] = []
        _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": empty_calls}
        set_cached_json_sync(cache_key, empty_calls, ex=60)
        return empty_calls

    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        ss = gc.open_by_key(sheet_id)
        ws = ss.worksheet("raw_calls")
        rows = ws.get_all_values()
        if len(rows) < 2:
            empty_calls = []
            _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": empty_calls}
            set_cached_json_sync(cache_key, empty_calls, ex=60)
            return empty_calls

        calls = []
        deals_map = {}
        try:
            deals_map = get_deals_lookup(tenant_id=clean_tenant)
        except Exception as ex:
            logger.warning(f"Could not load deals lookup for {clean_tenant}: {ex}")

        # Header is row 0; iterate backwards to get the most recent calls first
        data_rows = rows[1:]
        for r in reversed(data_rows):
            if not r or not r[0]:
                continue
            call_id = r[0]
            deal_id = r[1] if len(r) > 1 and r[1] else ""
            manager_name = resolve_call_manager(cfg, None, r[2] if len(r) > 2 else "")

            # Match against real deals
            deal_meta = None
            clean_deal_id = str(deal_id).upper().strip()
            if clean_deal_id in deals_map:
                deal_meta = deals_map[clean_deal_id]
            else:
                num_only = re.sub(r"\D", "", clean_deal_id)
                if num_only and num_only in deals_map:
                    deal_meta = deals_map[num_only]

            deal_title = deal_meta["title"] if deal_meta else ""
            # No matching deal -> unknown amount (0), not an invented 300 000 that would feed "revenue at risk".
            deal_amount_str = deal_meta["amount_str"] if deal_meta else "0 ₽"
            deal_amount_num = deal_meta["amount"] if deal_meta else 0.0
            deal_stage = deal_meta["stage"] if deal_meta else ""

            # Duration parsing
            dur_sec = 0
            if len(r) > 4 and r[4].isdigit():
                dur_sec = int(r[4])
            duration_str = f"{dur_sec // 60}:{dur_sec % 60:02d}"

            # 13 criteria: columns index 6 to 18 (cr1 to cr13)
            cr_list: list[int | None] = []
            for col_idx in range(6, 19):
                val = r[col_idx].strip() if len(r) > col_idx else ""
                cr_list.append(1 if val == "1" else (0 if val == "0" else None))
            while len(cr_list) < 13:
                cr_list.append(None)

            # Score and next_step
            raw_score = r[19].strip() if len(r) > 19 else ""
            if raw_score.isdigit():
                score: int | None = int(raw_score)
            elif not raw_score or any(c is None for c in cr_list):
                score = None
            else:
                score = sum(int(c) for c in cr_list if c is not None)

            raw_ns = r[20].strip() if len(r) > 20 else ""
            next_step: int | None = int(raw_ns) if raw_ns in ("0", "1") else None

            error_sum = r[21] if len(r) > 21 else ""
            rec = r[22] if len(r) > 22 else ""
            transcript = r[29] if len(r) > 29 else ""

            card = read_scorecard(
                {
                    "cr": cr_list,
                    "score": score,
                    "next_step": next_step,
                    "audit_failed": r[36] if len(r) > 36 else "",
                    "is_unanswered": r[37] if len(r) > 37 else "",
                },
                None,
                error_summary=error_sum,
            )
            error_sum, rec = call_texts(card["kind"], error_sum, rec)

            calls.append({
                "id": call_id,
                "deal_id": deal_id,
                "deal_title": deal_title,
                "client": "",  # the sheet has no client: the first phrase of a transcript used to pass for one
                "manager": manager_name,
                "stage": deal_stage,
                "duration": duration_str,
                "amount": deal_amount_str,
                "amount_num": deal_amount_num,
                "score": card["score"],
                "kind": card["kind"],
                "status": card["status"],
                "status_label": card["status_label"],
                "risk_amount": deal_amount_str if card["at_risk"] else "0 ₽",
                "next_step": card["next_step"],
                "date": _sheet_call_date(r),
                "cr": card["cr"],
                "zoom_scheduled": None,
                "error_summary": error_sum,
                "recommendation": rec,
                "transcript": transcript
            })
            if len(calls) >= SHEET_CALLS_MAX:
                break

        _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": calls}
        set_cached_json_sync(cache_key, calls, ex=60)
        return calls[:limit]
    except Exception as e:
        logger.error(f"Error fetching calls from Google Sheets: {e}")
        # Keep the last good list, and do not hit a failing sheet on every request.
        stale = cached.get("calls", []) if isinstance(cached, dict) else []
        _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": stale}
        return stale[:limit]


def append_call_to_sheets(payload: CallIngestPayload) -> bool:
    sa_path = get_service_account_path()
    if not sa_path:
        return False
    try:
        import hashlib

        import gspread
        gc = gspread.service_account(str(sa_path))
        tenant_id = (payload.tenant_id or "TNT-001").strip().upper()
        sheet_id = get_tenant_spreadsheet_id(tenant_id)
        if not sheet_id:
            logger.warning(f"Tenant {tenant_id} has no spreadsheet configured, skipping Google Sheets sync")
            return False
        ss = gc.open_by_key(sheet_id)
        ws = ss.worksheet("raw_calls")

        call_id = payload.id or f"call_n8n_{int(time.time())}"
        deal_id = payload.deal_id or ""
        manager_id = payload.manager or ""
        # The sheet is read by people in the client's time zone: stamp "today" in it, not in server UTC.
        now_local = to_local(datetime.now(timezone.utc), tenant_tz(get_tenant_config(tenant_id)))
        today_str = now_local.strftime("%Y-%m-%d")

        dur_sec = payload.duration_sec or 0  # unknown duration stays 0, not an invented 2 minutes
        if payload.duration and ":" in payload.duration:
            parts = payload.duration.split(":")
            try:
                dur_sec = int(parts[0]) * 60 + int(parts[1])
            except Exception:
                pass

        has_cr = bool(payload.cr and len(payload.cr) == 13)
        if has_cr:
            cr_list: list[Any] = list(payload.cr)  # type: ignore[arg-type]
            total_score = payload.score if payload.score is not None else sum(int(c) for c in cr_list if c is not None)
            next_step_flag = payload.next_step if payload.next_step is not None else cr_list[0]
        else:
            cr_list = [None] * 13
            total_score = None
            next_step_flag = None

        error_summary = payload.error_summary or ""
        ai_recommendation = payload.recommendation or ""
        transcript_text = payload.transcript or ""

        row, hash_out = build_raw_calls_row(
            call_id=call_id,
            deal_id=deal_id,
            manager=manager_id,
            date_str=today_str,
            dur_sec=dur_sec,
            cr=cr_list,
            total_score=total_score,
            next_step=next_step_flag,
            error_summary=error_summary,
            recommendation=ai_recommendation,
            transcript=transcript_text,
            tenant_id=payload.tenant_id,
            now=now_local,
        )

        # 1. Strict Idempotency Check & UPSERT (prevents duplicates on retry/replay)
        existing_call_ids = ws.col_values(1)
        row_idx = None
        if call_id in existing_call_ids:
            row_idx = existing_call_ids.index(call_id) + 1
            logger.info(f"Idempotency hit: call_id {call_id} found at row {row_idx}. Performing UPSERT.")
            # Update all 38 columns (A..AL)
            ws.update(f"A{row_idx}:AL{row_idx}", [row], value_input_option="USER_ENTERED")  # type: ignore[arg-type]
        else:
            # Append full 38-column row
            ws.append_row(row, value_input_option="USER_ENTERED")  # type: ignore[arg-type]
            row_idx = len(existing_call_ids) + 1

        # 2. Read-After-Write (RAW) Cryptographic Verification
        try:
            read_back = ws.row_values(row_idx)
            if read_back and len(read_back) >= 5:
                r_call_id = read_back[0]
                r_manager = read_back[2] if len(read_back) > 2 else ""
                r_dur = read_back[4] if len(read_back) > 4 else ""
                r_score = read_back[19] if len(read_back) > 19 else (str(total_score) if total_score is not None else "")
                r_next_step = read_back[20] if len(read_back) > 20 else (str(next_step_flag) if next_step_flag is not None else "")
                r_transcript = read_back[29] if len(read_back) > 29 else ""
                r_tenant = read_back[35] if len(read_back) > 35 else ""

                hash_in = hashlib.sha256(
                    f"{r_call_id}:{r_manager}:{r_score}:{r_dur}:{r_next_step}".encode()
                ).hexdigest()

                tenant_match = (r_tenant == str(payload.tenant_id or "")) or (not payload.tenant_id and not r_tenant)
                transcript_match = (r_transcript == transcript_text)

                if hash_out != hash_in or not tenant_match or not transcript_match:
                    logger.warning(
                        f"Read-After-Write mismatch for {call_id} (hash_match={hash_out == hash_in}, tenant_match={tenant_match}, transcript_match={transcript_match}). Rewriting in RAW mode."
                    )
                    ws.update(f"A{row_idx}:AL{row_idx}", [row], value_input_option="RAW")  # type: ignore[arg-type]
                else:
                    logger.info(f"Read-After-Write verified successfully for {call_id} (checksum: {hash_out[:8]})")
        except Exception as ex_raw:
            logger.debug(f"Read-After-Write verification note: {ex_raw}")

        # Invalidate cache so fresh calls appear immediately
        clean_tid = (tenant_id or "TNT-001").strip().upper()
        delete_cached_json_sync(f"calls:{clean_tid}")
        _CALLS_CACHE.pop(clean_tid, None)
        _CALLS_CACHE.pop(f"calls:{clean_tid}", None)
        return True
    except Exception as e:
        logger.error(f"Error appending call to Google Sheets: {e}")
        return False


# ==========================================================================
# PUBLIC DASHBOARD & LIVE N8N INGESTION ENDPOINTS
# ==========================================================================

NO_CLIENT_NAMES = ("Клиент", "Клиент B2B", "Неизвестно", "Не указано")


def _format_db_call(c: CallRecording, tenant_cfg: dict[str, Any] | None, call_tz: Any) -> dict[str, Any]:
    sc: dict[str, Any] = c.scorecard_criteria if isinstance(c.scorecard_criteria, dict) else {}
    call_deal = c.deal
    deal_budget = float(call_deal.budget or 0.0) if (call_deal and call_deal.budget is not None) else None
    dur_secs = int(c.duration_seconds or 0)
    dur_str = f"{dur_secs // 60}:{dur_secs % 60:02d}"

    error_summary = str(c.ai_summary or sc.get("error_summary") or "")
    recommendation = str(c.next_action_extracted or sc.get("recommendation") or "")
    card = read_scorecard(
        sc, float(c.overall_score) if c.overall_score is not None else None, error_summary=error_summary
    )
    error_summary, recommendation = call_texts(card["kind"], error_summary, recommendation)

    if deal_budget is not None:
        amount_num = float(deal_budget)
    else:
        raw_sc_amt = sc.get("amount")
        if isinstance(raw_sc_amt, (int, float)):
            amount_num = float(raw_sc_amt)
        elif raw_sc_amt:
            amount_num, _unknown = parse_numeric_price(raw_sc_amt)
        else:
            amount_num = 0.0

    amount_str = f"{int(amount_num):,} ₽".replace(",", " ") if amount_num > 0 else (sc.get("amount_str") or "0 ₽")
    risk_amt_str = f"{int(amount_num):,} ₽".replace(",", " ") if (amount_num > 0 and card["at_risk"]) else "0 ₽"

    # The contact named in the call, then the CRM company; n8n's "Не указано" and the like are not a client.
    sc_client = str(sc.get("client") or "").strip()
    deal_company = str(call_deal.company_name or "").strip() if call_deal else ""
    client_name = next((v for v in (sc_client, deal_company) if v and v not in NO_CLIENT_NAMES), "")

    deal_title = str(call_deal.title or "") if call_deal else str(sc.get("deal_title") or "")
    deal_stage = str(call_deal.stage_name or "") if call_deal else ""  # the name in the client's CRM

    return {
        "id": c.id,
        "deal_id": c.deal_id or "",
        "deal_title": deal_title,
        "client": client_name,
        "manager": resolve_call_manager(
            tenant_cfg, sc.get("manager_crm_id"), sc.get("manager") or (c.manager.full_name if c.manager else "")
        ),
        "stage": deal_stage,
        "duration": dur_str,
        "amount": amount_str,
        "amount_num": amount_num,
        "score": card["score"],
        "kind": card["kind"],
        "status": card["status"],
        "status_label": card["status_label"],
        "risk_amount": risk_amt_str,
        "next_step": card["next_step"],
        # DB stores naive UTC; the РОП works in the client's time zone, so a 22:30 UTC call (01:30 MSK) belongs
        # to the next working day. The string is local wall time, same as dates written by n8n to Sheets.
        "date": local_str(
            parse_call_time(sc.get("call_started_at")) or cast("datetime | None", c.created_at), call_tz
        ),
        "cr": card["cr"],
        "passed": card["passed"],
        "applicable": card["applicable"],
        "zoom_scheduled": card["zoom_scheduled"],
        "error_summary": error_summary,
        "recommendation": recommendation,
        "transcript": c.transcript_text or "",
        **pick_extras(sc),
        # The link itself never leaves the server (it may be signed): the player asks /calls/{id}/audio.
        "has_audio": has_audio(sc, c.audio_s3_url),
        # the deal in the client's own CRM; never built from anything but the host of the tenant's CRM address
        "crm_url": crm_deal_url(tenant_cfg, (call_deal.external_crm_id if call_deal else None) or sc.get("deal_id")),
    }


def _call_sort_key(call: dict[str, Any]) -> str:
    """ISO text sorts by time; a hand-edited sheet may hold DD.MM.YYYY."""
    date = str(call.get("date") or "")
    m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})(.*)", date)
    return f"{m[3]}-{m[2]}-{m[1]}{m[4]}" if m else date


def load_tenant_calls(db: Session, tenant_id: str, limit: int) -> tuple[list[dict[str, Any]], str]:
    """
    The calls of a tenant, newest first, and where they came from. The one list behind the audit tab, the Pulse and
    the insights. The DB holds everything that came through /calls/ingest; the sheet adds the history that never
    reached the DB. The DB used to replace the sheet: the first ingested call hid all the earlier ones.
    """
    raw_tenant = (tenant_id or "").strip()
    effective_tenant = raw_tenant.upper()
    rows = (
        db.query(CallRecording)
        .filter(
            (CallRecording.tenant_id == raw_tenant)
            | (CallRecording.tenant_id == effective_tenant)
            | (CallRecording.tenant_id == raw_tenant.lower())
        )
        .order_by(CallRecording.created_at.desc())
        .limit(limit)
        .all()
    )
    tenant_cfg = get_tenant_config(effective_tenant)
    call_tz = tenant_tz(tenant_cfg)
    db_calls = [_format_db_call(c, tenant_cfg, call_tz) for c in rows]

    # Sheet rows carry the CRM call id, which the DB keeps in external_call_id.
    known_ids = {str(c.id) for c in rows} | {str(c.external_call_id) for c in rows if c.external_call_id}
    history = [
        c for c in fetch_calls_from_sheets(tenant_id=effective_tenant, limit=limit)
        if str(c.get("id")) not in known_ids
    ]
    # copies: the sheet rows may be the shared cached ones
    history = [{**h, "crm_url": h.get("crm_url") or crm_deal_url(tenant_cfg, h.get("deal_id"))} for h in history]

    if db_calls and history:
        source = "database+google_sheets"
    else:
        source = "database" if db_calls else "google_sheets"
    return sorted(db_calls + history, key=_call_sort_key, reverse=True)[:limit], source


@router.get("/data")
def get_dashboard_calls_data(
    tenant_id: str = Query("TNT-001"),
    limit: int = Query(50),
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_calls_data_user),
):
    """
    Public dashboard endpoint: pulls real audited calls from Google Sheets (raw_calls)
    or database fallback for specified client tenant, formatted for the web dashboard.
    """
    raw_tenant = (tenant_id or "TNT-001").strip()
    effective_tenant = raw_tenant.upper()
    is_demo_tenant = raw_tenant.lower().startswith("demo_") or raw_tenant.lower().startswith("demo-")

    if not is_demo_tenant:
        if not current_user:
            raise HTTPException(status_code=401, detail="Требуется авторизация")
        target_tenant = (tenant_id or current_user.tenant_id or "").strip().upper()
        is_admin = bool(
            getattr(current_user, "is_admin", False)
            or getattr(current_user, "role", None) == UserRole.ADMIN
            or is_admin_role(getattr(current_user, "role", ""))
            or str(getattr(current_user, "email", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
            or str(getattr(current_user, "id", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
            or current_user.tenant_id == "*"
        )
        if target_tenant != str(current_user.tenant_id).upper() and not is_admin:
            raise HTTPException(status_code=403, detail="cross-tenant access denied")

    calls, source = ([], "google_sheets") if is_demo_tenant else load_tenant_calls(db, raw_tenant, limit)
    return {
        "status": "ok",
        "tenant_id": effective_tenant,
        "source": source,
        "count": len(calls),
        "calls": calls
    }


@router.post("/ingest")
async def ingest_call_from_n8n(
    payload: CallIngestPayload,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Direct n8n Ingestion Webhook:
    1. Receives speech audit JSON from n8n / CRM / Telephony.
    2. Writes the 38-column row into Google Sheets (raw_calls).
    3. Broadcasts the call to all open web dashboard sessions via WebSocket.
    """
    verify_internal_or_admin(request)
    call_id = payload.id or f"call_{int(time.time())}"
    dur_sec = payload.duration_sec or 0  # unknown duration stays 0, not an invented 2 minutes
    if payload.duration and ":" in payload.duration:
        parts = payload.duration.split(":")
        try:
            dur_sec = int(parts[0]) * 60 + int(parts[1])
        except:
            pass
    dur_str = payload.duration or f"{dur_sec // 60}:{dur_sec % 60:02d}"

    dur_str = payload.duration or f"{dur_sec // 60}:{dur_sec % 60:02d}"

    target_tenant = payload.tenant_id.strip().upper()
    if not target_tenant:
        raise HTTPException(status_code=422, detail="tenant_id is required")
    tenant_cfg = get_tenant_config(target_tenant) or {}
    tenant_crm = normalize_crm_type(tenant_cfg.get("crm_type"))

    # A name that is not on the team list may be a new employee: refresh the list from the CRM before calling it unknown.
    if (payload.manager or payload.manager_crm_id) and not in_crm_team(tenant_cfg, payload.manager_crm_id, payload.manager):
        try:
            from ..services.crm_users_sync import sync_tenant_crm_managers
            await sync_tenant_crm_managers(target_tenant)
            tenant_cfg = get_tenant_config(target_tenant) or {}
        except Exception as sync_err:
            logger.warning(f"CRM users sync failed during ingest for {target_tenant}: {sync_err}")

    card = call_view(payload)
    cr_list, score, next_step = card["cr"], card["score"], card["next_step"]
    audio_url = clean_audio_url(payload.audio_url)
    status, status_label, risk_amt = card["status"], card["status_label"], card["risk_amount"]

    formatted_call = {
        "id": call_id,
        "deal_id": payload.deal_id or "",
        "deal_title": payload.deal_title or "",
        "client": payload.client or "",
        "manager": payload.manager or "",  # as received: the reader resolves it against the current team list
        "manager_crm_id": payload.manager_crm_id or "",
        "call_started_at": payload.call_started_at or "",
        "stage": payload.stage or "",
        "duration": dur_str,
        "amount": payload.amount or "0 ₽",
        "score": score,
        "status": status,
        "status_label": status_label,
        "risk_amount": risk_amt,
        "next_step": next_step,
        "kind": card["kind"],
        "audit_failed": 1 if card["kind"] == "audit_failed" else 0,
        "is_unanswered": 1 if card["kind"] == "unanswered" else 0,
        "cr": cr_list,
        "passed": card["passed"],
        "applicable": card["applicable"],
        "zoom_scheduled": payload.zoom_scheduled,
        "error_summary": payload.error_summary or "",
        "recommendation": payload.recommendation or "",
        "transcript": payload.transcript or "",
        **audit_extras(payload),
        "has_audio": has_audio(None, audio_url),
    }

    sheets_synced = False
    if payload.sync_to_sheets:
        sheets_synced = append_call_to_sheets(payload)

    # Persist call to tenant database
    try:
        db_call = db.query(CallRecording).filter(
            CallRecording.tenant_id == target_tenant,
            (CallRecording.id == call_id) | (CallRecording.external_call_id == call_id)
        ).first()
        if db_call:
            if not audio_url:  # a re-audit without a link keeps the recording it already had
                kept: dict[str, Any] = db_call.scorecard_criteria if isinstance(db_call.scorecard_criteria, dict) else {}
                audio_url = clean_audio_url(kept.get("audio_url")) or cast("str | None", db_call.audio_s3_url)
                formatted_call["has_audio"] = has_audio(None, audio_url)
            setattr(db_call, "transcript_text", payload.transcript or getattr(db_call, "transcript_text", ""))
            setattr(db_call, "ai_summary", payload.error_summary or getattr(db_call, "ai_summary", ""))
            setattr(db_call, "next_action_extracted", payload.recommendation or getattr(db_call, "next_action_extracted", ""))
            if score is not None:
                setattr(db_call, "overall_score", float(score))
            setattr(db_call, "scorecard_criteria", {**formatted_call, **({"audio_url": audio_url} if audio_url else {})})
            if audio_url and len(audio_url) <= 512:  # the column is VARCHAR(512); the full link is in the scorecard
                setattr(db_call, "audio_s3_url", audio_url)
            setattr(db_call, "duration_seconds", dur_sec)
            db.commit()
        else:
            deal = find_tenant_deal(db, target_tenant, payload.deal_id) if payload.deal_id else None

            if not deal and payload.deal_id:
                ws_id = get_or_create_workspace(db, target_tenant, tenant_crm).id
                # deals.id is global: the same CRM deal number may already belong to another client
                # (Bitrix portals all start at 1). Keep the CRM number in external_crm_id.
                deal_pk = deal_pk_for(db, target_tenant, payload.deal_id)
                # Unknown amount stays 0 (shown as unknown), never an invented 300 000.
                amt_clean, _unknown = parse_numeric_price(payload.amount)
                deal = Deal(
                    id=deal_pk,
                    external_crm_id=payload.deal_id,
                    tenant_id=target_tenant,
                    workspace_id=ws_id,
                    title=(payload.deal_title or f"Сделка {payload.deal_id}")[:255],
                    company_name=(payload.client or "Клиент")[:255],
                    budget=amt_clean,
                    # The stage belongs to the CRM (the next sync fills it), it does not follow from how a call went.
                    stage=DealStage.LEAD_INCOMING,
                    stage_name=payload.stage or DealStage.UNKNOWN.value,
                    pipeline_name="Основная воронка",
                    pipeline_id="0",
                    avg_call_score=float(score) if score is not None else 0.0,
                    crm_source=tenant_crm or "unknown",
                    status="active"
                )
                db.add(deal)
                db.flush()
            elif deal:
                existing_call_scores = []
                for c in db.query(CallRecording).filter(
                    CallRecording.tenant_id == target_tenant,
                    CallRecording.deal_id == deal.id
                ).all():
                    # Unrated, unanswered and failed calls are stored as overall_score 0.0: they are not zeros.
                    prior = read_scorecard(
                        c.scorecard_criteria,
                        float(c.overall_score) if c.overall_score is not None else None,
                        error_summary=str(c.ai_summary or ""),
                    )["score"]
                    if prior is not None and (c.duration_seconds or 0) >= 20 and c.id != call_id:
                        existing_call_scores.append(float(prior))
                if score is not None and dur_sec >= 20:
                    existing_call_scores.append(float(score))

                if existing_call_scores:
                    mean_score = round(sum(existing_call_scores) / len(existing_call_scores), 1)
                    setattr(deal, "avg_call_score", mean_score)

                # SLA risk is about the PROCESS (next step, stagnation), not about one call's score: a weak call
                # used to flip the flag and the next CRM sync flipped it back. Weak calls are visible in the
                # audit and in avg_call_score.
                setattr(deal, "is_at_risk", deal_sla_state(deal).at_risk)
                current_title = str(getattr(deal, "title", "") or "")
                if (current_title.startswith("?") or current_title.startswith("Сделка #") or not current_title) and payload.deal_title and not payload.deal_title.startswith("?"):
                    setattr(deal, "title", payload.deal_title)
                if payload.client and payload.client != "Клиент":
                    current_comp = str(getattr(deal, "company_name", "") or "")
                    if current_comp.startswith("?") or not current_comp or current_comp == "Клиент":
                        setattr(deal, "company_name", payload.client)

            # call_recordings.id is VARCHAR(36) and global; CRM call ids can be longer (Bitrix external calls:
            # 'externalCall.<32 hex>.<ts>') or repeat across clients. The CRM id always stays in external_call_id.
            call_pk = call_id
            if len(call_pk) > 36 or db.query(CallRecording.id).filter(CallRecording.id == call_pk).first():
                call_pk = str(uuid.uuid5(uuid.NAMESPACE_URL, f"revops-call:{target_tenant}:{call_id}"))
            db_call = CallRecording(
                id=call_pk,
                tenant_id=target_tenant,
                # Never link to a deal found by the bare CRM id: that may be ANOTHER client's deal.
                deal_id=deal.id if deal else None,
                external_call_id=call_id,
                client_phone=(payload.client or "")[:50],  # VARCHAR(50); n8n sends a name here
                duration_seconds=dur_sec,
                status="completed",
                transcript_text=payload.transcript or "",
                ai_summary=payload.error_summary or "",
                next_action_extracted=payload.recommendation or "",
                overall_score=float(score) if score is not None else 0.0,
                scorecard_criteria={**formatted_call, **({"audio_url": audio_url} if audio_url else {})},
                audio_s3_url=audio_url if audio_url and len(audio_url) <= 512 else None,
                reverse_etl_synced=True,
            )
            db.add(db_call)
            db.commit()
    except Exception as db_err:
        # Do NOT answer 200: the caller (n8n) would mark the call as done and it would be lost for the cabinet.
        logger.error(f"Error persisting ingested call {call_id} for {target_tenant}: {db_err}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Call was not persisted")

    # Methodology: judge the saved call against the company's speech standard. It never fails or delays the ingest.
    evaluate_call_safely(db, db_call, resolve_call_manager(tenant_cfg, payload.manager_crm_id, payload.manager))

    # A call that reached the cabinet is never audited again, whichever path delivered it.
    try:
        mark_call_processed(db, target_tenant, call_id)
    except Exception as claim_err:
        db.rollback()
        logger.warning(f"Could not mark call {call_id} of {target_tenant} as processed: {claim_err}")

    # Broadcast to open web dashboard tabs via WebSocket
    await manager.broadcast(target_tenant, {
        "type": "new_call",
        "call": {
            **formatted_call,
            "manager": resolve_call_manager(tenant_cfg, payload.manager_crm_id, payload.manager),
        },
    })

    delete_cached_json_sync(f"calls:{target_tenant}")

    return {
        "status": "ok",
        "call_id": call_id,
        "sheets_synced": sheets_synced,
        "broadcasted": True,
        "call": formatted_call
    }


@router.post("/sync_sheets")
def force_sync_from_sheets(request: Request, tenant_id: str = Query("TNT-001")):
    """Forces an immediate pull from Google Sheets raw_calls for given tenant."""
    verify_internal_or_admin(request)
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    delete_cached_json_sync(f"calls:{clean_tenant}")
    if clean_tenant in _CALLS_CACHE and isinstance(_CALLS_CACHE[clean_tenant], dict):
        _CALLS_CACHE[clean_tenant]["timestamp"] = 0
    calls = fetch_calls_from_sheets(tenant_id=clean_tenant, limit=SHEET_CALLS_MAX)
    _CALLS_CACHE[clean_tenant] = {"timestamp": time.time(), "calls": calls}
    set_cached_json_sync(f"calls:{clean_tenant}", calls, ex=300)
    return {
        "status": "ok",
        "tenant_id": clean_tenant,
        "count": len(calls),
        "calls": calls
    }


# ==========================================================================
# INTERNAL DATABASE & SPEECH EVALUATION ROUTERS
# ==========================================================================

@router.post("/evaluate")
def evaluate_call(
    req: SpeechEvaluationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Evaluates a sales call across the 13 criteria, calculates overall score (0-100),
    detects deal risk, and saves record to tenant database.
    """
    comments = req.comments or {}
    eval_result = evaluate_speech_scorecard(req.scores, comments)

    call = CallRecording(
        tenant_id=current_user.tenant_id,
        deal_id=req.deal_id,
        manager_id=current_user.id,
        client_phone=req.client_phone,
        duration_seconds=req.duration_seconds,
        overall_score=eval_result.overall_score,
        status="completed",
        scorecard_criteria=eval_result.detailed_scores,
        ai_summary=eval_result.risk_summary,
        reverse_etl_synced=False,
    )
    db.add(call)

    # If linked to a deal, update deal's risk status and average score
    if req.deal_id:
        deal = db.query(Deal).filter(Deal.id == req.deal_id, Deal.tenant_id == current_user.tenant_id).first()
        if deal:
            setattr(deal, "avg_call_score", eval_result.overall_score)
            if eval_result.is_deal_at_risk:
                setattr(deal, "is_at_risk", True)
                setattr(deal, "risk_reason", eval_result.risk_summary)


    db.commit()
    db.refresh(call)

    return {
        "call_id": call.id,
        "overall_score": eval_result.overall_score,
        "is_deal_at_risk": eval_result.is_deal_at_risk,
        "risk_summary": eval_result.risk_summary,
        "passed_criteria_count": eval_result.passed_criteria_count,
        "failed_criteria_count": eval_result.failed_criteria_count,
        "crm_note_text": eval_result.crm_note_text,
        "detailed_scores": eval_result.detailed_scores,
    }


@router.get("/")
def list_calls(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lists recent analyzed calls for the tenant."""
    calls = db.query(CallRecording).filter(CallRecording.tenant_id == current_user.tenant_id).order_by(CallRecording.created_at.desc()).limit(50).all()
    return [
        {
            "id": c.id,
            "client_phone": c.client_phone,
            "duration_seconds": c.duration_seconds,
            "overall_score": c.overall_score,
            "status": c.status,
            "ai_summary": c.ai_summary,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in calls
    ]

# ==========================================================================

# ==========================================================================
# AUDIO SERVING & DIRECT AMOCRM TELEPHONY INJECTION
# ==========================================================================

AUDIO_STORAGE_DIR = Path("/app/data/audio")
if not AUDIO_STORAGE_DIR.exists():
    AUDIO_STORAGE_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "audio"
AUDIO_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


def new_audio_filename(tenant_id: str, file_ext: str) -> str:
    """
    Recording URLs are capability URLs: amoCRM's player and n8n fetch them without our auth,
    so the file name itself must be unguessable (128-bit random, no timestamp).
    """
    return f"{tenant_id.strip().lower()}_{uuid.uuid4().hex}{file_ext}"


def _audio_media_type(name: str) -> str:
    ext = name.lower().rsplit(".", 1)[-1]
    return {"wav": "audio/wav", "ogg": "audio/ogg", "m4a": "audio/mp4"}.get(ext, "audio/mpeg")


@router.get("/audio/{filename}", include_in_schema=False)
def serve_audio_file(filename: str):
    """Public audio file serving for n8n and telephony players."""
    safe_name = os.path.basename(filename)
    audio_path = AUDIO_STORAGE_DIR / safe_name
    if not audio_path.exists() or not audio_path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(audio_path, media_type=_audio_media_type(safe_name))


@router.get("/{call_id}/audio", include_in_schema=False)
async def play_call_audio(
    call_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    The recording of one call for the cabinet player. Only the client's own calls (an admin sees all); a call of
    another client answers 404, the same as a call without a recording. See services/call_audio.py for the proxy rules.
    """
    row = db.query(CallRecording).filter(CallRecording.id == call_id).first()
    is_admin = current_user.tenant_id == "*" or current_user.role == UserRole.ADMIN
    if row is None or (not is_admin and str(row.tenant_id).upper() != str(current_user.tenant_id).upper()):
        raise HTTPException(status_code=404, detail="Запись недоступна")
    sc: dict[str, Any] = row.scorecard_criteria if isinstance(row.scorecard_criteria, dict) else {}
    url = clean_audio_url(sc.get("audio_url")) or cast("str | None", row.audio_s3_url)
    if not url:
        raise HTTPException(status_code=404, detail="Запись недоступна")
    db.close()  # the stream can last minutes on slow telephony storage: it must not hold a pooled connection

    local = call_audio.local_file(url, AUDIO_STORAGE_DIR)
    if local:
        return FileResponse(local, media_type=_audio_media_type(local.name))
    try:
        resp, client = await call_audio.open_remote(url, request.headers.get("range"))
    except call_audio.AudioUnavailable as err:
        logger.info(f"Recording of call {call_id} is not playable: {err}")  # never the link: it may be signed
        raise HTTPException(status_code=404, detail="Запись недоступна")
    return StreamingResponse(
        call_audio.stream_body(resp, client),
        status_code=resp.status_code,
        media_type=call_audio.media_type(resp),
        headers=call_audio.response_headers(resp),
    )


@router.post("/inject-amocrm")
async def inject_call_to_amocrm(
    request: Request,
    tenant_id: str = Query(..., min_length=1),  # required: it used to default to TNT-004
    lead_id: int | None = Query(None),
    filename: str = Query("call.mp3"),
    phone: str = Query("+79990001122"),
    duration: int | None = Query(None),
    call_direction: str = Query("call_in"),
):
    """
    Uploads raw audio stream (or JSON payload) and registers it as a telephony call note in amoCRM.
    Triggers n8n -> Gemini AI audit -> Google Sheets sync without requiring python-multipart.

    Writes into the client's CRM and stores the uploaded file, so it is admin / internal-network only.
    It used to have NO authorization: anybody on the internet could post audio and a tenant_id and get a call
    note (and a lead) created in that client's amoCRM.
    """
    verify_internal_or_admin(request)
    clean_tenant = tenant_id.strip().upper()
    cfg = get_tenant_config(clean_tenant)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Tenant '{clean_tenant}' not found")

    amo_domain = (cfg.get("amo_domain") or "").rstrip("/")
    amo_token = cfg.get("amo_token") or ""
    if not amo_domain or not amo_token:
        raise HTTPException(status_code=400, detail=f"Tenant '{clean_tenant}' does not have amoCRM credentials")

    # Read audio bytes from raw body or JSON
    ct = request.headers.get("content-type", "")
    if "application/json" in ct:
        try:
            body_json = await request.json()
        except Exception:
            body_json = {}
        import base64
        b64 = body_json.get("audio_b64") or ""
        audio_bytes = base64.b64decode(b64) if b64 else b""
        filename = body_json.get("filename") or filename
        phone = body_json.get("phone") or phone
        duration = body_json.get("duration") or duration
        lead_id = body_json.get("lead_id") or lead_id
        call_direction = body_json.get("call_direction") or call_direction
    else:
        audio_bytes = await request.body()

    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Audio body is empty")

    file_ext = os.path.splitext(filename)[1] or ".mp3"
    safe_filename = new_audio_filename(clean_tenant, file_ext)
    target_path = AUDIO_STORAGE_DIR / safe_filename
    with open(target_path, "wb") as f_out:
        f_out.write(audio_bytes)

    # Real duration from the MP3 headers; size-based estimate only for non-MP3 audio
    dur = duration
    if not dur or dur <= 0:
        dur = mp3_duration_seconds(audio_bytes) or max(25, int(len(audio_bytes) / 16000))

    headers = {"Authorization": f"Bearer {amo_token}"}
    target_lead_id = lead_id

    # If lead_id not supplied, fetch the most recent active lead from amoCRM
    if not target_lead_id:
        try:
            leads_resp = requests.get(
                f"{amo_domain}/api/v4/leads?limit=1&order[updated_at]=desc",
                headers=headers,
                timeout=10
            )
            if leads_resp.status_code == 200:
                leads_data = leads_resp.json().get("_embedded", {}).get("leads", [])
                if leads_data:
                    target_lead_id = leads_data[0]["id"]
        except Exception as e:
            logger.warning(f"Could not auto-fetch lead from amoCRM: {e}")

    # Fallback: create lead if none found
    if not target_lead_id:
        try:
            create_lead_resp = requests.post(
                f"{amo_domain}/api/v4/leads",
                headers=headers,
                # no invented "price": 300000 - the amount of a deal we did not get from the client is unknown
                json=[{"name": f"RevOps Звонок {datetime.now().strftime('%d.%m %H:%M')}"}],
                timeout=10
            )
            if create_lead_resp.status_code in (200, 201):
                leads_data = create_lead_resp.json().get("_embedded", {}).get("leads", [])
                if leads_data:
                    target_lead_id = leads_data[0]["id"]
        except Exception as e:
            logger.error(f"Failed to create fallback lead in amoCRM: {e}")

    if not target_lead_id:
        raise HTTPException(status_code=400, detail="Could not resolve or create lead in amoCRM")

    public_url = f"https://report.ai-rop.ru/api/v1/calls/audio/{safe_filename}"
    call_uniq = f"call_{clean_tenant.lower()}_{target_lead_id}_{int(time.time())}_{uuid.uuid4().hex[:4]}"

    note_payload: Any = [
        {
            "note_type": call_direction if call_direction in ("call_in", "call_out") else "call_in",
            "params": {
                "uniq": call_uniq,
                "duration": dur,
                "source": "sip",
                "link": public_url,
                "phone": phone
            }
        }
    ]

    try:
        note_resp = requests.post(
            f"{amo_domain}/api/v4/leads/{target_lead_id}/notes",
            headers=headers,
            json=note_payload,  # type: ignore[arg-type]
            timeout=15
        )
        if note_resp.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"amoCRM API error {note_resp.status_code}: {note_resp.text}")

        note_json = note_resp.json()
        notes_created = note_json.get("_embedded", {}).get("notes", [])
        created_note_id = notes_created[0]["id"] if notes_created else None
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create call note in amoCRM: {e}")

    return {
        "status": "success",
        "tenant_id": clean_tenant,
        "lead_id": target_lead_id,
        "note_id": created_note_id,
        "call_id": call_uniq,
        "duration_sec": dur,
        "audio_url": public_url,
        "message": f"Звонок успешно зарегистрирован в сделке #{target_lead_id}. n8n обработает его и отправит в Gemini AI."
    }
