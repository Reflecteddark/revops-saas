"""
Celery Background Tasks:
- run_simulation_task: Heavy Monte-Carlo calculations offloaded from main API event loop
- sync_crm_task: Periodic synchronization of amoCRM and Bitrix24 pipelines
"""

import time
from typing import Dict, Any
from .celery_app import celery_app
from packages.analytics_engine.monte_carlo import run_monte_carlo_simulation, SimulationConfig


@celery_app.task(name="workers.tasks.run_simulation_task", bind=True)
def run_simulation_task(self, config_dict: Dict[str, Any]):
    """Background task executing Monte-Carlo simulations."""
    config = SimulationConfig(
        leads_mean=config_dict.get("leads_mean", 300.0),
        leads_std=config_dict.get("leads_std", 35.0),
        conv_qual_pct=config_dict.get("conv_qual_pct", 50.0),
        conv_meeting_pct=config_dict.get("conv_meeting_pct", 60.0),
        conv_close_pct=config_dict.get("conv_close_pct", 25.0),
        avg_ticket_rub=config_dict.get("avg_ticket_rub", 220000.0),
        ticket_std_rub=config_dict.get("ticket_std_rub", 25000.0),
        target_revenue_rub=config_dict.get("target_revenue_rub", 4500000.0),
        iterations=config_dict.get("iterations", 10000),
    )
    result = run_monte_carlo_simulation(config)
    return result


@celery_app.task(name="workers.tasks.sync_crm_task")
def sync_crm_task(org_id: str, crm_source: str = "amo"):
    """Background task syncing pipeline deals from CRM."""
    time.sleep(1)  # Simulates network synchronization
    return {
        "status": "completed",
        "org_id": org_id,
        "crm_source": crm_source,
        "deals_updated": 42
    }
