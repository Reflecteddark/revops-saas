import pytest
from sqlalchemy import text

from packages.database.session import SessionLocal, engine


def test_sqlite_wal_journal_mode():
    """Verifies that SQLite sessions apply WAL journal mode and configured pragmas."""
    if "sqlite" not in str(engine.url):
        pytest.skip("Not running on SQLite")

    db = SessionLocal()
    try:
        journal_mode = db.execute(text("PRAGMA journal_mode;")).scalar()
        assert str(journal_mode).lower() in ["wal", "memory"]

        busy_timeout = db.execute(text("PRAGMA busy_timeout;")).scalar()
        assert busy_timeout == 5000
    finally:
        db.close()
