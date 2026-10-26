"""
Settings Router: 28 Filling Parameters, Revenue Target, Funnel SLA, Team Capacity,
Loss Reasons, Telegram Integration, and 19 CRM Feature Flags.
Synchronizes with Google Sheets (⚙️ Настройки, 📋 Паспорт_Клиента, ⚙️ Модули_Интеграции).
"""

import logging
import os
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel

from ..tenant_registry import get_tenant_spreadsheet_id
from ..websocket_manager import manager

logger = logging.getLogger("settings_router")

router = APIRouter(prefix="/settings", tags=["Settings & Business Parameters"])

# In-memory settings cache keyed by tenant_id (TTL: 15s)
_SETTINGS_CACHE: dict[str, dict[str, Any]] = {}


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


class GeneralSettings(BaseModel):
    company_name: str | None = "Самозанятый"
    currency: str | None = "RUB (₽)"
    period_start: str | None = "2026-10-01"
    period_end: str | None = "2026-10-31"
    monthly_target: float | None = 5000000.0
    project_start_date: str | None = "2026-10-03"


class StageSLA(BaseModel):
    id: int
    name: str
    sla_hours: int
    win_pct: int


class ManagerCapacity(BaseModel):
    id: str
    name: str
    role: str
    capacity: int


class LossReason(BaseModel):
    code: str
    reason: str
    reactivation_prob: int


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


class SettingsPayload(BaseModel):
    tenant_id: str = "TNT-001"
    general: GeneralSettings | None = None
    stages: list[StageSLA] | None = None
    managers: list[ManagerCapacity] | None = None
    loss_reasons: list[LossReason] | None = None
    telegram: TelegramSettings | None = None
    modules: list[ModuleToggle] | None = None


def fetch_settings_from_sheets(tenant_id: str = "TNT-001") -> dict[str, Any]:
    clean_tenant = (tenant_id or "TNT-001").strip().upper()
    now = time.time()
    cached = _SETTINGS_CACHE.get(clean_tenant)
    if cached and (now - cached.get("timestamp", 0) < 15):
        return cached.get("data", get_fallback_settings())

    sa_path = get_service_account_path()
    if not sa_path:
        logger.warning(f"service_account.json not found for settings fetch (tenant: {clean_tenant})")
        return get_fallback_settings()

    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        sheet_id = get_tenant_spreadsheet_id(clean_tenant)
        ss = gc.open_by_key(sheet_id)

        ws_settings = ss.worksheet("⚙️ Настройки")
        s_rows = ws_settings.get_all_values()

        # Parse general settings
        company_name = "Самозанятый"
        currency = "RUB (₽)"
        period_start = "2026-10-01"
        period_end = "2026-10-31"
        monthly_target = 5000000.0
        project_start_date = "2026-10-03"

        for r in s_rows:
            if not r:
                continue
            col0 = r[0].strip() if len(r) > 0 else ""
            col1 = r[1].strip() if len(r) > 1 else ""
            if "Организация" in col0:
                company_name = col1 or company_name
            elif "Валюта" in col0:
                currency = col1 or currency
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
        from ..tenant_registry import get_tenant_config
        cfg = get_tenant_config(clean_tenant) or {}
        if cfg.get("managers") and isinstance(cfg.get("managers"), list) and len(cfg["managers"]) > 0:
            managers = cfg["managers"]
        else:
            managers = []
            for r_idx in range(20, min(24, len(s_rows))):
                r = s_rows[r_idx]
                if len(r) >= 4 and r[0]:
                    m_id = r[0]
                    m_name = r[1]
                    m_role = r[2]
                    cap = int(r[3]) if r[3].isdigit() else 40
                    managers.append({"id": m_id, "name": m_name, "role": m_role, "capacity": cap})

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

        result = {
            "status": "ok",
            "source": "google_sheets",
            "tenant_id": "TNT-001",
            "general": {
                "company_name": company_name,
                "currency": currency,
                "period_start": period_start,
                "period_end": period_end,
                "monthly_target": monthly_target,
                "project_start_date": project_start_date
            },
            "stages": stages or get_fallback_settings()["stages"],
            "managers": managers or get_fallback_settings()["managers"],
            "loss_reasons": loss_reasons or get_fallback_settings()["loss_reasons"],
            "telegram": telegram,
            "modules": modules or get_fallback_settings()["modules"]
        }

        _SETTINGS_CACHE[clean_tenant] = {
            "data": result,
            "timestamp": now
        }
        return result

    except Exception as e:
        logger.error(f"Error reading settings from Google Sheets: {e}")
        return get_fallback_settings()


def get_fallback_settings() -> dict[str, Any]:
    return {
        "status": "ok",
        "source": "fallback",
        "tenant_id": "TNT-001",
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
        "managers": [
            {"id": "101", "name": "Заряна", "role": "Менеджер ОП", "capacity": 40},
            {"id": "102", "name": "Надежда", "role": "Менеджер ОП", "capacity": 40},
            {"id": "103", "name": "Виктория", "role": "Менеджер ОП", "capacity": 40},
            {"id": "11422686", "name": "Дмитрий Федотов", "role": "РОП", "capacity": 50}
        ],
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


def save_settings_to_sheets(payload: SettingsPayload) -> bool:
    sa_path = get_service_account_path()
    if not sa_path:
        logger.warning("service_account.json not found for settings save")
        return False

    try:
        import gspread
        gc = gspread.service_account(str(sa_path))
        sheet_id = get_tenant_spreadsheet_id(payload.tenant_id)
        ss = gc.open_by_key(sheet_id)

        ws_settings = ss.worksheet("⚙️ Настройки")

        # 1. Update general settings if present
        if payload.general:
            g = payload.general
            if g.company_name is not None:
                ws_settings.update_acell("B3", g.company_name)
            if g.currency is not None:
                ws_settings.update_acell("B4", g.currency)
            if g.period_start is not None:
                ws_settings.update_acell("B6", g.period_start)
            if g.period_end is not None:
                ws_settings.update_acell("B7", g.period_end)
            if g.monthly_target is not None:
                target_str = f"{g.monthly_target:,.0f} ₽".replace(",", " ")
                ws_settings.update_acell("B9", target_str)

        # 2. Update stages SLA and Win % if present (Rows 12-18)
        if payload.stages:
            for st in payload.stages:
                # row index = st.id + 11 (id 1 = row 12)
                row_num = st.id + 11
                if 12 <= row_num <= 18:
                    ws_settings.update(range_name=f"C{row_num}:D{row_num}", values=[[str(st.sla_hours), f"{st.win_pct}%"]])

        # 3. Update managers capacity if present (Rows 21-24 and Registry)
        if payload.managers is not None:
            for slot_idx in range(4):
                row_num = 21 + slot_idx
                if slot_idx < len(payload.managers):
                    m = payload.managers[slot_idx]
                    ws_settings.update(range_name=f"A{row_num}:D{row_num}", values=[[m.id, m.name, m.role, str(m.capacity)]])
                else:
                    ws_settings.update(range_name=f"A{row_num}:D{row_num}", values=[["", "", "", ""]])

            try:
                from ..tenant_registry import load_tenants_registry, save_tenants_registry
                reg = load_tenants_registry()
                for t in reg.get("tenants", []):
                    if str(t.get("tenant_id", "")).upper() == payload.tenant_id.strip().upper():
                        t["managers"] = [m.model_dump() for m in payload.managers]
                        save_tenants_registry(reg)
                        break
            except Exception as e:
                logger.warning(f"Failed to persist managers in registry: {e}")

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

        # Invalidate in-memory cache for this tenant
        clean_tenant = payload.tenant_id.strip().upper()
        if clean_tenant in _SETTINGS_CACHE:
            _SETTINGS_CACHE[clean_tenant]["timestamp"] = 0
        return True

    except Exception as e:
        logger.error(f"Error saving settings to Google Sheets for tenant {payload.tenant_id}: {e}")
        return False


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("")
def get_settings(
    tenant_id: str = Query("TNT-001")
):
    """
    Returns 28 business configuration parameters from Google Sheets (⚙️ Настройки) for given tenant.
    """
    return fetch_settings_from_sheets(tenant_id=tenant_id)


@router.post("")
async def save_settings(
    payload: SettingsPayload
):
    """
    Updates business settings in Google Sheets (⚙️ Настройки and ⚙️ Модули_Интеграции)
    and broadcasts the update to all active web clients via WebSocket.
    """
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
        "message": "Настройки успешно сохранены в Google Таблицу и транслированы в систему",
        "settings": fresh_settings
    }
