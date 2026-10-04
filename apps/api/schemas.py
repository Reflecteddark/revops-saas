"""
Pydantic schemas for the RevOps SaaS API.
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, EmailStr, Field
from packages.database.models import UserRole, SubscriptionTier, DealStage


# Auth Schemas
class TenantRegisterRequest(BaseModel):
    company_name: str = Field(..., min_length=2)
    admin_name: str = Field(..., min_length=2)
    admin_email: EmailStr
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: str
    role: str
    full_name: str


class UserResponse(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    tenant_id: str
    is_active: bool


# Diagnostics Schemas
class SevenSinsRequest(BaseModel):
    monthly_leads: int = Field(default=240, ge=1)
    avg_ticket_rub: float = Field(default=180000.0, ge=1.0)
    current_conversion_pct: float = Field(default=6.8, ge=0.1, le=100.0)
    avg_first_response_min: float = Field(default=45.0, ge=0.0)
    deals_without_next_step_pct: float = Field(default=38.0, ge=0.0, le=100.0)
    stalled_deals_pct: float = Field(default=42.0, ge=0.0, le=100.0)
    unworked_lost_deals_pct: float = Field(default=85.0, ge=0.0, le=100.0)
    objection_drop_pct: float = Field(default=52.0, ge=0.0, le=100.0)
    script_breach_pct: float = Field(default=34.0, ge=0.0, le=100.0)
    rep_load_variance_pct: float = Field(default=45.0, ge=0.0, le=100.0)


class ExpressCalcRequest(BaseModel):
    monthly_leads: int = Field(default=150, ge=1)
    avg_ticket_rub: float = Field(default=250000.0, ge=1.0)
    current_close_rate_pct: float = Field(default=5.0, ge=0.1, le=100.0)
    expected_conversion_uplift_pct: float = Field(default=30.0, ge=1.0)


# Simulator Schemas
class MonteCarloRequest(BaseModel):
    leads_mean: Optional[float] = None
    leads: Optional[float] = None
    leads_std: float = Field(default=35.0, ge=0.0)
    conv_qual_pct: Optional[float] = None
    qual_rate: Optional[float] = None
    conv_meeting_pct: float = Field(default=62.0, ge=1.0, le=100.0)
    conv_close_pct: Optional[float] = None
    close_rate: Optional[float] = None
    avg_ticket_rub: Optional[float] = None
    avg_ticket: Optional[float] = None
    ticket_std_rub: float = Field(default=25000.0, ge=0.0)
    target_revenue_rub: float = Field(default=4500000.0, ge=1000.0)
    iterations: int = Field(default=10000, ge=100, le=50000)
    org_id: Optional[str] = "org_default"


# Speech AI Schemas
class SpeechEvaluationRequest(BaseModel):
    deal_id: Optional[str] = None
    client_phone: str = Field(default="+7 (999) 000-00-00")
    duration_seconds: int = Field(default=340)
    manager_name: str = Field(default="Иван Петров")
    scores: Dict[str, float] = Field(..., description="Scores for 13 criteria (0-10 or 0-100)")
    comments: Optional[Dict[str, str]] = None
