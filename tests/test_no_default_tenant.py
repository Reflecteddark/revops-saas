# -*- coding: utf-8 -*-
"""
A client account / token without a company must be refused - never silently become TNT-001 (the main client).
Found in the 2026-11-03 audit: a new client created without a tenant would have been logged into another client's data.
"""

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token, hash_password
from apps.api.main import app
from apps.api.routers import admin_router

client = TestClient(app, client=("172.16.0.5", 50000))


def _clients(extra):
    return lambda: list(extra)


def _acct(login, tenant):
    c = {"login": login, "name": login, "role": "РОП", "password_hash": hash_password("S3cret-pass!"), "is_active": True}
    if tenant is not None:
        c["tenant"] = tenant
    return c


def test_client_login_without_a_company_is_refused(monkeypatch):
    monkeypatch.setattr(admin_router, "load_registered_clients", _clients([_acct("no-tenant-user", None)]))
    res = client.post("/api/v1/auth/client-login", json={"login": "no-tenant-user", "password": "S3cret-pass!"})
    assert res.status_code == 403, res.text[:200]
    assert "access_token" not in res.cookies


def test_client_login_with_a_company_gets_that_company(monkeypatch):
    monkeypatch.setattr(admin_router, "load_registered_clients",
                        _clients([_acct("with-tenant-user", "TNT-777 • Новая компания")]))
    res = client.post("/api/v1/auth/client-login", json={"login": "with-tenant-user", "password": "S3cret-pass!"})
    assert res.status_code == 200, res.text[:200]
    import jwt
    from apps.api.auth import ALGORITHM, SECRET_KEY
    assert jwt.decode(res.cookies["access_token"], SECRET_KEY, algorithms=[ALGORITHM])["tenant_id"] == "TNT-777"


@pytest.mark.parametrize("role", ["РОП", "Менеджер", "CEO"])
def test_client_token_without_a_company_is_rejected(role):
    token = create_access_token({"sub": "ghost-client", "role": role})
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401, res.text[:200]


def test_calls_data_rejects_a_cookie_token_without_a_company():
    # asking for TNT-001: the old code turned a company-less token into a TNT-001 user and answered 200 with its calls
    token = create_access_token({"sub": "ghost-client", "role": "РОП"})
    res = TestClient(app, client=("203.0.113.9", 50000)).get(
        "/api/v1/calls/data?tenant_id=TNT-001", cookies={"access_token": token},
        headers={"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.9"})
    assert res.status_code == 401, res.text[:200]
