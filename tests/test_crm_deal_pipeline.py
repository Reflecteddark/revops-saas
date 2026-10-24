"""
Tests for Multi-Source Deal Normalization Pipeline (Bitrix24 + amoCRM -> FastAPI/Sheets).
Validates:
1. Source-independent 3-layer architecture and data contracts.
2. Zero hardcoded mocks (no 300,000 fallback, no 'Светлана' stubs).
3. Prefixes: B24-{ID} and AMO-{ID} across all models.
4. NaN protection on null weights.
5. Google Sheets cell limit protection (< 45,000 characters).
6. Multi-tenant crm_type routing ('bitrix24', 'amocrm', 'both').
7. Soft-delete handling and SLA risk suppression.
"""

import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.routers.deals_router import fetch_deals_from_sheets, parse_amount
from apps.api.services.crm_deal_normalizer import (
    MAX_SHEET_CELL_CHARS,
    map_stage_amocrm,
    map_stage_bitrix24,
    normalize_amocrm_deal,
    normalize_bitrix24_deal,
    normalize_deal,
    parse_numeric_price,
    sanitize_custom_payload,
)

client = TestClient(app)


# ==============================================================================
# 1. Price Parsing & Cell Safety Tests
# ==============================================================================

def test_parse_numeric_price_zero_and_missing():
    # Zero must NOT fallback to any mock amount
    p, is_unk = parse_numeric_price(0)
    assert p == 0.0 and not is_unk

    p, is_unk = parse_numeric_price("0")
    assert p == 0.0 and not is_unk

    p, is_unk = parse_numeric_price("0.00")
    assert p == 0.0 and not is_unk

    p, is_unk = parse_numeric_price("0,00")
    assert p == 0.0 and not is_unk

    # Missing / empty
    p, is_unk = parse_numeric_price(None)
    assert p == 0.0 and is_unk

    p, is_unk = parse_numeric_price("")
    assert p == 0.0 and is_unk

    # Russian rubles formatting
    p, is_unk = parse_numeric_price("1 250 000 ₽")
    assert p == 1250000.0 and not is_unk

    p, is_unk = parse_numeric_price("350.500,75 ₽")
    assert p == 350500.75 and not is_unk


def test_sanitize_custom_payload_cell_safety():
    # Small payload
    small = {"UF_CRM_PARAM": "test", "num": 42}
    res = sanitize_custom_payload(small)
    assert json.loads(res) == small
    assert len(res) < MAX_SHEET_CELL_CHARS

    # Giant payload exceeding 45,000 chars
    giant = {"large_field": "A" * 60000}
    res_giant = sanitize_custom_payload(giant)
    assert len(res_giant) <= MAX_SHEET_CELL_CHARS
    assert '"_truncated":true}' in res_giant


# ==============================================================================
# 2. Stage Mapping & NaN Protection Tests
# ==============================================================================

def test_stage_mapping_bitrix24():
    # Won / Lost
    won = map_stage_bitrix24("WON")
    assert won["status"] == "WON" and won["weight"] == 1.0 and won["is_won"]

    lost = map_stage_bitrix24("LOSE")
    assert lost["status"] == "LOST" and lost["weight"] == 0.0 and lost["is_lost"]

    # Semantic ID priority
    sem_won = map_stage_bitrix24("ANY_STAGE", raw_semantic="S")
    assert sem_won["status"] == "WON" and sem_won["weight"] == 1.0

    # Unknown custom stage: must have weight=None, zero NaN risk
    unk = map_stage_bitrix24("C1:MY_UNKNOWN_STAGE")
    assert unk["status"] == "UNKNOWN"
    assert unk["stage_num"] is None
    assert unk["weight"] is None
    assert unk["weight"] != float("nan")


def test_stage_mapping_amocrm():
    # Won (142) / Lost (143)
    won = map_stage_amocrm("1", 142)
    assert won["status"] == "WON" and won["weight"] == 1.0 and won["is_won"]

    lost = map_stage_amocrm("1", 143)
    assert lost["status"] == "LOST" and lost["weight"] == 0.0 and lost["is_lost"]

    # Unknown status: must have weight=None
    unk = map_stage_amocrm("1", 999999)
    assert unk["status"] == "UNKNOWN"
    assert unk["stage_num"] is None
    assert unk["weight"] is None


# ==============================================================================
# 3. Bitrix24 Deal Normalization Tests
# ==============================================================================

def test_normalize_bitrix24_deal_zero_safe_and_prefix():
    raw = {
        "ID": "12345",
        "TITLE": "Поставка серверов",
        "OPPORTUNITY": "0.00",
        "STAGE_ID": "NEW",
        "ASSIGNED_BY_ID": "42",
        "UF_CRM_CUSTOM_NOTE": "Срочный заказ"
    }
    norm = normalize_bitrix24_deal(raw, tenant_id="TNT-001", users_catalog={"42": "Иван Сидоров"})

    # Prefix B24-
    assert norm["deal_id"] == "B24-12345"
    assert norm["client_id"] == "12345"
    # Zero amount preserved
    assert norm["amount"] == 0.0
    assert norm["amount_str"] == "0 ₽"
    # Manager resolved
    assert norm["manager_name"] == "Иван Сидоров"
    # Stage & weights
    assert norm["stage_name"] == "Новая"
    assert norm["status"] == "ACTIVE"
    assert norm["weighted_amount"] == 0.0
    # Custom payload preserved
    assert "UF_CRM_CUSTOM_NOTE" in norm["custom_payload"]


def test_normalize_bitrix24_deal_unknown_stage_nan_safety():
    raw = {
        "ID": "B24-99999",
        "TITLE": "Сделка с редким этапом",
        "OPPORTUNITY": 500000,
        "STAGE_ID": "C2:VERY_CUSTOM_STAGE"
    }
    norm = normalize_bitrix24_deal(raw, tenant_id="TNT-001")
    assert norm["deal_id"] == "B24-99999"
    assert norm["amount"] == 500000.0
    assert norm["status"] == "UNKNOWN"
    assert norm["weighted_amount"] is None
    assert norm["weighted_amount_str"] == "—"


def test_normalize_bitrix24_deal_soft_delete():
    raw = {
        "ID": "777",
        "is_deleted": True
    }
    norm = normalize_bitrix24_deal(raw, tenant_id="TNT-001")
    assert norm["deal_id"] == "B24-777"
    assert norm["status"] == "DELETED"
    assert norm["is_deleted"] == "1"
    assert norm["is_lost"] == "1"
    assert norm["is_active"] == "0"
    assert norm["lost_reason"] == "Удалена в CRM"


# ==============================================================================
# 4. amoCRM Deal Normalization Tests
# ==============================================================================

def test_normalize_amocrm_deal_zero_safe_and_prefix():
    raw = {
        "id": 888001,
        "name": "Лицензии ПО",
        "price": 0,
        "status_id": 142,
        "responsible_user_id": 99,
        "custom_fields_values": [
            {"field_code": "UTM_SOURCE", "values": [{"value": "google"}]},
            {"field_code": "UTM_CAMPAIGN", "values": [{"value": "spring_sale"}]}
        ]
    }
    norm = normalize_amocrm_deal(raw, tenant_id="TNT-002", users_catalog={"99": "Ольга Васильева"})

    # Prefix AMO-
    assert norm["deal_id"] == "AMO-888001"
    assert norm["client_id"] == "888001"
    # Zero amount preserved
    assert norm["amount"] == 0.0
    assert norm["status"] == "WON"
    assert norm["is_won"] == "1"
    assert norm["manager_name"] == "Ольга Васильева"
    # UTM tags extracted
    assert norm["utm_source"] == "google"
    assert norm["utm_campaign"] == "spring_sale"


def test_normalize_amocrm_deal_soft_delete():
    raw = {
        "id": 888002,
        "is_deleted": True
    }
    norm = normalize_amocrm_deal(raw, tenant_id="TNT-002")
    assert norm["deal_id"] == "AMO-888002"
    assert norm["status"] == "DELETED"
    assert norm["is_deleted"] == "1"
    assert norm["is_lost"] == "1"
    assert norm["is_active"] == "0"


# ==============================================================================
# 5. Universal Normalizer Dispatcher
# ==============================================================================

def test_normalize_deal_dispatcher():
    b24_deal = {"ID": "101", "OPPORTUNITY": 100000}
    amo_deal = {"id": 202, "price": 200000}

    norm_b24 = normalize_deal(b24_deal, source="bitrix24", tenant_id="TNT-001")
    assert norm_b24["deal_id"] == "B24-101"
    assert norm_b24["source"] == "bitrix24"

    norm_amo = normalize_deal(amo_deal, source="amocrm", tenant_id="TNT-002")
    assert norm_amo["deal_id"] == "AMO-202"
    assert norm_amo["source"] == "amocrm"


# ==============================================================================
# 6. Webhooks Router Integration Tests
# ==============================================================================

def test_bitrix24_nested_fields_webhook():
    payload = {
        "event": "ONCRMDEALUPDATE",
        "data": {
            "FIELDS": {
                "ID": "304050",
                "TITLE": "Корпоративная подписка",
                "OPPORTUNITY": "450000",
                "STAGE_ID": "PREPAYMENT"
            }
        }
    }
    with patch("apps.api.routers.webhooks_router.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = client.post("/api/v1/webhooks/bitrix24", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["processed_deal"] == "B24-304050"
        assert data["amount"] == 450000.0

        # Verify broadcast deal
        mock_broadcast.assert_called_once()
        broadcast_args = mock_broadcast.call_args[0]
        event_dict = broadcast_args[1]
        assert event_dict["type"] == "deal_updated"
        assert event_dict["crm_deal_id"] == "B24-304050"


def test_bitrix24_deal_delete_webhook():
    payload = {
        "event": "ONCRMDEALDELETE",
        "data": {
            "FIELDS": {
                "ID": "304051"
            }
        }
    }
    with patch("apps.api.routers.webhooks_router.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = client.post("/api/v1/webhooks/bitrix24", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["event"] == "deal_deleted"
        assert data["processed_deal"] == "B24-304051"

        mock_broadcast.assert_called_once()
        broadcast_args = mock_broadcast.call_args[0]
        event_dict = broadcast_args[1]
        assert event_dict["type"] == "deal_deleted"
        assert event_dict["crm_deal_id"] == "B24-304051"


def test_amocrm_leads_array_and_delete_webhook():
    payload = {
        "leads": {
            "add": [
                {"id": 40101, "name": "Входящая заявка 1", "price": 120000, "status_id": 1}
            ],
            "delete": [
                {"id": 40102}
            ]
        }
    }
    with patch("apps.api.routers.webhooks_router.manager.broadcast", new_callable=AsyncMock) as mock_broadcast:
        resp = client.post("/api/v1/webhooks/TNT-002/amocrm", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["processed_count"] == 2

        # 2 events broadcasted: deal_deleted for 40102, deal_updated for 40101
        assert mock_broadcast.call_count == 2
        calls = [c[0][1] for c in mock_broadcast.call_args_list]
        del_call = next(c for c in calls if c["type"] == "deal_deleted")
        upd_call = next(c for c in calls if c["type"] == "deal_updated")

        assert del_call["crm_deal_id"] == "AMO-40102"
        assert upd_call["crm_deal_id"] == "AMO-40101"


# ==============================================================================
# 7. Deals Router & Multi-Tenant Routing Tests (bitrix24, amocrm, both)
# ==============================================================================

def test_deals_router_crm_type_routing():
    from apps.api.routers.deals_router import _DEALS_CACHE

    with patch("apps.api.routers.deals_router.get_service_account_path", return_value=None):
        # 1. Tenant with crm_type="bitrix24"
        _DEALS_CACHE.clear()
        with patch("apps.api.routers.deals_router.get_tenant_config") as mock_cfg:
            mock_cfg.return_value = {"tenant_id": "TNT-B24", "crm_type": "bitrix24"}
            deals_b24 = fetch_deals_from_sheets(tenant_id="TNT-B24")
            assert len(deals_b24) > 0
            assert all(d["deal_id"].startswith("B24-") for d in deals_b24)
            assert all("bitrix" in d["crm_source"].lower() for d in deals_b24)

        # 2. Tenant with crm_type="amocrm"
        _DEALS_CACHE.clear()
        with patch("apps.api.routers.deals_router.get_tenant_config") as mock_cfg:
            mock_cfg.return_value = {"tenant_id": "TNT-AMO", "crm_type": "amocrm"}
            deals_amo = fetch_deals_from_sheets(tenant_id="TNT-AMO")
            assert len(deals_amo) > 0
            assert all(d["deal_id"].startswith("AMO-") for d in deals_amo)
            assert all("amo" in d["crm_source"].lower() for d in deals_amo)

        # 3. Tenant with crm_type="both"
        _DEALS_CACHE.clear()
        with patch("apps.api.routers.deals_router.get_tenant_config") as mock_cfg:
            mock_cfg.return_value = {"tenant_id": "TNT-BOTH", "crm_type": "both"}
            deals_both = fetch_deals_from_sheets(tenant_id="TNT-BOTH")
            has_b24 = any(d["deal_id"].startswith("B24-") for d in deals_both)
            has_amo = any(d["deal_id"].startswith("AMO-") for d in deals_both)
            assert has_b24 and has_amo, "Tenant with crm_type='both' must aggregate both B24 and amoCRM deals"


def test_deals_sheets_parsing_multi_source():
    from unittest import mock
    from apps.api.cache_client import delete_cached_json_sync
    from apps.api.routers.deals_router import _DEALS_CACHE

    for k in ("deals:TNT-B24", "deals:TNT-AMO", "deals:TNT-BOTH"):
        delete_cached_json_sync(k)

    fake_rows = [
        ["deal_id", "company_name", "amount", "stage_id", "stage_name", "created_at", "updated_at", "responsible_user", "segment", "source", "", "", "status", "", "is_won", "is_lost"],
        ["B24-101", "B24 Сделка", "250000 ₽", "2", "Квалификация", "2026-10-20", "2026-10-21", "Менеджер 1", "B2B", "Bitrix24", "", "", "ACTIVE", "", "0", "0"],
        ["AMO-202", "AMO Сделка", "180000 ₽", "4", "КП", "2026-10-20", "2026-10-21", "Менеджер 2", "B2B", "amoCRM", "", "", "ACTIVE", "", "0", "0"],
        ["B24-999", "Удаленная сделка", "100000 ₽", "7", "Закрыто", "2026-10-20", "2026-10-21", "Менеджер 1", "B2B", "Bitrix24", "", "", "DELETED", "", "0", "1"]
    ]

    mock_ws = mock.MagicMock()
    mock_ws.get_all_values.return_value = fake_rows
    mock_ss = mock.MagicMock()
    mock_ss.worksheet.return_value = mock_ws
    mock_gc = mock.MagicMock()
    mock_gc.open_by_key.return_value = mock_ss

    with patch("apps.api.routers.deals_router.get_service_account_path", return_value="fake_sa.json"), \
         patch("gspread.service_account", return_value=mock_gc):

        # Bitrix tenant: gets B24 deals, excludes AMO deal
        _DEALS_CACHE.clear()
        with patch("apps.api.routers.deals_router.get_tenant_config", return_value={"tenant_id": "TNT-B24", "crm_type": "bitrix24"}):
            deals = fetch_deals_from_sheets("TNT-B24")
            assert len(deals) == 2
            assert all(d["deal_id"].startswith("B24-") for d in deals)
            del_deal = next(d for d in deals if d["deal_id"] == "B24-999")
            assert del_deal["status"] == "deleted"
            assert del_deal["sla_risk"] is False

        # amoCRM tenant: gets AMO deal, excludes B24 deals
        _DEALS_CACHE.clear()
        with patch("apps.api.routers.deals_router.get_tenant_config", return_value={"tenant_id": "TNT-AMO", "crm_type": "amocrm"}):
            deals = fetch_deals_from_sheets("TNT-AMO")
            assert len(deals) == 1
            assert deals[0]["deal_id"] == "AMO-202"

        # both tenant: gets all 3 deals
        _DEALS_CACHE.clear()
        with patch("apps.api.routers.deals_router.get_tenant_config", return_value={"tenant_id": "TNT-BOTH", "crm_type": "both"}):
            deals = fetch_deals_from_sheets("TNT-BOTH")
            assert len(deals) == 3


def test_sla_risk_suppressed_for_deleted_and_closed_deals():
    # Deals that are WON, LOST, or DELETED must never flag SLA risk
    with patch("apps.api.routers.deals_router.get_tenant_config") as mock_cfg:
        mock_cfg.return_value = {"tenant_id": "TNT-001", "crm_type": "bitrix24"}
        deals = fetch_deals_from_sheets(tenant_id="TNT-001")
        won_deals = [d for d in deals if d["status"] == "won"]
        lost_deals = [d for d in deals if d["status"] == "lost"]
        for d in won_deals + lost_deals:
            assert d["sla_risk"] is False, f"Deal {d['deal_id']} with status {d['status']} must have sla_risk=False"


def test_ingest_deal_auto_provisions_tenant_and_workspace():
    import asyncio
    from apps.api.routers.deals_router import ingest_deal
    from packages.database.models import Deal, Tenant, Workspace
    from packages.database.session import get_db

    # Use in-memory SQLite session from test setup
    db = next(get_db())
    test_tenant_id = "TNT-TEST-AUTO"
    test_deal_id = "B24-TEST-999"

    # Ensure clean slate
    db.query(Deal).filter(Deal.id == test_deal_id).delete()
    db.query(Workspace).filter(Workspace.tenant_id == test_tenant_id).delete()
    db.query(Tenant).filter(Tenant.id == test_tenant_id).delete()
    db.commit()

    payload = {
        "deal_id": test_deal_id,
        "tenant_id": test_tenant_id,
        "company_name": "Test Company Auto-Provision",
        "amount": 250000.0,
        "is_won": "0",
        "is_lost": "0",
        "status": "ACTIVE"
    }

    from unittest.mock import MagicMock
    mock_req = MagicMock()
    mock_req.client.host = "127.0.0.1"
    mock_req.headers = {}

    # Calling ingest_deal when tenant doesn't exist in DB must NOT raise ForeignKeyViolation
    res = asyncio.run(ingest_deal(request=mock_req, payload=payload, db=db))
    assert res["status"] == "ok"
    assert res["deal_id"] == test_deal_id

    # Verify Tenant was auto-created
    t = db.query(Tenant).filter(Tenant.id == test_tenant_id).first()
    assert t is not None
    assert t.id == test_tenant_id

    # Verify Workspace was auto-created with FK
    ws = db.query(Workspace).filter(Workspace.tenant_id == test_tenant_id).first()
    assert ws is not None
    assert ws.tenant_id == test_tenant_id

    # Verify Deal was created with proper fields
    d = db.query(Deal).filter(Deal.id == test_deal_id).first()
    assert d is not None
    assert d.title == "Test Company Auto-Provision"
    assert d.budget == 250000.0
    assert d.tenant_id == test_tenant_id
    assert d.workspace_id == ws.id

    # Clean up
    db.query(Deal).filter(Deal.id == test_deal_id).delete()
    db.query(Workspace).filter(Workspace.tenant_id == test_tenant_id).delete()
    db.query(Tenant).filter(Tenant.id == test_tenant_id).delete()
    db.commit()


# ==============================================================================
# 5. Task 1: Deals Endpoint Security Tests (verify_admin_access)
# ==============================================================================

def test_deals_endpoint_security_blocked_external():
    """GET /api/v1/deals without admin credentials from external proxy must return 403 Forbidden."""
    res = client.get(
        "/api/v1/deals?tenant_id=TNT-001",
        headers={"cf-connecting-ip": "1.2.3.4"}
    )
    assert res.status_code == 403, f"Expected 403 Forbidden, got {res.status_code}"


def test_deals_endpoint_security_allowed_with_admin_key():
    """GET /api/v1/deals with valid X-Admin-Key must return 200 OK."""
    from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
    key = next(iter(ALLOWED_ADMIN_KEYS))
    res = client.get(
        "/api/v1/deals?tenant_id=TNT-001",
        headers={
            "cf-connecting-ip": "1.2.3.4",
            "X-Admin-Key": key
        }
    )
    assert res.status_code == 200, f"Expected 200 OK, got {res.status_code}"
    data = res.json()
    assert data["status"] == "ok"
    assert "deals" in data


# ==============================================================================
# 6. Task 2: Postgres DealStage Enum Mapping Tests
# ==============================================================================

def test_stage_enum_mapping_rules():
    """Validates required mapping rules for raw CRM strings to DealStage enum."""
    from apps.api.routers.deals_router import map_deal_stage
    from packages.database.models import DealStage

    # Explicit requirements
    assert map_deal_stage("NEW") == DealStage.LEAD_INCOMING
    assert map_deal_stage("WON") == DealStage.WON
    assert map_deal_stage("LOSE") == DealStage.LOST
    assert map_deal_stage("LOST") == DealStage.LOST
    assert map_deal_stage("1") == DealStage.LEAD_INCOMING
    assert map_deal_stage("6") == DealStage.WON
    assert map_deal_stage("7") == DealStage.LOST

    # Custom stages heuristic: КП -> COMMERCIAL_PROPOSAL, other custom -> LEAD_INCOMING
    assert map_deal_stage("КП_индивидуальное") == DealStage.COMMERCIAL_PROPOSAL
    assert map_deal_stage("НЕИЗВЕСТНЫЙ_ЭТАП_X") == DealStage.LEAD_INCOMING


def test_ingest_deal_writes_proper_dealstage_enum():
    """Validates that POST /ingest writes strict DealStage enum to Postgres/SQLite."""
    import asyncio
    from apps.api.routers.deals_router import ingest_deal
    from packages.database.models import Deal, DealStage, Tenant, Workspace
    from packages.database.session import get_db

    db = next(get_db())
    tenant_id = "TNT-ENUM-TEST"

    # Test cases: raw string -> expected DealStage enum
    cases = [
        ("D-ENUM-NEW", "NEW", DealStage.LEAD_INCOMING),
        ("D-ENUM-WON", "WON", DealStage.WON),
        ("D-ENUM-LOSE", "LOSE", DealStage.LOST),
        ("D-ENUM-KP", "КП_отправлено_клиенту", DealStage.COMMERCIAL_PROPOSAL),
    ]

    from unittest.mock import MagicMock
    mock_req = MagicMock()
    mock_req.client.host = "127.0.0.1"
    mock_req.headers = {}

    for deal_id, raw_stage, expected_enum in cases:
        payload = {
            "deal_id": deal_id,
            "tenant_id": tenant_id,
            "company_name": f"Deal {deal_id}",
            "amount": 100000.0,
            "stage": raw_stage,
            "workspace_id": None  # Must resolve or create default workspace ws_{tenant_id}
        }
        res = asyncio.run(ingest_deal(request=mock_req, payload=payload, db=db))
        assert res["status"] == "ok"
        assert res["stage"] == expected_enum.name

        saved_deal = db.query(Deal).filter(Deal.id == deal_id).first()
        assert saved_deal is not None
        assert saved_deal.stage == expected_enum
        assert saved_deal.workspace_id == f"ws_{tenant_id}"

    # Cleanup
    for deal_id, _, _ in cases:
        db.query(Deal).filter(Deal.id == deal_id).delete()
    db.query(Workspace).filter(Workspace.tenant_id == tenant_id).delete()
    db.query(Tenant).filter(Tenant.id == tenant_id).delete()
    db.commit()


# ==============================================================================
# 7. Task 3: Calls Cache Persistence Tests
# ==============================================================================

def test_calls_cache_persistence_on_sync_sheets():
    """Validates that POST /sync_sheets saves fetched calls into _CALLS_CACHE['calls'] and _CALLS_CACHE[tenant_id]."""
    from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
    from apps.api.routers.calls_router import _CALLS_CACHE

    key = next(iter(ALLOWED_ADMIN_KEYS))

    mock_calls = [
        {
            "id": "call_test_101",
            "deal_id": "D-101",
            "deal_title": "Сделка 101",
            "client": "ООО Клиент 1",
            "manager": "Менеджер Тест",
            "stage": "Первичный контакт",
            "score": 85,
            "status": "won",
            "next_step": 1,
            "amount": "300 000 ₽",
            "amount_num": 300000.0,
            "risk_amount": "0 ₽",
            "cr": [1] * 13,
            "error_summary": "Ошибок нет",
            "recommendation": "Двигаться по регламенту",
            "transcript": "Тестовый транскрипт"
        }
    ]

    with patch("apps.api.routers.calls_router.fetch_calls_from_sheets", return_value=mock_calls):
        res = client.post(
            "/api/v1/calls/sync_sheets?tenant_id=TNT-001",
            headers={"X-Admin-Key": key}
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        data = res.json()
        assert data["status"] == "ok"
        assert data["count"] == 1

        # Verify _CALLS_CACHE contains "TNT-001" key and does not leak global "calls"
        assert "TNT-001" in _CALLS_CACHE, "_CALLS_CACHE['TNT-001'] must be populated"
        assert _CALLS_CACHE["TNT-001"]["calls"] == mock_calls
        assert "calls" not in _CALLS_CACHE, "Global _CALLS_CACHE['calls'] must not exist"

        # Verify CCO Analyst Overview picks up the cached calls without synthetic fallback
        from apps.api.auth import create_access_token
        auth_hdr = {"Authorization": f"Bearer {create_access_token({'sub': 'usr-tnt-001', 'tenant_id': 'TNT-001'})}"}
        res_overview = client.post("/api/v1/insights/analyst/overview", json={"tenant_id": "TNT-001"}, headers=auth_hdr)
        assert res_overview.status_code == 200
        overview = res_overview.json()
        assert overview["metrics_summary"]["total_calls"] == 1
        assert overview["metrics_summary"]["avg_score"] == 85.0


# ==============================================================================
# 8. Required Multi-Tenant & Dual CRM Integration Tests (Cases A, B, C, D, E)
# ==============================================================================

def test_tenant_isolation_deals_and_url_tamper():
    """Case A: TNT-001 cannot see TNT-002 data, and cross-tenant URL tampering is rejected with 403."""
    from apps.api.auth import create_access_token
    from packages.database.models import Deal, DealStage, SubscriptionTier, Tenant, Workspace
    from packages.database.session import SessionLocal

    db = SessionLocal()
    t1_id = "TNT-ISO-001"
    t2_id = "TNT-ISO-002"

    try:
        # 1. Setup tenants and workspaces
        for tid, name in [(t1_id, "Tenant 1"), (t2_id, "Tenant 2")]:
            if not db.query(Tenant).filter(Tenant.id == tid).first():
                db.add(Tenant(id=tid, name=name, slug=tid.lower(), tier=SubscriptionTier.PRO))
            if not db.query(Workspace).filter(Workspace.id == f"ws_{tid}").first():
                db.add(Workspace(id=f"ws_{tid}", tenant_id=tid, name=f"Workspace {tid}"))
        db.commit()

        # 2. Add deal for each tenant
        d1 = Deal(id="DEAL-T1-01", tenant_id=t1_id, workspace_id=f"ws_{t1_id}", title="T1 Exclusive Deal", stage=DealStage.LEAD_INCOMING, budget=100000.0)
        d2 = Deal(id="DEAL-T2-01", tenant_id=t2_id, workspace_id=f"ws_{t2_id}", title="T2 Secret Deal", stage=DealStage.LEAD_INCOMING, budget=200000.0)
        db.add(d1)
        db.add(d2)
        db.commit()

        # 3. User token for Tenant 1
        t1_token = create_access_token({"sub": "user_t1", "tenant_id": t1_id})

        # Test A1: Querying without query param returns strictly T1 deals
        res1 = client.get("/api/v1/deals", headers={"Authorization": f"Bearer {t1_token}"})
        assert res1.status_code == 200
        data1 = res1.json()
        deal_ids = [d["id"] for d in data1.get("deals", [])]
        assert "DEAL-T1-01" in deal_ids
        assert "DEAL-T2-01" not in deal_ids

        # Test A2: URL tampering (Token is for T1, but query param asks for T2) -> MUST RAISE 403
        res_tamper = client.get(f"/api/v1/deals?tenant_id={t2_id}", headers={"Authorization": f"Bearer {t1_token}"})
        assert res_tamper.status_code == 403
        assert "Cross-tenant access forbidden" in res_tamper.json()["detail"]

        # Test A3: Public endpoint is completely disabled/removed for security (returns 404)
        res_pub1 = client.get(f"/api/v1/deals/public?tenant_id={t1_id}")
        assert res_pub1.status_code == 404

        # Test A4: Public endpoint without query param is also 404 Not Found
        res_pub_missing = client.get("/api/v1/deals/public")
        assert res_pub_missing.status_code == 404

    finally:
        db.query(Deal).filter(Deal.id.in_(["DEAL-T1-01", "DEAL-T2-01"])).delete(synchronize_session=False)
        db.query(Workspace).filter(Workspace.id.in_([f"ws_{t1_id}", f"ws_{t2_id}"])).delete(synchronize_session=False)
        db.query(Tenant).filter(Tenant.id.in_([t1_id, t2_id])).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_amocrm_deal_ingest_stages():
    """Case B: Ingest deal from amoCRM with stages '1' -> LEAD_INCOMING, '142' -> WON, '143' -> LOST."""
    import asyncio
    from unittest.mock import MagicMock
    from apps.api.routers.deals_router import ingest_deal
    from packages.database.models import Deal, DealStage, Tenant, Workspace
    from packages.database.session import SessionLocal

    db = SessionLocal()
    tenant_id = "TNT-AMO-TEST"

    cases = [
        ("AMO-STG-1", "1", DealStage.LEAD_INCOMING, "ACTIVE"),
        ("AMO-STG-142", "142", DealStage.WON, "WON"),
        ("AMO-STG-143", "143", DealStage.LOST, "LOST"),
    ]

    mock_req = MagicMock()
    mock_req.client.host = "127.0.0.1"
    mock_req.headers = {}

    try:
        for deal_id, stage_val, expected_stage, expected_status in cases:
            payload = {
                "deal_id": deal_id,
                "tenant_id": tenant_id,
                "company_name": f"amoCRM Deal {deal_id}",
                "amount": 250000.0,
                "stage": stage_val,
                "crm_source": "amocrm"
            }
            res = asyncio.run(ingest_deal(request=mock_req, payload=payload, db=db))
            assert res["status"] == "ok"
            assert res["stage"] == expected_stage.name

            saved = db.query(Deal).filter(Deal.id == deal_id).first()
            assert saved is not None
            assert saved.stage == expected_stage
            assert saved.crm_source == "amocrm"
            assert saved.status == expected_status
    finally:
        for deal_id, _, _, _ in cases:
            db.query(Deal).filter(Deal.id == deal_id).delete(synchronize_session=False)
        db.query(Workspace).filter(Workspace.tenant_id == tenant_id).delete(synchronize_session=False)
        db.query(Tenant).filter(Tenant.id == tenant_id).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_bitrix24_deal_ingest_stages():
    """Case C: Ingest deal from Bitrix24 with stages 'NEW' -> LEAD_INCOMING, 'WON' -> WON, 'LOSE' -> LOST."""
    import asyncio
    from unittest.mock import MagicMock
    from apps.api.routers.deals_router import ingest_deal
    from packages.database.models import Deal, DealStage, Tenant, Workspace
    from packages.database.session import SessionLocal

    db = SessionLocal()
    tenant_id = "TNT-B24-TEST"

    cases = [
        ("B24-STG-NEW", "NEW", DealStage.LEAD_INCOMING, "ACTIVE"),
        ("B24-STG-WON", "WON", DealStage.WON, "WON"),
        ("B24-STG-LOSE", "LOSE", DealStage.LOST, "LOST"),
    ]

    mock_req = MagicMock()
    mock_req.client.host = "127.0.0.1"
    mock_req.headers = {}

    try:
        for deal_id, stage_val, expected_stage, expected_status in cases:
            payload = {
                "deal_id": deal_id,
                "tenant_id": tenant_id,
                "company_name": f"B24 Deal {deal_id}",
                "amount": 350000.0,
                "stage": stage_val,
                "crm_source": "bitrix24"
            }
            res = asyncio.run(ingest_deal(request=mock_req, payload=payload, db=db))
            assert res["status"] == "ok"
            assert res["stage"] == expected_stage.name

            saved = db.query(Deal).filter(Deal.id == deal_id).first()
            assert saved is not None
            assert saved.stage == expected_stage
            assert saved.crm_source == "bitrix24"
            assert saved.status == expected_status
    finally:
        for deal_id, _, _, _ in cases:
            db.query(Deal).filter(Deal.id == deal_id).delete(synchronize_session=False)
        db.query(Workspace).filter(Workspace.tenant_id == tenant_id).delete(synchronize_session=False)
        db.query(Tenant).filter(Tenant.id == tenant_id).delete(synchronize_session=False)
        db.commit()
        db.close()


def test_foreign_tenant_write_rejection():
    """Case D: Writing deals for a foreign tenant with regular user credentials is rejected (403 Forbidden)."""
    from apps.api.auth import create_access_token

    user_token = create_access_token({"sub": "user_legit", "tenant_id": "TNT-MINE"})

    # Attempt to write into TNT-OTHER using token for TNT-MINE
    payload = {
        "deal_id": "DEAL-ATTACK-01",
        "tenant_id": "TNT-OTHER",
        "title": "Malicious Deal Ingestion",
        "amount": 999999.0,
        "stage": "NEW"
    }

    res = client.post(
        "/api/v1/deals/ingest",
        json=payload,
        headers={"Authorization": f"Bearer {user_token}"}
    )
    assert res.status_code == 403
    assert "Cross-tenant write forbidden" in res.json()["detail"]


def test_redis_multitenant_caching():
    """Case E: Multi-tenant Redis caching with strictly scoped keys calls:{tenant_id} and deals:{tenant_id}."""
    from apps.api.cache_client import (
        delete_cached_json_sync,
        get_cached_json_sync,
        set_cached_json_sync,
    )

    t1 = "TNT-CACHE-01"
    t2 = "TNT-CACHE-02"

    calls_k1 = f"calls:{t1}"
    calls_k2 = f"calls:{t2}"
    deals_k1 = f"deals:{t1}"
    deals_k2 = f"deals:{t2}"

    # Set distinct tenant cache values
    set_cached_json_sync(calls_k1, [{"id": "c1", "title": "Call T1"}])
    set_cached_json_sync(calls_k2, [{"id": "c2", "title": "Call T2"}])
    set_cached_json_sync(deals_k1, [{"id": "d1", "title": "Deal T1"}])
    set_cached_json_sync(deals_k2, [{"id": "d2", "title": "Deal T2"}])

    # Assert tenant isolation in cache
    assert get_cached_json_sync(calls_k1)[0]["id"] == "c1"
    assert get_cached_json_sync(calls_k2)[0]["id"] == "c2"
    assert get_cached_json_sync(deals_k1)[0]["id"] == "d1"
    assert get_cached_json_sync(deals_k2)[0]["id"] == "d2"

    # Assert deletion of one tenant key does not affect other tenant
    delete_cached_json_sync(calls_k1)
    delete_cached_json_sync(deals_k1)

    assert get_cached_json_sync(calls_k1) is None
    assert get_cached_json_sync(deals_k1) is None
    assert get_cached_json_sync(calls_k2)[0]["id"] == "c2"
    assert get_cached_json_sync(deals_k2)[0]["id"] == "d2"

    # Clean up
    delete_cached_json_sync(calls_k2)
    delete_cached_json_sync(deals_k2)



