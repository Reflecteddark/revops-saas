# -*- coding: utf-8 -*-
"""
/calls/ingest with the exact body node 18b of the n8n workflow sends (scripts/n8n/patch_wf_audit_contract.py).
n8n drops undefined values, so a field may be missing; an empty manager_crm_id means "the CRM gave no user".
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from starlette.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.services.call_manager import UNKNOWN_MANAGER
from apps.api.services.call_scorecard import AUDIT_FAILED_SUMMARY, UNANSWERED_SUMMARY
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
INTERNAL = TestClient(app, client=("172.16.0.5", 50000))  # like n8n
TEAM = {"managers": [{"id": "7", "name": "Кристина"}]}


@pytest.fixture
def tid():
    t = f"TNT-C-{uuid.uuid4().hex[:6].upper()}"
    db = SessionLocal()
    try:
        get_or_create_workspace(db, t, "amocrm")
    finally:
        db.close()
    yield t
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _body(tenant, **kw):
    """The body of node 18b for a rated call."""
    return {
        "id": f"call_{uuid.uuid4().hex[:8]}", "client": "Анна", "manager": "Кристина", "manager_crm_id": "7",
        "call_started_at": "2026-11-03T07:15:00.000Z", "audit_failed": 0, "is_unanswered": 0, "duration_sec": 120,
        "score": 9, "next_step": 0, "cr": [0] + [1] * 9 + [0] * 3, "error_summary": "нет шага",
        "recommendation": "назначить", "transcript": "разговор", "tenant_id": tenant, "sync_to_sheets": False, **kw,
    }


def _ingest_and_list(tenant, team=TEAM, **kw):
    with patch.object(calls_router, "get_tenant_config", return_value=team), \
         patch.object(calls_router, "fetch_calls_from_sheets", return_value=[]), \
         patch("apps.api.services.crm_users_sync.sync_tenant_crm_managers", new=AsyncMock(return_value={})):
        res = INTERNAL.post("/api/v1/calls/ingest", json=_body(tenant, **kw))
        assert res.status_code == 200, res.text[:300]
        token = create_access_token({"sub": "u", "tenant_id": tenant, "role": UserRole.CEO.value, "email": "u@x.test"})
        listed = TestClient(app).get(f"/api/v1/calls/data?tenant_id={tenant}",
                                     headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    return listed.json()["calls"][0]


def test_rated_call_reaches_the_list_with_its_manager_and_moment(tid):
    call = _ingest_and_list(tid)
    assert (call["manager"], call["score"], call["status"], call["kind"]) == ("Кристина", 9, "won", "assessed")
    assert call["next_step"] == 0
    assert call["date"] == "2026-11-03 10:15:00"  # Moscow wall time of the call, not of the arrival


def test_crm_id_finds_the_current_name(tid):
    assert _ingest_and_list(tid, manager="Старое имя")["manager"] == "Кристина"


def test_no_crm_user_is_not_a_manager(tid):
    call = _ingest_and_list(tid, manager="Не указан", manager_crm_id="")
    assert call["manager"] == UNKNOWN_MANAGER


def test_missed_call_flag_wins_over_the_zeros(tid):
    call = _ingest_and_list(tid, is_unanswered=1, score=0, next_step=0, cr=[0] * 13, error_summary=UNANSWERED_SUMMARY)
    assert (call["status"], call["score"], call["next_step"]) == ("unanswered", None, None)


def test_failed_audit_flag_wins_over_the_zeros(tid):
    call = _ingest_and_list(tid, audit_failed=1, score=0, next_step=0, cr=[0] * 13, error_summary=AUDIT_FAILED_SUMMARY,
                            recommendation="Manual review required")
    assert (call["status"], call["score"]) == ("audit_failed", None)
    assert call["recommendation"] == ""


def test_call_refused_by_the_model_keeps_its_manager_and_moment(tid):
    call = _ingest_and_list(tid, score=None, next_step=None, cr=[], audit_failed=1, transcript=None,
                            error_summary="Аудит невозможен: модель отклонила запись (SAFETY)")
    assert (call["status"], call["manager"], call["date"]) == ("audit_failed", "Кристина", "2026-11-03 10:15:00")


def test_fields_n8n_dropped_as_undefined_are_fine(tid):
    body = {"id": f"call_{uuid.uuid4().hex[:8]}", "tenant_id": tid, "sync_to_sheets": False, "cr": []}
    res = INTERNAL.post("/api/v1/calls/ingest", json=body)
    assert res.status_code == 200, res.text[:300]
