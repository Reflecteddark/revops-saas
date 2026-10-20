import subprocess
import json
import re

res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--all', '--stdout'], capture_output=True, text=True)
workflows = json.loads(res.stdout)

target_wfs = ['Sh4JkQtMKVdeRJn5', 'RevOpsDealsSync01']

for wf in workflows:
    wfid = wf.get('id')
    if wfid not in target_wfs:
        continue
    
    print(f"\n==========================================")
    print(f"Workflow: {wf.get('name')} ({wfid})")
    print(f"==========================================")
    
    for n in wf.get('nodes', []):
        nname = n.get('name', '')
        p_str = json.dumps(n.get('parameters', {}), ensure_ascii=False)
        
        has_b24_leak = 'b24-8dmblj' in p_str or 'azekoswdul7y2cpi' in p_str
        has_amo_leak = 'revopsofficial' in p_str
        has_unary = bool(re.search(r'\+\$json\.(?:lead_id|deal_id)', p_str))
        is_target_node = any(nname.startswith(p) for p in ['25.', '25a.', '26.', '29.', '33.', '02.', '03.', '04.', '05.', '10.', '12.', '20.', '41.', '52.', '61.', '71.'])
        
        if has_b24_leak or has_unary or (is_target_node and has_amo_leak):
            print(f"\nNode: {nname} ({n.get('type')})")
            if has_b24_leak:
                print("  - [LEAK] Contains old Bitrix24 domain/token")
            if has_amo_leak:
                print("  - [LEAK] Contains hardcoded amoCRM domain 'revopsofficial'")
            if has_unary:
                print("  - [UNARY PLUS] Contains +$json.lead_id or +$json.deal_id")
            
            p = n.get('parameters', {})
            for k in ['url', 'jsonBody', 'conditions', 'jsCode']:
                if k in p:
                    val = str(p[k])
                    print(f"  {k}: {val[:300]}")

