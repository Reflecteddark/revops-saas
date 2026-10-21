"""
Idempotency and Deduplication Test Suite:
1. Replay/Retry of Celery process_call_audio_task with same call_id -> exactly 1 record in DB (UPSERT).
2. Unique constraint on (tenant_id, external_crm_id) for Deals -> raises IntegrityError on duplicates.
3. Multi-tenant isolation: identical external_crm_id across different tenants succeeds.
"""

import uuid
import pytest
from sqlalchemy.exc import IntegrityError

from packages.database.models import CallRecording, Deal, Tenant, Workspace
from packages.database.session import SessionLocal, init_db
from workers.tasks import process_call_audio_task


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()


def test_call_task_idempotency_replay():
    """1. Calling process_call_audio_task twice with the same call_data yields exactly 1 record in DB."""
    unique_call_id = f"test_idemp_call_{uuid.uuid4().hex[:10]}"
    call_payload = {
        "id": unique_call_id,
        "external_call_id": unique_call_id,
        "deal_id": "D-IDEMP-1",
        "client": "ООО Идемпотентность",
        "manager": "Анна Сидорова",
        "duration_sec": 120,
        "score": 10,
        "next_step": 1,
        "cr": [1] * 13,
        "transcript": "Тест повторного вызова воркера",
        "sync_to_sheets": False
    }

    # First execution
    res1 = process_call_audio_task(call_payload, org_id="TNT-001")
    assert res1["status"] == "completed"

    # Second execution (re-try / re-play with updated score)
    call_payload_updated = dict(call_payload)
    call_payload_updated["score"] = 12
    res2 = process_call_audio_task(call_payload_updated, org_id="TNT-001")
    assert res2["status"] == "completed"

    # Verify database state: exactly 1 record with updated score
    db = SessionLocal()
    calls = []
    try:
        calls = db.query(CallRecording).filter(
            CallRecording.tenant_id == "TNT-001",
            CallRecording.external_call_id == unique_call_id
        ).all()
        assert len(calls) == 1, f"Expected exactly 1 call record, but found {len(calls)}"
        assert calls[0].overall_score == 12.0
    finally:
        for c in calls:
            db.delete(c)
        db.commit()
        db.close()


def test_duplicate_external_crm_id_same_tenant_raises_integrity_error():
    """2. Inserting two deals with identical external_crm_id for the same tenant must raise IntegrityError."""
    db = SessionLocal()
    tenant_id = f"tnt-{uuid.uuid4().hex[:8]}"
    ws_id = f"ws-{uuid.uuid4().hex[:8]}"
    crm_id = f"CRM-DUP-{uuid.uuid4().hex[:8]}"
    try:
        t = Tenant(id=tenant_id, name="Test Tenant", slug=f"slug-{uuid.uuid4().hex[:8]}")
        ws = Workspace(id=ws_id, tenant_id=tenant_id, name="Test WS")
        db.add(t)
        db.add(ws)
        db.commit()

        d1 = Deal(
            id=f"d1-{uuid.uuid4().hex[:8]}",
            tenant_id=tenant_id,
            workspace_id=ws_id,
            title="Deal 1 Initial",
            external_crm_id=crm_id
        )
        db.add(d1)
        db.commit()

        d2 = Deal(
            id=f"d2-{uuid.uuid4().hex[:8]}",
            tenant_id=tenant_id,
            workspace_id=ws_id,
            title="Deal 2 Duplicate",
            external_crm_id=crm_id
        )
        db.add(d2)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    finally:
        db.query(Deal).filter(Deal.tenant_id == tenant_id).delete()
        db.query(Workspace).filter(Workspace.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
        db.close()


def test_same_external_crm_id_different_tenants_succeeds():
    """3. Inserting two deals with identical external_crm_id for DIFFERENT tenants must succeed."""
    db = SessionLocal()
    t1_id = f"tnt1-{uuid.uuid4().hex[:8]}"
    t2_id = f"tnt2-{uuid.uuid4().hex[:8]}"
    ws1_id = f"ws1-{uuid.uuid4().hex[:8]}"
    ws2_id = f"ws2-{uuid.uuid4().hex[:8]}"
    shared_crm_id = f"CRM-SHARED-{uuid.uuid4().hex[:8]}"
    try:
        t1 = Tenant(id=t1_id, name="Tenant 1", slug=f"slug-{uuid.uuid4().hex[:8]}")
        t2 = Tenant(id=t2_id, name="Tenant 2", slug=f"slug-{uuid.uuid4().hex[:8]}")
        ws1 = Workspace(id=ws1_id, tenant_id=t1_id, name="WS 1")
        ws2 = Workspace(id=ws2_id, tenant_id=t2_id, name="WS 2")
        db.add_all([t1, t2, ws1, ws2])
        db.commit()

        d1 = Deal(
            id=f"d1-{uuid.uuid4().hex[:8]}",
            tenant_id=t1_id,
            workspace_id=ws1_id,
            title="Tenant 1 Deal",
            external_crm_id=shared_crm_id
        )
        d2 = Deal(
            id=f"d2-{uuid.uuid4().hex[:8]}",
            tenant_id=t2_id,
            workspace_id=ws2_id,
            title="Tenant 2 Deal",
            external_crm_id=shared_crm_id
        )
        db.add(d1)
        db.add(d2)
        db.commit()

        deals_t1 = db.query(Deal).filter(Deal.tenant_id == t1_id, Deal.external_crm_id == shared_crm_id).all()
        deals_t2 = db.query(Deal).filter(Deal.tenant_id == t2_id, Deal.external_crm_id == shared_crm_id).all()
        assert len(deals_t1) == 1
        assert len(deals_t2) == 1
    finally:
        for tid in [t1_id, t2_id]:
            db.query(Deal).filter(Deal.tenant_id == tid).delete()
            db.query(Workspace).filter(Workspace.tenant_id == tid).delete()
            db.query(Tenant).filter(Tenant.id == tid).delete()
        db.commit()
        db.close()
