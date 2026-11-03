"""
Deals Management API Router: Live Google Sheets Sync (raw_deals), SLA Risk Tracking, and WebSocket Updates.
Endpoints:
- GET /api/v1/deals: List real CRM deals with SLA risk status and CRM metadata
- POST /api/v1/deals/{id}/fix-next-step: Fix next contact step and resolve risk
"""

import logging
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from packages.database.models import CallRecording, Deal, DealStage, SubscriptionTier, Tenant, Workspace
from packages.database.session import get_db

import jwt
from ..auth import ALGORITHM, SECRET_KEY
from ..cache_client import (
    delete_cached_json_sync,
    get_cached_json_sync,
    set_cached_json_sync,
)
from ..services.crm_deal_normalizer import parse_numeric_price
from ..services.deal_keys import deal_pk_for, find_tenant_deal
from ..services.deal_sla import deal_sla_state, end_of_local_day_utc
from ..services.tz import tenant_tz
from ..tenant_registry import CLEAN_TEMPLATE_ID, get_tenant_config, get_tenant_spreadsheet_id
from ..websocket_manager import manager
from .admin_router import verify_admin_access

logger = logging.getLogger("deals_router")

router = APIRouter(prefix="/deals", tags=["Deals Management"])



class FixNextStepPayload(BaseModel):
    next_step_date: str | None = None


# In-memory cache for live deals from Google Sheets keyed by tenant_id (TTL: 15s)
_DEALS_CACHE: dict[str, dict[str, Any]] = {}


def get_service_account_path() -> Path | None:
    env_path = os.getenv("GOOGLE_SERVICE_ACCOUNT_PATH")
    if env_path and Path(env_path).exists():
        return Path(env_path)
    candidates = [
        Path("/opt/revops-enterprise-os/service_account.json"),
        Path(__file__).resolve().parent.parent.parent.parent / "revops-enterprise-os" / "service_account.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "service_account.json",
        Path(__file__).resolve().parent.parent.parent / "service_account.json",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _sla_fields(d: Deal) -> dict[str, Any]:
    """SLA state of a stored deal evaluated NOW (the stored is_at_risk goes stale between syncs)."""
    st = deal_sla_state(d)
    return {
        "sla_risk": st.at_risk,
        "days_in_stage": st.days_in_stage,
        "risk_reason": st.reason_text,
        "next_step_date": d.next_step_date.isoformat() if d.next_step_date else None,
    }


def parse_amount(val: Any) -> float:
    if val is None or val == "":
        return 0.0
    price, _ = parse_numeric_price(val)
    return price


def fetch_deals_from_sheets(tenant_id: str = "TNT-001", limit: int = 100) -> list[dict[str, Any]]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    now = time.time()
    cache_key = f"deals:{clean_tenant}"

    # 1. Check Redis cache first
    cached_redis = get_cached_json_sync(cache_key)
    if cached_redis is not None and isinstance(cached_redis, list) and len(cached_redis) > 0:
        if clean_tenant not in _DEALS_CACHE or not _DEALS_CACHE[clean_tenant].get("lookup"):
            redis_lookup: dict[str, dict[str, Any]] = {}
            for d in cached_redis:
                d_id = str(d.get("id") or "").upper().strip()
                if d_id:
                    redis_lookup[d_id] = d
                    num = re.sub(r"\D", "", d_id)
                    if num:
                        redis_lookup[num] = d
                        redis_lookup[f"B24-{num}"] = d
                        redis_lookup[f"AMO-{num}"] = d
            _DEALS_CACHE[clean_tenant] = {"timestamp": now, "deals": cached_redis, "lookup": redis_lookup}
        return cached_redis

    cached = _DEALS_CACHE.get(clean_tenant)
    if cached and (now - cached.get("timestamp", 0) < 15):
        return cached.get("deals", [])

    cfg = get_tenant_config(clean_tenant) or {}
    tenant_crm = str(cfg.get("crm_type") or "bitrix24").strip().lower()
    sheet_id = cfg.get("spreadsheet_id") or get_tenant_spreadsheet_id(clean_tenant)

    if clean_tenant in ("TNT-002", "TNT-CLEAN-001") or sheet_id == CLEAN_TEMPLATE_ID:
        empty_res: list[dict[str, Any]] = []
        _DEALS_CACHE[clean_tenant] = {"timestamp": now, "deals": empty_res, "lookup": {}}
        set_cached_json_sync(cache_key, empty_res, ex=60)
        return empty_res

    sa_path = get_service_account_path()
    if not sa_path:
        if cached and cached.get("deals"):
            return cached.get("deals", [])
        # Used to fill in 11 invented "golden master" deals (8.18 M ₽) for any tenant without data, so a missing
        # key file made every such client look like it had a pipeline. An unavailable source means NO data.
        # Not cached: the next request retries once the key file is back.
        logger.error(
            f"service_account.json not found: cannot read raw_deals (tenant: {clean_tenant}, crm: {tenant_crm}); "
            "returning no deals"
        )
        return []

    cfg = get_tenant_config(clean_tenant) or {}
    sheet_id = cfg.get("spreadsheet_id") or get_tenant_spreadsheet_id(clean_tenant)
    if not sheet_id:
        empty_res = []
        _DEALS_CACHE[clean_tenant] = {"timestamp": now, "deals": empty_res, "lookup": {}}
        set_cached_json_sync(cache_key, empty_res, ex=60)
        return empty_res

    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        ss = gc.open_by_key(sheet_id)
        ws = ss.worksheet("raw_deals")
        rows = ws.get_all_values()
        if len(rows) < 2:
            empty_res = []
            _DEALS_CACHE[clean_tenant] = {"timestamp": now, "deals": empty_res, "lookup": {}}
            set_cached_json_sync(cache_key, empty_res, ex=60)
            return empty_res

        deals = []
        lookup = {}
        # Header is row 0: deal_id, company_name, amount, stage_id, stage_name, created_at, updated_at, responsible_user, segment, source...
        for r in rows[1:]:
            if not r or not r[0]:
                continue
            deal_id = str(r[0]).strip()
            title = r[1] if len(r) > 1 and r[1] else f"Сделка {deal_id}"
            raw_amt = r[2] if len(r) > 2 and r[2] else "0 ₽"
            amt_num = parse_amount(raw_amt)
            stage_id = r[3] if len(r) > 3 and r[3] else "1"
            stage_name = r[4] if len(r) > 4 and r[4] else "Первичный контакт"
            created_at = r[5] if len(r) > 5 and r[5] else ""
            updated_at = r[6] if len(r) > 6 and r[6] else ""
            responsible = r[7] if len(r) > 7 and r[7] else "Менеджер"
            segment = r[8] if len(r) > 8 and r[8] else "General B2B"
            source = r[9] if len(r) > 9 and r[9] else "CRM"

            # Multi-source filtering based on tenant_crm config
            source_lower = source.lower()
            is_b24_deal = deal_id.upper().startswith("B24-") or deal_id.upper().startswith("BX_") or "bitrix" in source_lower or "b24" in source_lower
            is_amo_deal = deal_id.upper().startswith("AMO-") or "amo" in source_lower

            if tenant_crm == "bitrix24" and is_amo_deal and not is_b24_deal:
                continue
            if tenant_crm == "amocrm" and is_b24_deal and not is_amo_deal:
                continue
            # When tenant_crm in ("both", "hybrid", "all"), both pass through

            # Soft-delete & Won/Lost status detection
            is_won = str(r[14]).strip() if len(r) > 14 else "0"
            is_lost = str(r[15]).strip() if len(r) > 15 else "0"
            status_col = str(r[12]).strip().upper() if len(r) > 12 else ""
            is_deleted = "DELETED" in status_col or "удален" in stage_name.lower() or (len(r) > 36 and "DELETED" in str(r[36]).upper())

            if is_deleted:
                status = "deleted"
                sla_risk = False
            elif is_won == "1":
                status = "won"
                sla_risk = False
            elif is_lost == "1":
                status = "lost"
                sla_risk = False
            else:
                status = "active"
                sla_risk = ("Первичный" in stage_name or "КП" in stage_name or "Новый" in stage_name or stage_id in ("1", "2"))

            deal_obj = {
                "id": deal_id,
                "deal_id": deal_id,
                "org_id": clean_tenant,
                "crm_deal_id": deal_id,
                "crm_source": source,
                "title": title,
                "amount": amt_num,
                "amount_str": f"{int(amt_num):,} ₽".replace(",", " "),
                "stage_id": stage_id,
                "stage": stage_name,
                "status": status,
                "sla_risk": sla_risk,
                "responsible_user": responsible,
                "segment": segment,
                "created_at": created_at,
                "updated_at": updated_at,
                "synced_at": datetime.now(timezone.utc).isoformat(),
            }
            deals.append(deal_obj)

            # Build fast index keys
            clean_id = deal_id.upper()
            lookup[clean_id] = deal_obj
            num_only = re.sub(r"\D", "", clean_id)
            if num_only:
                lookup[num_only] = deal_obj
                lookup[f"B24-{num_only}"] = deal_obj
                lookup[f"BX_{num_only}"] = deal_obj
                lookup[f"AMO-{num_only}"] = deal_obj

        _DEALS_CACHE[clean_tenant] = {
            "timestamp": now,
            "deals": deals,
            "lookup": lookup
        }
        set_cached_json_sync(cache_key, deals, ex=60)
        return deals
    except Exception as e:
        logger.error(f"Error reading raw_deals from Google Sheets for tenant {clean_tenant}: {e}")
        return _DEALS_CACHE.get(clean_tenant, {}).get("deals", [])


def get_deals_lookup(tenant_id: str = "TNT-001") -> dict[str, dict[str, Any]]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    fetch_deals_from_sheets(tenant_id=clean_tenant)
    return _DEALS_CACHE.get(clean_tenant, {}).get("lookup", {})


def get_authenticated_tenant_or_verify_admin(request: Request, requested_tenant: str | None = None) -> str:
    """
    Extracts tenant_id strictly from auth-context (JWT token or admin context).
    Guards against cross-tenant URL tampering.
    """
    # 1. Check Bearer JWT token or access_token cookie
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    elif request.cookies.get("access_token"):
        token = request.cookies.get("access_token")

    if token:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            user_tenant = str(payload.get("tenant_id") or "").strip().upper()
            role_val = str(payload.get("role") or "").lower()
            sub_val = str(payload.get("sub") or "").lower()
            is_admin = bool(
                payload.get("is_admin")
                or "admin" in role_val
                or "админ" in role_val
                or "⚙️" in role_val
                or "супервайзер" in role_val
                or sub_val in ("admin", "dmitriyfedotov1908@gmail.com")
                or user_tenant == "*"
            )
            if is_admin:
                return (requested_tenant or user_tenant or "TNT-001").strip().upper()

            if user_tenant:
                # Prevent cross-tenant URL tampering for non-admin users
                if requested_tenant:
                    clean_req = requested_tenant.strip().upper()
                    if clean_req != user_tenant:
                        raise HTTPException(
                            status_code=403,
                            detail=f"Cross-tenant access forbidden: token belongs to {user_tenant}, cannot query {clean_req}"
                        )
                return user_tenant
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Токен истек или недействителен")

    # NOTE: the `revops_client_auth` cookie is an opaque, unvalidated string and must never grant tenant access.
    # 2. Check Admin Access (Admin cookie, X-Admin-Key, session, or internal docker network)
    verify_admin_access(request)
    return (requested_tenant or "TNT-001").strip().upper()


@router.get("/pipelines")
async def get_pipelines(
    request: Request,
    tenant_id: str | None = None,
    tenant: str | None = None,
    org_id: str | None = None,
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Returns all multi-pipelines with their dynamic stages, CRM colors, deal counts and budget totals."""
    requested = tenant_id or tenant or org_id
    effective_tenant = get_authenticated_tenant_or_verify_admin(request, requested)
    clean_tid = effective_tenant.strip().upper()

    # 1. Check Redis cache
    cache_key = f"pipelines:{clean_tid}"
    cached = get_cached_json_sync(cache_key)
    if cached is not None and isinstance(cached, dict):
        return cached

    # 2. Query tenant settings and DB deals
    t_obj = db.query(Tenant).filter(Tenant.id == clean_tid).first()
    t_settings: dict[str, Any] = dict(t_obj.settings) if (t_obj and isinstance(t_obj.settings, dict)) else {}
    stored_pipelines = t_settings.get("pipelines")

    db_deals = (
        db.query(Deal)
        .filter(
            (Deal.tenant_id == clean_tid)
            | (Deal.tenant_id == clean_tid.lower())
            | (Deal.tenant_id == clean_tid.upper())
        )
        .filter(Deal.is_deleted == False)
        .all()
    )

    # If no deals and no stored pipelines, try auto-syncing if CRM credentials configured
    if not db_deals and not stored_pipelines:
        cfg = get_tenant_config(clean_tid) or {}
        if cfg.get("amo_token") or cfg.get("bitrix_webhook_url"):
            try:
                from ..services.crm_deals_sync import sync_deals_for_tenant
                await sync_deals_for_tenant(clean_tid, db=db)
                t_obj = db.query(Tenant).filter(Tenant.id == clean_tid).first()
                t_settings_updated: dict[str, Any] = dict(t_obj.settings) if (t_obj and isinstance(t_obj.settings, dict)) else {}
                stored_pipelines = t_settings_updated.get("pipelines")
                db_deals = db.query(Deal).filter(Deal.tenant_id == clean_tid, Deal.is_deleted == False).all()
            except Exception as e_s:
                logger.warning(f"Auto-sync for pipelines failed: {e_s}")

    default_stages = [
        {"id": "1", "name": "Новый лид", "color": "#39A8EF", "sort": 10, "is_won": False, "is_lost": False},
        {"id": "2", "name": "Квалификация", "color": "#2FC6F6", "sort": 20, "is_won": False, "is_lost": False},
        {"id": "3", "name": "Встреча / Демо", "color": "#55D0E0", "sort": 30, "is_won": False, "is_lost": False},
        {"id": "4", "name": "КП / В работе", "color": "#47E4C2", "sort": 40, "is_won": False, "is_lost": False},
        {"id": "5", "name": "Финальный счёт / Договор", "color": "#FFA900", "sort": 50, "is_won": False, "is_lost": False},
        {"id": "6", "name": "Успешно реализовано", "color": "#7BD500", "sort": 60, "is_won": True, "is_lost": False},
        {"id": "7", "name": "Закрыто и не реализовано", "color": "#FF5752", "sort": 70, "is_won": False, "is_lost": True},
    ]

    pipelines_map: dict[str, dict[str, Any]] = {}
    if stored_pipelines and isinstance(stored_pipelines, list) and len(stored_pipelines) > 0:
        for p in stored_pipelines:
            p_id = str(p.get("id") or "0")
            pipelines_map[p_id] = {
                "id": p_id,
                "name": str(p.get("name") or "Основная воронка"),
                "is_main": bool(p.get("is_main")),
                "stages": [dict(s) for s in p.get("stages", [])],
                "deal_count": 0,
                "total_amount": 0.0,
                "won_amount": 0.0,
                "lost_amount": 0.0,
                "active_amount": 0.0,
                "sla_risk_count": 0,
            }

    # Group existing deals by pipeline and compute live aggregates
    for d in db_deals:
        p_id = str(d.pipeline_id or "0").strip()
        p_name = d.pipeline_name or "Основная воронка"
        if p_id not in pipelines_map:
            pipelines_map[p_id] = {
                "id": p_id,
                "name": p_name,
                "is_main": (p_id in ("0", "main", "1")),
                "stages": [],
                "deal_count": 0,
                "total_amount": 0.0,
                "won_amount": 0.0,
                "lost_amount": 0.0,
                "active_amount": 0.0,
                "sla_risk_count": 0,
            }

        amt = float(d.budget or 0.0)
        is_won = bool(d.stage == DealStage.WON or "успешно" in str(d.stage_name).lower())
        is_lost = bool(d.stage == DealStage.LOST or "закрыто" in str(d.stage_name).lower() or "отказ" in str(d.stage_name).lower())

        p_entry = pipelines_map[p_id]
        p_entry["deal_count"] += 1
        p_entry["total_amount"] += amt
        if is_won:
            p_entry["won_amount"] += amt
        elif is_lost:
            p_entry["lost_amount"] += amt
        else:
            p_entry["active_amount"] += amt

        if deal_sla_state(d).at_risk and not is_won and not is_lost:
            p_entry["sla_risk_count"] += 1

    # Ensure every pipeline has stages list populated with counts
    for p_id, p_entry in pipelines_map.items():
        if not p_entry["stages"]:
            p_entry["stages"] = [dict(s) for s in default_stages]

        # Calculate counts per stage
        for st in p_entry["stages"]:
            st_id = str(st.get("id") or "").strip()
            st_name = str(st.get("name") or "").strip().lower()
            matching_deals = [
                d for d in db_deals
                if str(d.pipeline_id or "0").strip() == p_id
                and (
                    str(d.stage_name or "").strip().lower() == st_name
                    or str(d.stage.value if d.stage else "").strip().lower() == st_name
                    or (st.get("is_won") and d.stage == DealStage.WON)
                    or (st.get("is_lost") and d.stage == DealStage.LOST)
                )
            ]
            st["deal_count"] = len(matching_deals)
            st["total_amount"] = sum(float(d.budget or 0.0) for d in matching_deals)

    result_pipelines = list(pipelines_map.values())
    if not result_pipelines:
        result_pipelines = [{
            "id": "0",
            "name": "Основная воронка",
            "is_main": True,
            "stages": [dict(s, deal_count=0, total_amount=0.0) for s in default_stages],
            "deal_count": 0,
            "total_amount": 0.0,
            "won_amount": 0.0,
            "lost_amount": 0.0,
            "active_amount": 0.0,
            "sla_risk_count": 0,
        }]

    # Sort pipelines: main first
    result_pipelines.sort(key=lambda p: (not p.get("is_main", False), p.get("name", "")))

    response_data = {
        "status": "ok",
        "tenant_id": clean_tid,
        "pipelines": result_pipelines,
        "total_pipelines": len(result_pipelines),
    }
    set_cached_json_sync(cache_key, response_data, ex=30)
    return response_data


@router.get("")
@router.get("/")
async def list_deals(
    request: Request,
    pipeline_id: str | None = None,
    stage_id: str | None = None,
    stage: str | None = None,
    loss_reason: str | None = None,
    search: str | None = None,
    sla_risk_only: bool = False,
    org_id: str | None = None,
    tenant_id: str | None = None,
    tenant: str | None = None,
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Returns active CRM deals with pipeline scoping, custom stages, and loss reasons."""
    requested = tenant_id or tenant or org_id
    effective_tenant = get_authenticated_tenant_or_verify_admin(request, requested)

    q = (
        db.query(Deal)
        .filter(
            (Deal.tenant_id == effective_tenant)
            | (Deal.tenant_id == effective_tenant.lower())
            | (Deal.tenant_id == effective_tenant.upper())
        )
        .filter(Deal.is_deleted == False)
    )

    if pipeline_id and pipeline_id not in ("all", "*"):
        matching_count = q.filter(Deal.pipeline_id == pipeline_id).count()
        if matching_count > 0:
            q = q.filter(Deal.pipeline_id == pipeline_id)
        elif pipeline_id not in ("0", "main", "default"):
            q = q.filter(Deal.pipeline_id == pipeline_id)
    if loss_reason:
        q = q.filter(Deal.loss_reason == loss_reason)

    db_deals = q.all()

    if not db_deals:
        cfg = get_tenant_config(effective_tenant) or {}
        has_crm = bool(cfg.get("amo_token") or cfg.get("bitrix_webhook_url"))
        if has_crm:
            try:
                from ..services.crm_deals_sync import sync_deals_for_tenant
                await sync_deals_for_tenant(effective_tenant, db=db)
                q2 = (
                    db.query(Deal)
                    .filter(
                        (Deal.tenant_id == effective_tenant)
                        | (Deal.tenant_id == effective_tenant.lower())
                        | (Deal.tenant_id == effective_tenant.upper())
                    )
                    .filter(Deal.is_deleted == False)
                )
                if pipeline_id and pipeline_id not in ("all", "*"):
                    matching_count2 = q2.filter(Deal.pipeline_id == pipeline_id).count()
                    if matching_count2 > 0:
                        q2 = q2.filter(Deal.pipeline_id == pipeline_id)
                    elif pipeline_id not in ("0", "main", "default"):
                        q2 = q2.filter(Deal.pipeline_id == pipeline_id)
                if loss_reason:
                    q2 = q2.filter(Deal.loss_reason == loss_reason)
                db_deals = q2.all()
            except Exception as e_sync:
                logger.warning(f"Auto deal sync on query failed for {effective_tenant}: {e_sync}")

    if db_deals:
        source = "database"
        all_deals = []
        for d in db_deals:
            is_won = bool(d.stage == DealStage.WON or "успешно" in str(d.stage_name).lower())
            is_lost = bool(d.stage == DealStage.LOST or "закрыто" in str(d.stage_name).lower() or "отказ" in str(d.stage_name).lower())
            deal_status = "won" if is_won else ("lost" if is_lost else "active")

            # Map stage order 1..8
            stage_order = 1
            if d.stage == DealStage.LEAD_INCOMING:
                stage_order = 1
            elif d.stage == DealStage.QUALIFICATION:
                stage_order = 2
            elif d.stage == DealStage.MEETING_SCHEDULED:
                stage_order = 3
            elif d.stage == DealStage.MEETING_DONE:
                stage_order = 4
            elif d.stage in (DealStage.COMMERCIAL_PROPOSAL, DealStage.DECISION_MAKING):
                stage_order = 5
            elif d.stage == DealStage.CONTRACT_PAYMENT:
                stage_order = 6
            elif is_won:
                stage_order = 7
            elif is_lost:
                stage_order = 8

            manager_name = (
                d.assigned_user.full_name
                if d.assigned_user
                else ((d.custom_payload.get("manager_name") if isinstance(d.custom_payload, dict) else None) or "Менеджер")
            )

            all_deals.append({
                "id": d.id,
                "deal_id": d.id,
                "org_id": effective_tenant,
                "tenant_id": effective_tenant,
                "crm_deal_id": d.external_crm_id or d.id,
                "crm_source": d.crm_source or d.lead_source or "CRM",
                "title": d.title,
                "company_name": d.company_name or d.title,
                "contact_phone": d.contact_phone or "",
                "amount": float(d.budget),
                "amount_str": f"{int(d.budget):,} ₽".replace(",", " "),
                "pipeline_id": d.pipeline_id or "0",
                "pipeline_name": d.pipeline_name or "Основная воронка",
                "stage_id": str(d.stage_name or (d.stage.value if d.stage else "1")),
                "stage_name": d.stage_name or (d.stage.value if d.stage else "Первичный контакт"),
                "stage": d.stage.value if d.stage else "Первичный контакт",
                "stage_order": stage_order,
                "status": deal_status,
                "loss_reason": d.loss_reason or "",
                "loss_reason_code": d.loss_reason_code or "",
                **_sla_fields(d),
                "responsible_user": manager_name,
                "manager_name": manager_name,
                "segment": "General B2B",
                "calls_count": len(d.calls) if hasattr(d, "calls") and d.calls else 0,
                "avg_call_score": float(d.avg_call_score or 0.0),
                "created_at": d.created_at.isoformat() if d.created_at else "",
                "updated_at": d.updated_at.isoformat() if d.updated_at else "",
                "synced_at": datetime.now(timezone.utc).isoformat(),
            })
    else:
        is_demo_tenant = str(effective_tenant).lower().startswith("demo_") or str(effective_tenant).lower().startswith("demo-")
        all_deals = [] if is_demo_tenant else fetch_deals_from_sheets(tenant_id=effective_tenant)
        source = "google_sheets_raw_deals"

    results = all_deals
    if stage_id:
        results = [d for d in results if str(d.get("stage_id")) == str(stage_id) or str(d.get("stage_name")) == str(stage_id)]
    if stage:
        results = [d for d in results if d.get("stage") == stage or d.get("stage_name") == stage]
    if loss_reason:
        results = [d for d in results if d.get("loss_reason") == loss_reason]
    if search:
        s_clean = search.strip().lower()
        results = [
            d for d in results
            if s_clean in str(d.get("title", "")).lower()
            or s_clean in str(d.get("company_name", "")).lower()
            or s_clean in str(d.get("responsible_user", "")).lower()
            or s_clean in str(d.get("deal_id", "")).lower()
        ]
    if sla_risk_only:
        results = [d for d in results if d.get("sla_risk")]

    return {
        "status": "ok",
        "tenant_id": effective_tenant,
        "source": source,
        "deals": results,
        "total": len(results),
        "sla_risk_count": sum(1 for d in results if d.get("sla_risk")),
        "total_amount": sum(d.get("amount", 0) for d in results)
    }


SYSTEM_BOT_NAMES = {
    "автоответчик", "недозвон", "не представился",
    "неизвестный", "неизвестно", "менеджер", "-", ""
}


def is_system_rep_name(name: str | None) -> bool:
    if not name:
        return True
    return name.strip().lower() in SYSTEM_BOT_NAMES


@router.get("/performance/reps")
async def get_reps_performance(
    request: Request,
    pipeline_id: str | None = None,
    org_id: str | None = None,
    tenant_id: str | None = None,
    tenant: str | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Returns aggregated sales performance and speech DNA per sales rep.
    Includes AOV, Win Rate, P50 Cycle Days, Speech Score, and Benchmark Leader analysis.
    """
    import statistics

    requested = tenant_id or tenant or org_id
    effective_tenant = get_authenticated_tenant_or_verify_admin(request, requested)

    # 1. Query Deals
    q = (
        db.query(Deal)
        .filter(
            (Deal.tenant_id == effective_tenant)
            | (Deal.tenant_id == effective_tenant.lower())
            | (Deal.tenant_id == effective_tenant.upper())
        )
        .filter(Deal.is_deleted == False)
    )
    if pipeline_id and pipeline_id not in ("all", "*"):
        q = q.filter(Deal.pipeline_id == pipeline_id)
    db_deals = q.all()

    deals_data: list[dict[str, Any]] = []
    if db_deals:
        for d in db_deals:
            is_won = bool(d.stage == DealStage.WON or "успешно" in str(d.stage_name).lower())
            is_lost = bool(d.stage == DealStage.LOST or "закрыто" in str(d.stage_name).lower() or "отказ" in str(d.stage_name).lower())
            status = "won" if is_won else ("lost" if is_lost else "active")
            mgr = (
                d.assigned_user.full_name
                if d.assigned_user
                else ((d.custom_payload.get("manager_name") if isinstance(d.custom_payload, dict) else None)
                      or (d.custom_payload.get("responsible_user") if isinstance(d.custom_payload, dict) else None)
                      or "Менеджер")
            )
            deals_data.append({
                "id": d.id,
                "amount": float(d.budget or 0.0),
                "status": status,
                "manager": str(mgr).strip(),
                "created_at": d.created_at,
                "updated_at": d.updated_at,
                "sla_risk": deal_sla_state(d).at_risk if status == "active" else False,
            })
    else:
        is_demo_tenant = str(effective_tenant).lower().startswith("demo_") or str(effective_tenant).lower().startswith("demo-")
        sheet_deals = [] if is_demo_tenant else fetch_deals_from_sheets(tenant_id=effective_tenant)
        for sd in sheet_deals:
            st = str(sd.get("status", "active")).lower()
            amt = float(sd.get("amount", 0.0) or 0.0)
            mgr = str(sd.get("responsible_user") or sd.get("manager_name") or "Менеджер").strip()
            deals_data.append({
                "id": str(sd.get("id", "")),
                "amount": amt,
                "status": st,
                "manager": mgr,
                "created_at": None,
                "updated_at": None,
                "sla_risk": bool(sd.get("sla_risk", False)) if st == "active" else False,
            })

    # 2. Query CallRecordings for Speech AI Correlation
    call_q = (
        db.query(CallRecording)
        .filter(
            (CallRecording.tenant_id == effective_tenant)
            | (CallRecording.tenant_id == effective_tenant.lower())
            | (CallRecording.tenant_id == effective_tenant.upper())
        )
    )
    db_calls = call_q.all()

    rep_calls_map: dict[str, list[dict[str, Any]]] = {}
    for c in db_calls:
        c_mgr = None
        if c.manager_id and c.manager:
            c_mgr = c.manager.full_name
        elif c.ai_summary and isinstance(c.ai_summary, str) and "manager_name" in c.ai_summary:
            try:
                import json
                summary_obj = json.loads(c.ai_summary)
                c_mgr = summary_obj.get("manager_name")
            except Exception:
                pass
        if not c_mgr or is_system_rep_name(c_mgr):
            continue
        c_mgr_clean = c_mgr.strip()
        if c_mgr_clean not in rep_calls_map:
            rep_calls_map[c_mgr_clean] = []

        score_val = None
        cr_arr = None
        next_step_val = 0
        if c.ai_summary:
            try:
                import json
                sum_data = json.loads(c.ai_summary) if isinstance(c.ai_summary, str) else c.ai_summary
                score_val = sum_data.get("score") or sum_data.get("overall_score")
                cr_arr = sum_data.get("cr")
                if sum_data.get("next_step") == 1 or sum_data.get("zoom_scheduled"):
                    next_step_val = 1
            except Exception:
                pass
        rep_calls_map[c_mgr_clean].append({
            "score": score_val,
            "cr": cr_arr,
            "next_step": next_step_val,
        })

    # 3. Aggregate per Manager
    all_managers = set()
    for deal_item in deals_data:
        mgr_name_str = str(deal_item.get("manager") or "")
        if not is_system_rep_name(mgr_name_str):
            all_managers.add(mgr_name_str)
    for m in rep_calls_map.keys():
        if not is_system_rep_name(m):
            all_managers.add(m)

    reps_list: list[dict[str, Any]] = []
    total_team_won = 0.0
    total_team_won_count = 0
    total_team_lost_count = 0
    all_cycle_days: list[float] = []

    for mgr in sorted(all_managers):
        m_deals = [di for di in deals_data if str(di.get("manager")) == mgr]
        won_deals = [di for di in m_deals if str(di.get("status")) == "won"]
        lost_deals = [di for di in m_deals if str(di.get("status")) == "lost"]
        active_deals = [di for di in m_deals if str(di.get("status")) == "active"]

        won_amount = sum(float(di.get("amount") or 0.0) for di in won_deals)
        won_count = len(won_deals)
        lost_count = len(lost_deals)
        active_count = len(active_deals)
        total_deals = len(m_deals)

        total_team_won += won_amount
        total_team_won_count += won_count
        total_team_lost_count += lost_count

        avg_deal_amount = round(won_amount / won_count, 2) if won_count > 0 else 0.0

        closed_count = won_count + lost_count
        win_rate_pct = round((won_count / closed_count) * 100, 1) if closed_count > 0 else 0.0
        gross_conv_pct = round((won_count / total_deals) * 100, 1) if total_deals > 0 else 0.0

        mgr_cycles: list[float] = []
        for wd in won_deals:
            c_at = wd.get("created_at")
            u_at = wd.get("updated_at")
            if isinstance(c_at, datetime) and isinstance(u_at, datetime):
                try:
                    delta_d = (u_at - c_at).total_seconds() / 86400.0
                    if delta_d >= 0:
                        mgr_cycles.append(round(delta_d, 1))
                        all_cycle_days.append(round(delta_d, 1))
                except Exception:
                    pass
        cycle_days_median = round(float(statistics.median(mgr_cycles)), 1) if mgr_cycles else None
        sla_risk_amt = sum(float(di.get("amount") or 0.0) for di in active_deals if di.get("sla_risk"))

        m_calls = rep_calls_map.get(mgr, [])
        scored_calls = [c for c in m_calls if c.get("score") is not None]
        speech_score_avg = (
            round(sum(float(c.get("score") or 0.0) for c in scored_calls) / len(scored_calls), 1)
            if scored_calls
            else None
        )
        next_step_calls = [c for c in m_calls if c["next_step"] == 1]
        next_step_pct = (
            round((len(next_step_calls) / len(m_calls)) * 100, 1)
            if m_calls
            else 0.0
        )

        sample_size_ok = closed_count >= 3 or total_deals >= 5

        reps_list.append({
            "manager_name": mgr,
            "won_amount": won_amount,
            "won_count": won_count,
            "lost_count": lost_count,
            "active_count": active_count,
            "total_deals": total_deals,
            "avg_deal_amount": avg_deal_amount,
            "win_rate_pct": win_rate_pct,
            "gross_conversion_pct": gross_conv_pct,
            "cycle_days_median": cycle_days_median,
            "sla_risk_amount": sla_risk_amt,
            "calls_count": len(m_calls),
            "speech_score_avg": speech_score_avg,
            "next_step_pct": next_step_pct,
            "sample_size_ok": sample_size_ok,
            "success_driver": "",
            "weak_spot": "",
        })

    reps_list.sort(key=lambda r: (r["won_amount"], r["win_rate_pct"], r["won_count"]), reverse=True)

    team_closed = total_team_won_count + total_team_lost_count
    team_win_rate = round((total_team_won_count / team_closed) * 100, 1) if team_closed > 0 else 0.0
    team_avg_check = round(total_team_won / total_team_won_count, 2) if total_team_won_count > 0 else 0.0
    team_cycle_median = round(statistics.median(all_cycle_days), 1) if all_cycle_days else None

    all_scores = [r["speech_score_avg"] for r in reps_list if r["speech_score_avg"] is not None]
    team_avg_speech = round(sum(all_scores) / len(all_scores), 1) if all_scores else None

    benchmark_leader = None
    if reps_list:
        candidates = [r for r in reps_list if r["won_count"] > 0]
        leader = candidates[0] if candidates else reps_list[0]

        aov_delta_pct = (
            round(((leader["avg_deal_amount"] - team_avg_check) / team_avg_check) * 100)
            if team_avg_check > 0
            else 0
        )
        win_rate_delta = round(leader["win_rate_pct"] - team_win_rate, 1)

        drivers = []
        if aov_delta_pct > 0:
            drivers.append(f"Средний чек выше нормы отдела (+{aov_delta_pct}%)")
        if win_rate_delta > 0:
            drivers.append(f"Высокая конверсия дожима ({leader['win_rate_pct']}% vs {team_win_rate}% по отделу)")
        if leader["cycle_days_median"] and team_cycle_median and leader["cycle_days_median"] < team_cycle_median:
            drivers.append(f"Быстрый цикл сделки ({leader['cycle_days_median']} дн. vs {team_cycle_median} дн.)")
        if leader["next_step_pct"] >= 75:
            drivers.append(f"Дисциплина закрытия на следующий шаг (Next Step {leader['next_step_pct']}%)")

        benchmark_leader = {
            "name": leader["manager_name"],
            "won_amount": leader["won_amount"],
            "won_count": leader["won_count"],
            "avg_deal_amount": leader["avg_deal_amount"],
            "win_rate_pct": leader["win_rate_pct"],
            "cycle_days_median": leader["cycle_days_median"],
            "speech_score_avg": leader["speech_score_avg"],
            "aov_delta_pct": aov_delta_pct,
            "win_rate_delta": win_rate_delta,
            "drivers": drivers or ["Лидер по общему объёму поступлений в кассу"],
            "summary": (
                f"{leader['manager_name']} лидирует в пайплайне с выручкой {int(leader['won_amount']):,} ₽. "
                + (f"Ключевой фактор — {drivers[0].lower()}." if drivers else "")
            ).replace(",", " "),
        }

    for r in reps_list:
        if r["sample_size_ok"]:
            if r["win_rate_pct"] >= team_win_rate and r["win_rate_pct"] > 0:
                r["success_driver"] = "Высокая дожимаемость (Win Rate)"
            elif r["avg_deal_amount"] >= team_avg_check and r["avg_deal_amount"] > 0:
                r["success_driver"] = "Крупный средний чек"
            elif r["next_step_pct"] >= 80:
                r["success_driver"] = "Эталонная фиксация Next Step"
            else:
                r["success_driver"] = "Стабильная работа по скрипту"

            if r["sla_risk_amount"] > 0:
                r["weak_spot"] = f"Зависание сделок в SLA ({int(r['sla_risk_amount']):,} ₽)".replace(",", " ")
            elif r["next_step_pct"] < 60 and r["calls_count"] > 0:
                r["weak_spot"] = "Потеря инициативы (Next Step < 60%)"
            elif r["cycle_days_median"] and team_cycle_median and r["cycle_days_median"] > team_cycle_median * 1.5:
                r["weak_spot"] = f"Затягивание цикла ({r['cycle_days_median']} дн.)"
            elif r["win_rate_pct"] < team_win_rate and r["lost_count"] > 0:
                r["weak_spot"] = "Сливы на этапе согласования"
            else:
                r["weak_spot"] = "Нормативный темп"
        else:
            r["success_driver"] = "Накопление статистики"
            r["weak_spot"] = "Мало данных (n < 3)"

    return {
        "status": "ok",
        "tenant_id": effective_tenant,
        "total_reps": len(reps_list),
        "reps": reps_list,
        "team_benchmarks": {
            "total_won_amount": total_team_won,
            "avg_deal_amount": team_avg_check,
            "win_rate_pct": team_win_rate,
            "cycle_days_median": team_cycle_median,
            "speech_score_avg": team_avg_speech,
        },
        "benchmark_leader": benchmark_leader,
    }


@router.get("/{deal_id}")
async def get_deal_details(
    deal_id: str,
    request: Request,
    tenant_id: str | None = None,
    tenant: str | None = None,
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Returns single deal details including linked audio call recordings with 13-criteria scorecards."""
    clean_id = deal_id.strip()
    requested = tenant_id or tenant
    effective_tenant = get_authenticated_tenant_or_verify_admin(request, requested)
    clean_tid = effective_tenant.strip().upper()

    # Look inside the caller's own tenant only: CRM ids repeat between clients, and a bare-id lookup
    # used to return (or 403 on) another client's deal.
    db_deal = None
    for candidate_id in (clean_id, f"B24-{clean_id}", f"AMO-{clean_id}"):
        if clean_tid == "*":
            db_deal = db.query(Deal).filter((Deal.id == candidate_id) | (Deal.external_crm_id == candidate_id)).first()
        else:
            db_deal = find_tenant_deal(db, clean_tid, candidate_id)
        if db_deal:
            break

    if db_deal:
        deal_tenant = str(db_deal.tenant_id).upper()
        if deal_tenant != clean_tid and clean_tid != "*":
            raise HTTPException(status_code=403, detail="Cross-tenant access forbidden")

        deal_match_conditions = [CallRecording.deal_id == db_deal.id]
        if db_deal.external_crm_id and str(db_deal.external_crm_id).strip():
            deal_match_conditions.append(CallRecording.deal_id == str(db_deal.external_crm_id).strip())

        calls = (
            db.query(CallRecording)
            .filter(
                CallRecording.tenant_id == deal_tenant,
                or_(*deal_match_conditions)
            )
            .order_by(CallRecording.created_at.desc())
            .all()
        )
        if not calls and db_deal.contact_phone:
            calls = (
                db.query(CallRecording)
                .filter(CallRecording.tenant_id == deal_tenant, CallRecording.client_phone == db_deal.contact_phone)
                .order_by(CallRecording.created_at.desc())
                .all()
            )

        linked_calls = [
            {
                "id": c.id,
                "external_call_id": c.external_call_id,
                "client_phone": c.client_phone,
                "duration_seconds": c.duration_seconds,
                "duration_str": f"{c.duration_seconds // 60}:{c.duration_seconds % 60:02d}",
                "status": c.status,
                "overall_score": float(c.overall_score or 0.0),
                "scorecard_criteria": c.scorecard_criteria or {},
                "transcript_text": c.transcript_text or "",
                "ai_summary": c.ai_summary or "",
                "next_action_extracted": c.next_action_extracted or "",
                "audio_s3_url": c.audio_s3_url,
                "created_at": c.created_at.isoformat() if c.created_at else "",
            }
            for c in calls
        ]

        manager_name = (
            db_deal.assigned_user.full_name
            if db_deal.assigned_user
            else ((db_deal.custom_payload.get("manager_name") if isinstance(db_deal.custom_payload, dict) else None) or "Не назначен")
        )

        return {
            "status": "ok",
            "deal": {
                "id": db_deal.id,
                "deal_id": db_deal.id,
                "org_id": db_deal.tenant_id,
                "tenant_id": db_deal.tenant_id,
                "crm_deal_id": db_deal.external_crm_id or db_deal.id,
                "crm_source": db_deal.crm_source or "crm",
                "title": db_deal.title,
                "company_name": db_deal.company_name or db_deal.title,
                "contact_phone": db_deal.contact_phone or "",
                "amount": float(db_deal.budget),
                "amount_str": f"{int(db_deal.budget):,} ₽".replace(",", " "),
                "pipeline_id": db_deal.pipeline_id or "0",
                "pipeline_name": db_deal.pipeline_name or "Основная воронка",
                "stage_id": str(db_deal.stage_name or (db_deal.stage.value if db_deal.stage else "1")),
                "stage_name": db_deal.stage_name or (db_deal.stage.value if db_deal.stage else "Первичный контакт"),
                "stage": db_deal.stage.value if db_deal.stage else "Первичный контакт",
                "status": "won" if (db_deal.stage == DealStage.WON or "успешно" in str(db_deal.stage_name).lower()) else ("lost" if (db_deal.stage == DealStage.LOST or "закрыто" in str(db_deal.stage_name).lower() or "отказ" in str(db_deal.stage_name).lower()) else "active"),
                "loss_reason": db_deal.loss_reason or "",
                "loss_reason_code": db_deal.loss_reason_code or "",
                **_sla_fields(db_deal),
                "responsible_user": manager_name,
                "manager_name": manager_name,
                "created_at": db_deal.created_at.isoformat() if db_deal.created_at else "",
                "updated_at": db_deal.updated_at.isoformat() if db_deal.updated_at else "",
                "custom_payload": db_deal.custom_payload or {},
                "calls": linked_calls,
                "calls_count": len(linked_calls),
            }
        }

    lookup = get_deals_lookup(clean_tid)
    found = lookup.get(clean_id.upper())
    if not found:
        num = re.sub(r"\D", "", clean_id)
        if num:
            found = lookup.get(num) or lookup.get(f"B24-{num}") or lookup.get(f"AMO-{num}")

    if found:
        return {
            "status": "ok",
            "deal": dict(found, calls=[], calls_count=0)
        }

    raise HTTPException(status_code=404, detail=f"Сделка {deal_id} не найдена")


# Track per-tenant sync timestamps for backend rate-limiting (30s cooldown)
_TENANT_LAST_SYNC: dict[str, float] = {}
SYNC_RATE_LIMIT_COOLDOWN_SEC = 30.0


@router.post("/sync")
async def sync_deals(
    request: Request,
    tenant_id: str | None = None,
    tenant: str | None = None,
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Triggers on-demand synchronization of CRM deals for tenant from amoCRM / Bitrix24."""
    import time
    requested = tenant_id or tenant
    effective_tenant = get_authenticated_tenant_or_verify_admin(request, requested)

    # Per-tenant rate limiting: return 429 if called within cooldown window
    now = time.time()
    last_sync = _TENANT_LAST_SYNC.get(effective_tenant, 0.0)
    elapsed = now - last_sync
    if elapsed < SYNC_RATE_LIMIT_COOLDOWN_SEC:
        retry_after = max(1, int(SYNC_RATE_LIMIT_COOLDOWN_SEC - elapsed))
        raise HTTPException(
            status_code=429,
            detail=f"Синхронизация для тенанта {effective_tenant} уже выполнялась менее {int(SYNC_RATE_LIMIT_COOLDOWN_SEC)} сек. назад. Повторите попытку через {retry_after} сек.",
            headers={"Retry-After": str(retry_after)}
        )

    _TENANT_LAST_SYNC[effective_tenant] = now
    from ..services.crm_deals_sync import sync_deals_for_tenant
    return await sync_deals_for_tenant(effective_tenant, db=db)


STAGE_MAPPING: dict[str, DealStage] = {
    # Direct mappings required by specification (Bitrix24)
    "NEW": DealStage.LEAD_INCOMING,
    "PREPARATION": DealStage.QUALIFICATION,
    "PREPAYMENT": DealStage.MEETING_SCHEDULED,
    "EXECUTING": DealStage.MEETING_DONE,
    "FINAL": DealStage.CONTRACT_PAYMENT,
    "WON": DealStage.WON,
    "LOSE": DealStage.LOST,
    "LOST": DealStage.LOST,
    # Common CRM numeric and stage identifiers (amoCRM & standard)
    "1": DealStage.LEAD_INCOMING,
    "2": DealStage.QUALIFICATION,
    "3": DealStage.MEETING_SCHEDULED,
    "4": DealStage.MEETING_DONE,
    "5": DealStage.COMMERCIAL_PROPOSAL,
    "6": DealStage.WON,
    "7": DealStage.LOST,
    # amoCRM specific pipeline stages
    "142": DealStage.WON,
    "143": DealStage.LOST,
    # Standard DealStage enum name/values
    "LEAD_INCOMING": DealStage.LEAD_INCOMING,
    "QUALIFICATION": DealStage.QUALIFICATION,
    "MEETING_SCHEDULED": DealStage.MEETING_SCHEDULED,
    "MEETING_DONE": DealStage.MEETING_DONE,
    "COMMERCIAL_PROPOSAL": DealStage.COMMERCIAL_PROPOSAL,
    "DECISION_MAKING": DealStage.DECISION_MAKING,
    "CONTRACT_PAYMENT": DealStage.CONTRACT_PAYMENT,
    # Russian display labels
    "ВХОДЯЩИЙ ЛИД": DealStage.LEAD_INCOMING,
    "ПЕРВИЧНЫЙ КОНТАКТ": DealStage.LEAD_INCOMING,
    "КВАЛИФИКАЦИЯ": DealStage.QUALIFICATION,
    "КВАЛИФИКАЦИЯ / SDR": DealStage.QUALIFICATION,
    "ВСТРЕЧА НАЗНАЧЕНА": DealStage.MEETING_SCHEDULED,
    "КЭВ / ВСТРЕЧА НАЗНАЧЕНА": DealStage.MEETING_SCHEDULED,
    "ВСТРЕЧА ПРОВЕДЕНА": DealStage.MEETING_DONE,
    "КП ОТПРАВЛЕНО": DealStage.COMMERCIAL_PROPOSAL,
    "ПРЕДЛОЖЕНИЕ": DealStage.COMMERCIAL_PROPOSAL,
    "КП": DealStage.COMMERCIAL_PROPOSAL,
    "ПРИНЯТИЕ РЕШЕНИЯ": DealStage.DECISION_MAKING,
    "ДОГОВОР": DealStage.CONTRACT_PAYMENT,
    "ДОГОВОР / СЧЁТ": DealStage.CONTRACT_PAYMENT,
    "ДОГОВОР / СЧЕТ": DealStage.CONTRACT_PAYMENT,
    "УСПЕШНО РЕАЛИЗОВАНО": DealStage.WON,
    "ЗАКРЫТО И НЕ РЕАЛИЗОВАНО": DealStage.LOST,
}


def map_deal_stage(stage_raw: Any, is_won: bool = False, is_lost: bool = False) -> DealStage:
    """Maps arbitrary incoming stage string from CRM or n8n to strict Postgres DealStage enum."""
    if is_won:
        return DealStage.WON
    if is_lost:
        return DealStage.LOST
    if isinstance(stage_raw, DealStage):
        return stage_raw
    stage_str = str(stage_raw or "").strip().upper()
    if stage_str in STAGE_MAPPING:
        return STAGE_MAPPING[stage_str]
    # Custom stage heuristics (map to DealStage.COMMERCIAL_PROPOSAL or DealStage.LEAD_INCOMING)
    if any(k in stage_str for k in ("КП", "PROPOSAL", "ПРЕДЛОЖЕН")):
        return DealStage.COMMERCIAL_PROPOSAL
    if any(k in stage_str for k in ("ВСТРЕЧ", "MEETING", "КЭВ")):
        return DealStage.MEETING_SCHEDULED
    if any(k in stage_str for k in ("ДОГОВОР", "СЧЕТ", "СЧЁТ", "INVOICE", "CONTRACT")):
        return DealStage.CONTRACT_PAYMENT
    if any(k in stage_str for k in ("КВАЛИФ", "QUALIF")):
        return DealStage.QUALIFICATION
    if any(k in stage_str for k in ("РЕШЕНИ", "DECISION")):
        return DealStage.DECISION_MAKING
    if any(k in stage_str for k in ("УСПЕШ", "SUCCESS", "WON")):
        return DealStage.WON
    if any(k in stage_str for k in ("ОТКАЗ", "ПРОИГР", "ЗАКРЫТ", "FAIL", "LOST")):
        return DealStage.LOST
    # Default fallback per specification: COMMERCIAL_PROPOSAL if KP-related, else LEAD_INCOMING
    return DealStage.LEAD_INCOMING


@router.post("/ingest")
async def ingest_deal(
    request: Request,
    payload: dict,
    tenant_id: str | None = None,
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    deal_id = payload.get("deal_id") or payload.get("id")
    clean_tid = tenant_id if isinstance(tenant_id, str) and tenant_id.strip() else None
    effective_tenant = str(clean_tid or payload.get("tenant_id") or "TNT-001").strip().upper()
    if not deal_id:
        raise HTTPException(status_code=400, detail="deal_id is required")

    # Check authentication & cross-tenant write security
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        try:
            jwt_data = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            jwt_tenant = str(jwt_data.get("tenant_id") or "").strip().upper()
            role_val = str(jwt_data.get("role") or "").lower()
            sub_val = str(jwt_data.get("sub") or "").lower()
            is_admin = bool(
                jwt_data.get("is_admin")
                or "admin" in role_val
                or "админ" in role_val
                or "⚙️" in role_val
                or "супервайзер" in role_val
                or sub_val in ("admin", "dmitriyfedotov1908@gmail.com")
                or jwt_tenant == "*"
            )
            if jwt_tenant and jwt_tenant != effective_tenant and not is_admin:
                raise HTTPException(
                    status_code=403,
                    detail=f"Cross-tenant write forbidden: token belongs to {jwt_tenant}, cannot ingest into {effective_tenant}"
                )
        except jwt.PyJWTError:
            raise HTTPException(status_code=401, detail="Токен истек или недействителен")
    else:
        # Protect endpoint: allow local n8n / docker network or require admin auth
        client_ip = request.client.host if request.client else ""
        cf_connecting_ip = request.headers.get("cf-connecting-ip") if hasattr(request, "headers") else None
        if not cf_connecting_ip and (
            client_ip in ("127.0.0.1", "::1", "localhost", "testclient")
            or client_ip.startswith("172.")
            or client_ip.startswith("10.")
        ):
            pass
        else:
            verify_admin_access(request)

    # 1. Foreign Key Guard for Tenant: ensure Tenant exists in DB before Workspace / Deal
    tenant = db.query(Tenant).filter(Tenant.id == effective_tenant).first()
    if not tenant:
        cfg = get_tenant_config(effective_tenant) or {}
        t_name = cfg.get("tenant_name") or f"Tenant {effective_tenant}"
        tenant = Tenant(
            id=effective_tenant,
            name=t_name,
            slug=effective_tenant.lower().replace("_", "-"),
            tier=SubscriptionTier.PRO,
            is_active=True,
            settings=cfg
        )
        db.add(tenant)
        try:
            db.commit()
            db.refresh(tenant)
        except Exception as e_t:
            db.rollback()
            tenant = db.query(Tenant).filter(Tenant.id == effective_tenant).first()
            if not tenant:
                logger.error(f"Failed to provision tenant {effective_tenant}: {e_t}")
                raise HTTPException(status_code=500, detail=f"Failed to provision tenant {effective_tenant}: {e_t}")

    # 2. Workspace lookup / creation
    workspace_id = payload.get("workspace_id")
    workspace = None
    if workspace_id:
        workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        workspace = db.query(Workspace).filter(Workspace.tenant_id == effective_tenant).first()
    if not workspace:
        cfg = get_tenant_config(effective_tenant) or {}
        raw_crm = (
            payload.get("crm_source")
            or payload.get("source")
            or payload.get("channel")
            or cfg.get("crm_type")
            or "bitrix24"
        )
        crm_str = str(raw_crm).strip().lower()
        crm_source = "amocrm" if "amo" in crm_str else ("bitrix24" if ("bitrix" in crm_str or "b24" in crm_str) else crm_str)

        ws_id = f"ws_{effective_tenant}"
        workspace = Workspace(
            id=ws_id,
            tenant_id=effective_tenant,
            name="Default Workspace",
            crm_type=crm_source
        )
        db.add(workspace)
        try:
            db.commit()
            db.refresh(workspace)
        except Exception as e_w:
            db.rollback()
            workspace = db.query(Workspace).filter(Workspace.id == ws_id).first()
            if not workspace:
                workspace = db.query(Workspace).filter(Workspace.tenant_id == effective_tenant).first()
            if not workspace:
                logger.error(f"Failed to provision workspace for tenant {effective_tenant}: {e_w}")
                raise HTTPException(status_code=500, detail=f"Failed to provision workspace: {e_w}")
    workspace_id = workspace.id

    # 3. Stage enum mapping and normalization
    raw_stage = (
        payload.get("stage")
        or payload.get("stage_id")
        or payload.get("STAGE_ID")
        or payload.get("stage_name")
        or ""
    )
    raw_status = str(payload.get("status") or "").upper()
    is_won = (
        str(payload.get("is_won", "0")) in ("1", "true", "True")
        or raw_status in ("WON", "SUCCESS")
        or str(raw_stage).upper() in ("WON", "SUCCESS")
    )
    is_lost = (
        str(payload.get("is_lost", "0")) in ("1", "true", "True")
        or raw_status in ("LOST", "LOSE", "FAIL", "FAILED")
        or str(raw_stage).upper() in ("LOST", "LOSE", "FAIL", "FAILED")
    )
    stage_enum = map_deal_stage(raw_stage, is_won=is_won, is_lost=is_lost)

    title = payload.get("company_name") or payload.get("title") or f"Сделка {deal_id}"
    amt_raw = payload.get("amount") if payload.get("amount") is not None else payload.get("budget", 0.0)
    # "150 000", "150 000,50 руб." etc. — float() turned any CRM string with a space into 0.
    budget, _unknown = parse_numeric_price(amt_raw)

    status = "WON" if stage_enum == DealStage.WON else ("LOST" if stage_enum == DealStage.LOST else (raw_status or "ACTIVE"))
    is_deleted = bool(payload.get("is_deleted") in (True, "1", 1) or status == "DELETED")
    cfg = get_tenant_config(effective_tenant) or {}
    raw_crm = (
        payload.get("crm_source")
        or payload.get("source")
        or payload.get("channel")
        or cfg.get("crm_type")
        or "bitrix24"
    )
    crm_str = str(raw_crm).strip().lower()
    crm_source = "amocrm" if "amo" in crm_str else ("bitrix24" if ("bitrix" in crm_str or "b24" in crm_str) else crm_str)
    is_at_risk = bool(payload.get("sla_risk") or payload.get("is_at_risk"))

    # 4. Insert or update Deal in Postgres
    db_deal = find_tenant_deal(db, effective_tenant, str(deal_id))
    if not db_deal:
        db_deal = Deal(
            id=deal_pk_for(db, effective_tenant, str(deal_id)),
            external_crm_id=str(deal_id),
            tenant_id=effective_tenant,
            workspace_id=str(workspace_id),
            title=str(title),
            company_name=str(payload.get("company_name") or title),
            budget=budget,
            stage=stage_enum,
            crm_source=crm_source,
            status=status,
            is_deleted=is_deleted,
            is_at_risk=is_at_risk,
            custom_payload=payload.get("custom_payload") or {}
        )
        db.add(db_deal)
    else:
        setattr(db_deal, "workspace_id", str(workspace_id))
        setattr(db_deal, "title", str(title))
        if payload.get("company_name"):
            setattr(db_deal, "company_name", str(payload.get("company_name")))
        setattr(db_deal, "budget", budget)
        setattr(db_deal, "stage", stage_enum)
        setattr(db_deal, "crm_source", crm_source)
        setattr(db_deal, "status", status)
        setattr(db_deal, "is_deleted", is_deleted)
        setattr(db_deal, "is_at_risk", is_at_risk)
        if payload.get("custom_payload"):
            setattr(db_deal, "custom_payload", payload.get("custom_payload"))

    db.commit()

    # Invalidate Redis and in-memory cache for this tenant
    delete_cached_json_sync(f"deals:{effective_tenant}")
    _DEALS_CACHE.pop(effective_tenant, None)

    # 5. Broadcast real-time WebSocket update
    try:
        await manager.broadcast(effective_tenant, {
            "type": "deal_synced",
            "action": "ingest",
            "deal_id": str(deal_id),
            "status": status,
            "title": str(title)
        })
    except Exception as e_ws:
        logger.debug(f"WebSocket broadcast note: {e_ws}")

    return {"status": "ok", "deal_id": str(deal_id), "tenant_id": effective_tenant, "stage": stage_enum.name}


@router.post("/{deal_id}/fix-next-step")
async def fix_next_step(
    deal_id: str,
    request: Request,
    payload: FixNextStepPayload | None = None,
    next_step_date_iso: str | None = Query(None),
    org_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Sets the next-step date of a deal, stores it, re-evaluates the SLA risk and tells the open tabs.

    It used to change only a per-process cache and broadcast: the next GET /deals returned the old risk and
    the date was lost on restart (or on another worker). Now the date is written to the deal row."""
    # Tenant comes from auth context; a non-admin cannot target (or broadcast into) another tenant.
    org_id = get_authenticated_tenant_or_verify_admin(request, org_id)
    clean_tid = org_id.strip().upper()
    raw_date = (next_step_date_iso or (payload.next_step_date if payload else None) or "").strip()

    tz = tenant_tz(get_tenant_config(clean_tid))
    now = datetime.now(timezone.utc)
    if not raw_date:
        raw_date = (now.astimezone(tz) + timedelta(days=1)).strftime("%Y-%m-%d")
    try:
        parsed = datetime.fromisoformat(raw_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="next_step_date: ожидается дата YYYY-MM-DD или ISO-время")
    if len(raw_date) <= 10:
        when_utc = end_of_local_day_utc(parsed, tz)  # a date means "by the end of that day"
    else:
        when_utc = (parsed if parsed.tzinfo else parsed.replace(tzinfo=tz)).astimezone(timezone.utc)
    if when_utc < now:
        raise HTTPException(status_code=422, detail="Дата следующего шага уже в прошлом: риск не будет снят")

    db_deal = None
    for candidate_id in (deal_id.strip(), f"B24-{deal_id.strip()}", f"AMO-{deal_id.strip()}"):
        db_deal = find_tenant_deal(db, clean_tid, candidate_id)
        if db_deal:
            break

    if db_deal:
        setattr(db_deal, "next_step_date", when_utc.replace(tzinfo=None))
        setattr(db_deal, "has_next_step", True)
        # Remember it as a MANUAL next step: the CRM sync keeps it while it is in the future instead of
        # replacing it with "the CRM has no open task for this deal".
        payload_now = dict(db_deal.custom_payload) if isinstance(db_deal.custom_payload, dict) else {}
        payload_now["manual_next_step"] = when_utc.isoformat()
        setattr(db_deal, "custom_payload", payload_now)
        state = deal_sla_state(db_deal, now)
        setattr(db_deal, "days_in_stage", state.days_in_stage)
        setattr(db_deal, "is_at_risk", state.at_risk)
        setattr(db_deal, "risk_reason", state.reason_text or None)
        db.commit()
        deal_view: dict[str, Any] = {
            "id": db_deal.id,
            "deal_id": db_deal.id,
            "org_id": clean_tid,
            "title": db_deal.title,
            "amount": float(db_deal.budget or 0.0),
            **_sla_fields(db_deal),
        }
        persisted = True
    else:
        # Deal that exists only in the Google Sheets mirror: nothing to write to the DB, the CRM stays the source.
        found = get_deals_lookup(tenant_id=clean_tid).get(deal_id.upper().strip())
        if not found:
            raise HTTPException(status_code=404, detail=f"Сделка {deal_id} не найдена")
        found["sla_risk"] = False
        found["next_step_date"] = when_utc.isoformat()
        deal_view = dict(found)
        persisted = False

    delete_cached_json_sync(f"deals:{clean_tid}")
    delete_cached_json_sync(f"pipelines:{clean_tid}")
    _DEALS_CACHE.pop(clean_tid, None)

    # Real-time WebSocket Broadcast
    await manager.broadcast(clean_tid, {
        "type": "deal_updated",
        "action": "fix_next_step",
        "data": deal_view,
    })

    return {
        "status": "success",
        "persisted": persisted,
        "message": f"Следующий шаг по сделке {deal_id} назначен на {when_utc.astimezone(tz).strftime('%d.%m.%Y %H:%M')}. Риск пересчитан.",
        "deal": deal_view,
    }
