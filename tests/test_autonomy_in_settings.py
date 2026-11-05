"""
The cabinet reads the autonomy switches from GET /settings, but PATCH /settings/autonomy stores them in the policy
registry (the one the AI engine obeys). /settings used to answer all-false (or without the key at all), and its
15-second cache survived the PATCH, so the switch jumped back right after it was flipped.
"""

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api import tenant_registry
from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import settings_router
from packages.antidrift.contracts.policy_config import TenantPolicyRegistry
from packages.database.models import Tenant
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
TENANT = "TNT-AU1"
client = TestClient(app)


class FakeWorksheet:
    def get_all_values(self):
        return [["Организация", "ООО Тест"]]


class FakeSpreadsheet:
    def worksheet(self, name):
        if "Настройки" in name:
            return FakeWorksheet()
        raise RuntimeError("no such sheet")


def _forget_caches():
    tenant_registry._REGISTRY_CACHE["data"] = None
    tenant_registry._REGISTRY_CACHE["timestamp"] = 0
    settings_router._SETTINGS_CACHE.clear()
    TenantPolicyRegistry._configs.pop(TENANT, None)


def _headers():
    token = create_access_token({"sub": f"c-{uuid.uuid4().hex[:6]}@x.test", "tenant_id": TENANT, "role": "РОП"})
    return {**EXTERNAL, "Authorization": "Bearer " + token}


@pytest.fixture(autouse=True)
def tenant():
    registry_path = Path(tenant_registry.get_tenants_registry_path())
    original = registry_path.read_text(encoding="utf-8")
    db = SessionLocal()
    try:
        if not db.query(Tenant).filter(Tenant.id == TENANT).first():
            db.add(Tenant(id=TENANT, name=TENANT, slug=TENANT.lower(), settings={"crm_type": "amocrm"}))
            db.commit()
    finally:
        db.close()
    _forget_caches()
    yield
    registry_path.write_text(original, encoding="utf-8")
    db = SessionLocal()
    try:
        db.query(Tenant).filter(Tenant.id == TENANT).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
    _forget_caches()


@pytest.fixture
def with_sheet(monkeypatch):
    import gspread

    class FakeClient:
        def open_by_key(self, key):
            return FakeSpreadsheet()

    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: Path("fake.json"))
    monkeypatch.setattr(settings_router, "get_tenant_spreadsheet_id", lambda tenant: "SHEET")
    monkeypatch.setattr(gspread, "service_account", lambda path: FakeClient())


@pytest.fixture
def without_sheet(monkeypatch):
    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: None)


def _autonomy_in_settings():
    return client.get("/api/v1/settings", headers=_headers()).json()["autonomy"]


def _flip(**flags):
    r = client.patch(f"/api/v1/settings/autonomy?tenant_id={TENANT}", json=flags, headers=_headers())
    assert r.status_code == 200


@pytest.mark.parametrize("sheet_fixture", ["with_sheet", "without_sheet"])
def test_settings_show_the_autonomy_that_was_just_switched(request, sheet_fixture):
    request.getfixturevalue(sheet_fixture)
    assert _autonomy_in_settings()["allow_crm_mutations"] is False  # also fills the 15 s cache

    _flip(allow_crm_mutations=True, allow_client_communication=True)
    shown = _autonomy_in_settings()
    assert shown["allow_crm_mutations"] is True
    assert shown["allow_client_communication"] is True
    assert shown["enable_telegram_notifications"] is False

    _flip(allow_crm_mutations=False, allow_client_communication=False)
    assert _autonomy_in_settings() == {
        "allow_crm_mutations": False, "enable_telegram_notifications": False, "allow_client_communication": False,
    }


def test_a_new_tenant_is_passive_by_default(without_sheet):
    assert _autonomy_in_settings() == {
        "allow_crm_mutations": False, "enable_telegram_notifications": False, "allow_client_communication": False,
    }
