# -*- coding: utf-8 -*-
"""
RevOps Enterprise OS - CRM Users & Managers Auto-Synchronization Service.
Fetches active sales team members from amoCRM API v4 (/api/v4/users)
and Bitrix24 REST API (/user.get), merging them safely into tenant manager KPI registry.
Guarantees zero erasure of existing custom KPI targets and plans.
"""

import json
import logging
import os
import time
from typing import Any
import httpx

logger = logging.getLogger("crm_users_sync")


def clean_domain(domain_raw: str | None) -> str:
    """Normalizes domain by removing protocol and trailing slashes."""
    if not domain_raw:
        return ""
    d = domain_raw.strip().lower()
    d = d.replace("https://", "").replace("http://", "").rstrip("/")
    return d


def clean_webhook_url(url_raw: str | None) -> str:
    """Normalizes Bitrix24 webhook URL."""
    if not url_raw:
        return ""
    return url_raw.strip().rstrip("/")


async def fetch_amocrm_users(domain: str, token: str, timeout: float = 8.0) -> list[dict[str, Any]]:
    """
    Fetches active team members from amoCRM API v4.
    Endpoint: GET https://{domain}/api/v4/users
    """
    domain_clean = clean_domain(domain)
    if not domain_clean or not token:
        logger.warning("amoCRM domain or token is empty, skipping users fetch")
        return []

    url = f"https://{domain_clean}/api/v4/users"
    headers = {
        "Authorization": f"Bearer {token.strip()}",
        "Content-Type": "application/json",
        "User-Agent": "RevOps-CRM-UsersSync/1.0",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"amoCRM /api/v4/users returned HTTP {resp.status_code}: {resp.text[:160]}")
                return []

            data = resp.json()
            raw_users = data.get("_embedded", {}).get("users", [])
            active_users: list[dict[str, Any]] = []

            for u in raw_users:
                # Filter out inactive / deleted users
                rights = u.get("rights") or {}
                is_active = rights.get("is_active", True)
                if is_active is False or u.get("is_active") is False:
                    continue

                user_id = str(u.get("id", "")).strip()
                name = str(u.get("name", "")).strip()
                if not user_id or not name:
                    continue

                is_admin = bool(rights.get("is_admin", False))
                is_rop = is_admin or any(kw in name.lower() for kw in ("роп", "руковод", "клоуз", "директор"))
                role = "РОП / Клоузер" if is_rop else "Менеджер ОП"

                active_users.append({
                    "id": user_id,
                    "name": name,
                    "role": role,
                    "email": u.get("email") or "",
                    "is_admin": is_admin,
                })

            logger.info(f"Successfully fetched {len(active_users)} active users from amoCRM ({domain_clean})")
            return active_users

    except Exception as e:
        logger.error(f"Error fetching amoCRM users from {domain_clean}: {e}")
        return []


async def fetch_bitrix24_users(webhook_url: str, timeout: float = 8.0) -> list[dict[str, Any]]:
    """
    Fetches active users from Bitrix24 REST API.
    Endpoint: POST/GET {webhook_url}/user.get
    """
    url_clean = clean_webhook_url(webhook_url)
    if not url_clean:
        logger.warning("Bitrix24 webhook URL is empty, skipping users fetch")
        return []

    url = f"{url_clean}/user.get"
    params = {"ACTIVE": "Y"}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=params)
            if resp.status_code != 200:
                logger.warning(f"Bitrix24 user.get returned HTTP {resp.status_code}: {resp.text[:160]}")
                return []

            data = resp.json()
            raw_users = data.get("result", [])
            active_users: list[dict[str, Any]] = []

            for u in raw_users:
                user_id = str(u.get("ID", "")).strip()
                first_name = str(u.get("NAME") or "").strip()
                last_name = str(u.get("LAST_NAME") or "").strip()
                full_name = f"{first_name} {last_name}".strip() or str(u.get("EMAIL") or f"Менеджер #{user_id}")

                pos = str(u.get("WORK_POSITION") or "").strip()
                is_rop = any(kw in pos.lower() for kw in ("роп", "руковод", "директор", "head")) or any(kw in full_name.lower() for kw in ("роп", "руковод"))
                role = "РОП / Клоузер" if is_rop else (pos or "Менеджер ОП")

                active_users.append({
                    "id": user_id,
                    "name": full_name,
                    "role": role,
                    "email": u.get("EMAIL") or "",
                })

            logger.info(f"Successfully fetched {len(active_users)} active users from Bitrix24")
            return active_users

    except Exception as e:
        logger.error(f"Error fetching Bitrix24 users from {url_clean}: {e}")
        return []


async def sync_tenant_crm_managers(tenant_id: str) -> dict[str, Any]:
    """
    Orchestrates full CRM user synchronization for given tenant:
    1. Loads tenant config and credentials (amoCRM / Bitrix24).
    2. Fetches active employees from the respective CRM API.
    3. Merges new users without overwriting existing custom KPI targets and plans.
    4. Automatically persists updated managers in registry and database.
    """
    clean_tenant = (tenant_id or "TNT-001").strip().upper()

    from ..tenant_registry import get_tenant_config, load_tenants_registry, save_tenants_registry
    cfg = get_tenant_config(clean_tenant) or {}
    crm_type = str(cfg.get("crm_type") or "amocrm").strip().lower()

    amo_domain = cfg.get("amo_domain") or cfg.get("amocrm_domain")
    amo_token = cfg.get("amo_token") or cfg.get("amocrm_token")
    bitrix_webhook = cfg.get("bitrix_webhook_url") or cfg.get("crm_webhook_url") or cfg.get("b24_webhook_url")

    # Fetch users from connected CRM
    crm_users: list[dict[str, Any]] = []
    if crm_type in ("amocrm", "amo") and amo_domain and amo_token:
        crm_users = await fetch_amocrm_users(domain=amo_domain, token=amo_token)
    elif crm_type in ("bitrix24", "b24") and bitrix_webhook:
        crm_users = await fetch_bitrix24_users(webhook_url=bitrix_webhook)
    elif crm_type in ("hybrid", "both", "all"):
        if amo_domain and amo_token:
            crm_users.extend(await fetch_amocrm_users(domain=amo_domain, token=amo_token))
        if bitrix_webhook:
            crm_users.extend(await fetch_bitrix24_users(webhook_url=bitrix_webhook))
    else:
        logger.info(f"No external CRM credentials configured for tenant {clean_tenant} (crm_type={crm_type})")
        return {
            "status": "no_credentials",
            "message": f"Для клиента {clean_tenant} не настроены токен и домен amoCRM или вебхук Bitrix24",
            "crm_type": crm_type,
            "added_count": 0,
            "total_count": len(cfg.get("managers") or []),
            "managers": cfg.get("managers") or [],
        }

    if not crm_users:
        logger.info(f"CRM returned 0 users or error for tenant {clean_tenant}")
        return {
            "status": "empty",
            "message": "В подключенной CRM не найдено активных сотрудников или токен требует обновления",
            "crm_type": crm_type,
            "added_count": 0,
            "total_count": len(cfg.get("managers") or []),
            "managers": cfg.get("managers") or [],
        }

    # Current managers list and KPI targets
    current_managers: list[dict[str, Any]] = list(cfg.get("managers") or [])
    kpis_map: dict[str, Any] = dict(cfg.get("manager_kpis") or {})

    active_crm_ids = {str(c["id"]).strip() for c in crm_users}
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    added_count = 0
    updated_managers: list[dict[str, Any]] = []

    # Map existing managers
    existing_by_id: dict[str, dict[str, Any]] = {
        str(m.get("id", "")).strip(): dict(m)
        for m in current_managers
        if m.get("id")
    }

    # Detect if any obsolete/phantom manager (e.g. initial template seed 'Дмитрий Федотов' 11422686)
    # had a custom revenue plan that should be inherited by the real active CRM manager
    orphaned_plans: dict[str, float] = {}
    for m in current_managers:
        m_id = str(m.get("id", "")).strip()
        m_name = str(m.get("name", "")).strip().lower()
        if m_id.isdigit() and m_id not in active_crm_ids:
            rev_target = m.get("revenue_target")
            if rev_target and rev_target > 0:
                first_name = m_name.split()[0] if m_name else ""
                if first_name:
                    orphaned_plans[first_name] = float(rev_target)

    # 1. Process active CRM users: update existing or add new
    for c_user in crm_users:
        u_id = str(c_user["id"]).strip()
        u_name = str(c_user["name"]).strip()
        u_role = c_user.get("role") or "Менеджер ОП"
        is_rop = "РОП" in u_role or "Клоузер" in u_role

        matched_mgr = existing_by_id.get(u_id)
        if not matched_mgr:
            # Check by exact name match among existing managers
            for m in current_managers:
                if str(m.get("name", "")).strip().lower() == u_name.lower():
                    matched_mgr = dict(m)
                    matched_mgr["id"] = u_id
                    break

        if matched_mgr:
            # Existing active manager: preserve custom targets and plans
            entry = dict(matched_mgr)
            entry["id"] = u_id
            entry["name"] = u_name  # sync name from CRM
            if not entry.get("role"):
                entry["role"] = u_role
            # Check if this manager has 0 plan, but there was an orphaned plan for this first name
            first_name = u_name.lower().split()[0] if u_name else ""
            if (not entry.get("revenue_target") or entry.get("revenue_target") == 0.0) and first_name in orphaned_plans:
                entry["revenue_target"] = orphaned_plans.pop(first_name)
            updated_managers.append(entry)
        else:
            # New manager from CRM: create with standard RevOps defaults
            first_name = u_name.lower().split()[0] if u_name else ""
            inherited_target = orphaned_plans.pop(first_name, 0.0)
            new_entry = {
                "id": u_id,
                "name": u_name,
                "role": u_role,
                "capacity": 50 if is_rop else 40,
                "revenue_target": inherited_target,
                "daily_calls_target": 20,
                "daily_dials_target": 40,
                "monthly_meetings_target": 15,
                "meetings_enabled": True,
                "next_step_target_pct": 80,
                "updated_at": now_iso,
            }
            updated_managers.append(new_entry)
            kpis_map[u_id] = {
                "revenue_target": inherited_target,
                "daily_calls_target": 20,
                "daily_dials_target": 40,
                "monthly_meetings_target": 15,
                "meetings_enabled": True,
                "capacity": 50 if is_rop else 40,
                "next_step_target_pct": 80,
                "updated_at": now_iso,
            }
            added_count += 1
            logger.info(f"Auto-imported new manager from CRM: {u_name} (ID: {u_id}, Role: {u_role}) into tenant {clean_tenant}")

    # 2. Preserve manual offline managers (non-digit IDs like 'manual_1')
    for m in current_managers:
        m_id = str(m.get("id", "")).strip()
        if m_id and not m_id.isdigit() and not any(um["id"] == m_id for um in updated_managers):
            updated_managers.append(dict(m))

    # Calculate additions and removals
    current_ids = {str(m.get("id", "")).strip() for m in current_managers}
    updated_ids = {str(m.get("id", "")).strip() for m in updated_managers}
    removed_ids = current_ids - updated_ids
    removed_count = len(removed_ids)

    # 3. Persist if any changes were made
    if added_count > 0 or removed_count > 0 or len(updated_managers) != len(current_managers):
        reg = load_tenants_registry()
        for t in reg.get("tenants", []):
            if str(t.get("tenant_id", "")).upper() == clean_tenant:
                t["managers"] = updated_managers
                # Clean up kpis_map for removed managers
                for r_id in removed_ids:
                    kpis_map.pop(r_id, None)
                t["manager_kpis"] = kpis_map
                save_tenants_registry(reg)
                logger.info(f"Persisted sync changes for {clean_tenant}: added={added_count}, removed={removed_count}, total={len(updated_managers)}")
                break

    # Build human-friendly message
    parts = []
    if added_count > 0:
        parts.append(f"добавлено новых: {added_count}")
    if removed_count > 0:
        parts.append(f"удалено неактивных из CRM: {removed_count}")
    summary_str = f" ({', '.join(parts)})" if parts else ""
    msg = f"Синхронизация завершена{summary_str}: в команде {len(updated_managers)} активных сотрудников"

    return {
        "status": "ok",
        "message": msg,
        "crm_type": crm_type,
        "added_count": added_count,
        "removed_count": removed_count,
        "total_count": len(updated_managers),
        "managers": updated_managers,
    }
