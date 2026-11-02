"""
packages/antidrift/canary/canary_router.py

Industrial Canary Traffic Router & Automated Rollback Circuit Breaker.
Enables progressive rollouts (5% -> 25% -> 100%) with 50ms automated fallback to PROD
if hard failures or anomalous divergence rates are detected.
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
    """Thread-safe Canary Traffic Router & Auto-Rollback Guard."""

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
        self.weight_pct: float = float(os.getenv("DEFAULT_CANARY_WEIGHT_PCT", "5.0"))
        self.divergence_threshold_pct: float = float(os.getenv("CANARY_DIVERGENCE_THRESHOLD_PCT", "2.0"))
        self.min_sessions_for_divergence_rollback: int = int(os.getenv("CANARY_MIN_SESSIONS_ROLLBACK", "200"))
        self.canary_sessions_count: int = 0
        self.auto_rollback_active: bool = False
        self.rollback_reason: Optional[str] = None
        self.consecutive_hard_failures: int = 0
        self.max_hard_failures: int = 1

        # Synchronize initial metric
        antidrift_metrics.set_canary_weight(self.weight_pct / 100.0)

    def reset(self) -> None:
        """Reset canary router to initial state (for testing)."""
        with self._state_lock:
            self.enabled = True
            self.weight_pct = 5.0
            self.divergence_threshold_pct = 2.0
            self.auto_rollback_active = False
            self.rollback_reason = None
            self.consecutive_hard_failures = 0
            self.max_hard_failures = 1
            antidrift_metrics.set_canary_weight(0.05)

    def decide_execution_mode(
        self,
        tenant_id: str,
        session_id: str,
        requested_mode: Optional[str] = None,
    ) -> str:
        """
        Determines the execution mode for an incoming agent request.
        If requested_mode is explicitly provided ('shadow', 'dry_run', etc.), honors it.
        Otherwise, applies deterministic canary hash partitioning (0-100%).
        """
        if requested_mode and requested_mode.lower() not in ("prod", "production", "default"):
            return requested_mode.lower()

        with self._state_lock:
            if not self.enabled or self.auto_rollback_active or self.weight_pct <= 0.0:
                return "prod"

            # Deterministic SHA-256 partition based on tenant and session
            key = f"{tenant_id}:{session_id}".encode("utf-8")
            hash_bucket = int(hashlib.sha256(key).hexdigest()[:8], 16) % 100

            if hash_bucket < self.weight_pct:
                return "canary"
            return "prod"

    def record_canary_execution(
        self,
        tenant_id: str,
        is_hard_failure: bool,
        is_divergent: bool = False,
    ) -> None:
        """
        Evaluates the outcome of a canary execution.
        If a HARD_FAILURE or excessive divergence occurs, trips the circuit breaker
        and triggers an immediate automated rollback to 0%.
        """
        with self._state_lock:
            if not self.enabled or self.auto_rollback_active:
                return

            self.canary_sessions_count += 1

            if is_hard_failure:
                self.consecutive_hard_failures += 1
                if self.consecutive_hard_failures >= self.max_hard_failures:
                    self._trigger_auto_rollback(
                        reason=f"HARD_FAILURE detected on canary execution for tenant {tenant_id}"
                    )
                return

            if is_divergent:
                rate = antidrift_metrics.get_shadow_divergence_rate(tenant_id) * 100.0
                if self.canary_sessions_count < self.min_sessions_for_divergence_rollback:
                    logger.warning(
                        f"Canary divergence ({rate:.1f}%) observed, but sample size ({self.canary_sessions_count} < "
                        f"{self.min_sessions_for_divergence_rollback}) is insufficient for automatic rollback."
                    )
                    return

                if rate > self.divergence_threshold_pct:
                    self._trigger_auto_rollback(
                        reason=f"Canary divergence rate ({rate:.2f}%) exceeded threshold ({self.divergence_threshold_pct:.2f}%) after {self.canary_sessions_count} sessions"
                    )

    def _trigger_auto_rollback(self, reason: str) -> None:
        """Internal: drops canary weight to 0.0% and flags rollback state."""
        self.auto_rollback_active = True
        self.rollback_reason = reason
        self.weight_pct = 0.0
        antidrift_metrics.record_canary_rollback()
        logger.error(f"[CANARY AUTO-ROLLBACK ACTIVATED]: {reason}")

    def configure(
        self,
        weight_pct: Optional[float] = None,
        reset_rollback: bool = False,
        divergence_threshold_pct: Optional[float] = None,
        enabled: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Dynamically configures canary parameters or resets tripped rollback."""
        with self._state_lock:
            if enabled is not None:
                self.enabled = bool(enabled)
            if reset_rollback:
                self.auto_rollback_active = False
                self.rollback_reason = None
                self.consecutive_hard_failures = 0
            if divergence_threshold_pct is not None:
                self.divergence_threshold_pct = max(0.0, float(divergence_threshold_pct))
            if weight_pct is not None:
                self.weight_pct = max(0.0, min(100.0, float(weight_pct)))
                antidrift_metrics.set_canary_weight(self.weight_pct / 100.0)

            return self._get_status_unlocked()

    def get_status(self) -> Dict[str, Any]:
        """Returns the current status of the Canary Traffic Router."""
        with self._state_lock:
            return self._get_status_unlocked()

    def _get_status_unlocked(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "weight_pct": self.weight_pct,
            "divergence_threshold_pct": self.divergence_threshold_pct,
            "auto_rollback_active": self.auto_rollback_active,
            "rollback_reason": self.rollback_reason,
            "consecutive_hard_failures": self.consecutive_hard_failures,
            "canary_weight_gauge": antidrift_metrics.get_canary_weight(),
        }


# Global singleton instance
canary_router = CanaryRouter()
