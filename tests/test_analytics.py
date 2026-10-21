"""
Unit tests for RevOps SaaS Analytical Engine.
Verifies: 7 Sins, Express Calc, Monte Carlo 95%, W-Attribution, and 13 Criteria Speech Scoring.
"""

from packages.analytics_engine.attribution import calculate_w_shaped_attribution
from packages.analytics_engine.express_calc import calculate_express_diagnostic
from packages.analytics_engine.monte_carlo import (
    SimulationConfig,
    run_monte_carlo_simulation,
)
from packages.analytics_engine.seven_sins import calculate_seven_sins
from packages.analytics_engine.speech_scoring import (
    CRITERIA_WEIGHTS,
    evaluate_speech_scorecard,
)


def test_seven_sins_calculation():
    res = calculate_seven_sins(
        monthly_leads=240,
        avg_ticket_rub=180000.0,
        current_conversion_pct=7.5,
        avg_first_response_min=45.0,
        deals_without_next_step_pct=38.0,
        stalled_deals_pct=42.0,
    )
    assert res["monthly_potential_revenue_rub"] > 0
    assert res["total_lost_revenue_rub"] > 0
    assert res["recoverable_revenue_rub"] == round(res["total_lost_revenue_rub"] * 0.65, 2)
    assert len(res["metrics"]) == 7
    # Check that slow response is flagged as critical (>30m)
    assert res["metrics"][0]["severity"] == "CRITICAL"


def test_express_calculator():
    res = calculate_express_diagnostic(
        monthly_leads=150,
        avg_ticket_rub=200000.0,
        current_close_rate_pct=5.0,
        expected_conversion_uplift_pct=30.0,
    )
    assert res["current_monthly_revenue"] == 1500000.0
    assert res["current_annual_revenue"] == 18000000.0
    assert res["optimized_monthly_revenue"] == 1950000.0
    assert res["monthly_upside"] == 450000.0
    assert res["annual_lost_profit"] == 5400000.0
    assert res["roi_multiple"] > 0


def test_monte_carlo_simulation():
    config = SimulationConfig(
        leads_mean=250.0,
        leads_std=20.0,
        conv_qual_pct=50.0,
        conv_meeting_pct=60.0,
        conv_close_pct=25.0,
        avg_ticket_rub=200000.0,
        ticket_std_rub=15000.0,
        target_revenue_rub=3500000.0,
        iterations=5000,
    )
    res = run_monte_carlo_simulation(config)
    assert res["iterations_run"] == 5000
    # Stochastic percentile ordering check: P10 <= P50 <= P90
    assert res["p10_conservative_revenue"] <= res["median_revenue_p50"]
    assert res["median_revenue_p50"] <= res["p90_optimistic_revenue"]
    assert 0.0 <= res["prob_target_achieved_pct"] <= 100.0
    assert len(res["histogram_counts"]) == 20


def test_w_shaped_attribution():
    deals = [
        {
            "id": "deal_1",
            "budget": 100000.0,
            "first_touch_channel": "Yandex Direct",
            "mid_touch_channel": "Telegram Ads",
            "close_touch_channel": "Direct / Rep",
        },
        {
            "id": "deal_2",
            "budget": 200000.0,
            "first_touch_channel": "Yandex Direct",
            "mid_touch_channel": "Yandex Direct",
            "close_touch_channel": "Telegram Ads",
        }
    ]
    ad_spend = {
        "Yandex Direct": 50000.0,
        "Telegram Ads": 30000.0,
    }
    res = calculate_w_shaped_attribution(deals, ad_spend)
    assert res["total_attributed_revenue_rub"] == 300000.0
    assert res["total_ad_spend_rub"] == 80000.0
    # Check that channels were calculated
    channels = {c["channel"]: c for c in res["channels"]}
    assert "Yandex Direct" in channels
    assert "Telegram Ads" in channels


def test_speech_scoring_13_criteria():
    assert sum(CRITERIA_WEIGHTS.values()) == 100

    high_scores = {k: 9.0 for k in CRITERIA_WEIGHTS.keys()}
    good_res = evaluate_speech_scorecard(high_scores)
    assert good_res.overall_score >= 85.0
    assert not good_res.is_deal_at_risk
    assert good_res.passed_criteria_count == 13

    # Test failure on Next Step causing Deal Risk
    failing_scores = {k: 8.0 for k in CRITERIA_WEIGHTS.keys()}
    failing_scores["next_step_fixation"] = 4.0  # Failed next step
    risk_res = evaluate_speech_scorecard(failing_scores)
    assert risk_res.is_deal_at_risk
    assert "Не зафиксирован следующий шаг" in risk_res.risk_summary
    assert "Reverse ETL" in risk_res.crm_note_text or "RevOps AI" in risk_res.crm_note_text
