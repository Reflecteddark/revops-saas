# -*- coding: utf-8 -*-
"""The link from the audit card to the deal in the client's own CRM (services/crm_links.py)."""

import uuid

import pytest

from apps.api.routers.calls_router import _format_db_call
from apps.api.services.crm_links import crm_deal_url
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Tenant, Workspace
from packages.database.session import SessionLocal

AMO = {"crm_type": "amocrm", "amo_domain": "client.amocrm.ru"}
B24 = {"crm_type": "bitrix24", "b24_webhook_url": "https://portal.bitrix24.ru/rest/1/SECRET-WEBHOOK-KEY/"}


def test_amocrm_deal_link():
    assert crm_deal_url(AMO, "5272089") == "https://client.amocrm.ru/leads/detail/5272089"
    assert crm_deal_url({"amo_domain": "https://Client.AmoCRM.ru/"}, 5272089) == "https://client.amocrm.ru/leads/detail/5272089"  # crm_type missing


def test_the_deal_id_as_n8n_stores_it_has_a_link():
    """Found on production: calls ingested by n8n keep the amoCRM deal as "AMO-5272089", and had no link."""
    assert crm_deal_url(AMO, "AMO-5272089") == "https://client.amocrm.ru/leads/detail/5272089"
    assert crm_deal_url(AMO, "amo-5272089") == "https://client.amocrm.ru/leads/detail/5272089"
    assert crm_deal_url(AMO, "B24-5272089") is None  # a Bitrix id is not an amoCRM deal
    assert crm_deal_url(AMO, "AMO-") is None and crm_deal_url(AMO, "AMO-abc") is None


def test_bitrix_link_takes_the_host_of_the_webhook_and_never_its_secret():
    url = crm_deal_url(B24, "B24-77")
    assert url == "https://portal.bitrix24.ru/crm/deal/details/77/"
    assert "SECRET" not in url and "rest" not in url


def test_our_own_webhook_address_is_not_the_clients_crm():
    cfg = {"crm_type": "bitrix24", "bitrix_webhook_url": "https://report.ai-rop.ru/api/v1/webhooks/TNT-1/bitrix24"}
    assert crm_deal_url(cfg, "77") is None
    assert crm_deal_url({**cfg, "b24_webhook_url": "https://portal.bitrix24.ru/rest/1/x/"}, "77") == "https://portal.bitrix24.ru/crm/deal/details/77/"


@pytest.mark.parametrize("deal", [None, "", "D-100", "abc", "12 34", "1" * 30, "../1", "5; DROP"])
def test_a_deal_id_that_is_not_a_crm_number_gives_no_link(deal):
    assert crm_deal_url(AMO, deal) is None
    assert crm_deal_url(B24, deal) is None


@pytest.mark.parametrize("domain", ["", "localhost", "10.0.0.1", "evil.com/x@y", "javascript:alert(1)", "a b.ru", "-bad.ru", "client.amocrm.ru:99999999"])
def test_only_a_plain_host_name_becomes_a_link(domain):
    url = crm_deal_url({"crm_type": "amocrm", "amo_domain": domain}, "1")
    assert url is None or url.startswith("https://") and "@" not in url and " " not in url


def test_no_crm_no_link():
    assert crm_deal_url(None, "1") is None
    assert crm_deal_url({"crm_type": "template"}, "1") is None


@pytest.fixture
def tid():
    t = f"TNT-LK-{uuid.uuid4().hex[:6].upper()}"
    yield t
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def test_the_call_of_the_cabinet_carries_the_link(tid):
    db = SessionLocal()
    try:
        get_or_create_workspace(db, tid, "amocrm")
        cid = str(uuid.uuid4())
        db.add(CallRecording(id=cid, tenant_id=tid, client_phone="+7", duration_seconds=60, overall_score=5.0,
                             scorecard_criteria={"cr": [1] * 13, "score": 13, "deal_id": "5272089"}))
        db.commit()
        row = db.query(CallRecording).filter(CallRecording.id == cid).one()
        call = _format_db_call(row, AMO, None)
        assert call["crm_url"] == "https://client.amocrm.ru/leads/detail/5272089"
        assert _format_db_call(row, None, None)["crm_url"] is None
    finally:
        db.close()
