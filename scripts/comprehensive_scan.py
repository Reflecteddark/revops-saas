import json
import subprocess
import re

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
wf = json.loads(res.stdout)
if isinstance(wf, list):
    wf = wf[0]

print(f"Workflow: {wf.get('name')} has {len(wf.get('nodes', []))} nodes.")

for n in wf.get('nodes', []):
    nname = n.get('name', '')
    p = n.get('parameters', {})
    p_str = json.dumps(p, ensure_ascii=False)
    
    # Check for hardcoded URLs or tokens
    hardcoded = []
    for token in ['b24-8dmblj', 'azekoswdul7y2cpi']:
        if token in p_str:
            hardcoded.append(f"CRITICAL obsolete token/domain: {token}")
            
    # Check unary plus on IDs
    unaries = re.findall(r'\+\$json\.\w*id|\+item\.json\.\w*id', p_str)
    
    # Check if node has URL with amoCRM or Bitrix24
    if hardcoded or unaries:
        print(f"\n[NODE] {nname} ({n.get('type')}):")
        for h in hardcoded:
            print(f"  - {h}")
        for u in unaries:
            print(f"  - Fragile unary ID: {u}")
