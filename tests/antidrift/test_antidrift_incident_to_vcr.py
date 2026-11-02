"""
tests/antidrift/test_antidrift_incident_to_vcr.py

Integration and unit tests for Sprint 3 (Incident-to-VCR Loop & Self-Healing Regression):
- Automatic capture of HARD_FAILURE breaches into pending_vcr_scenarios
- 100% PII and sensitive token sanitization
- Generation of Golden Scenario JSON and VCR Cassette YAML artifacts
- Freshness Engine validation (detects STALE_MOCK_ERROR when CRM schema or policy drifts)
- REST API endpoints for pending scenario queue, test generation, and review
"""

import json
import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from packages.database.session import SessionLocal
from packages.antidrift.contracts.intent import (
    ActionItem,
    ActionRiskLevel,
    ActionType,
    AgentIntentPayload,
)
from packages.antidrift.golden_set.vcr_engine import PIISanitizer, VCREngine
from packages.antidrift.golden_set.vcr_scenario_generator import VCRScenarioGenerator
from packages.antidrift.models import (
    GoldenScenario,
    PendingVCRScenario,
    VCRCassette,
)

client = TestClient(app)


@pytest.fixture
def dynamic_tenant_id():
    return f"tenant_{uuid.uuid4().hex[:8]}"


@pytest.fixture
def dynamic_deal_id():
    return f"deal_{uuid.uuid4().hex[:8]}"


def test_pii_sanitizer_removes_sensitive_data():
    """Verifies that PIISanitizer strips 100% of tokens, emails, phone numbers, and API keys."""
    raw_payload = {
        "client_name": "Иван Иванов",
        "phone": "+7 999 123-45-67",
        "email": "ivan.client@sample.ru",
        "notes": "Позвонить по номеру 8 (495) 777-88-99 или написать на boss@company.org",
        "auth_headers": {
            "api_key": "sk-1234567890abcdef1234567890abcdef",
            "bearer": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-IDcSemACt8x4iTMCda8Yhe3iZaWbvV5XKSTbuAn0M",
            "github_token": "ghp_123456789012345678901234567890",
            "google_key": "AIzaSyD-123456789012345678901234567890",
        },
    }

    sanitized = PIISanitizer.sanitize_data(raw_payload)

    # 1. Phone check
    assert "+7 999 123-45-67" not in str(sanitized)
    assert "8 (495) 777-88-99" not in str(sanitized)
    assert "[REDACTED_PHONE]" in str(sanitized)

    # 2. Email check
    assert "ivan.client@sample.ru" not in str(sanitized)
    assert "boss@company.org" not in str(sanitized)
    assert "[REDACTED_EMAIL]" in str(sanitized)

    # 3. Token & Key check
    assert "sk-1234567890abcdef1234567890abcdef" not in str(sanitized)
    assert "ghp_123456789012345678901234567890" not in str(sanitized)
    assert "AIzaSyD-123456789012345678901234567890" not in str(sanitized)
    assert "[REDACTED_TOKEN]" in str(sanitized)


def test_hard_failure_automatically_captures_pending_scenario(dynamic_tenant_id, dynamic_deal_id):
    """
    Verifies that a production HARD_FAILURE execution automatically creates
    a PENDING scenario record in pending_vcr_scenarios within the database.
    """
    trace_id = f"trc_breach_{uuid.uuid4().hex}"
    source_evt = f"evt_breach_{uuid.uuid4().hex}"

    # Dangerous deletion action (Forbidden by GR-00)
    proposal = {
        "trace_id": trace_id,
        "session_id": f"ses_{uuid.uuid4().hex[:8]}",
        "tenant_id": dynamic_tenant_id,
        "agent_id": "agent_auto_test",
        "harness_version": "v1.5.0",
        "policy_version": "2026.03.pol",
        "channel": "api",
        "source_event_id": source_evt,
        "intent": "PURGE_DEAL",
        "context_refs": {"deal_id": dynamic_deal_id, "contact_phone": "+7 999 333-22-11"},
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

    # Execute endpoint -> triggers 403 Forbidden
    resp = client.post("/api/v1/agents/execute", json=proposal)
    assert resp.status_code == 403
    assert resp.json()["detail"]["status"] == "BLOCKED"

    # Verify pending scenario created
    db = SessionLocal()
    try:
        pending = (
            db.query(PendingVCRScenario)
            .filter(PendingVCRScenario.trace_id == trace_id)
            .first()
        )
        assert pending is not None
        assert pending.status == "PENDING"
        assert pending.cohort == "01_safety"
        assert "GR-00" in pending.source_policy

        # Verify PII was redacted in stored trace
        sanitized_phone = str(pending.pii_sanitized_trace)
        assert "+7 999 333-22-11" not in sanitized_phone
        assert "[REDACTED_PHONE]" in sanitized_phone
    finally:
        db.close()


def test_vcr_scenario_generator_creates_test_artifacts(dynamic_tenant_id, dynamic_deal_id):
    """
    Verifies that VCRScenarioGenerator produces GoldenScenario JSON
    and VCRCassette YAML files and registers them in the database mirror.
    """
    temp_dir = Path(tempfile.mkdtemp())
    try:
        db = SessionLocal()
        trace_id = f"trc_gen_{uuid.uuid4().hex}"

        # 1. Capture pending scenario
        raw_intent = {
            "intent": "DISCUSS_PRICE",
            "agent_id": "sales_agent",
            "crm_schema_hash": "schema_sha256_mock",
            "policy_version": "v1.0",
            "proposed_client_reply": {"text": "Даём вам скидку 40%!"},
            "customer_email": "client@sample.ru",
        }
        pending = VCRScenarioGenerator.capture_incident_as_pending(
            db=db,
            trace_id=trace_id,
            source_policy="GR-03",
            raw_trace=raw_intent,
            error_summary="Proposed discount 40% exceeds authorized limit 5%",
        )
        assert pending is not None
        assert pending.cohort == "03_financials"

        # 2. Generate test artifacts
        result = VCRScenarioGenerator.generate_test_artifacts(
            db=db,
            scenario_id=pending.id,
            base_dir=temp_dir,
        )
        assert result["status"] == "GENERATED"
        assert result["cohort"] == "03_financials"

        # Check created files
        json_path = Path(result["json_path"])
        yaml_path = Path(result["yaml_path"])
        assert json_path.exists()
        assert yaml_path.exists()

        # Validate JSON content
        with open(json_path, "r", encoding="utf-8") as f:
            data_json = json.load(f)
        assert data_json["scenario_id"] == result["scenario_id"]
        assert data_json["cohort"] == "03_financials"
        assert data_json["expected_invariants"]["expected_verdict"] == "HARD_FAILURE"
        assert "[REDACTED_EMAIL]" in str(data_json["input"])

        # Check DB mirror
        scenario_db = db.query(GoldenScenario).filter(GoldenScenario.scenario_id == result["scenario_id"]).first()
        assert scenario_db is not None
        assert scenario_db.status == "ACTIVE"

        cassette_db = db.query(VCRCassette).filter(VCRCassette.scenario_id == result["scenario_id"]).first()
        assert cassette_db is not None
        assert cassette_db.crm_schema_hash == "schema_sha256_mock"
    finally:
        short_id = pending.id[:8]
        (Path("tests/golden_set/04_conflicts") / f"auto_{short_id}.json").unlink(missing_ok=True)
        (Path("fixtures/vcr") / f"auto_{short_id}.yaml").unlink(missing_ok=True)
        db.close()
        shutil.rmtree(temp_dir, ignore_errors=True)


def test_freshness_engine_detects_stale_schema_or_policy():
    """
    Freshness Engine: Verifies that VCR cassettes flag STALE_MOCK_ERROR
    when the active CRM schema or policy version deviates from the frozen cassette.
    """
    db = SessionLocal()
    try:
        scenario_id = f"auto_{uuid.uuid4().hex[:8]}"
        cassette = VCRCassette(
            cassette_id=f"cas_{scenario_id}",
            scenario_id=scenario_id,
            target_service="amocrm",
            recorded_at=datetime.now(timezone.utc),
            crm_schema_hash="hash_baseline_v1",
            policy_version="v1.0",
            status="VALID",
            sanitized_payload_json={},
        )

        # 1. Matching schema and policy -> FRESH
        is_fresh = VCREngine.check_cassette_freshness(
            cassette=cassette,
            current_crm_schema_hash="hash_baseline_v1",
            current_policy_version="v1.0",
        )
        assert is_fresh is True
        assert cassette.status == "VALID"

        # 2. Schema drifted (new CRM custom field) -> STALE_MOCK_ERROR
        is_fresh_drifted = VCREngine.check_cassette_freshness(
            cassette=cassette,
            current_crm_schema_hash="hash_mutated_v2",
            current_policy_version="v1.0",
        )
        assert is_fresh_drifted is False
        assert cassette.status == "STALE_MOCK_ERROR"

        # 3. Policy version drifted -> STALE_MOCK_ERROR
        cassette.status = "VALID"
        is_policy_drifted = VCREngine.check_cassette_freshness(
            cassette=cassette,
            current_crm_schema_hash="hash_baseline_v1",
            current_policy_version="v2.0",
        )
        assert is_policy_drifted is False
        assert cassette.status == "STALE_MOCK_ERROR"
    finally:
        db.close()


def test_vcr_rest_endpoints_pending_generate_review_stats(dynamic_tenant_id):
    """
    Tests REST API endpoints:
    - GET /api/v1/agents/vcr/pending
    - POST /api/v1/agents/vcr/review (APPROVE / REJECT)
    - GET /api/v1/agents/vcr/stats
    """
    db = SessionLocal()
    try:
        # 1. Add pending scenario
        pending = PendingVCRScenario(
            id=str(uuid.uuid4()),
            trace_id=f"trc_api_{uuid.uuid4().hex}",
            source_policy="GR-02",
            cohort="04_conflicts",
            raw_trace={"intent": "ROLLBACK_STAGE"},
            pii_sanitized_trace={"intent": "ROLLBACK_STAGE"},
            status="PENDING",
            error_summary="Disallowed stage rollback",
            created_at=datetime.now(timezone.utc),
        )
        db.add(pending)
        db.commit()

        # 2. List pending
        admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
        auth_headers = {"x-admin-key": admin_key}
        resp = client.get("/api/v1/agents/vcr/pending", headers=auth_headers)
        assert resp.status_code == 200
        items = resp.json()
        assert any(item["id"] == pending.id for item in items)

        # 3. Review: APPROVE
        review_resp = client.post(
            "/api/v1/agents/vcr/review",
            json={"scenario_id": pending.id, "decision": "APPROVE"},
            headers=auth_headers,
        )
        assert review_resp.status_code == 200
        assert review_resp.json()["status"] == "APPROVED"

        # 4. Stats endpoint
        stats_resp = client.get("/api/v1/agents/vcr/stats", headers=auth_headers)
        assert stats_resp.status_code == 200
        stats = stats_resp.json()
        assert stats["auto_tests_total"] >= 1
        assert "Авто-тестов из инцидентов" in stats["summary"]
    finally:
        short_id = pending.id[:8]
        (Path("tests/golden_set/04_conflicts") / f"auto_{short_id}.json").unlink(missing_ok=True)
        (Path("fixtures/vcr") / f"auto_{short_id}.yaml").unlink(missing_ok=True)
        db.close()
