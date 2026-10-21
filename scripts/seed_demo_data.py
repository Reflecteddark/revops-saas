"""
Seed Demo Data for RevOps Enterprise OS.
Generates isolated demo data for self-serve onboarding:
- 1 Tenant + Default Workspace
- 5 Sales Managers (User records with hashed passwords & roles)
- 30 Deals across stages (total sum ~10M ₽)
- 200 Calls (including 20 'yesterday leaks' with status='risk' and next_step=0)
- 13 scorecard criteria per call
"""

import argparse
import hashlib
import json
import logging
import os
import random
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# UTF-8 stdout configuration for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from packages.database.models import (
    CallRecording,
    Deal,
    DealStage,
    SubscriptionTier,
    Tenant,
    User,
    UserRole,
    Workspace,
)
from packages.database.session import SessionLocal, init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_demo_data")


# 5 Realistic Sales Managers
MANAGERS_SPEC = [
    {"name": "Дмитрий Федотов", "role": UserRole.ROP, "slug": "fedotov"},
    {"name": "Светлана Кузнецова", "role": UserRole.KAM, "slug": "kuznetsova"},
    {"name": "Иван Смирнов", "role": UserRole.KAM, "slug": "smirnov"},
    {"name": "Алексей Новиков", "role": UserRole.SDR, "slug": "novikov"},
    {"name": "Екатерина Морозова", "role": UserRole.KAM, "slug": "morozova"},
]

# 30 Realistic B2B Deals (~10M ₽ total)
DEALS_SPEC = [
    # WON (6 deals, ~3.17M ₽)
    {"company": "ООО 'ТехноТрейд'", "title": "Внедрение RevOps OS — ООО 'ТехноТрейд'", "amount": 350000, "stage": DealStage.WON, "sla_risk": False},
    {"company": "АО 'Северсталь Инвест'", "title": "Лицензии Enterprise — АО 'Северсталь Инвест'", "amount": 550000, "stage": DealStage.WON, "sla_risk": False},
    {"company": "ГК 'Альфа-Логистик'", "title": "Речевая аналитика 50 мест — ГК 'Альфа-Логистик'", "amount": 480000, "stage": DealStage.WON, "sla_risk": False},
    {"company": "ООО 'Ритейл Групп'", "title": "Интеграция с amoCRM — ООО 'Ритейл Групп'", "amount": 620000, "stage": DealStage.WON, "sla_risk": False},
    {"company": "ООО 'МедТехнолоджис'", "title": "Пилот речевого аудита — ООО 'МедТехнолоджис'", "amount": 420000, "stage": DealStage.WON, "sla_risk": False},
    {"company": "АО 'ИнвестКапитал'", "title": "Годовая подписка RevOps — АО 'ИнвестКапитал'", "amount": 750000, "stage": DealStage.WON, "sla_risk": False},

    # LOST (4 deals, ~1.20M ₽)
    {"company": "ООО 'СтройИнжиниринг'", "title": "Аудит отдела продаж — ООО 'СтройИнжиниринг'", "amount": 320000, "stage": DealStage.LOST, "sla_risk": True, "risk_reason": "Слив на возражениях 'дорого'"},
    {"company": "ООО 'ПромСнаб'", "title": "Внедрение скоринга — ООО 'ПромСнаб'", "amount": 280000, "stage": DealStage.LOST, "sla_risk": True, "risk_reason": "Уход к конкуренту"},
    {"company": "ООО 'ЭкоТранс'", "title": "Автоматизация ОП — ООО 'ЭкоТранс'", "amount": 210000, "stage": DealStage.LOST, "sla_risk": True, "risk_reason": "Заморозка бюджета"},
    {"company": "ЗАО 'АгроХолдинг Юг'", "title": "Настройка телефонии — ЗАО 'АгроХолдинг Юг'", "amount": 390000, "stage": DealStage.LOST, "sla_risk": True, "risk_reason": "ЛПР не выходит на связь"},

    # CONTRACT_PAYMENT (3 deals, ~1.38M ₽)
    {"company": "ООО 'Вектор Безопасности'", "title": "Договор на внедрение — ООО 'Вектор Безопасности'", "amount": 340000, "stage": DealStage.CONTRACT_PAYMENT, "sla_risk": False},
    {"company": "ООО 'Сибирь-Экспорт'", "title": "Согласование спецификации — ООО 'Сибирь-Экспорт'", "amount": 460000, "stage": DealStage.CONTRACT_PAYMENT, "sla_risk": False},
    {"company": "АО 'НефтеХимСервис'", "title": "Счет на оплату ПО — АО 'НефтеХимСервис'", "amount": 580000, "stage": DealStage.CONTRACT_PAYMENT, "sla_risk": False},

    # DECISION_MAKING (3 deals, ~1.03M ₽)
    {"company": "ООО 'Диджитал Про'", "title": "Финальное согласование — ООО 'Диджитал Про'", "amount": 290000, "stage": DealStage.DECISION_MAKING, "sla_risk": True, "risk_reason": "Просрочен SLA этапа (5 дней)"},
    {"company": "ГК 'Монолит-Бетон'", "title": "Защита проекта перед СЕО — ГК 'Монолит-Бетон'", "amount": 410000, "stage": DealStage.DECISION_MAKING, "sla_risk": False},
    {"company": "ООО 'ГлавАвтоТорг'", "title": "Тендерная документация — ООО 'ГлавАвтоТорг'", "amount": 330000, "stage": DealStage.DECISION_MAKING, "sla_risk": True, "risk_reason": "Нет даты следующего шага"},

    # COMMERCIAL_PROPOSAL (5 deals, ~1.88M ₽)
    {"company": "ООО 'УралЭнергоМаш'", "title": "КП на 10 рабочих мест — ООО 'УралЭнергоМаш'", "amount": 450000, "stage": DealStage.COMMERCIAL_PROPOSAL, "sla_risk": True, "risk_reason": "Слив: КП отправлено без дедлайна звонка"},
    {"company": "АО 'Фарма-Дистрибьюшн'", "title": "Индивидуальный расчет — АО 'Фарма-Дистрибьюшн'", "amount": 370000, "stage": DealStage.COMMERCIAL_PROPOSAL, "sla_risk": False},
    {"company": "ООО 'Телеком Коннект'", "title": "Презентация кейсов — ООО 'Телеком Коннект'", "amount": 260000, "stage": DealStage.COMMERCIAL_PROPOSAL, "sla_risk": True, "risk_reason": "Менеджер не согласовал дату Zoom"},
    {"company": "ООО 'БалтТрансЛайн'", "title": "КП на аналитику — ООО 'БалтТрансЛайн'", "amount": 310000, "stage": DealStage.COMMERCIAL_PROPOSAL, "sla_risk": False},
    {"company": "ООО 'МетПромГрупп'", "title": "Смета на интеграцию — ООО 'МетПромГрупп'", "amount": 490000, "stage": DealStage.COMMERCIAL_PROPOSAL, "sla_risk": True, "risk_reason": "Клиент ушел 'думать', нет фиксации"},

    # MEETING_SCHEDULED (5 deals, ~1.42M ₽)
    {"company": "ООО 'СмартСофтЛаб'", "title": "Демо-встреча в Zoom — ООО 'СмартСофтЛаб'", "amount": 240000, "stage": DealStage.MEETING_SCHEDULED, "sla_risk": False},
    {"company": "ООО 'ПромВентиляция'", "title": "КЭВ по речевой аналитике — ООО 'ПромВентиляция'", "amount": 310000, "stage": DealStage.MEETING_SCHEDULED, "sla_risk": False},
    {"company": "АО 'РосИнтерЛогистик'", "title": "Презентация РОПу — АО 'РосИнтерЛогистик'", "amount": 380000, "stage": DealStage.MEETING_SCHEDULED, "sla_risk": True, "risk_reason": "Срыв времени встречи вчера"},
    {"company": "ООО 'Восток-Цемент'", "title": "Онлайн-показ дашборда — ООО 'Восток-Цемент'", "amount": 270000, "stage": DealStage.MEETING_SCHEDULED, "sla_risk": False},
    {"company": "ООО 'ПрофКлимат'", "title": "КЭВ / Защита КП — ООО 'ПрофКлимат'", "amount": 220000, "stage": DealStage.MEETING_SCHEDULED, "sla_risk": True, "risk_reason": "Менеджер не отправил ссылку"},

    # QUALIFICATION (4 deals, ~0.86M ₽)
    {"company": "ООО 'Авангард Консалтинг'", "title": "Квалификация лида — ООО 'Авангард Консалтинг'", "amount": 190000, "stage": DealStage.QUALIFICATION, "sla_risk": False},
    {"company": "ООО 'СпецОдежда Опт'", "title": "Первичный звонок — ООО 'СпецОдежда Опт'", "amount": 180000, "stage": DealStage.QUALIFICATION, "sla_risk": True, "risk_reason": "Не квалифицирован бюджет"},
    {"company": "ООО 'Торговый Дом Союз'", "title": "Входящая заявка — ООО 'Торговый Дом Союз'", "amount": 230000, "stage": DealStage.QUALIFICATION, "sla_risk": False},
    {"company": "АО 'СвязьСтройХолдинг'", "title": "Скоринг профиля клиента — АО 'СвязьСтройХолдинг'", "amount": 260000, "stage": DealStage.QUALIFICATION, "sla_risk": False},
]

# Leak scenarios for the 20 yesterday calls
YESTERDAY_LEAK_SCENARIOS = [
    {
        "error": "Отпустил клиента 'подумать' без согласования даты и времени следующего звонка.",
        "rec": "Зафиксировать точный слот: «Иван Иванович, давайте в четверг в 14:00 созвонимся на 10 минут для финализации сметы».",
        "transcript": "Менеджер: 'Посмотрите наше коммерческое предложение, и если что — наберите меня.' Клиент: 'Хорошо, на досуге гляну, до свидания.'",
    },
    {
        "error": "Слив на возражении 'дорого': менеджер начал оправдываться и сбросил цену на 30% без защиты ценности.",
        "rec": "Уточнить критерии: «С чем сравниваете по цене? Давайте сравним наполнение решения, чтобы не переплачивать за переделки».",
        "transcript": "Клиент: 'У вас 450 тысяч, у других видел за 250.' Менеджер: 'Ну... мы можем сделать скидку... давайте за 300 отдадим?'",
    },
    {
        "error": "Не закрыл встречу после презентации: не назначен КЭВ / Zoom с ЛПР.",
        "rec": "Переводить на ключевой этап воронки: назначить онлайн-демонстрацию экрана с демонстрацией ROI.",
        "transcript": "Менеджер: 'Я вам все рассказал, скину презентацию на почту.' Клиент: 'Спасибо, передам руководству.'",
    },
    {
        "error": "Отсутствие квалификации ЛПР: 15 минут презентовал продукт секретарю без выявления лица, принимающего решения.",
        "rec": "С первых минут уточнять: «Подскажите, с кем помимо вас мы будем согласовывать финансовую часть проекта?».",
        "transcript": "Менеджер: 'Здравствуйте! У нас революционная речевая аналитика...' Собеседник: 'Я помощник секретаря, напишите нам на info@...'",
    },
    {
        "error": "Монолог менеджера (баланс эфира 82%): клиент потерял интерес и завершил разговор.",
        "rec": "Держать правило диалога: открытый вопрос каждые 40 секунд, баланс менеджера ≤ 45%.",
        "transcript": "Менеджер: [монолог 4 минуты без пауз о функциях системы] Клиент: 'Извините, мне некогда, пришлите письмо.'",
    },
]


def generate_phone_number() -> str:
    code = random.choice(["916", "925", "903", "985", "926", "977", "909", "999", "915"])
    num1 = random.randint(100, 999)
    num2 = random.randint(10, 99)
    num3 = random.randint(10, 99)
    return f"+7 ({code}) {num1}-{num2}-{num3}"


def seed_demo_data(tenant_id: str = "demo_test", db = None) -> dict:
    """
    Populates an isolated tenant with complete demo data:
    5 managers, 30 deals (~10M ₽), and 200 calls (with 20 yesterday leaks).
    """
    should_close = False
    if db is None:
        init_db()
        db = SessionLocal()
        should_close = True

    try:
        clean_tenant_id = tenant_id.strip()
        slug = re.sub(r"[^a-z0-9_-]", "", clean_tenant_id.lower().replace(" ", "-"))
        if not slug:
            slug = f"demo-{uuid.uuid4().hex[:6]}"

        logger.info(f"🌱 [Seed Demo Data] Инициализация демо-контура для тенанта: '{clean_tenant_id}' (slug: {slug})")

        # 1. Tenant lookup or creation
        tenant = db.query(Tenant).filter(Tenant.id == clean_tenant_id).first()
        if not tenant:
            tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
        
        if not tenant:
            tenant = Tenant(
                id=clean_tenant_id,
                name=f"Демо-компания ({clean_tenant_id})",
                slug=slug,
                tier=SubscriptionTier.PRO,
                max_seats=15,
                ai_minutes_quota=3000,
                ai_minutes_used=420,
                is_active=True,
                settings={
                    "crm_type": "amocrm",
                    "niche_name": "B2B Продажи & Оборудование",
                    "avg_deal_check": 350000,
                    "target_next_step": "Фиксация Zoom с датой и временем",
                    "is_demo": True,
                    "status": "active"
                }
            )
            db.add(tenant)
            db.flush()
            logger.info(f"✅ Создан тенант: {tenant.name} (ID: {tenant.id})")
        else:
            logger.info(f"ℹ️ Используется существующий тенант: {tenant.name} (ID: {tenant.id})")

        # 2. Workspace lookup or creation
        workspace = db.query(Workspace).filter(Workspace.tenant_id == tenant.id).first()
        if not workspace:
            workspace = Workspace(
                id=f"ws_{tenant.id}_{uuid.uuid4().hex[:6]}",
                tenant_id=tenant.id,
                name="Основной отдел продаж (B2B)",
                crm_type="amocrm",
                crm_connected=True,
                settings={"pipeline_name": "Основная воронка RevOps"}
            )
            db.add(workspace)
            db.flush()
            logger.info(f"✅ Создан рабочий контур: {workspace.name}")

        # 3. Create / Update 5 Sales Managers
        import bcrypt
        default_pwd_hash = bcrypt.hashpw("DemoPassword123!".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        
        managers: list[User] = []
        for m_spec in MANAGERS_SPEC:
            email = f"{m_spec['slug']}@{tenant.id.lower()}.demo"
            user = db.query(User).filter(User.tenant_id == tenant.id, User.email == email).first()
            if not user:
                user = User(
                    id=f"usr_{tenant.id}_{m_spec['slug']}",
                    tenant_id=tenant.id,
                    email=email,
                    full_name=m_spec["name"],
                    hashed_password=default_pwd_hash,
                    role=m_spec["role"],
                    is_active=True,
                )
                db.add(user)
                db.flush()
            managers.append(user)
        logger.info(f"✅ Актуализировано 5 менеджеров ОП: {[m.full_name for m in managers]}")

        # 4. Clean prior demo deals & calls for a fresh deterministic seed
        deleted_calls = db.query(CallRecording).filter(CallRecording.tenant_id == tenant.id).delete()
        deleted_deals = db.query(Deal).filter(Deal.tenant_id == tenant.id).delete()
        if deleted_calls or deleted_deals:
            logger.info(f"🧹 Очищено предыдущих записей: {deleted_deals} сделок, {deleted_calls} звонков")
        db.flush()

        # 5. Create 30 B2B Deals (~10M ₽ total)
        deals: list[Deal] = []
        now_utc = datetime.now(timezone.utc)
        total_amount = 0.0

        for idx, d_spec in enumerate(DEALS_SPEC):
            manager = managers[idx % len(managers)]
            created_days_ago = random.randint(2, 28)
            deal_created = now_utc - timedelta(days=created_days_ago, hours=random.randint(1, 8))
            
            deal = Deal(
                id=f"deal_{tenant.id}_{idx + 1:03d}",
                tenant_id=tenant.id,
                workspace_id=workspace.id,
                assigned_user_id=manager.id,
                external_crm_id=f"AMO-{20000 + idx}",
                title=d_spec["title"],
                company_name=d_spec["company"],
                contact_phone=generate_phone_number(),
                budget=float(str(d_spec["amount"])),
                stage=d_spec["stage"],
                days_in_stage=random.randint(1, 14),
                stage_sla_days=3,
                has_next_step=not d_spec.get("sla_risk", False),
                next_step_date=deal_created + timedelta(days=2) if not d_spec.get("sla_risk", False) else None,
                is_at_risk=d_spec.get("sla_risk", False),
                risk_reason=d_spec.get("risk_reason"),
                lead_source=random.choice(["Контекст (Яндекс)", "SEO Органика", "Холодный аутрич", "Партнерский канал", "Рекомендация"]),
                avg_call_score=round(random.uniform(70.0, 95.0), 1) if not d_spec.get("sla_risk", False) else round(random.uniform(35.0, 60.0), 1),
                created_at=deal_created,
                updated_at=deal_created + timedelta(hours=random.randint(1, 24)),
            )
            db.add(deal)
            deals.append(deal)
            total_amount += float(str(d_spec["amount"]))

        db.flush()
        logger.info(f"✅ Сгенерировано 30 сделок на общую сумму: {int(total_amount):,} ₽".replace(",", " "))

        # 6. Generate 200 Calls (20 yesterday leaks + 180 normal/won/history calls)
        calls: list[CallRecording] = []
        yesterday_base = now_utc.replace(hour=11, minute=0, second=0, microsecond=0) - timedelta(days=1)

        # 6A. 20 YESTERDAY LEAKS (10% of total) -> status='risk', next_step=0, date='yesterday'
        for i in range(20):
            leak_deal = deals[i % len(deals)]
            manager = next((m for m in managers if m.id == leak_deal.assigned_user_id), managers[i % len(managers)])
            scenario = YESTERDAY_LEAK_SCENARIOS[i % len(YESTERDAY_LEAK_SCENARIOS)]

            # Timestamp strictly yesterday between 09:15 and 18:45
            call_time = yesterday_base + timedelta(hours=(i % 8) - 2, minutes=random.randint(5, 50))
            dur_sec = random.randint(75, 210)
            score_count = random.randint(3, 6)  # low score (out of 13)
            overall_pct = round((score_count / 13.0) * 100, 1)

            # 13 criteria: next_step (cr[0]) = 0, objection (cr[5]) = 0
            cr_list = [0] * 13
            # fill some basic criteria like greeting
            cr_list[0] = 0  # CRITICAL: Next step is MISSING (leak)
            cr_list[1] = 1  # Greeting passed
            cr_list[7] = 0  # Script failed
            for pos in range(2, 7):
                if random.random() > 0.6:
                    cr_list[pos] = 1

            call = CallRecording(
                id=f"call_{tenant.id}_yst_{i + 1:03d}",
                tenant_id=tenant.id,
                deal_id=leak_deal.id,
                manager_id=manager.id,
                external_call_id=f"TEL-YST-{i + 1:04d}",
                client_phone=leak_deal.contact_phone or generate_phone_number(),
                duration_seconds=dur_sec,
                status="completed",
                transcript_text=f"Аудио-запись от {call_time.strftime('%d.%m.%Y %H:%M')}\n{scenario['transcript']}",
                ai_summary=scenario["error"],
                next_action_extracted=scenario["rec"],
                overall_score=overall_pct,
                scorecard_criteria={
                    "status": "risk",
                    "status_label": "СЛИВ (НЕТ NEXT STEP)",
                    "next_step": 0,
                    "score": score_count,
                    "cr": cr_list,
                    "error_summary": scenario["error"],
                    "recommendation": scenario["rec"],
                    "amount": leak_deal.budget,
                    "client": leak_deal.company_name,
                    "manager": manager.full_name
                },
                reverse_etl_synced=True,
                created_at=call_time,
            )
            db.add(call)
            calls.append(call)

        # 6B. 180 HISTORICAL / STANDARD CALLS (won, norm, past leaks)
        for i in range(180):
            deal = deals[i % len(deals)]
            manager = next((m for m in managers if m.id == deal.assigned_user_id), managers[i % len(managers)])
            days_ago = random.randint(2, 30)
            call_time = now_utc - timedelta(days=days_ago, hours=random.randint(1, 10), minutes=random.randint(0, 55))
            dur_sec = random.randint(120, 380)

            # 70% won/high, 20% norm, 10% past risk
            call_type_rand = random.random()
            if call_type_rand < 0.70:
                score_count = random.randint(10, 13)
                next_step = 1
                status = "won"
                status_label = "ЭТАЛОН"
                cr_list = [1] * 13
                if score_count < 13:
                    for _ in range(13 - score_count):
                        cr_list[random.randint(2, 12)] = 0
                error_summary = "Звонок проведен по утвержденному регламенту"
                rec = "Продолжать ведение сделки по согласованному таймлайну"
            elif call_type_rand < 0.90:
                score_count = random.randint(8, 9)
                next_step = 1
                status = "norm"
                status_label = "НОРМА"
                cr_list = [1] * 13
                cr_list[0] = 1  # next step present
                for _ in range(13 - score_count):
                    cr_list[random.randint(2, 12)] = 0
                error_summary = "Небольшие заминки при презентации тарифной сетки"
                rec = "Увереннее озвучивать стоимость и ценность дополнительных модулей"
            else:
                score_count = random.randint(4, 7)
                next_step = 0
                status = "risk"
                status_label = "СЛИВ"
                cr_list = [0] * 13
                cr_list[1] = 1
                error_summary = "Клиент ушел без согласованного следующего шага"
                rec = "Связаться повторно и зафиксировать Zoom-встречу"

            overall_pct = round((score_count / 13.0) * 100, 1)

            call = CallRecording(
                id=f"call_{tenant.id}_hist_{i + 1:03d}",
                tenant_id=tenant.id,
                deal_id=deal.id,
                manager_id=manager.id,
                external_call_id=f"TEL-HIST-{i + 1:04d}",
                client_phone=deal.contact_phone or generate_phone_number(),
                duration_seconds=dur_sec,
                status="completed",
                transcript_text=f"Запись звонка {deal.title} ({manager.full_name}): 'Здравствуйте, обсуждаем этапы внедрения...'",
                ai_summary=error_summary,
                next_action_extracted=rec,
                overall_score=overall_pct,
                scorecard_criteria={
                    "status": status,
                    "status_label": status_label,
                    "next_step": next_step,
                    "score": score_count,
                    "cr": cr_list,
                    "error_summary": error_summary,
                    "recommendation": rec,
                    "amount": deal.budget,
                    "client": deal.company_name,
                    "manager": manager.full_name
                },
                reverse_etl_synced=True,
                created_at=call_time,
            )
            db.add(call)
            calls.append(call)

        db.commit()
        logger.info(f"✅ Успешно сохранено в БД 200 звонков (из них 20 вчерашних сливов со статусом risk)")

        # 7. Update tenants_registry.json & registered_clients.json for system-wide sync
        sync_system_registry(tenant, managers)

        result = {
            "status": "success",
            "tenant_id": tenant.id,
            "tenant_name": tenant.name,
            "managers_count": len(managers),
            "deals_count": len(deals),
            "deals_total_amount": total_amount,
            "deals_total_formatted": f"{int(total_amount):,} ₽".replace(",", " "),
            "calls_count": len(calls),
            "yesterday_leaks_count": 20,
            "database_file": str(BASE_DIR / "revops_saas.db"),
        }
        return result

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Ошибка генерации демо-данных: {e}", exc_info=True)
        raise
    finally:
        if should_close:
            db.close()


def sync_system_registry(tenant: Tenant, managers: list[User]):
    """Registers tenant and demo user credentials in local registry files if accessible."""
    reg_candidates = [
        BASE_DIR / "tenants_registry.json",
        BASE_DIR / "multitenant_revops" / "tenants_registry.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "tenants_registry.json",
    ]
    for reg_path in reg_candidates:
        if reg_path.exists():
            try:
                with open(reg_path, "r", encoding="utf-8") as f:
                    reg = json.load(f)
                tenants_list = reg.setdefault("tenants", [])
                existing = next((t for t in tenants_list if str(t.get("tenant_id", "")).upper() == tenant.id.upper()), None)
                tenant_entry = tenant.to_registry_dict()
                if existing:
                    existing.update(tenant_entry)
                else:
                    tenants_list.append(tenant_entry)
                with open(reg_path, "w", encoding="utf-8") as f:
                    json.dump(reg, f, ensure_ascii=False, indent=2)
                logger.info(f"📝 Синхронизирован tenants_registry.json: {reg_path}")
                break
            except Exception as ex:
                logger.warning(f"Не удалось обновить {reg_path}: {ex}")

    # Register default client login into registered_clients.json
    clients_candidates = [
        BASE_DIR / "data" / "registered_clients.json",
        BASE_DIR / "apps" / "api" / "registered_clients.json",
        BASE_DIR / "registered_clients.json",
    ]
    plain_password = "DemoPassword123!"
    password_hash = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    demo_login = f"{tenant.id.lower()}@ai-rop.ru"

    for cl_path in clients_candidates:
        try:
            cl_path.parent.mkdir(parents=True, exist_ok=True)
            clients = []
            if cl_path.exists():
                with open(cl_path, "r", encoding="utf-8") as f:
                    clients = json.load(f)
            
            existing_cl = next((c for c in clients if c.get("login", "").lower() == demo_login.lower()), None)
            if existing_cl:
                if password_hash not in existing_cl.get("keyHashes", []):
                    existing_cl.setdefault("keyHashes", []).append(password_hash)
                existing_cl["is_active"] = True
            else:
                clients.append({
                    "login": demo_login,
                    "keyHashes": [password_hash],
                    "name": tenant.name,
                    "role": "РОП • Руководитель ОП",
                    "tenant": f"{tenant.id} • {tenant.name}",
                    "is_system": False,
                    "is_active": True,
                    "created_at": datetime.now().isoformat()
                })
            with open(cl_path, "w", encoding="utf-8") as f:
                json.dump(clients, f, ensure_ascii=False, indent=2)
            logger.info(f"🔑 Учетные данные зарегистрированы в {cl_path} (логин: {demo_login}, пароль: {plain_password})")
            break
        except Exception as ex:
            logger.warning(f"Не удалось обновить {cl_path}: {ex}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Demo Data for RevOps Tenant")
    parser.add_argument("tenant_id", nargs="?", default="demo_test", help="Target tenant ID (default: demo_test)")
    parser.add_argument("--tenant", dest="tenant_flag", default=None, help="Target tenant ID flag")
    args = parser.parse_args()

    target_tenant = args.tenant_flag or args.tenant_id or "demo_test"
    print(f"================================================================")
    print(f"🚀 Запуск генератора демо-данных RevOps SaaS для '{target_tenant}'")
    print(f"================================================================")

    res = seed_demo_data(target_tenant)
    print("\nИТОГИ ГЕНЕРАЦИИ ДЕМО-ДАННЫХ:")
    print(json.dumps(res, ensure_ascii=False, indent=2))
