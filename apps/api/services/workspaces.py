"""
Single place to obtain a tenant's workspace (deals require workspace_id, a FK to workspaces).

Workspaces were created ad hoc in several places with different id conventions (`ws_<tenant>` or a UUID),
while /calls/ingest assumed `ws_<tenant>` exists — a new client's first calls failed with a FK violation.
"""

from sqlalchemy.orm import Session

from packages.database.models import Tenant, Workspace


def normalize_crm_type(raw: str | None) -> str | None:
    s = str(raw or "").strip().lower()
    if not s:
        return None
    if "amo" in s:
        return "amocrm"
    if "bitrix" in s or "b24" in s:
        return "bitrix24"
    return s


def get_or_create_workspace(db: Session, tenant_id: str, crm_type: str | None = None) -> Workspace:
    """Return the tenant's existing workspace (any id); create tenant row + `ws_<tenant>` workspace if missing.
    Flushes but does not commit — the caller owns the transaction."""
    ws = (
        db.query(Workspace)
        .filter(Workspace.tenant_id == tenant_id)
        .order_by(Workspace.created_at)
        .first()
    )
    if ws:
        return ws

    if not db.query(Tenant).filter(Tenant.id == tenant_id).first():
        slug = tenant_id.lower()
        if db.query(Tenant).filter(Tenant.slug == slug).first():
            slug = f"{slug}-{tenant_id.lower()}-ws"
        db.add(Tenant(id=tenant_id, name=tenant_id, slug=slug))
        db.flush()

    crm = normalize_crm_type(crm_type)
    ws = Workspace(
        id=f"ws_{tenant_id}",
        tenant_id=tenant_id,
        name="Default Workspace",
        crm_type=crm or "amocrm",
        crm_connected=bool(crm),
    )
    db.add(ws)
    db.flush()
    return ws
