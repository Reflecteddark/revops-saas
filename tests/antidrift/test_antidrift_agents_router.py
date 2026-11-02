"""
tests/antidrift/test_antidrift_agents_router.py

Integration tests for the Anti-Drift Mission Control & Guarded Execution API Router:
- Intent-Execution Barrier (Validation -> Policy Check -> Idempotency -> Audit -> Execution)
- Hard failure blocking (403 Forbidden) and incident registration
- HITL Approval Queueing (budget modification, high risk)
- HITL Decision processing (APPROVE / REJECT)
- Version rollback & emergency kill-switch
Zero hardcoding: all tests generate dynamic UUID tenant and agent IDs.
"""

import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from packages.database.session import SessionLocal
from packages.antidrift.contracts.intent import (
    ActionItem,
    ActionRiskLevel,
    ActionType,
    AgentIntentPayload,
    ProposedClientReply,
)
from packages.antidrift.models import (
    ActionExecution,
    AgentIncident,
    AgentIntent,
    AgentTrace,
    HarnessRegistry,
    HITLApproval,
    IdempotencyKeyRecord,
)

client = TestClient(app)


@pytest.fixture
def dynamic_tenant_id():
    """Generates an isolated dynamic tenant ID configured for full execution tests."""
    t_id = f"tenant_{uuid.uuid4().hex[:8]}"
    from packages.antidrift.contracts.policy_config import TenantPolicyConfig, TenantPolicyRegistry
    TenantPolicyRegistry.register_config(
        TenantPolicyConfig(
            tenant_id=t_id,
            allow_crm_mutations=True,
            allow_client_communication=True,
            enable_telegram_notifications=True,
        )
    )
    return t_id


@pytest.fixture
def dynamic_agent_id():
    """Generates an isolated dynamic agent ID."""
    return f"agent_{uuid.uuid4().hex[:8]}"


def test_execute_agent_intent_success_path(dynamic_tenant_id, dynamic_agent_id):
    """
    Verifies that a valid, compliant agent intent passes all barrier checks,
    executes idempotently via CRMExecutionGateway, and returns status EXECUTED.
    """
    trace_id = f"trc_{uuid.uuid4().hex}"
    source_event_id = f"evt_{uuid.uuid4().hex}"

    intent_payload = {
        "trace_id": trace_id,
        "session_id": f"ses_{uuid.uuid4().hex[:8]}",
        "tenant_id": dynamic_tenant_id,
        "agent_id": dynamic_agent_id,
        "harness_version": "v1.0.0",
        "policy_version": "2026.03.pol",
        "channel": "amo_chat",
        "source_event_id": source_event_id,
        "capability_scopes": ["crm.notes"],
        "intent": "QUALIFY_LEAD",
        "confidence_score": 0.96,
        "risk_score": 0.05,
        "proposed_actions": [
            {
                "action_id": "act_note_1",
                "action_type": "crm_add_note",
                "target_type": "deal",
                "target_id": "lead_12345",
                "risk_level": "low",
                "payload": {"text": "Клиент подтвердил бюджет и интерес к интеграции."},
            }
        ],
        "proposed_client_reply": {
            "text": "Благодарю за обращение! Отправляю материалы.",
            "tone": "business",
        },
        "reasoning_summary": "Клиент задал стандартный вопрос по интеграции.",
    }

    response = client.post(
        "/api/v1/agents/execute",
        json=intent_payload,
        params={"client_message": "Добрый день, пришлите презентацию."},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "EXECUTED"
    assert data["trace_id"] == trace_id
    assert len(data["actions_executed"]) == 1
    assert data["actions_executed"][0]["status"] == "EXECUTED"
    assert data["approved_client_reply"] == "Благодарю за обращение! Отправляю материалы."

    # Verify database persistence
    db = SessionLocal()
    try:
        trace = db.query(AgentTrace).filter(AgentTrace.trace_id == trace_id).first()
        assert trace is not None
        assert trace.execution_mode == "prod"
        assert trace.tenant_id == dynamic_tenant_id

        executions = db.query(ActionExecution).filter(ActionExecution.trace_id == trace_id).all()
        assert len(executions) == 1
        assert executions[0].status == "EXECUTED"
        assert executions[0].action_type == "crm_add_note"
    finally:
        db.close()


def test_execute_agent_intent_idempotency_skip(dynamic_tenant_id, dynamic_agent_id):
    """
    Verifies that re-submitting an identical action with the same source_event_id
    is safely detected by IdempotencyManager and skipped as DUPLICATE_SKIPPED.
    """
    trace_id = f"trc_{uuid.uuid4().hex}"
    source_event_id = f"evt_idem_{uuid.uuid4().hex[:8]}"

    intent_payload = {
        "trace_id": trace_id,
        "session_id": f"ses_{uuid.uuid4().hex[:8]}",
        "tenant_id": dynamic_tenant_id,
        "agent_id": dynamic_agent_id,
        "harness_version": "v1.0.0",
        "policy_version": "2026.03.pol",
        "channel": "amo_chat",
        "source_event_id": source_event_id,
        "capability_scopes": ["crm.tags"],
        "intent": "QUALIFY_LEAD",
        "confidence_score": 0.95,
        "risk_score": 0.1,
        "proposed_actions": [
            {
                "action_id": "act_tag_1",
                "action_type": "crm_add_tag",
                "target_type": "deal",
                "target_id": "lead_999",
                "risk_level": "low",
                "payload": {"tag": "КВАЛИФИЦИРОВАН"},
            }
        ],
        "reasoning_summary": "Квалификация пройдена.",
    }

    # First execution -> EXECUTED
    res1 = client.post("/api/v1/agents/execute", json=intent_payload)
    assert res1.status_code == 200, res1.text
    assert res1.json()["actions_executed"][0]["status"] == "EXECUTED"

    # Second execution with different trace_id but same source_event_id and action -> DUPLICATE_SKIPPED
    intent_payload["trace_id"] = f"trc_retry_{uuid.uuid4().hex}"
    res2 = client.post("/api/v1/agents/execute", json=intent_payload)
    assert res2.status_code == 200, res2.text
    assert res2.json()["actions_executed"][0]["status"] == "DUPLICATE_SKIPPED"


def test_execute_agent_intent_validation_injection_blocked(dynamic_tenant_id, dynamic_agent_id):
    """
    Verifies that script injection or malicious payload is rejected at Layer 1 (Validation)
    with HTTP 422 Unprocessable Entity.
    """
    trace_id = f"trc_{uuid.uuid4().hex}"
    intent_payload = {
        "trace_id": trace_id,
        "session_id": "ses_injection",
        "tenant_id": dynamic_tenant_id,
        "agent_id": dynamic_agent_id,
        "harness_version": "v1.0.0",
        "policy_version": "2026.03.pol",
        "channel": "web_chat",
        "source_event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "capability_scopes": ["crm.notes"],
        "intent": "CHAT_REPLY",
        "confidence_score": 0.9,
        "risk_score": 0.1,
        "proposed_actions": [],
        "proposed_client_reply": {
            "text": "Здравствуйте! <script>alert('xss')</script>",
            "tone": "business",
        },
        "reasoning_summary": "Malicious payload injection test",
    }

    response = client.post("/api/v1/agents/execute", json=intent_payload)
    assert response.status_code == 422
    data = response.json()
    assert "violations" in data["detail"]
    assert any("Dangerous code pattern detected" in v for v in data["detail"]["violations"])


def test_execute_agent_intent_policy_hard_failure(dynamic_tenant_id, dynamic_agent_id):
    """
    Verifies that a policy breach (e.g. GR-03 unauthorized discount in client reply)
    triggers a HARD_FAILURE, raises HTTP 403 Forbidden, and records a P0 incident.
    """
    trace_id = f"trc_{uuid.uuid4().hex}"
    intent_payload = {
        "trace_id": trace_id,
        "session_id": "ses_hard_failure",
        "tenant_id": dynamic_tenant_id,
        "agent_id": dynamic_agent_id,
        "harness_version": "v1.0.0",
        "policy_version": "2026.03.pol",
        "channel": "amo_chat",
        "source_event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "capability_scopes": ["crm.financials"],
        "intent": "OFFER_DISCOUNT",
        "confidence_score": 0.9,
        "risk_score": 0.2,
        "proposed_actions": [],
        "proposed_client_reply": {
            "text": "Мы можем согласовать скидку 40% прямо сейчас!",
            "tone": "business",
        },
        "reasoning_summary": "Клиент колебался, предложил скидку",
    }

    response = client.post("/api/v1/agents/execute", json=intent_payload)
    assert response.status_code == 403
    data = response.json()["detail"]
    assert data["status"] == "BLOCKED"
    assert data["verdict"] == "HARD_FAILURE"
    assert any(v["rule_id"].startswith("GR-03") for v in data["violations"])

    # Verify P0 Incident is saved in database
    db = SessionLocal()
    try:
        incident = db.query(AgentIncident).filter(AgentIncident.trace_id == trace_id).first()
        assert incident is not None
        assert incident.severity == "P0"
        assert incident.agent_id == dynamic_agent_id
        assert incident.status == "OPEN"
    finally:
        db.close()


def test_execute_agent_intent_hitl_queue_and_decide(dynamic_tenant_id, dynamic_agent_id):
    """
    Verifies that high-risk actions (e.g. GR-01 budget change) trigger HITL queueing,
    return status AWAITING_APPROVAL, and can be decided via /approvals/{id}/decide.
    """
    trace_id = f"trc_{uuid.uuid4().hex}"
    intent_payload = {
        "trace_id": trace_id,
        "session_id": "ses_hitl_budget",
        "tenant_id": dynamic_tenant_id,
        "agent_id": dynamic_agent_id,
        "harness_version": "v1.0.0",
        "policy_version": "2026.03.pol",
        "channel": "amo_chat",
        "source_event_id": f"evt_{uuid.uuid4().hex[:8]}",
        "capability_scopes": ["crm.financials"],
        "intent": "UPDATE_DEAL_BUDGET",
        "confidence_score": 0.95,
        "risk_score": 0.3,
        "proposed_actions": [
            {
                "action_id": "act_budget_mod",
                "action_type": "crm_change_budget",
                "target_type": "deal",
                "target_id": "lead_555",
                "risk_level": "high",
                "payload": {"field": "budget", "value": 750000},
            }
        ],
        "reasoning_summary": "Клиент запросил расширенный тариф на 750 000 руб.",
    }

    # 1. Execute triggers HITL queue
    response = client.post("/api/v1/agents/execute", json=intent_payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["status"] == "AWAITING_APPROVAL"
    approval_id = data["approval_id"]
    assert approval_id is not None

    # 2. List pending approvals
    list_res = client.get(f"/api/v1/agents/approvals?tenant_id={dynamic_tenant_id}")
    assert list_res.status_code == 200
    approvals_list = list_res.json()
    assert approvals_list["pending_count"] >= 1
    matching = [a for a in approvals_list["approvals"] if a["approval_id"] == approval_id]
    assert len(matching) == 1

    # 3. ROP decides to APPROVE
    decision_payload = {
        "decision": "APPROVE",
        "approver_id": "rop_alex",
        "approver_role": "rop",
        "comment": "Бюджет проверен по КП.",
    }
    decide_res = client.post(
        f"/api/v1/agents/approvals/{approval_id}/decide?tenant_id={dynamic_tenant_id}",
        json=decision_payload,
    )
    assert decide_res.status_code == 200
    decide_data = decide_res.json()
    assert decide_data["status"] == "DECIDED"
    assert decide_data["decision"] == "APPROVE"

    # 4. Verify in DB
    db = SessionLocal()
    try:
        appr_db = db.query(HITLApproval).filter(HITLApproval.approval_id == approval_id).first()
        assert appr_db is not None
        assert appr_db.status == "APPROVED"
        assert appr_db.approver_id == "rop_alex"
    finally:
        db.close()


def test_rollback_and_kill_switch_lifecycle(dynamic_tenant_id, dynamic_agent_id):
    """
    Verifies harness rollback to a verified version and emergency kill-switch activation.
    """
    db = SessionLocal()
    try:
        # Create active and rollback harnesses
        h1 = HarnessRegistry(
            agent_id=dynamic_agent_id,
            version="v1.0.0",
            model_provider="google",
            model_name="gemini-2.5-flash",
            temperature=0.1,
            system_prompt_hash="a" * 64,
            tools_schema_hash="b" * 64,
            status="ACTIVE",
            rollback_version="v0.9.0",
            created_by="engineer",
        )
        h0 = HarnessRegistry(
            agent_id=dynamic_agent_id,
            version="v0.9.0",
            model_provider="google",
            model_name="gemini-2.5-flash",
            temperature=0.1,
            system_prompt_hash="c" * 64,
            tools_schema_hash="d" * 64,
            status="INACTIVE",
            created_by="engineer",
        )
        db.add_all([h1, h0])
        db.commit()
    finally:
        db.close()

    # 1. Rollback
    rollback_res = client.post(
        "/api/v1/agents/rollback",
        json={"agent_id": dynamic_agent_id, "reason": "High drift score detected"},
    )
    assert rollback_res.status_code == 200
    assert rollback_res.json()["status"] == "ROLLED_BACK"
    assert rollback_res.json()["active_version"] == "v0.9.0"

    # Verify in DB
    db = SessionLocal()
    try:
        h1_db = db.query(HarnessRegistry).filter(HarnessRegistry.agent_id == dynamic_agent_id, HarnessRegistry.version == "v1.0.0").first()
        h0_db = db.query(HarnessRegistry).filter(HarnessRegistry.agent_id == dynamic_agent_id, HarnessRegistry.version == "v0.9.0").first()
        assert h1_db.status == "ROLLED_BACK"
        assert h0_db.status == "ACTIVE"
    finally:
        db.close()

    # 2. Kill-switch
    kill_res = client.post(
        "/api/v1/agents/kill-switch",
        json={"agent_id": dynamic_agent_id, "reason": "Emergency maintenance"},
    )
    assert kill_res.status_code == 200
    assert kill_res.json()["status"] == "KILLED"

    # Verify all harnesses are PAUSED
    db = SessionLocal()
    try:
        harnesses = db.query(HarnessRegistry).filter(HarnessRegistry.agent_id == dynamic_agent_id).all()
        for h in harnesses:
            assert h.status == "PAUSED"
    finally:
        db.close()
