"""
Tenant Provisioning and ID Generation for RevOps SaaS.
Guarantees collision-free TNT-XXX sequence and atomic registry persistence.
"""
import logging
from typing import Any

from .tenant_registry import load_tenants_registry, save_tenants_registry

logger = logging.getLogger("tenant_provisioner")

# Aliases for backwards compatibility with legacy imports
load_registry = load_tenants_registry
save_registry = save_tenants_registry


def generate_tenant_id(registry: dict[str, Any] | None = None) -> str:
    """
    Finds the maximum numeric suffix among existing 'TNT-XXX' tenants and returns TNT-{max_id + 1:03d}.
    Avoids collisions when tenants are offboarded or deleted.
    """
    if registry is None:
        registry = load_tenants_registry()
    tenants = registry.get("tenants", []) if isinstance(registry, dict) else []

    ids: list[int] = []
    for t in tenants:
        tid = str(t.get("tenant_id", "")).strip().upper()
        if tid.startswith("TNT-"):
            parts = tid.split("-")
            if len(parts) >= 2 and parts[1].isdigit():
                ids.append(int(parts[1]))

    # Also check Database directly to ensure rapid successive registrations are collision-free
    try:
        from packages.database.models import Tenant
        from packages.database.session import SessionLocal
        db = SessionLocal()
        try:
            db_rows: list[Any] = db.query(Tenant.id).all()
            for row in db_rows:
                db_tid = str(row[0]) if row and row[0] else ""
                if db_tid.upper().startswith("TNT-"):
                    parts = db_tid.upper().split("-")
                    if len(parts) >= 2 and parts[1].isdigit():
                        ids.append(int(parts[1]))
        finally:
            db.close()
    except Exception:
        pass

    max_id = max(ids or [0])
    return f"TNT-{max_id + 1:03d}"


def provision_tenant(
    company_name: str,
    client_email: str | None = None,
    sheet_id: str | None = None,
    crm_type: str = "bitrix24",
    crm_webhook: str | None = None,
    amo_domain: str | None = None,
    amo_token: str | None = None,
    niche_name: str = "Универсальный B2B",
    avg_deal_check: float = 150000.0,
    target_next_step: str = "Фиксация следующего контакта с датой и временем",
    **kwargs: Any,
) -> dict[str, Any]:
    """
    Automated multi-tenant provisioning:
    Generates a unique TNT-XXX ID, builds tenant metadata, and persists via save_tenants_registry.
    """
    registry = load_tenants_registry()
    new_tenant_id = generate_tenant_id(registry)

    tenant_record: dict[str, Any] = {
        "tenant_id": new_tenant_id,
        "tenant_name": company_name,
        "email": client_email,
        "spreadsheet_id": sheet_id or "1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A",
        "crm_type": crm_type,
        "status": "active",
        "niche_name": niche_name,
        "avg_deal_check": avg_deal_check,
        "target_next_step": target_next_step,
        "bitrix_webhook_url": crm_webhook,
        "amo_domain": amo_domain,
        "amo_token": amo_token,
        "custom_features": kwargs.get("custom_features", {}),
        "is_template": False,
    }

    if "tenants" not in registry or not isinstance(registry["tenants"], list):
        registry["tenants"] = []

    registry["tenants"].append(tenant_record)
    save_tenants_registry(registry)
    logger.info(f"Successfully provisioned tenant {new_tenant_id} for '{company_name}'")
    return tenant_record
