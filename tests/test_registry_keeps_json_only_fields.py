"""
The tenant registry lives in two places: tenants_registry.json (every field) and the tenants table (a few fields).
Loading used to REPLACE the JSON record by the DB one, so any save of Settings wrote a stripped record back to the file:
secret, enable_crm_mutations, custom_prompt_context, b24_webhook_url... vanished for every tenant that has a DB row
(the n8n webhook nodes reject calls without the secret), and a client without a Google Sheet lost the plan, the company
name, Telegram, stages and modules ten seconds after saving them.
"""

import json
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from apps.api import tenant_registry
from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import settings_router
from packages.database.models import Tenant
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
client = TestClient(app)
TENANTS = ("TNT-RG1", "TNT-RG2")
JSON_ONLY = {
    "secret": "s3cret",
    "enable_crm_mutations": True,
    "custom_prompt_context": "ниша",
    "b24_webhook_url": "https://x.test/rest/1/abc/",
    "tg_chat_id": "-100",
    "stages": [{"id": 1, "name": "A", "sla_hours": 5, "win_pct": 5}],
}


def _forget_caches():
    tenant_registry._REGISTRY_CACHE["data"] = None
    tenant_registry._REGISTRY_CACHE["timestamp"] = 0
    settings_router._SETTINGS_CACHE.clear()


def _headers(tenant):
    token = create_access_token({"sub": f"c-{uuid.uuid4().hex[:6]}@x.test", "tenant_id": tenant, "role": "РОП"})
    return {**EXTERNAL, "Authorization": "Bearer " + token}


@pytest.fixture(autouse=True)
def isolated(monkeypatch):
    """No Google Sheets (never touch a real sheet from a test); the registry file is the hermetic one from conftest."""
    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: None)
    path = Path(tenant_registry.get_tenants_registry_path())
    original = path.read_text(encoding="utf-8")
    db = SessionLocal()
    try:
        for tid in TENANTS:
            if not db.query(Tenant).filter(Tenant.id == tid).first():
                db.add(Tenant(id=tid, name=tid, slug=tid.lower(), settings={"crm_type": "amocrm"}))
        db.commit()
    finally:
        db.close()
    _forget_caches()
    yield path
    path.write_text(original, encoding="utf-8")
    db = SessionLocal()
    try:
        db.query(Tenant).filter(Tenant.id.in_(TENANTS)).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
    _forget_caches()


def test_a_settings_save_keeps_the_json_only_fields_of_every_tenant(isolated):
    isolated.write_text(json.dumps({"tenants": [
        {"tenant_id": "TNT-RG1", "tenant_name": "G1", **JSON_ONLY},
        {"tenant_id": "TNT-RG2", "tenant_name": "G2", **JSON_ONLY},
    ]}, ensure_ascii=False), encoding="utf-8")
    _forget_caches()

    r = client.post("/api/v1/settings", json={"tenant_id": "TNT-RG1", "general": {"currency": "RUB"}}, headers=_headers("TNT-RG1"))
    assert r.status_code == 200

    saved = {t["tenant_id"]: t for t in json.loads(isolated.read_text(encoding="utf-8"))["tenants"]}
    for tid in TENANTS:
        for key, value in JSON_ONLY.items():
            assert saved[tid].get(key) == value, f"{tid}: {key} was stripped from the registry file"


def test_a_client_without_a_sheet_keeps_what_the_cabinet_saved():
    h = _headers("TNT-RG1")
    body = {
        "tenant_id": "TNT-RG1",
        "general": {"monthly_target": 3000000, "company_name": "ООО Ромашка"},
        "stages": [{"id": 1, "name": "A", "sla_hours": 5, "win_pct": 5}],
        "telegram": {"rop_chat_id": "-100777"},
        "modules": [{"code": "1.1", "name": "x", "status": False}],
    }
    assert client.post("/api/v1/settings", json=body, headers=h).status_code == 200

    _forget_caches()  # ten seconds later: the registry is read again from the file and the DB
    s = client.get("/api/v1/settings", headers=h).json()
    assert s["general"]["monthly_target"] == 3000000
    assert s["general"]["company_name"] == "ООО Ромашка"
    assert s["telegram"]["rop_chat_id"] == "-100777"
    assert [st["sla_hours"] for st in s["stages"]] == [5]
    assert s["modules"][0]["status"] is False


def test_the_database_still_wins_for_the_fields_it_stores(isolated):
    isolated.write_text(json.dumps({"tenants": [{"tenant_id": "TNT-RG1", "tenant_name": "old name", "crm_type": "bitrix24", **JSON_ONLY}]}), encoding="utf-8")
    db = SessionLocal()
    try:
        db.get(Tenant, "TNT-RG1").name = "name from the DB"
        db.commit()
    finally:
        db.close()
    _forget_caches()
    cfg = tenant_registry.get_tenant_config("TNT-RG1")
    assert cfg["tenant_name"] == "name from the DB"
    assert cfg["secret"] == "s3cret"
