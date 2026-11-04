"""What the AI analyst is told about the weakest criteria: the cabinet's names, assessed calls only."""

from apps.api.services.weak_criteria import NO_DATA, NO_WEAK_SPOTS, weak_criteria_summary


def call(cr, score=9):
    return {"cr": cr, "score": score}


def test_names_are_the_cabinets_not_the_old_numbering():
    # CR1 (Твёрдый Next Step) fails everywhere, CR9 (Приветствие) passes: the analyst used to hear the opposite
    calls = [call([0] + [1] * 12) for _ in range(5)]
    text = weak_criteria_summary(calls)
    assert "Твёрдый Next Step (CR1): соблюдается в 0% оценённых звонков" in text
    assert text.count("•") == 1  # the greeting passes everywhere: it is not listed as a weak spot


def test_missed_and_failed_calls_and_unassessed_criteria_are_not_failures():
    missed = {"cr": [None] * 13, "score": None}
    half_known = call([1, 1, None] + [1] * 10)
    text = weak_criteria_summary([missed, missed, half_known, half_known])
    assert "(CR3)" not in text  # nobody assessed CR3: it is not "0%"
    assert text == NO_WEAK_SPOTS  # every criterion that WAS assessed passed


def test_nothing_assessed_says_so():
    assert weak_criteria_summary([]) == NO_DATA
    assert weak_criteria_summary([{"cr": [None] * 13, "score": None}]) == NO_DATA


def test_a_criterion_kept_everywhere_is_not_a_weak_spot_and_one_miss_never_reads_100():
    assert weak_criteria_summary([call([1] * 13) for _ in range(4)]) == NO_WEAK_SPOTS
    calls = [call([1] * 13) for _ in range(199)] + [call([0] + [1] * 12)]
    text = weak_criteria_summary(calls)
    assert "(CR1): соблюдается в 99% оценённых звонков" in text  # 99.5% is not "100%"
