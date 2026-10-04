"""
Diagnostics Router: 7 Deadly Sins of Sales and 3-Number Express Calculator.
"""

from fastapi import APIRouter, Depends
from packages.analytics_engine.seven_sins import calculate_seven_sins
from packages.analytics_engine.express_calc import calculate_express_diagnostic
from packages.database.models import User, UserRole
from ..auth import get_current_user, require_roles
from ..schemas import SevenSinsRequest, ExpressCalcRequest

router = APIRouter(prefix="/diagnostics", tags=["Diagnostics & Lost Profit Audit"])


@router.post("/seven-sins")
def run_seven_sins_audit(
    req: SevenSinsRequest,
    current_user: User = Depends(require_roles(UserRole.CEO, UserRole.ROP, UserRole.ADMIN, UserRole.CFO, UserRole.CMO))
):
    """
    Executes deep 7-bottleneck audit and returns lost profit in rubles (₽),
    severity metrics, and actionable recommendations.
    """
    result = calculate_seven_sins(
        monthly_leads=req.monthly_leads,
        avg_ticket_rub=req.avg_ticket_rub,
        current_conversion_pct=req.current_conversion_pct,
        avg_first_response_min=req.avg_first_response_min,
        deals_without_next_step_pct=req.deals_without_next_step_pct,
        stalled_deals_pct=req.stalled_deals_pct,
        unworked_lost_deals_pct=req.unworked_lost_deals_pct,
        objection_drop_pct=req.objection_drop_pct,
        script_breach_pct=req.script_breach_pct,
        rep_load_variance_pct=req.rep_load_variance_pct,
    )
    return result


@router.post("/express-calculator")
def run_express_calculator(
    req: ExpressCalcRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Computes 30-second express diagnostics based on leads, ticket size, and conversion.
    """
    result = calculate_express_diagnostic(
        monthly_leads=req.monthly_leads,
        avg_ticket_rub=req.avg_ticket_rub,
        current_close_rate_pct=req.current_close_rate_pct,
        expected_conversion_uplift_pct=req.expected_conversion_uplift_pct,
    )
    return result
