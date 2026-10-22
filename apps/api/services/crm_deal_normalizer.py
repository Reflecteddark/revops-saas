"""
RevOps Enterprise OS - Universal Multi-CRM Deal Normalization Engine.
Source-independent normalization layer for Bitrix24, amoCRM, and hybrid sources.
Transforms arbitrary CRM payloads into standard RevOps raw_deals schema.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("crm_deal_normalizer")

# Standard RevOps Funnel weights (7 stages)
DEFAULT_STAGE_WEIGHTS: dict[int, float] = {
    1: 0.10,  # 1. Первичный контакт / Новый лид
    2: 0.35,  # 2. Квалификация / Подготовка документов
    3: 0.60,  # 3. КЭВ / Счёт на предоплату / Демо
    4: 0.85,  # 4. В работе / Согласование договора
    5: 0.95,  # 5. Финальный счёт / Оплата
    6: 1.00,  # 6. Успешно реализовано (WON)
    7: 0.00,  # 7. Закрыто и не реализовано (LOST)
}

# Standard RevOps Stage Names
DEFAULT_STAGE_NAMES: dict[int, str] = {
    1: "Новый лид",
    2: "Квалификация",
    3: "Встреча / Демо",
    4: "КП / В работе",
    5: "Финальный счёт / Договор",
    6: "Успешно реализовано",
    7: "Закрыто и не реализовано",
}

# Google Sheets max cell character limit is 50,000; safety threshold is 45,000
MAX_SHEET_CELL_CHARS = 45000


def sanitize_custom_payload(payload: Any) -> str:
    """Serializes custom payload to JSON string with strict < 45,000 character cell safety."""
    if not payload:
        return "{}"
    try:
        raw_json = json.dumps(payload, ensure_ascii=False)
        if len(raw_json) > MAX_SHEET_CELL_CHARS:
            # Truncate and wrap safely
            truncated = raw_json[: MAX_SHEET_CELL_CHARS - 30]
            return truncated + '..."_truncated":true}'
        return raw_json
    except Exception as e:
        logger.warning(f"Failed to serialize custom_payload: {e}")
        return "{}"


def parse_numeric_price(val: Any) -> tuple[float, bool]:
    """
    Parses numeric price from raw value without falsy defaults or hardcoded mocks.
    Returns (price: float, is_unknown: bool).
    Supports: "0.00", "0", 0, 0.0, None, "", "150 000 ₽", "300,50".
    """
    if val is None or val == "":
        return 0.0, True

    if isinstance(val, (int, float)):
        return float(val), False

    val_str = str(val).strip()
    clean = re.sub(r"[^\d.,]", "", val_str)
    if not clean:
        return 0.0, True

    if "," in clean and "." in clean:
        if clean.rfind(",") > clean.rfind("."):
            clean = clean.replace(".", "").replace(",", ".")
        else:
            clean = clean.replace(",", "")
    elif "," in clean:
        if re.search(r",\d{3}$", clean) or clean.count(",") > 1:
            clean = clean.replace(",", "")
        else:
            clean = clean.replace(",", ".")
    elif "." in clean:
        if re.search(r"\.\d{3}$", clean) or clean.count(".") > 1:
            clean = clean.replace(".", "")

    try:
        return float(clean), False
    except (ValueError, TypeError):
        return 0.0, True


def map_stage_bitrix24(
    raw_stage_id: str | None,
    raw_semantic: str | None = None,
    stage_mapping_config: dict[str, Any] | None = None,
    stages_catalog: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Normalizes Bitrix24 stage into RevOps 1..7 standard.
    Returns {stage_num: int | None, stage_name: str, weight: float | None, is_won: bool, is_lost: bool, is_active: bool, status: str}.
    If stage is unknown: returns status='UNKNOWN', weight=None (zero NaN risk).
    """
    clean_stage = str(raw_stage_id or "").strip().upper()
    semantic = str(raw_semantic or "").strip().upper()

    # 1. Custom client mapping config overrides
    if stage_mapping_config and clean_stage in stage_mapping_config:
        cfg = stage_mapping_config[clean_stage]
        if isinstance(cfg, dict):
            st_num = int(cfg.get("stage_id", 1))
            weight = float(cfg.get("weight", DEFAULT_STAGE_WEIGHTS.get(st_num, 0.1)))
            is_won = bool(st_num == 6 or cfg.get("is_won"))
            is_lost = bool(st_num == 7 or cfg.get("is_lost"))
            is_active = bool(1 <= st_num <= 5)
            status = "WON" if is_won else ("LOST" if is_lost else "ACTIVE")
            return {
                "stage_num": st_num,
                "stage_name": cfg.get("stage_name", DEFAULT_STAGE_NAMES.get(st_num, clean_stage)),
                "weight": weight,
                "is_won": is_won,
                "is_lost": is_lost,
                "is_active": is_active,
                "status": status
            }

    # 2. Semantic ID priority from Bitrix24
    if semantic == "S" or "WON" in clean_stage or "УСПЕШНО" in clean_stage:
        return {
            "stage_num": 6,
            "stage_name": "Успешно реализовано",
            "weight": 1.0,
            "is_won": True,
            "is_lost": False,
            "is_active": False,
            "status": "WON"
        }
    if semantic == "F" or "LOSE" in clean_stage or "LOST" in clean_stage or "ПРОВАЛ" in clean_stage or "ОТКАЗ" in clean_stage:
        return {
            "stage_num": 7,
            "stage_name": "Закрыто и не реализовано",
            "weight": 0.0,
            "is_won": False,
            "is_lost": True,
            "is_active": False,
            "status": "LOST"
        }

    # 3. Standard pipeline stage recognition
    if "NEW" in clean_stage or "НОВАЯ" in clean_stage or clean_stage in ("1", "STAGE_1"):
        return {"stage_num": 1, "stage_name": "Новая", "weight": 0.10, "is_won": False, "is_lost": False, "is_active": True, "status": "ACTIVE"}
    if "PREPARATION" in clean_stage or "ДОКУМЕНТ" in clean_stage or clean_stage in ("2", "STAGE_2"):
        return {"stage_num": 2, "stage_name": "Подготовка документов", "weight": 0.35, "is_won": False, "is_lost": False, "is_active": True, "status": "ACTIVE"}
    if "PREPAYMENT" in clean_stage or "ПРЕДОПЛАТ" in clean_stage or clean_stage in ("3", "STAGE_3"):
        return {"stage_num": 3, "stage_name": "Счёт на предоплату", "weight": 0.60, "is_won": False, "is_lost": False, "is_active": True, "status": "ACTIVE"}
    if "EXECUTING" in clean_stage or "РАБОТ" in clean_stage or clean_stage in ("4", "STAGE_4"):
        return {"stage_num": 4, "stage_name": "В работе", "weight": 0.85, "is_won": False, "is_lost": False, "is_active": True, "status": "ACTIVE"}
    if "FINAL" in clean_stage or "ФИНАЛЬН" in clean_stage or clean_stage in ("5", "STAGE_5"):
        return {"stage_num": 5, "stage_name": "Финальный счёт", "weight": 0.95, "is_won": False, "is_lost": False, "is_active": True, "status": "ACTIVE"}

    # 4. Unknown Custom Stage (do not default to LOST or 10%)
    logger.warning(f"[Bitrix24 Stage Mapping] Unknown stage detected: '{clean_stage}' (semantic: {semantic})")
    catalog_name = (stages_catalog or {}).get(clean_stage, f"Неизвестный этап ({clean_stage})")
    return {
        "stage_num": None,
        "stage_name": catalog_name,
        "weight": None,
        "is_won": False,
        "is_lost": False,
        "is_active": False,
        "status": "UNKNOWN"
    }


def map_stage_amocrm(
    pipeline_id: Any,
    status_id: Any,
    stage_mapping_config: dict[str, Any] | None = None,
    stages_catalog: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Normalizes amoCRM (pipeline_id + status_id) into RevOps 1..7 standard.
    Never hardcodes 142/143 blindly; uses stage catalog and status rules.
    """
    pipe_str = str(pipeline_id or "").strip()
    status_str = str(status_id or "").strip()
    key = f"{pipe_str}:{status_str}" if pipe_str else status_str

    # 1. Custom client mapping config overrides
    if stage_mapping_config and (key in stage_mapping_config or status_str in stage_mapping_config):
        cfg = stage_mapping_config.get(key) or stage_mapping_config.get(status_str)
        if isinstance(cfg, dict):
            st_num = int(cfg.get("stage_id", 1))
            weight = float(cfg.get("weight", DEFAULT_STAGE_WEIGHTS.get(st_num, 0.1)))
            is_won = bool(st_num == 6 or cfg.get("is_won"))
            is_lost = bool(st_num == 7 or cfg.get("is_lost"))
            is_active = bool(1 <= st_num <= 5)
            status = "WON" if is_won else ("LOST" if is_lost else "ACTIVE")
            return {
                "stage_num": st_num,
                "stage_name": cfg.get("stage_name", DEFAULT_STAGE_NAMES.get(st_num, f"amoCRM Status {status_str}")),
                "weight": weight,
                "is_won": is_won,
                "is_lost": is_lost,
                "is_active": is_active,
                "status": status
            }

    # 2. Dynamic stages catalog from amoCRM API (/api/v4/leads/pipelines)
    if stages_catalog:
        cat_info = stages_catalog.get(key) or stages_catalog.get(status_str)
        if cat_info and isinstance(cat_info, dict):
            st_name = cat_info.get("name", f"Статус {status_str}")
            is_won = bool(cat_info.get("is_won") or status_str == "142")
            is_lost = bool(cat_info.get("is_lost") or status_str == "143")
            if is_won:
                return {"stage_num": 6, "stage_name": "Успешно реализовано", "weight": 1.0, "is_won": True, "is_lost": False, "is_active": False, "status": "WON"}
            if is_lost:
                return {"stage_num": 7, "stage_name": "Закрыто и не реализовано", "weight": 0.0, "is_won": False, "is_lost": True, "is_active": False, "status": "LOST"}
            sort_order = int(cat_info.get("sort", 10)) // 10
            rev_stage = max(1, min(5, sort_order))
            return {
                "stage_num": rev_stage,
                "stage_name": st_name,
                "weight": DEFAULT_STAGE_WEIGHTS.get(rev_stage, 0.1),
                "is_won": False,
                "is_lost": False,
                "is_active": True,
                "status": "ACTIVE"
            }

    # 3. Standard default amoCRM status fallbacks
    if status_str == "142":
        return {"stage_num": 6, "stage_name": "Успешно реализовано", "weight": 1.0, "is_won": True, "is_lost": False, "is_active": False, "status": "WON"}
    if status_str == "143":
        return {"stage_num": 7, "stage_name": "Закрыто и не реализовано", "weight": 0.0, "is_won": False, "is_lost": True, "is_active": False, "status": "LOST"}

    # 4. Unknown Stage
    logger.warning(f"[amoCRM Stage Mapping] Unknown status detected: '{status_str}' (pipeline: {pipe_str})")
    return {
        "stage_num": None,
        "stage_name": f"Неизвестный этап (amo #{status_str})",
        "weight": None,
        "is_won": False,
        "is_lost": False,
        "is_active": False,
        "status": "UNKNOWN"
    }


def normalize_bitrix24_deal(
    raw_deal: dict[str, Any],
    tenant_id: str,
    mapping_config: dict[str, Any] | None = None,
    stages_catalog: dict[str, Any] | None = None,
    users_catalog: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Normalizes a single Bitrix24 deal dictionary into RevOps standard schema.
    Guarantees prefix 'B24-{ID}', safe numbers, custom_payload preservation, and zero hardcoded stubs.
    """
    d = raw_deal.get("FIELDS") or raw_deal.get("fields") or raw_deal
    raw_id = str(d.get("ID") or d.get("id") or "").strip()
    if not raw_id:
        raise ValueError("Missing deal ID in Bitrix24 payload")

    deal_id = raw_id if raw_id.startswith("B24-") else f"B24-{raw_id}"
    title = str(d.get("TITLE") or d.get("title") or f"Сделка #{raw_id}").strip()

    # Price / Opportunity
    raw_price = d.get("OPPORTUNITY")
    if raw_price is None:
        raw_price = d.get("opportunity") or d.get("amount") or d.get("price")
    amount, is_price_unknown = parse_numeric_price(raw_price)

    # Stage & Semantics
    raw_stage_id = d.get("STAGE_ID") or d.get("stage_id")
    raw_semantic = d.get("STAGE_SEMANTIC_ID") or d.get("stage_semantic_id")
    stage_info = map_stage_bitrix24(raw_stage_id, raw_semantic, mapping_config, stages_catalog)

    # Weighted amount calculation with strict NaN protection
    weight = stage_info["weight"]
    if weight is not None:
        weighted_amount = round(amount * weight, 2)
    else:
        weighted_amount = None

    # Manager resolution (Zero mock: lookup or 'Не назначен')
    assigned_by_id = str(d.get("ASSIGNED_BY_ID") or d.get("assigned_by_id") or "").strip()
    manager_name = "Не назначен"
    responsible_user = None
    if assigned_by_id and users_catalog and assigned_by_id in users_catalog:
        manager_name = str(users_catalog[assigned_by_id])
        responsible_user = assigned_by_id
    elif assigned_by_id:
        responsible_user = assigned_by_id
        manager_name = f"Менеджер #{assigned_by_id}"

    # Dates
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).isoformat()
    created_at = str(d.get("DATE_CREATE") or d.get("date_create") or today_str)[:10]
    updated_at = str(d.get("DATE_MODIFY") or d.get("date_modify") or today_str)[:10]

    # Extract custom fields (UF_CRM_*)
    custom_fields = {}
    for k, v in d.items():
        if k.startswith("UF_CRM_") or k.startswith("uf_crm_"):
            custom_fields[k] = v

    custom_payload_str = sanitize_custom_payload(custom_fields)

    # Grade
    client_grade = "A" if amount >= 300000 else ("B" if amount >= 150000 else "C")

    # Soft delete check
    is_deleted = bool(d.get("is_deleted") or stage_info.get("status") == "DELETED")
    deleted_at = d.get("deleted_at") if is_deleted else None

    return {
        "deal_id": deal_id,
        "company_name": title,
        "amount": amount,
        "amount_str": f"{int(amount):,} ₽".replace(",", " "),
        "price_is_unknown": is_price_unknown,
        "stage_id": str(stage_info["stage_num"]) if stage_info["stage_num"] is not None else "0",
        "stage_name": stage_info["stage_name"],
        "created_at": created_at,
        "updated_at": updated_at,
        "responsible_user": responsible_user,
        "manager_name": manager_name,
        "segment": "General B2B",
        "source": "bitrix24",
        "client_id": raw_id.replace("B24-", ""),
        "client_grade": client_grade,
        "lost_reason": "Отказ" if stage_info["is_lost"] else ("Удалена в CRM" if is_deleted else ""),
        "last_stage_change": updated_at,
        "is_won": "1" if stage_info["is_won"] else "0",
        "is_lost": "1" if stage_info["is_lost"] or is_deleted else "0",
        "is_active": "1" if stage_info["is_active"] and not is_deleted else "0",
        "weighted_amount": weighted_amount,
        "weighted_amount_str": f"{int(weighted_amount):,} ₽".replace(",", " ") if weighted_amount is not None else "—",
        "status": "DELETED" if is_deleted else stage_info["status"],
        "is_deleted": "1" if is_deleted else "0",
        "deleted_at": deleted_at,
        "custom_payload": custom_payload_str,
        "utm_source": str(d.get("UTM_SOURCE") or ""),
        "utm_medium": str(d.get("UTM_MEDIUM") or ""),
        "utm_campaign": str(d.get("UTM_CAMPAIGN") or ""),
        "yclid": str(d.get("YCLID") or ""),
        "gclid": str(d.get("GCLID") or ""),
        "channel": "bitrix24",
        "synced_at": now_iso,
        "tenant_id": tenant_id
    }


def normalize_amocrm_deal(
    raw_deal: dict[str, Any],
    tenant_id: str,
    mapping_config: dict[str, Any] | None = None,
    stages_catalog: dict[str, Any] | None = None,
    users_catalog: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Normalizes a single amoCRM lead dictionary into RevOps standard schema.
    Guarantees prefix 'AMO-{ID}', safe numbers, custom_fields_values preservation, and zero hardcoded stubs.
    """
    raw_id = str(raw_deal.get("id") or raw_deal.get("ID") or "").strip()
    if not raw_id:
        raise ValueError("Missing deal ID in amoCRM payload")

    deal_id = raw_id if raw_id.startswith("AMO-") else f"AMO-{raw_id}"
    title = str(raw_deal.get("name") or raw_deal.get("title") or f"Сделка #{raw_id}").strip()

    # Price parsing without falsy '||' bug
    raw_price = raw_deal.get("price")
    if raw_price is None:
        raw_price = raw_deal.get("amount") or raw_deal.get("opportunity")
    amount, is_price_unknown = parse_numeric_price(raw_price)

    # Pipeline and status
    pipeline_id = raw_deal.get("pipeline_id")
    status_id = raw_deal.get("status_id")
    stage_info = map_stage_amocrm(pipeline_id, status_id, mapping_config, stages_catalog)

    # Weighted amount calculation with strict NaN protection
    weight = stage_info["weight"]
    if weight is not None:
        weighted_amount = round(amount * weight, 2)
    else:
        weighted_amount = None

    # Manager resolution
    resp_user_id = str(raw_deal.get("responsible_user_id") or raw_deal.get("responsible_user") or "").strip()
    manager_name = "Не назначен"
    responsible_user = None
    if resp_user_id and users_catalog and resp_user_id in users_catalog:
        manager_name = str(users_catalog[resp_user_id])
        responsible_user = resp_user_id
    elif resp_user_id:
        responsible_user = resp_user_id
        manager_name = f"Менеджер #{resp_user_id}"

    # Dates (amoCRM provides timestamps in seconds)
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    now_iso = datetime.now(timezone.utc).isoformat()

    c_ts = raw_deal.get("created_at")
    if isinstance(c_ts, (int, float)) and c_ts > 0:
        created_at = datetime.fromtimestamp(c_ts, tz=timezone.utc).strftime("%Y-%m-%d")
    elif isinstance(c_ts, str) and len(c_ts) >= 10:
        created_at = c_ts[:10]
    else:
        created_at = today_str

    u_ts = raw_deal.get("updated_at")
    if isinstance(u_ts, (int, float)) and u_ts > 0:
        updated_at = datetime.fromtimestamp(u_ts, tz=timezone.utc).strftime("%Y-%m-%d")
    elif isinstance(u_ts, str) and len(u_ts) >= 10:
        updated_at = u_ts[:10]
    else:
        updated_at = today_str

    # Extract custom fields (custom_fields_values)
    custom_fields_raw = raw_deal.get("custom_fields_values") or raw_deal.get("custom_fields") or []
    custom_payload_str = sanitize_custom_payload(custom_fields_raw)

    # Extract UTM tags from custom fields if present
    utm_source, utm_medium, utm_campaign = "", "", ""
    if isinstance(custom_fields_raw, list):
        for cf in custom_fields_raw:
            code = str(cf.get("field_code") or cf.get("name") or "").upper()
            vals = cf.get("values", [])
            val = str(vals[0].get("value", "")) if vals and isinstance(vals[0], dict) else ""
            if "UTM_SOURCE" in code:
                utm_source = val
            elif "UTM_MEDIUM" in code:
                utm_medium = val
            elif "UTM_CAMPAIGN" in code:
                utm_campaign = val

    # Grade
    client_grade = "A" if amount >= 300000 else ("B" if amount >= 150000 else "C")

    # Soft delete check
    is_deleted = bool(raw_deal.get("is_deleted") or stage_info.get("status") == "DELETED")
    deleted_at = raw_deal.get("deleted_at") if is_deleted else None

    return {
        "deal_id": deal_id,
        "company_name": title,
        "amount": amount,
        "amount_str": f"{int(amount):,} ₽".replace(",", " "),
        "price_is_unknown": is_price_unknown,
        "stage_id": str(stage_info["stage_num"]) if stage_info["stage_num"] is not None else "0",
        "stage_name": stage_info["stage_name"],
        "created_at": created_at,
        "updated_at": updated_at,
        "responsible_user": responsible_user,
        "manager_name": manager_name,
        "segment": "General B2B",
        "source": "amocrm",
        "client_id": raw_id.replace("AMO-", ""),
        "client_grade": client_grade,
        "lost_reason": "Отказ" if stage_info["is_lost"] else ("Удалена в CRM" if is_deleted else ""),
        "last_stage_change": updated_at,
        "is_won": "1" if stage_info["is_won"] else "0",
        "is_lost": "1" if stage_info["is_lost"] or is_deleted else "0",
        "is_active": "1" if stage_info["is_active"] and not is_deleted else "0",
        "weighted_amount": weighted_amount,
        "weighted_amount_str": f"{int(weighted_amount):,} ₽".replace(",", " ") if weighted_amount is not None else "—",
        "status": "DELETED" if is_deleted else stage_info["status"],
        "is_deleted": "1" if is_deleted else "0",
        "deleted_at": deleted_at,
        "custom_payload": custom_payload_str,
        "utm_source": utm_source,
        "utm_medium": utm_medium,
        "utm_campaign": utm_campaign,
        "yclid": "",
        "gclid": "",
        "channel": "amocrm",
        "synced_at": now_iso,
        "tenant_id": tenant_id
    }


def normalize_deal(
    raw_deal: dict[str, Any],
    source: str,
    tenant_id: str,
    mapping_config: dict[str, Any] | None = None,
    stages_catalog: dict[str, Any] | None = None,
    users_catalog: dict[str, Any] | None = None
) -> dict[str, Any]:
    """Universal dispatcher for deal normalization based on source ('bitrix24' or 'amocrm')."""
    clean_src = str(source or "bitrix24").strip().lower()
    if clean_src in ("amocrm", "amo_crm", "amo"):
        return normalize_amocrm_deal(raw_deal, tenant_id, mapping_config, stages_catalog, users_catalog)
    return normalize_bitrix24_deal(raw_deal, tenant_id, mapping_config, stages_catalog, users_catalog)
