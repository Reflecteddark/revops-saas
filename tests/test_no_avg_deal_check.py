import pytest
from unittest.mock import patch
from starlette.testclient import TestClient
from apps.api.main import app
from apps.api.auth import create_access_token
from packages.database.session import SessionLocal
from packages.database.models import User, UserRole

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_users():
    db = SessionLocal()
    u1 = db.query(User).filter(User.id == "usr-tnt-001").first()
    if not u1:
        u1 = User(
            id="usr-tnt-001",
            email="user@tenant1.test",
            full_name="Tenant User 1",
            hashed_password="mock_hashed_password",
            tenant_id="TNT-001",
            role=UserRole.CEO,
            is_active=True,
        )
        db.add(u1)
        db.commit()
    db.close()


@pytest.fixture
def auth_headers():
    token = create_access_token({
        "sub": "usr-tnt-001",
        "tenant_id": "TNT-001",
        "role": UserRole.CEO.value,
        "email": "user@tenant1.test",
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_dataset():
    deals = [
        {
            "id": "DEAL-1",
            "title": "Сделка Альфа",
            "budget": 500000.0,
            "stage": "Переговоры",
            "status": "ACTIVE",
            "is_at_risk": True,
            "days_in_stage": 15,
            "crm_source": "amocrm",
            "manager_name": "Иван",
        },
    ]

    calls = [
        {
            "id": "CALL-FAKE-1",
            "score": 6,
            "next_step": 0,
            "status": "risk",
            "manager": "Ольга",
            "cr": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            "transcript": "Клиент сказал подумает.",
        },
    ]

    return calls, deals


def test_no_avg_deal_check_metrics_and_chat_reply(auth_headers, mock_dataset):
    calls, deals = mock_dataset
    # Tenant config with NO avg_deal_check
    mock_cfg = {"avg_deal_check": None, "tenant_name": "No Avg Check Corp"}

    with patch("apps.api.routers.insights_router.load_tenant_dataset", return_value=(calls, deals)), \
         patch("apps.api.routers.insights_router.get_tenant_config", return_value=mock_cfg), \
         patch("apps.api.routers.insights_router.generate_gemini_content_cascade", return_value={"status": "error"}) as mock_llm:

        # 1. Test /insights/summary
        res_summary = client.get("/api/v1/insights/summary?tenant_id=TNT-001", headers=auth_headers)
        assert res_summary.status_code == 200
        data_summary = res_summary.json()
        fake_yes_summary = data_summary["leak_breakdown"]["fake_yes"]
        assert fake_yes_summary["sum"] is None
        assert fake_yes_summary["assumed_default"] is True
        assert fake_yes_summary["avg_check"] is None
        # total_leak_rub should equal only the stuck deal amount (500000.0)
        assert data_summary["total_leak_rub"] == 500000.0

        # 2. Test /insights/analyst/overview
        res_overview = client.post(
            "/api/v1/insights/analyst/overview",
            json={"tenant_id": "TNT-001"},
            headers=auth_headers,
        )
        assert res_overview.status_code == 200
        data_overview = res_overview.json()
        fake_yes_overview = data_overview["leak_breakdown"]["fake_yes"]
        assert fake_yes_overview["sum"] is None
        assert fake_yes_overview["assumed_default"] is True
        assert fake_yes_overview["avg_check"] is None
        assert data_overview["total_leak_rub"] == 500000.0

        # 3. Test /insights/analyst/chat
        res_chat = client.post(
            "/api/v1/insights/analyst/chat",
            json={"tenant_id": "TNT-001", "message": "Где мы теряем деньги?"},
            headers=auth_headers,
        )
        assert res_chat.status_code == 200
        data_chat = res_chat.json()
        fake_yes_chat = data_chat["leak_breakdown"]["fake_yes"]
        assert fake_yes_chat["sum"] is None
        assert fake_yes_chat["assumed_default"] is True
        assert fake_yes_chat["avg_check"] is None
        assert data_chat["total_leak_rub"] == 500000.0

        # Verify LLM was called with guidance in system_prompt
        assert mock_llm.called
        call_kwargs = mock_llm.call_args[1]
        assert "Рекомендуй руководителю указать средний чек в Настройках" in call_kwargs["system_prompt"]

        # Chat fallback reply must instruct to set average check in Settings
        reply_text = data_chat["reply"]
        assert "Средний чек не задан в настройках компании. Оценка потерь от Fake Yes не проводилась. Рекомендуем указать средний чек в Настройках." in reply_text

