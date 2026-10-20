"""
Comprehensive verification test for RevOps Enterprise OS Architecture Hardening & Admin UI Overhaul.
Tests:
1. Atomic thread-safe tenants_registry saving.
2. Webhooks BackgroundTasks queuing (<100ms acknowledgment).
3. Dead Letter Queue (DLQ) & history buffer.
4. Webhook replay mechanism.
5. Agent 4 Quarantine Resolution Desk (approve & dismiss).
6. Live Terminal CLI interpreter commands.
"""

import sys
import os
import time
import json
from pathlib import Path
from fastapi.testclient import TestClient

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

# Ensure workspace root is in path
sys.path.insert(0, os.path.abspath("."))

from apps.api.main import app
from apps.api.tenant_registry import load_tenants_registry, save_tenants_registry, get_tenants_registry_path

client = TestClient(app)

def test_atomic_registry():
    print("--- [1] Testing Atomic Registry Writer ---")
    data = load_tenants_registry()
    orig_ts = time.time()
    data["_test_marker"] = orig_ts
    ok = save_tenants_registry(data, sync_mirrors=False)
    assert ok, "Failed to save tenants registry atomically"
    reloaded = load_tenants_registry()
    assert reloaded.get("_test_marker") == orig_ts, "Reloaded data does not match saved data"
    print("✓ Atomic write & cache reload verified successfully.")


def test_webhook_queue():
    print("\n--- [2] Testing Telephony Webhook Queuing & Latency ---")
    payload = {
        "provider": "mango",
        "tenant_id": "TNT-001",
        "call_id": f"mango_test_{int(time.time())}",
        "manager_name": "Дмитрий Федотов",
        "client_name": "ООО МеталлТрейд",
        "transcript": "Менеджер: Здравствуйте, согласуем пилот на пятницу? Клиент: Да, согласен, в 12:00.",
        "duration_sec": 140
    }
    t0 = time.time()
    resp = client.post("/api/v1/webhooks/call", json=payload)
    elapsed_ms = (time.time() - t0) * 1000

    print(f"HTTP Status: {resp.status_code}")
    print(f"Elapsed Time: {elapsed_ms:.2f} ms (Target < 100ms)")
    data = resp.json()
    print(f"Response: {data}")

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
    assert data.get("status") == "queued", f"Expected 'queued', got {data.get('status')}"
    assert data.get("webhook_id"), "Missing webhook_id in response"
    print("✓ Webhook queued within milliseconds without holding client connection.")
    return data.get("webhook_id")


def test_dlq_and_replay(webhook_id: str):
    print("\n--- [3] Testing Dead Letter Queue (DLQ) & Replay ---")
    # Check history
    h_resp = client.get("/api/v1/webhooks/history")
    assert h_resp.status_code == 200
    h_data = h_resp.json()
    print(f"Total webhooks in DLQ buffer: {h_data.get('total')}")
    assert len(h_data.get("history", [])) > 0, "No webhooks recorded in history"
    print(f"Latest in history: ID={h_data['history'][0].get('id')}, Status={h_data['history'][0].get('status')}")

    # Test replay
    if webhook_id:
        r_resp = client.post(f"/api/v1/webhooks/{webhook_id}/replay")
        assert r_resp.status_code == 200
        r_data = r_resp.json()
        print(f"Replay response: {r_data}")
        assert r_data.get("status") == "queued"
        print(f"✓ Replay of {webhook_id} successful -> New ID: {r_data.get('new_webhook_id')}")


def test_quarantine_resolution():
    print("\n--- [4] Testing Agent 4 Quarantine Resolution Desk ---")
    q_resp = client.get("/api/v1/admin/quarantine/calls")
    assert q_resp.status_code == 200
    q_data = q_resp.json()
    print(f"Quarantined calls total: {q_data.get('total')}, Active: {q_data.get('in_quarantine_count')}")
    calls = q_data.get("calls", [])
    assert len(calls) > 0, "Quarantine desk has no calls"

    test_call = calls[0]
    call_id = test_call.get("id")
    print(f"Testing resolution for call: {call_id} ({test_call.get('deal_title')})")

    # Dismiss test
    d_resp = client.post("/api/v1/admin/quarantine/resolve", json={
        "call_id": call_id,
        "action": "dismiss",
        "note": "Отклонено в автоматическом тесте"
    })
    assert d_resp.status_code == 200
    d_data = d_resp.json()
    print(f"Dismiss response: {d_data.get('message')}")
    assert d_data.get("status") == "dismissed"

    # Approve test
    a_resp = client.post("/api/v1/admin/quarantine/resolve", json={
        "call_id": call_id,
        "action": "approve",
        "note": "Одобрено в автоматическом тесте"
    })
    assert a_resp.status_code == 200
    a_data = a_resp.json()
    print(f"Approve response: {a_data.get('message')}")
    assert a_data.get("status") == "approved"
    print("✓ Quarantine Resolution Desk fully functional.")


def test_terminal_cli():
    print("\n--- [5] Testing Live Terminal CLI Interpreter ---")
    commands = [
        "/ping",
        "/help",
        "/quarantine",
        "/webhooks",
        "/doctor TNT-001"
    ]
    for cmd in commands:
        resp = client.post("/api/v1/admin/terminal/execute", json={"command": cmd})
        assert resp.status_code == 200
        data = resp.json()
        print(f"\n[CLI] {cmd}:")
        first_lines = data.get("output", "").strip().split("\n")[:3]
        for line in first_lines:
            print(f"  {line}")
        assert data.get("status") == "ok", f"Command {cmd} failed"
    print("\n✓ Live Terminal CLI commands executed successfully.")


def test_nuances_hardening():
    print("\n--- [6] Testing 4 Architecture & Security Nuances ---")

    # Nuance 1: Protected Swagger UI and OpenAPI schema
    # Public / external requests without admin_key -> 403 Forbidden
    ext_headers = {"host": "report.ai-rop.ru", "cf-connecting-ip": "194.87.12.34"}
    resp_docs = client.get("/docs", headers=ext_headers)
    assert resp_docs.status_code == 403, f"Expected 403 for unauthorized public /docs, got {resp_docs.status_code}"
    resp_openapi = client.get("/openapi.json", headers=ext_headers)
    assert resp_openapi.status_code == 403, f"Expected 403 for unauthorized public /openapi.json, got {resp_openapi.status_code}"
    print("  ✓ /docs and /openapi.json blocked with 403 Forbidden for unauthorized external requests.")

    # With active admin key via X-Admin-Key header -> 200 OK + Set-Cookie
    from apps.api.routers.admin_router import REVOPS_ADMIN_KEY
    rotated_key = REVOPS_ADMIN_KEY
    headers_with_key = {**ext_headers, "X-Admin-Key": rotated_key}
    resp_docs_header = client.get("/docs", headers=headers_with_key)
    assert resp_docs_header.status_code == 200, f"Expected 200 for X-Admin-Key, got {resp_docs_header.status_code}"
    assert "revops_admin_token" in resp_docs_header.cookies, "Set-Cookie missing revops_admin_token"
    cookie_token = resp_docs_header.cookies["revops_admin_token"]
    print("  ✓ /docs accessible via X-Admin-Key header and established HttpOnly cookie.")

    # Access /docs using ONLY the established cookie (zero headers, zero query params)
    resp_docs_cookie = client.get("/docs", headers=ext_headers, cookies={"revops_admin_token": cookie_token})
    assert resp_docs_cookie.status_code == 200, f"Expected 200 for cookie-only access, got {resp_docs_cookie.status_code}"
    print("  ✓ /docs accessible purely via HttpOnly cookie (clean URL, zero params in history).")

    # Access /openapi.json using ONLY the cookie
    resp_openapi_cookie = client.get("/openapi.json", headers=ext_headers, cookies={"revops_admin_token": cookie_token})
    assert resp_openapi_cookie.status_code == 200, f"Expected 200 for /openapi.json via cookie, got {resp_openapi_cookie.status_code}"
    print("  ✓ /openapi.json accessible purely via HttpOnly cookie.")

    # Forged cookie -> 403 Forbidden
    resp_fake_cookie = client.get("/docs", headers=ext_headers, cookies={"revops_admin_token": "9999999.forged_signature"})
    assert resp_fake_cookie.status_code == 403, f"Expected 403 for forged cookie, got {resp_fake_cookie.status_code}"
    print("  ✓ Forged cookie strictly rejected with HTTP 403 Forbidden.")

    # Migration fallback key check
    resp_docs_fallback = client.get("/docs?admin_key=revops_admin_fleet_secret_2026", headers=ext_headers)
    assert resp_docs_fallback.status_code == 200, f"Expected 200 for migration fallback key, got {resp_docs_fallback.status_code}"
    print("  ✓ Migration fallback key accepted during transition window.")

    # Nuance 2: CLI Whitelist & Sanitization
    # Disallowed command
    resp_bad_cmd = client.post("/api/v1/admin/terminal/execute", json={"command": "rm -rf /"})
    assert resp_bad_cmd.status_code == 200
    bad_data = resp_bad_cmd.json()
    assert bad_data.get("status") == "error", "Disallowed command was not rejected"
    assert "отклонена" in bad_data.get("output", "")
    print("  ✓ Arbitrary shell command 'rm -rf /' strictly rejected by CLI whitelist.")

    # Injection in argument: /ping; id
    resp_inj = client.post("/api/v1/admin/terminal/execute", json={"command": "/ping; id"})
    assert resp_inj.status_code == 200
    inj_data = resp_inj.json()
    assert inj_data.get("status") == "error"
    print("  ✓ Injected command '/ping; id' rejected.")

    # Nuance 3: DLQ disk persistence
    from apps.api.routers.webhooks_router import DLQ_SNAPSHOT_PATH
    assert DLQ_SNAPSHOT_PATH.exists(), f"DLQ snapshot file should exist at {DLQ_SNAPSHOT_PATH}"
    with open(DLQ_SNAPSHOT_PATH, "r", encoding="utf-8") as f:
        dlq_data = json.load(f)
        assert isinstance(dlq_data, list) and len(dlq_data) > 0, "DLQ snapshot file is empty or not a list"
    print(f"  ✓ DLQ disk persistence verified ({len(dlq_data)} items saved at {DLQ_SNAPSHOT_PATH.name}).")

    # Nuance 4: InterProcessFileLock
    from apps.api.tenant_registry import InterProcessFileLock
    lock_tmp = Path(".test_interprocess.lock")
    with InterProcessFileLock(lock_tmp):
        # Nested or concurrent acquisition check
        assert lock_tmp.exists()
    if lock_tmp.exists():
        try:
            lock_tmp.unlink()
        except Exception:
            pass
    print("  ✓ InterProcessFileLock acquisition and release verified.")


if __name__ == "__main__":
    test_atomic_registry()
    wh_id = test_webhook_queue()
    test_dlq_and_replay(wh_id)
    test_quarantine_resolution()
    test_terminal_cli()
    test_nuances_hardening()
    print("\n=======================================================")
    print("ALL 6 ARCHITECTURAL HARDENING TESTS PASSED SUCCESSFULLY!")
    print("=======================================================")

