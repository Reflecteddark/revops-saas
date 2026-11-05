"""
A real client who has not filled something in must see an empty field, never a value somebody invented:
the Telegram chats -1001234567890 / -1009876543210 / -1005554443332 and the demo period 2026-10-01..31 with the
project start 2026-10-03 belong to the shared demo template only.
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
TENANT = "TNT-NI1"
INVENTED_CHATS = {"-1001234567890", "-1009876543210", "-1005554443332"}
client = TestClient(app)


class FakeWorksheet:
    def __init__(self):
        self.rows = [["", ""] for _ in range(60)]
        self.rows[2] = ["Организация", "ООО Тест"]
        # the same labels as in the sheet template: the code reads by label and writes to B54:B56
        self.rows[53] = ["ROP_CHAT_ID", ""]
        self.rows[54] = ["CEO_CHAT_ID", ""]
        self.rows[55] = ["TEAM_CHAT_ID", ""]
        self.writes = []

    def get_all_values(self):
        return self.rows

    def update_acell(self, cell, value):
        self.writes.append((cell, value))
        self.rows[int(cell[1:]) - 1][1] = value

    def update(self, **kwargs):
        self.writes.append(("range", kwargs.get("range_name")))


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


def _chats(settings):
    t = settings["telegram"]
    return {t.get("rop_chat_id"), t.get("ceo_chat_id"), t.get("team_chat_id")}


def test_a_client_without_a_sheet_sees_no_invented_chats_or_dates(monkeypatch):
    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: None)
    s = client.get("/api/v1/settings", headers=_headers()).json()
    assert not (_chats(s) & INVENTED_CHATS)
    assert _chats(s) == {""}
    assert s["general"]["period_start"] == ""
    assert s["general"]["period_end"] == ""
    assert s["general"]["project_start_date"] == ""
    assert s["general"]["monthly_target"] == 0


def test_a_client_with_an_empty_sheet_sees_no_invented_chats(sheet):
    s = client.get("/api/v1/settings", headers=_headers()).json()
    assert not (_chats(s) & INVENTED_CHATS)
    assert _chats(s) == {""}
    assert s["general"]["period_start"] == ""
    assert s["general"]["project_start_date"] == ""


def test_the_sample_chats_of_the_sheet_template_are_not_shown_as_real(sheet):
    sheet.rows[53][1], sheet.rows[54][1], sheet.rows[55][1] = sorted(INVENTED_CHATS)
    s = client.get("/api/v1/settings", headers=_headers()).json()
    assert _chats(s) == {""}


def test_the_chats_a_client_typed_are_shown_back(sheet):
    r = client.post(
        "/api/v1/settings",
        json={"tenant_id": TENANT, "telegram": {"rop_chat_id": "-100777", "ceo_chat_id": "-100888", "team_chat_id": "-100999"}},
        headers=_headers(),
    )
    assert r.status_code == 200
    s = client.get("/api/v1/settings", headers=_headers()).json()
    assert _chats(s) == {"-100777", "-100888", "-100999"}


def test_saving_telegram_without_chats_writes_no_invented_chat_to_the_sheet(sheet):
    r = client.post(
        "/api/v1/settings", json={"tenant_id": TENANT, "telegram": {"dispatcher_status": True}}, headers=_headers()
    )
    assert r.status_code == 200
    written = [value for cell, value in sheet.writes if cell in ("B54", "B55", "B56")]
    assert written == []
