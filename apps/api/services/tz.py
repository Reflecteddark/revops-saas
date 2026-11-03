# -*- coding: utf-8 -*-
"""
Business-day time zone.

The server stores naive UTC datetimes. A call made at 22:30 UTC is 01:30 MSK, i.e. it belongs to the NEXT working day
of the РОП, and "this month" for revenue starts at 00:00 Moscow time, not UTC. Everything shown to a client or
grouped by day goes through here. Default: Europe/Moscow (fixed UTC+3 since 2014, so the fallback is exact).
"""

from datetime import datetime, timedelta, timezone, tzinfo

DEFAULT_TZ_NAME = "Europe/Moscow"
_MSK_FIXED = timezone(timedelta(hours=3), "MSK")


def get_tz(name: str | None = None) -> tzinfo:
    name = (name or DEFAULT_TZ_NAME).strip()
    try:
        from zoneinfo import ZoneInfo

        return ZoneInfo(name)
    except Exception:  # tzdata missing (Windows) or unknown name
        return _MSK_FIXED


def tenant_tz(tenant_cfg: dict | None) -> tzinfo:
    return get_tz((tenant_cfg or {}).get("timezone") if isinstance(tenant_cfg, dict) else None)


def to_local(dt: datetime, tz: tzinfo | None = None) -> datetime:
    """Naive datetimes are UTC (that is how the DB stores them)."""
    tz = tz or get_tz()
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(tz)


def local_str(dt: datetime | None, tz: tzinfo | None = None, fmt: str = "%Y-%m-%d %H:%M:%S") -> str:
    return to_local(dt, tz).strftime(fmt) if dt else ""


def local_month(tz: tzinfo | None = None, now: datetime | None = None) -> str:
    """Current calendar month 'YYYY-MM' in the business time zone."""
    return to_local(now or datetime.now(timezone.utc), tz).strftime("%Y-%m")
