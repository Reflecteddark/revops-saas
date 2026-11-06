"""
Tests for Defect 5: Evicting in-memory and Redis deals/calls caches when deleting a tenant.
Verifies:
- Populating _DEALS_CACHE[tid], _CALLS_CACHE[tid], _CALLS_CACHE[f"calls:{tid}"] and Redis cache keys deals:{tid}, calls:{tid}
- Calling DELETE /api/v1/admin/tenants/{tid}
- Confirming in-memory cache entries and Redis cache keys for deals and calls of the deleted tenant are evicted, while other tenants' caches remain intact.
"""

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api import cache_client, tenant_registry
from apps.api.main import app
from apps.api.routers import admin_router, calls_router, deals_router
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

    tenant_registry._REGISTRY_CACHE["data"] = None
    tenant_registry._REGISTRY_CACHE["timestamp"] = 0
    return reg_file


def test_delete_tenant_evicts_deals_and_calls_caches(
    isolated_registry: Path, monkeypatch: pytest.MonkeyPatch
):
    client = TestClient(app)
    headers = {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}

    rec = provision_tenant(company_name="Cache Evict Test Co", crm_type="amocrm")
    tid = rec["tenant_id"]

    # Seed in-memory caches for deleted tenant and a survivor tenant
    deals_router._DEALS_CACHE[tid] = {"timestamp": 9999999999.0, "deals": [{"id": "D-1"}]}
    deals_router._DEALS_CACHE["TNT-001"] = {"timestamp": 9999999999.0, "deals": [{"id": "D-MASTER"}]}
    calls_router._CALLS_CACHE[tid] = {"timestamp": 9999999999.0, "calls": [{"id": "C-1"}]}
    calls_router._CALLS_CACHE[f"calls:{tid}"] = {"timestamp": 9999999999.0, "calls": [{"id": "C-1"}]}
    calls_router._CALLS_CACHE["TNT-001"] = {"timestamp": 9999999999.0, "calls": [{"id": "C-MASTER"}]}

    evicted_redis_keys: list[str] = []

    def fake_delete_cached_json_sync(key: str) -> None:
        evicted_redis_keys.append(key)

    monkeypatch.setattr(cache_client, "delete_cached_json_sync", fake_delete_cached_json_sync)

    try:
        res = client.delete(f"/api/v1/admin/tenants/{tid}", headers=headers)
        assert res.status_code == 200, res.text
        assert res.json().get("success") is True

        # Deleted tenant caches must be evicted
        assert tid not in deals_router._DEALS_CACHE
        assert tid not in calls_router._CALLS_CACHE
        assert f"calls:{tid}" not in calls_router._CALLS_CACHE
        assert f"deals:{tid}" in evicted_redis_keys
        assert f"calls:{tid}" in evicted_redis_keys

        # Other tenant caches must not be touched
        assert "TNT-001" in deals_router._DEALS_CACHE
        assert "TNT-001" in calls_router._CALLS_CACHE
    finally:
        deals_router._DEALS_CACHE.pop(tid, None)
        deals_router._DEALS_CACHE.pop("TNT-001", None)
        calls_router._CALLS_CACHE.pop(tid, None)
        calls_router._CALLS_CACHE.pop(f"calls:{tid}", None)
        calls_router._CALLS_CACHE.pop("TNT-001", None)
        with SessionLocal() as db:
            db.query(Tenant).filter(Tenant.id == tid).delete()
            db.commit()
