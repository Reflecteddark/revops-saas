"""
tests/antidrift/test_antidrift_risk_scorer.py

Tests for RiskScorer: deal amounts, conflict keywords, and canary eligibility.
Zero hardcoding: dynamic tenant IDs per scenario.
"""

import uuid
from packages.antidrift.contracts.intent import (
    ActionItem,
    ActionType,
    AgentIntentPayload,
)
from packages.antidrift.barrier.risk_scorer import RiskScorer


def make_risk_intent(**overrides) -> AgentIntentPayload:
    base = {
        "session_id": f"sess_{uuid.uuid4().hex[:8]}",
        "tenant_id": f"tenant_{uuid.uuid4().hex[:8]}",
        "channel": "whatsapp",
        "source_event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "agent_id": "lead-qualifier",
        "harness_version": "v14.3.0",
        "intent": "TEST_INTENT",
        "confidence_score": 0.95,
        "capability_scopes": ["crm.read", "crm.update_stage"],
        "proposed_actions": [
            ActionItem(
                action_type=ActionType.CRM_UPDATE_STAGE,
                target_type="deal",
                target_id="deal-1",
            )
        ],
    }
    base.update(overrides)
    return AgentIntentPayload(**base)


def test_standard_lead_is_low_risk_and_canary_eligible():
    intent = make_risk_intent()
    result = RiskScorer.calculate_risk(
        intent=intent,
        client_message="Здравствуйте, подскажите стоимость тарифа",
        deal_context={"budget": 50000},
    )
    assert result.risk_level == "low"
    assert result.canary_eligible is True
    assert result.requires_hitl is False


def test_large_deal_is_high_risk_and_canary_ineligible():
    intent = make_risk_intent()
    result = RiskScorer.calculate_risk(
        intent=intent,
        client_message="Интересует внедрение платформы на филиалы",
        deal_context={"budget": 450000},
    )
    assert result.risk_level in ("high", "critical")
    assert result.canary_eligible is False
    assert result.requires_hitl is True
    assert any("Large deal amount" in r for r in result.reasons)


def test_conflict_legal_signal_raises_risk():
    intent = make_risk_intent()
    result = RiskScorer.calculate_risk(
        intent=intent,
        client_message="Сорвали поставку! Я уже подготовил досудебную претензию юристам!",
        deal_context={"budget": 40000},
    )
    assert result.risk_level in ("medium", "high")
    assert any("Legal/Conflict signal" in r for r in result.reasons)
    assert result.canary_eligible is False
