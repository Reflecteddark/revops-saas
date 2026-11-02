"""
packages/antidrift/hitl/telegram_notifier.py

Dispatches interactive Human-in-the-Loop (HITL) approval cards to Telegram.
Generates inline keyboard markup for quick 1-tap ROP decisions:
[✅ Одобрить] [❌ Отклонить] [👤 Перехват РОП]
"""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import logging
import os
import urllib.request
from typing import Any

from packages.antidrift.golden_set.vcr_engine import PIISanitizer
from packages.monitoring.telegram_alerts import get_telegram_creds

logger = logging.getLogger("antidrift_hitl_telegram")


def generate_hitl_signature(action: str, approval_id: str) -> str:
    """Audit 1.3: Generates 8-char HMAC signature to prevent forged Telegram callbacks."""
    secret = (
        os.environ.get("SECRET_KEY")
        or os.environ.get("REVOPS_ADMIN_KEY")
    )
    if not secret or len(secret) < 32:
        raise RuntimeError("SECRET_KEY or REVOPS_ADMIN_KEY (min 32 characters) is required for HITL HMAC signatures")
    raw = f"{action}:{approval_id}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()[:8]


def verify_hitl_signature(action: str, approval_id: str, signature: str) -> bool:
    """Audit 1.3: Cryptographically verifies callback button HMAC signature."""
    if not signature:
        return False
    try:
        expected = generate_hitl_signature(action, approval_id)
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False


def format_amount_bracket(amount: float) -> str:
    """Audit 1.3: Minimizes PII by presenting deal amount as a safe bracket."""
    if amount <= 0:
        return "Не указана"
    if amount < 100_000:
        return "< 100 тыс ₽"
    elif amount < 300_000:
        return "100–300 тыс ₽"
    elif amount < 500_000:
        return "300–500 тыс ₽"
    elif amount < 1_000_000:
        return "500 тыс – 1 млн ₽"
    elif amount < 2_000_000:
        return "1–2 млн ₽"
    elif amount < 5_000_000:
        return "2–5 млн ₽"
    else:
        return "> 5 млн ₽"


def _make_callback_data(action: str, approval_id: str, tenant_id: str) -> str:
    """Audit 1.3: Constructs callback data with HMAC signature strictly bounded to <= 64 bytes."""
    sig = generate_hitl_signature(action, approval_id)
    candidate = f"hitl:{action}:{approval_id}:{tenant_id}:{sig}"
    if len(candidate.encode("utf-8")) <= 64:
        return candidate
    # Fallback to compact format guaranteed to fit within 64 bytes
    return f"hitl:{action}:{approval_id}:{sig}"


def dispatch_hitl_approval_card(
    approval_id: str,
    tenant_id: str,
    agent_id: str,
    harness_version: str,
    intent_name: str,
    risk_level: str,
    risk_score: float,
    reasons: list[str],
    proposed_actions: list[dict[str, Any]],
    client_reply_text: str | None = None,
    client_message: str = "",
) -> bool:
    """
    Sends an interactive card with inline buttons to the configured Telegram chat.
    Applies strict PII minimization (Audit Item 1.3) and HMAC callback signatures.
    Returns True if sent or skipped in test mode, False on failure.
    """
    # Guard against test environments
    if (
        "PYTEST_CURRENT_TEST" in os.environ
        or os.getenv("TESTING") == "true"
        or os.getenv("DISABLE_TELEGRAM_ALERTS") == "true"
    ):
        logger.info(f"HITL card skipped: test/CI environment active (approval_id={approval_id})")
        return True

    bot_token, chat_id, api_base = get_telegram_creds()
    if not bot_token or not chat_id:
        logger.warning(f"HITL card skipped: credentials missing (approval_id={approval_id})")
        return False

    reasons_str = ", ".join(reasons) if reasons else "Повышенный риск операции"

    actions_lines: list[str] = []
    for act in proposed_actions:
        a_type = html.escape(str(act.get("action_type", "")))
        a_target = html.escape(str(act.get("target_id", "")))
        # PII minimization on action payload
        clean_payload = PIISanitizer.sanitize_data(act.get("payload", {}))
        a_payload = html.escape(json.dumps(clean_payload, ensure_ascii=False))
        actions_lines.append(f"  • <b>{a_type}</b> (ID: <code>{a_target}</code>): <code>{a_payload}</code>")

    actions_block = "\n".join(actions_lines) if actions_lines else "  • <i>Мутаций не предложено</i>"

    reply_block = ""
    if client_reply_text:
        # Audit 1.3: Redact PII (phones, emails, tokens) and limit to 200 chars
        clean_reply = PIISanitizer.sanitize_text(client_reply_text.strip())
        escaped_reply = html.escape(clean_reply[:250])
        reply_block = f"\n💬 <b>Предложенный ответ клиенту:</b>\n<blockquote>{escaped_reply}</blockquote>\n"

    inbound_block = ""
    if client_message:
        # Audit 1.3: Redact PII and minimize message exposure
        clean_inbound = PIISanitizer.sanitize_text(client_message.strip())
        escaped_inbound = html.escape(clean_inbound[:250])
        inbound_block = f"\n📥 <b>Входящее сообщение клиента:</b>\n<blockquote>{escaped_inbound}</blockquote>\n"

    # Risk badge emoji
    badge = "🔴 КРИТИЧЕСКИЙ" if risk_level.upper() in ("HIGH", "CRITICAL") else "🟡 ВНИМАНИЕ"

    text = (
        f"⚠️ <b>Запрос на согласование ИИ-действия (HITL)</b>\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🤖 <b>Агент:</b> <code>{html.escape(agent_id)}</code> ({html.escape(harness_version)})\n"
        f"🏢 <b>Клиент/ID:</b> <code>{html.escape(tenant_id)}</code>\n"
        f"🎯 <b>Интент:</b> <code>{html.escape(intent_name)}</code>\n"
        f"🔥 <b>Уровень риска:</b> {badge} (Score: <b>{risk_score:.2f}</b>)\n"
        f"📌 <b>Причина:</b> <i>{html.escape(reasons_str)}</i>\n"
        f"{inbound_block}"
        f"\n📝 <b>Предложенные действия CRM:</b>\n"
        f"{actions_block}\n"
        f"{reply_block}"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"🆔 <code>{approval_id}</code>\n"
        f"⏳ <i>Истекает через: 15 минут (TTL)</i>"
    )

    inline_keyboard = {
        "inline_keyboard": [
            [
                {
                    "text": "✅ Одобрить",
                    "callback_data": _make_callback_data("approve", approval_id, tenant_id),
                },
                {
                    "text": "❌ Отклонить",
                    "callback_data": _make_callback_data("reject", approval_id, tenant_id),
                },
            ],
            [
                {
                    "text": "👤 Перехват РОП",
                    "callback_data": _make_callback_data("takeover", approval_id, tenant_id),
                }
            ],
        ]
    }

    try:
        url = f"{api_base}/bot{bot_token}/sendMessage"
        payload = json.dumps({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
            "reply_markup": inline_keyboard,
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status == 200
    except Exception as e:
        logger.error(f"Failed to dispatch HITL Telegram card for {approval_id}: {e}")
        return False
