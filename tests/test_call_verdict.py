# -*- coding: utf-8 -*-
"""One verdict for a call: what kind of call it is, its quality band, and that a failure is never a 0/13 score."""

import re
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.calls_router import fetch_calls_from_sheets
from apps.api.routers.insights_router import compute_leak_metrics
from apps.api.services.call_scorecard import (
    AUDIT_FAILED_SUMMARY,
    SCORE_HIGH_MIN,
    SCORE_MID_MIN,
    UNANSWERED_SUMMARY,
    call_verdict,
    read_scorecard,
)
from apps.api.services.raw_calls_row import build_raw_calls_row
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal
from datetime import datetime

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
ALL_ZERO = [0] * 13


@pytest.mark.parametrize("score,status,label", [
    (0, "risk", "СРЫВ"), (5, "risk", "СРЫВ"),
    (6, "norm", "НОРМА"), (8, "norm", "НОРМА"),
    (9, "won", "ЭТАЛОН"), (13, "won", "ЭТАЛОН"),
])
def test_quality_band_depends_on_score_only(score, status, label):
    assert call_verdict("assessed", score) == (status, label)


def test_missing_next_step_does_not_turn_a_good_call_into_a_failure():
    card = read_scorecard({"cr": [0] + [1] * 12, "score": 12, "next_step": 0}, 12.0)
    assert (card["status"], card["status_label"], card["next_step"]) == ("won", "ЭТАЛОН", 0)
    assert card["at_risk"] is True  # the missing next step is still a risk, shown separately from quality


def test_stored_status_is_ignored_so_old_rows_follow_the_same_table():
    card = read_scorecard({"cr": [1] * 10 + [0] * 3, "score": 10, "status": "risk", "status_label": "СЛИВ"}, 10.0)
    assert card["status"] == "won"


@pytest.mark.parametrize("sc,summary,kind,status,label", [
    ({"cr": ALL_ZERO, "score": 0, "next_step": 0}, AUDIT_FAILED_SUMMARY, "audit_failed", "audit_failed", "СБОЙ АНАЛИЗА"),
    ({"cr": ALL_ZERO, "score": 0, "next_step": 0}, UNANSWERED_SUMMARY, "unanswered", "unanswered", "НЕДОЗВОН"),
    ({"cr": ALL_ZERO, "score": 0, "next_step": 0, "audit_failed": 1}, "что угодно", "audit_failed", "audit_failed", "СБОЙ АНАЛИЗА"),
    ({"cr": ALL_ZERO, "score": 0, "next_step": 0, "is_unanswered": "1"}, "", "unanswered", "unanswered", "НЕДОЗВОН"),
])
def test_failed_or_unanswered_call_has_no_score(sc, summary, kind, status, label):
    card = read_scorecard(sc, 0.0, error_summary=summary)
    assert (card["kind"], card["status"], card["status_label"]) == (kind, status, label)
    assert card["score"] is None and card["next_step"] is None and card["at_risk"] is False
    assert card["cr"] == [None] * 13


def test_a_real_zero_stays_a_zero():
    card = read_scorecard({"cr": ALL_ZERO, "score": 0, "next_step": 0}, 0.0, error_summary="Менеджер не назвал цель звонка")
    assert (card["kind"], card["score"], card["status"]) == ("assessed", 0, "risk")


def test_unrated_call_is_unknown():
    card = read_scorecard({"cr": [None] * 13, "score": None}, 0.0)
    assert (card["kind"], card["status"], card["status_label"]) == ("unrated", "unknown", "НЕТ ДАННЫХ")


def test_web_thresholds_are_the_same_table():
    src = (Path(__file__).parent.parent / "apps/web/src/lib/thresholds.ts").read_text(encoding="utf-8")
    assert int(re.search(r"high: \{ min: (\d+)", src).group(1)) == SCORE_HIGH_MIN
    assert int(re.search(r"mid: \{ min: (\d+)", src).group(1)) == SCORE_MID_MIN


def test_good_call_without_next_step_counts_as_fake_yes():
    calls = [
        {"score": 12, "next_step": 0, "status": "won"},
        {"score": 3, "next_step": 0, "status": "risk"},
        {"score": 12, "next_step": 1, "status": "won"},
        {"score": None, "next_step": None, "status": "unanswered"},
    ]
    assert len(compute_leak_metrics(calls, [], None)["fake_yes_calls"]) == 2


def _sheet_row(call_id, cr, score, next_step, summary, audit_failed="0", unanswered="0"):
    row, _ = build_raw_calls_row(
        call_id=call_id, deal_id="77", manager="Дмитрий", date_str="2026-10-31", dur_sec=60, cr=cr,
        total_score=score, next_step=next_step, error_summary=summary, recommendation="-", transcript="— Алло",
        tenant_id="TNT-X", now=datetime(2026, 10, 31, 10, 0),
    )
    row[36], row[37] = audit_failed, unanswered
    return row


def test_sheet_rows_use_the_same_verdict(monkeypatch):
    tenant = f"TNT-V-{uuid.uuid4().hex[:6].upper()}"

    class Ws:
        def get_all_values(self):
            return [["header"] * 38,
                    _sheet_row("good", [0] + [1] * 11 + [0], 11, 0, "нет шага"),
                    _sheet_row("fail", ALL_ZERO, 0, 0, AUDIT_FAILED_SUMMARY, audit_failed="1"),
                    _sheet_row("ivr", ALL_ZERO, 0, 0, UNANSWERED_SUMMARY, unanswered="1")]

    class Ss:
        def worksheet(self, _name):
            return Ws()

    class Gc:
        def open_by_key(self, _key):
            return Ss()

    import gspread
    monkeypatch.setattr(gspread, "service_account", lambda *_a, **_k: Gc())
    monkeypatch.setattr(calls_router, "get_service_account_path", lambda: Path("sa.json"))
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda _t: {"spreadsheet_id": "sheet"})
    monkeypatch.setattr(calls_router, "get_deals_lookup", lambda tenant_id: {})
    monkeypatch.setattr(calls_router, "get_cached_json_sync", lambda _k: None)
    monkeypatch.setattr(calls_router, "set_cached_json_sync", lambda *_a, **_k: None)

    calls = {c["id"]: c for c in fetch_calls_from_sheets(tenant)}
    assert (calls["good"]["status"], calls["good"]["score"], calls["good"]["next_step"]) == ("won", 11, 0)
    assert (calls["fail"]["status"], calls["fail"]["score"], calls["fail"]["kind"]) == ("audit_failed", None, "audit_failed")
    assert (calls["ivr"]["status"], calls["ivr"]["score"], calls["ivr"]["kind"]) == ("unanswered", None, "unanswered")
    calls_router._CALLS_CACHE.pop(tenant, None)


@pytest.fixture
def tid():
    t = f"TNT-V-{uuid.uuid4().hex[:6].upper()}"
    yield t
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def test_stored_call_with_failed_audit_is_not_a_zero(tid):
    db = SessionLocal()
    try:
        get_or_create_workspace(db, tid, "amocrm")
        # what n8n really sends for a Gemini JSON failure: 13 zeros, score 0
        db.add(CallRecording(
            id=str(uuid.uuid4()), tenant_id=tid, client_phone="", duration_seconds=51, overall_score=0.0,
            ai_summary=AUDIT_FAILED_SUMMARY,
            scorecard_criteria={"cr": ALL_ZERO, "score": 0, "next_step": 0, "status": "risk", "manager": "Дмитрий"},
            created_at=datetime(2026, 11, 2, 10, 0)))
        db.commit()
    finally:
        db.close()

    token = create_access_token({"sub": "u", "tenant_id": tid, "role": UserRole.CEO.value, "email": "u@x.test"})
    res = TestClient(app).get(f"/api/v1/calls/data?tenant_id={tid}",
                              headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    call = res.json()["calls"][0]
    assert (call["status"], call["status_label"], call["score"]) == ("audit_failed", "СБОЙ АНАЛИЗА", None)
    assert call["next_step"] is None and call["risk_amount"] == "0 ₽"
    assert call["error_summary"] == "" and call["recommendation"] == ""  # technical text is not advice to a РОП


def test_queued_call_without_criteria_is_not_a_perfect_score(tid):
    from workers.tasks import process_call_audio_task

    db = SessionLocal()
    try:
        get_or_create_workspace(db, tid, "amocrm")
    finally:
        db.close()
    call_id = f"q-{uuid.uuid4().hex[:8]}"
    result = process_call_audio_task({"id": call_id, "transcript": "шум", "sync_to_sheets": False}, org_id=tid)
    assert (result["score"], result["next_step"]) == (None, None)  # used to be 13 and 1

    db = SessionLocal()
    try:
        rec = db.query(CallRecording).filter(CallRecording.tenant_id == tid).one()
        card = read_scorecard(rec.scorecard_criteria, rec.overall_score, error_summary=rec.ai_summary)
        assert (card["score"], card["status"]) == (None, "unknown")
    finally:
        db.close()
