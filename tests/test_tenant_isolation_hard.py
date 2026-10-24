"""
Tenant Hardening & Namespace Isolation Tests (P0-Tenant-1, P0-Tenant-2, P0-Tenant-3, P0-Tenant-4).
Guarantees:
1. Newly registered tenants strictly use TNT-XXX namespace.
2. Tenant.spreadsheet_id defaults to None (no 1KoKhFJR... fallback).
3. generate_tenant_id avoids collisions even when intermediate tenants are offboarded/deleted.
"""
import uuid
import pytest
from starlette.testclient import TestClient
from apps.api.main import app
from apps.api.tenant_provisioner import generate_tenant_id
from packages.database.session import SessionLocal
from packages.database.models import Tenant

client = TestClient(app)

LEGACY_SPREADSHEET_FALLBACK = "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk"


def test_register_tenant_namespace_and_clean_spreadsheet():
    """P0-Tenant-2, P0-Tenant-4: Tenant IDs start with TNT- and have spreadsheet_id = None."""
    random_suffix = uuid.uuid4().hex[:6]
    payload = {
        "company_name": f"Isolation Test Co {random_suffix}",
        "admin_name": f"Admin {random_suffix}",
        "admin_email": f"admin_{random_suffix}@isolation-test.ru",
        "password": "SecurePassword123!"
    }
    res = client.post("/api/v1/auth/register-tenant", json=payload)
    assert res.status_code == 200, f"Registration failed: {res.text}"
    data = res.json()
    tenant_id = data["tenant_id"]

    # 1. Verify TNT- namespace
    assert tenant_id.startswith("TNT-"), f"Tenant ID must start with TNT-, got {tenant_id}"
    parts = tenant_id.split("-")
    assert len(parts) == 2 and parts[1].isdigit(), f"Tenant ID must be TNT-XXX format, got {tenant_id}"

    # 2. Verify database model has spreadsheet_id = None (zero fallback to legacy sheet)
    db = SessionLocal()
    try:
        t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        assert t is not None
        assert t.spreadsheet_id is None, f"Expected None, got {t.spreadsheet_id}"
        assert t.spreadsheet_id != LEGACY_SPREADSHEET_FALLBACK
        assert t.to_registry_dict().get("spreadsheet_id") is None
    finally:
        db.close()


def test_generate_tenant_id_collision_avoidance_on_offboard():
    """P0-Tenant-1: ID generator searches for max numeric suffix, preventing reuse of deleted IDs."""
    # Simulate a registry where TNT-002 was offboarded/deleted, leaving TNT-001 and TNT-005
    simulated_registry = {
        "tenants": [
            {"tenant_id": "TNT-001", "name": "Company 1"},
            {"tenant_id": "TNT-005", "name": "Company 5"},
        ]
    }
    # With len + 1 logic, it would have returned TNT-003, which could collide.
    # With max_id + 1, it must return at least TNT-006.
    next_id = generate_tenant_id(simulated_registry)
    num_part = int(next_id.split("-")[1])
    assert num_part >= 6, f"Expected numeric suffix >= 6, got {next_id}"
