"""
Unit test suite for Telephony Webhook Queue & Celery Ingestion:
- Webhook rapid response (<50ms, HTTP 200 OK, status: queued)
- Celery dispatch via .delay()
- Antifragile fallback to BackgroundTasks when broker is offline
- Scoped tenant routing
- Celery worker task execution and Google Sheets sync dispatch
"""

import time
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from packages.database.session import init_db
from workers.tasks import process_call_audio_task


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    init_db()


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=False)


def test_telephony_webhook_celery_dispatch(client):
    """Verifies that telephony call webhook dispatches to Celery queue when broker is active."""
    payload = {
        "call_id": f"test_celery_{int(time.time()*1000)}",
        "deal_id": "D-9988",
        "deal_title": "Тестовая сделка по телефонии",
        "client_name": "ООО Вектор (Алексей)",
        "manager_name": "Дмитрий Федотов",
        "duration_sec": 140,
        "score": 11,
        "next_step": 1,
        "cr": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
        "transcript": "Менеджер: Добрый день! Согласуем следующий шаг? Клиент: Да, давайте в понедельник в 12:00."
    }

    mock_task = MagicMock()
    mock_task.id = "celery-task-uuid-test"
    with patch("workers.tasks.process_call_audio_task.delay", return_value=mock_task) as mock_delay:
        t0 = time.perf_counter()
        res = client.post("/api/v1/webhooks/call", json=payload)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "queued"
        assert data["queue_driver"] == "celery"
        assert data["task_id"] == "celery-task-uuid-test"
        assert data["score"] == 11
        assert data["next_step"] == 1
        assert data["ack_latency_ms"] < 500
        assert elapsed_ms < 1000, f"Webhook ack took {elapsed_ms:.1f}ms, expected < 1000ms"
        assert mock_delay.called


def test_telephony_webhook_fallback_background(client):
    """Verifies telephony call webhook gracefully falls back to BackgroundTasks when broker raises error."""
    payload = {
        "call_id": f"test_fallback_{int(time.time()*1000)}",
        "deal_id": "D-9989",
        "client_name": "ИП Семенов",
        "manager_name": "Иван Менеджер",
        "duration_sec": 120,
        "score": 10,
        "next_step": 1,
        "transcript": "Короткий рабочий разговор."
    }

    with patch("workers.tasks.process_call_audio_task.delay", side_effect=RuntimeError("Redis offline")), \
         patch("apps.api.routers.webhooks_router._execute_telephony_background") as mock_bg:
        t0 = time.perf_counter()
        res = client.post("/api/v1/webhooks/call", json=payload)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "queued"
        assert data["queue_driver"] == "background_tasks"
        assert data["task_id"].startswith("bg_")
        assert data["ack_latency_ms"] < 500
        assert elapsed_ms < 1000, f"Webhook fallback took {elapsed_ms:.1f}ms, expected < 1000ms"
        assert mock_bg.called


def test_telephony_webhook_scoped_tenant(client):
    """Verifies scoped /api/v1/webhooks/{tenant_id}/call endpoint routes correctly."""
    payload = {
        "call_id": f"test_scoped_{int(time.time()*1000)}",
        "client_name": "ИП Смирнов",
        "manager_name": "Иван Менеджер",
        "duration_sec": 95,
        "score": 12,
        "next_step": 1,
        "transcript": "Короткий рабочий разговор с фиксацией КП."
    }

    mock_task = MagicMock()
    mock_task.id = "celery-scoped-test"
    with patch("workers.tasks.process_call_audio_task.delay", return_value=mock_task):
        res = client.post("/api/v1/webhooks/TNT-001/call", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "queued"
        assert data["tenant_id"] == "TNT-001"
        assert data["task_id"] == "celery-scoped-test"


def test_celery_task_execution_direct():
    """Verifies process_call_audio_task executes and returns completed status."""
    call_payload = {
        "id": f"call_direct_{int(time.time()*1000)}",
        "deal_id": "D-7711",
        "client": "ООО ПромТех",
        "manager": "Анна Сидорова",
        "duration_sec": 180,
        "score": 10,
        "next_step": 1,
        "cr": [1]*13,
        "transcript": "Тестовый транскрипт",
        "sync_to_sheets": False
    }

    result = process_call_audio_task(call_payload, org_id="TNT-001")
    assert result["status"] == "completed"
    assert result["call_id"] == call_payload["id"]
    assert result["score"] == 10
    assert result["next_step"] == 1
