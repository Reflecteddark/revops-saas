"""A private source address is not an admin credential: every caller of a published Docker port shares the gateway IP."""
import os

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app


@pytest.mark.parametrize("ip", ["172.19.0.1", "192.168.65.1", "10.0.0.5", "127.0.0.1"])
def test_private_ip_without_credentials_is_rejected(ip, monkeypatch):
    monkeypatch.setenv("REVOPS_ENV", "prod")
    assert TestClient(app, client=(ip, 50000)).get("/api/v1/admin/status").status_code == 403


def test_private_ip_with_admin_key_is_allowed(monkeypatch):
    monkeypatch.setenv("REVOPS_ENV", "prod")
    headers = {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}
    assert TestClient(app, client=("172.19.0.1", 50000)).get("/api/v1/admin/status", headers=headers).status_code == 200
