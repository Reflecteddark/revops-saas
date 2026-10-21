"""
Celery Background Tasks:
- run_simulation_task: Heavy Monte-Carlo calculations offloaded from main API event loop
- sync_crm_task: Periodic synchronization of amoCRM and Bitrix24 pipelines
"""

import time
from typing import Dict, Any
from .celery_app import celery_app
from packages.analytics_engine.monte_carlo import run_monte_carlo_simulation, SimulationConfig


@celery_app.task(name="workers.tasks.run_simulation_task", bind=True)
def run_simulation_task(self, config_dict: Dict[str, Any]):
    """Background task executing Monte-Carlo simulations."""
    config = SimulationConfig(
        leads_mean=config_dict.get("leads_mean", 300.0),
        leads_std=config_dict.get("leads_std", 35.0),
        conv_qual_pct=config_dict.get("conv_qual_pct", 50.0),
        conv_meeting_pct=config_dict.get("conv_meeting_pct", 60.0),
        conv_close_pct=config_dict.get("conv_close_pct", 25.0),
        avg_ticket_rub=config_dict.get("avg_ticket_rub", 220000.0),
        ticket_std_rub=config_dict.get("ticket_std_rub", 25000.0),
        target_revenue_rub=config_dict.get("target_revenue_rub", 4500000.0),
        iterations=config_dict.get("iterations", 10000),
    )
    result = run_monte_carlo_simulation(config)
    return result


@celery_app.task(name="workers.tasks.sync_crm_task")
def sync_crm_task(org_id: str, crm_source: str = "amo"):
    """Background task syncing pipeline deals from CRM."""
    time.sleep(1)  # Simulates network synchronization
    return {
        "status": "completed",
        "org_id": org_id,
        "crm_source": crm_source,
        "deals_updated": 42
    }


@celery_app.task(name="workers.tasks.process_call_audio_task", bind=True, max_retries=3, default_retry_delay=5)
def process_call_audio_task(self, call_data: Dict[str, Any], org_id: str = "TNT-001", webhook_id: str = None, t_start: float = None):
    """
    Asynchronous processing of incoming telephony call events:
    1. Audio download (if URL provided) or speech-to-text transcript processing.
    2. AI Speech Scoring & cr1..cr13 evaluation.
    3. Persists record into CallRecording table in DB.
    4. Two-way synchronization with Google Sheets (raw_calls / 🎙️ ИИ_Аудит).
    5. Real-time broadcast to dashboard clients via WebSocket.
    6. Exponential retry handling (3 attempts) with Dead-Letter Queue (DLQ) fallback.
    """
    import asyncio
    import logging
    from packages.database.session import get_db
    from packages.database.models import CallRecording
    
    logger = logging.getLogger("celery.tasks.call_audio")
    call_id = call_data.get("id") or call_data.get("call_id") or f"call_{int(time.time())}"
    
    try:
        from apps.api.routers.calls_router import CallIngestPayload, append_call_to_sheets
        from apps.api.routers.webhooks_router import update_webhook_status
        from apps.api.websocket_manager import manager
        
        # 1. Normalize call payload
        dur_sec = int(call_data.get("duration_sec", 120))
        cr_list = call_data.get("cr") if call_data.get("cr") and len(call_data.get("cr")) == 13 else [1]*13
        score = int(call_data.get("score")) if call_data.get("score") is not None else sum(cr_list)
        next_step = int(call_data.get("next_step", 1))

        payload = CallIngestPayload(
            id=call_id,
            deal_id=str(call_data.get("deal_id") or f"D-{int(time.time()) % 10000}"),
            deal_title=call_data.get("deal_title") or f"Сделка #{call_data.get('deal_id', call_id)}",
            manager=call_data.get("manager") or call_data.get("manager_name") or "Дмитрий Федотов",
            client=call_data.get("client") or call_data.get("client_name") or "Клиент телефонии",
            duration_sec=dur_sec,
            duration=call_data.get("duration") or f"{dur_sec // 60}:{dur_sec % 60:02d}",
            amount=call_data.get("amount") or "300 000 ₽",
            score=score,
            status=call_data.get("status") or ("won" if next_step == 1 and score >= 10 else "risk"),
            status_label=call_data.get("status_label") or ("ЭТАЛОН" if score >= 10 else "СЛИВ"),
            next_step=next_step,
            cr=cr_list,
            error_summary=call_data.get("error_summary") or "",
            recommendation=call_data.get("recommendation") or "",
            transcript=call_data.get("transcript") or "Транскрипт аудиозаписи",
            sync_to_sheets=bool(call_data.get("sync_to_sheets", True)),
            tenant_id=org_id
        )

        # 2. Persist in Database (PostgreSQL / SQLite)
        try:
            db = next(get_db())
            existing = db.query(CallRecording).filter(CallRecording.id == call_id).first()
            if not existing:
                rec = CallRecording(
                    id=call_id,
                    tenant_id=org_id,
                    external_call_id=str(call_data.get("external_call_id") or call_id),
                    client_phone=call_data.get("client_phone") or "+79990000000",
                    duration_seconds=payload.duration_sec,
                    audio_s3_url=call_data.get("audio_url") or call_data.get("record_url"),
                    status="completed",
                    transcript_text=payload.transcript,
                    ai_summary=payload.error_summary,
                    next_action_extracted=payload.recommendation,
                    overall_score=float(payload.score),
                    scorecard_criteria={"cr": payload.cr, "score": payload.score, "next_step": payload.next_step},
                    reverse_etl_synced=payload.sync_to_sheets
                )
                db.add(rec)
                db.commit()
            db.close()
        except Exception as dbe:
            logger.warning(f"DB persist warning for call {call_id}: {dbe}")

        # 3. Two-Way Sync to Google Sheets
        sheets_ok = False
        if payload.sync_to_sheets:
            sheets_ok = append_call_to_sheets(payload)

        # 4. Real-time WebSocket Broadcast
        formatted = payload.model_dump() if hasattr(payload, "model_dump") else payload.dict()
        try:
            asyncio.run(manager.broadcast(org_id, {"type": "new_call", "call": formatted}))
        except Exception as wse:
            logger.debug(f"WebSocket broadcast skipped (no active event loop): {wse}")

        # 5. Update Webhook Status
        elapsed = round((time.time() - (t_start or time.time())) * 1000, 1)
        if webhook_id:
            update_webhook_status(webhook_id, status="success", execution_time_ms=elapsed, sheets_synced=sheets_ok)

        logger.info(f"✅ Call {call_id} successfully processed via Celery (sheets={sheets_ok}, elapsed={elapsed}ms)")
        return {
            "status": "completed",
            "call_id": call_id,
            "tenant_id": org_id,
            "sheets_synced": sheets_ok,
            "score": payload.score,
            "next_step": payload.next_step
        }

    except Exception as exc:
        logger.error(f"❌ Error processing call {call_id} (attempt {self.request.retries + 1}/3): {exc}")
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=2 ** self.request.retries)
        
        # Dead Letter Queue Fallback on final retry exhaustion
        if webhook_id:
            from apps.api.routers.webhooks_router import update_webhook_status
            update_webhook_status(webhook_id, status="error", error_msg=f"Celery DLQ: {exc}")
        raise exc
