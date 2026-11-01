"""
packages/antidrift/__init__.py

RevOps Anti-Drift Engine and AgentOps Protection Layer.
"""

from .contracts import (
    ActionItem,
    ActionRiskLevel,
    ActionType,
    AgentIntentPayload,
    ApprovalDecision,
    ApprovalStatus,
    DecisionEvaluationResult,
    DecisionViolation,
    DriftSeverity,
    HITLApprovalRequest,
    ProposedClientReply,
)
from .barrier import (
    IdempotencyManager,
    IntentValidator,
    PolicyEngine,
    RiskScorer,
)

__all__ = [
    "ActionItem",
    "ActionRiskLevel",
    "ActionType",
    "AgentIntentPayload",
    "ApprovalDecision",
    "ApprovalStatus",
    "DecisionEvaluationResult",
    "DecisionViolation",
    "DriftSeverity",
    "HITLApprovalRequest",
    "ProposedClientReply",
    "IdempotencyManager",
    "IntentValidator",
    "PolicyEngine",
    "RiskScorer",
]
