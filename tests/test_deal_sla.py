# -*- coding: utf-8 -*-
"""SLA risk: one rule (no next step / overdue next step / stalled), persisted fix-next-step."""

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import deals_router
from apps.api.services.crm_deals_sync import sync_deals_to_database
from apps.api.services.deal_sla import deal_sla_state
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import Deal, DealStage, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

NOW = datetime(2026, 11, 3, 12, 0, tzinfo=timezone.utc)
EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}


def _deal(**kw):
    base = dict(stage=DealStage.QUALIFICATION, status="ACTIVE", stage_name="Квалификация", is_deleted=False,
                has_next_step=True, next_step_date=None, stage_sla_days=3,
                custom_payload={"stage_since": (NOW - timedelta(days=1)).isoformat()})
    base.update(kw)
    return SimpleNamespace(**base)


def test_new_deal_on_early_stage_is_not_at_risk():
    # the old rule flagged any deal on an early stage / with «КП» in the name just for existing
    s = deal_sla_state(_deal(stage_name="Первичный контакт", stage=DealStage.LEAD_INCOMING), NOW)
    assert (s.at_risk, s.reasons) == (False, ())


def test_unknown_next_step_date_alone_is_not_a_risk():
    assert deal_sla_state(_deal(next_step_date=None), NOW).at_risk is False


def test_explicitly_missing_next_step_is_a_risk():
    s = deal_sla_state(_deal(has_next_step=False), NOW)
    assert s.at_risk and "no_next_step" in s.reasons and s.reason_text == "Нет следующего шага"


def test_overdue_next_step_is_a_risk():
    s = deal_sla_state(_deal(next_step_date=(NOW - timedelta(hours=1)).replace(tzinfo=None)), NOW)
    assert s.at_risk and s.reasons == ("next_step_overdue",)


def test_stalled_on_stage_is_a_risk_but_not_with_a_future_next_step():
    old = {"stage_since": (NOW - timedelta(days=5)).isoformat()}
    s = deal_sla_state(_deal(custom_payload=old), NOW)
    assert s.at_risk and s.reasons == ("stalled",) and s.days_in_stage == 5
    planned = deal_sla_state(_deal(custom_payload=old, next_step_date=(NOW + timedelta(days=1)).replace(tzinfo=None)), NOW)
    assert planned.at_risk is False


@pytest.mark.parametrize("kw", [{"status": "WON"}, {"stage": DealStage.LOST}, {"is_deleted": True},
                                {"stage_name": "Закрыто и не реализовано"}])
def test_closed_deals_are_never_at_risk(kw):
    assert deal_sla_state(_deal(has_next_step=False, **kw), NOW).at_risk is False


def _norm(deal_id, stage="Квалификация", won="0", last_change=None):
    return {"deal_id": deal_id, "company_name": "К", "amount": 1000.0, "stage_name": stage, "is_won": won,
            "is_lost": "0", "is_deleted": "0", "manager_name": "М", "source": "bitrix24",
            "last_stage_change": last_change}


@pytest.fixture
def tid():
    t = f"TNT-SLA-{uuid.uuid4().hex[:6].upper()}"
    yield t
    db = SessionLocal()
    try:
        db.query(Deal).filter(Deal.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def test_sync_counts_days_in_stage_and_keeps_them_between_syncs(tid):
    old = (datetime.now(timezone.utc) - timedelta(days=6)).strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        sync_deals_to_database(tid, [_norm("B24-1", last_change=old)], db)
        d = db.query(Deal).filter(Deal.tenant_id == tid).one()
        assert d.days_in_stage >= 5 and d.is_at_risk is True and "дольше регламента" in d.risk_reason
        # same stage again: the counter keeps running (it is not reset by the sync)
        sync_deals_to_database(tid, [_norm("B24-1", last_change=datetime.now(timezone.utc).strftime("%Y-%m-%d"))], db)
        db.refresh(d)
        assert d.days_in_stage >= 5
        # a real stage change restarts it
        sync_deals_to_database(tid, [_norm("B24-1", stage="КП отправлено")], db)
        db.refresh(d)
        assert d.days_in_stage == 0 and d.is_at_risk is False
    finally:
        db.close()


def test_won_date_is_not_moved_by_a_later_edit_in_the_crm(tid):
    db = SessionLocal()
    try:
        sync_deals_to_database(tid, [_norm("B24-2", stage="Успешно реализовано", won="1", last_change="2026-08-15")], db)
        sync_deals_to_database(tid, [_norm("B24-2", stage="Успешно реализовано", won="1", last_change="2026-11-02")], db)
        d = db.query(Deal).filter(Deal.tenant_id == tid).one()
        assert d.custom_payload["last_stage_change"] == "2026-08-15"
    finally:
        db.close()


def _jwt(tenant):
    return create_access_token({"sub": f"usr-{tenant.lower()}", "tenant_id": tenant,
                                "role": UserRole.CEO.value, "email": f"u@{tenant.lower()}.test"})


def test_fix_next_step_is_stored_and_clears_the_risk(tid, monkeypatch):
    sent = []

    async def rec(org, msg):
        sent.append((org, msg))

    monkeypatch.setattr(deals_router.manager, "broadcast", rec)
    db = SessionLocal()
    try:
        ws = get_or_create_workspace(db, tid, "bitrix24")
        db.add(Deal(id=f"{tid}-D1", tenant_id=tid, workspace_id=ws.id, external_crm_id="B24-9", title="T",
                    budget=500.0, stage=DealStage.QUALIFICATION, stage_name="Квалификация", has_next_step=False,
                    is_at_risk=True, custom_payload={}))
        db.commit()
    finally:
        db.close()

    client = TestClient(app)
    headers = {**EXTERNAL, "Authorization": f"Bearer {_jwt(tid)}"}
    listed = client.get("/api/v1/deals", headers=headers).json()
    assert [d["sla_risk"] for d in listed["deals"]] == [True]

    later = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d")
    res = client.post(f"/api/v1/deals/{tid}-D1/fix-next-step", json={"next_step_date": later}, headers=headers)
    assert res.status_code == 200, res.text[:300]
    assert res.json()["persisted"] is True and res.json()["deal"]["sla_risk"] is False
    assert sent and sent[0][0] == tid and sent[0][1]["action"] == "fix_next_step"

    # the next read - i.e. a page reload - must still say "no risk" (it used to come back as risk)
    again = client.get("/api/v1/deals", headers=headers).json()
    assert [d["sla_risk"] for d in again["deals"]] == [False]
    assert again["deals"][0]["next_step_date"] is not None


def test_fix_next_step_rejects_past_date_and_unknown_deal(tid, monkeypatch):
    monkeypatch.setattr(deals_router, "get_deals_lookup", lambda *a, **k: {})
    client = TestClient(app)
    headers = {**EXTERNAL, "Authorization": f"Bearer {_jwt(tid)}"}
    future = (datetime.now(timezone.utc) + timedelta(days=2)).strftime("%Y-%m-%d")
    assert client.post("/api/v1/deals/NOPE/fix-next-step", json={"next_step_date": future},
                       headers=headers).status_code == 404
    assert client.post("/api/v1/deals/NOPE/fix-next-step", json={"next_step_date": "2020-01-01"},
                       headers=headers).status_code == 422
