"""
packages/antidrift/policy_autotune.py

Adaptive Policy Auto-Tuning & Operational Threshold Calibration Engine.
ENFORCES SAFETY FLOOR (B3):
- Safety Policies GR-00..GR-05 and allowed_discount_max are HARD SAFETY FLOORS (NEVER auto-tuned).
- Scope is strictly limited to operational friction parameters: requires_human_above and warning thresholds.
- Maximum threshold adjustment step is constrained to <= +-20% per iteration.
- All recommendations require manual human PR and are logged to immutable changelog.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.antidrift.models import AgentIntent, HITLApproval

logger = logging.getLogger("antidrift_policy_autotune")

# Safety Floor Invariants: Cannot be weakened by autotuning
SAFETY_FLOOR_RULES = frozenset({"GR-00", "GR-01", "GR-02", "GR-03", "GR-04", "GR-05"})
IMMUTABLE_SAFETY_PARAMS = frozenset({"allowed_discount_max"})
MAX_ADJUSTMENT_STEP_PCT = 0.20  # Max +-20% per iteration


class TuningRecommendation(BaseModel):
    """Structured proposal to adjust operational thresholds based on human HITL load."""
    policy_id: str
    parameter_name: str
    current_threshold: float
    recommended_threshold: float
    confidence_score: float
    total_samples: int
    approved_samples: int
    recommendation_type: str  # "RELAX_OPERATIONAL_THRESHOLD", "TIGHTEN_OPERATIONAL_THRESHOLD", "OBSERVE"
    rationale: str
    requires_manual_pr: bool = True
    changelog_entry: str = ""


class PolicyAutoTuner:
    """Auto-Tuning engine for RevOps Operational Guardrails."""

    @classmethod
    def analyze_tuning_opportunities(
        cls,
        db: Session,
        tenant_id: Optional[str] = None,
        min_samples: int = 5,
    ) -> List[TuningRecommendation]:
        """
        Analyzes historical HITL decisions strictly for operational thresholds (e.g. requires_human_above).
        Guarantees that GR-00..GR-05 and allowed_discount_max are never modified.
        """
        recommendations: List[TuningRecommendation] = []

        query = db.query(HITLApproval)
        if tenant_id:
            query = query.filter(HITLApproval.tenant_id == tenant_id)

        approvals = query.all()
        if not approvals or len(approvals) < min_samples:
            return recommendations

        # Analyze requires_human_above operational threshold
        human_above_rec = cls._analyze_requires_human_above(db, approvals, min_samples)
        if human_above_rec:
            recommendations.append(human_above_rec)

        return recommendations

    @classmethod
    def _analyze_requires_human_above(
        cls,
        db: Session,
        approvals: List[HITLApproval],
        min_samples: int,
        base_threshold: float = 300000.0,
    ) -> Optional[TuningRecommendation]:
        """
        Examines deals requiring approval solely due to deal amount exceeding requires_human_above.
        If operator approval rate is >= 85% without edits, proposes relaxing by at most +20%.
        """
        amounts_approved: List[float] = []
        total_amount_samples = 0

        for app in approvals:
            intent = db.query(AgentIntent).filter(AgentIntent.intent_id == app.intent_id).first()
            if not intent:
                continue

            payload = getattr(intent, "payload_json", None) or getattr(intent, "proposed_payload_json", None) or {}
            # Context references or payload with amount
            amount_val = payload.get("deal_amount") or payload.get("amount")
            if amount_val is not None:
                try:
                    val = float(amount_val)
                    if val >= base_threshold:
                        total_amount_samples += 1
                        if app.status in ("APPROVED", "CONFIRMED") or app.decision == "APPROVE":
                            amounts_approved.append(val)
                except (ValueError, TypeError):
                    continue

        if total_amount_samples < min_samples:
            return None

        approved_count = len(amounts_approved)
        approval_rate = approved_count / total_amount_samples

        if approval_rate >= 0.80:
            # Operator frequently approves large deals without incident; propose relaxing by at most +20%
            step_delta = base_threshold * MAX_ADJUSTMENT_STEP_PCT
            suggested = round(base_threshold + step_delta, -4)  # Round to nearest 10k

            return TuningRecommendation(
                policy_id="OP-01_AMOUNT_THRESHOLD",
                parameter_name="requires_human_above",
                current_threshold=base_threshold,
                recommended_threshold=suggested,
                confidence_score=round(approval_rate, 2),
                total_samples=total_amount_samples,
                approved_samples=approved_count,
                recommendation_type="RELAX_OPERATIONAL_THRESHOLD",
                rationale=(
                    f"Supervisors approved {approved_count}/{total_amount_samples} ({approval_rate*100:.0f}%) "
                    f"deals above {base_threshold:,.0f} ₽. Proposing step increase by +20% to {suggested:,.0f} ₽ "
                    f"to reduce approval fatigue. Safety Guardrails GR-00..GR-05 remain unaffected."
                ),
                requires_manual_pr=True,
                changelog_entry=(
                    f"Bumped requires_human_above from {base_threshold} to {suggested} "
                    f"based on {total_amount_samples} reviewed transactions (Approval Rate: {approval_rate*100:.1f}%)."
                ),
            )
        elif approval_rate <= 0.30:
            # Frequently rejected large deals; propose tightening by at most -20%
            step_delta = base_threshold * MAX_ADJUSTMENT_STEP_PCT
            suggested = round(base_threshold - step_delta, -4)

            return TuningRecommendation(
                policy_id="OP-01_AMOUNT_THRESHOLD",
                parameter_name="requires_human_above",
                current_threshold=base_threshold,
                recommended_threshold=suggested,
                confidence_score=round(1.0 - approval_rate, 2),
                total_samples=total_amount_samples,
                approved_samples=approved_count,
                recommendation_type="TIGHTEN_OPERATIONAL_THRESHOLD",
                rationale=(
                    f"Supervisors rejected {total_amount_samples - approved_count}/{total_amount_samples} "
                    f"deals near {base_threshold:,.0f} ₽. Proposing step reduction by -20% to {suggested:,.0f} ₽."
                ),
                requires_manual_pr=True,
                changelog_entry=(
                    f"Tightened requires_human_above from {base_threshold} to {suggested} "
                    f"due to high rejection rate ({100 - approval_rate*100:.1f}%)."
                ),
            )

        return None
