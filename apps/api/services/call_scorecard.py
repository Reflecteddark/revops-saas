# -*- coding: utf-8 -*-
"""
One reader for a stored call scorecard.

Two writers store scorecards in different shapes:
- /calls/ingest (n8n): {"cr": [13 x 0/1/None], "score": 0..13 | None, "next_step": 0/1/None, ...}
- the worker (before this fix): {"cr1": 0/1, ..., "cr13": 0/1} and overall_score as a PERCENT.
Readers used to guess (`overall_score > 13` => percent, `overall_score >= 60` => "next step"), which showed
1 point (7.7%) as "8/13", turned every unrated call (stored 0.0) into "0/13" and lost the criteria list.

It also holds the ONE verdict of a call. Quality comes from the score alone (same table as
apps/web/src/lib/thresholds.ts); a missing next step is a separate signal (`next_step`, `at_risk`), it does not turn
a 12/13 call into a failure. A stored status is never trusted: old rows hold statuses from older cut-offs.

A call nobody talked on, or one the AI failed to read, says nothing about the manager: n8n stores both as 13 zeros
and score 0, which used to read as "0/13" and pushed the manager into the risk zone.
"""

from typing import Any

N_CRITERIA = 13

SCORE_HIGH_MIN = 9  # apps/web/src/lib/thresholds.ts (test_call_verdict keeps them equal)
SCORE_MID_MIN = 6

# Exact texts written by n8n node 18: rows made before the flags existed have nothing else to tell them apart.
AUDIT_FAILED_SUMMARY = "JSON parse error from Gemini response"
UNANSWERED_SUMMARY = "Недозвон / IVR автоответчик / короткий сброс"


def call_verdict(kind: str, score: int | None) -> tuple[str, str]:
    """(status, status_label) of a call."""
    if kind == "unanswered":
        return "unanswered", "НЕДОЗВОН"
    if kind == "audit_failed":
        return "audit_failed", "СБОЙ АНАЛИЗА"
    if score is None:
        return "unknown", "НЕТ ДАННЫХ"
    if score >= SCORE_HIGH_MIN:
        return "won", "ЭТАЛОН"
    if score >= SCORE_MID_MIN:
        return "norm", "НОРМА"
    return "risk", "СРЫВ"


def _flag(v: Any) -> bool:
    return str(v).strip() == "1" or v is True


def _kind(sc: dict[str, Any], score: int | None, error_summary: str | None) -> str:
    summary = (error_summary or sc.get("error_summary") or "").strip()
    if _flag(sc.get("audit_failed")) or summary == AUDIT_FAILED_SUMMARY:
        return "audit_failed"
    if _flag(sc.get("is_unanswered")) or summary == UNANSWERED_SUMMARY:
        return "unanswered"
    return "assessed" if score is not None else "unrated"


def _bin(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return 1 if int(v) >= 1 else 0
    except (TypeError, ValueError):
        return None


def read_scorecard(sc: Any, overall_score: float | None, error_summary: str | None = None) -> dict[str, Any]:
    """
    Return {cr, score, next_step, zoom_scheduled, kind, status, status_label, at_risk}.
    Every value is None when it is really unknown. kind: assessed | unanswered | audit_failed | unrated.
    """
    sc = sc if isinstance(sc, dict) else {}

    cr: list[int | None]
    raw_cr = sc.get("cr")
    if isinstance(raw_cr, list) and len(raw_cr) == N_CRITERIA:
        cr = [_bin(v) for v in raw_cr]
    elif any(f"cr{i}" in sc for i in range(1, N_CRITERIA + 1)):
        cr = [_bin(sc.get(f"cr{i}")) for i in range(1, N_CRITERIA + 1)]
    else:
        cr = [None] * N_CRITERIA

    all_known = all(v is not None for v in cr)

    score: int | None
    if "score" in sc:
        # An explicit stored score wins; an explicit None means "not rated" and must stay None
        # (the row's overall_score is 0.0 for those and used to read as a failed call).
        score = None if sc["score"] is None else int(round(float(sc["score"])))
    elif all_known:
        score = sum(v for v in cr if v is not None)
    elif overall_score is not None and (overall_score > 0 or any(v is not None for v in cr)):
        # legacy row without cr: > 13 can only be a percent
        score = int(round(overall_score / 100.0 * N_CRITERIA)) if overall_score > N_CRITERIA else int(round(overall_score))
    else:
        score = None

    next_step = _bin(sc.get("next_step"))
    if next_step is None:
        next_step = cr[0]  # cr1 is "Твёрдый Next Step" (apps/web/src/lib/criteria.ts)

    zoom_scheduled = _bin(sc.get("zoom_scheduled"))

    kind = _kind(sc, score, error_summary)
    if kind != "assessed":
        cr, score, next_step, zoom_scheduled = [None] * N_CRITERIA, None, None, None

    status, status_label = call_verdict(kind, score)
    return {
        "cr": cr,
        "score": score,
        "next_step": next_step,
        "zoom_scheduled": zoom_scheduled,
        "kind": kind,
        "status": status,
        "status_label": status_label,
        "at_risk": status == "risk" or next_step == 0,
    }


def call_texts(kind: str, error_summary: str | None, recommendation: str | None) -> tuple[str, str]:
    """A failed audit has no findings: n8n's technical 'Manual review required' is not advice to a РОП."""
    if kind == "audit_failed":
        return "", ""
    return error_summary or "", recommendation or ""
