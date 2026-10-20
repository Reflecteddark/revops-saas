import json
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
wf = json.loads(res.stdout)
if isinstance(wf, list):
    wf = wf[0]

for n in wf.get('nodes', []):
    name = n.get('name', '')
    if name.startswith('20.'):
        print(f"=== Node: {name} ===")
        print(n.get('parameters', {}).get('jsCode'))
    elif name.startswith('30.'):
        print(f"=== Node: {name} ===")
        print("URL:", n.get('parameters', {}).get('url'))
        print("jsonBody:", n.get('parameters', {}).get('jsonBody'))
    elif name.startswith('31.'):
        print(f"=== Node: {name} ===")
        print("URL:", n.get('parameters', {}).get('url'))
        print("jsonBody:", n.get('parameters', {}).get('jsonBody'))
    elif name.startswith('33.'):
        print(f"=== Node: {name} ===")
        print("URL:", n.get('parameters', {}).get('url'))
        print("jsonBody:", n.get('parameters', {}).get('jsonBody'))
