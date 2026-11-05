"""
The CRM users sync DELETES every manager that is not in the CRM answer. amoCRM and Bitrix24 answer page by page
(50 users), so reading only the first page deleted the rest of a bigger team together with their KPI plans.
A list that could not be read to the end must count as "no answer", never as "these people left".
"""

import asyncio

import httpx
import pytest

from apps.api.services import crm_users_sync as sync


class FakeResponse:
    def __init__(self, status_code, data=None):
        self.status_code = status_code
        self._data = data or {}
        self.text = str(self._data)

    def json(self):
        return self._data


class FakeHttp:
    """Answers amoCRM by the `page` param and Bitrix24 by the `start` param from a script of responses."""

    def __init__(self, pages):
        self.pages = pages
        self.requests = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, headers=None, params=None):
        self.requests.append(params)
        return self.pages[(params or {}).get("page", 1)]

    async def post(self, url, json=None):
        self.requests.append(json)
        return self.pages[(json or {}).get("start", 0)]


def _use(monkeypatch, pages):
    fake = FakeHttp(pages)
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: fake)
    return fake


def _amo_users(first, last):
    return [{"id": i, "name": f"Менеджер {i}", "rights": {"is_active": True}} for i in range(first, last + 1)]


def test_amocrm_users_are_read_page_by_page(monkeypatch):
    fake = _use(monkeypatch, {
        1: FakeResponse(200, {"_embedded": {"users": _amo_users(1, 50)}, "_links": {"next": {"href": "x"}}}),
        2: FakeResponse(200, {"_embedded": {"users": _amo_users(51, 60)}}),
    })
    users = asyncio.run(sync.fetch_amocrm_users("a.amocrm.ru", "token"))
    assert len(users) == 60
    assert [r["page"] for r in fake.requests] == [1, 2]


def test_amocrm_empty_page_after_the_last_one_ends_the_list(monkeypatch):
    _use(monkeypatch, {
        1: FakeResponse(200, {"_embedded": {"users": _amo_users(1, 3)}, "_links": {"next": {"href": "x"}}}),
        2: FakeResponse(204),
    })
    assert len(asyncio.run(sync.fetch_amocrm_users("a.amocrm.ru", "token"))) == 3


def test_amocrm_list_that_breaks_on_a_later_page_is_no_answer(monkeypatch):
    _use(monkeypatch, {
        1: FakeResponse(200, {"_embedded": {"users": _amo_users(1, 50)}, "_links": {"next": {"href": "x"}}}),
        2: FakeResponse(500),
    })
    assert asyncio.run(sync.fetch_amocrm_users("a.amocrm.ru", "token")) == []


def test_bitrix_users_are_read_by_the_next_offset(monkeypatch):
    def people(first, last):
        return [{"ID": str(i), "NAME": f"Имя{i}", "LAST_NAME": "Ф"} for i in range(first, last + 1)]

    fake = _use(monkeypatch, {
        0: FakeResponse(200, {"result": people(1, 50), "next": 50}),
        50: FakeResponse(200, {"result": people(51, 60)}),
    })
    assert len(asyncio.run(sync.fetch_bitrix24_users("https://x.bitrix24.ru/rest/1/tok/"))) == 60
    assert [r.get("start") for r in fake.requests] == [None, 50]


def test_a_broken_later_page_deletes_nobody(monkeypatch):
    managers = [{"id": str(i), "name": f"Менеджер {i}", "role": "Менеджер ОП", "revenue_target": 100} for i in range(1, 61)]
    tenant = {
        "tenant_id": "TNT-PG1", "crm_type": "amocrm", "amo_domain": "a.amocrm.ru", "amo_token": "t",
        "managers": managers, "manager_kpis": {m["id"]: {"revenue_target": 100} for m in managers},
    }
    saved = []
    monkeypatch.setattr("apps.api.tenant_registry.get_tenant_config", lambda t: tenant)
    monkeypatch.setattr("apps.api.tenant_registry.load_tenants_registry", lambda: {"tenants": [tenant]})
    monkeypatch.setattr("apps.api.tenant_registry.save_tenants_registry", lambda *a, **k: saved.append(1) or True)
    _use(monkeypatch, {
        1: FakeResponse(200, {"_embedded": {"users": _amo_users(1, 50)}, "_links": {"next": {"href": "x"}}}),
        2: FakeResponse(500),
    })

    result = asyncio.run(sync.sync_tenant_crm_managers("TNT-PG1"))

    assert result["status"] == "empty"
    assert result["total_count"] == 60
    assert saved == []
    assert len(tenant["managers"]) == 60 and len(tenant["manager_kpis"]) == 60


def test_a_complete_list_still_removes_people_who_really_left(monkeypatch):
    managers = [{"id": str(i), "name": f"Менеджер {i}", "role": "Менеджер ОП", "revenue_target": 100} for i in range(1, 6)]
    tenant = {
        "tenant_id": "TNT-PG2", "crm_type": "amocrm", "amo_domain": "a.amocrm.ru", "amo_token": "t",
        "managers": managers, "manager_kpis": {m["id"]: {"revenue_target": 100} for m in managers},
    }
    registry = {"tenants": [tenant]}
    monkeypatch.setattr("apps.api.tenant_registry.get_tenant_config", lambda t: tenant)
    monkeypatch.setattr("apps.api.tenant_registry.load_tenants_registry", lambda: registry)
    monkeypatch.setattr("apps.api.tenant_registry.save_tenants_registry", lambda *a, **k: True)
    _use(monkeypatch, {1: FakeResponse(200, {"_embedded": {"users": _amo_users(1, 3)}})})

    result = asyncio.run(sync.sync_tenant_crm_managers("TNT-PG2"))

    assert result["status"] == "ok"
    assert result["removed_count"] == 2
    assert sorted(m["id"] for m in tenant["managers"]) == ["1", "2", "3"]
