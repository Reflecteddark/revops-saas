"""
Express 3-Number Diagnostic Calculator (Экспресс-Калькулятор 3 Цифры).
Fast audit taking 3 inputs: monthly leads, average ticket, current close rate.
"""

from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class ExpressDiagnosticResult:
    current_monthly_revenue: float
    current_annual_revenue: float
    optimized_close_rate: float
    optimized_monthly_revenue: float
    monthly_upside: float
    annual_lost_profit: float
    roi_multiple: float


def calculate_express_diagnostic(
    monthly_leads: int,
    avg_ticket_rub: float,
    current_close_rate_pct: float,
    expected_conversion_uplift_pct: float = 30.0,  # +30% относительный рост конверсии при устранении узких мест
) -> Dict[str, Any]:
    """
    Computes current revenue and the financial upside from plugging funnel leaks.
    """
    if monthly_leads <= 0 or avg_ticket_rub <= 0 or current_close_rate_pct <= 0:
        raise ValueError("Параметры должны быть строго положительными.")

    current_monthly = monthly_leads * avg_ticket_rub * (current_close_rate_pct / 100.0)
    current_annual = current_monthly * 12.0

    # Относительный прирост конверсии при внедрении RevOps регламентов
    optimized_rate = current_close_rate_pct * (1.0 + expected_conversion_uplift_pct / 100.0)
    optimized_monthly = monthly_leads * avg_ticket_rub * (optimized_rate / 100.0)
    monthly_upside = optimized_monthly - current_monthly
    annual_lost_profit = monthly_upside * 12.0

    # Предполагаемая стоимость внедрения RevOps платформы
    estimated_platform_cost_annual = min(500000.0, max(120000.0, current_annual * 0.03))
    roi_multiple = round(annual_lost_profit / estimated_platform_cost_annual, 1)

    result = ExpressDiagnosticResult(
        current_monthly_revenue=round(current_monthly, 2),
        current_annual_revenue=round(current_annual, 2),
        optimized_close_rate=round(optimized_rate, 2),
        optimized_monthly_revenue=round(optimized_monthly, 2),
        monthly_upside=round(monthly_upside, 2),
        annual_lost_profit=round(annual_lost_profit, 2),
        roi_multiple=roi_multiple,
    )
    return result.__dict__
