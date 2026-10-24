"""
Global Pytest Configuration and Test Environment Isolation.
Ensures external services (Telegram, SMTP, external webhooks) are suppressed during testing.
"""
import os
import pytest

# Enforce test mode across all test suites
os.environ["TESTING"] = "true"
os.environ["DISABLE_TELEGRAM_ALERTS"] = "true"
os.environ.setdefault("SECRET_KEY", "ci-test-secret-key-min-32-chars-long-abc-xyz")
os.environ.setdefault("REVOPS_ADMIN_KEY", "ci-test-admin-key-min-32-chars-long-abc-xyz")

