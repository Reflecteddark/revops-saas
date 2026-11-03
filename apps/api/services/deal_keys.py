"""
Tenant-scoped deal identity.

`deals.id` is a GLOBAL primary key, but CRM deal numbers are only unique inside one CRM portal
(every Bitrix24 portal starts at 1, so `B24-1` exists for every client). Looking a deal up by
`Deal.id` alone let one client's sync overwrite another client's deal. Always look deals up
through `find_tenant_deal` and create them with `deal_pk_for`; the CRM id stays in `external_crm_id`.
"""

import uuid

from sqlalchemy.orm import Session

from packages.database.models import Deal

PK_MAX_LEN = 36  # deals.id is VARCHAR(36)


def find_tenant_deal(db: Session, tenant_id: str, crm_id: str) -> Deal | None:
    """The tenant's own deal for a CRM id, whichever way its primary key was built."""
    crm_id = str(crm_id).strip()
    pk = _prefixed_pk(tenant_id, crm_id)
    t = tenant_id.strip()
    return (
        db.query(Deal)
        .filter(Deal.tenant_id.in_({t, t.upper(), t.lower()}))
        .filter((Deal.id == crm_id) | (Deal.external_crm_id == crm_id) | (Deal.id == pk))
        .first()
    )


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
