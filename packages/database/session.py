import os
from pathlib import Path
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool
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

# Session factories
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
SessionRead = sessionmaker(autocommit=False, autoflush=False, bind=engine_read)


def init_db():
    """Initializes all database tables safely."""
    Base.metadata.create_all(bind=engine)


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
