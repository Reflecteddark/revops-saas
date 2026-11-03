# -*- coding: utf-8 -*-
"""
RevOps Dynamic Prompt Builder & Scorecard Engine.
Combines:
- 10 Immutable Base B2B Criteria (order = apps/web/src/lib/criteria.ts).
- Up to 3 Tenant Custom Criteria (cr11, cr12, cr13) on natural language.
- Generates Gemini System Instruction & Strict JSON Schema.
- Normalizes T-24 Score [0..13] and Percent [0..100%].
"""
from typing import Dict, List, Any, Optional

# Order and wording are the SAME as apps/web/src/lib/criteria.ts, which is synchronized with the production
# n8n audit workflow and the "ИИ_Аудит" sheet. The worker used to define its own, different order
# (cr1 "Приветствие", cr10 "Next Step"), so a call audited here was shown under the wrong criteria in the cabinet.
# tests/test_criteria_ssot.py fails if the two files drift apart.
BASE_10_CRITERIA = {
    "cr1": {
        "title": "Твёрдый Next Step",
        "category": "Закрытие",
        "description": "Менеджер назначил конкретный следующий шаг с точной датой и временем (Zoom/встреча/звонок). Без точной даты и времени — 0."
    },
    "cr2": {
        "title": "Инициатива диалога",
        "category": "Управление диалогом",
        "description": "Менеджер удерживал инициативу, вёл разговор через открытые вопросы и управлял ходом диалога."
    },
    "cr3": {
        "title": "Квалификация ЛПР/ЛВПР",
        "category": "Квалификация",
        "description": "Менеджер выяснил роль собеседника в принятии решения или уточнил состав согласующих лиц."
    },
    "cr4": {
        "title": "Выявление болей и срочности",
        "category": "Квалификация",
        "description": "Менеджер задал вопросы о текущей ситуации, задачах, болях и срочности решения вопроса."
    },
    "cr5": {
        "title": "Отработка «Дорого»",
        "category": "Возражения",
        "description": "Менеджер отработал сомнения по цене через ценность, окупаемость и ROI без демпинга и скидок."
    },
    "cr6": {
        "title": "Отработка «Я подумаю»",
        "category": "Возражения",
        "description": "Менеджер вскрыл истинные причины паузы и сомнения клиента вместо пассивного согласия."
    },
    "cr7": {
        "title": "Презентация через кейсы и цифры",
        "category": "Презентация",
        "description": "Менеджер показал ценность через факты, окупаемость или результаты аналогичных внедрений."
    },
    "cr8": {
        "title": "Попытка дожима и сделки",
        "category": "Закрытие",
        "description": "Менеджер предложил конкретное целевое действие: КП под ключ, тест-драйв, пилот или бронь."
    },
    "cr9": {
        "title": "Приветствие и регламент",
        "category": "Вход в контакт",
        "description": "Менеджер представился, назвал компанию и обозначил понятную цель звонка и регламент."
    },
    "cr10": {
        "title": "Чистота речи и уверенность",
        "category": "Этика и тон",
        "description": "Уверенный тон, отсутствие слов-паразитов, чёткая дикция без агрессии и неуверенности."
    },
}

DEFAULT_CUSTOM_3 = {
    "cr11": {
        "title": "Слушание клиента",
        "category": "Этика и тон",
        "description": "Менеджер слушает клиента: клиент говорит не менее 40% хронометража разговора."
    },
    "cr12": {
        "title": "Фиксация договорённостей",
        "category": "Закрытие",
        "description": "В конце разговора менеджер подвёл резюме договорённостей: кто, что и к какому сроку делает."
    },
    "cr13": {
        "title": "Защита маржинальности",
        "category": "Цена",
        "description": "Скидки не даются просто так: без встречных уступок по объёму или предоплате."
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
    - overall_percent: нормализованный процент [0..100%] (только для отчётов; в БД хранится raw_score)
    - cr: список из 13 значений 0/1 по порядку cr1..cr13
    Отсутствующий или нечисловой критерий считается 0 (не выполнен), а не выдумывается.
    """
    raw_score = 0
    scores_dict = {}
    for i in range(1, 14):
        k = f"cr{i}"
        try:
            val = int(audit_data.get(k, 0))
        except (TypeError, ValueError):
            val = 0
        val = 1 if val >= 1 else 0
        scores_dict[k] = val
        raw_score += val

    overall_percent = round((raw_score / 13.0) * 100.0, 1)

    return {
        "raw_score": raw_score,
        "max_score": 13,
        "overall_score": overall_percent,
        "criteria_scores": scores_dict,
        "cr": [scores_dict[f"cr{i}"] for i in range(1, 14)],
    }
