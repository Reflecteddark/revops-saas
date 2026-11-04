# -*- coding: utf-8 -*-
"""cr1..cr13 must mean the same thing in Gemini's prompt (worker) and in the cabinet (criteria.ts)."""

import re
from pathlib import Path

from apps.api.services.prompt_builder import BASE_10_CRITERIA, DEFAULT_CUSTOM_3, build_system_prompt

TS = Path(__file__).resolve().parent.parent / "apps" / "web" / "src" / "lib" / "criteria.ts"


def _ts_labels() -> dict[str, str]:
    src = TS.read_text(encoding="utf-8")
    return dict(re.findall(r"id: '(cr\d+)',\s*label: '([^']+)'", src))


def test_prompt_builder_titles_match_cabinet_labels():
    ts = _ts_labels()
    assert len(ts) == 13
    py = {k: v["title"] for k, v in {**BASE_10_CRITERIA, **DEFAULT_CUSTOM_3}.items()}
    assert py == ts


def test_next_step_is_cr1_in_the_prompt():
    prompt = build_system_prompt(None)
    assert "cr1 (Твёрдый Next Step)" in prompt
    assert "cr10 (Твёрдый Next Step)" not in prompt


def test_cr11_to_cr13_match_the_production_n8n_prompt():
    # Read from the production n8n workflow "Analysis of sales department calls" (2026-11-03):
    # cr11 Слушание клиента, cr12 Фиксация договорённостей, cr13 Защита маржинальности
    ts = _ts_labels()
    assert (ts["cr11"], ts["cr12"], ts["cr13"]) == (
        "Слушание клиента", "Фиксация договорённостей", "Защита маржинальности")


def test_analyst_uses_the_prompt_titles_so_it_cannot_drift():
    from apps.api.services.weak_criteria import TITLES

    assert TITLES == {k: v for k, v in _ts_labels().items()}
