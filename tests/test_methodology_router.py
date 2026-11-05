"""
Tests for the Methodology & Script Engineering router:
- access: no login -> 401, a client sees only its own company, a foreign version_id -> 404
- opening the page never invents calls (no demo seeding); an empty tenant is an honest empty state
- the metrics (AR, SWR, FWR, Script Lift), the verdicts, the X-Ray drawer, the version compare
The metrics tests seed the demo generator explicitly: production code never does.
"""

import os
import random

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers.methodology_router import seed_realistic_evaluations
from packages.database.models import CallModuleEvaluation, ScriptModule, ScriptVersion
from packages.database.session import SessionLocal

TEST_TENANT = "TNT-TEST-METH"
OTHER_TENANT = "TNT-TEST-METH2"
TENANTS = (TEST_TENANT, OTHER_TENANT)

ADMIN = {"Authorization": "Bearer " + create_access_token({"sub": "admin", "tenant_id": "TNT-001", "role": "admin"})}
CLIENT = {"Authorization": "Bearer " + create_access_token({"sub": "client-meth", "tenant_id": TEST_TENANT, "role": "CEO"})}

client = TestClient(app, headers=ADMIN)  # the platform admin names the tenant
anon = TestClient(app)  # no cookie, no token
as_client = TestClient(app, headers=CLIENT)  # a real client: bound to TEST_TENANT


def _wipe():
    db = SessionLocal()
    try:
        for tenant in TENANTS:
            db.query(CallModuleEvaluation).filter(CallModuleEvaluation.tenant_id == tenant).delete()
            for v in db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant).all():
                db.query(ScriptModule).filter(ScriptModule.script_version_id == v.id).delete()
                db.delete(v)
        db.commit()
    finally:
        db.close()


def _count_evaluations(tenant):
    db = SessionLocal()
    try:
        return db.query(CallModuleEvaluation).filter(CallModuleEvaluation.tenant_id == tenant).count()
    finally:
        db.close()


def _count_versions(tenant):
    db = SessionLocal()
    try:
        return db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant).count()
    finally:
        db.close()


def _active_version_id(tenant=TEST_TENANT):
    return client.get(f"/api/v1/methodology/versions?tenant_id={tenant}").json()["active_version_id"]


def _seed_demo(tenant=TEST_TENANT):
    """The demo generator, called on purpose (tests only)."""
    version_id = _active_version_id(tenant)
    db = SessionLocal()
    try:
        seed_realistic_evaluations(db, tenant, version_id)
    finally:
        db.close()
    return version_id


@pytest.fixture(autouse=True)
def cleanup_test_tenants_methodology():
    _wipe()
    yield
    _wipe()


# ---------------------------------------------------------------- access

ENDPOINTS = [
    ("get", "/api/v1/methodology/versions?tenant_id=" + TEST_TENANT, None),
    ("post", "/api/v1/methodology/versions?tenant_id=" + TEST_TENANT, {"version_tag": "v9", "title": "x"}),
    ("put", "/api/v1/methodology/versions/any-id/activate?tenant_id=" + TEST_TENANT, None),
    ("get", "/api/v1/methodology/modules?tenant_id=" + TEST_TENANT, None),
    (
        "put",
        "/api/v1/methodology/modules/cr1?tenant_id=" + TEST_TENANT,
        {"recommended_speech": "x", "semantic_anchors": ["a"], "banned_triggers": [], "min_anchors_required": 1},
    ),
    ("get", "/api/v1/methodology/heatmap?tenant_id=" + TEST_TENANT, None),
    ("get", "/api/v1/methodology/xray/cr1?tenant_id=" + TEST_TENANT, None),
    ("get", "/api/v1/methodology/gatekeeper-lab?tenant_id=" + TEST_TENANT, None),
    ("get", "/api/v1/methodology/versions/compare?tenant_id=" + TEST_TENANT, None),
]


@pytest.mark.parametrize("method,url,body", ENDPOINTS)
def test_anonymous_request_is_rejected_and_writes_nothing(method, url, body):
    resp = getattr(anon, method)(url, json=body) if body is not None else getattr(anon, method)(url)
    assert resp.status_code == 401
    assert _count_versions(TEST_TENANT) == 0


def test_client_sees_only_its_own_company():
    own = as_client.get("/api/v1/methodology/versions")  # no tenant_id: taken from the login
    assert own.status_code == 200
    assert own.json()["tenant_id"] == TEST_TENANT

    same = as_client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT.lower()}")
    assert same.status_code == 200

    foreign = as_client.get(f"/api/v1/methodology/versions?tenant_id={OTHER_TENANT}")
    assert foreign.status_code == 403
    assert _count_versions(OTHER_TENANT) == 0
    assert _count_evaluations(OTHER_TENANT) == 0


def test_admin_must_name_a_tenant():
    admin_key_user = TestClient(app, headers={"x-admin-key": os.environ["REVOPS_ADMIN_KEY"]})
    assert admin_key_user.get("/api/v1/methodology/versions").status_code == 400


def test_foreign_version_id_is_not_readable_or_editable():
    mine = _active_version_id(TEST_TENANT)
    theirs = _active_version_id(OTHER_TENANT)
    assert mine != theirs

    body = {"recommended_speech": "EDITED", "semantic_anchors": ["a"], "banned_triggers": [], "min_anchors_required": 1}
    for url in (
        f"/api/v1/methodology/modules?tenant_id={TEST_TENANT}&version_id={theirs}",
        f"/api/v1/methodology/heatmap?tenant_id={TEST_TENANT}&version_id={theirs}",
        f"/api/v1/methodology/xray/cr1?tenant_id={TEST_TENANT}&version_id={theirs}",
        f"/api/v1/methodology/gatekeeper-lab?tenant_id={TEST_TENANT}&version_id={theirs}",
    ):
        assert client.get(url).status_code == 404, url
    put = client.put(f"/api/v1/methodology/modules/cr1?tenant_id={TEST_TENANT}&version_id={theirs}", json=body)
    assert put.status_code == 404

    other_cr1 = next(
        m for m in client.get(f"/api/v1/methodology/modules?tenant_id={OTHER_TENANT}").json()["modules"]
        if m["target_criterion"] == "cr1"
    )
    assert other_cr1["recommended_speech"] != "EDITED"


# ---------------------------------------------------------------- no invented data

def test_opening_the_page_invents_no_calls():
    versions = client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}")
    assert versions.status_code == 200
    heatmap = client.get(f"/api/v1/methodology/heatmap?tenant_id={TEST_TENANT}").json()["matrix"]
    xray = client.get(f"/api/v1/methodology/xray/cr6?tenant_id={TEST_TENANT}").json()
    lab = client.get(f"/api/v1/methodology/gatekeeper-lab?tenant_id={TEST_TENANT}").json()

    assert _count_evaluations(TEST_TENANT) == 0
    assert len(heatmap) == 13
    assert all(r["total_relevant_calls"] == 0 and r["verdict_status"] == "COLLECTING_DATA" for r in heatmap)
    assert xray["stats"]["total_calls"] == 0 and xray["managers"] == [] and xray["golden_quotes"] == []
    assert lab["total_attempts"] == 0 and lab["pass_rate_pct"] == 0.0
    assert lab["winning_hooks"] == [] and lab["banned_killer_phrases"] == []


def test_a_new_active_version_does_not_get_demo_calls_either():
    client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}")
    created = client.post(
        f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}",
        json={"version_tag": "v2.0", "title": "next", "set_active": True},
    )
    assert created.status_code == 200
    client.get(f"/api/v1/methodology/heatmap?tenant_id={TEST_TENANT}")  # the page reloads right after creating
    assert _count_evaluations(TEST_TENANT) == 0


def test_demo_generator_does_not_reseed_the_global_random():
    random.seed(12345)
    before = random.getstate()
    _seed_demo()
    assert random.getstate() == before


# ---------------------------------------------------------------- baseline script

def test_methodology_versions_auto_baseline():
    """A tenant without a script still gets v1.0 with its 13 modules (the calls table stays empty)."""
    response = client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == TEST_TENANT
    active_v = next(v for v in data["versions"] if v["is_active"])
    assert active_v["version_tag"] == "v1.0"
    assert "Базовый речевой стандарт" in active_v["title"]


def test_methodology_modules_contract():
    response = client.get(f"/api/v1/methodology/modules?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    modules = response.json()["modules"]
    assert len(modules) == 13

    cr6_mod = next(m for m in modules if m["target_criterion"] == "cr6")
    assert "ЛПР" in cr6_mod["stage_name"] or "секретаря" in cr6_mod["stage_name"]
    assert len(cr6_mod["semantic_anchors"]) >= 2
    assert len(cr6_mod["recommended_speech"]) > 20

    cr9_mod = next(m for m in modules if m["target_criterion"] == "cr9")
    assert any("скидку" in b.lower() for b in cr9_mod["banned_triggers"])


# ---------------------------------------------------------------- metrics (on explicit demo data)

def test_methodology_heatmap_metrics_and_verdicts():
    _seed_demo()
    response = client.get(f"/api/v1/methodology/heatmap?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == TEST_TENANT
    matrix = data["matrix"]
    assert len(matrix) == 13

    cr6_row = next(r for r in matrix if r["criterion"] == "cr6")
    assert cr6_row["total_relevant_calls"] > 50
    for key in ("swr_pct", "fwr_pct", "ar_pct", "script_lift_pct"):
        assert key in cr6_row
    assert cr6_row["verdict_status"] in [
        "SABOTAGE_HIDDEN_GEM",
        "WORKING_STANDARD",
        "HYPOTHESIS_FAILED",
        "FREESTYLE_STRONGER",
        "COLLECTING_DATA",
    ]


def test_methodology_xray_drawer_details():
    _seed_demo()
    response = client.get(f"/api/v1/methodology/xray/cr6?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    assert data["criterion"] == "cr6"
    assert "stats" in data
    assert len(data["managers"]) > 0
    assert len([m for m in data["managers"] if m["is_saboteur"]]) >= 1

    quotes = data["golden_quotes"]
    assert len(quotes) > 0
    first_q = quotes[0]
    assert first_q["timestamp_sec"] > 0
    assert len(first_q["quote"]) > 10
    assert first_q["manager_name"] is not None


def test_methodology_gatekeeper_pass_rate_comes_from_calls_not_from_a_canned_list():
    _seed_demo()
    response = client.get(f"/api/v1/methodology/gatekeeper-lab?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    assert data["total_attempts"] > 0
    assert data["pass_rate_pct"] > 0
    assert data["winning_hooks"] == []
    assert data["banned_killer_phrases"] == []


# ---------------------------------------------------------------- versions

def test_create_and_activate_new_version():
    client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}")
    payload = {
        "version_tag": "v2.0",
        "title": "Новая гипотеза захода на секретаря",
        "hypothesis": "Экспертный запрос по кассовым разрывам поднимет выход на ЛПР на 25%",
        "set_active": True,
    }
    response = client.post(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["status"] == "created"
    assert res_data["version_tag"] == "v2.0"
    assert res_data["is_active"] is True

    versions = client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}").json()["versions"]
    assert next(v for v in versions if v["version_tag"] == "v2.0")["is_active"] is True
    assert next(v for v in versions if v["version_tag"] == "v1.0")["is_active"] is False


def test_update_module_and_clone_in_new_version():
    payload = {
        "recommended_speech": "Новый спич отработки возражения Дорого",
        "semantic_anchors": ["Якорь 1: Сравнение цены", "Якорь 2: Потери от бездействия"],
        "banned_triggers": ["Сделаю скидку 50%"],
        "min_anchors_required": 2,
    }
    up_resp = client.put(f"/api/v1/methodology/modules/cr9?tenant_id={TEST_TENANT}", json=payload)
    assert up_resp.status_code == 200
    up_data = up_resp.json()
    assert up_data["status"] == "updated"
    assert up_data["recommended_speech"] == "Новый спич отработки возражения Дорого"
    assert len(up_data["semantic_anchors"]) == 2

    create_payload = {
        "version_tag": "v2.1",
        "title": "Скрипт v2.1 с доработкой цены",
        "hypothesis": "Проверяем наследование настроенных модулей",
        "set_active": True,
    }
    assert client.post(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}", json=create_payload).status_code == 200

    v2_modules = client.get(f"/api/v1/methodology/modules?tenant_id={TEST_TENANT}").json()["modules"]
    v2_cr9 = next(m for m in v2_modules if m["target_criterion"] == "cr9")
    assert v2_cr9["recommended_speech"] == "Новый спич отработки возражения Дорого"
    assert "Якорь 1: Сравнение цены" in v2_cr9["semantic_anchors"]


def test_methodology_versions_compare():
    """/versions/compare returns side-by-side delta metrics for 13 criteria."""
    v1_id = _active_version_id()

    db = SessionLocal()
    try:
        # v1: 10 calls for cr6, 2 adhered & achieved, 8 freestyle & failed (AR=20%, SWR=100%, FWR=0%, Lift=+100%)
        for i in range(10):
            adhered = i < 2
            db.add(CallModuleEvaluation(
                id=f"v1-cme-cr6-{i}",
                call_id=f"v1-call-cr6-{i}",
                tenant_id=TEST_TENANT,
                script_version_id=v1_id,
                target_criterion="cr6",
                is_relevant=True,
                adhered=adhered,
                achieved=adhered,
                matched_anchors=["Экспертный заход"] if adhered else [],
                detected_banned=[],
            ))
        db.commit()
    finally:
        db.close()

    v2_resp = client.post(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}", json={
        "version_tag": "v2.0",
        "title": "Версия с откалиброванным обходом секретаря",
        "hypothesis": "Поднимаем AR с 20% до 80%",
        "set_active": True,
    })
    assert v2_resp.status_code == 200
    v2_id = v2_resp.json()["version_id"]

    db = SessionLocal()
    try:
        for i in range(10):
            adhered = i < 8
            db.add(CallModuleEvaluation(
                id=f"v2-cme-cr6-{i}",
                call_id=f"v2-call-cr6-{i}",
                tenant_id=TEST_TENANT,
                script_version_id=v2_id,
                target_criterion="cr6",
                is_relevant=True,
                adhered=adhered,
                achieved=adhered,
                matched_anchors=["Экспертный заход"] if adhered else [],
                detected_banned=[],
            ))
        db.commit()
    finally:
        db.close()

    comp_resp = client.get(f"/api/v1/methodology/versions/compare?v1_id={v1_id}&v2_id={v2_id}&tenant_id={TEST_TENANT}")
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert comp_data["v1"]["id"] == v1_id
    assert comp_data["v2"]["id"] == v2_id
    assert len(comp_data["comparison"]) == 13

    cr6_row = next(r for r in comp_data["comparison"] if r["criterion"] == "cr6")
    assert cr6_row["v1_metrics"]["total_calls"] == 10
    assert cr6_row["v2_metrics"]["total_calls"] == 10
    assert cr6_row["v2_metrics"]["ar_pct"] == 80.0
    assert cr6_row["v2_metrics"]["swr_pct"] == 100.0
    assert cr6_row["intervention_verdict"] in ["IMPROVEMENT_CONFIRMED", "STABLE_NEUTRAL"]
    assert "delta_lift_pct" in cr6_row
    assert "delta_defect_rate_pct" in cr6_row
    assert "overall_status" in comp_data["summary"]
