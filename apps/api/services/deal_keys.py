"""
Tenant-scoped deal identity.

`deals.id` is a GLOBAL primary key, but CRM deal numbers are only unique inside one CRM portal
(every Bitrix24 portal starts at 1, so `B24-1` exists for every client). Looking a deal up by
`Deal.id` alone let one client's sync overwrite another client's deal. Always look deals up
through `find_tenant_deal` and create them with `deal_pk_for`; the CRM id stays in `external_crm_id`.
"""

import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from packages.database.models import Deal

PK_MAX_LEN = 36  # deals.id is VARCHAR(36)


def find_tenant_deal(db: Session, tenant_id: str, crm_id: str) -> Deal | None:
    """The tenant's own deal for a CRM id, whichever way its primary key was built."""
    crm_id = str(crm_id).strip()
    pk = _prefixed_pk(tenant_id, crm_id)
    t = tenant_id.strip()
    base = db.query(Deal).filter(Deal.tenant_id.in_({t, t.upper(), t.lower()}))
    found = base.filter((Deal.id == crm_id) | (Deal.external_crm_id == crm_id) | (Deal.id == pk)).first()
    if found or not crm_id.isdigit():
        return found
    # n8n sends the bare lead number ("5272089"), the CRM sync stores it with a prefix ("AMO-5272089"): the same
    # deal. Match the prefixed form, but only when it is unambiguous (a hybrid tenant can have AMO-5 and B24-5).
    prefixed = base.filter(Deal.external_crm_id.in_([f"AMO-{crm_id}", f"B24-{crm_id}", f"BX_{crm_id}"])).limit(2).all()
    return prefixed[0] if len(prefixed) == 1 else None


def deal_pk_for(db: Session, tenant_id: str, crm_id: str) -> str:
    """Primary key for a NEW deal: the CRM id if it is free, otherwise a tenant-scoped one."""
    crm_id = str(crm_id).strip()
    if len(crm_id) <= PK_MAX_LEN and not db.query(Deal.id).filter(Deal.id == crm_id).first():
        return crm_id
    return _prefixed_pk(tenant_id, crm_id)


def _prefixed_pk(tenant_id: str, crm_id: str) -> str:
    pk = f"{tenant_id}:{crm_id}"
    if len(pk) > PK_MAX_LEN:
        # deterministic, so a retry finds the same row instead of creating a duplicate
        pk = str(uuid.uuid5(uuid.NAMESPACE_URL, f"revops-deal:{tenant_id}:{crm_id}"))
    return pk


def _crm_class(deal_id: str, source: Any) -> str:
    u = deal_id.upper()
    if u.startswith("AMO-"):
        return "amo"
    if u.startswith(("B24-", "BX_")):
        return "b24"
    s = str(source or "").lower()
    if "amo" in s:
        return "amo"
    if "bitrix" in s or "b24" in s:
        return "b24"
    return "?"


def dedupe_same_crm_deals(deals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One row per real deal in a mirror that holds the same lead under two id formats ("5272089" and "AMO-5272089").

    Only deals of the SAME CRM are merged (AMO-5 and B24-5 are different deals); a row whose CRM cannot be told is
    never merged. The row with the later updated_at wins, a tie goes to the prefixed id."""
    kept: dict[tuple[str, ...], dict[str, Any]] = {}
    order: list[tuple[str, ...]] = []
    for d in deals:
        did = str(d.get("id") or d.get("deal_id") or "").strip()
        digits = re.sub(r"\D", "", did)
        cls = _crm_class(did, d.get("crm_source") or d.get("source"))
        key: tuple[str, ...] = (cls, digits) if (digits and cls != "?") else ("id", did)
        if key not in kept:
            kept[key] = d
            order.append(key)
            continue
        cur = kept[key]
        cur_upd, new_upd = str(cur.get("updated_at") or ""), str(d.get("updated_at") or "")
        cur_pref = not str(cur.get("id") or "").strip().isdigit()
        if new_upd > cur_upd or (new_upd == cur_upd and not cur_pref and not did.isdigit()):
            kept[key] = d
    return [kept[k] for k in order]
