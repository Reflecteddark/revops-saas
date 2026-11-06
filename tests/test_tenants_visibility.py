"""
Tests for Defect 2: /tenants and /tenants/summary visibility & access control.
Verifies:
- Anonymous GET /api/v1/tenants -> 401
- Anonymous GET /api/v1/tenants/summary -> 403
- Client user (TNT-002) GET /api/v1/tenants sees strictly ["TNT-002"] (no TNT-001, no TNT-CLEAN-001)
- Client user (TNT-002) GET /api/v1/tenants/summary -> 403
- Admin GET /api/v1/tenants sees all tenants
- Internal Docker network call (172.16.0.5 without proxy headers) GET /api/v1/tenants/summary -> 200
"""

import os
import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import tenants_router
from packages.database.models import UserRole

MOCK_SUMMARIES = [
    {
        "tenant_id": "TNT-001",
        "tenant_name": "Мастер Компания",
        "crm_type": "bitrix24",
        "spreadsheet_id": "sheet-1",
        "status": "active",
        "niche_name": "B2B",
        "avg_deal_check": 200000,
        "is_template": False,
    },
    {
        "tenant_id": "TNT-002",
        "tenant_name": "Клиент Два",
        "crm_type": "amocrm",
        "spreadsheet_id": "sheet-2",
        "status": "active",
        "niche_name": "SaaS",
        "avg_deal_check": 150000,
        "is_template": False,
    },
    {
        "tenant_id": "TNT-CLEAN-001",
        "tenant_name": "Clean Client Starter (Шаблон)",
        "crm_type": "template",
        "spreadsheet_id": "sheet-tpl",
        "status": "template",
        "niche_name": "Чистый старт",
        "avg_deal_check": 0,
        "is_template": True,
    },
]


@pytest.fixture(autouse=True)
def mock_summaries(monkeypatch):
    monkeypatch.setattr(tenants_router, "get_all_tenants_summary", lambda: list(MOCK_SUMMARIES))


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


@pytest.fixture
def tnt2_headers():
    token = create_access_token(
        {
            "sub": "usr-tnt-002",
            "tenant_id": "TNT-002",
            "role": UserRole.ROP.value,
            "email": "rop@tnt2.test",
        }
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_headers():
    return {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}


def test_anonymous_tenants_returns_401(ext_client):
    res = ext_client.get("/api/v1/tenants")
    assert res.status_code == 401, f"Expected 401 for anonymous /tenants, got {res.status_code}: {res.text}"


def test_anonymous_tenants_summary_returns_403(ext_client):
    res = ext_client.get("/api/v1/tenants/summary")
    assert res.status_code == 403, f"Expected 403 for anonymous /tenants/summary, got {res.status_code}: {res.text}"


def test_client_tnt002_sees_only_self_without_template(ext_client, tnt2_headers):
    res = ext_client.get("/api/v1/tenants", headers=tnt2_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert [t["tenant_id"] for t in data] == ["TNT-002"]
    assert set(data[0].keys()) == {"tenant_id", "tenant_name", "status", "crm_type"}
    assert "spreadsheet_id" not in data[0]

    # Client cannot access /tenants/summary
    res_sum = ext_client.get("/api/v1/tenants/summary", headers=tnt2_headers)
    assert res_sum.status_code == 403


def test_admin_sees_all_tenants(ext_client, admin_headers):
    res = ext_client.get("/api/v1/tenants", headers=admin_headers)
    assert res.status_code == 200, res.text
    ids = [t["tenant_id"] for t in res.json()]
    assert "TNT-001" in ids and "TNT-002" in ids and "TNT-CLEAN-001" in ids


def test_internal_call_tenants_summary_returns_200(int_client):
    res = int_client.get("/api/v1/tenants/summary")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "ok"
    assert len(body["tenants"]) == 3
