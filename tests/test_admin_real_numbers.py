"""The admin panel shows numbers counted from the database and statuses read from the configuration."""
import os
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from apps.api.main import app
from packages.database.models import CallRecording, SubscriptionTier, Tenant
from packages.database.session import SessionLocal

client = TestClient(app, client=("203.0.113.9", 50000))
HEADERS = {"X-Admin-Key": os.environ["REVOPS_ADMIN_KEY"]}


def _tenant_with_calls(tenant_id, rows):
    db = SessionLocal()
    try:
        db.add(Tenant(id=tenant_id, name=tenant_id, slug=tenant_id.lower(), tier=SubscriptionTier.PRO))
        db.commit()
        for seconds, created_at in rows:
            db.add(CallRecording(id=str(uuid.uuid4()), tenant_id=tenant_id, client_phone="+7", duration_seconds=seconds, created_at=created_at))
        db.commit()
    finally:
        db.close()


def _drop_tenant(tenant_id):
    db = SessionLocal()
    try:
        db.query(CallRecording).filter(CallRecording.tenant_id == tenant_id).delete()
        db.query(Tenant).filter(Tenant.id == tenant_id).delete()
        db.commit()
    finally:
        db.close()


def test_telemetry_counts_todays_calls_from_the_database():
    now = datetime.now(timezone.utc)
    _tenant_with_calls("TNT-TLM1", [(120, now), (180, now), (600, now - timedelta(days=3))])
    try:
        body = client.get("/api/v1/admin/metrics/ai-telemetry?tenant_id=TNT-TLM1", headers=HEADERS).json()
    finally:
        _drop_tenant("TNT-TLM1")
    assert body["calls_today"] == 2
    assert body["audio_minutes_today"] == 5.0
    assert body["avg_audit_latency_sec"] is None  # nothing records it: no invented 7.4
    assert body["estimated_cost_usd"] == round(5.0 * 0.0012, 4)


def test_telemetry_for_a_tenant_without_calls_is_zero_not_a_demo_number():
    body = client.get("/api/v1/admin/metrics/ai-telemetry?tenant_id=TNT-NO-CALLS", headers=HEADERS).json()
    assert body["calls_today"] == 0
    assert body["audio_minutes_today"] == 0
    assert body["estimated_cost_usd"] == 0


def test_month_minutes_per_tenant_come_from_the_database():
    from apps.api.routers.admin_router import _month_audio_minutes

    now = datetime.now(timezone.utc)
    _tenant_with_calls("TNT-TLM2", [(3000, now), (600, now)])
    try:
        minutes = _month_audio_minutes()
    finally:
        _drop_tenant("TNT-TLM2")
    assert minutes["TNT-TLM2"] == 60.0


def test_crm_status_reflects_the_configuration():
    empty = {"tenant_id": "TNT-X", "tenant_name": "X", "crm_type": "amocrm"}
    with patch("apps.api.tenant_registry.get_tenant_config", return_value=empty):
        body = client.get("/api/v1/admin/crm/status?tenant_id=TNT-X", headers=HEADERS).json()
    assert body["amocrm"]["connected"] is False
    assert "Не подключён" in body["amocrm"]["status_text"]
    assert "Не подключён" in body["bitrix24"]["status_text"]
    assert body["spreadsheet_id"] == ""

    configured = {**empty, "amo_domain": "acme.amocrm.ru", "amo_token": "x" * 40}
    with patch("apps.api.tenant_registry.get_tenant_config", return_value=configured):
        body = client.get("/api/v1/admin/crm/status?tenant_id=TNT-X", headers=HEADERS).json()
    assert body["amocrm"]["connected"] is True
    assert "связь не проверялась" in body["amocrm"]["status_text"]
