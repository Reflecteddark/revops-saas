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
