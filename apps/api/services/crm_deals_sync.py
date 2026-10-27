# -*- coding: utf-8 -*-
"""
RevOps Enterprise OS - CRM Deals Synchronization Engine.
Fetches leads and deals directly from amoCRM API v4 and Bitrix24 REST API,
normalizes them into standard RevOps schema, persists them into PostgreSQL,
auto-provisions amoCRM webhooks, and synchronizes with Google Sheets raw_deals.
"""

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Any
import httpx
from sqlalchemy.orm import Session

from packages.database.models import Deal, DealStage, SubscriptionTier, Tenant, Workspace, User
from packages.database.session import SessionLocal
from ..cache_client import delete_cached_json_sync
from ..tenant_registry import get_tenant_config
from .crm_deal_normalizer import (
    normalize_amocrm_deal,
    normalize_bitrix24_deal,
)

logger = logging.getLogger("crm_deals_sync")

STAGE_MAP_HEURISTICS: dict[str, DealStage] = {
    "142": DealStage.WON,
    "143": DealStage.LOST,
    "WON": DealStage.WON,
    "LOST": DealStage.LOST,
    "LOSE": DealStage.LOST,
    "NEW": DealStage.LEAD_INCOMING,
    "PREPARATION": DealStage.QUALIFICATION,
    "PREPAYMENT": DealStage.MEETING_SCHEDULED,
    "EXECUTING": DealStage.MEETING_DONE,
    "FINAL": DealStage.CONTRACT_PAYMENT,
}


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


def map_stage_to_enum(stage_str: str | None, is_won: bool = False, is_lost: bool = False) -> DealStage:
    """Maps stage name or status identifier to strict DealStage enum."""
    if is_won:
        return DealStage.WON
    if is_lost:
        return DealStage.LOST

    s = str(stage_str or "").strip().upper()
    if s in STAGE_MAP_HEURISTICS:
        return STAGE_MAP_HEURISTICS[s]

    if any(k in s for k in ("УСПЕШ", "WON", "SUCCESS", "ОПЛАЧЕНО")):
        return DealStage.WON
    if any(k in s for k in ("ОТКАЗ", "ЗАКРЫТ", "НЕ РЕАЛИЗ", "LOST", "LOSE", "FAIL")):
        return DealStage.LOST
    if any(k in s for k in ("ДОГОВОР", "СЧЕТ", "СЧЁТ", "CONTRACT", "INVOICE", "FINAL")):
        return DealStage.CONTRACT_PAYMENT
    if any(k in s for k in ("РЕШЕНИ", "DECISION")):
        return DealStage.DECISION_MAKING
    if any(k in s for k in ("КП", "ПРЕДЛОЖЕН", "PROPOSAL")):
        return DealStage.COMMERCIAL_PROPOSAL
    if any(k in s for k in ("ВСТРЕЧ", "ДЕМО", "КЭВ", "MEETING")):
        return DealStage.MEETING_SCHEDULED
    if any(k in s for k in ("КВАЛИФ", "ПЕРЕГОВОР", "QUALIF")):
        return DealStage.QUALIFICATION

    return DealStage.LEAD_INCOMING


async def auto_register_amocrm_webhook(domain_clean: str, token: str, tenant_id: str, client: httpx.AsyncClient) -> bool:
    """
    Checks and auto-registers webhook destination in amoCRM if not already present.
    Webhook URL: https://report.ai-rop.ru/api/v1/webhooks/{tenant_id}/amocrm
    """
    dest_url = f"https://report.ai-rop.ru/api/v1/webhooks/{tenant_id}/amocrm"
    headers = {
        "Authorization": f"Bearer {token.strip()}",
        "Content-Type": "application/json",
        "User-Agent": "RevOps-CRM-DealsSync/1.0",
    }
    try:
        # 1. List existing webhooks
        list_url = f"https://{domain_clean}/api/v4/webhooks"
        resp = await client.get(list_url, headers=headers, timeout=6.0)
        if resp.status_code == 200:
            wh_data = resp.json()
            existing = wh_data.get("_embedded", {}).get("webhooks", [])
            for w in existing:
                if str(w.get("destination", "")).strip().rstrip("/") == dest_url.rstrip("/"):
                    logger.info(f"amoCRM webhook already registered for {tenant_id}: {dest_url}")
                    return True

        # 2. Register webhook
        sub_body = {
            "destination": dest_url,
            "settings": ["add_lead", "update_lead", "status_lead", "delete_lead"]
        }
        sub_resp = await client.post(list_url, json=sub_body, headers=headers, timeout=6.0)
        if sub_resp.status_code in (200, 201):
            logger.info(f"Successfully auto-registered amoCRM webhook for {tenant_id}: {dest_url}")
            return True
        else:
            logger.warning(f"amoCRM webhook registration returned {sub_resp.status_code}: {sub_resp.text[:120]}")
            return False
    except Exception as e:
        logger.warning(f"Error checking/registering amoCRM webhook for {tenant_id}: {e}")
        return False


async def fetch_amocrm_deals(domain: str, token: str, tenant_id: str, timeout: float = 12.0) -> list[dict[str, Any]]:
    """
    Fetches leads from amoCRM with pipelines, stages catalog, and user mappings.
    Returns normalized deals array ready for persistence.
    """
    domain_clean = clean_domain(domain)
    if not domain_clean or not token:
        logger.warning(f"Tenant {tenant_id} missing amoCRM domain or token")
        return []

    headers = {
        "Authorization": f"Bearer {token.strip()}",
        "Content-Type": "application/json",
        "User-Agent": "RevOps-CRM-DealsSync/1.0",
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        # 1. Pipelines & Stages catalog
        stages_catalog: dict[str, Any] = {}
        try:
            p_url = f"https://{domain_clean}/api/v4/leads/pipelines"
            p_resp = await client.get(p_url, headers=headers)
            if p_resp.status_code == 200:
                p_data = p_resp.json()
                for p in p_data.get("_embedded", {}).get("pipelines", []):
                    p_id = str(p.get("id"))
                    for s in p.get("_embedded", {}).get("statuses", []):
                        s_id = str(s.get("id"))
                        s_name = str(s.get("name", ""))
                        is_won = (s_id == "142") or ("успеш" in s_name.lower())
                        is_lost = (s_id == "143") or ("не реализов" in s_name.lower()) or ("отказ" in s_name.lower())
                        stage_meta = {
                            "name": s_name,
                            "sort": s.get("sort", 10),
                            "pipeline_id": p_id,
                            "is_won": is_won,
                            "is_lost": is_lost,
                        }
                        stages_catalog[s_id] = stage_meta
                        stages_catalog[f"{p_id}:{s_id}"] = stage_meta
        except Exception as e_p:
            logger.warning(f"Could not fetch amoCRM pipelines: {e_p}")

        # 2. Users catalog
        users_catalog: dict[str, str] = {}
        try:
            u_url = f"https://{domain_clean}/api/v4/users"
            u_resp = await client.get(u_url, headers=headers)
            if u_resp.status_code == 200:
                u_data = u_resp.json()
                for u in u_data.get("_embedded", {}).get("users", []):
                    u_id = str(u.get("id"))
                    u_name = str(u.get("name", "")).strip()
                    if u_id and u_name:
                        users_catalog[u_id] = u_name
        except Exception as e_u:
            logger.warning(f"Could not fetch amoCRM users: {e_u}")

        # 3. Auto-register webhook in background of sync
        await auto_register_amocrm_webhook(domain_clean, token, tenant_id, client)

        # 4. Fetch leads (with pagination)
        raw_leads: list[dict[str, Any]] = []
        page = 1
        max_pages = 10
        while page <= max_pages:
            leads_url = f"https://{domain_clean}/api/v4/leads?with=contacts&page={page}&limit=250"
            try:
                resp = await client.get(leads_url, headers=headers)
                if resp.status_code == 204:
                    # No content / empty
                    break
                if resp.status_code != 200:
                    logger.warning(f"amoCRM leads fetch returned HTTP {resp.status_code}: {resp.text[:120]}")
                    break
                data = resp.json()
                page_leads = data.get("_embedded", {}).get("leads", [])
                if not page_leads:
                    break
                raw_leads.extend(page_leads)
                if len(page_leads) < 250:
                    break
                page += 1
            except Exception as e_l:
                logger.error(f"Error fetching amoCRM leads page {page}: {e_l}")
                break

        logger.info(f"Fetched {len(raw_leads)} raw leads from amoCRM for tenant {tenant_id}")

        # Normalize leads
        normalized: list[dict[str, Any]] = []
        for l in raw_leads:
            try:
                norm = normalize_amocrm_deal(
                    l,
                    tenant_id=tenant_id,
                    stages_catalog=stages_catalog,
                    users_catalog=users_catalog
                )
                normalized.append(norm)
            except Exception as e_norm:
                logger.warning(f"Failed to normalize amoCRM lead ID {l.get('id')}: {e_norm}")

        return normalized


async def fetch_bitrix24_deals(webhook_url: str, tenant_id: str, timeout: float = 12.0) -> list[dict[str, Any]]:
    """
    Fetches deals from Bitrix24 REST API with stages catalog and user mappings.
    Returns normalized deals array ready for persistence.
    """
    url_clean = clean_webhook_url(webhook_url)
    if not url_clean:
        logger.warning(f"Tenant {tenant_id} missing Bitrix24 webhook URL")
        return []

    async with httpx.AsyncClient(timeout=timeout) as client:
        # 1. Stages catalog
        stages_catalog: dict[str, Any] = {}
        try:
            st_url = f"{url_clean}/crm.status.list"
            st_resp = await client.post(st_url, json={"filter": {"ENTITY_ID": "DEAL_STAGE"}})
            if st_resp.status_code == 200:
                for item in st_resp.json().get("result", []):
                    st_id = str(item.get("STATUS_ID") or "")
                    st_name = str(item.get("NAME") or "")
                    semantic = str(item.get("SEMANTICS") or "")
                    stages_catalog[st_id] = {
                        "name": st_name,
                        "semantic": semantic,
                        "is_won": (semantic == "S"),
                        "is_lost": (semantic == "F"),
                    }
        except Exception as e_s:
            logger.warning(f"Could not fetch Bitrix24 deal stages: {e_s}")

        # 2. Users catalog
        users_catalog: dict[str, str] = {}
        try:
            u_url = f"{url_clean}/user.get"
            u_resp = await client.post(u_url, json={})
            if u_resp.status_code == 200:
                for u in u_resp.json().get("result", []):
                    uid = str(u.get("ID") or "")
                    first = str(u.get("NAME") or "").strip()
                    last = str(u.get("LAST_NAME") or "").strip()
                    full = f"{first} {last}".strip() or str(u.get("EMAIL") or f"Пользователь #{uid}")
                    if uid:
                        users_catalog[uid] = full
        except Exception as e_u:
            logger.warning(f"Could not fetch Bitrix24 users: {e_u}")

        # 3. Fetch deals with pagination
        raw_deals: list[dict[str, Any]] = []
        start = 0
        max_pages = 10
        for _ in range(max_pages):
            deal_url = f"{url_clean}/crm.deal.list"
            payload = {
                "order": {"ID": "DESC"},
                "select": ["ID", "TITLE", "OPPORTUNITY", "STAGE_ID", "STAGE_SEMANTIC_ID", "ASSIGNED_BY_ID", "DATE_CREATE", "DATE_MODIFY", "UF_*"],
                "start": start
            }
            try:
                resp = await client.post(deal_url, json=payload)
                if resp.status_code != 200:
                    break
                data = resp.json()
                batch = data.get("result", [])
                if not batch:
                    break
                raw_deals.extend(batch)
                start = data.get("next")
                if not start:
                    break
            except Exception as e_d:
                logger.error(f"Error fetching Bitrix24 deals batch: {e_d}")
                break

        logger.info(f"Fetched {len(raw_deals)} raw deals from Bitrix24 for tenant {tenant_id}")

        normalized: list[dict[str, Any]] = []
        for d in raw_deals:
            try:
                norm = normalize_bitrix24_deal(
                    d,
                    tenant_id=tenant_id,
                    stages_catalog=stages_catalog,
                    users_catalog=users_catalog
                )
                normalized.append(norm)
            except Exception as e_norm:
                logger.warning(f"Failed to normalize Bitrix24 deal ID {d.get('ID')}: {e_norm}")

        return normalized


def sync_deals_to_database(tenant_id: str, normalized_deals: list[dict[str, Any]], db: Session) -> dict[str, int]:
    """
    Persists normalized deals into PostgreSQL 'deals' table with strict workspace and tenant isolation.
    Soft-deletes or prunes missing records for this tenant.
    """
    clean_tid = tenant_id.strip().upper()

    # 1. Ensure Tenant exists in DB
    tenant = db.query(Tenant).filter(Tenant.id == clean_tid).first()
    if not tenant:
        cfg = get_tenant_config(clean_tid) or {}
        tenant = Tenant(
            id=clean_tid,
            name=cfg.get("tenant_name", f"Tenant {clean_tid}"),
            slug=clean_tid.lower().replace("_", "-"),
            tier=SubscriptionTier.PRO,
            is_active=True,
            settings=cfg
        )
        db.add(tenant)
        db.commit()
        db.refresh(tenant)

    # 2. Ensure Workspace exists in DB
    ws_id = f"ws_{clean_tid}"
    workspace = db.query(Workspace).filter(Workspace.tenant_id == clean_tid).first()
    if not workspace:
        workspace = Workspace(
            id=ws_id,
            tenant_id=clean_tid,
            name="Default Workspace",
            crm_type=tenant.crm_type or "amocrm",
            crm_connected=True
        )
        db.add(workspace)
        db.commit()
        db.refresh(workspace)

    inserted = 0
    updated = 0
    active_deal_ids: set[str] = set()

    # Build user map for fast assigned_user_id link if matches
    db_users = db.query(User).filter(User.tenant_id == clean_tid).all()
    user_name_to_id = {u.full_name.lower().strip(): u.id for u in db_users}

    for norm in normalized_deals:
        deal_id = str(norm["deal_id"]).strip()
        active_deal_ids.add(deal_id)

        title = str(norm.get("company_name") or norm.get("title") or f"Сделка {deal_id}")
        amount = float(norm.get("amount") or 0.0)
        is_won = str(norm.get("is_won", "0")) in ("1", "true", "True")
        is_lost = str(norm.get("is_lost", "0")) in ("1", "true", "True")
        is_deleted = str(norm.get("is_deleted", "0")) in ("1", "true", "True")

        stage_name = norm.get("stage_name") or norm.get("stage_id")
        stage_enum = map_stage_to_enum(stage_name, is_won=is_won, is_lost=is_lost)

        status = "DELETED" if is_deleted else ("WON" if stage_enum == DealStage.WON else ("LOST" if stage_enum == DealStage.LOST else "ACTIVE"))
        crm_source = str(norm.get("source") or norm.get("crm_source") or "amocrm")

        # SLA risk calculation
        sla_risk = bool(
            not is_won and not is_lost and not is_deleted and (
                stage_enum in (DealStage.LEAD_INCOMING, DealStage.QUALIFICATION)
                or "первичный" in str(stage_name).lower()
                or "кп" in str(stage_name).lower()
            )
        )

        manager_name = str(norm.get("manager_name") or "Не назначен")
        assigned_uid = user_name_to_id.get(manager_name.lower().strip())

        custom_payload = {
            "manager_name": manager_name,
            "stage_name": stage_name,
            "weighted_amount": norm.get("weighted_amount"),
            "client_grade": norm.get("client_grade", "B"),
            "source": crm_source,
        }

        db_deal = db.query(Deal).filter(Deal.id == deal_id).first()
        if not db_deal:
            # Also check by external_crm_id
            db_deal = db.query(Deal).filter(
                (Deal.tenant_id == clean_tid) & (Deal.external_crm_id == deal_id)
            ).first()

        if not db_deal:
            db_deal = Deal(
                id=deal_id,
                tenant_id=clean_tid,
                workspace_id=workspace.id,
                assigned_user_id=assigned_uid,
                external_crm_id=deal_id,
                title=title,
                company_name=title,
                budget=amount,
                stage=stage_enum,
                crm_source=crm_source,
                status=status,
                is_deleted=is_deleted,
                is_at_risk=sla_risk,
                weighted_amount=norm.get("weighted_amount"),
                custom_payload=custom_payload,
            )
            db.add(db_deal)
            inserted += 1
        else:
            setattr(db_deal, "title", title)
            setattr(db_deal, "company_name", title)
            setattr(db_deal, "budget", amount)
            setattr(db_deal, "stage", stage_enum)
            setattr(db_deal, "crm_source", crm_source)
            setattr(db_deal, "status", status)
            setattr(db_deal, "is_deleted", is_deleted)
            setattr(db_deal, "is_at_risk", sla_risk)
            setattr(db_deal, "weighted_amount", norm.get("weighted_amount"))
            setattr(db_deal, "custom_payload", custom_payload)
            if assigned_uid:
                setattr(db_deal, "assigned_user_id", assigned_uid)
            updated += 1

    # Prune / soft-delete obsolete deals that are no longer in CRM
    existing_deals = db.query(Deal).filter(Deal.tenant_id == clean_tid).all()
    pruned = 0
    for ed in existing_deals:
        if active_deal_ids and ed.id not in active_deal_ids and ed.external_crm_id not in active_deal_ids:
            if not ed.is_deleted:
                setattr(ed, "is_deleted", True)
                setattr(ed, "status", "DELETED")
                pruned += 1

    db.commit()

    # Invalidate cache
    delete_cached_json_sync(f"deals:{clean_tid}")

    logger.info(f"Tenant {clean_tid} deal sync completed: {inserted} inserted, {updated} updated, {pruned} pruned")
    return {"inserted": inserted, "updated": updated, "pruned": pruned, "total_synced": len(normalized_deals)}


async def sync_deals_for_tenant(tenant_id: str, db: Session | None = None) -> dict[str, Any]:
    """
    Main entry point for syncing deals of a tenant from their active CRM.
    Pulls from amoCRM or Bitrix24, persists to PostgreSQL, and invalidates cache.
    """
    clean_tid = (tenant_id or "TNT-001").strip().upper()
    cfg = get_tenant_config(clean_tid) or {}

    crm_type = str(cfg.get("crm_type") or "bitrix24").strip().lower()
    amo_domain = cfg.get("amo_domain")
    amo_token = cfg.get("amo_token")
    bitrix_webhook = cfg.get("bitrix_webhook_url")

    all_normalized: list[dict[str, Any]] = []
    sync_sources: list[str] = []
    amo_deals: list[dict[str, Any]] = []
    b24_deals: list[dict[str, Any]] = []

    # 1. Check amoCRM
    if amo_domain and amo_token:
        amo_deals = await fetch_amocrm_deals(amo_domain, amo_token, tenant_id=clean_tid)
        all_normalized.extend(amo_deals)
        sync_sources.append("amoCRM")

    # 2. Check Bitrix24
    if bitrix_webhook and (crm_type in ("bitrix24", "both", "hybrid") or not amo_deals):
        b24_deals = await fetch_bitrix24_deals(bitrix_webhook, tenant_id=clean_tid)
        all_normalized.extend(b24_deals)
        sync_sources.append("Bitrix24")

    # 3. Persist to DB
    own_db = False
    if db is None:
        db = SessionLocal()
        own_db = True

    try:
        stats = sync_deals_to_database(clean_tid, all_normalized, db)
    finally:
        if own_db:
            db.close()

    total_pipeline = sum(d.get("amount", 0.0) for d in all_normalized if not str(d.get("is_deleted", "0")) in ("1", "true"))
    won_amount = sum(d.get("amount", 0.0) for d in all_normalized if str(d.get("is_won", "0")) in ("1", "true"))

    return {
        "status": "ok",
        "tenant_id": clean_tid,
        "sources": sync_sources,
        "deals_count": len(all_normalized),
        "total_pipeline": total_pipeline,
        "won_amount": won_amount,
        "details": stats,
    }
