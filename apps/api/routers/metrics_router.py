"""
Metrics API Router: monthly revenue history of the caller's own tenant.

This endpoint used to return hardcoded numbers (10.2-14.2 M actuals and P10/P50/P90 projections, +18.4% "benchmark")
to anybody, without authentication. It now returns the real revenue of WON deals per month from the database.
There are no invented projections: forecasts are produced by /insights/summary from the live pipeline.
"""

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from packages.database.session import get_db

from ..services.revenue import last_months, won_revenue_by_month
from ..services.tz import tenant_tz
from ..tenant_registry import get_tenant_config
from .deals_router import get_authenticated_tenant_or_verify_admin

router = APIRouter(prefix="/metrics", tags=["Metrics & Revenue History"])


@router.get("/revenue-history")
def get_revenue_history(
    request: Request,
    org_id: str | None = None,
    tenant_id: str | None = None,
    months: int = Query(default=6, ge=1, le=24),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Revenue of deals won in each of the last `months` calendar months (business time zone)."""
    tenant = get_authenticated_tenant_or_verify_admin(request, tenant_id or org_id)
    tz = tenant_tz(get_tenant_config(tenant))

    by_month, approximated = won_revenue_by_month(db, tenant, tz)
    history = [
        {
            "time": m,
            "month": m,
            "org_id": tenant,
            "revenue": round(by_month.get(m, {}).get("revenue", 0.0), 2),
            "won_count": int(by_month.get(m, {}).get("won_count", 0)),
            "scenario": "actual",
        }
        for m in last_months(months, tz)
    ]
    return {
        "org_id": tenant,
        "tenant_id": tenant,
        "series": history,
        "history": history,
        "currency": "RUB",
        "revenue_basis": "updated_at_fallback" if approximated else "crm_last_stage_change",
    }
