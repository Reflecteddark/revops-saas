import json
import subprocess
import sys

# 1. Export current workflow from n8n container
res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
if res.returncode != 0:
    print("Error exporting workflow:", res.stderr)
    sys.exit(1)

data = json.loads(res.stdout)
wf = data[0] if isinstance(data, list) else data

new_b24_url = "https://b24-1tuuth.bitrix24.ru/rest/1/70u1duarlao06zau/"
modified = False

for n in wf.get('nodes', []):
    name = n.get('name', '')
    
    # 1. Fix Node 30
    if name.startswith('30.'):
        p = n.get('parameters', {})
        p['url'] = "={{ (($json.b24_webhook_url || '" + new_b24_url + "').replace(/\\/+$/, '') + '/') }}crm.timeline.comment.add"
        p['jsonBody'] = '={\n  "fields": {\n    "ENTITY_ID": {{ parseInt(String($json.deal_id || $json.lead_id || 0).replace(/\\D/g, \'\')) || 0 }},\n    "ENTITY_TYPE": "{{ $json.entity_type || \'deal\' }}",\n    "COMMENT": "{{ ($json.b24_comment_text || \'\').replace(/\"/g, \'\\\\"\').replace(/\\n/g, \'\\\\n\') }}"\n  }\n}'
        print("Patched Node 30")
        modified = True

    # 2. Fix Node 33
    if name.startswith('33.'):
        p = n.get('parameters', {})
        p['url'] = "={{ (($json.b24_webhook_url || '" + new_b24_url + "').replace(/\\/+$/, '') + '/') + 'crm.' + ($json.entity_type === 'lead' ? 'lead' : 'deal') + '.update' }}"
        p['jsonBody'] = '={\n  "id": {{ parseInt(String($json.deal_id || $json.lead_id || 0).replace(/\\D/g, \'\')) || 0 }},\n  "fields": {\n    "{{ $json.custom_fields.b24_ai_score_field || \'UF_CRM_AI_SCORE\' }}": {{ +$json.total_score || 0 }},\n    "{{ $json.custom_fields.b24_ai_next_step_field || \'UF_CRM_AI_NEXT_STEP\' }}": "{{ ($json.ai_next_step || $json.ai_recommendation || \'\').replace(/\"/g, \'\\\\"\').replace(/\\n/g, \' \') }}"\n  }\n}'
        print("Patched Node 33")
        modified = True

    # 3. Fix Node 02b
    if name.startswith('02b.'):
        p = n.get('parameters', {})
        p['url'] = new_b24_url + 'crm.activity.list'
        print("Patched Node 02b")
        modified = True

    # 4. Fix Node 18 (pass b24_webhook_url)
    if name.startswith('18.') and n.get('type') == 'n8n-nodes-base.code':
        code = n.get('parameters', {}).get('jsCode', '')
        if '// b24_webhook_url removed for security' in code:
            code = code.replace(
                '// b24_webhook_url removed for security',
                'b24_webhook_url: source.b24_webhook_url || "' + new_b24_url + '",'
            )
            n['parameters']['jsCode'] = code
            print("Patched Node 18 jsCode (b24_webhook_url)")
            modified = True

    # 5. Fix Node 20 (pass b24_webhook_url)
    if name.startswith('20.') and n.get('type') == 'n8n-nodes-base.code':
        code = n.get('parameters', {}).get('jsCode', '')
        old_str = "b24_webhook_url: source?.b24_webhook_url || item.json.b24_webhook_url || ''"
        new_str = 'b24_webhook_url: source?.b24_webhook_url || item.json.b24_webhook_url || "' + new_b24_url + '"'
        if old_str in code:
            code = code.replace(old_str, new_str)
            n['parameters']['jsCode'] = code
            print("Patched Node 20 jsCode (b24_webhook_url)")
            modified = True

if modified:
    with open('/tmp/patched_wf.json', 'w', encoding='utf-8') as f:
        json.dump([wf], f, ensure_ascii=False, indent=2)
    
    subprocess.run(['docker', 'cp', '/tmp/patched_wf.json', 'n8n:/tmp/patched_wf.json'], check=True)
    res_import = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'import:workflow', '--input=/tmp/patched_wf.json'], capture_output=True, text=True)
    print("Import result:", res_import.stdout)
    if res_import.stderr:
        print("Import stderr:", res_import.stderr)
else:
    print("No modifications needed.")
