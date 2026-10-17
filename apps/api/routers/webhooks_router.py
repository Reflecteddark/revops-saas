"""
Webhooks API Router: Ingestion gateways for amoCRM and Bitrix24 events.
Processes deal status updates, SLA breaches, call events, and triggers real-time WebSocket broadcasts and Google Sheets sync.
"""

from datetime import datetime
import json
import logging
import os
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel

from ..websocket_manager import manager
from .calls_router import CallIngestPayload, append_call_to_sheets

logger = logging.getLogger("webhooks_router")

router = APIRouter(prefix="/webhooks", tags=["CRM Webhook Receivers"])


def parse_call_from_text(text: str, default_manager: str = "Менеджер", default_client: str = "Клиент") -> Dict[str, Any]:
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

@router.post("/amo-crm")
async def receive_amocrm_webhook(
    request: Request,
    signature: Optional[str] = Header(None, alias="X-Amo-Signature")
):
    """
    Receives incoming webhook notifications from amoCRM:
    - Lead stage updates
    - Incoming / Outgoing calls
    - Call audio notes and AI summaries
    Writes directly to Google Sheets raw_calls and pushes to web dashboard in real time.
    """
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

    org_id = body.get("org_id", "TNT-001") if isinstance(body, dict) else "TNT-001"
    
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
                cr=[1]*13,
                error_summary="Звонок принят из amoCRM",
                recommendation="Своевременная фиксация договоренностей",
                transcript=f"amoCRM звонок ID: {call_id}. Аудиозапись прикреплена к сделке #{entity_id}.",
                sync_to_sheets=True,
                tenant_id=org_id
            )

    # Direct custom integration from n8n / amoCRM
    if not is_call_event and isinstance(body, dict) and ("call_id" in body or "transcript" in body or "manager" in body):
        is_call_event = True
        c_text = body.get("transcript", body.get("amo_note_text", ""))
        parsed = parse_call_from_text(c_text, body.get("manager_name", "Менеджер"))
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
        await manager.broadcast("org_default", {"type": "new_call", "call": formatted})
        return {
            "status": "ok",
            "crm": "amoCRM",
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
        "source": "amo_crm",
        "crm_deal_id": deal_id,
        "raw_event": deal_data
    })
    await manager.broadcast("org_default", {
        "type": "deal_updated",
        "source": "amo_crm",
        "crm_deal_id": deal_id
    })

    return {
        "status": "ok",
        "crm": "amoCRM",
        "event": "deal_updated",
        "processed_deal": deal_id
    }


# ==========================================================================
# 2. Bitrix24 INBOUND WEBHOOK RECEIVER
# ==========================================================================

@router.post("/bitrix24")
async def receive_bitrix24_webhook(
    request: Request,
    token: Optional[str] = Header(None, alias="X-Bitrix-Token")
):
    """
    Receives incoming webhook notifications from Bitrix24 ONCRMACTIVITYADD & ONCRMDEALUPDATE.
    Parses phone call activities, scores speech criteria, appends to raw_calls, and updates UI live.
    """
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

    org_id = body.get("org_id", "TNT-001") if isinstance(body, dict) else "TNT-001"
    event_name = body.get("event", "") if isinstance(body, dict) else ""

    # Bitrix24 Activity Add / Call Completed
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
        await manager.broadcast("org_default", {"type": "new_call", "call": formatted})

        return {
            "status": "ok",
            "crm": "Bitrix24",
            "event": "call_recorded",
            "call_id": call_payload.id,
            "sheets_synced": sheets_ok
        }

    # Standard deal update in Bitrix24
    deal_id = str(data_fields.get("ID", body.get("id", "bx_unknown")))
    await manager.broadcast(org_id, {
        "type": "deal_updated",
        "source": "bitrix24",
        "crm_deal_id": deal_id,
        "raw_event": body
    })
    await manager.broadcast("org_default", {
        "type": "deal_updated",
        "source": "bitrix24",
        "crm_deal_id": deal_id
    })

    return {
        "status": "ok",
        "crm": "Bitrix24",
        "event": "deal_updated",
        "processed_deal": deal_id
    }


# ==========================================================================
# 3. SYNTHETIC TEST TRIGGER WEBHOOKS FOR E2E AUDIT
# ==========================================================================

@router.post("/test-amo")
async def test_amocrm_call_simulation():
    """Simulates a live incoming call audit from amoCRM."""
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
        tenant_id="TNT-001"
    )
    sheets_ok = append_call_to_sheets(payload)
    formatted = payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()
    await manager.broadcast("TNT-001", {"type": "new_call", "call": formatted})
    await manager.broadcast("org_default", {"type": "new_call", "call": formatted})
    return {"status": "ok", "source": "amoCRM_test", "call_id": call_id, "sheets_synced": sheets_ok}


@router.post("/test-b24")
async def test_bitrix24_call_simulation():
    """Simulates a live incoming call audit from Bitrix24."""
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
        tenant_id="TNT-001"
    )
    sheets_ok = append_call_to_sheets(payload)
    formatted = payload.model_dump() if hasattr(payload, 'model_dump') else payload.dict()
    await manager.broadcast("TNT-001", {"type": "new_call", "call": formatted})
    await manager.broadcast("org_default", {"type": "new_call", "call": formatted})
    return {"status": "ok", "source": "Bitrix24_test", "call_id": call_id, "sheets_synced": sheets_ok}
