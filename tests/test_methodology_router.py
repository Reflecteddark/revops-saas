"""
Methodology router:
- access: no login -> 401, a client sees only its own company, a foreign version_id -> 404
- opening the page never invents calls; a company without calls sees an honest empty state
- the numbers (AR, SWR, FWR, lift), the verdicts and the managers come from the rows of real calls
- versions: a version that was applied to calls is history, a change is a new version
- the comparison of two versions says "collecting data" instead of guessing
The rows here are written by hand; the path of a real call into them is tested in test_methodology_live.py.
"""

import os
import uuid

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from packages.database.models import CallModuleEvaluation, ScriptModule, ScriptVersion
from packages.database.session import SessionLocal

API = "/api/v1/methodology"
ADMIN = {"Authorization": "Bearer " + create_access_token({"sub": "admin", "tenant_id": "TNT-001", "role": "admin"})}

client = TestClient(app, headers=ADMIN)  # the platform admin names the tenant
anon = TestClient(app)  # no cookie, no token


def _wipe(*tenants):
    db = SessionLocal()
    try:
        for tenant in tenants:
            db.query(CallModuleEvaluation).filter(CallModuleEvaluation.tenant_id == tenant).delete()
            for v in db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tenant).all():
                db.query(ScriptModule).filter(ScriptModule.script_version_id == v.id).delete()
                db.delete(v)
        db.commit()
    finally:
        db.close()


@pytest.fixture
def tid():
    tenant = f"TNT-METH-{uuid.uuid4().hex[:6].upper()}"
    _wipe(tenant)
    yield tenant
    _wipe(tenant)


@pytest.fixture
def other():
    tenant = f"TNT-METH-{uuid.uuid4().hex[:6].upper()}"
    _wipe(tenant)
    yield tenant
    _wipe(tenant)


def _client_for(tenant):
    token = create_access_token({"sub": f"client-{tenant}", "tenant_id": tenant, "role": "CEO"})
    return TestClient(app, headers={"Authorization": f"Bearer {token}"})


def _active(tenant):
    return client.get(f"{API}/versions?tenant_id={tenant}").json()["active_version_id"]


def _rows(tenant, version_id, cr, *, script_win=0, script_lose=0, free_win=0, free_lose=0, manager="Мария", quote=None):
    """Hand-written evaluation rows: n calls of each kind for one criterion."""
    db = SessionLocal()
    try:
        for adhered, achieved, n in ((True, True, script_win), (True, False, script_lose), (False, True, free_win), (False, False, free_lose)):
            for _ in range(n):
                db.add(CallModuleEvaluation(
                    id=str(uuid.uuid4()),
                    call_id=f"c{uuid.uuid4().hex[:20]}",
                    tenant_id=tenant,
                    script_version_id=version_id,
                    target_criterion=cr,
                    is_relevant=True,
                    adhered=adhered,
                    achieved=achieved,
                    evidence_quote=quote if adhered else None,
                    manager_name=manager,
                    matched_anchors=[],
                    detected_banned=[],
                ))
        db.commit()
    finally:
        db.close()


def _count_rows(tenant):
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


# ---------------------------------------------------------------- access

ENDPOINTS = [
    ("get", f"{API}/versions", None),
    ("post", f"{API}/versions", {"version_tag": "v9", "title": "x"}),
    ("put", f"{API}/versions/any-id/activate", None),
    ("get", f"{API}/modules", None),
    ("put", f"{API}/modules/cr1", {"recommended_speech": "x", "semantic_anchors": ["a"], "banned_triggers": [], "min_anchors_required": 1}),
    ("get", f"{API}/heatmap", None),
    ("get", f"{API}/xray/cr1", None),
    ("get", f"{API}/versions/compare", None),
    ("post", f"{API}/backfill", None),
]


@pytest.mark.parametrize("method,url,body", ENDPOINTS)
def test_anonymous_request_is_rejected_and_writes_nothing(tid, method, url, body):
    url = f"{url}?tenant_id={tid}"
    resp = getattr(anon, method)(url, json=body) if body is not None else getattr(anon, method)(url)
    assert resp.status_code == 401
    assert _count_versions(tid) == 0


def test_client_sees_only_its_own_company(tid, other):
    mine = _client_for(tid)
    own = mine.get(f"{API}/versions")  # no tenant_id: taken from the login
    assert own.status_code == 200 and own.json()["tenant_id"] == tid
    assert mine.get(f"{API}/versions?tenant_id={tid.lower()}").status_code == 200
    assert mine.get(f"{API}/versions?tenant_id={other}").status_code == 403
    assert mine.post(f"{API}/backfill?tenant_id={other}").status_code == 403
    assert _count_versions(other) == 0


def test_admin_must_name_a_tenant():
    keyed = TestClient(app, headers={"x-admin-key": os.environ["REVOPS_ADMIN_KEY"]})
    assert keyed.get(f"{API}/versions").status_code == 400


def test_foreign_version_id_is_not_readable_or_editable(tid, other):
    theirs = _active(other)
    _active(tid)
    body = {"recommended_speech": "EDITED", "semantic_anchors": ["a"], "banned_triggers": [], "min_anchors_required": 1}
    for url in (
        f"{API}/modules?tenant_id={tid}&version_id={theirs}",
        f"{API}/heatmap?tenant_id={tid}&version_id={theirs}",
        f"{API}/xray/cr9?tenant_id={tid}&version_id={theirs}",
    ):
        assert client.get(url).status_code == 404, url
    assert client.put(f"{API}/modules/cr9?tenant_id={tid}&version_id={theirs}", json=body).status_code == 404
    cr9 = next(m for m in client.get(f"{API}/modules?tenant_id={other}").json()["modules"] if m["target_criterion"] == "cr9")
    assert cr9["recommended_speech"] != "EDITED"


# ---------------------------------------------------------------- honest empty state

def test_opening_the_page_invents_nothing(tid):
    assert client.get(f"{API}/versions?tenant_id={tid}").status_code == 200
    heat = client.get(f"{API}/heatmap?tenant_id={tid}").json()
    xray = client.get(f"{API}/xray/cr9?tenant_id={tid}").json()
    new = client.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v2.0", "title": "next", "set_active": True})
    assert new.status_code == 200
    client.get(f"{API}/heatmap?tenant_id={tid}")  # the page reloads right after creating a version

    assert _count_rows(tid) == 0
    assert len(heat["matrix"]) == 13
    scripted = [r for r in heat["matrix"] if r["has_standard"]]
    assert len(scripted) == 12
    assert all(r["total_relevant_calls"] == 0 and r["verdict_status"] == "COLLECTING_DATA" and r["calls_needed"] == 30 for r in scripted)
    assert heat["coverage"] == {"calls_with_transcript": 0, "calls_evaluated": 0}
    assert xray["stats"]["total_calls"] == 0 and xray["managers"] == [] and xray["golden_quotes"] == []


def test_cr11_has_no_speech_standard(tid):
    heat = client.get(f"{API}/heatmap?tenant_id={tid}").json()["matrix"]
    cr11 = next(r for r in heat if r["criterion"] == "cr11")
    assert cr11["has_standard"] is False and cr11["verdict_status"] == "NOT_SCRIPTED"
    modules = client.get(f"{API}/modules?tenant_id={tid}").json()["modules"]
    assert "cr11" not in {m["target_criterion"] for m in modules}


def test_default_standard_uses_the_audit_numbering_and_names_no_vendor(tid):
    data = client.get(f"{API}/modules?tenant_id={tid}").json()
    assert data["locked"] is False and data["applied_calls"] == 0
    mods = {m["target_criterion"]: m for m in data["modules"]}
    assert len(mods) == 12
    assert mods["cr9"]["title"] == "Приветствие и регламент" and mods["cr1"]["title"] == "Твёрдый Next Step"
    for m in mods.values():
        assert "RevOps" not in " ".join([m["recommended_speech"], *m["semantic_anchors"]])
        assert m["semantic_anchors"] or m["banned_triggers"]


def test_a_version_made_with_the_old_numbering_is_upgraded_when_no_call_used_it(tid):
    db = SessionLocal()
    try:
        v = ScriptVersion(id=str(uuid.uuid4()), tenant_id=tid, version_tag="v1.0", title="old", is_active=True)
        db.add(v)
        db.flush()
        db.add(ScriptModule(id=str(uuid.uuid4()), script_version_id=v.id, target_criterion="cr1", stage_name="Вход в контакт",
                            recommended_speech="Добрый день, компания RevOps OS", semantic_anchors=["a"], banned_triggers=[], min_anchors_required=1))
        db.commit()
        old_id = v.id
    finally:
        db.close()
    mods = {m["target_criterion"]: m for m in client.get(f"{API}/modules?tenant_id={tid}").json()["modules"]}
    assert client.get(f"{API}/versions?tenant_id={tid}").json()["active_version_id"] == old_id
    assert len(mods) == 12 and mods["cr1"]["stage_name"] == "Фиксация следующего шага"


def test_a_legacy_version_that_already_has_calls_is_left_alone(tid):
    db = SessionLocal()
    try:
        v = ScriptVersion(id=str(uuid.uuid4()), tenant_id=tid, version_tag="v1.0", title="old", is_active=True)
        db.add(v)
        db.flush()
        db.add(ScriptModule(id=str(uuid.uuid4()), script_version_id=v.id, target_criterion="cr1", stage_name="Вход в контакт",
                            recommended_speech="x", semantic_anchors=["a"], banned_triggers=[], min_anchors_required=1))
        db.commit()
        vid = v.id
    finally:
        db.close()
    _rows(tid, vid, "cr1", script_win=1)
    mods = client.get(f"{API}/modules?tenant_id={tid}").json()["modules"]
    assert [m["stage_name"] for m in mods] == ["Вход в контакт"]


# ---------------------------------------------------------------- the numbers and the verdicts

def test_heatmap_numbers_and_verdicts_come_from_the_rows(tid):
    vid = _active(tid)
    _rows(tid, vid, "cr9", script_win=27, script_lose=3, free_win=3, free_lose=7)  # said 75%: 90% vs 30%
    _rows(tid, vid, "cr5", script_win=7, script_lose=1, free_win=13, free_lose=19)  # said 20%: 88% vs 41%
    _rows(tid, vid, "cr3", script_win=10, script_lose=22, free_win=5, free_lose=3)  # said 80%: 31% vs 63%
    _rows(tid, vid, "cr4", script_win=3, script_lose=7, free_win=21, free_lose=9)  # said 25%: 30% vs 70%
    _rows(tid, vid, "cr2", script_win=10, script_lose=10, free_win=9, free_lose=11)  # 50% vs 45%: noise
    _rows(tid, vid, "cr1", script_win=6, free_lose=6)  # 12 calls only
    _rows(tid, vid, "cr6", script_win=30, script_lose=7, free_win=1, free_lose=2)  # 40 calls, 3 in own words
    heat = {r["criterion"]: r for r in client.get(f"{API}/heatmap?tenant_id={tid}").json()["matrix"]}

    assert heat["cr9"]["verdict_status"] == "WORKING_STANDARD"
    assert (heat["cr9"]["total_relevant_calls"], heat["cr9"]["ar_pct"], heat["cr9"]["swr_pct"], heat["cr9"]["fwr_pct"], heat["cr9"]["script_lift_pct"]) == (40, 75.0, 90.0, 30.0, 60.0)
    assert heat["cr9"]["total_win_pct"] == 75.0 and heat["cr9"]["enough_data"] is True
    assert heat["cr5"]["verdict_status"] == "SABOTAGE_HIDDEN_GEM" and heat["cr5"]["is_sabotage"] is True
    assert heat["cr3"]["verdict_status"] == "HYPOTHESIS_FAILED"
    assert heat["cr4"]["verdict_status"] == "FREESTYLE_STRONGER"
    assert heat["cr2"]["verdict_status"] == "NO_SIGNAL"
    assert heat["cr1"]["verdict_status"] == "COLLECTING_DATA" and heat["cr1"]["calls_needed"] == 18 and heat["cr1"]["enough_data"] is False
    assert heat["cr6"]["verdict_status"] == "COLLECTING_DATA"
    assert heat["cr7"]["total_relevant_calls"] == 0


def test_xray_managers_quotes_and_labels(tid):
    vid = _active(tid)
    _rows(tid, vid, "cr9", script_win=1, script_lose=9, free_lose=0, manager="Игорь")  # 10 calls, always said the standard, passed 10%
    _rows(tid, vid, "cr9", script_lose=0, free_win=6, free_lose=4, manager="Саша")  # never said the standard: 10 calls
    _rows(tid, vid, "cr9", script_win=4, manager="Новичок")  # 4 calls: too few for a label
    _rows(tid, vid, "cr9", free_lose=6, manager="Не определён")  # unknown manager: never labelled
    data = client.get(f"{API}/xray/cr9?tenant_id={tid}").json()
    mgr = {m["name"]: m for m in data["managers"]}

    assert mgr["Саша"]["is_saboteur"] is True and mgr["Саша"]["ar_pct"] == 0.0
    assert mgr["Игорь"]["is_saboteur"] is False and mgr["Игорь"]["ar_pct"] == 100.0 and mgr["Игорь"]["is_champion"] is False  # 10% passed
    assert mgr["Новичок"]["is_saboteur"] is False and mgr["Новичок"]["is_champion"] is False
    assert mgr["Не определён"]["is_saboteur"] is False
    assert data["managers"][0]["name"] == "Саша", "saboteurs come first"
    assert data["stats"]["total_calls"] == 30 and data["golden_quotes"] == [], "a quote needs a real call behind it"


def test_xray_unknown_criterion_is_404(tid):
    assert client.get(f"{API}/xray/cr99?tenant_id={tid}").status_code == 404


# ---------------------------------------------------------------- versions

def test_create_activate_and_clone(tid):
    v1 = _active(tid)
    edit = {"recommended_speech": "Новый текст", "semantic_anchors": ["один | два", "три"], "banned_triggers": ["плохо"], "min_anchors_required": 1}
    assert client.put(f"{API}/modules/cr9?tenant_id={tid}", json=edit).status_code == 200

    v2 = client.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v2.0", "title": "next", "hypothesis": "h", "set_active": True})
    assert v2.status_code == 200 and v2.json()["is_active"] is True
    versions = client.get(f"{API}/versions?tenant_id={tid}").json()["versions"]
    assert {v["version_tag"]: v["is_active"] for v in versions} == {"v1.0": False, "v2.0": True}
    cr9 = next(m for m in client.get(f"{API}/modules?tenant_id={tid}").json()["modules"] if m["target_criterion"] == "cr9")
    assert cr9["recommended_speech"] == "Новый текст" and cr9["semantic_anchors"] == ["один | два", "три"]

    # a version can be started from any version, not only from the active one
    v3 = client.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v3.0", "title": "from v1", "set_active": False, "base_version_id": v1})
    assert v3.status_code == 200 and v3.json()["is_active"] is False
    assert client.put(f"{API}/versions/{v1}/activate?tenant_id={tid}").json()["status"] == "activated"
    assert _active(tid) == v1


def test_duplicate_tag_is_a_conflict_with_a_readable_message(tid):
    _active(tid)
    first = client.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v2.0", "title": "a"})
    again = client.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v2.0", "title": "b"})
    assert first.status_code == 200 and again.status_code == 409 and "v2.0" in again.json()["detail"]


def test_module_edit_is_validated(tid):
    ok = {"recommended_speech": "x", "semantic_anchors": ["один", "два"], "banned_triggers": [], "min_anchors_required": 2}
    assert client.put(f"{API}/modules/cr9?tenant_id={tid}", json=ok).status_code == 200
    too_many = client.put(f"{API}/modules/cr9?tenant_id={tid}", json={**ok, "min_anchors_required": 3})
    empty = client.put(f"{API}/modules/cr9?tenant_id={tid}", json={**ok, "semantic_anchors": [" "], "banned_triggers": []})
    assert too_many.status_code == 422 and "больше" in too_many.json()["detail"]
    assert empty.status_code == 422
    assert client.put(f"{API}/modules/cr11?tenant_id={tid}", json=ok).status_code == 404, "cr11 has no module"


def test_a_version_that_was_applied_to_calls_cannot_be_edited(tid):
    vid = _active(tid)
    _rows(tid, vid, "cr9", script_win=2)
    body = {"recommended_speech": "x", "semantic_anchors": ["один"], "banned_triggers": [], "min_anchors_required": 1}
    res = client.put(f"{API}/modules/cr9?tenant_id={tid}", json=body)
    assert res.status_code == 409 and "новую версию" in res.json()["detail"]
    mods = client.get(f"{API}/modules?tenant_id={tid}").json()
    assert mods["locked"] is True and mods["applied_calls"] == 2

    new = client.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v2.0", "title": "fix", "set_active": True}).json()["version_id"]
    assert client.put(f"{API}/modules/cr9?tenant_id={tid}&version_id={new}", json=body).status_code == 200


# ---------------------------------------------------------------- compare

def test_an_empty_new_version_is_not_an_improvement(tid):
    v1 = _active(tid)
    _rows(tid, v1, "cr9", script_win=3, script_lose=3, free_win=3, free_lose=3)  # 12 calls, 50% fail
    v2 = client.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v2.0", "title": "new", "set_active": False}).json()["version_id"]
    data = client.get(f"{API}/versions/compare?tenant_id={tid}&v1_id={v1}&v2_id={v2}").json()

    assert data["summary"]["overall_status"] == "COLLECTING_DATA"
    assert {r["intervention_verdict"] for r in data["comparison"]} == {"COLLECTING_DATA"}
    assert len(data["comparison"]) == 12 and data["summary"]["compared_criteria_count"] == 0


def test_compare_names_an_improvement_and_a_loss(tid):
    v1 = _active(tid)
    _rows(tid, v1, "cr9", script_win=3, script_lose=3, free_win=3, free_lose=3)  # swr 50, fwr 50
    v2 = client.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v2.0", "title": "new", "set_active": True}).json()["version_id"]
    _rows(tid, v2, "cr9", script_win=9, script_lose=1, free_win=1, free_lose=1)  # swr 90, fwr 50

    up = client.get(f"{API}/versions/compare?tenant_id={tid}&v1_id={v1}&v2_id={v2}").json()
    row = next(r for r in up["comparison"] if r["criterion"] == "cr9")
    assert row["intervention_verdict"] == "IMPROVEMENT_CONFIRMED" and row["delta_lift_pct"] == 40.0
    assert up["summary"]["overall_status"] == "NET_POSITIVE" and up["summary"]["compared_criteria_count"] == 1

    down = client.get(f"{API}/versions/compare?tenant_id={tid}&v1_id={v2}&v2_id={v1}").json()
    assert down["summary"]["overall_status"] in ("NET_NEGATIVE", "NEUTRAL")
    assert next(r for r in down["comparison"] if r["criterion"] == "cr9")["delta_lift_pct"] == -40.0


def test_comparing_a_version_with_itself_says_so(tid):
    v1 = _active(tid)
    data = client.get(f"{API}/versions/compare?tenant_id={tid}&v1_id={v1}&v2_id={v1}").json()
    assert data["summary"]["overall_status"] == "NEUTRAL" and "одна и та же" in data["summary"]["summary_verdict"]


def test_compare_with_a_foreign_version_is_404(tid, other):
    mine, theirs = _active(tid), _active(other)
    assert client.get(f"{API}/versions/compare?tenant_id={tid}&v1_id={theirs}&v2_id={mine}").status_code == 404
