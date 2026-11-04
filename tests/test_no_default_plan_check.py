"""
No invented plan / average check / company data, anywhere on the way to the client's Google Sheet.

Found on the TNT-004 screenshots: the plan showed 5 000 000 although the registry had none. Causes:
- GeneralSettings carried defaults ("Самозанятый", RUB, October 2026, plan 5 000 000) that were WRITTEN to the
  sheet whenever a partial general save happened (admin form, "save average check", ...).
- the admin forms pre-filled and submitted 150 000 / 5 000 000.
"""

from pathlib import Path

import gspread

from apps.api import tenant_registry
from apps.api.routers import settings_router
from apps.api.routers.admin_router import TenantProvisionRequest
from apps.api.routers.settings_router import GeneralSettings, SettingsPayload, save_settings_to_sheets
from apps.api.tenant_provisioner import provision_tenant


class _FakeWorksheet:
    def __init__(self):
        self.cells: dict[str, str] = {}

    def update_acell(self, cell, value):
        self.cells[cell] = value

    def update(self, *a, **k):  # stages / managers / etc. are not part of these tests
        raise AssertionError("unexpected range update")


class _FakeSpreadsheet:
    def __init__(self, ws):
        self.ws = ws

    def worksheet(self, name):
        return self.ws


class _FakeGc:
    def __init__(self, ws):
        self.ws = ws

    def open_by_key(self, key):
        return _FakeSpreadsheet(self.ws)


def _wire(monkeypatch):
    ws = _FakeWorksheet()
    monkeypatch.setattr(tenant_registry, "load_tenants_registry", lambda: {"tenants": [{"tenant_id": "TNT-NODEF"}]})
    monkeypatch.setattr(tenant_registry, "save_tenants_registry", lambda data, *a, **k: True)
    monkeypatch.setattr(settings_router, "fetch_settings_from_sheets", lambda *a, **k: {})
    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: Path("service_account.json"))
    monkeypatch.setattr(settings_router, "get_tenant_spreadsheet_id", lambda tid: "sheet-id")
    monkeypatch.setattr(gspread, "service_account", lambda path: _FakeGc(ws))
    return ws


def test_general_settings_has_no_invented_defaults():
    g = GeneralSettings()
    assert g.model_dump() == {
        "company_name": None,
        "currency": None,
        "period_start": None,
        "period_end": None,
        "monthly_target": None,
        "project_start_date": None,
        "avg_deal_check": None,
    }
    assert g.model_fields_set == set()


def test_saving_only_the_average_check_writes_nothing_to_the_sheet(monkeypatch):
    ws = _wire(monkeypatch)

    save_settings_to_sheets(SettingsPayload(tenant_id="TNT-NODEF", general=GeneralSettings(avg_deal_check=90000)))

    assert ws.cells == {}  # no company name, currency, period or plan was invented


def test_only_the_sent_plan_is_written_to_the_sheet(monkeypatch):
    ws = _wire(monkeypatch)

    save_settings_to_sheets(SettingsPayload(tenant_id="TNT-NODEF", general=GeneralSettings(monthly_target=3000000)))

    assert set(ws.cells) == {"B9"}  # the plan only; company, currency and period untouched
    assert "3 000 000" in ws.cells["B9"]


def test_creating_a_client_assumes_no_average_check(monkeypatch):
    assert TenantProvisionRequest(name="ООО Клиент").avg_deal_check is None

    from apps.api import tenant_provisioner

    monkeypatch.setattr(tenant_provisioner, "load_tenants_registry", lambda: {"tenants": []})
    monkeypatch.setattr(tenant_provisioner, "save_tenants_registry", lambda data, *a, **k: True)
    record = provision_tenant(company_name="ООО Клиент")
    assert record["avg_deal_check"] is None
