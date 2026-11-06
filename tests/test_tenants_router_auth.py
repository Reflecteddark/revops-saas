"""
Auth perimeter for tenants_router: no endpoint touching tenant data/credentials
may be reachable without authentication, and tenants must not see each other.

Registry load/save are monkeypatched, so nothing here touches real registry files.
"""

import os
import copy

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import tenants_router
from packages.database.models import UserRole

SECRET = "SECRET-AMO-TOKEN-DO-NOT-LEAK"

REGISTRY = {
    "tenants": [
        {
            "tenant_id": "TNT-001",
            "tenant_name": "Tenant One",
            "spreadsheet_id": "sheet-one",
            "crm_type": "amocrm",
            "amo_token": SECRET,
            "crm_webhook_url": "https://example.invalid/hook-one",
            "status": "active",
        },
        {
            "tenant_id": "TNT-002",
            "tenant_name": "Tenant Two",
            "spreadsheet_id": "sheet-two",
            "crm_type": "bitrix24",
            "amo_token": SECRET + "-2",
            "status": "active",
        },
    ]
}


@pytest.fixture
def saves(monkeypatch):
    """Isolated in-memory registry; records every save attempt."""
    state = {"data": copy.deepcopy(REGISTRY), "saved": 0}

    monkeypatch.setattr(tenants_router, "load_tenants_registry", lambda: state["data"])
    monkeypatch.setattr(
        tenants_router,
        "save_tenants_registry",
        lambda data, *a, **k: state.update(saved=state["saved"] + 1),
    )
    monkeypatch.setattr(tenants_router, "get_tenants_registry_path", lambda: "memory")
    monkeypatch.setattr(
        tenants_router,
        "get_tenant_config",
        lambda tid: next(
            (t for t in state["data"]["tenants"] if t["tenant_id"] == str(tid).upper()), None
        ),
    )
    return state


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def tnt1_headers():
    token = create_access_token(
        {"sub": "usr-tnt-001", "tenant_id": "TNT-001", "role": UserRole.CEO.value,
         "email": "user@tenant1.test"}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    return {"x-admin-key": os.environ["REVOPS_ADMIN_KEY"]}


NEW_TENANT = {"tenant_id": "TNT-002", "tenant_name": "Hijacked", "spreadsheet_id": "evil",
              "amo_token": "attacker-token"}

# (method, path, json) — every one must reject anonymous callers
PROTECTED = [
    ("GET", "/api/v1/tenants/TNT-002", None),
    ("GET", "/api/v1/tenants/TNT-002/export-archive", None),
    ("POST", "/api/v1/tenants/TNT-002/test-crm", None),
    ("POST", "/api/v1/tenants/TNT-002/offboard", None),
    ("POST", "/api/v1/tenants", NEW_TENANT),
    ("POST", "/api/v1/tenants/niches/dynamic", {"niche_title": "x"}),
]


@pytest.mark.parametrize("method,path,body", PROTECTED)
def test_anonymous_rejected(client, saves, method, path, body):
    res = client.request(method, path, json=body)
    assert res.status_code == 401, f"{method} {path} -> {res.status_code}: {res.text[:200]}"
    assert saves["saved"] == 0, "anonymous call modified the registry"
    assert SECRET not in res.text


def test_summary_stays_open_for_n8n_but_has_no_credentials(client, saves):
    """Restricted to internal Docker-network callers (n8n) and admins; never leaks credentials."""
    assert client.get("/api/v1/tenants/summary").status_code == 403
    int_client = TestClient(app, client=("172.16.0.5", 50000))
    res = int_client.get("/api/v1/tenants/summary")
    assert res.status_code == 200
    assert "amo_token" not in res.text and SECRET not in res.text


def test_tenant_cannot_read_foreign_config(client, saves, tnt1_headers):
    res = client.get("/api/v1/tenants/TNT-002", headers=tnt1_headers)
    assert res.status_code == 403


def test_tenant_cannot_export_foreign_archive(client, saves, tnt1_headers):
    res = client.get("/api/v1/tenants/TNT-002/export-archive", headers=tnt1_headers)
    assert res.status_code == 403


def test_tenant_cannot_offboard_or_overwrite_foreign(client, saves, tnt1_headers):
    assert client.post("/api/v1/tenants/TNT-002/offboard", headers=tnt1_headers).status_code == 403
    assert client.post("/api/v1/tenants", json=NEW_TENANT, headers=tnt1_headers).status_code == 403
    assert saves["saved"] == 0


def test_tenant_cannot_offboard_self(client, saves, tnt1_headers):
    """Offboarding / registration is a fleet-admin operation, not a client one."""
    assert client.post("/api/v1/tenants/TNT-001/offboard", headers=tnt1_headers).status_code == 403
    assert saves["saved"] == 0


def test_own_config_has_no_credentials(client, saves, tnt1_headers):
    res = client.get("/api/v1/tenants/TNT-001", headers=tnt1_headers)
    assert res.status_code == 200
    assert res.json()["tenant_id"] == "TNT-001"
    assert SECRET not in res.text
    assert "amo_token" not in res.json()


def test_admin_keeps_full_access(client, saves, admin_headers):
    res = client.get("/api/v1/tenants/TNT-002", headers=admin_headers)
    assert res.status_code == 200
    assert client.get("/api/v1/tenants/summary", headers=admin_headers).status_code == 200
    res = client.post("/api/v1/tenants", json=NEW_TENANT, headers=admin_headers)
    assert res.status_code == 200
    assert saves["saved"] == 1


def test_admin_export_archive_works(client, saves, admin_headers, monkeypatch):
    """export-archive used to call get_tenant_passport() without current_user."""
    from apps.api.routers import calls_router, deals_router, settings_router

    monkeypatch.setattr(calls_router, "fetch_calls_from_sheets", lambda *a, **k: [])
    monkeypatch.setattr(deals_router, "fetch_deals_from_sheets", lambda *a, **k: [])
    monkeypatch.setattr(settings_router, "fetch_settings_from_sheets", lambda *a, **k: {})
    res = client.get("/api/v1/tenants/TNT-002/export-archive", headers=admin_headers)
    assert res.status_code == 200, res.text[:300]
    assert res.headers["content-type"] == "application/zip"


def test_own_export_archive_allowed(client, saves, tnt1_headers, monkeypatch):
    from apps.api.routers import calls_router, deals_router, settings_router

    monkeypatch.setattr(calls_router, "fetch_calls_from_sheets", lambda *a, **k: [])
    monkeypatch.setattr(deals_router, "fetch_deals_from_sheets", lambda *a, **k: [])
    monkeypatch.setattr(settings_router, "fetch_settings_from_sheets", lambda *a, **k: {})
    res = client.get("/api/v1/tenants/TNT-001/export-archive", headers=tnt1_headers)
    assert res.status_code == 200, res.text[:300]
