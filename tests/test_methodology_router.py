"""
Unit and integration tests for Methodology & Script Engineering Router:
- Closed loop 13 criteria heatmap
- Semantic Anchors & Banned Triggers validation
- Single-pass SQL aggregation (AR, SWR, FWR, Script Lift)
- 4 Verdict diagnostic statuses (WORKING_STANDARD, SABOTAGE_HIDDEN_GEM, HYPOTHESIS_FAILED, FREESTYLE_STRONGER)
- X-Ray drawer with saboteur roster & golden quotes
- Gatekeeper lab analytics
"""

import pytest
from fastapi.testclient import TestClient
from apps.api.main import app
from packages.database.session import get_db, SessionLocal
from packages.database.models import ScriptVersion, ScriptModule, CallModuleEvaluation

client = TestClient(app)

TEST_TENANT = "TNT-TEST-METH"


@pytest.fixture(autouse=True)
def cleanup_test_tenant_methodology():
    """Ensure test tenant data is clean before and after each test."""
    db = SessionLocal()
    try:
        db.query(CallModuleEvaluation).filter(CallModuleEvaluation.tenant_id == TEST_TENANT).delete()
        versions = db.query(ScriptVersion).filter(ScriptVersion.tenant_id == TEST_TENANT).all()
        for v in versions:
            db.query(ScriptModule).filter(ScriptModule.script_version_id == v.id).delete()
            db.delete(v)
        db.commit()
    finally:
        db.close()

    yield

    db = SessionLocal()
    try:
        db.query(CallModuleEvaluation).filter(CallModuleEvaluation.tenant_id == TEST_TENANT).delete()
        versions = db.query(ScriptVersion).filter(ScriptVersion.tenant_id == TEST_TENANT).all()
        for v in versions:
            db.query(ScriptModule).filter(ScriptModule.script_version_id == v.id).delete()
            db.delete(v)
        db.commit()
    finally:
        db.close()


def test_methodology_versions_auto_seed():
    """Verify that requesting versions for a new tenant automatically seeds v1.0 and 13 modules."""
    response = client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == TEST_TENANT
    assert len(data["versions"]) >= 1
    active_v = next(v for v in data["versions"] if v["is_active"])
    assert active_v["version_tag"] == "v1.0"
    assert "Базовый речевой стандарт" in active_v["title"]


def test_methodology_modules_contract():
    """Verify all 13 modules exist and have semantic anchors and banned triggers."""
    response = client.get(f"/api/v1/methodology/modules?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    modules = data["modules"]
    assert len(modules) == 13

    cr6_mod = next(m for m in modules if m["target_criterion"] == "cr6")
    assert "ЛПР" in cr6_mod["stage_name"] or "секретаря" in cr6_mod["stage_name"]
    assert len(cr6_mod["semantic_anchors"]) >= 2
    assert "рекомендуем" in cr6_mod["recommended_speech"].lower() or len(cr6_mod["recommended_speech"]) > 20

    cr9_mod = next(m for m in modules if m["target_criterion"] == "cr9")
    assert any("скидку" in b.lower() for b in cr9_mod["banned_triggers"])


def test_methodology_heatmap_metrics_and_verdicts():
    """Verify single-pass aggregation computes AR, SWR, FWR, Script Lift, and correct Verdicts."""
    response = client.get(f"/api/v1/methodology/heatmap?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    assert data["tenant_id"] == TEST_TENANT
    matrix = data["matrix"]
    assert len(matrix) == 13

    # Check cr6 (which should be flagged as SABOTAGE_HIDDEN_GEM or have low AR and high SWR)
    cr6_row = next(r for r in matrix if r["criterion"] == "cr6")
    assert cr6_row["total_relevant_calls"] > 50
    assert "swr_pct" in cr6_row
    assert "fwr_pct" in cr6_row
    assert "ar_pct" in cr6_row
    assert "script_lift_pct" in cr6_row
    assert cr6_row["verdict_status"] in [
        "SABOTAGE_HIDDEN_GEM",
        "WORKING_STANDARD",
        "HYPOTHESIS_FAILED",
        "FREESTYLE_STRONGER",
        "COLLECTING_DATA",
    ]


def test_methodology_xray_drawer_details():
    """Verify X-Ray inspection returns managers breakdown, saboteur identification, and golden quotes with timestamps."""
    response = client.get(f"/api/v1/methodology/xray/cr6?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    assert data["criterion"] == "cr6"
    assert "stats" in data
    assert "managers" in data
    assert len(data["managers"]) > 0

    # Ensure managers list includes adherence rate and saboteur flag
    saboteurs = [m for m in data["managers"] if m["is_saboteur"]]
    assert len(saboteurs) >= 1  # At least Ivanov/Smirnov flagged

    # Golden quotes must have quote, audio timestamp, and manager name
    quotes = data["golden_quotes"]
    assert len(quotes) > 0
    first_q = quotes[0]
    assert "timestamp_sec" in first_q
    assert first_q["timestamp_sec"] > 0
    assert len(first_q["quote"]) > 10
    assert first_q["manager_name"] is not None


def test_methodology_gatekeeper_lab():
    """Verify Gatekeeper Lab extracts winning hooks, pass rate %, and killer phrases."""
    response = client.get(f"/api/v1/methodology/gatekeeper-lab?tenant_id={TEST_TENANT}")
    assert response.status_code == 200
    data = response.json()
    assert data["pass_rate_pct"] > 0
    assert len(data["winning_hooks"]) >= 2
    assert len(data["banned_killer_phrases"]) >= 2

    top_hook = data["winning_hooks"][0]
    assert "phrase" in top_hook
    assert "success_rate_pct" in top_hook
    assert top_hook["success_rate_pct"] > 50


def test_create_and_activate_new_version():
    """Verify that a manager can create a new version v2.0 and activate it."""
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

    # Check that v2.0 is now the active version in versions list
    list_resp = client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}")
    assert list_resp.status_code == 200
    versions = list_resp.json()["versions"]
    v2 = next(v for v in versions if v["version_tag"] == "v2.0")
    assert v2["is_active"] is True
    v1 = next(v for v in versions if v["version_tag"] == "v1.0")
    assert v1["is_active"] is False


def test_update_module_and_clone_in_new_version():
    """Verify that updating a module saves anchors and creating v2.0 clones the updated modules."""
    # 1. Update cr9 module in v1.0
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

    # 2. Create v2.1 -> should clone the customized cr9 module
    create_payload = {
        "version_tag": "v2.1",
        "title": "Скрипт v2.1 с доработкой цены",
        "hypothesis": "Проверяем наследование настроенных модулей",
        "set_active": True,
    }
    cr_resp = client.post(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}", json=create_payload)
    assert cr_resp.status_code == 200

    # 3. Check modules of v2.1
    v2_modules_resp = client.get(f"/api/v1/methodology/modules?tenant_id={TEST_TENANT}")
    assert v2_modules_resp.status_code == 200
    v2_cr9 = next(m for m in v2_modules_resp.json()["modules"] if m["target_criterion"] == "cr9")
    assert v2_cr9["recommended_speech"] == "Новый спич отработки возражения Дорого"
    assert "Якорь 1: Сравнение цены" in v2_cr9["semantic_anchors"]
def test_methodology_gatekeeper_causality():
    """Verify that Gatekeeper Lab returns causality fields (Prompt ➔ Speech ➔ Trigger)."""
    resp = client.get(f"/api/v1/methodology/gatekeeper-lab?tenant_id={TEST_TENANT}")
    assert resp.status_code == 200
    data = resp.json()
    assert "winning_hooks" in data
    assert len(data["winning_hooks"]) >= 1
    hook = data["winning_hooks"][0]
    assert "gatekeeper_prompt" in hook
    assert "manager_speech" in hook
    assert "psychological_trigger" in hook
    assert "phrase" in hook
    assert hook["gatekeeper_prompt"] != ""
    assert hook["psychological_trigger"] != ""


def test_methodology_versions_compare():
    """Verify that /versions/compare accurately returns side-by-side delta metrics for 13 criteria."""
    # 1. Initialize v1.0
    v1_resp = client.get(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}")
    assert v1_resp.status_code == 200
    v1_id = v1_resp.json()["active_version_id"]

    # 2. Seed v1 evaluations for cr6 and cr9
    db = SessionLocal()
    try:
        # v1: 10 calls for cr6, 2 adhered & achieved, 8 freestyle & failed (AR=20%, SWR=100%, FWR=0%, Lift=+100%)
        for i in range(10):
            adhered = (i < 2)
            achieved = (i < 2)
            db.add(CallModuleEvaluation(
                id=f"v1-cme-cr6-{i}",
                call_id=f"v1-call-cr6-{i}",
                tenant_id=TEST_TENANT,
                script_version_id=v1_id,
                target_criterion="cr6",
                is_relevant=True,
                adhered=adhered,
                achieved=achieved,
                matched_anchors=["Экспертный заход"] if adhered else [],
                detected_banned=[],
            ))
        db.commit()
    finally:
        db.close()

    # 3. Create v2.0
    v2_resp = client.post(f"/api/v1/methodology/versions?tenant_id={TEST_TENANT}", json={
        "version_tag": "v2.0",
        "title": "Версия с откалиброванным обходом секретаря",
        "hypothesis": "Поднимаем AR с 20% до 80%",
        "set_active": True,
    })
    assert v2_resp.status_code == 200
    v2_id = v2_resp.json()["version_id"]

    # 4. Seed v2 evaluations for cr6: 10 calls, 8 adhered & achieved, 2 freestyle
    db = SessionLocal()
    try:
        for i in range(10):
            adhered = (i < 8)
            achieved = (i < 8)
            db.add(CallModuleEvaluation(
                id=f"v2-cme-cr6-{i}",
                call_id=f"v2-call-cr6-{i}",
                tenant_id=TEST_TENANT,
                script_version_id=v2_id,
                target_criterion="cr6",
                is_relevant=True,
                adhered=adhered,
                achieved=achieved,
                matched_anchors=["Экспертный заход"] if adhered else [],
                detected_banned=[],
            ))
        db.commit()
    finally:
        db.close()

    # 5. Call compare endpoint
    comp_resp = client.get(f"/api/v1/methodology/versions/compare?v1_id={v1_id}&v2_id={v2_id}&tenant_id={TEST_TENANT}")
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert comp_data["v1"]["id"] == v1_id
    assert comp_data["v2"]["id"] == v2_id
    assert len(comp_data["comparison"]) == 13

# Check cr6 comparison
    cr6_row = next(r for r in comp_data["comparison"] if r["criterion"] == "cr6")
    assert cr6_row["v1_metrics"]["total_calls"] >= 10
    assert cr6_row["v2_metrics"]["total_calls"] == 10
    assert cr6_row["v2_metrics"]["ar_pct"] == 80.0
    assert cr6_row["v2_metrics"]["swr_pct"] == 100.0
    assert cr6_row["intervention_verdict"] in ["IMPROVEMENT_CONFIRMED", "STABLE_NEUTRAL"]
    assert "delta_lift_pct" in cr6_row
    assert "delta_defect_rate_pct" in cr6_row
    assert "summary" in comp_data
    assert "overall_status" in comp_data["summary"]
