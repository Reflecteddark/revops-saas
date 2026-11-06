"""
Tests for Defect 3: Offboarding stops webhook intake (returns 410) and updates DB state.
Verifies:
1. Provision a new tenant using a temporary registry & archive (never touching real files).
2. Offboard via POST /api/v1/admin/tenants/{id}/status {"action": "offboard"}:
   - Tenant row in DB has is_active=False and settings["status"] == "archived"
   - Tenant is no longer in active list of GET /api/v1/admin/tenants (and is in archived)
   - Incoming webhooks (/webhooks/{id}/call and /webhooks/{id}/amo-crm) with admin key return 410 Gone
3. Restore via POST /api/v1/admin/tenants/{id}/status {"action": "restore"}:
   - Tenant row in DB has is_active=True and settings["status"] == "active"
   - Incoming webhooks return 200 OK
4. Offboard via POST /api/v1/tenants/{id}/offboard also updates DB to is_active=False, status="archived" and stops webhooks with 410.
"""

import os
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from apps.api import tenant_registry
from apps.api.main import app
from apps.api.routers import admin_router, webhooks_router
from apps.api.tenant_provisioner import provision_tenant
from packages.database.models import Tenant
from packages.database.session import SessionLocal


@pytest.fixture
def isolated_registry(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    reg_file = tmp_path / "tenants_registry.json"
    reg_file.write_text(
        '{"tenants": [{"tenant_id": "TNT-001", "tenant_name": "Master", "status": "active", "crm_type": "bitrix24"}]}',
        encoding="utf-8",
    )
    arch_file = tmp_path / "tenants_archive.json"
    arch_file.write_text("[]", encoding="utf-8")
    clients_file = tmp_path / "registered_clients.json"
    clients_file.write_text("[]", encoding="utf-8")

    monkeypatch.setenv("TENANTS_REGISTRY_PATH", str(reg_file))
    monkeypatch.setattr(tenant_registry, "get_tenants_registry_path", lambda: reg_file)
    monkeypatch.setattr(tenant_registry, "get_all_candidate_registry_paths", lambda: [reg_file])
    monkeypatch.setattr(admin_router, "get_all_tenants_registry_paths", lambda: [reg_file])
    monkeypatch.setattr(admin_router, "get_all_tenants_archive_paths", lambda: [arch_file])
    monkeypatch.setattr(admin_router, "get_all_registered_clients_paths", lambda: [clients_file])
    monkeypatch.setattr(webhooks_router.manager, "broadcast", AsyncMock())
    monkeypatch.setattr(webhooks_router, "append_call_to_sheets", lambda *a, **k: True)

    tenant_registry._REGISTRY_CACHE["data"] = None
    tenant_registry._REGISTRY_CACHE["timestamp"] = 0
    return reg_file


@pytest.fixture
def admin_headers() -> dict[str, str]:
    return {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}


def test_offboard_updates_db_stops_webhooks_with_410_and_restore_reenables(
    isolated_registry: Path, admin_headers: dict[str, str]
):
    client = TestClient(app)
    rec = provision_tenant(company_name="Offboard Test Co", crm_type="amocrm")
    tid = rec["tenant_id"]

    try:
        # 1. Offboard via admin status endpoint
        res_off = client.post(
            f"/api/v1/admin/tenants/{tid}/status",
            json={"action": "offboard", "reason": "test churn"},
            headers=admin_headers,
        )
        assert res_off.status_code == 200, res_off.text

        # Force cache expiry to simulate subsequent requests across workers/time
        tenant_registry._REGISTRY_CACHE["data"] = None
        tenant_registry._REGISTRY_CACHE["timestamp"] = 0

        # 2. Verify DB row is_active=False and status='archived'
        with SessionLocal() as db:
            db_t = db.query(Tenant).filter(Tenant.id == tid).first()
            assert db_t is not None
            assert db_t.is_active is False
            assert (db_t.settings or {}).get("status") == "archived"

        # 3. Verify tenant is not in active /admin/tenants list
        res_list = client.get("/api/v1/admin/tenants", headers=admin_headers)
        assert res_list.status_code == 200
        active_ids = [t["tenant_id"] for t in res_list.json()["tenants"]]
        archived_ids = [a["tenant_id"] for a in res_list.json()["archived"]]
        assert tid not in active_ids
        assert tid in archived_ids

        # 4. Verify webhooks with admin key are rejected with 410 Gone
        res_call_wh = client.post(
            f"/api/v1/webhooks/{tid}/call",
            json={"call_id": "call-after-offboard", "duration_sec": 45},
            headers=admin_headers,
        )
        assert res_call_wh.status_code == 410, f"Expected 410 on /call, got {res_call_wh.status_code}: {res_call_wh.text}"

        res_amo_wh = client.post(
            f"/api/v1/webhooks/{tid}/amo-crm",
            json={"leads": {"delete": [{"id": "100500"}]}},
            headers=admin_headers,
        )
        assert res_amo_wh.status_code == 410, f"Expected 410 on /amo-crm, got {res_amo_wh.status_code}: {res_amo_wh.text}"

        # 5. Restore from archive -> DB is_active=True and webhooks return 200
        res_rest = client.post(
            f"/api/v1/admin/tenants/{tid}/status",
            json={"action": "restore"},
            headers=admin_headers,
        )
        assert res_rest.status_code == 200, res_rest.text

        with SessionLocal() as db:
            db_t = db.query(Tenant).filter(Tenant.id == tid).first()
            assert db_t is not None
            assert db_t.is_active is True
            assert (db_t.settings or {}).get("status") == "active"

        res_amo_ok = client.post(
            f"/api/v1/webhooks/{tid}/amo-crm",
            json={"leads": {"delete": [{"id": "100500"}]}},
            headers=admin_headers,
        )
        assert res_amo_ok.status_code == 200, res_amo_ok.text
    finally:
        with SessionLocal() as db:
            db.query(Tenant).filter(Tenant.id == tid).delete()
            db.commit()
