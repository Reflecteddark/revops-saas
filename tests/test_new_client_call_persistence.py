"""
A brand-new client's calls must reach the cabinet DB without any manual setup.
Found in the 2026-11-02 e2e run: /calls/ingest assumed a workspace named `ws_<tenant>`; provisioning never
created one, so the deal insert hit a FK violation, the whole call was rolled back and the API still
answered 200 — n8n marked the call done and it was lost for the cabinet.
"""

import sys
import uuid
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import SQLAlchemyError
from starlette.testclient import TestClient

from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
from packages.database.models import CallRecording, Deal, SubscriptionTier, Tenant, Workspace
from packages.database.session import SessionLocal

client = TestClient(app, client=("172.16.0.5", 50000))  # internal network, like n8n
ADMIN = {"x-admin-key": next(iter(ALLOWED_ADMIN_KEYS))}


def _payload(tenant, call_id, deal_id=None):
    return {"id": call_id, "tenant_id": tenant, "deal_id": deal_id or f"D-{call_id}", "duration_sec": 95, "score": 9,
            "cr": [1] * 9 + [0] * 4, "transcript": "t", "sync_to_sheets": False}


def _cleanup(tid):
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == tid).delete()
        db.query(Deal).filter(Deal.tenant_id == tid).delete()
        db.query(Workspace).filter(Workspace.tenant_id == tid).delete()
        db.query(Tenant).filter(Tenant.id == tid).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def tid():
    t = f"TNT-NEWC-{uuid.uuid4().hex[:6].upper()}"
    yield t
    _cleanup(t)


def test_first_call_of_new_client_is_persisted_and_workspace_created(tid, monkeypatch):
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda t: {"tenant_id": t, "crm_type": "amocrm"})
    res = client.post("/api/v1/calls/ingest", json=_payload(tid, f"{tid}-c1"), headers=ADMIN)
    assert res.status_code == 200, res.text[:300]

    db = SessionLocal()
    try:
        assert db.query(CallRecording).filter(CallRecording.tenant_id == tid).count() == 1
        ws = db.query(Workspace).filter(Workspace.tenant_id == tid).all()
        assert len(ws) == 1
        deal = db.query(Deal).filter(Deal.tenant_id == tid).one()
        assert deal.workspace_id == ws[0].id
        # crm_source comes from the tenant's CRM, not from a hardcoded tenant id
        assert deal.crm_source == "amocrm"
    finally:
        db.close()


def test_existing_workspace_with_any_id_is_reused(tid, monkeypatch):
    """Tenants created via /auth/register get a UUID workspace id, not ws_<tenant>."""
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda t: {"tenant_id": t, "crm_type": "bitrix24"})
    db = SessionLocal()
    try:
        db.add(Tenant(id=tid, name=tid, slug=tid.lower(), tier=SubscriptionTier.PRO))
        db.flush()
        ws = Workspace(tenant_id=tid, name="Основной отдел")  # uuid id
        db.add(ws)
        db.commit()
        ws_id = ws.id
    finally:
        db.close()

    res = client.post("/api/v1/calls/ingest", json=_payload(tid, f"{tid}-c2"), headers=ADMIN)
    assert res.status_code == 200, res.text[:300]
    db = SessionLocal()
    try:
        assert db.query(Workspace).filter(Workspace.tenant_id == tid).count() == 1
        assert db.query(Deal).filter(Deal.tenant_id == tid).one().workspace_id == ws_id
        assert db.query(Deal).filter(Deal.tenant_id == tid).one().crm_source == "bitrix24"
    finally:
        db.close()


def test_same_crm_deal_number_in_two_tenants(tid, monkeypatch):
    """Two clients' CRMs may both have deal #1001; the second client's call must still be stored."""
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda t: {"tenant_id": t, "crm_type": "bitrix24"})
    other = f"{tid}-OTHER"
    try:
        r1 = client.post("/api/v1/calls/ingest", json=_payload(other, f"{other}-c", deal_id="1001"), headers=ADMIN)
        r2 = client.post("/api/v1/calls/ingest", json=_payload(tid, f"{tid}-c", deal_id="1001"), headers=ADMIN)
        assert r1.status_code == 200 and r2.status_code == 200, (r1.text[:200], r2.text[:200])
        db = SessionLocal()
        try:
            d_other = db.query(Deal).filter(Deal.tenant_id == other).one()
            d_mine = db.query(Deal).filter(Deal.tenant_id == tid).one()
            assert d_other.id != d_mine.id
            assert d_other.external_crm_id == d_mine.external_crm_id == "1001"
            assert db.query(CallRecording).filter(CallRecording.tenant_id == tid).one().deal_id == d_mine.id
        finally:
            db.close()
        # a second call for the same CRM deal reuses the client's own deal
        r3 = client.post("/api/v1/calls/ingest", json=_payload(tid, f"{tid}-c-2", deal_id="1001"), headers=ADMIN)
        assert r3.status_code == 200
        db = SessionLocal()
        try:
            assert db.query(Deal).filter(Deal.tenant_id == tid).count() == 1
        finally:
            db.close()
    finally:
        _cleanup(other)


def test_persistence_failure_is_not_reported_as_success(tid, monkeypatch):
    def boom(*a, **k):
        raise SQLAlchemyError("simulated DB failure")

    monkeypatch.setattr(calls_router, "get_or_create_workspace", boom)
    res = client.post("/api/v1/calls/ingest", json=_payload(tid, f"{tid}-c3"), headers=ADMIN)
    assert res.status_code >= 500
    db = SessionLocal()
    try:
        assert db.query(CallRecording).filter(CallRecording.tenant_id == tid).count() == 0
    finally:
        db.close()


def test_ingest_requires_explicit_tenant_id():
    body = _payload("X", "no-tenant-call")
    body.pop("tenant_id")
    res = client.post("/api/v1/calls/ingest", json=body, headers=ADMIN)
    assert res.status_code == 422


def test_provisioning_creates_workspace(tid, monkeypatch):
    # The provisioner is mocked, so the real registry/client-file writes must be mocked too:
    # saving the mocked (empty) registry used to wipe the registry cache for every later test.
    from apps.api.routers import admin_router
    monkeypatch.setattr(admin_router, "sync_save_registry", lambda data: True)
    monkeypatch.setattr(admin_router, "save_registered_clients", lambda clients: None)
    mock_module = MagicMock()
    mock_module.provision_tenant.return_value = {"tenant_id": tid, "tenant_name": "Новый клиент", "crm_type": "amocrm",
                                                 "spreadsheet_id": "sheet-x"}
    mock_module.load_registry.return_value = {"tenants": []}
    with patch.dict(sys.modules, {"tenant_provisioner": mock_module, "apps.api.tenant_provisioner": mock_module}):
        res = client.post("/api/v1/admin/tenants/provision",
                          json={"name": "Новый клиент", "crm_type": "amocrm", "password": "Strong-Pass-123"},
                          headers=ADMIN)
    assert res.status_code == 200, res.text[:300]
    db = SessionLocal()
    try:
        assert db.query(Workspace).filter(Workspace.tenant_id == tid).count() == 1
    finally:
        db.close()
