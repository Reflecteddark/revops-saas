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

# The suite must never spend the real Gemini quota. Until now ai_probe fell back to a key stored in the code and
# test_ai_probe_sync_healthy / test_ai_cascade_success_tier1 (and every analyst test that did not patch the cascade)
# called the real proxy on each local run and each CI run: ~75% of a day's traffic to the proxy. The tests keep a
# non-empty dummy key (so the proxy tiers are entered and their failover is tested) and a closed local port, so a
# request that is not mocked fails at once, offline.
import packages.monitoring.ai_probe as _ai_probe

_ai_probe.GEMINI_PROXY_URL = "http://127.0.0.1:9"
_ai_probe.GEMINI_PROXY_KEY = "test-only-key"
for _var in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_PROXY_KEY"):
    os.environ.pop(_var, None)

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


# Test-only client accounts. Login tests must not depend on real credentials from a developer's
# registered_clients.json (untracked; on Windows "/app/data/..." also resolves to C:\app\data\...).
TEST_CLIENT_PASSWORD = "ci-test-client-pass"
_TEST_CLIENTS = _TEST_TMP_DIR / "registered_clients.json"


@pytest.fixture(scope="session", autouse=True)
def _hermetic_registered_clients():
    import hashlib
    import json

    from apps.api.routers import admin_router

    pass_hash = hashlib.sha256(TEST_CLIENT_PASSWORD.encode("utf-8")).hexdigest()
    clients = [dict(c) for c in admin_router.DEFAULT_SYSTEM_CLIENTS]
    for c in clients:
        if c["login"] == "admin":
            c["keyHashes"] = [pass_hash]
    clients.append({"login": "dmitriyfedotov1908@gmail.com", "name": "Admin Test", "role": "Admin / Супервайзер",
                    "tenant": "TNT-001 • Test", "keyHashes": [pass_hash], "is_system": True})
    _TEST_CLIENTS.write_text(json.dumps(clients, ensure_ascii=False), encoding="utf-8")

    mp = pytest.MonkeyPatch()
    mp.setattr(admin_router, "get_all_registered_clients_paths", lambda: [_TEST_CLIENTS])
    yield _TEST_CLIENTS
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

