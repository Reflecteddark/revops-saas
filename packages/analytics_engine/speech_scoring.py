"""
Speech AI Scoring Engine & 13 Evaluation Criteria.
Transfers the Whisper + LLM prompt-auditing logic into structured SaaS microservices.
"""

from dataclasses import dataclass
from typing import Dict, Any, List

CRITERIA_WEIGHTS = {
    "greeting_and_intro": 5,          # 1. Приветствие и регламент
    "client_qualification": 10,       # 2. Квалификация ЛПР
    "pain_discovery": 10,             # 3. Выявление болей
    "value_presentation": 10,         # 4. Презентация ценности
    "price_presentation": 5,          # 5. Презентация цены
    "objection_handling": 15,         # 6. Отработка возражений
    "next_step_fixation": 15,         # 7. Фиксация следующего шага (дата/время)
    "script_compliance": 5,           # 8. Соблюдение скрипта
    "talk_listen_ratio": 5,           # 9. Баланс эфира (менеджер ≤ 45%)
    "empathy_and_tone": 5,            # 10. Эмпатия и вежливость
    "competitor_defense": 5,          # 11. Отстройка от конкурентов
    "urgency_creation": 5,            # 12. Создание срочности (дедлайн/дефицит)
    "no_toxicity_stress": 5,          # 13. Отсутствие токсичности/агрессии
}

CRITERIA_NAMES_RU = {
    "greeting_and_intro": "1. Приветствие и регламент разговора",
    "client_qualification": "2. Квалификация ЛПР и критериев выбора",
    "pain_discovery": "3. Выявление истинных болей и задач",
    "value_presentation": "4. Презентация ценности через боли",
    "price_presentation": "5. Уверенная презентация стоимости",
    "objection_handling": "6. Отработка возражений ('дорого', 'подумаю')",
    "next_step_fixation": "7. Фиксация точного следующего шага (дедлайн)",
    "script_compliance": "8. Соблюдение утвержденного скрипта",
    "talk_listen_ratio": "9. Баланс эфира (менеджер слушает > 50%)",
    "empathy_and_tone": "10. Эмпатия, вежливость и контакт",
    "competitor_defense": "11. Профессиональная отстройка от конкурентов",
    "urgency_creation": "12. Создание триггера срочности",
    "no_toxicity_stress": "13. Отсутствие давления и раздражения",
}


@dataclass
class ScorecardResult:
    overall_score: float
    passed_criteria_count: int
    failed_criteria_count: int
    is_deal_at_risk: bool
    risk_summary: str
    detailed_scores: Dict[str, Dict[str, Any]]
    crm_note_text: str


def evaluate_speech_scorecard(scores: Dict[str, float], comments: Dict[str, str] = None) -> ScorecardResult:
    """
    Computes weighted score across 13 criteria (each input score is 0.0 to 10.0 or 0 to 100).
    """
    comments = comments or {}
    total_weighted_points = 0.0
    passed_count = 0
    failed_count = 0
    details = {}

    for key, weight in CRITERIA_WEIGHTS.items():
        raw_val = float(scores.get(key, 0.0))
        # Normalize to 0-100 scale
        normalized_score = raw_val * 10.0 if raw_val <= 10.0 else min(100.0, raw_val)
        
        weighted_contrib = (normalized_score / 100.0) * weight
        total_weighted_points += weighted_contrib
        
        is_pass = normalized_score >= 70.0
        if is_pass:
            passed_count += 1
        else:
            failed_count += 1

        details[key] = {
            "name": CRITERIA_NAMES_RU.get(key, key),
            "score": round(normalized_score, 1),
            "weight": weight,
            "passed": is_pass,
            "comment": comments.get(key, "Автоматическая оценка ИИ")
        }

    overall_score = round(total_weighted_points, 1)

    # Risk detection heuristics
    has_next_step = details.get("next_step_fixation", {}).get("passed", False)
    objection_pass = details.get("objection_handling", {}).get("passed", False)
    is_at_risk = overall_score < 65.0 or not has_next_step

    risks = []
    if not has_next_step:
        risks.append("Не зафиксирован следующий шаг")
    if not objection_pass:
        risks.append("Слив на возражениях")
    if overall_score < 65.0:
        risks.append(f"Низкий скоринг качества ({overall_score}/100)")

    risk_summary = "; ".join(risks) if risks else "Рисков не обнаружено (Звонок по регламенту)"

    # Generate CRM Note for Reverse ETL
    crm_note_lines = [
        f"🤖 [RevOps AI Аудит звонка] Оценка: {overall_score}/100 ({'✅ Норма' if not is_at_risk else '⚠️ В РИСКЕ'})",
        f"Статус: {risk_summary}",
        "--- Критические маркеры ---",
        f"• Следующий шаг: {'✅ Зафиксирован' if has_next_step else '❌ Отсутствует'}",
        f"• Отработка возражений: {'✅ Пройдена' if objection_pass else '❌ Слабо'}",
        f"• Выявление болей: {details.get('pain_discovery', {}).get('score', 0)}/100",
        f"• Презентация цены: {details.get('price_presentation', {}).get('score', 0)}/100",
    ]
    crm_note = "\n".join(crm_note_lines)

    return ScorecardResult(
        overall_score=overall_score,
        passed_criteria_count=passed_count,
        failed_criteria_count=failed_count,
        is_deal_at_risk=is_at_risk,
        risk_summary=risk_summary,
        detailed_scores=details,
        crm_note_text=crm_note,
    )
