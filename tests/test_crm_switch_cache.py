"""
Test that CRM switch evicts only target tenant cache and preserves other tenants.
"""

from unittest.mock import patch
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.routers.calls_router import _CALLS_CACHE
from apps.api.routers.deals_router import _DEALS_CACHE
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS

client = TestClient(app)
admin_key = next(iter(ALLOWED_ADMIN_KEYS))


def test_admin_crm_switch_scoped_cache():
    """Validates that execute_crm_action(switch_crm) for tenant A preserves tenant B cache."""
    # Pre-populate cache for Tenant A and Tenant B
    _CALLS_CACHE["TNT-A"] = {"timestamp": 12345.0, "calls": [{"id": "call_a"}]}
    _CALLS_CACHE["TNT-B"] = {"timestamp": 12345.0, "calls": [{"id": "call_b"}]}
    _DEALS_CACHE["TNT-A"] = {"timestamp": 12345.0, "deals": [{"id": "deal_a"}]}
    _DEALS_CACHE["TNT-B"] = {"timestamp": 12345.0, "deals": [{"id": "deal_b"}]}

    with patch("subprocess.run") as mock_sub:
        mock_sub.return_value.returncode = 0
        mock_sub.return_value.stdout = ""
        mock_sub.return_value.stderr = ""
        res = client.post(
            "/api/v1/admin/crm/action",
            headers={"X-Admin-Key": admin_key},
            json={
                "tenant_id": "TNT-A",
                "action": "switch_crm",
                "crm_type": "amocrm"
            }
        )
        assert res.status_code == 200

    # Tenant A cache must be evicted
    assert "TNT-A" not in _CALLS_CACHE
    assert "TNT-A" not in _DEALS_CACHE

    # Tenant B cache must be preserved
    assert "TNT-B" in _CALLS_CACHE
    assert _CALLS_CACHE["TNT-B"]["calls"] == [{"id": "call_b"}]
    assert "TNT-B" in _DEALS_CACHE
    assert _DEALS_CACHE["TNT-B"]["deals"] == [{"id": "deal_b"}]
