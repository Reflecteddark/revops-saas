"""
Tests for Admin Router & Fleet Control Center.
Verifies all new admin endpoints, fleet checks, task scheduler status, and live console logs.
"""

from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.auth import create_access_token

client = TestClient(app)


def test_admin_status_endpoint():
    resp = client.get("/api/v1/admin/status")
    assert resp.status_code == 200
    data = resp.json()

    assert "fleet_status" in data
    assert "fleet_label" in data
    assert "fastapi" in data
    assert data["fastapi"]["port"] == 8000
    assert "n8n" in data
    assert "cloudflare_tunnel" in data
    assert "google_sheets" in data
    assert "tasks" in data
    assert "gemini_ai" in data


def test_admin_page_route():
    resp = client.get("/admin")
    assert resp.status_code == 200
    assert "view-admin" in resp.text
    assert "Админ-кабинет" in resp.text
    assert '__INITIAL_TAB__="admin"' in resp.text


def test_admin_logs_endpoint():
    resp = client.get("/api/v1/admin/logs?log_type=console")
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "console"
    assert "logs" in data
    assert len(data["logs"]) >= 1


def test_admin_console_clear():
    resp = client.post("/api/v1/admin/logs/clear")
    assert resp.status_code == 200
    assert resp.json()["success"] is True

    # Re-check logs
    logs_resp = client.get("/api/v1/admin/logs?log_type=console")
    assert logs_resp.status_code == 200
    logs = logs_resp.json()["logs"]
    assert len(logs) == 1
    assert "Консоль очищена" in logs[0]["msg"]


def test_unauthorized_remote_admin_access_rejected():
    """Verifies that public requests coming from tunnel or public host without key are blocked with 403."""
    resp = client.get(
        "/api/v1/admin/status",
        headers={"host": "report.ai-rop.ru", "cf-connecting-ip": "194.87.12.34"}
    )
    assert resp.status_code == 403
    assert "Доступ запрещён" in resp.json()["detail"]


def test_authorized_remote_admin_access_with_key():
    """Verifies that remote requests with correct X-RevOps-Admin-Key succeed."""
    import os
    admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
    resp = client.get(
        "/api/v1/admin/status",
        headers={
            "host": "report.ai-rop.ru",
            "cf-connecting-ip": "194.87.12.34",
            "x-revops-admin-key": admin_key
        }
    )
    assert resp.status_code == 200
    assert "fleet_status" in resp.json()


def test_authorized_remote_admin_access_with_session():
    """Verifies that remote requests with deprecated raw_session backdoor are blocked with 403 (P0-Auth-5)."""
    import hashlib
    import json
    import time

    now_ms = int(time.time() * 1000)
    login = "rop@revops.local"
    pwd_hash = "f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b"
    salt = "revops_tnt001_enterprise_sec_v20_2"
    sig = hashlib.sha256(f"{login}:{pwd_hash}:{now_ms}:{salt}".encode()).hexdigest()

    session_payload = json.dumps({
        "authenticated": True,
        "login": login,
        "timestamp": now_ms,
        "signature": sig
    })

    resp = client.get(
        "/api/v1/admin/status",
        headers={
            "host": "report.ai-rop.ru",
            "cf-connecting-ip": "194.87.12.34",
            "x-revops-session": session_payload
        }
    )
    assert resp.status_code == 403


def test_clients_list_and_register():
    """Verifies listing and registering new client access records."""
    from apps.api.auth import create_access_token
    from packages.database.models import UserRole

    # 1. Get initial list
    resp = client.get("/api/v1/admin/clients")
    assert resp.status_code == 200
    clients = resp.json()["clients"]
    assert len(clients) >= 3

    # 2. Register test client
    new_client_payload = {
        "login": "test_client_qa@example.com",
        "password_hash": "85ea1b4e244a77e9b613aabff886e19a113b2defc7a535c2f7722d8f7bf57228",
        "name": "Тестовый Клиент QA",
        "role": "РОП • Руководитель ОП",
        "tenant": "TNT-QA • Тестовая Компания"
    }
    reg_resp = client.post("/api/v1/admin/clients/register", json=new_client_payload)
    assert reg_resp.status_code == 200
    assert reg_resp.json()["success"] is True

    # 3. Check public auth endpoint (requires admin auth per P0-Auth-3)
    unauth_resp = client.get("/api/v1/auth/registered-clients")
    assert unauth_resp.status_code == 401

    admin_token = create_access_token({
        "sub": "usr-admin-test",
        "tenant_id": "TNT-001",
        "role": UserRole.ADMIN.value,
        "email": "admin@revops-test.io"
    })
    auth_resp = client.get(
        "/api/v1/auth/registered-clients",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert auth_resp.status_code == 200
    found = any(c["login"] == "test_client_qa@example.com" for c in auth_resp.json()["clients"])
    assert found is True

    # 4. Cleanup
    del_resp = client.delete("/api/v1/admin/clients/test_client_qa@example.com")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True


def test_features_config_and_toggle():
    """Verifies reading and toggling feature flags."""
    resp = client.get("/api/v1/admin/features")
    assert resp.status_code == 200
    assert "features" in resp.json()

    # Toggle existing or check error on unknown
    toggle_resp = client.post("/api/v1/admin/features/toggle", json={"code": "999.999", "enabled": True})
    assert toggle_resp.status_code == 404


def test_healer_status_action():
    """Verifies healer status action returns valid response."""
    resp = client.post("/api/v1/admin/healer/action", json={"action": "status"})
    assert resp.status_code == 200
    assert "output" in resp.json()


def test_admin_status_with_query_param_admin_key():
    """Verifies that remote requests with query parameter admin_key succeed."""
    import os
    admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
    resp = client.get(
        f"/api/v1/admin/status?admin_key={admin_key}",
        headers={
            "host": "report.ai-rop.ru",
            "cf-connecting-ip": "194.87.12.34"
        }
    )
    assert resp.status_code == 200
    assert "fleet_status" in resp.json()


def test_admin_status_with_jwt_cookie_for_dmitry():
    """Verifies that remote requests with Dmitry's access_token JWT cookie succeed."""
    from apps.api.auth import create_access_token
    token = create_access_token({"sub": "dmitriyfedotov1908@gmail.com", "tenant_id": "TNT-001", "role": "admin"})
    resp = client.get(
        "/api/v1/admin/status",
        headers={
            "host": "report.ai-rop.ru",
            "cf-connecting-ip": "194.87.12.34",
            "cookie": f"access_token={token}"
        }
    )
    assert resp.status_code == 200
    assert "fleet_status" in resp.json()


def test_client_login_dmitry_sets_admin_cookie():
    """Verifies that client-login for Dmitry Fedotov returns is_admin=True and sets revops_admin_token."""
    resp = client.post(
        "/api/v1/auth/client-login",
        json={"login": "dmitriyfedotov1908@gmail.com", "password": "1908"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["is_admin"] is True
    assert "revops_admin_token" in resp.cookies


def test_serve_admin_with_query_param_admin_key():
    """Verifies that /admin?admin_key=... sets revops_admin_token cookie and injects initial tab."""
    import os
    admin_key = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
    resp = client.get(f"/admin?admin_key={admin_key}")
    assert resp.status_code == 200
    assert "revops_admin_token" in resp.cookies
    assert '__INITIAL_TAB__="admin"' in resp.text
    assert admin_key in resp.text


def test_admin_update_tenant_and_get_webhooks():
    """Verifies that PUT /admin/tenants/{id} updates CRM/webhook and GET returns explicit webhook URLs."""
    token = create_access_token({"sub": "admin", "tenant_id": "TNT-001", "role": "admin"})
    resp_put = client.put(
        "/api/v1/admin/tenants/TNT-001",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "tenant_name": "Самозанятый (Master)",
            "crm_type": "bitrix24",
            "crm_webhook_url": "https://company.bitrix24.ru/rest/1/test_token/",
            "spreadsheet_id": "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk"
        }
    )
    assert resp_put.status_code == 200
    data = resp_put.json()
    assert data["success"] is True

    resp_get = client.get(
        "/api/v1/admin/tenants",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp_get.status_code == 200
    tenants = resp_get.json().get("tenants", [])
    t001 = next((t for t in tenants if t.get("tenant_id") == "TNT-001"), None)
    assert t001 is not None
    assert "https://report.ai-rop.ru/api/v1/webhooks/TNT-001/call" in t001["telephony_webhook_url"]
    assert "https://report.ai-rop.ru/api/v1/webhooks/TNT-001/bitrix24" in t001["bitrix_webhook_url"]
    assert "https://report.ai-rop.ru/api/v1/webhooks/TNT-001/amo-crm" in t001["amo_webhook_url"]


def test_admin_delete_tenant_protects_master():
    """Verifies that DELETE /admin/tenants/TNT-001 is rejected with 400 Bad Request."""
    token = create_access_token({"sub": "admin", "tenant_id": "TNT-001", "role": "admin"})
    resp_del = client.delete(
        "/api/v1/admin/tenants/TNT-001",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert resp_del.status_code == 400
    assert "TNT-001 запрещено" in resp_del.json()["detail"]





