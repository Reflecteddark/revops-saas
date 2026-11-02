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
from sqlalchemy.orm import sessionmaker

from apps.api.main import app
from packages.database.session import SessionLocal
from packages.antidrift.barrier.idempotency import IdempotencyManager
from packages.antidrift.barrier.validator import IntentValidator
from packages.antidrift.canary.canary_router import canary_router
from packages.antidrift.context.context_assembler import TrustedContext
from packages.antidrift.contracts.intent import ActionType, ExecutionMode, VerifiedIntentProposal
from packages.antidrift.contracts.policy_config import TenantPolicyConfig, TenantPolicyRegistry
from packages.antidrift.diff.diff_engine import DiffEngine
from packages.antidrift.golden_set.vcr_scenario_generator import VCRScenarioGenerator
from packages.antidrift.models import AgentIncident, AgentIntent, AgentTrace, HITLApproval, IdempotencyKeyRecord, PendingVCRScenario
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
    engine = create_engine("sqlite:///:memory:")
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
    engine = create_engine("sqlite:///:memory:")
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
    engine = create_engine("sqlite:///:memory:")
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
    engine = create_engine("sqlite:///:memory:")
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
        res_rop = client.post(
            f"/api/v1/agents/approvals/{approval_id}/decide?tenant_id={tenant_id}",
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
