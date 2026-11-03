# -*- coding: utf-8 -*-
"""
Found on the first real "Синхронизировать" (2026-11-03): the page opened the main pipeline, which had no deals, and the
API answered from the Google Sheets mirror instead (the same lead twice, "AMO-5272089" and "5272089", wrong managers,
pipeline sum doubled) and ran a CRM sync on every such page load.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import deals_router
from apps.api.services.deal_keys import dedupe_same_crm_deals, find_tenant_deal
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import Deal, DealStage, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}


@pytest.fixture
def tid():
    t = f"TNT-SRC-{uuid.uuid4().hex[:6].upper()}"
    yield t
    db = SessionLocal()
    try:
        db.query(Deal).filter(Deal.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _headers(tenant):
    token = create_access_token({"sub": "u", "tenant_id": tenant, "role": UserRole.CEO.value, "email": "u@x.test"})
    return {**EXTERNAL, "Authorization": f"Bearer {token}"}


def _add_deal(tenant, pipeline, ext="AMO-1"):
    db = SessionLocal()
    try:
        ws = get_or_create_workspace(db, tenant, "amocrm")
        db.add(Deal(id=f"{tenant}-{ext}", tenant_id=tenant, workspace_id=ws.id, external_crm_id=ext, title="T",
                    budget=99888.0, stage=DealStage.QUALIFICATION, stage_name="Первичный контакт",
                    pipeline_id=pipeline, custom_payload={}))
        db.commit()
    finally:
        db.close()


def test_an_empty_pipeline_does_not_fall_back_to_the_sheets_mirror_or_trigger_a_sync(tid, monkeypatch):
    _add_deal(tid, "P-WITH-DEALS")

    def boom(*a, **k):
        raise AssertionError("must not be called: the tenant HAS deals in the database")

    monkeypatch.setattr(deals_router, "fetch_deals_from_sheets", boom)
    monkeypatch.setattr(deals_router, "get_tenant_config", lambda t: {"amo_token": "x", "crm_type": "amocrm"})
    monkeypatch.setattr("apps.api.services.crm_deals_sync.sync_deals_for_tenant", boom)

    client = TestClient(app)
    empty = client.get("/api/v1/deals?pipeline_id=P-EMPTY", headers=_headers(tid)).json()
    assert (empty["source"], empty["total"], empty["total_amount"]) == ("database", 0, 0)

    full = client.get("/api/v1/deals?pipeline_id=P-WITH-DEALS", headers=_headers(tid)).json()
    assert (full["source"], full["total"], full["total_amount"]) == ("database", 1, 99888.0)

    reps = client.get("/api/v1/deals/performance/reps?pipeline_id=P-EMPTY", headers=_headers(tid))
    assert reps.status_code == 200


def test_a_tenant_without_any_db_deal_still_gets_the_sheets_mirror(tid, monkeypatch):
    mirror = [{"id": "AMO-9", "deal_id": "AMO-9", "amount": 5.0, "status": "active", "stage": "x", "sla_risk": False}]
    monkeypatch.setattr(deals_router, "fetch_deals_from_sheets", lambda *a, **k: mirror)
    monkeypatch.setattr(deals_router, "get_tenant_config", lambda t: {})
    res = TestClient(app).get("/api/v1/deals", headers=_headers(tid)).json()
    assert (res["source"], res["total"]) == ("google_sheets_raw_deals", 1)


def _row(i, upd, src="amoCRM"):
    return {"id": i, "crm_source": src, "updated_at": upd, "amount": 1.0}


def test_one_lead_under_two_id_formats_is_counted_once():
    rows = [_row("5272089", "2026-11-01"), _row("AMO-5272089", "2026-11-02"), _row("AMO-7", "2026-10-01")]
    out = dedupe_same_crm_deals(rows)
    assert [r["id"] for r in out] == ["AMO-5272089", "AMO-7"]          # later update wins, order kept


def test_same_number_in_two_different_crms_is_not_merged():
    rows = [_row("AMO-5", "2026-11-01"), _row("B24-5", "2026-11-01", src="Bitrix24")]
    assert len(dedupe_same_crm_deals(rows)) == 2


def test_a_row_whose_crm_is_unknown_is_never_merged():
    rows = [_row("5", "2026-11-01", src="CRM"), _row("AMO-5", "2026-11-01")]
    assert len(dedupe_same_crm_deals(rows)) == 2


def test_bare_lead_number_finds_the_prefixed_deal(tid):
    _add_deal(tid, "P", ext="AMO-5272089")
    db = SessionLocal()
    try:
        assert find_tenant_deal(db, tid, "5272089") is not None
        assert find_tenant_deal(db, tid, "AMO-5272089") is not None
        assert find_tenant_deal(db, tid, "999") is None
    finally:
        db.close()


def test_bare_number_is_not_guessed_when_two_crms_have_it(tid):
    _add_deal(tid, "P", ext="AMO-7")
    _add_deal(tid, "P", ext="B24-7")
    db = SessionLocal()
    try:
        assert find_tenant_deal(db, tid, "7") is None                 # ambiguous: do not pick one
        assert find_tenant_deal(db, tid, "B24-7").external_crm_id == "B24-7"
    finally:
        db.close()
