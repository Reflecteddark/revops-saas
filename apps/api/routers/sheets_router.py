"""
RevOps Intelligence SaaS Engine - Google Sheets Real-time Synchronization Router
Provides endpoints for automated scheduled background synchronization (via n8n)
and manual on-demand triggers for raw_calls and raw_deals.
"""

from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from apps.api.cache_client import delete_cached_json_sync, set_cached_json_sync
from apps.api.routers.calls_router import (
    _CALLS_CACHE,
    fetch_calls_from_sheets,
    verify_internal_or_admin,
)
from apps.api.routers.deals_router import (
    _DEALS_CACHE,
    fetch_deals_from_sheets,
)
from apps.api.tenant_registry import get_tenant_spreadsheet_id
from apps.api.websocket_manager import manager

logger = logging.getLogger("revops.sheets_sync")

router = APIRouter(prefix="/sheets", tags=["Google Sheets Sync & Pipeline"])


@router.post("/sync/all")
@router.post("/sync")
async def sync_all_sheets(request: Request, tenant_id: str = Query("TNT-001")) -> dict[str, Any]:
    """
    Forces immediate two-way synchronization from Google Sheets (raw_calls and raw_deals).
    Invalidates tenant caches, pulls fresh records, updates Redis, and broadcasts a WebSocket notification.
    Accessible from internal Docker networks (e.g. n8n) or with valid Admin Key.
    """
    verify_internal_or_admin(request)
    clean_tenant = (tenant_id or "TNT-001").strip().upper()

    # 1. Invalidate Redis and in-memory caches
    delete_cached_json_sync(f"calls:{clean_tenant}")
    delete_cached_json_sync(f"deals:{clean_tenant}")
    if clean_tenant in _CALLS_CACHE and isinstance(_CALLS_CACHE[clean_tenant], dict):
        _CALLS_CACHE[clean_tenant]["timestamp"] = 0
    if clean_tenant in _DEALS_CACHE and isinstance(_DEALS_CACHE[clean_tenant], dict):
        _DEALS_CACHE[clean_tenant]["timestamp"] = 0

    # 2. Fetch fresh records from Google Sheets
    calls = fetch_calls_from_sheets(tenant_id=clean_tenant, limit=100)
    deals = fetch_deals_from_sheets(tenant_id=clean_tenant, limit=100)

    # 3. Cache calls in Redis (fetch_deals_from_sheets already populates deals cache)
    _CALLS_CACHE[clean_tenant] = {"timestamp": time.time(), "calls": calls}
    set_cached_json_sync(f"calls:{clean_tenant}", calls, ex=300)

    now_iso = datetime.now(timezone.utc).isoformat()

    # 4. Broadcast real-time WebSocket update to tenant subscribers
    try:
        await manager.broadcast(
            clean_tenant,
            {
                "type": "sheets_synced",
                "tenant_id": clean_tenant,
                "calls_count": len(calls),
                "deals_count": len(deals),
                "synced_at": now_iso,
            },
        )
    except Exception as ex:
        logger.warning(f"Failed to broadcast sheets_synced event: {ex}")

    return {
        "status": "ok",
        "tenant_id": clean_tenant,
        "synced_at": now_iso,
        "calls": {
            "count": len(calls),
            "synced": True,
        },
        "deals": {
            "count": len(deals),
            "synced": True,
        },
    }


@router.post("/sync/calls")
async def sync_calls_sheet(request: Request, tenant_id: str = Query("TNT-001")) -> dict[str, Any]:
    """Syncs only raw_calls sheet for given tenant."""
    verify_internal_or_admin(request)
    clean_tenant = (tenant_id or "TNT-001").strip().upper()

    delete_cached_json_sync(f"calls:{clean_tenant}")
    if clean_tenant in _CALLS_CACHE and isinstance(_CALLS_CACHE[clean_tenant], dict):
        _CALLS_CACHE[clean_tenant]["timestamp"] = 0

    calls = fetch_calls_from_sheets(tenant_id=clean_tenant, limit=100)
    _CALLS_CACHE[clean_tenant] = {"timestamp": time.time(), "calls": calls}
    set_cached_json_sync(f"calls:{clean_tenant}", calls, ex=300)

    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "status": "ok",
        "tenant_id": clean_tenant,
        "synced_at": now_iso,
        "calls": {
            "count": len(calls),
            "synced": True,
        },
    }


@router.post("/sync/deals")
async def sync_deals_sheet(request: Request, tenant_id: str = Query("TNT-001")) -> dict[str, Any]:
    """Syncs only raw_deals sheet for given tenant."""
    verify_internal_or_admin(request)
    clean_tenant = (tenant_id or "TNT-001").strip().upper()

    delete_cached_json_sync(f"deals:{clean_tenant}")
    if clean_tenant in _DEALS_CACHE and isinstance(_DEALS_CACHE[clean_tenant], dict):
        _DEALS_CACHE[clean_tenant]["timestamp"] = 0

    deals = fetch_deals_from_sheets(tenant_id=clean_tenant, limit=100)
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        "status": "ok",
        "tenant_id": clean_tenant,
        "synced_at": now_iso,
        "deals": {
            "count": len(deals),
            "synced": True,
        },
    }


@router.get("/status")
def get_sheets_sync_status(request: Request, tenant_id: str = Query("TNT-001")) -> dict[str, Any]:
    """Returns current sheet synchronization metadata and cached records count."""
    verify_internal_or_admin(request)
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    sheet_id = get_tenant_spreadsheet_id(clean_tenant)

    calls_cached = len(_CALLS_CACHE.get(clean_tenant, {}).get("calls", []))
    deals_cached = len(_DEALS_CACHE.get(clean_tenant, {}).get("deals", []))

    return {
        "status": "ok",
        "tenant_id": clean_tenant,
        "spreadsheet_id": sheet_id,
        "cached_calls_count": calls_cached,
        "cached_deals_count": deals_cached,
    }
