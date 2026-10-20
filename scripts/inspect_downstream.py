import json
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
wf = json.loads(res.stdout)
if isinstance(wf, list):
    wf = wf[0]

check_nodes = ['21.', '22.', '23.', '24.', '25.', '25a.', '26.', '27.', '28.', '29.', '30.', '31.', '32.', '33.']
for n in wf.get('nodes', []):
    name = n.get('name', '')
    if any(name.startswith(p) for p in check_nodes):
        print(f"\n=================== {name} ({n.get('type')}) ===================")
        p = n.get('parameters', {})
        for k in ['conditions', 'url', 'jsonBody', 'jsCode']:
            if k in p:
                val = str(p[k])
                print(f"--- {k} ---")
                print(val[:400])
