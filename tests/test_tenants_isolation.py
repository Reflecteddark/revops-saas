"""
Multi-Tenant Data Isolation and Security Test Suite:
1. Client with JWT of TNT-001 requests GET /api/v1/tenants/TNT-002/passport -> 403 Forbidden
2. Client with JWT of TNT-001 requests GET /api/v1/tenants/TNT-001/passport -> 200 OK
3. Admin (is_admin=true / X-Admin-Key) requests TNT-002 -> 200 OK
4. Request without JWT -> 401 Unauthorized
5. PUT /api/v1/tenants/TNT-002/crm under client TNT-001 -> 403 Forbidden
"""

import os
import time
import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.auth import create_access_token, hash_password
from apps.api.tenant_registry import _REGISTRY_CACHE
from packages.database.session import init_db, get_db
from packages.database.models import Tenant, User, UserRole, SubscriptionTier


@pytest.fixture(scope="module", autouse=True)
def setup_database_and_registry():
    init_db()
    db = next(get_db())
    try:
        # Ensure database records exist for TNT-001 and TNT-002
        t1 = db.query(Tenant).filter(Tenant.id == "TNT-001").first()
        if not t1:
            t1 = Tenant(
                id="TNT-001",
                name="Tenant One Corp",
                slug="tnt-001-corp",
                tier=SubscriptionTier.PRO,
                is_active=True
            )
            db.add(t1)

        t2 = db.query(Tenant).filter(Tenant.id == "TNT-002").first()
        if not t2:
            t2 = Tenant(
                id="TNT-002",
                name="Tenant Two Corp",
                slug="tnt-002-corp",
                tier=SubscriptionTier.PRO,
                is_active=True
            )
            db.add(t2)

        u1 = db.query(User).filter(User.id == "usr-tnt-001").first()
        if not u1:
            u1 = User(
                id="usr-tnt-001",
                tenant_id="TNT-001",
                email="user@tenant1.test",
                full_name="User Tenant One",
                hashed_password=hash_password("Pass123!"),
                role=UserRole.CEO,
                is_active=True
            )
            db.add(u1)

        db.commit()
    finally:
        db.close()

    # Seed in-memory registry cache with TNT-001 and TNT-002
    orig_cache = _REGISTRY_CACHE.get("data")
    _REGISTRY_CACHE["data"] = {
        "tenants": [
            {
                "tenant_id": "TNT-001",
                "tenant_name": "Tenant One Corp",
                "spreadsheet_id": "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk",
                "crm_type": "bitrix24",
                "status": "active"
            },
            {
                "tenant_id": "TNT-002",
                "tenant_name": "Tenant Two Corp",
                "spreadsheet_id": "1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A",
                "crm_type": "amocrm",
                "status": "active"
            }
        ]
    }
    _REGISTRY_CACHE["timestamp"] = time.time() + 999999

    yield

    if orig_cache:
        _REGISTRY_CACHE["data"] = orig_cache
        _REGISTRY_CACHE["timestamp"] = time.time()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def tnt1_token():
    """Generates valid JWT bearer token scoped to TNT-001."""
    return create_access_token({
        "sub": "usr-tnt-001",
        "tenant_id": "TNT-001",
        "role": UserRole.CEO.value,
        "email": "user@tenant1.test"
    })


@pytest.fixture
def admin_headers():
    admin_key = os.getenv("REVOPS_ADMIN_KEY", "revops-admin-secret-2026-aeza")
    return {"x-admin-key": admin_key}


def test_tenant_isolation_cross_tenant_passport_403(client, tnt1_token):
    """1. Клиент с JWT тенанта TNT-001 запрашивает GET /api/v1/tenants/TNT-002/passport → 403 Forbidden."""
    headers = {"Authorization": f"Bearer {tnt1_token}"}
    res = client.get("/api/v1/tenants/TNT-002/passport", headers=headers)
    assert res.status_code == 403, (
        f"Cross-tenant access violation! Expected 403 Forbidden, got {res.status_code}: {res.text}"
    )


def test_tenant_own_passport_access_200(client, tnt1_token):
    """2. Тот же клиент запрашивает свой GET /api/v1/tenants/TNT-001/passport → 200 OK."""
    headers = {"Authorization": f"Bearer {tnt1_token}"}
    res = client.get("/api/v1/tenants/TNT-001/passport", headers=headers)
    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["tenant_id"] == "TNT-001"


def test_admin_access_any_tenant_passport_200(client, admin_headers):
    """3. Админ (is_admin=true / X-Admin-Key) запрашивает TNT-002 → 200 OK."""
    res = client.get("/api/v1/tenants/TNT-002/passport", headers=admin_headers)
    assert res.status_code == 200, f"Expected 200 OK for admin, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["tenant_id"] == "TNT-002"


def test_passport_without_jwt_unauthorized_401(client):
    """4. Запрос без JWT → 401 Unauthorized."""
    res = client.get("/api/v1/tenants/TNT-001/passport")
    assert res.status_code == 401, (
        f"Unauthenticated access allowed! Expected 401 Unauthorized, got {res.status_code}: {res.text}"
    )


def test_cross_tenant_update_crm_forbidden_403(client, tnt1_token):
    """5. PUT /api/v1/tenants/TNT-002/crm под клиентом TNT-001 → 403 (нельзя менять чужого клиента)."""
    headers = {"Authorization": f"Bearer {tnt1_token}"}
    payload = {
        "crm_type": "amocrm",
        "amo_domain": "attacker.amocrm.ru",
        "amo_token": "malicious_token"
    }
    res = client.put("/api/v1/tenants/TNT-002/crm", json=payload, headers=headers)
    assert res.status_code == 403, (
        f"Cross-tenant modification allowed! Expected 403 Forbidden, got {res.status_code}: {res.text}"
    )
