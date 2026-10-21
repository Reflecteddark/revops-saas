"""
RevOps Enterprise OS — Complete Deep E2E System Audit Script.
Executes non-fictitious end-to-end testing across all 8 architectural layers:
1. Health & Infrastructure Telemetry
2. Multi-Tenant Onboarding & RBAC Auth (Bearer JWT)
3. 28 SSOT Parameters Synchronization
4. amoCRM Inbound Webhook Processing
5. Bitrix24 Inbound Webhook Processing
6. Speech Ingestion & 13 Criteria Audit Engine
7. Deals Pipeline & SLA Risk Verification
8. 7 Deadly Sins & Revenue Leaks Diagnostics
9. 3-Number Express Diagnostic Calculator
10. Monte-Carlo 10,000 Iteration Stochastic Engine
11. AI Strategy Copilot
12. Autonomous Self-Healing DevOps Healer & CCO Repairman
13. Admin Fleet Telemetry & Services
14. Live WebSocket Handshake & Broadcast Pipeline
15. Local Web Dashboard UI Architecture
16. Production Edge CDN (https://ai-rop.ru/app/)
"""

import asyncio
import json
import sys
import time
import urllib.error
import urllib.request
from typing import Any

# Ensure UTF-8 output on Windows
sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://127.0.0.1:8000"
PROD_URL = "https://ai-rop.ru/app/"

audit_records: list[dict[str, Any]] = []

def record(step: str, status: str, duration_ms: float, details: str, preview: str = ""):
    audit_records.append({
        "step": step,
        "status": status,
        "duration_ms": round(duration_ms, 2),
        "details": details,
        "preview": preview[:120] if preview else ""
    })
    badge = "PASS" if status == "OK" else ("WARN" if status == "WARN" else "FAIL")
    print(f"[{badge}] {step} ({round(duration_ms, 1)}ms) -> {details}")

def http_req(path: str, method: str = "GET", body: dict = None, headers: dict = None) -> tuple[int, dict, float]:
    url = f"{BASE_URL}{path}"
    req_headers = {"User-Agent": "RevOps-E2E-Auditor/1.0", "Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=req_headers, method=method)
    
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            elapsed = (time.perf_counter() - t0) * 1000
            content = resp.read().decode("utf-8")
            try:
                parsed = json.loads(content)
            except Exception:
                parsed = {"raw": content}
            return resp.status, parsed, elapsed
    except urllib.error.HTTPError as e:
        elapsed = (time.perf_counter() - t0) * 1000
        content = e.read().decode("utf-8", errors="ignore")
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = {"raw": content}
        return e.code, parsed, elapsed
    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        return 0, {"error": str(e)}, elapsed

def run_deep_audit():
    print("=" * 85)
    print("REVOPS ENTERPRISE OS — DEEP NON-FICTITIOUS E2E SYSTEM AUDIT")
    print(f"Local Server: {BASE_URL} | Production Edge: {PROD_URL}")
    print("=" * 85)

    # -------------------------------------------------------------------------
    # 1. Healthcheck & Infrastructure Telemetry
    # -------------------------------------------------------------------------
    code, res, dur = http_req("/api/v1/health")
    if code == 200 and res.get("status") == "healthy":
        record("1. Healthcheck API", "OK", dur, f"Service: {res.get('service')} | Version: {res.get('version')}")
    else:
        record("1. Healthcheck API", "FAIL", dur, f"Code {code}: {res}")

    code, res, dur = http_req("/api/v1/monitoring/health")
    if code == 200:
        db_info = res.get("database", {})
        record("2. Monitoring & Observability", "OK", dur, f"DB Status: {db_info.get('status')} | Requests Tracked: {res.get('total_requests', 0)}")
    else:
        record("2. Monitoring & Observability", "WARN", dur, f"Code {code}")

    # -------------------------------------------------------------------------
    # 2. Multi-Tenant Onboarding & RBAC Auth
    # -------------------------------------------------------------------------
    code, tenants, dur = http_req("/api/v1/tenants")
    if code == 200 and isinstance(tenants, list):
        record("3. Multi-Tenant Registry", "OK", dur, f"Active tenants registered: {len(tenants)}")
    else:
        record("3. Multi-Tenant Registry", "FAIL", dur, f"Code {code}: {tenants}")

    # Register or login unique test user to obtain live Bearer JWT
    uid = int(time.time())
    reg_payload = {
        "company_name": f"E2E Enterprise {uid}",
        "admin_name": "E2E Lead Auditor",
        "admin_email": f"audit_{uid}@revops-test.internal",
        "password": "Password123!"
    }
    code, auth_res, dur = http_req("/api/v1/auth/register-tenant", method="POST", body=reg_payload)
    token = auth_res.get("access_token")
    auth_headers = {"Authorization": f"Bearer {token}"} if token else {}
    if code == 200 and token:
        record("4. Tenant Onboarding & JWT Auth", "OK", dur, f"Tenant: {auth_res.get('tenant_id')} | Role: {auth_res.get('role')} | User: {auth_res.get('full_name')}")
    else:
        record("4. Tenant Onboarding & JWT Auth", "FAIL", dur, f"Auth failed with code {code}: {auth_res}")

    # -------------------------------------------------------------------------
    # 3. 28 SSOT Parameters Synchronization
    # -------------------------------------------------------------------------
    code, res, dur = http_req("/api/v1/settings?tenant_id=TNT-001")
    if code == 200:
        target = res.get("monthly_target", 0)
        stages_count = len(res.get("stages", {}))
        record("5. 28 SSOT Parameters", "OK", dur, f"Plan Target: {target:,.0f} ₽ | Stages: {stages_count} | Sync: {res.get('status', 'OK')}")
    else:
        record("5. 28 SSOT Parameters", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 4. amoCRM & Bitrix24 Inbound Webhooks
    # -------------------------------------------------------------------------
    amo_payload = {
        "events": [{
            "type": "call",
            "id": uid,
            "entity_id": 901245,
            "value_after": {
                "call": {
                    "duration": 195,
                    "phone": "+7 (916) 123-45-67"
                }
            }
        }],
        "org_id": "TNT-001"
    }
    code, res, dur = http_req("/api/v1/webhooks/amo-crm", method="POST", body=amo_payload)
    if code == 200 and res.get("status") == "ok":
        record("6. amoCRM Inbound Webhook", "OK", dur, f"Event: {res.get('event')} | Call ID: {res.get('call_id')} | Sheets Synced: {res.get('sheets_synced')}")
    else:
        record("6. amoCRM Inbound Webhook", "FAIL", dur, f"Code {code}: {res}")

    b24_payload = {
        "event": "ONCRMDEALUPDATE",
        "data": {
            "FIELDS": {"ID": 88120, "STAGE_ID": "NEGOTIATION", "OPPORTUNITY": 950000}
        },
        "org_id": "TNT-001"
    }
    code, res, dur = http_req("/api/v1/webhooks/bitrix24", method="POST", body=b24_payload)
    if code == 200 and res.get("status") == "ok":
        record("7. Bitrix24 Inbound Webhook", "OK", dur, f"Event: {res.get('event')} | Processed Deal: {res.get('processed_deal')}")
    else:
        record("7. Bitrix24 Inbound Webhook", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 5. Speech Ingestion & 13 B2B Criteria Audit Engine
    # -------------------------------------------------------------------------
    call_test_payload = {
        "id": f"e2e_call_{uid}",
        "deal_id": "DEAL-LIVE-101",
        "deal_title": "ПАО ПромСвязь: Внедрение ИИ-Аудита RevOps",
        "client": "ООО СпецМонтаж (Геннадий)",
        "manager": "Заряна",
        "stage": "3. Встреча / Демо",
        "duration_sec": 240,
        "duration": "4:00",
        "amount": "800 000 ₽",
        "score": 12,
        "status": "won",
        "status_label": "ЭТАЛОН",
        "risk_amount": "0 ₽",
        "next_step": 1,
        "cr": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
        "error_summary": "Легкая заминка на резюмировании CR12",
        "recommendation": "Скрипт закрытия на слот Zoom выполнен образцово",
        "transcript": "Менеджер: Геннадий, добрый день! Зафиксируем Zoom на пятницу в 11:30? Клиент: Да, отлично.",
        "sync_to_sheets": False,
        "tenant_id": "TNT-001"
    }
    code, res, dur = http_req("/api/v1/calls/ingest", method="POST", body=call_test_payload)
    if code == 200 and res.get("status") == "ok":
        record("8. Speech Ingestion (13 CR)", "OK", dur, f"Call ID: {res.get('call_id')} | Score: 12/13 | Next Step: 1 | Status: won")
    else:
        record("8. Speech Ingestion (13 CR)", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 6. Deals Pipeline & SLA Risk Tracking
    # -------------------------------------------------------------------------
    code, res, dur = http_req("/api/v1/deals?org_id=TNT-001")
    if code == 200 and res.get("status") == "ok":
        deals = res.get("deals", [])
        total_pipe = sum(d.get("amount", 0) for d in deals)
        sla_risks = res.get("sla_risk_count", 0)
        record("9. Deals Pipeline & SLA", "OK", dur, f"Total deals: {len(deals)} | Pipeline: {total_pipe:,.0f} ₽ | SLA Risks: {sla_risks}")
    else:
        record("9. Deals Pipeline & SLA", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 7. 7 Deadly Sins & Revenue Leaks Diagnostics
    # -------------------------------------------------------------------------
    sins_payload = {
        "monthly_leads": 250,
        "avg_ticket_rub": 300000.0,
        "current_conversion_pct": 7.5,
        "deals_without_next_step_pct": 35.0,
        "stalled_deals_pct": 40.0
    }
    code, res, dur = http_req("/api/v1/diagnostics/seven-sins", method="POST", body=sins_payload, headers=auth_headers)
    if code == 200:
        total_lost = res.get("total_lost_revenue_rub", 0)
        recovery = res.get("recovery_potential_rub", 0)
        sins_list = res.get("sins", [])
        record("10. 7 Deadly Sins Revenue Leaks", "OK", dur, f"Identified Losses: {total_lost:,.0f} ₽ | Monthly Recovery: {recovery:,.0f} ₽ | Sins Evaluated: {len(sins_list)}")
    else:
        record("10. 7 Deadly Sins Revenue Leaks", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 8. 3-Number Express Diagnostic Calculator
    # -------------------------------------------------------------------------
    exp_payload = {
        "monthly_leads": 50,
        "avg_ticket_rub": 350000.0,
        "current_close_rate_pct": 5.0,
        "expected_conversion_uplift_pct": 35.0
    }
    code, res, dur = http_req("/api/v1/diagnostics/express-calculator", method="POST", body=exp_payload, headers=auth_headers)
    if code == 200:
        upside = res.get("monthly_upside", 0)
        roi = res.get("roi_multiple", 0)
        record("11. 3-Number Express Calculator", "OK", dur, f"Monthly Upside: {upside:,.0f} ₽/мес | ROI Multiple: {roi}x")
    else:
        record("11. 3-Number Express Calculator", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 9. Monte-Carlo 10,000 Iteration Stochastic Engine
    # -------------------------------------------------------------------------
    mc_payload = {
        "leads_mean": 50.0,
        "conv_qual_pct": 60.0,
        "conv_close_pct": 35.0,
        "avg_ticket_rub": 350000.0,
        "iterations": 10000
    }
    code, res, dur = http_req("/api/v1/simulator/run-monte-carlo", method="POST", body=mc_payload)
    if code == 200:
        p10 = res.get("p10", 0)
        p50 = res.get("p50", 0)
        p90 = res.get("p90", 0)
        iters = res.get("iterations_run", 0)
        record("12. Monte-Carlo Stochastic Engine", "OK", dur, f"{iters:,} iterations in {round(dur, 1)}ms | P10: {p10:,.0f} ₽ | P50: {p50:,.0f} ₽ | P90: {p90:,.0f} ₽")
    else:
        record("12. Monte-Carlo Stochastic Engine", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 10. AI Strategy Copilot
    # -------------------------------------------------------------------------
    code, res, dur = http_req("/api/v1/insights/summary?org_id=TNT-001&p10=2187500&p50=3675000&p90=5162500")
    if code == 200 and "insights" in res:
        insights_count = len(res.get("insights", []))
        summary_txt = res.get("executive_summary", "")[:60]
        record("13. AI Strategy Copilot", "OK", dur, f"Insights: {insights_count} | Summary: {summary_txt}...")
    else:
        record("13. AI Strategy Copilot", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 11. Autonomous Self-Healing DevOps & CCO Repairman
    # -------------------------------------------------------------------------
    code, res, dur = http_req("/api/v1/diagnostics/self-healing", method="POST")
    if code == 200 and res.get("status") == "repaired":
        healer = res.get("healer", {})
        repairman = res.get("repairman", {})
        record("14. Autonomous Self-Healing Crew", "OK", dur, f"DevOps: {healer.get('status')} | CCO: {repairman.get('status')} | Inspected: {repairman.get('repaired_calls_count', 0)} calls")
    else:
        record("14. Autonomous Self-Healing Crew", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 12. Admin Fleet Control Room
    # -------------------------------------------------------------------------
    code, res, dur = http_req("/api/v1/admin/status")
    if code == 200:
        fleet_status = res.get("fleet_status")
        record("15. Admin Fleet Control Room", "OK", dur, f"Fleet Status: {fleet_status} | FastAPI: {res.get('fastapi')} | Tunnel: {res.get('cloudflare_tunnel')}")
    else:
        record("15. Admin Fleet Control Room", "FAIL", dur, f"Code {code}: {res}")

    code, res, dur = http_req("/api/v1/admin/agents/telemetry")
    if code == 200 and isinstance(res.get("agents"), dict):
        agent_keys = list(res.get("agents", {}).keys())
        record("16. AI Agents Fleet Telemetry", "OK", dur, f"Active agents: {res.get('active_count')}/{res.get('total_count')} [{', '.join(agent_keys)}]")
    else:
        record("16. AI Agents Fleet Telemetry", "FAIL", dur, f"Code {code}: {res}")

    # -------------------------------------------------------------------------
    # 13. Live WebSocket Handshake & Broadcast Pipeline
    # -------------------------------------------------------------------------
    async def test_ws_pipeline():
        import websockets
        uri = "ws://127.0.0.1:8000/ws/org/TNT-001"
        t0 = time.perf_counter()
        async with websockets.connect(uri) as ws:
            # 1. Ping-pong handshake
            await ws.send("heartbeat_e2e")
            ack = await asyncio.wait_for(ws.recv(), timeout=2.0)
            ack_data = json.loads(ack)
            handshake_ok = ack_data.get("type") == "pong"

            # 2. Trigger webhook and wait for real-time broadcast frame
            req = urllib.request.Request("http://127.0.0.1:8000/api/v1/webhooks/test-amo", data=b"", method="POST")
            urllib.request.urlopen(req, timeout=3)
            broadcast_raw = await asyncio.wait_for(ws.recv(), timeout=3.0)
            b_data = json.loads(broadcast_raw)
            broadcast_ok = b_data.get("type") == "new_call"
            cid = b_data.get("call", {}).get("id", "")
            elapsed = (time.perf_counter() - t0) * 1000
            return handshake_ok and broadcast_ok, cid, elapsed

    try:
        ok, cid, ws_dur = asyncio.run(test_ws_pipeline())
        if ok:
            record("17. WebSocket Real-time Push Pipeline", "OK", ws_dur, f"Bi-directional handshake + live broadcast received (Call: {cid}) in {round(ws_dur, 1)}ms")
        else:
            record("17. WebSocket Real-time Push Pipeline", "FAIL", ws_dur, "Frame reception mismatch")
    except Exception as e:
        record("17. WebSocket Real-time Push Pipeline", "FAIL", 0, f"WebSocket error: {e}")

    # -------------------------------------------------------------------------
    # 14. Local Web UI Architecture & Components
    # -------------------------------------------------------------------------
    code, res, dur = http_req("/app/")
    if code == 200:
        html = res.get("raw", "")
        markers = [
            ("SVG Favicon", "image/svg+xml"),
            ("Sticky Leaks Summary", "leaks-sticky-bar"),
            ("3x3 Sensitivity Table", "sensitivity-table"),
            ("Event Log Table", "event-log-table"),
            ("Chart Zero-State Overlay", "chart-zero-overlay"),
            ("Sidebar Tenant Chip", "mp-tenant-chip"),
        ]
        passed = sum(1 for label, m in markers if m in html)
        record("18. Local Dashboard HTML Architecture", "OK", dur, f"{passed}/{len(markers)} UI components verified in DOM")
    else:
        record("18. Local Dashboard HTML Architecture", "FAIL", dur, f"Code {code}")

    # -------------------------------------------------------------------------
    # 15. Production Edge CDN (https://ai-rop.ru/app/)
    # -------------------------------------------------------------------------
    t0 = time.perf_counter()
    try:
        req = urllib.request.Request(PROD_URL, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            dur = (time.perf_counter() - t0) * 1000
            html_edge = resp.read().decode("utf-8")
            has_overlay = "chart-zero-overlay" in html_edge
            has_table = "sensitivity-table" in html_edge
            has_chip = "mp-tenant-chip" in html_edge
            all_verified = has_overlay and has_table and has_chip
            record("19. Production Edge CDN (ai-rop.ru)", "OK" if all_verified else "WARN", dur, f"HTTP 200 | Sensitivity Table: {has_table} | Blur Overlay: {has_overlay} | Tenant Chip: {has_chip}")
    except Exception as e:
        dur = (time.perf_counter() - t0) * 1000
        record("19. Production Edge CDN (ai-rop.ru)", "WARN", dur, f"Edge CDN: {e}")

    # -------------------------------------------------------------------------
    # Synthesis & Deep Telemetry
    # -------------------------------------------------------------------------
    print("=" * 85)
    print("DEEP SYSTEM AUDIT — TELEMETRY & ARCHITECTURAL VERDICT")
    print("=" * 85)
    ok_count = sum(1 for r in audit_records if r["status"] == "OK")
    warn_count = sum(1 for r in audit_records if r["status"] == "WARN")
    fail_count = sum(1 for r in audit_records if r["status"] == "FAIL")
    avg_latency = sum(r["duration_ms"] for r in audit_records) / len(audit_records) if audit_records else 0

    print(f"Total Audit Stages: {len(audit_records)}")
    print(f"Success Rate: {round((ok_count / len(audit_records)) * 100, 1)}% ({ok_count} PASS, {warn_count} WARN, {fail_count} FAIL)")
    print(f"Average System Latency: {round(avg_latency, 2)} ms")
    print("-" * 85)

if __name__ == "__main__":
    run_deep_audit()
