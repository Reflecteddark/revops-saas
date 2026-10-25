from unittest.mock import patch, AsyncMock
import pytest
from starlette.testclient import TestClient
from apps.api.main import app
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS


@pytest.fixture
def valid_admin_key():
    return next(iter(ALLOWED_ADMIN_KEYS)) if ALLOWED_ADMIN_KEYS else "secret"


def test_sheets_sync_all_internal_ip():
    """Verify internal Docker IP (like n8n 172.19.0.5) can trigger sync/all without extra auth."""
    with patch("apps.api.routers.sheets_sync_router._get_spreadsheet_id", return_value="mock_sheet_id"), \
         patch("apps.api.routers.sheets_sync_router.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:

        client = TestClient(app, client=("172.19.0.5", 54321))
        response = client.post("/api/v1/sheets/sync/all?tenant_id=TNT-001")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert data["tenant_id"] == "TNT-001"
        assert data["spreadsheet_id"] == "mock_sheet_id"
        assert data["sheets_queued"] == 6
        mock_broadcast.assert_awaited_once()


def test_sheets_sync_all_external_requires_admin_key(valid_admin_key):
    """External requests must have a valid admin key."""
    with patch("apps.api.routers.sheets_sync_router._get_spreadsheet_id", return_value="mock_sheet_id"):

        # 1. External without key -> 401
        client = TestClient(app, client=("198.51.100.1", 54321))
        res_no_key = client.post("/api/v1/sheets/sync/all?tenant_id=TNT-001")
        assert res_no_key.status_code in (401, 403)

        # 2. External with bad key -> 401
        res_bad_key = client.post(
            "/api/v1/sheets/sync/all?tenant_id=TNT-001",
            headers={"X-Admin-Key": "invalid_key_999"}
        )
        assert res_bad_key.status_code in (401, 403)

        # 3. External with valid key -> 200
        res_valid = client.post(
            "/api/v1/sheets/sync/all?tenant_id=TNT-001",
            headers={"X-Admin-Key": valid_admin_key}
        )
        assert res_valid.status_code == 200
        assert res_valid.json()["status"] == "ok"


def test_sheets_sync_subroutes_and_status(valid_admin_key):
    """Check /sync/{sheet_name} and /status endpoints."""
    with patch("apps.api.routers.sheets_sync_router._get_spreadsheet_id", return_value="mock_sheet_id"):

        client = TestClient(app, client=("127.0.0.1", 50000))
        headers = {"X-Admin-Key": valid_admin_key}

        # Deals sync
        r_deals = client.post("/api/v1/sheets/sync/deals?tenant_id=TNT-001", headers=headers)
        assert r_deals.status_code == 200
        assert r_deals.json()["status"] == "queued"
        assert r_deals.json()["sheet"] == "raw_deals"

        # Calls sync
        r_calls = client.post("/api/v1/sheets/sync/calls?tenant_id=TNT-001", headers=headers)
        assert r_calls.status_code == 200
        assert r_calls.json()["status"] == "queued"
        assert r_calls.json()["sheet"] == "raw_calls"

        # Invalid sheet name -> 400
        r_bad = client.post("/api/v1/sheets/sync/invalid_sheet?tenant_id=TNT-001", headers=headers)
        assert r_bad.status_code == 400

        # Status
        r_status = client.get("/api/v1/sheets/status?tenant_id=TNT-001", headers=headers)
        assert r_status.status_code == 200
        assert r_status.json()["status"] == "ok"
        assert r_status.json()["spreadsheet_id"] == "mock_sheet_id"
