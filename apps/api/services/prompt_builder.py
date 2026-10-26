# -*- coding: utf-8 -*-
"""
RevOps Dynamic Prompt Builder & Scorecard Engine.
Combines:
- 10 Immutable Base B2B Criteria.
- Up to 3 Tenant Custom Criteria (cr11, cr12, cr13) on natural language.
- Generates Gemini System Instruction & Strict JSON Schema.
- Normalizes T-24 Score [0..13] and Percent [0..100%].
"""
from typing import Dict, List, Any, Optional

BASE_10_CRITERIA = {
    "cr1": {
        "title": "Приветствие и регламент",
        "category": "Вход в контакт",
        "description": "Менеджер представился, назвал компанию и обозначил цель звонка/регламент диалога."
    },
    "cr2": {
        "title": "Выявление ЛПР",
        "category": "Квалификация",
        "description": "Менеджер выяснил роль собеседника в принятии решения или уточнил согласующих лиц."
    },
    "cr3": {
        "title": "Выявление потребностей",
        "category": "Квалификация",
        "description": "Менеджер задал открытые вопросы о текущей ситуации, задачах и болях клиента."
    },
    "cr4": {
        "title": "Квалификация бюджета",
        "category": "Квалификация",
        "description": "Менеджер уточнил финансовые ориентиры, вилку бюджета или порядок согласования инвестиций."
    },
    "cr5": {
        "title": "Определение сроков",
        "category": "Квалификация",
        "description": "Менеджер зафиксировал временные рамки внедрения / покупки / дедлайн клиента."
    },
    "cr6": {
        "title": "Презентация через ценность",
        "category": "Презентация",
        "description": "Менеджер презентовал продукт на языке пользы и выгод, привязав к озвученным болям."
    },
    "cr7": {
        "title": "Отработка возражений",
        "category": "Презентация",
        "description": "Менеджер выслушал возражения, аргументировал позицию без агрессии и споров."
    },
    "cr8": {
        "title": "Удержание инициативы",
        "category": "Управление диалогом",
        "description": "Менеджер управлял ходом разговора, завершая свои реплики встречными вопросами."
    },
    "cr9": {
        "title": "Отсутствие стоп-слов и чистота речи",
        "category": "Этика и тон",
        "description": "В речи отсутствуют грубость, слова-паразиты, слова неуверенности ('наверное', 'не знаю')."
    },
    "cr10": {
        "title": "Твёрдый Next Step",
        "category": "Закрытие",
        "description": "Менеджер назначил конкретный следующий шаг с точной датой и временем (Zoom/встреча/звонок)."
    },
}

DEFAULT_CUSTOM_3 = {
    "cr11": {
        "title": "Создание задачи в CRM",
        "category": "CRM-дисциплина",
        "description": "Менеджер проговорил фиксацию следующего контакта и выставление задачи в CRM."
    },
    "cr12": {
        "title": "Соблюдение этики и эмпатия",
        "category": "Этика и тон",
        "description": "Менеджер проявил дружелюбие, активное слушание и вежливость на протяжении всего разговора."
    },
    "cr13": {
        "title": "Резюме договорённостей",
        "category": "Закрытие",
        "description": "В конце звонка менеджер подвёл итоги: кто, что и к какому сроку делает."
    },
}


def build_system_prompt(custom_criteria: Optional[List[Dict[str, Any]]] = None) -> str:
    """
    Генерирует системный промпт для Gemini API, объединяя 10 базовых критериев
    и до 3 пользовательских критериев на естественном языке.
    """
    criteria_block = ""
    # 1. Базовые 10
    for key, c in BASE_10_CRITERIA.items():
        criteria_block += f"- {key} ({c['title']}): {c['description']} [1 = выполнено, 0 = нарушено]\n"

    # 2. Кастомные до 3 критериев
    active_custom = {}
    if custom_criteria:
        for idx, item in enumerate(custom_criteria[:3]):
            key = f"cr{11 + idx}"
            active_custom[key] = {
                "title": item.get("name") or item.get("title", f"Критерий {key}"),
                "description": item.get("prompt_instruction") or item.get("description", "Оцени по контексту.")
            }
    
    # Дозаполняем дефолтными, если не задано
    for key in ["cr11", "cr12", "cr13"]:
        if key not in active_custom:
            active_custom[key] = DEFAULT_CUSTOM_3[key]

    for key, c in active_custom.items():
        criteria_block += f"- {key} ({c['title']} [СПЕЦИФИКА КОМПАНИИ]): {c['description']} [1 = выполнено, 0 = нарушено]\n"

    prompt = f"""Ты — строгий AI-аудитор отдела продаж платформы RevOps Enterprise OS.
Твоя задача — объективно оценить аудиозапись звонка менеджера по продажам с клиентом.

СПИСОК 13 КРИТЕРИЕВ АУДИТА:
{criteria_block}

ПРАВИЛА ОЦЕНКИ:
1. Будь предельно объективен. Ставь 1 только если критерий четко и однозначно соблюден. При сомнении ставь 0.
2. В error_summary укажи 1-3 ключевые ошибки менеджера, которые помешали сделке.
3. В ai_recommendation дай краткую конкретную рекомендацию РОПа менеджеру для исправления.
4. В next_action_extracted укажи точный следующий шаг (дата, время, действие) или 'Не назначен'.
5. Ответ строго в формате JSON без разметки markdown (без ```json).
"""
    return prompt


def get_gemini_response_schema() -> Dict[str, Any]:
    """Возвращает строгую JSON-схему для Google Gemini API (responseMimeType: application/json)."""
    properties = {
        "transcript": {"type": "STRING", "description": "Полная стенограмма звонка с разделением спикеров"},
        "manager_name": {"type": "STRING", "description": "Имя менеджера по продажам"},
        "client_name": {"type": "STRING", "description": "Имя клиента или 'Клиент'"},
        "client_niche": {"type": "STRING", "description": "Ниша/бизнес клиента"},
        "error_summary": {"type": "STRING", "description": "Главные ошибки менеджера в диалоге"},
        "ai_recommendation": {"type": "STRING", "description": "Рекомендация РОПа менеджеру"},
        "next_action_extracted": {"type": "STRING", "description": "Следующий шаг или 'Не назначен'"},
        "zoom_scheduled": {"type": "INTEGER", "description": "1 если назначен Zoom/встреча, 0 если нет"},
    }
    required = ["transcript", "error_summary", "ai_recommendation", "next_action_extracted", "zoom_scheduled"]
    
    for i in range(1, 14):
        k = f"cr{i}"
        properties[k] = {"type": "INTEGER", "description": f"Оценка по критерию {k} (0 или 1)"}
        required.append(k)

    return {
        "type": "OBJECT",
        "properties": properties,
        "required": required
    }


def calculate_scores(audit_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Канонический расчет шкалы T-24:
    - raw_score: сумма cr1..cr13 [0..13]
    - overall_percent: нормализованный процент [0..100%]
    """
    raw_score = 0
    scores_dict = {}
    for i in range(1, 14):
        k = f"cr{i}"
        val = int(audit_data.get(k, 0))
        val = 1 if val >= 1 else 0
        scores_dict[k] = val
        raw_score += val

    overall_percent = round((raw_score / 13.0) * 100.0, 1)

    return {
        "raw_score": raw_score,
        "max_score": 13,
        "overall_score": overall_percent,
        "criteria_scores": scores_dict
    }
