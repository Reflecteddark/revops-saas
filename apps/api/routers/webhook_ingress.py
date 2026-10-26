# -*- coding: utf-8 -*-
"""
FastAPI Webhook Ingress Gateway for amoCRM and Bitrix24.
Latency target: < 30ms response time.
Features:
- Cryptographic idempotency checking via Redis SETNX.
- Decoupled ingestion: immediate HTTP 200 OK, background queueing.
- Multi-tenant tenant_id routing.
"""
import os
import time
import json
import uuid
import hashlib
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, status, Header, Depends
import redis

logger = logging.getLogger("revops_ingress")

router = APIRouter(prefix="/api/v1/webhooks", tags=["webhooks-ingress"])

REDIS_URL = os.getenv("REDIS_URL", "redis://revops-redis:6379/0")
try:
    redis_client = redis.Redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2)
except Exception as e:
    logger.warning(f"Failed to connect to Redis at {REDIS_URL}: {e}")
    redis_client = None


def _get_redis():
    return redis_client


def _make_idempotency_key(tenant_id: str, crm_source: str, call_id: str) -> str:
    raw = f"{tenant_id.strip()}:{crm_source.strip().lower()}:{call_id.strip()}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


@router.post("/amocrm/{tenant_id}")
async def amocrm_call_webhook(
    tenant_id: str,
    request: Request,
):
    """
    Прием вебхука завершения звонка из amoCRM или интеграции телефонии (Mango, UIS, Sipuni).
    Возвращает HTTP 200 OK за < 30 мс.
    """
    t0 = time.perf_counter()
    content_type = request.headers.get("content-type", "")
    
    try:
        if "application/json" in content_type:
            payload = await request.json()
        else:
            form = await request.form()
            payload = dict(form)
    except Exception as e:
        logger.error(f"Error parsing amoCRM payload: {e}")
        payload = {}

    # Извлечение ключевых идентификаторов звонка
    call_id = (
        payload.get("call_id")
        or payload.get("id")
        or payload.get("call[id]")
        or payload.get("leads[status][0][id]")
        or str(uuid.uuid4())
    )
    audio_url = (
        payload.get("audio_url")
        or payload.get("record_link")
        or payload.get("link")
        or payload.get("call[link]")
        or ""
    )
    client_phone = (
        payload.get("phone")
        or payload.get("client_phone")
        or payload.get("caller_id")
        or ""
    )
    deal_id = (
        payload.get("deal_id")
        or payload.get("lead_id")
        or payload.get("leads[status][0][id]")
        or ""
    )
    manager_id = (
        payload.get("manager_id")
        or payload.get("responsible_user_id")
        or ""
    )

    idempotency_key = _make_idempotency_key(tenant_id, "amocrm", str(call_id))

    # 1. Проверка идемпотентности в Redis
    r = _get_redis()
    if r:
        try:
            # Атомарный SETNX на 24 часа (86400 сек)
            is_new = r.set(f"idempotency:{idempotency_key}", "PROCESSING", nx=True, ex=86400)
            if not is_new:
                existing_state = r.get(f"idempotency:{idempotency_key}") or "PROCESSING"
                elapsed = time.perf_counter() - t0
                return {
                    "status": "already_received",
                    "idempotency_key": idempotency_key,
                    "state": existing_state,
                    "latency_ms": round(elapsed * 1000, 2),
                }
        except Exception as e:
            logger.warning(f"Redis idempotency check warning: {e}")

    # 2. Формирование задачи для очереди
    job_payload = {
        "job_id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "crm_source": "amocrm",
        "external_call_id": str(call_id),
        "idempotency_key": idempotency_key,
        "audio_url": audio_url,
        "client_phone": client_phone,
        "deal_id": str(deal_id) if deal_id else None,
        "manager_id": str(manager_id) if manager_id else None,
        "raw_payload": payload,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    }

    # 3. PUSH задачи в брокер Redis
    if r:
        try:
            r.lpush("revops:calls:queue", json.dumps(job_payload, ensure_ascii=False))
        except Exception as e:
            logger.error(f"Failed to push task to Redis queue: {e}")

    elapsed = time.perf_counter() - t0
    return {
        "status": "queued",
        "job_id": job_payload["job_id"],
        "idempotency_key": idempotency_key,
        "latency_ms": round(elapsed * 1000, 2),
    }


@router.post("/bitrix24/{tenant_id}")
async def bitrix24_call_webhook(
    tenant_id: str,
    request: Request,
):
    """
    Прием вебхука завершения звонка из Битрикс24 (ONVOXIMPLANTCALLRECORD / Telephony event).
    Возвращает HTTP 200 OK за < 30 мс.
    """
    t0 = time.perf_counter()
    content_type = request.headers.get("content-type", "")
    
    try:
        if "application/json" in content_type:
            payload = await request.json()
        else:
            form = await request.form()
            payload = dict(form)
    except Exception as e:
        logger.error(f"Error parsing Bitrix24 payload: {e}")
        payload = {}

    data_block = payload.get("data", {})
    if isinstance(data_block, str):
        try:
            data_block = json.loads(data_block)
        except Exception:
            data_block = {}

    call_id = (
        payload.get("CALL_ID")
        or data_block.get("CALL_ID")
        or payload.get("call_id")
        or payload.get("ID")
        or str(uuid.uuid4())
    )
    audio_url = (
        payload.get("RECORD_URL")
        or data_block.get("RECORD_URL")
        or payload.get("audio_url")
        or ""
    )
    client_phone = (
        payload.get("PHONE_NUMBER")
        or data_block.get("PHONE_NUMBER")
        or payload.get("CALLER_ID")
        or ""
    )
    deal_id = (
        payload.get("CRM_ENTITY_ID")
        or data_block.get("CRM_ENTITY_ID")
        or payload.get("deal_id")
        or ""
    )
    manager_id = (
        payload.get("PORTAL_USER_ID")
        or data_block.get("PORTAL_USER_ID")
        or ""
    )

    idempotency_key = _make_idempotency_key(tenant_id, "bitrix24", str(call_id))

    r = _get_redis()
    if r:
        try:
            is_new = r.set(f"idempotency:{idempotency_key}", "PROCESSING", nx=True, ex=86400)
            if not is_new:
                existing_state = r.get(f"idempotency:{idempotency_key}") or "PROCESSING"
                elapsed = time.perf_counter() - t0
                return {
                    "status": "already_received",
                    "idempotency_key": idempotency_key,
                    "state": existing_state,
                    "latency_ms": round(elapsed * 1000, 2),
                }
        except Exception as e:
            logger.warning(f"Redis idempotency check warning: {e}")

    job_payload = {
        "job_id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "crm_source": "bitrix24",
        "external_call_id": str(call_id),
        "idempotency_key": idempotency_key,
        "audio_url": audio_url,
        "client_phone": client_phone,
        "deal_id": str(deal_id) if deal_id else None,
        "manager_id": str(manager_id) if manager_id else None,
        "raw_payload": payload,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    }

    if r:
        try:
            r.lpush("revops:calls:queue", json.dumps(job_payload, ensure_ascii=False))
        except Exception as e:
            logger.error(f"Failed to push task to Redis queue: {e}")

    elapsed = time.perf_counter() - t0
    return {
        "status": "queued",
        "job_id": job_payload["job_id"],
        "idempotency_key": idempotency_key,
        "latency_ms": round(elapsed * 1000, 2),
    }


@router.post("/generic/{tenant_id}")
async def generic_call_webhook(
    tenant_id: str,
    request: Request,
):
    """Универсальный эндпоинт для телефонии (Mango, UIS, Asterisk, Zadarma)."""
    t0 = time.perf_counter()
    payload = await request.json()
    call_id = payload.get("call_id") or str(uuid.uuid4())
    audio_url = payload.get("audio_url", "")
    idempotency_key = _make_idempotency_key(tenant_id, "generic", str(call_id))

    r = _get_redis()
    if r:
        is_new = r.set(f"idempotency:{idempotency_key}", "PROCESSING", nx=True, ex=86400)
        if not is_new:
            return {"status": "already_received", "idempotency_key": idempotency_key}

    job_payload = {
        "job_id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "crm_source": "generic",
        "external_call_id": str(call_id),
        "idempotency_key": idempotency_key,
        "audio_url": audio_url,
        "client_phone": payload.get("client_phone", ""),
        "deal_id": payload.get("deal_id"),
        "manager_id": payload.get("manager_id"),
        "raw_payload": payload,
        "enqueued_at": datetime.now(timezone.utc).isoformat(),
    }

    if r:
        r.lpush("revops:calls:queue", json.dumps(job_payload, ensure_ascii=False))

    elapsed = time.perf_counter() - t0
    return {
        "status": "queued",
        "job_id": job_payload["job_id"],
        "idempotency_key": idempotency_key,
        "latency_ms": round(elapsed * 1000, 2),
    }
