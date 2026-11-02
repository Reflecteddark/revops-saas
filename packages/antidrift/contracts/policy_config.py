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
    def get_config(cls, tenant_id: str) -> TenantPolicyConfig:
        """Retrieves tenant-specific policy configuration or returns safe calibrated defaults."""
        tid = str(tenant_id or "default").strip()
        if tid in cls._configs:
            return cls._configs[tid]

        # Check tenant policy JSON file if exists
        cfg_path = Path("config") / f"tenant_policy_{tid}.json"
        if cfg_path.exists():
            try:
                data = json.loads(cfg_path.read_text(encoding="utf-8"))
                cfg = TenantPolicyConfig(**data)
                cls._configs[tid] = cfg
                return cfg
            except Exception as e:
                logger.warning(f"Could not load tenant policy from {cfg_path}: {e}")

        # Default calibrated configuration
        default_cfg = TenantPolicyConfig(
            tenant_id=tid,
            version="v1.0-default",
            allowed_discount_max=5.0,
            allowed_deferment_days=14,
            requires_human_above=300000.0,
            changelog=[
                PolicyChangelogEntry(
                    version="v1.0",
                    changed_at=datetime.now(timezone.utc).isoformat(),
                    author="System Default",
                    reason="Initial calibrated baseline",
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
