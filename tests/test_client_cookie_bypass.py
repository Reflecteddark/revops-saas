"""
The `revops_client_auth` cookie is a random string that the server never validates.
Presence of that cookie alone must NOT grant access to any tenant's data.
"""

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from packages.database.models import UserRole

# Simulate a request coming from the internet through the Cloudflare tunnel
# (TestClient is otherwise treated as a trusted local admin by verify_admin_access).
EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}


@pytest.fixture
def client():
    return TestClient(app)


@pytest.mark.parametrize("path", [
    "/api/v1/deals?tenant_id=TNT-002",
    "/api/v1/deals/performance/reps?tenant_id=TNT-002",
    "/api/v1/deals/pipelines?tenant_id=TNT-002",
])
def test_forged_client_cookie_cannot_read_deals(client, path):
    client.cookies.set("revops_client_auth", "anything-at-all")
    res = client.get(path, headers=EXTERNAL)
    assert res.status_code in (401, 403), f"{path} -> {res.status_code}: {res.text[:200]}"


def test_forged_client_cookie_cannot_read_calls(client):
    client.cookies.set("revops_client_auth", "anything-at-all")
    res = client.get("/api/v1/calls/data?tenant_id=TNT-001", headers=EXTERNAL)
    assert res.status_code == 401, res.text[:200]


def test_real_jwt_still_works_for_own_tenant(client):
    token = create_access_token(
        {"sub": "usr-tnt-001", "tenant_id": "TNT-001", "role": UserRole.CEO.value,
         "email": "user@tenant1.test"}
    )
    res = client.get("/api/v1/deals?tenant_id=TNT-001", headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text[:200]


def test_real_jwt_cannot_read_foreign_tenant_deals(client):
    token = create_access_token(
        {"sub": "usr-tnt-001", "tenant_id": "TNT-001", "role": UserRole.CEO.value,
         "email": "user@tenant1.test"}
    )
    res = client.get("/api/v1/deals?tenant_id=TNT-002", headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    assert res.status_code == 403
