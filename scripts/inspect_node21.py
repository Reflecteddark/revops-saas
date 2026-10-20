import json
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
wf = json.loads(res.stdout)
if isinstance(wf, list):
    wf = wf[0]

for n in wf.get('nodes', []):
    name = n.get('name', '')
    if name.startswith('21.'):
        print(f"=== {name} ===")
        print(json.dumps(n.get('parameters', {}), indent=2, ensure_ascii=False))
