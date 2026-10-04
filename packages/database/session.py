"""
Database session and connection management for RevOps SaaS.
Supports:
- Local SQLite for zero-setup execution.
- Production PostgreSQL Primary for write transactions.
- PostgreSQL Read Replicas (DATABASE_READ_REPLICA_URL) for heavy analytical queries.
"""

import os
from pathlib import Path
from typing import Generator, Dict, Any
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .models import Base

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "revops_saas.db"

# Primary / Writer Database
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

# Read Replica Database (optional, defaults to DATABASE_URL if omitted)
DATABASE_READ_REPLICA_URL = os.getenv("DATABASE_READ_REPLICA_URL", None)

is_sqlite = "sqlite" in DATABASE_URL
connect_args = {"check_same_thread": False} if is_sqlite else {}

# Engine Options for PostgreSQL
engine_kwargs = {}
if not is_sqlite:
    engine_kwargs = {
        "pool_size": int(os.getenv("DB_POOL_SIZE", "20")),
        "max_overflow": int(os.getenv("DB_MAX_OVERFLOW", "10")),
        "pool_pre_ping": True,
        "pool_recycle": 1800,
    }

# 1. Primary Engine (Writes)
engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 2. Read Replica Engine (Reads & Analytics)
if DATABASE_READ_REPLICA_URL:
    read_connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_READ_REPLICA_URL else {}
    engine_read = create_engine(
        DATABASE_READ_REPLICA_URL,
        connect_args=read_connect_args,
        echo=False,
        **engine_kwargs
    )
    ReadSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine_read)
    HAS_READ_REPLICA = True
else:
    engine_read = engine
    ReadSessionLocal = SessionLocal
    HAS_READ_REPLICA = False


def init_db():
    """Initializes all database tables safely on the primary database."""
    Base.metadata.create_all(bind=engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI Dependency for transactional write sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_read_db() -> Generator[Session, None, None]:
    """
    FastAPI Dependency for read-only analytical queries.
    Routes queries to the Read Replica pool if configured, or Primary as fallback.
    """
    db = ReadSessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db_routing_info() -> Dict[str, Any]:
    """Returns database connection and replica routing telemetry."""
    return {
        "primary_configured": True,
        "primary_dialect": engine.dialect.name,
        "has_read_replica": HAS_READ_REPLICA,
        "read_replica_configured": DATABASE_READ_REPLICA_URL is not None,
        "read_dialect": engine_read.dialect.name,
    }
