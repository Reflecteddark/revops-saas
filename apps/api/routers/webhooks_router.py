"""
Webhooks API Router: Ingestion gateways for amoCRM and Bitrix24 events.
Processes deal status updates, SLA breaches, and triggers WebSocket broadcasts.
"""

from typing import Dict, Any, Optional
from fastapi import APIRouter, Header, HTTPException, Request
from ..websocket_manager import manager

router = APIRouter(prefix="/webhooks", tags=["CRM Webhook Receivers"])


@router.post("/amo-crm")
async def receive_amocrm_webhook(
    request: Request,
    signature: Optional[str] = Header(None, alias="X-Amo-Signature")
):
    """
    Receives incoming webhook notifications from amoCRM (deal updated, lead stage changed).
    """
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}

    # Extract deal update payload defensively
    leads_raw = body.get("leads") if isinstance(body, dict) else None
    deal_id = "amo_unknown"
    deal_data = {}

    if isinstance(leads_raw, dict):
        updates = leads_raw.get("update") or leads_raw.get("status") or [{}]
        if isinstance(updates, list) and updates:
            deal_data = updates[0]
            deal_id = str(deal_data.get("id", deal_id))
    elif isinstance(leads_raw, list) and leads_raw:
        deal_data = leads_raw[0]
        deal_id = str(deal_data.get("id", deal_id))
    elif isinstance(body, dict) and "id" in body:
        deal_id = str(body["id"])
        deal_data = body

    org_id = body.get("org_id", "org_default") if isinstance(body, dict) else "org_default"

    # Broadcast event via WebSocket
    await manager.broadcast(org_id, {
        "type": "deal_updated",
        "source": "amo_crm",
        "crm_deal_id": deal_id,
        "raw_event": deal_data
    })

    return {
        "status": "ok",
        "crm": "amoCRM",
        "source": "amoCRM",
        "processed_deal": deal_id
    }


@router.post("/bitrix24")
async def receive_bitrix24_webhook(
    request: Request,
    token: Optional[str] = Header(None, alias="X-Bitrix-Token")
):
    """
    Receives incoming webhook notifications from Bitrix24 ONCRMDEALUPDATE.
    """
    body = await request.json() if request.headers.get("content-type") == "application/json" else {}
    deal_id = "bx_unknown"
    if isinstance(body, dict):
        deal_id = str(body.get("data", {}).get("FIELDS", {}).get("ID", body.get("id", "bx_unknown")))
        org_id = body.get("org_id", "org_default")
    else:
        org_id = "org_default"

    await manager.broadcast(org_id, {
        "type": "deal_updated",
        "source": "bitrix24",
        "crm_deal_id": deal_id,
        "raw_event": body
    })

    return {
        "status": "ok",
        "crm": "Bitrix24",
        "source": "Bitrix24",
        "processed_deal": deal_id
    }
