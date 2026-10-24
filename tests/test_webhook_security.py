"""
Security Hardening Tests: Webhook Tenant Lifecycle & Signature Enforcement (P0-Webhook-1).
Guarantees:
1. POST /webhooks/TNT-999/amocrm returns 404 for non-existent tenant.
2. POST /webhooks/amocrm without valid signature returns 403.
3. GET /webhooks/history without admin key / from external IP returns 403.
"""
import hashlib
import hmac
import json
import os
import pytest
from starlette.testclient import TestClient
from apps.api.main import app

# External client simulating public internet traffic
client_ext = TestClient(app, client=("194.87.12.34", 50000))


def test_webhook_nonexistent_tenant_returns_404():
    """P0-Webhook-1: Webhooks destined to unregistered tenants MUST return 404 Not Found."""
    res = client_ext.post("/api/v1/webhooks/TNT-999/amocrm", json={"event": "status_update"})
    assert res.status_code == 404, f"Expected 404 for TNT-999, got {res.status_code}: {res.text}"


def test_webhook_amocrm_without_signature_returns_403():
    """P0-Webhook-1: Public inbound amoCRM webhook without X-Amo-Signature MUST return 403."""
    res = client_ext.post("/api/v1/webhooks/amocrm", json={"event": "status_update", "leads": []})
    assert res.status_code == 403, f"Expected 403 for missing signature, got {res.status_code}: {res.text}"


def test_webhook_history_without_admin_key_returns_403():
    """P0-Webhook-1: Webhook history DLQ inspector is restricted to internal/admin callers."""
    # 1. External without admin key -> 403
    res_unauth = client_ext.get("/api/v1/webhooks/history")
    assert res_unauth.status_code == 403, f"Expected 403 without admin key, got {res_unauth.status_code}"

    # 2. External with valid admin key -> 200
    admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
    res_auth = client_ext.get("/api/v1/webhooks/history", headers={"X-Admin-Key": admin_key})
    assert res_auth.status_code == 200, f"Expected 200 with admin key, got {res_auth.status_code}"


def test_webhook_amocrm_unknown_status_zero_risk():
    """Verify that unparsed amoCRM calls get risk_amount='0 ₽' and cr=[None]*13."""
    from unittest.mock import AsyncMock, patch
    client_int = TestClient(app, client=("172.16.0.5", 50000))
    with patch("apps.api.routers.webhooks_router.manager.broadcast", new_callable=AsyncMock) as mock_broadcast, \
         patch("apps.api.routers.webhooks_router.append_call_to_sheets", return_value=True):
        res = client_int.post(
            "/api/v1/webhooks/TNT-001/amocrm",
            json={"call_id": "test_amo_unknown_1", "transcript": "Нераспознанный шум", "manager": "Тест"}
        )
        assert res.status_code == 200
        mock_broadcast.assert_called_once()
        broadcast_call = mock_broadcast.call_args[0][1]["call"]
        assert broadcast_call["status"] == "unknown"
        assert broadcast_call["risk_amount"] == "0 ₽"
        assert broadcast_call["cr"] == [None] * 13


def test_webhook_bitrix24_unknown_status_zero_risk():
    """Verify that unparsed Bitrix24 calls get risk_amount='0 ₽' and cr=[None]*13."""
    from unittest.mock import AsyncMock, patch
    client_int = TestClient(app, client=("172.16.0.5", 50000))
    with patch("apps.api.routers.webhooks_router.manager.broadcast", new_callable=AsyncMock) as mock_broadcast, \
         patch("apps.api.routers.webhooks_router.append_call_to_sheets", return_value=True):
        res = client_int.post(
            "/api/v1/webhooks/TNT-001/bitrix24",
            json={
                "event": "ONCRMDEALACTIVITYADD",
                "data": {
                    "FIELDS": {
                        "PROVIDER_TYPE_ID": "CALL",
                        "ID": "99999",
                        "DESCRIPTION": "Случайный разговор без критериев"
                    }
                }
            }
        )
        assert res.status_code == 200
        mock_broadcast.assert_called_once()
        broadcast_call = mock_broadcast.call_args[0][1]["call"]
        assert broadcast_call["status"] == "unknown"
        assert broadcast_call["risk_amount"] == "0 ₽"
        assert broadcast_call["cr"] == [None] * 13
