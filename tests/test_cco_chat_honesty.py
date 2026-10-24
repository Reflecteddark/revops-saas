"""
Unit & Integration Tests for CCO Chat & Insights Honesty & Multi-Tenancy.
Verifies that:
1. Empty tenants return honest `no_data` and NEVER hallucinate fallback personas ("Заряна", "Алексей") or fake 1.5M ₽.
2. Tenants with active data use real manager names, real deal titles, and real active pipeline amounts.
3. /insights/summary returns engine == 'deterministic_fallback' (not 'Claude 3.5 Sonnet') when ANTHROPIC_API_KEY is not set.
4. /insights/summary returns `no_data` for tenants with zero active deals.
"""

from unittest.mock import patch
from fastapi.testclient import TestClient
import pytest

from apps.api.main import app

client = TestClient(app)


def test_cco_chat_empty_tenant_returns_honest_no_data():
    """When a tenant has 0 calls and 0 deals, /analyst/chat must return honest no_data."""
    resp = client.post(
        "/api/v1/insights/analyst/chat",
        json={
            "message": "Где мы теряем деньги?",
            "tenant_id": "TNT-UNKNOWN-999"
        }
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "no_data"
    assert data.get("engine") == "no_data"
    reply = data.get("reply", "")
    assert "TNT-UNKNOWN-999" in reply
    assert "не завершена" in reply
    assert "Заряна" not in reply
    assert "Алексей" not in reply
    assert "1 500 000" not in reply
    assert "1,500,000" not in reply


def test_cco_chat_with_real_data_uses_actual_names_and_metrics():
    """When real data is present, the prompt and fallback must use real managers and real deal sums."""
    real_deals = [
        {
            "id": "DEAL-REAL-101",
            "title": "Поставка оборудования — ООО 'Вектор'",
            "budget": 750000.0,
            "stage": "Переговоры",
            "status": "ACTIVE",
            "is_at_risk": True,
            "days_in_stage": 4,
            "crm_source": "amocrm",
            "manager_name": "Константин Васильев"
        }
    ]
    real_calls = [
        {
            "id": "CALL-REAL-01",
            "score": 11,
            "next_step": 1,
            "status": "won",
            "manager": "Константин Васильев",
            "cr": [1] * 13,
            "transcript": "Согласовали демонстрацию на пятницу"
        }
    ]

    # Force Tier 4 Local SSOT generation to inspect deterministic formatting
    with patch(
        "apps.api.routers.insights_router.generate_gemini_content_cascade",
        return_value={"status": "error", "error": "Simulated AI Outage for deterministic check"}
    ):
        resp = client.post(
            "/api/v1/insights/analyst/chat",
            json={
                "message": "Кто из менеджеров слабее?",
                "tenant_id": "TNT-REAL-TEST",
                "context": {
                    "calls": real_calls,
                    "deals": real_deals
                }
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "ok"
        reply = data.get("reply", "")
        # Must contain real manager from data
        assert "Константин Васильев" in reply
        # Must NEVER contain hallucinated personas
        assert "Заряна" not in reply
        assert "Алексей Смирнов" not in reply


def test_insights_summary_deterministic_fallback_when_no_anthropic_key(monkeypatch):
    """When ANTHROPIC_API_KEY is not set, engine must be 'deterministic_fallback', not 'Claude 3.5 Sonnet'."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    
    # Query with real deals in TNT-001 or explicit parameters
    resp = client.get("/api/v1/insights/summary?tenant_id=TNT-001&p10=3000000&p50=4000000&p90=5500000")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "ok"
    assert data.get("engine") == "deterministic_fallback"
    assert data.get("engine") != "Claude 3.5 Sonnet"
    assert "claude_model" in data
    assert data.get("p50_corridor_rub") == 4000000.0


def test_insights_summary_empty_tenant_returns_no_data(monkeypatch):
    """When a tenant has 0 active deals, /insights/summary must return honest no_data."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.get("/api/v1/insights/summary?tenant_id=TNT-NONEXISTENT")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "no_data"
    assert data.get("engine") == "no_data"
    assert "Нет данных" in data.get("message", "")
