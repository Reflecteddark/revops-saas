from pathlib import Path
from unittest.mock import MagicMock, patch
from apps.api.routers.calls_router import fetch_calls_from_sheets, _CALLS_CACHE


def test_fetch_calls_from_sheets_preserves_none_and_calculates_full():
    """
    Verifies that fetch_calls_from_sheets accurately preserves None for unaudited calls
    (where cr1..cr13='', score='', next_step='') without falsely classifying them as risk / leak (score=0),
    and correctly parses full audited calls.
    """
    tenant = "TNT-TEST-ROUNDTRIP"
    _CALLS_CACHE.pop(tenant, None)

    # Row 0: Header
    header = [
        "call_id", "deal_id", "manager", "date", "duration_sec", "call_type",
        "cr1", "cr2", "cr3", "cr4", "cr5", "cr6", "cr7", "cr8", "cr9", "cr10", "cr11", "cr12", "cr13",
        "score", "next_step", "error_summary", "recommendation", "synced_at", "empty",
        "date_dup", "ver", "author", "hash", "transcript", "deal_risk", "rank",
        "hour", "flag1", "flag2", "tenant_id", "flag3", "flag4"
    ]

    # Row 1: Unaudited call (cr[6:19]="", score="", next_step="")
    row_none = [
        "CALL-NONE-001", "DEAL-NONE-1", "Менеджер 1", "2026-10-24", "180", "presentation",
        "", "", "", "", "", "", "", "", "", "", "", "", "",  # cols 6..18: empty cr
        "",  # col 19: empty score
        "",  # col 20: empty next_step
        "", "", "2026-10-24", "", "2026-10-24", "V20.0", "AI Supervisor", "hash1",
        "Транскрипт 1", "0", "Middle", "12", "1", "0", tenant, "0", "0"
    ]

    # Row 2: Full audited call (cr[6:19]="1", score="11", next_step="1")
    row_won = [
        "CALL-WON-002", "DEAL-WON-2", "Менеджер 2", "2026-10-24", "240", "presentation",
        "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "0", "0",  # cols 6..18: 11 criteria
        "11",  # col 19: score
        "1",   # col 20: next_step
        "", "", "2026-10-24", "", "2026-10-24", "V20.0", "AI Supervisor", "hash2",
        "Транскрипт 2", "0", "Middle", "14", "1", "0", tenant, "0", "0"
    ]

    mock_ws = MagicMock()
    # Note: data rows are header + row_none + row_won
    mock_ws.get_all_values.return_value = [header, row_none, row_won]

    with patch("apps.api.routers.calls_router.get_service_account_path", return_value=Path("/mock/sa.json")), \
         patch("gspread.service_account") as mock_sa, \
         patch("apps.api.routers.calls_router.get_tenant_spreadsheet_id", return_value="mock_sheet_id"), \
         patch("apps.api.routers.calls_router.get_cached_json_sync", return_value=None), \
         patch("apps.api.routers.calls_router.set_cached_json_sync"), \
         patch("apps.api.routers.calls_router.get_deals_lookup", return_value={}):

        mock_gc = MagicMock()
        mock_sa.return_value = mock_gc
        mock_sh = MagicMock()
        mock_sh.worksheet.return_value = mock_ws
        mock_gc.open_by_key.return_value = mock_sh

        calls = fetch_calls_from_sheets(tenant_id=tenant, limit=50)

        # Reverse order: row_won is first, row_none is second
        assert len(calls) == 2

        call_none = next(c for c in calls if c["id"] == "CALL-NONE-001")
        assert call_none["score"] is None, f"Expected score=None, got {call_none['score']}"
        assert call_none["cr"] == [None] * 13, f"Expected cr=[None]*13, got {call_none['cr']}"
        assert call_none["next_step"] is None, f"Expected next_step=None, got {call_none['next_step']}"
        assert call_none["status"] == "unknown", f"Expected status='unknown', got {call_none['status']}"
        assert call_none["status_label"] == "НЕТ ДАННЫХ", f"Expected status_label='НЕТ ДАННЫХ', got {call_none['status_label']}"
        assert call_none["risk_amount"] == "0 ₽", f"Expected risk_amount='0 ₽', got {call_none['risk_amount']}"

        call_won = next(c for c in calls if c["id"] == "CALL-WON-002")
        assert call_won["score"] == 11, f"Expected score=11, got {call_won['score']}"
        assert call_won["next_step"] == 1, f"Expected next_step=1, got {call_won['next_step']}"
        assert call_won["status"] == "won", f"Expected status='won', got {call_won['status']}"
        assert call_won["status_label"] == "ЭТАЛОН", f"Expected status_label='ЭТАЛОН', got {call_won['status_label']}"
