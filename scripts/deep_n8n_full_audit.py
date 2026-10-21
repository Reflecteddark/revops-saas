import subprocess
import json
import re
import sys
from datetime import datetime

print("=====================================================================")
print("REVOPS ENTERPRISE OS — DEEP N8N SYSTEM & WORKFLOW AUDIT")
print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=====================================================================\n")

# 1. Docker container check
print("--- 1. N8N CONTAINER HEALTH ---")
ps_res = subprocess.run(['docker', 'ps', '--filter', 'name=n8n', '--format', 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'], capture_output=True, text=True)
print(ps_res.stdout.strip())

stats_res = subprocess.run(['docker', 'stats', 'n8n', '--no-stream', '--format', 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'], capture_output=True, text=True)
print(stats_res.stdout.strip())
print()

# 2. Export all workflows
print("--- 2. WORKFLOWS INVENTORY ---")
res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--all', '--stdout'], capture_output=True, text=True)
try:
    workflows = json.loads(res.stdout)
except Exception as e:
    print(f"Error parsing n8n export output: {e}")
    sys.exit(1)

print(f"Total workflows found: {len(workflows)}\n")
for wf in workflows:
    wfid = wf.get('id', 'N/A')
    wfname = wf.get('name', 'N/A')
    active = wf.get('active', False)
    nodes_count = len(wf.get('nodes', []))
    triggers = wf.get('triggerCount', 0)
    print(f"  • [{wfid}] Active: {str(active):<5} | Nodes: {nodes_count:<2} | Triggers: {triggers} | '{wfname}'")
print()

# 3. Deep static analysis of all workflows
print("--- 3. SECURITY, LEAKS & FRAGILITY SCAN ---")
CRITICAL_OBSOLETE_TOKENS = ['b24-8dmblj', 'azekoswdul7y2cpi']
HARDCODED_AMO_DOMAINS = ['revopsofficial.amocrm.ru']
UNARY_PATTERNS = [r'\+\$json\.lead_id', r'\+\$json\.deal_id', r'\+item\.json\.lead_id', r'\+item\.json\.deal_id']

total_issues = 0
for wf in workflows:
    wfid = wf.get('id', 'N/A')
    wfname = wf.get('name', 'N/A')
    wf_issues = []

    for n in wf.get('nodes', []):
        nname = n.get('name', '')
        ntype = n.get('type', '')
        params = n.get('parameters', {})
        p_str = json.dumps(params, ensure_ascii=False)

        # Check obsolete tokens
        for tok in CRITICAL_OBSOLETE_TOKENS:
            if tok in p_str:
                wf_issues.append(f"  [CRITICAL LEAK] Node '{nname}': contains obsolete token/domain '{tok}'")

        # Check fragile unary ID conversion
        for up in UNARY_PATTERNS:
            if re.search(up, p_str):
                wf_issues.append(f"  [FRAGILE UNARY] Node '{nname}': contains fragile unary conversion '{up}' (breaks on string IDs like 'B24-123')")

        # Check hardcoded amoCRM domains
        for amo in HARDCODED_AMO_DOMAINS:
            if amo in p_str and 'fallback' not in p_str.lower() and '$json.amo_domain' not in p_str:
                wf_issues.append(f"  [HARDCODE AMO] Node '{nname}': contains hardcoded amoCRM domain '{amo}' without tenant fallback")

        # Inspect Gemini node
        if 'gemini' in nname.lower() or 'gemini' in ntype.lower() or 'ai_audit' in nname.lower():
            model = params.get('model', params.get('modelName', 'N/A'))
            print(f"  ℹ️ [GEMINI AUDIT NODE] Workflow '{wfname}', Node '{nname}':")
            print(f"     Model: {model}")
            if 'options' in params:
                print(f"     Options: {params.get('options')}")

    if wf_issues:
        print(f"Workflow: '{wfname}' ({wfid}):")
        for iss in wf_issues:
            print(iss)
            total_issues += 1
    else:
        print(f"Workflow: '{wfname}' ({wfid}) -> ✓ 0 critical issues found.")

print(f"\nTotal potential issues detected: {total_issues}")
print()

# 4. Recent executions analysis from n8n SQLite DB
print("--- 4. EXECUTION HISTORY (LAST 24 HOURS) ---")
try:
    import sqlite3
    db_path = "/var/lib/docker/volumes/n8n_n8n_data/_data/database.sqlite"
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT status, count(*) 
        FROM execution_entity 
        GROUP BY status;
    """)
    rows = cursor.fetchall()
    print("Execution counts by status (All Time in DB):")
    for st, count in rows:
        print(f"  • {st:<10}: {count}")

    # Check last 10 executions
    cursor.execute("""
        SELECT id, workflowId, mode, status, startedAt, stoppedAt 
        FROM execution_entity 
        ORDER BY id DESC 
        LIMIT 10;
    """)
    recent = cursor.fetchall()
    print("\nLast 10 Executions:")
    for eid, wfid, mode, st, start_ts, stop_ts in recent:
        dur = "N/A"
        if start_ts and stop_ts:
            try:
                dur = f"{(int(stop_ts) - int(start_ts))/1000:.1f}s"
            except Exception:
                pass
        icon = "✅" if st in ("success", "finished") else ("⏳" if st == "running" else "❌")
        print(f"  {icon} Exec #{eid:<5} | WF: {wfid:<20} | Status: {st:<10} | Mode: {mode:<8} | Dur: {dur}")

    conn.close()
except Exception as e:
    print(f"Could not read n8n SQLite executions: {e}")

print("\n=====================================================================")
print("END OF N8N AUDIT")
print("=====================================================================")
