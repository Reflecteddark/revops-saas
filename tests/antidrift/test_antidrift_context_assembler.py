"""
tests/antidrift/test_antidrift_context_assembler.py

Unit and integration tests for Sprint 1 (Trusted Context Assembler & Layer 1.5 Fact-Check):
- Assembly of ground-truth business facts from DB mirror and deal context
- Cryptographic context hash determinism & mutation sensitivity
- Multi-tenant isolation without static IDs
- Layer 1.5 Fact-Check: hallucinated discount (> allowed_discount_max) triggers 403 HARD_FAILURE
- Context hash tampering detection
- Feature-flag ENABLE_TRUSTED_CONTEXT behavior
"""

import os
import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from packages.database.session import SessionLocal
from packages.database.models import Deal, DealStage, Tenant, Workspace
from packages.antidrift.contracts.intent import (
    ActionItem,
    ActionRiskLevel,
    ActionType,
    AgentIntentPayload,
    VerifiedIntentProposal,
    ProposedClientReply,
)
from packages.antidrift.barrier.validator import IntentValidator
from packages.antidrift.context.context_assembler import TrustedContext, assemble_trusted_context
from packages.antidrift.models import AgentIncident, AgentTrace

client = TestClient(app)


@pytest.fixture
def dynamic_tenant_id():
    return f"tenant_{uuid.uuid4().hex[:8]}"


@pytest.fixture
def dynamic_deal_id():
    return f"deal_{uuid.uuid4().hex[:8]}"


def test_assemble_trusted_context_for_existing_deal(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 1: Verifies that assembling context for an existing CRM deal correctly
    loads the budget, stage, title, and computes a valid SHA-256 hash.
    """
    db = SessionLocal()
    try:
        # Create minimal tenant and workspace to satisfy foreign keys
        tenant = Tenant(id=dynamic_tenant_id, name="Test Corp", slug=f"slug_{dynamic_tenant_id}")
        ws = Workspace(id=str(uuid.uuid4()), tenant_id=dynamic_tenant_id, name="Default WS")
        deal = Deal(
            id=dynamic_deal_id,
            tenant_id=dynamic_tenant_id,
            workspace_id=ws.id,
            title="Enterprise RevOps License",
            budget=275000.0,
            stage=DealStage.QUALIFICATION,
            stage_name="Квалифицирован",
        )
        db.add_all([tenant, ws, deal])
        db.commit()

        ctx = assemble_trusted_context(
            db=db,
            tenant_id=dynamic_tenant_id,
            deal_id=dynamic_deal_id,
            allowed_discount_max=7.5,
            allowed_deferment_days=20,
        )

        assert ctx.tenant_id == dynamic_tenant_id
        assert ctx.deal_id == dynamic_deal_id
        assert ctx.deal_title == "Enterprise RevOps License"
        assert ctx.deal_amount == 275000.0
        assert ctx.deal_stage == "Квалифицирован"
        assert ctx.allowed_discount_max == 7.5
        assert ctx.allowed_deferment_days == 20
        assert len(ctx.context_hash) == 64
    finally:
        db.close()


def test_assemble_trusted_context_fallback_when_deal_not_found(dynamic_tenant_id):
    """
    Case 2: Verifies graceful fallback to default parameters when deal is not in DB,
    using optional in-memory deal_context.
    """
    non_existent_deal = f"deal_missing_{uuid.uuid4().hex[:8]}"
    ctx = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=non_existent_deal,
        deal_context={"title": "Synthetic Inbound Lead", "budget": 150000.0, "stage": "Новый"},
        allowed_discount_max=5.0,
    )

    assert ctx.tenant_id == dynamic_tenant_id
    assert ctx.deal_id == non_existent_deal
    assert ctx.deal_title == "Synthetic Inbound Lead"
    assert ctx.deal_amount == 150000.0
    assert ctx.deal_stage == "Новый"
    assert ctx.allowed_discount_max == 5.0
    assert len(ctx.context_hash) == 64


def test_context_hash_determinism_and_sensitivity(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 3: Verifies that identical facts yield identical SHA-256 hashes,
    and any modification to any fact immediately changes the hash.
    """
    ctx1 = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"title": "Contract A", "budget": 200000.0, "stage": "Переговоры"},
        allowed_discount_max=10.0,
    )
    ctx2 = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"title": "Contract A", "budget": 200000.0, "stage": "Переговоры"},
        allowed_discount_max=10.0,
    )
    assert ctx1.context_hash == ctx2.context_hash

    # Mutate budget slightly -> hash must change
    ctx_mutated_budget = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"title": "Contract A", "budget": 200000.50, "stage": "Переговоры"},
        allowed_discount_max=10.0,
    )
    assert ctx1.context_hash != ctx_mutated_budget.context_hash

    # Mutate allowed discount -> hash must change
    ctx_mutated_discount = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"title": "Contract A", "budget": 200000.0, "stage": "Переговоры"},
        allowed_discount_max=10.5,
    )
    assert ctx1.context_hash != ctx_mutated_discount.context_hash


def test_multi_tenant_isolation_distinct_hashes():
    """
    Case 4: Verifies that different dynamic tenants with otherwise identical deal data
    generate completely different context hashes (no cross-tenant leakage).
    """
    t1 = f"tenant_{uuid.uuid4().hex[:8]}"
    t2 = f"tenant_{uuid.uuid4().hex[:8]}"
    deal_id = "deal_shared_num"

    ctx_t1 = assemble_trusted_context(
        db=None,
        tenant_id=t1,
        deal_id=deal_id,
        deal_context={"budget": 100000.0},
    )
    ctx_t2 = assemble_trusted_context(
        db=None,
        tenant_id=t2,
        deal_id=deal_id,
        deal_context={"budget": 100000.0},
    )

    assert ctx_t1.context_hash != ctx_t2.context_hash


def test_validator_layer_1_5_fact_check_discount_breach(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 5: Verifies that Layer 1.5 Fact-Check blocks hallucinated discounts
    exceeding the limit specified in TrustedContext.
    """
    trusted_ctx = TrustedContext(
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_amount=100000.0,
        allowed_discount_max=5.0,  # Max allowed discount is 5%
    )

    # 1. Compliant reply with 4% discount -> valid
    intent_valid = AgentIntentPayload(
        session_id="ses_1",
        tenant_id=dynamic_tenant_id,
        agent_id="agent_sales",
        harness_version="v1.0.0",
        source_event_id="evt_1",
        intent="DISCUSS_PRICE",
        proposed_client_reply=ProposedClientReply(
            text="Мы можем предоставить скидку 4% при оплате за год.",
            tone="business",
        ),
    )
    violations = IntentValidator.validate_against_trusted_context(intent_valid, trusted_ctx)
    assert len(violations) == 0

    # 2. Hallucinated reply with 20% discount -> VIOLATION (GR-03)
    intent_hallucinated = AgentIntentPayload(
        session_id="ses_2",
        tenant_id=dynamic_tenant_id,
        agent_id="agent_sales",
        harness_version="v1.0.0",
        source_event_id="evt_2",
        intent="DISCUSS_PRICE",
        proposed_client_reply=ProposedClientReply(
            text="Согласовали для вас специальную скидку 20% прямо сейчас!",
            tone="business",
        ),
    )
    violations = IntentValidator.validate_against_trusted_context(intent_hallucinated, trusted_ctx)
    assert len(violations) >= 1
    assert any("exceeds maximum authorized limit 5.0%" in v for v in violations)
    assert any("GR-03" in v for v in violations)


def test_router_integration_with_trusted_context_flag(dynamic_tenant_id, dynamic_deal_id, monkeypatch):
    """
    Case 6: End-to-end integration test with FastAPI router:
    When ENABLE_TRUSTED_CONTEXT=1, a proposal promising a 35% discount
    is caught at Layer 1.5, returning HTTP 403 Forbidden with P0 incident.
    """
    monkeypatch.setenv("ENABLE_TRUSTED_CONTEXT", "1")

    trace_id = f"trc_{uuid.uuid4().hex}"
    source_event_id = f"evt_{uuid.uuid4().hex}"

    proposal = {
        "trace_id": trace_id,
        "session_id": f"ses_{uuid.uuid4().hex[:8]}",
        "tenant_id": dynamic_tenant_id,
        "agent_id": "agent_fact_checker",
        "harness_version": "v1.0.0",
        "policy_version": "2026.03.pol",
        "channel": "amo_chat",
        "source_event_id": source_event_id,
        "intent": "OFFER_PROMO",
        "context_refs": {"deal_id": dynamic_deal_id, "budget": 100000.0},
        "proposed_actions": [],
        "proposed_client_reply": {
            "text": "Мы даем персональную скидку 35% при подписании сегодня!",
            "tone": "business",
        },
        "reasoning_summary": "Attempting to push deal forward",
        "used_facts": ["Deal budget is 100,000"],
    }

    response = client.post("/api/v1/agents/execute", json=proposal)
    assert response.status_code == 403, response.text
    data = response.json()["detail"]
    assert data["status"] == "BLOCKED"
    assert data["verdict"] == "HARD_FAILURE"
    assert any(v["rule_id"] == "GR-03_DISCOUNT_PROMISE_GUARD" for v in data["violations"])

    # Verify P0 incident created in DB
    db = SessionLocal()
    try:
        incident = db.query(AgentIncident).filter(AgentIncident.trace_id == trace_id).first()
        assert incident is not None
        assert incident.source == "FACT_CHECK_GUARD"
        assert incident.severity == "P0"
    finally:
        db.close()
