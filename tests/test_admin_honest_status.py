"""Admin panel answers must not claim success for work that was not done."""
import os
from unittest.mock import patch

from fastapi.testclient import TestClient

from apps.api.main import app

client = TestClient(app, client=("172.16.0.5", 50000))
HEADERS = {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}


def test_switch_crm_without_registry_write_does_not_run_sheet_reset():
    with patch("apps.api.tenant_registry.get_tenants_registry_path", return_value=None), \
         patch("apps.api.tenant_registry.get_all_candidate_registry_paths", return_value=[]), \
         patch("subprocess.run") as run:
        res = client.post(
            "/api/v1/admin/crm/action",
            headers=HEADERS,
            json={"tenant_id": "TNT-NOPE", "action": "switch_crm", "crm_type": "amocrm"},
        )
    assert res.status_code == 200
    assert res.json()["success"] is False
    run.assert_not_called()  # the reset script wipes raw_deals / raw_calls


def test_healer_actions_fail_when_healer_is_not_installed(monkeypatch):
    from apps.api.routers import admin_router

    monkeypatch.setattr(admin_router, "MY_AI_CREW_DIR", admin_router.Path("/nonexistent-crew-dir"))
    for action in ("run_now", "status", "install", "uninstall"):
        body = client.post("/api/v1/admin/healer/action", headers=HEADERS, json={"action": action}).json()
        assert body["success"] is False, action


def test_scheduler_install_and_uninstall_fail_inside_a_linux_container(monkeypatch):
    monkeypatch.setattr("sys.platform", "linux")
    for action in ("install_daily", "uninstall_daily"):
        body = client.post("/api/v1/admin/tasks/action", headers=HEADERS, json={"action": action}).json()
        assert body["success"] is False, action


def test_status_does_not_hardcode_gemini_as_connected():
    body = client.get("/api/v1/admin/status", headers=HEADERS).json()
    assert "🟢" not in body["gemini_ai"]["status_label"]


def test_doctor_does_not_claim_unchecked_things():
    from apps.api.routers import admin_router

    cfg = {"tenant_id": "TNT-DOC", "tenant_name": "Doc", "crm_type": "bitrix24"}
    with patch("apps.api.tenant_registry.get_tenant_config", return_value=cfg):
        body = admin_router.get_tenant_health_doctor("TNT-DOC")
    checks = {c["key"]: c for c in body["checks"]}
    assert checks["gemini"]["status"] != "ok"
    assert checks["crm"]["status"] != "ok"  # no webhook configured
    assert body["report"]["formula_integrity"]["status"] == "NOT_CHECKED"
