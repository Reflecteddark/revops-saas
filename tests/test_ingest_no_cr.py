from pathlib import Path
from unittest.mock import MagicMock, patch
from starlette.testclient import TestClient
from apps.api.main import app
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS

client = TestClient(app, client=("172.16.0.5", 50000))


def test_ingest_call_missing_cr_handled_gracefully():
    """
    P1-3 Acceptance Test:
    When n8n or audio evaluation does not provide 'cr' (or len != 13),
    the endpoint must NOT default to fake [1] * 13.
    Instead:
    - cr = [None] * 13
    - score = None
    - next_step = None
    - status = "unknown"
    - status_label = "НЕТ ДАННЫХ"
    """
    payload = {
        "id": "CALL-NOCR-001",
        "tenant_id": "TNT-001",
        "duration_sec": 180,
        "manager": "Анна",
        "client": "ООО Ромашка",
        "transcript": "Тестовый разговор без распознанных критериев",
        "sync_to_sheets": False,
    }

    valid_key = next(iter(ALLOWED_ADMIN_KEYS)) if ALLOWED_ADMIN_KEYS else "secret"
    response = client.post(
        "/api/v1/calls/ingest",
        json=payload,
        headers={"x-admin-key": valid_key},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    call_obj = data["call"]

    assert call_obj["score"] is None
    assert call_obj["next_step"] is None
    assert call_obj["status"] == "unknown"
    assert call_obj["status_label"] == "НЕТ ДАННЫХ"
    assert call_obj["cr"] == [None] * 13


def test_append_call_to_sheets_missing_cr_formats_empty_strings():
    """
    P1-3 Acceptance Test for Sheets:
    When cr is missing or len != 13, sheets row must contain empty strings
    for criteria, score, and next_step, not '1'.
    """
    from apps.api.routers.calls_router import append_call_to_sheets, CallIngestPayload

    mock_ws = MagicMock()
    mock_ws.col_values.return_value = []
    mock_ws.row_values.return_value = ["CALL-NOCR-002", "", "Анна", "2026-10-24", "180", "presentation"] + [""] * 13 + ["", ""] + [""] * 17

    payload = CallIngestPayload(
        id="CALL-NOCR-002",
        tenant_id="TNT-001",
        duration_sec=180,
        manager="Анна",
        transcript="Разговор без скоринга",
        cr=None,
        score=None,
        next_step=None,
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

        assert mock_ws.append_row.called
        appended_row = mock_ws.append_row.call_args[0][0]
        assert len(appended_row) == 38

        # Columns 7..19 (indices 6..18) are the 13 criteria: must all be ""
        cr_cols = appended_row[6:19]
        assert cr_cols == [""] * 13

        # Column 20 (index 19) is total_score: must be ""
        assert appended_row[19] == ""

        # Column 21 (index 20) is next_step: must be ""
        assert appended_row[20] == ""
