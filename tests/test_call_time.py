# -*- coding: utf-8 -*-
"""The date of a call is when the call happened, not when the audit reached the database."""

import uuid
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.calls_router import fetch_calls_from_sheets, parse_call_time
from apps.api.services.raw_calls_row import build_raw_calls_row
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}


@pytest.mark.parametrize("value,expected", [
    ("2026-11-03T09:15:00+03:00", datetime(2026, 11, 3, 6, 15)),
    ("2026-11-03T06:15:00Z", datetime(2026, 11, 3, 6, 15)),
    ("", None),
    (None, None),
    ("вчера", None),
])
def test_parse_call_time(value, expected):
    parsed = parse_call_time(value)
    assert (parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed else None) == expected


@pytest.fixture
def tid():
    t = f"TNT-T-{uuid.uuid4().hex[:6].upper()}"
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


def _list(tenant):
    token = create_access_token({"sub": "u", "tenant_id": tenant, "role": UserRole.CEO.value, "email": "u@x.test"})
    res = TestClient(app).get(f"/api/v1/calls/data?tenant_id={tenant}",
                              headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    return res.json()["calls"]


def test_ingested_call_shows_when_it_happened(tid):
    client = TestClient(app, client=("172.16.0.5", 50000))  # internal network, like n8n
    res = client.post("/api/v1/calls/ingest", json={
        "id": "c-1", "tenant_id": tid, "cr": [1] * 13, "transcript": "t", "sync_to_sheets": False,
        "call_started_at": "2026-10-20T09:15:00+03:00",  # audited two weeks later
    })
    assert res.status_code == 200
    with patch.object(calls_router, "fetch_calls_from_sheets", return_value=[]):
        assert _list(tid)[0]["date"] == "2026-10-20 09:15:00"


def test_call_without_a_start_time_falls_back_to_when_it_arrived(tid):
    db = SessionLocal()
    try:
        db.add(CallRecording(id=str(uuid.uuid4()), tenant_id=tid, client_phone="", overall_score=0.0,
                             scorecard_criteria={"call_started_at": "мусор"}, created_at=datetime(2026, 11, 2, 22, 30)))
        db.commit()
    finally:
        db.close()
    with patch.object(calls_router, "fetch_calls_from_sheets", return_value=[]):
        assert _list(tid)[0]["date"] == "2026-11-03 01:30:00"


def test_sheet_row_gets_its_hour_from_the_call_hour_column(monkeypatch):
    import gspread

    tenant = f"TNT-T-{uuid.uuid4().hex[:6].upper()}"
    with_hour, _ = build_raw_calls_row(
        call_id="h", deal_id="7", manager="Дмитрий", date_str="2026-10-31", dur_sec=60, cr=[1] * 13, total_score=13,
        next_step=1, error_summary="-", recommendation="-", transcript="т", tenant_id="T",
        now=datetime(2026, 10, 31, 7, 12))
    with_hour[32] = "10"
    no_hour = list(with_hour)
    no_hour[0], no_hour[32] = "n", ""
    full_date = list(with_hour)
    full_date[0], full_date[3] = "f", "2026-10-31 14:20:05"

    class Sheet:
        def get_all_values(self):
            return [["header"] * 38, with_hour, no_hour, full_date]

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

    dates = {c["id"]: c["date"] for c in fetch_calls_from_sheets(tenant)}
    calls_router._CALLS_CACHE.pop(tenant, None)
    assert dates == {"h": "2026-10-31 10:00:00", "n": "2026-10-31", "f": "2026-10-31 14:20:05"}
