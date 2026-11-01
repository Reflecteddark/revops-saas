"""
tests/antidrift/test_antidrift_shadow_mode.py

Unit and integration tests for Sprint 2 (Shadow Mode & Dry-Run Safe Releases):
- Dry-Run execution: returns expected_state_delta with zero CRM / LLM mutations
- Shadow execution: evaluates full validation & risk, saves shadow trace without CRM mutation
- Shadow Hard Failure handling: returns would_be_blocked without breaking caller with HTTP 403
- DiffEngine: computes atomic proposal deltas, action signature differences, and divergence scores
- REST API endpoint GET /api/v1/agents/shadow/diff/{harness_version}
- Smart Traffic Router: deterministic traffic splitting based on harness status
"""

import os
import uuid
import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from packages.database.session import SessionLocal
from packages.antidrift.contracts.intent import (
    ActionItem,
    ActionRiskLevel,
    ActionType,
    ExecutionMode,
    ProposedClientReply,
    VerifiedIntentProposal,
)
from packages.antidrift.diff.diff_engine import DiffEngine
from packages.antidrift.models import ActionExecution, AgentTrace, HarnessRegistry

client = TestClient(app)


@pytest.fixture
def dynamic_tenant_id():
    return f"tenant_{uuid.uuid4().hex[:8]}"


@pytest.fixture
def dynamic_deal_id():
    return f"deal_{uuid.uuid4().hex[:8]}"


def test_dry_run_mode_returns_delta_without_crm_calls(dynamic_tenant_id, dynamic_deal_id):
    """
    Verifies that mode=dry_run returns the expected_state_delta and validation verdict
    without triggering CRM gateway or external actions.
    """
    trace_id = f"trc_dry_{uuid.uuid4().hex}"
    source_evt = f"evt_dry_{uuid.uuid4().hex}"

    proposal = {
        "trace_id": trace_id,
        "session_id": f"ses_{uuid.uuid4().hex[:8]}",
        "tenant_id": dynamic_tenant_id,
        "agent_id": "agent_sales",
        "harness_version": "v1.4.0",
        "policy_version": "2026.03.pol",
        "channel": "amo_chat",
        "source_event_id": source_evt,
        "intent": "QUALIFY_LEAD",
        "context_refs": {"deal_id": dynamic_deal_id, "budget": 150000.0},
        "capability_scopes": ["crm.read", "crm.tags"],
        "proposed_actions": [
            {
                "action_type": "crm_add_tag",
                "target_type": "deal",
                "target_id": dynamic_deal_id,
                "payload": {"tag": "Enterprise"},
            }
        ],
        "expected_state_delta": {"stage": "Встреча", "tags": ["Enterprise"]},
    }

    response = client.post("/api/v1/agents/execute?mode=dry_run", json=proposal)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["status"] == "DRY_RUN"
    assert data["trace_id"] == trace_id
    assert data["expected_state_delta"] == {"stage": "Встреча", "tags": ["Enterprise"]}
    assert data["validation"]["valid"] is True

    # Verify no CRM execution record was created
    db = SessionLocal()
    try:
        trace = db.query(AgentTrace).filter(AgentTrace.trace_id == trace_id).first()
        assert trace is not None
        assert trace.execution_mode == "dry_run"

        executions = db.query(ActionExecution).filter(ActionExecution.trace_id == trace_id).all()
        assert len(executions) == 0
    finally:
        db.close()


def test_shadow_mode_executes_validation_without_crm_commit(dynamic_tenant_id, dynamic_deal_id):
    """
    Verifies that mode=shadow validates intent, records shadow trace,
    evaluates behavioral diff, but NEVER commits to action_executions or CRM.
    """
    trace_id = f"trc_shd_{uuid.uuid4().hex}"
    source_evt = f"evt_shd_{uuid.uuid4().hex}"

    proposal = {
        "trace_id": trace_id,
        "session_id": f"ses_{uuid.uuid4().hex[:8]}",
        "tenant_id": dynamic_tenant_id,
        "agent_id": "agent_sales",
        "harness_version": "v1.4.1-shadow",
        "policy_version": "2026.03.pol",
        "channel": "telephony",
        "source_event_id": source_evt,
        "intent": "SCHEDULE_DEMO",
        "context_refs": {"deal_id": dynamic_deal_id, "budget": 200000.0},
        "capability_scopes": ["crm.read", "crm.create_task"],
        "proposed_actions": [
            {
                "action_type": "crm_create_task",
                "target_type": "task",
                "target_id": dynamic_deal_id,
                "payload": {"text": "Провести демо в Zoom"},
            }
        ],
        "proposed_client_reply": {
            "text": "Согласовали демонстрацию на завтра в 11:00.",
            "tone": "business",
        },
    }

    response = client.post("/api/v1/agents/execute?mode=shadow", json=proposal)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["status"] == "SHADOW_EXECUTED"
    assert data["execution_mode"] == "shadow"
    assert data["would_be_blocked"] is False
    assert "shadow_diff_vs_prod" in data

    # Verify audit trace saved with mode='shadow' and ZERO actions executed in CRM
    db = SessionLocal()
    try:
        trace = db.query(AgentTrace).filter(AgentTrace.trace_id == trace_id).first()
        assert trace is not None
        assert trace.execution_mode == "shadow"

        executions = db.query(ActionExecution).filter(ActionExecution.trace_id == trace_id).all()
        assert len(executions) == 0
    finally:
        db.close()


def test_shadow_mode_detects_hard_failure_without_http_403(dynamic_tenant_id, dynamic_deal_id):
    """
    Verifies that when a shadow candidate triggers a HARD_FAILURE guardrail,
    the endpoint returns would_be_blocked=True with status 200 rather than crashing
    the caller with HTTP 403.
    """
    trace_id = f"trc_shd_fail_{uuid.uuid4().hex}"
    source_evt = f"evt_shd_fail_{uuid.uuid4().hex}"

    # Dangerous deletion action (Forbidden by GR-00)
    proposal = {
        "trace_id": trace_id,
        "session_id": f"ses_{uuid.uuid4().hex[:8]}",
        "tenant_id": dynamic_tenant_id,
        "agent_id": "agent_danger",
        "harness_version": "v1.5.0-unsafe",
        "policy_version": "2026.03.pol",
        "channel": "api",
        "source_event_id": source_evt,
        "intent": "PURGE_DEAL",
        "context_refs": {"deal_id": dynamic_deal_id},
        "capability_scopes": ["crm.read", "crm.destructive"],
        "proposed_actions": [
            {
                "action_type": "crm_delete_entity",
                "target_type": "deal",
                "target_id": dynamic_deal_id,
                "payload": {"confirm": True},
            }
        ],
    }

    response = client.post("/api/v1/agents/execute?mode=shadow", json=proposal)
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["status"] == "SHADOW_EXECUTED"
    assert data["would_be_blocked"] is True
    assert data["verdict"] == "HARD_FAILURE"
    assert data["shadow_diff_vs_prod"]["is_hard_failure"] is True
    assert data["shadow_diff_vs_prod"]["divergence_score"] >= 0.40


def test_diff_engine_proposals_comparison():
    """
    Verifies atomic logic of DiffEngine.compare_proposals:
    - Intent mismatch penalty
    - Action delta penalty
    - State delta divergence penalty
    - Risk score drift
    """
    prod_proposal = {
        "intent": "DISCUSS_PRICING",
        "proposed_actions": [
            {"action_type": "crm_add_note", "target_type": "deal", "target_id": "deal_1", "payload": {}}
        ],
        "expected_state_delta": {"stage": "Переговоры"},
        "risk_score": 0.10,
    }

    # Case A: Identical proposal -> divergence 0.0
    metric_identical = DiffEngine.compare_proposals(prod_proposal, prod_proposal)
    assert metric_identical.intent_match is True
    assert metric_identical.actions_delta_count == 0
    assert metric_identical.divergence_score == 0.0

    # Case B: Intent mismatch and different action
    shadow_drifted = {
        "intent": "CLOSE_DEAL",
        "proposed_actions": [
            {"action_type": "crm_close_deal_won", "target_type": "deal", "target_id": "deal_1", "payload": {}}
        ],
        "expected_state_delta": {"stage": "Успешно реализовано"},
        "risk_score": 0.50,
    }
    metric_drifted = DiffEngine.compare_proposals(prod_proposal, shadow_drifted)
    assert metric_drifted.intent_match is False
    assert metric_drifted.divergence_score > 0.35
    assert len(metric_drifted.reasons) >= 2


def test_get_shadow_diff_report_endpoint(dynamic_tenant_id):
    """
    Verifies GET /api/v1/agents/shadow/diff/{harness_version} endpoint.
    Creates sample traces in DB and validates JSON report metrics.
    """
    harness_ver = f"v_cand_{uuid.uuid4().hex[:6]}"
    source_evt = f"evt_paired_{uuid.uuid4().hex[:8]}"

    db = SessionLocal()
    try:
        # Create paired prod trace
        tr_prod = AgentTrace(
            trace_id=str(uuid.uuid4()),
            session_id="ses_pair",
            tenant_id=dynamic_tenant_id,
            agent_id="agent_sales",
            harness_version="v1.0-prod",
            policy_version="2026.03.pol",
            channel="api",
            source_event_id=source_evt,
            execution_mode="prod",
            raw_intent_json={"intent": "GREETING", "proposed_actions": []},
        )
        # Create shadow trace
        tr_shadow = AgentTrace(
            trace_id=str(uuid.uuid4()),
            session_id="ses_pair",
            tenant_id=dynamic_tenant_id,
            agent_id="agent_sales",
            harness_version=harness_ver,
            policy_version="2026.03.pol",
            channel="api",
            source_event_id=source_evt,
            execution_mode="shadow",
            raw_intent_json={"intent": "GREETING", "proposed_actions": []},
        )
        db.add_all([tr_prod, tr_shadow])
        db.commit()
    finally:
        db.close()

    response = client.get(f"/api/v1/agents/shadow/diff/{harness_ver}")
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["harness_version"] == harness_ver
    assert data["total_shadow_traces"] >= 1
    assert data["paired_prod_traces"] >= 1
    assert data["intent_agreement_pct"] == 100.0
    assert data["hard_failures_shadow"] == 0
    assert data["is_acceptable"] is True
    assert data["status"] == "ACCEPTABLE"


def test_smart_traffic_router_distribution():
    """
    Verifies that DiffEngine.resolve_traffic_mode routes to SHADOW for
    SHADOW_RUNNING harness candidates on deterministic session hash, and PROD otherwise.
    """
    db = SessionLocal()
    try:
        agent_id = f"agent_router_{uuid.uuid4().hex[:6]}"
        harness_active = HarnessRegistry(
            agent_id=agent_id,
            version="v1.0.0",
            model_name="gemini-2.5-flash",
            system_prompt_hash="a" * 64,
            tools_schema_hash="b" * 64,
            status="ACTIVE",
        )
        harness_shadow = HarnessRegistry(
            agent_id=agent_id,
            version="v2.0.0-cand",
            model_name="gemini-2.5-flash",
            system_prompt_hash="c" * 64,
            tools_schema_hash="d" * 64,
            status="SHADOW_RUNNING",
        )
        db.add_all([harness_active, harness_shadow])
        db.commit()

        # ACTIVE version -> always PROD
        mode_active = DiffEngine.resolve_traffic_mode(db, agent_id, "v1.0.0", "session_123")
        assert mode_active == ExecutionMode.PROD

        # Non-existent version -> defaults to PROD
        mode_missing = DiffEngine.resolve_traffic_mode(db, agent_id, "v999.0.0", "session_123")
        assert mode_missing == ExecutionMode.PROD

        # SHADOW_RUNNING -> deterministic split
        modes = [
            DiffEngine.resolve_traffic_mode(db, agent_id, "v2.0.0-cand", f"session_probe_{i}")
            for i in range(100)
        ]
        shadow_count = sum(1 for m in modes if m == ExecutionMode.SHADOW)
        prod_count = sum(1 for m in modes if m == ExecutionMode.PROD)
        assert shadow_count > 0, "Expected at least some traffic routed to SHADOW"
        assert prod_count > 0, "Expected at least some traffic routed to PROD"
    finally:
        db.close()
