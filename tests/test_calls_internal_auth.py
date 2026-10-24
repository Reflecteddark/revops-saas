import pytest
from unittest.mock import patch
from starlette.testclient import TestClient
from apps.api.main import app
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS


def test_calls_internal_auth():
    valid_key = next(iter(ALLOWED_ADMIN_KEYS)) if ALLOWED_ADMIN_KEYS else "secret"

    with patch("apps.api.routers.calls_router.fetch_calls_from_sheets", return_value=[]):
        # 1. IP 172.16.0.5 without key -> 200 OK (internal IP)
        c_internal = TestClient(app, client=("172.16.0.5", 50000))
        res = c_internal.post("/api/v1/calls/sync_sheets?tenant_id=TNT-001")
        assert res.status_code == 200, f"Expected 200 for internal IP, got {res.status_code}"

        # 2. IP 172.64.0.1 without key -> 403 Forbidden (external IP)
        c_cf = TestClient(app, client=("172.64.0.1", 50000))
        res = c_cf.post("/api/v1/calls/sync_sheets?tenant_id=TNT-001")
        assert res.status_code == 403, f"Expected 403 for external 172.64.0.1, got {res.status_code}"

        # 3. IP 8.8.8.8 with invalid key -> 403 Forbidden
        c_ext_bad = TestClient(app, client=("8.8.8.8", 50000))
        res = c_ext_bad.post(
            "/api/v1/calls/sync_sheets?tenant_id=TNT-001",
            headers={"X-Admin-Key": "wrong-key-12345"}
        )
        assert res.status_code == 403, f"Expected 403 for wrong key, got {res.status_code}"

        # 4. IP 8.8.8.8 with valid key -> 200 OK
        c_ext_good = TestClient(app, client=("8.8.8.8", 50000))
        res = c_ext_good.post(
            "/api/v1/calls/sync_sheets?tenant_id=TNT-001",
            headers={"X-Admin-Key": valid_key}
        )
        assert res.status_code == 200, f"Expected 200 with valid key, got {res.status_code}"

        # 5. Invalid IP ("not-an-ip") -> 403 Forbidden (not 500!)
        c_invalid = TestClient(app, client=("not-an-ip", 50000))
        res = c_invalid.post("/api/v1/calls/sync_sheets?tenant_id=TNT-001")
        assert res.status_code == 403, f"Expected 403 for invalid IP string, got {res.status_code}"
