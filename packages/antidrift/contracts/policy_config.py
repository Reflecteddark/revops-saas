"""
packages/antidrift/contracts/policy_config.py

Per-tenant Policy Configuration & Guardrail Governance (Audit Item 1.1).
Enforces calibrated thresholds per tenant with strict versioning and changelog tracking:
- allowed_discount_max: calibrated from p95 CRM deals
- allowed_deferment_days: calibrated standard + whitelist for key enterprise accounts
- requires_human_above: calibrated to keep HITL queue <= 10-15% of transactions
- Immutable in-code safety floors (GR-00..GR-05) modified ONLY via manual PR
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger("antidrift_policy_config")


class PolicyChangelogEntry(BaseModel):
    version: str
    changed_at: str
    author: str
    reason: str
    diff: Dict[str, Any]


class TenantPolicyConfig(BaseModel):
    """Calibrated per-tenant safety policy parameters."""
    tenant_id: str
    version: str = "v1.0"
    allowed_discount_max: float = 5.0              # Max discount %
    allowed_deferment_days: int = 14               # Max deferment days
    requires_human_above: float = 300000.0         # Deal amount requiring HITL
    deferment_whitelist_clients: List[str] = Field(default_factory=list) # e.g. ["client_enterprise_99"] (30-45 days)
    whitelist_deferment_days: int = 45
    # Opt-In Autonomy Guards: All false by default (Passive Advisor Mode)
    allow_crm_mutations: bool = False              # Must be explicitly enabled in LK to mutate CRM
    enable_telegram_notifications: bool = False    # Must be explicitly enabled in LK to send Telegram alerts
    allow_client_communication: bool = False       # Must be explicitly enabled in LK to send messages to clients
    changelog: List[PolicyChangelogEntry] = Field(default_factory=list)

    def get_effective_deferment_days(self, client_id: Optional[str] = None) -> int:
        """Returns 45 days for whitelisted enterprise clients, standard 14 days otherwise."""
        if client_id and client_id in self.deferment_whitelist_clients:
            return self.whitelist_deferment_days
        return self.allowed_deferment_days


class TenantPolicyRegistry:
    """Registry maintaining per-tenant policy configurations with file and DB fallbacks."""

    _instance: Optional[TenantPolicyRegistry] = None
    _configs: Dict[str, TenantPolicyConfig] = {}

    @classmethod
    def get_config(cls, tenant_id: str, db: Optional[Any] = None) -> TenantPolicyConfig:
        """Retrieves tenant-specific policy configuration or returns safe calibrated defaults."""
        tid = str(tenant_id or "default").strip()

        # Check in DB if session provided
        db_autonomy: dict[str, bool] = {}
        if db is not None:
            try:
                from packages.database.models import Tenant
                t = db.query(Tenant).filter(Tenant.id == tid).first()
                if t and t.settings and isinstance(t.settings, dict):
                    st = t.settings
                    auto_block = st.get("autonomy", {}) if isinstance(st.get("autonomy"), dict) else {}
                    db_autonomy = {
                        "allow_crm_mutations": bool(st.get("allow_crm_mutations", auto_block.get("allow_crm_mutations", False))),
                        "enable_telegram_notifications": bool(st.get("enable_telegram_notifications", auto_block.get("enable_telegram_notifications", False))),
                        "allow_client_communication": bool(st.get("allow_client_communication", auto_block.get("allow_client_communication", False))),
                    }
            except Exception as e:
                logger.debug(f"Could not load tenant settings from DB: {e}")

        if tid in cls._configs:
            cfg = cls._configs[tid]
            if db_autonomy:
                cfg.allow_crm_mutations = db_autonomy["allow_crm_mutations"]
                cfg.enable_telegram_notifications = db_autonomy["enable_telegram_notifications"]
                cfg.allow_client_communication = db_autonomy["allow_client_communication"]
            return cfg

        # Check tenant policy JSON file if exists
        cfg_path = Path("config") / f"tenant_policy_{tid}.json"
        if cfg_path.exists():
            try:
                data = json.loads(cfg_path.read_text(encoding="utf-8"))
                cfg = TenantPolicyConfig(**data)
                if db_autonomy:
                    cfg.allow_crm_mutations = db_autonomy["allow_crm_mutations"]
                    cfg.enable_telegram_notifications = db_autonomy["enable_telegram_notifications"]
                    cfg.allow_client_communication = db_autonomy["allow_client_communication"]
                cls._configs[tid] = cfg
                return cfg
            except Exception as e:
                logger.warning(f"Could not load tenant policy from {cfg_path}: {e}")

        # Default calibrated configuration (Strictly passive / safe by default)
        default_cfg = TenantPolicyConfig(
            tenant_id=tid,
            version="v1.0-default",
            allowed_discount_max=5.0,
            allowed_deferment_days=14,
            requires_human_above=300000.0,
            allow_crm_mutations=db_autonomy.get("allow_crm_mutations", False),
            enable_telegram_notifications=db_autonomy.get("enable_telegram_notifications", False),
            allow_client_communication=db_autonomy.get("allow_client_communication", False),
            changelog=[
                PolicyChangelogEntry(
                    version="v1.0",
                    changed_at=datetime.now(timezone.utc).isoformat(),
                    author="System Default",
                    reason="Initial calibrated baseline (Passive Advisor Mode)",
                    diff={"allowed_discount_max": 5.0, "allowed_deferment_days": 14, "requires_human_above": 300000.0},
                )
            ],
        )
        cls._configs[tid] = default_cfg
        return default_cfg

    @classmethod
    def register_config(cls, config: TenantPolicyConfig) -> None:
        """Registers an explicit tenant policy configuration."""
        cls._configs[config.tenant_id] = config
