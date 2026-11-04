# -*- coding: utf-8 -*-
"""What is unknown about a call stays empty: no stub stage, client, deal, phone, sum, duration or score."""

import uuid
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from starlette.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.calls_router import fetch_calls_from_sheets
from apps.api.services.raw_calls_row import build_raw_calls_row
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Deal, DealStage, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
INTERNAL = TestClient(app, client=("172.16.0.5", 50000))  # like n8n


@pytest.fixture
def tid():
    t = f"TNT-N-{uuid.uuid4().hex[:6].upper()}"
    db = SessionLocal()
    try:
        get_or_create_workspace(db, t, "amocrm")
    finally:
        db.close()
    yield t
    calls_router._CALLS_CACHE.pop(t, None)
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == t).delete()
        db.query(Deal).filter(Deal.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _list(tenant):
    token = create_access_token({"sub": "u", "tenant_id": tenant, "role": UserRole.CEO.value, "email": "u@x.test"})
    with patch.object(calls_router, "fetch_calls_from_sheets", return_value=[]):
        res = TestClient(app).get(f"/api/v1/calls/data?tenant_id={tenant}",
                                  headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    return res.json()["calls"]


def test_ingested_call_with_nothing_known_stays_empty(tid):
    res = INTERNAL.post("/api/v1/calls/ingest", json={"id": "c-1", "tenant_id": tid, "sync_to_sheets": False})
    assert res.status_code == 200
    call = _list(tid)[0]
    for field in ("deal_id", "deal_title", "client", "stage", "error_summary", "recommendation", "transcript"):
        assert call[field] == "", field

    db = SessionLocal()
    try:
        assert db.query(CallRecording).filter(CallRecording.tenant_id == tid).one().client_phone == ""
    finally:
        db.close()


def test_list_shows_the_crm_stage_name_not_the_internal_one(tid):
    db = SessionLocal()
    try:
        ws = get_or_create_workspace(db, tid, "amocrm")
        db.add(Deal(id=f"{tid}:1", external_crm_id="1", tenant_id=tid, workspace_id=ws.id, title="Сделка клиента",
                    company_name="ООО Ромашка", budget=0, stage=DealStage.LEAD_INCOMING, stage_name="Квалифицирован",
                    pipeline_name="Основная", pipeline_id="0", crm_source="amocrm", status="active"))
        db.add(CallRecording(id=str(uuid.uuid4()), tenant_id=tid, deal_id=f"{tid}:1", client_phone="",
                             overall_score=0.0, scorecard_criteria={"client": "Не указано"},
                             created_at=datetime(2026, 11, 2, 10, 0)))
        db.commit()
    finally:
        db.close()
    call = _list(tid)[0]
    assert (call["stage"], call["client"], call["deal_title"]) == ("Квалифицирован", "ООО Ромашка", "Сделка клиента")


@pytest.mark.parametrize("stored", ["Не указано", "Неизвестно", "Клиент", "Клиент B2B"])
def test_placeholder_is_not_a_client(tid, stored):
    db = SessionLocal()
    try:
        db.add(CallRecording(id=str(uuid.uuid4()), tenant_id=tid, client_phone="", overall_score=0.0,
                             scorecard_criteria={"client": stored}, created_at=datetime(2026, 11, 2, 10, 0)))
        db.commit()
    finally:
        db.close()
    assert _list(tid)[0]["client"] == ""


def test_sheet_row_invents_nothing_and_a_first_phrase_is_not_a_client(monkeypatch):
    import gspread

    tenant = f"TNT-N-{uuid.uuid4().hex[:6].upper()}"
    row, _ = build_raw_calls_row(
        call_id="s-1", deal_id="", manager="Дмитрий", date_str="2026-10-31", dur_sec=60, cr=[1] * 13, total_score=13,
        next_step=1, error_summary="", recommendation="", transcript="Клиент: Это администратор клиники.\nМенеджер: Да",
        tenant_id="T", now=datetime(2026, 10, 31, 10, 0))

    class Sheet:
        def get_all_values(self):
            return [["header"] * 38, row]

        def worksheet(self, _name):
            return self

        def open_by_key(self, _key):
            return self

    monkeypatch.setattr(gspread, "service_account", lambda *_a, **_k: Sheet())
    monkeypatch.setattr(calls_router, "get_service_account_path", lambda: Path("sa.json"))
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda _t: {"spreadsheet_id": "sheet"})
    monkeypatch.setattr(calls_router, "get_deals_lookup", lambda tenant_id: {})
    monkeypatch.setattr(calls_router, "get_cached_json_sync", lambda _k: None)
    monkeypatch.setattr(calls_router, "set_cached_json_sync", lambda *_a, **_k: None)

    call = fetch_calls_from_sheets(tenant)[0]
    calls_router._CALLS_CACHE.pop(tenant, None)
    for field in ("deal_id", "deal_title", "client", "stage", "error_summary", "recommendation"):
        assert call[field] == "", field
    assert call["transcript"].startswith("Клиент: Это администратор")


@pytest.mark.parametrize("text", ["Клиент сказал: успешно, договорились", "слив, отказ, нет next step"])
def test_a_word_in_the_text_is_not_a_score(text):
    with patch("apps.api.routers.webhooks_router.manager.broadcast", new_callable=AsyncMock) as broadcast, \
         patch("apps.api.routers.webhooks_router.append_call_to_sheets", return_value=True):
        res = INTERNAL.post("/api/v1/webhooks/TNT-001/amocrm", json={"call_id": "w-1", "transcript": text})
    assert res.status_code == 200
    call = broadcast.call_args[0][1]["call"]
    assert (call["score"], call["next_step"], call["status"]) == (None, None, "unknown")
    assert call["manager"] in ("", None) and call["risk_amount"] == "0 ₽"


def test_bitrix_webhook_invents_no_manager_or_duration():
    with patch("apps.api.routers.webhooks_router.manager.broadcast", new_callable=AsyncMock) as broadcast, \
         patch("apps.api.routers.webhooks_router.append_call_to_sheets", return_value=True) as append:
        res = INTERNAL.post("/api/v1/webhooks/TNT-001/bitrix24", json={
            "event": "ONCRMDEALACTIVITYADD",
            "data": {"FIELDS": {"PROVIDER_TYPE_ID": "CALL", "ID": "1", "OWNER_ID": "5", "DESCRIPTION": "успешно"}},
        })
    assert res.status_code == 200
    call = broadcast.call_args[0][1]["call"]
    assert call["manager"] in ("", None) and call["score"] is None
    payload = append.call_args[0][0]
    assert payload.manager in ("", None) and payload.duration_sec == 0 and not payload.recommendation


def test_queue_worker_invents_nothing(tid):
    from workers.tasks import process_call_audio_task

    process_call_audio_task({"id": f"q-{uuid.uuid4().hex[:8]}", "sync_to_sheets": False}, org_id=tid)
    db = SessionLocal()
    try:
        rec = db.query(CallRecording).filter(CallRecording.tenant_id == tid).one()
        assert (rec.client_phone, rec.duration_seconds, rec.transcript_text) == ("", 0, "")
        assert rec.scorecard_criteria["manager"] in ("", None)
    finally:
        db.close()
