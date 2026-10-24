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
    # 5 deals: 3 active (2 stuck, 1 normal), 1 won, 1 lost.
    # Total active pipeline = 500k + 300k + 400k = 1,200,000 ₽.
    # Stuck deals = 500k + 300k = 800,000 ₽.
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
        {
            "id": "DEAL-2",
            "title": "Сделка Бета",
            "budget": 300000.0,
            "stage": "КП",
            "status": "ACTIVE",
            "is_at_risk": True,
            "days_in_stage": 10,
            "crm_source": "amocrm",
            "manager_name": "Ольга",
        },
        {
            "id": "DEAL-3",
            "title": "Сделка Гамма",
            "budget": 400000.0,
            "stage": "Встреча проведена",
            "status": "ACTIVE",
            "is_at_risk": False,
            "days_in_stage": 2,
            "crm_source": "amocrm",
            "manager_name": "Иван",
        },
        {
            "id": "DEAL-4",
            "title": "Сделка Дельта",
            "budget": 1000000.0,
            "stage": "Успешно реализовано",
            "status": "WON",
            "is_at_risk": False,
            "days_in_stage": 0,
            "crm_source": "amocrm",
            "manager_name": "Ольга",
        },
        {
            "id": "DEAL-5",
            "title": "Сделка Эпсилон",
            "budget": 200000.0,
            "stage": "Закрыто и не реализовано",
            "status": "LOST",
            "is_at_risk": False,
            "days_in_stage": 0,
            "crm_source": "amocrm",
            "manager_name": "Иван",
        },
    ]

    # 10 calls:
    # 4 won / next_step=1
    # 3 fake_yes (score is not None, next_step=0, status='risk')
    # 2 unscored (score=None, cr=[None]*13)
    # 1 next_step=None
    calls = []
    # 4 won
    for i in range(4):
        calls.append({
            "id": f"CALL-WON-{i}",
            "score": 11,
            "next_step": 1,
            "status": "won",
            "manager": "Иван",
            "cr": [1] * 13,
            "transcript": "Договорились о встрече.",
        })
    # 3 fake_yes
    for i in range(3):
        calls.append({
            "id": f"CALL-FAKE-{i}",
            "score": 6,
            "next_step": 0,
            "status": "risk",
            "manager": "Ольга",
            "cr": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            "transcript": "Клиент сказал подумает.",
        })
    # 2 unscored (must NOT be counted as fake_yes)
    for i in range(2):
        calls.append({
            "id": f"CALL-UNSCORED-{i}",
            "score": None,
            "next_step": None,
            "status": "unknown",
            "manager": "Иван",
            "cr": None,
            "transcript": "Транскрипт без скоринга.",
        })
    # 1 with next_step=None
    calls.append({
        "id": "CALL-NO-STEP",
        "score": 9,
        "next_step": None,
        "status": "risk",
        "manager": "Ольга",
        "cr": [1] * 9 + [0] * 4,
        "transcript": "Разговор без отметки следующего шага.",
    })

    return calls, deals


def test_leak_consistency_across_all_three_endpoints(auth_headers, mock_dataset):
    """
    Verifies that on the exact same dataset of 10 calls and 5 deals:
    GET /insights/summary
    POST /insights/analyst/overview
    POST /insights/analyst/chat
    all compute and return the exact same total_leak_rub.
    """
    calls, deals = mock_dataset
    mock_cfg = {"avg_deal_check": 100000.0, "tenant_name": "Consistency Corp"}

    with patch("apps.api.routers.insights_router.load_tenant_dataset", return_value=(calls, deals)), \
         patch("apps.api.routers.insights_router.get_tenant_config", return_value=mock_cfg):

        # 1. GET /insights/summary
        res_summary = client.get("/api/v1/insights/summary?tenant_id=TNT-001", headers=auth_headers)
        assert res_summary.status_code == 200
        data_summary = res_summary.json()
        leak_summary = data_summary.get("total_leak_rub")

        # 2. POST /insights/analyst/overview
        res_overview = client.post(
            "/api/v1/insights/analyst/overview",
            json={"tenant_id": "TNT-001"},
            headers=auth_headers,
        )
        assert res_overview.status_code == 200
        data_overview = res_overview.json()
        leak_overview = data_overview.get("total_leak_rub")

        # 3. POST /insights/analyst/chat
        res_chat = client.post(
            "/api/v1/insights/analyst/chat",
            json={"tenant_id": "TNT-001", "message": "Где мы теряем деньги?"},
            headers=auth_headers,
        )
        assert res_chat.status_code == 200
        data_chat = res_chat.json()
        leak_chat = data_chat.get("total_leak_rub")

        # Calculations:
        # stuck deals = 500k + 300k = 800k
        # fake_yes calls = 3 * 100k = 300k
        # uncapped = 1,100,000 ₽
        # active pipeline = 1,200,000 ₽
        # capped = min(1.1M, 1.2M) = 1,100,000.0 ₽
        expected_leak = 1100000.0

        assert leak_summary is not None, "summary total_leak_rub must not be None"
        assert leak_overview is not None, "overview total_leak_rub must not be None"
        assert leak_chat is not None, "chat total_leak_rub must not be None"

        assert leak_summary == expected_leak, f"Expected {expected_leak}, got {leak_summary}"
        assert leak_overview == expected_leak, f"Expected {expected_leak}, got {leak_overview}"
        assert leak_chat == expected_leak, f"Expected {expected_leak}, got {leak_chat}"

        # Triple parity assertion
        assert leak_summary == leak_overview == leak_chat
