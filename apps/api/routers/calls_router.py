"""
Calls Router: Speech AI Auditing, 13 Evaluation Criteria, and Reverse ETL note generation.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from packages.analytics_engine.speech_scoring import evaluate_speech_scorecard
from packages.database.models import CallRecording, Deal, User
from packages.database.session import get_db
from ..auth import get_current_user
from ..schemas import SpeechEvaluationRequest

router = APIRouter(prefix="/calls", tags=["Speech AI & 13 Criteria Scorecard"])


@router.post("/evaluate")
def evaluate_call(
    req: SpeechEvaluationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Evaluates a sales call across the 13 criteria, calculates overall score (0-100),
    detects deal risk, and saves record to tenant database.
    """
    eval_result = evaluate_speech_scorecard(req.scores, req.comments)

    call = CallRecording(
        tenant_id=current_user.tenant_id,
        deal_id=req.deal_id,
        manager_id=current_user.id,
        client_phone=req.client_phone,
        duration_seconds=req.duration_seconds,
        overall_score=eval_result.overall_score,
        status="completed",
        scorecard_criteria=eval_result.detailed_scores,
        ai_summary=eval_result.risk_summary,
        reverse_etl_synced=False,
    )
    db.add(call)

    # If linked to a deal, update deal's risk status and average score
    if req.deal_id:
        deal = db.query(Deal).filter(Deal.id == req.deal_id, Deal.tenant_id == current_user.tenant_id).first()
        if deal:
            deal.avg_call_score = eval_result.overall_score
            if eval_result.is_deal_at_risk:
                deal.is_at_risk = True
                deal.risk_reason = eval_result.risk_summary
    
    db.commit()
    db.refresh(call)

    return {
        "call_id": call.id,
        "overall_score": eval_result.overall_score,
        "is_deal_at_risk": eval_result.is_deal_at_risk,
        "risk_summary": eval_result.risk_summary,
        "passed_criteria_count": eval_result.passed_criteria_count,
        "failed_criteria_count": eval_result.failed_criteria_count,
        "crm_note_text": eval_result.crm_note_text,
        "detailed_scores": eval_result.detailed_scores,
    }


@router.get("/")
def list_calls(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Lists recent analyzed calls for the tenant."""
    calls = db.query(CallRecording).filter(CallRecording.tenant_id == current_user.tenant_id).order_by(CallRecording.created_at.desc()).limit(50).all()
    return [
        {
            "id": c.id,
            "client_phone": c.client_phone,
            "duration_seconds": c.duration_seconds,
            "overall_score": c.overall_score,
            "status": c.status,
            "ai_summary": c.ai_summary,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in calls
    ]
