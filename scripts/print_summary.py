import json
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

url = 'https://report.ai-rop.ru/api/v1/calls/data'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))

print('=== Web Dashboard (ЛК) Health Check ===')
print('Total Audited Calls:', data.get('count'))
for c in data.get('calls', []):
    did = c.get('deal_id')
    sc = c.get('score')
    st = c.get('status_label')
    mgr = c.get('manager')
    t = str(c.get('transcript'))[:90]
    print(f'Deal {did}: Score {sc}/13 | Status: {st} | Manager: {mgr}')
    print(f'   Audio Transcript: "{t}..."')
