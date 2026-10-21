"""
Tenant Registry & Multi-Tenant Context Resolver for RevOps SaaS.
Resolves tenant configurations, spreadsheet IDs, and CRM credentials from tenants_registry.json.
Provides in-memory caching and fallback mechanisms.
"""

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("tenant_registry")

DEFAULT_SPREADSHEET_ID = os.getenv("REVOPS_SPREADSHEET_ID", "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk")

_REGISTRY_LOCK = threading.Lock()

_REGISTRY_CACHE: dict[str, Any] = {
    "timestamp": 0,
    "data": None
}


class InterProcessFileLock:
    """
    Cross-platform inter-process file lock.
    Uses fcntl.flock on POSIX/Linux (Aeza VPS) and msvcrt on Windows.
    Guarantees zero race conditions across multiple Uvicorn workers (--workers 4).
    """
    def __init__(self, lock_file_path: Path):
        self.lock_file_path = lock_file_path
        self._fd = None

    def __enter__(self):
        try:
            self.lock_file_path.parent.mkdir(parents=True, exist_ok=True)
            self._fd = open(self.lock_file_path, "a+")
            import platform
            if platform.system() != "Windows":
                import fcntl
                fcntl.flock(self._fd.fileno(), fcntl.LOCK_EX)
            else:
                try:
                    import msvcrt
                    self._fd.seek(0)
                    msvcrt.locking(self._fd.fileno(), msvcrt.LK_LOCK, 1)
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Could not acquire inter-process lock on {self.lock_file_path}: {e}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._fd:
            try:
                import platform
                if platform.system() != "Windows":
                    import fcntl
                    fcntl.flock(self._fd.fileno(), fcntl.LOCK_UN)
                else:
                    try:
                        import msvcrt
                        self._fd.seek(0)
                        msvcrt.locking(self._fd.fileno(), msvcrt.LK_UNLCK, 1)
                    except Exception:
                        pass
                self._fd.close()
            except Exception:
                pass


def get_all_candidate_registry_paths() -> list[Path]:
    candidates = [
        Path("/opt/revops-enterprise-os/tenants_registry.json"),
        Path("/opt/revops-saas/tenants_registry.json"),
        Path(__file__).resolve().parent.parent.parent / "tenants_registry.json",
        Path(__file__).resolve().parent.parent.parent.parent / "revops-enterprise-os" / "tenants_registry.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "tenants_registry.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "multitenant_revops" / "tenants_registry.json",
        Path("tenants_registry.json"),
    ]
    env_path = os.getenv("TENANTS_REGISTRY_PATH")
    if env_path:
        candidates.insert(0, Path(env_path))
    return candidates


def save_tenants_registry(data: dict[str, Any], target_path: Path | None = None, sync_mirrors: bool = True) -> bool:
    """
    Thread-safe & inter-process safe persistence for tenants registry:
    1. Synchronizes and upserts records to the Database (PostgreSQL / SQLite).
    2. Writes atomic mirror to tenants_registry.json with file locking for standalone scripts and backward compatibility.
    """
    # 1. Operational Core: Upsert into Database
    try:
        from packages.database.models import SubscriptionTier, Tenant
        from packages.database.session import SessionLocal, init_db
        init_db()
        db = SessionLocal()
        try:
            tenants_to_save = list(data.get("tenants", []))
            tpl = data.get("clean_starter_template") or data.get("master_template")
            if tpl and isinstance(tpl, dict):
                tenants_to_save.append(tpl)

            for t_dict in tenants_to_save:
                t_id = str(t_dict.get("tenant_id", "")).strip()
                if not t_id:
                    continue
                name = t_dict.get("tenant_name", f"Tenant {t_id}")
                status = t_dict.get("status", "active")
                is_active = (status.lower() == "active")

                settings = {
                    "spreadsheet_id": t_dict.get("spreadsheet_id", DEFAULT_SPREADSHEET_ID),
                    "crm_type": t_dict.get("crm_type", "bitrix24"),
                    "status": status,
                    "niche_name": t_dict.get("niche_name", "Универсальный B2B"),
                    "avg_deal_check": t_dict.get("avg_deal_check", 150000),
                }
                for extra in ("amo_domain", "amo_token", "bitrix_webhook_url", "custom_features", "is_template"):
                    if extra in t_dict:
                        settings[extra] = t_dict[extra]

                existing = db.query(Tenant).filter(Tenant.id == t_id).first()
                if not existing:
                    slug = t_id.lower().replace("_", "-")
                    if db.query(Tenant).filter(Tenant.slug == slug).first():
                        slug = f"{slug}-{int(time.time())}"
                    new_tenant = Tenant(
                        id=t_id,
                        name=name,
                        slug=slug,
                        tier=SubscriptionTier.PRO,
                        is_active=is_active,
                        settings=settings
                    )
                    db.add(new_tenant)
                else:
                    setattr(existing, "name", name)
                    setattr(existing, "is_active", is_active)
                    merged = dict(existing.settings or {})
                    merged.update(settings)
                    setattr(existing, "settings", merged)

            db.commit()
            logger.info("Successfully persisted tenant registry state to Database")
        finally:
            db.close()
    except Exception as dbe:
        logger.warning(f"Could not persist tenant registry to DB (continuing with JSON mirror): {dbe}")

    # 2. File Mirror: Atomic Write to tenants_registry.json
    primary_path = target_path or get_tenants_registry_path()
    if not primary_path:
        primary_path = Path(__file__).resolve().parent.parent.parent / "tenants_registry.json"

    lock_file = primary_path.parent / ".tenants_registry.lock"

    with _REGISTRY_LOCK, InterProcessFileLock(lock_file):
        paths_to_write = [primary_path]
        if sync_mirrors:
            for cand in get_all_candidate_registry_paths():
                try:
                    if cand.exists() and cand.resolve() != primary_path.resolve():
                        paths_to_write.append(cand)
                except Exception:
                    pass

        success = True
        for p in paths_to_write:
            tmp_file = None
            try:
                p.parent.mkdir(parents=True, exist_ok=True)
                tmp_file = p.parent / f".tmp_{p.stem}_{os.getpid()}_{time.time_ns()}.json"
                with open(tmp_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp_file, p)
                logger.info(f"Atomically saved tenants registry mirror to {p}")
            except Exception as ex:
                logger.error(f"Failed to atomic save tenants registry mirror to {p}: {ex}")
                if tmp_file and tmp_file.exists():
                    try:
                        tmp_file.unlink()
                    except Exception:
                        pass
                success = False

        _REGISTRY_CACHE["data"] = data
        _REGISTRY_CACHE["timestamp"] = time.time()
        return success




def get_tenants_registry_path() -> Path | None:
    env_path = os.getenv("TENANTS_REGISTRY_PATH")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    candidates = [
        Path("/opt/revops-enterprise-os/tenants_registry.json"),
        Path(__file__).resolve().parent.parent.parent / "tenants_registry.json",
        Path(__file__).resolve().parent.parent.parent.parent / "revops-enterprise-os" / "tenants_registry.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "tenants_registry.json",
        Path("tenants_registry.json"),
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def load_tenants_registry() -> dict[str, Any]:
    now = time.time()
    if _REGISTRY_CACHE["data"] and (now - _REGISTRY_CACHE["timestamp"] < 10):
        return _REGISTRY_CACHE["data"]

    # 1. Operational Source of Truth: Database (PostgreSQL / SQLite)
    try:
        from packages.database.models import Tenant
        from packages.database.session import SessionLocal
        db = SessionLocal()
        try:
            db_tenants = db.query(Tenant).all()
            if db_tenants:
                active_list = []
                master_template = None
                for t in db_tenants:
                    t_dict = t.to_registry_dict()
                    if t.id == "TNT-CLEAN-001" or t_dict.get("is_template"):
                        master_template = t_dict
                    else:
                        active_list.append(t_dict)

                if not master_template:
                    master_template = {
                        "tenant_id": "TNT-CLEAN-001",
                        "tenant_name": "Clean Starter Template",
                        "spreadsheet_id": "1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A",
                        "crm_type": "template",
                        "status": "template",
                        "is_template": True
                    }

                data = {
                    "tenants": active_list,
                    "master_template": master_template
                }
                _REGISTRY_CACHE["data"] = data
                _REGISTRY_CACHE["timestamp"] = now
                return data
        finally:
            db.close()
    except Exception as dbe:
        logger.debug(f"DB tenant query fallback to JSON file: {dbe}")

    # 2. Fallback: Local JSON Registry File Mirror
    reg_path = get_tenants_registry_path()
    if not reg_path:
        logger.warning("tenants_registry.json not found in candidate paths. Using fallback defaults.")
        default_data = {
            "tenants": [
                {
                    "tenant_id": "TNT-001",
                    "tenant_name": "Самозанятый (Master)",
                    "spreadsheet_id": DEFAULT_SPREADSHEET_ID,
                    "crm_type": "bitrix24",
                    "status": "active"
                }
            ],
            "master_template": {
                "tenant_id": "TNT-CLEAN-001",
                "tenant_name": "Clean Starter Template",
                "spreadsheet_id": "1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A"
            }
        }
        _REGISTRY_CACHE["data"] = default_data
        _REGISTRY_CACHE["timestamp"] = now
        return default_data

    try:
        with open(reg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            _REGISTRY_CACHE["data"] = data
            _REGISTRY_CACHE["timestamp"] = now
            return data
    except Exception as ex:
        logger.error(f"Failed to read {reg_path}: {ex}")
        return _REGISTRY_CACHE["data"] or {"tenants": []}


def get_tenant_config(tenant_id: str) -> dict[str, Any] | None:
    clean_id = (tenant_id or "").strip().upper()
    registry = load_tenants_registry()

    # Check active tenants
    for t in registry.get("tenants", []):
        if str(t.get("tenant_id", "")).upper() == clean_id:
            return t

    # Check starter/master template
    clean_starter = registry.get("clean_starter_template") or registry.get("master_template")
    if clean_starter and str(clean_starter.get("tenant_id", "")).upper() == clean_id:
        return clean_starter

    # Check by name or prefix if clean_id contained name
    for t in registry.get("tenants", []):
        if clean_id in str(t.get("tenant_id", "")).upper() or str(t.get("tenant_id", "")).upper() in clean_id:
            return t

    # Direct DB fallback if cache missed
    try:
        from packages.database.models import Tenant
        from packages.database.session import SessionLocal
        db = SessionLocal()
        try:
            db_t = db.query(Tenant).filter((Tenant.id == clean_id) | (Tenant.id == tenant_id)).first()
            if db_t:
                return db_t.to_registry_dict()
        finally:
            db.close()
    except Exception:
        pass

    return None



def get_tenant_spreadsheet_id(tenant_id: str = "TNT-001") -> str:
    config = get_tenant_config(tenant_id)
    if config and config.get("spreadsheet_id"):
        return str(config["spreadsheet_id"]).strip()
    return DEFAULT_SPREADSHEET_ID


def get_all_tenants_summary() -> list[dict[str, Any]]:
    registry = load_tenants_registry()
    summaries = []
    
    # 1. Registered active tenants
    for t in registry.get("tenants", []):
        summaries.append({
            "tenant_id": t.get("tenant_id", "TNT-001"),
            "tenant_name": t.get("tenant_name", "Клиент"),
            "crm_type": t.get("crm_type", "bitrix24"),
            "spreadsheet_id": t.get("spreadsheet_id", DEFAULT_SPREADSHEET_ID),
            "status": t.get("status", "active"),
            "niche_name": t.get("niche_name", "Универсальный B2B"),
            "avg_deal_check": t.get("avg_deal_check", 150000),
            "is_template": False
        })

    # 2. Add Clean Template for instant demo / zero-state testing
    tpl = registry.get("clean_starter_template") or registry.get("master_template")
    if tpl:
        summaries.append({
            "tenant_id": tpl.get("tenant_id", "TNT-CLEAN-001"),
            "tenant_name": tpl.get("tenant_name", "Clean Client Starter (Шаблон)"),
            "crm_type": "template",
            "spreadsheet_id": tpl.get("spreadsheet_id", "1jBBotOfFh-XEJGScJyQi10jiFrna66OpJ91yPDrXy2A"),
            "status": "template",
            "niche_name": "Чистый старт",
            "avg_deal_check": 0,
            "is_template": True
        })

    return summaries
