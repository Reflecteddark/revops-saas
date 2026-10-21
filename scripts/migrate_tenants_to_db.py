"""
Migration Script: Syncs Tenant Registry from tenants_registry.json to Database (PostgreSQL / SQLite).
Safe, idempotent, and non-destructive.
"""

import json
import logging
import sys
from pathlib import Path

# Add project root to path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from packages.database.session import init_db, SessionLocal
from packages.database.models import Tenant, SubscriptionTier
from apps.api.tenant_registry import get_tenants_registry_path, load_tenants_registry

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("tenant_migration")


def migrate_tenants_to_db():
    init_db()
    db = SessionLocal()
    migrated_count = 0
    updated_count = 0

    try:
        raw_registry = load_tenants_registry()
        tenants_list = raw_registry.get("tenants", [])

        # Include clean starter template if present
        tpl = raw_registry.get("clean_starter_template") or raw_registry.get("master_template")
        if tpl and tpl.get("tenant_id"):
            tenants_list.append(tpl)

        logger.info(f"Starting migration of {len(tenants_list)} tenants into Database...")

        for t in tenants_list:
            t_id = str(t.get("tenant_id", "")).strip()
            if not t_id:
                continue

            name = t.get("tenant_name") or f"Tenant {t_id}"
            spreadsheet_id = t.get("spreadsheet_id", "1KoKhFJR_-ZYvRgeyFZGuHeadGigVJ_V2I3theOE4YRk")
            crm_type = t.get("crm_type", "bitrix24")
            status = t.get("status", "active")
            is_active = (status.lower() == "active")

            # Extract any CRM credentials or custom features
            settings = {
                "spreadsheet_id": spreadsheet_id,
                "crm_type": crm_type,
                "status": status,
                "niche_name": t.get("niche_name", "Универсальный B2B"),
                "avg_deal_check": t.get("avg_deal_check", 150000),
            }
            for extra_key in ("amo_domain", "amo_token", "bitrix_webhook_url", "custom_features", "is_template"):
                if extra_key in t:
                    settings[extra_key] = t[extra_key]

            existing = db.query(Tenant).filter(Tenant.id == t_id).first()
            if not existing:
                # Generate safe slug
                slug = t_id.lower().replace("_", "-")
                # Ensure unique slug
                if db.query(Tenant).filter(Tenant.slug == slug).first():
                    slug = f"{slug}-migrated"

                new_tenant = Tenant(
                    id=t_id,
                    name=name,
                    slug=slug,
                    tier=SubscriptionTier.PRO,
                    is_active=is_active,
                    settings=settings
                )
                db.add(new_tenant)
                migrated_count += 1
                logger.info(f"  [+] Created tenant {t_id} ({name}) in DB")
            else:
                existing.name = name
                existing.is_active = is_active
                merged_settings = dict(existing.settings or {})
                merged_settings.update(settings)
                existing.settings = merged_settings
                updated_count += 1
                logger.info(f"  [*] Updated tenant {t_id} ({name}) in DB")

        db.commit()
        logger.info(f"Migration completed successfully: {migrated_count} created, {updated_count} updated.")
        return {"created": migrated_count, "updated": updated_count}
    except Exception as e:
        db.rollback()
        logger.error(f"Migration failed: {e}", exc_info=True)
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    migrate_tenants_to_db()
