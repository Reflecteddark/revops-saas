"""
Deals Management API Router.
Endpoints:
- GET /api/v1/deals: List deals with SLA risk status and CRM metadata
- POST /api/v1/deals/{id}/fix-next-step: Fix next contact step and resolve risk
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..websocket_manager import manager

router = APIRouter(prefix="/deals", tags=["Deals Management"])


class FixNextStepPayload(BaseModel):
    next_step_date: Optional[str] = None


# Initial mock dataset for instant zero-dependency execution
SAMPLE_DEALS = [
    {
        "id": "DEAL-7842",
        "org_id": "org_default",
        "crm_deal_id": "amo_1948201",
        "crm_source": "amo",
        "title": "ООО «ПромСнаб» — Комплект V17",
        "amount": 1450000.0,
        "stage": "КП отправлено",
        "status": "active",
        "sla_risk": True,
        "next_step_date": None,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": "DEAL-7843",
        "org_id": "org_default",
        "crm_deal_id": "bx_401928",
        "crm_source": "bitrix",
        "title": "ЗАО «ИнвестХолдинг» — Лицензии",
        "amount": 890000.0,
        "stage": "Принятие решения",
        "status": "active",
        "sla_risk": True,
        "next_step_date": None,
        "synced_at": datetime.now(timezone.utc).isoformat(),
    },
    {
        "id": "DEAL-7844",
        "org_id": "org_default",
        "crm_deal_id": "amo_2004918",
        "crm_source": "amo",
        "title": "ГК «Логистик-Групп» — Внедрение",
        "amount": 2100000.0,
        "stage": "Договор / Счёт",
        "status": "active",
        "sla_risk": False,
        "next_step_date": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat().split("T")[0],
        "synced_at": datetime.now(timezone.utc).isoformat(),
    },
]


@router.get("")
@router.get("/")
def list_deals(
    stage: Optional[str] = None,
    sla_risk_only: bool = False,
    org_id: str = "org_default"
) -> Dict[str, Any]:
    """Returns active CRM deals for the organization."""
    results = [d for d in SAMPLE_DEALS if d["org_id"] == org_id]
    if stage:
        results = [d for d in results if d["stage"] == stage]
    if sla_risk_only:
        results = [d for d in results if d["sla_risk"]]
    return {
        "deals": results,
        "total": len(results),
        "sla_risk_count": sum(1 for d in results if d.get("sla_risk"))
    }


@router.post("/{deal_id}/fix-next-step")
async def fix_next_step(
    deal_id: str,
    payload: Optional[FixNextStepPayload] = None,
    next_step_date_iso: Optional[str] = Query(None),
    org_id: str = "org_default"
):
    """Fixes the next step date, clears the SLA risk, and broadcasts real-time WebSocket update."""
    target_date = next_step_date_iso or (payload.next_step_date if payload else None)
    if not target_date:
        target_date = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat().split("T")[0]

    found = None
    for d in SAMPLE_DEALS:
        if d["id"] == deal_id:
            d["sla_risk"] = False
            d["next_step_date"] = target_date
            found = d
            break

    if not found:
        # Create or update ad-hoc deal
        found = {
            "id": deal_id,
            "org_id": org_id,
            "title": f"Сделка {deal_id}",
            "amount": 500000.0,
            "stage": "Квалификация",
            "status": "active",
            "sla_risk": False,
            "next_step_date": target_date,
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
        SAMPLE_DEALS.append(found)

    # Real-time WebSocket Broadcast
    await manager.broadcast(org_id, {
        "type": "deal_updated",
        "action": "fix_next_step",
        "data": found
    })

    return {
        "status": "success",
        "message": f"Следующий шаг по сделке {deal_id} назначен на {target_date}. Риск снят.",
        "deal": found
    }
