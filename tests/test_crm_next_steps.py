# -*- coding: utf-8 -*-
"""Next step of a deal from the CRM's open tasks / activities (and how it meets the SLA rule)."""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from apps.api.services import crm_next_steps as ns
from apps.api.services.crm_deals_sync import sync_deals_to_database
from packages.database.models import Deal, Tenant, Workspace
from packages.database.session import SessionLocal

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
H = timedelta(hours=1)


# ---------- pure rules ----------

def test_parse_deadline_formats():
    assert ns.parse_deadline(1793707200) == datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
    assert ns.parse_deadline("1793707200") == datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
    assert ns.parse_deadline("2026-11-05T18:00:00+03:00") == datetime(2026, 11, 5, 15, 0, tzinfo=timezone.utc)
    assert ns.parse_deadline("2026-11-05T15:00:00Z") == datetime(2026, 11, 5, 15, 0, tzinfo=timezone.utc)
    for junk in (None, "", 0, "0", "завтра"):
        assert ns.parse_deadline(junk) is None


def test_nearest_future_deadline_is_the_next_step():
    assert ns.resolve_next_step([NOW + 5 * H, NOW + 2 * H, NOW - H], None, NOW) == (NOW + 2 * H, True)


def test_only_overdue_tasks_means_an_overdue_next_step():
    assert ns.resolve_next_step([NOW - 5 * H, NOW - H], None, NOW) == (NOW - H, True)


def test_crm_answered_with_no_open_task_means_no_next_step():
    assert ns.resolve_next_step([], None, NOW) == (None, False)


def test_crm_silent_means_unknown_never_missing():
    assert ns.resolve_next_step(None, None, NOW) == (None, None)


def test_manual_next_step_survives_a_crm_without_tasks_while_in_the_future():
    assert ns.resolve_next_step([], NOW + 24 * H, NOW) == (NOW + 24 * H, True)
    assert ns.resolve_next_step(None, NOW + 24 * H, NOW) == (NOW + 24 * H, True)
    # once the manual date is in the past it no longer protects the deal
    assert ns.resolve_next_step([], NOW - H, NOW) == (None, False)
    # the earlier of CRM / manual future dates wins
    assert ns.resolve_next_step([NOW + 48 * H], NOW + 24 * H, NOW) == (NOW + 24 * H, True)


# ---------- CRM calls (HTTP mocked) ----------

def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_amocrm_open_tasks_grouped_by_lead_and_completed_ignored():
    def handler(req: httpx.Request) -> httpx.Response:
        assert "filter[is_completed]=0" in str(req.url) or "filter%5Bis_completed%5D=0" in str(req.url)
        return httpx.Response(200, json={"_embedded": {"tasks": [
            {"entity_id": 11, "entity_type": "leads", "complete_till": 1793707200, "is_completed": False},
            {"entity_id": 11, "entity_type": "leads", "complete_till": 1793793600, "is_completed": False},
            {"entity_id": 12, "entity_type": "leads", "complete_till": 1793707200, "is_completed": True},
            {"entity_id": 13, "entity_type": "contacts", "complete_till": 1793707200, "is_completed": False},
        ]}})

    async def run():
        async with _client(handler) as c:
            return await ns.fetch_amocrm_open_task_deadlines(c, "x.amocrm.ru", {})

    res = asyncio.run(run())
    assert set(res) == {"11"} and len(res["11"]) == 2


def test_amocrm_no_content_means_no_open_tasks_but_an_error_means_unknown():
    async def run(status):
        async with _client(lambda r: httpx.Response(status)) as c:
            return await ns.fetch_amocrm_open_task_deadlines(c, "x.amocrm.ru", {})

    assert asyncio.run(run(204)) == {}      # the CRM answered: nothing open
    assert asyncio.run(run(500)) is None    # the CRM failed: unknown
    assert asyncio.run(run(401)) is None


def test_amocrm_network_error_means_unknown():
    def boom(req):
        raise httpx.ConnectError("down")

    async def run():
        async with _client(boom) as c:
            return await ns.fetch_amocrm_open_task_deadlines(c, "x.amocrm.ru", {})

    assert asyncio.run(run()) is None


def test_amocrm_page_limit_means_unknown(monkeypatch):
    monkeypatch.setattr(ns, "AMO_MAX_PAGES", 2)
    full_page = {"_embedded": {"tasks": [
        {"entity_id": i, "entity_type": "leads", "complete_till": 1793707200, "is_completed": False}
        for i in range(ns.AMO_PAGE_LIMIT)]}}

    async def run():
        async with _client(lambda r: httpx.Response(200, json=full_page)) as c:
            return await ns.fetch_amocrm_open_task_deadlines(c, "x.amocrm.ru", {})

    assert asyncio.run(run()) is None   # never claim "no next step" from a truncated answer


def test_bitrix_activities_paginated_and_grouped_by_deal():
    pages = {
        0: {"result": [{"OWNER_ID": "5", "DEADLINE": "2026-11-05T18:00:00+03:00"},
                       {"OWNER_ID": "5", "DEADLINE": ""}], "next": 50},
        50: {"result": [{"OWNER_ID": "6", "DEADLINE": "2026-11-04T10:00:00+03:00"}]},
    }

    def handler(req: httpx.Request) -> httpx.Response:
        import json
        body = json.loads(req.content)
        assert body["filter"] == {"OWNER_TYPE_ID": 2, "COMPLETED": "N"}
        return httpx.Response(200, json=pages[body["start"]])

    async def run():
        async with _client(handler) as c:
            return await ns.fetch_bitrix24_open_activity_deadlines(c, "https://b.bitrix24.ru/rest/1/x")

    res = asyncio.run(run())
    assert set(res) == {"5", "6"} and len(res["5"]) == 1   # an activity without a deadline is not a next step


def test_attach_maps_prefixed_deal_ids_and_keeps_unknown_as_none():
    deals = [{"deal_id": "AMO-11"}, {"deal_id": "AMO-99"}]
    ns.attach_task_deadlines(deals, {"11": [NOW]}, "AMO-")
    assert deals[0]["crm_task_deadlines"] == [NOW.isoformat()]
    assert deals[1]["crm_task_deadlines"] == []            # answered, no task for this lead
    ns.attach_task_deadlines(deals, None, "AMO-")
    assert all(d["crm_task_deadlines"] is None for d in deals)


# ---------- persisted + SLA ----------

@pytest.fixture
def tid():
    t = f"TNT-NS-{uuid.uuid4().hex[:6].upper()}"
    yield t
    db = SessionLocal()
    try:
        db.query(Deal).filter(Deal.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _norm(deal_id, deadlines):
    n = {"deal_id": deal_id, "company_name": "К", "amount": 1000.0, "stage_name": "Квалификация", "is_won": "0",
         "is_lost": "0", "is_deleted": "0", "manager_name": "М", "source": "amocrm"}
    if deadlines != "absent":
        n["crm_task_deadlines"] = deadlines
    return n


def test_sync_stores_the_next_step_and_the_sla_follows(tid):
    soon = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    db = SessionLocal()
    try:
        sync_deals_to_database(tid, [_norm("AMO-1", [soon]), _norm("AMO-2", []), _norm("AMO-3", None)], db)
        d = {x.external_crm_id: x for x in db.query(Deal).filter(Deal.tenant_id == tid).all()}

        assert d["AMO-1"].has_next_step is True and d["AMO-1"].next_step_date is not None
        assert d["AMO-1"].is_at_risk is False

        assert d["AMO-2"].has_next_step is False and d["AMO-2"].next_step_date is None
        assert d["AMO-2"].is_at_risk is True and d["AMO-2"].risk_reason == "Нет следующего шага"

        # the CRM did not answer for AMO-3: stays "unknown" - not a risk
        assert d["AMO-3"].has_next_step is True and d["AMO-3"].is_at_risk is False
    finally:
        db.close()


def test_crm_silence_does_not_erase_a_known_next_step(tid):
    soon = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    db = SessionLocal()
    try:
        sync_deals_to_database(tid, [_norm("AMO-1", [soon])], db)
        sync_deals_to_database(tid, [_norm("AMO-1", None)], db)       # CRM failed this time
        sync_deals_to_database(tid, [_norm("AMO-1", "absent")], db)   # old caller, no field at all
        d = db.query(Deal).filter(Deal.tenant_id == tid).one()
        assert d.has_next_step is True and d.next_step_date is not None
    finally:
        db.close()


def test_manual_next_step_is_kept_by_the_next_crm_sync(tid):
    later = datetime.now(timezone.utc) + timedelta(days=3)
    db = SessionLocal()
    try:
        sync_deals_to_database(tid, [_norm("AMO-1", [])], db)
        d = db.query(Deal).filter(Deal.tenant_id == tid).one()
        assert d.is_at_risk is True
        # what POST /fix-next-step stores
        d.next_step_date = later.replace(tzinfo=None)
        d.has_next_step = True
        d.custom_payload = {**(d.custom_payload or {}), "manual_next_step": later.isoformat()}
        db.commit()

        sync_deals_to_database(tid, [_norm("AMO-1", [])], db)          # the CRM still has no task
        db.refresh(d)
        assert d.has_next_step is True and d.is_at_risk is False
        assert abs((d.next_step_date - later.replace(tzinfo=None)).total_seconds()) < 1
    finally:
        db.close()
