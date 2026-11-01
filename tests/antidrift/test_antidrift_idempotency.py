"""
tests/antidrift/test_antidrift_idempotency.py

Tests for IdempotencyManager: key determinism and database deduplication.
Zero hardcoding: dynamic tenant IDs per scenario.
"""

import uuid
from packages.antidrift.barrier.idempotency import IdempotencyManager
from packages.database.session import Base
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def test_deterministic_key_generation():
    dynamic_tenant = f"tenant_{uuid.uuid4().hex[:8]}"
    k1 = IdempotencyManager.generate_key(
        tenant_id=dynamic_tenant,
        source_event_id="msg-999",
        action_type="crm_update_stage",
        target_id="deal-123",
        payload={"stage": "Квалификация", "step": 1},
    )
    # Order of keys in payload dict shouldn't change hash
    k2 = IdempotencyManager.generate_key(
        tenant_id=dynamic_tenant,
        source_event_id="msg-999",
        action_type="crm_update_stage",
        target_id="deal-123",
        payload={"step": 1, "stage": "Квалификация"},
    )
    assert k1 == k2
    assert len(k1) == 64  # SHA256 hex


def test_db_idempotency_reservation_and_deduplication():
    dynamic_tenant = f"tenant_{uuid.uuid4().hex[:8]}"
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    db = TestingSession()

    key = IdempotencyManager.generate_key(
        tenant_id=dynamic_tenant,
        source_event_id="evt-1",
        action_type="crm_create_task",
        target_id="deal-500",
        payload={"task": "Call"},
    )

    # First call: should be reserved (is_new == True)
    is_new, record = IdempotencyManager.check_or_reserve_db(
        db=db,
        idempotency_key=key,
        tenant_id=dynamic_tenant,
        action_type="crm_create_task",
        source_event_id="evt-1",
        payload={"task": "Call"},
    )
    assert is_new is True
    assert record.status == "PROCESSING"

    # Second call with the same key: should be detected as DUPLICATE (is_new == False)
    is_new_2, record_2 = IdempotencyManager.check_or_reserve_db(
        db=db,
        idempotency_key=key,
        tenant_id=dynamic_tenant,
        action_type="crm_create_task",
        source_event_id="evt-1",
        payload={"task": "Call"},
    )
    assert is_new_2 is False
    assert record_2.idempotency_key == key

    # Mark completed
    IdempotencyManager.mark_completed_db(db, key, action_execution_id="exec-123")
    assert record_2.status == "COMPLETED"
    assert record_2.related_action_execution_id == "exec-123"

    db.close()
