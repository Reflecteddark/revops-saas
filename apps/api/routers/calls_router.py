"""
Calls Router: Speech AI Auditing, 13 Evaluation Criteria, Google Sheets Sync, and Live Ingestion.
"""

import logging
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.analytics_engine.speech_scoring import evaluate_speech_scorecard
from packages.database.models import CallRecording, Deal, User
from packages.database.session import get_db

from ..auth import get_current_user
from ..schemas import SpeechEvaluationRequest
from ..tenant_registry import get_tenant_spreadsheet_id
from ..websocket_manager import manager
from .deals_router import get_deals_lookup

logger = logging.getLogger("calls_router")

router = APIRouter(prefix="/calls", tags=["Speech AI & 13 Criteria Scorecard"])


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


def verify_internal_or_admin(request: Request):
    """Allows requests from localhost/internal docker network or with valid REVOPS_ADMIN_KEY."""
    client_ip = request.client.host if request.client else ""
    is_local = (
        client_ip in ("127.0.0.1", "::1", "localhost", "testclient")
        or client_ip.startswith("172.")
        or client_ip.startswith("10.")
    )
    if is_local:
        return True

    from .admin_router import ALLOWED_ADMIN_KEYS
    secret = (
        request.headers.get("x-admin-key")
        or request.headers.get("x-revops-secret")
        or request.headers.get("x-revops-admin-key")
    )
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        secret = auth_header.split(" ", 1)[1]

    if secret and any(secret == k for k in ALLOWED_ADMIN_KEYS):
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
    cached = _CALLS_CACHE.get(clean_tenant)
    if isinstance(cached, dict) and (now - cached.get("timestamp", 0) < 15):
        return cached.get("calls", [])

    sa_path = get_service_account_path()
    if not sa_path:
        logger.warning(f"service_account.json not found, skipping Google Sheets fetch (tenant: {clean_tenant})")
        return cached.get("calls", []) if isinstance(cached, dict) else []

    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        sheet_id = get_tenant_spreadsheet_id(clean_tenant)
        ss = gc.open_by_key(sheet_id)
        ws = ss.worksheet("raw_calls")
        rows = ws.get_all_values()
        if len(rows) < 2:
            empty_calls: list[dict[str, Any]] = []
            _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": empty_calls}
            _CALLS_CACHE["calls"] = empty_calls
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
            cr_list = []
            for col_idx in range(6, 19):
                val = r[col_idx] if len(r) > col_idx else "0"
                cr_list.append(1 if val == "1" else 0)
            while len(cr_list) < 13:
                cr_list.append(0)

            # Score and next_step
            score = int(r[19]) if len(r) > 19 and r[19].isdigit() else sum(cr_list)
            next_step = int(r[20]) if len(r) > 20 and r[20] in ("0", "1") else (1 if score >= 8 else 0)

            # Status derivation
            if score >= 10 and next_step == 1:
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
        _CALLS_CACHE["calls"] = calls
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

        cr_list = payload.cr if payload.cr and len(payload.cr) == 13 else [1]*13
        total_score = payload.score if payload.score is not None else sum(cr_list)
        next_step_flag = payload.next_step if payload.next_step is not None else 1
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
            *[str(c) for c in cr_list],
            str(total_score),
            str(next_step_flag),
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
            # gspread Worksheet.update argument typing limitation (see issue #1141)
            ws.update(f"A{row_idx}:Z{row_idx}", [row[:26]], value_input_option="USER_ENTERED")  # type: ignore[arg-type]
        else:
            # gspread Worksheet.append_row argument typing limitation (see issue #1141)
            ws.append_row(row, value_input_option="USER_ENTERED")  # type: ignore[arg-type]
            row_idx = len(existing_call_ids) + 1

        # 2. Read-After-Write (RAW) Cryptographic Verification
        try:
            read_back = ws.row_values(row_idx)
            if read_back and len(read_back) >= 5:
                r_call_id = read_back[0]
                r_manager = read_back[2] if len(read_back) > 2 else ""
                r_dur = read_back[4] if len(read_back) > 4 else ""
                r_score = read_back[19] if len(read_back) > 19 else str(total_score)
                r_next_step = read_back[20] if len(read_back) > 20 else str(next_step_flag)
                hash_in = hashlib.sha256(
                    f"{r_call_id}:{r_manager}:{r_score}:{r_dur}:{r_next_step}".encode()
                ).hexdigest()

                if hash_out != hash_in:
                    logger.warning(
                        f"Read-After-Write hash mismatch for {call_id} (out={hash_out[:8]}, in={hash_in[:8]}). Rewriting in RAW mode."
                    )
                    # gspread Worksheet.update argument typing limitation (see issue #1141)
                    ws.update(f"A{row_idx}:Z{row_idx}", [row[:26]], value_input_option="RAW")  # type: ignore[arg-type]
                else:
                    logger.info(f"Read-After-Write verified successfully for {call_id} (checksum: {hash_out[:8]})")
        except Exception as ex_raw:
            logger.debug(f"Read-After-Write verification note: {ex_raw}")

        # Invalidate cache so fresh calls appear immediately
        _CALLS_CACHE.pop(tenant_id, None)
        _CALLS_CACHE.clear()
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
    db: Session = Depends(get_db)
):
    """
    Public dashboard endpoint: pulls real audited calls from Google Sheets (raw_calls)
    or database fallback for specified client tenant, formatted for the web dashboard.
    """
    raw_tenant = (tenant_id or "TNT-001").strip()
    effective_tenant = raw_tenant.upper()
    is_demo_tenant = raw_tenant.lower().startswith("demo_") or raw_tenant.lower().startswith("demo-")
    calls = [] if is_demo_tenant else fetch_calls_from_sheets(tenant_id=effective_tenant, limit=limit)
    if not calls:
        # Fallback to local tenant database
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
        )
        if db_calls:
            formatted_calls = []
            for c in db_calls:
                sc = c.scorecard_criteria if isinstance(c.scorecard_criteria, dict) else {}
                call_deal = c.deal
                mgr = c.manager
                formatted_calls.append({
                    "id": c.id,
                    "deal_id": c.deal_id or f"D-{c.id[-4:]}",
                    "deal_title": call_deal.title if call_deal else (sc.get("deal_title") or f"Сделка {c.deal_id}"),
                    "client": call_deal.company_name if call_deal else (sc.get("client") or "Клиент"),
                    "manager": mgr.full_name if mgr else (sc.get("manager") or "Менеджер"),
                    "stage": call_deal.stage.value if call_deal and call_deal.stage else "Первичный контакт",
                    "duration": f"{c.duration_seconds // 60}:{c.duration_seconds % 60:02d}",
                    "amount": f"{int(call_deal.budget):,} ₽".replace(",", " ") if call_deal else (sc.get("amount_str") or "350 000 ₽"),
                    "amount_num": call_deal.budget if call_deal else (sc.get("amount") or 350000.0),
                    "score": sc.get("score", int(round((c.overall_score / 100.0) * 13))),
                    "status": sc.get("status", "won" if c.overall_score >= 60 else "risk"),
                    "status_label": sc.get("status_label", "ЭТАЛОН" if c.overall_score >= 60 else "СЛИВ"),
                    "risk_amount": f"{int(call_deal.budget):,} ₽".replace(",", " ") if (call_deal and sc.get("status") == "risk") else "0 ₽",
                    "next_step": sc.get("next_step", 1 if c.overall_score >= 60 else 0),
                    "date": c.created_at.strftime("%Y-%m-%d %H:%M:%S") if c.created_at else "",
                    "cr": sc.get("cr", [1] * 13),
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
        return {"status": "ok", "tenant_id": effective_tenant, "source": "fallback", "count": 0, "calls": []}
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
    request: Request
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

    cr_list = payload.cr if payload.cr and len(payload.cr) == 13 else [1]*13
    score = payload.score if payload.score is not None else sum(cr_list)
    next_step = payload.next_step if payload.next_step is not None else 1

    if payload.status:
        status = payload.status
        status_label = payload.status_label or ("ЭТАЛОН" if status == "won" else "СЛИВ")
        risk_amt = payload.risk_amount or ("0 ₽" if status == "won" else "500 000 ₽")
    else:
        if score >= 10 and next_step == 1:
            status = "won"
            status_label = "ЭТАЛОН"
            risk_amt = "0 ₽"
        elif next_step == 0:
            status = "risk"
            status_label = "СЛИВ (НЕТ NEXT STEP)"
            risk_amt = "500 000 ₽"
        else:
            status = "risk" if score < 8 else "won"
            status_label = "СЛИВ" if score < 8 else "ЭТАЛОН"
            risk_amt = "500 000 ₽" if score < 8 else "0 ₽"

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

    # Broadcast to open web dashboard tabs via WebSocket
    await manager.broadcast(payload.tenant_id, {
        "type": "new_call",
        "call": formatted_call
    })
    await manager.broadcast("org_default", {
        "type": "new_call",
        "call": formatted_call
    })

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
    if clean_tenant in _CALLS_CACHE and isinstance(_CALLS_CACHE[clean_tenant], dict):
        _CALLS_CACHE[clean_tenant]["timestamp"] = 0
    calls = fetch_calls_from_sheets(tenant_id=clean_tenant, limit=100)
    _CALLS_CACHE["calls"] = calls
    _CALLS_CACHE[clean_tenant] = {"timestamp": time.time(), "calls": calls}
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
