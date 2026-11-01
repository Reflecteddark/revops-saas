"""
tests/antidrift/test_policies.py

Tests for PolicyEngine: verification of GR-00..GR-05 guardrails and Decision Matrix.
Zero hardcoding: dynamic tenant IDs per scenario.
"""

import uuid
from packages.antidrift.contracts.intent import (
    ActionItem,
    ActionType,
    AgentIntentPayload,
    EscalationPayload,
    ProposedClientReply,
)
from packages.antidrift.contracts.decisions import DriftSeverity
from packages.antidrift.barrier.policy_engine import PolicyEngine


def make_test_intent(**overrides) -> AgentIntentPayload:
    base = {
        "session_id": f"sess_{uuid.uuid4().hex[:8]}",
        "tenant_id": f"tenant_{uuid.uuid4().hex[:8]}",
        "channel": "whatsapp",
        "source_event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "agent_id": "lead-qualifier",
        "harness_version": "v14.3.0",
        "intent": "TEST_INTENT",
        "capability_scopes": [
            "crm.read",
            "crm.tags",
            "crm.notes",
            "crm.update_stage",
            "crm.create_task",
            "crm.set_field",
            "crm.financials",
            "crm.close_deal",
            "crm.destructive",
        ],
        "proposed_actions": [],
    }
    base.update(overrides)
    return AgentIntentPayload(**base)


def test_destructive_delete_hard_failure():
    intent = make_test_intent(
        proposed_actions=[
            ActionItem(
                action_type=ActionType.CRM_DELETE_ENTITY,
                target_type="deal",
                target_id="deal-666",
            )
        ]
    )
    result = PolicyEngine.evaluate_intent(intent)
    assert result.overall_verdict == DriftSeverity.HARD_FAILURE
    assert result.is_blocking is True
    assert any("GR-00" in v.rule_id for v in result.violations)


def test_gr01_budget_change_requires_approval():
    intent = make_test_intent(
        proposed_actions=[
            ActionItem(
                action_type=ActionType.CRM_CHANGE_BUDGET,
                target_type="deal",
                target_id="deal-101",
                payload={"budget": 450000},
            )
        ]
    )
    current_deal = {"budget": 200000}
    result = PolicyEngine.evaluate_intent(intent, current_deal_context=current_deal)
    assert result.overall_verdict == DriftSeverity.WARNING
    assert result.requires_hitl is True
    assert any("GR-01" in v.rule_id for v in result.violations)


def test_gr02_close_lost_without_reason_hard_failure():
    intent = make_test_intent(
        proposed_actions=[
            ActionItem(
                action_type=ActionType.CRM_CLOSE_DEAL_LOST,
                target_type="deal",
                target_id="deal-101",
                payload={"loss_reason": ""},  # Empty reason
            )
        ]
    )
    result = PolicyEngine.evaluate_intent(intent)
    assert result.overall_verdict == DriftSeverity.HARD_FAILURE
    assert any("GR-02" in v.rule_id for v in result.violations)


def test_gr02_close_lost_with_valid_reason_requires_hitl():
    intent = make_test_intent(
        proposed_actions=[
            ActionItem(
                action_type=ActionType.CRM_CLOSE_DEAL_LOST,
                target_type="deal",
                target_id="deal-101",
                payload={"loss_reason": "Не устроила цена оборудования"},
            )
        ]
    )
    result = PolicyEngine.evaluate_intent(intent)
    assert result.requires_hitl is True
    assert result.action_decisions.get(intent.proposed_actions[0].action_id) == "REQUIRE_APPROVAL"


def test_gr03_unauthorized_discount_in_reply_hard_failure():
    intent = make_test_intent(
        proposed_client_reply=ProposedClientReply(
            text="Можем согласовать для вас скидку 20% прямо сейчас!"
        )
    )
    result = PolicyEngine.evaluate_intent(intent)
    assert result.overall_verdict == DriftSeverity.HARD_FAILURE
    assert any("GR-03" in v.rule_id for v in result.violations)


def test_gr04_human_operator_request_unhandled_hard_failure():
    intent = make_test_intent(
        proposed_client_reply=ProposedClientReply(
            text="Я автоматический помощник, готов помочь с каталогом."
        ),
        escalation=None,
    )
    client_msg = "Позовите живого человека, хватит слать шаблоны!"
    result = PolicyEngine.evaluate_intent(intent, client_inbound_message=client_msg)
    assert result.overall_verdict == DriftSeverity.HARD_FAILURE
    assert any("GR-04" in v.rule_id for v in result.violations)


def test_gr04_human_operator_request_properly_escalated_passes():
    intent = make_test_intent(
        proposed_client_reply=ProposedClientReply(
            text="Переключаю диалог на старшего менеджера. Пожалуйста, ожидайте."
        ),
        escalation=EscalationPayload(
            required=True,
            reason="Клиент запросил оператора",
            priority="high",
            target_role="manager",
        ),
    )
    client_msg = "Соедините с менеджером"
    result = PolicyEngine.evaluate_intent(intent, client_inbound_message=client_msg)
    assert result.overall_verdict in (DriftSeverity.INFO, DriftSeverity.WARNING)
    assert not any("GR-04" in v.rule_id for v in result.violations)


def test_gr05_close_won_without_payment_hard_failure():
    intent = make_test_intent(
        proposed_actions=[
            ActionItem(
                action_type=ActionType.CRM_CLOSE_DEAL_WON,
                target_type="deal",
                target_id="deal-101",
                payload={"invoice_paid": False},
            )
        ]
    )
    result = PolicyEngine.evaluate_intent(intent, current_deal_context={"invoice_paid": False})
    assert result.overall_verdict == DriftSeverity.HARD_FAILURE
    assert any("GR-05" in v.rule_id for v in result.violations)
