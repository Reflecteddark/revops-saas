# -*- coding: utf-8 -*-
"""
Deal ids are only unique inside one CRM portal (every Bitrix24 portal starts at B24-1), but deals.id is a
global primary key. A sync of client B used to find client A's `B24-1` by the bare id and overwrite it.
"""

import uuid

import pytest

from apps.api.services.crm_deals_sync import sync_deals_to_database
from apps.api.services.deal_keys import deal_pk_for, find_tenant_deal
from packages.database.models import Deal, Tenant, Workspace
from packages.database.session import SessionLocal


def _deal(deal_id, title, amount):
    return {
        "deal_id": deal_id, "company_name": title, "amount": amount, "stage_name": "Квалификация",
        "is_won": "0", "is_lost": "0", "is_deleted": "0", "manager_name": "М", "source": "bitrix24",
    }


@pytest.fixture
def two_tenants():
    a, b = (f"TNT-ISO-{uuid.uuid4().hex[:6].upper()}" for _ in range(2))
    yield a, b
    db = SessionLocal()
    try:
        for t in (a, b):
            db.query(Deal).filter(Deal.tenant_id == t).delete()
            db.query(Workspace).filter(Workspace.tenant_id == t).delete()
            db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def test_same_crm_id_in_two_tenants_stays_two_deals(two_tenants):
    a, b = two_tenants
    db = SessionLocal()
    try:
        sync_deals_to_database(a, [_deal("B24-1", "Клиент A", 100000.0)], db)
        sync_deals_to_database(b, [_deal("B24-1", "Клиент B", 777000.0)], db)

        da = db.query(Deal).filter(Deal.tenant_id == a).all()
        dbb = db.query(Deal).filter(Deal.tenant_id == b).all()
        assert [(d.title, d.budget) for d in da] == [("Клиент A", 100000.0)]
        assert [(d.title, d.budget) for d in dbb] == [("Клиент B", 777000.0)]
        assert da[0].id != dbb[0].id
        assert dbb[0].external_crm_id == "B24-1"

        # a second sync updates the same rows instead of creating more
        stats = sync_deals_to_database(b, [_deal("B24-1", "Клиент B", 888000.0)], db)
        assert stats["updated"] == 1 and stats["inserted"] == 0
        assert db.query(Deal).filter(Deal.tenant_id == b).one().budget == 888000.0
        assert db.query(Deal).filter(Deal.tenant_id == a).one().budget == 100000.0
    finally:
        db.close()


def test_find_tenant_deal_never_returns_foreign_deal(two_tenants):
    a, b = two_tenants
    db = SessionLocal()
    try:
        sync_deals_to_database(a, [_deal("B24-5", "Только A", 1.0)], db)
        assert find_tenant_deal(db, a, "B24-5") is not None
        assert find_tenant_deal(db, b, "B24-5") is None
        # pk for B must not collide with A's row and must fit VARCHAR(36)
        pk = deal_pk_for(db, b, "B24-5")
        assert pk != "B24-5" and len(pk) <= 36
    finally:
        db.close()
