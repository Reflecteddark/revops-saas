# -*- coding: utf-8 -*-
"""
RevOps API Models — PiiVault and Database Schema Integration.
"""
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    LargeBinary,
    DateTime,
    Integer,
    UniqueConstraint
)
from packages.database.models import Base, Tenant, Deal, CallRecording, User, Workspace

Call = CallRecording

class PiiVault(Base):  # type: ignore[valid-type,misc]
    __tablename__ = 'pii_vault'
    __table_args__ = (
        UniqueConstraint('tenant_id', 'hash_value', name='uq_tenant_pii_hash'),
        {'extend_existing': True}
    )
    
    pii_id = Column(String(32), primary_key=True)
    tenant_id = Column(String(20), nullable=False, index=True)
    pii_type = Column(String(20), nullable=False)
    encrypted_value = Column(LargeBinary, nullable=False)
    hash_value = Column(String(64), nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    last_accessed_at = Column(DateTime, nullable=True)
    access_count = Column(Integer, default=0)
