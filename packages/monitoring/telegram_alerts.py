"""
Telegram Alert Dispatcher for RevOps Intelligence SaaS.
Dispatches critical 500 errors and service incident alerts to Telegram.
"""
import json
import logging
import os
import traceback
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger("revops_alerts")

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CREDS_FILE = BASE_DIR / "telegram_credentials.json"


def get_telegram_creds() -> tuple[str | None, str | None, str]:
    """Retrieve Telegram credentials from environment variables or credentials file."""
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID") or os.getenv("ADMIN_CHAT_ID")
    api_base = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org").rstrip("/")

    if (not bot_token or not chat_id) and CREDS_FILE.exists():
        try:
            data = json.loads(CREDS_FILE.read_text(encoding="utf-8"))
            if not bot_token:
                bot_token = data.get("bot_token")
            if not chat_id:
                chat_id = str(data.get("chat_id", ""))
            api_base = data.get("api_base", api_base).rstrip("/")
        except Exception as e:
            logger.error(f"Error reading telegram_credentials.json: {e}")

    return bot_token, chat_id, api_base


def send_telegram_alert(text: str) -> bool:
    """Send HTML-formatted alert to Telegram."""
    bot_token, chat_id, api_base = get_telegram_creds()
    if not bot_token or not chat_id:
        logger.warning("Telegram alert skipped: bot_token or chat_id not configured")
        return False

    try:
        url = f"{api_base}/bot{bot_token}/sendMessage"
        payload = json.dumps({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True
        }).encode("utf-8")
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            return resp.status == 200
    except Exception as e:
        logger.error(f"Failed to send Telegram alert: {e}")
        return False


def _escape_html(s: str) -> str:
    """Escape HTML characters to prevent breaking Telegram message formatting."""
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def format_error_alert(request_method: str, request_url: str, client_ip: str, exc: Exception) -> str:
    """Format structured HTML incident report for 500 error."""
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    exc_type = exc.__class__.__name__
    exc_msg = str(exc)
    tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    tb_short = tb[-600:] if len(tb) > 600 else tb

    msg = (
        f"🚨 <b>[RevOps API 500 Error Alert]</b>\n"
        f"<b>Time:</b> <code>{_escape_html(now_str)}</code>\n"
        f"<b>Endpoint:</b> <code>{_escape_html(request_method)} {_escape_html(request_url)}</code>\n"
        f"<b>Client IP:</b> <code>{_escape_html(client_ip)}</code>\n"
        f"<b>Exception:</b> <code>{_escape_html(exc_type)}: {_escape_html(exc_msg)}</code>\n\n"
        f"<b>Traceback:</b>\n<pre><code>{_escape_html(tb_short)}</code></pre>"
    )
    return msg
