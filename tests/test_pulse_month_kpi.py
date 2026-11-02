"""
Pulse "Выручка факт" must be the revenue of deals WON IN THE CURRENT MONTH, delivered by the
backend as insights.kpi (the frontend used to fall back to all-time won deals because the
backend never returned `kpi`, producing e.g. "Темп 200%" next to "Дефицит 6,5 млн").
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from packages.database.models import Deal, DealStage, SubscriptionTier, Tenant, Workspace
from packages.database.session import SessionLocal

TID = "TNT-KPI-MONTH"
client = TestClient(app)


@pytest.fixture(autouse=True)
def deals():
    now = datetime.now(timezone.utc)
    this_month = now.strftime("%Y-%m-%d")
    prev_month = (now.replace(day=1) - timedelta(days=3)).strftime("%Y-%m-%d")
    db = SessionLocal()
    try:
        if not db.query(Tenant).filter(Tenant.id == TID).first():
            db.add(Tenant(id=TID, name="KPI", slug=TID.lower(), tier=SubscriptionTier.PRO))
        if not db.query(Workspace).filter(Workspace.id == f"ws_{TID}").first():
            db.add(Workspace(id=f"ws_{TID}", tenant_id=TID, name="ws"))
        db.query(Deal).filter(Deal.tenant_id == TID).delete()
        rows = [
            ("won-this", DealStage.WON, 100.0, {"last_stage_change": this_month}),
            ("won-prev", DealStage.WON, 1000.0, {"last_stage_change": prev_month}),
            ("won-nodate", DealStage.WON, 7.0, {}),          # falls back to updated_at (= now)
            ("active", DealStage.LEAD_INCOMING, 50.0, {"last_stage_change": this_month}),
        ]
        for did, stage, budget, payload in rows:
            db.add(Deal(id=f"{TID}-{did}", tenant_id=TID, workspace_id=f"ws_{TID}", title=did,
                        stage=stage, budget=budget, custom_payload=payload))
        db.commit()
        yield
        db.query(Deal).filter(Deal.tenant_id == TID).delete()
        db.commit()
    finally:
        db.close()


def _summary():
    token = create_access_token({"sub": "usr-kpi", "tenant_id": TID, "role": "РОП"})
    res = client.get(f"/api/v1/insights/summary?tenant_id={TID}", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text[:300]
    return res.json()


def test_kpi_revenue_is_current_month_won_only():
    kpi = _summary()["kpi"]
    assert kpi["revenue"] == 107.0          # 100 (this month) + 7 (updated_at fallback); not 1000 from last month
    assert kpi["won_count"] == 2
    assert kpi["period"] == datetime.now(timezone.utc).strftime("%Y-%m")


def test_kpi_reports_when_won_date_is_approximated():
    kpi = _summary()["kpi"]
    assert kpi["revenue_basis"] == "updated_at_fallback"


def test_crm_sync_persists_last_stage_change():
    import inspect

    from apps.api.services import crm_deals_sync
    assert '"last_stage_change"' in inspect.getsource(crm_deals_sync)
