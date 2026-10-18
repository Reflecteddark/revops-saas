"""
Tenant Registry & Multi-Tenant Context Resolver for RevOps SaaS.
Resolves tenant configurations, spreadsheet IDs, and CRM credentials from tenants_registry.json.
Provides in-memory caching and fallback mechanisms.
"""

from datetime import datetime
import json
import logging
import os
from pathlib import Path
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("tenant_registry")

DEFAULT_SPREADSHEET_ID = os.getenv("REVOPS_SPREADSHEET_ID", "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk")

_REGISTRY_CACHE: Dict[str, Any] = {
    "timestamp": 0,
    "data": None
}


def get_tenants_registry_path() -> Optional[Path]:
    env_path = os.getenv("TENANTS_REGISTRY_PATH")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    candidates = [
        Path(__file__).resolve().parent.parent.parent / "tenants_registry.json",
        Path(__file__).resolve().parent.parent.parent.parent / "revops-enterprise-os" / "tenants_registry.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "tenants_registry.json",
        Path("tenants_registry.json"),
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def load_tenants_registry() -> Dict[str, Any]:
    now = time.time()
    if _REGISTRY_CACHE["data"] and (now - _REGISTRY_CACHE["timestamp"] < 10):
        return _REGISTRY_CACHE["data"]

    reg_path = get_tenants_registry_path()
    if not reg_path:
        logger.warning("tenants_registry.json not found in candidate paths. Using fallback defaults.")
        default_data = {
            "tenants": [
                {
                    "tenant_id": "TNT-001",
                    "tenant_name": "Самозанятый (Master)",
                    "spreadsheet_id": DEFAULT_SPREADSHEET_ID,
                    "crm_type": "bitrix24",
                    "status": "active"
                }
            ],
            "master_template": {
                "tenant_id": "TNT-CLEAN-001",
                "tenant_name": "Clean Starter Template",
                "spreadsheet_id": "1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A"
            }
        }
        _REGISTRY_CACHE["data"] = default_data
        _REGISTRY_CACHE["timestamp"] = now
        return default_data

    try:
        with open(reg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            _REGISTRY_CACHE["data"] = data
            _REGISTRY_CACHE["timestamp"] = now
            return data
    except Exception as ex:
        logger.error(f"Failed to read {reg_path}: {ex}")
        return _REGISTRY_CACHE["data"] or {"tenants": []}


def get_tenant_config(tenant_id: str) -> Optional[Dict[str, Any]]:
    clean_id = (tenant_id or "").strip().upper()
    registry = load_tenants_registry()

    # Check active tenants
    for t in registry.get("tenants", []):
        if str(t.get("tenant_id", "")).upper() == clean_id:
            return t

    # Check starter/master template
    clean_starter = registry.get("clean_starter_template") or registry.get("master_template")
    if clean_starter and str(clean_starter.get("tenant_id", "")).upper() == clean_id:
        return clean_starter

    # Check by name or prefix if clean_id contained name
    for t in registry.get("tenants", []):
        if clean_id in str(t.get("tenant_id", "")).upper() or str(t.get("tenant_id", "")).upper() in clean_id:
            return t

    return None


def get_tenant_spreadsheet_id(tenant_id: str = "TNT-001") -> str:
    config = get_tenant_config(tenant_id)
    if config and config.get("spreadsheet_id"):
        return str(config["spreadsheet_id"]).strip()
    return DEFAULT_SPREADSHEET_ID


def get_all_tenants_summary() -> List[Dict[str, Any]]:
    registry = load_tenants_registry()
    summaries = []
    
    # 1. Registered active tenants
    for t in registry.get("tenants", []):
        summaries.append({
            "tenant_id": t.get("tenant_id", "TNT-001"),
            "tenant_name": t.get("tenant_name", "Клиент"),
            "crm_type": t.get("crm_type", "bitrix24"),
            "spreadsheet_id": t.get("spreadsheet_id", DEFAULT_SPREADSHEET_ID),
            "status": t.get("status", "active"),
            "niche_name": t.get("niche_name", "Универсальный B2B"),
            "avg_deal_check": t.get("avg_deal_check", 150000),
            "is_template": False
        })

    # 2. Add Clean Template for instant demo / zero-state testing
    tpl = registry.get("clean_starter_template") or registry.get("master_template")
    if tpl:
        summaries.append({
            "tenant_id": tpl.get("tenant_id", "TNT-CLEAN-001"),
            "tenant_name": tpl.get("tenant_name", "Clean Client Starter (Шаблон)"),
            "crm_type": "template",
            "spreadsheet_id": tpl.get("spreadsheet_id", "1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A"),
            "status": "template",
            "niche_name": "Чистый старт",
            "avg_deal_check": 0,
            "is_template": True
        })

    return summaries
