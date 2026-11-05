"""
The cabinet asked for a CRM managers sync on EVERY open of the Settings page. The sync can remove managers, so the
automatic (page-load) call now runs at most once per 10 minutes per tenant; the "sync" button always runs.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import settings_router

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
TENANT = "TNT-TH1"
client = TestClient(app)


@pytest.fixture
def crm_calls(monkeypatch):
    calls = []

    async def fake_sync(tenant):
        calls.append(tenant)
        return {"status": "ok", "message": "m", "crm_type": "amocrm", "added_count": 0, "total_count": 1, "managers": [{"id": "1"}]}

    async def fake_broadcast(*a, **k):
        return None

    monkeypatch.setattr("apps.api.services.crm_users_sync.sync_tenant_crm_managers", fake_sync)
    monkeypatch.setattr(settings_router.manager, "broadcast", fake_broadcast)
    settings_router._AUTO_SYNC_AT.clear()
    yield calls
    settings_router._AUTO_SYNC_AT.clear()


def _post(path):
    token = create_access_token({"sub": f"c-{uuid.uuid4().hex[:6]}@x.test", "tenant_id": TENANT, "role": "РОП"})
    return client.post(path, headers={**EXTERNAL, "Authorization": "Bearer " + token})


def test_the_page_load_sync_runs_once_then_is_skipped(crm_calls):
    first = _post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}&auto=true")
    second = _post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}&auto=true")
    assert first.json()["status"] == "ok"
    assert second.json()["status"] == "skipped"
    assert "managers" not in second.json()  # the cabinet must not replace the table the user is editing
    assert len(crm_calls) == 1


def test_the_sync_button_always_runs(crm_calls):
    _post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}&auto=true")
    for _ in range(2):
        assert _post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}").json()["status"] == "ok"
    assert len(crm_calls) == 3


def test_the_nested_route_is_the_button_not_the_page_load(crm_calls):
    _post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}&auto=true")
    r = _post(f"/api/v1/settings/tenants/{TENANT}/managers/sync")
    assert r.json()["status"] == "ok"
    assert len(crm_calls) == 2


def test_the_pause_ends(crm_calls, monkeypatch):
    _post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}&auto=true")
    settings_router._AUTO_SYNC_AT[TENANT] -= settings_router._AUTO_SYNC_EVERY_SEC + 1
    assert _post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}&auto=true").json()["status"] == "ok"
    assert len(crm_calls) == 2


def test_tenants_are_paused_independently(crm_calls):
    token_a = {"sub": "a@x.test", "tenant_id": "TNT-TH1", "role": "РОП"}
    token_b = {"sub": "b@x.test", "tenant_id": "TNT-TH2", "role": "РОП"}
    for token, tenant in ((token_a, "TNT-TH1"), (token_b, "TNT-TH2")):
        h = {**EXTERNAL, "Authorization": "Bearer " + create_access_token(token)}
        assert client.post(f"/api/v1/settings/managers/sync?tenant_id={tenant}&auto=true", headers=h).json()["status"] == "ok"
    assert crm_calls == ["TNT-TH1", "TNT-TH2"]
