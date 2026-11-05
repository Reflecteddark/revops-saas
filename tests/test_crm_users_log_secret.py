"""The Bitrix24 webhook URL is the access key of the portal: a failed users fetch must not write it to the log."""

import asyncio
import logging

import httpx

from apps.api.services import crm_users_sync as sync

WEBHOOK = "https://portal.bitrix24.ru/rest/1/SECRETKEY123"


class BrokenHttp:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None):
        raise RuntimeError(f"connection to {url} failed")


def test_a_failed_bitrix_fetch_does_not_log_the_webhook(monkeypatch, caplog):
    monkeypatch.setattr(httpx, "AsyncClient", lambda *a, **k: BrokenHttp())
    with caplog.at_level(logging.ERROR, logger="crm_users_sync"):
        assert asyncio.run(sync.fetch_bitrix24_users(WEBHOOK)) == []
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert "Error fetching Bitrix24 users" in logged
    assert "SECRETKEY123" not in logged
