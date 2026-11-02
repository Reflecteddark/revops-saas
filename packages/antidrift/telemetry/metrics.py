"""
packages/antidrift/telemetry/metrics.py

Prometheus Metrics Registry for RevOps Anti-Drift and AgentOps Fabric.
Emits standard Prometheus text exposition format (version 0.0.4) with zero external dependencies.

Audit Fixes:
- M3: Removed high-cardinality tenant_id from Prometheus labels to prevent TSDB metric explosion.
      Per-tenant stats remain preserved in memory for targeted API inspection.
- M2: Added shadow_no_baseline_total counter to track shadow executions without production baseline.
"""

from __future__ import annotations

import threading
from typing import Dict, Tuple


class AntidriftMetricsRegistry:
    """Thread-safe Prometheus metrics registry for Anti-Drift Zero-Trust Fabric."""

    _instance: AntidriftMetricsRegistry | None = None
    _lock = threading.Lock()

    def __new__(cls) -> AntidriftMetricsRegistry:
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init_metrics()
            return cls._instance

    def _init_metrics(self) -> None:
        self._metrics_lock = threading.Lock()
        # Internal per-tenant storage: (tenant_id, policy, reason) -> count
        self._fact_failures: Dict[Tuple[str, str, str], int] = {}
        # tenant_id -> {"total": int, "divergent": int}
        self._shadow_stats: Dict[str, Dict[str, int]] = {}
        # Total shadow runs that had no baseline
        self._shadow_no_baseline: int = 0
        # (cohort, source_policy) -> count
        self._auto_vcr_counts: Dict[Tuple[str, str], int] = {}
        # Canary weight (0.05 default = 5%)
        self._canary_weight: float = 0.05
        # Total rollbacks triggered
        self._canary_rollbacks: int = 0

    def reset(self) -> None:
        """Reset all metric counters (primarily used for unit testing)."""
        with self._metrics_lock:
            self._fact_failures.clear()
            self._shadow_stats.clear()
            self._shadow_no_baseline = 0
            self._auto_vcr_counts.clear()
            self._canary_weight = 0.05
            self._canary_rollbacks = 0

    def record_fact_check_failure(self, tenant_id: str, policy: str, reason: str) -> None:
        """Increments antidrift_fact_check_failures_total counter."""
        safe_tenant = str(tenant_id or "unknown")
        safe_policy = str(policy or "UNKNOWN")
        safe_reason = str(reason or "unknown").replace('"', "").replace("\n", " ")[:60]
        key = (safe_tenant, safe_policy, safe_reason)

        with self._metrics_lock:
            self._fact_failures[key] = self._fact_failures.get(key, 0) + 1

    def record_shadow_comparison(self, tenant_id: str, is_divergent: bool) -> None:
        """Records shadow comparison to calculate shadow_divergence_rate."""
        safe_tenant = str(tenant_id or "unknown")
        with self._metrics_lock:
            if safe_tenant not in self._shadow_stats:
                self._shadow_stats[safe_tenant] = {"total": 0, "divergent": 0}
            self._shadow_stats[safe_tenant]["total"] += 1
            if is_divergent:
                self._shadow_stats[safe_tenant]["divergent"] += 1

    def record_shadow_no_baseline(self) -> None:
        """Records a shadow execution where no production baseline existed (M2)."""
        with self._metrics_lock:
            self._shadow_no_baseline += 1

    def get_shadow_divergence_rate(self, tenant_id: str) -> float:
        """Returns shadow divergence rate for a tenant (0.0 to 1.0)."""
        safe_tenant = str(tenant_id or "unknown")
        with self._metrics_lock:
            stats = self._shadow_stats.get(safe_tenant)
            if not stats or stats["total"] == 0:
                return 0.0
            return round(stats["divergent"] / stats["total"], 4)

    def get_global_shadow_divergence_rate(self) -> float:
        """Returns global aggregated divergence rate across all tenants."""
        with self._metrics_lock:
            total = sum(s["total"] for s in self._shadow_stats.values())
            divergent = sum(s["divergent"] for s in self._shadow_stats.values())
            if total == 0:
                return 0.0
            return round(divergent / total, 4)

    def record_auto_vcr_generated(self, cohort: str, source_policy: str) -> None:
        """Increments auto_vcr_scenarios_generated_total counter."""
        safe_cohort = str(cohort or "general")
        safe_policy = str(source_policy or "UNKNOWN")
        key = (safe_cohort, safe_policy)

        with self._metrics_lock:
            self._auto_vcr_counts[key] = self._auto_vcr_counts.get(key, 0) + 1

    def set_canary_weight(self, weight: float) -> None:
        """Sets current canary traffic weight (0.0 to 1.0)."""
        with self._metrics_lock:
            self._canary_weight = max(0.0, min(1.0, float(weight)))

    def get_canary_weight(self) -> float:
        """Gets current canary traffic weight."""
        with self._metrics_lock:
            return self._canary_weight

    def record_canary_rollback(self) -> None:
        """Records an automated canary rollback event and resets weight to 0.0."""
        with self._metrics_lock:
            self._canary_rollbacks += 1
            self._canary_weight = 0.0

    def to_prometheus_format(self) -> str:
        """
        Exports all registered metrics in standard Prometheus text format (v0.0.4).
        M3: Low-cardinality labels only (tenant_id omitted from labels).
        """
        lines: list[str] = []

        # 1. antidrift_fact_check_failures_total (Aggregated by policy and reason)
        lines.append("# HELP antidrift_fact_check_failures_total Total count of fact-check validation failures")
        lines.append("# TYPE antidrift_fact_check_failures_total counter")
        with self._metrics_lock:
            if not self._fact_failures:
                lines.append('antidrift_fact_check_failures_total{policy="none",reason="none"} 0')
            else:
                aggregated_failures: Dict[Tuple[str, str], int] = {}
                for (_tenant, policy, reason), val in self._fact_failures.items():
                    key = (policy, reason)
                    aggregated_failures[key] = aggregated_failures.get(key, 0) + val
                for (p, r), val in sorted(aggregated_failures.items()):
                    lines.append(f'antidrift_fact_check_failures_total{{policy="{p}",reason="{r}"}} {val}')

        # 2. shadow_divergence_rate (Global gauge, low cardinality)
        lines.append("\n# HELP shadow_divergence_rate Global ratio of divergent decisions in shadow mode")
        lines.append("# TYPE shadow_divergence_rate gauge")
        global_rate = self.get_global_shadow_divergence_rate()
        lines.append(f"shadow_divergence_rate {global_rate}")

        # 3. shadow_no_baseline_total (M2 counter)
        lines.append("\n# HELP shadow_no_baseline_total Total count of shadow runs without a prod baseline")
        lines.append("# TYPE shadow_no_baseline_total counter")
        with self._metrics_lock:
            lines.append(f"shadow_no_baseline_total {self._shadow_no_baseline}")

        # 4. auto_vcr_scenarios_generated_total
        lines.append("\n# HELP auto_vcr_scenarios_generated_total Total count of VCR regression scenarios automatically generated")
        lines.append("# TYPE auto_vcr_scenarios_generated_total counter")
        with self._metrics_lock:
            if not self._auto_vcr_counts:
                lines.append('auto_vcr_scenarios_generated_total{cohort="none",policy="none"} 0')
            else:
                for (c, p), val in sorted(self._auto_vcr_counts.items()):
                    lines.append(f'auto_vcr_scenarios_generated_total{{cohort="{c}",policy="{p}"}} {val}')

        # 5. canary_traffic_weight
        lines.append("\n# HELP canary_traffic_weight Percentage of live traffic allocated to canary runtime (0.0 to 1.0)")
        lines.append("# TYPE canary_traffic_weight gauge")
        with self._metrics_lock:
            lines.append(f"canary_traffic_weight {self._canary_weight}")

        # 6. canary_rollbacks_total
        lines.append("\n# HELP canary_rollbacks_total Total count of automated canary aborts and rollbacks triggered")
        lines.append("# TYPE canary_rollbacks_total counter")
        with self._metrics_lock:
            lines.append(f"canary_rollbacks_total {self._canary_rollbacks}")

        lines.append("")
        return "\n".join(lines)


# Global singleton instance
antidrift_metrics = AntidriftMetricsRegistry()
