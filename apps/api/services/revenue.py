# -*- coding: utf-8 -*-
"""
Revenue of WON deals by calendar month (business time zone) - the single source for the Pulse KPI and
/metrics/revenue-history.

Won month = month of custom_payload.last_stage_change (the CRM date; the sync keeps the date a deal was first seen
won). Deals synced before that field existed fall back to updated_at (reported via `approximated`).
"""

from datetime import tzinfo

from sqlalchemy.orm import Session

from packages.database.models import Deal, DealStage

from .tz import get_tz, local_month, to_local


def won_revenue_by_month(db: Session, tenant_id: str, tz: tzinfo | None = None) -> tuple[dict[str, dict[str, float]], bool]:
    """({'YYYY-MM': {'revenue': ..., 'won_count': ...}}, approximated)."""
    tz = tz or get_tz()
    t = (tenant_id or "").strip()
    deals = (
        db.query(Deal)
        .filter(Deal.tenant_id.in_({t, t.upper(), t.lower()}))
        .filter(Deal.is_deleted == False)  # noqa: E712
        .all()
    )
    by_month: dict[str, dict[str, float]] = {}
    approximated = False
    for d in deals:
        if not (d.stage == DealStage.WON or "успешно" in str(d.stage_name or "").lower()):
            continue
        payload = d.custom_payload if isinstance(d.custom_payload, dict) else {}
        month = str(payload.get("last_stage_change") or "")[:7]
        if not month:
            approximated = True
            month = to_local(d.updated_at, tz).strftime("%Y-%m") if d.updated_at else ""
        if not month:
            continue
        bucket = by_month.setdefault(month, {"revenue": 0.0, "won_count": 0})
        bucket["revenue"] += float(d.budget or 0)
        bucket["won_count"] += 1
    return by_month, approximated


def last_months(n: int, tz: tzinfo | None = None) -> list[str]:
    """The last n calendar months ending with the current one, oldest first."""
    tz = tz or get_tz()
    year, month = (int(x) for x in local_month(tz).split("-"))
    out: list[str] = []
    for _ in range(n):
        out.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return out[::-1]


__all__ = ["last_months", "won_revenue_by_month"]
