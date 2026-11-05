# -*- coding: utf-8 -*-
"""
Methodology statistics: what a number may be called a verdict.

Two cohorts per criterion: calls where the manager said the standard ("script") and calls where he did not ("own words").
`achieved` is the audit's mark of that criterion. A verdict needs enough calls and a difference bigger than noise;
otherwise it says "collecting data" or "no clear signal" and never guesses.
"""

from dataclasses import dataclass

MIN_CALLS = 30  # relevant calls of a criterion before any verdict
MIN_COHORT = 5  # calls in each cohort, otherwise the two cannot be compared
MIN_COMPARE = 10  # calls in EACH version before two versions are compared
ADHERENCE_OK = 65.0  # share of calls with the standard said, from which it is "accepted"
LIFT_MARGIN = 10.0  # points of difference that count as a difference
HIDDEN_GEM_MARGIN = 15.0  # the standard is clearly stronger, yet it is not said in every call
MIN_MANAGER_CALLS = 5  # calls before a manager is labelled saboteur or champion

COLLECTING = "COLLECTING_DATA"
NO_SIGNAL = "NO_SIGNAL"
WORKING = "WORKING_STANDARD"
GEM = "SABOTAGE_HIDDEN_GEM"
FAILED = "HYPOTHESIS_FAILED"
FREESTYLE = "FREESTYLE_STRONGER"

VERDICT_LABELS = {
    COLLECTING: "Сбор данных: звонков пока мало для вывода",
    NO_SIGNAL: "Явной разницы нет: по скрипту и своими словами результат близкий",
    WORKING: "Рабочий стандарт: его говорят, и с ним результат лучше",
    GEM: "Скрытый алмаз: по скрипту результат лучше, но его говорят не в каждом звонке",
    FAILED: "Гипотеза не сработала: скрипт говорят, а результат не лучше",
    FREESTYLE: "Своими словами сильнее: стоит разобрать, что говорят лучшие",
}


def pct(part: int, whole: int) -> float:
    return round(100.0 * part / whole, 1) if whole else 0.0


@dataclass
class Counts:
    total: int = 0  # relevant calls
    script: int = 0  # the standard was said
    wins: int = 0  # the criterion was passed
    script_wins: int = 0
    free_wins: int = 0

    @property
    def free(self) -> int:
        return self.total - self.script

    @property
    def ar(self) -> float:
        return pct(self.script, self.total)

    @property
    def swr(self) -> float:
        return pct(self.script_wins, self.script)

    @property
    def fwr(self) -> float:
        return pct(self.free_wins, self.free)

    @property
    def win(self) -> float:
        return pct(self.wins, self.total)

    @property
    def lift(self) -> float:
        return round(self.swr - self.fwr, 1)

    @property
    def defect(self) -> float:
        return round(100.0 - self.win, 1) if self.total else 0.0

    @property
    def enough(self) -> bool:
        return self.total >= MIN_CALLS and self.script >= MIN_COHORT and self.free >= MIN_COHORT


def verdict_for(c: Counts) -> str:
    if not c.enough:
        return COLLECTING
    lift = c.lift
    if c.ar >= ADHERENCE_OK:
        if lift >= LIFT_MARGIN:
            return WORKING
        if lift <= -LIFT_MARGIN:
            return FAILED
        return NO_SIGNAL
    if lift >= HIDDEN_GEM_MARGIN:
        return GEM
    if lift <= -LIFT_MARGIN:
        return FREESTYLE
    return NO_SIGNAL


def manager_flags(total: int, script: int, wins: int) -> tuple[bool, bool]:
    """(saboteur, champion). Under MIN_MANAGER_CALLS a manager is nobody's saboteur and nobody's champion."""
    if total < MIN_MANAGER_CALLS:
        return False, False
    ar, win = pct(script, total), pct(wins, total)
    return ar < 40.0, ar >= 80.0 and win >= 60.0
