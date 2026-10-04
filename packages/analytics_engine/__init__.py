"""
Analytical Engine for RevOps SaaS.
Exposes diagnostic algorithms, Monte Carlo 95%, W-shaped attribution, and speech scoring.
"""

from .seven_sins import calculate_seven_sins, DiagnosticMetric
from .express_calc import calculate_express_diagnostic, ExpressDiagnosticResult
from .monte_carlo import run_monte_carlo_simulation, SimulationConfig, SimulationResult
from .attribution import calculate_w_shaped_attribution, TouchpointEvent, ChannelAttribution
from .speech_scoring import evaluate_speech_scorecard, ScorecardResult, CRITERIA_WEIGHTS

__all__ = [
    "calculate_seven_sins",
    "DiagnosticMetric",
    "calculate_express_diagnostic",
    "ExpressDiagnosticResult",
    "run_monte_carlo_simulation",
    "SimulationConfig",
    "SimulationResult",
    "calculate_w_shaped_attribution",
    "TouchpointEvent",
    "ChannelAttribution",
    "evaluate_speech_scorecard",
    "ScorecardResult",
    "CRITERIA_WEIGHTS",
]
