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

from packages.database.session import Base, engine, init_db


@pytest.fixture(scope="session", autouse=True)
def _create_schema():
    """Initializes all database tables (including RevokedToken) before tests run."""
    init_db()
    from packages.database.models import User, UserRole
    from packages.database.session import SessionLocal

    db = SessionLocal()
    try:
        if not db.query(User).filter(User.id == "usr-admin-test").first():
            db.add(User(
                id="usr-admin-test",
                email="admin@revops-test.io",
                full_name="Admin Test",
                hashed_password="mock_hashed_password",
                tenant_id="TNT-001",
                role=UserRole.ADMIN,
                is_active=True,
            ))
        if not db.query(User).filter(User.id == "usr-tnt-001").first():
            db.add(User(
                id="usr-tnt-001",
                email="user@tenant1.test",
                full_name="Tenant User 1",
                hashed_password="mock_hashed_password",
                tenant_id="TNT-001",
                role=UserRole.CEO,
                is_active=True,
            ))
        db.commit()
    finally:
        db.close()
    yield

