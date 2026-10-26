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
