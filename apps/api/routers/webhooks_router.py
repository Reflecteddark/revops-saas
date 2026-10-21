"""
Webhooks API Router: Multi-Tenant Ingestion Gateways for amoCRM, Bitrix24, and Telephony.
Processes deal status updates, SLA breaches, call events, writes to tenant Google Sheets,
and triggers real-time WebSocket broadcasts to client dashboards.
"""

import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Request
from pydantic import BaseModel

from ..websocket_manager import manager
from .calls_router import (
    CallIngestPayload,
    append_call_to_sheets,
    verify_internal_or_admin,
)

logger = logging.getLogger("webhooks_router")

router = APIRouter(prefix="/webhooks", tags=["CRM & Telephony Webhook Receivers"])

# Global tracker for the last incoming webhook (inspected in Admin UI)
LAST_INCOMING_WEBHOOK: dict[str, Any] = {
    "id": "wh_init",
    "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "provider": "system",
    "tenant_id": "TNT-001",
    "event": "initialized",
    "status": "success",
    "headers": {"content-type": "application/json"},
    "payload": {
        "status": "ready",
        "message": "Шлюз приёма вебхуков активен. Ожидание событий от телефонии (Mango, Zadarma, UIS) и CRM (amoCRM, Bitrix24)..."
    }
}

# Ring buffer of incoming webhooks (Dead Letter Queue & Inspection)
DLQ_SNAPSHOT_PATH = Path(__file__).resolve().parents[3] / "logs" / "webhooks_dlq_snapshot.json"


def _load_persisted_dlq() -> list[dict[str, Any]]:
    candidates = [
        DLQ_SNAPSHOT_PATH,
        Path("/opt/revops-saas/logs/webhooks_dlq_snapshot.json"),
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-saas" / "logs" / "webhooks_dlq_snapshot.json"
    ]
    for p in candidates:
        if p.exists():
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list) and data:
                        logger.info(f"Loaded {len(data)} persisted DLQ webhooks from {p}")
                        return data
            except Exception as e:
                logger.warning(f"Failed to load persisted DLQ from {p}: {e}")
    return [LAST_INCOMING_WEBHOOK]


def _save_persisted_dlq():
    paths = [DLQ_SNAPSHOT_PATH]
    if Path("/opt/revops-saas/logs").exists():
        paths.append(Path("/opt/revops-saas/logs/webhooks_dlq_snapshot.json"))

    for p in paths:
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            tmp = p.parent / f".tmp_dlq_{os.getpid()}_{time.time_ns()}.json"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(WEBHOOKS_HISTORY, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, p)
        except Exception as e:
            logger.error(f"Failed to persist DLQ snapshot to {p}: {e}")


WEBHOOKS_HISTORY: list[dict[str, Any]] = _load_persisted_dlq()
if WEBHOOKS_HISTORY:
    LAST_INCOMING_WEBHOOK = WEBHOOKS_HISTORY[0]
MAX_WEBHOOKS_HISTORY = 30


def record_incoming_webhook(
    provider: str,
    tenant_id: str,
    payload: Any,
    headers: dict[str, str] | None = None,
    event: str = "call_received",
    status: str = "queued"
) -> str:
    global LAST_INCOMING_WEBHOOK, WEBHOOKS_HISTORY
    clean_headers = {}
    if headers:
        for k, v in headers.items():
            if str(k).lower() in ("authorization", "x-revops-admin-key", "cookie"):
                clean_headers[k] = "***REDACTED***"
            else:
                clean_headers[k] = str(v)

    webhook_id = f"wh_{int(time.time())}_{os.urandom(3).hex()}"
    record = {
        "id": webhook_id,
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "provider": provider,
        "tenant_id": tenant_id,
        "event": event,
        "status": status,
        "headers": clean_headers,
        "payload": payload,
        "error_msg": None,
        "execution_time_ms": None,
        "sheets_synced": False
    }
    LAST_INCOMING_WEBHOOK = record
    WEBHOOKS_HISTORY.insert(0, record)
    if len(WEBHOOKS_HISTORY) > MAX_WEBHOOKS_HISTORY:
        WEBHOOKS_HISTORY.pop()
    _save_persisted_dlq()
    return webhook_id


def update_webhook_status(
    webhook_id: str,
    status: str,
    error_msg: str | None = None,
    execution_time_ms: float | None = None,
    sheets_synced: bool | None = None
):
    global WEBHOOKS_HISTORY, LAST_INCOMING_WEBHOOK
    for wh in WEBHOOKS_HISTORY:
        if wh.get("id") == webhook_id:
            wh["status"] = status
            if error_msg is not None:
                wh["error_msg"] = error_msg
            if execution_time_ms is not None:
                wh["execution_time_ms"] = execution_time_ms
            if sheets_synced is not None:
                wh["sheets_synced"] = sheets_synced
            break
    if LAST_INCOMING_WEBHOOK.get("id") == webhook_id:
        LAST_INCOMING_WEBHOOK["status"] = status
        if error_msg is not None:
            LAST_INCOMING_WEBHOOK["error_msg"] = error_msg
        if execution_time_ms is not None:
            LAST_INCOMING_WEBHOOK["execution_time_ms"] = execution_time_ms
        if sheets_synced is not None:
            LAST_INCOMING_WEBHOOK["sheets_synced"] = sheets_synced
    _save_persisted_dlq()





def resolve_webhook_tenant(
    request: Request,
    tenant_param: str | None = None,
    body: dict[str, Any] | None = None
) -> str:
    """Resolves target tenant_id from Path, Query param, Header, or Body."""
    # 1. From path parameter
    if tenant_param and tenant_param.strip():
        t = tenant_param.strip().upper()
        if not t.startswith("TNT-") and t.isdigit():
            t = f"TNT-{int(t):03d}"
        return t

    # 2. From query parameters ?tenant_id=... or ?tenant=...
    q_tenant = request.query_params.get("tenant_id") or request.query_params.get("tenant")
    if q_tenant and q_tenant.strip():
        return q_tenant.strip().upper()

    # 3. From custom headers
    h_tenant = request.headers.get("x-tenant-id") or request.headers.get("x-tenant")
    if h_tenant and h_tenant.strip():
        return h_tenant.strip().upper()

    # 4. From body payload org_id or tenant_id
    if isinstance(body, dict):
        b_tenant = body.get("tenant_id") or body.get("org_id")
        if b_tenant and str(b_tenant).strip():
            return str(b_tenant).strip().upper()

    # Fallback default master tenant
    return "TNT-001"


def verify_tenant_active(tenant_id: str):
    """Enforces tenant lifecycle state: rejects requests for archived or frozen tenants."""
    from ..tenant_registry import get_tenant_config
    cfg = get_tenant_config(tenant_id)
    if cfg:
        st = str(cfg.get("status", "active")).lower()
        if st in ("archived", "offboarded"):
            raise HTTPException(
                status_code=410,
                detail=f"Клиент {tenant_id} деактивирован / архивный (Offboarded). Приём данных остановлен."
            )
        if st in ("frozen", "blocked"):
            raise HTTPException(
                status_code=423,
                detail=f"Доступ клиента {tenant_id} временно заморожен (Frozen)."
            )


def parse_call_from_text(text: str, default_manager: str = "Менеджер", default_client: str = "Клиент") -> dict[str, Any]:
    """Helper to detect score and criteria from CRM note / transcription text."""
    score = 10
    cr = [1] * 13
    next_step = 1
    lower = text.lower()

    if "слив" in lower or "нет next step" in lower or "отказ" in lower:
        score = 6
        cr[0] = 0
        cr[6] = 0
        cr[11] = 0
        next_step = 0
    elif "эталон" in lower or "успешно" in lower or "договорились" in lower:
        score = 12
        cr = [1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1]
        next_step = 1

    return {
        "score": score,
        "cr": cr,
        "next_step": next_step,
        "status": "won" if next_step == 1 and score >= 10 else ("warn" if score >= 8 else "risk"),
        "status_label": "ЭТАЛОН" if score >= 10 else ("СЛИВ (НЕТ NEXT STEP)" if next_step == 0 else "В РАБОТЕ")
    }


# ==========================================================================
# 1. amoCRM INBOUND WEBHOOK RECEIVER
# ==========================================================================

async def _process_amocrm_webhook(request: Request, tenant_param: str | None = None):
    body = {}
    content_type = request.headers.get("content-type", "")
    try:
        if "application/json" in content_type:
            body = await request.json()
        elif "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            body = dict(form)
        else:
            raw = await request.body()
            body = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as e:
        logger.warning(f"Could not parse amoCRM webhook payload: {e}")
        body = {}

    org_id = resolve_webhook_tenant(request, tenant_param, body)
    verify_tenant_active(org_id)
    record_incoming_webhook("amocrm", org_id, body, dict(request.headers), event="amocrm_webhook")

    # 1. Check if amoCRM sent a call event or note
    is_call_event = False
    call_payload = None

    # amoCRM event list format
    events = body.get("events") if isinstance(body, dict) else None
    if isinstance(events, list) and events:
        ev = events[0]
        ev_type = ev.get("type", "")
        if "call" in ev_type:
            is_call_event = True
            call_id = f"amo_call_{ev.get('id', int(time.time()))}"
            entity_id = str(ev.get("entity_id", "amo_deal"))
            call_info = ev.get("value_after", {}).get("call", {}) if isinstance(ev.get("value_after"), dict) else {}
            dur_sec = int(call_info.get("duration", 120)) if str(call_info.get("duration", "")).isdigit() else 120

            call_payload = CallIngestPayload(
                id=call_id,
                deal_id=entity_id,
                deal_title=f"amoCRM Сделка #{entity_id}",
                manager="Дмитрий Федотов",
                client=call_info.get("phone", "Клиент amoCRM"),
                duration_sec=dur_sec,
                duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
                score=10,
                next_step=1,
                cr=[1] * 13,
                error_summary="Звонок принят из amoCRM",
                recommendation="Своевременная фиксация договоренностей",
                transcript=f"amoCRM звонок ID: {call_id}. Аудиозапись прикреплена к сделке #{entity_id}.",
                sync_to_sheets=True,
                tenant_id=org_id
            )

    # Direct custom integration from n8n / amoCRM
    if not is_call_event and isinstance(body, dict) and ("call_id" in body or "transcript" in body or "manager" in body):
        is_call_event = True
        c_text = str(body.get("transcript") or body.get("amo_note_text") or "")
        manager_str = str(body.get("manager_name") or "Менеджер")
        parsed = parse_call_from_text(c_text, manager_str)
        call_id = str(body.get("call_id", f"amo_{int(time.time())}"))
        deal_id = str(body.get("lead_id", body.get("deal_id", "amo_lead")))
        dur_sec = int(body.get("duration_sec", 135))

        call_payload = CallIngestPayload(
            id=call_id,
            deal_id=deal_id,
            deal_title=f"amoCRM Сделка #{deal_id}",
            manager=body.get("manager_name", body.get("manager", "Дмитрий Федотов")),
            client=body.get("client_name", body.get("client", "Клиент amoCRM")),
            duration_sec=dur_sec,
            duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
            score=body.get("score", parsed["score"]),
            status=parsed["status"],
            status_label=parsed["status_label"],
            next_step=body.get("next_step", parsed["next_step"]),
            cr=body.get("cr", parsed["cr"]),
            error_summary=body.get("key_mistakes", body.get("error_summary", "Аудит завершен")),
            recommendation=body.get("improvements", body.get("recommendation", "Следовать сценарию звонка")),
            transcript=c_text or f"Звонок amoCRM сделка #{deal_id}",
            sync_to_sheets=True,
            tenant_id=org_id
        )

    # If call event processed: append to Google Sheets & push to dashboard!
    if call_payload:
        sheets_ok = append_call_to_sheets(call_payload)
        formatted = {
            "id": call_payload.id,
            "deal_id": call_payload.deal_id,
            "deal_title": call_payload.deal_title,
            "client": call_payload.client,
            "manager": call_payload.manager,
            "stage": call_payload.stage,
            "duration": call_payload.duration,
            "amount": call_payload.amount,
            "score": call_payload.score,
            "status": call_payload.status,
            "status_label": call_payload.status_label,
            "risk_amount": call_payload.risk_amount or ("0 ₽" if call_payload.status == "won" else "500 000 ₽"),
            "next_step": call_payload.next_step,
            "cr": call_payload.cr,
            "error_summary": call_payload.error_summary,
            "recommendation": call_payload.recommendation,
            "transcript": call_payload.transcript
        }
        await manager.broadcast(org_id, {"type": "new_call", "call": formatted})
        return {
            "status": "ok",
            "crm": "amoCRM",
            "source": "amoCRM",
            "tenant_id": org_id,
            "event": "call_recorded",
            "call_id": call_payload.id,
            "sheets_synced": sheets_ok
        }

    # Otherwise treat as standard deal stage update
    leads_raw = body.get("leads") if isinstance(body, dict) else None
    deal_id = "amo_unknown"
    deal_data = {}
    if isinstance(leads_raw, dict):
        updates = leads_raw.get("update") or leads_raw.get("status") or [{}]
        if isinstance(updates, list) and updates:
            deal_data = updates[0]
            deal_id = str(deal_data.get("id", deal_id))
    elif isinstance(body, dict) and "id" in body:
        deal_id = str(body["id"])
        deal_data = body

    await manager.broadcast(org_id, {
        "type": "deal_updated",
        "tenant_id": org_id,
        "source": "amo_crm",
        "crm_deal_id": deal_id,
        "raw_event": deal_data
    })

    return {
        "status": "ok",
        "crm": "amoCRM",
        "source": "amoCRM",
        "tenant_id": org_id,
        "event": "deal_updated",
        "processed_deal": deal_id
    }


@router.post("/amo-crm")
async def receive_amocrm_webhook(
    request: Request,
    signature: str | None = Header(None, alias="X-Amo-Signature")
):
    """Receives incoming webhook notifications from amoCRM (Legacy URL)."""
    return await _process_amocrm_webhook(request, None)


@router.post("/{tenant_id}/amo-crm")
async def receive_amocrm_webhook_tenant(
    tenant_id: str,
    request: Request,
    signature: str | None = Header(None, alias="X-Amo-Signature")
):
    """Receives incoming webhook notifications scoped to specific tenant ID."""
    return await _process_amocrm_webhook(request, tenant_id)


# ==========================================================================
# 2. Bitrix24 INBOUND WEBHOOK RECEIVER
# ==========================================================================

async def _process_bitrix24_webhook(request: Request, tenant_param: str | None = None):
    body = {}
    content_type = request.headers.get("content-type", "")
    try:
        if "application/json" in content_type:
            body = await request.json()
        elif "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            body = dict(form)
        else:
            raw = await request.body()
            body = json.loads(raw.decode("utf-8")) if raw else {}
    except Exception as e:
        logger.warning(f"Could not parse Bitrix24 webhook payload: {e}")
        body = {}

    org_id = resolve_webhook_tenant(request, tenant_param, body)
    verify_tenant_active(org_id)
    record_incoming_webhook("bitrix24", org_id, body, dict(request.headers), event="bitrix24_webhook")

    event_name = body.get("event", "") if isinstance(body, dict) else ""
    data_fields = body.get("data", {}).get("FIELDS", {}) if isinstance(body.get("data"), dict) else {}
    provider_id = data_fields.get("PROVIDER_TYPE_ID", "")
    type_id = str(data_fields.get("TYPE_ID", ""))

    # If call activity in Bitrix24 (PROVIDER_TYPE_ID=CALL or TYPE_ID=2)
    if "CALL" in provider_id or type_id == "2" or "call" in event_name.lower():
        act_id = str(data_fields.get("ID", f"b24_act_{int(time.time())}"))
        deal_id = str(data_fields.get("OWNER_ID", f"B24-{act_id}"))
        desc = data_fields.get("DESCRIPTION", "") or data_fields.get("SUBJECT", "Звонок Битрикс24")
        dur_sec = int(data_fields.get("DURATION", 140)) if str(data_fields.get("DURATION", "")).isdigit() else 140

        parsed = parse_call_from_text(desc, "Алексей Смирнов")
        call_payload = CallIngestPayload(
            id=f"b24_activity_{act_id}",
            deal_id=f"B24-{deal_id}",
            deal_title=f"Bitrix24 Кейс #{deal_id}: {data_fields.get('SUBJECT', 'Сопровождение сделки')}",
            manager="Алексей Смирнов",
            client="Клиент Битрикс24",
            duration_sec=dur_sec,
            duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
            score=parsed["score"],
            status=parsed["status"],
            status_label=parsed["status_label"],
            next_step=parsed["next_step"],
            cr=parsed["cr"],
            error_summary=desc[:80] if desc else "Звонок зафиксирован в CRM",
            recommendation="Фиксировать точное время следующего Zoom-контакта",
            transcript=desc or f"Аудиозапись Битрикс24 активность #{act_id}.",
            sync_to_sheets=True,
            tenant_id=org_id
        )

        sheets_ok = append_call_to_sheets(call_payload)
        formatted = {
            "id": call_payload.id,
            "deal_id": call_payload.deal_id,
            "deal_title": call_payload.deal_title,
            "client": call_payload.client,
            "manager": call_payload.manager,
            "stage": call_payload.stage,
            "duration": call_payload.duration,
            "amount": call_payload.amount,
            "score": call_payload.score,
            "status": call_payload.status,
            "status_label": call_payload.status_label,
            "risk_amount": "0 ₽" if call_payload.status == "won" else "500 000 ₽",
            "next_step": call_payload.next_step,
            "cr": call_payload.cr,
            "error_summary": call_payload.error_summary,
            "recommendation": call_payload.recommendation,
            "transcript": call_payload.transcript
        }
        await manager.broadcast(org_id, {"type": "new_call", "call": formatted})

        return {
            "status": "ok",
            "crm": "Bitrix24",
            "source": "Bitrix24",
            "tenant_id": org_id,
            "event": "call_recorded",
            "call_id": call_payload.id,
            "sheets_synced": sheets_ok
        }

    # Standard deal update in Bitrix24
    deal_id = str(data_fields.get("ID", body.get("id", "bx_unknown")))
    await manager.broadcast(org_id, {
        "type": "deal_updated",
        "tenant_id": org_id,
        "source": "bitrix24",
        "crm_deal_id": deal_id,
        "raw_event": body
    })

    return {
        "status": "ok",
        "crm": "Bitrix24",
        "source": "Bitrix24",
        "tenant_id": org_id,
        "event": "deal_updated",
        "processed_deal": deal_id
    }


@router.post("/bitrix24")
async def receive_bitrix24_webhook(
    request: Request,
    token: str | None = Header(None, alias="X-Bitrix-Token")
):
    """Receives incoming webhook notifications from Bitrix24 (Legacy URL)."""
    return await _process_bitrix24_webhook(request, None)


@router.post("/{tenant_id}/bitrix24")
async def receive_bitrix24_webhook_tenant(
    tenant_id: str,
    request: Request,
    token: str | None = Header(None, alias="X-Bitrix-Token")
):
    """Receives incoming webhook notifications from Bitrix24 scoped to tenant."""
    return await _process_bitrix24_webhook(request, tenant_id)


# ==========================================================================
# 3. UNIVERSAL TELEPHONY & AUDIT CALL INGESTION GATEWAY
# ==========================================================================

class UniversalCallPayload(BaseModel):
    call_id: str | None = None
    deal_id: str | None = None
    deal_title: str | None = None
    client_name: str | None = None
    manager_name: str | None = None
    duration_sec: int | None = 120
    amount: str | None = "300 000 ₽"
    score: int | None = None
    next_step: int | None = None
    cr: list[int] | None = None
    error_summary: str | None = None
    recommendation: str | None = None
    transcript: str | None = None
    tenant_id: str | None = None


async def _execute_telephony_background(
    call_payload: CallIngestPayload,
    org_id: str,
    webhook_id: str,
    t_start: float
):
    """Executes heavy Google Sheets writes and WebSocket broadcasts asynchronously in the background."""
    try:
        sheets_ok = append_call_to_sheets(call_payload)
        formatted = call_payload.model_dump() if hasattr(call_payload, "model_dump") else call_payload.dict()
        await manager.broadcast(org_id, {"type": "new_call", "call": formatted})
        elapsed = round((time.time() - t_start) * 1000, 1)
        update_webhook_status(webhook_id, status="success", execution_time_ms=elapsed, sheets_synced=sheets_ok)
        logger.info(f"Telephony call {call_payload.id} successfully processed in background in {elapsed}ms (sheets={sheets_ok})")
    except Exception as ex:
        elapsed = round((time.time() - t_start) * 1000, 1)
        logger.error(f"Error in background telephony processing for call {call_payload.id}: {ex}")
        update_webhook_status(webhook_id, status="error", error_msg=str(ex), execution_time_ms=elapsed)


async def _process_telephony_call(
    request: Request,
    tenant_param: str | None = None,
    background_tasks: BackgroundTasks | None = None
):
    """
    Universal gateway for Mango Office, Zadarma, Sipuni, Asterisk, and n8n.
    Responds with HTTP 200 within <50ms, queuing AI scoring and Google Sheets sync
    in FastAPI BackgroundTasks to eliminate telephony provider timeouts.
    """
    t_start = time.time()
    try:
        body = await request.json()
    except Exception:
        body = {}

    org_id = resolve_webhook_tenant(request, tenant_param, body)
    verify_tenant_active(org_id)

    provider_name = body.get("provider") or body.get("telephony_provider") or "telephony"
    webhook_id = record_incoming_webhook(provider_name, org_id, body, dict(request.headers), event="telephony_call", status="queued")

    call_id = str(body.get("call_id") or body.get("id") or f"call_{int(time.time())}")
    deal_id = str(body.get("deal_id") or f"D-{int(time.time()) % 10000}")
    transcript = body.get("transcript") or ""
    parsed = parse_call_from_text(transcript, body.get("manager_name", "Менеджер"))

    dur_sec = int(body.get("duration_sec", 120))
    score = int(body.get("score")) if body.get("score") is not None else parsed["score"]
    next_step = int(body.get("next_step")) if body.get("next_step") is not None else parsed["next_step"]
    cr = body.get("cr") if body.get("cr") and len(body.get("cr")) == 13 else parsed["cr"]

    call_payload = CallIngestPayload(
        id=call_id,
        deal_id=deal_id,
        deal_title=body.get("deal_title") or f"Сделка #{deal_id}",
        manager=body.get("manager_name") or body.get("manager") or "Дмитрий Федотов",
        client=body.get("client_name") or body.get("client") or "Клиент телефонии",
        duration_sec=dur_sec,
        duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
        amount=body.get("amount") or "300 000 ₽",
        score=score,
        status="won" if next_step == 1 and score >= 10 else ("warn" if score >= 8 else "risk"),
        status_label="ЭТАЛОН" if score >= 10 else ("СЛИВ (НЕТ NEXT STEP)" if next_step == 0 else "В РАБОТЕ"),
        next_step=next_step,
        cr=cr,
        error_summary=body.get("error_summary") or "Аудит завершен ИИ",
        recommendation=body.get("recommendation") or "Следовать регламенту фиксации Next Step",
        transcript=transcript or "Транскрипт аудиозаписи",
        sync_to_sheets=True,
        tenant_id=org_id
    )

    call_dict = call_payload.model_dump() if hasattr(call_payload, "model_dump") else call_payload.dict()
    task_id = None
    queue_driver = "celery"

    # 1. Attempt asynchronous dispatch to Celery broker (Redis queue)
    try:
        from workers.tasks import process_call_audio_task
        task = process_call_audio_task.delay(call_dict, org_id, webhook_id, t_start)
        task_id = task.id
    except Exception as broker_err:
        # 2. Antifragile fallback to in-process BackgroundTasks if Redis broker is offline
        queue_driver = "background_tasks"
        logger.debug(f"Celery dispatch fallback to BackgroundTasks: {broker_err}")
        if background_tasks:
            background_tasks.add_task(_execute_telephony_background, call_payload, org_id, webhook_id, t_start)
            task_id = f"bg_{int(time.time()*1000)}"
        else:
            await _execute_telephony_background(call_payload, org_id, webhook_id, t_start)
            task_id = f"sync_{int(time.time()*1000)}"

    response_time_ms = round((time.time() - t_start) * 1000, 2)
    return {
        "status": "queued",
        "message": "Вебхук принят и поставлен в очередь асинхронной обработки (Zero-Timeout)",
        "tenant_id": org_id,
        "call_id": call_id,
        "webhook_id": webhook_id,
        "task_id": task_id,
        "queue_driver": queue_driver,
        "score": score,
        "next_step": next_step,
        "ack_latency_ms": response_time_ms
    }


@router.post("/call")
async def receive_telephony_call(request: Request, background_tasks: BackgroundTasks):
    """Universal Telephony receiver endpoint (queued with BackgroundTasks, <50ms response)."""
    return await _process_telephony_call(request, None, background_tasks)


@router.post("/{tenant_id}/call")
async def receive_telephony_call_scoped(tenant_id: str, request: Request, background_tasks: BackgroundTasks):
    """Universal Telephony receiver scoped to specific tenant in URL."""
    return await _process_telephony_call(request, tenant_id, background_tasks)



# ==========================================================================
# 4. SYNTHETIC TEST TRIGGER WEBHOOKS FOR E2E AUDIT
# ==========================================================================

@router.post("/test-amo")
@router.post("/{tenant_id}/test-amo")
async def test_amocrm_call_simulation(request: Request, tenant_id: str | None = "TNT-001"):
    """Simulates a live incoming call audit from amoCRM for any tenant."""
    verify_internal_or_admin(request)
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    call_id = f"amo_test_{int(time.time())}"
    payload = CallIngestPayload(
        id=call_id,
        deal_id="30045512",
        deal_title="amoCRM Сделка #30045512: Речевая аналитика",
        client="ООО Прогресс (Николай)",
        manager="Дмитрий Федотов",
        stage="Первичный контакт",
        duration_sec=165,
        duration="2:45",
        amount="500 000 ₽",
        score=11,
        status="won",
        status_label="ЭТАЛОН",
        risk_amount="0 ₽",
        next_step=1,
        cr=[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
        error_summary="Незначительная заминка при презентации SLA",
        recommendation="Отличная фиксация Zoom-разбора на четверг 14:00",
        transcript="Менеджер: Николай, добрый день! Согласуем пилот речевой аналитики на четверг в 14:00? Клиент: Да, в четверг в 14:00 отлично.",
        sync_to_sheets=True,
        tenant_id=clean_tenant
    )
    sheets_ok = append_call_to_sheets(payload)
    formatted = payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()
    await manager.broadcast(clean_tenant, {"type": "new_call", "call": formatted})
    record_incoming_webhook("amocrm_simulation", clean_tenant, formatted, event="test_call_simulation")
    return {"status": "ok", "tenant_id": clean_tenant, "source": "amoCRM_test", "call_id": call_id, "sheets_synced": sheets_ok}


@router.post("/test-b24")
@router.post("/{tenant_id}/test-b24")
async def test_bitrix24_call_simulation(request: Request, tenant_id: str | None = "TNT-001"):
    """Simulates a live incoming call audit from Bitrix24 for any tenant."""
    verify_internal_or_admin(request)
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    call_id = f"b24_test_{int(time.time())}"
    payload = CallIngestPayload(
        id=call_id,
        deal_id="B24-110",
        deal_title="Bitrix24 Кейс 03: Внедрение B2B RevOps OS",
        client="ПАО СпецТранс (Олег)",
        manager="Алексей Смирнов",
        stage="Первичный контакт",
        duration_sec=195,
        duration="3:15",
        amount="500 000 ₽",
        score=12,
        status="won",
        status_label="ЭТАЛОН",
        risk_amount="0 ₽",
        next_step=1,
        cr=[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        error_summary="Ошибок нет. Эталонный скрипт закрытия на следующий шаг.",
        recommendation="Подготовить КП с разбивкой оплат 50 на 50 до пятницы.",
        transcript="Менеджер: Олег, здравствуйте! Давайте зафиксируем время созвона с РОПом. Клиент: Согласен, давайте завтра в 11:00.",
        sync_to_sheets=True,
        tenant_id=clean_tenant
    )
    sheets_ok = append_call_to_sheets(payload)
    formatted = payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()
    await manager.broadcast(clean_tenant, {"type": "new_call", "call": formatted})
    record_incoming_webhook("bitrix24_simulation", clean_tenant, formatted, event="test_call_simulation")
    return {"status": "ok", "tenant_id": clean_tenant, "source": "Bitrix24_test", "call_id": call_id, "sheets_synced": sheets_ok}


@router.get("/last-incoming")
def get_last_incoming_webhook():
    """Returns the most recent incoming webhook payload for live debugging in the Admin UI."""
    return LAST_INCOMING_WEBHOOK


@router.get("/history")
def get_webhooks_history(limit: int = 15):
    """Returns the ring buffer of recent incoming webhooks for the Dead Letter Queue (DLQ) inspector."""
    return {
        "status": "ok",
        "total": len(WEBHOOKS_HISTORY),
        "history": WEBHOOKS_HISTORY[:limit]
    }


@router.post("/{webhook_id}/replay")
async def replay_webhook(
    webhook_id: str,
    background_tasks: BackgroundTasks
):
    """
    Replays a specific webhook from history or Dead Letter Queue (DLQ).
    Re-ingests the payload through the standard processing pipeline.
    """
    target = None
    for wh in WEBHOOKS_HISTORY:
        if wh.get("id") == webhook_id:
            target = wh
            break

    if not target:
        raise HTTPException(status_code=404, detail=f"Вебхук с ID '{webhook_id}' не найден в очереди истории.")

    raw_payload = target.get("payload", {})
    provider = target.get("provider", "telephony")
    org_id = target.get("tenant_id", "TNT-001")

    # Clone payload for replaying
    if isinstance(raw_payload, dict):
        replay_payload = dict(raw_payload)
    else:
        replay_payload = {"raw": str(raw_payload)}

    replay_payload["call_id"] = f"replay_{int(time.time())}_{target.get('id', 'wh')[:8]}"
    replay_payload["replayed_from"] = webhook_id

    # Record replay
    new_wh_id = record_incoming_webhook(
        provider=f"{provider}_replay",
        tenant_id=org_id,
        payload=replay_payload,
        event=f"replay_{target.get('event', 'call')}",
        status="queued"
    )

    call_id = replay_payload["call_id"]
    deal_id = str(replay_payload.get("deal_id") or f"D-REPLAY-{int(time.time()) % 1000}")
    transcript = str(replay_payload.get("transcript") or "Повторная обработка архивного звонка")
    manager_name = str(replay_payload.get("manager_name") or "Менеджер")
    parsed = parse_call_from_text(transcript, manager_name)

    dur_sec = int(replay_payload.get("duration_sec", 120))
    raw_score = replay_payload.get("score")
    score = int(raw_score) if raw_score is not None else int(parsed["score"])
    raw_next_step = replay_payload.get("next_step")
    next_step = int(raw_next_step) if raw_next_step is not None else int(parsed["next_step"])
    raw_cr = replay_payload.get("cr")
    cr = raw_cr if isinstance(raw_cr, list) and len(raw_cr) == 13 else parsed["cr"]

    call_payload = CallIngestPayload(
        id=call_id,
        deal_id=deal_id,
        deal_title=replay_payload.get("deal_title") or f"Повторный аудит #{call_id}",
        manager=replay_payload.get("manager_name") or replay_payload.get("manager") or "Дмитрий Федотов",
        client=replay_payload.get("client_name") or replay_payload.get("client") or "Клиент",
        duration_sec=dur_sec,
        duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
        amount=replay_payload.get("amount") or "300 000 ₽",
        score=score,
        status="won" if next_step == 1 and score >= 10 else ("warn" if score >= 8 else "risk"),
        status_label="ЭТАЛОН" if score >= 10 else ("СЛИВ (НЕТ NEXT STEP)" if next_step == 0 else "В РАБОТЕ"),
        next_step=next_step,
        cr=cr,
        error_summary=replay_payload.get("error_summary") or "Повторный прогон через очередь DLQ",
        recommendation=replay_payload.get("recommendation") or "Проверено",
        transcript=transcript,
        sync_to_sheets=True,
        tenant_id=org_id
    )

    t_start = time.time()
    background_tasks.add_task(_execute_telephony_background, call_payload, org_id, new_wh_id, t_start)

    return {
        "status": "queued",
        "message": f"Вебхук {webhook_id} успешно отправлен на повторную обработку (Replay ID: {new_wh_id})",
        "replayed_id": webhook_id,
        "new_webhook_id": new_wh_id,
        "tenant_id": org_id,
        "call_id": call_id
    }


