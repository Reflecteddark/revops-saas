# -*- coding: utf-8 -*-
"""
Next step of a deal, taken from the CRM itself.

amoCRM: open TASKS of the lead (`complete_till`). Bitrix24: open ACTIVITIES of the deal (`DEADLINE`) - the CRM "дела".
Until now `deals.next_step_date` was never filled from the CRM, so "no next step" / "next step overdue" in the SLA
rule (services/deal_sla.py) could only fire after somebody pressed the button by hand.

Rules (see resolve_next_step):
- the CRM answered and the deal has open tasks: the nearest FUTURE deadline is the next step; if every deadline is
  already in the past the deal has an OVERDUE next step;
- the CRM answered and the deal has NO open task: the next step is missing (has_next_step = False);
- the CRM did not answer (error / page limit hit): UNKNOWN - never "missing", or one failed request would paint the
  whole pipeline red;
- a date set by hand ("Назначить шаг") counts while it is still in the future and is not erased by a CRM sync.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger("crm_next_steps")

AMO_PAGE_LIMIT = 250
AMO_MAX_PAGES = 20            # 5 000 open tasks
BITRIX_MAX_PAGES = 40         # 2 000 open activities (50 per page)


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def parse_deadline(raw: Any) -> datetime | None:
    """Unix seconds (amoCRM) or ISO string (Bitrix24) -> aware UTC; None for empty / garbage."""
    if raw in (None, "", 0, "0"):
        return None
    try:
        if isinstance(raw, (int, float)) or (isinstance(raw, str) and re.fullmatch(r"\d{9,11}", raw.strip())):
            return datetime.fromtimestamp(int(raw), tz=timezone.utc)
        return _utc(datetime.fromisoformat(str(raw).strip().replace("Z", "+00:00")))
    except (ValueError, OverflowError, OSError):
        return None


def resolve_next_step(
    crm_deadlines: list[datetime] | None,
    manual: datetime | None,
    now: datetime | None = None,
) -> tuple[datetime | None, bool | None]:
    """Return (next_step_date, has_next_step); has_next_step None means "unknown, leave the deal as it is"."""
    now = _utc(now) if now else datetime.now(timezone.utc)
    manual = _utc(manual) if manual else None
    manual_future = manual if (manual and manual >= now) else None

    if crm_deadlines is None:                      # the CRM did not answer
        return (manual_future, True) if manual_future else (None, None)

    dls = [_utc(d) for d in crm_deadlines]
    future = [d for d in dls if d >= now]
    if manual_future:
        future.append(manual_future)
    if future:
        return min(future), True
    if dls:                                        # open tasks exist but all are overdue
        return max(dls), True
    return None, False                             # CRM answered: no open task at all


async def fetch_amocrm_open_task_deadlines(
    client: httpx.AsyncClient, domain: str, headers: dict[str, str]
) -> dict[str, list[datetime]] | None:
    """{lead id: [deadlines of its open tasks]}; None when the answer is incomplete (do not guess)."""
    result: dict[str, list[datetime]] = {}
    for page in range(1, AMO_MAX_PAGES + 1):
        url = (
            f"https://{domain}/api/v4/tasks?filter[is_completed]=0&filter[entity_type]=leads"
            f"&page={page}&limit={AMO_PAGE_LIMIT}"
        )
        try:
            resp = await client.get(url, headers=headers)
        except Exception as e:
            logger.warning(f"amoCRM tasks fetch failed (page {page}): {e}")
            return None
        if resp.status_code == 204:                # no (more) tasks
            return result
        if resp.status_code != 200:
            logger.warning(f"amoCRM tasks fetch returned HTTP {resp.status_code}")
            return None
        tasks = resp.json().get("_embedded", {}).get("tasks", [])
        for t in tasks:
            if t.get("is_completed") or str(t.get("entity_type") or "leads") != "leads":
                continue
            due = parse_deadline(t.get("complete_till"))
            if due and t.get("entity_id") is not None:
                result.setdefault(str(t["entity_id"]), []).append(due)
        if len(tasks) < AMO_PAGE_LIMIT:
            return result
    logger.warning("amoCRM tasks: page limit reached, next steps stay unknown")
    return None


async def fetch_bitrix24_open_activity_deadlines(
    client: httpx.AsyncClient, base_url: str
) -> dict[str, list[datetime]] | None:
    """{deal id: [deadlines of its open activities]}; None when the answer is incomplete."""
    result: dict[str, list[datetime]] = {}
    start: Any = 0
    for _ in range(BITRIX_MAX_PAGES):
        payload = {
            "filter": {"OWNER_TYPE_ID": 2, "COMPLETED": "N"},   # 2 = deal
            "select": ["ID", "OWNER_ID", "DEADLINE"],
            "order": {"ID": "ASC"},
            "start": start,
        }
        try:
            resp = await client.post(f"{base_url}/crm.activity.list", json=payload)
        except Exception as e:
            logger.warning(f"Bitrix24 activities fetch failed: {e}")
            return None
        if resp.status_code != 200:
            logger.warning(f"Bitrix24 activities fetch returned HTTP {resp.status_code}")
            return None
        data = resp.json()
        for a in data.get("result", []) or []:
            due = parse_deadline(a.get("DEADLINE"))
            if due and a.get("OWNER_ID") is not None:
                result.setdefault(str(a["OWNER_ID"]), []).append(due)
        start = data.get("next")
        if not start:
            return result
    logger.warning("Bitrix24 activities: page limit reached, next steps stay unknown")
    return None


def attach_task_deadlines(
    normalized: list[dict[str, Any]], deadlines_by_deal: dict[str, list[datetime]] | None, prefix: str
) -> None:
    """Put `crm_task_deadlines` (ISO strings, or None = unknown) on every normalized deal."""
    for norm in normalized:
        if deadlines_by_deal is None:
            norm["crm_task_deadlines"] = None
            continue
        raw_id = str(norm.get("deal_id") or "")
        raw_id = raw_id[len(prefix):] if raw_id.upper().startswith(prefix) else raw_id
        norm["crm_task_deadlines"] = [d.isoformat() for d in deadlines_by_deal.get(raw_id, [])]
