"""
Auth perimeter for settings_router and deals write endpoints.
All external side effects (Google Sheets, CRM sync, tenant registry, WebSocket) are stubbed,
so these tests never write anything even against vulnerable code.
"""

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import deals_router, settings_router
from packages.database.models import UserRole

# Request arriving from the internet through the Cloudflare tunnel
# (otherwise TestClient is treated as a trusted local admin).
EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}


@pytest.fixture
def side_effects(monkeypatch):
    calls = {"sheet_writes": 0, "registry_saves": 0, "crm_syncs": 0, "broadcasts": 0}

    async def fake_sync(tenant):
        calls["crm_syncs"] += 1
        return {"added_count": 0}

    async def fake_broadcast(*a, **k):
        calls["broadcasts"] += 1

    monkeypatch.setattr(settings_router, "fetch_settings_from_sheets",
                        lambda tenant_id="TNT-001", force_refresh=False: {"tenant_id": tenant_id})
    monkeypatch.setattr(settings_router, "save_settings_to_sheets",
                        lambda payload: calls.update(sheet_writes=calls["sheet_writes"] + 1) or True)
    monkeypatch.setattr("apps.api.services.crm_users_sync.sync_tenant_crm_managers", fake_sync)
    monkeypatch.setattr("apps.api.tenant_registry.load_tenants_registry",
                        lambda: {"tenants": [{"tenant_id": "TNT-001"}, {"tenant_id": "TNT-002"}]})
    monkeypatch.setattr("apps.api.tenant_registry.save_tenants_registry",
                        lambda *a, **k: calls.update(registry_saves=calls["registry_saves"] + 1) or True)
    monkeypatch.setattr(settings_router.manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(deals_router.manager, "broadcast", fake_broadcast)
    monkeypatch.setattr(deals_router, "fetch_deals_from_sheets", lambda *a, **k: [])
    monkeypatch.setattr(deals_router, "get_deals_lookup", lambda *a, **k: {})
    return calls


@pytest.fixture
def client():
    return TestClient(app)


def _jwt(tenant):
    return create_access_token({"sub": f"usr-{tenant.lower()}", "tenant_id": tenant,
                                "role": UserRole.CEO.value, "email": f"u@{tenant.lower()}.test"})


KPI = {"revenue_target": 100}
ANON_CASES = [
    ("GET", "/api/v1/settings?tenant_id=TNT-002", None),
    ("GET", "/api/v1/settings?tenant_id=TNT-002&auto_sync=true", None),
    ("POST", "/api/v1/settings/managers/sync?tenant_id=TNT-002", None),
    ("POST", "/api/v1/settings/tenants/TNT-002/managers/sync", None),
    ("POST", "/api/v1/settings", {"tenant_id": "TNT-002"}),
    ("PATCH", "/api/v1/settings/managers/m1/kpis?tenant_id=TNT-002", KPI),
    ("PATCH", "/api/v1/settings/tenants/TNT-002/managers/m1/kpis", KPI),
    ("POST", "/api/v1/deals/D-1/fix-next-step?org_id=TNT-002", None),
    ("POST", "/api/v1/deals/ingest?tenant_id=TNT-002", {"deal_id": "X-1"}),
]


@pytest.mark.parametrize("method,path,body", ANON_CASES)
def test_anonymous_external_rejected(client, side_effects, method, path, body):
    res = client.request(method, path, json=body, headers=EXTERNAL)
    assert res.status_code in (401, 403), f"{method} {path} -> {res.status_code}: {res.text[:160]}"
    assert side_effects == {"sheet_writes": 0, "registry_saves": 0, "crm_syncs": 0, "broadcasts": 0}


@pytest.mark.parametrize("method,path,body", ANON_CASES[:-1])
def test_tenant_cannot_touch_foreign_tenant(client, side_effects, method, path, body):
    headers = {**EXTERNAL, "Authorization": f"Bearer {_jwt('TNT-001')}"}
    res = client.request(method, path, json=body, headers=headers)
    assert res.status_code == 403, f"{method} {path} -> {res.status_code}: {res.text[:160]}"
    assert side_effects["sheet_writes"] == side_effects["registry_saves"] == side_effects["crm_syncs"] == 0


def test_tenant_reads_own_settings(client, side_effects):
    headers = {**EXTERNAL, "Authorization": f"Bearer {_jwt('TNT-001')}"}
    res = client.get("/api/v1/settings?tenant_id=TNT-001", headers=headers)
    assert res.status_code == 200
    assert res.json()["tenant_id"] == "TNT-001"


def test_tenant_saves_own_settings_via_cookie(client, side_effects):
    client.cookies.set("access_token", _jwt("TNT-001"))
    res = client.post("/api/v1/settings", json={"tenant_id": "TNT-001"}, headers=EXTERNAL)
    assert res.status_code == 200
    assert side_effects["sheet_writes"] == 1


def test_tenant_patches_own_manager_kpis(client, side_effects):
    headers = {**EXTERNAL, "Authorization": f"Bearer {_jwt('TNT-001')}"}
    res = client.patch("/api/v1/settings/managers/m1/kpis?tenant_id=TNT-001", json=KPI, headers=headers)
    assert res.status_code == 200, res.text[:200]
    assert side_effects["registry_saves"] == 1


def test_fix_next_step_broadcasts_only_to_own_tenant(client, side_effects, monkeypatch):
    seen = []

    async def rec(org, msg):
        seen.append(org)

    monkeypatch.setattr(deals_router.manager, "broadcast", rec)
    # a real (transient) deal: fix-next-step answers 404 for a deal that does not exist
    from packages.database.models import Deal, DealStage
    fake = Deal(id="D-1", tenant_id="TNT-001", workspace_id="ws", title="T", budget=1.0,
                stage=DealStage.QUALIFICATION, stage_name="Квалификация", custom_payload={})
    monkeypatch.setattr(deals_router, "find_tenant_deal", lambda db, tenant, crm_id: fake)
    headers = {**EXTERNAL, "Authorization": f"Bearer {_jwt('TNT-001')}"}
    res = client.post("/api/v1/deals/D-1/fix-next-step", headers=headers)
    assert res.status_code == 200, res.text[:200]
    assert seen == ["TNT-001"]
