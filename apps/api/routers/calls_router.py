"""
Calls Router: Speech AI Auditing, 13 Evaluation Criteria, Google Sheets Sync, and Live Ingestion.
"""

from datetime import datetime
import json
import logging
import os
from pathlib import Path
import re
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.analytics_engine.speech_scoring import evaluate_speech_scorecard
from packages.database.models import CallRecording, Deal, User
from packages.database.session import get_db
from ..auth import get_current_user
from ..schemas import SpeechEvaluationRequest
from ..websocket_manager import manager
from ..tenant_registry import get_tenant_spreadsheet_id
from .deals_router import get_deals_lookup

logger = logging.getLogger("calls_router")

router = APIRouter(prefix="/calls", tags=["Speech AI & 13 Criteria Scorecard"])


class CallIngestPayload(BaseModel):
    id: Optional[str] = None
    deal_id: Optional[str] = None
    deal_title: Optional[str] = None
    client: Optional[str] = None
    manager: Optional[str] = None
    stage: Optional[str] = "Первичный контакт"
    duration_sec: Optional[int] = None
    duration: Optional[str] = None
    amount: Optional[str] = "500 000 ₽"
    score: Optional[int] = None
    status: Optional[str] = None
    status_label: Optional[str] = None
    risk_amount: Optional[str] = None
    next_step: Optional[int] = 1
    cr: Optional[List[int]] = None
    error_summary: Optional[str] = None
    recommendation: Optional[str] = None
    transcript: Optional[str] = None
    sync_to_sheets: bool = True
    tenant_id: str = "TNT-001"


# In-memory cache for live calls from Google Sheets keyed by tenant_id (TTL: 15s)
_CALLS_CACHE: Dict[str, Dict[str, Any]] = {}


def get_service_account_path() -> Optional[Path]:
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


def fetch_calls_from_sheets(tenant_id: str = "TNT-001", limit: int = 50) -> List[Dict[str, Any]]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    now = time.time()
    cached = _CALLS_CACHE.get(clean_tenant)
    if cached and (now - cached.get("timestamp", 0) < 15):
        return cached.get("calls", [])

    sa_path = get_service_account_path()
    if not sa_path:
        logger.warning(f"service_account.json not found, skipping Google Sheets fetch (tenant: {clean_tenant})")
        return cached.get("calls", []) if cached else []

    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        sheet_id = get_tenant_spreadsheet_id(clean_tenant)
        ss = gc.open_by_key(sheet_id)
        ws = ss.worksheet("raw_calls")
        rows = ws.get_all_values()
        if len(rows) < 2:
            empty_calls: List[Dict[str, Any]] = []
            _CALLS_CACHE[clean_tenant] = {"timestamp": now, "calls": empty_calls}
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
            transcript = r[30] if len(r) > 30 else ""

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
                "cr": cr_list,
                "error_summary": error_sum or "Анализ завершен ИИ",
                "recommendation": rec or "Следовать регламенту фиксации Next Step",
                "transcript": transcript or "Транскрипт отсутствует"
            })
            if len(calls) >= limit:
                break

        _CALLS_CACHE["calls"] = calls
        _CALLS_CACHE["timestamp"] = now
        return calls
    except Exception as e:
        logger.error(f"Error fetching calls from Google Sheets: {e}")
        return []


def append_call_to_sheets(payload: CallIngestPayload) -> bool:
    sa_path = get_service_account_path()
    if not sa_path:
        return False
    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        sheet_id = os.getenv("REVOPS_SPREADSHEET_ID", "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk")
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
            except:
                pass

        cr_list = payload.cr if payload.cr and len(payload.cr) == 13 else [1]*13
        total_score = payload.score if payload.score is not None else sum(cr_list)
        next_step_flag = payload.next_step if payload.next_step is not None else 1
        error_summary = payload.error_summary or ""
        ai_recommendation = payload.recommendation or ""
        transcript_text = payload.transcript or ""

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
            f"hash_{call_id}_{payload.tenant_id}",
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

        ws.append_row(row)
        # Invalidate cache so fresh calls appear immediately
        _CALLS_CACHE["timestamp"] = 0
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
    limit: int = Query(50)
):
    """
    Public dashboard endpoint: pulls real audited calls from Google Sheets (raw_calls)
    for specified client tenant, formatted for the web dashboard.
    """
    effective_tenant = (tenant_id or "TNT-001").strip().upper()
    calls = fetch_calls_from_sheets(tenant_id=effective_tenant, limit=limit)
    if not calls:
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
    payload: CallIngestPayload
):
    """
    Direct n8n Ingestion Webhook:
    1. Receives speech audit JSON from n8n / CRM / Telephony.
    2. Writes the 38-column row into Google Sheets (raw_calls).
    3. Broadcasts the call to all open web dashboard sessions via WebSocket.
    """
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
def force_sync_from_sheets(tenant_id: str = Query("TNT-001")):
    """Forces an immediate pull from Google Sheets raw_calls for given tenant."""
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    if clean_tenant in _CALLS_CACHE:
        _CALLS_CACHE[clean_tenant]["timestamp"] = 0
    calls = fetch_calls_from_sheets(tenant_id=clean_tenant, limit=100)
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
    eval_result = evaluate_speech_scorecard(req.scores, req.comments)

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
            deal.avg_call_score = eval_result.overall_score
            if eval_result.is_deal_at_risk:
                deal.is_at_risk = True
                deal.risk_reason = eval_result.risk_summary

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
