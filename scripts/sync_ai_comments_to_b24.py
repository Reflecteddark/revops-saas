"""
Sync AI Audit Comments from Google Sheets raw_calls directly into Bitrix24 deal timelines.
"""

import json
import os
import sys
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

WEBHOOK_B24 = os.getenv("B24_WEBHOOK_URL", "https://b24-1tuuth.bitrix24.ru/rest/1/70u1duarlao06zau/")
API_CALLS_URL = "https://report.ai-rop.ru/api/v1/calls/data"

def b24_post(method, payload):
    url = WEBHOOK_B24 + method
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode('utf-8'))
    except Exception as e:
        print(f"Error in {method}: {e}")
        return None

def run():
    print("Fetching audited calls from Web Dashboard API...")
    req = urllib.request.Request(API_CALLS_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode('utf-8'))
    
    calls = data.get('calls', [])
    print(f"Found {len(calls)} audited calls.")

    for call in calls:
        deal_str = str(call.get('deal_id', ''))
        try:
            if '-' in deal_str:
                deal_num = int(deal_str.split('-')[-1])
            else:
                deal_num = int(''.join(filter(str.isdigit, deal_str)))
        except ValueError:
            continue

        score = call.get('score', 0)
        status_label = call.get('status_label', 'В ОБРАБОТКЕ')
        manager = call.get('manager', 'Менеджер')
        error_summary = call.get('error_summary', '—')
        recommendation = call.get('recommendation', '—')
        call_id = call.get('id', '')

        # Build clean formatted BBCode comment for Bitrix24 timeline
        if score >= 8:
            badge = f"🟢 {score}/13 • ЭТАЛОН"
        elif score >= 5:
            badge = f"🟡 {score}/13 • ЕСТЬ РИСКИ"
        else:
            badge = f"🔴 {score}/13 • СЛИВ (НЕТ NEXT STEP)"

        comment_text = (
            f"[b]🤖 ИИ-АУДИТ RevOps OS ({badge})[/b]\n"
            f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
            f"⭐ [b]Оценка качества диалога:[/b] {score} из 13 критериев B2B\n"
            f"👤 [b]Менеджер:[/b] {manager}\n"
            f"🎯 [b]Статус контакта:[/b] {status_label}\n"
            f"⚠️ [b]Замечания супервайзера:[/b] {error_summary}\n"
            f"💡 [b]Совет менеджеру:[/b] {recommendation}\n"
            f"──────────\n"
            f"[size=10]ID звонка: {call_id}[/size]"
        )

        # Check existing comments to avoid duplicates
        res_list = b24_post("crm.timeline.comment.list", {"filter": {"ENTITY_ID": deal_num, "ENTITY_TYPE": "deal"}})
        existing_comments = res_list.get("result", []) if res_list else []
        already_has_audit = any("ИИ-АУДИТ" in c.get("COMMENT", "") for c in existing_comments)

        if already_has_audit:
            print(f"Deal {deal_num} already has AI audit comment, skipping duplicate.")
            continue

        # Post comment
        payload = {
            "fields": {
                "ENTITY_ID": deal_num,
                "ENTITY_TYPE": "deal",
                "COMMENT": comment_text
            }
        }
        res_add = b24_post("crm.timeline.comment.add", payload)
        cid = res_add.get("result") if res_add else "Error"
        print(f"Deal {deal_num} -> Added AI Audit comment (ID: {cid}) [{badge}]")

if __name__ == "__main__":
    run()
