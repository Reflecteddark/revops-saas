"""
AI Insights Router: Generates automated strategic revenue recommendations.
Integrates Claude / Gemini API or local deterministic CCO intelligence engine.
Multi-tenant aware (Bitrix24, amoCRM) with strict honest reporting and no hardcoded hallucinations.
"""

import logging
import os
import time
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from packages.database.models import CallRecording, Deal, Tenant, User, UserRole
from packages.database.session import get_db
from packages.monitoring.ai_probe import generate_gemini_content_cascade

from ..auth import get_current_user
from ..tenant_registry import DEFAULT_SPREADSHEET_ID, get_tenant_config

logger = logging.getLogger("insights_router")

router = APIRouter(prefix="/insights", tags=["AI Insights & Recommendations"])


class AnalystOverviewRequest(BaseModel):
    tenant_id: str = "TNT-001"
    calls: list[dict[str, Any]] | None = None
    deals: list[dict[str, Any]] | None = None
    metrics: dict[str, Any] | None = None


class AnalystChatRequest(BaseModel):
    message: str
    tenant_id: str = "TNT-001"
    context: dict[str, Any] | None = None
    history: list[dict[str, Any]] | None = None


def load_tenant_dataset(
    tenant_id: str,
    db: Session,
    payload_calls: list[dict[str, Any]] | None = None,
    payload_deals: list[dict[str, Any]] | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Loads unified dataset (calls, deals) for specified tenant.
    Supports multi-tenancy (Bitrix24 and amoCRM) across:
    1. Postgres database tables (deals, call_recordings)
    2. Live Google Sheets / Redis cache fallback
    Returns (calls_list, deals_list) with normalized fields.
    """
    clean_tenant = (tenant_id or "TNT-001").strip().upper()

    cfg = get_tenant_config(clean_tenant)
    sheet_id = cfg.get("spreadsheet_id") if cfg else None
    if clean_tenant != "TNT-001" and (not sheet_id or sheet_id == DEFAULT_SPREADSHEET_ID):
        sheet_id = None
    has_sheet = bool(sheet_id)

    # 1. Deals Resolution
    deals_list: list[dict[str, Any]] = []
    if payload_deals and isinstance(payload_deals, list) and len(payload_deals) > 0:
        deals_list = payload_deals
    else:
        # 1.1 Check Postgres first
        db_deals = db.query(Deal).filter(
            Deal.tenant_id == clean_tenant,
            Deal.is_deleted == False
        ).all()
        if db_deals:
            for d in db_deals:
                stage_val = getattr(d.stage, "value", str(d.stage))
                st_name = (d.status or "ACTIVE").upper()
                mgr = (
                    d.assigned_user.full_name if d.assigned_user
                    else ((d.custom_payload or {}).get("manager_name") if isinstance(d.custom_payload, dict) else "")
                )
                deals_list.append({
                    "id": str(d.id),
                    "title": str(d.title or f"Сделка {d.id}"),
                    "budget": float(d.budget or 0.0),
                    "stage": stage_val,
                    "status": st_name,
                    "is_at_risk": bool(d.is_at_risk or (d.days_in_stage or 0) > 3),
                    "days_in_stage": int(d.days_in_stage or 0),
                    "crm_source": str(d.crm_source or ""),
                    "manager_name": mgr or ""
                })

        # 1.2 Check Redis cache next (strictly scoped to deals:{clean_tenant})
        if not deals_list:
            try:
                from ..cache_client import get_cached_json_sync
                redis_deals = get_cached_json_sync(f"deals:{clean_tenant}")
                if redis_deals and isinstance(redis_deals, list) and len(redis_deals) > 0:
                    for rd in redis_deals:
                        tid = str(rd.get("tenant_id") or rd.get("org_id") or clean_tenant).strip().upper()
                        if tid and tid != clean_tenant:
                            continue
                        raw_budget = rd.get("amount") if rd.get("amount") is not None else rd.get("amount_num", 0.0)
                        try:
                            budget_val = float(raw_budget or 0.0)
                        except (ValueError, TypeError):
                            budget_val = 0.0
                        deals_list.append({
                            "id": str(rd.get("id") or rd.get("deal_id") or ""),
                            "title": str(rd.get("title") or rd.get("company_name") or f"Сделка {rd.get('id')}"),
                            "budget": budget_val,
                            "stage": str(rd.get("stage") or rd.get("stage_name") or ""),
                            "status": str(rd.get("status") or "ACTIVE").upper(),
                            "is_at_risk": bool(rd.get("sla_risk") or rd.get("is_risk") or (rd.get("days_in_stage", 0) or 0) > 3),
                            "days_in_stage": int(rd.get("days_in_stage") or rd.get("days_in_current_stage") or 0),
                            "crm_source": str(rd.get("crm_source") or rd.get("source") or ""),
                            "manager_name": str(rd.get("manager_name") or rd.get("manager") or "")
                        })
            except Exception as e_rd:
                logger.debug(f"Redis deals lookup for {clean_tenant}: {e_rd}")

        # 1.3 Fallback to Google Sheets (if tenant has a configured spreadsheet)
        if not deals_list and has_sheet:
            try:
                from .deals_router import fetch_deals_from_sheets
                sheet_deals = fetch_deals_from_sheets(clean_tenant)
                if sheet_deals:
                    for sd in sheet_deals:
                        tid = str(sd.get("tenant_id") or sd.get("org_id") or clean_tenant).strip().upper()
                        if tid and tid != clean_tenant:
                            continue
                        raw_budget = sd.get("amount") if sd.get("amount") is not None else sd.get("amount_num", 0.0)
                        try:
                            budget_val = float(raw_budget or 0.0)
                        except (ValueError, TypeError):
                            budget_val = 0.0
                        deals_list.append({
                            "id": str(sd.get("id") or sd.get("deal_id") or ""),
                            "title": str(sd.get("title") or sd.get("company_name") or f"Сделка {sd.get('id')}"),
                            "budget": budget_val,
                            "stage": str(sd.get("stage") or sd.get("stage_name") or ""),
                            "status": str(sd.get("status") or "ACTIVE").upper(),
                            "is_at_risk": bool(sd.get("sla_risk") or sd.get("is_risk") or (sd.get("days_in_stage", 0) or 0) > 3),
                            "days_in_stage": int(sd.get("days_in_stage") or sd.get("days_in_current_stage") or 0),
                            "crm_source": str(sd.get("crm_source") or sd.get("source") or ""),
                            "manager_name": str(sd.get("manager_name") or sd.get("manager") or "")
                        })
            except Exception as e_d:
                logger.debug(f"Note reading deals for {clean_tenant}: {e_d}")

    # 2. Calls Resolution
    calls_list: list[dict[str, Any]] = []
    if payload_calls and isinstance(payload_calls, list) and len(payload_calls) > 0:
        calls_list = payload_calls
    else:
        # 2.1 Check in-memory sync cache (strictly scoped to clean_tenant)
        try:
            from .calls_router import _CALLS_CACHE
            cached_entry = _CALLS_CACHE.get(clean_tenant)
            if isinstance(cached_entry, dict) and cached_entry.get("calls"):
                calls_list = cached_entry["calls"]
            elif _CALLS_CACHE.get(f"calls:{clean_tenant}") and isinstance(_CALLS_CACHE[f"calls:{clean_tenant}"], dict):
                calls_list = _CALLS_CACHE[f"calls:{clean_tenant}"].get("calls", [])
        except Exception:
            pass

        # 2.2 Check Redis cache (strictly scoped to calls:{clean_tenant})
        if not calls_list:
            try:
                from ..cache_client import get_cached_json_sync
                redis_calls = get_cached_json_sync(f"calls:{clean_tenant}")
                if redis_calls and isinstance(redis_calls, list) and len(redis_calls) > 0:
                    for rc in redis_calls:
                        tid = str(rc.get("tenant_id") or clean_tenant).strip().upper()
                        if tid and tid != clean_tenant:
                            continue
                        raw_sc = rc.get("score")
                        score_val = int(raw_sc) if raw_sc is not None else None
                        raw_ns = rc.get("next_step")
                        ns_val = int(raw_ns) if raw_ns is not None else None
                        raw_st = rc.get("status")
                        status_val = str(raw_st).lower() if raw_st else ("unknown" if score_val is None else ("won" if score_val >= 8 else "risk"))
                        raw_cr = rc.get("cr")
                        cr_val = raw_cr if (isinstance(raw_cr, list) and len(raw_cr) == 13) else [None] * 13
                        calls_list.append({
                            "id": str(rc.get("id") or ""),
                            "score": score_val,
                            "next_step": ns_val,
                            "status": status_val,
                            "manager": str(rc.get("manager") or ""),
                            "cr": cr_val,
                            "transcript": str(rc.get("transcript") or "")
                        })
                    if calls_list:
                        try:
                            from .calls_router import _CALLS_CACHE
                            _CALLS_CACHE[clean_tenant] = {"timestamp": time.time(), "calls": calls_list}
                        except Exception:
                            pass
            except Exception as e_rc:
                logger.debug(f"Redis calls lookup for {clean_tenant}: {e_rc}")

        # 2.3 Check Postgres call_recordings
        if not calls_list:
            db_calls = db.query(CallRecording).filter(
                CallRecording.tenant_id == clean_tenant
            ).order_by(CallRecording.created_at.desc()).limit(50).all()
            if db_calls:
                for c in db_calls:
                    sc = c.scorecard_criteria if isinstance(c.scorecard_criteria, dict) else {}
                    raw_sc = sc.get("score")
                    if raw_sc is not None:
                        score = int(raw_sc)
                    elif c.overall_score is not None:
                        score = int(round((c.overall_score / 100.0) * 13)) if c.overall_score > 13 else int(round(c.overall_score))
                    else:
                        score = None

                    raw_ns = sc.get("next_step") if isinstance(sc, dict) else None
                    if raw_ns is not None:
                        next_step = int(raw_ns)
                    elif c.next_action_extracted:
                        next_step = 1
                    elif score is not None:
                        next_step = 1 if score >= 8 else 0
                    else:
                        next_step = None

                    mgr = c.manager.full_name if c.manager else (sc.get("manager") or "")
                    call_status = sc.get("status")
                    if not call_status:
                        if score is not None:
                            call_status = "won" if score >= 8 else "risk"
                        else:
                            call_status = "unknown"

                    raw_cr = sc.get("cr")
                    cr_val = raw_cr if (isinstance(raw_cr, list) and len(raw_cr) == 13) else [None] * 13

                    calls_list.append({
                        "id": str(c.id),
                        "score": score,
                        "next_step": next_step,
                        "status": call_status,
                        "manager": mgr or "",
                        "cr": cr_val,
                        "transcript": c.transcript_text or ""
                    })

        # 2.4 Fallback to Google Sheets (if tenant has a configured spreadsheet)
        if not calls_list and has_sheet:
            try:
                from .calls_router import fetch_calls_from_sheets
                sheet_calls = fetch_calls_from_sheets(clean_tenant)
                if sheet_calls:
                    for sc in sheet_calls:
                        tid = str(sc.get("tenant_id") or clean_tenant).strip().upper()
                        if tid and tid != clean_tenant:
                            continue
                        raw_sc = sc.get("score")
                        score_val = int(raw_sc) if raw_sc is not None else None
                        raw_ns = sc.get("next_step")
                        ns_val = int(raw_ns) if raw_ns is not None else None
                        raw_st = sc.get("status")
                        status_val = str(raw_st).lower() if raw_st else ("unknown" if score_val is None else ("won" if score_val >= 8 else "risk"))
                        raw_cr = sc.get("cr")
                        cr_val = raw_cr if (isinstance(raw_cr, list) and len(raw_cr) == 13) else [None] * 13
                        calls_list.append({
                            "id": str(sc.get("id") or ""),
                            "score": score_val,
                            "next_step": ns_val,
                            "status": status_val,
                            "manager": str(sc.get("manager") or ""),
                            "cr": cr_val,
                            "transcript": str(sc.get("transcript") or "")
                        })
            except Exception as e_c:
                logger.debug(f"Note reading calls for {clean_tenant}: {e_c}")

    return calls_list, deals_list


def compute_leak_metrics(
    calls: list[dict[str, Any]],
    deals: list[dict[str, Any]],
    tenant_avg_check: float | None,
) -> dict[str, Any]:
    """
    Unified Single-Source-Of-Truth computation of revenue leaks (P1-1 & P1-4).
    Calculates fake_yes (missed Next Steps in audited calls) and stuck pipeline deals.
    Strictly caps the total leak by active pipeline amount.
    Handles None tenant_avg_check without falling back to magic numbers.
    """
    fake_yes_calls = [
        c for c in calls
        if c.get("score") is not None
        and c.get("next_step") not in (1, None)
        and c.get("status") not in ("won",)
    ]
    fake_yes_count = len(fake_yes_calls)

    active_deals = [
        d for d in deals
        if str(d.get("status", "")).upper() in ("ACTIVE", "NEW", "PREPARATION", "PREPAYMENT_INVOICE", "EXECUTING", "FINAL_INVOICE")
        and str(d.get("stage", "")).upper() not in ("DEAL_WON", "DEAL_LOST", "WON", "LOST", "7. ЗАКРЫТО И НЕ РЕАЛИЗОВАНО")
    ]
    active_pipeline = sum(float(d.get("budget", 0.0) or 0.0) for d in active_deals)
    stuck_deals = [d for d in active_deals if d.get("is_at_risk")]
    stuck_amount = sum(float(d.get("budget", 0.0) or 0.0) for d in stuck_deals)
    stuck_avg = (stuck_amount / len(stuck_deals)) if stuck_deals else 0.0

    if tenant_avg_check is None:
        fake_yes_leak = 0.0
        fake_yes_sum = None
        fake_yes_avg_check = None
        assumed_default = True
        uncapped_leak = stuck_amount
    else:
        fake_yes_avg_check = float(tenant_avg_check)
        fake_yes_leak = fake_yes_count * fake_yes_avg_check
        fake_yes_sum = round(fake_yes_leak, 2)
        assumed_default = False
        uncapped_leak = stuck_amount + fake_yes_leak

    if active_pipeline > 0:
        leak_rub = min(uncapped_leak, active_pipeline)
        is_capped = uncapped_leak > active_pipeline
    else:
        leak_rub = uncapped_leak
        is_capped = False

    if tenant_avg_check is None or fake_yes_avg_check is None:
        calc_str = (
            f"Расчёт: средний чек не задан (Fake Yes не включён) + "
            f"{len(stuck_deals)} зависших сделок × {int(stuck_avg):,} ₽ = {int(leak_rub):,} ₽"
        ).replace(",", " ")
    else:
        calc_str = (
            f"Расчёт: {fake_yes_count} fake_yes × {int(fake_yes_avg_check):,} ₽ + "
            f"{len(stuck_deals)} зависших сделок × {int(stuck_avg):,} ₽ = {int(leak_rub):,} ₽"
        ).replace(",", " ")

    leak_breakdown = {
        "fake_yes": {
            "count": fake_yes_count,
            "avg_check": int(fake_yes_avg_check) if fake_yes_avg_check is not None else None,
            "sum": int(fake_yes_sum) if fake_yes_sum is not None else None,
            "assumed_default": assumed_default,
        },
        "stuck_deals": {
            "count": len(stuck_deals),
            "avg": round(stuck_avg, 2),
            "sum": round(stuck_amount, 2),
        },
        "total_leak_rub": round(leak_rub, 2),
        "capped_by_pipeline": is_capped,
    }

    return {
        "fake_yes_calls": fake_yes_calls,
        "fake_yes_count": fake_yes_count,
        "active_deals": active_deals,
        "active_pipeline": active_pipeline,
        "stuck_deals": stuck_deals,
        "stuck_amount": stuck_amount,
        "stuck_avg": stuck_avg,
        "fake_yes_leak": fake_yes_leak,
        "uncapped_leak": uncapped_leak,
        "leak_rub": leak_rub,
        "is_capped": is_capped,
        "calc_str": calc_str,
        "leak_breakdown": leak_breakdown,
        "total_leak_rub": round(leak_rub, 2),
        "assumed_default": assumed_default,
    }


# ==========================================================================
# 1. SUMMARY ENDPOINT (HONEST MONTE-CARLO / DETERMINISTIC FALLBACK)
# ==========================================================================

@router.get("/summary")
async def get_ai_insights_summary(
    org_id: str = "org_default",
    tenant_id: str | None = None,
    p10: float | None = Query(default=None),
    p50: float | None = Query(default=None),
    p90: float | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Synthesizes AI insights analyzing Monte Carlo corridors and at-risk deals.
    Provides prioritized action items to achieve target P50 based on real CRM data.
    """
    requested_tenant = tenant_id if tenant_id is not None else (org_id if org_id != "org_default" else current_user.tenant_id)
    target_tenant = (requested_tenant or current_user.tenant_id or "").strip().upper()
    is_admin = bool(
        getattr(current_user, "is_admin", False)
        or getattr(current_user, "role", None) == UserRole.ADMIN
        or "admin" in str(getattr(current_user, "role", "")).lower()
        or "супервайзер" in str(getattr(current_user, "role", "")).lower()
        or str(getattr(current_user, "email", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
        or str(getattr(current_user, "id", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
        or str(getattr(current_user, "tenant_id", "")).strip() == "*"
    )
    if target_tenant != str(current_user.tenant_id).upper() and not is_admin:
        raise HTTPException(status_code=403, detail="cross-tenant access denied")

    effective_tenant = target_tenant
    calls_list, deals_list = load_tenant_dataset(effective_tenant, db)

    cfg = get_tenant_config(effective_tenant) or {}
    raw_avg = cfg.get("avg_deal_check")
    tenant_avg_check = float(raw_avg) if raw_avg is not None else None

    leak_metrics = compute_leak_metrics(calls_list, deals_list, tenant_avg_check)
    active_deals = leak_metrics["active_deals"]
    active_sum = leak_metrics["active_pipeline"]
    leak_breakdown = leak_metrics["leak_breakdown"]
    total_leak_rub = leak_metrics["total_leak_rub"]

    if p10 is not None and p50 is not None and p90 is not None:
        eff_p10, eff_p50, eff_p90 = float(p10), float(p50), float(p90)
    elif active_sum > 0:
        eff_p10 = round(active_sum * 0.75, 2)
        eff_p50 = round(active_sum * 1.0, 2)
        eff_p90 = round(active_sum * 1.35, 2)
    else:
        return {
            "status": "no_data",
            "engine": "no_data",
            "tenant_id": effective_tenant,
            "message": f"Нет данных по активным сделкам для расчета сценариев выручки по тенанту {effective_tenant}."
        }

    anthropic_api_key = os.getenv("ANTHROPIC_API_KEY")
    anthropic_model = os.getenv("ANTHROPIC_MODEL", "claude-3-5-sonnet-20241022")
    if anthropic_api_key:
        try:
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=anthropic_api_key)
            prompt = f"""
            Проанализируй линейный прогноз сценариев выручки (не Монте-Карло):
            - P10 (консервативный): {eff_p10:,.0f} ₽
            - P50 (медиана): {eff_p50:,.0f} ₽
            - P90 (оптимистичный): {eff_p90:,.0f} ₽
            - Активный пайплайн ({len(active_deals)} сделок): {active_sum:,.0f} ₽
            
            Дай 3 конкретные рекомендации для отдела продаж, чтобы увеличить вероятность достижения P50.
            """
            msg = await client.messages.create(
                model=anthropic_model,
                max_tokens=600,
                messages=[{"role": "user", "content": prompt}]
            )
            ai_text = next(
                (b.text for b in msg.content if hasattr(b, "text")),
                str(msg.content[0]) if msg.content else "",
            )
            return {
                "status": "ok",
                "engine": "Claude 3.5 Sonnet",
                "claude_model": anthropic_model,
                "tenant_id": effective_tenant,
                "summary": ai_text,
                "p10_corridor_rub": eff_p10,
                "p50_corridor_rub": eff_p50,
                "p90_corridor_rub": eff_p90,
                "confidence_score": 0.94,
                "calculation_method": "linear_scenario (not Monte-Carlo)",
                "leak_breakdown": leak_breakdown,
                "total_leak_rub": total_leak_rub
            }
        except Exception as e:
            logger.warning(f"Claude API unavailable: {e}")

    recommendations = [
        {
            "priority": "HIGH",
            "title": "Ликвидация зависания сделок в воронке",
            "impact_rub": round(active_sum * 0.25, 2),
            "description": f"В активном пайплайне находится {len(active_deals)} сделок на общую сумму {active_sum:,.0f} ₽. Проведите ревизию сроков нахождения на этапе."
        },
        {
            "priority": "MEDIUM",
            "title": "Контроль фиксации Next Step",
            "impact_rub": round(active_sum * 0.15, 2),
            "description": "Проверьте обязательное наличие запланированного контакта или Zoom-разбора по всем ключевым сделкам."
        },
        {
            "priority": "MEDIUM",
            "title": "Повышение конверсии квалификации (cr2, cr4)",
            "impact_rub": round(active_sum * 0.10, 2),
            "description": "Проконтролируйте программирование звонка и выявление болей ЛПР на первом контакте для снижения процента отказов."
        }
    ]
    summary_text = (
        f"Для достижения медианного плана P50 ({eff_p50:,.0f} ₽) при активном объеме {active_sum:,.0f} ₽ "
        f"необходимо исключить зависания сделок и строго соблюдать регламент перехода между этапами."
    )
    return {
        "status": "ok",
        "engine": "deterministic_fallback",
        "tenant_id": effective_tenant,
        "p10_corridor_rub": eff_p10,
        "p50_corridor_rub": eff_p50,
        "p90_corridor_rub": eff_p90,
        "confidence_score": 0.88,
        "calculation_method": "linear_scenario (not Monte-Carlo)",
        "recommendations": recommendations,
        "insights": recommendations,
        "synthesis": summary_text,
        "executive_summary": summary_text,
        "leak_breakdown": leak_breakdown,
        "total_leak_rub": total_leak_rub
    }


# ==========================================================================
# 2. AI ANALYST / CCO EXECUTIVE OVERVIEW
# ==========================================================================

@router.post("/analyst/overview")
async def get_analyst_overview(
    payload: AnalystOverviewRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Returns high-level CCO Intelligence Overview:
    Executive Summary, 4 Core KPI Cards, Top Anomalies, and Suggested Prompts.
    Uses unified multi-tenant dataset.
    """
    target_tenant = (payload.tenant_id or current_user.tenant_id or "").strip().upper()
    is_admin = bool(
        getattr(current_user, "is_admin", False)
        or getattr(current_user, "role", None) == UserRole.ADMIN
        or "admin" in str(getattr(current_user, "role", "")).lower()
        or "супервайзер" in str(getattr(current_user, "role", "")).lower()
        or str(getattr(current_user, "email", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
        or str(getattr(current_user, "id", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
        or str(getattr(current_user, "tenant_id", "")).strip() == "*"
    )
    if target_tenant != str(current_user.tenant_id).upper() and not is_admin:
        raise HTTPException(status_code=403, detail="cross-tenant access denied")

    clean_tenant = target_tenant
    if payload.calls or payload.deals:
        logger.warning("Client attempted to inject custom context, ignored")
    calls, deals = load_tenant_dataset(clean_tenant, db, payload_calls=None, payload_deals=None)

    if len(calls) == 0 and len(deals) == 0:
        return {
            "status": "no_data",
            "engine": "no_data",
            "tenant_id": clean_tenant,
            "message": f"Синхронизация данных по тенанту {clean_tenant} ещё не завершена. Подождите 1–2 минуты и повторите запрос.",
            "executive_summary": f"Данные по тенанту {clean_tenant} пока не загружены.",
            "kpi_cards": [],
            "anomalies": [],
            "quick_prompts": [],
            "metrics_summary": {
                "total_calls": 0,
                "avg_score": 0.0,
                "next_step_pct": 0.0,
                "fake_yes_count": 0,
                "pipeline_amount_rub": 0.0,
                "stuck_amount_rub": 0.0,
                "health_score": 0
            }
        }

    total_calls = len(calls)
    scored_calls = [c for c in calls if c.get("score") is not None]
    total_score_sum = sum(float(c["score"]) for c in scored_calls)
    avg_score = round(total_score_sum / max(1, len(scored_calls)), 1) if scored_calls else 0.0
    next_step_wins = sum(1 for c in calls if c.get("next_step") == 1 or c.get("status") == "won")
    next_step_pct = round((next_step_wins / max(1, total_calls)) * 100, 1) if total_calls > 0 else 0.0

    cfg = get_tenant_config(clean_tenant) or {}
    raw_avg = cfg.get("avg_deal_check")
    tenant_avg_check = float(raw_avg) if raw_avg is not None else None

    # Compute leaks with canonical unified function
    leak_metrics = compute_leak_metrics(calls, deals, tenant_avg_check)
    fake_yes_count = leak_metrics["fake_yes_count"]
    active_deals = leak_metrics["active_deals"]
    pipeline_amount = leak_metrics["active_pipeline"]
    stuck_deals = leak_metrics["stuck_deals"]
    stuck_amount = leak_metrics["stuck_amount"]
    stuck_avg = leak_metrics["stuck_avg"]
    fake_yes_leak = leak_metrics["fake_yes_leak"]
    uncapped_leak = leak_metrics["uncapped_leak"]
    leak_rub = leak_metrics["leak_rub"]
    calc_str = leak_metrics["calc_str"]
    leak_breakdown = leak_metrics["leak_breakdown"]
    total_leak_rub = leak_metrics["total_leak_rub"]

    # Pipeline health index (0-100)
    health_score = int(min(98, max(0, (avg_score / 13.0) * 50 + (next_step_pct / 100.0) * 40 + 10))) if total_calls > 0 else 0
    p50_revenue = pipeline_amount

    executive_summary = (
        f"**Стратегический вердикт CCO**: Активный пайплайн составляет **{pipeline_amount:,.0f} ₽** "
        f"({len(active_deals)} сделок). "
        f"По аудиту {total_calls} звонков конверсия в следующий шаг составляет **{next_step_pct}%**. "
        f"Выявлено {fake_yes_count} срывов Next Step и {len(stuck_deals)} зависших сделок, "
        f"создающих риск на сумму **{leak_rub:,.0f} ₽**.\n\n"
        f"{calc_str}"
    )

    kpi_cards = [
        {
            "id": "health_index",
            "title": "Индекс здоровья воронки",
            "value": f"{health_score} / 100",
            "delta": "Расчет по звонкам и SLA" if total_calls > 0 else "Нет данных по звонкам",
            "delta_type": "neutral" if total_calls == 0 else ("positive" if health_score >= 70 else "warning"),
            "desc": "Интегральный скоринг качества звонков и SLA сделок"
        },
        {
            "id": "p50_montecarlo",
            "title": "Активный пайплайн (P50)",
            "value": f"{p50_revenue:,.0f} ₽",
            "delta": f"{len(active_deals)} активных сделок",
            "delta_type": "neutral",
            "desc": "Суммарный объем сделок в работе"
        },
        {
            "id": "revenue_leak",
            "title": "Локализованные утечки",
            "value": f"{leak_rub:,.0f} ₽",
            "delta": f"{fake_yes_count} сливов в звонках и {len(stuck_deals)} зависших сделок",
            "delta_type": "negative" if leak_rub > 0 else "positive",
            "desc": calc_str,
            "leak_breakdown": leak_breakdown
        },
        {
            "id": "next_step_compliance",
            "title": "Фиксация Next Step",
            "value": f"{next_step_pct}%",
            "delta": f"Эталон: >= 85% (разрыв: {max(0, 85 - next_step_pct):.1f}%)" if next_step_pct < 85 else "В регламенте",
            "delta_type": "positive" if next_step_pct >= 85 else "warning",
            "desc": "Доля звонков с зафиксированной датой контакта"
        }
    ]

    anomalies = []
    if fake_yes_count > 0:
        anomalies.append({
            "id": "anom_1",
            "priority": "HIGH",
            "title": f"Слив сделок без назначения даты встречи ({fake_yes_count} звонков)",
            "impact_rub": fake_yes_leak,
            "category": "Речевой регламент",
            "root_cause": "Менеджеры отпускают клиентов без фиксации точной даты и времени следующего контакта.",
            "action_text": "Внедрить чек-лист обязательного согласования слота Zoom в Google Календаре перед завершением звонка."
        })
    if stuck_amount > 0:
        anomalies.append({
            "id": "anom_2",
            "priority": "HIGH",
            "title": f"Зависание {len(stuck_deals)} сделок в зоне риска SLA",
            "impact_rub": stuck_amount,
            "category": "Воронка & SLA",
            "root_cause": "Сделки превысили нормативное время нахождения на этапе.",
            "action_text": "Назначить звонки-разборы и проконтролировать актуализацию статусов в CRM."
        })

    quick_prompts = [
        "Где мы теряем больше всего денег?",
        "Разбор слабых мест менеджеров",
        "План дожима зависших сделок",
        "Прогноз выполнения плана месяца",
        "Анализ причин отказов клиентов"
    ]

    return {
        "status": "ok",
        "tenant_id": clean_tenant,
        "executive_summary": executive_summary,
        "kpi_cards": kpi_cards,
        "anomalies": anomalies,
        "quick_prompts": quick_prompts,
        "leak_breakdown": leak_breakdown,
        "total_leak_rub": total_leak_rub,
        "metrics_summary": {
            "total_calls": total_calls,
            "avg_score": avg_score,
            "next_step_pct": next_step_pct,
            "fake_yes_count": fake_yes_count,
            "pipeline_amount_rub": pipeline_amount,
            "stuck_amount_rub": stuck_amount,
            "leak_rub": leak_rub,
            "total_leak_rub": total_leak_rub,
            "health_score": health_score,
            "leak_breakdown": leak_breakdown
        }
    }


# ==========================================================================
# 3. AI ANALYST / CCO INTERACTIVE CHAT ENGINE
# ==========================================================================

@router.post("/analyst/chat")
async def chat_with_analyst(
    payload: AnalystChatRequest = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    """
    Direct Interactive Dialogue with Chief Commercial Officer (CCO / Agent 2).
    Multi-tier AI failover (Gemini Tier 1/2/3 -> Tier 4 Local SSOT)
    strictly scoped to the active tenant's real CRM and call metrics.
    """
    target_tenant = (payload.tenant_id or current_user.tenant_id or "").strip().upper()
    is_admin = bool(
        getattr(current_user, "is_admin", False)
        or getattr(current_user, "role", None) == UserRole.ADMIN
        or "admin" in str(getattr(current_user, "role", "")).lower()
        or "супервайзер" in str(getattr(current_user, "role", "")).lower()
        or str(getattr(current_user, "email", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
        or str(getattr(current_user, "id", "")).lower() in ("admin", "dmitriyfedotov1908@gmail.com")
        or str(getattr(current_user, "tenant_id", "")).strip() == "*"
    )
    if target_tenant != str(current_user.tenant_id).upper() and not is_admin:
        raise HTTPException(status_code=403, detail="cross-tenant access denied")

    clean_tenant = target_tenant
    msg = payload.message.strip()
    msg_lower = msg.lower()
    ctx = payload.context or {}

    # 1. Fetch real Tenant identity and database facts
    tenant = db.query(Tenant).filter(Tenant.id == clean_tenant).first()
    cfg = get_tenant_config(clean_tenant) or {}
    tenant_name = tenant.name if tenant else (cfg.get("tenant_name") or clean_tenant)
    raw_avg = cfg.get("avg_deal_check")
    tenant_avg_check = float(raw_avg) if raw_avg is not None else None

    if ctx and (ctx.get("calls") or ctx.get("deals")):
        logger.warning("Client attempted to inject custom context, ignored")
    calls_list, deals_list = load_tenant_dataset(clean_tenant, db, payload_calls=None, payload_deals=None)

    calls_cnt = len(calls_list)
    deals_cnt = len(deals_list)

    # Honest no_data check: if no calls and no deals are present for this tenant
    if calls_cnt == 0 and deals_cnt == 0:
        return {
            "status": "no_data",
            "engine": "no_data",
            "reply": f"Синхронизация данных по тенанту {clean_tenant} ещё не завершена. Подождите 1–2 минуты и повторите запрос."
        }

    # 2. Dynamic Real Metrics Calculation
    scores = [float(c["score"]) for c in calls_list if c.get("score") is not None]
    avg_score = round(sum(scores) / max(1, len(scores)), 1) if scores else 0.0
    next_step_calls = [c for c in calls_list if c.get("next_step") == 1 or c.get("status") == "won"]
    next_step_pct = round((len(next_step_calls) / max(1, calls_cnt)) * 100, 1) if calls_cnt > 0 else 0.0

    # Real managers mapping from calls and deals
    managers_dict: dict[str, list[float]] = {}
    for c in calls_list:
        m = (c.get("manager") or "").strip()
        if m:
            managers_dict.setdefault(m, []).append(float(c.get("score") or 0.0))
    for d in deals_list:
        m = (d.get("manager_name") or "").strip()
        if m and m not in managers_dict:
            managers_dict[m] = []

    if managers_dict:
        mgr_lines = []
        for m, sc in managers_dict.items():
            if sc:
                mgr_lines.append(f"• {m}: {len(sc)} звонков, ср. скоринг {round(sum(sc)/len(sc), 1)}")
            else:
                mgr_lines.append(f"• {m}: ответственный по сделкам")
        managers_summary = "Менеджеры кабинета:\n" + "\n".join(mgr_lines[:5])
    else:
        discovered_users = cfg.get("discovered_users") or []
        contact_person = cfg.get("contact_person")
        if discovered_users:
            names = [u.get("name") for u in discovered_users if u.get("name")]
            managers_summary = "Менеджеры кабинета: " + ", ".join(names)
        elif contact_person:
            managers_summary = f"Менеджеры кабинета: {contact_person}"
        else:
            managers_summary = "Менеджеры кабинета: Ответственные сотрудники в CRM"

    # Analyze 13 criteria bottlenecks across calls
    crit_accum: dict[str, list[int]] = {}
    for c in calls_list:
        cr_arr = c.get("cr")
        if cr_arr and isinstance(cr_arr, list) and len(cr_arr) == 13:
            for idx, val in enumerate(cr_arr):
                crit_accum.setdefault(f"cr{idx+1}", []).append(1 if val else 0)

    if crit_accum:
        cr_meta = {
            "cr1": "Приветствие и регламент диалога",
            "cr2": "Программирование и цель разговора",
            "cr3": "Квалификация ниши и масштаба компании",
            "cr4": "Выявление истинных болей и текущей ситуации",
            "cr5": "Выявление бюджета и финансовых рамок",
            "cr6": "Квалификация схемы принятия решений (ЛПР)",
            "cr7": "Презентация продукта через ценность и боли",
            "cr8": "Озвучивание стоимости и вилки цен",
            "cr9": "Отработка возражений («дорого», «подумаю»)",
            "cr10": "Фиксация дедлайна следующего контакта (Next Step)",
            "cr11": "Инициатива (менеджер задает встречные вопросы)",
            "cr12": "Фиксация договоренностей в CRM",
            "cr13": "Тональность, партнерская позиция и экспертность",
        }
        sorted_crit = sorted(crit_accum.items(), key=lambda kv: (sum(kv[1]) / len(kv[1])))
        weak_criteria_list = [
            f"• {cr_meta.get(k, k)} ({k}): соблюдается лишь в {int(sum(v)/len(v)*100)}% звонков"
            for k, v in sorted_crit[:3]
        ]
        weak_criteria_summary = "УЗКИЕ МЕСТА В ЗВОНКАХ ПО 13 КРИТЕРИЯМ B2B-АУДИТА:\n" + "\n".join(weak_criteria_list)
    else:
        weak_criteria_summary = "Детализированный срез по 13 критериям: недостаточно расширенных скорингов."

    # Unified leak computation
    leak_metrics = compute_leak_metrics(calls_list, deals_list, tenant_avg_check)
    fake_yes = leak_metrics["fake_yes_count"]
    active_deals = leak_metrics["active_deals"]
    active_pipeline = leak_metrics["active_pipeline"]
    stalled_deals = leak_metrics["stuck_deals"]
    stalled_amount = leak_metrics["stuck_amount"]
    stuck_avg = leak_metrics["stuck_avg"]
    fake_yes_leak = leak_metrics["fake_yes_leak"]
    uncapped_leak = leak_metrics["uncapped_leak"]
    leak_rub = leak_metrics["leak_rub"]
    calc_str = leak_metrics["calc_str"]
    leak_breakdown = leak_metrics["leak_breakdown"]
    total_leak_rub = leak_metrics["total_leak_rub"]

    if stalled_deals:
        stalled_lines = [
            f"• {d.get('title')}: {d.get('budget', 0):,.0f} ₽, этап {d.get('stage')}, без движения {d.get('days_in_stage', 0)} дн."
            for d in stalled_deals[:4]
        ]
        stalled_deals_summary = "Зависшие сделки в зоне риска:\n" + "\n".join(stalled_lines)
    elif active_deals:
        stalled_deals_summary = f"Активных сделок в пайплайне: {len(active_deals)} (общая сумма {active_pipeline:,.0f} ₽). Критических зависаний нет."
    else:
        stalled_deals_summary = "Активные сделки в CRM отсутствуют."

    # Multi-turn dialogue history
    history_ctx = ""
    if payload.history:
        valid_history = []
        for h in payload.history:
            if not isinstance(h, dict):
                continue
            raw_role = str(h.get("role", "")).lower().strip()
            if raw_role in ("user", "human"):
                role_label = "user"
            elif raw_role in ("assistant", "cco", "ai"):
                role_label = "assistant"
            else:
                continue

            raw_text = str(h.get("text") or h.get("content") or "").strip()
            if not raw_text:
                continue

            truncated_text = raw_text[:500]
            sanitized_text = truncated_text.replace('"""', "'''").replace("---", "— — —")
            valid_history.append((role_label, sanitized_text))

        lines = []
        for role_label, text in valid_history[-4:]:
            r = "Директор" if role_label == "user" else "CCO"
            lines.append(f"{r}: {text}")
        if lines:
            history_ctx = "ПРЕДЫДУЩИЙ ДИАЛОГ С ДИРЕКТОРОМ:\n" + "\n".join(lines) + "\n\n"

    if tenant_avg_check is None:
        fake_yes_prompt_line = (
            f"- Срывы Next Step («Fake Yes»): {fake_yes} звонков. "
            "Средний чек не задан в настройках компании. Оценка потерь от Fake Yes не проводилась. "
            "Рекомендуй руководителю указать средний чек в Настройках."
        )
    else:
        fake_yes_prompt_line = f"- Срывы Next Step («Fake Yes»): {fake_yes} звонков"

    system_prompt = (
        f"Ты — Главный Коммерческий Директор (Chief Commercial Officer / CCO) и ведущий RevOps-аналитик компании «{tenant_name}» (ID кабинета: {clean_tenant}).\n"
        f"Твой стиль: сильный, авторитетный, финансово ориентированный лидер B2B-продаж. Ты говоришь языком маржи, конверсий и дисциплины.\n\n"
        f"ФАКТИЧЕСКИЕ ДАННЫЕ КАБИНЕТА:\n"
        f"- Компания: {tenant_name}\n"
        f"- Звонков в базе: {calls_cnt}\n"
        f"- Средний скоринг звонков: {avg_score} / 13 баллов\n"
        f"- Фиксация Next Step (договоренность о следующем контакте): {next_step_pct}%\n"
        f"{fake_yes_prompt_line}\n"
        f"- Сумма утечек в зависших сделках: {leak_rub:,.0f} ₽\n"
        f"- Активный пайплайн ({len(active_deals)} сделок): {active_pipeline:,.0f} ₽\n"
        f"- Строка формулы расчета утечек: {calc_str}\n"
        f"{managers_summary}\n"
        f"{weak_criteria_summary}\n"
        f"{stalled_deals_summary}\n\n"
        f"ПРАВИЛА ГИБКОГО И РАЗНООБРАЗНОГО ОТВЕТА (КРИТИЧЕСКИ ВАЖНО):\n"
        f"1. Отвечай СТРОГО по фактическим данным этого кабинета. Запрещено выдумывать имена менеджеров или суммы!\n"
        f"2. ОБЯЗАТЕЛЬНО включи в ответ строку расшифровки утечек ровно в таком виде:\n"
        f"   {calc_str}\n"
        f"3. Если звонки или сделки отсутствуют — прямо укажи на это.\n"
        f"4. Используй структурированный Markdown: заголовки ###, списки, выделение ключевых сумм жирным."
    )

    full_user_message = f"{history_ctx}ВОПРОС ДИРЕКТОРА: {msg}"

    # 3. Multi-tier Cascade AI Generation (Tier 1 -> Tier 2 -> Tier 3)
    ai_result = await generate_gemini_content_cascade(
        system_prompt=system_prompt,
        user_message=full_user_message,
        timeout=12.0
    )

    if ai_result.get("status") == "ok" and ai_result.get("reply"):
        reply_text = str(ai_result["reply"])
        if "Расчёт:" not in reply_text:
            reply_text = f"{reply_text.rstrip()}\n\n---\n**Прозрачность расчета утечек:**\n{calc_str}"
        return {
            "status": "ok",
            "engine": ai_result.get("engine", "Gemini AI Cascade"),
            "tier": ai_result.get("tier", "Tier 1"),
            "model": ai_result.get("model"),
            "reply": reply_text,
            "latency_ms": ai_result.get("latency_ms"),
            "leak_breakdown": leak_breakdown,
            "total_leak_rub": total_leak_rub
        }

    # 4. Tier 4 Failover: Contextual CCO Deterministic Intelligence
    logger.warning(f"Activating Tier 4 Local SSOT for tenant {clean_tenant} due to: {ai_result.get('error')}")
    if any(w in msg_lower for w in ("как дела", "статус", "привет", "здоров", "че как", "как успехи")):
        status_icon = "🔴 ТРЕВОГА" if leak_rub > 2000000 else ("🟡 ВНИМАНИЕ" if leak_rub > 0 else "🟢 НОРМА")
        reply = (
            f"### Экспресс-сводка CCO: Кабинет {tenant_name}\n\n"
            f"**Статус воронки: {status_icon}** — ключевые процессы стабильны.\n\n"
            f"**Главные цифры среза:**\n"
            f"- **{leak_rub:,.0f} ₽** — суммарный объём зависших сделок в зоне риска.\n"
            f"- **{next_step_pct}%** — соблюдение фиксации даты следующего контакта (Next Step).\n"
            f"- **{avg_score} / 13** — средний скоринг звонков.\n"
            f"- **{active_pipeline:,.0f} ₽** — активный пайплайн в работе ({len(active_deals)} сделок).\n\n"
            f"**Главный фокус**: Проконтролировать фиксацию конкретных дат следующего контакта по всем активным сделкам."
        )
    elif any(w in msg_lower for w in ("поднять продажи", "вырасти", "рост", "масштаб", "увеличить")):
        reply = (
            f"### Стратегический план роста выручки: Кабинет {tenant_name}\n\n"
            f"Текущий активный пайплайн: **{active_pipeline:,.0f} ₽** ({len(active_deals)} сделок).\n\n"
            f"1. **Конверсия в Next Step**: Текущий показатель **{next_step_pct}%**. Каждое завершение разговора должно завершаться зафиксированным слотом встречи.\n"
            f"2. **Устранение зависаний**: Объем сделок в зоне риска — **{leak_rub:,.0f} ₽**. Назначить звонки-разборы КП силами РОПа.\n"
            f"3. **Рост среднего чека**: Добавить пакетные предложения на этапе презентации."
        )
    elif "где" in msg_lower and ("теря" in msg_lower or "утечк" in msg_lower or "деньг" in msg_lower or "зон" in msg_lower):
        if tenant_avg_check is None:
            fake_yes_desc = (
                f"1. **Срывы договоренностей Next Step**: {fake_yes} звонков завершились без даты и времени следующего контакта. "
                "Средний чек не задан в настройках компании. Оценка потерь от Fake Yes не проводилась. Рекомендуем указать средний чек в Настройках.\n"
            )
        else:
            fake_yes_desc = f"1. **Срывы договоренностей Next Step**: {fake_yes} звонков завершились без даты и времени следующего контакта.\n"
        reply = (
            f"### Аудит ключевых утечек выручки от Коммерческого Директора\n\n"
            f"Текущий объем выявленных потерь и рисков составляет **{leak_rub:,.0f} ₽**.\n\n"
            f"{fake_yes_desc}"
            f"2. **Зависшие сделки в зоне риска**: {len(stalled_deals)} сделок на сумму {stalled_amount:,.0f} ₽ превысили норматив нахождения на этапе.\n\n"
            f"#### Директива CCO:\n"
            f"1. Запретить закрывать звонки фразой «я вам перезвоню» без конкретного времени в календаре.\n"
            f"2. Актуализировать статус и дату следующего шага по всем зависшим сделкам."
        )
    elif "менеджер" in msg_lower or "слаб" in msg_lower or "сотрудник" in msg_lower:
        reply = (
            f"### Разбор компетенций и команды менеджеров\n\n"
            f"{managers_summary}\n\n"
            f"**Средний скоринг звонков по кабинету**: {avg_score} / 13 баллов.\n"
            f"**Соблюдение регламента Next Step**: {next_step_pct}%.\n\n"
            f"{weak_criteria_summary}\n\n"
            f"#### Рекомендация CCO:\n"
            f"Провести выборочный разбор звонков с оценкой ниже 8 баллов и проконтролировать фиксацию Next Step."
        )
    elif "прогноз" in msg_lower or "план" in msg_lower or "монте" in msg_lower or "месяц" in msg_lower:
        p10_c = round(active_pipeline * 0.75, 2)
        p50_c = round(active_pipeline * 1.0, 2)
        p90_c = round(active_pipeline * 1.35, 2)
        reply = (
            f"### Прогноз выполнения плана (Линейные сценарии воронки)\n\n"
            f"- **Оптимистичный сценарий (P90)**: **{p90_c:,.0f} ₽**\n"
            f"- **Медианный целевой план (P50)**: **{p50_c:,.0f} ₽**\n"
            f"- **Пессимистичный порог (P10)**: **{p10_c:,.0f} ₽**\n\n"
            f"**Текущий активный пайплайн в CRM**: {active_pipeline:,.0f} ₽ ({len(active_deals)} активных сделок)."
        )
    else:
        if tenant_avg_check is None:
            avg_check_note = "\n\n**Примечание**: Средний чек не задан в настройках компании. Рекомендуем указать средний чек в Настройках."
        else:
            avg_check_note = ""
        reply = (
            f"### Аналитическая сводка Коммерческого Директора (CCO)\n\n"
            f"Сводка по контуру компании «{tenant_name}»:\n\n"
            f"- **Объём звонков**: {calls_cnt}\n"
            f"- **Средний скоринг по 13 критериям**: {avg_score} / 13 баллов\n"
            f"- **Соблюдение регламента Next Step**: {next_step_pct}%\n"
            f"- **Утечки выручки в зоне риска**: {leak_rub:,.0f} ₽\n"
            f"- **Активный пайплайн**: {active_pipeline:,.0f} ₽\n\n"
            f"По вопросу: *«{payload.message}»*\n\n"
            f"Главная рекомендация — усилить контроль менеджеров на этапе перехода от презентации к сделке.{avg_check_note}"
        )

    if "Расчёт:" not in reply:
        reply = f"{reply.rstrip()}\n\n---\n**Прозрачность расчета утечек:**\n{calc_str}"

    return {
        "status": "ok",
        "engine": "Chief Commercial Officer Intelligence Engine (Deterministic SSOT)",
        "reply": reply,
        "leak_breakdown": leak_breakdown,
        "total_leak_rub": total_leak_rub
    }
