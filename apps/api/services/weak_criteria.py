"""The weakest criteria of a team in the words the AI analyst is told (same names as the cabinet)."""

from typing import Any

from .prompt_builder import BASE_10_CRITERIA, DEFAULT_CUSTOM_3

# tests/test_criteria_ssot.py keeps these titles equal to apps/web/src/lib/criteria.ts
TITLES = {key: spec["title"] for key, spec in {**BASE_10_CRITERIA, **DEFAULT_CUSTOM_3}.items()}
NO_DATA = "Детализированный срез по 13 критериям: недостаточно расширенных скорингов."


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
    weakest = sorted(seen.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))[:top]
    lines = [
        f"• {TITLES[key]} (CR{key[2:]}): соблюдается лишь в {round(sum(v) / len(v) * 100)}% оценённых звонков"
        for key, v in weakest
    ]
    return "УЗКИЕ МЕСТА В ЗВОНКАХ ПО 13 КРИТЕРИЯМ B2B-АУДИТА:\n" + "\n".join(lines)
