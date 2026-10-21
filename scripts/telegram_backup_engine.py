#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RevOps Enterprise OS — Telegram Cloud Backup Engine.
Zero-Footprint automated backup: creates compressed snapshot, streams directly
to Telegram Cloud via Bot API (sendDocument), and immediately deletes local temp file.
Permanent, free, unlimited storage for database snapshots and configurations.
"""

import os
import sys
import json
import time
import tarfile
import tempfile
import logging
from pathlib import Path
from datetime import datetime
import requests

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("telegram_backup")


def load_tg_credentials():
    """Finds bot_token and chat_id across standard configuration files."""
    candidates = [
        BASE_DIR / "telegram_credentials.json",
        BASE_DIR.parent / "revops-enterprise-os" / "telegram_credentials.json",
        Path.home() / "my_ai_crew" / "telegram_credentials.json",
        Path("/opt/my_ai_crew/telegram_credentials.json"),
        Path("/opt/revops-enterprise-os/telegram_credentials.json"),
        Path("/opt/revops-saas/telegram_credentials.json"),
    ]

    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("ADMIN_CHAT_ID")
    api_base = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org").rstrip("/")

    for c in candidates:
        if c.exists():
            try:
                data = json.loads(c.read_text(encoding="utf-8"))
                if not bot_token:
                    bot_token = data.get("bot_token")
                if not chat_id:
                    chat_id = str(data.get("chat_id", ""))
                api_base = data.get("api_base", api_base).rstrip("/")
                if bot_token and chat_id:
                    break
            except Exception:
                pass

    return bot_token, chat_id, api_base


def create_backup_archive(output_path: Path) -> dict:
    """Creates a gzipped tar archive of critical state, databases, and registries."""
    manifest = {
        "timestamp": datetime.now().isoformat(),
        "created_at_human": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "files_included": []
    }

    # Candidate files to include
    candidate_files = [
        # Registries and configurations
        BASE_DIR / "tenants_registry.json",
        BASE_DIR.parent / "revops-enterprise-os" / "tenants_registry.json",
        Path("/opt/revops-enterprise-os/tenants_registry.json"),
        Path("/opt/revops-saas/tenants_registry.json"),
        BASE_DIR / "scoring_config.json",
        BASE_DIR.parent / "revops-enterprise-os" / "scoring_config.json",
        Path("/opt/revops-enterprise-os/scoring_config.json"),
        # Databases
        BASE_DIR / "revops_saas.db",
        BASE_DIR / "data" / "revops_saas.db",
        Path("/opt/revops-saas/data/revops_saas.db"),
        Path("/opt/revops-saas/revops_saas.db"),
        # n8n database if on VPS
        Path("/var/lib/docker/volumes/n8n_n8n_data/_data/database.sqlite"),
    ]

    with tarfile.open(output_path, "w:gz") as tar:
        # Add manifest inside
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        tarinfo = tarfile.TarInfo(name="manifest.json")
        tarinfo.size = len(manifest_bytes)
        tarinfo.mtime = int(time.time())
        import io
        tar.addfile(tarinfo, io.BytesIO(manifest_bytes))

        # Add existing candidate files
        added_names = set()
        for f in candidate_files:
            if f.exists() and f.is_file():
                arc_name = f.name
                if arc_name in added_names:
                    arc_name = f"{f.parent.name}_{f.name}"
                tar.add(str(f), arcname=arc_name)
                added_names.add(arc_name)
                manifest["files_included"].append({"name": arc_name, "size_bytes": f.stat().st_size})

    manifest["total_archive_size_bytes"] = output_path.stat().st_size
    return manifest


def send_backup_to_telegram(archive_path: Path, manifest: dict, bot_token: str, chat_id: str, api_base: str = "https://api.telegram.org") -> bool:
    """Sends backup file to Telegram chat via sendDocument."""
    size_mb = round(archive_path.stat().st_size / (1024 * 1024), 2)
    files_list_text = "\n".join(f"  • {f['name']} ({round(f['size_bytes']/1024, 1)} KB)" for f in manifest.get("files_included", [])[:6])

    caption = (
        f"📦 <b>[RevOps Cloud Backup]</b>\n"
        f"📅 <i>{manifest.get('created_at_human')}</i>\n"
        f"💾 Размер архива: <b>{size_mb} MB</b>\n\n"
        f"<b>Включенные файлы:</b>\n{files_list_text}\n\n"
        f"✅ <i>Резервная копия сохранена в Telegram Cloud. На сервере занято 0 байт.</i>"
    )

    url = f"{api_base}/bot{bot_token}/sendDocument"
    with open(archive_path, "rb") as f:
        files = {"document": (archive_path.name, f, "application/gzip")}
        data = {
            "chat_id": chat_id,
            "caption": caption,
            "parse_mode": "HTML"
        }
        res = requests.post(url, data=data, files=files, timeout=60)
        if res.status_code == 200:
            logger.info(f"✅ Backup successfully sent to Telegram chat {chat_id} (Size: {size_mb} MB)")
            return True
        else:
            logger.error(f"❌ Telegram sendDocument failed: HTTP {res.status_code} - {res.text}")
            return False


def run_telegram_backup() -> bool:
    """Complete backup cycle: creates temp archive, streams to Telegram, removes local archive."""
    bot_token, chat_id, api_base = load_tg_credentials()
    if not bot_token or not chat_id:
        logger.error("Telegram bot_token or chat_id not found in configuration")
        return False

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_dir = tempfile.gettempdir()
    archive_path = Path(temp_dir) / f"revops_backup_{ts}.tar.gz"

    try:
        logger.info(f"Creating backup archive: {archive_path.name}...")
        manifest = create_backup_archive(archive_path)
        logger.info(f"Archive created ({round(archive_path.stat().st_size/1024, 1)} KB). Sending to Telegram...")
        success = send_backup_to_telegram(archive_path, manifest, bot_token, chat_id, api_base)
        return success
    finally:
        # Zero-Footprint Guarantee: delete local file immediately
        if archive_path.exists():
            try:
                archive_path.unlink()
                logger.info(f"Local temporary archive {archive_path.name} deleted. VPS disk footprint: 0 bytes.")
            except Exception as e:
                logger.warning(f"Could not delete temp archive {archive_path}: {e}")


if __name__ == "__main__":
    ok = run_telegram_backup()
    sys.exit(0 if ok else 1)
