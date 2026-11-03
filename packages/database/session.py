import os
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from .models import Base

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "revops_saas.db"

# Primary database for writes
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

# Read replica for analytical queries (optional, falls back to primary)
DATABASE_READ_REPLICA_URL = os.getenv("DATABASE_READ_REPLICA_URL", DATABASE_URL)

# Connection arguments
connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

# Pool configuration for production
pool_config = {
    "pool_size": int(os.getenv("DB_POOL_SIZE", "20")),
    "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "30")),
    "pool_pre_ping": True,
    "pool_recycle": 3600,
} if "sqlite" not in DATABASE_URL else {}

# Primary engine (reads + writes)
engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,
    **pool_config
)

# Read replica engine (read-only queries)
engine_read = create_engine(
    DATABASE_READ_REPLICA_URL,
    connect_args=connect_args,
    echo=False,
    **pool_config
)

if "sqlite" in DATABASE_URL:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()

if "sqlite" in DATABASE_READ_REPLICA_URL and engine_read != engine:
    @event.listens_for(engine_read, "connect")
    def set_sqlite_read_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


# Session factories
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
SessionRead = sessionmaker(autocommit=False, autoflush=False, bind=engine_read)


# Columns created as VARCHAR in older deployments that must hold unbounded AI text.
# create_all() never alters existing columns, so they are widened on startup (idempotent, data-safe).
WIDEN_TO_TEXT = [("call_recordings", "next_action_extracted")]


def widen_legacy_text_columns(conn, dialect_name: str) -> list[str]:
    """ALTER legacy VARCHAR columns to TEXT on PostgreSQL. Returns the list of widened columns."""
    if dialect_name != "postgresql":
        return []
    from sqlalchemy import text

    widened = []
    for table, column in WIDEN_TO_TEXT:
        row = conn.execute(
            text("SELECT data_type FROM information_schema.columns WHERE table_name = :t AND column_name = :c"),
            {"t": table, "c": column},
        ).fetchone()
        if row and row[0] == "character varying":
            conn.execute(text(f"ALTER TABLE {table} ALTER COLUMN {column} TYPE TEXT"))
            widened.append(f"{table}.{column}")
    return widened


def init_db():
    """Initializes all database tables safely and ensures schema columns and unique indexes exist."""
    try:
        import packages.antidrift.models  # noqa: F401
    except Exception:
        pass
    Base.metadata.create_all(bind=engine)
    try:
        from sqlalchemy import inspect, text
        inspector = inspect(engine)
        deal_cols = [c["name"] for c in inspector.get_columns("deals")]
        tables = inspector.get_table_names()
        with engine.begin() as conn:
            if "custom_payload" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN custom_payload JSON;"))
            if "deleted_at" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN deleted_at TIMESTAMP;"))
            if "is_deleted" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN is_deleted BOOLEAN DEFAULT 0;"))
            if "crm_source" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN crm_source VARCHAR(50) DEFAULT 'bitrix24';"))
            if "status" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN status VARCHAR(50) DEFAULT 'ACTIVE';"))
            if "stage_name" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN stage_name VARCHAR(255);"))
            if "pipeline_id" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN pipeline_id VARCHAR(100);"))
            if "pipeline_name" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN pipeline_name VARCHAR(255);"))
            if "loss_reason" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN loss_reason VARCHAR(255);"))
            if "loss_reason_code" not in deal_cols:
                conn.execute(text("ALTER TABLE deals ADD COLUMN loss_reason_code VARCHAR(50);"))

            if "agent_traces" in tables:
                trace_cols = [c["name"] for c in inspector.get_columns("agent_traces")]
                if "context_hash" not in trace_cols:
                    conn.execute(text("ALTER TABLE agent_traces ADD COLUMN context_hash VARCHAR(64);"))
                if "auto_vcr_generated" not in trace_cols:
                    conn.execute(text("ALTER TABLE agent_traces ADD COLUMN auto_vcr_generated BOOLEAN DEFAULT 0;"))
                if "execution_mode" not in trace_cols:
                    conn.execute(text("ALTER TABLE agent_traces ADD COLUMN execution_mode VARCHAR(20) DEFAULT 'prod';"))

            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_deal_external_crm_id ON deals (tenant_id, external_crm_id);"))
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_deals_pipeline_id ON deals (pipeline_id);"))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_call_external_id ON call_recordings (tenant_id, external_call_id);"))
    except Exception as e:
        import logging
        logging.getLogger("database").warning(f"Could not apply schema migration or indexes in init_db: {e}")

    # Separate transaction: must not be rolled back by an unrelated failure above.
    try:
        with engine.begin() as conn:
            widened = widen_legacy_text_columns(conn, engine.dialect.name)
        if widened:
            import logging
            logging.getLogger("database").info(f"Widened legacy columns to TEXT: {widened}")
    except Exception as e:
        import logging
        logging.getLogger("database").error(f"Could not widen legacy text columns: {e}")


def get_db() -> Generator[Session, None, None]:
    """FastAPI Dependency for transactional DB sessions (writes + reads)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_read_db() -> Generator[Session, None, None]:
    """FastAPI Dependency for read-only analytical queries."""
    db = SessionRead()
    try:
        yield db
    finally:
        db.close()


def get_db_routing_info() -> dict:
    """Returns database routing configuration for monitoring."""
    return {
        "primary_configured": True,
        "primary_url": str(engine.url).split("@")[0] + "@***" if "postgresql" in DATABASE_URL else "sqlite",
        "has_read_replica": DATABASE_READ_REPLICA_URL != DATABASE_URL,
        "read_dialect": engine_read.dialect.name,
        "read_url": str(engine_read.url).split("@")[0] + "@***" if "postgresql" in DATABASE_READ_REPLICA_URL else "sqlite",
    }


def get_pool_metrics() -> dict:
    """Returns connection pool metrics for both engines."""
    p = getattr(engine, "pool", None)
    metrics = {
        "primary": {
            "size": getattr(p, "size", lambda: 0)(),
            "checked_in": getattr(p, "checkedin", lambda: 0)(),
            "checked_out": getattr(p, "checkedout", lambda: 0)(),
            "overflow": getattr(p, "overflow", lambda: 0)(),
        }
    }
    
    if DATABASE_READ_REPLICA_URL != DATABASE_URL:
        pr = getattr(engine_read, "pool", None)
        metrics["read_replica"] = {
            "size": getattr(pr, "size", lambda: 0)(),
            "checked_in": getattr(pr, "checkedin", lambda: 0)(),
            "checked_out": getattr(pr, "checkedout", lambda: 0)(),
            "overflow": getattr(pr, "overflow", lambda: 0)(),
        }
    
    return metrics
