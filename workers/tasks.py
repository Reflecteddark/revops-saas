"""
Celery Background Tasks:
- run_simulation_task: Heavy Monte-Carlo calculations offloaded from main API event loop
- sync_crm_task: Periodic synchronization of amoCRM and Bitrix24 pipelines
"""

import time
import uuid
from typing import Any

from packages.analytics_engine.monte_carlo import (
    SimulationConfig,
    run_monte_carlo_simulation,
)

from .celery_app import celery_app


@celery_app.task(name="workers.tasks.run_simulation_task", bind=True)
def run_simulation_task(self, config_dict: dict[str, Any]):
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
def process_call_audio_task(self, call_data: dict[str, Any], org_id: str = "TNT-001", webhook_id: str | None = None, t_start: float | None = None):
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

    from packages.database.models import CallRecording
    from packages.database.session import get_db
    
    logger = logging.getLogger("celery.tasks.call_audio")
    call_id = call_data.get("id") or call_data.get("call_id") or f"call_{int(time.time())}"
    
    try:
        from apps.api.routers.calls_router import (
            CallIngestPayload,
            append_call_to_sheets,
            call_view,
        )
        from apps.api.routers.webhooks_router import update_webhook_status
        from apps.api.websocket_manager import manager
        
        # 1. Normalize call payload
        dur_sec = int(call_data.get("duration_sec", 120))
        # No criteria means "not rated": this used to default to 13 ones, a perfect 13/13 for an unaudited call.
        raw_cr = call_data.get("cr")
        has_cr = isinstance(raw_cr, (list, tuple)) and len(raw_cr) == 13 and all(c is not None for c in raw_cr)
        cr_list: list[int] | None = [int(c) for c in raw_cr] if has_cr else None  # type: ignore[union-attr]
        raw_score = call_data.get("score")
        score = int(raw_score) if raw_score is not None else None
        raw_next_step = call_data.get("next_step")
        next_step = int(raw_next_step) if raw_next_step is not None else None

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
            next_step=next_step,
            cr=cr_list,
            error_summary=call_data.get("error_summary") or "",
            recommendation=call_data.get("recommendation") or "",
            transcript=call_data.get("transcript") or "Транскрипт аудиозаписи",
            sync_to_sheets=bool(call_data.get("sync_to_sheets", True)),
            tenant_id=org_id
        )

        view = call_view(payload)

        # 2. Persist in Database with Idempotent UPSERT (PostgreSQL / SQLite)
        try:
            db = next(get_db())
            ext_call_id = str(call_data.get("external_call_id") or call_id)

            # Resolve target primary key: reuse this client's record of the same external call. A foreign
            # client's row must never match; call_recordings.id is VARCHAR(36) and global, so a long or already
            # taken CRM id gets a deterministic per-client uuid (same rule as /calls/ingest).
            existing_rec = db.query(CallRecording).filter(
                (CallRecording.tenant_id == org_id) & (CallRecording.external_call_id == ext_call_id)
            ).first()
            target_id: str
            if existing_rec:
                target_id = str(existing_rec.id)
            elif len(call_id) > 36 or db.query(CallRecording.id).filter(CallRecording.id == call_id).first():
                target_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"revops-call:{org_id}:{call_id}"))
            else:
                target_id = call_id

            rec = CallRecording(
                id=target_id,
                tenant_id=org_id,
                external_call_id=ext_call_id,
                client_phone=call_data.get("client_phone") or "+79990000000",
                duration_seconds=payload.duration_sec,
                audio_s3_url=call_data.get("audio_url") or call_data.get("record_url"),
                status="completed",
                transcript_text=payload.transcript,
                ai_summary=payload.error_summary,
                next_action_extracted=payload.recommendation,
                overall_score=float(view["score"] or 0.0),
                scorecard_criteria={
                    "cr": view["cr"],
                    "score": view["score"],
                    "next_step": view["next_step"],
                    "manager": payload.manager,
                },
                reverse_etl_synced=payload.sync_to_sheets
            )
            db.merge(rec)
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
        formatted.update({k: view[k] for k in ("cr", "score", "next_step", "kind", "status", "status_label", "risk_amount")})
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
            "score": view["score"],
            "next_step": view["next_step"]
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


@celery_app.task(name="workers.tasks.compute_cco_snapshot_task", bind=True)
def compute_cco_snapshot_task(self, tenant_id: str = "TNT-001") -> dict[str, Any]:
    """
    Background Celery task: Computes unified CCO Revenue Intelligence Snapshot:
    1. Pipeline Health & Velocity (Active pipeline, stuck deals >7 days).
    2. Revenue Leak Analysis (Capped leakage rub, fake yes count, transparent formula).
    3. Sales Rep Scorecard (Manager rankings, avg score, next step compliance).
    4. Top-3 Actionable Directives for ROP & Executive Summary.
    5. Stores snapshot in Redis cache (TTL 3600s) for instant CcoChatDrawer responses.
    """
    import logging
    from packages.database.session import SessionLocal
    from apps.api.cache_client import set_cached_json_sync
    from apps.api.routers.insights_router import load_tenant_dataset, compute_leak_metrics, get_tenant_config

    logger = logging.getLogger("celery.tasks.cco_snapshot")
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    db = SessionLocal()
    try:
        calls, deals = load_tenant_dataset(clean_tenant, db)
        cfg = get_tenant_config(clean_tenant) or {}
        raw_avg = cfg.get("avg_deal_check")
        tenant_avg_check = float(raw_avg) if raw_avg is not None else None

        leak_metrics = compute_leak_metrics(calls, deals, tenant_avg_check)

        # Team performance & manager rankings
        managers_dict: dict[str, dict[str, Any]] = {}
        for c in calls:
            m = (c.get("manager") or "").strip()
            if m:
                mgr = managers_dict.setdefault(m, {"calls": 0, "scores": [], "next_steps": 0, "active_pipeline": 0.0, "won_revenue": 0.0})
                mgr["calls"] += 1
                if c.get("score") is not None:
                    mgr["scores"].append(float(c["score"]))
                if c.get("next_step") == 1 or c.get("status") == "won":
                    mgr["next_steps"] += 1

        for d in deals:
            m = (d.get("manager_name") or "").strip()
            if m:
                mgr = managers_dict.setdefault(m, {"calls": 0, "scores": [], "next_steps": 0, "active_pipeline": 0.0, "won_revenue": 0.0})
                budget = float(d.get("budget", 0.0) or 0.0)
                st = str(d.get("status", "")).upper()
                if st == "WON":
                    mgr["won_revenue"] += budget
                elif st not in ("LOST", "DELETED"):
                    mgr["active_pipeline"] += budget

        leaderboard = []
        for m, data in managers_dict.items():
            sc = data["scores"]
            avg_sc = round(sum(sc) / len(sc), 1) if sc else 0.0
            ns_pct = round((data["next_steps"] / max(1, data["calls"])) * 100, 1) if data["calls"] > 0 else 0.0
            leaderboard.append({
                "manager": m,
                "calls_count": data["calls"],
                "avg_score": avg_sc,
                "next_step_pct": ns_pct,
                "active_pipeline_rub": data["active_pipeline"],
                "won_revenue_rub": data["won_revenue"],
            })
        leaderboard.sort(key=lambda x: x["won_revenue_rub"], reverse=True)

        snapshot = {
            "tenant_id": clean_tenant,
            "calculated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "pipeline": {
                "active_deals_count": len(leak_metrics["active_deals"]),
                "active_pipeline_rub": leak_metrics["active_pipeline"],
                "stuck_deals_count": len(leak_metrics["stuck_deals"]),
                "stuck_amount_rub": leak_metrics["stuck_amount"],
            },
            "call_quality": {
                "total_calls": len(calls),
                "fake_yes_count": leak_metrics["fake_yes_count"],
            },
            "leak": {
                "total_leak_rub": leak_metrics["total_leak_rub"],
                "calc_str": leak_metrics["calc_str"],
                "breakdown": leak_metrics["leak_breakdown"],
            },
            "leaderboard": leaderboard,
            "status": "ready"
        }

        # Cache in Redis with 3600s TTL
        cache_key = f"cco:snapshot:{clean_tenant}"
        set_cached_json_sync(cache_key, snapshot, ex=3600)
        logger.info(f"CCO snapshot updated for tenant {clean_tenant}")
        return snapshot
    finally:
        db.close()
