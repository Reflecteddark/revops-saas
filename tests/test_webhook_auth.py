"""
Tests for Defect 1: Webhook authentication for amoCRM and Bitrix24 endpoints.
Verifies:
- External requests (via Cloudflare tunnel / public IP) without secret or signature -> 403
- External requests with wrong secret or wrong signature -> 403
- External requests with valid ?secret= or X-Webhook-Secret -> 200
- External requests with valid HMAC-SHA256 X-Amo-Signature (or X-Bitrix-Token / signature) -> 200
- External requests to a tenant without a configured webhook secret -> 403 (even if signature header is present)
- Internal Docker network requests (172.16.0.5 without proxy headers) -> 200 without secret
- Tenant passport and provisioning brief include ?secret= in amoCRM webhook URL
- Incoming webhook history redacts secrets from headers and URLs
"""

import hashlib
import hmac
import json
import os
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.routers import tenants_router, webhooks_router

TENANT_SECRET = "test-webhook-secret-token-24chars"

MOCK_TENANTS = {
    "TNT-004": {
        "tenant_id": "TNT-004",
        "tenant_name": "Клиент с секретом",
        "crm_type": "amocrm",
        "status": "active",
        "secret": TENANT_SECRET,
        "amo_domain": "client4.amocrm.ru",
        "amo_token": "oauth-jwt-token-not-webhook-secret",
    },
    "TNT-NOSEC": {
        "tenant_id": "TNT-NOSEC",
        "tenant_name": "Клиент без секрета",
        "crm_type": "amocrm",
        "status": "active",
        "amo_token": "oauth-jwt-token-only",
    },
}


@pytest.fixture(autouse=True)
def mock_registry_and_broadcast(monkeypatch):
    def fake_get_config(tid: str):
        return MOCK_TENANTS.get(str(tid).strip().upper())

    monkeypatch.setattr("apps.api.tenant_registry.get_tenant_config", fake_get_config)
    monkeypatch.setattr(tenants_router, "get_tenant_config", fake_get_config)
    monkeypatch.setattr(webhooks_router.manager, "broadcast", AsyncMock())
    monkeypatch.setattr(webhooks_router, "append_call_to_sheets", lambda *a, **k: True)


@pytest.fixture
def ext_client():
    return TestClient(
        app,
        client=("203.0.113.9", 50000),
        headers={"cf-connecting-ip": "203.0.113.9"},
    )


@pytest.fixture
def int_client():
    return TestClient(app, client=("172.16.0.5", 50000))


AMO_DELETE_BODY = {"leads": {"delete": [{"id": "999999999"}]}}
B24_UPDATE_BODY = {
    "event": "ONCRMDEALUPDATE",
    "data": {"FIELDS": {"ID": "555001", "TITLE": "Тест Б24", "OPPORTUNITY": "100000"}},
}


# ==============================================================================
# 1. amoCRM Webhook Auth
# ==============================================================================


def test_amocrm_external_without_secret_rejected_403(ext_client):
    res = ext_client.post("/api/v1/webhooks/TNT-004/amo-crm", json=AMO_DELETE_BODY)
    assert res.status_code == 403, f"Expected 403 without secret, got {res.status_code}: {res.text}"


def test_amocrm_external_with_wrong_secret_rejected_403(ext_client):
    res_q = ext_client.post(
        "/api/v1/webhooks/TNT-004/amo-crm?secret=wrong-secret",
        json=AMO_DELETE_BODY,
    )
    assert res_q.status_code == 403

    res_h = ext_client.post(
        "/api/v1/webhooks/TNT-004/amo-crm",
        json=AMO_DELETE_BODY,
        headers={"X-Webhook-Secret": "wrong-secret"},
    )
    assert res_h.status_code == 403

    res_sig = ext_client.post(
        "/api/v1/webhooks/TNT-004/amo-crm",
        json=AMO_DELETE_BODY,
        headers={"X-Amo-Signature": "deadbeef" * 8},
    )
    assert res_sig.status_code == 403


def test_amocrm_external_with_valid_query_or_header_secret_200(ext_client):
    res_q = ext_client.post(
        f"/api/v1/webhooks/TNT-004/amo-crm?secret={TENANT_SECRET}",
        json=AMO_DELETE_BODY,
    )
    assert res_q.status_code == 200, res_q.text
    assert res_q.json()["status"] == "ok"

    res_h = ext_client.post(
        "/api/v1/webhooks/TNT-004/amo-crm",
        json=AMO_DELETE_BODY,
        headers={"X-Webhook-Secret": TENANT_SECRET},
    )
    assert res_h.status_code == 200, res_h.text

    # Ensure secret was not recorded in LAST_INCOMING_WEBHOOK headers or payload
    last_wh = webhooks_router.LAST_INCOMING_WEBHOOK
    assert TENANT_SECRET not in json.dumps(last_wh, ensure_ascii=False)


def test_amocrm_external_with_valid_signature_200(ext_client):
    raw_bytes = json.dumps(AMO_DELETE_BODY).encode("utf-8")
    sig = hmac.new(TENANT_SECRET.encode("utf-8"), raw_bytes, hashlib.sha256).hexdigest()
    res = ext_client.post(
        "/api/v1/webhooks/TNT-004/amo-crm",
        content=raw_bytes,
        headers={"Content-Type": "application/json", "X-Amo-Signature": sig},
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ok"


def test_amocrm_external_tenant_without_secret_rejected_403(ext_client):
    # No secret on tenant -> 403
    res1 = ext_client.post("/api/v1/webhooks/TNT-NOSEC/amo-crm", json=AMO_DELETE_BODY)
    assert res1.status_code == 403

    # Even if X-Amo-Signature header is supplied, tenant without secret must return 403
    res2 = ext_client.post(
        "/api/v1/webhooks/TNT-NOSEC/amo-crm",
        json=AMO_DELETE_BODY,
        headers={"X-Amo-Signature": "any-signature"},
    )
    assert res2.status_code == 403


def test_amocrm_internal_call_without_secret_200(int_client):
    res = int_client.post("/api/v1/webhooks/TNT-004/amo-crm", json=AMO_DELETE_BODY)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ok"


# ==============================================================================
# 2. Bitrix24 Webhook Auth
# ==============================================================================


def test_bitrix24_external_without_secret_rejected_403(ext_client):
    res = ext_client.post("/api/v1/webhooks/TNT-004/bitrix24", json=B24_UPDATE_BODY)
    assert res.status_code == 403


def test_bitrix24_external_with_wrong_secret_rejected_403(ext_client):
    res_q = ext_client.post(
        "/api/v1/webhooks/TNT-004/bitrix24?secret=wrong-secret",
        json=B24_UPDATE_BODY,
    )
    assert res_q.status_code == 403

    res_tok = ext_client.post(
        "/api/v1/webhooks/TNT-004/bitrix24",
        json=B24_UPDATE_BODY,
        headers={"X-Bitrix-Token": "wrong-secret"},
    )
    assert res_tok.status_code == 403


def test_bitrix24_external_with_valid_secret_200(ext_client):
    res_q = ext_client.post(
        f"/api/v1/webhooks/TNT-004/bitrix24?secret={TENANT_SECRET}",
        json=B24_UPDATE_BODY,
    )
    assert res_q.status_code == 200, res_q.text
    assert res_q.json()["status"] == "ok"

    res_h = ext_client.post(
        "/api/v1/webhooks/TNT-004/bitrix24",
        json=B24_UPDATE_BODY,
        headers={"X-Webhook-Secret": TENANT_SECRET},
    )
    assert res_h.status_code == 200, res_h.text


def test_bitrix24_external_with_valid_signature_or_token_200(ext_client):
    res_tok = ext_client.post(
        "/api/v1/webhooks/TNT-004/bitrix24",
        json=B24_UPDATE_BODY,
        headers={"X-Bitrix-Token": TENANT_SECRET},
    )
    assert res_tok.status_code == 200, res_tok.text

    raw_bytes = json.dumps(B24_UPDATE_BODY).encode("utf-8")
    sig = hmac.new(TENANT_SECRET.encode("utf-8"), raw_bytes, hashlib.sha256).hexdigest()
    res_sig = ext_client.post(
        "/api/v1/webhooks/TNT-004/bitrix24",
        content=raw_bytes,
        headers={"Content-Type": "application/json", "X-Amo-Signature": sig},
    )
    assert res_sig.status_code == 200, res_sig.text


def test_bitrix24_external_tenant_without_secret_rejected_403(ext_client):
    res1 = ext_client.post("/api/v1/webhooks/TNT-NOSEC/bitrix24", json=B24_UPDATE_BODY)
    assert res1.status_code == 403

    res2 = ext_client.post(
        "/api/v1/webhooks/TNT-NOSEC/bitrix24",
        json=B24_UPDATE_BODY,
        headers={"X-Bitrix-Token": "any-token"},
    )
    assert res2.status_code == 403


def test_bitrix24_internal_call_without_secret_200(int_client):
    res = int_client.post("/api/v1/webhooks/TNT-004/bitrix24", json=B24_UPDATE_BODY)
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "ok"


# ==============================================================================
# 3. Passport & Provisioning Brief Webhook URLs include ?secret=
# ==============================================================================


def test_passport_and_brief_contain_secret_in_amocrm_webhook_url():
    import sys
    from unittest.mock import MagicMock

    admin_headers = {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}
    c = TestClient(app)

    passport_res = c.get("/api/v1/tenants/TNT-004/passport", headers=admin_headers)
    assert passport_res.status_code == 200, passport_res.text
    p_data = passport_res.json()
    amo_url = p_data["webhooks"]["amocrm_event_url"]
    assert amo_url.endswith(f"/api/v1/webhooks/TNT-004/amo-crm?secret={TENANT_SECRET}")
    assert any(f"?secret={TENANT_SECRET}" in line for line in p_data["setup_instructions"]["amocrm"])

    # Also verify provisioning brief for amoCRM includes ?secret=
    mock_prov = MagicMock()
    mock_prov.provision_tenant.return_value = {
        "tenant_id": "TNT-004",
        "tenant_name": "Клиент с секретом",
        "spreadsheet_id": "",
        "crm_type": "amocrm",
        "status": "active",
        "secret": TENANT_SECRET,
    }
    mock_prov.load_registry.return_value = {"tenants": [MOCK_TENANTS["TNT-004"]]}
    with patch.dict(sys.modules, {"tenant_provisioner": mock_prov, "apps.api.tenant_provisioner": mock_prov}):
        prov_res = c.post(
            "/api/v1/admin/tenants/provision",
            json={"name": "Клиент с секретом", "email": "amo4@example.com", "crm_type": "amocrm"},
            headers=admin_headers,
        )
        assert prov_res.status_code == 200, prov_res.text
        prov_data = prov_res.json()
        assert f"/api/v1/webhooks/TNT-004/amo-crm?secret={TENANT_SECRET}" in prov_data["brief"]
        assert prov_data["webhook_url"].endswith(f"/api/v1/webhooks/TNT-004/amo-crm?secret={TENANT_SECRET}")
