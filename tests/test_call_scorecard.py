# -*- coding: utf-8 -*-
import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from apps.api.services.call_scorecard import read_scorecard
from apps.api.services.prompt_builder import calculate_scores
from apps.api.services.raw_calls_row import N_COLUMNS, build_raw_calls_row


def test_ingest_shape_is_read_as_stored():
    sc = {"cr": [1] * 9 + [0] * 4, "score": 9, "next_step": 1, "zoom_scheduled": 1}
    r = read_scorecard(sc, 9.0)
    assert (r["score"], r["next_step"], r["zoom_scheduled"]) == (9, 1, 1)
    assert r["cr"][:9] == [1] * 9 and r["cr"][9:] == [0] * 4


def test_unrated_call_stays_unrated_not_zero():
    # ingest stores overall_score=0.0 and score=None for a call without criteria
    r = read_scorecard({"cr": [None] * 13, "score": None, "next_step": None}, 0.0)
    assert r["score"] is None and r["next_step"] is None and r["zoom_scheduled"] is None


def test_legacy_worker_shape_one_point_is_not_eight():
    sc = {f"cr{i}": (1 if i == 1 else 0) for i in range(1, 14)}   # 1 point, overall_score stored as 7.7 (%)
    r = read_scorecard(sc, 7.7)
    assert r["score"] == 1
    assert r["next_step"] == 1                                   # cr1 = Next Step
    assert r["cr"] == [1] + [0] * 12


def test_next_step_is_not_derived_from_percent():
    sc = {f"cr{i}": (0 if i == 1 else 1) for i in range(1, 14)}  # 12 points, but NO next step
    assert read_scorecard(sc, 92.3)["next_step"] == 0


def test_calculate_scores_exposes_cr_list_and_does_not_invent():
    s = calculate_scores({"cr1": 1, "cr3": "1", "cr5": None, "cr7": "x"})
    assert s["raw_score"] == 2
    assert s["cr"] == [1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]


def test_raw_calls_row_layout_matches_the_reader():
    row, _ = build_raw_calls_row(
        call_id="c1", deal_id="B24-5", manager="Анна", date_str="2026-11-03", dur_sec=95,
        cr=[1] * 8 + [0] * 5, total_score=8, next_step=1, error_summary="e", recommendation="r",
        transcript="t", tenant_id="TNT-X", now=datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc),
    )
    assert len(row) == N_COLUMNS == 38
    # fetch_calls_from_sheets: deal=r[1], manager=r[2], date=r[3], duration=r[4], cr=r[6:19], score=r[19], next=r[20]
    assert (row[1], row[2], row[3], row[4]) == ("B24-5", "Анна", "2026-11-03", "95")
    assert row[6:19] == ["1"] * 8 + ["0"] * 5
    assert (row[19], row[20]) == ("8", "1")
    assert row[29] == "t" and row[35] == "TNT-X"


def test_worker_does_not_save_a_fake_audit_when_gemini_is_silent():
    from apps.api.workers import call_worker

    saved = {}
    with patch.object(call_worker, "download_audio", AsyncMock(return_value=b"x")), \
         patch.object(call_worker, "call_gemini_api", AsyncMock(return_value=None)), \
         patch.object(call_worker, "get_tenant_custom_criteria", return_value=None), \
         patch.object(call_worker, "_park_in_dlq", side_effect=lambda *a, **k: saved.setdefault("dlq", a)), \
         patch.object(call_worker, "SessionLocal", side_effect=AssertionError("must not touch the cabinet DB")), \
         patch.object(call_worker, "sync_to_amocrm", AsyncMock(side_effect=AssertionError("no CRM report"))):
        r = MagicMock()
        r.set = AsyncMock()
        asyncio.run(call_worker.process_call_task(
            {"tenant_id": "TNT-X", "external_call_id": "e1", "audio_url": "u", "crm_source": "amocrm"}, r))
    assert saved["dlq"][0] == "TNT-X" and saved["dlq"][2] == "e1"
    r.set.assert_not_called()   # idempotency key must not be marked COMPLETED
