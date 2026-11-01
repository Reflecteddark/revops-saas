"""
packages/antidrift/barrier/policy_engine.py

Declarative Policy & Safety Guardrails Engine.
Applies hard rules (GR-01..GR-05) to AgentIntentPayload.
Categorizes violations into Hard Failure, Regression, Warning, or Info.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

logger = logging.getLogger("antidrift_policy_engine")
from packages.antidrift.contracts.intent import (
    ActionRiskLevel,
    ActionType,
    AgentIntentPayload,
)
from packages.antidrift.contracts.decisions import (
    DecisionEvaluationResult,
    DecisionViolation,
    DriftSeverity,
)


DISCOUNT_KEYWORDS = [
    re.compile(r"\bскидк[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bдисконт[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bуступк[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bбесплатн[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bвозврат\s+денег\b", re.IGNORECASE),
    re.compile(r"\bотсрочк[а-я]*\b", re.IGNORECASE),
    re.compile(r"\b\d+\s*%", re.IGNORECASE),
]

HUMAN_OPERATOR_TRIGGERS = [
    re.compile(r"\bчеловек[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bоператор[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bменеджер[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bживого\b", re.IGNORECASE),
    re.compile(r"\bнадоели\s+боты\b", re.IGNORECASE),
    re.compile(r"\bпозови\b", re.IGNORECASE),
    re.compile(r"\bсоедини\b", re.IGNORECASE),
]


class PolicyEngine:
    """Evaluates agent intents against mandatory organizational safety guardrails."""

    @classmethod
    def evaluate_intent(
        cls,
        intent: AgentIntentPayload,
        client_inbound_message: str = "",
        current_deal_context: dict[str, Any] | None = None,
    ) -> DecisionEvaluationResult:
        violations: list[DecisionViolation] = []
        action_decisions: dict[str, str] = {}
        requires_hitl = False

        current_deal = current_deal_context or {}

        # -------------------------------------------------------------
        # GR-04: Right to Human (Право на человека / оператора)
        # -------------------------------------------------------------
        if client_inbound_message:
            for pattern in HUMAN_OPERATOR_TRIGGERS:
                if pattern.search(client_inbound_message):
                    # Client explicitly requested human assistance
                    if not (intent.escalation and intent.escalation.required):
                        violations.append(
                            DecisionViolation(
                                rule_id="GR-04_HUMAN_OPERATOR_REQUIRED",
                                severity=DriftSeverity.HARD_FAILURE,
                                message="Client explicitly requested human operator, but agent attempted autonomous reply without escalation.",
                            )
                        )

        # -------------------------------------------------------------
        # Inspect Proposed Client Reply for Financial & Legal Promises
        # -------------------------------------------------------------
        if intent.proposed_client_reply:
            reply_text = intent.proposed_client_reply.text
            for pattern in DISCOUNT_KEYWORDS:
                if pattern.search(reply_text):
                    violations.append(
                        DecisionViolation(
                            rule_id="GR-03_DISCOUNT_PROMISE_GUARD",
                            severity=DriftSeverity.HARD_FAILURE,
                            message=f"Unauthorized financial/discount promise detected in client reply: '{pattern.pattern}'",
                        )
                    )

        # -------------------------------------------------------------
        # Inspect Proposed Actions
        # -------------------------------------------------------------
        for action in intent.proposed_actions:
            action_id = action.action_id
            action_type = action.action_type

            # Rule: Absolute ban on destructive deletion
            if action_type == ActionType.CRM_DELETE_ENTITY:
                violations.append(
                    DecisionViolation(
                        rule_id="GR-00_DESTRUCTIVE_DELETE_FORBIDDEN",
                        severity=DriftSeverity.HARD_FAILURE,
                        message="Direct deletion of CRM entities is strictly prohibited.",
                        details={"action_id": action_id},
                    )
                )
                action_decisions[action_id] = "BLOCK"
                continue

            # GR-01: Budget Guard (Changing deal budget without explicit approval)
            if action_type == ActionType.CRM_CHANGE_BUDGET:
                new_budget = action.payload.get("budget", 0)
                old_budget = current_deal.get("budget", 0)
                if new_budget != old_budget:
                    # Budget changes require mandatory HITL approval
                    violations.append(
                        DecisionViolation(
                            rule_id="GR-01_BUDGET_GUARD",
                            severity=DriftSeverity.WARNING,
                            message=f"Attempting to modify budget from {old_budget} to {new_budget}. Requires human approval.",
                            details={"action_id": action_id, "new_budget": new_budget},
                        )
                    )
                    action_decisions[action_id] = "REQUIRE_APPROVAL"
                    requires_hitl = True
                    continue

            # GR-02: Anti-Churn Guard (Closing deal as LOST without mandatory reason)
            if action_type == ActionType.CRM_CLOSE_DEAL_LOST:
                loss_reason = action.payload.get("loss_reason", "").strip()
                if not loss_reason:
                    violations.append(
                        DecisionViolation(
                            rule_id="GR-02_ANTI_CHURN_LOSS_REASON_GUARD",
                            severity=DriftSeverity.HARD_FAILURE,
                            message="Closing deal as LOST requires an explicit, valid loss_reason.",
                            details={"action_id": action_id},
                        )
                    )
                    action_decisions[action_id] = "BLOCK"
                    continue
                else:
                    # Closing deals is high risk -> requires HITL
                    action_decisions[action_id] = "REQUIRE_APPROVAL"
                    requires_hitl = True
                    continue

            # GR-05: Forbidden stage jumps (e.g. directly to WON without payment)
            if action_type == ActionType.CRM_CLOSE_DEAL_WON:
                has_payment = action.payload.get("invoice_paid", False) or current_deal.get("invoice_paid", False)
                if not has_payment:
                    violations.append(
                        DecisionViolation(
                            rule_id="GR-05_CLOSE_WON_WITHOUT_PAYMENT",
                            severity=DriftSeverity.HARD_FAILURE,
                            message="Cannot close deal as WON without verified payment.",
                            details={"action_id": action_id},
                        )
                    )
                    action_decisions[action_id] = "BLOCK"
                    continue

            # Default action permission
            if action.risk_level in (ActionRiskLevel.HIGH, ActionRiskLevel.CRITICAL):
                action_decisions[action_id] = "REQUIRE_APPROVAL"
                requires_hitl = True
            else:
                action_decisions[action_id] = "ALLOW"

        # -------------------------------------------------------------
        # Aggregate Severity & Determine Verdict
        # -------------------------------------------------------------
        has_hard_failure = any(v.severity == DriftSeverity.HARD_FAILURE for v in violations)
        has_regression = any(v.severity == DriftSeverity.REGRESSION for v in violations)
        has_warning = any(v.severity == DriftSeverity.WARNING for v in violations)

        if has_hard_failure:
            overall_verdict = DriftSeverity.HARD_FAILURE
            is_blocking = True
            routing_target = "rejection_handler"
        elif has_regression:
            overall_verdict = DriftSeverity.REGRESSION
            is_blocking = True
            routing_target = "rejection_handler"
        elif has_warning or requires_hitl:
            overall_verdict = DriftSeverity.WARNING
            is_blocking = False
            routing_target = "hitl_approval_queue"
        else:
            overall_verdict = DriftSeverity.INFO
            is_blocking = False
            routing_target = "execution_gateway"

        return DecisionEvaluationResult(
            overall_verdict=overall_verdict,
            is_blocking=is_blocking,
            violations=violations,
            action_decisions=action_decisions,
            routing_target=routing_target,
            risk_score=intent.risk_score,
            requires_hitl=requires_hitl,
        )


class HardFailureRateLimiter:
    """
    Rate-limits the generation/auto-capture of pending VCR scenarios
    or incident creation on repeated HARD_FAILURE to prevent queue flooding / DoS attacks.
    Default limit: max 5 captures per 60 seconds per session.
    """
    _history: dict[str, list[float]] = {}
    _window_seconds: int = 60
    _max_per_window: int = 5

    @classmethod
    def should_record_scenario(cls, session_id: str, now_ts: Optional[float] = None) -> bool:
        """
        Returns True if a scenario or incident may be generated for this session.
        Returns False and logs warning if rate limit (5/min) is exceeded.
        """
        import time
        t = now_ts if now_ts is not None else time.time()
        cutoff = t - cls._window_seconds

        session_timestamps = cls._history.get(session_id, [])
        valid_timestamps = [ts for ts in session_timestamps if ts > cutoff]

        if len(valid_timestamps) >= cls._max_per_window:
            logger.warning(
                f"Rate limit exceeded for HARD_FAILURE scenario capture on session '{session_id}' "
                f"({len(valid_timestamps)}/{cls._max_per_window} in last {cls._window_seconds}s). "
                f"Blocking verdict is enforced, but scenario capture is throttled."
            )
            cls._history[session_id] = valid_timestamps
            return False

        valid_timestamps.append(t)
        cls._history[session_id] = valid_timestamps
        return True

    @classmethod
    def reset(cls) -> None:
        """Resets rate limiter state (useful in tests)."""
        cls._history.clear()
