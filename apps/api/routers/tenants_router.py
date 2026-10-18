"""
Tenants Management Router: Multi-Tenant Fleet Registration and Switching.
Endpoints:
- GET /api/v1/tenants: List all active tenants and clean starter templates
- GET /api/v1/tenants/{tenant_id}: Get detailed tenant configuration
- POST /api/v1/tenants: Register a new tenant with dedicated Google Sheet
"""

from datetime import datetime
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from ..tenant_registry import (
    get_all_tenants_summary,
    get_tenant_config,
    get_tenants_registry_path,
    load_tenants_registry,
    _REGISTRY_CACHE,
)

logger = logging.getLogger("tenants_router")

router = APIRouter(prefix="/tenants", tags=["Multi-Tenant Fleet"])


class RegisterTenantRequest(BaseModel):
    tenant_id: str = Field(..., description="Unique Tenant Code, e.g. TNT-002")
    tenant_name: str = Field(..., description="Client Company Name")
    spreadsheet_id: str = Field(..., description="Google Spreadsheet ID copied from Clean Template")
    crm_type: Optional[str] = Field("bitrix24", description="CRM Type: bitrix24 or amocrm")
    crm_webhook_url: Optional[str] = None
    tg_chat_id: Optional[str] = None
    niche_name: Optional[str] = "Универсальный B2B"
    avg_deal_check: Optional[float] = 150000.0


@router.get("", response_model=List[Dict[str, Any]])
def list_tenants():
    """List all available client tenants and templates for dynamic switcher."""
    return get_all_tenants_summary()


@router.get("/{tenant_id}")
def get_tenant_details(tenant_id: str):
    """Get single tenant metadata and configuration."""
    cfg = get_tenant_config(tenant_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' not found in registry")
    return cfg


@router.post("")
def register_tenant(req: RegisterTenantRequest):
    """
    Register a newly onboarded client tenant into tenants_registry.json.
    Ensures zero downtime and immediate availability in UI and API.
    """
    clean_id = req.tenant_id.strip().upper()
    if not clean_id.startswith("TNT-"):
        clean_id = f"TNT-{clean_id}"

    reg_path = get_tenants_registry_path()
    if not reg_path:
        raise HTTPException(status_code=500, detail="tenants_registry.json path could not be resolved")

    registry = load_tenants_registry()
    tenants_list = registry.setdefault("tenants", [])

    # Check if already exists
    for t in tenants_list:
        if str(t.get("tenant_id", "")).upper() == clean_id:
            # Update existing
            t["tenant_name"] = req.tenant_name.strip()
            t["spreadsheet_id"] = req.spreadsheet_id.strip()
            t["crm_type"] = req.crm_type
            if req.crm_webhook_url:
                t["crm_webhook_url"] = req.crm_webhook_url.strip()
            if req.tg_chat_id:
                t["tg_chat_id"] = req.tg_chat_id.strip()
            if req.niche_name:
                t["niche_name"] = req.niche_name.strip()
            if req.avg_deal_check is not None:
                t["avg_deal_check"] = req.avg_deal_check

            # Save
            with open(reg_path, "w", encoding="utf-8") as f:
                json.dump(registry, f, ensure_ascii=False, indent=2)
            _REGISTRY_CACHE["timestamp"] = 0
            return {"status": "updated", "tenant": t}

    # Append new tenant
    new_tenant = {
        "tenant_id": clean_id,
        "tenant_name": req.tenant_name.strip(),
        "spreadsheet_id": req.spreadsheet_id.strip(),
        "spreadsheet_url": f"https://docs.google.com/spreadsheets/d/{req.spreadsheet_id.strip()}",
        "crm_type": req.crm_type or "bitrix24",
        "crm_webhook_url": req.crm_webhook_url or "",
        "b24_webhook_url": req.crm_webhook_url or "",
        "tg_chat_id": req.tg_chat_id or "",
        "niche_name": req.niche_name or "Универсальный B2B",
        "avg_deal_check": req.avg_deal_check or 150000.0,
        "status": "active",
        "created_at": datetime.now().isoformat(),
        "version": "20.0"
    }
    tenants_list.append(new_tenant)

    with open(reg_path, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)

    _REGISTRY_CACHE["timestamp"] = 0
    logger.info(f"Registered new client tenant {clean_id} ({req.tenant_name})")
    return {"status": "created", "tenant": new_tenant}
