# -*- coding: utf-8 -*-
"""/calls/data: local business-day date, criteria list, score, next step and zoom read from what was stored."""

import uuid
from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}


@pytest.fixture
def tid():
    t = f"TNT-CD-{uuid.uuid4().hex[:6].upper()}"
    yield t
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def test_calls_data_reads_stored_scorecards_and_local_date(tid):
    db = SessionLocal()
    try:
        get_or_create_workspace(db, tid, "bitrix24")
        # worker row (new shape): 3 points, next step passed, zoom scheduled; created 22:30 UTC = 01:30 MSK next day
        db.add(CallRecording(
            id=str(uuid.uuid4()), tenant_id=tid, client_phone="+7", duration_seconds=120, overall_score=3.0,
            scorecard_criteria={"cr": [1, 1, 1] + [0] * 10, "score": 3, "next_step": 1, "zoom_scheduled": 1},
            created_at=datetime(2026, 11, 2, 22, 30)))
        # legacy worker row: {"cr1":..}, overall_score is a PERCENT (1 point = 7.7), no next step
        db.add(CallRecording(
            id=str(uuid.uuid4()), tenant_id=tid, client_phone="+7", duration_seconds=90, overall_score=7.7,
            scorecard_criteria={**{f"cr{i}": 0 for i in range(1, 14)}, "cr2": 1},
            created_at=datetime(2026, 11, 2, 10, 0)))
        # unrated call: ingest stores overall_score 0.0 and score None
        db.add(CallRecording(
            id=str(uuid.uuid4()), tenant_id=tid, client_phone="+7", duration_seconds=30, overall_score=0.0,
            scorecard_criteria={"cr": [None] * 13, "score": None, "next_step": None},
            created_at=datetime(2026, 11, 1, 10, 0)))
        db.commit()
    finally:
        db.close()

    token = create_access_token({"sub": "u", "tenant_id": tid, "role": UserRole.CEO.value, "email": "u@x.test"})
    res = TestClient(app).get(f"/api/v1/calls/data?tenant_id={tid}",
                              headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text[:300]
    calls = {c["date"]: c for c in res.json()["calls"]}

    new = calls["2026-11-03 01:30:00"]                       # Moscow wall time, next working day
    assert (new["score"], new["next_step"], new["zoom_scheduled"]) == (3, 1, 1)
    assert new["cr"][:3] == [1, 1, 1]

    legacy = calls["2026-11-02 13:00:00"]
    assert legacy["score"] == 1                              # not 8
    assert legacy["next_step"] == 0 and legacy["cr"][1] == 1

    unrated = calls["2026-11-01 13:00:00"]
    assert unrated["score"] is None and unrated["next_step"] is None and unrated["zoom_scheduled"] is None
