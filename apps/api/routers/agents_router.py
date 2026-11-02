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

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import os
from packages.antidrift.contracts.intent import AgentIntentPayload, ExecutionMode, VerifiedIntentProposal
from packages.antidrift.diff.diff_engine import DiffEngine
from packages.antidrift.context.context_assembler import (
    ContextUnavailableError,
    TrustedContext,
    assemble_trusted_context,
    build_grounded_system_prompt,
)
from packages.antidrift.contracts.decisions import DriftSeverity
from packages.antidrift.barrier.validator import IntentValidator
from packages.antidrift.barrier.policy_engine import HardFailureRateLimiter, PolicyEngine
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
    PendingVCRScenario,
)
from packages.antidrift.golden_set.vcr_scenario_generator import VCRScenarioGenerator
from packages.antidrift.canary.canary_router import canary_router
from packages.antidrift.contracts.policy_config import TenantPolicyRegistry
from packages.antidrift.policy_autotune import PolicyAutoTuner
from packages.antidrift.telemetry.metrics import antidrift_metrics
from packages.database.session import get_db

import secrets
from fastapi.security import HTTPAuthorizationCredentials
from packages.database.models import Tenant, User, UserRole
from packages.antidrift.models import ActionExecution
from ..auth import get_current_user, security

logger = logging.getLogger("agents_router")


def get_current_user_or_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Authenticates operator via JWT token, session cookie, or Admin secret key."""
    admin_key = (
        request.headers.get("x-admin-key")
        or request.headers.get("x-revops-admin-key")
        or request.headers.get("x-revops-secret")
    )
    revops_admin_key = os.getenv("REVOPS_ADMIN_KEY")
    if admin_key and revops_admin_key and secrets.compare_digest(admin_key, revops_admin_key):
        return User(
            id="admin-sys",
            tenant_id="*",
            email="admin@revops.io",
            full_name="System Administrator",
            role=UserRole.ADMIN,
            is_active=True,
        )

    if credentials or (request and request.cookies.get("access_token")):
        return get_current_user(credentials=credentials, db=db, request=request)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Требуется авторизация (Bearer токен или Admin-ключ)",
        headers={"WWW-Authenticate": "Bearer"},
    )

router = APIRouter(prefix="/agents", tags=["AgentOps & Anti-Drift Engine"])


class AssembleContextRequest(BaseModel):
    tenant_id: str
    deal_id: str
    session_id: Optional[str] = None
    base_system_prompt: Optional[str] = None
    deal_context: Optional[dict[str, Any]] = None
    allowed_discount_max: Optional[float] = None
    allowed_deferment_days: Optional[int] = None
    allowed_bonus_rub: Optional[float] = None
    allow_bonuses: Optional[bool] = None
    allowed_free_services: Optional[list[str]] = None


@router.post("/context/assemble")
def assemble_context_endpoint(
    req: AssembleContextRequest,
    db: Session = Depends(get_db),
):
    """
    Explicit Trusted Context Assembler Endpoint:
    Called by n8n, microservices, or frontend prior to agent prompt dispatch.
    Returns signed facts package, markdown representation, and grounded system prompt.
    """
    try:
        ctx = assemble_trusted_context(
            db=db,
            tenant_id=req.tenant_id,
            deal_id=req.deal_id,
            session_id=req.session_id,
            deal_context=req.deal_context,
            allowed_discount_max=req.allowed_discount_max,
            allowed_deferment_days=req.allowed_deferment_days,
            allowed_bonus_rub=req.allowed_bonus_rub,
            allow_bonuses=req.allow_bonuses,
            allowed_free_services=req.allowed_free_services,
            enforce_policy_ceilings=True,
        )
    except ContextUnavailableError as e:
        logger.error(f"Context assemble error: {e}")
        if getattr(e, "is_transient", False):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "Database temporarily unavailable for trusted context", "message": str(e)},
                headers={"Retry-After": str(getattr(e, "retry_after", 5))},
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Persistent database failure during trusted context assembly", "message": str(e)},
        )

    base_prompt = req.base_system_prompt or "Ты — автономный RevOps AI-ассистент отдела продаж."
    grounded_prompt = build_grounded_system_prompt(base_prompt, ctx)

    return {
        "tenant_id": ctx.tenant_id,
        "deal_id": ctx.deal_id,
        "context_hash": ctx.context_hash,
        "trusted_context": ctx.to_dict(),
        "markdown": ctx.to_markdown(),
        "grounded_system_prompt": grounded_prompt,
    }


class ApprovalDecisionPayload(BaseModel):
    decision: Literal["APPROVE", "REJECT", "EDIT", "TAKEOVER"]
    approver_id: str
    approver_role: str = "rop"
    comment: Optional[str] = None
    edited_reply_text: Optional[str] = None
    signature: Optional[str] = None


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
    mode: Optional[ExecutionMode] = Query(None, description="Execution mode override: prod, shadow, dry_run"),
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

    # Sprint 2 & 4: Early Resolve Execution Mode (Prod, Shadow, Dry-Run, Canary) - B2 Fix
    resolved_mode = mode or payload.execution_mode
    if not resolved_mode:
        canary_decision = canary_router.decide_execution_mode(
            tenant_id=tenant_id,
            session_id=payload.session_id,
        )
        if canary_decision == "canary":
            resolved_mode = ExecutionMode.CANARY
        else:
            resolved_mode = DiffEngine.resolve_traffic_mode(
                db=db,
                agent_id=payload.agent_id,
                harness_version=payload.harness_version,
                session_id=payload.session_id,
            )

    if resolved_mode == ExecutionMode.BLOCKED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "AGENT_PAUSED",
                "message": f"Agent harness '{payload.harness_version}' is paused, killed, rolled back or inactive.",
            },
        )

    is_shadow_or_dry_run = resolved_mode in (ExecutionMode.SHADOW, ExecutionMode.DRY_RUN)
    shadow_would_be_blocked = False

    # 1.5. Layer 1.5: Trusted Context & Anti-Hallucination Fact-Check (Sprint 1 & Audit 1.2)
    # Three-mode feature flag: off | monitor | enforce (default: monitor)
    tc_env = os.getenv("ENABLE_TRUSTED_CONTEXT", "monitor").lower().strip()
    is_trusted_context_enabled = tc_env not in ("0", "false", "off")
    is_enforcing = tc_env in ("enforce", "1", "true")
    if is_trusted_context_enabled:
        deal_id = str(payload.context_refs.get("deal_id") or "")
        try:
            trusted_ctx = assemble_trusted_context(
                db=db,
                tenant_id=tenant_id,
                deal_id=deal_id,
                session_id=payload.session_id,
                deal_context=payload.context_refs,
            )
        except ContextUnavailableError as e:
            logger.error(f"Execution blocked: {e}")
            if getattr(e, "is_transient", False):
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"error": "Database temporarily unavailable for trusted context", "message": str(e)},
                    headers={"Retry-After": str(getattr(e, "retry_after", 5))},
                )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": "Persistent database failure during trusted context assembly", "message": str(e)},
            )

        require_hash = (
            tc_env in ("enforce", "1", "true")
            or bool(payload.context_hash)
        )
        fact_violations = IntentValidator.validate_against_trusted_context(
            payload, trusted_ctx, require_hash=require_hash
        )
        if fact_violations:
            # M1: Transparent handling for race condition stale contexts
            has_stale_context = any("STALE_CONTEXT" in v for v in fact_violations)
            if has_stale_context and not is_shadow_or_dry_run:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "error": "STALE_CONTEXT",
                        "message": "Context signature expired. Re-assemble trusted context before proceeding.",
                        "violations": fact_violations,
                    },
                )

            antidrift_metrics.record_fact_check_failure(
                tenant_id=tenant_id,
                policy="GR-03" if any("GR-03" in v for v in fact_violations) else "FACT_CHECK",
                reason="; ".join(fact_violations),
            )
            # B2 & Audit 4.3: Only actual canary executions trigger canary auto-rollback
            if resolved_mode in (ExecutionMode.CANARY, "canary"):
                canary_router.record_canary_execution(tenant_id=tenant_id, is_hard_failure=True, execution_mode="canary")
            if not is_shadow_or_dry_run:
                has_discount_breach = any("GR-03" in v for v in fact_violations)
                if has_discount_breach:
                    if HardFailureRateLimiter.should_record_scenario(payload.session_id):
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
                        VCRScenarioGenerator.capture_incident_as_pending(
                            db=db,
                            trace_id=payload.trace_id,
                            source_policy="GR-03",
                            raw_trace=payload.model_dump(mode="json"),
                            error_summary="; ".join(fact_violations),
                        )
                        antidrift_metrics.record_auto_vcr_generated(cohort="03_financials", source_policy="GR-03")

            has_discount_breach = any("GR-03" in v for v in fact_violations)
            # 1.2: Enforce blocks immediately; Monitor logs and only blocks hard commercial breach
            if is_enforcing or has_discount_breach:
                if is_shadow_or_dry_run:
                    shadow_would_be_blocked = True
                elif has_discount_breach:
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
            else:
                logger.warning(
                    f"[TRUSTED_CONTEXT_MONITOR] Fact-check violations observed in monitor mode: {fact_violations}"
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

    if resolved_mode == ExecutionMode.DRY_RUN:
        trace = AgentTrace(
            trace_id=payload.trace_id,
            session_id=payload.session_id,
            tenant_id=tenant_id,
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            policy_version=payload.policy_version,
            channel=payload.channel,
            source_event_id=payload.source_event_id,
            execution_mode="dry_run",
            input_payload_sanitized={"client_message": client_message},
            raw_intent_json=payload.model_dump(mode="json"),
            guardrail_result_json=policy_result.model_dump(mode="json"),
            risk_score=payload.risk_score,
            confidence_score=payload.confidence_score,
            routing_decision="dry_run_simulator",
            created_at=now,
        )
        db.add(trace)
        db.commit()
        return {
            "status": "DRY_RUN",
            "trace_id": payload.trace_id,
            "expected_state_delta": payload.expected_state_delta,
            "validation": {
                "valid": policy_result.overall_verdict not in (DriftSeverity.HARD_FAILURE, DriftSeverity.REGRESSION),
                "verdict": policy_result.overall_verdict.value,
                "risk_score": payload.risk_score,
                "risk_level": risk_result.risk_level,
                "requires_hitl": policy_result.requires_hitl or risk_result.requires_hitl,
                "violations": [v.model_dump(mode="json") for v in policy_result.violations],
            },
        }

    if resolved_mode == ExecutionMode.SHADOW:
        would_be_blocked = shadow_would_be_blocked or (policy_result.overall_verdict in (DriftSeverity.HARD_FAILURE, DriftSeverity.REGRESSION))
        prod_trace = (
            db.query(AgentTrace)
            .filter(
                AgentTrace.source_event_id == payload.source_event_id,
                AgentTrace.execution_mode != "shadow",
                AgentTrace.tenant_id == tenant_id,
            )
            .first()
        )
        diff_metric = DiffEngine.compare_proposals(
            prod_proposal=prod_trace.raw_intent_json if prod_trace else None,
            shadow_proposal=payload,
            shadow_would_be_blocked=would_be_blocked,
        )
        antidrift_metrics.record_shadow_comparison(tenant_id, is_divergent=diff_metric.has_divergence)

        trace = AgentTrace(
            trace_id=payload.trace_id,
            session_id=payload.session_id,
            tenant_id=tenant_id,
            agent_id=payload.agent_id,
            harness_version=payload.harness_version,
            policy_version=payload.policy_version,
            channel=payload.channel,
            source_event_id=payload.source_event_id,
            execution_mode="shadow",
            input_payload_sanitized={"client_message": client_message},
            raw_intent_json=payload.model_dump(mode="json"),
            guardrail_result_json=policy_result.model_dump(mode="json"),
            risk_score=payload.risk_score,
            confidence_score=payload.confidence_score,
            routing_decision="shadow_comparator",
            error="Blocked by policy guardrails in shadow" if would_be_blocked else None,
            created_at=now,
        )
        db.add(trace)
        db.commit()

        return {
            "status": "SHADOW_EXECUTED",
            "trace_id": payload.trace_id,
            "execution_mode": "shadow",
            "would_be_blocked": would_be_blocked,
            "verdict": policy_result.overall_verdict.value,
            "shadow_diff_vs_prod": diff_metric.model_dump(),
        }

    # 4. Handle Hard Failure (Blocking policy breach)
    if policy_result.overall_verdict in (DriftSeverity.HARD_FAILURE, DriftSeverity.REGRESSION):
        # Create Incident if within rate limit
        if HardFailureRateLimiter.should_record_scenario(payload.session_id):
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
            source_rule = policy_result.violations[0].rule_id if policy_result.violations else "HARD_FAILURE"
            VCRScenarioGenerator.capture_incident_as_pending(
                db=db,
                trace_id=payload.trace_id,
                source_policy=source_rule,
                raw_trace=payload.model_dump(mode="json"),
                error_summary="; ".join(v.message for v in policy_result.violations),
            )
            cohort = VCRScenarioGenerator.map_policy_to_cohort(source_rule)
            antidrift_metrics.record_auto_vcr_generated(cohort=cohort, source_policy=source_rule)
            if resolved_mode in (ExecutionMode.CANARY, "canary"):
                canary_router.record_canary_execution(tenant_id=tenant_id, is_hard_failure=True, execution_mode="canary")

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

        # B2 Fix: Deduplicate HITL Telegram card dispatch (1 active card per session)
        active_pending_card = (
            db.query(HITLApproval)
            .join(AgentIntent, AgentIntent.intent_id == HITLApproval.intent_id)
            .filter(
                HITLApproval.tenant_id == tenant_id,
                AgentIntent.session_id == payload.session_id,
                HITLApproval.status == "PENDING",
                HITLApproval.approval_id != str(approval.approval_id),
            )
            .first()
        )

        # Opt-In Guard: Do NOT dispatch Telegram cards if disabled in tenant settings (Silent by default)
        tenant_cfg = TenantPolicyRegistry.get_config(tenant_id, db=db)
        if not tenant_cfg.enable_telegram_notifications:
            logger.info(
                f"[HITL_TELEGRAM_SUPPRESSED] Tenant '{tenant_id}' has Telegram alerts disabled in settings. "
                f"Approval card '{approval.approval_id}' registered in web LK queue only."
            )
        else:
            if not active_pending_card:
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
            else:
                logger.info(
                    f"[HITL_DEDUPLICATED] Session '{payload.session_id}' already has active approval card "
                    f"'{active_pending_card.approval_id}'. Suppressed duplicate Telegram dispatch."
                )

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
        execution_mode=resolved_mode.value if isinstance(resolved_mode, ExecutionMode) else (resolved_mode or "prod"),
        context_hash=getattr(payload, "context_hash", None),
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

    # 6. Approved Path: Check Tenant Autonomy Level (Passive Read-Only by Default)
    tenant_cfg = TenantPolicyRegistry.get_config(tenant_id, db=db)
    is_crm_mutation_allowed = tenant_cfg.allow_crm_mutations
    is_client_comm_allowed = tenant_cfg.allow_client_communication

    if not is_crm_mutation_allowed:
        logger.info(
            f"[PASSIVE_ADVISOR_MODE] Tenant '{tenant_id}' has CRM mutations disabled (allow_crm_mutations=False). "
            f"Actions for trace '{payload.trace_id}' saved as recommendations only without touching CRM."
        )
        for action in payload.proposed_actions:
            if policy_result.action_decisions.get(action.action_id) == "BLOCK":
                continue
            executed_actions.append({
                "action_id": action.action_id,
                "status": "RECOMMENDED_ONLY",
                "target_type": action.target_type,
                "target_id": action.target_id,
                "payload": action.payload,
                "notice": "CRM mutation skipped: tenant is in Passive Read-Only mode. Enable 'allow_crm_mutations' in Settings to execute.",
            })
        db.commit()
        return {
            "status": "RECOMMENDED_ONLY",
            "trace_id": payload.trace_id,
            "execution_mode": "passive_advisor",
            "intent": payload.intent,
            "actions_executed": executed_actions,
            "approved_client_reply": (
                payload.proposed_client_reply.text
                if (payload.proposed_client_reply and is_client_comm_allowed)
                else None
            ),
            "client_reply_draft": (
                payload.proposed_client_reply.text
                if (payload.proposed_client_reply and not is_client_comm_allowed)
                else None
            ),
        }

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
            execution_mode=resolved_mode.value if isinstance(resolved_mode, ExecutionMode) else resolved_mode,
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

    if resolved_mode in (ExecutionMode.CANARY, "canary"):
        canary_router.record_canary_execution(tenant_id=tenant_id, is_hard_failure=False, execution_mode="canary")
    return {
        "status": "EXECUTED",
        "trace_id": payload.trace_id,
        "execution_mode": resolved_mode.value if isinstance(resolved_mode, ExecutionMode) else (resolved_mode or "prod"),
        "intent": payload.intent,
        "actions_executed": executed_actions,
        "approved_client_reply": (
            payload.proposed_client_reply.text
            if (payload.proposed_client_reply and is_client_comm_allowed)
            else None
        ),
        "client_reply_draft": (
            payload.proposed_client_reply.text
            if (payload.proposed_client_reply and not is_client_comm_allowed)
            else None
        ),
    }


@router.get("/approvals")
def list_pending_approvals(
    tenant_id: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    clean_tenant = tenant_id.strip()
    if current_user.role not in (UserRole.ADMIN, UserRole.CEO):
        if current_user.tenant_id not in ("*", clean_tenant):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-tenant access forbidden")
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
    request: Request = None,  # type: ignore[assignment]
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
):
    """Processes ROP or engineer decision on a pending approval with strict identity verification."""
    clean_tenant = tenant_id.strip()
    approval = (
        db.query(HITLApproval)
        .filter(
            HITLApproval.approval_id == approval_id,
            HITLApproval.tenant_id == clean_tenant,
        )
        .first()
    )
    if not approval:
        raise HTTPException(status_code=404, detail="Approval request not found")

    if approval.status != "PENDING":
        raise HTTPException(status_code=400, detail=f"Approval already decided with status: {approval.status}")

    now = datetime.now(timezone.utc)

    # Audit 1.3: TTL Guard (15 min) + safe fallback
    if approval.expires_at:
        exp = approval.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if now > exp:
            setattr(approval, "status", "EXPIRED")
            setattr(approval, "decision", "EXPIRED")
            setattr(approval, "decided_at", now)
            db.commit()
            return {
                "status": "EXPIRED",
                "approval_id": approval.approval_id,
                "fallback_action": "TRANSFER_TO_DUTY_MANAGER",
                "message": "Approval card expired (TTL 15m). Lead safely transferred to duty manager.",
            }

    # Audit 1.3: Role Matrix Guard (ROP / Head of Sales vs regular manager)
    ALLOWED_APPROVER_ROLES = frozenset({
        "ROP", "HEAD_OF_SALES", "SALES_DIRECTOR", "ADMIN", "SUPERADMIN", "DIRECTOR", "CEO", "ENGINEER",
        "📋 РОП", "👑 CEO", "⚙️ ADMIN"
    })
    role_norm = str(payload.approver_role or "").strip().upper()
    if role_norm not in ALLOWED_APPROVER_ROLES and not any(r in role_norm for r in ["ROP", "РОП", "CEO", "ADMIN", "DIRECTOR", "HEAD_OF_SALES", "ENGINEER"]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "INSUFFICIENT_PERMISSIONS",
                "message": f"Role '{payload.approver_role}' is not authorized to decide HITL approvals. Required: ROP or Head of Sales.",
            },
        )

    # Step 1: Cryptographic or Session Authentication
    approver_id: str = str(payload.approver_id or "")
    approver_role: str = str(payload.approver_role or "rop")

    if payload.signature:
        from packages.antidrift.hitl.telegram_notifier import verify_hitl_signature
        action_verb = payload.decision.lower()
        if not verify_hitl_signature(action_verb, approval_id, payload.signature):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"error": "INVALID_SIGNATURE", "message": "Invalid HMAC signature for HITL callback action"},
            )
        approver_id = payload.approver_id or "telegram_rop"
        approver_role = "ROP"
    else:
        # Web LK or API call must be authenticated via JWT or admin key
        caller_user = None
        try:
            caller_user = get_current_user_or_admin(request, credentials, db)
        except Exception:
            caller_user = None

        if not caller_user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required to decide HITL approval (Bearer token or valid HMAC signature)",
            )

        if caller_user.role in (UserRole.ADMIN, UserRole.CEO):
            approver_id = str(payload.approver_id or caller_user.id)
            approver_role = str(payload.approver_role or caller_user.role.value)
        else:
            if caller_user.tenant_id not in ("*", clean_tenant):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cross-tenant HITL decision forbidden")
            user_role_str = str(caller_user.role.value if hasattr(caller_user.role, "value") else caller_user.role).strip().upper()
            if user_role_str not in ALLOWED_APPROVER_ROLES and not any(r in user_role_str for r in ["ROP", "РОП", "CEO", "ADMIN", "DIRECTOR", "HEAD_OF_SALES", "ENGINEER"]):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "error": "INSUFFICIENT_PERMISSIONS",
                        "message": f"Caller role '{caller_user.role}' is not authorized to decide HITL approvals.",
                    },
                )
            approver_id = str(caller_user.id)
            approver_role = str(caller_user.role.value)

    # X4 Execution path: If decision is APPROVE and mutations are enabled, execute them
    executed_actions = []
    if payload.decision == "APPROVE":
        intent_record = db.query(AgentIntent).filter(AgentIntent.intent_id == approval.intent_id).first()
        if intent_record and intent_record.payload_json:
            raw_intent = intent_record.payload_json
            tenant_cfg = TenantPolicyRegistry.get_config(clean_tenant, db=db)
            is_mutation_allowed = tenant_cfg.allow_crm_mutations
            from packages.antidrift.contracts.intent import ActionItem
            for act_dict in raw_intent.get("proposed_actions", []):
                try:
                    action_item = ActionItem(**act_dict)
                    if is_mutation_allowed:
                        execution = CRMExecutionGateway.execute_action(
                            db=db,
                            action=action_item,
                            intent_id=str(intent_record.intent_id),
                            trace_id=str(approval.trace_id),
                            tenant_id=clean_tenant,
                            agent_id=str(approval.agent_id),
                            harness_version=str(approval.harness_version),
                            idempotency_key=f"hitl_{approval_id}_{action_item.action_id}",
                        )
                        executed_actions.append({"action_id": action_item.action_id, "status": execution.status})
                    else:
                        executed_actions.append({"action_id": action_item.action_id, "status": "RECOMMENDED_ONLY"})
                except Exception as exc:
                    logger.error(f"Error executing approved action: {exc}")
            setattr(intent_record, "policy_status", "APPROVED_EXECUTED")

    setattr(approval, "status", "APPROVED" if payload.decision == "APPROVE" else "REJECTED")
    setattr(approval, "approver_id", approver_id)
    setattr(approval, "approver_role", approver_role)
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
        "executed_actions": executed_actions,
    }


@router.post("/rollback")
def emergency_rollback(
    payload: RollbackRequest,
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    """Rolls back an agent harness to its previous verified version."""
    if current_user.role not in (UserRole.ADMIN, UserRole.CEO, UserRole.ROP):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions for rollback")

    active_harness = (
        db.query(HarnessRegistry)
        .filter(HarnessRegistry.agent_id == payload.agent_id, HarnessRegistry.status == "ACTIVE")
        .first()
    )

    target_ver = payload.target_version or (active_harness.rollback_version if active_harness else None)
    if not target_ver:
        raise HTTPException(status_code=400, detail="No target rollback version found or specified")

    target_harness = (
        db.query(HarnessRegistry)
        .filter(HarnessRegistry.agent_id == payload.agent_id, HarnessRegistry.version == target_ver)
        .first()
    )
    if not target_harness:
        raise HTTPException(status_code=404, detail=f"Target rollback version '{target_ver}' not found in registry")

    if active_harness:
        setattr(active_harness, "status", "ROLLED_BACK")
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
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.CEO, UserRole.ROP):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions for kill-switch")
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


@router.get("/shadow/diff/{harness_version}")
def get_shadow_diff_report(
    harness_version: str,
    lookback_limit: int = Query(100, ge=1, le=500),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Returns aggregated behavioral diff between shadow candidate traces
    and production traces for the specified harness_version.
    Returns 404 if harness_version is completely unknown.
    """
    registry_exists = (
        db.query(HarnessRegistry)
        .filter(HarnessRegistry.version == harness_version)
        .first()
    )
    has_traces = (
        db.query(AgentTrace)
        .filter(AgentTrace.harness_version == harness_version)
        .first()
    )
    if not registry_exists and not has_traces:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Harness version '{harness_version}' not found in registry or execution traces",
        )

    report = DiffEngine.compare_shadow_vs_prod_traces(
        db=db,
        harness_version=harness_version,
        lookback_limit=lookback_limit,
        tenant_id=tenant_id,
    )
    return report


class ReviewVCRScenarioRequest(BaseModel):
    scenario_id: str
    decision: Literal["APPROVE", "REJECT"]


@router.get("/vcr/pending")
def list_pending_vcr_scenarios(
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    """Returns candidate test scenarios captured from production HARD_FAILURE incidents."""
    items = (
        db.query(PendingVCRScenario)
        .filter(PendingVCRScenario.status == "PENDING")
        .order_by(PendingVCRScenario.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": sc.id,
            "trace_id": sc.trace_id,
            "source_policy": sc.source_policy,
            "cohort": sc.cohort,
            "status": sc.status,
            "error_summary": sc.error_summary,
            "created_at": sc.created_at.isoformat() if sc.created_at else None,
            "pii_sanitized_trace": sc.pii_sanitized_trace,
        }
        for sc in items
    ]


@router.post("/vcr/generate/{scenario_id}")
def generate_vcr_test_endpoint(
    scenario_id: str,
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    """Converts a pending scenario into Golden Set test and VCR cassette files."""
    try:
        result = VCRScenarioGenerator.generate_test_artifacts(db, scenario_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.post("/vcr/review")
def review_vcr_scenario_endpoint(
    req: ReviewVCRScenarioRequest,
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    """Processes ROP approval or rejection of an auto-generated test scenario."""
    try:
        result = VCRScenarioGenerator.review_pending_scenario(db, req.scenario_id, req.decision)
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/vcr/stats")
def get_vcr_stats_endpoint(
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    """Returns aggregated metrics on auto-captured tests for /golden_stats."""
    return VCRScenarioGenerator.get_golden_stats(db)


class CanaryConfigureRequest(BaseModel):
    weight_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    reset_rollback: bool = False
    divergence_threshold_pct: Optional[float] = Field(None, ge=0.0, le=100.0)
    enabled: Optional[bool] = None
    tenant_id: Optional[str] = None


@router.get("/metrics")
def get_antidrift_metrics_endpoint(request: Request):
    """
    Prometheus exposition metrics for Zero-Trust Fabric scrapers.
    Protected endpoint with INTERNAL_METRICS_TOKEN, admin key, or internal network auth.
    """
    token = os.getenv("INTERNAL_METRICS_TOKEN")
    if token:
        auth_hdr = request.headers.get("Authorization", "")
        token_hdr = request.headers.get("X-Internal-Token", "")
        if auth_hdr != f"Bearer {token}" and token_hdr != token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized metrics scraper",
            )
    else:
        admin_key = (
            request.headers.get("x-admin-key")
            or request.headers.get("x-revops-admin-key")
            or request.headers.get("x-revops-secret")
        )
        revops_admin_key = os.getenv("REVOPS_ADMIN_KEY")
        is_admin = bool(admin_key and revops_admin_key and secrets.compare_digest(admin_key, revops_admin_key))
        is_internal = bool(request.client and request.client.host in ("127.0.0.1", "localhost", "testclient"))
        if not is_admin and not is_internal and os.getenv("TESTING") != "true":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized metrics scraper (token or admin key required)",
            )

    from fastapi.responses import Response
    return Response(content=antidrift_metrics.to_prometheus_format(), media_type="text/plain; version=0.0.4")


@router.get("/canary/status")
def get_canary_status_endpoint(
    tenant_id: Optional[str] = Query(None, description="Optional tenant filter"),
):
    """Returns the current status of the Canary Traffic Router & Auto-Rollback circuit breaker."""
    return canary_router.get_status(tenant_id=tenant_id)


@router.post("/canary/configure")
def configure_canary_endpoint(
    req: CanaryConfigureRequest,
    current_user: User = Depends(get_current_user_or_admin),
):
    if current_user.role not in (UserRole.ADMIN, UserRole.CEO):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only ADMIN or CEO can configure canary parameters")
    """Dynamically adjusts canary traffic weight (0-100%) or resets tripped rollback state."""
    return canary_router.configure(
        weight_pct=req.weight_pct,
        reset_rollback=req.reset_rollback,
        divergence_threshold_pct=req.divergence_threshold_pct,
        enabled=req.enabled,
        tenant_id=req.tenant_id,
    )




class ResolveRoutingRequest(BaseModel):
    tenant_id: str = Field(..., min_length=1)
    agent_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)
    channel: Optional[str] = "api"


class ResolveRoutingResponse(BaseModel):
    tenant_id: str
    agent_id: str
    session_id: str
    execution_mode: str
    harness_version: str
    model_name: str
    temperature: float
    system_prompt_hash: str
    tools_schema_hash: str
    policy_version: str
    is_canary: bool


@router.post("/routing/resolve", response_model=ResolveRoutingResponse)
def resolve_agent_routing(
    req: ResolveRoutingRequest,
    db: Session = Depends(get_db),
):
    """
    Pre-execution traffic router (Audit 4.2).
    Determines harness version and LLM configuration BEFORE model invocation,
    enabling authentic canary deployments and immediate rollback.
    """
    prod_harness = (
        db.query(HarnessRegistry)
        .filter(
            HarnessRegistry.agent_id == req.agent_id,
            HarnessRegistry.status.in_(["ACTIVE", "PROD", "CANARY_ELIGIBLE"]),
        )
        .order_by(HarnessRegistry.created_at.desc())
        .first()
    )
    if not prod_harness:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": "NO_ACTIVE_HARNESS",
                "message": f"No active production harness found for agent '{req.agent_id}'",
            },
        )

    canary_harness = (
        db.query(HarnessRegistry)
        .filter(
            HarnessRegistry.agent_id == req.agent_id,
            HarnessRegistry.status == "CANARY_RUNNING",
        )
        .order_by(HarnessRegistry.created_at.desc())
        .first()
    )

    if not canary_harness:
        return ResolveRoutingResponse(
            tenant_id=req.tenant_id,
            agent_id=req.agent_id,
            session_id=req.session_id,
            execution_mode="prod",
            harness_version=str(prod_harness.version),
            model_name=str(prod_harness.model_name),
            temperature=float(prod_harness.temperature),
            system_prompt_hash=str(prod_harness.system_prompt_hash),
            tools_schema_hash=str(prod_harness.tools_schema_hash),
            policy_version=str(prod_harness.policy_version),
            is_canary=False,
        )

    mode = canary_router.decide_execution_mode(
        tenant_id=req.tenant_id,
        session_id=req.session_id,
    )

    chosen = canary_harness if mode == "canary" else prod_harness
    return ResolveRoutingResponse(
        tenant_id=req.tenant_id,
        agent_id=req.agent_id,
        session_id=req.session_id,
        execution_mode=mode,
        harness_version=str(chosen.version),
        model_name=str(chosen.model_name),
        temperature=float(chosen.temperature),
        system_prompt_hash=str(chosen.system_prompt_hash),
        tools_schema_hash=str(chosen.tools_schema_hash),
        policy_version=str(chosen.policy_version),
        is_canary=(mode == "canary"),
    )


@router.get("/policy/recommendations")
def get_policy_tuning_recommendations_endpoint(
    tenant_id: Optional[str] = Query(None, description="Optional tenant filter"),
    min_samples: int = Query(3, ge=1, le=50),
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    """Returns data-driven Guardrail tuning recommendations derived from HITL approvals."""
    recs = PolicyAutoTuner.analyze_tuning_opportunities(
        db=db,
        tenant_id=tenant_id,
        min_samples=min_samples,
    )
    return [rec.model_dump() for rec in recs]
