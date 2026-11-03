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


@pytest.mark.parametrize("proxy_header", ["cf-connecting-ip", "x-forwarded-for", "x-real-ip", "forwarded"])
def test_tunnel_traffic_from_docker_gateway_is_not_internal(proxy_header):
    """Public requests arrive via the Cloudflare tunnel from the docker gateway (172.19.0.1): not internal."""
    gateway = TestClient(app, client=("172.19.0.1", 50000))
    with patch("apps.api.routers.calls_router.fetch_calls_from_sheets", return_value=[]):
        res = gateway.post("/api/v1/calls/sync_sheets?tenant_id=TNT-001", headers={proxy_header: "203.0.113.7"})
    assert res.status_code == 403, f"{proxy_header}: expected 403, got {res.status_code}"

    res = gateway.get("/api/v1/sheets/status", headers={proxy_header: "203.0.113.7"})
    assert res.status_code == 401, f"{proxy_header}: expected 401, got {res.status_code}"


def test_direct_docker_call_stays_internal():
    """n8n -> revops-api inside the docker network carries no proxy headers and keeps working."""
    n8n = TestClient(app, client=("172.19.0.6", 50000))
    assert n8n.get("/api/v1/sheets/status").status_code == 200
