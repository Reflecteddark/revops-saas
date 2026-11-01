"""
tests/antidrift/test_antidrift_intent_validator.py

Tests for IntentValidator: capability scopes, payload sanitation, and injection defense.
No hardcoded tenant IDs: dynamically generated per test.
"""

import uuid
import pytest
from packages.antidrift.contracts.intent import (
    ActionItem,
    ActionType,
    AgentIntentPayload,
    ProposedClientReply,
)
from packages.antidrift.barrier.validator import IntentValidator


def create_base_intent(**overrides) -> AgentIntentPayload:
    dynamic_tenant = f"tenant_{uuid.uuid4().hex[:8]}"
    base = {
        "session_id": f"sess_{uuid.uuid4().hex[:8]}",
        "tenant_id": dynamic_tenant,
        "channel": "whatsapp",
        "source_event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "agent_id": "lead-qualifier",
        "harness_version": "v14.3.0",
        "intent": "QUALIFY_LEAD",
        "reasoning_summary": "Lead responded with interest in B2B audit",
        "confidence_score": 0.95,
        "capability_scopes": ["crm.update_stage", "crm.create_task"],
        "proposed_actions": [
            ActionItem(
                action_type=ActionType.CRM_UPDATE_STAGE,
                target_type="deal",
                target_id=f"deal_{uuid.uuid4().hex[:6]}",
                payload={"stage": "Квалифицирован"},
            )
        ],
        "proposed_client_reply": ProposedClientReply(
            text="Отлично, зафиксировал информацию!",
            tone="business",
        ),
    }
    base.update(overrides)
    return AgentIntentPayload(**base)


def test_valid_intent_passes():
    intent = create_base_intent()
    violations = IntentValidator.validate_intent(intent)
    assert len(violations) == 0


def test_missing_capability_scope_fails():
    intent = create_base_intent(
        capability_scopes=["crm.update_stage"],
        proposed_actions=[
            ActionItem(
                action_type=ActionType.CRM_CHANGE_BUDGET,
                target_type="deal",
                target_id="deal-123",
                payload={"budget": 500000},
            )
        ],
    )
    violations = IntentValidator.validate_intent(intent)
    assert len(violations) == 1
    assert "requires scope 'crm.financials'" in violations[0]


def test_code_injection_in_reasoning_fails():
    intent = create_base_intent(
        reasoning_summary="Lead requested demo <script>alert(1)</script>"
    )
    violations = IntentValidator.validate_intent(intent)
    assert len(violations) == 1
    assert "Dangerous code pattern detected in reasoning_summary" in violations[0]


def test_sql_injection_in_payload_fails():
    intent = create_base_intent(
        proposed_actions=[
            ActionItem(
                action_type=ActionType.CRM_UPDATE_STAGE,
                target_type="deal",
                target_id="deal-123",
                payload={"notes": "Normal note'; DROP TABLE deals; --"},
            )
        ]
    )
    violations = IntentValidator.validate_intent(intent)
    assert len(violations) >= 1
    assert any("DROP" in v.upper() and "TABLE" in v.upper() for v in violations)


def test_leaked_jwt_token_fails():
    fake_jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis"
    intent = create_base_intent(
        reasoning_summary=f"Found existing auth token: {fake_jwt}"
    )
    violations = IntentValidator.validate_intent(intent)
    assert len(violations) == 1
    assert "Potential secret token leaked" in violations[0]
