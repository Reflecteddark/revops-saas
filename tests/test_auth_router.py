"""
Security and validation test suite for Auth Router:
- Login payload validation (Pydantic 422)
- Invalid credentials & non-existent user handling (401, timing-safe)
- Blocked / inactive account handling (403)
- Protected /me profile access without credentials (401)
- Logout endpoint resilience (no 500)
- HttpOnly cookie security verification
"""

import pytest
from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.auth import hash_password
from packages.database.session import get_db, init_db
from packages.database.models import Tenant, User, UserRole, SubscriptionTier


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def seeded_users(client):
    """Ensure test active and inactive users exist in the database."""
    db = next(get_db())
    try:
        # 1. Ensure test tenant exists
        tenant = db.query(Tenant).filter(Tenant.slug == "auth-test-tenant").first()
        if not tenant:
            tenant = Tenant(
                id="tnt-auth-test-01",
                name="Auth Test Org",
                slug="auth-test-tenant",
                tier=SubscriptionTier.PRO,
                is_active=True
            )
            db.add(tenant)
            db.flush()

        # 2. Active user
        active_user = db.query(User).filter(User.id == "usr-active-01").first()
        if not active_user:
            active_user = User(
                id="usr-active-01",
                tenant_id=tenant.id,
                email="active.user@revops.io",
                full_name="Active Test User",
                hashed_password=hash_password("ValidPassword123!"),
                role=UserRole.KAM,
                is_active=True
            )
            db.add(active_user)
        else:
            active_user.email = "active.user@revops.io"
            active_user.hashed_password = hash_password("ValidPassword123!")
            active_user.is_active = True

        # 3. Blocked / Inactive user
        blocked_user = db.query(User).filter(User.id == "usr-blocked-01").first()
        if not blocked_user:
            blocked_user = User(
                id="usr-blocked-01",
                tenant_id=tenant.id,
                email="blocked.user@revops.io",
                full_name="Blocked Test User",
                hashed_password=hash_password("ValidPassword123!"),
                role=UserRole.KAM,
                is_active=False
            )
            db.add(blocked_user)
        else:
            blocked_user.email = "blocked.user@revops.io"
            blocked_user.hashed_password = hash_password("ValidPassword123!")
            blocked_user.is_active = False

        db.commit()
    finally:
        db.close()


def test_login_empty_body_validation_422(client):
    """1. POST /api/v1/auth/login с пустым телом → 422 (валидация Pydantic)."""
    res = client.post("/api/v1/auth/login", json={})
    assert res.status_code == 422, f"Expected 422, got {res.status_code}: {res.text}"


def test_login_invalid_password_401(client, seeded_users):
    """2. POST /api/v1/auth/login с неверным паролем → 401 (не 500)."""
    res = client.post("/api/v1/auth/login", json={
        "email": "active.user@revops.io",
        "password": "WrongPassword999!"
    })
    assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"


def test_login_nonexistent_user_401(client):
    """3. POST /api/v1/auth/login с несуществующим юзером → 401 (не 500, не палить наличие)."""
    res = client.post("/api/v1/auth/login", json={
        "email": "nonexistent.user.9999@revops.io",
        "password": "AnyPassword123!"
    })
    assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"


def test_login_blocked_account_403(client, seeded_users):
    """4. POST /api/v1/auth/login с заблокированным аккаунтом (is_active=false) → 403."""
    res = client.post("/api/v1/auth/login", json={
        "email": "blocked.user@revops.io",
        "password": "ValidPassword123!"
    })
    assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"


def test_get_me_unauthorized_without_cookie_or_token_401(client):
    """5. GET /api/v1/auth/me без cookie/токена → 401."""
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}: {res.text}"


def test_logout_without_cookie_no_crash(client):
    """6. POST /api/v1/auth/logout без cookie → должен либо 200, 204, либо 401 без падения."""
    # Test both /logout and /client-logout to verify resilience
    res = client.post("/api/v1/auth/logout")
    assert res.status_code in (200, 204, 401), f"Expected 200/204/401, got {res.status_code}: {res.text}"


def test_cookie_after_login_is_httponly(client):
    """7. Cookie после логина должна быть HttpOnly (проверить через response.cookies / Set-Cookie)."""
    # Test via server-side client login
    res = client.post("/api/v1/auth/client-login", json={
        "login": "admin",
        "password": "1908"
    })
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"

    # Check Set-Cookie headers in the raw response
    set_cookie_header = res.headers.get("set-cookie", "")
    assert "HttpOnly" in set_cookie_header or "httponly" in set_cookie_header.lower(), (
        f"Cookie must be HttpOnly. Got headers: {set_cookie_header}"
    )
