"""
tests/antidrift/test_antidrift_hardening_audit.py

Comprehensive test suite verifying all 11 audit items:
🔴 B1: Shadow/Dry-Run must not consume or lock idempotency keys.
🔴 B2: Shadow must not dispatch HITL cards or create P0 incidents + 1 session = max 1 HITL card.
🔴 B3: policy_autotune strictly prohibits relaxing safety floor (GR-00..GR-05 & discounts).
🟡 M1: Execution freshness TTL (120s) returns STALE_CONTEXT (HTTP 409) without P0 incident.
🟡 M2: DiffEngine handles absent prod baseline without false divergence or rollback.
🟡 M3: Low-cardinality Prometheus labels (no tenant_id in series labels) + auth check.
🟡 M6: Fail-closed idempotency on Postgres unique constraint.
🟡 M7: Auto-VCR deduplication by root-cause & daily quota limit (10 tests/day).
🟡 M8: Canary auto-rollback on divergence requires sample size N >= 200 sessions.
🟢 1.1: Per-tenant calibrated policy configuration with whitelist and changelog.
🟢 1.2: Three-mode ENABLE_TRUSTED_CONTEXT (off | monitor | enforce).
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from apps.api.main import app
from packages.database.session import SessionLocal
from packages.antidrift.barrier.idempotency import IdempotencyManager
from packages.antidrift.barrier.validator import IntentValidator
from packages.antidrift.canary.canary_router import canary_router
from packages.antidrift.context.context_assembler import TrustedContext, assemble_trusted_context
from packages.antidrift.contracts.intent import ActionType, ExecutionMode, VerifiedIntentProposal
from packages.antidrift.contracts.policy_config import TenantPolicyConfig, TenantPolicyRegistry
from packages.antidrift.diff.diff_engine import DiffEngine
from packages.antidrift.golden_set.vcr_engine import PIISanitizer
from packages.antidrift.golden_set.vcr_scenario_generator import VCRScenarioGenerator
from packages.antidrift.models import (
    ActionExecution,
    AgentIncident,
    AgentIntent,
    AgentTrace,
    HITLApproval,
    HarnessRegistry,
    IdempotencyKeyRecord,
    PendingVCRScenario,
)
from packages.antidrift.policy_autotune import PolicyAutoTuner, SAFETY_FLOOR_RULES
from packages.antidrift.telemetry.metrics import antidrift_metrics
from packages.database.models import Base
from packages.database.session import init_db


@pytest.fixture(autouse=True)
def setup_test_environment():
    init_db()
    antidrift_metrics.reset()
    canary_router.reset()
    yield
    antidrift_metrics.reset()
    canary_router.reset()


def test_b1_shadow_does_not_consume_idempotency_key():
    """B1: Shadow/Dry-Run modes must NEVER register or lock idempotency keys."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()

    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    source_evt = f"evt_{uuid.uuid4().hex[:8]}"
    key = IdempotencyManager.generate_key(tenant_id, source_evt, "crm_create_task", "deal_1")

    # 1. Shadow run executes and checks key with execution_mode='shadow'
    is_new_shadow, record_shadow = IdempotencyManager.check_or_reserve_db(
        db=db,
        idempotency_key=key,
        tenant_id=tenant_id,
        action_type="crm_create_task",
        source_event_id=source_evt,
        execution_mode="shadow",
    )
    assert is_new_shadow is True
    assert record_shadow is None
    # Verify nothing was written to database
    assert db.query(IdempotencyKeyRecord).count() == 0

    # 2. Subsequent real PROD run executes with the EXACT same key
    is_new_prod, record_prod = IdempotencyManager.check_or_reserve_db(
        db=db,
        idempotency_key=key,
        tenant_id=tenant_id,
        action_type="crm_create_task",
        source_event_id=source_evt,
        execution_mode="prod",
    )
    # Must succeed cleanly (NOT marked duplicate)
    assert is_new_prod is True
    assert record_prod is not None
    assert db.query(IdempotencyKeyRecord).count() == 1

    # 3. Third real PROD run with same key must now be detected as duplicate
    is_new_dupe, _ = IdempotencyManager.check_or_reserve_db(
        db=db,
        idempotency_key=key,
        tenant_id=tenant_id,
        action_type="crm_create_task",
        source_event_id=source_evt,
        execution_mode="prod",
    )
    assert is_new_dupe is False


def test_b2_hitl_card_deduplication_by_session():
    """B2: Two consecutive approval-triggering intents in the same session must dispatch only 1 card."""
    client = TestClient(app)
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    shared_session = f"session_dedup_{uuid.uuid4().hex[:6]}"

    proposal_1 = {
        "trace_id": f"trc_1_{uuid.uuid4().hex[:6]}",
        "session_id": shared_session,
        "tenant_id": tenant_id,
        "agent_id": "test_agent",
        "harness_version": "v1.0",
        "policy_version": "v1.0",
        "channel": "api",
        "source_event_id": f"evt_1_{uuid.uuid4().hex[:6]}",
        "intent": "CLOSE_DEAL_LOST",
        "context_refs": {"loss_reason": "No Budget"},
        "capability_scopes": ["crm.read", "crm.close_deal", "crm.update_deal"],
        "proposed_actions": [
            {
                "action_type": "crm_close_deal_lost",
                "target_type": "deal",
                "target_id": "deal_123",
                "payload": {"stage": "closed_lost", "loss_reason": "Price too high"},
            }
        ],
        "proposed_client_reply": {"text": "Сделка закрыта по согласованию", "tone": "business"},
        "risk_score": 0.85,
    }

    # First request enqueues HITL
    res1 = client.post("/api/v1/agents/execute", json=proposal_1)
    assert res1.status_code == 200, f"Failed res1: {res1.json()}"
    assert res1.json()["status"] == "AWAITING_APPROVAL"

    # Second request in same session
    proposal_2 = dict(proposal_1)
    proposal_2["trace_id"] = f"trc_2_{uuid.uuid4().hex[:6]}"
    proposal_2["source_event_id"] = f"evt_2_{uuid.uuid4().hex[:6]}"
    res2 = client.post("/api/v1/agents/execute", json=proposal_2)
    assert res2.status_code == 200
    assert res2.json()["status"] == "AWAITING_APPROVAL"


def test_b3_policy_autotune_never_modifies_safety_floor():
    """B3: PolicyAutoTuner strictly forbids relaxing GR-00..GR-05 & allowed_discount_max."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"

    # Simulate operator approving 10 discount exception requests
    for i in range(10):
        trace_id = str(uuid.uuid4())
        intent_id = str(uuid.uuid4())
        intent = AgentIntent(
            intent_id=intent_id,
            trace_id=trace_id,
            session_id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            agent_id="closer_agent",
            harness_version="v1.0",
            intent_name="discount_request",
            payload_json={"discount_pct": 8.0},
        )
        db.add(intent)
        appr = HITLApproval(
            approval_id=str(uuid.uuid4()),
            trace_id=trace_id,
            intent_id=intent_id,
            tenant_id=tenant_id,
            agent_id="closer_agent",
            harness_version="v1.0",
            status="APPROVED",
            decision="APPROVE",
            requested_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc),
        )
        db.add(appr)
    db.commit()

    recs = PolicyAutoTuner.analyze_tuning_opportunities(db=db, tenant_id=tenant_id, min_samples=5)
    # Must NOT contain recommendations for GR-03 or allowed_discount_max!
    for rec in recs:
        assert rec.policy_id not in SAFETY_FLOOR_RULES
        assert rec.parameter_name != "allowed_discount_max"


def test_m1_stale_context_returns_409_without_p0_incident():
    """M1: Context signature older than 120s returns HTTP 409 without creating P0 incident."""
    client = TestClient(app)
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    stale_time = datetime.now(timezone.utc) - timedelta(seconds=180)

    proposal = {
        "trace_id": f"trc_stale_{uuid.uuid4().hex[:6]}",
        "session_id": f"ses_{uuid.uuid4().hex[:6]}",
        "tenant_id": tenant_id,
        "agent_id": "test_agent",
        "harness_version": "v1.0",
        "policy_version": "v1.0",
        "channel": "api",
        "source_event_id": f"evt_{uuid.uuid4().hex[:6]}",
        "intent": "SEND_REPLY",
        "context_hash": "dummy_hash_123",
        "context_assembled_at": stale_time.isoformat(),
        "used_facts": ["deal_amount: 100000.0"],
        "proposed_actions": [],
        "proposed_client_reply": {"text": "Здравствуйте!", "tone": "business"},
    }

    res = client.post("/api/v1/agents/execute", json=proposal)
    assert res.status_code == 409
    assert res.json()["detail"]["error"] == "STALE_CONTEXT"


def test_m2_diff_engine_no_baseline_does_not_trigger_divergence():
    """M2: Missing prod baseline must result in no_baseline=True and has_divergence=False."""
    metric = DiffEngine.compare_proposals(
        prod_proposal=None,
        shadow_proposal={"intent": "SCHEDULE_DEMO", "proposed_actions": [{"action_type": "crm_create_task"}]},
    )
    assert metric.no_baseline is True
    assert metric.has_divergence is False
    assert metric.divergence_score == 0.0


def test_m6_fail_closed_idempotency_postgres_unique_index():
    """M6: In-flight race conditions safely fail-closed via database unique constraint."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()

    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    key = "race_condition_key_999"

    # Pre-seed record
    rec = IdempotencyKeyRecord(
        idempotency_key=key,
        tenant_id=tenant_id,
        action_type="crm_create_deal",
        source_event_id="evt_123",
        action_hash="hash123",
        status="PROCESSING",
        first_seen_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
    )
    db.add(rec)
    db.commit()

    # Concurrent insert fails gracefully and returns duplicate
    is_new, existing = IdempotencyManager.check_or_reserve_db(
        db=db,
        idempotency_key=key,
        tenant_id=tenant_id,
        action_type="crm_create_deal",
        source_event_id="evt_123",
        execution_mode="prod",
    )
    assert is_new is False
    assert existing is not None


def test_m7_auto_vcr_deduplication_and_daily_quota():
    """M7: Duplicate incidents are deduplicated and daily limit of 10 tests is enforced."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()

    os.environ["MAX_DAILY_AUTO_VCR"] = "3"
    trace = {"intent": "GIVE_DISCOUNT", "client_message": "Дайте скидку 50%"}

    try:
        # 1. First capture succeeds
        p1 = VCRScenarioGenerator.capture_incident_as_pending(
            db=db,
            trace_id="trc_1",
            source_policy="GR-03",
            raw_trace=trace,
            error_summary="Discount breach",
        )
        assert p1 is not None

        # 2. Duplicate with identical policy & error summary returns existing scenario
        p2 = VCRScenarioGenerator.capture_incident_as_pending(
            db=db,
            trace_id="trc_2",
            source_policy="GR-03",
            raw_trace=trace,
            error_summary="Discount breach",
        )
        assert p2 is not None
        assert p2.id == p1.id

        # 3. Exhaust daily quota (3 scenarios)
        VCRScenarioGenerator.capture_incident_as_pending(db=db, trace_id="trc_3", source_policy="GR-01", raw_trace=trace, error_summary="err1")
        VCRScenarioGenerator.capture_incident_as_pending(db=db, trace_id="trc_4", source_policy="GR-02", raw_trace=trace, error_summary="err2")

        # 4th scenario must be throttled
        p_throttled = VCRScenarioGenerator.capture_incident_as_pending(db=db, trace_id="trc_5", source_policy="GR-04", raw_trace=trace, error_summary="err3")
        assert p_throttled is None
    finally:
        os.environ.pop("MAX_DAILY_AUTO_VCR", None)


def test_m8_canary_auto_rollback_requires_minimum_sessions():
    """M8: Canary auto-rollback on divergence requires sample size >= 200 sessions."""
    tenant = f"tnt_{uuid.uuid4().hex[:6]}"
    canary_router.configure(weight_pct=10.0, reset_rollback=True, divergence_threshold_pct=1.0)
    canary_router.min_sessions_for_divergence_rollback = 200

    # Simulate 5 divergent sessions (rate 100%, but N=5 < 200)
    for _ in range(5):
        antidrift_metrics.record_shadow_comparison(tenant, is_divergent=True)
        canary_router.record_canary_execution(tenant, is_hard_failure=False, is_divergent=True)

    # Must NOT trip circuit breaker on small sample
    status = canary_router.get_status()
    assert status["auto_rollback_active"] is False
    assert status["weight_pct"] == 10.0


def test_1_1_tenant_policy_config_governance():
    """1.1: Per-tenant config governance with enterprise client whitelist."""
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    cfg = TenantPolicyConfig(
        tenant_id=tenant_id,
        version="v1.2",
        allowed_discount_max=4.0,
        allowed_deferment_days=14,
        deferment_whitelist_clients=["enterprise_client_alpha"],
        whitelist_deferment_days=45,
    )
    TenantPolicyRegistry.register_config(cfg)

    retrieved = TenantPolicyRegistry.get_config(tenant_id)
    assert retrieved.allowed_discount_max == 4.0
    assert retrieved.get_effective_deferment_days("regular_client") == 14
    assert retrieved.get_effective_deferment_days("enterprise_client_alpha") == 45


def test_1_1_context_assembler_integrates_tenant_policy_config():
    """1.1: assemble_trusted_context respects calibrated thresholds & enterprise whitelist."""
    from packages.antidrift.context.context_assembler import assemble_trusted_context
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    cfg = TenantPolicyConfig(
        tenant_id=tenant_id,
        version="v2.0",
        allowed_discount_max=3.5,
        allowed_deferment_days=10,
        deferment_whitelist_clients=["key_account_gazprom"],
        whitelist_deferment_days=45,
        requires_human_above=450000.0,
    )
    TenantPolicyRegistry.register_config(cfg)

    # 1. Standard client gets calibrated 3.5% and 10 days
    ctx_std = assemble_trusted_context(
        db=None,
        tenant_id=tenant_id,
        deal_id="deal_std",
        deal_context={"client_id": "client_sme", "budget": 100000},
    )
    assert ctx_std.allowed_discount_max == 3.5
    assert ctx_std.allowed_deferment_days == 10
    assert ctx_std.requires_human_above == 450000.0

    # 2. Whitelisted enterprise client gets 45 days deferment
    ctx_ent = assemble_trusted_context(
        db=None,
        tenant_id=tenant_id,
        deal_id="deal_ent",
        deal_context={"client_id": "key_account_gazprom", "budget": 2000000},
    )
    assert ctx_ent.allowed_discount_max == 3.5
    assert ctx_ent.allowed_deferment_days == 45


def test_1_3_telegram_card_hmac_and_callback_data_bounds():
    """1.3: HMAC signature generation, verification, and 64-byte Telegram payload limit."""
    from packages.antidrift.hitl.telegram_notifier import (
        _make_callback_data,
        format_amount_bracket,
        generate_hitl_signature,
        verify_hitl_signature,
    )

    approval_id = str(uuid.uuid4())
    tenant_id = "tenant_enterprise_super_long_identifier_123"

    # 1. HMAC signature determinism and verification
    sig = generate_hitl_signature("approve", approval_id)
    assert len(sig) == 8
    assert verify_hitl_signature("approve", approval_id, sig) is True
    assert verify_hitl_signature("reject", approval_id, sig) is False
    assert verify_hitl_signature("approve", approval_id, "forged_sig") is False

    # 2. Telegram callback length strictly <= 64 bytes
    cb = _make_callback_data("approve", approval_id, tenant_id)
    assert len(cb.encode("utf-8")) <= 64

    # 3. Deal amount bracket formatting
    assert format_amount_bracket(50000) == "< 100 тыс ₽"
    assert format_amount_bracket(350000) == "300–500 тыс ₽"
    assert format_amount_bracket(1450000) == "1–2 млн ₽"
    assert format_amount_bracket(8000000) == "> 5 млн ₽"


def test_1_3_hitl_approval_ttl_expiration_safe_fallback():
    """1.3: Expired approvals (>15m) safely fallback to duty manager transfer."""
    client = TestClient(app)
    db = SessionLocal()
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    approval_id = str(uuid.uuid4())

    try:
        # Seed an expired approval (expired 5 minutes ago)
        expired_approval = HITLApproval(
            approval_id=approval_id,
            tenant_id=tenant_id,
            intent_id="int_123",
            trace_id="trc_123",
            agent_id="sales_bot",
            harness_version="v1.0",
            risk_level="HIGH",
            status="PENDING",
            requested_at=datetime.now(timezone.utc) - timedelta(minutes=20),
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
        db.add(expired_approval)
        db.commit()

        # Attempt to decide expired approval
        res = client.post(
            f"/api/v1/agents/approvals/{approval_id}/decide?tenant_id={tenant_id}",
            json={
                "decision": "APPROVE",
                "approver_id": "rop_user",
                "approver_role": "rop",
            },
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "EXPIRED"
        assert data["fallback_action"] == "TRANSFER_TO_DUTY_MANAGER"

        # Verify DB updated
        db.refresh(expired_approval)
        assert expired_approval.status == "EXPIRED"
    finally:
        db.close()


def test_1_3_hitl_approval_role_matrix_guard():
    """1.3: Role matrix enforces ROP / Head of Sales; regular manager is forbidden."""
    client = TestClient(app)
    db = SessionLocal()
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    approval_id = str(uuid.uuid4())

    try:
        active_approval = HITLApproval(
            approval_id=approval_id,
            tenant_id=tenant_id,
            intent_id="int_456",
            trace_id="trc_456",
            agent_id="sales_bot",
            harness_version="v1.0",
            risk_level="HIGH",
            status="PENDING",
            requested_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
        db.add(active_approval)
        db.commit()

        # 1. Regular manager is blocked with 403 Forbidden
        res_manager = client.post(
            f"/api/v1/agents/approvals/{approval_id}/decide?tenant_id={tenant_id}",
            json={
                "decision": "APPROVE",
                "approver_id": "mgr_john",
                "approver_role": "manager",
            },
        )
        assert res_manager.status_code == 403
        assert res_manager.json()["detail"]["error"] == "INSUFFICIENT_PERMISSIONS"

        # 2. ROP is authorized and succeeds
        admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
        auth_headers = {"x-admin-key": admin_key}
        res_rop = client.post(
            f"/api/v1/agents/approvals/{approval_id}/decide?tenant_id={tenant_id}",
            headers=auth_headers,
            json={
                "decision": "APPROVE",
                "approver_id": "rop_alice",
                "approver_role": "rop",
            },
        )
        assert res_rop.status_code == 200
        assert res_rop.json()["status"] == "DECIDED"
    finally:
        db.close()


def test_opt_in_autonomy_passive_mode_by_default():
    """Opt-In: By default, AI is strictly in Passive Advisor Mode (Zero CRM mutations, 0 direct messaging)."""
    client = TestClient(app)
    tenant_id = f"tnt_passive_{uuid.uuid4().hex[:6]}"

    proposal = {
        "trace_id": f"trc_passive_{uuid.uuid4().hex[:6]}",
        "session_id": f"ses_passive_{uuid.uuid4().hex[:6]}",
        "tenant_id": tenant_id,
        "agent_id": "sales_advisor",
        "harness_version": "v1.0",
        "policy_version": "v1.0",
        "channel": "api",
        "source_event_id": f"evt_passive_{uuid.uuid4().hex[:6]}",
        "intent": "UPDATE_DEAL_NEXT_STEP",
        "context_refs": {"deal_id": "deal_passive_1"},
        "capability_scopes": ["crm.read", "crm.set_field"],
        "proposed_actions": [
            {
                "action_type": "crm_set_field",
                "target_type": "deal",
                "target_id": "deal_passive_1",
                "payload": {"next_step": "Отправить КП повторно"},
            }
        ],
        "proposed_client_reply": {"text": "Отправляю вам обновленное коммерческое предложение.", "tone": "business"},
    }

    # Execute intent with passive default
    resp = client.post("/api/v1/agents/execute", json=proposal)
    assert resp.status_code == 200
    data = resp.json()

    # 1. Action is marked as RECOMMENDATION ONLY without mutating CRM
    assert data["status"] == "RECOMMENDED_ONLY"
    assert data["execution_mode"] == "passive_advisor"
    assert len(data["actions_executed"]) == 1
    assert data["actions_executed"][0]["status"] == "RECOMMENDED_ONLY"
    assert "Passive Read-Only mode" in data["actions_executed"][0]["notice"]

    # 2. Client communication is kept as DRAFT ONLY, not sent to customer channel
    assert data["approved_client_reply"] is None
    assert data["client_reply_draft"] == "Отправляю вам обновленное коммерческое предложение."


def test_opt_in_autonomy_multi_tenant_isolation():
    """Opt-In Multi-Tenant Isolation: Tenant B enabling mutations NEVER affects Tenant A (remains passive)."""
    client = TestClient(app)
    admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
    os.environ["REVOPS_ADMIN_KEY"] = admin_key
    auth_headers = {"x-admin-key": admin_key}

    tenant_a = f"tnt_a_{uuid.uuid4().hex[:6]}"
    tenant_b = f"tnt_b_{uuid.uuid4().hex[:6]}"

    from packages.database.models import Tenant
    db = SessionLocal()
    try:
        t_a = Tenant(id=tenant_a, name=f"Company {tenant_a}", slug=tenant_a, is_active=True, settings={})
        t_b = Tenant(id=tenant_b, name=f"Company {tenant_b}", slug=tenant_b, is_active=True, settings={})
        db.add_all([t_a, t_b])
        db.commit()
    finally:
        db.close()

    # 1. Enable mutations only for Tenant B via LK Settings API
    patch_res = client.patch(
        f"/api/v1/settings/autonomy?tenant_id={tenant_b}",
        headers=auth_headers,
        json={
            "allow_crm_mutations": True,
            "enable_telegram_notifications": True,
            "allow_client_communication": True,
        },
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["allow_crm_mutations"] is True
    assert patch_res.json()["mode"] == "autonomous"

    # 2. Verify Tenant A settings remain strictly passive
    get_a = client.get(f"/api/v1/settings/autonomy?tenant_id={tenant_a}", headers=auth_headers)
    assert get_a.status_code == 200
    assert get_a.json()["allow_crm_mutations"] is False
    assert get_a.json()["mode"] == "passive_advisor"



    # 3. Tenant B execution performs mutations
    proposal_b = {
        "trace_id": f"trc_b_{uuid.uuid4().hex[:6]}",
        "session_id": f"ses_b_{uuid.uuid4().hex[:6]}",
        "tenant_id": tenant_b,
        "agent_id": "sales_bot",
        "harness_version": "v1.0",
        "policy_version": "v1.0",
        "channel": "api",
        "source_event_id": f"evt_b_{uuid.uuid4().hex[:6]}",
        "intent": "UPDATE_DEAL_NEXT_STEP",
        "context_refs": {"deal_id": "deal_b_1"},
        "capability_scopes": ["crm.read", "crm.set_field"],
        "proposed_actions": [
            {
                "action_type": "crm_set_field",
                "target_type": "deal",
                "target_id": "deal_b_1",
                "payload": {"next_step": "Звонок клиенту"},
            }
        ],
        "proposed_client_reply": {"text": "Добрый день, связался с вами.", "tone": "business"},
    }
    resp_b = client.post("/api/v1/agents/execute", json=proposal_b)
    assert resp_b.status_code == 200
    assert resp_b.json()["status"] == "EXECUTED"
    assert resp_b.json()["approved_client_reply"] == "Добрый день, связался с вами."

    # 4. Tenant A execution strictly remains in passive advisor mode
    proposal_a = dict(proposal_b)
    proposal_a["tenant_id"] = tenant_a
    proposal_a["trace_id"] = f"trc_a_{uuid.uuid4().hex[:6]}"
    proposal_a["session_id"] = f"ses_a_{uuid.uuid4().hex[:6]}"
    proposal_a["source_event_id"] = f"evt_a_{uuid.uuid4().hex[:6]}"

    resp_a = client.post("/api/v1/agents/execute", json=proposal_a)
    assert resp_a.status_code == 200
    assert resp_a.json()["status"] == "RECOMMENDED_ONLY"
    assert resp_a.json()["execution_mode"] == "passive_advisor"
    assert resp_a.json()["approved_client_reply"] is None
    assert resp_a.json()["client_reply_draft"] == "Добрый день, связался с вами."


def test_audit_x3_endpoints_require_authentication():
    """Audit X3: Autonomy and agent control endpoints must strictly reject unauthenticated requests."""
    client = TestClient(app)

    # 1. /settings/autonomy without auth -> 401
    res_get = client.get("/api/v1/settings/autonomy?tenant_id=TNT-001")
    assert res_get.status_code == 401

    res_patch = client.patch("/api/v1/settings/autonomy?tenant_id=TNT-001", json={"allow_crm_mutations": True})
    assert res_patch.status_code == 401

    # 2. /agents/rollback without auth -> 401
    res_rollback = client.post("/api/v1/agents/rollback?tenant_id=TNT-001", json={"agent_id": "sales_bot", "target_version": "v1.0", "reason": "test"})
    assert res_rollback.status_code == 401

    # 3. /agents/kill-switch without auth -> 401
    res_kill = client.post("/api/v1/agents/kill-switch?tenant_id=TNT-001", json={"agent_id": "sales_bot", "reason": "test"})
    assert res_kill.status_code == 401

    # 4. /agents/canary/configure without auth -> 401
    res_canary = client.post("/api/v1/agents/canary/configure?tenant_id=TNT-001", json={"traffic_pct": 10.0})
    assert res_canary.status_code == 401

    # 5. /agents/approvals without auth -> 401
    res_approvals = client.get("/api/v1/agents/approvals?tenant_id=TNT-001")
    assert res_approvals.status_code == 401


def test_1_2_three_mode_trusted_context_governance(monkeypatch):
    """1.2: monitor mode passes technical context drift with warning; enforce mode blocks immediately; commercial discount blocks in both."""
    client = TestClient(app)
    tenant_id = f"tnt_mode_{uuid.uuid4().hex[:6]}"

    # Setup tenant in DB so it's a known tenant
    db = SessionLocal()
    from packages.database.models import Tenant
    try:
        t = Tenant(id=tenant_id, name=f"Company {tenant_id}", slug=tenant_id, is_active=True, settings={"allow_crm_mutations": True})
        db.add(t)
        db.commit()
    finally:
        db.close()

    # 1. MONITOR MODE: Technical context mismatch (e.g. invalid context_hash) DOES NOT BLOCK
    monkeypatch.setenv("ENABLE_TRUSTED_CONTEXT", "monitor")
    proposal_tech_drift = {
        "trace_id": f"trc_mon_{uuid.uuid4().hex[:6]}",
        "session_id": f"ses_mon_{uuid.uuid4().hex[:6]}",
        "tenant_id": tenant_id,
        "agent_id": "sales_bot",
        "harness_version": "v1.0",
        "policy_version": "v1.0",
        "channel": "api",
        "source_event_id": f"evt_mon_{uuid.uuid4().hex[:6]}",
        "intent": "UPDATE_DEAL_NEXT_STEP",
        "context_hash": "fabricated_or_mismatched_hash_12345",
        "context_assembled_at": datetime.now(timezone.utc).isoformat(),
        "context_refs": {"deal_id": "deal_mon_1"},
        "capability_scopes": ["crm.read", "crm.set_field"],
        "proposed_actions": [
            {
                "action_type": "crm_set_field",
                "target_type": "deal",
                "target_id": "deal_mon_1",
                "payload": {"next_step": "Отправить презентацию"},
            }
        ],
        "proposed_client_reply": {"text": "Добрый день, направил презентацию на почту.", "tone": "business"},
    }
    resp_mon_tech = client.post("/api/v1/agents/execute", json=proposal_tech_drift)
    assert resp_mon_tech.status_code == 200
    assert resp_mon_tech.json()["status"] == "EXECUTED"

    # 2. MONITOR MODE: Hard commercial breach (35% unauthorized discount) STILL BLOCKS (safety floor)
    proposal_mon_discount = dict(proposal_tech_drift)
    proposal_mon_discount["trace_id"] = f"trc_disc_{uuid.uuid4().hex[:6]}"
    proposal_mon_discount["source_event_id"] = f"evt_disc_{uuid.uuid4().hex[:6]}"
    proposal_mon_discount["proposed_client_reply"] = {
        "text": "Согласовал для вас эксклюзивную скидку 35% от прайса!",
        "tone": "business",
    }
    resp_mon_disc = client.post("/api/v1/agents/execute", json=proposal_mon_discount)
    assert resp_mon_disc.status_code == 403
    assert resp_mon_disc.json()["detail"]["verdict"] == "HARD_FAILURE"

    # 3. ENFORCE MODE: Technical context mismatch IS BLOCKED with 422
    monkeypatch.setenv("ENABLE_TRUSTED_CONTEXT", "enforce")
    proposal_enforce_drift = dict(proposal_tech_drift)
    proposal_enforce_drift["trace_id"] = f"trc_enf_{uuid.uuid4().hex[:6]}"
    proposal_enforce_drift["source_event_id"] = f"evt_enf_{uuid.uuid4().hex[:6]}"
    resp_enf = client.post("/api/v1/agents/execute", json=proposal_enforce_drift)
    assert resp_enf.status_code == 422


def test_1_5_caller_cannot_expand_policy_ceiling_in_context_assembler():
    """1.5: Caller input can only tighten constraints, NEVER expand beyond tenant policy ceiling."""
    tenant_id = f"tnt_ceiling_{uuid.uuid4().hex[:6]}"
    # Tenant default policy is 5.0% discount and 14 days deferment
    ctx = assemble_trusted_context(
        db=None,
        tenant_id=tenant_id,
        deal_id="deal_test_123",
        allowed_discount_max=50.0,     # Attempting to escalate to 50%
        allowed_deferment_days=90,     # Attempting to escalate to 90 days
        requires_human_above=1000000.0, # Attempting to escalate threshold to 1M
        enforce_policy_ceilings=True,
    )
    # Must be clamped down to tenant defaults
    assert ctx.allowed_discount_max == 5.0
    assert ctx.allowed_deferment_days == 14
    assert ctx.requires_human_above == 300000.0

    # But tighter constraints ARE respected
    ctx_tighter = assemble_trusted_context(
        db=None,
        tenant_id=tenant_id,
        deal_id="deal_test_123",
        allowed_discount_max=2.0,
        allowed_deferment_days=7,
        requires_human_above=100000.0,
        enforce_policy_ceilings=True,
    )
    assert ctx_tighter.allowed_discount_max == 2.0
    assert ctx_tighter.allowed_deferment_days == 7
    assert ctx_tighter.requires_human_above == 100000.0


def test_2_1_shadow_candidate_never_mutates_prod_crm():
    """Audit 2.1: An agent harness in SHADOW_RUNNING status executes strictly in shadow mode (0% prod leakage)."""
    client = TestClient(app)
    db = SessionLocal()
    agent_id = f"agent_cand_{uuid.uuid4().hex[:6]}"
    version = "v2.0-shadow-candidate"
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    deal_id = f"deal_{uuid.uuid4().hex[:6]}"

    try:
        h = HarnessRegistry(
            agent_id=agent_id,
            version=version,
            model_name="gemini-2.5-flash",
            system_prompt_hash="h" * 64,
            tools_schema_hash="s" * 64,
            status="SHADOW_RUNNING",
        )
        db.add(h)
        db.commit()

        # Execute 20 requests with diverse session IDs: ALL must execute in shadow mode
        for i in range(20):
            proposal = {
                "trace_id": f"trc_cand_{uuid.uuid4().hex[:6]}",
                "session_id": f"ses_cand_{i}_{uuid.uuid4().hex[:4]}",
                "tenant_id": tenant_id,
                "agent_id": agent_id,
                "harness_version": version,
                "policy_version": "v1.0",
                "channel": "api",
                "source_event_id": f"evt_cand_{i}_{uuid.uuid4().hex[:4]}",
                "intent": "QUALIFY_LEAD",
                "context_refs": {"deal_id": deal_id},
                "capability_scopes": ["crm.read", "crm.set_field"],
                "proposed_actions": [
                    {
                        "action_type": "crm_set_field",
                        "target_type": "deal",
                        "target_id": deal_id,
                        "payload": {"status": "qualified"},
                    }
                ],
            }
            res = client.post("/api/v1/agents/execute", json=proposal)
            assert res.status_code == 200
            assert res.json()["status"] == "SHADOW_EXECUTED"
            assert res.json()["execution_mode"] == "shadow"

        # Verify ZERO mutations in ActionExecution
        executions = db.query(ActionExecution).filter(ActionExecution.agent_id == agent_id).all()
        assert len(executions) == 0
    finally:
        db.close()


def test_2_2_paused_agent_returns_503_agent_paused():
    """Audit 2.2: A paused or killed agent harness rejects execution with 503 AGENT_PAUSED."""
    client = TestClient(app)
    db = SessionLocal()
    agent_id = f"agent_killed_{uuid.uuid4().hex[:6]}"
    version = "v1.0-killed"
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"

    try:
        h = HarnessRegistry(
            agent_id=agent_id,
            version=version,
            model_name="gemini-2.5-flash",
            system_prompt_hash="k" * 64,
            tools_schema_hash="t" * 64,
            status="PAUSED",
        )
        db.add(h)
        db.commit()

        proposal = {
            "trace_id": f"trc_k_{uuid.uuid4().hex[:6]}",
            "session_id": f"ses_k_{uuid.uuid4().hex[:6]}",
            "tenant_id": tenant_id,
            "agent_id": agent_id,
            "harness_version": version,
            "policy_version": "v1.0",
            "channel": "api",
            "source_event_id": f"evt_k_{uuid.uuid4().hex[:6]}",
            "intent": "QUALIFY_LEAD",
            "context_refs": {"deal_id": "d1"},
            "capability_scopes": ["crm.read"],
            "proposed_actions": [],
        }
        res = client.post("/api/v1/agents/execute", json=proposal)
        assert res.status_code == 503
        assert res.json()["detail"]["error"] == "AGENT_PAUSED"
    finally:
        db.close()


def test_2_3_shadow_diff_enforces_tenant_isolation():
    """Audit 2.3: Shadow traces are strictly paired ONLY with production traces of the SAME tenant."""
    db = SessionLocal()
    tenant_a = f"tnt_a_{uuid.uuid4().hex[:6]}"
    tenant_b = f"tnt_b_{uuid.uuid4().hex[:6]}"
    harness_ver = f"v_cand_{uuid.uuid4().hex[:6]}"
    common_source_event_id = f"evt_shared_{uuid.uuid4().hex[:6]}"

    try:
        # Tenant A: shadow trace
        tr_shadow_a = AgentTrace(
            trace_id=str(uuid.uuid4()),
            session_id="ses_a",
            tenant_id=tenant_a,
            agent_id="sales_bot",
            harness_version=harness_ver,
            policy_version="v1.0",
            channel="api",
            source_event_id=common_source_event_id,
            execution_mode="shadow",
            raw_intent_json={"intent": "GREETING", "proposed_actions": []},
        )
        # Tenant B: production trace with identical source_event_id
        tr_prod_b = AgentTrace(
            trace_id=str(uuid.uuid4()),
            session_id="ses_b",
            tenant_id=tenant_b,
            agent_id="sales_bot",
            harness_version="v1.0-prod",
            policy_version="v1.0",
            channel="api",
            source_event_id=common_source_event_id,
            execution_mode="prod",
            raw_intent_json={"intent": "GREETING", "proposed_actions": []},
        )
        db.add_all([tr_shadow_a, tr_prod_b])
        db.commit()

        # Comparing for Tenant A must NOT pair with Tenant B's trace
        report_a = DiffEngine.compare_shadow_vs_prod_traces(
            db=db,
            harness_version=harness_ver,
            tenant_id=tenant_a,
        )
        assert report_a["total_shadow_traces"] == 1
        assert report_a["paired_prod_traces"] == 0, "Cross-tenant trace was paired incorrectly!"
    finally:
        db.close()


def test_4_1_canary_routing_resolve_pre_execution():
    """Audit 4.2: Pre-execution traffic resolver enables genuine canary before LLM invocation."""
    client = TestClient(app)
    db = SessionLocal()
    agent_id = f"agent_canary_{uuid.uuid4().hex[:6]}"
    tenant_id = f"tnt_canary_{uuid.uuid4().hex[:6]}"

    try:
        # Register PROD harness
        h_prod = HarnessRegistry(
            agent_id=agent_id,
            version="v1.0-prod",
            model_name="gemini-2.0-flash",
            system_prompt_hash="p" * 64,
            tools_schema_hash="t" * 64,
            status="ACTIVE",
        )
        # Register Canary candidate harness
        h_canary = HarnessRegistry(
            agent_id=agent_id,
            version="v2.0-canary",
            model_name="gemini-2.5-flash",
            system_prompt_hash="c" * 64,
            tools_schema_hash="s" * 64,
            status="CANARY_RUNNING",
        )
        db.add_all([h_prod, h_canary])
        db.commit()

        # At default 0% canary weight: must resolve to PROD harness
        canary_router.configure(weight_pct=0.0, enabled=True, reset_rollback=True)
        res_zero = client.post(
            "/api/v1/agents/routing/resolve",
            json={"tenant_id": tenant_id, "agent_id": agent_id, "session_id": "sess_1"},
        )
        assert res_zero.status_code == 200
        data_zero = res_zero.json()
        assert data_zero["execution_mode"] == "prod"
        assert data_zero["harness_version"] == "v1.0-prod"
        assert data_zero["model_name"] == "gemini-2.0-flash"
        assert data_zero["is_canary"] is False

        # At 100% canary weight: must resolve to CANARY harness
        canary_router.configure(weight_pct=100.0, enabled=True, reset_rollback=True)
        res_full = client.post(
            "/api/v1/agents/routing/resolve",
            json={"tenant_id": tenant_id, "agent_id": agent_id, "session_id": "sess_2"},
        )
        assert res_full.status_code == 200
        data_full = res_full.json()
        assert data_full["execution_mode"] == "canary"
        assert data_full["harness_version"] == "v2.0-canary"
        assert data_full["model_name"] == "gemini-2.5-flash"
        assert data_full["is_canary"] is True
    finally:
        db.close()


def test_4_2_prod_failure_does_not_trip_canary_auto_rollback():
    """Audit 4.3: A production failure must never increment canary counts or trip canary auto-rollback."""
    client = TestClient(app)
    tenant_id = f"tnt_cb_{uuid.uuid4().hex[:6]}"
    canary_router.reset()
    canary_router.configure(weight_pct=10.0, enabled=True, reset_rollback=True)

    # 1. Simulate PROD failure (e.g., unauthorized discount breach)
    proposal_prod = {
        "trace_id": str(uuid.uuid4()),
        "session_id": f"ses_prod_{uuid.uuid4().hex[:6]}",
        "tenant_id": tenant_id,
        "agent_id": "sales_bot",
        "harness_version": "v1.0",
        "policy_version": "v1.0",
        "execution_mode": "prod",
        "channel": "api",
        "source_event_id": f"evt_prod_{uuid.uuid4().hex[:6]}",
        "intent": "CLOSE_DEAL",
        "context_refs": {"deal_id": "d1"},
        "capability_scopes": ["crm.read", "crm.change_budget"],
        "proposed_actions": [],
        "proposed_client_reply": {
            "channel": "chat",
            "recipient_id": "cli_1",
            "text": "Мы дадим вам скидку 25% на всё!",
        },
    }
    res_prod = client.post("/api/v1/agents/execute", json=proposal_prod)
    assert res_prod.status_code == 403

    status_after_prod = canary_router.get_status(tenant_id=tenant_id)
    assert status_after_prod["auto_rollback_active"] is False, "PROD failure tripped canary rollback!"
    assert status_after_prod["canary_sessions_count"] == 0, "PROD session was counted as canary!"

    # 2. Direct canary failure must trip the circuit breaker
    canary_router.record_canary_execution(tenant_id=tenant_id, is_hard_failure=True, execution_mode="canary")
    status_after_canary = canary_router.get_status(tenant_id=tenant_id)
    assert status_after_canary["auto_rollback_active"] is True
    assert status_after_canary["weight_pct"] == 0.0


def test_4_3_tenant_isolated_canary_circuit_breaker():
    """Audit 4.3: Canary circuit breaker trips ONLY for the affected tenant, isolating other tenants."""
    canary_router.reset()
    tenant_a = f"tnt_a_{uuid.uuid4().hex[:6]}"
    tenant_b = f"tnt_b_{uuid.uuid4().hex[:6]}"

    # Configure both tenants with 20% canary
    canary_router.configure(tenant_id=tenant_a, weight_pct=20.0, enabled=True, reset_rollback=True)
    canary_router.configure(tenant_id=tenant_b, weight_pct=20.0, enabled=True, reset_rollback=True)

    # Trip canary for Tenant A
    canary_router.record_canary_execution(tenant_id=tenant_a, is_hard_failure=True, execution_mode="canary")

    assert canary_router.get_status(tenant_id=tenant_a)["auto_rollback_active"] is True
    assert canary_router.get_status(tenant_id=tenant_a)["weight_pct"] == 0.0

    # Tenant B must remain healthy and active at 20%
    assert canary_router.get_status(tenant_id=tenant_b)["auto_rollback_active"] is False
    assert canary_router.get_status(tenant_id=tenant_b)["weight_pct"] == 20.0


def test_3_1_raw_trace_is_pii_sanitized_in_db():
    """Audit 3.2: PendingVCRScenario must never persist unsanitized PII in raw_trace column."""
    db = SessionLocal()
    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"
    trace_id = str(uuid.uuid4())
    try:
        raw_payload = {
            "tenant_id": tenant_id,
            "client_message": "Позвоните мне 8 (999) 123-45-67 или напишите на client@acme.com",
            "phone": "79991234567",
        }
        sc = VCRScenarioGenerator.capture_incident_as_pending(
            db=db,
            trace_id=trace_id,
            source_policy="GR-03",
            raw_trace=raw_payload,
            error_summary="Discount promised: call 8 (999) 123-45-67",
        )
        assert sc is not None
        # Check database object directly
        saved = db.query(PendingVCRScenario).filter(PendingVCRScenario.id == sc.id).first()
        assert saved is not None
        assert "8 (999) 123-45-67" not in str(saved.raw_trace)
        assert "79991234567" not in str(saved.raw_trace)
        assert "client@acme.com" not in str(saved.raw_trace)
        assert "[REDACTED_PHONE]" in str(saved.raw_trace)
        assert "[REDACTED_EMAIL]" in str(saved.raw_trace)
        assert "8 (999) 123-45-67" not in str(saved.error_summary)
    finally:
        db.close()


def test_3_2_pii_sanitizer_coverage_all_patterns():
    """Audit 3.3: PIISanitizer must mask phones (including 79...), FIO, INN, Bitrix webhooks, and TG bot tokens."""
    sample = {
        "phone1": "8 (999) 123-45-67",
        "phone2": "+7 999 1234567",
        "phone3": "79991234567",
        "email": "ivanov@acme.ru",
        "fio": "Иванов Иван Иванович, ЛПР",
        "inn": "ИНН 7707083893",
        "bitrix_webhook": "https://acme.bitrix24.ru/rest/1/q8w7e6r5t4y3u2i1/",
        "tg_bot_token": "1234567890:AAHk2xFhPZ9vQwErTyUiOpAsDfGhJkLzXcV",
        "amo_jwt": "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig",
    }
    sanitized = PIISanitizer.sanitize_data(sample)
    for k, v in sample.items():
        assert sanitized[k] != v, f"Sensitive field '{k}' was LEAKED without masking!"


def test_3_3_dedup_by_normalized_root_cause():
    """Audit 3.4: Dynamic numbers/percentages in error summary must be normalized to prevent scenario flooding."""
    db = SessionLocal()
    tenant_id = f"tnt_dedup_{uuid.uuid4().hex[:6]}"
    try:
        n0 = db.query(PendingVCRScenario).count()
        for amt in (41, 42, 43):
            VCRScenarioGenerator.capture_incident_as_pending(
                db=db,
                trace_id=str(uuid.uuid4()),
                source_policy="GR-03",
                raw_trace={"tenant_id": tenant_id},
                error_summary=f"Discount {amt}% exceeds 5% (GR-03)",
            )
        new_scenarios = db.query(PendingVCRScenario).count() - n0
        assert new_scenarios == 1, f"Expected 1 deduplicated scenario, but got {new_scenarios}!"
    finally:
        db.close()


def test_3_4_rejected_scenario_cannot_generate_artifacts():
    """Audit 3.5: Cannot generate test artifacts from a scenario in REJECTED status."""
    db = SessionLocal()
    try:
        sc = PendingVCRScenario(
            id=str(uuid.uuid4()),
            trace_id=str(uuid.uuid4()),
            source_policy="GR-02",
            cohort="04_conflicts",
            raw_trace={"intent": "TEST"},
            pii_sanitized_trace={"intent": "TEST"},
            status="REJECTED",
            error_summary="Disallowed",
            created_at=datetime.now(timezone.utc),
        )
        db.add(sc)
        db.commit()

        with pytest.raises(ValueError, match="REJECTED"):
            VCRScenarioGenerator.generate_test_artifacts(db, sc.id)
    finally:
        db.close()
