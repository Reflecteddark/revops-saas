"""
packages/antidrift/canary/canary_router.py

Industrial Canary Traffic Router & Automated Rollback Circuit Breaker.
Enforces multi-tenant isolation, progressive rollouts (0% -> 5% -> 25% -> 100%),
and fast automated rollback on HARD_FAILURE or anomalous divergence.
Only actual canary sessions are evaluated to avoid false circuit trips from production traffic.
"""

from __future__ import annotations

import hashlib
import logging
import os
import threading
from typing import Any, Dict, Optional

from packages.antidrift.telemetry.metrics import antidrift_metrics

logger = logging.getLogger("antidrift_canary_router")


class CanaryRouter:
    """Thread-safe Multi-Tenant Canary Traffic Router & Auto-Rollback Guard."""

    _instance: CanaryRouter | None = None
    _lock = threading.Lock()

    def __new__(cls) -> CanaryRouter:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init_state()
            return cls._instance

    def _init_state(self) -> None:
        self._state_lock = threading.Lock()
        self.enabled: bool = os.getenv("ENABLE_CANARY_ROUTING", "1") == "1"
        self.weight_pct: float = float(os.getenv("DEFAULT_CANARY_WEIGHT_PCT", "0.0"))
        self.divergence_threshold_pct: float = float(os.getenv("CANARY_DIVERGENCE_THRESHOLD_PCT", "2.0"))
        self.min_sessions_for_divergence_rollback: int = int(os.getenv("CANARY_MIN_SESSIONS_ROLLBACK", "200"))
        self.canary_sessions_count: int = 0
        self.auto_rollback_active: bool = False
        self.rollback_reason: Optional[str] = None
        self.consecutive_hard_failures: int = 0
        self.max_hard_failures: int = 1
        self._tenant_states: dict[str, dict[str, Any]] = {}

        # Synchronize initial metric
        antidrift_metrics.set_canary_weight(self.weight_pct / 100.0)

    def _get_tenant_state(self, tenant_id: str) -> dict[str, Any]:
        """Returns or initializes isolated per-tenant canary state."""
        if tenant_id not in self._tenant_states:
            self._tenant_states[tenant_id] = {
                "enabled": self.enabled,
                "weight_pct": self.weight_pct,
                "divergence_threshold_pct": self.divergence_threshold_pct,
                "min_sessions_for_divergence_rollback": self.min_sessions_for_divergence_rollback,
                "canary_sessions_count": 0,
                "auto_rollback_active": False,
                "rollback_reason": None,
                "consecutive_hard_failures": 0,
                "max_hard_failures": self.max_hard_failures,
            }
        return self._tenant_states[tenant_id]

    def reset(self) -> None:
        """Reset canary router to initial state (for testing)."""
        with self._state_lock:
            self.enabled = True
            self.weight_pct = 0.0
            self.divergence_threshold_pct = 2.0
            self.min_sessions_for_divergence_rollback = 200
            self.auto_rollback_active = False
            self.rollback_reason = None
            self.consecutive_hard_failures = 0
            self.canary_sessions_count = 0
            self.max_hard_failures = 1
            self._tenant_states.clear()
            antidrift_metrics.set_canary_weight(0.0)

    def decide_execution_mode(
        self,
        tenant_id: str,
        session_id: str,
        requested_mode: Optional[str] = None,
    ) -> str:
        """
        Determines the execution mode for an incoming agent request.
        If requested_mode is explicitly provided ('shadow', 'dry_run', etc.), honors it.
        Otherwise, applies deterministic per-tenant canary hash partitioning (0-100%).
        """
        if requested_mode and requested_mode.lower() not in ("prod", "production", "default"):
            return requested_mode.lower()

        with self._state_lock:
            t = self._get_tenant_state(tenant_id)
            if not t["enabled"] or t["auto_rollback_active"] or t["weight_pct"] <= 0.0:
                return "prod"

            # Deterministic SHA-256 partition based on tenant and session
            key = f"{tenant_id}:{session_id}".encode("utf-8")
            hash_bucket = int(hashlib.sha256(key).hexdigest()[:8], 16) % 100

            if hash_bucket < t["weight_pct"]:
                return "canary"
            return "prod"

    def record_canary_execution(
        self,
        tenant_id: str,
        is_hard_failure: bool,
        is_divergent: bool = False,
        execution_mode: str = "canary",
    ) -> None:
        """
        Evaluates the outcome of an execution.
        Audit 4.3: Only actual 'canary' mode executions affect canary metrics or trip circuit breaker.
        Production sessions must never trip the canary auto-rollback.
        """
        if execution_mode != "canary":
            return

        with self._state_lock:
            t = self._get_tenant_state(tenant_id)
            if not t["enabled"] or t["auto_rollback_active"]:
                return

            t["canary_sessions_count"] += 1
            self.canary_sessions_count += 1

            if is_hard_failure:
                t["consecutive_hard_failures"] += 1
                self.consecutive_hard_failures += 1
                if t["consecutive_hard_failures"] >= t["max_hard_failures"]:
                    self._trigger_tenant_rollback(
                        tenant_id=tenant_id,
                        reason=f"HARD_FAILURE detected on canary execution for tenant {tenant_id}",
                    )
                return

            if is_divergent:
                rate = antidrift_metrics.get_shadow_divergence_rate(tenant_id) * 100.0
                if t["canary_sessions_count"] < t["min_sessions_for_divergence_rollback"]:
                    logger.warning(
                        f"Canary divergence ({rate:.1f}%) observed for tenant '{tenant_id}', "
                        f"but sample size ({t['canary_sessions_count']} < "
                        f"{t['min_sessions_for_divergence_rollback']}) is insufficient for automatic rollback."
                    )
                    return

                if rate > t["divergence_threshold_pct"]:
                    self._trigger_tenant_rollback(
                        tenant_id=tenant_id,
                        reason=(
                            f"Canary divergence rate ({rate:.2f}%) exceeded threshold "
                            f"({t['divergence_threshold_pct']:.2f}%) after {t['canary_sessions_count']} sessions"
                        ),
                    )

    def _trigger_tenant_rollback(self, tenant_id: str, reason: str) -> None:
        """Internal: drops canary weight to 0.0% for the tenant and records telemetry."""
        t = self._get_tenant_state(tenant_id)
        t["auto_rollback_active"] = True
        t["rollback_reason"] = reason
        t["weight_pct"] = 0.0

        # Also reflect in global summary
        self.auto_rollback_active = True
        self.rollback_reason = reason
        self.weight_pct = 0.0

        antidrift_metrics.record_canary_rollback()
        logger.error(f"[CANARY AUTO-ROLLBACK ACTIVATED for tenant {tenant_id}]: {reason}")

    def configure(
        self,
        weight_pct: Optional[float] = None,
        reset_rollback: bool = False,
        divergence_threshold_pct: Optional[float] = None,
        enabled: Optional[bool] = None,
        tenant_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Dynamically configures canary parameters or resets tripped rollback (per-tenant or globally)."""
        with self._state_lock:
            if tenant_id:
                t = self._get_tenant_state(tenant_id)
                if enabled is not None:
                    t["enabled"] = bool(enabled)
                if reset_rollback:
                    t["auto_rollback_active"] = False
                    t["rollback_reason"] = None
                    t["consecutive_hard_failures"] = 0
                if divergence_threshold_pct is not None:
                    t["divergence_threshold_pct"] = max(0.0, float(divergence_threshold_pct))
                if weight_pct is not None:
                    t["weight_pct"] = max(0.0, min(100.0, float(weight_pct)))
                return self._get_status_unlocked(tenant_id=tenant_id)

            # Global configure
            if enabled is not None:
                self.enabled = bool(enabled)
                for t in self._tenant_states.values():
                    t["enabled"] = self.enabled
            if reset_rollback:
                self.auto_rollback_active = False
                self.rollback_reason = None
                self.consecutive_hard_failures = 0
                for t in self._tenant_states.values():
                    t["auto_rollback_active"] = False
                    t["rollback_reason"] = None
                    t["consecutive_hard_failures"] = 0
            if divergence_threshold_pct is not None:
                self.divergence_threshold_pct = max(0.0, float(divergence_threshold_pct))
                for t in self._tenant_states.values():
                    t["divergence_threshold_pct"] = self.divergence_threshold_pct
            if weight_pct is not None:
                self.weight_pct = max(0.0, min(100.0, float(weight_pct)))
                antidrift_metrics.set_canary_weight(self.weight_pct / 100.0)
                for t in self._tenant_states.values():
                    t["weight_pct"] = self.weight_pct

            return self._get_status_unlocked()

    def get_status(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        """Returns the current status of the Canary Traffic Router (tenant-specific or global)."""
        with self._state_lock:
            return self._get_status_unlocked(tenant_id=tenant_id)

    def _get_status_unlocked(self, tenant_id: Optional[str] = None) -> Dict[str, Any]:
        if tenant_id and tenant_id in self._tenant_states:
            t = self._tenant_states[tenant_id]
            return {
                "tenant_id": tenant_id,
                "enabled": t["enabled"],
                "weight_pct": t["weight_pct"],
                "divergence_threshold_pct": t["divergence_threshold_pct"],
                "auto_rollback_active": t["auto_rollback_active"],
                "rollback_reason": t["rollback_reason"],
                "consecutive_hard_failures": t["consecutive_hard_failures"],
                "canary_sessions_count": t["canary_sessions_count"],
                "canary_weight_gauge": antidrift_metrics.get_canary_weight(),
            }
        return {
            "enabled": self.enabled,
            "weight_pct": self.weight_pct,
            "divergence_threshold_pct": self.divergence_threshold_pct,
            "auto_rollback_active": self.auto_rollback_active,
            "rollback_reason": self.rollback_reason,
            "consecutive_hard_failures": self.consecutive_hard_failures,
            "canary_sessions_count": self.canary_sessions_count,
            "canary_weight_gauge": antidrift_metrics.get_canary_weight(),
        }


# Global singleton instance
canary_router = CanaryRouter()
