"""
Settings Router: 28 Filling Parameters, Revenue Target, Funnel SLA, Team Capacity,
Loss Reasons, Telegram Integration, and 19 CRM Feature Flags.
Synchronizes with Google Sheets (⚙️ Настройки, 📋 Паспорт_Клиента, ⚙️ Модули_Интеграции).
"""

import logging
import os
import re
import time
from pathlib import Path
from typing import Any
from sqlalchemy.orm import Session

import secrets
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials
from packages.database.session import get_db
from packages.database.models import Tenant, User, UserRole
from ..auth import get_current_user, security
from pydantic import BaseModel, Field

from ..tenant_registry import get_tenant_spreadsheet_id
from ..websocket_manager import manager

logger = logging.getLogger("settings_router")

router = APIRouter(prefix="/settings", tags=["Settings & Business Parameters"])

# In-memory settings cache keyed by tenant_id (TTL: 15s)
_SETTINGS_CACHE: dict[str, dict[str, Any]] = {}

# When the cabinet last asked for an automatic (page-load) CRM managers sync, per tenant
_AUTO_SYNC_AT: dict[str, float] = {}
_AUTO_SYNC_EVERY_SEC = 600


def get_service_account_path() -> Path | None:
    env_path = os.getenv("GOOGLE_SERVICE_ACCOUNT_PATH")
    if env_path and Path(env_path).exists():
        return Path(env_path)
    candidates = [
        Path("/opt/revops-enterprise-os/service_account.json"),
        Path(__file__).resolve().parent.parent.parent.parent / "revops-enterprise-os" / "service_account.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "service_account.json",
        Path(__file__).resolve().parent.parent.parent / "service_account.json",
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _clean_currency(raw: str, default: str) -> str:
    """A currency cell sometimes holds other text (e.g. a company name); accept it only if it looks like a currency."""
    text = (raw or "").strip()
    if text and re.search(r"(RUB|USD|EUR|KZT|BYN|UAH|₽|\$|€|руб|долл|евро)", text, re.IGNORECASE):
        return text
    return default


def _autonomy_for(tenant_id: str) -> dict[str, bool]:
    """The autonomy flags the AI engine really obeys (the policy registry behind PATCH /settings/autonomy).
    The registry JSON never held them, so /settings used to show a passive mode for an autonomous tenant."""
    try:
        from packages.antidrift.contracts.policy_config import TenantPolicyRegistry

        cfg = TenantPolicyRegistry.get_config(tenant_id)
        return {
            "allow_crm_mutations": bool(cfg.allow_crm_mutations),
            "enable_telegram_notifications": bool(cfg.enable_telegram_notifications),
            "allow_client_communication": bool(cfg.allow_client_communication),
        }
    except Exception as e:
        logger.warning(f"Could not read the autonomy policy of {tenant_id}: {e}")
        return {"allow_crm_mutations": False, "enable_telegram_notifications": False, "allow_client_communication": False}


class GeneralSettings(BaseModel):
    # No invented defaults: a field the caller did not send must never be written anywhere
    # (a partial save used to overwrite the company name, currency, period and plan in the client's sheet).
    company_name: str | None = None
    currency: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    monthly_target: float | None = Field(default=None, ge=0, le=1e12)
    project_start_date: str | None = None
    # Average deal check of THIS company (₽). None = not set (nothing is assumed); 0/None in a save clears it.
    avg_deal_check: float | None = Field(default=None, ge=0, le=1e12)


class StageSLA(BaseModel):
    id: int
    name: str
    sla_hours: int = Field(ge=0, le=720)
    win_pct: int = Field(ge=0, le=100)


class ManagerCapacity(BaseModel):
    # the ranges are the same as in PATCH /managers/{id}/kpis
    id: str
    name: str
    role: str
    capacity: int = Field(default=40, ge=0, le=500)
    revenue_target: float | None = Field(default=None, ge=0, le=1e12)          # ₽ / месяц
    daily_calls_target: int | None = Field(default=None, ge=0, le=200)      # целевых звонков (>= 60 сек) / день
    daily_dials_target: int | None = Field(default=None, ge=0, le=500)      # всего наборов / день
    monthly_meetings_target: int | None = Field(default=None, ge=0, le=500) # встреч / месяц
    meetings_enabled: bool = True              # учитывать ли встречи в нормативах и алертах
    next_step_target_pct: int | None = Field(default=None, ge=0, le=100)    # % разговоров с зафиксированным Next Step
    updated_at: str | None = None


class ManagerKpiPatch(BaseModel):
    revenue_target: float | None = None
    daily_calls_target: int | None = None
    daily_dials_target: int | None = None
    monthly_meetings_target: int | None = None
    meetings_enabled: bool | None = None
    capacity: int | None = None
    next_step_target_pct: int | None = None


class LossReason(BaseModel):
    code: str
    reason: str
    reactivation_prob: int = Field(ge=0, le=100)


class TelegramSettings(BaseModel):
    bot_token: str | None = "Script Properties"
    rop_chat_id: str | None = "-1001234567890"
    ceo_chat_id: str | None = "-1009876543210"
    team_chat_id: str | None = "-1005554443332"
    dispatcher_schedule: str | None = "Каждый час (L1/L2/L3) + 09:15"
    dispatcher_status: bool | None = True


class ModuleToggle(BaseModel):
    code: str
    name: str
    category: str | None = "CRM"
    status: bool = True
    description: str | None = ""


class AutonomySettings(BaseModel):
    allow_crm_mutations: bool = False
    enable_telegram_notifications: bool = False
    allow_client_communication: bool = False


class AutonomyPatchPayload(BaseModel):
    allow_crm_mutations: bool | None = None
    enable_telegram_notifications: bool | None = None
    allow_client_communication: bool | None = None


class SettingsPayload(BaseModel):
    tenant_id: str = "TNT-001"
    general: GeneralSettings | None = None
    stages: list[StageSLA] | None = None
    managers: list[ManagerCapacity] | None = None
    loss_reasons: list[LossReason] | None = None
    telegram: TelegramSettings | None = None
    modules: list[ModuleToggle] | None = None
    autonomy: AutonomySettings | None = None


def fetch_settings_from_sheets(tenant_id: str = "TNT-001", force_refresh: bool = False) -> dict[str, Any]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    now = time.time()
    cached = _SETTINGS_CACHE.get(clean_tenant)
    if not force_refresh and cached and (now - cached.get("timestamp", 0) < 15):
        return cached.get("data", get_tenant_settings_or_fallback(clean_tenant))

    sa_path = get_service_account_path()
    if not sa_path:
        logger.info(f"service_account.json not configured for settings fetch (tenant: {clean_tenant}); reading from registry")
        fb = get_tenant_settings_or_fallback(clean_tenant)
        _SETTINGS_CACHE[clean_tenant] = {
            "data": fb,
            "timestamp": now
        }
        return fb

    try:
        sheet_id = get_tenant_spreadsheet_id(clean_tenant)
        if not sheet_id:
            logger.info(f"Tenant {clean_tenant} has no connected spreadsheet, returning local tenant settings")
            return get_tenant_settings_or_fallback(clean_tenant)
        import gspread
        gc = gspread.service_account(str(sa_path))
        ss = gc.open_by_key(sheet_id)

        ws_settings = ss.worksheet("⚙️ Настройки")
        s_rows = ws_settings.get_all_values()

        is_master_or_template = clean_tenant in ("TNT-001", "TNT-MASTER-001") or "TEMPLATE" in clean_tenant

        from ..tenant_registry import get_tenant_config
        cfg = get_tenant_config(clean_tenant) or {}
        kpis_map = cfg.get("manager_kpis", {}) or {}

        # Parse general settings
        company_name = "Самозанятый" if is_master_or_template else (cfg.get("tenant_name") or f"Клиент {clean_tenant}")
        currency = "RUB (₽)"
        # only the shared master/template carries demo dates; a real client's missing cells stay empty
        period_start = "2026-10-01" if is_master_or_template else ""
        period_end = "2026-10-31" if is_master_or_template else ""
        monthly_target = 5000000.0 if is_master_or_template else 0.0
        project_start_date = "2026-10-03" if is_master_or_template else ""

        for r in s_rows:
            if not r:
                continue
            col0 = r[0].strip() if len(r) > 0 else ""
            col1 = r[1].strip() if len(r) > 1 else ""
            if "Организация" in col0:
                if col1 and col1 not in ("[Название компании / Клиента]", "—", "-", ""):
                    company_name = col1
            elif "Валюта" in col0:
                currency = _clean_currency(col1, currency)
            elif "Период: начало" in col0:
                period_start = col1 or period_start
            elif "Период: конец" in col0:
                period_end = col1 or period_end
            elif "План выручки" in col0:
                val = col1.replace("₽", "").replace(" ", "").replace(",", "").strip()
                try:
                    monthly_target = float(val)
                except:
                    pass
            elif "Дата старта" in col0:
                project_start_date = col1 or project_start_date

        # Parse stages (Rows 12-18)
        stages = []
        for r_idx in range(11, min(18, len(s_rows))):
            r = s_rows[r_idx]
            if len(r) >= 4 and r[0].isdigit():
                s_id = int(r[0])
                s_name = r[1]
                sla = int(r[2]) if r[2].isdigit() else 24
                win = int(r[3].replace("%", "").strip()) if "%" in r[3] or r[3].isdigit() else 10
                stages.append({"id": s_id, "name": s_name, "sla_hours": sla, "win_pct": win})

        # Parse managers (supports dynamic managers from registry, with fallback to Sheet Rows 21-24)
        if cfg.get("managers") and isinstance(cfg.get("managers"), list) and len(cfg["managers"]) > 0:
            raw_managers = cfg["managers"]
        else:
            raw_managers = []
            for r_idx in range(20, min(24, len(s_rows))):
                r = s_rows[r_idx]
                if len(r) >= 4 and r[0]:
                    m_id = str(r[0]).strip()
                    m_name = str(r[1]).strip()
                    m_role = str(r[2]).strip()
                    cap = int(r[3]) if str(r[3]).strip().isdigit() else 40
                    # Ignore placeholder / template blank manager rows
                    if not m_name or m_name in ("—", "-", "[Имя менеджера]", "None", "name"):
                        continue
                    if not m_id or m_id in ("—", "-", "[ID]", "None", "id"):
                        continue
                    raw_managers.append({"id": m_id, "name": m_name, "role": m_role, "capacity": cap})

        managers = []
        for m in raw_managers:
            m_dict = dict(m)
            m_id = str(m_dict.get("id", ""))
            kpi = kpis_map.get(m_id, {})
            # Merge KPI fields if not set on manager
            for k in ("revenue_target", "daily_calls_target", "daily_dials_target", "monthly_meetings_target", "meetings_enabled", "next_step_target_pct"):
                if m_dict.get(k) is None and k in kpi:
                    m_dict[k] = kpi[k]
            if "capacity" in kpi and kpi["capacity"] is not None:
                m_dict["capacity"] = kpi["capacity"]
            if "updated_at" in kpi and kpi["updated_at"] is not None:
                m_dict["updated_at"] = kpi["updated_at"]
            if "meetings_enabled" not in m_dict or m_dict["meetings_enabled"] is None:
                m_dict["meetings_enabled"] = True
            managers.append(m_dict)

        # Parse loss reasons (Rows 26-29)
        loss_reasons = []
        for r_idx in range(25, min(29, len(s_rows))):
            r = s_rows[r_idx]
            if len(r) >= 3 and r[0].startswith("L"):
                l_code = r[0]
                l_reason = r[1]
                prob = int(r[2].replace("%", "").strip()) if "%" in r[2] or r[2].isdigit() else 30
                loss_reasons.append({"code": l_code, "reason": l_reason, "reactivation_prob": prob})

        # Parse Telegram settings
        telegram = {
            "bot_token": "Защищено в Script Properties",
            "rop_chat_id": "-1001234567890",
            "ceo_chat_id": "-1009876543210",
            "team_chat_id": "-1005554443332",
            "dispatcher_schedule": "Каждый час (L1/L2/L3) + 09:15",
            "dispatcher_status": True
        }
        for r in s_rows:
            if not r:
                continue
            c0 = r[0].strip() if len(r) > 0 else ""
            c1 = r[1].strip() if len(r) > 1 else ""
            if "ROP_CHAT_ID" in c0:
                telegram["rop_chat_id"] = c1
            elif "CEO_CHAT_ID" in c0:
                telegram["ceo_chat_id"] = c1
            elif "TEAM_CHAT_ID" in c0:
                telegram["team_chat_id"] = c1
            elif "DISPATCHER_SCHEDULE" in c0:
                telegram["dispatcher_schedule"] = c1
            elif "DISPATCHER_STATUS" in c0:
                telegram["dispatcher_status"] = "ACTIVE" in c1.upper() or "ВКЛ" in c1.upper()

        # Parse 19 modules from ⚙️ Модули_Интеграции
        modules = []
        try:
            ws_modules = ss.worksheet("⚙️ Модули_Интеграции")
            m_rows = ws_modules.get_all_values()
            for r in m_rows[1:]:
                if not r or not r[0]:
                    continue
                code = r[0].strip()
                name = r[1].strip() if len(r) > 1 else code
                category = r[2].strip() if len(r) > 2 else "CRM"
                status_raw = r[3].strip() if len(r) > 3 else "ВКЛ"
                is_active = ("ВКЛ" in status_raw.upper() or "ACTIVE" in status_raw.upper() or "1" in status_raw)
                desc = r[4].strip() if len(r) > 4 else ""
                modules.append({
                    "code": code,
                    "name": name,
                    "category": category,
                    "status": is_active,
                    "description": desc
                })
        except Exception as e:
            logger.warning(f"Failed to read ⚙️ Модули_Интеграции: {e}")

        fallback_data = get_tenant_settings_or_fallback(clean_tenant)
        result = {
            "status": "ok",
            "source": "google_sheets",
            "tenant_id": clean_tenant,
            "crm_type": cfg.get("crm_type") or "amocrm",
            "general": {
                "company_name": company_name,
                "currency": currency,
                "period_start": period_start,
                "period_end": period_end,
                "monthly_target": monthly_target,
                "project_start_date": project_start_date,
                "avg_deal_check": cfg.get("avg_deal_check"),
            },
            "stages": stages or fallback_data["stages"],
            "managers": managers if (managers or not is_master_or_template) else fallback_data["managers"],
            "loss_reasons": loss_reasons or fallback_data["loss_reasons"],
            "telegram": telegram,
            "modules": modules or fallback_data["modules"],
            "autonomy": _autonomy_for(clean_tenant),
        }

        _SETTINGS_CACHE[clean_tenant] = {
            "data": result,
            "timestamp": now
        }
        return result

    except Exception as e:
        logger.error(f"Error reading settings from Google Sheets: {e}")
        return get_tenant_settings_or_fallback(clean_tenant)


def get_fallback_settings() -> dict[str, Any]:
    return {
        "status": "ok",
        "source": "fallback",
        "tenant_id": "TNT-001",
        "crm_type": "amocrm",
        "general": {
            "company_name": "Самозанятый",
            "currency": "RUB (₽)",
            "period_start": "2026-10-01",
            "period_end": "2026-10-31",
            "monthly_target": 5000000.0,
            "project_start_date": "2026-10-03"
        },
        "stages": [
            {"id": 1, "name": "1. Первичный контакт", "sla_hours": 24, "win_pct": 10},
            {"id": 2, "name": "2. Переговоры", "sla_hours": 48, "win_pct": 35},
            {"id": 3, "name": "3. Принимают решение", "sla_hours": 72, "win_pct": 60},
            {"id": 4, "name": "4. Согласование договора", "sla_hours": 48, "win_pct": 85},
            {"id": 5, "name": "5. Счёт / Оплата", "sla_hours": 72, "win_pct": 95},
            {"id": 6, "name": "6. Успешно реализовано", "sla_hours": 0, "win_pct": 100},
            {"id": 7, "name": "7. Закрыто и не реализовано", "sla_hours": 0, "win_pct": 0}
        ],
        "managers": [],  # the team comes from the CRM (crm_users_sync), never from a template
        "loss_reasons": [
            {"code": "L1", "reason": "Дорого / нет бюджета", "reactivation_prob": 50},
            {"code": "L2", "reason": "Выбрали конкурента", "reactivation_prob": 35},
            {"code": "L3", "reason": "Не формат / нет потребности", "reactivation_prob": 10},
            {"code": "L4", "reason": "Потеря контакта / недозвон", "reactivation_prob": 20}
        ],
        "telegram": {
            "bot_token": "Защищено в Script Properties",
            "rop_chat_id": "-1001234567890",
            "ceo_chat_id": "-1009876543210",
            "team_chat_id": "-1005554443332",
            "dispatcher_schedule": "Каждый час (L1/L2/L3) + 09:15",
            "dispatcher_status": True
        },
        "autonomy": {
            "allow_crm_mutations": False,
            "enable_telegram_notifications": False,
            "allow_client_communication": False
        },
        "modules": [
            {"code": "1.1", "name": "Развернутое примечание-аудит (13 стандартов)", "category": "Аудит", "status": True, "description": "Формирует структурированное примечание в сделку"},
            {"code": "1.2", "name": "Числовое поле «Оценка ИИ (0–100)»", "category": "Аудит", "status": True, "description": "Записывает балл качества речи в поле сделки"},
            {"code": "1.3", "name": "Фиксация жесткого Next Step", "category": "Аудит", "status": True, "description": "Контроль даты и времени договоренности"},
            {"code": "1.4", "name": "Умная автоматическая расстановка тегов", "category": "Аудит", "status": True, "description": "Теги #Эталонный_Звонок, #Возражение_Дорого"},
            {"code": "2.1", "name": "Распознавание и авто-ввод бюджета сделки", "category": "Сделка", "status": True, "description": "Заполняет стандартное поле «Бюджет сделки»"},
            {"code": "2.2", "name": "Автозаполнение поля «Потребности / Боли»", "category": "Сделка", "status": True, "description": "Формирует список болей клиента"},
            {"code": "2.3", "name": "Автозаполнение поля «Главное возражение»", "category": "Сделка", "status": True, "description": "Выделяет ключевое возражение"},
            {"code": "2.4", "name": "Автозаполнение поля «Следующий шаг»", "category": "Сделка", "status": True, "description": "Суть договоренности"},
            {"code": "3.1", "name": "Создание задачи «Связаться по Next Step»", "category": "Задачи", "status": True, "description": "Автоматическая постановка задачи менеджеру"},
            {"code": "3.2", "name": "Создание задачи «Реактивация отказника»", "category": "Задачи", "status": True, "description": "Сценарий возврата клиента"},
            {"code": "3.3", "name": "Создание задачи «Контроль зависшего КП»", "category": "Задачи", "status": True, "description": "Пуш через 48 часов после отправки"},
            {"code": "4.1", "name": "Мгновенный алерт РОПу при срыве сделки (>200k)", "category": "Алерты", "status": True, "description": "Telegram-уведомление за 30 секунд"},
            {"code": "4.2", "name": "Ежедневный утренний Пульс РОПа в 09:15", "category": "Алерты", "status": True, "description": "Утренняя сводка сливов"},
            {"code": "4.3", "name": "Еженедельный аналитический отчет в Telegram", "category": "Алерты", "status": True, "description": "PDF/текстовый дайджест за неделю"},
            {"code": "5.1", "name": "Автоматический импорт сделок из CRM", "category": "Синхронизация", "status": True, "description": "Синхронизация raw_deals"},
            {"code": "5.2", "name": "Автоматический импорт задач из CRM", "category": "Синхронизация", "status": True, "description": "Синхронизация raw_tasks"},
            {"code": "5.3", "name": "Автоматический импорт пользователей", "category": "Синхронизация", "status": True, "description": "Синхронизация raw_users"},
            {"code": "6.1", "name": "Детектор «Ложного согласия» (Fake Yes)", "category": "Антифрод", "status": True, "description": "Выявление вежливых отказов без обязательств"},
            {"code": "6.2", "name": "Пакет «Антисаботаж» и режим «Адвокат менеджера»", "category": "Антифрод", "status": True, "description": "Защита менеджеров от предвзятости"}
        ]
    }


def get_tenant_settings_or_fallback(tenant_id: str = "TNT-001") -> dict[str, Any]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    from ..tenant_registry import get_tenant_config
    cfg = get_tenant_config(clean_tenant) or {}
    kpis_map = cfg.get("manager_kpis", {}) or {}
    gen = cfg.get("general_settings") or {}
    fb = get_fallback_settings()

    is_master_or_template = clean_tenant in ("TNT-001", "TNT-MASTER-001") or "TEMPLATE" in clean_tenant

    company_name = gen.get(
        "company_name",
        cfg.get("tenant_name") or cfg.get("name") or (fb["general"]["company_name"] if is_master_or_template else f"Клиент {clean_tenant}")
    )
    currency = gen.get("currency", fb["general"]["currency"])
    period_start = gen.get("period_start", fb["general"]["period_start"])
    period_end = gen.get("period_end", fb["general"]["period_end"])
    monthly_target = gen.get("monthly_target", fb["general"]["monthly_target"] if is_master_or_template else 0.0)
    project_start_date = gen.get("project_start_date", fb["general"]["project_start_date"])

    raw_managers = cfg.get("managers")
    if not raw_managers or not isinstance(raw_managers, list) or len(raw_managers) == 0:
        if is_master_or_template:
            raw_managers = fb["managers"]
        else:
            raw_managers = []

    managers = []
    for m in raw_managers:
        m_dict = dict(m)
        m_id = str(m_dict.get("id", ""))
        kpi = kpis_map.get(m_id, {})
        for k in ("revenue_target", "daily_calls_target", "daily_dials_target", "monthly_meetings_target", "meetings_enabled", "next_step_target_pct"):
            if m_dict.get(k) is None and k in kpi:
                m_dict[k] = kpi[k]
        if "capacity" in kpi and kpi["capacity"] is not None:
            m_dict["capacity"] = kpi["capacity"]
        if "updated_at" in kpi and kpi["updated_at"] is not None:
            m_dict["updated_at"] = kpi["updated_at"]
        if "meetings_enabled" not in m_dict or m_dict["meetings_enabled"] is None:
            m_dict["meetings_enabled"] = True
        managers.append(m_dict)

    stages = cfg.get("stages") or fb["stages"]
    loss_reasons = cfg.get("loss_reasons") or fb["loss_reasons"]
    telegram = cfg.get("telegram_settings") or fb["telegram"]
    modules = cfg.get("modules") or fb["modules"]

    return {
        "status": "ok",
        "source": "registry" if cfg.get("managers") else "fallback",
        "tenant_id": clean_tenant,
        "crm_type": cfg.get("crm_type") or "amocrm",
        "general": {
            "company_name": company_name,
            "currency": currency,
            "period_start": period_start,
            "period_end": period_end,
            "monthly_target": monthly_target,
            "project_start_date": project_start_date,
            "avg_deal_check": cfg.get("avg_deal_check"),
        },
        "stages": stages,
        "managers": managers,
        "loss_reasons": loss_reasons,
        "telegram": telegram,
        "modules": modules,
        "autonomy": _autonomy_for(clean_tenant),
    }


def save_settings_to_sheets(payload: SettingsPayload) -> bool:
    clean_tenant = payload.tenant_id.strip().upper()
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # 1. UNCONDITIONAL LOCAL PERSISTENCE FIRST (registry + DB)
    persist_failed = False
    try:
        from ..tenant_registry import load_tenants_registry, save_tenants_registry
        reg = load_tenants_registry()
        for t in reg.get("tenants", []):
            if str(t.get("tenant_id", "")).upper() == clean_tenant:
                if payload.general:
                    if "general_settings" not in t:
                        t["general_settings"] = {}
                    g_dict = payload.general.model_dump(exclude_unset=True)
                    # the average check lives at the tenant top level (that is where insights read it)
                    g_dict.pop("avg_deal_check", None)
                    if "avg_deal_check" in payload.general.model_fields_set:
                        v = payload.general.avg_deal_check
                        t["avg_deal_check"] = float(v) if v and v > 0 else None
                    t["general_settings"].update(g_dict)
                    if payload.general.company_name:
                        t["name"] = payload.general.company_name

                if payload.stages is not None:
                    t["stages"] = [s.model_dump() for s in payload.stages]

                if payload.managers is not None:
                    t["managers"] = [m.model_dump() for m in payload.managers]
                    if "manager_kpis" not in t:
                        t["manager_kpis"] = {}
                    for m in payload.managers:
                        t["manager_kpis"][m.id] = {
                            "revenue_target": m.revenue_target,
                            "daily_calls_target": m.daily_calls_target,
                            "daily_dials_target": m.daily_dials_target,
                            "monthly_meetings_target": m.monthly_meetings_target,
                            "meetings_enabled": m.meetings_enabled,
                            "capacity": m.capacity,
                            "next_step_target_pct": m.next_step_target_pct,
                            "updated_at": m.updated_at or now_iso,
                        }

                if payload.loss_reasons is not None:
                    t["loss_reasons"] = [lr.model_dump() for lr in payload.loss_reasons]

                if payload.telegram is not None:
                    if "telegram_settings" not in t:
                        t["telegram_settings"] = {}
                    t["telegram_settings"].update(payload.telegram.model_dump(exclude_unset=True))

                if payload.modules is not None:
                    t["modules"] = [mod.model_dump() for mod in payload.modules]

                persist_failed = save_tenants_registry(reg) is False
                break
    except Exception as e:
        logger.error(f"Failed to persist settings in local registry: {e}")
        persist_failed = True

    if persist_failed:
        # The cabinet's own copy is the one that counts: never answer "saved" when it was not.
        raise HTTPException(status_code=500, detail="Не удалось сохранить настройки. Попробуйте ещё раз.")

    mirrored = _mirror_to_google_sheet(payload, clean_tenant)

    # Refresh the cache AFTER the sheet write: reading before it kept the old sheet values for the next 15 seconds.
    fresh_data = fetch_settings_from_sheets(tenant_id=clean_tenant, force_refresh=True)
    _SETTINGS_CACHE[clean_tenant] = {
        "data": fresh_data,
        "timestamp": time.time()
    }
    return mirrored


def _mirror_to_google_sheet(payload: SettingsPayload, clean_tenant: str) -> bool:
    """Copies the saved settings into the client's Google Sheet (a safe, non-blocking mirror).
    True: copied, or there is no sheet to copy to. False: the copy failed (the settings are saved in the cabinet)."""
    sa_path = get_service_account_path()
    if not sa_path:
        logger.info(f"service_account.json not found for settings save (tenant: {clean_tenant}); saved locally")
        return True

    modules_failed = False
    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        sheet_id = get_tenant_spreadsheet_id(clean_tenant)
        if not sheet_id:
            logger.info(f"Tenant {clean_tenant} has no connected spreadsheet, skipping Google Sheets sync (saved locally)")
            return True
        ss = gc.open_by_key(sheet_id)

        ws_settings = ss.worksheet("⚙️ Настройки")

        # 1. Update general settings if present
        if payload.general:
            g = payload.general
            sent = g.model_fields_set  # only what the caller really sent
            if "company_name" in sent and g.company_name is not None:
                ws_settings.update_acell("B3", g.company_name)
            if "currency" in sent and g.currency is not None:
                ws_settings.update_acell("B4", g.currency)
            if "period_start" in sent and g.period_start is not None:
                ws_settings.update_acell("B6", g.period_start)
            if "period_end" in sent and g.period_end is not None:
                ws_settings.update_acell("B7", g.period_end)
            if "monthly_target" in sent and g.monthly_target is not None:
                # 0 = "no plan": the cell is cleared, never filled with a number nobody set
                target_str = "" if g.monthly_target <= 0 else f"{g.monthly_target:,.0f} ₽".replace(",", " ")
                ws_settings.update_acell("B9", target_str)

        # 2. Update stages SLA and Win % if present (Rows 12-18)
        if payload.stages:
            for st in payload.stages:
                row_num = st.id + 11
                if 12 <= row_num <= 18:
                    ws_settings.update(range_name=f"C{row_num}:D{row_num}", values=[[str(st.sla_hours), f"{st.win_pct}%"]])

        # 3. Update managers capacity if present (Rows 21-24)
        if payload.managers is not None:
            for slot_idx in range(4):
                row_num = 21 + slot_idx
                if slot_idx < len(payload.managers):
                    m = payload.managers[slot_idx]
                    ws_settings.update(range_name=f"A{row_num}:D{row_num}", values=[[m.id, m.name, m.role, str(m.capacity)]])
                else:
                    ws_settings.update(range_name=f"A{row_num}:D{row_num}", values=[["", "", "", ""]])

        # 4. Update loss reasons if present (Rows 26-29)
        if payload.loss_reasons:
            for idx, lr in enumerate(payload.loss_reasons):
                row_num = 26 + idx
                if 26 <= row_num <= 29:
                    ws_settings.update(range_name=f"A{row_num}:C{row_num}", values=[[lr.code, lr.reason, f"{lr.reactivation_prob}%"]])

        # 5. Update Telegram settings if present
        if payload.telegram:
            t = payload.telegram
            if t.rop_chat_id is not None:
                ws_settings.update_acell("B54", str(t.rop_chat_id))
            if t.ceo_chat_id is not None:
                ws_settings.update_acell("B55", str(t.ceo_chat_id))
            if t.team_chat_id is not None:
                ws_settings.update_acell("B56", str(t.team_chat_id))
            if t.dispatcher_status is not None:
                status_str = "🟢 ACTIVE (Триггер: каждый час + 09:15)" if t.dispatcher_status else "🔴 ВЫКЛ"
                ws_settings.update_acell("B58", status_str)

        # 6. Update 19 modules if present in ⚙️ Модули_Интеграции
        if payload.modules:
            try:
                ws_modules = ss.worksheet("⚙️ Модули_Интеграции")
                m_rows = ws_modules.get_all_values()
                mod_map = {m.code: m for m in payload.modules}
                updates = []
                for idx, r in enumerate(m_rows[1:], start=2):
                    if r and r[0] in mod_map:
                        m_obj = mod_map[r[0]]
                        status_str = "🟢 ВКЛ" if m_obj.status else "🔴 ВЫКЛ"
                        updates.append({"range": f"D{idx}", "values": [[status_str]]})
                if updates:
                    ws_modules.batch_update(updates)
            except Exception as e:
                logger.error(f"Failed to batch update modules: {e}")
                modules_failed = True

        return not modules_failed

    except Exception as e:
        logger.warning(f"Google Sheets sync failed for {clean_tenant}, but local settings saved: {e}")
        return False


# ============================================================================
# ENDPOINTS
# ============================================================================

def _authorized_tenant(request: Request, requested: str | None) -> str:
    """Tenant from JWT (Bearer/cookie) or admin auth; 401/403 for anonymous or cross-tenant callers."""
    from .deals_router import get_authenticated_tenant_or_verify_admin
    return get_authenticated_tenant_or_verify_admin(request, requested)


@router.get("")
async def get_settings(
    request: Request,
    tenant_id: str | None = None,
    tenant: str | None = None,
    auto_sync: bool = False,
):
    """
    Returns 28 business configuration parameters from Google Sheets (⚙️ Настройки) for given tenant.
    Optionally triggers auto-sync from CRM if auto_sync=True.
    """
    clean_tenant = _authorized_tenant(request, tenant_id or tenant)
    if auto_sync:
        try:
            from ..services.crm_users_sync import sync_tenant_crm_managers
            await sync_tenant_crm_managers(clean_tenant)
        except Exception as e:
            logger.warning(f"CRM auto-sync failed during get_settings for {clean_tenant}: {e}")

    return fetch_settings_from_sheets(tenant_id=clean_tenant)


@router.post("/managers/sync")
async def sync_managers(
    request: Request,
    tenant_id: str | None = Query(None),
    tenant: str | None = Query(None),
    auto: bool = Query(False),
):
    """
    Auto-discovers and imports managers from connected CRM (amoCRM / Bitrix24).
    Safe non-destructive sync: preserves existing manager targets and plans,
    adds new team members with standard RevOps presets.
    auto=true is the cabinet's own call on page load: it runs at most once per 10 minutes per tenant,
    the "sync" button (auto=false) always runs.
    """
    clean_tenant = _authorized_tenant(request, tenant_id or tenant)
    now = time.time()
    if auto and now - _AUTO_SYNC_AT.get(clean_tenant, 0.0) < _AUTO_SYNC_EVERY_SEC:
        return {
            "status": "skipped",
            "message": "Команда уже синхронизирована с CRM недавно",
            "crm_type": "",
            "added_count": 0,
            "total_count": 0,
        }
    _AUTO_SYNC_AT[clean_tenant] = now
    from ..services.crm_users_sync import sync_tenant_crm_managers
    res = await sync_tenant_crm_managers(clean_tenant)

    # Invalidate cache if managers were added
    if clean_tenant in _SETTINGS_CACHE:
        _SETTINGS_CACHE[clean_tenant]["timestamp"] = 0

    if res.get("added_count", 0) > 0:
        fresh_settings = fetch_settings_from_sheets(tenant_id=clean_tenant, force_refresh=True)
        await manager.broadcast(clean_tenant, {
            "event": "settings_updated",
            "timestamp": time.time(),
            "settings": fresh_settings,
        })

    return res


@router.post("/tenants/{tenant_id}/managers/sync")
async def sync_tenant_managers_route(tenant_id: str, request: Request):
    return await sync_managers(request=request, tenant_id=tenant_id, tenant=None, auto=False)


@router.post("")
async def save_settings(
    request: Request,
    payload: SettingsPayload
):
    """
    Updates business settings in Google Sheets (⚙️ Настройки and ⚙️ Модули_Интеграции)
    and broadcasts the update to all active web clients via WebSocket.
    """
    payload.tenant_id = _authorized_tenant(request, payload.tenant_id)
    success = save_settings_to_sheets(payload)
    fresh_settings = fetch_settings_from_sheets(tenant_id=payload.tenant_id)

    # Broadcast to open web dashboard tabs via WebSocket
    await manager.broadcast(payload.tenant_id, {
        "event": "settings_updated",
        "timestamp": time.time(),
        "settings": fresh_settings
    })

    return {
        "status": "ok" if success else "partial_ok",
        "message": (
            "Настройки сохранены в личном кабинете и в Google Таблице"
            if success
            else "Настройки сохранены в личном кабинете, но в Google Таблицу записать не удалось"
        ),
        "settings": fresh_settings
    }


@router.patch("/managers/{manager_id}/kpis")
async def patch_manager_kpis(
    manager_id: str,
    payload: ManagerKpiPatch,
    request: Request,
    tenant_id: str | None = Query(None),
):
    """
    Granular update of manager personal KPI targets:
    - revenue_target (>= 0 or null)
    - daily_calls_target (0..200 or null) - целевых от 60 сек
    - daily_dials_target (0..500 or null) - наборов всего
    - monthly_meetings_target (0..500 or null)
    - meetings_enabled (bool or null)
    - capacity (0..500 or null)
    - next_step_target_pct (0..100 or null)
    Preserves nulls as 'норматив не задан' (unrated).
    """
    # 1. Validation
    if payload.revenue_target is not None and payload.revenue_target < 0:
        raise HTTPException(status_code=422, detail="План выручки должен быть не меньше 0 ₽")
    if payload.daily_calls_target is not None and not (0 <= payload.daily_calls_target <= 200):
        raise HTTPException(status_code=422, detail="Норма звонков (от 60с) должна быть в диапазоне 0..200")
    if payload.daily_dials_target is not None and not (0 <= payload.daily_dials_target <= 500):
        raise HTTPException(status_code=422, detail="Норма наборов (всего) должна быть в диапазоне 0..500")
    if payload.monthly_meetings_target is not None and not (0 <= payload.monthly_meetings_target <= 500):
        raise HTTPException(status_code=422, detail="План встреч должен быть в диапазоне 0..500")
    if payload.capacity is not None and not (0 <= payload.capacity <= 500):
        raise HTTPException(status_code=422, detail="Вместимость воронки должна быть в диапазоне 0..500")
    if payload.next_step_target_pct is not None and not (0 <= payload.next_step_target_pct <= 100):
        raise HTTPException(status_code=422, detail="Next Step % должен быть в диапазоне 0..100%")

    clean_tenant = _authorized_tenant(request, tenant_id)
    from ..tenant_registry import load_tenants_registry, save_tenants_registry
    reg = load_tenants_registry()
    target_tenant = None
    for t in reg.get("tenants", []):
        if str(t.get("tenant_id", "")).upper() == clean_tenant:
            target_tenant = t
            break

    if not target_tenant:
        raise HTTPException(status_code=404, detail=f"Тенант '{tenant_id}' не найден в реестре")

    if "manager_kpis" not in target_tenant:
        target_tenant["manager_kpis"] = {}

    mgr_kpis = target_tenant["manager_kpis"].setdefault(manager_id, {})
    now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    # Exclude unset fields so we only update explicitly passed values, allowing nulls
    update_data = payload.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        mgr_kpis[k] = v
    mgr_kpis["updated_at"] = now_iso

    # Also sync into managers list in tenant if manager is present there
    updated_mgr = None
    if "managers" in target_tenant and isinstance(target_tenant["managers"], list):
        for m in target_tenant["managers"]:
            if str(m.get("id", "")).lower() == manager_id.lower():
                for k, v in update_data.items():
                    m[k] = v
                m["updated_at"] = now_iso
                updated_mgr = m
                break

    save_tenants_registry(reg)

    # Invalidate settings cache
    if clean_tenant in _SETTINGS_CACHE:
        _SETTINGS_CACHE[clean_tenant]["timestamp"] = 0

    # Broadcast via WebSocket
    await manager.broadcast(clean_tenant, {
        "event": "manager_kpi_updated",
        "manager_id": manager_id,
        "timestamp": time.time(),
        "kpis": mgr_kpis
    })

    return {
        "status": "ok",
        "manager_id": manager_id,
        "kpis": mgr_kpis,
        "manager": updated_mgr
    }


@router.patch("/tenants/{tenant_id}/managers/{manager_id}/kpis")
async def patch_tenant_manager_kpis(
    tenant_id: str,
    manager_id: str,
    payload: ManagerKpiPatch,
    request: Request,
):
    return await patch_manager_kpis(manager_id=manager_id, payload=payload, request=request, tenant_id=tenant_id)

def get_current_user_or_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    admin_key = (
        request.headers.get("x-admin-key")
        or request.headers.get("x-revops-admin-key")
        or request.headers.get("x-revops-secret")
    )
    revops_admin_key = os.getenv("REVOPS_ADMIN_KEY")
    if admin_key and revops_admin_key and secrets.compare_digest(admin_key, revops_admin_key):
        return User(
            id="admin-sys",
            tenant_id="*",
            email="admin@revops.io",
            full_name="System Administrator",
            role=UserRole.ADMIN,
            is_active=True,
        )

    if credentials or (request and request.cookies.get("access_token")):
        return get_current_user(credentials=credentials, db=db, request=request)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Требуется авторизация (Bearer токен или Admin-ключ)",
        headers={"WWW-Authenticate": "Bearer"},
    )


@router.get("/autonomy")
def get_autonomy_settings(
    tenant_id: str = Query("TNT-001"),
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    """Returns autonomy and intervention levels for the tenant (Passive Advisor by default)."""
    clean_tenant = (tenant_id or "TNT-001").strip()
    from packages.antidrift.contracts.policy_config import TenantPolicyRegistry

    # Cross-tenant permission check. Only the platform ADMIN crosses tenants: CEO owns ONE company.
    if current_user.role != UserRole.ADMIN:
        t_user = db.query(Tenant).filter(Tenant.id == current_user.tenant_id).first()
        allowed_tids = {current_user.tenant_id, "*"}
        if t_user:
            allowed_tids.add(t_user.id)
            if t_user.slug:
                allowed_tids.add(t_user.slug)
        if clean_tenant not in allowed_tids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ к настройкам другого тенанта запрещён")

    cfg = TenantPolicyRegistry.get_config(clean_tenant, db=db)
    return {
        "tenant_id": clean_tenant,
        "allow_crm_mutations": cfg.allow_crm_mutations,
        "enable_telegram_notifications": cfg.enable_telegram_notifications,
        "allow_client_communication": cfg.allow_client_communication,
        "mode": "autonomous" if cfg.allow_crm_mutations else "passive_advisor",
    }


@router.patch("/autonomy")
def patch_autonomy_settings(
    payload: AutonomyPatchPayload,
    tenant_id: str = Query("TNT-001"),
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    """Updates AI autonomy permissions in the tenant's Personal Cabinet (LK)."""
    clean_tenant = (tenant_id or "TNT-001").strip()
    from packages.antidrift.contracts.policy_config import TenantPolicyRegistry

    tenant_obj = db.query(Tenant).filter((Tenant.id == clean_tenant) | (Tenant.slug == clean_tenant)).first()
    if not tenant_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Tenant '{clean_tenant}' not found in database",
        )

    # Cross-tenant permission check. Only the platform ADMIN crosses tenants: CEO owns ONE company.
    if current_user.role != UserRole.ADMIN:
        allowed_tids = {tenant_obj.id, "*"}
        if tenant_obj.slug:
            allowed_tids.add(tenant_obj.slug)
        if current_user.tenant_id not in allowed_tids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Изменение настроек другого тенанта запрещено")

    st = dict(tenant_obj.settings or {}) if tenant_obj.settings else {}
    auto_block = dict(st.get("autonomy") or {})

    if payload.allow_crm_mutations is not None:
        auto_block["allow_crm_mutations"] = payload.allow_crm_mutations
        st["allow_crm_mutations"] = payload.allow_crm_mutations
    if payload.enable_telegram_notifications is not None:
        auto_block["enable_telegram_notifications"] = payload.enable_telegram_notifications
        st["enable_telegram_notifications"] = payload.enable_telegram_notifications
    if payload.allow_client_communication is not None:
        auto_block["allow_client_communication"] = payload.allow_client_communication
        st["allow_client_communication"] = payload.allow_client_communication

    st["autonomy"] = auto_block
    setattr(tenant_obj, 'settings', st)
    db.commit()
    # /settings carries the autonomy flags and is cached for 15 s: the cabinet reloads it right after this call
    for cache_key in {clean_tenant.upper(), str(tenant_obj.id).upper()}:
        _SETTINGS_CACHE.pop(cache_key, None)

    t_id_str = str(tenant_obj.id)
    cfg = TenantPolicyRegistry.get_config(t_id_str, db=db)
    if payload.allow_crm_mutations is not None:
        cfg.allow_crm_mutations = payload.allow_crm_mutations
    if payload.enable_telegram_notifications is not None:
        cfg.enable_telegram_notifications = payload.enable_telegram_notifications
    if payload.allow_client_communication is not None:
        cfg.allow_client_communication = payload.allow_client_communication
    TenantPolicyRegistry.register_config(cfg)
    TenantPolicyRegistry._configs[clean_tenant] = cfg
    TenantPolicyRegistry._configs[t_id_str] = cfg
    if tenant_obj.slug:
        TenantPolicyRegistry._configs[str(tenant_obj.slug)] = cfg

    return {
        "status": "UPDATED",
        "tenant_id": clean_tenant,
        "allow_crm_mutations": cfg.allow_crm_mutations,
        "enable_telegram_notifications": cfg.enable_telegram_notifications,
        "allow_client_communication": cfg.allow_client_communication,
        "mode": "autonomous" if cfg.allow_crm_mutations else "passive_advisor",
    }


@router.patch("/tenants/{tenant_id}/autonomy")
def patch_tenant_autonomy(
    tenant_id: str,
    payload: AutonomyPatchPayload,
    current_user: User = Depends(get_current_user_or_admin),
    db: Session = Depends(get_db),
):
    return patch_autonomy_settings(payload=payload, tenant_id=tenant_id, current_user=current_user, db=db)

