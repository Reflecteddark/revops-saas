# -*- coding: utf-8 -*-
"""
RevOps Enterprise OS - CRM Users Sync & Auto-Import Unit Tests.
Tests:
- clean_domain and clean_webhook_url normalizers
- fetch_amocrm_users with active/inactive filtering and ROP role detection
- fetch_bitrix24_users with name concatenation and ROP detection
- sync_tenant_crm_managers preserving existing manager targets and applying defaults
- POST /api/v1/settings/managers/sync endpoint
"""

import pytest
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services.crm_users_sync import (
    clean_domain,
    clean_webhook_url,
    fetch_amocrm_users,
    fetch_bitrix24_users,
    sync_tenant_crm_managers,
)

client = TestClient(app)


def test_clean_domain():
    assert clean_domain("https://example.amocrm.ru/") == "example.amocrm.ru"
    assert clean_domain("HTTP://COMPANY.AMOCRM.RU") == "company.amocrm.ru"
    assert clean_domain("subdomain.amocrm.ru") == "subdomain.amocrm.ru"
    assert clean_domain(None) == ""


def test_clean_webhook_url():
    assert clean_webhook_url("https://b24.bitrix24.ru/rest/1/token/") == "https://b24.bitrix24.ru/rest/1/token"
    assert clean_webhook_url(None) == ""


def test_fetch_amocrm_users_mocked():
    async def _test():
        mock_amocrm_data = {
            "_embedded": {
                "users": [
                    {
                        "id": 11422686,
                        "name": "Дмитрий Федотов",
                        "email": "fedotov@example.com",
                        "rights": {"is_admin": True, "is_active": True},
                    },
                    {
                        "id": 11422799,
                        "name": "Алексей Иванов",
                        "email": "ivanov@example.com",
                        "rights": {"is_admin": False, "is_active": True},
                    },
                    {
                        "id": 99999999,
                        "name": "Уволенный Сотрудник",
                        "email": "fired@example.com",
                        "rights": {"is_active": False},
                    },
                ]
            }
        }

        mock_client = AsyncMock()
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: mock_amocrm_data
        mock_client.get.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client

        with patch("httpx.AsyncClient", return_value=mock_client):
            users = await fetch_amocrm_users("test.amocrm.ru", "valid-token")

            assert len(users) == 2
            # Fired user must be excluded
            assert not any(u["id"] == "99999999" for u in users)

            # Admin / ROP detected
            dmitry = next(u for u in users if u["id"] == "11422686")
            assert dmitry["role"] == "РОП / Клоузер"

            # Regular manager
            alexey = next(u for u in users if u["id"] == "11422799")
            assert alexey["role"] == "Менеджер ОП"

    import asyncio
    asyncio.run(_test())


def test_fetch_bitrix24_users_mocked():
    async def _test():
        mock_b24_data = {
            "result": [
                {
                    "ID": "42",
                    "NAME": "Иван",
                    "LAST_NAME": "Сергеев",
                    "WORK_POSITION": "Руководитель отдела продаж",
                    "EMAIL": "ivan@example.com",
                },
                {
                    "ID": "43",
                    "NAME": "Анна",
                    "LAST_NAME": "Смирнова",
                    "WORK_POSITION": "Ведущий менеджер",
                    "EMAIL": "anna@example.com",
                },
            ]
        }

        mock_client = AsyncMock()
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json = lambda: mock_b24_data
        mock_client.post.return_value = mock_resp
        mock_client.__aenter__.return_value = mock_client

        with patch("httpx.AsyncClient", return_value=mock_client):
            users = await fetch_bitrix24_users("https://test.bitrix24.ru/rest/1/token")

            assert len(users) == 2
            ivan = next(u for u in users if u["id"] == "42")
            assert ivan["name"] == "Иван Сергеев"
            assert ivan["role"] == "РОП / Клоузер"

            anna = next(u for u in users if u["id"] == "43")
            assert anna["name"] == "Анна Смирнова"
            assert anna["role"] == "Ведущий менеджер"

    import asyncio
    asyncio.run(_test())


def test_sync_tenant_crm_managers_preserves_targets():
    async def _test():
        mock_tenant_cfg = {
            "tenant_id": "TNT-TEST",
            "crm_type": "amocrm",
            "amo_domain": "reflecteddark.amocrm.ru",
            "amo_token": "mock-token",
            "managers": [
                {
                    "id": "11422686",
                    "name": "Дмитрий Федотов",
                    "role": "РОП / Клоузер",
                    "capacity": 50,
                    "revenue_target": 1500000.0,
                    "daily_calls_target": 25,
                    "daily_dials_target": 45,
                    "monthly_meetings_target": 20,
                    "meetings_enabled": True,
                    "next_step_target_pct": 85,
                }
            ],
            "manager_kpis": {
                "11422686": {
                    "revenue_target": 1500000.0,
                    "daily_calls_target": 25,
                    "daily_dials_target": 45,
                    "monthly_meetings_target": 20,
                    "meetings_enabled": True,
                    "capacity": 50,
                    "next_step_target_pct": 85,
                }
            },
        }

        mock_crm_fetched = [
            {"id": "11422686", "name": "Дмитрий Федотов", "role": "РОП / Клоузер", "email": "d@test.com"},
            {"id": "11422799", "name": "Алексей Иванов", "role": "Менеджер ОП", "email": "a@test.com"},
        ]

        with patch("apps.api.tenant_registry.get_tenant_config", return_value=mock_tenant_cfg), \
             patch("apps.api.services.crm_users_sync.fetch_amocrm_users", AsyncMock(return_value=mock_crm_fetched)), \
             patch("apps.api.tenant_registry.load_tenants_registry", return_value={"tenants": [mock_tenant_cfg]}), \
             patch("apps.api.tenant_registry.save_tenants_registry", return_value=True):

            res = await sync_tenant_crm_managers("TNT-TEST")

            assert res["status"] == "ok"
            assert res["added_count"] == 1
            assert res["total_count"] == 2

            # Verify existing manager custom targets were NOT erased
            dmitry = next(m for m in res["managers"] if m["id"] == "11422686")
            assert dmitry["revenue_target"] == 1500000.0
            assert dmitry["daily_calls_target"] == 25

            # Verify new manager received RevOps presets
            alexey = next(m for m in res["managers"] if m["id"] == "11422799")
            assert alexey["revenue_target"] == 0.0
            assert alexey["daily_calls_target"] == 20
            assert alexey["daily_dials_target"] == 40
            assert alexey["monthly_meetings_target"] == 15
            assert alexey["meetings_enabled"] is True
            assert alexey["capacity"] == 40
            assert alexey["next_step_target_pct"] == 80

    import asyncio
    asyncio.run(_test())


def test_settings_sync_endpoint_mocked():
    with patch("apps.api.services.crm_users_sync.sync_tenant_crm_managers", AsyncMock()) as mock_sync:
        mock_sync.return_value = {
            "status": "ok",
            "message": "Синхронизация завершена",
            "crm_type": "amocrm",
            "added_count": 0,
            "total_count": 1,
            "managers": [{"id": "11422686", "name": "Дмитрий Федотов", "role": "РОП / Клоузер"}],
        }

        resp = client.post("/api/v1/settings/managers/sync?tenant_id=TNT-002")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["total_count"] == 1
        assert data["crm_type"] == "amocrm"


def test_get_settings_contains_crm_type():
    resp = client.get("/api/v1/settings?tenant_id=TNT-002")
    assert resp.status_code == 200
    data = resp.json()
    assert "crm_type" in data
    assert data["crm_type"] in ("amocrm", "bitrix24", "hybrid")


def test_sync_tenant_crm_managers_auto_removes_inactive_and_orphaned():
    async def _test():
        mock_tenant_cfg = {
            "tenant_id": "TNT-TEST",
            "crm_type": "amocrm",
            "amo_domain": "reflecteddark.amocrm.ru",
            "amo_token": "mock-token",
            "managers": [
                {
                    "id": "11422686",
                    "name": "Дмитрий Федотов",
                    "role": "РОП / Клоузер",
                    "capacity": 50,
                    "revenue_target": 1500000.0,
                },
                {
                    "id": "14384026",
                    "name": "Дмитрий",
                    "role": "РОП / Клоузер",
                    "capacity": 50,
                    "revenue_target": 0.0,
                },
                {
                    "id": "14388098",
                    "name": "Кристина",
                    "role": "Менеджер ОП",
                    "capacity": 40,
                    "revenue_target": 0.0,
                },
            ],
            "manager_kpis": {
                "11422686": {"revenue_target": 1500000.0},
                "14384026": {"revenue_target": 0.0},
                "14388098": {"revenue_target": 0.0},
            },
        }

        # Real amoCRM only has active user Dmitry (14384026)
        mock_crm_fetched = [
            {"id": "14384026", "name": "Дмитрий", "role": "РОП / Клоузер", "email": "d@test.com"},
        ]

        with patch("apps.api.tenant_registry.get_tenant_config", return_value=mock_tenant_cfg), \
             patch("apps.api.services.crm_users_sync.fetch_amocrm_users", AsyncMock(return_value=mock_crm_fetched)), \
             patch("apps.api.tenant_registry.load_tenants_registry", return_value={"tenants": [mock_tenant_cfg]}), \
             patch("apps.api.tenant_registry.save_tenants_registry", return_value=True):

            res = await sync_tenant_crm_managers("TNT-TEST")

            assert res["status"] == "ok"
            assert res["removed_count"] == 2
            assert res["total_count"] == 1
            assert len(res["managers"]) == 1

            dmitry = res["managers"][0]
            assert dmitry["id"] == "14384026"
            assert dmitry["name"] == "Дмитрий"
            # Dmitry inherited the 1.5M revenue target from the old seed ROP entry
            assert dmitry["revenue_target"] == 1500000.0

            # Inactive Kristina (14388098) and phantom Dmitry Fedotov (11422686) are gone
            assert not any(m["id"] == "14388098" for m in res["managers"])
            assert not any(m["id"] == "11422686" for m in res["managers"])

    import asyncio
    asyncio.run(_test())

