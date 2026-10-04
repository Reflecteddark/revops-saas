"""
Simulator Router: Monte Carlo 95% Revenue Sandbox and What-If Scenarios.
"""

from fastapi import APIRouter, Depends
from packages.analytics_engine.monte_carlo import run_monte_carlo_simulation, SimulationConfig
from packages.database.models import User, UserRole
from ..auth import require_roles
from ..schemas import MonteCarloRequest

router = APIRouter(prefix="/simulator", tags=["Revenue Simulator & Monte Carlo 95%"])


@router.post("/run-monte-carlo")
def run_simulation(
    req: MonteCarloRequest,
    current_user: User = Depends(require_roles(UserRole.CEO, UserRole.CFO, UserRole.ROP, UserRole.ADMIN))
):
    """
    Executes 10,000 Monte Carlo iterations for pipeline forecasting.
    Returns P10, P50, P90 corridors, target achievement probability, and distribution histogram.
    """
    config = SimulationConfig(
        leads_mean=req.leads_mean,
        leads_std=req.leads_std,
        conv_qual_pct=req.conv_qual_pct,
        conv_meeting_pct=req.conv_meeting_pct,
        conv_close_pct=req.conv_close_pct,
        avg_ticket_rub=req.avg_ticket_rub,
        ticket_std_rub=req.ticket_std_rub,
        target_revenue_rub=req.target_revenue_rub,
        iterations=req.iterations,
    )
    result = run_monte_carlo_simulation(config)
    return result
