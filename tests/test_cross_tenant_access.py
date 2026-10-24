import pytest
from starlette.testclient import TestClient
from apps.api.main import app
from apps.api.auth import create_access_token
from packages.database.session import SessionLocal
from packages.database.models import User, UserRole

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_users():
    db = SessionLocal()
    # Ensure TNT-001 user
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

    # Ensure admin user
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


@pytest.fixture
def tnt1_headers():
    token = create_access_token({
        "sub": "usr-tnt-001",
        "tenant_id": "TNT-001",
        "role": UserRole.CEO.value,
        "email": "user@tenant1.test",
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_jwt_headers():
    token = create_access_token({
        "sub": "usr-admin-test",
        "tenant_id": "TNT-001",
        "role": UserRole.ADMIN.value,
        "email": "admin@revops-test.io",
    })
    return {"Authorization": f"Bearer {token}"}


def test_cross_tenant_calls_data_forbidden(tnt1_headers):
    """User with token TNT-001 requesting calls/data for TNT-002 receives 403 Forbidden."""
    res = client.get("/api/v1/calls/data?tenant_id=TNT-002", headers=tnt1_headers)
    assert res.status_code == 403
    assert "cross-tenant" in res.json().get("detail", "").lower()


def test_cross_tenant_insights_summary_forbidden(tnt1_headers):
    """User with token TNT-001 requesting insights/summary for TNT-002 receives 403 Forbidden."""
    res = client.get("/api/v1/insights/summary?tenant_id=TNT-002", headers=tnt1_headers)
    assert res.status_code == 403
    assert "cross-tenant" in res.json().get("detail", "").lower()


def test_cross_tenant_analyst_overview_forbidden(tnt1_headers):
    """User with token TNT-001 requesting analyst/overview for TNT-002 receives 403 Forbidden."""
    res = client.post(
        "/api/v1/insights/analyst/overview",
        json={"tenant_id": "TNT-002"},
        headers=tnt1_headers,
    )
    assert res.status_code == 403
    assert "cross-tenant" in res.json().get("detail", "").lower()


def test_cross_tenant_analyst_chat_forbidden(tnt1_headers):
    """User with token TNT-001 requesting analyst/chat for TNT-002 receives 403 Forbidden."""
    res = client.post(
        "/api/v1/insights/analyst/chat",
        json={"tenant_id": "TNT-002", "message": "Какая выручка?"},
        headers=tnt1_headers,
    )
    assert res.status_code == 403
    assert "cross-tenant" in res.json().get("detail", "").lower()


def test_admin_cross_tenant_access_allowed(admin_jwt_headers):
    """Admin can query another tenant (TNT-002) without 403."""
    res_calls = client.get("/api/v1/calls/data?tenant_id=TNT-002", headers=admin_jwt_headers)
    assert res_calls.status_code == 200

    res_overview = client.post(
        "/api/v1/insights/analyst/overview",
        json={"tenant_id": "TNT-002"},
        headers=admin_jwt_headers,
    )
    assert res_overview.status_code == 200

    res_chat = client.post(
        "/api/v1/insights/analyst/chat",
        json={"tenant_id": "TNT-002", "message": "Статус сделок?"},
        headers=admin_jwt_headers,
    )
    assert res_chat.status_code == 200


def test_demo_tenant_calls_data_unauthenticated_allowed():
    """Demo tenant demo_123 on GET /calls/data without token returns 200."""
    res = client.get("/api/v1/calls/data?tenant_id=demo_123")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"
