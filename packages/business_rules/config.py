"""
Business Rules & Constants for RevOps Platform V17.6 (Excel Golden Master Port).
Source of Truth: RevOps Platform V17.6 (Clean Client Starter)
"""

from typing import Any

# 1. BENCHMARKS (6 бенчмарков потерь из ⚙️ Настройки, строки 43-48)
BENCHMARKS = {
    "speech_defect_loss_pct": 0.28,       # 28% потери на браке речи
    "kp_stall_loss_pct": 0.18,            # 18% потери на зависание КП
    "dormant_rejects_loss_pct": 0.12,     # 12% потери спящих отказников CRM
    "dso_delay_loss_pct": 0.10,           # 10% просрочка оплат и счетов — DSO
    "funnel_conversion_fact": 0.045,      # 4.5% текущая конверсия воронки в оплату
    "recovery_rate_to_be": 0.35,          # 35% гарантированный возврат потерь (To-Be)
}

# 2. STAGES (7 этапов воронки: SLA нормативы в часах + Win %)
STAGES: dict[int, dict[str, Any]] = {
    1: {"id": 1, "name": "1. Новый лид", "sla_hours": 24.0, "win_pct": 0.05},
    2: {"id": 2, "name": "2. Квалификация / ЛПР", "sla_hours": 48.0, "win_pct": 0.15},
    3: {"id": 3, "name": "3. Встреча / Демо", "sla_hours": 120.0, "win_pct": 0.35},
    4: {"id": 4, "name": "4. КП и согласование", "sla_hours": 48.0, "win_pct": 0.60},
    5: {"id": 5, "name": "5. Счет выставлен", "sla_hours": 72.0, "win_pct": 0.85},
    6: {"id": 6, "name": "6. Успешно реализовано", "sla_hours": 0.0, "win_pct": 1.00},
    7: {"id": 7, "name": "7. Закрыто и не реализовано", "sla_hours": 0.0, "win_pct": 0.00},
}

# 3. CALL_CRITERIA (13 эталонных критериев оценки диалогов с весами и приоритетами)
CALL_CRITERIA = {
    "cr1": {
        "num": 1,
        "name": "Жёсткий Next Step",
        "short_name": "NextStep",
        "weight": 2.0,
        "priority": "🔴 P0 (Критический)",
        "description": "Зафиксирована точная дата и время следующего контакта (календарный слот)",
        "defect_marker": "«Я вам наберу на днях», «Подумайте, позвоните», отпускание без дедлайна"
    },
    "cr2": {
        "num": 2,
        "name": "Инициатива диалога",
        "short_name": "Иниц.",
        "weight": 1.0,
        "priority": "🟡 P1 (Высокий)",
        "description": "Менеджер ведёт диалог вопросами, держит сценарий, а не работает автоответчиком",
        "defect_marker": "Клиент задает все вопросы сам, менеджер только пассивно отвечает"
    },
    "cr3": {
        "num": 3,
        "name": "Квалификация ЛПР / ЛВПР",
        "short_name": "ЛПР",
        "weight": 1.5,
        "priority": "🔴 P0 (Критический)",
        "description": "Установлен статус собеседника: принимает ли решения по бюджету и согласованию",
        "defect_marker": "Трата 40 минут на презентацию секретарю или инженеру без полномочий"
    },
    "cr4": {
        "num": 4,
        "name": "Выявление болей и срочности",
        "short_name": "Боли",
        "weight": 1.2,
        "priority": "🟡 P1 (Высокий)",
        "description": "Понятна ли бизнес-задача клиента, текущие потери и дедлайн решения проблемы",
        "defect_marker": "Менеджер презентует продукт «в лоб», не узнав реальную боль клиента"
    },
    "cr5": {
        "num": 5,
        "name": "Отработка возражения «Дорого»",
        "short_name": "Дорого",
        "weight": 1.5,
        "priority": "🔴 P0 (Критический)",
        "description": "Обоснование ценности, расчет ROI/окупаемости, рассрочка (без моментальной скидки)",
        "defect_marker": "Моментальная скидка при первом сомнении или согласие («Да, у нас недешево»)"
    },
    "cr6": {
        "num": 6,
        "name": "Отработка «Я подумаю»",
        "short_name": "Подумаю",
        "weight": 1.0,
        "priority": "🟡 P1 (Высокий)",
        "description": "Вскрытие истинного сомнения клиента, а не молчаливое отпускание в архив",
        "defect_marker": "«Хорошо, думайте, ждем звонка», закрытие звонка на неопределенности"
    },
    "cr7": {
        "num": 7,
        "name": "Презентация через кейсы и цифры",
        "short_name": "Кейсы",
        "weight": 1.0,
        "priority": "🟡 P1 (Высокий)",
        "description": "Приведение аналогичных проектов, оцифрованных результатов и сроков возврата",
        "defect_marker": "Абстрактные фразы «мы надежные», «у нас качество» без реальных фактов"
    },
    "cr8": {
        "num": 8,
        "name": "Попытка закрытия сделки",
        "short_name": "Закрытие",
        "weight": 1.5,
        "priority": "🔴 P0 (Критический)",
        "description": "Прямое предложение заключить договор, забронировать слот аудита или оплатить счет",
        "defect_marker": "Разговор прошел тепло, но менеджер не предложил сделать шаг к оплате"
    },
    "cr9": {
        "num": 9,
        "name": "Регламент приветствия и повестка",
        "short_name": "Привет.",
        "weight": 0.8,
        "priority": "🟢 P2 (Стандарт)",
        "description": "Представление имени, компании, уточнение времени и согласование цели звонка",
        "defect_marker": "Невнятное приветствие, вопрос «Удобно говорить?» без обозначения повестки"
    },
    "cr10": {
        "num": 10,
        "name": "Чистота речи и уверенность",
        "short_name": "Речь",
        "weight": 0.8,
        "priority": "🟢 P2 (Стандарт)",
        "description": "Отсутствие слов-паразитов, пауз и извиняющихся интонаций при чеке",
        "defect_marker": "Дрожащий голос при озвучивании цены, слова неуверенности («наверное», «может»)"
    },
    "cr11": {
        "num": 11,
        "name": "Слушание клиента (Talk/Listen)",
        "short_name": "Слушан.",
        "weight": 1.2,
        "priority": "🟡 P1 (Высокий)",
        "description": "Менеджер слушает клиента не менее 45–50% общего времени разговора",
        "defect_marker": "Монолог менеджера > 70% времени: клиент молчит и теряет внимание"
    },
    "cr12": {
        "num": 12,
        "name": "Фиксация договорённостей",
        "short_name": "Итог",
        "weight": 1.0,
        "priority": "🟢 P2 (Стандарт)",
        "description": "Резюмирование договоренностей перед завершением: кто, что и когда делает",
        "defect_marker": "Диалог оборвался, у клиента и менеджера разное понимание шагов"
    },
    "cr13": {
        "num": 13,
        "name": "Защита маржинальности",
        "short_name": "Маржа",
        "weight": 1.5,
        "priority": "🔴 P0 (Критический)",
        "description": "Отсутствие необоснованных скидок без встречных уступок по объему или предоплате",
        "defect_marker": "Раздача скидок из маржи без требования 100% оплаты или большего объема"
    },
}

# 4. SLA_MATRIX (TR-01..TR-05 с нормативами и эскалациями L1/L2/L3)
SLA_MATRIX = [
    {
        "transition_id": "TR-01",
        "from_stage": "1. Новый лид",
        "to_stage": "2. Квалификация / ЛПР",
        "sla_norm_hours": 24.0,
        "escalation_L1_h": 20.0,
        "escalation_L2_h": 24.0,
        "escalation_L3_h": 36.0,
        "escalation_owner_L1": "Менеджер",
        "escalation_owner_L2": "РОП",
        "escalation_owner_L3": "Коммерческий директор",
    },
    {
        "transition_id": "TR-02",
        "from_stage": "2. Квалификация / ЛПР",
        "to_stage": "3. Встреча / Демо",
        "sla_norm_hours": 48.0,
        "escalation_L1_h": 36.0,
        "escalation_L2_h": 48.0,
        "escalation_L3_h": 72.0,
        "escalation_owner_L1": "Менеджер",
        "escalation_owner_L2": "РОП",
        "escalation_owner_L3": "Коммерческий директор",
    },
    {
        "transition_id": "TR-03",
        "from_stage": "3. Встреча / Демо",
        "to_stage": "4. КП и согласование",
        "sla_norm_hours": 120.0,
        "escalation_L1_h": 96.0,
        "escalation_L2_h": 120.0,
        "escalation_L3_h": 168.0,
        "escalation_owner_L1": "Менеджер",
        "escalation_owner_L2": "РОП",
        "escalation_owner_L3": "Генеральный директор",
    },
    {
        "transition_id": "TR-04",
        "from_stage": "4. КП и согласование",
        "to_stage": "5. Счет выставлен",
        "sla_norm_hours": 48.0,
        "escalation_L1_h": 36.0,
        "escalation_L2_h": 48.0,
        "escalation_L3_h": 72.0,
        "escalation_owner_L1": "Менеджер",
        "escalation_owner_L2": "РОП",
        "escalation_owner_L3": "Финансовый директор",
    },
    {
        "transition_id": "TR-05",
        "from_stage": "5. Счет выставлен",
        "to_stage": "6. Успешно реализовано",
        "sla_norm_hours": 72.0,
        "escalation_L1_h": 60.0,
        "escalation_L2_h": 72.0,
        "escalation_L3_h": 120.0,
        "escalation_owner_L1": "Менеджер",
        "escalation_owner_L2": "Финансовый директор",
        "escalation_owner_L3": "Генеральный директор",
    },
]

# 5. LOSS_CODES (L1–L4 с вероятностями реактивации)
LOSS_CODES = {
    "L1": {"code": "L1", "reason": "Дорого / нет бюджета", "reactivation_prob": 0.50},
    "L2": {"code": "L2", "reason": "Выбрали конкурента", "reactivation_prob": 0.35},
    "L3": {"code": "L3", "reason": "Не формат / нет потребности", "reactivation_prob": 0.10},
    "L4": {"code": "L4", "reason": "Потеря контакта / недозвон", "reactivation_prob": 0.20},
}

# 6. CAPACITY_LIMITS (Нормативная емкость открытых сделок на сотрудника)
CAPACITY_LIMITS = {
    "ROP": 5,     # Лимит открытых сделок РОПа
    "KAM": 25,    # Лимит КАМа
    "SDR": 40,    # Лимит SDR
}

# 7. PRICING_MODULES (MOD-01..MOD-08 с тарифами и ценами)
PRICING_MODULES = [
    {
        "code": "MOD-01",
        "name": "🎙️ Речевой ИИ-Супервайзер 100% звонков (Whisper + DeepSeek)",
        "status": "ВКЛЮЧЕН",
        "tier": "Light",
        "price_rub_month": 29000,
    },
    {
        "code": "MOD-02",
        "name": "⚡ Мгновенные алерты в Telegram (30с со сценарием спасения)",
        "status": "ВКЛЮЧЕН",
        "tier": "Pro",
        "price_rub_month": 15000,
    },
    {
        "code": "MOD-03",
        "name": "🤖 Автозаполнение CRM (Executive Summary + договоренности)",
        "status": "ВКЛЮЧЕН",
        "tier": "Pro",
        "price_rub_month": 19000,
    },
    {
        "code": "MOD-04",
        "name": "🛡️ Пакет «Антисаботаж» и Режим «Адвокат менеджера»",
        "status": "ВКЛЮЧЕН",
        "tier": "Pro",
        "price_rub_month": 15000,
    },
    {
        "code": "MOD-05",
        "name": "🎯 Контроль 13 B2B-стандартов речи и жесткого Next Step",
        "status": "ВКЛЮЧЕН",
        "tier": "Pro",
        "price_rub_month": 25000,
    },
    {
        "code": "MOD-06",
        "name": "📊 Пульт РОПа 15 минут: утренний радар сливов и лидерборд",
        "status": "ВКЛЮЧЕН",
        "tier": "Pro",
        "price_rub_month": 35000,
    },
    {
        "code": "MOD-07",
        "name": "🔐 Контур безопасности 152-ФЗ и токенизация биометрии",
        "status": "ВКЛЮЧЕН",
        "tier": "Enterprise",
        "price_rub_month": 25000,
    },
    {
        "code": "MOD-08",
        "name": "📄 Executive OnePager генератор для Собственника и CFO",
        "status": "ВКЛЮЧЕН",
        "tier": "Enterprise",
        "price_rub_month": 20000,
    },
]

# 8. RBAC_MATRIX (45 листов × 7 ролей: 👁 / ✏️ / ⛔)
# Загружается из оригинального листа 🔐 RBAC_Matrix
RBAC_MATRIX: dict[str, dict[str, Any]] = {
    "⚙️ Настройки": {"category": "Системные", "always_visible": True, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "👁", "📞 SDR": "👁", "🌐 CMO": "👁", "💳 CFO": "👁", "🔧 Admin": "✏️"}},
    "📄 Executive_OnePager": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "👁", "🔧 Admin": "👁"}},
    "⚡ Пульс_Компании": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "👁", "📞 SDR": "👁", "🌐 CMO": "👁", "💳 CFO": "👁", "🔧 Admin": "👁"}},
    "📋 Пульт_РОПа_15_Минут": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "👁", "📞 SDR": "👁", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "💸 Диагностика_Утечек_ОП": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "👁", "🔧 Admin": "👁"}},
    "🎯 Action_Center": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "👁", "📞 SDR": "👁", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "🎙️ ИИ_Аудит": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "⚡ Экспресс_Калькулятор_3_Цифры": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "👁", "📞 SDR": "👁", "🌐 CMO": "👁", "💳 CFO": "👁", "🔧 Admin": "👁"}},
    "🧪 QA_Suite": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "🌐 Мультиканальная_Атрибуция": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "✏️", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "💳 Финансы_и_AI_Дожим": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "✏️", "🔧 Admin": "👁"}},
    "👥 Мотивация_ОП": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "👁", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "👁", "🔧 Admin": "👁"}},
    "🔮 Симулятор_Роста": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "✏️", "📋 РОП": "👁", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "✏️", "💳 CFO": "👁", "🔧 Admin": "👁"}},
    "🗄️ DWH_и_Безопасность": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "🌐 Сквозная_RevOps_Аналитика": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "👁", "💳 CFO": "👁", "🔧 Admin": "👁"}},
    "🌐 Маркетинг_и_Трафик": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "✏️", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "📈 Когорты_LTV": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "👁", "💳 CFO": "✏️", "🔧 Admin": "👁"}},
    "👥 Ресурсный_План": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "👁", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "🎯 Воронка_и_SLA": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "👁", "📞 SDR": "👁", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "📊 Юнит_Экономика": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "👁", "💳 CFO": "✏️", "🔧 Admin": "👁"}},
    "🚨 Радар_Алертов": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "📋 Задачи_и_Спринты": {"category": "Витрины", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "👁", "📞 SDR": "👁", "🌐 CMO": "👁", "💳 CFO": "👁", "🔧 Admin": "✏️"}},
    "📅 Deal_Event_Log": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "📊 Stage_History": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "⏱️ SLA_Matrix": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "✏️", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "👁"}},
    "📊 Data_Quality": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "👁", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "changelog": {"category": "Системные", "always_visible": True, "permissions": {"👑 CEO": "👁", "📋 РОП": "👁", "💼 KAM": "👁", "📞 SDR": "👁", "🌐 CMO": "👁", "💳 CFO": "👁", "🔧 Admin": "👁"}},
    "🔐 RBAC_Matrix": {"category": "Системные", "always_visible": False, "permissions": {"👑 CEO": "✏️", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "calc_engine": {"category": "Calc", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "calc_sales": {"category": "Calc", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "calc_marketing": {"category": "Calc", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "calc_finance": {"category": "Calc", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "calc_simulator": {"category": "Calc", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "raw_deals": {"category": "Raw", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "raw_calls": {"category": "Raw", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "raw_invoices": {"category": "Raw", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "raw_marketing": {"category": "Raw", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "raw_touchpoints": {"category": "Raw", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "raw_payments": {"category": "Raw", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "raw_alerts": {"category": "Raw", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "raw_audit_log": {"category": "Raw", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "🛠️ Apps_Script_Console": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "🔐 Code_Archive": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "📋 Data_Contract": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
    "🆔 ID_Registry": {"category": "Служебные", "always_visible": False, "permissions": {"👑 CEO": "⛔", "📋 РОП": "⛔", "💼 KAM": "⛔", "📞 SDR": "⛔", "🌐 CMO": "⛔", "💳 CFO": "⛔", "🔧 Admin": "✏️"}},
}

# 9. ROLE_LANDING_MAP (Целевые посадочные страницы по ролям пользователей)
ROLE_LANDING_MAP = {
    "ceo": {"role": "👑 CEO", "sheet": "📄 Executive_OnePager", "landing_sheet": "📄 Executive_OnePager", "route": "/one-pager"},
    "rop": {"role": "📋 РОП", "sheet": "📋 Пульт_РОПа_15_Минут", "landing_sheet": "📋 Пульт_РОПа_15_Минут", "route": "/rop-pult"},
    "kam": {"role": "💼 KAM", "sheet": "⚡ Пульс_Компании", "landing_sheet": "⚡ Пульс_Компании", "route": "/pulse"},
    "sdr": {"role": "📞 SDR", "sheet": "⚡ Пульс_Компании", "landing_sheet": "⚡ Пульс_Компании", "route": "/pulse"},
    "cmo": {"role": "🌐 CMO", "sheet": "🌐 Маркетинг_и_Трафик", "landing_sheet": "🌐 Маркетинг_и_Трафик", "route": "/marketing"},
    "cfo": {"role": "💳 CFO", "sheet": "💳 Финансы_и_AI_Дожим", "landing_sheet": "💳 Финансы_и_AI_Дожим", "route": "/finance"},
    "admin": {"role": "🔧 Admin", "sheet": "⚙️ Настройки", "landing_sheet": "⚙️ Настройки", "route": "/settings"},
}

# Персональный маппинг пользователей (USERS_ROLES_MAP)
USERS_ROLES_MAP = [
    {"email": "ceo@company.com", "role": "👑 CEO", "landing_sheet": "📄 Executive_OnePager", "route": "/one-pager"},
    {"email": "rop@company.com", "role": "📋 РОП", "landing_sheet": "📋 Пульт_РОПа_15_Минут", "route": "/rop-pult"},
    {"email": "kam@company.com", "role": "💼 KAM", "landing_sheet": "⚡ Пульс_Компании", "route": "/pulse"},
    {"email": "sdr@company.com", "role": "📞 SDR", "landing_sheet": "⚡ Пульс_Компании", "route": "/pulse"},
    {"email": "cmo@company.com", "role": "🌐 CMO", "landing_sheet": "🌐 Маркетинг_и_Трафик", "route": "/marketing"},
    {"email": "cfo@company.com", "role": "💳 CFO", "landing_sheet": "💳 Финансы_и_AI_Дожим", "route": "/finance"},
    {"email": "admin@company.com", "role": "🔧 Admin", "landing_sheet": "⚙️ Настройки", "route": "/settings"},
]


def check_sheet_access(role_name: str, sheet_name: str) -> str:
    """Returns '👁' (read), '✏️' (edit), or '⛔' (denied)."""
    sheet_info = RBAC_MATRIX.get(sheet_name)
    if not sheet_info:
        return "⛔"
    if sheet_info.get("always_visible"):
        return sheet_info["permissions"].get(role_name, "👁")
    return sheet_info["permissions"].get(role_name, "⛔")
