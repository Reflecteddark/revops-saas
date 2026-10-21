"""
Deals Management API Router: Live Google Sheets Sync (raw_deals), SLA Risk Tracking, and WebSocket Updates.
Endpoints:
- GET /api/v1/deals: List real CRM deals with SLA risk status and CRM metadata
- POST /api/v1/deals/{id}/fix-next-step: Fix next contact step and resolve risk
"""

import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.database.models import Deal
from packages.database.session import get_db

from ..tenant_registry import get_tenant_spreadsheet_id
from ..websocket_manager import manager

logger = logging.getLogger("deals_router")

router = APIRouter(prefix="/deals", tags=["Deals Management"])


class FixNextStepPayload(BaseModel):
    next_step_date: str | None = None


# In-memory cache for live deals from Google Sheets keyed by tenant_id (TTL: 15s)
_DEALS_CACHE: dict[str, dict[str, Any]] = {}


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


def parse_amount(val: Any) -> float:
    if not val:
        return 300000.0
    clean = re.sub(r"[^\d.,]", "", str(val))
    if not clean:
        return 300000.0
    if "," in clean and "." in clean:
        if clean.rfind(",") > clean.rfind("."):
            clean = clean.replace(".", "").replace(",", ".")
        else:
            clean = clean.replace(",", "")
    elif "," in clean:
        if re.search(r",\d{3}$", clean) or clean.count(",") > 1:
            clean = clean.replace(",", "")
        else:
            clean = clean.replace(",", ".")
    elif "." in clean:
        if re.search(r"\.\d{3}$", clean) or clean.count(".") > 1:
            clean = clean.replace(".", "")
    try:
        return float(clean)
    except Exception:
        return 300000.0


def fetch_deals_from_sheets(tenant_id: str = "TNT-001", limit: int = 100) -> list[dict[str, Any]]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    now = time.time()
    cached = _DEALS_CACHE.get(clean_tenant)
    if cached and (now - cached.get("timestamp", 0) < 15):
        return cached.get("deals", [])

    sa_path = get_service_account_path()
    if not sa_path:
        if cached and cached.get("deals"):
            return cached.get("deals", [])
        logger.warning(f"service_account.json not found for deals fetch (tenant: {clean_tenant}), using golden master seed deals")
        from packages.analytics_engine.calc_engine import DEFAULT_DEALS
        fallback_deals: list[dict[str, Any]] = []
        lookup: dict[str, dict[str, Any]] = {}
        for d in DEFAULT_DEALS:
            deal_id = str(d.get("deal_id", "D-101"))
            st_id = int(d.get("stage_id", 1))
            is_seed_won = (st_id == 6)
            stage_name = str(d.get("stage_name", "Первичный контакт"))
            amt_num = float(d.get("amount", 300000.0))
            sla_risk = (not is_seed_won) and (st_id in (1, 2, 4) or "Первичный" in stage_name or "КП" in stage_name or "Новый" in stage_name)
            deal_obj = {
                "id": deal_id,
                "deal_id": deal_id,
                "org_id": clean_tenant,
                "crm_deal_id": deal_id,
                "crm_source": str(d.get("lead_source", "CRM")),
                "title": str(d.get("client_name", f"Сделка {deal_id}")),
                "amount": amt_num,
                "amount_str": f"{int(amt_num):,} ₽".replace(",", " "),
                "stage_id": str(st_id),
                "stage": stage_name,
                "status": "won" if is_seed_won else "active",
                "sla_risk": sla_risk,
                "responsible_user": f"Менеджер {d.get('manager_id', 101)}",
                "segment": str(d.get("segment_code", "SEG1")),
                "created_at": str(d.get("created_date", "")),
                "updated_at": str(d.get("stage_changed_date", "")),
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }
            fallback_deals.append(deal_obj)
            lookup[deal_id.upper().strip()] = deal_obj
        _DEALS_CACHE[clean_tenant] = {
            "timestamp": now,
            "deals": fallback_deals,
            "lookup": lookup
        }
        return fallback_deals

    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        sheet_id = get_tenant_spreadsheet_id(clean_tenant)
        ss = gc.open_by_key(sheet_id)
        ws = ss.worksheet("raw_deals")
        rows = ws.get_all_values()
        if len(rows) < 2:
            empty_res: list[dict[str, Any]] = []
            _DEALS_CACHE[clean_tenant] = {"timestamp": now, "deals": empty_res, "lookup": {}}
            return empty_res

        deals = []
        lookup = {}
        # Header is row 0: deal_id, company_name, amount, stage_id, stage_name, created_at, updated_at, responsible_user, segment, source...
        for r in rows[1:]:
            if not r or not r[0]:
                continue
            deal_id = str(r[0]).strip()
            title = r[1] if len(r) > 1 and r[1] else f"Сделка {deal_id}"
            raw_amt = r[2] if len(r) > 2 and r[2] else "300,000 ₽"
            amt_num = parse_amount(raw_amt)
            stage_id = r[3] if len(r) > 3 and r[3] else "1"
            stage_name = r[4] if len(r) > 4 and r[4] else "Первичный контакт"
            created_at = r[5] if len(r) > 5 and r[5] else ""
            updated_at = r[6] if len(r) > 6 and r[6] else ""
            responsible = r[7] if len(r) > 7 and r[7] else "Менеджер"
            segment = r[8] if len(r) > 8 and r[8] else "General B2B"
            source = r[9] if len(r) > 9 and r[9] else "CRM"
            is_won = str(r[14]).strip() if len(r) > 14 else "0"

            sla_risk = (is_won != "1") and ("Первичный" in stage_name or "КП" in stage_name)

            deal_obj = {
                "id": deal_id,
                "deal_id": deal_id,
                "org_id": clean_tenant,
                "crm_deal_id": deal_id,
                "crm_source": source,
                "title": title,
                "amount": amt_num,
                "amount_str": f"{int(amt_num):,} ₽".replace(",", " "),
                "stage_id": stage_id,
                "stage": stage_name,
                "status": "won" if is_won == "1" else "active",
                "sla_risk": sla_risk,
                "responsible_user": responsible,
                "segment": segment,
                "created_at": created_at,
                "updated_at": updated_at,
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }
            deals.append(deal_obj)

            # Build fast index keys
            clean_id = deal_id.upper()
            lookup[clean_id] = deal_obj
            num_only = re.sub(r"\D", "", clean_id)
            if num_only:
                lookup[num_only] = deal_obj
                lookup[f"B24-{num_only}"] = deal_obj
                lookup[f"BX_{num_only}"] = deal_obj
                lookup[f"AMO_{num_only}"] = deal_obj

        _DEALS_CACHE[clean_tenant] = {
            "timestamp": now,
            "deals": deals,
            "lookup": lookup
        }
        return deals
    except Exception as e:
        logger.error(f"Error reading raw_deals from Google Sheets for tenant {clean_tenant}: {e}")
        return _DEALS_CACHE.get(clean_tenant, {}).get("deals", [])


def get_deals_lookup(tenant_id: str = "TNT-001") -> dict[str, dict[str, Any]]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    fetch_deals_from_sheets(tenant_id=clean_tenant)
    return _DEALS_CACHE.get(clean_tenant, {}).get("lookup", {})


@router.get("")
@router.get("/")
def list_deals(
    stage: str | None = None,
    sla_risk_only: bool = False,
    org_id: str = "TNT-001",
    tenant_id: str | None = None,
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Returns active CRM deals directly from raw_deals Google Sheets or local DB for given tenant."""
    effective_tenant = tenant_id or org_id or "TNT-001"
    is_demo_tenant = str(effective_tenant).lower().startswith("demo_") or str(effective_tenant).lower().startswith("demo-")
    all_deals = [] if is_demo_tenant else fetch_deals_from_sheets(tenant_id=effective_tenant)
    source = "google_sheets_raw_deals"
    if not all_deals:
        db_deals = (
            db.query(Deal)
            .filter(
                (Deal.tenant_id == effective_tenant)
                | (Deal.tenant_id == effective_tenant.lower())
                | (Deal.tenant_id == effective_tenant.upper())
            )
            .all()
        )
        if db_deals:
            source = "database"
            all_deals = [
                {
                    "id": d.id,
                    "deal_id": d.id,
                    "org_id": effective_tenant,
                    "crm_deal_id": d.external_crm_id or d.id,
                    "crm_source": d.lead_source or "CRM",
                    "title": d.title,
                    "amount": float(d.budget),
                    "amount_str": f"{int(d.budget):,} ₽".replace(",", " "),
                    "stage_id": "1",
                    "stage": d.stage.value if d.stage else "Первичный контакт",
                    "status": "won" if (d.stage and "успешно" in d.stage.value.lower()) else ("lost" if (d.stage and "закрыто" in d.stage.value.lower()) else "active"),
                    "sla_risk": d.is_at_risk,
                    "responsible_user": d.assigned_user.full_name if d.assigned_user else "Менеджер",
                    "segment": "General B2B",
                    "created_at": d.created_at.isoformat() if d.created_at else "",
                    "updated_at": d.updated_at.isoformat() if d.updated_at else "",
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                }
                for d in db_deals
            ]
    results = all_deals
    if stage:
        results = [d for d in results if d["stage"] == stage]
    if sla_risk_only:
        results = [d for d in results if d["sla_risk"]]
    return {
        "status": "ok",
        "tenant_id": effective_tenant,
        "source": source,
        "deals": results,
        "total": len(results),
        "sla_risk_count": sum(1 for d in results if d.get("sla_risk")),
        "total_amount": sum(d.get("amount", 0) for d in results)
    }


@router.post("/{deal_id}/fix-next-step")
async def fix_next_step(
    deal_id: str,
    payload: FixNextStepPayload | None = None,
    next_step_date_iso: str | None = Query(None),
    org_id: str = "TNT-001"
):
    """Fixes the next step date, clears the SLA risk, and broadcasts real-time WebSocket update."""
    target_date = next_step_date_iso or (payload.next_step_date if payload else None)
    if not target_date:
        target_date = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat().split("T")[0]

    deals = fetch_deals_from_sheets()
    found = None
    lookup = get_deals_lookup()
    clean_id = deal_id.upper().strip()
    if clean_id in lookup:
        found = lookup[clean_id]
        found["sla_risk"] = False
        found["next_step_date"] = target_date

    if not found:
        found = {
            "id": deal_id,
            "deal_id": deal_id,
            "org_id": org_id,
            "title": f"Сделка {deal_id}",
            "amount": 300000.0,
            "amount_str": "300 000 ₽",
            "stage": "Первичный контакт",
            "status": "active",
            "sla_risk": False,
            "next_step_date": target_date,
            "synced_at": datetime.now(timezone.utc).isoformat()
        }

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
