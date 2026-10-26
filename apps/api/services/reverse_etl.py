# -*- coding: utf-8 -*-
"""
Reverse ETL Service for amoCRM and Bitrix24.
Pushes AI audit feedback, scores, and recommendations directly into CRM entities.
Includes interactive link to Web-Cabinet: https://app.ai-rop.ru/
Uses httpx.AsyncClient (preinstalled in revops-api container).
"""
import logging
import httpx
from typing import Dict, Any, Optional

logger = logging.getLogger("revops_reverse_etl")

APP_WEB_BASE = "https://app.ai-rop.ru"


async def sync_to_amocrm(
    tenant_settings: Dict[str, Any],
    deal_id: str,
    audit_data: Dict[str, Any],
    score_info: Dict[str, Any]
) -> bool:
    """Отправка примечания и обновления оценки в сделку amoCRM."""
    if not deal_id:
        return False

    amo_domain = tenant_settings.get("amo_domain") or tenant_settings.get("domain")
    access_token = tenant_settings.get("amo_token") or tenant_settings.get("access_token")

    if not amo_domain or not access_token:
        logger.warning(f"amoCRM credentials missing for deal {deal_id}")
        return False

    note_text = (
        f"🎙️ ИИ-Аудит звонка RevOps Enterprise OS\n"
        f"📊 Общий балл: {score_info['overall_score']}% ({score_info['raw_score']}/13)\n"
        f"⚠️ Ошибки менеджера: {audit_data.get('error_summary', 'Не выявлены')}\n"
        f"💡 Рекомендация РОПа: {audit_data.get('ai_recommendation', 'Продолжать по скрипту')}\n"
        f"📅 Следующий шаг: {audit_data.get('next_action_extracted', 'Не назначен')}\n"
        f"🔗 Интерактивный разбор: {APP_WEB_BASE}/"
    )

    url = f"https://{amo_domain}/api/v4/leads/{deal_id}/notes"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }
    body = [
        {
            "note_type": "common",
            "params": {"text": note_text}
        }
    ]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=body)
            if resp.status_code in [200, 201]:
                logger.info(f"Successfully posted note to amoCRM lead {deal_id}")
                return True
            else:
                logger.warning(f"amoCRM note error ({resp.status_code}): {resp.text}")
                return False
    except Exception as e:
        logger.error(f"Failed to push Reverse ETL to amoCRM: {e}")
        return False


async def sync_to_bitrix24(
    tenant_settings: Dict[str, Any],
    deal_id: str,
    audit_data: Dict[str, Any],
    score_info: Dict[str, Any]
) -> bool:
    """Отправка комментария в таймлайн сделки Битрикс24."""
    if not deal_id:
        return False

    webhook_url = (
        tenant_settings.get("b24_webhook_url")
        or tenant_settings.get("crm_webhook_url")
        or ""
    ).rstrip("/")

    if not webhook_url:
        logger.warning(f"Bitrix24 webhook URL missing for deal {deal_id}")
        return False

    comment_html = (
        f"🎙️ <b>ИИ-Аудит звонка RevOps Enterprise OS</b><br>"
        f"📊 Общий балл: <b>{score_info['overall_score']}%</b> ({score_info['raw_score']}/13)<br>"
        f"⚠️ <b>Ошибки менеджера:</b> {audit_data.get('error_summary', 'Не выявлены')}<br>"
        f"💡 <b>Рекомендация РОПа:</b> {audit_data.get('ai_recommendation', 'Продолжать по скрипту')}<br>"
        f"📅 <b>Следующий шаг:</b> {audit_data.get('next_action_extracted', 'Не назначен')}<br>"
        f"🔗 <a href='{APP_WEB_BASE}/' target='_blank'><b>Открыть аудиозапись и интерактивный транскрипт в Web-кабинете</b></a>"
    )

    url = f"{webhook_url}/crm.timeline.comment.add"
    body = {
        "fields": {
            "ENTITY_ID": deal_id,
            "ENTITY_TYPE": "deal",
            "COMMENT": comment_html
        }
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=body)
            if resp.status_code in [200, 201]:
                logger.info(f"Successfully posted timeline comment to Bitrix24 deal {deal_id}")
                return True
            else:
                logger.warning(f"Bitrix24 timeline comment error ({resp.status_code}): {resp.text}")
                return False
    except Exception as e:
        logger.error(f"Failed to push Reverse ETL to Bitrix24: {e}")
        return False
