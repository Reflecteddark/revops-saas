"""
packages/antidrift/contracts/hitl.py

Human-in-the-Loop (HITL) Approval contracts.
Bridges Anti-Drift barrier with Telegram Mission Control and Audit DB.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Literal
from pydantic import BaseModel, Field


class ApprovalStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EDITED = "EDITED"
    ESCALATED = "ESCALATED"
    EXPIRED = "EXPIRED"
    EXECUTED = "EXECUTED"
    FAILED = "FAILED"


class HITLApprovalRequest(BaseModel):
    approval_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    trace_id: str
    intent_id: str
    tenant_id: str
    agent_id: str
    harness_version: str
    risk_level: str
    reason: str
    
    proposed_actions_summary: list[dict[str, Any]] = Field(default_factory=list)
    proposed_client_reply: str | None = None
    
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime
    status: ApprovalStatus = ApprovalStatus.PENDING
    
    telegram_chat_id: str | None = None
    telegram_message_id: int | None = None


class ApprovalDecision(BaseModel):
    approval_id: str
    decision: Literal["APPROVE", "REJECT", "EDIT", "ESCALATE", "TAKEOVER"]
    approver_id: str
    approver_role: Literal["rop", "engineer", "admin", "manager"]
    comment: str | None = None
    edited_reply_text: str | None = None
    decided_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
