# -*- coding: utf-8 -*-
"""
Google Sheets Micro-Batch Syncer.
Batches completed audits and appends them in chunks of 20-50 rows every 120 seconds.
Guarantees T-24 invariant (raw_score = sum of cr1..cr13 in Column T, same layout as /calls/ingest).
Reduces Google Sheets API quota usage by 95%.
"""
import os
import json
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone
import gspread
from google.oauth2.service_account import Credentials
from sqlalchemy import text

from apps.api.database import SessionLocal
from apps.api.services.call_scorecard import read_scorecard
from apps.api.services.raw_calls_row import build_raw_calls_row
from apps.api.services.tz import tenant_tz, to_local
from apps.api.models import Tenant, Call

logger = logging.getLogger("revops_sheets_batch")

SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
SERVICE_ACCOUNT_FILE = os.getenv('GOOGLE_SERVICE_ACCOUNT_PATH', '/app/service_account.json')
if not os.path.exists(SERVICE_ACCOUNT_FILE):
    SERVICE_ACCOUNT_FILE = 'service_account.json'


def _get_gspread_client():
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        return None
    try:
        creds = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        return gspread.authorize(creds)
    except Exception as e:
        logger.error(f"Failed to authorize Google Sheets API: {e}")
        return None


async def sync_pending_batches_to_sheets(batch_size: int = 50) -> int:
    """
    Выбирает пачку неотправленных звонков из PostgreSQL, группирует по тенантам
    и отправляет единым batch-запросом в Google Таблицу тенанта.
    """
    db = SessionLocal()
    client = _get_gspread_client()
    if not client:
        db.close()
        return 0

    try:
        # Выбираем звонки с reverse_etl_synced = False
        query = text("""
            SELECT 
                c.id, c.tenant_id, c.deal_id, c.manager_id, c.external_call_id,
                c.client_phone, c.duration_seconds, c.overall_score,
                c.scorecard_criteria, c.transcript_text, c.ai_summary,
                c.next_action_extracted, c.created_at, c.crm_source,
                d.external_crm_id AS deal_external_id, u.full_name AS manager_name
            FROM call_recordings c
            LEFT JOIN deals d ON d.id = c.deal_id
            LEFT JOIN users u ON u.id = c.manager_id
            WHERE c.reverse_etl_synced IS NOT TRUE
            ORDER BY c.created_at ASC
            LIMIT :limit
        """)
        rows = db.execute(query, {"limit": batch_size}).fetchall()
        if not rows:
            return 0

        # Группируем по tenant_id
        tenants_calls: Dict[str, List[Any]] = {}
        for r in rows:
            tid = r.tenant_id
            if tid not in tenants_calls:
                tenants_calls[tid] = []
            tenants_calls[tid].append(r)

        synced_ids = []

        for tid, calls_list in tenants_calls.items():
            # Получаем spreadsheet_id тенанта
            tenant = db.query(Tenant).filter_by(id=tid).first()
            if not tenant:
                tenant = db.query(Tenant).filter_by(slug=tid.lower()).first()

            sheet_id = None
            if tenant and tenant.settings and isinstance(tenant.settings, dict):
                sheet_id = tenant.settings.get("spreadsheet_id")
            tz = tenant_tz(tenant.settings if tenant and isinstance(tenant.settings, dict) else None)

            if not sheet_id:
                logger.info(f"Tenant {tid} has no spreadsheet_id, skipping Sheets sync")
                for c in calls_list:
                    synced_ids.append(c.id)
                continue

            try:
                sh = client.open_by_key(sheet_id)
                try:
                    wks = sh.worksheet("raw_calls")
                except Exception:
                    wks = sh.get_worksheet(0)

                # Подготавливаем матрицу строк
                values_matrix = []
                for c in calls_list:
                    # SAME 38-column layout as /calls/ingest (cr1..cr13 in G..S, score in T, next step in U);
                    # this syncer used to write its own shorter layout (phone in C, score in R) into the same sheet.
                    card = read_scorecard(c.scorecard_criteria, c.overall_score)
                    sc = c.scorecard_criteria if isinstance(c.scorecard_criteria, dict) else {}
                    created_local = to_local(c.created_at, tz) if c.created_at else to_local(datetime.now(timezone.utc), tz)
                    summary_parts = str(c.ai_summary or "").split(" | ", 1)
                    row, _hash = build_raw_calls_row(
                        call_id=c.external_call_id or c.id,
                        deal_id=c.deal_external_id or c.deal_id or "",
                        manager=c.manager_name or str(sc.get("manager") or "Менеджер"),
                        date_str=created_local.strftime("%Y-%m-%d"),
                        dur_sec=int(c.duration_seconds or 0),
                        cr=card["cr"],
                        total_score=card["score"],  # T-24: sum of cr1..cr13, empty when the call was not rated
                        next_step=card["next_step"],
                        error_summary=summary_parts[0],
                        recommendation=summary_parts[1] if len(summary_parts) > 1 else str(c.next_action_extracted or ""),
                        transcript=str(c.transcript_text or ""),
                        tenant_id=str(tid),
                        now=created_local,
                    )
                    values_matrix.append(row)

                # Выполняем ровно 1 сетевой вызов к Google API на всю пачку строк!
                wks.append_rows(values_matrix, value_input_option='USER_ENTERED')
                for c in calls_list:
                    synced_ids.append(c.id)
                logger.info(f"Batched {len(values_matrix)} rows into Google Sheet for tenant {tid}")

            except Exception as e:
                logger.error(f"Error appending batch to sheet {sheet_id} for tenant {tid}: {e}")

        # Помечаем отправленные записи в БД
        if synced_ids:
            update_stmt = text("""
                UPDATE call_recordings 
                SET reverse_etl_synced = TRUE 
                WHERE id = ANY(:ids)
            """)
            db.execute(update_stmt, {"ids": synced_ids})
            db.commit()

        return len(synced_ids)

    except Exception as e:
        logger.error(f"Error in sync_pending_batches_to_sheets: {e}")
        return 0
    finally:
        db.close()
