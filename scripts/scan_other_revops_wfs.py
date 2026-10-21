import json
import re
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--all', '--stdout'], capture_output=True, text=True)
workflows = json.loads(res.stdout)

target_ids = ['RevOpsMessageAudit01', 'RevOpsErrorSupervisor01', 'RevOpsReportGenerator01']
for wf in workflows:
    wfid = wf.get('id')
    if wfid not in target_ids:
        continue
    print("\n==========================================")
    print(f"Workflow: {wf.get('name')} ({wfid})")
    print("==========================================")
    findings = []
    for n in wf.get('nodes', []):
        nname = n.get('name', '')
        p_str = json.dumps(n.get('parameters', {}), ensure_ascii=False)
        for leak in ['b24-8dmblj', 'azekoswdul7y2cpi', 'b24-1tuuth', '70u1duarlao06zau', 'revopsofficial']:
            if leak in p_str:
                findings.append(f"  - [{leak}] in Node '{nname}'")
        for up in [r'\+\$json\.\w*id', r'\+item\.json\.\w*id']:
            m = re.findall(up, p_str)
            if m:
                findings.append(f"  - [Unary Plus {m}] in Node '{nname}'")
    if findings:
        for f in findings:
            print(f)
    else:
        print("  ✓ Clean! No leaks or fragile ID patterns found.")
