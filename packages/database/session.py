"""
Database session and connection management for RevOps SaaS.
Supports local SQLite for zero-setup execution and PostgreSQL with connection pooling.
"""

import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from .models import Base

BASE_DIR = Path(__file__).resolve().parent.parent.parent
DEFAULT_DB_PATH = BASE_DIR / "revops_saas.db"

# Allows configuring PostgreSQL via DATABASE_URL or defaults to isolated SQLite
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_DB_PATH}")

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
engine = create_engine(DATABASE_URL, connect_args=connect_args, echo=False)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initializes all database tables safely without affecting external systems."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI Dependency for transactional DB sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
