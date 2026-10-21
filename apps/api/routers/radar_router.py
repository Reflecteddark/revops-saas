"""
Radar Router: Пульт РОПа «15 минут в день» и оперативный радар рисков.
Displays pipeline health, SLA breaches, and allows intercepting stalled deals.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from packages.database.models import Deal, User, UserRole, DealStage
from packages.database.session import get_db
from ..auth import get_current_user, require_roles

router = APIRouter(prefix="/radar", tags=["Operational Risk Radar & Cockpit РОПа"])


@router.get("/cockpit")
def get_rop_cockpit(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    workspace_id: Optional[str] = None
):
    """
    Returns 15-minute daily control metrics:
    - Deals without next step (Сделки без следующего шага)
    - Deals exceeding stage SLA (Зависшие сделки)
    - Deals with dropping AI call scores
    """
    query = db.query(Deal).filter(Deal.tenant_id == current_user.tenant_id)
    
    if workspace_id:
        query = query.filter(Deal.workspace_id == workspace_id)

    # Row-level filter for KAM/SDR
    if current_user.role in {UserRole.KAM, UserRole.SDR}:
        query = query.filter(Deal.assigned_user_id == current_user.id)

    all_deals = query.all()

    deals_no_next_step = [d for d in all_deals if not d.has_next_step and d.stage not in {DealStage.WON, DealStage.LOST}]
    deals_sla_breach = [d for d in all_deals if d.days_in_stage > d.stage_sla_days and d.stage not in {DealStage.WON, DealStage.LOST}]
    deals_high_risk = [d for d in all_deals if d.is_at_risk and d.stage not in {DealStage.WON, DealStage.LOST}]

    total_pipeline_value = sum(d.budget for d in all_deals if d.stage not in {DealStage.WON, DealStage.LOST})
    at_risk_value = sum(d.budget for d in set(deals_no_next_step + deals_sla_breach + deals_high_risk))

    return {
        "total_active_deals_count": len([d for d in all_deals if d.stage not in {DealStage.WON, DealStage.LOST}]),
        "total_pipeline_value_rub": round(total_pipeline_value, 2),
        "at_risk_value_rub": round(at_risk_value, 2),
        "risk_ratio_pct": round((at_risk_value / (total_pipeline_value + 1e-6)) * 100.0, 1),
        "issues": {
            "deals_without_next_step": [
                {
                    "id": d.id,
                    "title": d.title,
                    "budget": d.budget,
                    "stage": d.stage.value,
                    "assigned_user_id": d.assigned_user_id,
                    "days_in_stage": d.days_in_stage,
                }
                for d in deals_no_next_step[:25]
            ],
            "deals_sla_breached": [
                {
                    "id": d.id,
                    "title": d.title,
                    "budget": d.budget,
                    "stage": d.stage.value,
                    "days_in_stage": d.days_in_stage,
                    "sla_days": d.stage_sla_days,
                }
                for d in deals_sla_breach[:25]
            ],
            "deals_high_risk": [
                {
                    "id": d.id,
                    "title": d.title,
                    "budget": d.budget,
                    "stage": d.stage.value,
                    "risk_reason": d.risk_reason,
                }
                for d in deals_high_risk[:25]
            ]
        }
    }


@router.post("/deals/{deal_id}/fix-next-step")
def fix_next_step(
    deal_id: str,
    next_step_date_iso: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Quickly resolves missing next step for a deal."""
    deal = db.query(Deal).filter(Deal.id == deal_id, Deal.tenant_id == current_user.tenant_id).first()
    if not deal:
        raise HTTPException(status_code=404, detail="Сделка не найдена")

    setattr(deal, "has_next_step", True)
    setattr(deal, "risk_reason", None)
    setattr(deal, "is_at_risk", False)
    db.commit()

    return {"status": "success", "message": "Следующий шаг зафиксирован, риск снят."}
