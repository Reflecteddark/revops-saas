"""
Tests for Defect 4: Telephony webhook gateway auth & BackgroundTasks default dispatch.
Verifies:
- External call to /api/v1/webhooks/{tenant_id}/call without secret -> 403
- External call with wrong secret -> 403
- External call with valid ?secret= or X-Webhook-Secret -> 200, queue_driver == "background_tasks",
  and process_call_audio_task.delay is NOT called by default (REVOPS_USE_CELERY=false)
- With REVOPS_USE_CELERY=true, process_call_audio_task.delay IS called and queue_driver == "celery"
- Passport telephony_call_url, mango_zadarma_sipuni, and setup_instructions.telephony include ?secret=
"""

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.routers import tenants_router, webhooks_router

TEL_SECRET = "tel-secret-token-xyz-987654"

MOCK_TENANTS = {
    "TNT-004": {
        "tenant_id": "TNT-004",
        "tenant_name": "Телефония Клиент",
        "crm_type": "amocrm",
        "status": "active",
        "secret": TEL_SECRET,
    }
}


@pytest.fixture(autouse=True)
def mock_env(monkeypatch):
    def fake_get_config(tid: str):
        return MOCK_TENANTS.get(str(tid).strip().upper())

    monkeypatch.setattr("apps.api.tenant_registry.get_tenant_config", fake_get_config)
    monkeypatch.setattr(tenants_router, "get_tenant_config", fake_get_config)
    monkeypatch.setattr(webhooks_router.manager, "broadcast", AsyncMock())
    monkeypatch.setattr(webhooks_router, "append_call_to_sheets", lambda *a, **k: True)


@pytest.fixture
def ext_client():
    return TestClient(
        app,
        client=("203.0.113.9", 50000),
        headers={"cf-connecting-ip": "203.0.113.9"},
    )


def test_telephony_external_without_or_wrong_secret_rejected_403(ext_client):
    res_no = ext_client.post("/api/v1/webhooks/TNT-004/call", json={"call_id": "c-1", "duration_sec": 60})
    assert res_no.status_code == 403

    res_bad = ext_client.post(
        "/api/v1/webhooks/TNT-004/call?secret=wrong",
        json={"call_id": "c-1", "duration_sec": 60},
    )
    assert res_bad.status_code == 403


def test_telephony_external_with_valid_secret_uses_background_tasks_by_default(ext_client, monkeypatch):
    monkeypatch.delenv("REVOPS_USE_CELERY", raising=False)
    with patch("workers.tasks.process_call_audio_task.delay") as mock_delay:
        res = ext_client.post(
            f"/api/v1/webhooks/TNT-004/call?secret={TEL_SECRET}",
            json={"call_id": "c-ext-ok", "duration_sec": 75, "manager_name": "Иван"},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["queue_driver"] == "background_tasks"
        mock_delay.assert_not_called()

    # Background task executed and updated webhook status to 'success'
    wh = next((w for w in webhooks_router.WEBHOOKS_HISTORY if w["id"] == data["webhook_id"]), None)
    assert wh is not None
    assert wh["status"] == "success"


def test_telephony_with_revops_use_celery_true_dispatches_to_celery(ext_client, monkeypatch):
    monkeypatch.setenv("REVOPS_USE_CELERY", "true")
    mock_task = MagicMock()
    mock_task.id = "celery-opt-in-123"
    with patch("workers.tasks.process_call_audio_task.delay", return_value=mock_task) as mock_delay:
        res = ext_client.post(
            "/api/v1/webhooks/TNT-004/call",
            json={"call_id": "c-celery-ok", "duration_sec": 90},
            headers={"X-Webhook-Secret": TEL_SECRET},
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["queue_driver"] == "celery"
        assert data["task_id"] == "celery-opt-in-123"
        mock_delay.assert_called_once()


def test_passport_telephony_urls_include_secret():
    admin_headers = {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}
    c = TestClient(app)
    res = c.get("/api/v1/tenants/TNT-004/passport", headers=admin_headers)
    assert res.status_code == 200, res.text
    p = res.json()
    expected_suffix = f"/api/v1/webhooks/TNT-004/call?secret={TEL_SECRET}"
    assert p["webhooks"]["telephony_call_url"].endswith(expected_suffix)
    assert p["webhooks"]["mango_zadarma_sipuni"].endswith(expected_suffix)
    assert any(expected_suffix in line for line in p["setup_instructions"]["telephony"])
