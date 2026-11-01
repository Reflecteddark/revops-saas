"""
packages/antidrift/observability/__init__.py
"""

from .metrics import (
    REGISTRY,
    record_context_assembled,
    record_validation_event,
    set_shadow_divergence_ratio,
    record_context_staleness,
)

__all__ = [
    "REGISTRY",
    "record_context_assembled",
    "record_validation_event",
    "set_shadow_divergence_ratio",
    "record_context_staleness",
]
