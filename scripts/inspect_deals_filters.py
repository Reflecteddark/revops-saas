import subprocess
import json

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
data = json.loads(res.stdout)
wf = data[0] if isinstance(data, list) else data

for n in wf.get('nodes', []):
    name = n.get('name', '')
    if name.startswith('44.') or name.startswith('42.'):
        print('=== ' + name + ' ===')
        p = n.get('parameters', {})
        for k in ['jsCode']:
            if k in p:
                print('  ' + k + ':\n', str(p[k]))
