"""
Unit & Integration Test Suite for Public Router (Self-Serve Demo Onboarding):
- Validation errors (invalid email, phone, missing fields) -> 422
- Successful demo access provisioning -> 200 + DB records (Tenant, User, 30 Deals, 200 Calls)
- Duplicate email prevention -> 400
- IP Rate limiting (max 3 req/hr) -> 429
"""

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.routers.public_router import reset_rate_limits
from packages.database.models import CallRecording, Deal, Tenant, User
from packages.database.session import get_db, init_db


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()


@pytest.fixture(autouse=True)
def clean_rate_limits():
    reset_rate_limits()


@pytest.fixture
def client():
    return TestClient(app)


def test_invalid_payload_validation_returns_422(client):
    """Verifies that invalid email, phone, or missing required fields return 422 Unprocessable Entity."""
    # 1. Invalid email format
    res1 = client.post("/api/v1/public/request-demo", json={
        "name": "Тест Пользователь",
        "email": "invalid-email-address",
        "phone": "+7 (999) 111-22-33",
        "company": "ООО Тест"
    })
    assert res1.status_code == 422

    # 2. Too short phone number
    res2 = client.post("/api/v1/public/request-demo", json={
        "name": "Тест Пользователь",
        "email": "valid@company.ru",
        "phone": "123",
        "company": "ООО Тест"
    })
    assert res2.status_code == 422

    # 3. Missing name
    res3 = client.post("/api/v1/public/request-demo", json={
        "email": "valid@company.ru",
        "phone": "+7 (999) 111-22-33",
        "company": "ООО Тест"
    })
    assert res3.status_code == 422


def test_successful_demo_request_provisions_tenant_and_dataset(client):
    """Verifies end-to-end self-serve provisioning: 200 OK + full dataset seeded in DB."""
    test_email = "selfserve.newlead@revops-test.ru"
    
    # Ensure clean test state if user existed before
    db = next(get_db())
    try:
        old_user = db.query(User).filter(User.email == test_email).first()
        if old_user:
            t_id = old_user.tenant_id
            db.query(CallRecording).filter(CallRecording.tenant_id == t_id).delete()
            db.query(Deal).filter(Deal.tenant_id == t_id).delete()
            db.query(User).filter(User.tenant_id == t_id).delete()
            db.query(Tenant).filter(Tenant.id == t_id).delete()
            db.commit()
    finally:
        db.close()

    payload = {
        "name": "Александр Смирнов",
        "email": test_email,
        "phone": "+7 (916) 555-44-33",
        "company": "ООО ПромТехнологии",
        "tariff": "Pro (29 900 ₽)"
    }

    res = client.post("/api/v1/public/request-demo", json=payload, headers={"CF-Connecting-IP": "203.0.113.10"})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"

    data = res.json()
    assert data.get("success") is True
    assert data.get("login") == test_email
    assert data.get("password", "").startswith("RevOps_")
    assert "cabinet_url" in data
    tenant_id = data.get("tenant_id")
    assert tenant_id is not None

    # Verify DB Isolation & Seeding
    db = next(get_db())
    try:
        # Check Tenant
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        assert tenant is not None
        assert tenant.name == "ООО ПромТехнологии"

        # Check Owner User
        user = db.query(User).filter(User.email == test_email).first()
        assert user is not None
        assert user.tenant_id == tenant_id
        assert user.full_name == "Александр Смирнов"

        # Check 5 Managers
        managers = db.query(User).filter(User.tenant_id == tenant_id).all()
        # 1 owner + 5 reps = 6 users
        assert len(managers) >= 5

        # Check 30 Deals (~10M ₽)
        deals = db.query(Deal).filter(Deal.tenant_id == tenant_id).all()
        assert len(deals) == 30
        total_budget = sum(d.budget for d in deals)
        assert total_budget > 9_000_000

        # Check 200 Calls (including 20 yesterday leaks)
        calls = db.query(CallRecording).filter(CallRecording.tenant_id == tenant_id).all()
        assert len(calls) == 200

        yesterday_leaks = [c for c in calls if "yst" in c.id]
        assert len(yesterday_leaks) == 20
        for leak in yesterday_leaks:
            sc = leak.scorecard_criteria
            assert sc.get("status") == "risk"
            assert sc.get("next_step") == 0

    finally:
        db.close()


def test_duplicate_email_returns_400(client):
    """Verifies that requesting demo access with an existing email returns 400 Bad Request."""
    import uuid
    test_email = f"duplicate_{uuid.uuid4().hex[:8]}@revops-test.ru"

    payload = {
        "name": "Елена Романова",
        "email": test_email,
        "phone": "+7 (925) 777-88-99",
        "company": "АО Монолит",
        "tariff": "Пилот (14 900 ₽)"
    }

    # 1. First registration should succeed
    res1 = client.post("/api/v1/public/request-demo", json=payload, headers={"CF-Connecting-IP": "203.0.113.20"})
    assert res1.status_code == 200

    # 2. Second registration with the same email should be rejected with 400
    res2 = client.post("/api/v1/public/request-demo", json=payload, headers={"CF-Connecting-IP": "203.0.113.21"})
    assert res2.status_code == 400
    assert "уже зарегистрированы" in res2.json().get("detail", "").lower()


def test_ip_rate_limiting_enforces_max_3_per_hour(client):
    """Verifies that exceeding 3 requests per hour from the same IP returns 429 Too Many Requests."""
    import random
    import uuid
    test_ip = f"198.51.100.{random.randint(50, 240)}"

    for i in range(3):
        res = client.post("/api/v1/public/request-demo", json={
            "name": f"Лид {i + 1}",
            "email": f"rate_limit_{uuid.uuid4().hex[:8]}@revops.test",
            "phone": "+7 (903) 111-22-33",
            "company": f"Компания {i + 1}"
        }, headers={"CF-Connecting-IP": test_ip})
        assert res.status_code == 200, f"Request {i+1} should succeed, got {res.status_code}: {res.text}"

    # 4th request from the same IP must be blocked with 429
    res_blocked = client.post("/api/v1/public/request-demo", json={
        "name": "Лид 4 Заблокирован",
        "email": f"rate_limit_{uuid.uuid4().hex[:8]}@revops.test",
        "phone": "+7 (903) 111-22-33",
        "company": "Компания 4"
    }, headers={"CF-Connecting-IP": test_ip})

    assert res_blocked.status_code == 429
    assert "лимит" in res_blocked.json().get("detail", "").lower()
