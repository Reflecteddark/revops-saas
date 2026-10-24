"""
Security Hardening Tests: Verification of Backdoor Removals (P0-Auth-1, P0-Auth-4).
Guarantees:
1. POST /api/v1/auth/change-password rejects current_password="1908" backdoor with 401.
2. POST /api/v1/auth/client-login rejects login="admin" with REVOPS_ADMIN_KEY with 401.
"""
import os
import pytest
from starlette.testclient import TestClient
from apps.api.main import app
from apps.api.auth import create_access_token, hash_password
from packages.database.session import SessionLocal
from packages.database.models import User, UserRole

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def setup_test_user():
    db = SessionLocal()
    user = db.query(User).filter(User.id == "usr-backdoor-test").first()
    if not user:
        user = User(
            id="usr-backdoor-test",
            email="regular_user@example.com",
            full_name="Regular Test User",
            hashed_password=hash_password("RealSecurePassword123!"),
            tenant_id="TNT-001",
            role=UserRole.KAM,
            is_active=True,
        )
        db.add(user)
        db.commit()
    db.close()


def test_change_password_backdoor_1908_rejected():
    """P0-Auth-1: current_password='1908' MUST return 401, not bypass authentication."""
    token = create_access_token({
        "sub": "usr-backdoor-test",
        "tenant_id": "TNT-001",
        "role": UserRole.KAM.value,
        "email": "regular_user@example.com"
    })
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "current_password": "1908",
        "new_password": "NewValidPassword2026!"
    }
    res = client.post("/api/v1/auth/change-password", json=payload, headers=headers)
    assert res.status_code == 401, f"Expected 401 for '1908' backdoor, got {res.status_code}: {res.text}"
    assert "неверно" in res.json().get("detail", "").lower()


def test_client_login_admin_backdoor_rejected():
    """P0-Auth-4: Login under 'admin' with REVOPS_ADMIN_KEY MUST return 401."""
    admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
    payload = {
        "login": "admin",
        "password": admin_key
    }
    res = client.post("/api/v1/auth/client-login", json=payload)
    assert res.status_code == 401, f"Expected 401 for admin backdoor login, got {res.status_code}: {res.text}"
    assert "неверный" in res.json().get("detail", "").lower()
