"""
Comprehensive Test Suite for RevOps Intelligence Enterprise SaaS V2 Endpoints.
Covers:
- Simulator API (Monte Carlo, Caching, Percentiles, Histograms)
- Deals API (SLA risks, Fix Next Step, Real-time update)
- Metrics API (Historical & Projected time-series)
- AI Insights API (Claude API analysis / Fallback generation)
- Webhooks API (amoCRM, Bitrix24 ingestion)
- WebSocket Gateway (/ws/org/{org_id})
"""

import os
import pytest
from fastapi.testclient import TestClient

from apps.api.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_deals_list_and_fix_step(client):
    # 1. Fetch deals
    res = client.get("/api/v1/deals?sla_risk_only=true")
    assert res.status_code == 200
    data = res.json()
    assert "deals" in data
    assert data["total"] >= 1
    deal_to_fix = data["deals"][0]
    deal_id = deal_to_fix["id"]
    assert deal_to_fix["sla_risk"] is True

    # 2. Fix next step
    fix_res = client.post(f"/api/v1/deals/{deal_id}/fix-next-step", json={"next_step_date": "2026-10-10"})
    assert fix_res.status_code == 200
    fixed = fix_res.json()["deal"]
    assert fixed["id"] == deal_id
    assert fixed["sla_risk"] is False
    assert fixed["next_step_date"] == "2026-10-10"


def test_metrics_revenue_history(client):
    res = client.get("/api/v1/metrics/revenue-history?org_id=org_demo")
    assert res.status_code == 200
    data = res.json()
    assert "history" in data
    assert len(data["history"]) >= 6
    for item in data["history"]:
        assert "month" in item
        assert "revenue" in item
        assert "scenario" in item


def test_ai_insights_summary(client):
    from apps.api.auth import create_access_token
    token = create_access_token({"sub": "usr-admin-test", "tenant_id": "TNT-001", "role": "⚙️ Admin"})
    res = client.get(
        "/api/v1/insights/summary?org_id=org_demo&p10=3000000&p50=7500000&p90=14000000",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert "insights" in data
    assert len(data["insights"]) >= 3
    if os.getenv("ANTHROPIC_API_KEY"):
        assert "claude_model" in data
    else:
        assert "claude_model" not in data
    assert "executive_summary" in data


def test_webhooks_ingestion(client):
    # Test amoCRM webhook
    amo_res = client.post("/api/v1/webhooks/amo-crm", json={"event": "status_update", "leads": [{"id": 12345, "price": 500000}]})
    assert amo_res.status_code == 200
    assert amo_res.json()["status"] == "ok"
    assert amo_res.json()["source"] == "amoCRM"

    # Test Bitrix24 webhook
    bx_res = client.post("/api/v1/webhooks/bitrix24", json={"event": "ONCRMDEALUPDATE", "data": {"FIELDS": {"ID": 9876}}})
    assert bx_res.status_code == 200
    assert bx_res.json()["status"] == "ok"
    assert bx_res.json()["source"] == "Bitrix24"


def test_simulator_run_and_caching(client):
    payload = {
        "org_id": "test_org",
        "leads": 200,
        "qual_rate": 0.45,
        "close_rate": 0.25,
        "avg_ticket": 120000.0,
        "iterations": 1000
    }
    # 1. Run simulation
    run_res = client.post("/api/v1/simulator/run-monte-carlo", json=payload)
    assert run_res.status_code == 200
    data = run_res.json()
    assert "simulation_id" in data
    assert data["p10"] > 0
    assert data["p50"] > data["p10"]
    assert data["p90"] > data["p50"]
    assert len(data["histogram_bins"]) >= 10
    assert len(data["histogram_counts"]) >= 10

    # 2. Query cached result by simulation_id
    sim_id = data["simulation_id"]
    get_res = client.get(f"/api/v1/simulator/results/{sim_id}")
    assert get_res.status_code == 200
    cached = get_res.json()
    assert cached["simulation_id"] == sim_id
    assert cached["p50"] == data["p50"]


def test_websocket_connection(client):
    with client.websocket_connect("/ws/org/org_test_123") as websocket:
        websocket.send_text("ping")
        data = websocket.receive_json()
        assert data["type"] == "pong"
        assert data["received"] == "ping"


def test_monitoring_and_observability(client):
    from packages.monitoring.metrics import telemetry
    telemetry.request_latencies.clear()
    telemetry.request_latencies.append(0.05)

    # Test Prometheus metrics
    prom_res = client.get("/metrics")
    assert prom_res.status_code == 200
    assert "revops_api_latency_p95_seconds" in prom_res.text

    # Test JSON health & alerts
    health_res = client.get("/api/v1/monitoring/health")
    assert health_res.status_code == 200
    data = health_res.json()
    assert "api_latency_p95_sec" in data
    assert "alerts" in data
    assert data["alerts"]["latency_breach_alert"] is False
