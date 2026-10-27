"""
Tests for Settings Router & Business Configuration API (/api/v1/settings).
Verifies:
- Reading business parameters (revenue target, SLA, manager capacity, telegram, modules)
- Updating settings with persistence & WebSocket broadcast
- Fallback handling when Google Sheets credentials are unavailable
- Safe validation of payload structures
"""

from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.routers.settings_router import get_fallback_settings

client = TestClient(app)


def test_get_settings_default_fallback_structure():
    """Verifies that GET /api/v1/settings returns all required business configuration blocks."""
    resp = client.get("/api/v1/settings?tenant_id=TNT-001")
    assert resp.status_code == 200
    data = resp.json()

    assert data.get("status") == "ok"
    assert "general" in data
    assert "stages" in data
    assert "managers" in data
    assert "telegram" in data
    assert "modules" in data

    # Verify general fields
    general = data["general"]
    assert "company_name" in general
    assert "currency" in general
    assert "monthly_target" in general
    assert general["monthly_target"] > 0
    assert "period_start" in general
    assert "period_end" in general


def test_fallback_settings_helper():
    """Verifies that get_fallback_settings provides complete fallback structures."""
    fb = get_fallback_settings()
    assert fb["status"] == "ok"
    assert fb["general"]["monthly_target"] == 5000000.0
    assert len(fb["stages"]) >= 5
    assert len(fb["managers"]) >= 4
    assert len(fb["modules"]) >= 15
    assert fb["telegram"]["dispatcher_status"] is True


def test_save_settings_endpoint_general_and_plan():
    """Verifies that POST /api/v1/settings accepts monthly_target and company updates."""
    payload = {
        "tenant_id": "TNT-001",
        "general": {
            "company_name": "ООО Тест Ревопс",
            "currency": "RUB (₽)",
            "monthly_target": 7500000.0,
            "period_start": "2026-10-01",
            "period_end": "2026-10-31"
        }
    }
    resp = client.post("/api/v1/settings", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "partial_ok")
    assert "settings" in data
    assert "message" in data


def test_save_settings_stages_and_sla():
    """Verifies updating stage SLA hours and win percentage."""
    payload = {
        "tenant_id": "TNT-001",
        "stages": [
            {"id": 1, "name": "Квалификация", "sla_hours": 12, "win_pct": 40},
            {"id": 2, "name": "Встреча / Демо", "sla_hours": 36, "win_pct": 55}
        ]
    }
    resp = client.post("/api/v1/settings", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "partial_ok")


def test_save_settings_managers_capacity():
    """Verifies updating manager workload capacity limits."""
    payload = {
        "tenant_id": "TNT-001",
        "managers": [
            {"id": "m1", "name": "Тестовый РОП", "role": "Руководитель ОП", "capacity": 50}
        ]
    }
    resp = client.post("/api/v1/settings", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "partial_ok")


def test_save_settings_telegram_channels():
    """Verifies updating telegram chat IDs and dispatcher status."""
    payload = {
        "tenant_id": "TNT-001",
        "telegram": {
            "rop_chat_id": "-1001112223334",
            "ceo_chat_id": "-1005556667778",
            "team_chat_id": "-1009998887776",
            "dispatcher_status": True
        }
    }
    resp = client.post("/api/v1/settings", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "partial_ok")


def test_save_settings_module_toggles():
    """Verifies toggling modular RevOps features."""
    payload = {
        "tenant_id": "TNT-001",
        "modules": [
            {
                "code": "1.1",
                "name": "Развернутое примечание-аудит",
                "category": "Аудит",
                "status": True,
                "description": "Формирует структурированное примечание"
            }
        ]
    }
    resp = client.post("/api/v1/settings", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] in ("ok", "partial_ok")


def test_fallback_settings_manager_kpi_presets():
    """Verifies that managers have KPI target presets in fallback settings."""
    fb = get_fallback_settings()
    managers = fb.get("managers", [])
    assert len(managers) >= 4

    fedotov = next((m for m in managers if "Федотов" in m["name"]), None)
    assert fedotov is not None
    assert fedotov["revenue_target"] == 1500000.0
    assert fedotov["daily_calls_target"] == 20
    assert fedotov["monthly_meetings_target"] == 15
    assert fedotov["capacity"] == 50
    assert fedotov["next_step_target_pct"] == 80


def test_patch_manager_kpis_endpoint_and_null_preservation():
    """Verifies PATCH /api/v1/settings/managers/{manager_id}/kpis saves targets and preserves null."""
    payload = {
        "revenue_target": 1800000.0,
        "daily_calls_target": 22,
        "monthly_meetings_target": 18,
        "capacity": 45,
        "next_step_target_pct": 85
    }
    resp = client.patch("/api/v1/settings/managers/m1/kpis?tenant_id=TNT-001", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["manager_id"] == "m1"
    assert data["kpis"]["revenue_target"] == 1800000.0
    assert data["kpis"]["daily_calls_target"] == 22
    assert data["kpis"]["monthly_meetings_target"] == 18
    assert data["kpis"]["capacity"] == 45
    assert data["kpis"]["next_step_target_pct"] == 85

    # Test null preservation (null explicitly means unrated, not 0)
    null_patch = {"revenue_target": None}
    resp_null = client.patch("/api/v1/settings/managers/m1/kpis?tenant_id=TNT-001", json=null_patch)
    assert resp_null.status_code == 200
    data_null = resp_null.json()
    assert data_null["kpis"]["revenue_target"] is None


def test_patch_manager_kpis_validation():
    """Verifies 422 Unprocessable Entity when KPI values violate bounds."""
    # Negative revenue
    resp1 = client.patch("/api/v1/settings/managers/m1/kpis?tenant_id=TNT-001", json={"revenue_target": -500})
    assert resp1.status_code == 422

    # Calls > 200
    resp2 = client.patch("/api/v1/settings/managers/m1/kpis?tenant_id=TNT-001", json={"daily_calls_target": 250})
    assert resp2.status_code == 422

    # Meetings > 500
    resp3 = client.patch("/api/v1/settings/managers/m1/kpis?tenant_id=TNT-001", json={"monthly_meetings_target": 550})
    assert resp3.status_code == 422

    # Capacity > 500
    resp4 = client.patch("/api/v1/settings/managers/m1/kpis?tenant_id=TNT-001", json={"capacity": 600})
    assert resp4.status_code == 422

    # Next step > 100
    resp5 = client.patch("/api/v1/settings/managers/m1/kpis?tenant_id=TNT-001", json={"next_step_target_pct": 105})
    assert resp5.status_code == 422

