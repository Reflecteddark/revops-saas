"""
7 Deadly Sins of Sales (Диагностический аудит 7 смертных грехов ОП).
Calculates lost revenue in rubles (₽) across the 7 critical funnel bottlenecks.
"""

from dataclasses import dataclass
from typing import Any


@dataclass
class DiagnosticMetric:
    sin_id: int
    name: str
    description: str
    benchmark: str
    current_value: float
    unit: str
    lost_revenue_rub: float
    severity: str  # 'CRITICAL', 'WARNING', 'HEALTHY'
    action_plan: str


def calculate_seven_sins(
    monthly_leads: int,
    avg_ticket_rub: float,
    current_conversion_pct: float,
    avg_first_response_min: float = 45.0,
    deals_without_next_step_pct: float = 38.0,
    stalled_deals_pct: float = 42.0,
    unworked_lost_deals_pct: float = 85.0,
    objection_drop_pct: float = 52.0,
    script_breach_pct: float = 34.0,
    rep_load_variance_pct: float = 45.0,
) -> dict[str, Any]:
    """
    Evaluates pipeline health against 7 production bottlenecks from V17.6:
    1. Скорость первого контакта (SLA response time)
    2. Отсутствие следующего шага (No Next Step)
    3. Зависание на этапах (Stalled deals / Long cycle)
    4. Кладбище отказников (Unworked lost deals)
    5. Слив на возражениях (Poor objection handling)
    6. Несоблюдение регламентов/скрипта (Script breach)
    7. Перекос нагрузки менеджеров (Rep capacity disparity)
    """
    total_potential_revenue = monthly_leads * avg_ticket_rub * (current_conversion_pct / 100.0)

    # 1. First Response SLA (>15 min causes severe decay)
    sin1_lost = 0.0
    if avg_first_response_min > 15:
        decay_factor = min(0.35, (avg_first_response_min - 15) * 0.008)
        sin1_lost = total_potential_revenue * decay_factor
    sin1_sev = "CRITICAL" if avg_first_response_min > 30 else ("WARNING" if avg_first_response_min > 15 else "HEALTHY")

    # 2. Deals without Next Step
    sin2_lost = (deals_without_next_step_pct / 100.0) * total_potential_revenue * 0.28
    sin2_sev = "CRITICAL" if deals_without_next_step_pct > 25 else ("WARNING" if deals_without_next_step_pct > 10 else "HEALTHY")

    # 3. Stalled Deals (>SLA duration in stage)
    sin3_lost = (stalled_deals_pct / 100.0) * total_potential_revenue * 0.22
    sin3_sev = "CRITICAL" if stalled_deals_pct > 30 else ("WARNING" if stalled_deals_pct > 15 else "HEALTHY")

    # 4. Unworked Lost Deals (Database cemetery)
    monthly_lost_count = monthly_leads * (1 - current_conversion_pct / 100.0)
    sin4_lost = monthly_lost_count * (unworked_lost_deals_pct / 100.0) * avg_ticket_rub * 0.035
    sin4_sev = "CRITICAL" if unworked_lost_deals_pct > 70 else ("WARNING" if unworked_lost_deals_pct > 40 else "HEALTHY")

    # 5. Objection Drop
    sin5_lost = (objection_drop_pct / 100.0) * total_potential_revenue * 0.20
    sin5_sev = "CRITICAL" if objection_drop_pct > 40 else ("WARNING" if objection_drop_pct > 25 else "HEALTHY")

    # 6. Script Non-compliance
    sin6_lost = (script_breach_pct / 100.0) * total_potential_revenue * 0.15
    sin6_sev = "CRITICAL" if script_breach_pct > 30 else ("WARNING" if script_breach_pct > 15 else "HEALTHY")

    # 7. Rep Load Variance
    sin7_lost = (rep_load_variance_pct / 100.0) * total_potential_revenue * 0.12
    sin7_sev = "CRITICAL" if rep_load_variance_pct > 35 else ("WARNING" if rep_load_variance_pct > 20 else "HEALTHY")

    metrics = [
        DiagnosticMetric(
            sin_id=1,
            name="Медленный первый контакт",
            description="Лиды остывают при времени первого отклика более 15 минут.",
            benchmark="≤ 15 мин",
            current_value=round(avg_first_response_min, 1),
            unit="мин",
            lost_revenue_rub=round(sin1_lost, 2),
            severity=sin1_sev,
            action_plan="Внедрить автораспределение лидов и SLA-таймеры в Telegram."
        ),
        DiagnosticMetric(
            sin_id=2,
            name="Сделки без следующего шага",
            description="Менеджер завершил звонок, не назначив точную дату и время контакта.",
            benchmark="≤ 5%",
            current_value=round(deals_without_next_step_pct, 1),
            unit="%",
            lost_revenue_rub=round(sin2_lost, 2),
            severity=sin2_sev,
            action_plan="Включить жесткий запрет в CRM на перевод сделки без даты следующего шага."
        ),
        DiagnosticMetric(
            sin_id=3,
            name="Зависание на этапах воронки",
            description="Сделки находятся на этапе дольше утвержденного регламента SLA.",
            benchmark="≤ 15%",
            current_value=round(stalled_deals_pct, 1),
            unit="%",
            lost_revenue_rub=round(sin3_lost, 2),
            severity=sin3_sev,
            action_plan="Пульт РОПа '15 минут в день' для эскалации подвисших сделок."
        ),
        DiagnosticMetric(
            sin_id=4,
            name="Кладбище отказников",
            description="Сделки в статусе 'Закрыто и не реализовано' не реактивируются.",
            benchmark="≤ 30%",
            current_value=round(unworked_lost_deals_pct, 1),
            unit="%",
            lost_revenue_rub=round(sin4_lost, 2),
            severity=sin4_sev,
            action_plan="Запустить AI-дожим отказников через триггерные цепочки Reverse ETL."
        ),
        DiagnosticMetric(
            sin_id=5,
            name="Слив на этапе возражений",
            description="Менеджеры отпускают клиента при первом 'дорого' или 'подумаю'.",
            benchmark="≤ 20%",
            current_value=round(objection_drop_pct, 1),
            unit="%",
            lost_revenue_rub=round(sin5_lost, 2),
            severity=sin5_sev,
            action_plan="Речевой ИИ-аудит звонков с фокусом на критерий 'Отработка возражений'."
        ),
        DiagnosticMetric(
            sin_id=6,
            name="Несоблюдение скрипта звонка",
            description="Пропуск этапа квалификации и выявления болей клиента.",
            benchmark="≤ 10%",
            current_value=round(script_breach_pct, 1),
            unit="%",
            lost_revenue_rub=round(sin6_lost, 2),
            severity=sin6_sev,
            action_plan="Автоматический скоринг звонков по 13 параметрам и разбор ошибок."
        ),
        DiagnosticMetric(
            sin_id=7,
            name="Дисбаланс нагрузки менеджеров",
            description="Одни менеджеры перегружены и сливают лиды, другие простаивают.",
            benchmark="≤ 15%",
            current_value=round(rep_load_variance_pct, 1),
            unit="%",
            lost_revenue_rub=round(sin7_lost, 2),
            severity=sin7_sev,
            action_plan="Динамическая маршрутизация лидов по матрице емкости (Capacity Planning)."
        ),
    ]

    total_lost_rub = sum(m.lost_revenue_rub for m in metrics)

    return {
        "monthly_potential_revenue_rub": round(total_potential_revenue, 2),
        "total_lost_revenue_rub": round(total_lost_rub, 2),
        "recoverable_revenue_rub": round(total_lost_rub * 0.65, 2),  # 65% устранимо за 60 дней
        "metrics": [m.__dict__ for m in metrics],
        "overall_health_score": max(10, min(100, int(100 - (total_lost_rub / (total_potential_revenue + 1e-6)) * 40))),
    }
