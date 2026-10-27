"""
Batch Audio Audit Engine for amoCRM Lead Attachments (Gemini 3.5 Flash-Lite).
1. Downloads mp3 attachments from amoDrive (file_uuid).
2. Sends inline audio to Gemini 3.5 Flash-Lite with 13-criteria B2B rubric.
3. Ingests audited call into PostgreSQL (CallRecording) & WebSocket broadcast.
4. Posts rich analytical summary note back into the amoCRM deal timeline.
"""

import base64
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("batch_audio_audit")

GEMINI_KEY = os.getenv("GEMINI_PROXY_KEY") or os.getenv("GEMINI_API_KEY", "")

AUDIT_SYSTEM_PROMPT = """Ты — официальный ИИ-аудитор Google RevOps Enterprise OS V20.0.
Твоя задача:
1. Внимательно прослушать аудиозапись телефонного разговора и сделать дословную расшифровку (поле transcript) на русском языке.
2. Провести строгий 13-критериальный аудит звонка отдела продаж B2B по шкале cr1..cr13 (1 - зачет, 0 - дефект).

ВАЖНО ДЛЯ ВАЛИДНОСТИ JSON:
Внутри полей текста (transcript, error_summary, ai_recommendation и др.) ЗАПРЕЩЕНО использовать двойные кавычки " — используй одинарные ' или «ёлочки».

КРИТЕРИИ B2B:
cr1: Жесткий Next Step (зафиксированы точная дата и время следующего шага). Если нет точного времени — 0.
cr2: Инициатива диалога (менеджер ведет разговор открытыми вопросами).
cr3: Квалификация ЛПР/ЛВПР (уточнена роль собеседника в принятии решения по бюджету).
cr4: Выявление болей и срочности (выявлена истинная проблема и дедлайн клиента).
cr5: Отработка «Дорого» (аргументация через окупаемость/ценность, без моментальной скидки).
cr6: Отработка «Я подумаю» (вскрыто скрытое возражение клиента).
cr7: Презентация ценности через кейсы (твердые цифры, факты, результаты похожих клиентов).
cr8: Попытка закрытия сделки (предложение договора, выставления счета или слота встречи).
cr9: Регламент приветствия (названо имя, компания, озвучен регламент разговора).
cr10: Чистота речи (нет слов-паразитов, уверенный партнерский тон).
cr11: Слушание клиента (клиент говорит не менее 40% хронометража).
cr12: Фиксация договорённостей (подведение резюме договоренностей в конце встречи).
cr13: Защита маржинальности (скидки не даются просто так без встречных уступок).

ИНСТРУКЦИЯ ПО АНАЛИЗУ:
1. НЕДОЗВОН: Если в аудио тишина, автоответчик, сброс или менее 15 слов — статус "Недозвон", все cr1..cr13 = 0.
2. АНТИСАБОТАЖ: Если звонок без реального диалога с клиентом (длинные гудки, IVR, автоответчик, разговор с коллегой) — call_type = "Имитация (саботаж)", все cr1..cr13 = 0.

ФОРМАТ ВЫВОДА (СТРОГИЙ JSON):
{
  "transcript": "Дословный текст стенограммы разговора...",
  "call_type": "qualification | negotiation | meeting_confirm | cold_call | presentation | Недозвон | Имитация (саботаж)",
  "manager_name": "Имя менеджера",
  "client_name": "Компания или имя собеседника",
  "client_position": "Должность собеседника",
  "client_niche": "Отрасль / категория",
  "cr1": 1, "cr2": 1, "cr3": 1, "cr4": 0, "cr5": 1, "cr6": 1, "cr7": 0, "cr8": 1, "cr9": 1, "cr10": 1, "cr11": 1, "cr12": 1, "cr13": 1,
  "error_summary": "Главные ошибки диалога списком через точку с запятой",
  "ai_recommendation": "Практический совет менеджеру к следующему звонку (что конкретно сделать/сказать клиенту)",
  "amo_short_summary": "2-3 предложения для примечания CRM: с кем говорили, о чем договорились, следующий шаг",
  "zoom_scheduled": false
}"""


def get_tenant_amo_credentials(tenant_id: str = "TNT-002") -> tuple[str, str]:
    from packages.database.session import SessionLocal
    from packages.database.models import Tenant

    with SessionLocal() as db:
        t = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not t or not t.settings:
            raise ValueError(f"Tenant {tenant_id} not found or has no settings")
        domain = t.settings.get("amo_domain", "").replace("https://", "").replace("/", "")
        token = t.settings.get("amo_token", "")
        return domain, token


def fetch_lead_attachments(domain: str, token: str, lead_id: int) -> list[dict[str, Any]]:
    headers = {"Authorization": f"Bearer {token}"}
    url = f"https://{domain}/api/v4/leads/{lead_id}/notes"
    with httpx.Client(timeout=15.0) as client:
        r = client.get(url, headers=headers)
        if r.status_code != 200:
            logger.error(f"Failed to fetch notes for lead {lead_id}: {r.status_code} {r.text}")
            return []
        data = r.json()
        notes = data.get("_embedded", {}).get("notes", [])
        
        attachments = []
        for n in notes:
            if n.get("note_type") == "attachment":
                params = n.get("params", {})
                name = params.get("text") or params.get("original_name") or ""
                if name.lower().endswith(".mp3"):
                    attachments.append({
                        "note_id": n.get("id"),
                        "created_at": n.get("created_at"),
                        "file_uuid": params.get("file_uuid"),
                        "file_name": name,
                    })
        return attachments


def get_download_url(file_uuid: str, token: str) -> str | None:
    headers = {"Authorization": f"Bearer {token}"}
    url = f"https://drive.amocrm.ru/v1.0/files/{file_uuid}"
    with httpx.Client(timeout=15.0) as client:
        r = client.get(url, headers=headers)
        if r.status_code == 200:
            data = r.json()
            return data.get("_links", {}).get("download", {}).get("href")
        logger.error(f"Failed to get download URL for {file_uuid}: {r.status_code} {r.text}")
        return None


def download_audio_bytes(download_url: str) -> bytes | None:
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        r = client.get(download_url)
        if r.status_code == 200:
            return r.content
        logger.error(f"Failed to download audio from {download_url}: {r.status_code}")
        return None


MODELS_CASCADE = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"]


def audit_audio_with_gemini(audio_bytes: bytes, file_name: str) -> dict[str, Any] | None:
    b64_data = base64.b64encode(audio_bytes).decode("utf-8")
    
    payload = {
        "contents": [{
            "parts": [
                {
                    "inline_data": {
                        "mime_type": "audio/mp3",
                        "data": b64_data
                    }
                },
                {
                    "text": AUDIT_SYSTEM_PROMPT
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.1,
            "responseMimeType": "application/json"
        }
    }

    headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"}
    
    for model_name in MODELS_CASCADE:
        url = f"https://gemini-proxy.dmitriyfedotov1908.workers.dev/v1beta/models/{model_name}:generateContent?key={GEMINI_KEY}"
        logger.info(f"Attempting audit with model: {model_name}...")
        try:
            with httpx.Client(timeout=120.0) as client:
                resp = client.post(url, json=payload, headers=headers)
                if resp.status_code == 200:
                    result_json = resp.json()
                    candidates = result_json.get("candidates", [])
                    if candidates:
                        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        try:
                            parsed = json.loads(raw_text)
                            logger.info(f"Successfully audited with {model_name}")
                            return parsed
                        except Exception:
                            m = re.search(r"\{.*\}", raw_text, re.DOTALL)
                            if m:
                                try:
                                    return json.loads(m.group(0))
                                except Exception:
                                    pass
                else:
                    logger.warning(f"Model {model_name} returned {resp.status_code}: {resp.text[:120].strip()}")
                    time.sleep(1.5)
        except Exception as e_req:
            logger.warning(f"Model {model_name} request error: {e_req}")
            time.sleep(1.0)
            
    logger.error(f"All models in cascade failed for {file_name}")
    return None


def post_audit_note_to_amocrm(domain: str, token: str, lead_id: int, file_name: str, audit_data: dict[str, Any], score_out_of_13: int) -> bool:
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    url = f"https://{domain}/api/v4/leads/{lead_id}/notes"
    
    cr1_next_step = "Да (зафиксирован)" if audit_data.get("cr1") == 1 else "Нет (СЛИВ NEXT STEP)"
    status_label = "ЭТАЛОН" if score_out_of_13 >= 10 and audit_data.get("cr1") == 1 else "ТРЕБУЕТ РАЗБОРА"
    pct = round(score_out_of_13 / 13 * 100)
    
    note_text = (
        f"[ИИ-Аудит RevOps] Звонок: {file_name}\n"
        f"Статус: {status_label} | Оценка: {score_out_of_13}/13 ({pct}%)\n"
        f"Next Step (cr1): {cr1_next_step}\n"
        f"Тип: {audit_data.get('call_type', 'presentation')}\n\n"
        f"[Резюме диалога]:\n{audit_data.get('amo_short_summary', 'Разговор проведён')}\n\n"
        f"[Ошибки]:\n{audit_data.get('error_summary', 'Ошибок не выявлено')}\n\n"
        f"[Рекомендация менеджеру]:\n{audit_data.get('ai_recommendation', 'Следовать регламенту диалога')}"
    )

    body = [{
        "note_type": "common",
        "params": {
            "text": note_text
        }
    }]
    
    with httpx.Client(timeout=10.0) as client:
        r = client.post(url, json=body, headers=headers)
        if r.status_code in (200, 201):
            logger.info(f"Successfully posted audit note to amoCRM for {file_name}")
            return True
        logger.warning(f"Failed to post note to amoCRM: {r.status_code} {r.text[:200]}")
        return False


def ingest_to_revops_api(tenant_id: str, lead_id: int, file_name: str, audit_data: dict[str, Any], dur_seconds: int = 180) -> bool:
    cr_keys = [f"cr{i}" for i in range(1, 14)]
    cr_values = [int(audit_data.get(k, 0)) for k in cr_keys]
    score_out_of_13 = sum(cr_values)
    
    is_won = (score_out_of_13 >= 10 and audit_data.get("cr1") == 1)
    status = "won" if is_won else "risk"
    status_label = "ЭТАЛОН" if is_won else ("СЛИВ (НЕТ NEXT STEP)" if audit_data.get("cr1") == 0 else "СЛИВ")
    risk_amount = "0 ₽" if is_won else "500 000 ₽"
    
    dur_str = f"{dur_seconds // 60}:{dur_seconds % 60:02d}"
    call_id = f"CALL-AMO-{lead_id}-{re.sub(r'[^a-zA-Z0-9]', '', file_name)}"
    
    payload = {
        "id": call_id,
        "tenant_id": tenant_id,
        "deal_id": f"AMO-{lead_id}",
        "deal_title": f"Сделка #{lead_id}",
        "client": (
            audit_data.get("client_name")
            if audit_data.get("client_name") and not any(w in audit_data.get("client_name", "").lower() for w in ("оптовая", "электроник"))
            else "Клиент"
        ),
        "manager": audit_data.get("manager_name") or "Дмитрий",
        "stage": "Входящий лид",
        "duration": dur_str,
        "duration_sec": dur_seconds,
        "amount": "150 000 ₽",
        "score": score_out_of_13,
        "status": status,
        "status_label": status_label,
        "risk_amount": risk_amount,
        "next_step": 1 if audit_data.get("cr1") == 1 else 0,
        "cr": cr_values,
        "error_summary": audit_data.get("error_summary", ""),
        "recommendation": audit_data.get("ai_recommendation", ""),
        "transcript": audit_data.get("transcript", ""),
        "sync_to_sheets": False
    }

    admin_key = os.getenv("REVOPS_ADMIN_KEY", "adm_secret_2026_k9x")
    headers = {"X-Admin-Key": admin_key, "Content-Type": "application/json"}
    
    # Try localhost first (inside container or host)
    for host in ["http://127.0.0.1:8000", "http://revops-api:8000"]:
        try:
            with httpx.Client(timeout=10.0) as client:
                r = client.post(f"{host}/api/v1/calls/ingest", json=payload, headers=headers)
                if r.status_code == 200:
                    logger.info(f"Ingested {call_id} into RevOps API ({host})")
                    return True
        except Exception:
            continue
    logger.error(f"Failed to ingest {call_id} into RevOps API")
    return False


def run_pipeline(tenant_id: str = "TNT-002", lead_id: int = 4870417, limit: int | None = None, post_notes: bool = True):
    logger.info(f"=== Starting Batch Audio Audit Pipeline for {tenant_id} (Lead {lead_id}) ===")
    domain, token = get_tenant_amo_credentials(tenant_id)
    
    attachments = fetch_lead_attachments(domain, token, lead_id)
    logger.info(f"Found {len(attachments)} mp3 attachments in lead {lead_id}")
    if limit:
        attachments = attachments[:limit]
        logger.info(f"Limiting to first {limit} attachments for smoke test")
    
    processed = 0
    for idx, att in enumerate(attachments, 1):
        file_name = att["file_name"]
        file_uuid = att["file_uuid"]
        logger.info(f"\n--- [{idx}/{len(attachments)}] Processing {file_name} (UUID: {file_uuid}) ---")
        
        # 1. Get download URL
        dl_url = get_download_url(file_uuid, token)
        if not dl_url:
            continue
        
        # 2. Download audio bytes
        t0 = time.time()
        audio_bytes = download_audio_bytes(dl_url)
        if not audio_bytes:
            continue
        logger.info(f"Downloaded {len(audio_bytes)} bytes in {round(time.time() - t0, 1)}s")
        
        # 3. Audio Audit with Gemini
        logger.info(f"Sending audio to Gemini 3.5 Flash-Lite...")
        t_gem = time.time()
        audit_res = audit_audio_with_gemini(audio_bytes, file_name)
        if not audit_res:
            logger.error(f"Audit failed for {file_name}")
            continue
        
        dur_gem = round(time.time() - t_gem, 1)
        if isinstance(audit_res, list) and len(audit_res) > 0:
            audit_res = audit_res[0]
        if not isinstance(audit_res, dict):
            logger.error(f"Audit result is not a dict for {file_name}: {type(audit_res)}")
            continue

        cr_sum = sum(int(audit_res.get(f"cr{i}", 0)) for i in range(1, 14))
        logger.info(f"Gemini Audit complete in {dur_gem}s: Score {cr_sum}/13 | Next Step (cr1): {audit_res.get('cr1')}")
        logger.info(f"Summary: {audit_res.get('amo_short_summary', '')[:100]}...")
        
        # 4. Ingest into RevOps OS
        ingest_to_revops_api(tenant_id, lead_id, file_name, audit_res, dur_seconds=len(audio_bytes) // 4000)
        
        # 5. Post note to amoCRM (optional)
        if post_notes:
            post_audit_note_to_amocrm(domain, token, lead_id, file_name, audit_res, cr_sum)
        else:
            logger.info("Skipping note posting to amoCRM (--no-notes active)")
        
        processed += 1
        time.sleep(1.0)  # Rate-limit safety
        
    logger.info(f"\n=== Batch Pipeline Finished! Successfully processed {processed}/{len(attachments)} calls ===")


if __name__ == "__main__":
    post_notes_flag = "--no-notes" not in sys.argv
    limit_val = None
    for a in sys.argv[1:]:
        if a.isdigit():
            limit_val = int(a)
    run_pipeline(limit=limit_val, post_notes=post_notes_flag)
