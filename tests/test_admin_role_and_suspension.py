"""Platform admin is an exact role; a frozen company loses sessions it already holds; the quarantine has no demo rows."""
import hashlib
import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token, is_admin_role
from apps.api.main import app

client = TestClient(app, client=("203.0.113.9", 50000))


@pytest.mark.parametrize("role", ["admin", "Admin", "⚙️ Admin", "Admin / Супервайзер"])
def test_exact_admin_labels(role):
    assert is_admin_role(role)


@pytest.mark.parametrize("role", ["Супервайзер продаж", "Admin assistant", "Администратор склада", "👑 CEO", "", None])
def test_job_titles_are_not_admin(role):
    assert not is_admin_role(role)


def test_token_with_a_supervisor_job_title_cannot_use_admin_routes():
    token = create_access_token({"sub": "sv@client.ru", "tenant_id": "TNT-002", "role": "Супервайзер продаж"})
    res = client.get("/api/v1/admin/status", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 403


def test_token_with_the_admin_role_still_can():
    token = create_access_token({"sub": "boss@x.ru", "tenant_id": "TNT-001", "role": "admin"})
    assert client.get("/api/v1/admin/status", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_client_login_with_a_supervisor_job_title_is_not_admin():
    record = {
        "login": "sv@client.ru",
        "keyHashes": [hashlib.sha256(b"pw-12345").hexdigest()],
        "name": "Супервайзер",
        "role": "Супервайзер продаж",
        "tenant": "TNT-002 • Клиент",
        "is_active": True,
    }
    with patch("apps.api.routers.admin_router.load_registered_clients", return_value=[record]):
        res = client.post("/api/v1/auth/client-login", json={"login": "sv@client.ru", "password": "pw-12345"})
    assert res.status_code == 200
    assert res.json()["is_admin"] is False
    assert "revops_admin_token" not in res.cookies


def test_frozen_company_cannot_log_in_or_keep_its_session():
    record = {
        "login": "u@frozen.ru",
        "keyHashes": [hashlib.sha256(b"pw-12345").hexdigest()],
        "name": "U",
        "role": "РОП",
        "tenant": "TNT-FRZ • Frozen",
        "is_active": True,
    }
    with patch("apps.api.tenant_registry.get_tenant_config", return_value={"status": "frozen"}), \
         patch("apps.api.routers.admin_router.load_registered_clients", return_value=[record]):
        login = client.post("/api/v1/auth/client-login", json={"login": "u@frozen.ru", "password": "pw-12345"})
        token = create_access_token({"sub": "u@frozen.ru", "tenant_id": "TNT-FRZ", "role": "РОП"})
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert login.status_code == 403
    assert me.status_code == 403


def test_offboarding_the_master_tenant_is_refused():
    headers = {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}
    res = client.post("/api/v1/admin/tenants/TNT-001/status", headers=headers, json={"action": "offboard"})
    assert res.status_code == 400
    res = client.post("/api/v1/tenants/TNT-001/offboard", headers=headers)
    assert res.status_code == 400


def test_quarantine_starts_empty(tmp_path, monkeypatch):
    from apps.api.routers import admin_router

    monkeypatch.setattr(admin_router, "QUARANTINE_FILE", tmp_path / "quarantine_registry.json")
    res = client.get("/api/v1/admin/quarantine/calls", headers={"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]})
    assert res.status_code == 200
    assert res.json()["total"] == 0
