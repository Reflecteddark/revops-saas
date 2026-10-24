"""
Simulator Router: Monte Carlo 95% Revenue Sandbox and What-If Scenarios.
Endpoints:
- POST /api/v1/simulator/run-monte-carlo: Run 10,000 iterations
- GET /api/v1/simulator/results/{id}: Retrieve cached simulation result by ID
"""

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from packages.analytics_engine.monte_carlo import (
    SimulationConfig,
    run_monte_carlo_simulation,
)

from ..schemas import MonteCarloRequest

router = APIRouter(prefix="/simulator", tags=["Revenue Simulator & Monte Carlo 95%"])

# In-memory LRU simulation result store for fast retrieval / Redis fallback
SIMULATION_CACHE: dict[str, dict[str, Any]] = {}


@router.post("/run-monte-carlo")
def run_simulation(req: MonteCarloRequest):
    """
    Executes 10,000 Monte Carlo iterations for pipeline forecasting.
    Returns P10, P50, P90 corridors, target achievement probability, and distribution histogram.
    """
    leads = req.leads if req.leads is not None else (req.leads_mean or 300.0)
    
    # Handle rates that might be passed as decimals (0.45) or percentages (45.0)
    if req.qual_rate is not None:
        qual_pct = req.qual_rate * 100.0 if req.qual_rate <= 1.0 else req.qual_rate
    else:
        qual_pct = req.conv_qual_pct if req.conv_qual_pct is not None else 48.0

    if req.close_rate is not None:
        close_pct = req.close_rate * 100.0 if req.close_rate <= 1.0 else req.close_rate
    else:
        close_pct = req.conv_close_pct if req.conv_close_pct is not None else 25.0

    avg_ticket = req.avg_ticket if req.avg_ticket is not None else (req.avg_ticket_rub or 0.0)
    if avg_ticket <= 0:
        return {"error": "Укажите средний чек сделки для симуляции", "success": False}

    config = SimulationConfig(
        leads_mean=leads,
        leads_std=req.leads_std,
        conv_qual_pct=qual_pct,
        conv_meeting_pct=req.conv_meeting_pct,
        conv_close_pct=close_pct,
        avg_ticket_rub=avg_ticket,
        ticket_std_rub=req.ticket_std_rub,
        target_revenue_rub=req.target_revenue_rub,
        iterations=req.iterations,
    )
    result = run_monte_carlo_simulation(config)
    sim_id = f"sim_{uuid.uuid4().hex[:12]}"
    
    # Enrich with spec-matching keys
    result["id"] = sim_id
    result["simulation_id"] = sim_id
    result["p10"] = result.get("p10_conservative_revenue")
    result["p50"] = result.get("median_revenue_p50")
    result["p90"] = result.get("p90_optimistic_revenue")
    if "histogram_bins" not in result or not result["histogram_bins"]:
        result["histogram_bins"] = result.get("histogram", [])

    SIMULATION_CACHE[sim_id] = result
    return result


@router.get("/results/{sim_id}")
def get_simulation_result(sim_id: str):
    """Retrieves previous simulation result by ID."""
    if sim_id in SIMULATION_CACHE:
        return SIMULATION_CACHE[sim_id]
    raise HTTPException(status_code=404, detail=f"Симуляция с ID {sim_id} не найдена")
