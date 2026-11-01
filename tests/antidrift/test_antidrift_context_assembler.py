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
from packages.antidrift.barrier.validator import (
    IntentValidator,
    validate_against_trusted_context,
    validate_reply_text,
)
from packages.antidrift.context.context_assembler import (
    ContextUnavailableError,
    TrustedContext,
    assemble_trusted_context,
    build_grounded_system_prompt,
)
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


def test_layer_1_5_payment_deferment_breach(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 7: Verifies that Layer 1.5 Fact-Check detects unauthorized payment deferments
    exceeding allowed_deferment_days.
    """
    trusted_ctx = TrustedContext(
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_amount=50000.0,
        allowed_discount_max=10.0,
        allowed_deferment_days=14,  # Max 14 days deferment authorized
    )

    intent_deferment_exceeded = AgentIntentPayload(
        session_id="ses_defer",
        tenant_id=dynamic_tenant_id,
        agent_id="agent_sales",
        harness_version="v1.0.0",
        source_event_id="evt_defer",
        intent="PAYMENT_TERMS",
        proposed_client_reply=ProposedClientReply(
            text="Мы предоставляем отсрочку 45 дней после поставки.",
            tone="business",
        ),
    )
    violations = IntentValidator.validate_against_trusted_context(intent_deferment_exceeded, trusted_ctx)
    assert len(violations) >= 1
    assert any("exceeds maximum authorized limit 14 days" in v for v in violations)


def test_layer_1_5_context_hash_mismatch(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 8: Verifies that passing a fabricated or tampered context_hash
    fails validation against the computed canonical hash of the TrustedContext.
    """
    trusted_ctx = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"budget": 50000.0},
    )

    intent_tampered = VerifiedIntentProposal(
        session_id="ses_tamp",
        tenant_id=dynamic_tenant_id,
        agent_id="agent_sales",
        harness_version="v1.0.0",
        source_event_id="evt_tamp",
        intent="DISCUSS_PRICE",
        context_hash="0000000000000000000000000000000000000000000000000000000000000000",
        proposed_client_reply=ProposedClientReply(
            text="Здравствуйте, подтверждаем сумму.",
            tone="business",
        ),
    )
    violations = IntentValidator.validate_against_trusted_context(intent_tampered, trusted_ctx)
    assert any("Context hash mismatch" in v for v in violations)


def test_verified_intent_proposal_unverified_assumptions():
    """
    Case 9: Verifies that VerifiedIntentProposal schema correctly accepts and validates
    used_facts, unverified_assumptions, and expected_state_delta.
    """
    proposal = VerifiedIntentProposal(
        session_id="ses_assump",
        tenant_id=f"tenant_{uuid.uuid4().hex[:8]}",
        agent_id="agent_cautious",
        harness_version="v1.4.0",
        source_event_id="evt_assump",
        intent="PROPOSE_TERMS",
        context_hash="a" * 64,
        used_facts=["deal_amount: 120000", "stage: QUALIFICATION"],
        unverified_assumptions=["Client VAT exemption eligibility pending certificate"],
        expected_state_delta={"custom_fields": {"vat_pending": True}},
        proposed_client_reply=ProposedClientReply(
            text="Уточняем условия с учётом НДС.",
            tone="business",
        ),
    )
    assert len(proposal.used_facts) == 2
    assert proposal.unverified_assumptions == ["Client VAT exemption eligibility pending certificate"]
    assert proposal.expected_state_delta == {"custom_fields": {"vat_pending": True}}


def test_backward_compatibility_intent_proposal():
    """
    Case 10: Verifies that an unadorned legacy payload works seamlessly with
    VerifiedIntentProposal defaults (None/empty lists) without schema validation errors.
    """
    proposal = VerifiedIntentProposal(
        session_id="ses_legacy",
        tenant_id=f"tenant_{uuid.uuid4().hex[:8]}",
        agent_id="agent_legacy",
        harness_version="v1.0.0",
        source_event_id="evt_legacy",
        intent="GREETING",
        proposed_client_reply=ProposedClientReply(
            text="Добрый день!",
            tone="business",
        ),
    )
    assert proposal.context_hash is None
    assert proposal.used_facts == []
    assert proposal.unverified_assumptions == []
    assert proposal.expected_state_delta == {}


def test_trusted_context_serialization_and_immutability(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 11: Verifies that TrustedContext serialization to dict retains all fields,
    and recalculating hash on deserialized data preserves determinism.
    """
    ctx = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"title": "Contract B", "budget": 350000.0, "stage": "Договор"},
        allowed_discount_max=12.0,
        allowed_deferment_days=30,
        requires_human_above=500000.0,
    )
    d = ctx.to_dict()
    assert d["tenant_id"] == dynamic_tenant_id
    assert d["deal_amount"] == 350000.0
    assert d["allowed_discount_max"] == 12.0
    assert d["context_hash"] == ctx.context_hash

    # Rebuilding another instance with the exact same data must yield identical hash
    ctx_rebuilt = TrustedContext(**d)
    assert ctx_rebuilt.calculate_hash() == ctx.context_hash




def test_missing_context_hash_blocked(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 12: Request without context_hash must be blocked when fact-check is enforced
    to prevent zero-bypass circumvention.
    """
    trusted_ctx = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"budget": 100000.0},
    )
    proposal = VerifiedIntentProposal(
        session_id="ses_missing_hash",
        tenant_id=dynamic_tenant_id,
        agent_id="agent_sales",
        harness_version="v1.0.0",
        source_event_id="evt_missing_hash",
        intent="OFFER_DISCOUNT",
        context_hash=None,  # Intentionally missing to test zero-bypass
        proposed_client_reply=ProposedClientReply(
            text="Добрый день! Согласовываем предложение.",
            tone="business",
        ),
    )
    result = validate_against_trusted_context(proposal, trusted_ctx, require_hash=True)
    assert result.blocked is True
    assert "Missing context_hash" in result.reason


def test_database_unavailable_blocks_request(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 13: If database connection fails during context assembly,
    the request must be blocked (fail-closed) by raising ContextUnavailableError.
    """
    class FailingDBSession:
        def query(self, *args, **kwargs):
            raise RuntimeError("Database connection refused: host unreachable")

    failing_db = FailingDBSession()
    with pytest.raises(ContextUnavailableError) as exc_info:
        assemble_trusted_context(
            db=failing_db,  # type: ignore
            tenant_id=dynamic_tenant_id,
            deal_id=dynamic_deal_id,
        )
    assert "database unavailable" in str(exc_info.value)


def test_reply_text_discount_check(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 14: Client reply text is post-validated for unauthorized discounts
    regardless of proposed_actions content.
    """
    trusted_ctx = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"budget": 200000.0},
        allowed_discount_max=5.0,
    )
    reply = "Даём вам персональную скидку 40%!"
    result = validate_reply_text(reply, trusted_ctx)
    assert result.blocked is True
    assert any("GR-03" in v for v in result)


def test_trusted_context_to_markdown_and_grounded_system_prompt(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 15: Verifies that to_markdown() and build_grounded_system_prompt()
    render strict anti-drift facts and execution invariants into the LLM prompt.
    """
    ctx = assemble_trusted_context(
        db=None,
        tenant_id=dynamic_tenant_id,
        deal_id=dynamic_deal_id,
        deal_context={"title": "Cloud Migration", "budget": 500000.0, "stage": "Переговоры"},
        allowed_discount_max=7.0,
        allowed_deferment_days=10,
    )
    md = ctx.to_markdown()
    assert "ДОВЕРЕННЫЙ БИЗНЕС-КОНТЕКСТ СДЕЛКИ" in md
    assert "500,000.00 ₽" in md
    assert "7.0%" in md
    assert ctx.context_hash in md

    base_prompt = "Ты — помощник менеджера."
    system_prompt = build_grounded_system_prompt(base_prompt, ctx)
    assert "СТРОГИЕ ИНВАРИАНТЫ ГЕНЕРАЦИИ (ANTI-DRIFT GUARD)" in system_prompt
    assert ctx.context_hash in system_prompt
    assert "used_facts" in system_prompt


def test_assemble_context_endpoint_http(dynamic_tenant_id, dynamic_deal_id):
    """
    Case 16: Verifies POST /api/v1/agents/context/assemble HTTP endpoint
    returns grounded system prompt and signed context hash for n8n/orchestrator.
    """
    payload = {
        "tenant_id": dynamic_tenant_id,
        "deal_id": dynamic_deal_id,
        "base_system_prompt": "Ты — RevOps агент.",
        "deal_context": {"title": "SaaS Platform", "budget": 300000.0, "stage": "Встреча"},
        "allowed_discount_max": 5.0,
        "allowed_deferment_days": 14,
    }
    response = client.post("/api/v1/agents/context/assemble", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["tenant_id"] == dynamic_tenant_id
    assert data["deal_id"] == dynamic_deal_id
    assert len(data["context_hash"]) == 64
    assert "grounded_system_prompt" in data
    assert "ДОВЕРЕННЫЙ БИЗНЕС-КОНТЕКСТ СДЕЛКИ" in data["markdown"]
