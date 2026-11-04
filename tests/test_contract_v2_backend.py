# -*- coding: utf-8 -*-
"""
Audit contract v2, server side (docs/audit/spec_contract_v2.md): a criterion that did not apply (None) is kept, the
reasons and quotes of the AI are stored, the recording link stays on the server and is played through
GET /calls/{id}/audio with the SSRF rules of services/call_audio.py.
"""

import asyncio
import functools
import uuid
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
from apps.api.services import call_audio
from apps.api.services.call_audit_extras import TEXT_MAX, audit_extras, clean_audio_url, clean_evidence
from apps.api.services.call_scorecard import read_scorecard
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import CallRecording, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}
ADMIN_KEY = next(iter(ALLOWED_ADMIN_KEYS)) if ALLOWED_ADMIN_KEYS else "secret"
internal = TestClient(app, client=("172.16.0.5", 50000))
RECORDING = "https://records.example-telephony.ru/rec/42.mp3?sig=SECRET-SIGNATURE"


@pytest.fixture
def tid():
    t = f"TNT-V2-{uuid.uuid4().hex[:6].upper()}"
    yield t
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _token(tenant):
    return create_access_token({"sub": "u", "tenant_id": tenant, "role": UserRole.CEO.value, "email": "u@x.test"})


def _ingest(tenant, call_id, **extra):
    cr = [1, 1, 0, 1, None, 0, 1, 1, 1, 0, 1, 1, None]
    body = {
        "id": call_id, "tenant_id": tenant, "duration_sec": 200, "manager": "Анна", "client": "ООО Ромашка",
        "transcript": "Менеджер: Здравствуйте\nКлиент: Добрый день", "sync_to_sheets": False,
        "cr": cr, "score": 9, **extra,
    }
    res = internal.post("/api/v1/calls/ingest", json=body, headers={"x-admin-key": ADMIN_KEY})
    assert res.status_code == 200, res.text[:300]
    return res.json()["call"]


def _stored(tenant, call_id):
    db = SessionLocal()
    try:
        return db.query(CallRecording).filter(CallRecording.tenant_id == tenant, CallRecording.external_call_id == call_id).one()
    finally:
        db.close()


# --- the contract fields ---------------------------------------------------------------------------------------

def test_a_criterion_that_did_not_apply_is_not_a_failure():
    card = read_scorecard({"cr": [1, 0, 1, 1, None, 0, 1, 1, 1, 0, 1, 1, None], "score": 8}, 8.0)
    assert card["cr"][4] is None and card["cr"][12] is None
    assert (card["passed"], card["applicable"]) == (8, 11)

    full = read_scorecard({"cr": [1] * 13, "score": 13}, 13.0)
    assert (full["passed"], full["applicable"]) == (13, 13)


def test_unanswered_and_failed_calls_have_no_basis():
    card = read_scorecard({"cr": [0] * 13, "score": 0, "is_unanswered": 1}, 0.0)
    assert (card["passed"], card["applicable"]) == (None, None)


def test_ingest_keeps_none_in_cr_and_returns_the_basis(tid):
    call = _ingest(tid, "C-V2-1")
    assert call["cr"][4] is None and call["cr"][12] is None
    assert (call["passed"], call["applicable"]) == (8, 11)
    assert call["score"] == 9


def test_evidence_and_the_other_fields_are_stored_and_cut_to_size(tid):
    call = _ingest(
        tid, "C-V2-2", call_type="qualification", summary="Клиент просит КП", ended_by="client",
        reached_decision_maker=True, audit_model="gemini-3.6-flash", audit_version=2,
        evidence={"cr1": {"why": "Назвал дату", "quote": "в четверг в 15:00"},
                  "cr99": {"why": "unknown criterion", "quote": "x"},
                  "cr2": {"why": "w" * 5000, "quote": ""},
                  "cr3": "not a dict"},
    )
    assert call["evidence"]["cr1"] == {"why": "Назвал дату", "quote": "в четверг в 15:00"}
    assert set(call["evidence"]) == {"cr1", "cr2"}
    assert len(call["evidence"]["cr2"]["why"]) == TEXT_MAX
    assert (call["call_type"], call["audit_version"], call["reached_decision_maker"]) == ("qualification", 2, True)


def test_the_recording_link_never_reaches_the_browser(tid):
    call = _ingest(tid, "C-V2-3", audio_url=RECORDING)
    assert call["has_audio"] is True
    assert "audio_url" not in call and "SECRET-SIGNATURE" not in str(call)

    res = TestClient(app).get(f"/api/v1/calls/data?tenant_id={tid}", headers={**EXTERNAL, "Authorization": f"Bearer {_token(tid)}"})
    assert res.status_code == 200, res.text[:300]
    got = next(c for c in res.json()["calls"] if c["has_audio"])
    assert "SECRET-SIGNATURE" not in str(got)
    assert (got["passed"], got["applicable"]) == (8, 11)
    assert got["cr"][4] is None

    row = _stored(tid, "C-V2-3")
    assert row.scorecard_criteria["audio_url"] == RECORDING and row.audio_s3_url == RECORDING


def test_the_deal_card_does_not_carry_the_link_either(tid):
    _ingest(tid, "C-V2-5", audio_url=RECORDING, deal_id="D-V2-5")
    res = TestClient(app).get("/api/v1/deals/D-V2-5", headers={**EXTERNAL, "Authorization": f"Bearer {_token(tid)}"})
    assert res.status_code == 200, res.text[:300]
    calls = res.json()["deal"]["calls"]
    assert calls and calls[0]["has_audio"] is True
    assert "audio_s3_url" not in calls[0] and "SECRET-SIGNATURE" not in res.text


def test_a_reaudit_without_a_link_keeps_the_recording(tid):
    _ingest(tid, "C-V2-4", audio_url=RECORDING)
    call = _ingest(tid, "C-V2-4")
    assert call["has_audio"] is True
    assert _stored(tid, "C-V2-4").scorecard_criteria["audio_url"] == RECORDING


def test_helpers_reject_junk():
    assert clean_audio_url("javascript:alert(1)") is None
    assert clean_audio_url("https://x.ru/a.mp3") == "https://x.ru/a.mp3"
    assert clean_audio_url("/api/v1/calls/audio/a.mp3") == "/api/v1/calls/audio/a.mp3"
    assert clean_audio_url("https://x.ru/" + "a" * 2500) is None
    assert clean_evidence("junk") is None and clean_evidence({"cr1": {"why": "", "quote": ""}}) is None
    assert audit_extras(SimpleNamespace(reached_decision_maker="yes", audit_version=True)) == {}


# --- GET /calls/{id}/audio --------------------------------------------------------------------------------------

def _make_call(tenant, **fields):
    db = SessionLocal()
    try:
        get_or_create_workspace(db, tenant, "bitrix24")
        cid = str(uuid.uuid4())
        db.add(CallRecording(id=cid, tenant_id=tenant, client_phone="+7", duration_seconds=60, overall_score=5.0, **fields))
        db.commit()
        return cid
    finally:
        db.close()


def _get_audio(cid, tenant, headers=None):
    return TestClient(app).get(f"/api/v1/calls/{cid}/audio", headers={**EXTERNAL, "Authorization": f"Bearer {_token(tenant)}", **(headers or {})})


def test_audio_needs_a_login(tid):
    cid = _make_call(tid, scorecard_criteria={"audio_url": RECORDING})
    assert TestClient(app).get(f"/api/v1/calls/{cid}/audio", headers=EXTERNAL).status_code in (401, 403)


def test_audio_of_another_client_is_not_found(tid):
    cid = _make_call(tid, scorecard_criteria={"audio_url": RECORDING})
    other = f"TNT-V2-{uuid.uuid4().hex[:6].upper()}"
    assert _get_audio(cid, other).status_code == 404


def test_a_call_without_a_recording_is_not_found(tid):
    cid = _make_call(tid, scorecard_criteria={"cr": [1] * 13})
    assert _get_audio(cid, tid).status_code == 404


def test_audio_from_our_own_storage_is_served_from_disk(tid, tmp_path, monkeypatch):
    (tmp_path / "tnt_abc123.mp3").write_bytes(b"ID3-fake-mp3-bytes")
    monkeypatch.setattr(calls_router, "AUDIO_STORAGE_DIR", tmp_path)
    cid = _make_call(tid, audio_s3_url="https://report.ai-rop.ru/api/v1/calls/audio/tnt_abc123.mp3")
    res = _get_audio(cid, tid)
    assert res.status_code == 200 and res.content == b"ID3-fake-mp3-bytes"
    assert res.headers["content-type"].startswith("audio/mpeg")


def test_audio_path_cannot_leave_the_storage_folder(tmp_path):
    (tmp_path / "ok.mp3").write_bytes(b"x")
    assert call_audio.local_file("/api/v1/calls/audio/../../etc/passwd", tmp_path) is None
    assert call_audio.local_file("/api/v1/calls/audio/ok.mp3", tmp_path) == tmp_path / "ok.mp3"
    assert call_audio.local_file("/somewhere/else/ok.mp3", tmp_path) is None


# --- the SSRF rules ---------------------------------------------------------------------------------------------

@pytest.mark.parametrize("url", [
    "http://8.8.8.8/a.mp3",                       # not https
    "https://127.0.0.1/a.mp3",                    # loopback
    "https://10.0.0.5/a.mp3",                     # private
    "https://169.254.169.254/latest/meta-data",   # cloud metadata
    "https://[::1]/a.mp3",                        # loopback v6
    "https://[::ffff:127.0.0.1]/a.mp3",           # v4 hidden in v6
    "https://8.8.8.8:8443/a.mp3",                 # not the https port
    "https://user:pass@8.8.8.8/a.mp3",            # credentials in the link
    "file:///etc/passwd",
])
def test_non_public_or_non_https_links_are_refused(url):
    with pytest.raises(call_audio.AudioUnavailable):
        asyncio.run(call_audio.assert_public_https(url))


def test_a_public_https_link_passes_the_check():
    asyncio.run(call_audio.assert_public_https("https://8.8.8.8/a.mp3"))


def _serve(monkeypatch, handler):
    monkeypatch.setattr(call_audio.httpx, "AsyncClient", functools.partial(httpx.AsyncClient, transport=httpx.MockTransport(handler)))


def _fetch(url, **kw):
    async def run():
        resp, client = await call_audio.open_remote(url, **kw)
        body = b"".join([chunk async for chunk in call_audio.stream_body(resp, client)])
        return resp, body
    return asyncio.run(run())


def test_a_redirect_to_a_private_address_is_refused(monkeypatch):
    _serve(monkeypatch, lambda req: httpx.Response(302, headers={"location": "https://127.0.0.1/secret"}))
    with pytest.raises(call_audio.AudioUnavailable):
        _fetch("https://8.8.8.8/a.mp3")


def test_a_redirect_loop_ends(monkeypatch):
    _serve(monkeypatch, lambda req: httpx.Response(302, headers={"location": "https://8.8.4.4/again"}))
    with pytest.raises(call_audio.AudioUnavailable):
        _fetch("https://8.8.8.8/a.mp3")


def test_a_login_page_is_not_a_recording(monkeypatch):
    _serve(monkeypatch, lambda req: httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, content=b"<html>login</html>"))
    with pytest.raises(call_audio.AudioUnavailable):
        _fetch("https://8.8.8.8/a.mp3")


def test_a_closed_link_is_unavailable(monkeypatch):
    _serve(monkeypatch, lambda req: httpx.Response(403))
    with pytest.raises(call_audio.AudioUnavailable):
        _fetch("https://8.8.8.8/a.mp3")


def test_a_recording_is_streamed_without_crm_tokens_and_with_range(monkeypatch):
    seen = {}

    def handler(req: httpx.Request):
        seen.update(req.headers)
        return httpx.Response(206, headers={"content-type": "audio/mpeg", "content-range": "bytes 0-3/10", "accept-ranges": "bytes"}, content=b"abcd")

    _serve(monkeypatch, handler)
    resp, body = _fetch("https://8.8.8.8/a.mp3", range_header="bytes=0-3")
    assert body == b"abcd" and resp.status_code == 206
    assert seen["range"] == "bytes=0-3" and "authorization" not in seen and "cookie" not in seen
    assert call_audio.response_headers(resp)["content-range"] == "bytes 0-3/10"
    assert call_audio.media_type(resp) == "audio/mpeg"


def test_the_size_cap_stops_a_huge_file(monkeypatch):
    _serve(monkeypatch, lambda req: httpx.Response(200, headers={"content-type": "audio/mpeg", "content-length": str(call_audio.MAX_BYTES + 1)}, content=b"x"))
    with pytest.raises(call_audio.AudioUnavailable):
        _fetch("https://8.8.8.8/a.mp3")
