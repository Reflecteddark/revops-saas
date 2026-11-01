"""
packages/antidrift/contracts/decisions.py

Hierarchical Decision Matrix specifications for Anti-Drift evaluation.
Replaces naive scalar scoring with categorical gating and strict SLAs.
"""

from __future__ import annotations

import enum
from typing import Any
from pydantic import BaseModel, Field


class DriftSeverity(str, enum.Enum):
    HARD_FAILURE = "HARD_FAILURE"  # Immediate halt, P0 alert, block release / kill-switch
    REGRESSION = "REGRESSION"      # Contract broken, mandatory action missing, reject release
    WARNING = "WARNING"            # High latency, variance, needs review before promotion
    INFO = "INFO"                  # Permitted syntactic variance, auto-pass


class DecisionViolation(BaseModel):
    rule_id: str
    severity: DriftSeverity
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class DecisionEvaluationResult(BaseModel):
    """Aggregated verdict returned by the Anti-Drift Decision Matrix."""
    overall_verdict: DriftSeverity
    is_blocking: bool
    violations: list[DecisionViolation] = Field(default_factory=list)
    action_decisions: dict[str, str] = Field(
        default_factory=dict,
        description="Action ID -> Status ('ALLOW', 'REQUIRE_APPROVAL', 'BLOCK')"
    )
    routing_target: str = Field(
        default="execution_gateway",
        description="'execution_gateway', 'hitl_approval_queue', 'shadow_log_only', 'rejection_handler'"
    )
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    requires_hitl: bool = False
