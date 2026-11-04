# -*- coding: utf-8 -*-
"""
Who made a call. Only a user of the client's CRM (amoCRM / Bitrix24) is a manager.

A name the AI heard in a recording is not a manager: it used to create "managers" that exist nowhere in the CRM, and
they got ratings, a podium place and a risk alert. The team is tenant_cfg["managers"], kept by crm_users_sync; the raw
name stays in the stored call, so an old call finds its manager as soon as that user reaches the team list.
"""

import re
from typing import Any

UNKNOWN_MANAGER = "Не определён"  # apps/web/src/lib/systemNames.ts: out of every rating

_CRM_ID_LABEL = re.compile(r"^Менеджер #\S+$")  # n8n's label for a CRM user whose name it could not read


def _team(cfg: dict[str, Any] | None) -> list[dict[str, Any]]:
    managers = (cfg or {}).get("managers")
    return [m for m in managers if isinstance(m, dict)] if isinstance(managers, list) else []


def in_crm_team(cfg: dict[str, Any] | None, crm_id: Any, name: Any) -> bool:
    """True when the id or the exact name is on the team list."""
    clean_id, clean_name = str(crm_id or "").strip(), str(name or "").strip().casefold()
    for m in _team(cfg):
        if clean_id and str(m.get("id", "")).strip() == clean_id:
            return True
        if clean_name and str(m.get("name", "")).strip().casefold() == clean_name:
            return True
    return False


def resolve_call_manager(cfg: dict[str, Any] | None, crm_id: Any, name: Any) -> str:
    clean_id, clean_name = str(crm_id or "").strip(), str(name or "").strip()

    for m in _team(cfg):
        if clean_id and str(m.get("id", "")).strip() == clean_id:
            return str(m.get("name") or "").strip() or f"Менеджер #{clean_id}"
    if clean_id:  # a CRM user who has not reached the team list yet
        return clean_name or f"Менеджер #{clean_id}"

    for m in _team(cfg):
        if clean_name and str(m.get("name", "")).strip().casefold() == clean_name.casefold():
            return str(m.get("name")).strip()
    if _CRM_ID_LABEL.match(clean_name):
        return clean_name
    return UNKNOWN_MANAGER
