import json
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
data = json.loads(res.stdout)
wf = data[0] if isinstance(data, list) else data

for n in wf.get('nodes', []):
    name = n.get('name', '')
    if name.startswith('02b') or name.startswith('03b'):
        print('=== ' + name + ' ===')
        p = n.get('parameters', {})
        for k in ['url', 'jsCode', 'queryParameters', 'options', 'jsonBody']:
            if k in p:
                print('  ' + k + ':\n', str(p[k]))
