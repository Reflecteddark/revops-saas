"""
Unit and Integration Test Suite for Global 500 Exception Handling & Telegram Alerts.
Validates:
- Global Exception Handler catches unhandled 500 errors and returns JSON 500.
- Telegram alert dispatcher is triggered with formatted incident report on 500.
- Non-500 errors (e.g. 404 Not Found) do NOT trigger Telegram alert dispatcher.
- Exception handler is resilient to notification delivery failures.
"""

from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient
from apps.api.main import app


def test_global_exception_handler_and_telegram_alert():
    """Validates global 500 error interception and Telegram alert notification."""
    client = TestClient(app, raise_server_exceptions=False)

    # 1. Test 500 error interception and alert dispatch
    with patch("apps.api.main.send_telegram_alert") as mock_alert:
        mock_alert.return_value = True

        res = client.get("/api/v1/diagnostics/trigger-500")

        assert res.status_code == 500
        data = res.json()
        assert data.get("status") == "error"
        assert "Internal Server Error" in data.get("message", "")

        # Verify Telegram alert was triggered with expected details
        assert mock_alert.called
        alert_text = mock_alert.call_args[0][0]
        assert "[RevOps API 500 Error Alert]" in alert_text
        assert "trigger-500" in alert_text
        assert "RuntimeError" in alert_text
        assert "Intentional 500 test exception" in alert_text

    # 2. Test that 404 client error does NOT trigger Telegram alert
    with patch("apps.api.main.send_telegram_alert") as mock_alert_404:
        res_404 = client.get("/api/v1/non-existent-endpoint-404")
        assert res_404.status_code == 404
        assert not mock_alert_404.called

    # 3. Test resilience: handler safely returns 500 even if Telegram dispatch fails
    with patch("apps.api.main.send_telegram_alert", side_effect=RuntimeError("Telegram network timeout")):
        res_fail = client.get("/api/v1/diagnostics/trigger-500")
        assert res_fail.status_code == 500
        assert res_fail.json().get("status") == "error"


def test_intentional_break_for_ci_alert():
    """Intentional break to verify CI failure notification in Telegram."""
    assert False, "Verification test failure for Telegram alert dispatcher"
