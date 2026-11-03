"""
A client's own Google Sheet: checked before it is attached to a tenant (read-only Google calls).

The API service account has no Drive storage (quota 0), so it cannot copy the template itself: the admin copies the
template, shares the copy with both bots as editors and pastes its ID. A copy keeps the warning-only protection of the
raw_* sheets but NOT the file sharing, so the sharing is what is checked here.
"""

import json
import os
import re

from google.auth.transport.requests import AuthorizedSession
from google.oauth2.service_account import Credentials

from ..tenant_registry import CLEAN_TEMPLATE_ID

REQUIRED_SHEETS = ("raw_calls", "raw_deals", "⚙️ Настройки")
_URL_ID = re.compile(r"/spreadsheets/d/([a-zA-Z0-9-_]+)")
_VALID_ID = re.compile(r"[a-zA-Z0-9-_]{20,}")
_SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly", "https://www.googleapis.com/auth/drive.metadata.readonly"]


def normalize_sheet_id(raw: str | None) -> str:
    """Accepts a sheet ID or any docs.google.com/spreadsheets/d/<id>/... link."""
    raw = (raw or "").strip()
    m = _URL_ID.search(raw)
    return m.group(1) if m else raw


def _session_and_bots() -> tuple[AuthorizedSession | None, list[str], list[str]]:
    from ..routers.calls_router import get_service_account_path  # lazy: routers import services

    problems: list[str] = []
    sa_path = get_service_account_path()
    if not sa_path:
        return None, [], ["На сервере нет ключа сервисного аккаунта Google: проверить таблицу невозможно"]
    with open(sa_path, encoding="utf-8") as f:
        bots = [json.load(f)["client_email"]]
    n8n_bot = os.getenv("N8N_SHEETS_BOT_EMAIL", "").strip()
    if n8n_bot:
        bots.append(n8n_bot)
    else:
        problems.append("На сервере не задан N8N_SHEETS_BOT_EMAIL: доступ бота n8n не проверен")
    creds = Credentials.from_service_account_file(str(sa_path), scopes=_SCOPES)
    return AuthorizedSession(creds), bots, problems


def check_tenant_sheet(sheet_id: str) -> list[str]:
    """Problems that would stop the bots from working with this sheet (empty list = ready to attach)."""
    if not sheet_id:
        return ["Не указан ID таблицы"]
    if sheet_id == CLEAN_TEMPLATE_ID:
        return ["Это мастер-шаблон. Сделайте копию (Файл → Создать копию) и укажите ID копии"]
    if not _VALID_ID.fullmatch(sheet_id):
        return [f"«{sheet_id}» не похоже на ID Google-таблицы"]

    session, bots, problems = _session_and_bots()
    if session is None:
        return problems
    sharing_hint = "дайте доступ «Редактор» для " + " и ".join(bots)

    r = session.get(f"https://sheets.googleapis.com/v4/spreadsheets/{sheet_id}",
                    params={"fields": "sheets.properties.title"}, timeout=20)
    if r.status_code in (403, 404):
        return [f"Бот {bots[0]} не видит таблицу: {sharing_hint}"]
    if r.status_code != 200:
        return [f"Google Sheets ответил {r.status_code}, повторите позже"]
    titles = {s["properties"]["title"] for s in r.json().get("sheets", [])}
    problems += [f"В таблице нет листа «{t}»: это не копия шаблона RevOps" for t in REQUIRED_SHEETS if t not in titles]

    r = session.get(f"https://www.googleapis.com/drive/v3/files/{sheet_id}/permissions",
                    params={"fields": "permissions(emailAddress,role)", "supportsAllDrives": "true"}, timeout=20)
    if r.status_code != 200:
        return problems + [f"Не удалось прочитать доступы к файлу (Google ответил {r.status_code})"]
    editors = {str(p.get("emailAddress", "")).lower() for p in r.json().get("permissions", [])
               if p.get("role") in ("writer", "owner", "organizer", "fileOrganizer")}
    problems += [f"Дайте доступ «Редактор» для {b}" for b in bots if b.lower() not in editors]
    return problems
