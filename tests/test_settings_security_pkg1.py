"""
Settings review, package 1: a client must not reach another client's settings.

- the client label "РОП • Руководитель ОП" was mapped to CEO and CEO crossed tenants;
- a DB user with the CEO role (the owner of one company) crossed tenants as well;
- a logged-out (revoked) token still worked on /settings;
- /settings accepted absurd numbers (win_pct 500, capacity -1, a negative plan).
"""

import datetime as dt
import uuid

import pytest
from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials

from apps.api.auth import create_access_token, get_current_user
from apps.api.main import app
from apps.api.routers import settings_router
from packages.database.models import RevokedToken, Tenant, User, UserRole
from packages.database.session import SessionLocal

# A request that comes from the internet through the Cloudflare tunnel (otherwise TestClient is a trusted local admin).
EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
CLIENT_ROLE = "РОП • Руководитель ОП"  # the default role label of a client account
TENANT_A, TENANT_B = "TNT-PK1A", "TNT-PK1B"
CEO_ID = "usr-pk1-ceo-a"

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def tenants():
    db = SessionLocal()
    try:
        for tid in (TENANT_A, TENANT_B):
            if not db.query(Tenant).filter(Tenant.id == tid).first():
                db.add(Tenant(id=tid, name=tid, slug=tid.lower(), settings={"crm_type": "amocrm"}))
        db.commit()
        if not db.query(User).filter(User.id == CEO_ID).first():
            db.add(User(id=CEO_ID, tenant_id=TENANT_A, email="ceo-a@pk1.test", full_name="Owner A",
                        hashed_password="x", role=UserRole.CEO, is_active=True))
        db.commit()
    finally:
        db.close()
    yield
    db = SessionLocal()
    try:
        db.query(User).filter(User.id == CEO_ID).delete()
        db.query(RevokedToken).filter(RevokedToken.jti.like("pk1-%")).delete(synchronize_session=False)
        db.query(Tenant).filter(Tenant.id.in_((TENANT_A, TENANT_B))).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def _headers(tenant, role=CLIENT_ROLE, sub=None, **extra):
    claims = {"sub": sub or f"client-{uuid.uuid4().hex[:6]}@pk1.test", "tenant_id": tenant, "role": role, **extra}
    return {**EXTERNAL, "Authorization": "Bearer " + create_access_token(claims)}


def _autonomy_of_b():
    db = SessionLocal()
    try:
        return bool((db.get(Tenant, TENANT_B).settings or {}).get("allow_crm_mutations", False))
    finally:
        db.close()


# ---- 1. cross-tenant autonomy ------------------------------------------------------------------------------------

@pytest.mark.parametrize("headers_factory", [
    lambda: _headers(TENANT_A),                              # client label that used to become CEO
    lambda: _headers(TENANT_A, role="CEO"),                  # JWT-only CEO
    lambda: _headers(TENANT_A, role="РОП", sub=CEO_ID),      # DB user whose stored role is CEO
])
def test_client_cannot_change_or_read_autonomy_of_another_tenant(headers_factory):
    r = client.patch(f"/api/v1/settings/autonomy?tenant_id={TENANT_B}",
                     json={"allow_crm_mutations": True, "allow_client_communication": True},
                     headers=headers_factory())
    assert r.status_code == 403
    assert _autonomy_of_b() is False
    assert client.get(f"/api/v1/settings/autonomy?tenant_id={TENANT_B}", headers=headers_factory()).status_code == 403


def test_client_changes_autonomy_of_own_tenant():
    h = _headers(TENANT_A)
    assert client.patch(f"/api/v1/settings/autonomy?tenant_id={TENANT_A}", json={"allow_crm_mutations": False}, headers=h).status_code == 200
    assert client.get(f"/api/v1/settings/autonomy?tenant_id={TENANT_A}", headers=h).status_code == 200


def test_platform_admin_still_crosses_tenants():
    h = _headers(TENANT_A, role="admin", is_admin=True)
    r = client.patch(f"/api/v1/settings/autonomy?tenant_id={TENANT_B}", json={"allow_crm_mutations": False}, headers=h)
    assert r.status_code == 200


def test_hitl_approvals_of_another_tenant_are_closed_to_clients_and_owners():
    for h in (_headers(TENANT_A), _headers(TENANT_A, role="РОП", sub=CEO_ID)):
        assert client.get(f"/api/v1/agents/approvals?tenant_id={TENANT_B}", headers=h).status_code == 403
    assert client.get(f"/api/v1/agents/approvals?tenant_id={TENANT_A}", headers=_headers(TENANT_A)).status_code == 200


# ---- 2. role mapping ----------------------------------------------------------------------------------------------

@pytest.mark.parametrize("label,expected", [
    (CLIENT_ROLE, UserRole.ROP),
    ("📋 РОП", UserRole.ROP),
    ("CEO / РОП", UserRole.ROP),              # ambiguous -> the lower privilege
    ("Генеральный директор", UserRole.CEO),
    ("Директор по Европе", UserRole.CEO),     # "Европе" contains "роп" but is not the word РОП
    ("CEO", UserRole.CEO),
    ("Admin / Супервайзер", UserRole.ADMIN),
    ("Менеджер ОП", UserRole.KAM),
])
def test_role_label_maps_to_the_least_privileged_matching_role(label, expected):
    token = create_access_token({"sub": f"nobody-{uuid.uuid4().hex[:6]}@pk1.test", "tenant_id": TENANT_A, "role": label})
    db = SessionLocal()
    try:
        user = get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=token), db, None)
    finally:
        db.close()
    assert user.role == expected


# ---- 3. revoked token ---------------------------------------------------------------------------------------------

def test_revoked_token_is_rejected_by_settings(monkeypatch):
    monkeypatch.setattr(settings_router, "fetch_settings_from_sheets", lambda tenant_id="TNT-001", force_refresh=False: {"tenant_id": tenant_id})
    jti = f"pk1-{uuid.uuid4().hex}"
    h = _headers(TENANT_A, jti=jti)
    assert client.get("/api/v1/settings", headers=h).status_code == 200
    db = SessionLocal()
    try:
        db.add(RevokedToken(jti=jti, expires_at=dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)))
        db.commit()
    finally:
        db.close()
    assert client.get("/api/v1/settings", headers=h).status_code == 401
    assert client.post("/api/v1/settings", json={"tenant_id": TENANT_A, "general": {"company_name": "z"}}, headers=h).status_code == 401


# ---- 4. validation ------------------------------------------------------------------------------------------------

@pytest.mark.parametrize("body", [
    {"general": {"monthly_target": -100}},
    {"general": {"avg_deal_check": -1}},
    {"stages": [{"id": 1, "name": "A", "sla_hours": -5, "win_pct": 10}]},
    {"stages": [{"id": 1, "name": "A", "sla_hours": 5, "win_pct": 500}]},
    {"managers": [{"id": "m", "name": "M", "role": "r", "capacity": -1}]},
    {"managers": [{"id": "m", "name": "M", "role": "r", "daily_calls_target": 99999}]},
    {"managers": [{"id": "m", "name": "M", "role": "r", "next_step_target_pct": 900}]},
    {"managers": [{"id": "m", "name": "M", "role": "r", "revenue_target": -5}]},
    {"loss_reasons": [{"code": "L1", "reason": "x", "reactivation_prob": 200}]},
])
def test_absurd_values_are_rejected(body):
    r = client.post("/api/v1/settings", json={"tenant_id": TENANT_A, **body}, headers=_headers(TENANT_A))
    assert r.status_code == 422


def test_sane_values_still_save(monkeypatch):
    saved = []
    monkeypatch.setattr(settings_router, "save_settings_to_sheets", lambda payload: saved.append(payload) or True)
    monkeypatch.setattr(settings_router, "fetch_settings_from_sheets", lambda tenant_id="TNT-001", force_refresh=False: {"tenant_id": tenant_id})
    body = {
        "tenant_id": TENANT_A,
        "general": {"monthly_target": 0, "avg_deal_check": 0},  # 0 = "clear it", the cabinet sends exactly that
        "stages": [{"id": 6, "name": "Won", "sla_hours": 0, "win_pct": 100}],
        "managers": [{"id": "m", "name": "M", "role": "r", "capacity": 0, "revenue_target": 1500000,
                      "daily_calls_target": 20, "daily_dials_target": 40, "monthly_meetings_target": 15, "next_step_target_pct": 80}],
    }
    r = client.post("/api/v1/settings", json=body, headers=_headers(TENANT_A))
    assert r.status_code == 200
    assert len(saved) == 1
