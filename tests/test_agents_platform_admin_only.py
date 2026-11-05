"""
Endpoints of the agent platform that act on EVERY tenant (rollback and kill-switch of an agent harness, the canary
traffic router, the production traces captured for the golden set, the tuning recommendations) were open to any
client's CEO or РОП. A client owns one company; only the platform ADMIN may touch these.
"""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from packages.database.models import Tenant, User, UserRole
from packages.database.session import SessionLocal

# A request that comes from the internet through the Cloudflare tunnel (otherwise TestClient is a trusted local admin).
EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
ADMIN_KEY = os.getenv("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")
TENANT = "TNT-AG1"
OWNER_ID = "usr-ag1-owner"
client = TestClient(app)

# An agent that does not exist: the platform admin passes the role check and changes nothing.
NO_AGENT = {"agent_id": "zz_no_such_agent", "reason": "test"}
PLATFORM_WIDE = [
    ("POST", "/api/v1/agents/rollback", NO_AGENT),
    ("POST", "/api/v1/agents/kill-switch", NO_AGENT),
    ("POST", "/api/v1/agents/canary/configure", {}),
    ("GET", "/api/v1/agents/vcr/pending", None),
    ("GET", "/api/v1/agents/vcr/stats", None),
    ("POST", "/api/v1/agents/vcr/generate/zz-none", None),
    ("POST", "/api/v1/agents/vcr/review", {"scenario_id": "zz-none", "decision": "REJECT"}),
    ("GET", "/api/v1/agents/policy/recommendations", None),
]


@pytest.fixture(scope="module", autouse=True)
def tenant_and_owner():
    db = SessionLocal()
    try:
        if not db.query(Tenant).filter(Tenant.id == TENANT).first():
            db.add(Tenant(id=TENANT, name=TENANT, slug=TENANT.lower(), settings={"crm_type": "amocrm"}))
            db.commit()
        if not db.query(User).filter(User.id == OWNER_ID).first():
            db.add(User(id=OWNER_ID, tenant_id=TENANT, email="owner@ag1.test", full_name="Owner",
                        hashed_password="x", role=UserRole.CEO, is_active=True))
            db.commit()
    finally:
        db.close()
    yield
    db = SessionLocal()
    try:
        db.query(User).filter(User.id == OWNER_ID).delete()
        db.query(Tenant).filter(Tenant.id == TENANT).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _bearer(role, sub=None):
    claims = {"sub": sub or f"c-{uuid.uuid4().hex[:6]}@ag1.test", "tenant_id": TENANT, "role": role}
    return {**EXTERNAL, "Authorization": "Bearer " + create_access_token(claims)}


CLIENT_CALLERS = {
    "default client label": lambda: _bearer("РОП • Руководитель ОП"),
    "РОП": lambda: _bearer("РОП"),
    "CEO in the token": lambda: _bearer("CEO"),
    "manager": lambda: _bearer("Менеджер ОП"),
    "owner whose stored role is CEO": lambda: _bearer("РОП", sub=OWNER_ID),
}


@pytest.mark.parametrize("who", list(CLIENT_CALLERS))
@pytest.mark.parametrize("method,path,body", PLATFORM_WIDE)
def test_a_client_never_reaches_the_platform_wide_endpoints(who, method, path, body):
    r = client.request(method, path, json=body, headers=CLIENT_CALLERS[who]())
    assert r.status_code == 403, f"{who} got {r.status_code} on {method} {path}"


@pytest.mark.parametrize("method,path,body", PLATFORM_WIDE)
def test_anonymous_callers_are_not_let_in(method, path, body):
    r = client.request(method, path, json=body, headers=EXTERNAL)
    assert r.status_code == 401


@pytest.mark.parametrize("method,path,body", PLATFORM_WIDE)
def test_the_platform_admin_passes_the_role_check(method, path, body):
    r = client.request(method, path, json=body, headers={**EXTERNAL, "x-admin-key": ADMIN_KEY})
    assert r.status_code not in (401, 403), f"admin got {r.status_code} on {method} {path}"
