import json
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
wf = json.loads(res.stdout)
if isinstance(wf, list):
    wf = wf[0]

check_nodes = ['10.', '12.', '13.', '16.', '18.', '20.', '21.', '22.', '24.']
for n in wf.get('nodes', []):
    name = n.get('name', '')
    if any(name.startswith(p) for p in check_nodes):
        print(f"\n=================== {name} ({n.get('type')}) ===================")
        p = n.get('parameters', {})
        for k in ['jsCode', 'conditions', 'url']:
            if k in p:
                code = str(p[k])
                print(f"--- {k} ---")
                print(code[:600])
