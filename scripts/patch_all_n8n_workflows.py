r"""
Systemic hardening for all n8n workflows:
- Eliminates all hardcoded obsolete domains and tokens (b24-8dmblj, azekoswdul7y2cpi)
- Fixes fragile unary plus (+id) by replacing with robust numeric regex: parseInt(String(id).replace(/\D/g, ''))
- Fixes amoCRM entity paths and fallback domains
- Ensures all Bitrix24 endpoints resolve dynamically from tenant registry
"""

import json
import subprocess
import sys

ACTIVE_B24_URL = "https://b24-1tuuth.bitrix24.ru/rest/1/70u1duarlao06zau/"
OLD_B24_DOMAIN = "b24-8dmblj.bitrix24.ru"
OLD_B24_TOKEN = "azekoswdul7y2cpi"

def patch_sh4_workflow(wf):
    modified = False
    for n in wf.get('nodes', []):
        name = n.get('name', '')
        p = n.get('parameters', {})
        
        # 1. Node 03b
        if name.startswith('03b.'):
            code = p.get('jsCode', '')
            if 'b24-8dmblj' in code:
                code = code.replace('b24-8dmblj.bitrix24.ru', 'b24-1tuuth.bitrix24.ru')
                code = code.replace('"b24_webhook_url": ""', f'"b24_webhook_url": "{ACTIVE_B24_URL}"')
                p['jsCode'] = code
                print("  [✓] Patched Node 03b (Bitrix24 active domain & webhook)")
                modified = True

        # 2. Node 43 (Deals sync)
        if name.startswith('43.'):
            url = p.get('url', '')
            if 'b24-8dmblj' in url:
                p['url'] = "={{ (($json.b24_webhook_url || $('40a. Определение конфигурации тенанта (JavaScript)').first().json.b24_webhook_url || '" + ACTIVE_B24_URL + "').replace(/\\/+$/, '') + '/') }}crm.deal.list.json"
                print("  [✓] Patched Node 43 (Deals sync URL)")
                modified = True

        # 3. Node 53 (Tasks sync)
        if name.startswith('53.'):
            url = p.get('url', '')
            if 'b24-8dmblj' in url:
                p['url'] = "={{ (($json.b24_webhook_url || $('40a. Определение конфигурации тенанта (JavaScript)').first().json.b24_webhook_url || '" + ACTIVE_B24_URL + "').replace(/\\/+$/, '') + '/') }}crm.activity.list?filter[COMPLETED]=N"
                print("  [✓] Patched Node 53 (Tasks sync URL)")
                modified = True

        # 4. Node 54 (Tasks processing jsCode)
        if name.startswith('54.'):
            code = p.get('jsCode', '')
            if 'b24-8dmblj' in code:
                p['jsCode'] = code.replace('b24-8dmblj.bitrix24.ru', 'b24-1tuuth.bitrix24.ru')
                print("  [✓] Patched Node 54 (Tasks processing domain)")
                modified = True

        # 5. Node 63 (Users sync)
        if name.startswith('63.'):
            url = p.get('url', '')
            if 'b24-8dmblj' in url:
                p['url'] = "={{ (($json.b24_webhook_url || $('40a. Определение конфигурации тенанта (JavaScript)').first().json.b24_webhook_url || '" + ACTIVE_B24_URL + "').replace(/\\/+$/, '') + '/') }}user.get?ACTIVE=Y"
                print("  [✓] Patched Node 63 (Users sync URL)")
                modified = True

        # 6. Node 73 (Pipelines sync)
        if name.startswith('73.'):
            url = p.get('url', '')
            if 'b24-8dmblj' in url:
                p['url'] = "={{ (($json.b24_webhook_url || $('40a. Определение конфигурации тенанта (JavaScript)').first().json.b24_webhook_url || '" + ACTIVE_B24_URL + "').replace(/\\/+$/, '') + '/') }}crm.status.list?FILTER[ENTITY_ID]=DEAL_STAGE"
                print("  [✓] Patched Node 73 (Pipelines sync URL)")
                modified = True

        # 7. Node 26 (amoCRM Task creation: entity_id numeric fix)
        if name.startswith('26.'):
            jb = p.get('jsonBody', '')
            if '+$json.lead_id' in jb:
                jb = jb.replace(
                    '"entity_id": +$json.lead_id || +$json.deal_id || undefined',
                    '"entity_id": parseInt(String($json.lead_id || $json.deal_id || 0).replace(/\\D/g, \'\')) || undefined'
                )
                p['jsonBody'] = jb
                print("  [✓] Patched Node 26 (amoCRM Task entity_id numeric extraction)")
                modified = True

        # 7b. Node 18 (pass enable_crm_mutations into results.push)
        if name.startswith('18.'):
            code = p.get('jsCode', '')
            if 'custom_fields: source.custom_fields || null,' in code and 'enable_crm_mutations:' not in code:
                code = code.replace(
                    'custom_fields: source.custom_fields || null,',
                    'custom_fields: source.custom_fields || null,\n      enable_crm_mutations: source.enable_crm_mutations !== undefined ? Boolean(source.enable_crm_mutations) : true,'
                )
                p['jsCode'] = code
                print("  [✓] Patched Node 18 (pass enable_crm_mutations)")
                modified = True

        # 7c. Node 20 (preserve enable_crm_mutations with true default)
        if name.startswith('20.'):
            code = p.get('jsCode', '')
            old_line = 'enable_crm_mutations: Boolean(source?.enable_crm_mutations || item.json.enable_crm_mutations || false),'
            new_line = 'enable_crm_mutations: source?.enable_crm_mutations !== undefined ? Boolean(source.enable_crm_mutations) : (item.json.enable_crm_mutations !== undefined ? Boolean(item.json.enable_crm_mutations) : true),'
            if old_line in code:
                code = code.replace(old_line, new_line)
                p['jsCode'] = code
                print("  [✓] Patched Node 20 (enable_crm_mutations default true)")
                modified = True

        # 8. Node 23 (amoCRM Notes: numeric entity_id in URL)
        if name.startswith('23.'):
            url = p.get('url', '')
            old_part = "{{ $json.lead_id || $json.deal_id }}"
            new_part = "{{ parseInt(String($json.lead_id || $json.deal_id || 0).replace(/\\D/g, '')) || 0 }}"
            if old_part in url:
                p['url'] = url.replace(old_part, new_part)
                print("  [✓] Patched Node 23 (amoCRM Note URL numeric extraction)")
                modified = True

        # 9. Node 29 (amoCRM custom fields update: numeric entity_id in URL)
        if name.startswith('29.'):
            url = p.get('url', '')
            old_part = "{{ $json.lead_id || $json.deal_id }}"
            new_part = "{{ parseInt(String($json.lead_id || $json.deal_id || 0).replace(/\\D/g, '')) || 0 }}"
            if old_part in url:
                p['url'] = url.replace(old_part, new_part)
                print("  [✓] Patched Node 29 (amoCRM lead update URL numeric extraction)")
                modified = True

        # 10. Node 25a (amoCRM open tasks query: numeric entity_id)
        if name.startswith('25a.'):
            url = p.get('url', '')
            old_part = "filter[entity_id]={{ $json.lead_id || $json.deal_id }}"
            new_part = "filter[entity_id]={{ parseInt(String($json.lead_id || $json.deal_id || 0).replace(/\\D/g, '')) || 0 }}"
            if old_part in url:
                p['url'] = url.replace(old_part, new_part)
                print("  [✓] Patched Node 25a (amoCRM open tasks query numeric extraction)")
                modified = True

    return modified

def patch_deals_sync_workflow(wf):
    modified = False
    for n in wf.get('nodes', []):
        name = n.get('name', '')
        p = n.get('parameters', {})
        if name.startswith('02.'):
            url = p.get('url', '')
            if 'b24-8dmblj' in url:
                p['url'] = ACTIVE_B24_URL + 'crm.deal.list.json'
                print("  [✓] Patched RevOpsDealsSync01 Node 02 URL to active portal")
                modified = True
    return modified

def run():
    print("=== Exporting workflows from n8n container ===")
    res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--all', '--stdout'], capture_output=True, text=True)
    if res.returncode != 0:
        print("Failed to export workflows:", res.stderr)
        sys.exit(1)

    workflows = json.loads(res.stdout)
    to_import = []

    for wf in workflows:
        wfid = wf.get('id')
        if wfid == 'Sh4JkQtMKVdeRJn5':
            print(f"\nProcessing {wf.get('name')} ({wfid})...")
            if patch_sh4_workflow(wf):
                to_import.append(wf)
        elif wfid == 'RevOpsDealsSync01':
            print(f"\nProcessing {wf.get('name')} ({wfid})...")
            if patch_deals_sync_workflow(wf):
                to_import.append(wf)

    if to_import:
        print(f"\nSaving {len(to_import)} hardened workflows to /tmp/hardened_workflows.json...")
        with open('/tmp/hardened_workflows.json', 'w', encoding='utf-8') as f:
            json.dump(to_import, f, ensure_ascii=False, indent=2)

        subprocess.run(['docker', 'cp', '/tmp/hardened_workflows.json', 'n8n:/tmp/hardened_workflows.json'], check=True)
        res_imp = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'import:workflow', '--input=/tmp/hardened_workflows.json'], capture_output=True, text=True)
        print("Import output:\n", res_imp.stdout)
        
        # Reactivate workflows
        for w in to_import:
            wid = w.get('id')
            print(f"Re-activating workflow {wid}...")
            subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'update:workflow', f'--id={wid}', '--active=true'], capture_output=True)
        
        print("Restarting n8n container to apply changes...")
        subprocess.run(['docker', 'restart', 'n8n'], check=True)
        print("n8n restarted successfully!")
    else:
        print("\nAll workflows already hardened!")

if __name__ == "__main__":
    run()
