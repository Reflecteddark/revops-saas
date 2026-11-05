"""
POST /settings must tell the truth:
- the answer carries the value that was just saved (the cache used to be refreshed BEFORE the sheet write);
- a failed Google Sheet write is "partial_ok" with an honest message, not "saved to the Google Sheet";
- a failed save of the cabinet's own copy is an error, not "ok".
No real Google Sheet is touched: gspread is replaced by a fake.
"""

import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api import tenant_registry
from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import settings_router
from packages.database.models import Tenant
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
TENANT = "TNT-HS1"
client = TestClient(app)


class FakeWorksheet:
    def __init__(self):
        self.rows = [["", ""] for _ in range(30)]
        self.rows[2] = ["Организация", "Старая"]
        self.rows[8] = ["План выручки", "1 000 000 ₽"]
        self.fail_writes = False

    def get_all_values(self):
        return self.rows

    def update_acell(self, cell, value):
        if self.fail_writes:
            raise RuntimeError("429 quota exceeded")
        self.rows[int(cell[1:]) - 1][1] = value

    def update(self, **kwargs):
        if self.fail_writes:
            raise RuntimeError("429 quota exceeded")


class FakeSpreadsheet:
    def __init__(self, ws):
        self.ws = ws

    def worksheet(self, name):
        if "Настройки" in name:
            return self.ws
        raise RuntimeError("no such sheet")


def _forget_caches():
    tenant_registry._REGISTRY_CACHE["data"] = None
    tenant_registry._REGISTRY_CACHE["timestamp"] = 0
    settings_router._SETTINGS_CACHE.clear()


def _headers():
    token = create_access_token({"sub": f"c-{uuid.uuid4().hex[:6]}@x.test", "tenant_id": TENANT, "role": "РОП"})
    return {**EXTERNAL, "Authorization": "Bearer " + token}


@pytest.fixture
def sheet(monkeypatch):
    import gspread

    ws = FakeWorksheet()

    class FakeClient:
        def open_by_key(self, key):
            return FakeSpreadsheet(ws)

    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: Path("fake.json"))
    monkeypatch.setattr(settings_router, "get_tenant_spreadsheet_id", lambda tenant: "SHEET")
    monkeypatch.setattr(gspread, "service_account", lambda path: FakeClient())
    return ws


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


def _save_plan(value):
    return client.post("/api/v1/settings", json={"tenant_id": TENANT, "general": {"monthly_target": value}}, headers=_headers())


def test_the_answer_and_the_next_read_carry_the_value_just_saved(sheet):
    r = _save_plan(7000000)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["settings"]["general"]["monthly_target"] == 7000000
    assert sheet.rows[8][1] == "7 000 000 ₽"
    assert client.get("/api/v1/settings", headers=_headers()).json()["general"]["monthly_target"] == 7000000


def test_a_failed_sheet_write_is_partial_ok_with_an_honest_message(sheet):
    sheet.fail_writes = True
    r = _save_plan(9000000)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "partial_ok"
    assert "не удалось" in body["message"]
    assert "в Google Таблице" not in body["message"]


def test_a_client_without_a_sheet_is_a_plain_ok(monkeypatch):
    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: None)
    r = _save_plan(3000000)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_a_failed_save_of_the_cabinets_own_copy_is_an_error(monkeypatch, sheet):
    monkeypatch.setattr("apps.api.tenant_registry.save_tenants_registry", lambda *a, **k: False)
    r = _save_plan(5000000)
    assert r.status_code == 500
    assert sheet.rows[8][1] == "1 000 000 ₽"  # nothing was copied to the sheet either
