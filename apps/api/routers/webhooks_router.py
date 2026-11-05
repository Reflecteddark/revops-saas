"""
Webhooks API Router: Multi-Tenant Ingestion Gateways for amoCRM, Bitrix24, and Telephony.
Processes deal status updates, SLA breaches, call events, writes to tenant Google Sheets,
and triggers real-time WebSocket broadcasts to client dashboards.
"""

import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from ..services.call_scorecard import valid_cr
from ..services.crm_deal_normalizer import (
    normalize_amocrm_deal,
    normalize_bitrix24_deal,
)
from ..websocket_manager import manager
from .calls_router import (
    CallIngestPayload,
    append_call_to_sheets,
    call_view,
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
    """Resolves target tenant_id from Path or Header only."""
    # 1. From path parameter
    if tenant_param and tenant_param.strip():
        t = tenant_param.strip().upper()
        if not t.startswith("TNT-") and t.isdigit():
            t = f"TNT-{int(t):03d}"
        return t

    # 2. From custom headers
    h_tenant = request.headers.get("x-tenant-id") or request.headers.get("x-tenant")
    if h_tenant and h_tenant.strip():
        return h_tenant.strip().upper()

    # Fallback default master tenant
    return "TNT-001"


def verify_tenant_active(tenant_id: str):
    """Enforces tenant lifecycle state: rejects requests for unknown, archived or frozen tenants."""
    from ..tenant_registry import get_tenant_config
    cfg = get_tenant_config(tenant_id)
    if not cfg:
        raise HTTPException(
            status_code=404,
            detail=f"Тенант {tenant_id} не найден в реестре"
        )
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

    # Validate security: internal IP / admin key OR amoCRM HMAC-SHA256 signature
    is_internal = False
    try:
        is_internal = verify_internal_or_admin(request)
    except HTTPException:
        is_internal = False

    if not is_internal:
        from ..tenant_registry import get_tenant_config
        cfg = get_tenant_config(org_id)
        secret = (cfg.get("amo_secret") or cfg.get("amo_webhook_secret") or cfg.get("amo_token")) if cfg else None
        signature = request.headers.get("x-amo-signature")
        if signature and secret:
            raw_body = await request.body()
            expected_sig = hmac.new(str(secret).encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected_sig.lower(), signature.lower()):
                raise HTTPException(status_code=403, detail="Invalid X-Amo-Signature")
        elif not tenant_param and not signature:
            if not secret:
                raise HTTPException(status_code=403, detail="AmoCRM webhook secret not configured for tenant")
            raise HTTPException(status_code=403, detail="X-Amo-Signature header missing")

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
            entity_id = str(ev.get("entity_id") or "")
            call_info = ev.get("value_after", {}).get("call", {}) if isinstance(ev.get("value_after"), dict) else {}
            raw_duration = str(call_info.get("duration", ""))
            dur_sec = int(raw_duration) if raw_duration.isdigit() else 0

            call_payload = CallIngestPayload(
                id=call_id,
                deal_id=entity_id,
                deal_title=f"amoCRM Сделка #{entity_id}",
                client=call_info.get("phone", ""),
                duration_sec=dur_sec,
                duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
                score=None,
                next_step=None,
                cr=None,
                sync_to_sheets=True,
                tenant_id=org_id
            )

    # Direct custom integration from n8n / amoCRM
    cr_arg = None
    if not is_call_event and isinstance(body, dict) and ("call_id" in body or "transcript" in body or "manager" in body):
        is_call_event = True
        c_text = str(body.get("transcript") or body.get("amo_note_text") or "")
        call_id = str(body.get("call_id", f"amo_{int(time.time())}"))
        deal_id = str(body.get("lead_id") or body.get("deal_id") or "")
        dur_sec = int(body.get("duration_sec") or 0)

        cr_arg = body.get("cr")
        safe_cr_payload = cr_arg if valid_cr(cr_arg) else None

        call_payload = CallIngestPayload(
            id=call_id,
            deal_id=deal_id,
            deal_title=f"amoCRM Сделка #{deal_id}",
            manager=body.get("manager_name", body.get("manager", "")),
            client=body.get("client_name", body.get("client", "")),
            duration_sec=dur_sec,
            duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
            score=body.get("score"),
            next_step=body.get("next_step"),
            cr=safe_cr_payload,
            error_summary=body.get("key_mistakes", body.get("error_summary", "")),
            recommendation=body.get("improvements", body.get("recommendation", "")),
            transcript=c_text,
            sync_to_sheets=True,
            tenant_id=org_id
        )

    # If call event processed: append to Google Sheets & push to dashboard!
    if call_payload:
        sheets_ok = append_call_to_sheets(call_payload)
        view = call_view(call_payload)

        formatted = {
            "id": call_payload.id,
            "deal_id": call_payload.deal_id,
            "deal_title": call_payload.deal_title,
            "client": call_payload.client,
            "manager": call_payload.manager,
            "stage": call_payload.stage,
            "duration": call_payload.duration,
            "amount": call_payload.amount,
            "score": view["score"],
            "status": view["status"],
            "status_label": view["status_label"],
            "risk_amount": view["risk_amount"],
            "next_step": view["next_step"],
            "cr": view["cr"],
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

    # Otherwise treat as standard deal stage update or delete event
    leads_raw = body.get("leads") if isinstance(body, dict) else None
    processed_deals = []

    if isinstance(leads_raw, dict):
        # 1. Handle delete events: leads[delete]
        deleted_leads = leads_raw.get("delete") or []
        for d in deleted_leads:
            raw_id = str(d.get("id") or "").strip()
            if not raw_id:
                continue
            deal_id = raw_id if raw_id.startswith("AMO-") else f"AMO-{raw_id}"
            now_iso = datetime.now(timezone.utc).isoformat()
            await manager.broadcast(org_id, {
                "type": "deal_deleted",
                "tenant_id": org_id,
                "source": "amocrm",
                "crm_deal_id": deal_id,
                "deleted_at": now_iso
            })
            processed_deals.append({"deal_id": deal_id, "status": "DELETED"})
            try:
                from packages.database.session import SessionLocal
                from packages.database.models import Deal
                with SessionLocal() as db_wh:
                    db_d = db_wh.query(Deal).filter((Deal.tenant_id == org_id) & ((Deal.id == deal_id) | (Deal.external_crm_id == deal_id))).first()
                    if db_d:
                        setattr(db_d, "is_deleted", True)
                        setattr(db_d, "status", "DELETED")
                        db_wh.commit()
            except Exception as e_del:
                logger.warning(f"Failed to soft-delete deal {deal_id} in DB: {e_del}")

        # 2. Handle add, update, status events
        for evt in ("add", "update", "status"):
            evt_leads = leads_raw.get(evt) or []
            for d in evt_leads:
                try:
                    norm = normalize_amocrm_deal(d, org_id)
                    await manager.broadcast(org_id, {
                        "type": "deal_updated",
                        "tenant_id": org_id,
                        "source": "amocrm",
                        "crm_deal_id": norm["deal_id"],
                        "deal": norm
                    })
                    processed_deals.append(norm)
                except Exception as ex:
                    logger.warning(f"Failed to normalize amoCRM lead webhook: {ex}")
    elif isinstance(body, dict) and "id" in body:
        norm = normalize_amocrm_deal(body, org_id)
        await manager.broadcast(org_id, {
            "type": "deal_updated",
            "tenant_id": org_id,
            "source": "amocrm",
            "crm_deal_id": norm["deal_id"],
            "deal": norm
        })
        processed_deals.append(norm)

    # Persist all newly processed deals to PostgreSQL
    if processed_deals:
        active_deals = [d for d in processed_deals if d.get("status") != "DELETED"]
        if active_deals:
            try:
                from ..services.crm_deals_sync import sync_deals_to_database
                from packages.database.session import SessionLocal
                with SessionLocal() as db_wh:
                    sync_deals_to_database(org_id, active_deals, db_wh)
            except Exception as e_db:
                logger.warning(f"Failed to persist webhook deals to DB: {e_db}")

    primary_id = processed_deals[0].get("deal_id") if processed_deals else "amo_unknown"
    return {
        "status": "ok",
        "crm": "amoCRM",
        "source": "amoCRM",
        "tenant_id": org_id,
        "event": "deals_processed",
        "processed_count": len(processed_deals),
        "processed_deal": primary_id,
        "deals": processed_deals
    }



@router.post("/amo-crm")
@router.post("/amocrm")
async def receive_amocrm_webhook(
    request: Request,
    signature: str | None = Header(None, alias="X-Amo-Signature")
):
    """Receives incoming webhook notifications from amoCRM (Legacy URL)."""
    return await _process_amocrm_webhook(request, None)


@router.post("/{tenant_id}/amo-crm")
@router.post("/{tenant_id}/amocrm")
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

    # Validate security: internal IP / admin key OR Bitrix24 token
    is_internal = False
    try:
        is_internal = verify_internal_or_admin(request)
    except HTTPException:
        is_internal = False

    if not is_internal:
        from ..tenant_registry import get_tenant_config
        cfg = get_tenant_config(org_id)
        expected_token = (cfg.get("bitrix_token") or cfg.get("bitrix_webhook_token") or cfg.get("bitrix_auth_token")) if cfg else None
        if not expected_token:
            raise HTTPException(status_code=403, detail="Bitrix24 webhook token not configured for tenant")
        token_header = request.headers.get("x-bitrix-token")
        if not token_header or not hmac.compare_digest(token_header, str(expected_token)):
            raise HTTPException(status_code=403, detail="Invalid X-Bitrix-Token")

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
        raw_duration = str(data_fields.get("DURATION", ""))
        dur_sec = int(raw_duration) if raw_duration.isdigit() else 0

        call_payload = CallIngestPayload(
            id=f"b24_activity_{act_id}",
            deal_id=f"B24-{deal_id}",
            deal_title=f"Bitrix24 Кейс #{deal_id}: {data_fields.get('SUBJECT', 'Сопровождение сделки')}",
            duration_sec=dur_sec,
            duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
            error_summary=desc[:80] if desc else "",
            transcript=desc,
            sync_to_sheets=True,
            tenant_id=org_id
        )

        sheets_ok = append_call_to_sheets(call_payload)
        view = call_view(call_payload)

        formatted = {
            "id": call_payload.id,
            "deal_id": call_payload.deal_id,
            "deal_title": call_payload.deal_title,
            "client": call_payload.client,
            "manager": call_payload.manager,
            "stage": call_payload.stage,
            "duration": call_payload.duration,
            "amount": call_payload.amount,
            "score": view["score"],
            "status": view["status"],
            "status_label": view["status_label"],
            "risk_amount": view["risk_amount"],
            "next_step": view["next_step"],
            "cr": view["cr"],
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

    # Standard deal update or delete in Bitrix24
    fields = data_fields or body.get("FIELDS") or (body if "ID" in body else {})
    event_upper = str(event_name or body.get("event") or "").upper()

    # 1. Soft-delete on ONCRMDEALDELETE
    if "DEALDELETE" in event_upper or "DELETE" in event_upper:
        raw_id = str(fields.get("ID") or body.get("id") or "bx_unknown")
        deal_id = raw_id if raw_id.startswith("B24-") else f"B24-{raw_id}"
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            from packages.database.session import SessionLocal
            from packages.database.models import Deal
            with SessionLocal() as db_wh:
                db_d = db_wh.query(Deal).filter((Deal.tenant_id == org_id) & ((Deal.id == deal_id) | (Deal.external_crm_id == deal_id))).first()
                if db_d:
                    setattr(db_d, "is_deleted", True)
                    setattr(db_d, "status", "DELETED")
                    db_wh.commit()
        except Exception as e_del:
            logger.warning(f"Failed to soft-delete Bitrix24 deal {deal_id} in DB: {e_del}")

        await manager.broadcast(org_id, {
            "type": "deal_deleted",
            "tenant_id": org_id,
            "source": "bitrix24",
            "crm_deal_id": deal_id,
            "deleted_at": now_iso
        })
        return {
            "status": "ok",
            "crm": "Bitrix24",
            "source": "Bitrix24",
            "tenant_id": org_id,
            "event": "deal_deleted",
            "processed_deal": deal_id
        }

    # 2. Add / Update: normalize, persist to DB, and broadcast
    try:
        norm_deal = normalize_bitrix24_deal(fields, org_id)
        try:
            from ..services.crm_deals_sync import sync_deals_to_database
            from packages.database.session import SessionLocal
            with SessionLocal() as db_wh:
                sync_deals_to_database(org_id, [norm_deal], db_wh)
        except Exception as e_db:
            logger.warning(f"Failed to persist Bitrix24 webhook deal to DB: {e_db}")

        await manager.broadcast(org_id, {
            "type": "deal_updated",
            "tenant_id": org_id,
            "source": "bitrix24",
            "crm_deal_id": norm_deal["deal_id"],
            "deal": norm_deal,
            "raw_event": body
        })
        return {
            "status": "ok",
            "crm": "Bitrix24",
            "source": "Bitrix24",
            "tenant_id": org_id,
            "event": "deal_updated",
            "processed_deal": norm_deal["deal_id"],
            "amount": norm_deal["amount"],
            "stage": norm_deal["stage_name"]
        }
    except Exception as ex:
        deal_id = str(fields.get("ID", body.get("id", "bx_unknown")))
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
    duration_sec: int | None = None
    amount: str | None = None
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
    verify_internal_or_admin(request)
    try:
        body = await request.json()
    except Exception:
        body = {}

    org_id = resolve_webhook_tenant(request, tenant_param, body)
    verify_tenant_active(org_id)

    provider_name = body.get("provider") or body.get("telephony_provider") or "telephony"
    webhook_id = record_incoming_webhook(provider_name, org_id, body, dict(request.headers), event="telephony_call", status="queued")

    call_id = str(body.get("call_id") or body.get("id") or f"call_{int(time.time())}")
    deal_id = str(body.get("deal_id") or "")
    transcript = body.get("transcript") or ""

    dur_sec = int(body.get("duration_sec") or 0)
    score = int(body.get("score")) if body.get("score") is not None else None
    next_step = int(body.get("next_step")) if body.get("next_step") is not None else None
    cr = body.get("cr") if body.get("cr") and len(body.get("cr")) == 13 else None
    safe_cr_payload = cr if valid_cr(cr) else None

    call_payload = CallIngestPayload(
        id=call_id,
        deal_id=deal_id,
        deal_title=body.get("deal_title") or f"Сделка #{deal_id}",
        manager=body.get("manager_name") or body.get("manager") or "",
        client=body.get("client_name") or body.get("client") or "",
        duration_sec=dur_sec,
        duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
        amount=body.get("amount"),
        score=score,
        next_step=next_step,
        cr=safe_cr_payload,
        error_summary=body.get("error_summary") or "",
        recommendation=body.get("recommendation") or "",
        transcript=transcript,
        sync_to_sheets=True,
        tenant_id=org_id
    )

    call_dict = call_payload.model_dump() if hasattr(call_payload, "model_dump") else call_payload.dict()
    view = call_view(call_payload)
    call_dict.update({k: view[k] for k in ("cr", "score", "next_step", "kind", "status", "status_label", "risk_amount")})
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


@router.post("/call", dependencies=[Depends(verify_internal_or_admin)])
async def receive_telephony_call(request: Request, background_tasks: BackgroundTasks):
    """Universal Telephony receiver endpoint (queued with BackgroundTasks, <50ms response)."""
    return await _process_telephony_call(request, None, background_tasks)


@router.post("/{tenant_id}/call", dependencies=[Depends(verify_internal_or_admin)])
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


@router.get("/last-incoming", dependencies=[Depends(verify_internal_or_admin)])
def get_last_incoming_webhook():
    """Returns the most recent incoming webhook payload for live debugging in the Admin UI."""
    return LAST_INCOMING_WEBHOOK


@router.get("/history", dependencies=[Depends(verify_internal_or_admin)])
def get_webhooks_history(limit: int = 15):
    """Returns the ring buffer of recent incoming webhooks for the Dead Letter Queue (DLQ) inspector."""
    return {
        "status": "ok",
        "total": len(WEBHOOKS_HISTORY),
        "history": WEBHOOKS_HISTORY[:limit]
    }


@router.post("/{webhook_id}/replay", dependencies=[Depends(verify_internal_or_admin)])
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
    deal_id = str(replay_payload.get("deal_id") or "")
    transcript = str(replay_payload.get("transcript") or "Повторная обработка архивного звонка")

    dur_sec = int(replay_payload.get("duration_sec") or 0)
    raw_score = replay_payload.get("score")
    score = int(raw_score) if raw_score is not None else None
    raw_next_step = replay_payload.get("next_step")
    next_step = int(raw_next_step) if raw_next_step is not None else None
    raw_cr = replay_payload.get("cr")
    cr = raw_cr if isinstance(raw_cr, list) and len(raw_cr) == 13 else None
    safe_cr_payload = cr if valid_cr(cr) else None

    call_payload = CallIngestPayload(
        id=call_id,
        deal_id=deal_id,
        deal_title=replay_payload.get("deal_title") or f"Повторный аудит #{call_id}",
        manager=replay_payload.get("manager_name") or replay_payload.get("manager") or "",
        client=replay_payload.get("client_name") or replay_payload.get("client") or "",
        duration_sec=dur_sec,
        duration=f"{dur_sec // 60}:{dur_sec % 60:02d}",
        amount=replay_payload.get("amount"),
        score=score,
        next_step=next_step,
        cr=safe_cr_payload,
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


