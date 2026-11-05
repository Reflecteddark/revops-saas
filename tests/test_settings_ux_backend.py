"""
Cabinet QA findings that need the server:
- the sheet template keeps dates as 01.10.2026, the date field of the cabinet wants 2026-10-01: a period filled in the
  sheet looked empty in the cabinet;
- a manager the user deleted came back with the very next CRM sync: an automatic (page-load) sync must leave him
  out, the import button brings him back.
"""

import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api import tenant_registry
from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import settings_router
from apps.api.routers.settings_router import _iso_date
from apps.api.services import crm_users_sync
from packages.database.models import Tenant
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
TENANT = "TNT-UX1"
client = TestClient(app)


def _forget_caches():
    tenant_registry._REGISTRY_CACHE["data"] = None
    tenant_registry._REGISTRY_CACHE["timestamp"] = 0
    settings_router._SETTINGS_CACHE.clear()
    settings_router._AUTO_SYNC_AT.clear()


def _headers():
    token = create_access_token({"sub": f"c-{uuid.uuid4().hex[:6]}@x.test", "tenant_id": TENANT, "role": "РОП"})
    return {**EXTERNAL, "Authorization": "Bearer " + token}


@pytest.fixture(autouse=True)
def hermetic(monkeypatch):
    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: None)
    path = Path(tenant_registry.get_tenants_registry_path())
    original = path.read_text(encoding="utf-8")
    _forget_caches()
    yield path
    path.write_text(original, encoding="utf-8")
    db = SessionLocal()
    try:
        db.query(Tenant).filter(Tenant.id == TENANT).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
    _forget_caches()


@pytest.mark.parametrize("raw,expected", [
    ("01.10.2026", "2026-10-01"),
    ("1.2.2026", "2026-02-01"),
    ("2026-10-01", "2026-10-01"),
    ("", ""),
    ("  31.12.2026 ", "2026-12-31"),
    ("not a date", "not a date"),
])
def test_sheet_dates_become_iso(raw, expected):
    assert _iso_date(raw) == expected


def _registry_with_team(path, dismissed=None, only_anna=False):
    team = [{"id": "11", "name": "Анна Один", "role": "Менеджер ОП", "capacity": 40},
            {"id": "12", "name": "Борис Два", "role": "Менеджер ОП", "capacity": 40}]
    if only_anna:
        team = team[:1]
    entry = {"tenant_id": TENANT, "tenant_name": "UX1", "crm_type": "amocrm", "amo_domain": "a.amocrm.ru",
             "amo_token": "t", "managers": team, "manager_kpis": {m["id"]: {} for m in team}}
    if dismissed:
        entry["dismissed_manager_ids"] = dismissed
    path.write_text(json.dumps({"tenants": [entry]}), encoding="utf-8")
    _forget_caches()


def _crm_has_both(monkeypatch):
    async def users(domain, token):
        return [{"id": "11", "name": "Анна Один", "role": "Менеджер ОП"},
                {"id": "12", "name": "Борис Два", "role": "Менеджер ОП"}]

    monkeypatch.setattr(crm_users_sync, "fetch_amocrm_users", users)


def _saved_ids(path):
    tenants = {t["tenant_id"]: t for t in json.loads(path.read_text(encoding="utf-8"))["tenants"]}
    return [m["id"] for m in tenants[TENANT]["managers"]], tenants[TENANT].get("dismissed_manager_ids")


def test_a_deleted_manager_is_remembered(hermetic):
    _registry_with_team(hermetic)
    only_anna = [{"id": "11", "name": "Анна Один", "role": "Менеджер ОП", "capacity": 40}]
    r = client.post("/api/v1/settings", json={"tenant_id": TENANT, "managers": only_anna}, headers=_headers())
    assert r.status_code == 200
    ids, dismissed = _saved_ids(hermetic)
    assert ids == ["11"] and dismissed == ["12"]


def test_the_page_load_sync_does_not_bring_a_deleted_manager_back(hermetic, monkeypatch):
    _registry_with_team(hermetic, dismissed=["12"], only_anna=True)
    _crm_has_both(monkeypatch)

    r = client.post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}&auto=true", headers=_headers())
    assert r.status_code == 200
    ids, dismissed = _saved_ids(hermetic)
    assert ids == ["11"]
    assert dismissed == ["12"]


def test_the_import_button_brings_him_back_and_forgets_the_dismissal(hermetic, monkeypatch):
    _registry_with_team(hermetic, dismissed=["12"], only_anna=True)
    _crm_has_both(monkeypatch)

    r = client.post(f"/api/v1/settings/managers/sync?tenant_id={TENANT}", headers=_headers())
    assert r.status_code == 200
    ids, dismissed = _saved_ids(hermetic)
    assert sorted(ids) == ["11", "12"]
    assert not dismissed


def test_re_adding_a_manager_by_saving_the_list_removes_him_from_the_dismissed(hermetic):
    _registry_with_team(hermetic, dismissed=["12"])
    both = [{"id": "11", "name": "Анна Один", "role": "Менеджер ОП", "capacity": 40},
            {"id": "12", "name": "Борис Два", "role": "Менеджер ОП", "capacity": 40}]
    client.post("/api/v1/settings", json={"tenant_id": TENANT, "managers": both}, headers=_headers())
    _ids, dismissed = _saved_ids(hermetic)
    assert not dismissed
