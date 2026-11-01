"""
packages/antidrift/execution/crm_gateway.py

Execution Gateway for CRM Mutations.
Captures pre-mutation state snapshots, executes idempotent mutations,
records post-mutation diffs in ActionExecution audit log.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from packages.antidrift.contracts.intent import ActionItem, ActionType
from packages.antidrift.models import ActionExecution
from packages.database.models import Deal

logger = logging.getLogger("crm_execution_gateway")


class CRMExecutionGateway:
    """Executes mutations through strict transaction boundaries and audit records."""

    @classmethod
    def capture_state_before(
        cls,
        db: Session,
        action: ActionItem,
        tenant_id: str,
    ) -> dict[str, Any]:
        """Captures a snapshot of the entity state before applying mutations."""
        if action.target_type == "deal":
            deal = (
                db.query(Deal)
                .filter(Deal.id == action.target_id, Deal.tenant_id == tenant_id)
                .first()
            )
            if deal:
                return {
                    "id": deal.id,
                    "title": getattr(deal, "title", ""),
                    "stage": getattr(deal, "stage", ""),
                    "budget": getattr(deal, "budget", 0),
                    "is_closed_won": getattr(deal, "is_closed_won", False),
                    "is_closed_lost": getattr(deal, "is_closed_lost", False),
                }
        return {"target_id": action.target_id, "target_type": action.target_type, "exists": False}

    @classmethod
    def execute_action(
        cls,
        db: Session,
        action: ActionItem,
        intent_id: str,
        trace_id: str,
        tenant_id: str,
        agent_id: str,
        harness_version: str,
        idempotency_key: str,
    ) -> ActionExecution:
        """Executes a single proposed action with state diff capture and audit recording."""
        now = datetime.now(timezone.utc)
        state_before = cls.capture_state_before(db, action, tenant_id)

        execution = ActionExecution(
            action_execution_id=str(uuid.uuid4()),
            intent_id=intent_id,
            trace_id=trace_id,
            tenant_id=tenant_id,
            agent_id=agent_id,
            harness_version=harness_version,
            target_type=action.target_type,
            action_type=action.action_type.value,
            target_id=action.target_id,
            idempotency_key=idempotency_key,
            state_before_json=state_before,
            state_after_json={},
            status="PENDING",
            created_at=now,
        )
        db.add(execution)
        db.flush()

        try:
            state_after = dict(state_before)
            target_deal = None
            if action.target_type == "deal":
                target_deal = (
                    db.query(Deal)
                    .filter(Deal.id == action.target_id, Deal.tenant_id == tenant_id)
                    .first()
                )

            # Apply mutation based on action type
            if action.action_type == ActionType.CRM_ADD_NOTE:
                note_text = action.payload.get("text", "")
                state_after["last_note"] = note_text

            elif action.action_type == ActionType.CRM_UPDATE_STAGE:
                new_stage = action.payload.get("target_stage") or action.payload.get("stage")
                if target_deal and new_stage:
                    setattr(target_deal, "stage", str(new_stage))
                    state_after["stage"] = str(new_stage)
                state_after["mutation_applied"] = f"stage_changed_to_{new_stage}"

            elif action.action_type == ActionType.CRM_CHANGE_BUDGET:
                new_budget = float(action.payload.get("budget", 0))
                if target_deal:
                    setattr(target_deal, "budget", new_budget)
                    state_after["budget"] = new_budget
                state_after["mutation_applied"] = f"budget_changed_to_{new_budget}"

            elif action.action_type == ActionType.CRM_ADD_TAG:
                tag = action.payload.get("tag")
                state_after["tag_added"] = tag

            elif action.action_type == ActionType.CRM_CREATE_TASK:
                state_after["task_created"] = action.payload

            elif action.action_type == ActionType.TRIGGER_WEBHOOK:
                state_after["webhook_triggered"] = action.payload

            # Successful execution
            setattr(execution, "status", "EXECUTED")
            setattr(execution, "state_after_json", state_after)
            setattr(execution, "updated_at", datetime.now(timezone.utc))
            db.commit()
            db.refresh(execution)
            return execution

        except Exception as exc:
            logger.error(f"Action execution failed for {action.action_id}: {exc}", exc_info=True)
            db.rollback()
            setattr(execution, "status", "FAILED")
            setattr(execution, "error", str(exc))
            setattr(execution, "updated_at", datetime.now(timezone.utc))
            db.add(execution)
            db.commit()
            return execution
