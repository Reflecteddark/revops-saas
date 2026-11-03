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

import tempfile
from pathlib import Path

# Hermetic tenant registry: tests must never write to real registry files. The app resolves
# registry paths relative to the repo and to the developer's home (e.g. ../revops-enterprise-os/),
# so without this a test that saves the registry silently overwrote the developer's real files,
# and local runs passed only because those real files happened to exist (CI has none).
_TEST_TMP_DIR = Path(tempfile.mkdtemp(prefix="revops-tests-"))
_TEST_REGISTRY = _TEST_TMP_DIR / "tenants_registry.json"
_TEST_REGISTRY.write_text('{"tenants": []}', encoding="utf-8")
os.environ["TENANTS_REGISTRY_PATH"] = str(_TEST_REGISTRY)

from packages.database.session import Base, engine, init_db

_REPO_ROOT = Path(__file__).resolve().parent.parent
# Tracked files that application code rewrites at runtime (client registry, webhook DLQ).
# Tests exercise those code paths, so restore the committed bytes after the session to keep
# the working tree clean (the deploy script refuses to run on a dirty tree).
_RUNTIME_WRITTEN_TRACKED_FILES = [
    _REPO_ROOT / "apps" / "api" / "data" / "registered_clients.json",
    _REPO_ROOT / "logs" / "webhooks_dlq_snapshot.json",
]


@pytest.fixture(scope="session", autouse=True)
def _hermetic_tenant_registry():
    """Registry mirrors collapse to the session temp file (see _TEST_REGISTRY above)."""
    from apps.api import tenant_registry

    mp = pytest.MonkeyPatch()
    mp.setattr(tenant_registry, "get_all_candidate_registry_paths", lambda: [_TEST_REGISTRY])
    yield _TEST_REGISTRY
    mp.undo()


@pytest.fixture(scope="session", autouse=True)
def _restore_runtime_written_files():
    saved = {p: p.read_bytes() for p in _RUNTIME_WRITTEN_TRACKED_FILES if p.exists()}
    yield
    for p, data in saved.items():
        p.write_bytes(data)


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

