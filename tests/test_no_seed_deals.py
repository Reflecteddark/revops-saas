# -*- coding: utf-8 -*-
"""A tenant whose deal source is unavailable must see NO deals - not 11 invented ones (8.18 M ₽)."""

import uuid

from apps.api.routers import deals_router


def test_missing_service_account_means_no_deals_not_demo_deals(monkeypatch):
    tid = f"TNT-NOSEED-{uuid.uuid4().hex[:6].upper()}"
    monkeypatch.setattr(deals_router, "get_service_account_path", lambda: None)
    monkeypatch.setattr(deals_router, "get_tenant_config", lambda t: {"crm_type": "bitrix24", "spreadsheet_id": "SOME"})
    deals_router._DEALS_CACHE.pop(tid, None)

    assert deals_router.fetch_deals_from_sheets(tenant_id=tid) == []
    # and the empty answer must not be cached as if it were real data
    assert tid not in deals_router._DEALS_CACHE
