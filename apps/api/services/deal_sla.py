# -*- coding: utf-8 -*-
"""
SLA risk of an open deal — ONE definition for the CRM sync, the deals API and the insights.

A deal is at risk when it is open AND at least one of:
- no_next_step         : the next step was explicitly marked as missing (has_next_step = False);
- next_step_overdue    : next_step_date is set and already in the past;
- stalled              : it sits on one stage longer than the stage SLA (default 3 days) and has no FUTURE
                         next step planned (a planned contact is what the SLA asks for).

Before this, the risk was "the deal is on an early stage or its name contains «КП»" — a deal became "at risk"
just by being new — and `days_in_stage` / `next_step_date` were never written anywhere, so the stagnation and
next-step rules could not fire at all.

A deal whose next_step_date is simply unknown (CRM tasks are not synced yet) is NOT flagged on that alone:
flagging all of them would paint 100% of every fresh pipeline red.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

DEFAULT_STAGE_SLA_DAYS = 3
_CLOSED_WORDS = ("успешно", "закрыт", "отказ", "не реализовано")


@dataclass(frozen=True)
class SlaState:
    days_in_stage: int
    at_risk: bool
    reasons: tuple[str, ...]

    @property
    def reason_text(self) -> str:
        return "; ".join(REASON_TEXT.get(r, r) for r in self.reasons)


REASON_TEXT = {
    "no_next_step": "Нет следующего шага",
    "next_step_overdue": "Дата следующего шага просрочена",
    "stalled": "Зависла на этапе дольше регламента",
}


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def parse_moment(raw: Any) -> datetime | None:
    """ISO date or datetime (as written to custom_payload) -> aware UTC; None when absent/garbage."""
    if not raw:
        return None
    if isinstance(raw, datetime):
        return _aware(raw)
    try:
        return _aware(datetime.fromisoformat(str(raw).strip().replace("Z", "+00:00")))
    except ValueError:
        return None


def is_closed(deal: Any) -> bool:
    stage = getattr(deal, "stage", None)
    stage_val = str(getattr(stage, "name", stage) or "").upper()
    status = str(getattr(deal, "status", "") or "").upper()
    name = str(getattr(deal, "stage_name", "") or "").lower()
    return bool(
        getattr(deal, "is_deleted", False)
        or status in ("WON", "LOST", "DELETED")
        or stage_val in ("WON", "LOST")
        or any(w in name for w in _CLOSED_WORDS)
    )


def stage_since(deal: Any) -> datetime | None:
    payload = getattr(deal, "custom_payload", None)
    payload = payload if isinstance(payload, dict) else {}
    return parse_moment(payload.get("stage_since")) or parse_moment(payload.get("last_stage_change"))


def deal_sla_state(deal: Any, now: datetime | None = None) -> SlaState:
    now = _aware(now) or datetime.now(timezone.utc)
    since = stage_since(deal)
    days = max(0, (now - since).days) if since else 0
    if is_closed(deal):
        return SlaState(days, False, ())

    reasons: list[str] = []
    next_dt = _aware(getattr(deal, "next_step_date", None))
    has_future_step = bool(next_dt and next_dt >= now)

    if getattr(deal, "has_next_step", True) is False:
        reasons.append("no_next_step")
    if next_dt and next_dt < now:
        reasons.append("next_step_overdue")
    sla_days = getattr(deal, "stage_sla_days", None) or DEFAULT_STAGE_SLA_DAYS
    if days > sla_days and not has_future_step:
        reasons.append("stalled")
    return SlaState(days, bool(reasons), tuple(reasons))


def stamp_stage_since(deal: Any, stage_changed: bool, now: datetime | None = None) -> None:
    """Remember WHEN the deal entered its current stage (our own observation, stored in custom_payload).

    New deal: the CRM's last-change date if known (set by the caller via last_stage_change), else now.
    Existing deal: only a real stage change moves it, so the counter keeps running between syncs."""
    now = _aware(now) or datetime.now(timezone.utc)
    payload = dict(deal.custom_payload) if isinstance(deal.custom_payload, dict) else {}
    if stage_changed or not parse_moment(payload.get("stage_since")):
        started = None if stage_changed else parse_moment(payload.get("last_stage_change"))
        payload["stage_since"] = (started or now).isoformat()
        deal.custom_payload = payload


def end_of_local_day_utc(day: datetime, tz: Any) -> datetime:
    """A date-only next step means 'by the end of that day' in the client's time zone."""
    local = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=tz)
    return local.astimezone(timezone.utc)


__all__ = [
    "DEFAULT_STAGE_SLA_DAYS",
    "SlaState",
    "deal_sla_state",
    "end_of_local_day_utc",
    "is_closed",
    "parse_moment",
    "stage_since",
    "stamp_stage_since",
]
