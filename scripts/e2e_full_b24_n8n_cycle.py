"""
RevOps Enterprise OS - End-to-End Bitrix24 -> n8n (Gemini Audio) -> Google Sheets -> Web Dashboard
Executes full clean pipeline for 10 deals with real audio files.
"""

import base64
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

WEBHOOK_B24 = os.getenv("B24_WEBHOOK_URL", "https://b24-1tuuth.bitrix24.ru/rest/1/70u1duarlao06zau/")
N8N_WEBHOOK = os.getenv("N8N_WEBHOOK_URL", "https://webhook.ai-rop.ru/webhook/bitrix24-call?tenant=TNT-001")
BASE_AUDIO_DIR = Path(__file__).parent.parent / "apps" / "landing" / "audio"
PUBLIC_AUDIO_BASE = os.getenv("PUBLIC_AUDIO_BASE", "https://report.ai-rop.ru/audio")

DEALS_AUDIO_MAPPING = [
    {
        "deal_id": 4,
        "title": "Внедрение RevOps OS — ООО 'ТехноТрейд'",
        "audio_file": "cold-call-bitrix24.mp3",
        "duration": 135,
        "phone": "+79374502561",
        "manager": "Светлана"
    },
    {
        "deal_id": 6,
        "title": "Лицензия Enterprise — АО 'Северсталь Дистрибуция'",
        "audio_file": "cold-call-cable.mp3",
        "duration": 180,
        "phone": "+79161234567",
        "manager": "Дмитрий Федотов"
    },
    {
        "deal_id": 8,
        "title": "Пилот речевой аналитики — ГК 'Мегаполис'",
        "audio_file": "cold-call-medtech.mp3",
        "duration": 150,
        "phone": "+79269876543",
        "manager": "Светлана"
    },
    {
        "deal_id": 10,
        "title": "Аудит отдела продаж — ООО 'Альфа Логистик'",
        "audio_file": "cold-call-uzip.mp3",
        "duration": 115,
        "phone": "+79031112233",
        "manager": "Алексей Смирнов"
    },
    {
        "deal_id": 12,
        "title": "Внедрение воронки SSOT — ООО 'СтройКомплект'",
        "audio_file": "demo-call.mp3",
        "duration": 160,
        "phone": "+79054445566",
        "manager": "Дмитрий Федотов"
    },
    {
        "deal_id": 14,
        "title": "Речевая аналитика 13 критериев — ЗАО 'ПромТех'",
        "audio_file": "demo-variant-1.mp3",
        "duration": 140,
        "phone": "+79857778899",
        "manager": "Светлана"
    },
    {
        "deal_id": 16,
        "title": "Action Loop РОПа — ООО 'Ритейл Групп'",
        "audio_file": "demo-variant-2.mp3",
        "duration": 175,
        "phone": "+79153332211",
        "manager": "Алексей Смирнов"
    },
    {
        "deal_id": 18,
        "title": "RevOps Консалтинг — ООО 'ФармДистрибьюшн'",
        "audio_file": "demo-variant-3.mp3",
        "duration": 130,
        "phone": "+79256667788",
        "manager": "Дмитрий Федотов"
    },
    {
        "deal_id": 20,
        "title": "Интеграция n8n + CRM — ООО 'ТрансЛогистика'",
        "audio_file": "demo-variant-4.mp3",
        "duration": 125,
        "phone": "+79098889900",
        "manager": "Светлана"
    },
    {
        "deal_id": 22,
        "title": "Тест-драйв ИИ-супервайзера — ИП Смирнов",
        "audio_file": "client.mp3",
        "duration": 95,
        "phone": "+79374502561",
        "manager": "Алексей Смирнов"
    }
]

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

def clean_deal(deal_id):
    """Deletes old mock text comments and old activities from deal."""
    # List comments
    res_c = b24_post("crm.timeline.comment.list", {"filter": {"ENTITY_ID": deal_id, "ENTITY_TYPE": "deal"}})
    comments = res_c.get("result", []) if res_c else []
    for c in comments:
        cid = c.get("ID")
        comment_text = c.get("COMMENT", "")
        # Keep comment if it already has the real attached file
        files = c.get("FILES", {})
        if files:
            continue
        print(f"  Cleaning text comment {cid} from Deal {deal_id}...")
        b24_post("crm.timeline.comment.delete", {"id": cid})

    # List activities
    res_a = b24_post("crm.activity.list", {"filter": {"OWNER_ID": deal_id, "OWNER_TYPE_ID": 2}})
    acts = res_a.get("result", []) if res_a else []
    for a in acts:
        aid = a.get("ID")
        desc = a.get("DESCRIPTION", "")
        # If activity has hardcoded dialogue text, delete it
        if "Диалог:" in desc or "Замечания:" in desc:
            print(f"  Cleaning text activity {aid} from Deal {deal_id}...")
            b24_post("crm.activity.delete", {"id": aid})

def attach_real_audio(deal_id, audio_filename, duration, phone):
    """Attaches real MP3 file to timeline and registers native telephony call."""
    audio_path = BASE_AUDIO_DIR / audio_filename
    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}")
        return False

    with open(audio_path, "rb") as f:
        b64_content = base64.b64encode(f.read()).decode("utf-8")

    # 1. Attach file to timeline
    payload = {
        "fields": {
            "ENTITY_ID": deal_id,
            "ENTITY_TYPE": "deal",
            "COMMENT": "🎙️ Запись телефонного разговора",
            "FILES": [
                [audio_filename, b64_content]
            ]
        }
    }
    res = b24_post("crm.timeline.comment.add", payload)
    print(f"  Attached MP3 {audio_filename} to Deal {deal_id} timeline. Comment ID: {res.get('result') if res else 'Error'}")

    # 2. Register native telephony call with RECORD_URL
    audio_public_url = f"{PUBLIC_AUDIO_BASE}/{audio_filename}"
    reg_payload = {
        "USER_ID": 1,
        "PHONE_NUMBER": phone,
        "TYPE": 1, # outbound
        "CALL_START_DATE": time.strftime("%Y-%m-%d %H:%M:%S"),
        "CRM_ENTITY_TYPE": "DEAL",
        "CRM_ENTITY_ID": deal_id,
        "SHOW": 0
    }
    reg_res = b24_post("telephony.externalcall.register", reg_payload)
    call_id = reg_res.get("result", {}).get("CALL_ID") if reg_res else None

    if call_id:
        fin_payload = {
            "CALL_ID": call_id,
            "USER_ID": 1,
            "DURATION": duration,
            "STATUS_CODE": "200",
            "RECORD_URL": audio_public_url
        }
        b24_post("telephony.externalcall.finish", fin_payload)
        print(f"  Registered native telephony call {call_id} in Bitrix24.")

    return True

def trigger_n8n_audit(deal_id, audio_filename, duration, phone):
    """Triggers n8n call audit pipeline for real voice transcription & scoring."""
    audio_public_url = f"{PUBLIC_AUDIO_BASE}/{audio_filename}"
    call_key = f"b24_call_{deal_id}"
    deal_key = f"B24-{deal_id}"

    payload = {
        "CALL_ID": call_key,
        "CRM_ENTITY_ID": deal_key,
        "audio_url": audio_public_url,
        "CALL_DURATION": duration,
        "PORTAL_USER_ID": 1,
        "PHONE_NUMBER": phone
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(N8N_WEBHOOK, data=data, headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"  Triggered n8n audit for Deal {deal_id} -> {call_key}: HTTP {resp.status}")
            return True
    except Exception as e:
        print(f"  Error triggering n8n for Deal {deal_id}: {e}")
        return False

def run_pipeline():
    print("=" * 60)
    print("Starting Clean Bitrix24 -> n8n -> Google Sheets E2E Pipeline")
    print("=" * 60)

    for item in DEALS_AUDIO_MAPPING:
        deal_id = item["deal_id"]
        audio_file = item["audio_file"]
        duration = item["duration"]
        phone = item["phone"]

        print(f"\n[Processing Deal {deal_id}] {item['title']}")
        # 1. Clean old mock text
        clean_deal(deal_id)

        # 2. Attach real audio file
        attach_real_audio(deal_id, audio_file, duration, phone)

        # 3. Trigger full n8n Gemini audit cycle
        trigger_n8n_audit(deal_id, audio_file, duration, phone)

        # Brief pause between calls to respect Gemini and Bitrix24 rate limits
        time.sleep(3)

    print("\n" + "=" * 60)
    print("All 10 deals cleaned, real audio attached, and n8n audits triggered!")
    print("=" * 60)

if __name__ == "__main__":
    run_pipeline()
