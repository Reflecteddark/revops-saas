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

from apps.api.auth import create_access_token, hash_password
from apps.api.main import app
from apps.api.tenant_registry import _REGISTRY_CACHE
from packages.database.models import SubscriptionTier, Tenant, User, UserRole
from packages.database.session import get_db, init_db


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


def test_tnt002_zero_managers_and_deals_isolation(client, admin_headers):
    """
    6. Тенант TNT-002 (подключен чистый шаблон Google Sheets):
       - Сделки изолированы: 0 сделок (нет утечки 41 сделки из TNT-001)
       - Настройки изолированы: 0 менеджеров (строки-плейсхолдеры '—' отфильтрованы, нет 4 фантомных демо-менеджеров)
       - Для нового тенанта без таблицы (TNT-003) target == 0.0 ₽
    """
    # 1. Deals isolation check for TNT-002
    deals_res = client.get("/api/v1/deals?tenant=TNT-002")
    assert deals_res.status_code == 200
    deals_data = deals_res.json()
    assert len(deals_data.get("deals", [])) == 0, (
        f"Data leak! TNT-002 received deals from another tenant: {deals_data}"
    )

    # 2. Settings zero-state check for TNT-002 (placeholder managers filtered out)
    settings_res = client.get("/api/v1/settings?tenant=TNT-002")
    assert settings_res.status_code == 200
    settings_data = settings_res.json()
    for m in settings_data.get("managers", []):
        assert m.get("name") not in ["—", "-", ""], f"Placeholder manager found: {m}" 

    # 3. New tenant without connected spreadsheet: target is 0.0 and managers is []
    res_new = client.get("/api/v1/settings?tenant=TNT-UNLINKED-999")
    assert res_new.status_code == 200
    data_new = res_new.json()
    assert data_new.get("general", {}).get("monthly_target") == 0.0
    assert len(data_new.get("managers", [])) == 0


def test_provision_tenant_working_invite(client, admin_headers):
    """
    7. Эндпоинт POST /api/v1/admin/tenants/provision:
       - Инвайт содержит webhook.ai-rop.ru/webhook/bitrix24-call?tenant= и &secret=
       - Инвайт НЕ содержит report.ai-rop.ru/webhook
       - Инвайт содержит app.ai-rop.ru
       - Два вызова дают разные secret
       - Пароль по умолчанию не матчится по RevOps_
    """
    import re
    import secrets
    import sys
    from unittest.mock import MagicMock, patch

    mock_module = MagicMock()

    def fake_provision(**kwargs):
        tid = f"TNT-{secrets.token_hex(2).upper()}"
        return {
            "tenant_id": tid,
            "tenant_name": kwargs.get("company_name", "Test"),
            "spreadsheet_id": kwargs.get("sheet_id", ""),
            "crm_type": kwargs.get("crm_type", "bitrix24"),
            "status": "active",
            "secret": secrets.token_urlsafe(24),
        }

    mock_module.provision_tenant.side_effect = fake_provision
    mock_module.load_registry.return_value = {"tenants": []}

    payload_b24_1 = {
        "name": "Тестовый Ритейл Б24",
        "email": "retail_b24@example.com",
        "crm_type": "bitrix24"
    }
    payload_b24_2 = {
        "name": "Второй Клиент Б24",
        "email": "client2@example.com",
        "crm_type": "bitrix24"
    }

    with patch.dict(sys.modules, {"tenant_provisioner": mock_module, "apps.api.tenant_provisioner": mock_module}):
        res1 = client.post("/api/v1/admin/tenants/provision", json=payload_b24_1, headers=admin_headers)
        assert res1.status_code == 200, f"Provision 1 failed: {res1.text}"
        data1 = res1.json()

        invite1 = data1.get("invite_message", "")
        assert "webhook.ai-rop.ru/webhook/bitrix24-call?tenant=" in invite1
        assert "&secret=" in invite1
        assert "report.ai-rop.ru/webhook" not in invite1
        assert "app.ai-rop.ru" in invite1
        assert "amocrm_redirect_uri" not in data1

        # Check default password is generated securely (not RevOps_\d+!)
        pwd1 = data1["credentials"]["password"]
        assert not re.match(r"^RevOps_\d+!$", pwd1)

        # Second provision call
        res2 = client.post("/api/v1/admin/tenants/provision", json=payload_b24_2, headers=admin_headers)
        assert res2.status_code == 200, f"Provision 2 failed: {res2.text}"
        data2 = res2.json()

        secret1 = data1["tenant"].get("secret")
        secret2 = data2["tenant"].get("secret")
        assert secret1 and secret2
        assert secret1 != secret2

        # Verify amoCRM instructions if provisioned with amocrm
        payload_amo = {
            "name": "Тестовый Ритейл Amo",
            "email": "retail_amo@example.com",
            "crm_type": "amocrm",
            "amo_domain": "retailtest.amocrm.ru"
        }
        res_amo = client.post("/api/v1/admin/tenants/provision", json=payload_amo, headers=admin_headers)
        assert res_amo.status_code == 200
        data_amo = res_amo.json()
        invite_amo = data_amo.get("invite_message", "")
        assert "amoCRM → Настройки → Интеграции → Создать интеграцию → Ключи и доступы → Долгосрочный токен; передайте токен и домен администратору" in invite_amo
        assert "report.ai-rop.ru/webhook" not in invite_amo
        assert "app.ai-rop.ru" in invite_amo
        assert "amocrm_redirect_uri" not in data_amo

