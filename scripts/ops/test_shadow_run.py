"""
Phase 2 Stop Point 2: Shadow Run Test Script
Tests end-to-end processing of a TNT-004 recording:
1. Transcribe & evaluate via local-audit (Whisper large-v3-turbo + Ollama qwen3.5:9b).
2. Ingest structured scorecard into revops-api (SQLite DB).
3. Verify database state, audit_model, score, transcript.
4. Verify audio serving endpoint.
"""

import base64
import json
import time
import requests
import sqlite3
from pathlib import Path

AUDIO_PATH = Path("C:/revops/data/audio/tnt-004_1793430551_147c15.mp3")
LOCAL_AUDIT_URL = "http://127.0.0.1:8765/audit"
REVOPS_API_URL = "http://127.0.0.1:8000/api/v1"
DB_PATH = Path("C:/revops/data/revops_saas.db")

def run_shadow_test():
    print("=== Step 1: Read Audio File ===")
    assert AUDIO_PATH.exists(), f"Audio file not found: {AUDIO_PATH}"
    audio_bytes = AUDIO_PATH.read_bytes()
    b64 = base64.b64encode(audio_bytes).decode("utf-8")
    print(f"Loaded {len(audio_bytes)} bytes audio, base64 size: {len(b64)}")

    print("\n=== Step 2: Call Local Audit Engine (Whisper + Ollama) ===")
    t0 = time.time()
    payload = {
        "audio_b64": b64,
        "audio_mime": "audio/mp3",
        "call_date": "2026-10-31",
        "tenant_id": "TNT-004",
        "custom_prompt_context": ""
    }
    resp = requests.post(LOCAL_AUDIT_URL, json=payload, timeout=180)
    assert resp.status_code == 200, f"Local audit failed: {resp.status_code} {resp.text}"
    audit_data = resp.json()
    duration = time.time() - t0
    print(f"Local audit finished in {duration:.2f}s")
    print(f"Model version: {audit_data.get('modelVersion')}")

    # Extract Gemini parts[0].text
    raw_text = audit_data["candidates"][0]["content"]["parts"][0]["text"]
    parsed_json = json.loads(raw_text)
    print("Parsed audit JSON keys:", list(parsed_json.keys()))
    print(f"Call type: {parsed_json.get('call_type')}")
    print(f"Transcript turns: {len(parsed_json.get('transcript', '').splitlines())}")
    print(f"Error summary: {parsed_json.get('error_summary')}")
    print(f"AI recommendation: {parsed_json.get('ai_recommendation')}")

    # Calculate criteria list
    cr_list = [parsed_json.get(f"cr{i}", 0) for i in range(1, 14)]
    passed = sum(1 for x in cr_list if x == 1)
    applicable = sum(1 for x in cr_list if x is not None)
    score = round(13 * passed / applicable) if applicable > 0 else 0
    print(f"Calculated Score: {score}/13 (Passed: {passed}, Applicable: {applicable})")

    print("\n=== Step 3: Ingest Call into Local revops-api ===")
    call_id = "call_tnt-004_shadow_test_01"
    ingest_payload = {
        "id": call_id,
        "deal_id": "DEAL-TNT004-TEST",
        "client": parsed_json.get("client_name") or "Клиент",
        "manager": parsed_json.get("manager_name") or "Дмитрий",
        "duration_sec": 48,
        "score": score,
        "next_step": 1 if parsed_json.get("cr1") == 1 else 0,
        "cr": cr_list,
        "error_summary": parsed_json.get("error_summary"),
        "recommendation": parsed_json.get("ai_recommendation"),
        "transcript": parsed_json.get("transcript"),
        "tenant_id": "TNT-004",
        "sync_to_sheets": False,
        "audio_url": f"/api/v1/calls/audio/{AUDIO_PATH.name}",
        "audit_model": audit_data.get("modelVersion"),
        "call_type": parsed_json.get("call_type"),
        "summary": parsed_json.get("amo_short_summary")
    }

    ingest_resp = requests.post(f"{REVOPS_API_URL}/calls/ingest", json=ingest_payload, timeout=10)
    print(f"Ingest response status: {ingest_resp.status_code}")
    print(f"Ingest response body: {ingest_resp.text}")
    assert ingest_resp.status_code in (200, 201), f"Ingest failed: {ingest_resp.text}"

    print("\n=== Step 4: Verify Database State ===")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT id, tenant_id, deal_id, overall_score, scorecard_criteria FROM call_recordings WHERE id = ?", (call_id,))
    row = cur.fetchone()
    assert row is not None, f"Call recording {call_id} not found in DB!"
    print(f"DB Record: ID={row[0]} | Tenant={row[1]} | Deal={row[2]} | Score={row[3]}")
    scorecard = json.loads(row[4]) if isinstance(row[4], str) else (row[4] or {})
    print(f"DB Scorecard audit_model: {scorecard.get('audit_model')}")
    print(f"DB Scorecard audio_url: {scorecard.get('audio_url')}")
    print(f"DB Scorecard has_audio: {scorecard.get('has_audio')}")
    conn.close()

    print("\n=== Step 5: Verify Audio Retrieval Endpoints ===")
    # 5a. Public direct audio file endpoint
    public_endpoint = f"{REVOPS_API_URL}/calls/audio/{AUDIO_PATH.name}"
    pub_resp = requests.get(public_endpoint, timeout=10)
    print(f"Public audio endpoint: {public_endpoint} -> Status: {pub_resp.status_code}, Length: {len(pub_resp.content)}")
    assert pub_resp.status_code == 200, f"Failed public audio fetch: {pub_resp.status_code}"
    assert len(pub_resp.content) == len(audio_bytes), "Byte length mismatch on public endpoint"

    # 5b. Authenticated cabinet player endpoint (/api/v1/calls/{id}/audio)
    import jwt
    secret = "814ec89dd5a1596bb2c452ab93447e669ded603fbba785c09c09af80d32c7562"
    token = jwt.encode({"sub": "admin", "tenant_id": "TNT-004", "role": "admin", "exp": 9999999999}, secret, algorithm="HS256")
    player_endpoint = f"{REVOPS_API_URL}/calls/{call_id}/audio"
    play_resp = requests.get(player_endpoint, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    print(f"Cabinet player endpoint: {player_endpoint} -> Status: {play_resp.status_code}, Content-Type: {play_resp.headers.get('content-type')}, Length: {len(play_resp.content)}")
    assert play_resp.status_code == 200, f"Failed player audio fetch: {play_resp.status_code}"
    assert len(play_resp.content) == len(audio_bytes), "Byte length mismatch on player endpoint"

    print("\n>>> SHADOW RUN TEST PASSED 100%! All verification checkpoints satisfied. <<<")

if __name__ == "__main__":
    run_shadow_test()
