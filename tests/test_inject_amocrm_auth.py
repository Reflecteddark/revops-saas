# -*- coding: utf-8 -*-
"""
POST /calls/inject-amocrm writes a call note (and maybe a lead) into a client's amoCRM and stores the uploaded
file. It had NO authorization: anyone on the internet could do that to any client. It is admin / internal only now,
the tenant is mandatory (it used to default to TNT-004) and a lead it has to create carries no invented price.
"""

from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS

URL = "/api/v1/calls/inject-amocrm"
# arrives from the internet through the Cloudflare tunnel (not the trusted local network)
EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7", "content-type": "audio/mpeg"}
ADMIN = {**EXTERNAL, "x-admin-key": next(iter(ALLOWED_ADMIN_KEYS))}
client = TestClient(app, client=("203.0.113.7", 50000))


def test_anonymous_internet_request_is_refused():
    res = client.post(f"{URL}?tenant_id=TNT-001", content=b"audio", headers=EXTERNAL)
    assert res.status_code == 403, res.text[:200]


def test_tenant_is_mandatory():
    res = client.post(URL, content=b"audio", headers=ADMIN)
    assert res.status_code == 422, res.text[:200]


def test_unknown_tenant_is_404_for_an_admin(monkeypatch):
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda t: None)
    res = client.post(f"{URL}?tenant_id=TNT-NOPE", content=b"audio", headers=ADMIN)
    assert res.status_code == 404


def test_created_lead_has_no_invented_price(monkeypatch, tmp_path):
    monkeypatch.setattr(calls_router, "AUDIO_STORAGE_DIR", tmp_path)
    monkeypatch.setattr(calls_router, "get_tenant_config",
                        lambda t: {"amo_domain": "https://x.amocrm.ru", "amo_token": "tok"})

    fake = MagicMock()
    fake.get.return_value = MagicMock(status_code=200, json=lambda: {"_embedded": {"leads": []}})
    posts = []

    def post(url, **kw):
        posts.append((url, kw.get("json")))
        if url.endswith("/leads"):
            return MagicMock(status_code=201, json=lambda: {"_embedded": {"leads": [{"id": 777}]}})
        return MagicMock(status_code=200, json=lambda: {"_embedded": {"notes": [{"id": 1}]}}, text="")

    fake.post.side_effect = post
    monkeypatch.setattr(calls_router, "requests", fake)

    res = client.post(f"{URL}?tenant_id=TNT-777&duration=60", content=b"\x00" * 2000, headers=ADMIN)
    assert res.status_code == 200, res.text[:300]
    lead_posts = [body for url, body in posts if url.endswith("/api/v4/leads")]
    assert lead_posts and all("price" not in lead for body in lead_posts for lead in body)
