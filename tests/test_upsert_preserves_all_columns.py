from pathlib import Path
from unittest.mock import MagicMock, patch
from apps.api.routers.calls_router import append_call_to_sheets, CallIngestPayload


def test_upsert_updates_all_38_columns_range_al():
    """
    P1-2 Acceptance Test:
    When updating an existing call (upsert), ws.update must target A{row}:AL{row}
    (all 38 columns), preventing truncation or wiping of columns AA..AL.
    """
    mock_ws = MagicMock()
    # Mock col_values returning existing call at index 0 -> row 1
    mock_ws.col_values.return_value = ["CALL-UPSERT-001"]

    # Mock read_back for Read-After-Write verification
    mock_row_values = [
        "CALL-UPSERT-001", "DEAL-1", "Анна", "2026-10-24", "120", "presentation",
        "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1",
        "13", "1", "Ошибок нет", "Продолжать", "2026-10-24", "", "2026-10-24",
        "V20.0", "AI Supervisor (n8n)", "sha256_abcdef", "Полный транскрипт",
        "0", "Middle", "14", "1", "0", "TNT-001", "0", "0"
    ]
    mock_ws.row_values.return_value = mock_row_values

    payload = CallIngestPayload(
        id="CALL-UPSERT-001",
        deal_id="DEAL-1",
        tenant_id="TNT-001",
        duration_sec=120,
        manager="Анна",
        transcript="Полный транскрипт",
        cr=[1] * 13,
        score=13,
        next_step=1,
    )

    with patch("apps.api.routers.calls_router.get_service_account_path", return_value=Path("/mock/sa.json")), \
         patch("gspread.service_account") as mock_sa, \
         patch("apps.api.routers.calls_router.get_tenant_spreadsheet_id", return_value="mock_sheet_id"):
        mock_gc = MagicMock()
        mock_sa.return_value = mock_gc
        mock_sh = MagicMock()
        mock_sh.worksheet.return_value = mock_ws
        mock_gc.open_by_key.return_value = mock_sh

        result = append_call_to_sheets(payload)
        assert result is True

        # ws.update must be called for range A1:AL1 (or A{row}:AL{row})
        assert mock_ws.update.called
        update_call = mock_ws.update.call_args
        range_arg = update_call[0][0]
        values_arg = update_call[0][1]

        assert range_arg == "A1:AL1", f"Expected range A1:AL1, got {range_arg}"
        assert len(values_arg[0]) == 38, f"Expected 38 columns in values, got {len(values_arg[0])}"
        # Check transcript (col 30, index 29) and tenant_id (col 36, index 35)
        assert values_arg[0][29] == "Полный транскрипт"
        assert values_arg[0][35] == "TNT-001"
