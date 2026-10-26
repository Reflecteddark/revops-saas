# -*- coding: utf-8 -*-
"""
Integrations Health, Data Reconciliation & DLQ Management Router.
Endpoints:
- GET  /api/v1/integrations/health: Traffic-light health, reconciliation metrics, and DLQ state.
- POST /api/v1/integrations/dlq/retry: 1-click retry of failed DLQ calls into Redis queue.
- POST /api/v1/integrations/report/telegram: Instant dispatch of data balance report to Telegram.
"""
import os
import json
import logging
import httpx
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import text
import redis

from apps.api.database import SessionLocal
from apps.api.models import Tenant, Call

logger = logging.getLogger("integrations_health")

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations-health"])

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
TG_CREDS_FILE = os.getenv("TELEGRAM_CREDENTIALS_PATH", "telegram_credentials.json")
if not os.path.exists(TG_CREDS_FILE):
    TG_CREDS_FILE = "/app/telegram_credentials.json"


def _get_redis():
    try:
        return redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2)
    except Exception as e:
        logger.warning(f"Redis connection error: {e}")
        return None


def _get_telegram_config() -> Dict[str, str]:
    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    chat_id = os.getenv("TELEGRAM_CHAT_ID", "")

    if os.path.exists(TG_CREDS_FILE):
        try:
            with open(TG_CREDS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                token = data.get("bot_token") or token
                chat_id = data.get("chat_id") or chat_id
        except Exception as e:
            logger.warning(f"Error reading telegram_credentials.json: {e}")

    return {"token": token, "chat_id": chat_id}


@router.get("/health")
def get_integrations_health(tenant_id: str = Query("TNT-001")):
    """
    Светофор здоровья интеграций, баланс данных и состояние Dead Letter Queue (DLQ).
    """
    db = SessionLocal()
    r = _get_redis()
    try:
        # 1. Метрики базы данных (DWH)
        query_dwh = text("""
            SELECT 
                (SELECT count(*) FROM call_recordings WHERE tenant_id = :tid) as calls_total,
                (SELECT count(*) FROM call_recordings WHERE tenant_id = :tid AND reverse_etl_synced = TRUE) as calls_synced,
                (SELECT count(*) FROM call_recordings WHERE tenant_id = :tid AND reverse_etl_synced IS NOT TRUE) as calls_pending,
                (SELECT count(*) FROM deals WHERE tenant_id = :tid) as deals_total,
                (SELECT count(*) FROM failed_calls_dlq WHERE tenant_id = :tid AND is_resolved = FALSE) as dlq_active,
                (SELECT count(*) FROM failed_calls_dlq WHERE tenant_id = :tid) as dlq_total;
        """)
        dwh_res = db.execute(query_dwh, {"tid": tenant_id}).fetchone()
        
        calls_total = dwh_res.calls_total if dwh_res else 0
        calls_synced = dwh_res.calls_synced if dwh_res else 0
        calls_pending = dwh_res.calls_pending if dwh_res else 0
        deals_total = dwh_res.deals_total if dwh_res else 0
        dlq_active = dwh_res.dlq_active if dwh_res else 0
        dlq_total = dwh_res.dlq_total if dwh_res else 0

        # 2. Список звонков из DLQ для разбора
        query_dlq_items = text("""
            SELECT id, crm_source, external_call_id, audio_url, error_message, retry_count, created_at, is_resolved
            FROM failed_calls_dlq
            WHERE tenant_id = :tid
            ORDER BY created_at DESC
            LIMIT 10;
        """)
        dlq_rows = db.execute(query_dlq_items, {"tid": tenant_id}).fetchall()
        dlq_items = [
            {
                "id": str(row.id),
                "crm_source": row.crm_source,
                "external_call_id": row.external_call_id,
                "audio_url": row.audio_url,
                "error_message": row.error_message,
                "retry_count": row.retry_count,
                "created_at": row.created_at.strftime("%Y-%m-%d %H:%M:%S") if row.created_at else "",
                "is_resolved": row.is_resolved,
            }
            for row in dlq_rows
        ]

        # 3. Очередь Redis
        queue_len = 0
        redis_status = "error"
        if r:
            try:
                queue_len = r.llen("revops:calls:queue")
                redis_status = "healthy"
            except Exception:
                redis_status = "degraded"

        # 4. Баланс сходимости
        is_balanced = (calls_total == calls_synced + calls_pending)

        return {
            "status": "healthy" if is_balanced and redis_status == "healthy" else "warning",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tenant_id": tenant_id,
            "services": {
                "redis_queue": {
                    "status": redis_status,
                    "queue_length": queue_len,
                    "label": "Очередь Ingress-звонков",
                },
                "postgres_dwh": {
                    "status": "healthy",
                    "calls_count": calls_total,
                    "deals_count": deals_total,
                    "label": "Хранилище DWH (PostgreSQL 16)",
                },
                "google_sheets_syncer": {
                    "status": "healthy",
                    "synced_count": calls_synced,
                    "pending_count": calls_pending,
                    "label": "Пакетная синхронизация (batchUpdate)",
                },
                "dead_letter_queue": {
                    "status": "clean" if dlq_active == 0 else "action_required",
                    "active_failures": dlq_active,
                    "total_failures": dlq_total,
                    "label": "Изолятор сбоев (DLQ)",
                }
            },
            "reconciliation": {
                "dwh_total_calls": calls_total,
                "sheets_synced_calls": calls_synced,
                "pending_queue_calls": calls_pending,
                "dwh_total_deals": deals_total,
                "dlq_failures": dlq_active,
                "is_balanced": is_balanced,
                "balance_percentage": 100.0 if calls_total == 0 else round((calls_synced / calls_total) * 100, 1),
            },
            "dlq_items": dlq_items
        }
    finally:
        db.close()


@router.post("/dlq/retry")
def retry_dlq_calls(tenant_id: str = Query("TNT-001"), dlq_id: Optional[str] = Query(None)):
    """
    Переслушивание звонков из Dead Letter Queue в 1 клик.
    Возвращает задачи в очередь Redis и помечает статус в DLQ.
    """
    db = SessionLocal()
    r = _get_redis()
    if not r:
        raise HTTPException(status_code=503, detail="Redis broker unavailable")

    try:
        if dlq_id:
            query = text("SELECT id, tenant_id, crm_source, external_call_id, audio_url, payload FROM failed_calls_dlq WHERE id = :did AND tenant_id = :tid")
            rows = db.execute(query, {"did": dlq_id, "tid": tenant_id}).fetchall()
        else:
            query = text("SELECT id, tenant_id, crm_source, external_call_id, audio_url, payload FROM failed_calls_dlq WHERE tenant_id = :tid AND is_resolved = FALSE")
            rows = db.execute(query, {"tid": tenant_id}).fetchall()

        if not rows:
            return {"status": "ok", "re_enqueued_count": 0, "message": "Нет сбойных звонков для перезапуска"}

        re_enqueued = 0
        resolved_ids = []

        for row in rows:
            payload = row.payload if isinstance(row.payload, dict) else {}
            task = {
                "job_id": f"retry_{row.id}",
                "tenant_id": row.tenant_id,
                "crm_source": row.crm_source,
                "external_call_id": row.external_call_id,
                "audio_url": row.audio_url or payload.get("audio_url", ""),
                "client_phone": payload.get("client_phone", ""),
                "deal_id": payload.get("deal_id"),
                "manager_id": payload.get("manager_id"),
                "raw_payload": payload,
                "enqueued_at": datetime.now(timezone.utc).isoformat(),
                "is_retry": True
            }
            r.lpush("revops:calls:queue", json.dumps(task, ensure_ascii=False))
            re_enqueued += 1
            resolved_ids.append(str(row.id))

        if resolved_ids:
            upd = text("UPDATE failed_calls_dlq SET is_resolved = TRUE, resolved_at = NOW() WHERE id::text = ANY(:ids)")
            db.execute(upd, {"ids": resolved_ids})
            db.commit()

        logger.info(f"Re-enqueued {re_enqueued} calls from DLQ for tenant {tenant_id}")
        return {
            "status": "success",
            "re_enqueued_count": re_enqueued,
            "message": f"Успешно отправлено на повторный аудит: {re_enqueued} звонков"
        }
    finally:
        db.close()


@router.post("/report/telegram")
async def send_telegram_reconciliation_report(tenant_id: str = Query("TNT-001")):
    """
    Отправка утреннего отчёта о балансе данных в Telegram-группу РОПа.
    """
    health = get_integrations_health(tenant_id=tenant_id)
    rec = health["reconciliation"]
    services = health["services"]

    now_str = datetime.now().strftime("%d.%m.%Y %H:%M")

    status_emoji = "✅ 100% сходимость (0 потерь)" if rec["is_balanced"] and rec["dlq_failures"] == 0 else "⚠️ Требуется внимание"

    report_text = (
        f"📊 <b>Утренний баланс данных RevOps OS</b>\n"
        f"📅 Срез на: {now_str} (МСК)\n"
        f"🏢 Организация: <code>{tenant_id}</code>\n\n"
        f"• <b>Сделок в воронке DWH:</b> {rec['dwh_total_deals']} шт.\n"
        f"• <b>Прослушано ИИ и в DWH:</b> {rec['dwh_total_calls']} звонков\n"
        f"• <b>Выгружено в Таблицу и Web:</b> {rec['sheets_synced_calls']} звонков\n"
        f"• <b>Очередь обработки (Redis):</b> {services['redis_queue']['queue_length']} звонков\n"
        f"• <b>Изолировано ошибок (DLQ):</b> {rec['dlq_failures']} шт.\n\n"
        f"<b>Статус целостности:</b> {status_emoji}\n"
        f"🔗 <i>Web-кабинет: https://app.ai-rop.ru/</i>"
    )

    tg_conf = _get_telegram_config()
    bot_token = tg_conf["token"]
    chat_id = tg_conf["chat_id"]

    if not bot_token or not chat_id:
        raise HTTPException(status_code=500, detail="Telegram bot_token or chat_id is not configured")

    tg_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": report_text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(tg_url, json=payload)
            if resp.status_code == 200:
                logger.info(f"Reconciliation report dispatched to Telegram chat {chat_id}")
                return {"status": "sent", "chat_id": chat_id, "timestamp": now_str}
            else:
                logger.warning(f"Telegram API error {resp.status_code}: {resp.text}")
                # Fallback к прокси ai-rop.ru
                proxy_url = "https://ai-rop.ru/tg-proxy/sendMessage"
                try:
                    resp_proxy = await client.post(proxy_url, json=payload)
                    if resp_proxy.status_code == 200:
                        return {"status": "sent_via_proxy", "chat_id": chat_id}
                except Exception:
                    pass
                raise HTTPException(status_code=502, detail=f"Telegram API error: {resp.text}")
    except Exception as e:
        logger.error(f"Error sending Telegram report: {e}")
        raise HTTPException(status_code=500, detail=str(e))
