"""
packages/antidrift/contracts/intent.py

Strict Pydantic contracts for Agent Intent and Action specifications.
Enforces the Intent-Execution Barrier: LLM models never touch CRM directly,
they only emit validated AgentIntentPayload objects.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field, field_validator


class ActionRiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ExecutionMode(str, enum.Enum):
    PROD = "prod"        # Standard production execution committing to CRM via crm_gateway
    SHADOW = "shadow"    # LLM executes, validates/scores, but CRM is NOT mutated; diff is computed
    DRY_RUN = "dry_run"  # Zero LLM/CRM side-effects; fast deterministic invariant simulation


class ActionType(str, enum.Enum):
    # Read-only actions
    CRM_GET_DEAL = "crm_get_deal"
    CRM_GET_CONTACT = "crm_get_contact"
    CRM_GET_TASKS = "crm_get_tasks"
    
    # Low mutation actions
    CRM_ADD_TAG = "crm_add_tag"
    CRM_REMOVE_TAG = "crm_remove_tag"
    CRM_ADD_NOTE = "crm_add_note"
    
    # Medium mutation actions
    CRM_UPDATE_STAGE = "crm_update_stage"
    CRM_CREATE_TASK = "crm_create_task"
    CRM_SET_FIELD = "crm_set_field"
    TRIGGER_WEBHOOK = "trigger_webhook"
    
    # High mutation actions
    CRM_CHANGE_BUDGET = "crm_change_budget"
    CRM_REASSIGN_MANAGER = "crm_reassign_manager"
    CRM_CLOSE_DEAL_LOST = "crm_close_deal_lost"
    CRM_CLOSE_DEAL_WON = "crm_close_deal_won"
    
    # Dangerous / Forbidden without explicit rule
    CRM_DELETE_ENTITY = "crm_delete_entity"


class ActionItem(BaseModel):
    """Atomic action proposed by an agent within its intent."""
    action_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action_type: ActionType
    target_type: Literal["deal", "contact", "company", "task", "webhook"]
    target_id: str = Field(..., min_length=1, description="CRM Entity ID or target identifier")
    payload: dict[str, Any] = Field(default_factory=dict)
    risk_level: ActionRiskLevel = ActionRiskLevel.LOW
    idempotency_hint: str = Field(
        default="",
        description="Deterministic seed for deduplication key generation"
    )

    @field_validator("target_id")
    @classmethod
    def clean_target_id(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("target_id cannot be empty")
        return clean


class ProposedClientReply(BaseModel):
    """Proposed communication to client. Checked by heuristic and text-judge guardrails."""
    text: str = Field(..., min_length=1)
    tone: Literal["business", "empathetic", "strict", "neutral"] = "business"
    contains_financial_promise: bool = False
    contains_legal_commitment: bool = False
    contains_discount_promise: bool = False
    requires_approval: bool = False

    @field_validator("text")
    @classmethod
    def validate_text_not_empty(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Proposed reply text cannot be empty")
        return clean


class EscalationPayload(BaseModel):
    """Specification when the agent decides to pass dialogue to a human."""
    required: bool = False
    reason: str | None = None
    priority: Literal["low", "medium", "high", "urgent"] | None = None
    target_role: Literal["rop", "manager", "support", "lawyer"] | None = None


class AgentIntentPayload(BaseModel):
    """
    Primary intent emitted by Agent Runtime.
    Passed into the Execution Barrier for strict validation, guardrail policy checks,
    idempotency registration, and risk-weighted approval routing.
    """
    trace_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = Field(..., min_length=1)
    tenant_id: str = Field(..., min_length=1)
    channel: str = Field(default="api", description="whatsapp, telegram, site, telephony, crm")
    source_event_id: str = Field(..., min_length=1, description="External inbound message or webhook ID")
    
    agent_id: str = Field(..., min_length=1)
    harness_version: str = Field(..., min_length=1)
    policy_version: str = Field(default="v1.0")
    crm_schema_hash: str = Field(default="", description="Hash of active CRM custom fields schema")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    intent: str = Field(..., min_length=1, description="Semantic label, e.g. QUALIFY_LEAD_AND_SCHEDULE_CALL")
    reasoning_summary: str = Field(
        default="",
        max_length=500,
        description="Safe, non-PII explanation of agent reasoning"
    )
    confidence_score: float = Field(default=1.0, ge=0.0, le=1.0)
    risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    
    context_refs: dict[str, Any] = Field(default_factory=dict, description="e.g. {'deal_id': 123, 'contact_id': 456}")
    capability_scopes: list[str] = Field(default_factory=list, description="Scopes authorized for this harness")
    
    proposed_actions: list[ActionItem] = Field(default_factory=list)
    proposed_client_reply: ProposedClientReply | None = None
    escalation: EscalationPayload | None = None


class VerifiedIntentProposal(AgentIntentPayload):
    """
    Zero-Trust Extension of AgentIntentPayload:
    Binds intent to a cryptographically hashed TrustedContext,
    enumerates exact facts used, records unverified assumptions,
    and specifies expected state delta for dry-run validation.
    """
    context_hash: Optional[str] = Field(default=None, description="SHA-256 hash of ground-truth TrustedContext")
    context_assembled_at: Optional[datetime] = Field(default=None, description="Timestamp when the bound context was assembled")
    used_facts: list[str] = Field(default_factory=list, description="Ground truth facts extracted from TrustedContext")
    unverified_assumptions: list[str] = Field(default_factory=list, description="Assumptions lacking verified context facts")
    expected_state_delta: dict[str, Any] = Field(default_factory=dict, description="Expected state changes for Dry-Run")
    execution_mode: Optional[ExecutionMode] = Field(default=None, description="Execution mode: prod, shadow, or dry_run")
