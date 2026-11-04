# -*- coding: utf-8 -*-
"""A manager is a user of the client's CRM. Never a name heard by the AI, never the first login of the tenant."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from starlette.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.settings_router import get_fallback_settings
from apps.api.services.call_manager import UNKNOWN_MANAGER, in_crm_team, resolve_call_manager
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Deal, Tenant, User, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
TEAM = {"managers": [{"id": "14384026", "name": "Дмитрий"}, {"id": "14388098", "name": "Кристина"}]}


@pytest.mark.parametrize("crm_id,name,expected", [
    ("14384026", "старое имя", "Дмитрий"),         # the id wins, the CRM holds the current name
    (None, "Кристина", "Кристина"),
    (None, "кристина ", "Кристина"),
    ("555", "Новый Сотрудник", "Новый Сотрудник"),  # a CRM user not synced yet
    ("555", "", "Менеджер #555"),
    (None, "Менеджер #555", "Менеджер #555"),
    (None, "Заряна", UNKNOWN_MANAGER),             # heard by the AI, not in the CRM
    (None, "Неизвестен", UNKNOWN_MANAGER),
    (None, "Не указан", UNKNOWN_MANAGER),
    (None, "", UNKNOWN_MANAGER),
    (None, None, UNKNOWN_MANAGER),
])
def test_only_a_crm_user_is_a_manager(crm_id, name, expected):
    assert resolve_call_manager(TEAM, crm_id, name) == expected


def test_no_team_list_means_no_invented_manager():
    assert resolve_call_manager({}, None, "Заряна") == UNKNOWN_MANAGER
    assert resolve_call_manager(None, None, "Заряна") == UNKNOWN_MANAGER


def test_in_crm_team():
    assert in_crm_team(TEAM, "14388098", "") and in_crm_team(TEAM, None, "ДМИТРИЙ")
    assert not in_crm_team(TEAM, "1", "Заряна")


def test_settings_fallback_invents_no_team():
    assert get_fallback_settings()["managers"] == []


@pytest.fixture
def tid():
    t = f"TNT-M-{uuid.uuid4().hex[:6].upper()}"
    db = SessionLocal()
    try:
        get_or_create_workspace(db, t, "amocrm")
        # the tenant's first login: it used to be written as the manager of EVERY ingested call
        db.add(User(id=str(uuid.uuid4()), tenant_id=t, email=f"{t}@x.test", hashed_password="x",
                    full_name="Иван Менеджеров", role=UserRole.CEO))
        db.commit()
    finally:
        db.close()
    yield t
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == t).delete()
        db.query(Deal).filter(Deal.tenant_id == t).delete()
        db.query(User).filter(User.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _ingest(tenant, **kw):
    client = TestClient(app, client=("172.16.0.5", 50000))  # internal network, like n8n
    body = {"id": f"c-{uuid.uuid4().hex[:8]}", "tenant_id": tenant, "duration_sec": 95, "cr": [1] * 9 + [0] * 4,
            "transcript": "t", "sync_to_sheets": False, **kw}
    return client.post("/api/v1/calls/ingest", json=body)


def _list(tenant):
    token = create_access_token({"sub": "u", "tenant_id": tenant, "role": UserRole.CEO.value, "email": "u@x.test"})
    res = TestClient(app).get(f"/api/v1/calls/data?tenant_id={tenant}",
                              headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    return res.json()["calls"]


def test_ingested_call_keeps_its_crm_manager_not_the_first_login(tid):
    team = {"managers": [{"id": "7", "name": "Кристина"}]}
    with patch.object(calls_router, "get_tenant_config", return_value=team):
        assert _ingest(tid, manager="Кристина", manager_crm_id="7").status_code == 200
        calls = _list(tid)
    assert [c["manager"] for c in calls] == ["Кристина"]

    db = SessionLocal()
    try:
        assert db.query(CallRecording).filter(CallRecording.tenant_id == tid).one().manager_id is None
    finally:
        db.close()


def test_name_heard_by_the_ai_is_not_a_manager(tid):
    team = {"managers": [{"id": "7", "name": "Кристина"}]}
    with patch.object(calls_router, "get_tenant_config", return_value=team), \
         patch("apps.api.services.crm_users_sync.sync_tenant_crm_managers", new=AsyncMock(return_value={})) as sync:
        assert _ingest(tid, manager="Заряна").status_code == 200
        calls = _list(tid)
    assert [c["manager"] for c in calls] == [UNKNOWN_MANAGER]
    sync.assert_awaited_once()  # an unknown name may be a new employee: the team list is refreshed once


def test_known_manager_does_not_touch_the_crm(tid):
    team = {"managers": [{"id": "7", "name": "Кристина"}]}
    with patch.object(calls_router, "get_tenant_config", return_value=team), \
         patch("apps.api.services.crm_users_sync.sync_tenant_crm_managers", new=AsyncMock(return_value={})) as sync:
        assert _ingest(tid, manager="Кристина").status_code == 200
    sync.assert_not_awaited()


def test_old_call_finds_its_manager_once_the_team_is_synced(tid):
    with patch.object(calls_router, "get_tenant_config", return_value={"managers": []}), \
         patch("apps.api.services.crm_users_sync.sync_tenant_crm_managers", new=AsyncMock(return_value={})):
        assert _ingest(tid, manager="Кристина").status_code == 200
        assert _list(tid)[0]["manager"] == UNKNOWN_MANAGER
    with patch.object(calls_router, "get_tenant_config", return_value={"managers": [{"id": "7", "name": "Кристина"}]}):
        assert _list(tid)[0]["manager"] == "Кристина"


def test_crm_sync_failure_does_not_lose_the_call(tid):
    with patch.object(calls_router, "get_tenant_config", return_value={"managers": []}), \
         patch("apps.api.services.crm_users_sync.sync_tenant_crm_managers", new=AsyncMock(side_effect=RuntimeError("crm"))):
        assert _ingest(tid, manager="Кристина").status_code == 200
