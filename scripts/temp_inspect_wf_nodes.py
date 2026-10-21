import json
import subprocess

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
wf = json.loads(res.stdout)
if isinstance(wf, list):
    wf = wf[0]

print(f"Workflow ID: {wf.get('id')}, Name: {wf.get('name')}")
for n in wf.get('nodes', []):
    ntype = n.get('type', '')
    name = n.get('name', '')
    params = n.get('parameters', {})
    
    # We are interested in Google Sheets, HTTP requests (FastAPI calls), webhooks, and retry settings
    if 'googleSheets' in ntype or 'httpRequest' in ntype or 'webhook' in ntype:
        print(f"\n--- Node: {name} | Type: {ntype} ---")
        if 'googleSheets' in ntype:
            sheet_name = params.get('sheetName')
            op = params.get('operation')
            cols = params.get('columns', {})
            matching = cols.get('matchingColumns', [])
            print(f"  Operation: {op}")
            print(f"  Sheet: {sheet_name}")
            print(f"  Matching Columns: {matching}")
        if 'httpRequest' in ntype:
            url = params.get('url', '')
            method = params.get('method', 'GET')
            print(f"  HTTP {method}: {url}")
        # Retry settings
        retry_on_fail = n.get('retryOnFail')
        max_tries = n.get('maxTries')
        wait = n.get('waitBetweenTries')
        if retry_on_fail or max_tries:
            print(f"  Retry: retryOnFail={retry_on_fail}, maxTries={max_tries}, waitBetweenTries={wait}")
        else:
            print(f"  Retry: No retry configured on node (default: 0 retries)")
