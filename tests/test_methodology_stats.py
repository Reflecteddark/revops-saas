"""When a number may be called a verdict: enough calls, a difference bigger than noise, otherwise it says so."""

import pytest

from apps.api.services.methodology_stats import (
    COLLECTING,
    FAILED,
    FREESTYLE,
    GEM,
    NO_SIGNAL,
    WORKING,
    Counts,
    manager_flags,
    pct,
    verdict_for,
)


def c(script_win, script_lose, free_win, free_lose) -> Counts:
    script, free = script_win + script_lose, free_win + free_lose
    return Counts(
        total=script + free,
        script=script,
        wins=script_win + free_win,
        script_wins=script_win,
        free_wins=free_win,
    )


def test_rates_and_lift():
    x = c(27, 3, 3, 7)  # 30 by the script, 10 in own words
    assert (x.total, x.free) == (40, 10)
    assert (x.ar, x.swr, x.fwr, x.lift) == (75.0, 90.0, 30.0, 60.0)
    assert x.win == 75.0 and x.defect == 25.0
    assert Counts().ar == 0.0 and Counts().defect == 0.0  # no calls: zeros, no division error


@pytest.mark.parametrize(
    "counts,expected",
    [
        (c(27, 3, 3, 7), WORKING),  # said in 75%, 90% vs 30%
        (c(7, 1, 13, 19), GEM),  # said in 20%, 88% vs 41%
        (c(10, 22, 5, 3), FAILED),  # said in 80%, 31% vs 63%
        (c(3, 7, 21, 9), FREESTYLE),  # said in 25%, 30% vs 70%
        (c(10, 10, 9, 11), NO_SIGNAL),  # 50% vs 45%: noise
        (c(6, 0, 0, 6), COLLECTING),  # 12 calls
        (c(30, 7, 1, 2), COLLECTING),  # 40 calls, but only 3 in own words: nothing to compare with
    ],
)
def test_verdicts(counts, expected):
    assert verdict_for(counts) == expected


def test_nothing_is_a_verdict_below_thresholds():
    assert verdict_for(Counts()) == COLLECTING
    assert verdict_for(c(14, 0, 0, 15)) == COLLECTING  # 29 calls, the 30th is missing
    assert verdict_for(c(15, 0, 0, 15)) != COLLECTING  # 30 calls, both cohorts: now it may speak


def test_a_small_difference_is_no_signal_at_any_adherence():
    assert verdict_for(c(15, 15, 5, 5)) == NO_SIGNAL  # said in 75%: 50% vs 50%
    assert verdict_for(c(9, 11, 8, 12)) == NO_SIGNAL  # said in 50%: 45% vs 40%, lift 5
    assert c(20, 4, 10, 6).lift >= 15 and verdict_for(c(20, 4, 10, 6)) == GEM  # said in 60%, 83% vs 62%: a real gap


@pytest.mark.parametrize("total,script,wins,saboteur,champion", [
    (4, 0, 0, False, False),  # under 5 calls nobody is labelled
    (10, 3, 5, True, False),  # said in 30%
    (10, 9, 7, False, True),  # said in 90%, passed 70%
    (10, 9, 5, False, False),  # said in 90% but passed only 50%
    (10, 6, 6, False, False),
])
def test_manager_labels_need_enough_calls(total, script, wins, saboteur, champion):
    assert manager_flags(total, script, wins) == (saboteur, champion)


def test_pct_rounds_to_one_decimal():
    assert pct(1, 3) == 33.3 and pct(0, 0) == 0.0
