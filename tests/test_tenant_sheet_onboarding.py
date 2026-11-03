"""
New-client onboarding: a client gets only its own, checked Google Sheet — never the shared master template.
Found 2026-11-03: without sheet_id the provisioner assigned the clean template 1jBBot… (every such client wrote into the
one sheet all clients are copied from), and a pasted ID was never checked for the bots' access.
"""

import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException
from starlette.testclient import TestClient

from apps.api import tenant_provisioner
from apps.api.main import app
from apps.api.routers import admin_router
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
from apps.api.services import tenant_sheet
from apps.api.tenant_registry import CLEAN_TEMPLATE_ID, load_tenants_registry

client = TestClient(app)
ADMIN = {"x-admin-key": next(iter(ALLOWED_ADMIN_KEYS))}
SHEET = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-xyz"
API_BOT, N8N_BOT = "sheets-agent@x.iam.gserviceaccount.com", "n8n-bot@y.iam.gserviceaccount.com"


class _Resp:
    def __init__(self, status, body=None):
        self.status_code, self._body = status, body or {}

    def json(self):
        return self._body


def _fake_google(monkeypatch, sheets_status=200, titles=("raw_calls", "raw_deals", "⚙️ Настройки"),
                 editors=(API_BOT, N8N_BOT)):
    session = MagicMock()

    def get(url, params=None, timeout=None):
        if "sheets.googleapis.com" in url:
            return _Resp(sheets_status, {"sheets": [{"properties": {"title": t}} for t in titles]})
        perms = [{"emailAddress": "owner@gmail.com", "role": "owner"}] + [{"emailAddress": e, "role": "writer"} for e in editors]
        return _Resp(200, {"permissions": perms})

    session.get.side_effect = get
    monkeypatch.setattr(tenant_sheet, "_session_and_bots", lambda: (session, [API_BOT, N8N_BOT], []))


def test_normalize_accepts_link_or_id():
    assert tenant_sheet.normalize_sheet_id(f"https://docs.google.com/spreadsheets/d/{SHEET}/edit#gid=0") == SHEET
    assert tenant_sheet.normalize_sheet_id(f"  {SHEET} ") == SHEET
    assert tenant_sheet.normalize_sheet_id(None) == ""


def test_master_template_is_rejected_without_calling_google(monkeypatch):
    monkeypatch.setattr(tenant_sheet, "_session_and_bots", lambda: pytest.fail("must not call Google"))
    assert "мастер-шаблон" in tenant_sheet.check_tenant_sheet(CLEAN_TEMPLATE_ID)[0]


def test_ready_copy_passes(monkeypatch):
    _fake_google(monkeypatch)
    assert tenant_sheet.check_tenant_sheet(SHEET) == []


def test_sheet_not_shared_with_api_bot(monkeypatch):
    _fake_google(monkeypatch, sheets_status=403)
    [problem] = tenant_sheet.check_tenant_sheet(SHEET)
    assert API_BOT in problem and N8N_BOT in problem


def test_copy_shared_only_with_api_bot_names_the_n8n_bot(monkeypatch):
    _fake_google(monkeypatch, editors=(API_BOT,))
    assert tenant_sheet.check_tenant_sheet(SHEET) == [f"Дайте доступ «Редактор» для {N8N_BOT}"]


def test_not_a_revops_template_copy(monkeypatch):
    _fake_google(monkeypatch, titles=("Лист1",))
    assert len(tenant_sheet.check_tenant_sheet(SHEET)) == 3


def test_provisioner_never_assigns_the_template(monkeypatch):
    saved = {}
    monkeypatch.setattr(tenant_provisioner, "load_tenants_registry", lambda: {"tenants": []})
    monkeypatch.setattr(tenant_provisioner, "save_tenants_registry", lambda reg: saved.update(reg) or True)
    rec = tenant_provisioner.provision_tenant(company_name="Без таблицы", crm_type="amocrm")
    assert rec["spreadsheet_id"] == ""
    assert saved["tenants"][0]["spreadsheet_id"] == ""


def _provision(payload, check):
    mock_module = MagicMock()
    mock_module.provision_tenant.return_value = {"tenant_id": "TNT-777", "tenant_name": "X", "crm_type": "amocrm",
                                                 "spreadsheet_id": SHEET}
    mock_module.load_registry.return_value = {"tenants": []}
    with patch.dict(sys.modules, {"tenant_provisioner": mock_module, "apps.api.tenant_provisioner": mock_module}), \
            patch.object(tenant_sheet, "check_tenant_sheet", check), \
            patch.object(admin_router, "sync_save_registry", lambda data: True), \
            patch.object(admin_router, "save_registered_clients", lambda clients: None):
        res = client.post("/api/v1/admin/tenants/provision", json=payload, headers=ADMIN)
    return res, mock_module


def test_provision_rejects_unshared_sheet_before_creating_anything():
    res, mod = _provision({"name": "Клиент", "crm_type": "amocrm", "sheet_id": SHEET},
                          lambda sid: [f"Дайте доступ «Редактор» для {N8N_BOT}"])
    assert res.status_code == 400 and N8N_BOT in res.json()["detail"]
    mod.provision_tenant.assert_not_called()


def test_provision_with_link_stores_the_checked_id():
    checked = []
    res, mod = _provision({"name": "Клиент", "crm_type": "amocrm", "sheet_id": f"https://docs.google.com/spreadsheets/d/{SHEET}/edit"},
                          lambda sid: checked.append(sid) or [])
    assert res.status_code == 200, res.text[:300]
    assert checked == [SHEET]
    assert mod.provision_tenant.call_args.kwargs["sheet_id"] == SHEET


def test_update_with_bad_sheet_changes_nothing():
    tenant = next(t for t in load_tenants_registry()["tenants"] if t.get("tenant_id"))
    before = dict(tenant)
    with patch.object(tenant_sheet, "check_tenant_sheet", lambda sid: ["Это мастер-шаблон"]):
        res = client.put(f"/api/v1/admin/tenants/{tenant['tenant_id']}", headers=ADMIN,
                         json={"tenant_name": "ПЕРЕИМЕНОВАН", "spreadsheet_id": CLEAN_TEMPLATE_ID})
    assert res.status_code == 400
    after = next(t for t in load_tenants_registry()["tenants"] if t.get("tenant_id") == tenant["tenant_id"])
    assert after.get("tenant_name") == before.get("tenant_name")
    assert after.get("spreadsheet_id") == before.get("spreadsheet_id")


def test_sheets_sync_never_falls_back_to_the_template():
    from apps.api.routers.sheets_sync_router import _get_spreadsheet_id

    with pytest.raises(HTTPException) as exc:
        _get_spreadsheet_id("TNT-NO-SHEET-999")
    assert exc.value.status_code == 404
