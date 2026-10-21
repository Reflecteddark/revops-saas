"""
Database models for RevOps SaaS.
Implements Multi-Tenant data isolation, RBAC (7 roles), Pipeline, Deals, Speech Analytics, and Simulations.
"""

import enum
import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, ForeignKey, 
    Text, Enum, JSON, Index, func
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class UserRole(str, enum.Enum):
    CEO = "👑 CEO"
    ROP = "📋 РОП"
    KAM = "💼 KAM"
    SDR = "📞 SDR"
    CMO = "🌐 CMO"
    CFO = "💳 CFO"
    ADMIN = "⚙️ Admin"


class SubscriptionTier(str, enum.Enum):
    STARTER = "Starter"
    PRO = "Pro"
    ENTERPRISE = "Enterprise"


class DealStage(str, enum.Enum):
    LEAD_INCOMING = "Входящий лид"
    QUALIFICATION = "Квалификация / SDR"
    MEETING_SCHEDULED = "КЭВ / Встреча назначена"
    MEETING_DONE = "Встреча проведена"
    COMMERCIAL_PROPOSAL = "КП отправлено"
    DECISION_MAKING = "Принятие решения"
    CONTRACT_PAYMENT = "Договор / Счёт"
    WON = "Успешно реализовано"
    LOST = "Закрыто и не реализовано"


class Tenant(Base):
    """Organization / Tenant record for SaaS isolation."""
    __tablename__ = "tenants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    tier = Column(Enum(SubscriptionTier), default=SubscriptionTier.PRO, nullable=False)
    max_seats = Column(Integer, default=10, nullable=False)
    ai_minutes_quota = Column(Integer, default=2000, nullable=False)
    ai_minutes_used = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    settings = Column(JSON, default=dict)

    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    workspaces = relationship("Workspace", back_populates="tenant", cascade="all, delete-orphan")
    deals = relationship("Deal", back_populates="tenant", cascade="all, delete-orphan")
    call_recordings = relationship("CallRecording", back_populates="tenant", cascade="all, delete-orphan")

    @property
    def spreadsheet_id(self) -> str:
        if self.settings and isinstance(self.settings, dict):
            return self.settings.get("spreadsheet_id", "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk")
        return "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk"

    @property
    def crm_type(self) -> str:
        if self.settings and isinstance(self.settings, dict):
            return self.settings.get("crm_type", "bitrix24")
        return "bitrix24"

    @property
    def status_label(self) -> str:
        if not self.is_active:
            return "offboarded"
        if self.settings and isinstance(self.settings, dict):
            return self.settings.get("status", "active")
        return "active"

    def to_registry_dict(self) -> dict:
        st = self.settings if isinstance(self.settings, dict) else {}
        return {
            "tenant_id": self.id,
            "tenant_name": self.name,
            "spreadsheet_id": st.get("spreadsheet_id", "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk"),
            "crm_type": st.get("crm_type", "bitrix24"),
            "status": "active" if self.is_active else st.get("status", "offboarded"),
            "niche_name": st.get("niche_name", "Универсальный B2B"),
            "avg_deal_check": st.get("avg_deal_check", 150000),
            "amo_domain": st.get("amo_domain"),
            "amo_token": st.get("amo_token"),
            "bitrix_webhook_url": st.get("bitrix_webhook_url"),
            "custom_features": st.get("custom_features", {}),
            "is_template": bool(st.get("is_template", False))
        }


class User(Base):
    """User with tenant membership and one of the 7 RevOps RBAC roles."""
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.KAM, nullable=False)
    telegram_chat_id = Column(String(50), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    tenant = relationship("Tenant", back_populates="users")
    deals = relationship("Deal", back_populates="assigned_user")
    call_recordings = relationship("CallRecording", back_populates="manager")

    __table_args__ = (
        Index("idx_tenant_user_email", "tenant_id", "email", unique=True),
    )

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN or "admin" in str(self.role.value).lower()



class Workspace(Base):
    """Subdivision / branch / pipeline workspace within a Tenant."""
    __tablename__ = "workspaces"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    crm_type = Column(String(50), default="amocrm")  # amocrm, bitrix24, hubspot
    crm_connected = Column(Boolean, default=False)
    settings = Column(JSON, default=dict)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tenant = relationship("Tenant", back_populates="workspaces")
    deals = relationship("Deal", back_populates="workspace")


class Deal(Base):
    """CRM Deal synchronized into RevOps OS with SLA tracking and risk radar."""
    __tablename__ = "deals"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    assigned_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    external_crm_id = Column(String(100), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    company_name = Column(String(255), nullable=True)
    contact_phone = Column(String(50), nullable=True)
    budget = Column(Float, default=0.0, nullable=False)
    stage = Column(Enum(DealStage), default=DealStage.LEAD_INCOMING, nullable=False)
    
    # SLA & Risk Radar fields
    days_in_stage = Column(Integer, default=0, nullable=False)
    stage_sla_days = Column(Integer, default=3, nullable=False)
    has_next_step = Column(Boolean, default=True, nullable=False)
    next_step_date = Column(DateTime, nullable=True)
    is_at_risk = Column(Boolean, default=False, nullable=False)
    risk_reason = Column(String(255), nullable=True)
    
    # Attribution
    lead_source = Column(String(100), default="Organic")
    utm_campaign = Column(String(100), nullable=True)
    
    # AI Quality Score
    avg_call_score = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=datetime.utcnow)

    tenant = relationship("Tenant", back_populates="deals")
    workspace = relationship("Workspace", back_populates="deals")
    assigned_user = relationship("User", back_populates="deals")
    calls = relationship("CallRecording", back_populates="deal")


class CallRecording(Base):
    """Audio Call with Whisper transcription and 13-criteria AI analysis."""
    __tablename__ = "call_recordings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tenant_id = Column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    deal_id = Column(String(36), ForeignKey("deals.id", ondelete="CASCADE"), nullable=True, index=True)
    manager_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    
    external_call_id = Column(String(100), nullable=True)
    client_phone = Column(String(50), nullable=False)
    duration_seconds = Column(Integer, default=0)
    audio_s3_url = Column(String(512), nullable=True)
    
    # Speech AI processing status
    status = Column(String(50), default="completed")  # queued, processing, completed, error
    transcript_text = Column(Text, nullable=True)
    ai_summary = Column(Text, nullable=True)
    next_action_extracted = Column(String(255), nullable=True)
    
    # Overall score (0-100)
    overall_score = Column(Float, default=0.0)
    
    # Detailed 13 scorecard criteria in JSON
    # criteria: greeting, qualification, needs_analysis, price_presentation, objections, 
    # next_step, script_compliance, talk_ratio, toxicity, empathy, urgency, competitor_handling, closing
    scorecard_criteria = Column(JSON, default=dict)
    reverse_etl_synced = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    tenant = relationship("Tenant", back_populates="call_recordings")
    deal = relationship("Deal", back_populates="calls")
    manager = relationship("User", back_populates="call_recordings")
