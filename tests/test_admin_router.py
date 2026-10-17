"""
Tests for Admin Router & Fleet Control Center.
Verifies all new admin endpoints, fleet checks, task scheduler status, and live console logs.
"""

from fastapi.testclient import TestClient
from apps.api.main import app

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
    resp = client.get(
        "/api/v1/admin/status",
        headers={
            "host": "report.ai-rop.ru",
            "cf-connecting-ip": "194.87.12.34",
            "x-revops-admin-key": "revops_admin_fleet_secret_2026"
        }
    )
    assert resp.status_code == 200
    assert "fleet_status" in resp.json()


def test_authorized_remote_admin_access_with_session():
    """Verifies that remote requests with valid cryptographic HMAC session succeed."""
    import hashlib
    import json
    import time

    now_ms = int(time.time() * 1000)
    login = "dmitriyfedotov1908@gmail.com"
    pwd_hash = "f82d5f1f10fc36e941922f73e9b7ad871bace49786bd408a135359a3346df27b"
    salt = "revops_tnt001_enterprise_sec_v20_2"
    sig = hashlib.sha256(f"{login}:{pwd_hash}:{now_ms}:{salt}".encode("utf-8")).hexdigest()

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
    assert resp.status_code == 200
    assert "fleet_status" in resp.json()


