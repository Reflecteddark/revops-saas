"""
tests/antidrift/test_antidrift_observability_canary.py

Verification suite for Sprint 4 (Observability, Canary Traffic Router & Auto-Tuning):
1. Trace Lineage & Database Schema (context_hash, auto_vcr_generated).
2. Prometheus Metrics Exposition (fact failures, shadow divergence, auto-VCR, canary weight).
3. Canary Router deterministic hashing & progressive weight distribution.
4. Automated Rollback Circuit Breaker on HARD_FAILURE and excessive divergence.
5. Adaptive Policy Auto-Tuning from HITL approval records.
6. REST API endpoints (/metrics, /canary/status, /canary/configure, /policy/recommendations).
"""

import os
import uuid
from datetime import datetime, timezone
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from apps.api.main import app
from packages.antidrift.canary.canary_router import CanaryRouter, canary_router
from packages.antidrift.contracts.intent import ExecutionMode
from packages.antidrift.models import AgentIntent, AgentTrace, HITLApproval
from packages.antidrift.policy_autotune import PolicyAutoTuner
from packages.antidrift.telemetry.metrics import AntidriftMetricsRegistry, antidrift_metrics
from packages.database.models import Base
from packages.database.session import get_db, init_db


@pytest.fixture(autouse=True)
def setup_test_environment():
    """Ensure database schema is initialized and metrics/canary are in clean state."""
    init_db()
    antidrift_metrics.reset()
    canary_router.reset()
    yield
    antidrift_metrics.reset()
    canary_router.reset()


def test_agent_trace_schema_lineage():
    """Verify that AgentTrace supports context_hash, auto_vcr_generated, and execution_mode."""
    trace_id = str(uuid.uuid4())
    tenant_id = f"test-tenant-{uuid.uuid4().hex[:6]}"
    
    trace = AgentTrace(
        trace_id=trace_id,
        session_id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        agent_id="test_agent",
        harness_version="v2.0",
        policy_version="v1.0",
        channel="api",
        source_event_id=str(uuid.uuid4()),
        execution_mode="canary",
        context_hash="abc123def4567890",
        auto_vcr_generated=True,
    )
    assert trace.execution_mode == "canary"
    assert trace.context_hash == "abc123def4567890"
    assert trace.auto_vcr_generated is True


def test_prometheus_metrics_registry():
    """Verify all 5 required Prometheus metrics format and counter increments."""
    tenant = f"tnt_{uuid.uuid4().hex[:6]}"
    
    # 1. Fact failures counter
    antidrift_metrics.record_fact_check_failure(tenant, "GR-03", "unauthorized_discount")
    antidrift_metrics.record_fact_check_failure(tenant, "GR-03", "unauthorized_discount")
    
    # 2. Shadow divergence gauge
    antidrift_metrics.record_shadow_comparison(tenant, is_divergent=False)
    antidrift_metrics.record_shadow_comparison(tenant, is_divergent=True)
    rate = antidrift_metrics.get_shadow_divergence_rate(tenant)
    assert rate == 0.5

    # 3. Auto-VCR generated counter
    antidrift_metrics.record_auto_vcr_generated("03_financials", "GR-03")
    
    # 4. Canary weight & rollbacks
    antidrift_metrics.set_canary_weight(0.15)
    assert antidrift_metrics.get_canary_weight() == 0.15
    antidrift_metrics.record_canary_rollback()
    assert antidrift_metrics.get_canary_weight() == 0.0

    # 5. Prometheus text output validation
    prom_text = antidrift_metrics.to_prometheus_format()
    assert "# HELP antidrift_fact_check_failures_total" in prom_text
    assert 'antidrift_fact_check_failures_total{policy="GR-03",reason="unauthorized_discount"} 2' in prom_text
    assert "# HELP shadow_divergence_rate" in prom_text
    assert "shadow_divergence_rate 0.5" in prom_text
    assert "# HELP auto_vcr_scenarios_generated_total" in prom_text
    assert 'auto_vcr_scenarios_generated_total{cohort="03_financials",policy="GR-03"} 1' in prom_text
    assert "canary_traffic_weight 0.0" in prom_text
    assert "canary_rollbacks_total 1" in prom_text


def test_canary_router_deterministic_partitioning():
    """Verify deterministic traffic routing based on tenant and session hashing."""
    tenant = f"tnt_{uuid.uuid4().hex[:6]}"
    session_1 = "fixed_session_alpha"
    session_2 = "fixed_session_beta"

    canary_router.configure(weight_pct=50.0, reset_rollback=True)

    # Determinism: same input gives exact same output
    mode_a1 = canary_router.decide_execution_mode(tenant, session_1)
    mode_a2 = canary_router.decide_execution_mode(tenant, session_1)
    assert mode_a1 == mode_a2

    # Zero weight routes 100% to prod
    canary_router.configure(weight_pct=0.0)
    for i in range(20):
        assert canary_router.decide_execution_mode(tenant, f"sess_{i}") == "prod"

    # 100% weight routes 100% to canary
    canary_router.configure(weight_pct=100.0)
    for i in range(20):
        assert canary_router.decide_execution_mode(tenant, f"sess_{i}") == "canary"


def test_canary_auto_rollback_on_hard_failure():
    """Verify circuit breaker trips and resets weight to 0.0% upon HARD_FAILURE."""
    tenant = f"tnt_{uuid.uuid4().hex[:6]}"
    canary_router.configure(weight_pct=25.0, reset_rollback=True)
    assert canary_router.get_status()["weight_pct"] == 25.0
    assert canary_router.get_status()["auto_rollback_active"] is False

    # Simulate HARD_FAILURE on canary
    canary_router.record_canary_execution(tenant, is_hard_failure=True)

    status = canary_router.get_status()
    assert status["auto_rollback_active"] is True
    assert status["weight_pct"] == 0.0
    assert "HARD_FAILURE detected" in status["rollback_reason"]

    # In rollback state, even 100% requests route to prod
    assert canary_router.decide_execution_mode(tenant, "any_session") == "prod"


def test_policy_auto_tuner_recommendations():
    """Verify data-driven threshold calibration for operational limits (B3 Safety Floor)."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()

    tenant_id = f"tnt_{uuid.uuid4().hex[:6]}"

    # Populate 5 approved HITL requests for deals over 300k
    for i in range(5):
        trace_id = str(uuid.uuid4())
        intent_id = str(uuid.uuid4())
        amount_val = 350000.0 + i * 20000

        intent = AgentIntent(
            intent_id=intent_id,
            trace_id=trace_id,
            session_id=str(uuid.uuid4()),
            tenant_id=tenant_id,
            agent_id="closer_agent",
            harness_version="v1.0",
            intent_name="approve_large_deal",
            payload_json={"deal_amount": amount_val},
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
    assert len(recs) == 1
    rec = recs[0]
    assert rec.policy_id == "OP-01_AMOUNT_THRESHOLD"
    assert rec.parameter_name == "requires_human_above"
    assert rec.recommendation_type == "RELAX_OPERATIONAL_THRESHOLD"
    # Max change is <= +20% (300k -> 360k)
    assert rec.recommended_threshold == 360000.0
    assert rec.approved_samples == 5
    assert rec.confidence_score == 1.0
    assert rec.requires_manual_pr is True


def test_phase4_api_endpoints():
    """Verify HTTP status and payloads for all Phase 4 REST endpoints."""
    client = TestClient(app)

    # 1. /api/v1/agents/metrics
    res_metrics = client.get("/api/v1/agents/metrics")
    assert res_metrics.status_code == 200
    assert "antidrift_fact_check_failures_total" in res_metrics.text
    assert "canary_traffic_weight" in res_metrics.text

    # 2. /api/v1/agents/canary/status
    res_status = client.get("/api/v1/agents/canary/status")
    assert res_status.status_code == 200
    data = res_status.json()
    assert "enabled" in data
    assert "weight_pct" in data
    assert "auto_rollback_active" in data

    # 3. /api/v1/agents/canary/configure
    admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
    auth_headers = {"x-admin-key": admin_key}
    res_config = client.post(
        "/api/v1/agents/canary/configure",
        json={"weight_pct": 12.5, "reset_rollback": True},
        headers=auth_headers,
    )
    assert res_config.status_code == 200
    cfg = res_config.json()
    assert cfg["weight_pct"] == 12.5
    assert cfg["auto_rollback_active"] is False

    # 4. /api/v1/agents/policy/recommendations
    res_recs = client.get("/api/v1/agents/policy/recommendations", headers=auth_headers)
    assert res_recs.status_code == 200
    assert isinstance(res_recs.json(), list)

    # 5. Global Prometheus scraper endpoint (/metrics)
    res_global = client.get("/metrics")
    assert res_global.status_code == 200
    assert "antidrift_fact_check_failures_total" in res_global.text
