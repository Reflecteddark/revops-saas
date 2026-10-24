"""
Security Hardening Tests: JWT Key Integrity & Token Revocation (P0-Auth-2).
Guarantees:
1. Forged JWT signed with old fallback key is rejected with 401.
2. Logged out JWT is stored in RevokedToken and rejected with 401 on subsequent requests.
"""
from datetime import datetime, timedelta, timezone
import jwt
import pytest
from starlette.testclient import TestClient
from apps.api.main import app
from apps.api.auth import ALGORITHM, create_access_token, hash_password
from packages.database.session import SessionLocal
from packages.database.models import User, UserRole

client = TestClient(app)

OLD_FALLBACK_SECRET = "revops-enterprise-os-v17-6-saas-secret-key-change-in-prod"


@pytest.fixture(scope="module", autouse=True)
def setup_jwt_user():
    db = SessionLocal()
    user = db.query(User).filter(User.id == "usr-jwt-test").first()
    if not user:
        user = User(
            id="usr-jwt-test",
            email="jwt_user@test.local",
            full_name="JWT Test User",
            hashed_password=hash_password("Password123456!"),
            tenant_id="TNT-001",
            role=UserRole.CEO,
            is_active=True,
        )
        db.add(user)
        db.commit()
    db.close()


def test_jwt_forgery_with_old_fallback_key_rejected():
    """P0-Auth-2: A token forged with the legacy hardcoded fallback key MUST be rejected with 401."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=60)
    forged_payload = {
        "sub": "usr-jwt-test",
        "tenant_id": "TNT-001",
        "role": UserRole.CEO.value,
        "email": "jwt_user@test.local",
        "exp": expire,
        "jti": "forged-uuid-12345"
    }
    forged_token = jwt.encode(forged_payload, OLD_FALLBACK_SECRET, algorithm=ALGORITHM)

    headers = {"Authorization": f"Bearer {forged_token}"}
    res = client.get("/api/v1/auth/me", headers=headers)
    assert res.status_code == 401, f"Expected 401 for forged JWT, got {res.status_code}"


def test_jwt_revocation_on_logout():
    """P0-Auth-2: Token revocation via RevokedToken table prevents reuse after logout."""
    # 1. Create a legitimate token
    valid_token = create_access_token({
        "sub": "usr-jwt-test",
        "tenant_id": "TNT-001",
        "role": UserRole.CEO.value,
        "email": "jwt_user@test.local"
    })
    headers = {"Authorization": f"Bearer {valid_token}"}

    # 2. Verify token works before logout
    res_before = client.get("/api/v1/auth/me", headers=headers)
    assert res_before.status_code == 200, f"Token should be valid, got {res_before.status_code}"

    # 3. Call logout endpoint
    res_logout = client.post("/api/v1/auth/logout", headers=headers)
    assert res_logout.status_code == 200

    # 4. Attempt to reuse token on protected endpoint -> MUST fail with 401
    res_after = client.get("/api/v1/auth/me", headers=headers)
    assert res_after.status_code == 401, f"Expected 401 for revoked token, got {res_after.status_code}"
    assert "отозван" in res_after.json().get("detail", "").lower()
