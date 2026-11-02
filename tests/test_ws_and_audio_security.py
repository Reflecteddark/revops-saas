"""
WebSocket live stream (/ws/org/{org_id}) must require auth for that tenant and reject
cross-site origins; new call recordings must get unguessable file names
(their URL is the only protection, since amoCRM and n8n fetch it without our login).
"""

import re

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from apps.api.auth import create_access_token
from apps.api.main import app
from packages.database.models import UserRole


def _jwt(tenant, role=UserRole.CEO.value):
    return create_access_token({"sub": f"usr-{tenant.lower()}", "tenant_id": tenant,
                                "role": role, "email": f"u@{tenant.lower()}.test"})


def _connect_and_ping(client, path, headers=None):
    with client.websocket_connect(path, headers=headers or {}) as ws:
        ws.send_text("ping")
        return ws.receive_json()


def test_anonymous_ws_rejected():
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect):
        _connect_and_ping(client, "/ws/org/TNT-002")


def test_ws_foreign_tenant_rejected():
    client = TestClient(app)
    client.cookies.set("access_token", _jwt("TNT-001"))
    with pytest.raises(WebSocketDisconnect):
        _connect_and_ping(client, "/ws/org/TNT-002")


def test_ws_own_tenant_via_cookie_works():
    client = TestClient(app)
    client.cookies.set("access_token", _jwt("TNT-001"))
    msg = _connect_and_ping(client, "/ws/org/TNT-001", headers={"origin": "https://app.ai-rop.ru"})
    assert msg["type"] == "pong"


def test_ws_admin_jwt_can_watch_any_tenant():
    client = TestClient(app)
    client.cookies.set("access_token", _jwt("TNT-001", role="admin"))
    assert _connect_and_ping(client, "/ws/org/TNT-002")["type"] == "pong"


def test_ws_cross_site_origin_rejected_even_with_cookie():
    """Cookies are SameSite=None, so a foreign page could otherwise hijack the victim's stream."""
    client = TestClient(app)
    client.cookies.set("access_token", _jwt("TNT-001"))
    with pytest.raises(WebSocketDisconnect):
        _connect_and_ping(client, "/ws/org/TNT-001", headers={"origin": "https://evil.example"})


def test_ws_garbage_token_rejected():
    client = TestClient(app)
    client.cookies.set("access_token", "not-a-jwt")
    with pytest.raises(WebSocketDisconnect):
        _connect_and_ping(client, "/ws/org/TNT-001")


def test_audio_filenames_are_unguessable():
    from apps.api.routers.calls_router import new_audio_filename

    names = {new_audio_filename("TNT-004", ".mp3") for _ in range(200)}
    assert len(names) == 200
    for n in names:
        assert re.fullmatch(r"tnt-004_[0-9a-f]{32}\.mp3", n), n
