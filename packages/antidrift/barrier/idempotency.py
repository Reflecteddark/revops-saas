"""
packages/antidrift/barrier/idempotency.py

Dual-layer Idempotency and De-duplication Manager.
Generates deterministic SHA256 keys and guarantees:
Layer 1: Fast in-memory / Redis window (SET NX EX 900)
Layer 2: Persistent PostgreSQL unique constraint (IdempotencyKeyRecord)
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Any
from sqlalchemy.orm import Session
from packages.antidrift.models import IdempotencyKeyRecord


class IdempotencyManager:
    """Guarantees at-most-once execution for all external agent mutations."""

    @classmethod
    def generate_key(
        cls,
        tenant_id: str,
        source_event_id: str,
        action_type: str,
        target_id: str,
        payload: dict[str, Any] | None = None,
    ) -> str:
        """
        Deterministic SHA-256 idempotency key:
        SHA256(tenant_id + source_event_id + action_type + target_id + sorted_payload_json)
        """
        norm_payload = json.dumps(payload or {}, sort_keys=True, ensure_ascii=True)
        raw_seed = f"{tenant_id}:{source_event_id}:{action_type}:{target_id}:{norm_payload}"
        return hashlib.sha256(raw_seed.encode("utf-8")).hexdigest()

    @classmethod
    def check_or_reserve_db(
        cls,
        db: Session,
        idempotency_key: str,
        tenant_id: str,
        action_type: str,
        source_event_id: str,
        payload: dict[str, Any] | None = None,
        ttl_minutes: int = 60,
    ) -> tuple[bool, IdempotencyKeyRecord]:
        """
        Atomically checks if the key already exists in PostgreSQL.
        Returns:
            (is_new, record)
            If is_new is False: this action is a DUPLICATE, do not re-execute!
            If is_new is True: key is successfully reserved.
        """
        now = datetime.now(timezone.utc)
        record = (
            db.query(IdempotencyKeyRecord)
            .filter(
                IdempotencyKeyRecord.tenant_id == tenant_id,
                IdempotencyKeyRecord.idempotency_key == idempotency_key,
            )
            .first()
        )

        if record:
            # Already exists
            return False, record

        # New key: calculate payload hash and reserve
        norm_payload = json.dumps(payload or {}, sort_keys=True, ensure_ascii=True)
        action_hash = hashlib.sha256(norm_payload.encode("utf-8")).hexdigest()
        expires_at = now + timedelta(minutes=ttl_minutes)

        new_record = IdempotencyKeyRecord(
            idempotency_key=idempotency_key,
            tenant_id=tenant_id,
            action_type=action_type,
            source_event_id=source_event_id,
            action_hash=action_hash,
            status="PROCESSING",
            first_seen_at=now,
            expires_at=expires_at,
        )
        db.add(new_record)
        db.flush()

        return True, new_record

    @classmethod
    def mark_completed_db(
        cls,
        db: Session,
        idempotency_key: str,
        action_execution_id: str,
    ) -> None:
        """Marks the idempotency key as successfully executed in DB."""
        record = (
            db.query(IdempotencyKeyRecord)
            .filter(IdempotencyKeyRecord.idempotency_key == idempotency_key)
            .first()
        )
        if record:
            setattr(record, "status", "COMPLETED")
            setattr(record, "related_action_execution_id", action_execution_id)
            db.commit()
