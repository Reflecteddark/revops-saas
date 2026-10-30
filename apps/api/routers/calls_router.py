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
from datetime import datetime
from ipaddress import ip_address, ip_network
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.analytics_engine.speech_scoring import evaluate_speech_scorecard
from packages.database.models import CallRecording, Deal, DealStage, User, UserRole
from packages.database.session import get_db

from ..auth import get_current_user, security
from ..cache_client import (
    delete_cached_json_sync,
    get_cached_json_sync,
    set_cached_json_sync,
)
from ..schemas import SpeechEvaluationRequest
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
                return User(
                    id=user_id,
                    tenant_id=tenant_id or "TNT-001",
                    email=user_id,
                    full_name=str(payload.get("name") or "User"),
                    role=UserRole.ADMIN if "admin" in str(payload.get("role", "")).lower() else UserRole.KAM,
                    is_active=True
                )
        except Exception:
            pass

    if request.cookies.get("revops_client_auth"):
        return User(
            id="client-demo",
            tenant_id="TNT-001",
            email="demo_test@ai-rop.ru",
            full_name="Демо-Клиент",
            role=UserRole.KAM,
            is_active=True
        )

    return None


class CallIngestPayload(BaseModel):
    id: str | None = None
    deal_id: str | None = None
    deal_title: str | None = None
    client: str | None = None
    manager: str | None = None
    stage: str | None = "Первичный контакт"
    duration_sec: int | None = None
    duration: str | None = None
    amount: str | None = "500 000 ₽"
    score: int | None = None
    status: str | None = None
    status_label: str | None = None
    risk_amount: str | None = None
    next_step: int | None = 1
    cr: list[int] | None = None
    error_summary: str | None = None
    recommendation: str | None = None
    transcript: str | None = None
    sync_to_sheets: bool = True
    tenant_id: str = "TNT-001"


def verify_internal_or_admin(request: Request) -> bool:
    """Allows requests from internal networks or with valid admin key."""
    client_ip = request.client.host if request.client else ""
    if client_ip and _is_internal_ip(client_ip):
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


# In-memory cache for live calls from Google Sheets keyed by tenant_id (TTL: 15s)
_CALLS_CACHE: dict[str, Any] = {}


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


def fetch_calls_from_sheets(tenant_id: str = "TNT-001", limit: int = 50) -> list[dict[str, Any]]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    now = time.time()
    cache_key = f"calls:{clean_tenant}"

    # 1. Check Redis cache first (strictly scoped to tenant_id)
    cached_redis = get_cached_json_sync(cache_key)
    if cached_redis is not None and isinstance(cached_redis, list) and len(cached_redis) > 0:
        _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": cached_redis}
        return cached_redis[:limit]

    cached = _CALLS_CACHE.get(clean_tenant)
    if isinstance(cached, dict) and (now - cached.get("timestamp", 0) < 15):
        return cached.get("calls", [])

    sa_path = get_service_account_path()
    if not sa_path:
        logger.warning(f"service_account.json not found, skipping Google Sheets fetch (tenant: {clean_tenant})")
        return cached.get("calls", []) if isinstance(cached, dict) else []

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
            deal_id = r[1] if len(r) > 1 and r[1] else "Deal-N"
            manager_name = r[2] if len(r) > 2 and r[2] else "Менеджер"

            # Match against real deals
            deal_meta = None
            clean_deal_id = str(deal_id).upper().strip()
            if clean_deal_id in deals_map:
                deal_meta = deals_map[clean_deal_id]
            else:
                num_only = re.sub(r"\D", "", clean_deal_id)
                if num_only and num_only in deals_map:
                    deal_meta = deals_map[num_only]

            deal_title = deal_meta["title"] if deal_meta else f"Сделка {deal_id} ({manager_name})"
            deal_amount_str = deal_meta["amount_str"] if deal_meta else "300 000 ₽"
            deal_amount_num = deal_meta["amount"] if deal_meta else 300000.0
            deal_stage = deal_meta["stage"] if deal_meta else "1. Первичный контакт"

            # Duration parsing
            dur_sec = 120
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

            # Status derivation
            if score is None or next_step is None:
                status = "unknown"
                status_label = "НЕТ ДАННЫХ"
                risk_amt = "0 ₽"
            elif score >= 10 and next_step == 1:
                status = "won"
                status_label = "ЭТАЛОН"
                risk_amt = "0 ₽"
            elif next_step == 0:
                status = "risk"
                status_label = "СЛИВ (НЕТ NEXT STEP)"
                risk_amt = deal_amount_str
            else:
                status = "risk" if score < 8 else "won"
                status_label = "СЛИВ" if score < 8 else "ЭТАЛОН"
                risk_amt = deal_amount_str if score < 8 else "0 ₽"

            error_sum = r[21] if len(r) > 21 else ""
            rec = r[22] if len(r) > 22 else ""
            transcript = r[29] if len(r) > 29 else ""

            # Client name heuristic from transcript or deal title
            client_name = "Клиент"
            if transcript:
                first_lines = transcript.split("\n")[:4]
                for line in first_lines:
                    if "Клиент:" in line or "Клиент :" in line:
                        client_name = line.split(":", 1)[1].strip()[:35]
                        break
            if client_name == "Клиент" and deal_meta and "Сделка" in deal_title:
                parts = deal_title.split(":", 1)
                if len(parts) > 1:
                    client_name = parts[1].strip()[:35]

            calls.append({
                "id": call_id,
                "deal_id": deal_id,
                "deal_title": deal_title,
                "client": client_name,
                "manager": manager_name,
                "stage": deal_stage,
                "duration": duration_str,
                "amount": deal_amount_str,
                "amount_num": deal_amount_num,
                "score": score,
                "status": status,
                "status_label": status_label,
                "risk_amount": risk_amt,
                "next_step": next_step,
                "date": r[3] if len(r) > 3 and r[3] else "",
                "cr": cr_list,
                "error_summary": error_sum or "Анализ завершен ИИ",
                "recommendation": rec or "Следовать регламенту фиксации Next Step",
                "transcript": transcript or "Транскрипт отсутствует"
            })
            if len(calls) >= limit:
                break

        _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": calls}
        set_cached_json_sync(cache_key, calls, ex=60)
        return calls
    except Exception as e:
        logger.error(f"Error fetching calls from Google Sheets: {e}")
        return []


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
        deal_id = payload.deal_id or f"D-{int(time.time()) % 10000}"
        manager_id = payload.manager or "Менеджер"
        today_str = datetime.now().strftime("%Y-%m-%d")
        synced_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        dur_sec = payload.duration_sec or 120
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
            next_step_flag = payload.next_step if payload.next_step is not None else 1
        else:
            cr_list = [None] * 13
            total_score = None
            next_step_flag = None

        error_summary = payload.error_summary or ""
        ai_recommendation = payload.recommendation or ""
        transcript_text = payload.transcript or ""

        # Compute deterministic Payload SHA-256 checksum (hash_out)
        hash_out = hashlib.sha256(
            f"{call_id}:{manager_id}:{total_score}:{dur_sec}:{next_step_flag}".encode()
        ).hexdigest()

        row = [
            call_id,
            deal_id,
            manager_id,
            today_str,
            str(dur_sec),
            "presentation",
            *[str(c) if c is not None else "" for c in cr_list],
            str(total_score) if total_score is not None else "",
            str(next_step_flag) if next_step_flag is not None else "",
            error_summary,
            ai_recommendation,
            synced_at,
            "",
            today_str,
            "V20.0",
            "AI Supervisor (n8n)",
            f"sha256_{hash_out[:12]}",
            transcript_text,
            "0",
            "Middle",
            str(datetime.now().hour),
            "1",
            "0",
            payload.tenant_id,
            "0",
            "0"
        ]

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
            or "admin" in str(getattr(current_user, "role", "")).lower()
            or "супервайзер" in str(getattr(current_user, "role", "")).lower()
            or str(getattr(current_user, "email", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
            or str(getattr(current_user, "id", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
            or current_user.tenant_id == "*"
        )
        if target_tenant != str(current_user.tenant_id).upper() and not is_admin:
            raise HTTPException(status_code=403, detail="cross-tenant access denied")

    # 1. Primary Enterprise DWH Storage: query PostgreSQL first (sub-millisecond indexed latency)
    db_calls = (
        db.query(CallRecording)
        .filter(
            (CallRecording.tenant_id == raw_tenant)
            | (CallRecording.tenant_id == effective_tenant)
            | (CallRecording.tenant_id == raw_tenant.lower())
        )
        .order_by(CallRecording.created_at.desc())
        .limit(limit)
        .all()
    ) if not is_demo_tenant else []

    if db_calls:
        formatted_calls = []
        for c in db_calls:
            sc: dict[str, Any] = c.scorecard_criteria if isinstance(c.scorecard_criteria, dict) else {}
            call_deal = c.deal
            mgr = c.manager
            deal_budget = float(call_deal.budget or 0.0) if (call_deal and call_deal.budget is not None) else None
            dur_secs = int(c.duration_seconds or 0)
            dur_str = f"{dur_secs // 60}:{dur_secs % 60:02d}"

            if sc.get("cr") and isinstance(sc.get("cr"), list) and len(sc.get("cr", [])) == 13:
                cr_val = sc.get("cr")
            else:
                cr_val = [None] * 13

            if sc.get("score") is not None:
                call_score = sc.get("score")
            elif c.overall_score is not None:
                call_score = int(round((c.overall_score / 100.0) * 13)) if c.overall_score > 13 else int(round(c.overall_score))
            else:
                call_score = None

            call_next_step = sc.get("next_step")
            if call_next_step is None and c.overall_score is not None:
                call_next_step = 1 if c.overall_score >= 60 else 0

            call_status = sc.get("status")
            if not call_status:
                if call_score is not None:
                    call_status = "won" if call_score >= 10 else "risk"
                else:
                    call_status = "unknown"

            call_status_label = sc.get("status_label")
            if not call_status_label:
                if call_status == "won":
                    call_status_label = "ЭТАЛОН"
                elif call_status == "risk":
                    call_status_label = "СЛИВ"
                else:
                    call_status_label = "НЕТ ДАННЫХ"

            if deal_budget is not None:
                amount_num = float(deal_budget)
            else:
                raw_sc_amt = sc.get("amount")
                if isinstance(raw_sc_amt, (int, float)):
                    amount_num = float(raw_sc_amt)
                elif raw_sc_amt:
                    cleaned_amt = re.sub(r"[^\d.]", "", str(raw_sc_amt).replace(",", "."))
                    try:
                        amount_num = float(cleaned_amt) if cleaned_amt else 0.0
                    except Exception:
                        amount_num = 0.0
                else:
                    amount_num = 0.0

            amount_str = f"{int(amount_num):,} ₽".replace(",", " ") if amount_num > 0 else (sc.get("amount_str") or "0 ₽")
            risk_amt_str = f"{int(amount_num):,} ₽".replace(",", " ") if (amount_num > 0 and call_status == "risk") else "0 ₽"

            # Prioritize specific client/contact extracted from the call
            sc_client = sc.get("client")
            if sc_client and sc_client not in ("Клиент", "Клиент B2B", "Неизвестно") and "электроник" not in sc_client.lower() and "оптовая" not in sc_client.lower():
                client_name = sc_client
            elif call_deal and call_deal.company_name and "электроник" not in call_deal.company_name.lower() and "оптовая" not in call_deal.company_name.lower():
                client_name = call_deal.company_name
            elif sc_client and "электроник" not in sc_client.lower() and "оптовая" not in sc_client.lower():
                client_name = sc_client
            else:
                client_name = "Клиент"

            raw_deal_title = call_deal.title if call_deal else (sc.get("deal_title") or f"Сделка {c.deal_id}")
            if "?" in raw_deal_title or "оптовая" in raw_deal_title.lower() or "электроник" in raw_deal_title.lower():
                raw_deal_title = f"Сделка #{c.deal_id or c.id[-4:]}"

            deal_stage = call_deal.stage.value if (call_deal and hasattr(call_deal.stage, "value")) else (str(call_deal.stage) if call_deal and call_deal.stage else "Первичный контакт")

            formatted_calls.append({
                "id": c.id,
                "deal_id": c.deal_id or f"D-{c.id[-4:]}",
                "deal_title": raw_deal_title,
                "client": client_name,
                "manager": mgr.full_name if mgr else (sc.get("manager") or "Менеджер"),
                "stage": deal_stage,
                "duration": dur_str,
                "amount": amount_str,
                "amount_num": amount_num,
                "score": call_score,
                "status": call_status,
                "status_label": call_status_label,
                "risk_amount": risk_amt_str,
                "next_step": call_next_step,
                "date": c.created_at.strftime("%Y-%m-%d %H:%M:%S") if c.created_at else "",
                "cr": cr_val,
                "error_summary": c.ai_summary or sc.get("error_summary", "Анализ завершен ИИ"),
                "recommendation": c.next_action_extracted or sc.get("recommendation", "Следовать регламенту фиксации Next Step"),
                "transcript": c.transcript_text or "Транскрипт отсутствует"
            })
        return {
            "status": "ok",
            "tenant_id": raw_tenant,
            "source": "database",
            "count": len(formatted_calls),
            "calls": formatted_calls
        }

    # 2. Resilient Fallback: Google Sheets only if PostgreSQL is empty for tenant
    calls = [] if is_demo_tenant else fetch_calls_from_sheets(tenant_id=effective_tenant, limit=limit)
    return {
        "status": "ok",
        "tenant_id": effective_tenant,
        "source": "google_sheets",
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
    dur_sec = payload.duration_sec or 120
    if payload.duration and ":" in payload.duration:
        parts = payload.duration.split(":")
        try:
            dur_sec = int(parts[0]) * 60 + int(parts[1])
        except:
            pass
    dur_str = payload.duration or f"{dur_sec // 60}:{dur_sec % 60:02d}"

    has_cr = bool(payload.cr and len(payload.cr) == 13)
    if has_cr:
        cr_list: list[int | None] = [int(x) if x is not None else None for x in payload.cr]  # type: ignore[union-attr]
        score = payload.score if payload.score is not None else sum(c for c in cr_list if c is not None)
        next_step = payload.next_step if payload.next_step is not None else 1

        if payload.status:
            status = payload.status
            status_label = payload.status_label or ("ЭТАЛОН" if status == "won" else "СЛИВ")
            risk_amt = payload.risk_amount or ("0 ₽" if status == "won" else (payload.amount or "0 ₽"))
        else:
            if score is not None and score >= 10 and next_step == 1:
                status = "won"
                status_label = "ЭТАЛОН"
                risk_amt = "0 ₽"
            elif next_step == 0:
                status = "risk"
                status_label = "СЛИВ (НЕТ NEXT STEP)"
                risk_amt = payload.amount or "0 ₽"
            else:
                status = "risk" if (score is not None and score < 8) else "won"
                status_label = "СЛИВ" if (score is not None and score < 8) else "ЭТАЛОН"
                risk_amt = payload.amount or "0 ₽" if (score is not None and score < 8) else "0 ₽"
    else:
        cr_list = [None] * 13
        score = None
        next_step = None
        status = "unknown"
        status_label = "НЕТ ДАННЫХ"
        risk_amt = "0 ₽"

    formatted_call = {
        "id": call_id,
        "deal_id": payload.deal_id or f"D-{int(time.time()) % 10000}",
        "deal_title": payload.deal_title or f"Сделка {payload.deal_id or call_id}",
        "client": payload.client or "Клиент",
        "manager": payload.manager or "Менеджер",
        "stage": payload.stage or "Первичный контакт",
        "duration": dur_str,
        "amount": payload.amount or "500 000 ₽",
        "score": score,
        "status": status,
        "status_label": status_label,
        "risk_amount": risk_amt,
        "next_step": next_step,
        "cr": cr_list,
        "error_summary": payload.error_summary or "",
        "recommendation": payload.recommendation or "",
        "transcript": payload.transcript or ""
    }

    sheets_synced = False
    if payload.sync_to_sheets:
        sheets_synced = append_call_to_sheets(payload)

    target_tenant = (payload.tenant_id or "TNT-001").strip().upper()

    # Persist call to tenant database
    try:
        db_call = db.query(CallRecording).filter(
            CallRecording.tenant_id == target_tenant,
            (CallRecording.id == call_id) | (CallRecording.external_call_id == call_id)
        ).first()
        if db_call:
            setattr(db_call, "transcript_text", payload.transcript or getattr(db_call, "transcript_text", ""))
            setattr(db_call, "ai_summary", payload.error_summary or getattr(db_call, "ai_summary", ""))
            setattr(db_call, "next_action_extracted", payload.recommendation or getattr(db_call, "next_action_extracted", ""))
            if score is not None:
                setattr(db_call, "overall_score", float(score))
            setattr(db_call, "scorecard_criteria", formatted_call)
            setattr(db_call, "duration_seconds", dur_sec)
            db.commit()
        else:
            deal = db.query(Deal).filter(
                Deal.tenant_id == target_tenant,
                (Deal.id == payload.deal_id) | (Deal.external_crm_id == payload.deal_id)
            ).first() if payload.deal_id else None

            if not deal and payload.deal_id:
                ws_id = f"ws_{target_tenant}"
                amt_clean = float(re.sub(r"[^\d.]", "", str(payload.amount or "300000")) or 300000)
                deal = Deal(
                    id=payload.deal_id,
                    external_crm_id=payload.deal_id,
                    tenant_id=target_tenant,
                    workspace_id=ws_id,
                    title=payload.deal_title or f"Сделка {payload.deal_id}",
                    company_name=payload.client or "Клиент",
                    budget=amt_clean,
                    stage=DealStage.QUALIFICATION if status == "won" else DealStage.LEAD_INCOMING,
                    stage_name=payload.stage or ("Переговоры" if status == "won" else "Первичный контакт"),
                    pipeline_name="Основная воронка",
                    pipeline_id="0",
                    is_at_risk=bool(score is not None and score < 8),
                    avg_call_score=float(score) if score is not None else 0.0,
                    crm_source="amocrm" if target_tenant == "TNT-002" else "bitrix24",
                    status="active"
                )
                db.add(deal)
                db.flush()
            elif deal:
                existing_call_scores = [
                    float(c.overall_score)
                    for c in db.query(CallRecording).filter(
                        CallRecording.tenant_id == target_tenant,
                        CallRecording.deal_id == deal.id
                    ).all()
                    if c.overall_score is not None and (c.duration_seconds or 0) >= 20 and c.id != call_id
                ]
                if score is not None and dur_sec >= 20:
                    existing_call_scores.append(float(score))

                if existing_call_scores:
                    mean_score = round(sum(existing_call_scores) / len(existing_call_scores), 1)
                    setattr(deal, "avg_call_score", mean_score)

                deal_is_closed = (
                    getattr(deal, "status", "") in ("won", "lost")
                    or getattr(deal, "stage", "") in (DealStage.WON, DealStage.LOST)
                    or any(w in str(getattr(deal, "stage_name", "")).lower() for w in ("успешно", "закрыт", "отказ", "не реализовано"))
                )
                if not deal_is_closed and score is not None and score < 8 and dur_sec >= 20:
                    setattr(deal, "is_at_risk", True)
                elif deal_is_closed or (score is not None and score >= 8):
                    setattr(deal, "is_at_risk", False)
                current_title = str(getattr(deal, "title", "") or "")
                if (current_title.startswith("?") or current_title.startswith("Сделка #") or not current_title) and payload.deal_title and not payload.deal_title.startswith("?"):
                    setattr(deal, "title", payload.deal_title)
                if payload.client and payload.client != "Клиент":
                    current_comp = str(getattr(deal, "company_name", "") or "")
                    if current_comp.startswith("?") or not current_comp or current_comp == "Клиент":
                        setattr(deal, "company_name", payload.client)

            mgr = db.query(User).filter(
                User.tenant_id == target_tenant
            ).first()

            db_call = CallRecording(
                id=call_id,
                tenant_id=target_tenant,
                deal_id=deal.id if deal else (payload.deal_id if payload.deal_id and db.query(Deal).filter(Deal.id == payload.deal_id).first() else None),
                manager_id=mgr.id if mgr else None,
                external_call_id=call_id,
                client_phone=payload.client or "+79000000000",
                duration_seconds=dur_sec,
                status="completed",
                transcript_text=payload.transcript or "",
                ai_summary=payload.error_summary or "",
                next_action_extracted=payload.recommendation or "",
                overall_score=float(score) if score is not None else 0.0,
                scorecard_criteria=formatted_call,
                reverse_etl_synced=True,
            )
            db.add(db_call)
            db.commit()
    except Exception as db_err:
        logger.warning(f"Error persisting ingested call to DB: {db_err}")
        db.rollback()

    # Broadcast to open web dashboard tabs via WebSocket
    target_tenant = (payload.tenant_id or "TNT-001").strip().upper()
    await manager.broadcast(target_tenant, {
        "type": "new_call",
        "call": formatted_call
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
    calls = fetch_calls_from_sheets(tenant_id=clean_tenant, limit=100)
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


@router.get("/audio/{filename}", include_in_schema=False)
def serve_audio_file(filename: str):
    """Public audio file serving for n8n and telephony players."""
    safe_name = os.path.basename(filename)
    audio_path = AUDIO_STORAGE_DIR / safe_name
    if not audio_path.exists() or not audio_path.is_file():
        raise HTTPException(status_code=404, detail="Audio file not found")
    media_type = "audio/mpeg"
    if safe_name.lower().endswith(".wav"):
        media_type = "audio/wav"
    elif safe_name.lower().endswith(".ogg"):
        media_type = "audio/ogg"
    elif safe_name.lower().endswith(".m4a"):
        media_type = "audio/mp4"
    return FileResponse(audio_path, media_type=media_type)


@router.post("/inject-amocrm")
async def inject_call_to_amocrm(
    request: Request,
    tenant_id: str = Query("TNT-004"),
    lead_id: int | None = Query(None),
    filename: str = Query("call.mp3"),
    phone: str = Query("+79990001122"),
    duration: int | None = Query(None),
    call_direction: str = Query("call_in"),
):
    """
    Uploads raw audio stream (or JSON payload) and registers it as a telephony call note in amoCRM.
    Triggers n8n -> Gemini AI audit -> Google Sheets sync without requiring python-multipart.
    """
    clean_tenant = (tenant_id or "TNT-004").strip().upper()
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
    safe_filename = f"{clean_tenant.lower()}_{int(time.time())}_{uuid.uuid4().hex[:6]}{file_ext}"
    target_path = AUDIO_STORAGE_DIR / safe_filename
    with open(target_path, "wb") as f_out:
        f_out.write(audio_bytes)

    # Estimate duration if not provided (assume ~128kbps = 16000 bytes/sec)
    dur = duration
    if not dur or dur <= 0:
        dur = max(25, int(len(audio_bytes) / 16000))

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
                json=[{"name": f"RevOps Звонок {datetime.now().strftime('%d.%m %H:%M')}", "price": 300000}],
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
