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
from ..tenant_registry import get_tenant_config, get_tenant_spreadsheet_id
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


def parse_amount(val: Any) -> float:
    if val is None or val == "":
        return 0.0
    from ..services.crm_deal_normalizer import parse_numeric_price
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

    CLEAN_STARTER_TEMPLATE_ID = "1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A"
    if clean_tenant in ("TNT-002", "TNT-CLEAN-001") or sheet_id == CLEAN_STARTER_TEMPLATE_ID:
        empty_res: list[dict[str, Any]] = []
        _DEALS_CACHE[clean_tenant] = {"timestamp": now, "deals": empty_res, "lookup": {}}
        set_cached_json_sync(cache_key, empty_res, ex=60)
        return empty_res

    sa_path = get_service_account_path()
    if not sa_path:
        if cached and cached.get("deals"):
            return cached.get("deals", [])
        logger.warning(f"service_account.json not found for deals fetch (tenant: {clean_tenant}, crm: {tenant_crm}), using golden master seed deals")
        from packages.analytics_engine.calc_engine import DEFAULT_DEALS
        fallback_deals: list[dict[str, Any]] = []
        lookup: dict[str, dict[str, Any]] = {}

        # If hybrid/both: generate two sets; if amo: AMO prefix; if b24: B24 prefix
        crms_to_gen = ["bitrix24", "amocrm"] if tenant_crm in ("both", "hybrid", "all") else [tenant_crm]

        for crm_src in crms_to_gen:
            pfx = "AMO-" if crm_src == "amocrm" else "B24-"
            src_label = "amoCRM" if crm_src == "amocrm" else "Bitrix24"
            for d in DEFAULT_DEALS:
                raw_seed_id = str(d.get("deal_id", "101")).replace("D-", "")
                deal_id = f"{pfx}{raw_seed_id}"
                st_id = int(d.get("stage_id", 1))
                is_seed_won = (st_id == 6)
                is_seed_lost = (st_id == 7)
                stage_name = str(d.get("stage_name", "Первичный контакт"))
                amt_num = float(d.get("amount", 0.0))
                sla_risk = (not is_seed_won and not is_seed_lost) and (st_id in (1, 2, 4) or "Первичный" in stage_name or "КП" in stage_name or "Новый" in stage_name)
                deal_obj = {
                    "id": deal_id,
                    "deal_id": deal_id,
                    "org_id": clean_tenant,
                    "crm_deal_id": deal_id,
                    "crm_source": src_label,
                    "title": str(d.get("client_name", f"Сделка {deal_id}")),
                    "amount": amt_num,
                    "amount_str": f"{int(amt_num):,} ₽".replace(",", " "),
                    "stage_id": str(st_id),
                    "stage": stage_name,
                    "status": "won" if is_seed_won else ("lost" if is_seed_lost else "active"),
                    "sla_risk": sla_risk,
                    "responsible_user": f"Менеджер {d.get('manager_id', 101)}",
                    "segment": str(d.get("segment_code", "SEG1")),
                    "created_at": str(d.get("created_date", "")),
                    "updated_at": str(d.get("stage_changed_date", "")),
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                }
                fallback_deals.append(deal_obj)
                lookup[deal_id.upper().strip()] = deal_obj
                num_only = re.sub(r"\D", "", deal_id)
                if num_only:
                    lookup[num_only] = deal_obj
                    lookup[f"B24-{num_only}"] = deal_obj
                    lookup[f"AMO-{num_only}"] = deal_obj

        _DEALS_CACHE[clean_tenant] = {
            "timestamp": now,
            "deals": fallback_deals,
            "lookup": lookup
        }
        set_cached_json_sync(cache_key, fallback_deals, ex=60)
        return fallback_deals

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

    if request.cookies.get("revops_client_auth"):
        return (requested_tenant or "TNT-001").strip().upper()

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

        if d.is_at_risk and not is_won and not is_lost:
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
                "sla_risk": False if (deal_status in ("won", "lost") or d.stage in (DealStage.WON, DealStage.LOST) or any(w in str(d.stage_name or "").lower() for w in ("успешно", "закрыт", "отказ", "не реализовано"))) else bool(d.is_at_risk),
                "days_in_stage": d.days_in_stage or 0,
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

    db_deal = (
        db.query(Deal)
        .filter(
            (Deal.id == clean_id)
            | (Deal.external_crm_id == clean_id)
            | (Deal.id == f"B24-{clean_id}")
            | (Deal.id == f"AMO-{clean_id}")
        )
        .first()
    )

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
                "sla_risk": False if (db_deal.stage in (DealStage.WON, DealStage.LOST) or any(w in str(db_deal.stage_name or "").lower() for w in ("успешно", "закрыт", "отказ", "не реализовано"))) else bool(db_deal.is_at_risk),
                "days_in_stage": db_deal.days_in_stage or 0,
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


@router.post("/sync")
async def sync_deals(
    request: Request,
    tenant_id: str | None = None,
    tenant: str | None = None,
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Triggers on-demand synchronization of CRM deals for tenant from amoCRM / Bitrix24."""
    requested = tenant_id or tenant
    effective_tenant = get_authenticated_tenant_or_verify_admin(request, requested)
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
    try:
        budget = float(amt_raw) if amt_raw is not None else 0.0
    except (ValueError, TypeError):
        budget = 0.0

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
    db_deal = db.query(Deal).filter(Deal.id == str(deal_id)).first()
    if not db_deal:
        db_deal = Deal(
            id=str(deal_id),
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
    payload: FixNextStepPayload | None = None,
    next_step_date_iso: str | None = Query(None),
    org_id: str = "TNT-001"
):
    """Fixes the next step date, clears the SLA risk, and broadcasts real-time WebSocket update."""
    target_date = next_step_date_iso or (payload.next_step_date if payload else None)
    if not target_date:
        target_date = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat().split("T")[0]

    deals = fetch_deals_from_sheets()
    found = None
    lookup = get_deals_lookup()
    clean_id = deal_id.upper().strip()
    if clean_id in lookup:
        found = lookup[clean_id]
        found["sla_risk"] = False
        found["next_step_date"] = target_date

    if not found:
        found = {
            "id": deal_id,
            "deal_id": deal_id,
            "org_id": org_id,
            "title": f"Сделка {deal_id}",
            "amount": 0.0,
            "amount_str": "0 ₽",
            "stage": "Первичный контакт",
            "status": "active",
            "sla_risk": False,
            "next_step_date": target_date,
            "synced_at": datetime.now(timezone.utc).isoformat()
        }

    # Real-time WebSocket Broadcast
    await manager.broadcast(org_id, {
        "type": "deal_updated",
        "action": "fix_next_step",
        "data": found
    })

    return {
        "status": "success",
        "message": f"Следующий шаг по сделке {deal_id} назначен на {target_date}. Риск снят.",
        "deal": found
    }
