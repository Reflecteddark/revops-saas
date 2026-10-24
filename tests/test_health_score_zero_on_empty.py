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


def test_health_score_zero_when_calls_empty(auth_headers):
    """
    P1-5 Acceptance Test:
    When calls are empty (0 calls), health_score must be 0 (not 45 or 50),
    and delta_type on the health_index card must be 'neutral'.
    """
    deals = [
        {
            "id": "DEAL-1",
            "title": "Сделка 1",
            "budget": 500000.0,
            "stage": "Переговоры",
            "status": "ACTIVE",
            "is_at_risk": False,
            "days_in_stage": 1,
            "crm_source": "amocrm",
            "manager_name": "Иван",
        }
    ]
    calls = []

    with patch("apps.api.routers.insights_router.load_tenant_dataset", return_value=(calls, deals)):
        res = client.post(
            "/api/v1/insights/analyst/overview",
            json={"tenant_id": "TNT-001"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"

        # Check metrics_summary
        metrics = data["metrics_summary"]
        assert metrics["total_calls"] == 0
        assert metrics["health_score"] == 0

        # Check health_index card
        health_card = next(c for c in data["kpi_cards"] if c["id"] == "health_index")
        assert health_card["value"] == "0 / 100"
        assert health_card["delta_type"] == "neutral"


def test_health_score_allows_values_below_45(auth_headers):
    """
    P1-5 Acceptance Test:
    Verify that floor 45 is removed. A call with poor score (e.g. 1/13, next_step=0)
    should produce a health_score well below 45 (around 13-14).
    """
    deals = [
        {
            "id": "DEAL-1",
            "title": "Сделка 1",
            "budget": 500000.0,
            "stage": "Переговоры",
            "status": "ACTIVE",
            "is_at_risk": False,
            "days_in_stage": 1,
            "crm_source": "amocrm",
            "manager_name": "Иван",
        }
    ]
    calls = [
        {
            "id": "CALL-POOR-1",
            "score": 1,
            "next_step": 0,
            "status": "risk",
            "manager": "Иван",
            "cr": [1] + [0] * 12,
            "transcript": "Плохой звонок",
        }
    ]

    with patch("apps.api.routers.insights_router.load_tenant_dataset", return_value=(calls, deals)):
        res = client.post(
            "/api/v1/insights/analyst/overview",
            json={"tenant_id": "TNT-001"},
            headers=auth_headers,
        )
        assert res.status_code == 200
        data = res.json()
        metrics = data["metrics_summary"]
        assert metrics["total_calls"] == 1
        # Formula: int(min(98, max(0, (1 / 13.0) * 50 + (0 / 100.0) * 40 + 10))) = int(3.84 + 10) = 13
        assert metrics["health_score"] < 45, f"Expected health_score < 45, got {metrics['health_score']}"
        assert metrics["health_score"] == 13
