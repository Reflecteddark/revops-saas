"""
AI recommendations from Gemini are routinely >255 chars. call_recordings.next_action_extracted was VARCHAR(255),
so on PostgreSQL every real call failed to persist (StringDataRightTruncation) — found in the 2026-11-03 e2e run.
SQLite (used by tests) does not enforce VARCHAR length, so the schema itself is asserted here.
"""

import uuid
from unittest.mock import MagicMock

from sqlalchemy import Text
from starlette.testclient import TestClient

from apps.api.main import app
from apps.api.routers import calls_router
from apps.api.routers.admin_router import ALLOWED_ADMIN_KEYS
from packages.database.models import CallRecording, Deal
from packages.database.session import SessionLocal, widen_legacy_text_columns

client = TestClient(app, client=("172.16.0.5", 50000))
ADMIN = {"x-admin-key": next(iter(ALLOWED_ADMIN_KEYS))}


def test_recommendation_column_is_unbounded_text():
    assert isinstance(CallRecording.__table__.c.next_action_extracted.type, Text)


def test_widening_migration_alters_varchar_on_postgres_only():
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = ("character varying",)
    assert widen_legacy_text_columns(conn, "postgresql") == ["call_recordings.next_action_extracted"]
    alter_sql = [str(c.args[0]) for c in conn.execute.call_args_list if "ALTER TABLE" in str(c.args[0])]
    assert alter_sql == ["ALTER TABLE call_recordings ALTER COLUMN next_action_extracted TYPE TEXT"]

    conn2 = MagicMock()
    conn2.execute.return_value.fetchone.return_value = ("text",)
    assert widen_legacy_text_columns(conn2, "postgresql") == []          # idempotent
    assert widen_legacy_text_columns(MagicMock(), "sqlite") == []          # no-op elsewhere


def test_long_ai_texts_and_client_name_are_persisted(monkeypatch):
    tid = f"TNT-LONG-{uuid.uuid4().hex[:6].upper()}"
    monkeypatch.setattr(calls_router, "get_tenant_config", lambda t: {"tenant_id": t, "crm_type": "amocrm"})
    rec = "Рекомендация РОПу: " + "зафиксировать дату следующего контакта и ЛПР. " * 10   # ~470 chars
    client_name = "ООО «Очень длинное название компании клиента для проверки ограничений поля»"
    body = {"id": f"{tid}-c", "tenant_id": tid, "deal_id": f"D-{tid}", "duration_sec": 120, "score": 8,
            "cr": [1] * 8 + [0] * 5, "client": client_name, "deal_title": "Сделка " + "X" * 300,
            "recommendation": rec, "error_summary": "e" * 600, "transcript": "t", "sync_to_sheets": False}
    res = client.post("/api/v1/calls/ingest", json=body, headers=ADMIN)
    assert res.status_code == 200, res.text[:300]
    db = SessionLocal()
    try:
        c = db.query(CallRecording).filter(CallRecording.tenant_id == tid).one()
        assert c.next_action_extracted == rec                      # full text, not truncated
        assert len(c.client_phone) <= 50                           # fits VARCHAR(50)
        d = db.query(Deal).filter(Deal.tenant_id == tid).one()
        assert len(d.title) <= 255 and len(d.company_name or "") <= 255
    finally:
        db.query(CallRecording).filter(CallRecording.tenant_id == tid).delete()
        db.query(Deal).filter(Deal.tenant_id == tid).delete()
        from packages.database.models import Tenant, Workspace
        db.query(Workspace).filter(Workspace.tenant_id == tid).delete()
        db.query(Tenant).filter(Tenant.id == tid).delete()
        db.commit()
        db.close()
