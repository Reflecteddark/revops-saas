"""Регрессия: /api/v1/deals не должен падать с 500."""
from fastapi.testclient import TestClient
from apps.api.main import app

client = TestClient(app)


def test_admin_router_imports_cleanly():
    from apps.api.routers import admin_router
    assert admin_router.router is not None


def test_app_imports_cleanly():
    assert app is not None


def test_deals_endpoint_returns_200():
    res = client.get("/api/v1/deals?tenant_id=TNT-001")
    assert res.status_code == 200, f"API упал: {res.status_code} {res.text[:200]}"
    assert "deals" in res.json()
