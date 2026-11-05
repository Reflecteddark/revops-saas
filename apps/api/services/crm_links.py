# -*- coding: utf-8 -*-
"""
A link from the audit card to the deal in the client's own CRM.

Built from the CRM address in the tenant config: the host only. A Bitrix24 webhook URL holds a secret in its path
(https://portal.bitrix24.ru/rest/1/<secret>/): it is never copied, only its host is taken. Nothing that is not a plain
public host name becomes a link, and a deal id that is not a plain CRM number (an old invented "D-100") gives no link.
"""

import re
from typing import Any
from urllib.parse import urlsplit

from .workspaces import normalize_crm_type

_HOST = re.compile(r"^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$")
OWN_DOMAIN = "ai-rop.ru"  # our own webhook address is not the client's CRM
_AMO_ID = re.compile(r"^(?:AMO-)?(\d{1,15})$", re.IGNORECASE)  # n8n stores the amoCRM deal as "AMO-<number>"
_B24_ID = re.compile(r"^(?:B24-)?(\d{1,15})$", re.IGNORECASE)


def _host(raw: Any) -> str | None:
    text = str(raw or "").strip().lower()
    if not text:
        return None
    try:
        host = urlsplit(text if "//" in text else "//" + text).hostname
    except ValueError:
        return None
    return host if host and _HOST.match(host) else None


def crm_deal_url(cfg: dict[str, Any] | None, external_id: Any) -> str | None:
    """https link to the deal in the client's CRM, or None when it cannot be told for sure."""
    cfg = cfg or {}
    deal = str(external_id or "").strip()
    crm = normalize_crm_type(cfg.get("crm_type")) or ("amocrm" if cfg.get("amo_domain") else None)
    if crm == "amocrm":
        host = _host(cfg.get("amo_domain"))
        number = _AMO_ID.match(deal)
        return f"https://{host}/leads/detail/{number[1]}" if host and number else None
    if crm == "bitrix24":
        number = _B24_ID.match(deal)
        if not number:
            return None
        for key in ("b24_webhook_url", "crm_webhook_url", "bitrix_webhook_url"):
            host = _host(cfg.get(key))
            if host and not (host == OWN_DOMAIN or host.endswith("." + OWN_DOMAIN)):
                return f"https://{host}/crm/deal/details/{number[1]}/"
    return None
