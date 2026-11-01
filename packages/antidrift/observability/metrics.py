"""
packages/antidrift/observability/metrics.py

Production AgentOps & Anti-Drift Observability Metrics.
Lightweight, thread-safe, zero external dependency Prometheus metric exporter.
"""

from __future__ import annotations

import threading
from typing import Any, Optional


class MetricRegistry:
    """Thread-safe in-memory metric store emitting Prometheus exposition text format."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.counters: dict[str, dict[tuple, float]] = {}
        self.gauges: dict[str, dict[tuple, float]] = {}
        self.histograms: dict[str, dict[tuple, list[float]]] = {}

    def inc_counter(self, name: str, labels: dict[str, str], value: float = 1.0) -> None:
        key = tuple(sorted(labels.items()))
        with self._lock:
            if name not in self.counters:
                self.counters[name] = {}
            self.counters[name][key] = self.counters[name].get(key, 0.0) + value

    def set_gauge(self, name: str, labels: dict[str, str], value: float) -> None:
        key = tuple(sorted(labels.items()))
        with self._lock:
            if name not in self.gauges:
                self.gauges[name] = {}
            self.gauges[name][key] = float(value)

    def observe_histogram(self, name: str, labels: dict[str, str], value: float) -> None:
        key = tuple(sorted(labels.items()))
        with self._lock:
            if name not in self.histograms:
                self.histograms[name] = {}
            if key not in self.histograms[name]:
                self.histograms[name][key] = []
            self.histograms[name][key].append(float(value))

    def reset(self) -> None:
        with self._lock:
            self.counters.clear()
            self.gauges.clear()
            self.histograms.clear()

    def generate_prometheus_text(self) -> str:
        lines: list[str] = []
        with self._lock:
            for name, metrics in sorted(self.counters.items()):
                lines.append(f"# TYPE {name} counter")
                for label_pairs, val in sorted(metrics.items()):
                    if label_pairs:
                        lbl_str = ",".join(f'{k}="{v}"' for k, v in label_pairs)
                        lines.append(f"{name}{{{lbl_str}}} {val}")
                    else:
                        lines.append(f"{name} {val}")

            for name, metrics in sorted(self.gauges.items()):
                lines.append(f"# TYPE {name} gauge")
                for label_pairs, val in sorted(metrics.items()):
                    if label_pairs:
                        lbl_str = ",".join(f'{k}="{v}"' for k, v in label_pairs)
                        lines.append(f"{name}{{{lbl_str}}} {val}")
                    else:
                        lines.append(f"{name} {val}")

            for h_name, h_metrics in sorted(self.histograms.items()):
                lines.append(f"# TYPE {h_name} histogram")
                for label_pairs, observations in sorted(h_metrics.items()):
                    lbl_str = ",".join(f'{k}="{v}"' for k, v in label_pairs)
                    prefix = f"{{{lbl_str}}}" if lbl_str else ""
                    lines.append(f"{h_name}_count{prefix} {len(observations)}")
                    lines.append(f"{h_name}_sum{prefix} {sum(observations):.4f}")
        return "\n".join(lines) + "\n"


REGISTRY = MetricRegistry()


def record_context_assembled(status: str, tenant_id: str = "") -> None:
    """Records context assembly attempt (status: success or error)."""
    REGISTRY.inc_counter(
        "antidrift_context_assembled_total",
        {"status": status, "tenant_id": tenant_id or "default"},
    )


def record_validation_event(guardrail: str, result: str) -> None:
    """Records barrier validation outcome (result: passed or blocked)."""
    REGISTRY.inc_counter(
        "antidrift_validations_total",
        {"guardrail": guardrail, "result": result},
    )


def set_shadow_divergence_ratio(harness_version: str, ratio: float) -> None:
    """Updates active shadow divergence ratio for a candidate version."""
    REGISTRY.set_gauge(
        "antidrift_shadow_divergence_ratio",
        {"harness_version": harness_version},
        ratio,
    )


def record_context_staleness(age_seconds: float) -> None:
    """Observes staleness latency of active context."""
    REGISTRY.observe_histogram(
        "antidrift_staleness_seconds",
        {},
        age_seconds,
    )
