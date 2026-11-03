# -*- coding: utf-8 -*-
"""
One reader for a stored call scorecard.

Two writers store scorecards in different shapes:
- /calls/ingest (n8n): {"cr": [13 x 0/1/None], "score": 0..13 | None, "next_step": 0/1/None, ...}
- the worker (before this fix): {"cr1": 0/1, ..., "cr13": 0/1} and overall_score as a PERCENT.
Readers used to guess (`overall_score > 13` => percent, `overall_score >= 60` => "next step"), which showed
1 point (7.7%) as "8/13", turned every unrated call (stored 0.0) into "0/13" and lost the criteria list.
"""

from typing import Any

N_CRITERIA = 13


def _bin(v: Any) -> int | None:
    if v is None or v == "":
        return None
    try:
        return 1 if int(v) >= 1 else 0
    except (TypeError, ValueError):
        return None


def read_scorecard(sc: Any, overall_score: float | None) -> dict[str, Any]:
    """Return {cr, score, next_step, zoom_scheduled}; every value is None when it is really unknown."""
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

    return {
        "cr": cr,
        "score": score,
        "next_step": next_step,
        "zoom_scheduled": _bin(sc.get("zoom_scheduled")),
    }
