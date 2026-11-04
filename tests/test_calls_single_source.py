# -*- coding: utf-8 -*-
"""One list of calls for the audit tab, the Pulse and the insights: the DB plus the history kept only in the sheet."""

import uuid
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.calls_router import fetch_calls_from_sheets, load_tenant_calls
from apps.api.routers.insights_router import load_tenant_dataset
from apps.api.services.raw_calls_row import build_raw_calls_row
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
CR = [1] * 9 + [0] * 4


@pytest.fixture
def tid():
    t = f"TNT-S-{uuid.uuid4().hex[:6].upper()}"
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
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _db_call(tenant, external_id, created, sc=None):
    db = SessionLocal()
    try:
        db.add(CallRecording(
            id=str(uuid.uuid4()), tenant_id=tenant, external_call_id=external_id, client_phone="", duration_seconds=60,
            overall_score=9.0, scorecard_criteria=sc or {"cr": CR, "score": 9, "next_step": 1}, created_at=created))
        db.commit()
    finally:
        db.close()


def _row(call_id, date):
    row, _ = build_raw_calls_row(
        call_id=call_id, deal_id="7", manager="Дмитрий", date_str=date, dur_sec=60, cr=CR, total_score=9, next_step=1,
        error_summary="-", recommendation="-", transcript="— Алло", tenant_id="T", now=datetime(2026, 10, 31, 10, 0))
    return row


class _Sheet:
    reads = 0

    def __init__(self, rows):
        self.rows = rows

    def get_all_values(self):
        _Sheet.reads += 1
        return [["header"] * 38, *self.rows]

    def worksheet(self, _name):
        return self

    def open_by_key(self, _key):
        return self


@pytest.fixture
def sheet(monkeypatch):
    """A raw_calls sheet with an in-memory cache only; rows are listed oldest first, as the sheet keeps them."""
    import gspread

    holder = _Sheet([])
    _Sheet.reads = 0
    monkeypatch.setattr(gspread, "service_account", lambda *_a, **_k: holder)
    monkeypatch.setattr(calls_router, "get_service_account_path", lambda: Path("sa.json"))
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda _t: {"spreadsheet_id": "sheet"})
    monkeypatch.setattr(calls_router, "get_deals_lookup", lambda tenant_id: {})
    monkeypatch.setattr(calls_router, "get_cached_json_sync", lambda _k: None)
    monkeypatch.setattr(calls_router, "set_cached_json_sync", lambda *_a, **_k: None)
    return holder


def test_first_db_call_does_not_hide_the_sheet_history(tid, sheet):
    sheet.rows = [_row("old-1", "2026-10-30"), _row("old-2", "2026-10-31")]
    _db_call(tid, "new-1", datetime(2026, 11, 2, 10, 0))

    db = SessionLocal()
    try:
        calls, source = load_tenant_calls(db, tid, 500)
    finally:
        db.close()

    assert len(calls) == 3 and source == "database+google_sheets"
    assert [c["id"] for c in calls[1:]] == ["old-2", "old-1"]  # newest first across both sources
    assert calls[0]["date"].startswith("2026-11-02")


def test_call_in_both_sources_is_listed_once(tid, sheet):
    sheet.rows = [_row("same-call", "2026-11-02")]
    _db_call(tid, "same-call", datetime(2026, 11, 2, 10, 0))
    db = SessionLocal()
    try:
        calls, source = load_tenant_calls(db, tid, 500)
    finally:
        db.close()
    assert len(calls) == 1 and source == "database"


def test_limit_applies_to_the_merged_list(tid, sheet):
    sheet.rows = [_row(f"old-{i}", "2026-10-30") for i in range(5)]
    _db_call(tid, "new-1", datetime(2026, 11, 2, 10, 0))
    db = SessionLocal()
    try:
        calls, _ = load_tenant_calls(db, tid, 3)
    finally:
        db.close()
    assert len(calls) == 3


def test_a_small_limit_does_not_shrink_the_cache_for_the_next_caller(tid, sheet):
    sheet.rows = [_row(f"c-{i}", "2026-10-30") for i in range(30)]
    assert len(fetch_calls_from_sheets(tid, limit=20)) == 20  # the Pulse asks for 20 ...
    assert len(fetch_calls_from_sheets(tid, limit=500)) == 30  # ... and the audit tab must still get all of them
    assert _Sheet.reads == 1


def test_sheet_failure_keeps_the_last_good_list_and_is_not_retried_at_once(tid, sheet, monkeypatch):
    sheet.rows = [_row("c-1", "2026-10-30")]
    assert len(fetch_calls_from_sheets(tid)) == 1
    calls_router._CALLS_CACHE[tid]["timestamp"] = 0  # expired

    def boom():
        _Sheet.reads += 1
        raise RuntimeError("quota")

    monkeypatch.setattr(sheet, "get_all_values", boom)
    reads = _Sheet.reads
    assert len(fetch_calls_from_sheets(tid)) == 1
    assert len(fetch_calls_from_sheets(tid)) == 1
    assert _Sheet.reads == reads + 1


def test_endpoint_returns_the_merged_list(tid, sheet):
    sheet.rows = [_row("old-1", "2026-10-30")]
    _db_call(tid, "new-1", datetime(2026, 11, 2, 10, 0))
    token = create_access_token({"sub": "u", "tenant_id": tid, "role": UserRole.CEO.value, "email": "u@x.test"})
    res = TestClient(app).get(f"/api/v1/calls/data?tenant_id={tid}&limit=500",
                              headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    body = res.json()
    assert body["count"] == 2 and body["source"] == "database+google_sheets"


def test_insights_read_the_same_calls_and_invent_no_next_step(tid):
    # stored with a recommendation and a high score, but no next step: this used to read as "next step fixed"
    _db_call(tid, "n-1", datetime(2026, 11, 2, 10, 0), sc={"cr": [None] * 13, "score": 11})
    with patch.object(calls_router, "fetch_calls_from_sheets", return_value=[]):
        db = SessionLocal()
        try:
            calls, _deals = load_tenant_dataset(tid, db)
            listed, _ = load_tenant_calls(db, tid, 500)
        finally:
            db.close()
    assert calls == listed
    assert calls[0]["next_step"] is None


def test_manual_sync_caches_the_whole_list(tid, sheet):
    from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS

    sheet.rows = [_row(f"c-{i}", "2026-10-30") for i in range(150)]
    client = TestClient(app, client=("172.16.0.5", 50000))
    res = client.post(f"/api/v1/calls/sync_sheets?tenant_id={tid}", headers={"X-Admin-Key": next(iter(ALLOWED_ADMIN_KEYS))})
    assert res.json()["count"] == 150  # it used to stop at 100 and leave that in the shared cache
    assert len(fetch_calls_from_sheets(tid, limit=500)) == 150
