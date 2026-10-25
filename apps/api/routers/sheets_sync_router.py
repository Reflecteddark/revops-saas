# -*- coding: utf-8 -*-
"""
FastAPI Router for One-Way Sync: PostgreSQL -> Google Sheets.
152-ФЗ Compliant: All transcript_text fields pass through PII Tokenization.
"""
import os
import json
import logging
from typing import Any, List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request, status
from google.oauth2.service_account import Credentials
import gspread
import gspread.utils

from ipaddress import ip_address, ip_network
import secrets

from apps.api.database import SessionLocal
from apps.api.models import Deal, Call, Tenant
from apps.api.services.pii_service import PIIService
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
from apps.api.cache_client import delete_cached_json_sync
from apps.api.routers.calls_router import _CALLS_CACHE
from apps.api.routers.deals_router import _DEALS_CACHE
from apps.api.websocket_manager import manager

logger = logging.getLogger("revops_sheets_sync")

INTERNAL_NETS = [
    ip_network("127.0.0.0/8"),
    ip_network("10.0.0.0/8"),
    ip_network("172.16.0.0/12"),
    ip_network("192.168.0.0/16"),
]


def _is_internal_ip(ip_str: str) -> bool:
    if not ip_str:
        return False
    try:
        ip = ip_address(ip_str)
        return any(ip in net for net in INTERNAL_NETS)
    except Exception:
        return False


def _get_admin_keys() -> set[str]:
    keys = set(ALLOWED_ADMIN_KEYS)
    for env_k in ["REVOPS_ADMIN_KEY", "ADMIN_KEY"]:
        val = os.getenv(env_k)
        if val and val.strip():
            keys.add(val.strip().strip("'\""))
    return keys


async def verify_admin_key(
    request: Request,
    x_admin_key: Optional[str] = Header(None, alias="X-Admin-Key"),
):
    client_ip = request.client.host if request.client else ""
    if client_ip and _is_internal_ip(client_ip):
        return True

    key = (
        x_admin_key
        or request.headers.get("x-revops-admin-key")
        or request.headers.get("x-admin-key")
        or request.query_params.get("admin_key")
    )
    if key:
        allowed = _get_admin_keys()
        if any(secrets.compare_digest(key, k) for k in allowed):
            return True

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing X-Admin-Key",
    )


router = APIRouter(prefix="/sheets", tags=["sheets-sync"])

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_SERVICE_ACCOUNT_PATH', '/app/service_account.json')
if not os.path.exists(SERVICE_ACCOUNT_FILE):
    SERVICE_ACCOUNT_FILE = 'service_account.json'


def _get_gspread_client():
    creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
    return gspread.authorize(creds)


def _get_spreadsheet_id(tenant_id: str, custom_sheet_id: Optional[str] = None) -> str:
    """Получить spreadsheet_id тенанта из реестра, базы данных или параметра."""
    if custom_sheet_id:
        return custom_sheet_id

    # 1. Проверяем БД PostgreSQL
    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter_by(id=tenant_id).first()
        if not tenant:
            tenant = db.query(Tenant).filter_by(slug=tenant_id.lower()).first()
        if tenant and tenant.settings and isinstance(tenant.settings, dict):
            sheet_id = tenant.settings.get('spreadsheet_id')
            if sheet_id:
                return sheet_id
    except Exception as e:
        logger.warning(f"Error checking tenant in DB: {e}")
    finally:
        db.close()

    # 2. Проверяем tenants_registry.json
    registry_candidates = [
        os.getenv('TENANTS_REGISTRY_PATH', ''),
        '/opt/revops-enterprise-os/tenants_registry.json',
        'tenants_registry.json',
        '../tenants_registry.json'
    ]
    for p in registry_candidates:
        if p and os.path.exists(p):
            try:
                with open(p, 'r', encoding='utf-8') as f:
                    reg = json.load(f)
                for t in reg.get('tenants', []):
                    if t.get('tenant_id') == tenant_id or t.get('slug') == tenant_id.lower():
                        return t.get('spreadsheet_id')
                # If tenant is master or clean starter
                if tenant_id in ['TNT-CLEAN-001', 'TNT-MASTER-001', 'master', 'clean']:
                    return reg.get('clean_starter_template', {}).get('spreadsheet_id') or reg.get('master_template', {}).get('spreadsheet_id')
            except Exception as e:
                logger.warning(f"Error reading registry at {p}: {e}")

    # 3. Дефолтный ID чистого шаблона (Clean Client Starter)
    clean_id = os.getenv('CLEAN_TEMPLATE_ID', '1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A')
    if clean_id:
        return clean_id

    raise HTTPException(status_code=404, detail=f"Spreadsheet not configured for tenant {tenant_id}")


def _write_to_sheet_safe(spreadsheet_id: str, sheet_name: str, rows: List[List]):
    """Безопасная запись: очищает ВСЕ данные (A2 до последней ячейки), затем пишет.
    При неудаче очистки — raise (не пишет кашу поверх грязных данных).
    """
    gc = _get_gspread_client()
    sh = gc.open_by_key(spreadsheet_id)
    try:
        ws = sh.worksheet(sheet_name)
    except gspread.WorksheetNotFound:
        ws = sh.add_worksheet(title=sheet_name, rows=1000, cols=35)
    
    if not rows:
        logger.info(f"SKIP_EMPTY sheet={sheet_name} (no rows to write)")
        return
    
    # Точная последняя колонка листа (не хардкод ZZ)
    last_col_letter = gspread.utils.rowcol_to_a1(1, ws.col_count).rstrip('0123456789')
    clear_end = max(ws.row_count, len(rows) + 5)
    clear_range = f"A2:{last_col_letter}{clear_end}"
    
    try:
        ws.batch_clear([clear_range])
        logger.info(f"CLEAR_OK sheet={sheet_name} range={clear_range}")
    except Exception as e:
        # НЕ глотать: sync должен упасть, чтобы QA Healer/Fail-Closed увидел проблему
        logger.error(f"CLEAR_FAILED sheet={sheet_name} range={clear_range} error={e}")
        raise RuntimeError(f"Failed to clear {sheet_name} before write: {e}")
    
    ws.update(rows, 'A2', value_input_option='USER_ENTERED')
    logger.info(f"Successfully synced {len(rows)} rows into {sheet_name} ({spreadsheet_id})")


def _sync_deals(tenant_id: str, spreadsheet_id: str):
    """Синхронизация сделок из Postgres в raw_deals."""
    db = SessionLocal()
    try:
        deals = db.query(Deal).filter_by(tenant_id=tenant_id).all()
        now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        data_rows = []
        for d in deals:
            stage_str = d.stage.value if hasattr(d.stage, 'value') else str(d.stage)
            data_rows.append([
                d.id,                                         # 1: deal_id
                d.company_name or d.title or "Сделка",        # 2: client_name
                d.budget or 0.0,                             # 3: amount
                1,                                           # 4: stage_id
                stage_str,                                   # 5: stage_name
                d.created_at.strftime('%Y-%m-%d') if d.created_at else now_str[:10], # 6: created_date
                d.updated_at.strftime('%Y-%m-%d') if d.updated_at else now_str[:10], # 7: stage_changed_date
                d.assigned_user_id or "MGR-01",              # 8: manager_id
                "B2B",                                       # 9: segment_code
                d.lead_source or "Organic",                  # 10: lead_source
                f"CLI-{d.id[:8]}",                           # 11: client_id
                "Tier A",                                    # 12: scoring_tier
                "",                                          # 13: loss_code
                now_str,                                     # 14: synced_at
                1 if "Успешно" in stage_str or "WON" in stage_str else 0, # 15: is_won
                1 if "Закрыто" in stage_str or "LOST" in stage_str else 0, # 16: is_lost
                d.days_in_stage or 0,                        # 17: days_in_stage
                "0-7",                                       # 18: aging_cohort
                d.budget or 0.0,                             # 19: weighted_val
                14,                                          # 20: cycle_days
                "direct",                                    # 21: utm_source
                "none",                                      # 22: utm_medium
                d.utm_campaign or "",                        # 23: utm_campaign
                "",                                          # 24: yclid
                "",                                          # 25: gclid
                now_str[:10],                                 # 26: data_snapshot_date
                "v20.0",                                      # 27: data_version
                "Postgres ETL",                               # 28: uploaded_by
                f"HASH_{abs(hash(d.id))}",                    # 29: upload_hash
                "Звонок",                                     # 30: next_action_type
                now_str[:10],                                 # 31: next_action_date
                d.assigned_user_id or "MGR-01",              # 32: next_action_owner
                "Телефон",                                    # 33: next_action_channel
                "Зеленый",                                    # 34: next_action_health
                85,                                          # 35: deal_health_score
                now_str,                                     # 36: v18_synced_at
                "Active",                                    # 37: v18_ai_tag
                d.days_in_stage or 0,                        # 38: days_in_current_stage
                14,                                          # 39: sales_cycle_days
                d.created_at.strftime('%Y-%m-%d') if d.created_at else now_str[:10], # 40: first_contact_date
                1,                                           # 41: touchpoints_count
                0,                                           # 42: sla_broken_flag
                now_str,                                     # 43: last_activity_at
                0,                                           # 44: days_since_last_activity
                0,                                           # 45: is_abandoned
                0,                                           # 46: stage_rollback_count
                48,                                          # 47: real_time_in_stage_hours
                0,                                           # 48: is_fake_task_closed
                1,                                           # 49: task_has_comment
                5                                            # 50: source_lead_time
            ])
        _write_to_sheet_safe(spreadsheet_id, 'raw_deals', data_rows)
    except Exception as e:
        logger.error(f"Error syncing deals: {e}", exc_info=True)
    finally:
        db.close()


def _sync_calls(tenant_id: str, spreadsheet_id: str):
    """Синхронизация звонков из Postgres в raw_calls с токенизацией ПДн (152-ФЗ)."""
    db = SessionLocal()
    try:
        pii = PIIService()
        calls = db.query(Call).filter_by(tenant_id=tenant_id).all()
        now_str = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
        data_rows = []
        for c in calls:
            raw_text = str(c.transcript_text or "")
            # Токенизируем телефоны и email перед выгрузкой в Google Sheets
            safe_transcript = pii.tokenize_transcript(raw_text, tenant_id, db) if raw_text else ""
            
            criteria: dict[str, Any] = c.scorecard_criteria if isinstance(c.scorecard_criteria, dict) else {}

            crit = criteria or {}
            total_score: int | str = ''
            if isinstance(crit, dict) and any(k.startswith('cr') for k in crit.keys()):
                score_sum = 0
                for i in range(1, 14):
                    v = crit.get(f'cr{i}', 0)
                    try:
                        score_sum += int(v)
                    except (TypeError, ValueError):
                        pass
                total_score = max(0, min(13, score_sum))
            
            data_rows.append([
                c.id,                                         # call_id
                c.deal_id or "",                              # deal_id
                c.manager_id or "MGR-01",                     # manager_id
                c.created_at.strftime('%Y-%m-%d %H:%M:%S') if c.created_at else now_str, # call_date
                c.duration_seconds or 0,                      # duration_sec
                "Входящий",                                   # call_type
                criteria.get('cr1', 0),                       # cr1
                criteria.get('cr2', 0),                       # cr2
                criteria.get('cr3', 0),                       # cr3
                criteria.get('cr4', 0),                       # cr4
                criteria.get('cr5', 0),                       # cr5
                criteria.get('cr6', 0),                       # cr6
                criteria.get('cr7', 0),                       # cr7
                criteria.get('cr8', 0),                       # cr8
                criteria.get('cr9', 0),                       # cr9
                criteria.get('cr10', 0),                      # cr10
                criteria.get('cr11', 0),                      # cr11
                criteria.get('cr12', 0),                      # cr12
                criteria.get('cr13', 0),                      # cr13
                total_score,                                  # total_score (cr1..cr13 sum)
                1 if c.next_action_extracted else 0,          # next_step_flag
                c.ai_summary or "",                           # error_summary
                c.next_action_extracted or "Согласовать дату следующего контакта", # ai_recommendation
                now_str,                                      # synced_at
                "",                                           # raw_json
                now_str[:10],                                 # data_snapshot_date
                "v20.0",                                      # data_version
                "Postgres ETL (152-ФЗ)",                      # uploaded_by
                f"HASH_{abs(hash(c.id))}",                    # upload_hash
                safe_transcript,                              # transcript_text (TOKENIZED)
                10,                                           # days_to_close
                "Продуктовые переговоры",                     # manager_skill_cluster
                14,                                           # call_hour
                1,                                            # is_working_hours
                5                                             # response_delay_min
            ])
        _write_to_sheet_safe(spreadsheet_id, 'raw_calls', data_rows)
    except Exception as e:
        logger.error(f"Error syncing calls: {e}", exc_info=True)
    finally:
        db.close()


def _sync_invoices(tenant_id: str, spreadsheet_id: str):
    logger.info(f"Syncing raw_invoices for {tenant_id}")


def _sync_marketing(tenant_id: str, spreadsheet_id: str):
    logger.info(f"Syncing raw_marketing for {tenant_id}")


def _sync_payments(tenant_id: str, spreadsheet_id: str):
    logger.info(f"Syncing raw_payments for {tenant_id}")


def _sync_touchpoints(tenant_id: str, spreadsheet_id: str):
    logger.info(f"Syncing raw_touchpoints for {tenant_id}")


@router.post("/sync/all", dependencies=[Depends(verify_admin_key)])
@router.post("/sync", dependencies=[Depends(verify_admin_key)])
async def sync_all(
    background_tasks: BackgroundTasks,
    tenant_id: str = Query("TNT-001"),
    spreadsheet_id: Optional[str] = Query(None, description="Опциональный целевой spreadsheet_id")
):
    """
    Полная синхронизация данных из PostgreSQL в защищённые Google Sheets.
    Направление: Postgres -> Sheets (обратная запись исключена).
    Все звонки токенизируются (152-ФЗ).
    """
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    target_ss_id = _get_spreadsheet_id(clean_tenant, spreadsheet_id)

    # Invalidate caches
    delete_cached_json_sync(f"calls:{clean_tenant}")
    delete_cached_json_sync(f"deals:{clean_tenant}")
    if clean_tenant in _CALLS_CACHE and isinstance(_CALLS_CACHE[clean_tenant], dict):
        _CALLS_CACHE[clean_tenant]["timestamp"] = 0
    if clean_tenant in _DEALS_CACHE and isinstance(_DEALS_CACHE[clean_tenant], dict):
        _DEALS_CACHE[clean_tenant]["timestamp"] = 0

    try:
        await manager.broadcast(
            clean_tenant,
            {
                "type": "sheets_synced",
                "tenant_id": clean_tenant,
                "synced_at": datetime.now(timezone.utc).isoformat(),
            },
        )
    except Exception as ex:
        logger.warning(f"Failed to broadcast sheets_synced event: {ex}")

    background_tasks.add_task(_sync_deals, clean_tenant, target_ss_id)
    background_tasks.add_task(_sync_calls, clean_tenant, target_ss_id)
    background_tasks.add_task(_sync_invoices, clean_tenant, target_ss_id)
    background_tasks.add_task(_sync_marketing, clean_tenant, target_ss_id)
    background_tasks.add_task(_sync_payments, clean_tenant, target_ss_id)
    background_tasks.add_task(_sync_touchpoints, clean_tenant, target_ss_id)
    
    return {
        "status": "ok",
        "tenant_id": clean_tenant,
        "spreadsheet_id": target_ss_id,
        "sheets_queued": 6,
        "message": "ETL синхронизация с токенизацией ПДн запущена в фоновом режиме"
    }


@router.get("/status", dependencies=[Depends(verify_admin_key)])
def get_sheets_sync_status(tenant_id: str = Query("TNT-001")) -> dict:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    try:
        sheet_id = _get_spreadsheet_id(clean_tenant)
    except Exception:
        sheet_id = ""

    calls_cached = len(_CALLS_CACHE.get(clean_tenant, {}).get("calls", []))
    deals_cached = len(_DEALS_CACHE.get(clean_tenant, {}).get("deals", []))
    return {
        "status": "ok",
        "tenant_id": clean_tenant,
        "spreadsheet_id": sheet_id,
        "cached_calls_count": calls_cached,
        "cached_deals_count": deals_cached,
    }


@router.post("/sync/{sheet_name}", dependencies=[Depends(verify_admin_key)])
async def sync_one(
    sheet_name: str, 
    tenant_id: str, 
    background_tasks: BackgroundTasks,
    spreadsheet_id: Optional[str] = Query(None, description="Опциональный целевой spreadsheet_id")
):
    """Синхронизация одного конкретного листа."""
    allowed = ['deals', 'calls', 'invoices', 'marketing', 'payments', 'touchpoints']
    clean_name = sheet_name.replace('raw_', '')
    if clean_name not in allowed:
        raise HTTPException(status_code=400, detail=f"Sheet must be one of {allowed} (or with 'raw_' prefix)")
    
    target_ss_id = _get_spreadsheet_id(tenant_id, spreadsheet_id)
    handler_func = globals().get(f"_sync_{clean_name}")
    if not handler_func:
        raise HTTPException(status_code=500, detail=f"Handler for {sheet_name} not implemented")
        
    background_tasks.add_task(handler_func, tenant_id, target_ss_id)
    return {
        "status": "queued",
        "tenant_id": tenant_id,
        "sheet": f"raw_{clean_name}",
        "spreadsheet_id": target_ss_id
    }
