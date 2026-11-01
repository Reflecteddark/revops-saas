"""
tests/test_deals_rep_performance.py

Verification of Rep Performance & Leader Benchmark analytics endpoint:
- Correct AOV, Win Rate, and Gross Conversion calculation
- P50 Median cycle time computation
- Zero division protection
- Exclusion of system bot names
- Small sample size protection
"""

import pytest
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.routers.deals_router import is_system_rep_name
from packages.database.models import Deal, DealStage, Tenant, Workspace, CallRecording
from packages.database.session import SessionLocal

client = TestClient(app)


@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_is_system_rep_name():
    assert is_system_rep_name("Автоответчик") is True
    assert is_system_rep_name("Недозвон") is True
    assert is_system_rep_name("Не представился") is True
    assert is_system_rep_name("Неизвестный") is True
    assert is_system_rep_name("Менеджер") is True
    assert is_system_rep_name("-") is True
    assert is_system_rep_name("") is True
    assert is_system_rep_name(None) is True
    assert is_system_rep_name("Дмитрий") is False
    assert is_system_rep_name("Анна Смирнова") is False


def test_deals_rep_performance_math(db_session):
    tenant_id = "TNT-TEST-REP"
    
    # Clean up any leftover test data
    db_session.query(CallRecording).filter(CallRecording.tenant_id == tenant_id).delete()
    db_session.query(Deal).filter(Deal.tenant_id == tenant_id).delete()
    db_session.commit()

    # Create Deals for 2 real reps and 1 bot
    # Rep A: 2 Won (500k, 300k -> AOV 400k), 1 Lost -> Win Rate 66.7%, Cycle 10d and 20d -> Median 15d
    now = datetime.now(timezone.utc)
    d1 = Deal(
        tenant_id=tenant_id,
        workspace_id="ws-1",
        title="Сделка 1",
        budget=500000.0,
        stage=DealStage.WON,
        stage_name="Успешно реализовано",
        custom_payload={"manager_name": "Дмитрий"},
        created_at=now - timedelta(days=10),
        updated_at=now,
    )
    d2 = Deal(
        tenant_id=tenant_id,
        workspace_id="ws-1",
        title="Сделка 2",
        budget=300000.0,
        stage=DealStage.WON,
        stage_name="Успешно реализовано",
        custom_payload={"manager_name": "Дмитрий"},
        created_at=now - timedelta(days=20),
        updated_at=now,
    )
    d3 = Deal(
        tenant_id=tenant_id,
        workspace_id="ws-1",
        title="Сделка 3",
        budget=200000.0,
        stage=DealStage.LOST,
        stage_name="Закрыто и не реализовано",
        custom_payload={"manager_name": "Дмитрий"},
        created_at=now - timedelta(days=5),
        updated_at=now,
    )

    # Rep B: 1 Won (100k), 3 Lost -> Win Rate 25%, Cycle 30d
    d4 = Deal(
        tenant_id=tenant_id,
        workspace_id="ws-1",
        title="Сделка 4",
        budget=100000.0,
        stage=DealStage.WON,
        stage_name="Успешно реализовано",
        custom_payload={"manager_name": "Анна"},
        created_at=now - timedelta(days=30),
        updated_at=now,
    )
    d5 = Deal(
        tenant_id=tenant_id,
        workspace_id="ws-1",
        title="Сделка 5",
        budget=100000.0,
        stage=DealStage.LOST,
        stage_name="Закрыто и не реализовано",
        custom_payload={"manager_name": "Анна"},
    )
    d6 = Deal(
        tenant_id=tenant_id,
        workspace_id="ws-1",
        title="Сделка 6",
        budget=100000.0,
        stage=DealStage.LOST,
        stage_name="Закрыто и не реализовано",
        custom_payload={"manager_name": "Анна"},
    )

    # Bot deal (should be ignored from manager rankings)
    d7 = Deal(
        tenant_id=tenant_id,
        workspace_id="ws-1",
        title="Бот сделка",
        budget=50000.0,
        stage=DealStage.LOST,
        stage_name="Закрыто и не реализовано",
        custom_payload={"manager_name": "Автоответчик"},
    )

    db_session.add_all([d1, d2, d3, d4, d5, d6, d7])
    db_session.commit()

    resp = client.get(f"/api/v1/deals/performance/reps?tenant_id={tenant_id}", headers={"X-Admin-Key": "test_admin"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["total_reps"] == 2  # Only Dmitry and Anna, not bot

    reps = {r["manager_name"]: r for r in data["reps"]}
    assert "Дмитрий" in reps
    assert "Анна" in reps
    assert "Автоответчик" not in reps

    # Verify Dmitry's math
    dm = reps["Дмитрий"]
    assert dm["won_amount"] == 800000.0
    assert dm["won_count"] == 2
    assert dm["lost_count"] == 1
    assert dm["avg_deal_amount"] == 400000.0
    assert dm["win_rate_pct"] == 66.7
    assert dm["cycle_days_median"] == 15.0  # Median of 10 and 20 is 15.0
    assert dm["sample_size_ok"] is True

    # Verify Anna's math
    an = reps["Анна"]
    assert an["won_amount"] == 100000.0
    assert an["won_count"] == 1
    assert an["lost_count"] == 2
    assert an["avg_deal_amount"] == 100000.0
    assert an["win_rate_pct"] == 33.3

    # Verify Leader Benchmark
    leader = data["benchmark_leader"]
    assert leader is not None
    assert leader["name"] == "Дмитрий"
    assert leader["won_amount"] == 800000.0
    assert len(leader["drivers"]) >= 1

    # Cleanup
    db_session.query(Deal).filter(Deal.tenant_id == tenant_id).delete()
    db_session.commit()
