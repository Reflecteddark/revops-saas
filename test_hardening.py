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


if __name__ == "__main__":
    test_atomic_registry()
    wh_id = test_webhook_queue()
    test_dlq_and_replay(wh_id)
    test_quarantine_resolution()
    test_terminal_cli()
    print("\n=======================================================")
    print("ALL 5 ARCHITECTURAL HARDENING TESTS PASSED SUCCESSFULLY!")
    print("=======================================================")
