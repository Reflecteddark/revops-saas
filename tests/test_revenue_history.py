# -*- coding: utf-8 -*-
"""/metrics/revenue-history returns the tenant's REAL won revenue per month (it used to return hardcoded millions)."""

import uuid
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from apps.api.auth import create_access_token
from apps.api.main import app
from apps.api.services.revenue import last_months
from apps.api.services.tz import local_month, to_local
from apps.api.services.workspaces import get_or_create_workspace
from packages.database.models import Deal, DealStage, Tenant, UserRole, Workspace
from packages.database.session import SessionLocal

EXTERNAL = {"host": "report.ai-rop.ru", "cf-connecting-ip": "203.0.113.7"}


def test_month_boundary_follows_moscow_not_utc():
    # 22:00 UTC on Oct 31 is already 01:00 on Nov 1 in Moscow
    assert local_month(now=datetime(2026, 10, 31, 22, 0, tzinfo=timezone.utc)) == "2026-11"
    assert local_month(now=datetime(2026, 10, 31, 20, 0, tzinfo=timezone.utc)) == "2026-10"
    assert to_local(datetime(2026, 11, 2, 22, 30)).strftime("%Y-%m-%d %H:%M") == "2026-11-03 01:30"  # naive = UTC


def test_last_months_wraps_over_new_year():
    assert last_months(3) == last_months(3)  # deterministic length
    assert len(last_months(24)) == 24 and len(set(last_months(24))) == 24
    assert last_months(24) == sorted(last_months(24))


@pytest.fixture
def tid():
    t = f"TNT-REV-{uuid.uuid4().hex[:6].upper()}"
    yield t
    db = SessionLocal()
    try:
        db.query(Deal).filter(Deal.tenant_id == t).delete()
        db.query(Workspace).filter(Workspace.tenant_id == t).delete()
        db.query(Tenant).filter(Tenant.id == t).delete()
        db.commit()
    finally:
        db.close()


def _won(db, ws, tid, n, month, amount):
    db.add(Deal(id=f"{tid}-{n}", tenant_id=tid, workspace_id=ws.id, external_crm_id=f"B24-{n}", title="T",
                budget=amount, stage=DealStage.WON, stage_name="Успешно реализовано", status="WON",
                custom_payload={"last_stage_change": f"{month}-15"}))


def test_history_is_the_tenants_real_won_revenue(tid):
    cur = local_month()
    prev = last_months(2)[0]
    db = SessionLocal()
    try:
        ws = get_or_create_workspace(db, tid, "bitrix24")
        _won(db, ws, tid, 1, cur, 100000.0)
        _won(db, ws, tid, 2, cur, 50000.5)
        _won(db, ws, tid, 3, prev, 7000.0)
        db.commit()
    finally:
        db.close()

    token = create_access_token({"sub": "u", "tenant_id": tid, "role": UserRole.CEO.value, "email": "u@x.test"})
    res = TestClient(app).get("/api/v1/metrics/revenue-history?months=3", headers={**EXTERNAL, "Authorization": f"Bearer {token}"})
    assert res.status_code == 200, res.text[:200]
    body = res.json()
    by = {h["month"]: h for h in body["history"]}
    assert len(body["history"]) == 3
    assert by[cur]["revenue"] == 150000.5 and by[cur]["won_count"] == 2
    assert by[prev]["revenue"] == 7000.0
    assert all(h["scenario"] == "actual" for h in body["history"])   # no invented P10/P50/P90
    assert "benchmark_growth_pct" not in body


def test_history_requires_authentication():
    res = TestClient(app).get("/api/v1/metrics/revenue-history", headers=EXTERNAL)
    assert res.status_code in (401, 403)
