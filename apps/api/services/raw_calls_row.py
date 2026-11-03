# -*- coding: utf-8 -*-
"""
The 38-column `raw_calls` row (A..AL) in ONE place.

It used to exist twice: /calls/ingest wrote it (cr1..cr13 in G..S, score in T, next step in U) and
sheets_batch_syncer wrote a different, shorter layout (phone in C, score in R) — so the same sheet got two
incompatible kinds of rows and fetch_calls_from_sheets read the syncer's rows as garbage.
"""

import hashlib
from datetime import datetime
from typing import Any, Sequence

N_COLUMNS = 38  # A..AL


def build_raw_calls_row(
    *,
    call_id: str,
    deal_id: str,
    manager: str,
    date_str: str,
    dur_sec: int,
    cr: Sequence[Any],
    total_score: Any,
    next_step: Any,
    error_summary: str,
    recommendation: str,
    transcript: str,
    tenant_id: str,
    now: datetime,
) -> tuple[list[str], str]:
    """Return (row, sha256 hex of call:manager:score:duration:next_step)."""
    hash_out = hashlib.sha256(f"{call_id}:{manager}:{total_score}:{dur_sec}:{next_step}".encode()).hexdigest()
    row = [
        call_id,
        deal_id,
        manager,
        date_str,
        str(dur_sec),
        "presentation",
        *[str(c) if c is not None else "" for c in cr],
        str(total_score) if total_score is not None else "",
        str(next_step) if next_step is not None else "",
        error_summary,
        recommendation,
        now.strftime("%Y-%m-%d %H:%M:%S"),
        "",
        date_str[:10],
        "V20.0",
        "AI Supervisor (n8n)",
        f"sha256_{hash_out[:12]}",
        transcript,
        "0",
        "Middle",
        str(now.hour),
        "1",
        "0",
        tenant_id,
        "0",
        "0",
    ]
    assert len(row) == N_COLUMNS, len(row)
    return row, hash_out
