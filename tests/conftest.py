"""
Global Pytest Configuration and Test Environment Isolation.
Ensures external services (Telegram, SMTP, external webhooks) are suppressed during testing.
"""
import os
import pytest

# Enforce test mode across all test suites
os.environ["TESTING"] = "true"
os.environ["DISABLE_TELEGRAM_ALERTS"] = "true"
