"""
n8n call claims: one audit per call, however many executions overlap.
Found in the 2026-11-03 e2e run: the 5-min poll trigger fires while a 13-call batch (~11 min) is still running and
the dedup cache lived in workflow staticData (read at start, written at end), so executions 8877/8884/8891 audited
the same calls up to 3 times: duplicate CRM notes, duplicate Gemini spend, overwritten scores.
"""

import threading
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import DateTime, bindparam, text
from starlette.testclient import TestClient

from apps.api.main import app
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
from packages.database.models import CallRecording, CallProcessingClaim, Deal, Tenant, Workspace
from packages.database.session import SessionLocal

n8n = TestClient(app, client=("172.19.0.6", 50000))  # direct docker-network call, like n8n
ADMIN = {"x-admin-key": next(iter(ALLOWED_ADMIN_KEYS))}


@pytest.fixture
def tid():
    tenant = f"TNT-CLM{uuid.uuid4().hex[:6].upper()}"
    yield tenant
    db = SessionLocal()
    try:
        db.query(CallProcessingClaim).filter(CallProcessingClaim.tenant_id == tenant).delete()
        db.query(CallRecording).filter(CallRecording.tenant_id == tenant).delete()
        db.query(Deal).filter(Deal.tenant_id == tenant).delete()
        db.query(Workspace).filter(Workspace.tenant_id == tenant).delete()
        db.query(Tenant).filter(Tenant.id == tenant).delete()
        db.commit()
    finally:
        db.close()


def _claim(tenant, call_id):
    res = n8n.post("/api/v1/calls/claim", json={"tenant_id": tenant, "call_id": call_id})
    assert res.status_code == 200, res.text
    return res.json()["claimed"]


def _done(tenant, call_id):
    res = n8n.post("/api/v1/calls/claim/done", json={"tenant_id": tenant, "call_id": call_id})
    assert res.status_code == 200, res.text


def _age(tenant, call_id, minutes):
    """Simulate an execution that claimed the call `minutes` ago and then died."""
    db = SessionLocal()
    try:
        db.execute(
            text("UPDATE call_processing_claims SET claimed_at = :t WHERE tenant_id = :tid AND call_id = :cid")
            .bindparams(bindparam("t", type_=DateTime)),
            {"t": datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=minutes), "tid": tenant, "cid": call_id},
        )
        db.commit()
    finally:
        db.close()


def test_overlapping_execution_does_not_get_the_call(tid):
    assert _claim(tid, "c1") is True
    assert _claim(tid, "c1") is False  # second execution, first one still auditing


def test_done_call_is_never_audited_again(tid):
    assert _claim(tid, "c1") is True
    _done(tid, "c1")
    _age(tid, "c1", 24 * 60)
    assert _claim(tid, "c1") is False


def test_claim_of_crashed_execution_is_taken_over_then_given_up(tid):
    assert _claim(tid, "c1") is True
    _age(tid, "c1", 59)
    assert _claim(tid, "c1") is False  # still within the processing window
    _age(tid, "c1", 61)
    assert _claim(tid, "c1") is True  # attempt 2
    _age(tid, "c1", 61)
    assert _claim(tid, "c1") is True  # attempt 3
    _age(tid, "c1", 61)
    assert _claim(tid, "c1") is False  # every attempt is a paid audit: stop after 3


def test_claims_are_per_tenant(tid):
    other = f"{tid}X"
    try:
        assert _claim(tid, "same-id") is True
        assert _claim(other, "same-id") is True
    finally:
        db = SessionLocal()
        db.query(CallProcessingClaim).filter(CallProcessingClaim.tenant_id == other).delete()
        db.commit()
        db.close()


def test_simultaneous_claims_have_exactly_one_winner(tid):
    results, barrier = [], threading.Barrier(8)

    def worker():
        barrier.wait()
        results.append(_claim(tid, "race"))

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(results) == [False] * 7 + [True]


def test_ingested_call_counts_as_done(tid):
    payload = {"id": "c-ingested", "tenant_id": tid, "deal_id": "D-1", "duration_sec": 95, "score": 9,
               "cr": [1] * 9 + [0] * 4, "transcript": "t", "sync_to_sheets": False}
    assert n8n.post("/api/v1/calls/ingest", json=payload, headers=ADMIN).status_code == 200
    assert _claim(tid, "c-ingested") is False


def test_claim_rejects_public_tunnel_traffic(tid):
    gateway = TestClient(app, client=("172.19.0.1", 50000))
    res = gateway.post("/api/v1/calls/claim", json={"tenant_id": tid, "call_id": "c1"},
                       headers={"cf-connecting-ip": "203.0.113.7"})
    assert res.status_code == 403


@pytest.mark.parametrize("body", [{"tenant_id": " ", "call_id": "c1"}, {"tenant_id": "TNT-1", "call_id": ""},
                                  {"tenant_id": "TNT-1", "call_id": "x" * 151}])
def test_claim_requires_tenant_and_call_id(body):
    assert n8n.post("/api/v1/calls/claim", json=body).status_code == 422


def test_backfill_reads_call_id_from_n8n_audit_note_footer():
    from scripts.backfill_call_claims import AUDIT_FOOTER

    note = "🤖 ИИ-Аудит звонка\n💡 Совет менеджеру: x\n──────────\nid: call_tnt-005_5272089_1793685732_d3e0"
    assert AUDIT_FOOTER.search(note).group(1) == "call_tnt-005_5272089_1793685732_d3e0"
    assert AUDIT_FOOTER.search("Обычная заметка менеджера, id: 123") is None


def test_backfill_dry_run_reads_registry_and_amo_without_writing(monkeypatch, capsys, tid):
    from scripts import backfill_call_claims as bf

    monkeypatch.setattr(bf, "load_tenants_registry", lambda: {"tenants": [
        {"tenant_id": tid, "crm_type": "amocrm", "amo_domain": "https://x.amocrm.ru", "amo_token": "t"},
        {"tenant_id": "TNT-B24", "crm_type": "bitrix24"},
    ]})
    footer = "──────────\nid: "

    def fake_amo(domain, token, path, params):
        if path == "/api/v4/events":
            return {"_embedded": {"events": [{"entity_type": "lead", "entity_id": 7}]}}
        return {"_embedded": {"notes": [{"params": {"text": "Аудит" + footer + "c-old"}}, {"params": {"text": "звонок"}}]}}

    monkeypatch.setattr(bf, "amo_get", fake_amo)
    monkeypatch.setattr("sys.argv", ["backfill"])
    bf.main()
    out = capsys.readouterr().out
    assert f"{tid}: 1 call events, 1 calls already have an audit note" in out
    assert "dry run" in out
    assert _claim(tid, "c-old") is True  # dry run wrote nothing
