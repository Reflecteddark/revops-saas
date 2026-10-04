"""
SQLAlchemy models matching the RevOps Intelligence Enterprise SaaS Schema:
- organizations
- users
- deals
- simulations
- revenue_history (TimescaleDB hypertable compatible)
- deal_embeddings (pgvector compatible)
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, 
    Numeric, Text, JSON, Index, func
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Organization(Base):
    """SaaS Tenant Organization."""
    __tablename__ = "organizations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    plan = Column(String(50), default="pro", nullable=False)  # 'free', 'pro', 'enterprise'
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    settings = Column(JSON, default=dict)

    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    deals = relationship("Deal", back_populates="organization", cascade="all, delete-orphan")
    simulations = relationship("Simulation", back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    """User account within an Organization."""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), default="admin", nullable=False)  # 'admin', 'viewer', etc.
    hashed_password = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    organization = relationship("Organization", back_populates="users")
    simulations = relationship("Simulation", back_populates="user")


class Deal(Base):
    """CRM Deal synchronized from amoCRM or Bitrix24."""
    __tablename__ = "deals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    crm_deal_id = Column(String(100), nullable=True, index=True)
    crm_source = Column(String(50), default="amo", nullable=False)  # 'amo', 'bitrix'
    title = Column(String(255), nullable=False)
    amount = Column(Numeric(15, 2), default=0.0, nullable=False)
    stage = Column(String(100), default="Квалификация", nullable=False)
    status = Column(String(50), default="active", nullable=False)
    sla_risk = Column(Boolean, default=False, nullable=False)
    next_step_date = Column(DateTime, nullable=True)
    synced_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    organization = relationship("Organization", back_populates="deals")
    embeddings = relationship("DealEmbedding", back_populates="deal", cascade="all, delete-orphan")


class Simulation(Base):
    """Monte-Carlo Simulation Run Record."""
    __tablename__ = "simulations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    params = Column(JSON, nullable=False)  # leads, qual_rate, close_rate, avg_ticket, iterations
    results = Column(JSON, nullable=False)  # p10, p50, p90, histogram
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    organization = relationship("Organization", back_populates="simulations")
    user = relationship("User", back_populates="simulations")


class RevenueHistory(Base):
    """Time-series of historical and projected revenue (TimescaleDB hypertable compatible)."""
    __tablename__ = "revenue_history"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    time = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    org_id = Column(String(36), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    revenue = Column(Numeric(15, 2), nullable=False)
    scenario = Column(String(50), default="p50", nullable=False)  # 'actual', 'p10', 'p50', 'p90'

    __table_args__ = (
        Index("idx_rev_hist_time_org_scen", "time", "org_id", "scenario"),
    )


class DealEmbedding(Base):
    """pgvector semantic embeddings for deals (AI insights & similarity search)."""
    __tablename__ = "deal_embeddings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    deal_id = Column(String(36), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True)
    embedding = Column(JSON, nullable=False)  # Stored as vector float array in PostgreSQL / JSON in SQLite fallback
    metadata_info = Column(JSON, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    deal = relationship("Deal", back_populates="embeddings")

