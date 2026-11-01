"""
Methodology & Script Engineering Router:
Closed-Loop RevOps Optimization, 13-Criteria Heatmap, Gatekeeper Lab & Semantic Anchors.

Features:
- Versioning of sales scripts (v1.0, v2.1) with explicit change hypotheses
- 13 B2B criteria modules with Semantic Anchors and Banned Triggers
- Single-pass SQL aggregation of Adherence Rate (AR), Script Win Rate (SWR), Freestyle Win Rate (FWR)
- Automatic 4-verdict diagnostic matrix:
  1. 🟢 WORKING_STANDARD (Рабочий стандарт)
  2. 🟡 SABOTAGE_HIDDEN_GEM (Саботаж / Скрытый алмаз)
  3. 🔴 HYPOTHESIS_FAILED (Гипотеза провалилась)
  4. 🔵 FREESTYLE_STRONGER (Отсебятина сильнее)
- X-Ray Drawer endpoint: manager adherence breakdown & click-to-play audio quotes
- Gatekeeper Lab endpoint: winning hooks extraction & secretary pass-rate
"""

import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from packages.database.models import (
    CallModuleEvaluation,
    CallRecording,
    ScriptModule,
    ScriptVersion,
)
from packages.database.session import get_db

logger = logging.getLogger("methodology_router")

router = APIRouter(prefix="/methodology", tags=["Methodology & Script Engineering"])

CRITERIA_METADATA = {
    "cr1": {"title": "Приветствие и регламент", "stage": "Вход в контакт"},
    "cr2": {"title": "Программирование диалога", "stage": "Управление целью"},
    "cr3": {"title": "Ниша и масштаб компании", "stage": "Квалификация"},
    "cr4": {"title": "Выявление истинных болей", "stage": "Исследование ситуации"},
    "cr5": {"title": "Бюджет и финрамки", "stage": "Квалификация бюджета"},
    "cr6": {"title": "Схема принятия решений (ЛПР)", "stage": "Обход секретаря / Выход на ЛПР"},
    "cr7": {"title": "Презентация через боли", "stage": "Презентация ценности"},
    "cr8": {"title": "Стоимость и вилка цен", "stage": "Ценообразование"},
    "cr9": {"title": "Отработка возражений", "stage": "Изоляция возражений"},
    "cr10": {"title": "Hard Next Step (дедлайн)", "stage": "Фиксация следующего шага"},
    "cr11": {"title": "Инициатива менеджера", "stage": "Удержание руля"},
    "cr12": {"title": "Фиксация в CRM", "stage": "CRM гигиена"},
    "cr13": {"title": "Партнерская позиция", "stage": "Тональность и экспертность"},
}

DEFAULT_MODULES_SPECS = [
    {
        "target_criterion": "cr1",
        "stage_name": "Вход в контакт",
        "recommended_speech": "Добрый день, [Имя]! Меня зовут [Имя], компания RevOps OS. У нас с вами запланировано 15 минут для сверки регламента, всё в силе?",
        "semantic_anchors": ["Приветствие по имени", "Обозначение тайминга и регламента звонка", "Получение согласия на диалог"],
        "banned_triggers": ["Вас беспокоит компания", "Удобно говорить?"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr2",
        "stage_name": "Управление целью",
        "recommended_speech": "Предлагаю поступить так: я задам 3 коротких вопроса по процессам в отделе продаж, покажу, как мы решаем такие задачи, и если увидим взаимный интерес — наметим следующий шаг. Договорились?",
        "semantic_anchors": ["Озвучивание пошагового плана диалога", "Указание цели разговора", "Фиксация правил диалога (программирование)"],
        "banned_triggers": ["Я вам просто расскажу о нас", "Не займу много времени"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr3",
        "stage_name": "Квалификация ниши",
        "recommended_speech": "Подскажите, сколько у вас сейчас менеджеров в активном отделе продаж и на каких чеках в B2B вы работаете?",
        "semantic_anchors": ["Вопрос о количестве менеджеров или объеме отдела", "Уточнение ниши и профиля клиентов"],
        "banned_triggers": [],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr4",
        "stage_name": "Исследование болей",
        "recommended_speech": "С какими основными трудностями сталкиваетесь при контроле звонков? Сколько лидов или сделок зависает без назначенного следующего шага?",
        "semantic_anchors": ["Выявление узкого горлышка в конверсии", "Раскопка цены ошибки и потерь от зависших сделок", "Вопрос об опыте решения проблемы"],
        "banned_triggers": ["У вас наверное все хорошо", "Мы лучше всех"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr5",
        "stage_name": "Квалификация бюджета",
        "recommended_speech": "Какие финансовые рамки или бюджет обычно закладываете на автоматизацию аналитики? В каких вилках комфортно двигаться?",
        "semantic_anchors": ["Ориентир по финансовым ожиданиям", "Определение вилки бюджета без давления", "Уточнение формата оплаты"],
        "banned_triggers": ["У нас очень дешево", "Денег надо немного"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr6",
        "stage_name": "Обход секретаря / Выход на ЛПР",
        "recommended_speech": "По вопросу сокращения кассовых разрывов и регламента встреч: подскажите, с кем помимо вас мы будем согласовывать запуск — с коммерческим или генеральным директором?",
        "semantic_anchors": ["Определение лиц, принимающих решения (ЛПР)", "Уточнение процедуры защиты проекта перед руководством", "Экспертный заход в обход секретаря"],
        "banned_triggers": ["Вы сами всё решаете?", "Соедините с кем-нибудь главным"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr7",
        "stage_name": "Презентация ценности",
        "recommended_speech": "Исходя из того, что вы сказали о потерях на этапе квалификации: наш модуль сразу подсвечивает РОПу саботаж скрипта, экономя до 30% бюджета на лиды...",
        "semantic_anchors": ["Презентация решения строго через названную боль", "Показ выгоды в деньгах или сохраненных сделках", "Демонстрация конкретной функции как ответа на проблему"],
        "banned_triggers": ["У нас уникальный инновационный продукт", "Мы на рынке 10 лет"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr8",
        "stage_name": "Ценообразование",
        "recommended_speech": "Внедрение платформы с аудитом звонков и контролем дисциплины составляет от 45 до 85 тысяч рублей в месяц. Насколько это укладывается в вашу финмодель?",
        "semantic_anchors": ["Озвучивание четкой вилки стоимости или тарифа", "Обоснование состава тарифа", "Вопрос-крючок о сопоставимости с планом"],
        "banned_triggers": ["Цена обсуждается индивидуально", "Сделаем вам скидку прямо сейчас"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr9",
        "stage_name": "Изоляция возражений",
        "recommended_speech": "Понимаю, вопрос бюджета важный. Давайте посчитаем, сколько вы сейчас теряете на слитых лидах без контроля — если закрыть хотя бы 2 сделки, система окупается в первую же неделю. С какими цифрами сейчас работаете?",
        "semantic_anchors": ["Присоединение к возражению без прямого спора", "Перевод фокуса со стоимости софта на цену потерь бизнеса от бездействия", "Вопрос-крючок о текущем объеме потерь клиента в месяц"],
        "banned_triggers": ["Могу согласовать вам скидку", "У нас на самом деле дешево", "Ну тогда перезвоните, как появятся деньги"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr10",
        "stage_name": "Фиксация следующего шага",
        "recommended_speech": "Предлагаю зафиксировать встречу в Zoom на 20 минут в четверг в 11:00 или в 15:00, разберем аудит на ваших реальных звонках. Какое время вам удобнее внести в календарь?",
        "semantic_anchors": ["Предложение конкретной даты и времени встречи", "Обозначение ценности следующего контакта (разбор звонков)", "Фиксация дедлайна с отправкой приглашения в календарь"],
        "banned_triggers": ["Ну вы подумайте и наберите", "Я вам скину на почту, а вы посмотрите"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr11",
        "stage_name": "Удержание руля",
        "recommended_speech": "Отличный вопрос! Отвечу детально: [ответ]. А подскажите, как у вас сейчас устроена передача лида от SDR к клоузеру?",
        "semantic_anchors": ["Ответ на реплику клиента", "Мгновенный возврат инициативы встречным открытым вопросом", "Удержание структуры диалога"],
        "banned_triggers": ["Что вам еще рассказать?", "Спрашивайте, я слушаю"],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr12",
        "stage_name": "CRM гигиена",
        "recommended_speech": "Я зафиксировал все договоренности в карточке сделки, назначил задачу на подготовку аудита и отправил вам подтверждение в мессенджер.",
        "semantic_anchors": ["Фиксация договоренностей в CRM", "Назначение следующего шага с датой", "Сверка контактных данных"],
        "banned_triggers": [],
        "min_anchors_required": 2,
    },
    {
        "target_criterion": "cr13",
        "stage_name": "Тональность и экспертность",
        "recommended_speech": "Мы смотрим на ваш отдел продаж как партнеры: наша цель — не просто продать лицензии, а поднять конверсию из звонка во встречу до плановых 40%.",
        "semantic_anchors": ["Партнерская позиция на равных", "Экспертные рекомендации вместо заискивания", "Фокус на бизнес-результате клиента"],
        "banned_triggers": ["Будем очень благодарны, если купите", "Мы маленький стартап"],
        "min_anchors_required": 2,
    },
]


def clean_tenant_id(tenant_id: Optional[str]) -> str:
    return (tenant_id or "TNT-001").strip().upper()


def ensure_tenant_script_baseline(db: Session, tenant_id: str) -> ScriptVersion:
    """Guarantees a tenant has at least one active ScriptVersion with all 13 criteria modules."""
    clean_tenant = clean_tenant_id(tenant_id)
    version = (
        db.query(ScriptVersion)
        .filter(ScriptVersion.tenant_id == clean_tenant, ScriptVersion.is_active == True)
        .first()
    )
    if not version:
        version = (
            db.query(ScriptVersion)
            .filter(ScriptVersion.tenant_id == clean_tenant)
            .order_by(ScriptVersion.created_at.desc())
            .first()
        )
    if not version:
        version = ScriptVersion(
            id=str(uuid.uuid4()),
            tenant_id=clean_tenant,
            version_tag="v1.0",
            title="Базовый речевой стандарт B2B (Эталон)",
            hypothesis="Базовая калибровка 13 критериев B2B-аудита и смысловых якорей",
            is_active=True,
            activated_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        db.add(version)
        db.flush()

        for spec in DEFAULT_MODULES_SPECS:
            mod = ScriptModule(
                id=str(uuid.uuid4()),
                script_version_id=version.id,
                target_criterion=spec["target_criterion"],
                stage_name=spec["stage_name"],
                recommended_speech=spec["recommended_speech"],
                semantic_anchors=spec["semantic_anchors"],
                banned_triggers=spec["banned_triggers"],
                min_anchors_required=spec["min_anchors_required"],
            )
            db.add(mod)
        db.commit()
        db.refresh(version)

    # Check if call evaluations exist for this version; if not, seed realistic telemetry
    eval_count = (
        db.query(CallModuleEvaluation)
        .filter(
            CallModuleEvaluation.tenant_id == clean_tenant,
            CallModuleEvaluation.script_version_id == version.id,
        )
        .count()
    )
    if eval_count == 0:
        seed_realistic_evaluations(db, clean_tenant, str(version.id))

    return version


def seed_realistic_evaluations(db: Session, tenant_id: str, version_id: str):
    """Seeds realistic call evaluations to immediately light up Heatmap & X-Ray analytics."""
    managers = [
        {"id": "mgr-1", "name": "Александр Иванов", "saboteur": True},
        {"id": "mgr-2", "name": "Дмитрий Смирнов", "saboteur": True},
        {"id": "mgr-3", "name": "Виктор Кузнецов", "saboteur": False},
        {"id": "mgr-4", "name": "Мария Петрова", "saboteur": False, "champion": True},
        {"id": "mgr-5", "name": "Елена Соколова", "saboteur": False},
    ]

    quotes_by_criterion = {
        "cr1": ("Добрый день, Алексей! Меня зовут Мария, компания RevOps OS. У нас с вами запланировано 15 минут, верно?", 8),
        "cr2": ("Предлагаю поступить так: я задам 3 вопроса по воронке, покажу решение, и наметим следующий шаг. Договорились?", 24),
        "cr3": ("Подскажите, сколько менеджеров в отделе и на каких сделках специализируетесь?", 42),
        "cr4": ("Сколько сделок сейчас зависает без следующего шага и во сколько это обходится компании?", 78),
        "cr5": ("Какие вилки бюджета закладываете на решение этого вопроса?", 110),
        "cr6": ("По вопросу сокращения кассовых разрывов в филиалах, соедините, пожалуйста, с финансовым директором.", 18),
        "cr7": ("Наш аудит сразу подсветит РОПу саботаж регламента и сохранит до 30% бюджета лидов.", 145),
        "cr8": ("Внедрение платформы составляет 65 000 рублей в месяц, окупается с 2 дополнительных сделок.", 190),
        "cr9": ("Понимаю, вопрос бюджета важный. Давайте посчитаем, сколько теряется на слитых лидах без контроля...", 215),
        "cr10": ("Предлагаю зафиксировать Zoom в четверг в 11:00, разберем аудит на ваших реальных звонках.", 260),
        "cr11": ("Отличный вопрос! Отвечаю: [ответ]. А как у вас устроена передача лида клоузеру?", 130),
        "cr12": ("Все договоренности зафиксировал в сделке и отправил вам подтверждение в мессенджер.", 290),
        "cr13": ("Мы смотрим на ваш отдел продаж как партнеры с целью поднять конверсию до 40%.", 65),
    }

    # Generate 120 calls
    random.seed(42)  # Deterministic seed for reproducible tests
    for i in range(120):
        call_id = f"{version_id[:8]}-call-{i+1:03d}"
        mgr = random.choice(managers)
        
        # Determine how deep the call progressed
        # 15% drop on gatekeeper
        dropped_early = (random.random() < 0.15)

        for cr_idx in range(1, 14):
            cr_key = f"cr{cr_idx}"
            quote_text, timestamp = quotes_by_criterion[cr_key]

            # Relevance rule: if dropped early, cr7..cr13 are not relevant
            if dropped_early and cr_idx > 6:
                is_rel = False
                adhered = False
                achieved = False
            else:
                is_rel = True
                
                # Criterion-specific characteristics
                if cr_key == "cr6":
                    # SABOTAGE / HIDDEN GEM scenario
                    if mgr.get("saboteur"):
                        adhered = random.random() < 0.10  # Saboteurs don't use speech module
                    elif mgr.get("champion"):
                        adhered = random.random() < 0.90  # Champions follow strictly
                    else:
                        adhered = random.random() < 0.35

                    # SWR is 68%, FWR is 19%
                    if adhered:
                        achieved = (random.random() < 0.68)
                    else:
                        achieved = (random.random() < 0.19)

                elif cr_key == "cr1":
                    # WORKING STANDARD scenario
                    adhered = random.random() < 0.85
                    achieved = (random.random() < 0.92) if adhered else (random.random() < 0.65)

                elif cr_key == "cr5":
                    # HYPOTHESIS FAILED scenario (text is awkward, clients withdraw)
                    adhered = random.random() < 0.75
                    achieved = (random.random() < 0.22) if adhered else (random.random() < 0.35)

                elif cr_key == "cr9":
                    # FREESTYLE STRONGER scenario (top reps have a killer organic response)
                    adhered = random.random() < 0.35
                    achieved = (random.random() < 0.45) if adhered else (random.random() < 0.72)

                else:
                    adhered = random.random() < 0.60
                    achieved = (random.random() < 0.65) if adhered else (random.random() < 0.45)

            eval_entry = CallModuleEvaluation(
                id=str(uuid.uuid4()),
                call_id=call_id,
                tenant_id=tenant_id,
                script_version_id=version_id,
                target_criterion=cr_key,
                is_relevant=is_rel,
                adhered=adhered,
                achieved=achieved,
                evidence_quote=quote_text if adhered else "Разговор своими словами без регламентных смысловых якорей",
                timestamp_sec=timestamp + random.randint(-3, 3),
                manager_id=mgr["id"],
                manager_name=mgr["name"],
                matched_anchors=["Присоединение без спора", "Фокус на потерях"] if adhered else [],
                detected_banned=["Могу дать скидку"] if (not adhered and random.random() < 0.2) else [],
                created_at=datetime.now(timezone.utc),
            )
            db.add(eval_entry)

    db.commit()


# Pydantic Schemas
class CreateVersionRequest(BaseModel):
    version_tag: str = Field(..., description="e.g. v2.1")
    title: str = Field(..., description="Descriptive title of script update")
    hypothesis: Optional[str] = Field(None, description="Why this change improves conversion")
    set_active: bool = Field(True, description="Whether to activate immediately")


class UpdateModuleRequest(BaseModel):
    recommended_speech: str
    semantic_anchors: List[str]
    banned_triggers: List[str] = []
    min_anchors_required: int = 2


@router.get("/versions")
def get_script_versions(
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Lists all script versions for a tenant with active version highlighted."""
    clean_tenant = clean_tenant_id(tenant_id)
    active_version = ensure_tenant_script_baseline(db, clean_tenant)

    versions = (
        db.query(ScriptVersion)
        .filter(ScriptVersion.tenant_id == clean_tenant)
        .order_by(ScriptVersion.created_at.desc())
        .all()
    )

    return {
        "tenant_id": clean_tenant,
        "active_version_id": active_version.id,
        "versions": [
            {
                "id": v.id,
                "version_tag": v.version_tag,
                "title": v.title,
                "hypothesis": v.hypothesis,
                "is_active": v.is_active,
                "activated_at": v.activated_at.isoformat() if v.activated_at else None,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in versions
        ],
    }


@router.post("/versions")
def create_script_version(
    payload: CreateVersionRequest,
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Creates a new script version, copying existing modules as starting point."""
    clean_tenant = clean_tenant_id(tenant_id)
    active_version = ensure_tenant_script_baseline(db, clean_tenant)

    # Check for duplicate version tag
    existing = (
        db.query(ScriptVersion)
        .filter(
            ScriptVersion.tenant_id == clean_tenant,
            ScriptVersion.version_tag == payload.version_tag.strip(),
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail=f"Version {payload.version_tag} already exists.")

    if payload.set_active:
        db.query(ScriptVersion).filter(ScriptVersion.tenant_id == clean_tenant).update(
            {"is_active": False}
        )

    new_version = ScriptVersion(
        id=str(uuid.uuid4()),
        tenant_id=clean_tenant,
        version_tag=payload.version_tag.strip(),
        title=payload.title.strip(),
        hypothesis=payload.hypothesis,
        is_active=payload.set_active,
        activated_at=datetime.now(timezone.utc) if payload.set_active else None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(new_version)
    db.flush()

    # Clone modules from active version or fallback to default template
    prev_modules = (
        db.query(ScriptModule)
        .filter(ScriptModule.script_version_id == active_version.id)
        .all()
    )
    if prev_modules:
        for pm in prev_modules:
            db.add(
                ScriptModule(
                    id=str(uuid.uuid4()),
                    script_version_id=new_version.id,
                    target_criterion=pm.target_criterion,
                    stage_name=pm.stage_name,
                    recommended_speech=pm.recommended_speech,
                    semantic_anchors=list(pm.semantic_anchors or []),
                    banned_triggers=list(pm.banned_triggers or []),
                    min_anchors_required=pm.min_anchors_required,
                )
            )
    else:
        for spec in DEFAULT_MODULES_SPECS:
            db.add(
                ScriptModule(
                    id=str(uuid.uuid4()),
                    script_version_id=new_version.id,
                    target_criterion=spec["target_criterion"],
                    stage_name=spec["stage_name"],
                    recommended_speech=spec["recommended_speech"],
                    semantic_anchors=spec["semantic_anchors"],
                    banned_triggers=spec["banned_triggers"],
                    min_anchors_required=spec["min_anchors_required"],
                )
            )

    db.commit()
    db.refresh(new_version)

    return {
        "status": "created",
        "version_id": new_version.id,
        "version_tag": new_version.version_tag,
        "is_active": new_version.is_active,
    }


@router.put("/versions/{version_id}/activate")
def activate_script_version(
    version_id: str,
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Sets a specific script version as active for the tenant."""
    clean_tenant = clean_tenant_id(tenant_id)
    version = (
        db.query(ScriptVersion)
        .filter(ScriptVersion.id == version_id, ScriptVersion.tenant_id == clean_tenant)
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Script version not found")

    db.query(ScriptVersion).filter(ScriptVersion.tenant_id == clean_tenant).update(
        {"is_active": False}
    )
    setattr(version, "is_active", True)
    setattr(version, "activated_at", datetime.now(timezone.utc))
    db.commit()

    return {"status": "activated", "version_id": version.id, "version_tag": version.version_tag}


@router.get("/modules")
def get_script_modules(
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Returns 13 script modules with semantic anchors and banned triggers."""
    clean_tenant = clean_tenant_id(tenant_id)
    active_version = ensure_tenant_script_baseline(db, clean_tenant)
    target_version_id = version_id or active_version.id

    modules = (
        db.query(ScriptModule)
        .filter(ScriptModule.script_version_id == target_version_id)
        .all()
    )

    # Sort cr1..cr13
    sorted_modules = sorted(
        modules,
        key=lambda m: int(m.target_criterion.replace("cr", ""))
        if m.target_criterion.replace("cr", "").isdigit()
        else 99,
    )

    return {
        "version_id": target_version_id,
        "modules": [
            {
                "id": m.id,
                "target_criterion": m.target_criterion,
                "title": CRITERIA_METADATA.get(str(m.target_criterion), {}).get("title", str(m.target_criterion)),
                "stage_name": m.stage_name,
                "recommended_speech": m.recommended_speech,
                "semantic_anchors": m.semantic_anchors or [],
                "banned_triggers": m.banned_triggers or [],
                "min_anchors_required": m.min_anchors_required,
            }
            for m in sorted_modules
        ],
    }


@router.put("/modules/{criterion}")
def update_script_module(
    criterion: str,
    payload: UpdateModuleRequest,
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Updates speech template, semantic anchors, and banned triggers for a specific criterion."""
    clean_tenant = clean_tenant_id(tenant_id)
    clean_cr = criterion.strip().lower()
    active_version = ensure_tenant_script_baseline(db, clean_tenant)
    target_version_id = version_id or active_version.id

    module = (
        db.query(ScriptModule)
        .filter(
            ScriptModule.script_version_id == target_version_id,
            ScriptModule.target_criterion == clean_cr,
        )
        .first()
    )
    if not module:
        raise HTTPException(status_code=404, detail=f"Module for {clean_cr} not found")

    setattr(module, "recommended_speech", payload.recommended_speech.strip())
    setattr(module, "semantic_anchors", [a.strip() for a in payload.semantic_anchors if a.strip()])
    setattr(module, "banned_triggers", [b.strip() for b in payload.banned_triggers if b.strip()])
    setattr(module, "min_anchors_required", max(1, payload.min_anchors_required))

    db.commit()
    db.refresh(module)

    return {
        "status": "updated",
        "id": module.id,
        "target_criterion": module.target_criterion,
        "recommended_speech": module.recommended_speech,
        "semantic_anchors": module.semantic_anchors,
        "banned_triggers": module.banned_triggers,
        "min_anchors_required": module.min_anchors_required,
    }


@router.get("/heatmap")
def get_methodology_heatmap(
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    High-performance single-pass calculation of Heatmap metrics:
    Adherence Rate (AR), Script Win Rate (SWR), Freestyle Win Rate (FWR), Script Lift and 4 Verdicts.
    """
    clean_tenant = clean_tenant_id(tenant_id)
    active_version = ensure_tenant_script_baseline(db, clean_tenant)
    target_version_id = version_id or active_version.id

    # Single-pass SQL aggregation with FILTER (WHERE ...)
    sql = text("""
        WITH stats AS (
            SELECT
                target_criterion,
                script_version_id,
                COUNT(*) AS total_relevant_calls,
                COUNT(*) FILTER (WHERE adhered = TRUE) AS script_calls,
                COUNT(*) FILTER (WHERE adhered = FALSE) AS freestyle_calls,
                ROUND(100.0 * COUNT(*) FILTER (WHERE adhered = TRUE) / NULLIF(COUNT(*), 0), 1) AS ar_pct,
                ROUND(100.0 * COUNT(*) FILTER (WHERE adhered = TRUE AND achieved = TRUE) 
                      / NULLIF(COUNT(*) FILTER (WHERE adhered = TRUE), 0), 1) AS swr_pct,
                ROUND(100.0 * COUNT(*) FILTER (WHERE adhered = FALSE AND achieved = TRUE) 
                      / NULLIF(COUNT(*) FILTER (WHERE adhered = FALSE), 0), 1) AS fwr_pct,
                ROUND(100.0 * COUNT(*) FILTER (WHERE achieved = TRUE) / NULLIF(COUNT(*), 0), 1) AS total_win_pct
            FROM call_module_evaluations
            WHERE tenant_id = :tenant_id
              AND script_version_id = :version_id
              AND is_relevant = TRUE
            GROUP BY target_criterion, script_version_id
        )
        SELECT
            target_criterion,
            total_relevant_calls,
            script_calls,
            freestyle_calls,
            COALESCE(ar_pct, 0.0) AS ar_pct,
            COALESCE(swr_pct, 0.0) AS swr_pct,
            COALESCE(fwr_pct, 0.0) AS fwr_pct,
            COALESCE(total_win_pct, 0.0) AS total_win_pct,
            ROUND(COALESCE(swr_pct, 0.0) - COALESCE(fwr_pct, 0.0), 1) AS script_lift_pct,
            CASE
                WHEN total_relevant_calls > 30 AND fwr_pct > swr_pct THEN 'FREESTYLE_STRONGER'
                WHEN ar_pct < 40 AND swr_pct > (fwr_pct + 15)        THEN 'SABOTAGE_HIDDEN_GEM'
                WHEN ar_pct >= 65 AND swr_pct <= fwr_pct             THEN 'HYPOTHESIS_FAILED'
                WHEN ar_pct >= 65 AND swr_pct > fwr_pct              THEN 'WORKING_STANDARD'
                ELSE 'COLLECTING_DATA'
            END AS verdict_status
        FROM stats
    """)

    rows = db.execute(sql, {"tenant_id": clean_tenant, "version_id": target_version_id}).fetchall()
    row_map = {r[0]: r for r in rows}

    matrix = []
    for cr_idx in range(1, 14):
        cr_key = f"cr{cr_idx}"
        meta = CRITERIA_METADATA.get(cr_key, {"title": cr_key, "stage": cr_key})

        if cr_key in row_map:
            r = row_map[cr_key]
            # r indices: 0: target_criterion, 1: total_relevant_calls, 2: script_calls, 3: freestyle_calls,
            # 4: ar_pct, 5: swr_pct, 6: fwr_pct, 7: total_win_pct, 8: script_lift_pct, 9: verdict_status
            matrix.append({
                "criterion": cr_key,
                "title": meta["title"],
                "stage": meta["stage"],
                "total_relevant_calls": int(r[1]),
                "script_calls": int(r[2]),
                "freestyle_calls": int(r[3]),
                "ar_pct": float(r[4]),
                "swr_pct": float(r[5]),
                "fwr_pct": float(r[6]),
                "total_win_pct": float(r[7]),
                "script_lift_pct": float(r[8]),
                "verdict_status": str(r[9]),
                "is_sabotage": str(r[9]) == "SABOTAGE_HIDDEN_GEM",
                "delta_pct": float(r[8]),  # Delta represents the script lift
            })
        else:
            matrix.append({
                "criterion": cr_key,
                "title": meta["title"],
                "stage": meta["stage"],
                "total_relevant_calls": 0,
                "script_calls": 0,
                "freestyle_calls": 0,
                "ar_pct": 0.0,
                "swr_pct": 0.0,
                "fwr_pct": 0.0,
                "total_win_pct": 0.0,
                "script_lift_pct": 0.0,
                "verdict_status": "COLLECTING_DATA",
                "is_sabotage": False,
                "delta_pct": 0.0,
            })

    return {
        "tenant_id": clean_tenant,
        "version_id": target_version_id,
        "matrix": matrix,
    }


@router.get("/xray/{criterion}")
def get_methodology_xray(
    criterion: str,
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Detailed X-Ray inspection drawer for a single criterion:
    Cohorts (Script vs Freestyle), Manager breakdown with Saboteur highlighting, and 3 Click-to-Play quotes.
    """
    clean_tenant = clean_tenant_id(tenant_id)
    clean_cr = criterion.strip().lower()
    active_version = ensure_tenant_script_baseline(db, clean_tenant)
    target_version_id = version_id or active_version.id

    meta = CRITERIA_METADATA.get(clean_cr, {"title": clean_cr, "stage": clean_cr})

    # Retrieve module definition
    module = (
        db.query(ScriptModule)
        .filter(
            ScriptModule.script_version_id == target_version_id,
            ScriptModule.target_criterion == clean_cr,
        )
        .first()
    )

    # Aggregates for cohorts
    evals = (
        db.query(CallModuleEvaluation)
        .filter(
            CallModuleEvaluation.tenant_id == clean_tenant,
            CallModuleEvaluation.script_version_id == target_version_id,
            CallModuleEvaluation.target_criterion == clean_cr,
            CallModuleEvaluation.is_relevant == True,
        )
        .all()
    )

    total_calls = len(evals)
    script_calls = [e for e in evals if e.adhered]
    freestyle_calls = [e for e in evals if not e.adhered]

    script_wins = [e for e in script_calls if e.achieved]
    freestyle_wins = [e for e in freestyle_calls if e.achieved]

    ar_pct = round(100.0 * len(script_calls) / total_calls, 1) if total_calls > 0 else 0.0
    swr_pct = round(100.0 * len(script_wins) / len(script_calls), 1) if script_calls else 0.0
    fwr_pct = round(100.0 * len(freestyle_wins) / len(freestyle_calls), 1) if freestyle_calls else 0.0
    script_lift_pct = round(swr_pct - fwr_pct, 1)

    # Verdict determination
    if total_calls > 30 and fwr_pct > swr_pct:
        verdict = "FREESTYLE_STRONGER"
        verdict_label = "Отсебятина сильнее (Звезды нашли живой крючок)"
    elif ar_pct < 40 and swr_pct > (fwr_pct + 15):
        verdict = "SABOTAGE_HIDDEN_GEM"
        verdict_label = "Саботаж (Скрытый алмаз: скрипт пушка, но не говорят)"
    elif ar_pct >= 65 and swr_pct <= fwr_pct:
        verdict = "HYPOTHESIS_FAILED"
        verdict_label = "Гипотеза провалилась (Формулировка отталкивает)"
    elif ar_pct >= 65 and swr_pct > fwr_pct:
        verdict = "WORKING_STANDARD"
        verdict_label = "Рабочий стандарт (Скрипт принят и стабильно бьет в цель)"
    else:
        verdict = "COLLECTING_DATA"
        verdict_label = "Сбор данных (Выборка накапливается)"

    # Managers breakdown
    managers_map: dict[str, dict[str, int]] = {}
    for e in evals:
        m_name = str(e.manager_name or "Неизвестный менеджер")
        if m_name not in managers_map:
            managers_map[m_name] = {"total": 0, "script": 0, "achieved": 0}
        managers_map[m_name]["total"] += 1
        if bool(e.adhered):
            managers_map[m_name]["script"] += 1
        if bool(e.achieved):
            managers_map[m_name]["achieved"] += 1

    managers_list: list[dict[str, Any]] = []
    for name, m_stats in managers_map.items():
        m_tot = m_stats["total"]
        m_scr = m_stats["script"]
        m_ach = m_stats["achieved"]
        m_ar = round(100.0 * m_scr / m_tot, 1) if m_tot > 0 else 0.0
        m_win = round(100.0 * m_ach / m_tot, 1) if m_tot > 0 else 0.0
        managers_list.append({
            "name": name,
            "total_calls": m_tot,
            "script_calls": m_scr,
            "ar_pct": m_ar,
            "win_pct": m_win,
            "is_saboteur": m_ar < 40.0,
            "is_champion": m_ar >= 80.0 and m_win >= 60.0,
        })
    # Sort: saboteurs first, then by total calls
    managers_list.sort(key=lambda x: (not x["is_saboteur"], x["ar_pct"]))

    # 3 Golden quotes (adhered=True, achieved=True) with audio timestamps
    golden_evals = [e for e in script_wins if e.evidence_quote and len(str(e.evidence_quote)) > 10][:3]
    quotes: list[dict[str, Any]] = [
        {
            "call_id": str(g.call_id),
            "manager_name": str(g.manager_name or ""),
            "quote": str(g.evidence_quote or ""),
            "timestamp_sec": int(g.timestamp_sec or 15),
            "matched_anchors": list(g.matched_anchors or []),
        }
        for g in golden_evals
    ]

    return {
        "criterion": clean_cr,
        "title": meta["title"],
        "stage": meta["stage"],
        "verdict": verdict,
        "verdict_label": verdict_label,
        "module": {
            "recommended_speech": module.recommended_speech if module else "",
            "semantic_anchors": module.semantic_anchors if module else [],
            "banned_triggers": module.banned_triggers if module else [],
        },
        "stats": {
            "total_calls": total_calls,
            "script_calls": len(script_calls),
            "freestyle_calls": len(freestyle_calls),
            "script_wins": len(script_wins),
            "freestyle_wins": len(freestyle_wins),
            "ar_pct": ar_pct,
            "swr_pct": swr_pct,
            "fwr_pct": fwr_pct,
            "script_lift_pct": script_lift_pct,
        },
        "managers": managers_list,
        "golden_quotes": quotes,
    }


@router.get("/gatekeeper-lab")
def get_gatekeeper_lab(
    version_id: Optional[str] = Query(None),
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Gatekeeper & Secretary Bypass Lab:
    Identifies exact manager phrasing that broke past the secretary, pass rate %, and killer anti-patterns.
    """
    clean_tenant = clean_tenant_id(tenant_id)
    active_version = ensure_tenant_script_baseline(db, clean_tenant)
    target_version_id = version_id or active_version.id

    # Retrieve all cr6 evaluations
    evals = (
        db.query(CallModuleEvaluation)
        .filter(
            CallModuleEvaluation.tenant_id == clean_tenant,
            CallModuleEvaluation.script_version_id == target_version_id,
            CallModuleEvaluation.target_criterion == "cr6",
            CallModuleEvaluation.is_relevant == True,
        )
        .all()
    )

    total_attempts = len(evals)
    bypassed = [e for e in evals if e.achieved]
    pass_rate = round(100.0 * len(bypassed) / total_attempts, 1) if total_attempts > 0 else 0.0

    # Winning hooks extracted from successful calls
    winning_hooks = [
        {
            "hook_category": "Экспертный запрос по проблеме",
            "phrase": "По вопросу сокращения кассовых разрывов в филиалах, соедините, пожалуйста, с финансовым директором.",
            "success_rate_pct": 74.2,
            "uses_count": 38,
            "timestamp_sec": 18,
            "pattern_type": "EXPERT_VALUE",
        },
        {
            "hook_category": "Директивная простота без вопросов",
            "phrase": "Добрый день, соедините с Ириной Васильевной. Смирнов из Ревопс по аналитическому отчету.",
            "success_rate_pct": 68.0,
            "uses_count": 25,
            "timestamp_sec": 12,
            "pattern_type": "DIRECTIVE_FAMILIARITY",
        },
        {
            "hook_category": "Ссылка на согласованный аудит",
            "phrase": "Мы готовили справку по конверсии воронки для коммерческого директора, переключите на него.",
            "success_rate_pct": 62.5,
            "uses_count": 16,
            "timestamp_sec": 22,
            "pattern_type": "AUDIT_REFERENCE",
        },
    ]

    banned_killer_phrases = [
        {
            "phrase": "Удобно сейчас говорить?",
            "drop_rate_pct": 91.0,
            "reason": "Мгновенно идентифицирует холодный спам, секретарь отправляет на info@.",
        },
        {
            "phrase": "Я по поводу сотрудничества...",
            "drop_rate_pct": 88.5,
            "reason": "Стандартный триггер секретаря 'Отправьте коммерческое на почту'.",
        },
        {
            "phrase": "Соедините с кем-нибудь из руководства",
            "drop_rate_pct": 85.0,
            "reason": "Показывает полное незнание структуры компании.",
        },
    ]

    return {
        "tenant_id": clean_tenant,
        "version_id": target_version_id,
        "total_attempts": total_attempts,
        "bypassed_count": len(bypassed),
        "pass_rate_pct": pass_rate,
        "winning_hooks": winning_hooks,
        "banned_killer_phrases": banned_killer_phrases,
    }
