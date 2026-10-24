"""
Unit & Integration Tests for CCO Chat & Insights Honesty & Multi-Tenancy.
Verifies that:
1. Empty/unregistered tenants return honest `no_data` and NEVER hallucinate fallback personas or fake data.
2. Tenants with active data use real manager names, real deal titles, and real active pipeline amounts.
3. /insights/summary returns engine == 'deterministic_fallback' (not 'Claude 3.5 Sonnet') and no claude_model when ANTHROPIC_API_KEY is not set.
4. /insights/summary returns `no_data` for tenants with zero active deals.
5. leak_rub never exceeds active pipeline (capped by pipeline).
6. leak_rub uses tenant avg deal check from tenant config (defaulting to 150,000 ₽).
7. reply contains "Расчёт:" and returns leak_breakdown object.
8. amoCRM tenant isolation: TNT-TEST-AMO returns no_data without leaking TNT-001 data.
"""

from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from packages.database.models import User, UserRole
from packages.database.session import SessionLocal

client = TestClient(app)


@pytest.fixture(autouse=True)
def admin_auth():
    db = SessionLocal()
    admin = db.query(User).filter(User.id == "usr-admin-test").first()
    if not admin:
        admin = User(
            id="usr-admin-test",
            email="admin@revops-test.io",
            full_name="Admin Test",
            hashed_password="mock_hashed_password",
            tenant_id="TNT-001",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
    db.close()

    token = create_access_token({
        "sub": "usr-admin-test",
        "tenant_id": "TNT-001",
        "role": UserRole.ADMIN.value,
        "email": "admin@revops-test.io",
    })
    client.headers.update({"Authorization": f"Bearer {token}"})
    yield
    client.headers.pop("Authorization", None)


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


def test_amo_tenant_isolated():
    """TNT-TEST-AMO has no data, must return honest no_data and NOT leak TNT-001 deals or calls."""
    resp = client.post(
        "/api/v1/insights/analyst/chat",
        json={
            "message": "Сколько у нас зависших сделок?",
            "tenant_id": "TNT-TEST-AMO"
        }
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "no_data"
    assert data.get("engine") == "no_data"
    assert "TNT-TEST-AMO" in data.get("reply", "")
    assert "4 460 000" not in data.get("reply", "")
    assert "TNT-001" not in data.get("reply", "")


def test_leak_rub_does_not_exceed_pipeline():
    """Verify that leak_rub is strictly capped at active pipeline sum."""
    deals = [
        {
            "id": "DEAL-CAP-1",
            "title": "Small Deal",
            "budget": 100000.0,
            "stage": "Переговоры",
            "status": "ACTIVE",
            "is_at_risk": True,
            "days_in_stage": 10,
            "crm_source": "amocrm",
            "manager_name": "Тестовый Менеджер"
        }
    ]
    # 5 fake yes calls * 150,000 = 750,000 ₽ + stuck 100,000 = 850,000 ₽
    # Active pipeline is only 100,000 ₽. leak_rub must be capped at 100,000 ₽.
    calls = [
        {
            "id": f"CALL-CAP-{i}",
            "score": 5,
            "next_step": 0,
            "status": "lost",
            "manager": "Тестовый Менеджер",
            "cr": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            "transcript": "Клиент сказал перезвонить через месяц, дату не согласовали"
        }
        for i in range(5)
    ]

    with patch("apps.api.routers.insights_router.load_tenant_dataset", return_value=(calls, deals)):
        resp = client.post(
            "/api/v1/insights/analyst/chat",
            json={
                "message": "Посчитай утечки",
                "tenant_id": "TNT-TEST-CAP",
            }
        )
    assert resp.status_code == 200
    data = resp.json()
    breakdown = data.get("leak_breakdown", {})
    assert breakdown.get("total_leak_rub") == 100000.0
    assert breakdown.get("capped_by_pipeline") is True


def test_leak_rub_uses_tenant_avg_check():
    """Verify that leak calculation uses tenant_avg_check from tenant config (or default 150k)."""
    deals = [
        {
            "id": "DEAL-AVG-1",
            "title": "Normal Deal",
            "budget": 2000000.0,
            "stage": "Переговоры",
            "status": "ACTIVE",
            "is_at_risk": False,
            "days_in_stage": 1,
            "crm_source": "bitrix24",
            "manager_name": "Менеджер 1"
        }
    ]
    # 2 fake_yes calls, stuck_deals = 0
    # tenant avg_check = 150,000 ₽. Total leak = 2 * 150,000 = 300,000 ₽.
    calls = [
        {
            "id": f"CALL-AVG-{i}",
            "score": 6,
            "next_step": 0,
            "status": "lost",
            "manager": "Менеджер 1",
            "cr": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            "transcript": "Пока"
        }
        for i in range(2)
    ]

    with patch("apps.api.routers.insights_router.load_tenant_dataset", return_value=(calls, deals)):
        resp = client.post(
            "/api/v1/insights/analyst/chat",
            json={
                "message": "Какой размер утечек?",
                "tenant_id": "TNT-001",
            }
        )
    assert resp.status_code == 200
    data = resp.json()
    breakdown = data.get("leak_breakdown", {})
    assert breakdown.get("fake_yes", {}).get("count") == 2
    assert breakdown.get("fake_yes", {}).get("avg_check") == 150000
    assert breakdown.get("fake_yes", {}).get("sum") == 300000
    assert breakdown.get("total_leak_rub") == 300000.0
    assert breakdown.get("capped_by_pipeline") is False


def test_leak_breakdown_present_in_reply():
    """Verify that reply contains 'Расчёт:' formula and leak_breakdown object is returned."""
    deals = [
        {
            "id": "DEAL-1",
            "title": "Сделка 1",
            "budget": 500000.0,
            "stage": "КП",
            "status": "ACTIVE",
            "is_at_risk": True,
            "days_in_stage": 12,
            "crm_source": "amocrm",
            "manager_name": "Анна"
        },
        {
            "id": "DEAL-2",
            "title": "Сделка 2",
            "budget": 500000.0,
            "stage": "Переговоры",
            "status": "ACTIVE",
            "is_at_risk": False,
            "days_in_stage": 2,
            "crm_source": "amocrm",
            "manager_name": "Анна"
        }
    ]
    calls = [
        {
            "id": "CALL-1",
            "score": 5,
            "next_step": 0,
            "status": "lost",
            "manager": "Анна",
            "cr": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            "transcript": "Подумаю"
        }
    ]

    with patch("apps.api.routers.insights_router.load_tenant_dataset", return_value=(calls, deals)):
        resp = client.post(
            "/api/v1/insights/analyst/chat",
            json={
                "message": "Где утечки?",
                "tenant_id": "TNT-TEST-BREAKDOWN",
            }
        )
    assert resp.status_code == 200
    data = resp.json()
    reply = data.get("reply", "")
    assert "Расчёт:" in reply
    assert "1 fake_yes × 150 000 ₽ + 1 зависших сделок × 500 000 ₽ = 650 000 ₽" in reply
    assert "leak_breakdown" in data
    assert data["leak_breakdown"]["total_leak_rub"] == 650000.0


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
        "apps.api.routers.insights_router.load_tenant_dataset",
        return_value=(real_calls, real_deals)
    ), patch(
        "apps.api.routers.insights_router.generate_gemini_content_cascade",
        return_value={"status": "error", "error": "Simulated AI Outage for deterministic check"}
    ):
        resp = client.post(
            "/api/v1/insights/analyst/chat",
            json={
                "message": "Кто из менеджеров слабее?",
                "tenant_id": "TNT-REAL-TEST",
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


def test_summary_no_claude_model_without_key(monkeypatch):
    """When ANTHROPIC_API_KEY is not set, claude_model must NOT be in response and engine == deterministic_fallback."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.get("/api/v1/insights/summary?tenant_id=TNT-001&p10=3000000&p50=4000000&p90=5500000")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "ok"
    assert data.get("engine") == "deterministic_fallback"
    assert "claude_model" not in data
    assert data.get("calculation_method") == "linear_scenario (not Monte-Carlo)"


def test_insights_summary_empty_tenant_returns_no_data(monkeypatch):
    """When a tenant has 0 active deals, /insights/summary must return honest no_data."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    resp = client.get("/api/v1/insights/summary?tenant_id=TNT-NONEXISTENT")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "no_data"
    assert data.get("engine") == "no_data"
    assert "Нет данных" in data.get("message", "")
