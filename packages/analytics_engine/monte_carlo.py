"""
Monte Carlo 95% Revenue Sandbox & What-If Simulation Engine.
Runs 10,000 stochastic iterations over lead generation, stage conversions, and ticket sizes.
"""

from dataclasses import dataclass
from typing import Any

import numpy as np


@dataclass
class SimulationConfig:
    leads_mean: float
    leads_std: float
    conv_qual_pct: float       # Конверсия Лид -> Квалификация
    conv_meeting_pct: float    # Конверсия Квалификация -> Встреча/КЭВ
    conv_close_pct: float      # Конверсия Встреча -> Оплата
    avg_ticket_rub: float
    ticket_std_rub: float
    target_revenue_rub: float
    iterations: int = 10000


@dataclass
class SimulationResult:
    iterations_run: int
    mean_revenue: float
    median_revenue_p50: float
    p10_conservative_revenue: float
    p90_optimistic_revenue: float
    prob_target_achieved_pct: float
    std_dev_revenue: float
    histogram_bins: list[float]
    histogram_counts: list[int]


def run_monte_carlo_simulation(config: SimulationConfig) -> dict[str, Any]:
    """
    Executes vectorized stochastic Monte Carlo simulation using NumPy.
    """
    np.random.seed(42)  # For reproducible baseline
    n = max(1000, min(config.iterations, 50000))

    # 1. Lead volume variation (Normal distribution clipped at > 0)
    sim_leads = np.random.normal(config.leads_mean, max(1.0, config.leads_std), size=n)
    sim_leads = np.clip(sim_leads, 0, None)

    # 2. Multi-stage conversions using Beta distributions to model realistic business fluctuations
    # Convert percentages to (0, 1) bounds
    q_rate = np.clip(config.conv_qual_pct / 100.0, 0.01, 0.99)
    m_rate = np.clip(config.conv_meeting_pct / 100.0, 0.01, 0.99)
    c_rate = np.clip(config.conv_close_pct / 100.0, 0.01, 0.99)

    # Beta distribution parameterized around the mean with modest variance
    sim_q = np.random.beta(a=q_rate * 40, b=(1 - q_rate) * 40, size=n)
    sim_m = np.random.beta(a=m_rate * 40, b=(1 - m_rate) * 40, size=n)
    sim_c = np.random.beta(a=c_rate * 40, b=(1 - c_rate) * 40, size=n)

    # Effective end-to-end conversion
    effective_conversion = sim_q * sim_m * sim_c
    sim_closed_deals = sim_leads * effective_conversion

    # 3. Deal ticket size distribution (Lognormal/Normal distribution)
    sim_ticket = np.random.normal(config.avg_ticket_rub, max(100.0, config.ticket_std_rub), size=n)
    sim_ticket = np.clip(sim_ticket, config.avg_ticket_rub * 0.3, None)

    # 4. Total revenue per iteration
    sim_revenue = sim_closed_deals * sim_ticket

    # Percentiles
    p10 = float(np.percentile(sim_revenue, 10))
    p50 = float(np.percentile(sim_revenue, 50))
    p90 = float(np.percentile(sim_revenue, 90))
    mean_val = float(np.mean(sim_revenue))
    std_val = float(np.std(sim_revenue))

    prob_target = float(np.mean(sim_revenue >= config.target_revenue_rub) * 100.0)

    # Histogram for UI visualization (20 bins)
    counts, bin_edges = np.histogram(sim_revenue, bins=20)

    result = SimulationResult(
        iterations_run=n,
        mean_revenue=round(mean_val, 2),
        median_revenue_p50=round(p50, 2),
        p10_conservative_revenue=round(p10, 2),
        p90_optimistic_revenue=round(p90, 2),
        prob_target_achieved_pct=round(prob_target, 1),
        std_dev_revenue=round(std_val, 2),
        histogram_bins=[round(float(b), 2) for b in bin_edges.tolist()],
        histogram_counts=[int(c) for c in counts.tolist()],
    )
    return result.__dict__
