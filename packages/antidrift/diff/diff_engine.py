"""
packages/antidrift/diff/diff_engine.py

Shadow Comparator and Behavioral Diff Engine.
Compares candidate shadow executions against production baselines:
- Semantic intent alignment
- Proposed action signatures & parameters
- State mutation delta discrepancies
- HARD_FAILURE frequency growth
- Risk score drift & confidence deflation
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.antidrift.contracts.intent import ExecutionMode, VerifiedIntentProposal
from packages.antidrift.models import AgentTrace, HarnessRegistry

logger = logging.getLogger("antidrift_diff_engine")


class ShadowDivergenceMetric(BaseModel):
    """Normalized metrics capturing behavioral divergence between Shadow and Prod."""
    intent_match: bool = True
    actions_delta_count: int = 0
    state_delta_divergence: bool = False
    risk_score_delta: float = 0.0
    is_hard_failure: bool = False
    divergence_score: float = 0.0
    reasons: list[str] = Field(default_factory=list)


class DiffEngine:
    """
    Evaluates behavioral delta between shadow candidate execution
    and baseline production traces.
    """

    MAX_ACCEPTABLE_DIVERGENCE_PCT: float = 15.0

    @classmethod
    def compare_proposals(
        cls,
        prod_proposal: Any = None,
        shadow_proposal: Any = None,
        shadow_would_be_blocked: bool = False,
    ) -> ShadowDivergenceMetric:
        """
        Calculates atomic divergence metric between a production proposal and a shadow proposal.
        """
        reasons: list[str] = []
        divergence = 0.0

        prod_dict = prod_proposal if isinstance(prod_proposal, dict) else (prod_proposal.model_dump() if prod_proposal else {})
        shadow_dict = shadow_proposal if isinstance(shadow_proposal, dict) else shadow_proposal.model_dump()

        # 1. Intent Semantic Alignment (Weight: 35%)
        prod_intent = prod_dict.get("intent")
        shadow_intent = shadow_dict.get("intent")
        intent_match = (prod_intent == shadow_intent) if prod_intent else True
        if prod_intent and not intent_match:
            divergence += 0.35
            reasons.append(f"Intent mismatched: Prod='{prod_intent}' vs Shadow='{shadow_intent}'")

        # 2. Proposed Actions Delta (Weight: 35%)
        prod_actions = prod_dict.get("proposed_actions", [])
        shadow_actions = shadow_dict.get("proposed_actions", [])
        prod_action_sigs = sorted([f"{a.get('action_type')}:{a.get('target_type')}:{a.get('target_id')}" for a in prod_actions])
        shadow_action_sigs = sorted([f"{a.get('action_type')}:{a.get('target_type')}:{a.get('target_id')}" for a in shadow_actions])
        actions_delta_count = abs(len(prod_action_sigs) - len(shadow_action_sigs))
        if prod_action_sigs != shadow_action_sigs:
            divergence += min(0.35, 0.15 * max(1, actions_delta_count))
            reasons.append(f"Action signature delta: Prod={prod_action_sigs} vs Shadow={shadow_action_sigs}")

        # 3. Expected State Delta Divergence (Weight: 15%)
        prod_delta = prod_dict.get("expected_state_delta", {})
        shadow_delta = shadow_dict.get("expected_state_delta", {})
        state_diverged = False
        if prod_delta and shadow_delta and prod_delta != shadow_delta:
            state_diverged = True
            divergence += 0.15
            reasons.append("Expected state delta mismatch between Prod and Shadow")

        # 4. Risk Score Drift (Weight: 15%)
        prod_risk = float(prod_dict.get("risk_score", 0.0) or 0.0)
        shadow_risk = float(shadow_dict.get("risk_score", 0.0) or 0.0)
        risk_delta = round(shadow_risk - prod_risk, 3)
        if risk_delta > 0.15:
            divergence += min(0.15, risk_delta * 0.5)
            reasons.append(f"Risk increased in shadow: +{risk_delta:.2f} ({prod_risk} -> {shadow_risk})")

        # 5. Hard Failure in Shadow (Penalty)
        if shadow_would_be_blocked:
            divergence += 0.40
            reasons.append("Shadow proposal triggered HARD_FAILURE guardrail breach")

        total_divergence = min(1.0, round(divergence, 3))

        return ShadowDivergenceMetric(
            intent_match=intent_match,
            actions_delta_count=actions_delta_count,
            state_delta_divergence=state_diverged,
            risk_score_delta=risk_delta,
            is_hard_failure=shadow_would_be_blocked,
            divergence_score=total_divergence,
            reasons=reasons,
        )

    @classmethod
    def compare_shadow_vs_prod_traces(
        cls,
        db: Session,
        harness_version: str,
        lookback_limit: int = 100,
    ) -> dict[str, Any]:
        """
        Aggregates divergence report comparing recent shadow traces for harness_version
        against baseline production traces.
        """
        shadow_traces = (
            db.query(AgentTrace)
            .filter(
                AgentTrace.harness_version == harness_version,
                AgentTrace.execution_mode == "shadow",
            )
            .order_by(AgentTrace.created_at.desc())
            .limit(lookback_limit)
            .all()
        )

        total_shadow = len(shadow_traces)
        if total_shadow == 0:
            return {
                "harness_version": harness_version,
                "total_shadow_traces": 0,
                "paired_prod_traces": 0,
                "intent_agreement_pct": 100.0,
                "action_agreement_pct": 100.0,
                "hard_failures_shadow": 0,
                "avg_risk_delta": 0.0,
                "divergence_score_pct": 0.0,
                "is_acceptable": True,
                "status": "INSUFFICIENT_DATA",
                "summary": f"No shadow traces found for version {harness_version}",
            }

        paired_count = 0
        intent_matches = 0
        action_matches = 0
        hard_failures = 0
        risk_deltas: list[float] = []
        divergence_accum: float = 0.0

        for st in shadow_traces:
            if st.execution_mode == "blocked" or (st.guardrail_result_json and st.guardrail_result_json.get("overall_verdict") == "HARD_FAILURE"):
                hard_failures += 1

            # Match production trace by source_event_id or session_id
            prod_trace = (
                db.query(AgentTrace)
                .filter(
                    AgentTrace.source_event_id == st.source_event_id,
                    AgentTrace.execution_mode != "shadow",
                )
                .first()
            )

            shadow_raw = st.raw_intent_json or {}
            prod_raw = prod_trace.raw_intent_json if prod_trace else {}

            metric = cls.compare_proposals(
                prod_proposal=prod_raw,
                shadow_proposal=shadow_raw,
                shadow_would_be_blocked=bool(st.error and "Blocked" in st.error),
            )

            if prod_trace:
                paired_count += 1
                if metric.intent_match:
                    intent_matches += 1
                if metric.actions_delta_count == 0:
                    action_matches += 1
                risk_deltas.append(metric.risk_score_delta)

            divergence_accum += metric.divergence_score

        avg_divergence_pct = round((divergence_accum / max(1, total_shadow)) * 100, 2)
        intent_pct = round((intent_matches / max(1, paired_count)) * 100, 1) if paired_count > 0 else 100.0
        action_pct = round((action_matches / max(1, paired_count)) * 100, 1) if paired_count > 0 else 100.0
        avg_risk_delta = round(sum(risk_deltas) / max(1, len(risk_deltas)), 3) if risk_deltas else 0.0

        is_acceptable = (
            avg_divergence_pct <= cls.MAX_ACCEPTABLE_DIVERGENCE_PCT
            and hard_failures == 0
        )

        status_str = "ACCEPTABLE" if is_acceptable else ("CRITICAL_DRIFT" if hard_failures > 0 else "DEGRADED")

        return {
            "harness_version": harness_version,
            "total_shadow_traces": total_shadow,
            "paired_prod_traces": paired_count,
            "intent_agreement_pct": intent_pct,
            "action_agreement_pct": action_pct,
            "hard_failures_shadow": hard_failures,
            "avg_risk_delta": avg_risk_delta,
            "divergence_score_pct": avg_divergence_pct,
            "is_acceptable": is_acceptable,
            "status": status_str,
            "summary": (
                f"Shadow {harness_version}: Divergence={avg_divergence_pct}%, "
                f"IntentMatch={intent_pct}%, HardFailures={hard_failures}, Status={status_str}"
            ),
        }

    @classmethod
    def resolve_traffic_mode(
        cls,
        db: Session,
        agent_id: str,
        harness_version: str,
        session_id: str,
    ) -> ExecutionMode:
        """
        Smart Traffic Router:
        Inspects harness registry. If candidate version is in 'SHADOW_RUNNING',
        routes 10% deterministically based on session_id hash.
        Otherwise adheres to harness status.
        """
        registry_entry = (
            db.query(HarnessRegistry)
            .filter(
                HarnessRegistry.agent_id == agent_id,
                HarnessRegistry.version == harness_version,
            )
            .first()
        )

        if not registry_entry:
            return ExecutionMode.PROD

        if registry_entry.status == "SHADOW_RUNNING":
            # 10% traffic routing deterministic on session_id
            bucket = int(hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:4], 16) % 100
            if bucket < 10:
                return ExecutionMode.SHADOW
            return ExecutionMode.PROD

        if registry_entry.status == "ACTIVE":
            return ExecutionMode.PROD

        if registry_entry.status == "SHADOW_ONLY":
            return ExecutionMode.SHADOW

        return ExecutionMode.PROD
