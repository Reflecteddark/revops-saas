import json
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--all', '--stdout'], capture_output=True, text=True)
workflows = json.loads(res.stdout)

print(f"Total workflows: {len(workflows)}")
for wf in workflows:
    print(f"- ID: {wf.get('id'):<20} Active: {str(wf.get('active')):<6} Name: {wf.get('name')}")
