"""
The path of a real call into the Methodology: /calls/ingest -> evaluation rows -> heatmap / X-Ray.
The rows carry the manager's own words and the second they were said; a call that cannot be judged writes nothing.
"""

import uuid

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
from apps.api.services import methodology_eval
from packages.database.models import CallModuleEvaluation, CallRecording, Deal, ScriptModule, ScriptVersion, Tenant, Workspace
from packages.database.session import SessionLocal

API = "/api/v1/methodology"
ingest_client = TestClient(app, client=("172.16.0.5", 50000))  # internal network, like n8n
INGEST_KEY = {"x-admin-key": next(iter(ALLOWED_ADMIN_KEYS))}
ADMIN = {"Authorization": "Bearer " + create_access_token({"sub": "admin", "tenant_id": "TNT-001", "role": "admin"})}
admin = TestClient(app, headers=ADMIN)

TRANSCRIPT = """[00:03] Менеджер: Добрый день! Меня зовут Иван, компания Ромашка.
[00:09] Клиент: Здравствуйте.
[00:12] Менеджер: Звоню по поводу автоматизации отдела продаж, вам удобно сейчас?
[00:20] Клиент: Да, слушаю.
[00:25] Менеджер: Подскажите, кто кроме вас участвует в решении по такому вопросу?
[00:31] Клиент: Директор и финансист.
"""
CR = [0, 1, 1, 1, None, None, 1, 0, 1, 1, 1, 1, None]  # cr1..cr13; None only at CR5, CR6, CR13
TEAM = {"tenant_id": "x", "crm_type": "amocrm", "managers": [{"id": "7", "name": "Надежда"}]}


def _payload(tenant, call_id, **over):
    base = {
        "id": call_id, "tenant_id": tenant, "deal_id": f"D-{call_id}", "duration_sec": 95, "score": 9, "cr": CR,
        "manager": "Надежда", "manager_crm_id": "7", "transcript": TRANSCRIPT, "sync_to_sheets": False,
    }
    base.update(over)
    return base


def _cleanup(tid):
    db = SessionLocal()
    try:
        db.query(CallModuleEvaluation).filter(CallModuleEvaluation.tenant_id == tid).delete()
        for v in db.query(ScriptVersion).filter(ScriptVersion.tenant_id == tid).all():
            db.query(ScriptModule).filter(ScriptModule.script_version_id == v.id).delete()
            db.delete(v)
        db.query(CallRecording).filter(CallRecording.tenant_id == tid).delete()
        db.query(Deal).filter(Deal.tenant_id == tid).delete()
        db.query(Workspace).filter(Workspace.tenant_id == tid).delete()
        db.query(Tenant).filter(Tenant.id == tid).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture
def tid(monkeypatch):
    tenant = f"TNT-LIVE-{uuid.uuid4().hex[:6].upper()}"
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda t: {**TEAM, "tenant_id": t})
    monkeypatch.setattr(methodology_eval, "get_tenant_config", lambda t: {**TEAM, "tenant_id": t})
    _cleanup(tenant)
    yield tenant
    _cleanup(tenant)


def _ingest(tenant, call_id, **over):
    res = ingest_client.post("/api/v1/calls/ingest", json=_payload(tenant, call_id, **over), headers=INGEST_KEY)
    assert res.status_code == 200, res.text[:300]
    return res


def _rows(tenant, call_id=None):
    db = SessionLocal()
    try:
        q = db.query(CallModuleEvaluation).filter(CallModuleEvaluation.tenant_id == tenant)
        if call_id:
            call = db.query(CallRecording).filter(CallRecording.tenant_id == tenant, CallRecording.external_call_id == call_id).first()
            q = q.filter(CallModuleEvaluation.call_id == (call.id if call else "-"))
        return {r.target_criterion: r for r in q.all()}
    finally:
        db.close()


def test_a_real_call_is_judged_by_what_the_manager_said(tid):
    _ingest(tid, f"{tid}-1")
    rows = _rows(tid)
    # cr5, cr6, cr13 did not apply to this call (null), cr11 is measured by the code, not said: nine criteria are judged
    assert set(rows) == {"cr1", "cr2", "cr3", "cr4", "cr7", "cr8", "cr9", "cr10", "cr12"}

    greeting = rows["cr9"]
    assert greeting.adhered is True and greeting.achieved is True
    assert greeting.evidence_quote == "Добрый день! Меня зовут Иван, компания Ромашка."
    assert greeting.timestamp_sec == 3
    assert greeting.manager_name == "Надежда" and greeting.manager_id == "7"
    assert len(greeting.matched_anchors) >= 2

    lpr = rows["cr3"]  # "кто кроме вас участвует в решении": a real qualification question
    assert lpr.adhered is True and lpr.evidence_quote.startswith("Подскажите, кто кроме вас") and lpr.timestamp_sec == 25
    assert rows["cr1"].adhered is False and rows["cr1"].achieved is False, "no next step was said, the audit failed it"
    assert rows["cr1"].evidence_quote is None, "nothing is quoted when nothing was said"
    assert rows["cr12"].adhered is False, "no summary at the end"


def test_the_judged_rows_feed_the_heatmap_and_the_xray_with_a_real_quote(tid):
    _ingest(tid, f"{tid}-1")
    heat = admin.get(f"{API}/heatmap?tenant_id={tid}").json()
    assert heat["coverage"] == {"calls_with_transcript": 1, "calls_evaluated": 1}
    cr9 = next(r for r in heat["matrix"] if r["criterion"] == "cr9")
    assert (cr9["total_relevant_calls"], cr9["script_calls"], cr9["ar_pct"]) == (1, 1, 100.0)
    assert cr9["verdict_status"] == "COLLECTING_DATA", "one call is not a verdict"

    xray = admin.get(f"{API}/xray/cr9?tenant_id={tid}").json()
    quote = xray["golden_quotes"][0]
    assert quote["quote"] == "Добрый день! Меня зовут Иван, компания Ромашка."
    assert quote["manager_name"] == "Надежда" and quote["timestamp_sec"] == 3 and quote["has_audio"] is False
    db = SessionLocal()
    try:
        assert db.query(CallRecording).filter(CallRecording.id == quote["call_id"], CallRecording.tenant_id == tid).count() == 1
    finally:
        db.close()


def test_a_second_ingest_of_the_same_call_replaces_the_rows(tid):
    _ingest(tid, f"{tid}-1")
    first = _rows(tid)
    cr_fixed = [1] + CR[1:]
    _ingest(tid, f"{tid}-1", cr=cr_fixed)
    again = _rows(tid)
    assert set(again) == set(first) and len(again) == 9, "no duplicates"
    assert again["cr1"].achieved is True and first["cr1"].achieved is False


def test_a_call_keeps_the_version_that_first_judged_it(tid):
    _ingest(tid, f"{tid}-1")
    old_version = next(iter(_rows(tid).values())).script_version_id
    new = admin.post(f"{API}/versions?tenant_id={tid}", json={"version_tag": "v2.0", "title": "next", "set_active": True}).json()["version_id"]

    _ingest(tid, f"{tid}-1")  # a re-audit of the old call
    _ingest(tid, f"{tid}-2")  # a new call
    assert {r.script_version_id for r in _rows(tid, f"{tid}-1").values()} == {old_version}
    assert {r.script_version_id for r in _rows(tid, f"{tid}-2").values()} == {new}


@pytest.mark.parametrize("over", [
    {"audit_failed": 1},
    {"is_unanswered": 1},
    {"transcript": ""},
    {"transcript": "Спасибо за звонок, до свидания, всего доброго, хорошего вам дня и отличного настроения"},  # not labelled
    {"transcript": "Анна: Добрый день, меня зовут Анна.\nБорис: Здравствуйте, слушаю вас внимательно, говорите."},  # no manager
])
def test_a_call_that_cannot_be_judged_writes_nothing(tid, over):
    _ingest(tid, f"{tid}-x", **over)
    assert _rows(tid) == {}


def test_the_manager_is_found_by_his_first_name_when_the_turns_carry_names(tid):
    text = "Надежда: Добрый день! Меня зовут Надежда, компания Ромашка.\nКлиент: Здравствуйте, слушаю вас внимательно."
    _ingest(tid, f"{tid}-n", transcript=text)
    assert _rows(tid)["cr9"].adhered is True


def test_a_failure_of_the_evaluation_never_fails_the_call(tid, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("evaluation is broken")

    monkeypatch.setattr(methodology_eval, "evaluate_call", boom)
    res = _ingest(tid, f"{tid}-1")
    assert res.json()["status"] == "ok"
    db = SessionLocal()
    try:
        assert db.query(CallRecording).filter(CallRecording.tenant_id == tid).count() == 1
    finally:
        db.close()
    assert _rows(tid) == {}


def test_backfill_judges_the_history_and_reports_what_it_cannot(tid, monkeypatch):
    monkeypatch.setattr(calls_router, "evaluate_call_safely", lambda *a, **k: "off")  # calls that arrived before the methodology
    _ingest(tid, f"{tid}-1")
    _ingest(tid, f"{tid}-2", id=f"{tid}-2", transcript="Просто текст без разметки, который невозможно разобрать на реплики, но достаточно длинный")
    _ingest(tid, f"{tid}-3", audit_failed=1)
    assert _rows(tid) == {}

    first = admin.post(f"{API}/backfill?tenant_id={tid}").json()
    assert first["evaluated"] == 1
    assert first["skipped"] == {"no_labels": 1, "not_assessed": 1}
    assert first["coverage"]["calls_evaluated"] == 1 and first["coverage"]["calls_with_transcript"] == 3
    assert len(_rows(tid)) == 9

    second = admin.post(f"{API}/backfill?tenant_id={tid}").json()
    assert second["evaluated"] == 0 and len(_rows(tid)) == 9, "repeating it changes nothing"


def test_calls_of_one_company_never_count_for_another(tid, monkeypatch):
    _ingest(tid, f"{tid}-1")
    other = f"{tid}-B"[:30]
    try:
        heat = admin.get(f"{API}/heatmap?tenant_id={other}").json()
        assert heat["coverage"] == {"calls_with_transcript": 0, "calls_evaluated": 0}
        assert all(r["total_relevant_calls"] == 0 for r in heat["matrix"])
    finally:
        _cleanup(other)
