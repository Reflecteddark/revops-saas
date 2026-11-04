"""The weakest criteria of a team in the words the AI analyst is told (same names as the cabinet)."""

from typing import Any

from .prompt_builder import BASE_10_CRITERIA, DEFAULT_CUSTOM_3

# tests/test_criteria_ssot.py keeps these titles equal to apps/web/src/lib/criteria.ts
TITLES = {key: spec["title"] for key, spec in {**BASE_10_CRITERIA, **DEFAULT_CUSTOM_3}.items()}
NO_DATA = "Детализированный срез по 13 критериям: недостаточно расширенных скорингов."
NO_WEAK_SPOTS = "Узких мест нет: все оценённые критерии соблюдены в 100% звонков."


def weak_criteria_summary(calls: list[dict[str, Any]], top: int = 3) -> str:
    """Pass rate of every criterion over the calls where THIS criterion got a 0 or a 1: a missed call, a failed
    audit and a criterion nobody assessed say nothing about the team (None used to count as a failure)."""
    seen: dict[str, list[int]] = {}
    for call in calls:
        cr = call.get("cr")
        if call.get("score") is None or not isinstance(cr, list) or len(cr) != 13:
            continue
        for idx, val in enumerate(cr):
            if val in (0, 1):
                seen.setdefault(f"cr{idx + 1}", []).append(int(val))
    if not seen:
        return NO_DATA
    # A criterion kept in every assessed call is not a weak spot; the rate is floored so one miss never reads 100%.
    weakest = sorted(((k, v) for k, v in seen.items() if sum(v) < len(v)), key=lambda kv: sum(kv[1]) / len(kv[1]))[:top]
    if not weakest:
        return NO_WEAK_SPOTS
    lines = [
        f"• {TITLES[key]} (CR{key[2:]}): соблюдается в {sum(v) * 100 // len(v)}% оценённых звонков"
        for key, v in weakest
    ]
    return "УЗКИЕ МЕСТА В ЗВОНКАХ ПО 13 КРИТЕРИЯМ B2B-АУДИТА:\n" + "\n".join(lines)
