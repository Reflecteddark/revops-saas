"""
apps/api/routers/agents_router.py

Mission Control & Guarded Execution Router for Autonomous AI Agents.
Enforces the Intent-Execution Barrier:
Agent Intent -> Validation -> Policy Check -> Idempotency -> Audit -> CRM Gateway.
Zero hardcoding: dynamic multi-tenant isolation.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import os
from packages.antidrift.contracts.intent import AgentIntentPayload, VerifiedIntentProposal
from packages.antidrift.context.context_assembler import assemble_trusted_context
from packages.antidrift.contracts.decisions import DriftSeverity
from packages.antidrift.barrier.validator import IntentValidator
from packages.antidrift.barrier.policy_engine import PolicyEngine
from packages.antidrift.barrier.risk_scorer import RiskScorer
from packages.antidrift.barrier.idempotency import IdempotencyManager
from packages.antidrift.execution.crm_gateway import CRMExecutionGateway
from packages.antidrift.hitl.telegram_notifier import dispatch_hitl_approval_card
from packages.antidrift.models import (
    AgentIncident,
    AgentIntent,
    AgentTrace,
    HarnessRegistry,
    HITLApproval,
)
from packages.database.session import get_db

logger = logging.getLogger("agents_router")

router = APIRouter(prefix="/agents", tags=["AgentOps & Anti-Drift Engine"])


class ApprovalDecisionPayload(BaseModel):
    decision: Literal["APPROVE", "REJECT", "EDIT", "TAKEOVER"]
    approver_id: str
    approver_role: Literal["rop", "engineer", "admin", "manager"] = "rop"
    comment: Optional[str] = None
    edited_reply_text: Optional[str] = None


class RollbackRequest(BaseModel):
    agent_id: str
    target_version: Optional[str] = None
    reason: str


class KillSwitchRequest(BaseModel):
    agent_id: str
    reason: str


@router.post("/execute")
def execute_agent_intent(
    payload: VerifiedIntentProposal,
    client_message: str = Query("", description="Raw client inbound message for context"),
    db: Session = Depends(get_db),
):
    """
    Primary protected execution entrypoint for Agent Runtime.
    Applies Intent-Execution Barrier, Risk Scoring, Guardrails, Idempotency, and Audit.
    """
    now = datetime.now(timezone.utc)
    tenant_id = payload.tenant_id.strip()

    # 1. Structural and Scope Validation
    validation_violations = IntentValidator.validate_intent(payload)
    if validation_violations:
        # Record rejected trace in audit log
        trace = AgentTrace(
            trace_id=payload.trace_id,
            session_id=payload.session_id,
            tenant_id=tenant_id,
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            policy_version=payload.policy_version,
            channel=payload.channel,
            source_event_id=payload.source_event_id,
            execution_mode="rejected",
            input_payload_sanitized={"client_message": client_message},
            raw_intent_json=payload.model_dump(mode='json'),
            validation_result_json={"violations": validation_violations},
            error="; ".join(validation_violations),
            created_at=now,
        )
        db.add(trace)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Intent validation failed", "violations": validation_violations},
        )

    # 1.5. Layer 1.5: Trusted Context & Anti-Hallucination Fact-Check (Sprint 1)
    is_trusted_context_enabled = (
        os.getenv("ENABLE_TRUSTED_CONTEXT", "0") in ("1", "true", "True")
        or bool(payload.context_hash)
    )
    if is_trusted_context_enabled:
        deal_id = str(payload.context_refs.get("deal_id") or "")
        trusted_ctx = assemble_trusted_context(
            db=db,
            tenant_id=tenant_id,
            deal_id=deal_id,
            deal_context=payload.context_refs,
        )
        fact_violations = IntentValidator.validate_against_trusted_context(payload, trusted_ctx)
        if fact_violations:
            has_discount_breach = any("GR-03" in v for v in fact_violations)
            if has_discount_breach:
                incident = AgentIncident(
                    trace_id=payload.trace_id,
                    severity="P0",
                    source="FACT_CHECK_GUARD",
                    agent_id=payload.agent_id,
                    harness_version=payload.harness_version,
                    summary="Fact-check breach: unauthorized discount or terms hallucination",
                    root_cause="; ".join(fact_violations),
                    status="OPEN",
                    created_at=now,
                )
                db.add(incident)
                trace = AgentTrace(
                    trace_id=payload.trace_id,
                    session_id=payload.session_id,
                    tenant_id=tenant_id,
                    agent_id=payload.agent_id,
                    harness_version=payload.harness_version,
                    policy_version=payload.policy_version,
                    channel=payload.channel,
                    source_event_id=payload.source_event_id,
                    execution_mode="blocked",
                    input_payload_sanitized={"client_message": client_message},
                    context_snapshot_json=trusted_ctx.model_dump(mode="json"),
                    raw_intent_json=payload.model_dump(mode="json"),
                    error="; ".join(fact_violations),
                    created_at=now,
                )
                db.add(trace)
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "status": "BLOCKED",
                        "verdict": DriftSeverity.HARD_FAILURE.value,
                        "violations": [{"rule_id": "GR-03_DISCOUNT_PROMISE_GUARD", "message": v} for v in fact_violations],
                    },
                )
            else:
                trace = AgentTrace(
                    trace_id=payload.trace_id,
                    session_id=payload.session_id,
                    tenant_id=tenant_id,
                    agent_id=payload.agent_id,
                    harness_version=payload.harness_version,
                    policy_version=payload.policy_version,
                    channel=payload.channel,
                    source_event_id=payload.source_event_id,
                    execution_mode="rejected",
                    input_payload_sanitized={"client_message": client_message},
                    context_snapshot_json=trusted_ctx.model_dump(mode="json"),
                    raw_intent_json=payload.model_dump(mode="json"),
                    validation_result_json={"fact_violations": fact_violations},
                    error="; ".join(fact_violations),
                    created_at=now,
                )
                db.add(trace)
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={"error": "Fact-check validation failed", "violations": fact_violations},
                )

    # 2. Multi-factor Risk Scoring
    risk_result = RiskScorer.calculate_risk(
        intent=payload,
        client_message=client_message,
        deal_context=payload.context_refs,
    )
    payload.risk_score = risk_result.risk_score

    # 3. Policy Guardrails & Decision Matrix Evaluation
    policy_result = PolicyEngine.evaluate_intent(
        intent=payload,
        client_inbound_message=client_message,
        current_deal_context=payload.context_refs,
    )

    # 4. Handle Hard Failure (Blocking policy breach)
    if policy_result.overall_verdict in (DriftSeverity.HARD_FAILURE, DriftSeverity.REGRESSION):
        # Create P0 Incident
        incident = AgentIncident(
            trace_id=payload.trace_id,
            severity="P0" if policy_result.overall_verdict == DriftSeverity.HARD_FAILURE else "P1",
            source="POLICY_ENGINE_GUARD",
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            summary=f"Guardrail breach: {[v.rule_id for v in policy_result.violations]}",
            root_cause="; ".join(v.message for v in policy_result.violations),
            status="OPEN",
            created_at=now,
        )
        db.add(incident)

        # Record blocked trace
        trace = AgentTrace(
            trace_id=payload.trace_id,
            session_id=payload.session_id,
            tenant_id=tenant_id,
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            policy_version=payload.policy_version,
            channel=payload.channel,
            source_event_id=payload.source_event_id,
            execution_mode="blocked",
            input_payload_sanitized={"client_message": client_message},
            raw_intent_json=payload.model_dump(mode='json'),
            guardrail_result_json=policy_result.model_dump(mode='json'),
            risk_score=payload.risk_score,
            confidence_score=payload.confidence_score,
            routing_decision="rejection_handler",
            error="Blocked by policy guardrails",
            created_at=now,
        )
        db.add(trace)
        db.commit()

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "status": "BLOCKED",
                "verdict": policy_result.overall_verdict.value,
                "violations": [v.model_dump(mode='json') for v in policy_result.violations],
            },
        )

    # 5. Handle Human-in-the-Loop (HITL) Queueing
    if policy_result.requires_hitl or risk_result.requires_hitl:
        intent_record = AgentIntent(
            intent_id=str(uuid.uuid4()),
            trace_id=payload.trace_id,
            session_id=payload.session_id,
            tenant_id=tenant_id,
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            intent_name=payload.intent,
            risk_score=payload.risk_score,
            confidence_score=payload.confidence_score,
            payload_json=payload.model_dump(mode='json'),
            validation_status="VALID",
            policy_status="REQUIRES_APPROVAL",
            requires_approval=True,
            created_at=now,
        )
        db.add(intent_record)

        approval = HITLApproval(
            trace_id=payload.trace_id,
            intent_id=str(intent_record.intent_id),
            tenant_id=tenant_id,
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            risk_level=risk_result.risk_level,
            status="PENDING",
            requested_at=now,
            expires_at=now + timedelta(minutes=15),
        )
        db.add(approval)

        trace = AgentTrace(
            trace_id=payload.trace_id,
            session_id=payload.session_id,
            tenant_id=tenant_id,
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            policy_version=payload.policy_version,
            channel=payload.channel,
            source_event_id=payload.source_event_id,
            execution_mode="hitl_queue",
            input_payload_sanitized={"client_message": client_message},
            raw_intent_json=payload.model_dump(mode='json'),
            guardrail_result_json=policy_result.model_dump(mode='json'),
            risk_score=payload.risk_score,
            confidence_score=payload.confidence_score,
            routing_decision="hitl_approval_queue",
            created_at=now,
        )
        db.add(trace)
        db.commit()

        try:
            dispatch_hitl_approval_card(
                approval_id=str(approval.approval_id),
                tenant_id=tenant_id,
                agent_id=payload.agent_id,
                harness_version=payload.harness_version,
                intent_name=payload.intent,
                risk_level=risk_result.risk_level,
                risk_score=payload.risk_score,
                reasons=risk_result.reasons,
                proposed_actions=[a.model_dump(mode="json") for a in payload.proposed_actions],
                client_reply_text=payload.proposed_client_reply.text if payload.proposed_client_reply else None,
                client_message=client_message,
            )
        except Exception as e:
            logger.error(f"Error dispatching HITL Telegram card: {e}")

        return {
            "status": "AWAITING_APPROVAL",
            "approval_id": approval.approval_id,
            "trace_id": payload.trace_id,
            "risk_level": risk_result.risk_level,
            "reasons": risk_result.reasons,
            "expires_in_minutes": 15,
        }

    # 6. Approved Path: Execute Actions with Idempotency Protection
    intent_record = AgentIntent(
        intent_id=str(uuid.uuid4()),
        trace_id=payload.trace_id,
        session_id=payload.session_id,
        tenant_id=tenant_id,
        agent_id=payload.agent_id,
        harness_version=payload.harness_version,
        intent_name=payload.intent,
        risk_score=payload.risk_score,
        confidence_score=payload.confidence_score,
        payload_json=payload.model_dump(mode='json'),
        validation_status="VALID",
        policy_status="APPROVED",
        requires_approval=False,
        created_at=now,
    )
    db.add(intent_record)

    trace = AgentTrace(
        trace_id=payload.trace_id,
        session_id=payload.session_id,
        tenant_id=tenant_id,
        agent_id=payload.agent_id,
        harness_version=payload.harness_version,
        policy_version=payload.policy_version,
        channel=payload.channel,
        source_event_id=payload.source_event_id,
        execution_mode="prod",
        input_payload_sanitized={"client_message": client_message},
        raw_intent_json=payload.model_dump(mode='json'),
        guardrail_result_json=policy_result.model_dump(mode='json'),
        risk_score=payload.risk_score,
        confidence_score=payload.confidence_score,
        routing_decision="execution_gateway",
        created_at=now,
    )
    db.add(trace)
    db.flush()

    executed_actions: list[dict[str, Any]] = []

    for action in payload.proposed_actions:
        # Check action decision from policy engine
        if policy_result.action_decisions.get(action.action_id) == "BLOCK":
            continue

        idempotency_key = IdempotencyManager.generate_key(
            tenant_id=tenant_id,
            source_event_id=payload.source_event_id,
            action_type=action.action_type.value,
            target_id=action.target_id,
            payload=action.payload,
        )

        is_new, _ = IdempotencyManager.check_or_reserve_db(
            db=db,
            idempotency_key=idempotency_key,
            tenant_id=tenant_id,
            action_type=action.action_type.value,
            source_event_id=payload.source_event_id,
            payload=action.payload,
        )

        if not is_new:
            # Duplicate action ignored safely
            executed_actions.append({
                "action_id": action.action_id,
                "status": "DUPLICATE_SKIPPED",
                "idempotency_key": idempotency_key,
            })
            continue

        execution = CRMExecutionGateway.execute_action(
            db=db,
            action=action,
            intent_id=str(intent_record.intent_id),
            trace_id=payload.trace_id,
            tenant_id=tenant_id,
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            idempotency_key=idempotency_key,
        )

        IdempotencyManager.mark_completed_db(db, idempotency_key, str(execution.action_execution_id))

        executed_actions.append({
            "action_id": action.action_id,
            "action_execution_id": execution.action_execution_id,
            "status": execution.status,
            "mutation": execution.state_after_json,
        })

    db.commit()

    return {
        "status": "EXECUTED",
        "trace_id": payload.trace_id,
        "intent": payload.intent,
        "actions_executed": executed_actions,
        "approved_client_reply": payload.proposed_client_reply.text if payload.proposed_client_reply else None,
    }


@router.get("/approvals")
def list_pending_approvals(
    tenant_id: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Lists pending Human-in-the-Loop approvals for a specific tenant."""
    approvals = (
        db.query(HITLApproval)
        .filter(HITLApproval.tenant_id == tenant_id.strip(), HITLApproval.status == "PENDING")
        .order_by(HITLApproval.requested_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "tenant_id": tenant_id,
        "pending_count": len(approvals),
        "approvals": [
            {
                "approval_id": a.approval_id,
                "trace_id": a.trace_id,
                "intent_id": a.intent_id,
                "agent_id": a.agent_id,
                "harness_version": a.harness_version,
                "risk_level": a.risk_level,
                "requested_at": a.requested_at.isoformat() if a.requested_at else None,
                "expires_at": a.expires_at.isoformat() if a.expires_at else None,
            }
            for a in approvals
        ],
    }


@router.post("/approvals/{approval_id}/decide")
def decide_hitl_approval(
    approval_id: str,
    payload: ApprovalDecisionPayload,
    tenant_id: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    """Processes ROP or engineer decision on a pending approval."""
    approval = (
        db.query(HITLApproval)
        .filter(
            HITLApproval.approval_id == approval_id,
            HITLApproval.tenant_id == tenant_id.strip(),
        )
        .first()
    )
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")

    if approval.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Approval already decided with status: {approval.status}")

    now = datetime.now(timezone.utc)
    setattr(approval, "status", "APPROVED" if payload.decision == "APPROVE" else "REJECTED")
    setattr(approval, "approver_id", payload.approver_id)
    setattr(approval, "approver_role", payload.approver_role)
    setattr(approval, "decision", payload.decision)
    setattr(approval, "comment", payload.comment)
    setattr(approval, "decided_at", now)

    db.commit()
    db.refresh(approval)

    return {
        "status": "DECIDED",
        "approval_id": approval.approval_id,
        "decision": approval.decision,
        "approver_id": approval.approver_id,
    }


@router.post("/rollback")
def emergency_rollback(
    payload: RollbackRequest,
    db: Session = Depends(get_db),
):
    """Rolls back an agent harness to its previous verified version."""
    active_harness = (
        db.query(HarnessRegistry)
        .filter(HarnessRegistry.agent_id == payload.agent_id, HarnessRegistry.status == "ACTIVE")
        .first()
    )

    target_ver = payload.target_version or (active_harness.rollback_version if active_harness else None)
    if not target_ver:
        raise HTTPException(status_code=400, detail="No target rollback version found or specified")

    if active_harness:
        setattr(active_harness, "status", "ROLLED_BACK")

    target_harness = (
        db.query(HarnessRegistry)
        .filter(HarnessRegistry.agent_id == payload.agent_id, HarnessRegistry.version == target_ver)
        .first()
    )
    if target_harness:
        setattr(target_harness, "status", "ACTIVE")

    db.commit()
    return {
        "status": "ROLLED_BACK",
        "agent_id": payload.agent_id,
        "active_version": target_ver,
        "reason": payload.reason,
    }


@router.post("/kill-switch")
def emergency_kill_switch(
    payload: KillSwitchRequest,
    db: Session = Depends(get_db),
):
    """Emergency kill-switch: pauses all autonomous actions for the specified agent."""
    active_harnesses = (
        db.query(HarnessRegistry)
        .filter(HarnessRegistry.agent_id == payload.agent_id)
        .all()
    )
    for h in active_harnesses:
        setattr(h, "status", "PAUSED")

    db.commit()
    return {
        "status": "KILLED",
        "agent_id": payload.agent_id,
        "action": "All incoming events routed to human managers",
        "reason": payload.reason,
    }
