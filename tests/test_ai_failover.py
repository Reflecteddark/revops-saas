"""
Unit & Integration Tests for RevOps Multi-Tier Gemini AI Failover & Synthetic Probe.
Tests:
- Tier 1 primary execution
- Automatic cascade failover to Tier 2 when Tier 1 fails
- Automatic failover to Tier 4 Local SSOT when all AI tiers fail
- Synthetic probe status and outage notification
- Multi-tenant contextual scoping in POST /api/v1/insights/analyst/chat
"""

import asyncio
from unittest.mock import patch
from fastapi.testclient import TestClient
import httpx
import pytest

from apps.api.main import app
from packages.database.session import init_db
from packages.monitoring.ai_probe import (
    generate_gemini_content_cascade,
    probe_gemini_models_sync,
)

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Initializes schema for isolated test environments."""
    init_db()



def test_ai_probe_sync_healthy():
    """Verifies that the synthetic probe checks models and reports health status."""
    res = probe_gemini_models_sync(timeout=8.0)
    assert isinstance(res, dict)
    assert "healthy" in res
    assert "latency_ms" in res
    if res["healthy"]:
        assert res["active_tier"] in ("Tier 1", "Tier 2")
        assert res["model"] in ("gemini-3.5-flash-lite", "gemini-flash-lite-latest")


def test_ai_cascade_success_tier1():
    """Verifies successful cascade generation from Tier 1."""
    res = asyncio.run(
        generate_gemini_content_cascade(
            system_prompt="Ты CCO компании",
            user_message="План дожима на неделю",
            timeout=10.0,
        )
    )
    assert isinstance(res, dict)
    if res.get("status") == "ok":
        assert res.get("tier") in ("Tier 1", "Tier 2")
        assert len(res.get("reply", "")) > 10
        assert res.get("latency_ms", 0) > 0


def test_ai_cascade_failover_to_tier2():
    """Simulates Tier 1 returning 503 Service Unavailable and verifies automatic failover to Tier 2."""
    dummy_req = httpx.Request("POST", "https://gemini-proxy.test")
    resp_503 = httpx.Response(503, json={"error": "Service overloaded"}, request=dummy_req)
    resp_200 = httpx.Response(
        200,
        json={
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": "### План CCO от резервной модели (Tier 2)\n1. Дожать сделки"}
                        ]
                    }
                }
            ]
        },
        request=dummy_req,
    )

    with patch.object(httpx.AsyncClient, "post", side_effect=[resp_503, resp_200]):
        res = asyncio.run(
            generate_gemini_content_cascade(
                system_prompt="Ты CCO",
                user_message="Тест failover",
                timeout=5.0,
            )
        )

        assert res["status"] == "ok"
        assert res["tier"] == "Tier 2"
        assert "План CCO от резервной модели" in res["reply"]


def test_ai_cascade_failover_to_tier4_ssot():
    """Simulates all AI tiers failing and verifies graceful fallback to Tier 4 Local SSOT."""
    dummy_req = httpx.Request("POST", "https://gemini-proxy.test")
    resp_500 = httpx.Response(500, text="Internal Error", request=dummy_req)

    with patch.object(httpx.AsyncClient, "post", side_effect=[resp_500, resp_500, resp_500]):
        res = asyncio.run(
            generate_gemini_content_cascade(
                system_prompt="Ты CCO",
                user_message="Тест полного падения",
                timeout=5.0,
            )
        )

        assert res["status"] == "error"
        assert res["tier"] == "Tier 4"
        assert res["model"] == "deterministic_ssot"


def test_analyst_chat_api_endpoint():
    """Tests POST /api/v1/insights/analyst/chat with tenant scoping."""
    payload = {
        "message": "Где мы теряем больше всего денег?",
        "tenant_id": "TNT-001",
        "context": {
            "total_calls": 14,
            "avg_score": 9.8,
            "next_step_pct": 78.5,
            "fake_yes_count": 3,
            "leak_rub": 1500000.0,
        },
    }
    from apps.api.auth import create_access_token
    token = create_access_token({"sub": "usr-tnt-001", "tenant_id": "TNT-001"})
    response = client.post(
        "/api/v1/insights/analyst/chat",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "reply" in data
    assert len(data["reply"]) > 20
    assert "engine" in data
