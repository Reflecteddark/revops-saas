"""/diagnostics/self-healing with calls that have no score: it crashed on `None < 8` and showed invented 9.1 / 70%."""

from unittest.mock import patch

from apps.api.routers import diagnostics_router


def run(calls):
    with patch.object(diagnostics_router, "fetch_calls_from_sheets", return_value=calls):
        return diagnostics_router.run_self_healing_audit()


def test_a_missed_call_and_a_failed_audit_do_not_crash_or_count():
    calls = [
        {"cr": [None] * 13, "score": None, "next_step": None},
        {"cr": [None] * 13, "score": None, "next_step": None},
        {"cr": [1] * 13, "score": 13, "next_step": 1},
        {"cr": [0] * 13, "score": 4, "next_step": 0},
    ]
    cco = run(calls)["agent_cco"]
    assert cco["audits_checked"] == 2
    assert cco["avg_score"] == 8.5
    assert cco["next_step_pct"] == 50.0
    assert cco["fake_yes_count"] == 1


def test_no_calls_is_zero_not_an_invented_result():
    cco = run([])["agent_cco"]
    assert (cco["audits_checked"], cco["avg_score"], cco["next_step_pct"]) == (0, 0.0, 0.0)
