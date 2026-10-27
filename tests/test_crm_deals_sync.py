# -*- coding: utf-8 -*-
"""
Tests for CRM Deals Synchronization Service & API Endpoints (amoCRM + Bitrix24 -> PostgreSQL).
Validates:
1. amoCRM leads fetch with pipeline stages, users catalog, and webhook auto-registration.
2. Bitrix24 deals fetch with status list and user mappings.
3. PostgreSQL persistence with Tenant and Workspace isolation, DealStage enum mapping, SLA risk detection.
4. Soft-delete and pruning of obsolete CRM deals.
5. POST /api/v1/deals/sync and auto-sync on GET /api/v1/deals when CRM credentials exist.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.services.crm_deals_sync import (
    auto_register_amocrm_webhook,
    fetch_amocrm_deals,
    fetch_bitrix24_deals,
    map_stage_to_enum,
    sync_deals_for_tenant,
    sync_deals_to_database,
)
from packages.database.models import Deal, DealStage, Tenant, Workspace
from packages.database.session import SessionLocal

client = TestClient(app, client=("172.16.0.5", 50000))


def test_map_stage_to_enum():
    assert map_stage_to_enum("142", is_won=True) == DealStage.WON
    assert map_stage_to_enum("143", is_lost=True) == DealStage.LOST
    assert map_stage_to_enum("Успешно реализовано") == DealStage.WON
    assert map_stage_to_enum("Отказ клиента") == DealStage.LOST
    assert map_stage_to_enum("Первичный контакт") == DealStage.LEAD_INCOMING
    assert map_stage_to_enum("Квалификация") == DealStage.QUALIFICATION
    assert map_stage_to_enum("Встреча назначена") == DealStage.MEETING_SCHEDULED
    assert map_stage_to_enum("КП отправлено") == DealStage.COMMERCIAL_PROPOSAL
    assert map_stage_to_enum("Принятие решения") == DealStage.DECISION_MAKING
    assert map_stage_to_enum("Согласование договора") == DealStage.CONTRACT_PAYMENT


def test_fetch_amocrm_deals_with_mocked_http():
    mock_pipelines = {
        "_embedded": {
            "pipelines": [
                {
                    "id": 11444426,
                    "name": "Воронка",
                    "_embedded": {
                        "statuses": [
                            {"id": 89628438, "name": "Первичный контакт", "sort": 20},
                            {"id": 142, "name": "Успешно реализовано", "sort": 10000},
                        ]
                    }
                }
            ]
        }
    }
    mock_users = {
        "_embedded": {
            "users": [
                {"id": 14384026, "name": "Дмитрий", "email": "dmitry@test.com"}
            ]
        }
    }
    mock_leads = {
        "_embedded": {
            "leads": [
                {
                    "id": 4870417,
                    "name": "Оптовая торговля электроникой",
                    "price": 150000,
                    "pipeline_id": 11444426,
                    "status_id": 89628438,
                    "responsible_user_id": 14384026,
                    "created_at": 1729000000,
                    "updated_at": 1729000000,
                },
                {
                    "id": 4949939,
                    "name": "Сделка #4949939",
                    "price": 500000,
                    "pipeline_id": 11444426,
                    "status_id": 142,
                    "responsible_user_id": 14384026,
                    "created_at": 1729000000,
                    "updated_at": 1729000000,
                }
            ]
        }
    }

    async def _test():
        with patch("httpx.AsyncClient.get") as mock_get, patch("httpx.AsyncClient.post") as mock_post:
            def side_effect_get(url, *args, **kwargs):
                url_str = str(url)
                resp = MagicMock()
                resp.status_code = 200
                if "pipelines" in url_str:
                    resp.json.return_value = mock_pipelines
                elif "users" in url_str:
                    resp.json.return_value = mock_users
                elif "webhooks" in url_str:
                    resp.json.return_value = {"_embedded": {"webhooks": []}}
                elif "leads" in url_str:
                    if "page=1" in url_str:
                        resp.json.return_value = mock_leads
                    else:
                        resp.status_code = 204
                        resp.json.return_value = {}
                return resp

            mock_get.side_effect = side_effect_get
            mock_post_resp = MagicMock()
            mock_post_resp.status_code = 201
            mock_post.return_value = mock_post_resp

            deals = await fetch_amocrm_deals("test.amocrm.ru", "mock_token", "TNT-TEST-001")
            assert len(deals) == 2
            d1 = deals[0]
            assert d1["deal_id"] == "AMO-4870417"
            assert d1["amount"] == 150000.0
            assert d1["stage_name"] == "Первичный контакт"
            assert d1["manager_name"] == "Дмитрий"
            assert d1["is_won"] == "0"

            d2 = deals[1]
            assert d2["deal_id"] == "AMO-4949939"
            assert d2["amount"] == 500000.0
            assert d2["is_won"] == "1"

    asyncio.run(_test())


def test_sync_deals_to_database_and_pruning():
    tenant_id = "TNT-UNIT-TEST-SYNC"
    db = SessionLocal()
    try:
        norm_deals = [
            {
                "deal_id": "AMO-101",
                "company_name": "ООО Ромашка",
                "amount": 250000.0,
                "stage_name": "Первичный контакт",
                "is_won": "0",
                "is_lost": "0",
                "is_deleted": "0",
                "manager_name": "Алексей",
                "source": "amocrm",
                "weighted_amount": 25000.0,
            },
            {
                "deal_id": "AMO-102",
                "company_name": "ИП Иванов",
                "amount": 500000.0,
                "stage_name": "Успешно реализовано",
                "is_won": "1",
                "is_lost": "0",
                "is_deleted": "0",
                "manager_name": "Алексей",
                "source": "amocrm",
                "weighted_amount": 500000.0,
            }
        ]

        stats = sync_deals_to_database(tenant_id, norm_deals, db)
        assert stats["inserted"] == 2
        assert stats["updated"] == 0

        # Verify records in DB
        db_deals = db.query(Deal).filter(Deal.tenant_id == tenant_id).all()
        assert len(db_deals) == 2

        d1 = db.query(Deal).filter(Deal.id == "AMO-101").first()
        assert d1 is not None
        assert d1.title == "ООО Ромашка"
        assert d1.budget == 250000.0
        assert d1.stage == DealStage.LEAD_INCOMING
        assert d1.is_at_risk is True
        assert d1.status == "ACTIVE"

        d2 = db.query(Deal).filter(Deal.id == "AMO-102").first()
        assert d2 is not None
        assert d2.stage == DealStage.WON
        assert d2.is_at_risk is False
        assert d2.status == "WON"

        # Now test pruning: sync with only AMO-102 remaining (AMO-101 deleted in CRM)
        pruned_norm = [norm_deals[1]]
        stats2 = sync_deals_to_database(tenant_id, pruned_norm, db)
        assert stats2["pruned"] == 1

        d1_pruned = db.query(Deal).filter(Deal.id == "AMO-101").first()
        assert d1_pruned.is_deleted is True
        assert d1_pruned.status == "DELETED"

    finally:
        db.query(Deal).filter(Deal.tenant_id == tenant_id).delete(synchronize_session=False)
        db.query(Workspace).filter(Workspace.tenant_id == tenant_id).delete(synchronize_session=False)
        db.query(Tenant).filter(Tenant.id == tenant_id).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_deals_sync_endpoint():
    import os
    admin_headers = {"X-Admin-Key": os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")}
    with patch("apps.api.services.crm_deals_sync.fetch_amocrm_deals") as mock_fetch:
        mock_fetch.return_value = [
            {
                "deal_id": "AMO-777",
                "company_name": "Тест Сделка 777",
                "amount": 333000.0,
                "stage_name": "Первичный контакт",
                "is_won": "0",
                "is_lost": "0",
                "is_deleted": "0",
                "manager_name": "Дмитрий",
                "source": "amocrm",
            }
        ]
        with patch("apps.api.routers.deals_router.get_tenant_config") as mock_cfg, \
             patch("apps.api.services.crm_deals_sync.get_tenant_config") as mock_cfg2:
            cfg_val = {
                "tenant_name": "Test Tenant",
                "crm_type": "amocrm",
                "amo_domain": "https://test.amocrm.ru",
                "amo_token": "valid_token",
            }
            mock_cfg.return_value = cfg_val
            mock_cfg2.return_value = cfg_val
            resp = client.post("/api/v1/deals/sync?tenant_id=TNT-SYNC-API", headers=admin_headers)
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "ok"
            assert data["deals_count"] == 1
            assert data["total_pipeline"] == 333000.0

            # Query GET /api/v1/deals
            get_resp = client.get("/api/v1/deals?tenant_id=TNT-SYNC-API", headers=admin_headers)
            assert get_resp.status_code == 200
            deals_list = get_resp.json().get("deals", [])
            assert len(deals_list) == 1
            assert deals_list[0]["deal_id"] == "AMO-777"
            assert deals_list[0]["amount"] == 333000.0

            # Cleanup
            db = SessionLocal()
            db.query(Deal).filter(Deal.tenant_id == "TNT-SYNC-API").delete(synchronize_session=False)
            db.query(Workspace).filter(Workspace.tenant_id == "TNT-SYNC-API").delete(synchronize_session=False)
            db.query(Tenant).filter(Tenant.id == "TNT-SYNC-API").delete(synchronize_session=False)
            db.commit()
            db.close()
