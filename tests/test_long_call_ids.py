"""
CRM call ids longer than call_recordings.id (VARCHAR 36) must still reach the cabinet.
Found in the 2026-11-03 Bitrix e2e: an external-telephony call id 'externalCall.<32 hex>.<ts>' (57 chars) failed the
INSERT with StringDataRightTruncation, /calls/ingest answered 500 and the audited call never reached the cabinet.
"""

import uuid

import pytest
from starlette.testclient import TestClient

from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
from packages.database.models import CallProcessingClaim, CallRecording, Deal, Tenant, Workspace
from packages.database.session import SessionLocal

client = TestClient(app, client=("172.16.0.5", 50000))  # internal network, like n8n
ADMIN = {"x-admin-key": next(iter(ALLOWED_ADMIN_KEYS))}


def _payload(tenant, call_id, score=7):
    return {"id": call_id, "tenant_id": tenant, "deal_id": "B24-1", "duration_sec": 110, "score": score,
            "cr": [1] * 7 + [0] * 6, "transcript": "t", "sync_to_sheets": False}


@pytest.fixture
def tids(monkeypatch):
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda t: {"tenant_id": t, "crm_type": "bitrix24"})
    made = [f"TNT-LID{uuid.uuid4().hex[:6].upper()}" for _ in range(2)]
    yield made
    db = SessionLocal()
    try:
        for t in made:
            db.query(CallProcessingClaim).filter(CallProcessingClaim.tenant_id == t).delete()
            db.query(CallRecording).filter(CallRecording.tenant_id == t).delete()
            db.query(Deal).filter(Deal.tenant_id == t).delete()
            db.query(Workspace).filter(Workspace.tenant_id == t).delete()
            db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _calls(tenant):
    db = SessionLocal()
    try:
        return [(c.id, c.external_call_id, c.overall_score)
                for c in db.query(CallRecording).filter(CallRecording.tenant_id == tenant).all()]
    finally:
        db.close()


def test_long_bitrix_call_id_is_persisted_and_updated_in_place(tids):
    tid = tids[0]
    long_id = "externalCall." + uuid.uuid4().hex + ".1793708511"
    assert len(long_id) > 36

    res = client.post("/api/v1/calls/ingest", json=_payload(tid, long_id), headers=ADMIN)
    assert res.status_code == 200, res.text[:300]
    rows = _calls(tid)
    assert len(rows) == 1
    pk, ext, _ = rows[0]
    assert len(pk) <= 36 and ext == long_id

    # A re-delivery of the same CRM call updates the same row (found by external_call_id), no duplicate.
    res = client.post("/api/v1/calls/ingest", json=_payload(tid, long_id, score=11), headers=ADMIN)
    assert res.status_code == 200, res.text[:300]
    assert _calls(tid) == [(pk, long_id, 11.0)]


def test_same_short_call_id_in_two_clients_does_not_collide(tids):
    a, b = tids
    short_id = "CALL-" + uuid.uuid4().hex[:8]
    for t in (a, b):
        res = client.post("/api/v1/calls/ingest", json=_payload(t, short_id), headers=ADMIN)
        assert res.status_code == 200, res.text[:300]
    (pk_a, ext_a, _), = _calls(a)
    (pk_b, ext_b, _), = _calls(b)
    assert ext_a == ext_b == short_id and pk_a != pk_b
