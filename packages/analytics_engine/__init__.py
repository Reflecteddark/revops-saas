"""
Analytical Engine for RevOps SaaS.
Exposes diagnostic algorithms, Monte Carlo 95%, W-shaped attribution, and speech scoring.
"""

from .attribution import (
    ChannelAttribution,
    TouchpointEvent,
    calculate_w_shaped_attribution,
)
from .express_calc import ExpressDiagnosticResult, calculate_express_diagnostic
from .monte_carlo import SimulationConfig, SimulationResult, run_monte_carlo_simulation
from .seven_sins import DiagnosticMetric, calculate_seven_sins
from .speech_scoring import CRITERIA_WEIGHTS, ScorecardResult, evaluate_speech_scorecard

__all__ = [
    "CRITERIA_WEIGHTS",
    "ChannelAttribution",
    "DiagnosticMetric",
    "ExpressDiagnosticResult",
    "ScorecardResult",
    "SimulationConfig",
    "SimulationResult",
    "TouchpointEvent",
    "calculate_express_diagnostic",
    "calculate_seven_sins",
    "calculate_w_shaped_attribution",
    "evaluate_speech_scorecard",
    "run_monte_carlo_simulation",
]
