import json
import re
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--all', '--stdout'], capture_output=True, text=True)
try:
    workflows = json.loads(res.stdout)
except Exception as e:
    print('Failed to parse workflows JSON:', e)
    workflows = []

print(f'Total workflows exported: {len(workflows)}')

old_domains = ['b24-8dmblj', 'azekoswdul7y2cpi']
unary_patterns = [r'\+\$json\.', r'\+item\.json\.']

for wf in workflows:
    wfname = wf.get('name', 'Unknown')
    wfid = wf.get('id', 'Unknown')
    findings = []
    
    for n in wf.get('nodes', []):
        nname = n.get('name', '')
        ntype = n.get('type', '')
        params_str = json.dumps(n.get('parameters', {}), ensure_ascii=False)
        
        # Check old domains
        for od in old_domains:
            if od in params_str:
                findings.append(f'  [CRITICAL Old Domain] Node "{nname}" contains "{od}"')
        
        # Check unary plus on IDs
        for up in unary_patterns:
            matches = re.findall(up + r'[a-zA-Z0-9_]+', params_str)
            if matches:
                findings.append(f'  [WARN Unary Plus ID] Node "{nname}" contains: {matches}')
        
        # Check amoCRM hardcoded domain
        if 'revopsofficial' in params_str:
            findings.append(f'  [INFO amoCRM Hardcode] Node "{nname}" contains "revopsofficial"')

    if findings:
        print(f'\nWorkflow: {wfname} (ID: {wfid})')
        for f in findings:
            print(f)
