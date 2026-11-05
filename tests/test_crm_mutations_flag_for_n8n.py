"""
n8n creates ROP tasks and fills deal fields in a client's CRM only when `enable_crm_mutations` is true in
tenants_registry.json, and it treats a MISSING key as true. The cabinet said "OFF: read-only" while every tenant without
the key was really ON, and the cabinet switch changed only the policy registry that n8n never reads.
Now: no key = explicit false, a new client is created with false, and the switch writes the flag n8n reads.
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
from apps.api.tenant_provisioner import provision_tenant
from packages.antidrift.contracts.policy_config import TenantPolicyRegistry
from packages.database.models import Tenant
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
TENANT = "TNT-MU1"
client = TestClient(app)


def _forget_caches():
    tenant_registry._REGISTRY_CACHE["data"] = None
    tenant_registry._REGISTRY_CACHE["timestamp"] = 0
    settings_router._SETTINGS_CACHE.clear()
    TenantPolicyRegistry._configs.pop(TENANT, None)


def _headers(tenant=TENANT):
    token = create_access_token({"sub": f"c-{uuid.uuid4().hex[:6]}@x.test", "tenant_id": tenant, "role": "РОП"})
    return {**EXTERNAL, "Authorization": "Bearer " + token}


@pytest.fixture(autouse=True)
def hermetic(monkeypatch):
    monkeypatch.setattr(settings_router, "get_service_account_path", lambda: None)  # never a real Google Sheet
    path = Path(tenant_registry.get_tenants_registry_path())
    original = path.read_text(encoding="utf-8")
    db = SessionLocal()
    try:
        if not db.query(Tenant).filter(Tenant.id == TENANT).first():
            db.add(Tenant(id=TENANT, name=TENANT, slug=TENANT.lower(), settings={"crm_type": "amocrm"}))
            db.commit()
    finally:
        db.close()
    _forget_caches()
    yield path
    path.write_text(original, encoding="utf-8")
    db = SessionLocal()
    try:
        db.query(Tenant).filter(Tenant.id == TENANT).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()
    _forget_caches()


def _write_registry(path, **tenant_fields):
    path.write_text(json.dumps({"tenants": [{"tenant_id": TENANT, "tenant_name": "MU1", **tenant_fields}]}), encoding="utf-8")
    _forget_caches()


def _flag_in_file(path):
    tenants = {t["tenant_id"]: t for t in json.loads(path.read_text(encoding="utf-8"))["tenants"]}
    return tenants[TENANT].get("enable_crm_mutations", "MISSING")


def test_a_tenant_without_the_key_is_explicitly_off(hermetic):
    _write_registry(hermetic)
    assert tenant_registry.get_tenant_config(TENANT)["enable_crm_mutations"] is False


def test_an_explicit_choice_is_kept(hermetic):
    _write_registry(hermetic, enable_crm_mutations=True)
    assert tenant_registry.get_tenant_config(TENANT)["enable_crm_mutations"] is True


def test_the_next_save_writes_the_explicit_false_into_the_file_n8n_reads(hermetic):
    _write_registry(hermetic)
    assert _flag_in_file(hermetic) == "MISSING"
    r = client.post("/api/v1/settings", json={"tenant_id": TENANT, "general": {"currency": "RUB"}}, headers=_headers())
    assert r.status_code == 200
    assert _flag_in_file(hermetic) is False


def test_the_cabinet_switch_writes_the_flag_n8n_reads(hermetic):
    _write_registry(hermetic)
    url = f"/api/v1/settings/autonomy?tenant_id={TENANT}"

    assert client.patch(url, json={"allow_crm_mutations": True}, headers=_headers()).status_code == 200
    assert _flag_in_file(hermetic) is True

    # saving something else must not flip it back
    client.post("/api/v1/settings", json={"tenant_id": TENANT, "general": {"currency": "RUB"}}, headers=_headers())
    assert _flag_in_file(hermetic) is True

    assert client.patch(url, json={"allow_crm_mutations": False}, headers=_headers()).status_code == 200
    assert _flag_in_file(hermetic) is False


def test_the_other_autonomy_switches_do_not_touch_the_mutation_flag(hermetic):
    _write_registry(hermetic, enable_crm_mutations=True)
    url = f"/api/v1/settings/autonomy?tenant_id={TENANT}"
    assert client.patch(url, json={"enable_telegram_notifications": True}, headers=_headers()).status_code == 200
    assert _flag_in_file(hermetic) is True


def test_a_failed_write_of_the_registry_file_changes_nothing(hermetic, monkeypatch):
    _write_registry(hermetic)
    monkeypatch.setattr("apps.api.tenant_registry.save_tenants_registry", lambda *a, **k: False)
    url = f"/api/v1/settings/autonomy?tenant_id={TENANT}"
    r = client.patch(url, json={"allow_crm_mutations": True}, headers=_headers())
    assert r.status_code == 500
    monkeypatch.undo()
    _forget_caches()
    state = client.get(url, headers=_headers()).json()
    assert state["allow_crm_mutations"] is False


def test_a_new_client_is_created_with_the_flag_off(hermetic):
    record = provision_tenant(company_name="MU1 new client", client_email="mu1@x.test", crm_type="amocrm")
    try:
        assert record["enable_crm_mutations"] is False
    finally:
        db = SessionLocal()
        try:
            db.query(Tenant).filter(Tenant.id == record["tenant_id"]).delete(synchronize_session=False)
            db.commit()
        finally:
            db.close()
