#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RevOps Enterprise OS — Telegram Cloud Backup Engine.
Zero-Footprint automated backup: creates compressed snapshot, streams directly
to Telegram Cloud via Bot API (sendDocument), and immediately deletes local temp file.

Features:
- Multi-Part splitting (45 MB chunks) to stay safely below Telegram's 50 MB API limit.
- Zero-Footprint disk usage (each chunk deleted immediately after upload).
- Complete metadata manifest with recovery instructions.
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
from typing import List, Tuple
import requests

# Base paths
BASE_DIR = Path(__file__).resolve().parent.parent

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("telegram_backup")

MAX_PART_SIZE_BYTES = int(os.getenv("TELEGRAM_MAX_BACKUP_CHUNK", 45 * 1024 * 1024))  # 45 MB


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

    candidate_files = [
        BASE_DIR / "tenants_registry.json",
        BASE_DIR.parent / "revops-enterprise-os" / "tenants_registry.json",
        Path("/opt/revops-enterprise-os/tenants_registry.json"),
        Path("/opt/revops-saas/tenants_registry.json"),
        BASE_DIR / "scoring_config.json",
        BASE_DIR.parent / "revops-enterprise-os" / "scoring_config.json",
        Path("/opt/revops-enterprise-os/scoring_config.json"),
        BASE_DIR / "revops_saas.db",
        BASE_DIR / "data" / "revops_saas.db",
        Path("/opt/revops-saas/data/revops_saas.db"),
        Path("/opt/revops-saas/revops_saas.db"),
        Path("/var/lib/docker/volumes/n8n_n8n_data/_data/database.sqlite"),
    ]

    with tarfile.open(output_path, "w:gz") as tar:
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        tarinfo = tarfile.TarInfo(name="manifest.json")
        tarinfo.size = len(manifest_bytes)
        tarinfo.mtime = int(time.time())
        import io
        tar.addfile(tarinfo, io.BytesIO(manifest_bytes))

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


def split_file_into_parts(file_path: Path, max_bytes: int = MAX_PART_SIZE_BYTES) -> List[Path]:
    """Splits a file into multiple chunks if it exceeds max_bytes."""
    parts = []
    file_size = file_path.stat().st_size
    if file_size <= max_bytes:
        return [file_path]

    part_num = 1
    with open(file_path, "rb") as src:
        while True:
            chunk = src.read(max_bytes)
            if not chunk:
                break
            part_path = file_path.with_name(f"{file_path.name}.part{part_num:03d}")
            with open(part_path, "wb") as dst:
                dst.write(chunk)
            parts.append(part_path)
            part_num += 1
    return parts


def _upload_single_document(file_path: Path, caption: str, bot_token: str, chat_id: str, api_base: str) -> bool:
    """Helper to upload a single file/part to Telegram."""
    url = f"{api_base}/bot{bot_token}/sendDocument"
    with open(file_path, "rb") as f:
        files = {"document": (file_path.name, f, "application/octet-stream")}
        data = {
            "chat_id": chat_id,
            "caption": caption,
            "parse_mode": "HTML"
        }
        res = requests.post(url, data=data, files=files, timeout=120)
        if res.status_code == 200:
            logger.info(f"✅ Document {file_path.name} successfully sent to Telegram chat {chat_id}")
            return True
        else:
            logger.error(f"❌ Telegram sendDocument failed for {file_path.name}: HTTP {res.status_code} - {res.text}")
            return False


def send_backup_to_telegram(
    archive_path: Path,
    manifest: dict,
    bot_token: str,
    chat_id: str,
    api_base: str = "https://api.telegram.org",
    max_part_size: int = MAX_PART_SIZE_BYTES
) -> bool:
    """
    Sends backup file (or multi-part split series if >45MB) to Telegram chat via sendDocument.
    Guarantees compliance with Telegram's 50 MB Bot API hard limit.
    """
    total_size_mb = round(archive_path.stat().st_size / (1024 * 1024), 2)
    files_list_text = "\n".join(f"  • {f['name']} ({round(f['size_bytes']/1024, 1)} KB)" for f in manifest.get("files_included", [])[:6])

    if archive_path.stat().st_size <= max_part_size:
        # Standard Single Part Upload (<45 MB)
        caption = (
            f"📦 <b>[RevOps Cloud Backup]</b>\n"
            f"📅 <i>{manifest.get('created_at_human')}</i>\n"
            f"💾 Размер архива: <b>{total_size_mb} MB</b>\n\n"
            f"<b>Включенные файлы:</b>\n{files_list_text}\n\n"
            f"✅ <i>Резервная копия сохранена в Telegram Cloud. На сервере занято 0 байт.</i>"
        )
        return _upload_single_document(archive_path, caption, bot_token, chat_id, api_base)
    else:
        # Multi-Part Chunk Upload (>45 MB)
        logger.info(f"Archive size ({total_size_mb} MB) exceeds {round(max_part_size/(1024*1024), 1)} MB. Splitting into multi-part series...")
        parts = split_file_into_parts(archive_path, max_part_size)
        total_parts = len(parts)
        success = True

        for idx, part in enumerate(parts, 1):
            part_mb = round(part.stat().st_size / (1024 * 1024), 2)
            caption = (
                f"📦 <b>[RevOps Multi-Part Backup] Часть {idx}/{total_parts}</b>\n"
                f"📅 <i>{manifest.get('created_at_human')}</i>\n"
                f"💾 Размер тома: <b>{part_mb} MB</b> (Всего: <b>{total_size_mb} MB</b>)\n\n"
                f"<b>Включенные файлы:</b>\n{files_list_text}\n\n"
                f"🔧 <b>Команда склейки (Linux/macOS):</b>\n"
                f"<code>cat {archive_path.name}.part* &gt; {archive_path.name} &amp;&amp; tar -xzf {archive_path.name}</code>\n"
                f"🔧 <b>Команда склейки (Windows PowerShell):</b>\n"
                f"<code>Get-Content {archive_path.name}.part* -Raw | Set-Content {archive_path.name}</code>"
            )
            part_ok = _upload_single_document(part, caption, bot_token, chat_id, api_base)
            # Remove part file immediately after upload to maintain zero server footprint
            if part.exists() and part.resolve() != archive_path.resolve():
                try:
                    part.unlink()
                except Exception:
                    pass
            if not part_ok:
                success = False

        return success


def run_telegram_backup(max_part_size: int = MAX_PART_SIZE_BYTES) -> bool:
    """Complete backup cycle: creates temp archive, streams to Telegram (split if >45MB), removes local archive."""
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
        success = send_backup_to_telegram(archive_path, manifest, bot_token, chat_id, api_base, max_part_size=max_part_size)
        return success
    finally:
        # Zero-Footprint Guarantee: delete local base archive immediately
        if archive_path.exists():
            try:
                archive_path.unlink()
                logger.info(f"Local temporary archive {archive_path.name} deleted. VPS disk footprint: 0 bytes.")
            except Exception as e:
                logger.warning(f"Could not delete temp archive {archive_path}: {e}")


if __name__ == "__main__":
    ok = run_telegram_backup()
    sys.exit(0 if ok else 1)
