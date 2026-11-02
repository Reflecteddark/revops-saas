"""
packages/antidrift/models.py

SQLAlchemy models for the RevOps Anti-Drift and AgentOps Engine.
Enforces multi-tenant data isolation, complete audit trails,
immutable trace storage, and deterministic idempotency.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from packages.database.models import Base


class HarnessRegistry(Base):
    """Immutable registry of agent harness versions."""
    __tablename__ = "harness_registry"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_id = Column(String(100), nullable=False, index=True)
    version = Column(String(50), nullable=False)
    model_provider = Column(String(50), nullable=False, default="google")
    model_name = Column(String(100), nullable=False)
    temperature = Column(Float, nullable=False, default=0.1)
    max_tokens = Column(Integer, nullable=False, default=1500)
    system_prompt_hash = Column(String(64), nullable=False)
    tools_schema_hash = Column(String(64), nullable=False)
    policy_version = Column(String(50), nullable=False, default="v1.0")
    guardrails_version = Column(String(50), nullable=False, default="v1.0")
    status = Column(String(50), nullable=False, default="DRAFT", index=True)
    rollback_version = Column(String(50), nullable=True)
    metadata_json = Column(JSON, default=dict)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    created_by = Column(String(100), default="system")
    approved_by = Column(String(100), nullable=True)

    __table_args__ = (
        Index("idx_harness_agent_version", "agent_id", "version", unique=True),
        Index("idx_harness_status", "agent_id", "status"),
    )


class AgentTrace(Base):
    """Immutable trace of every single inbound interaction executed by an agent."""
    __tablename__ = "agent_traces"

    trace_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(100), nullable=False, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    agent_id = Column(String(100), nullable=False, index=True)
    harness_version = Column(String(50), nullable=False)
    policy_version = Column(String(50), nullable=False)
    channel = Column(String(50), nullable=False, default="api")
    source_event_id = Column(String(100), nullable=False)
    
    execution_mode = Column(String(20), nullable=False, default="prod")  # prod, shadow, canary, replay, test
    input_payload_sanitized = Column(JSON, default=dict)
    context_snapshot_json = Column(JSON, default=dict)
    model_request_hash = Column(String(64), nullable=True)
    raw_intent_json = Column(JSON, default=dict)
    validation_result_json = Column(JSON, default=dict)
    guardrail_result_json = Column(JSON, default=dict)
    
    risk_score = Column(Float, default=0.0)
    confidence_score = Column(Float, default=1.0)
    routing_decision = Column(String(50), default="execution_gateway")
    latency_ms = Column(Float, default=0.0)
    cost_estimate = Column(Float, default=0.0)
    error = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    __table_args__ = (
        Index("idx_trace_tenant_created", "tenant_id", "created_at"),
        Index("idx_trace_agent_version", "agent_id", "harness_version"),
    )

    intents = relationship("AgentIntent", back_populates="trace", cascade="all, delete-orphan")


class AgentIntent(Base):
    """Structured intent emitted by agent runtime before physical execution."""
    __tablename__ = "agent_intents"

    intent_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trace_id = Column(String(36), ForeignKey("agent_traces.trace_id", ondelete="CASCADE"), nullable=False, index=True)
    session_id = Column(String(100), nullable=False, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    agent_id = Column(String(100), nullable=False)
    harness_version = Column(String(50), nullable=False)
    
    intent_name = Column(String(100), nullable=False)
    risk_score = Column(Float, default=0.0)
    confidence_score = Column(Float, default=1.0)
    payload_json = Column(JSON, default=dict)
    validation_status = Column(String(50), nullable=False, default="PENDING")
    policy_status = Column(String(50), nullable=False, default="PENDING")
    requires_approval = Column(Boolean, default=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    trace = relationship("AgentTrace", back_populates="intents")
    actions = relationship("ActionExecution", back_populates="intent", cascade="all, delete-orphan")


class ActionExecution(Base):
    """Physical execution journal of atomic mutations (CRM, messaging, webhooks)."""
    __tablename__ = "action_executions"

    action_execution_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    intent_id = Column(String(36), ForeignKey("agent_intents.intent_id", ondelete="CASCADE"), nullable=False, index=True)
    trace_id = Column(String(36), nullable=False, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    agent_id = Column(String(100), nullable=False)
    harness_version = Column(String(50), nullable=False)
    
    action_type = Column(String(100), nullable=False)
    target_type = Column(String(50), nullable=False)
    target_id = Column(String(100), nullable=False)
    idempotency_key = Column(String(64), nullable=False, index=True)
    status = Column(String(50), nullable=False, default="PROPOSED", index=True)
    
    state_before_json = Column(JSON, default=dict)
    state_after_json = Column(JSON, default=dict)
    error = Column(Text, nullable=True)
    compensation_status = Column(String(50), nullable=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("idx_action_idempotency_tenant", "tenant_id", "idempotency_key"),
        Index("idx_action_status_target", "status", "target_type", "target_id"),
    )

    intent = relationship("AgentIntent", back_populates="actions")


class IdempotencyKeyRecord(Base):
    """Persistent storage of idempotency keys in PostgreSQL with unique constraint."""
    __tablename__ = "idempotency_keys"

    idempotency_key = Column(String(64), primary_key=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    action_type = Column(String(100), nullable=False)
    source_event_id = Column(String(100), nullable=False)
    action_hash = Column(String(64), nullable=False)
    status = Column(String(50), nullable=False, default="PROCESSING")
    related_action_execution_id = Column(String(36), nullable=True)
    
    first_seen_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)

    __table_args__ = (
        Index("idx_idempotency_tenant_key", "tenant_id", "idempotency_key", unique=True),
    )


class HITLApproval(Base):
    """Human-in-the-Loop approval requests routed to Telegram and ROP dashboard."""
    __tablename__ = "hitl_approvals"

    approval_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trace_id = Column(String(36), nullable=False, index=True)
    intent_id = Column(String(36), nullable=False, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    agent_id = Column(String(100), nullable=False)
    harness_version = Column(String(50), nullable=False)
    
    risk_level = Column(String(20), nullable=False, default="medium")
    payload_hash = Column(String(64), nullable=True)
    status = Column(String(50), nullable=False, default="PENDING", index=True)
    
    requested_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    decided_at = Column(DateTime, nullable=True)
    
    approver_id = Column(String(100), nullable=True)
    approver_role = Column(String(50), nullable=True)
    decision = Column(String(50), nullable=True)
    comment = Column(Text, nullable=True)
    
    telegram_message_id = Column(Integer, nullable=True)
    telegram_callback_id = Column(String(100), nullable=True)


class PolicyRule(Base):
    """Declarative safety policies and action guardrails."""
    __tablename__ = "policy_rules"

    policy_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version = Column(String(50), nullable=False, default="v1.0")
    scope = Column(String(100), nullable=False, default="global")
    rule_type = Column(String(50), nullable=False)
    action_type = Column(String(100), nullable=False)
    condition_json = Column(JSON, default=dict)
    effect = Column(String(50), nullable=False)  # allow, deny, require_approval, escalate
    severity = Column(String(50), nullable=False, default="HARD_FAILURE")
    description = Column(Text, nullable=False)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    activated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    deactivated_at = Column(DateTime, nullable=True)


class GoldenScenario(Base):
    """Benchmark test cases across 10 stratified cohorts."""
    __tablename__ = "golden_scenarios"

    scenario_id = Column(String(100), primary_key=True)
    cohort = Column(String(50), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    
    input_json = Column(JSON, nullable=False, default=dict)
    crm_context_json = Column(JSON, nullable=False, default=dict)
    expected_invariants_json = Column(JSON, nullable=False, default=dict)
    forbidden_actions_json = Column(JSON, nullable=False, default=list)
    required_actions_json = Column(JSON, nullable=False, default=list)
    reply_constraints_json = Column(JSON, nullable=False, default=dict)
    
    max_latency_ms = Column(Float, default=3000.0)
    max_cost = Column(Float, default=0.05)
    risk_level = Column(String(20), default="low")
    version = Column(String(50), default="v1.0")
    status = Column(String(50), default="ACTIVE", index=True)
    created_from_incident_id = Column(String(36), nullable=True)
    stale_after_days = Column(Integer, default=30)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class VCRCassette(Base):
    """Frozen external CRM/Telephony responses tied to schema hashes."""
    __tablename__ = "vcr_cassettes"

    cassette_id = Column(String(100), primary_key=True)
    scenario_id = Column(String(100), ForeignKey("golden_scenarios.scenario_id", ondelete="CASCADE"), nullable=False, index=True)
    target_service = Column(String(50), nullable=False)  # amocrm, bitrix24, n8n, zadarma
    recorded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    crm_schema_hash = Column(String(64), nullable=False)
    policy_version = Column(String(50), default="v1.0")
    ttl_days = Column(Integer, default=30)
    status = Column(String(50), default="VALID", index=True)
    sanitized_payload_json = Column(JSON, nullable=False, default=dict)


class AgentIncident(Base):
    """Post-mortem incident reports from production failures."""
    __tablename__ = "agent_incidents"

    incident_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trace_id = Column(String(36), nullable=False, index=True)
    severity = Column(String(20), nullable=False, default="P1")  # P0, P1, P2
    source = Column(String(50), nullable=False, default="RUNTIME_GUARD")
    agent_id = Column(String(100), nullable=False)
    harness_version = Column(String(50), nullable=False)
    summary = Column(Text, nullable=False)
    root_cause = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="OPEN", index=True)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    resolved_at = Column(DateTime, nullable=True)
    postmortem_link = Column(String(255), nullable=True)
    related_test_added = Column(Boolean, default=False)


class BusinessMetricEvent(Base):
    """RevOps domain events: override rates, FCR, lead preservation."""
    __tablename__ = "business_metric_events"

    event_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trace_id = Column(String(36), nullable=False, index=True)
    session_id = Column(String(100), nullable=False, index=True)
    tenant_id = Column(String(100), nullable=False, index=True)
    deal_id = Column(String(100), nullable=True, index=True)
    
    metric_name = Column(String(100), nullable=False, index=True)
    metric_value = Column(Float, nullable=False, default=1.0)
    segment_json = Column(JSON, default=dict)
    agent_id = Column(String(100), nullable=False)
    harness_version = Column(String(50), nullable=False)
    
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

    __table_args__ = (
        Index("idx_bme_tenant_metric_created", "tenant_id", "metric_name", "created_at"),
    )


class PendingVCRScenario(Base):
    """
    Staging table for candidate Golden Set scenarios generated automatically
    from production HARD_FAILURE incidents (Sprint 3: Incident-to-VCR Loop).
    """
    __tablename__ = "pending_vcr_scenarios"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trace_id = Column(String(36), nullable=False, index=True)
    source_policy = Column(String(50), nullable=False)
    cohort = Column(String(50), nullable=False, index=True)
    raw_trace = Column(JSON, nullable=False, default=dict)
    pii_sanitized_trace = Column(JSON, nullable=False, default=dict)
    status = Column(String(20), nullable=False, default="PENDING", index=True)
    error_summary = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
