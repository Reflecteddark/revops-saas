"""
packages/antidrift/barrier/risk_scorer.py

Multi-factor Risk Scoring Engine.
Computes risk_score (0.0 to 1.0), risk_level (low/medium/high/critical),
reasons list, and determines canary eligibility.
"""

from __future__ import annotations

import re
from typing import Any
from pydantic import BaseModel, Field
from packages.antidrift.contracts.intent import (
    ActionRiskLevel,
    ActionType,
    AgentIntentPayload,
)

HIGH_RISK_KEYWORDS = [
    re.compile(r"\bпретензи[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bсуд[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bдосудебн[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bпрокуратур[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bюрист[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bскандал[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bмошенник[а-я]*\b", re.IGNORECASE),
    re.compile(r"\bверните\s+деньги\b", re.IGNORECASE),
]


class RiskScoringResult(BaseModel):
    risk_score: float = Field(ge=0.0, le=1.0)
    risk_level: str  # low, medium, high, critical
    reasons: list[str] = Field(default_factory=list)
    canary_eligible: bool = True
    requires_hitl: bool = False


class RiskScorer:
    """Calculates risk based on financial volume, conflict signals, and action types."""

    LARGE_DEAL_THRESHOLD = 300_000.0   # 300k RUB -> High Risk
    ENTERPRISE_DEAL_THRESHOLD = 1_000_000.0  # 1M RUB -> Critical Risk

    @classmethod
    def calculate_risk(
        cls,
        intent: AgentIntentPayload,
        client_message: str = "",
        deal_context: dict[str, Any] | None = None,
    ) -> RiskScoringResult:
        score = 0.0
        reasons: list[str] = []
        deal = deal_context or {}

        # 1. Financial volume check
        deal_amount = float(deal.get("budget") or deal.get("amount") or 0.0)
        if deal_amount >= cls.ENTERPRISE_DEAL_THRESHOLD:
            score += 0.75
            reasons.append(f"Enterprise deal amount: {deal_amount:,.0f} ₽ (≥ {cls.ENTERPRISE_DEAL_THRESHOLD:,.0f} ₽)")
        elif deal_amount >= cls.LARGE_DEAL_THRESHOLD:
            score += 0.50
            reasons.append(f"Large deal amount: {deal_amount:,.0f} ₽ (≥ {cls.LARGE_DEAL_THRESHOLD:,.0f} ₽)")

        # 2. Conflict & Legal keywords in client message
        if client_message:
            for pattern in HIGH_RISK_KEYWORDS:
                if pattern.search(client_message):
                    score += 0.40
                    reasons.append(f"Legal/Conflict signal detected: '{pattern.pattern}'")
                    break

        # 3. Action type risk weights
        for action in intent.proposed_actions:
            if action.action_type in (ActionType.CRM_CLOSE_DEAL_LOST, ActionType.CRM_CLOSE_DEAL_WON):
                score += 0.35
                reasons.append(f"High impact deal status mutation: '{action.action_type.value}'")
            elif action.action_type == ActionType.CRM_CHANGE_BUDGET:
                score += 0.30
                reasons.append("Financial parameter mutation: 'crm_change_budget'")
            elif action.risk_level in (ActionRiskLevel.HIGH, ActionRiskLevel.CRITICAL):
                score += 0.25
                reasons.append(f"High risk action: '{action.action_type.value}'")

        # 4. Agent self-reported confidence discount
        if intent.confidence_score < 0.60:
            score += 0.20
            reasons.append(f"Low agent confidence score: {intent.confidence_score:.2f}")

        # Clamp score between 0.0 and 1.0
        final_score = min(1.0, max(0.0, score))

        # Categorize
        if final_score >= 0.75:
            level = "critical"
            canary_eligible = False
            requires_hitl = True
        elif final_score >= 0.50:
            level = "high"
            canary_eligible = False
            requires_hitl = True
        elif final_score >= 0.25:
            level = "medium"
            canary_eligible = False  # Canary only for low risk
            requires_hitl = False
        else:
            level = "low"
            canary_eligible = True
            requires_hitl = False

        return RiskScoringResult(
            risk_score=round(final_score, 2),
            risk_level=level,
            reasons=reasons,
            canary_eligible=canary_eligible,
            requires_hitl=requires_hitl,
        )
