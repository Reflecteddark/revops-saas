"""
Public Router for Landing Page Leads and Self-Serve Demo Onboarding.
Endpoints:
- POST /api/v1/public/request-demo: Self-serve demo account provisioning (no auth required)
"""

import email.utils
import hashlib
import json
import logging
import os
import re
import secrets
import smtplib
import time
from collections import defaultdict
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from threading import Lock
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from packages.database.models import SubscriptionTier, Tenant, User, UserRole, Workspace
from packages.database.session import get_db
from packages.monitoring.telegram_alerts import send_telegram_alert
from scripts.seed_demo_data import seed_demo_data

from ..auth import hash_password

logger = logging.getLogger("public_router")

router = APIRouter(tags=["Public Demo & Leads"])

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent

# In-memory IP rate limiter: max 3 requests per IP per hour
_RATE_LIMIT_LOCK = Lock()
_RATE_LIMIT_STORE: dict[str, list[float]] = defaultdict(list)
MAX_REQUESTS_PER_HOUR = 3
RATE_WINDOW_SECONDS = 3600


def reset_rate_limits():
    """Utility function to clear rate limit store (useful for test suites)."""
    with _RATE_LIMIT_LOCK:
        _RATE_LIMIT_STORE.clear()


def check_rate_limit(client_ip: str) -> bool:
    """Checks whether the client IP has exceeded the hourly demo request rate limit."""
    now = time.time()
    with _RATE_LIMIT_LOCK:
        timestamps = _RATE_LIMIT_STORE[client_ip]
        # Evict timestamps older than 1 hour
        valid = [ts for ts in timestamps if now - ts < RATE_WINDOW_SECONDS]
        _RATE_LIMIT_STORE[client_ip] = valid
        if len(valid) >= MAX_REQUESTS_PER_HOUR:
            return False
        _RATE_LIMIT_STORE[client_ip].append(now)
        return True


class DemoRequestPayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=150, description="Имя контактного лица")
    email: str = Field(..., min_length=5, max_length=150, description="Email для входа")
    phone: str = Field(..., min_length=7, max_length=50, description="Контактный телефон")
    company: str | None = Field(default=None, max_length=200, description="Компания или ниша")
    tariff: str | None = Field(default="Pro", max_length=100, description="Выбранный тариф или формат")

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        cleaned = v.strip().lower()
        # Basic RFC-like regex
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", cleaned):
            raise ValueError("Укажите корректный email адрес (например, alex@company.ru)")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_phone_format(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) < 10:
            raise ValueError("Номер телефона должен содержать минимум 10 цифр")
        return v.strip()


def send_client_demo_email(to_email: str, name: str, login: str, password: str, cabinet_url: str) -> bool:
    """Dispatches onboarding email to client via SMTP if configured, logs otherwise."""
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", "RevOps OS <info@ai-rop.ru>")

    subject = "Ваш доступ в RevOps OS — Интеллектуальный речевой аудит"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc; padding: 24px; color: #1e293b;">
        <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #6366f1; font-size: 24px; margin: 0;">RevOps Enterprise OS</h1>
                <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Демо-доступ к системе речевой аналитики и контроля сливов</p>
            </div>
            
            <p style="font-size: 15px;">Здравствуйте, <b>{name}</b>!</p>
            <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                Ваш персональный демо-кабинет развернут. Мы загрузили 5 менеджеров, 30 B2B-сделок на 10.9M ₽ и 200 звонков с аналитикой по 13 критериям. В виджете «Слитые сделки за вчера» вы уже можете оценить разбор реальных инцидентов.
            </p>

            <div style="background: #f1f5f9; border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid #cbd5e1;">
                <div style="font-size: 12px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">🔑 Ваши данные для входа:</div>
                <div style="font-size: 14px; margin-bottom: 8px;"><b>Ссылка:</b> <a href="{cabinet_url}" style="color: #6366f1;">{cabinet_url}</a></div>
                <div style="font-size: 14px; margin-bottom: 8px;"><b>Логин (Email):</b> <code style="background: #ffffff; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">{login}</code></div>
                <div style="font-size: 14px;"><b>Временный пароль:</b> <code style="background: #ffffff; padding: 2px 6px; border-radius: 4px; border: 1px solid #e2e8f0;">{password}</code></div>
            </div>

            <div style="text-align: center; margin: 28px 0;">
                <a href="{cabinet_url}" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 15px; padding: 14px 28px; border-radius: 12px; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">
                    Войти в личный кабинет →
                </a>
            </div>

            <p style="font-size: 13px; color: #94a3b8; text-align: center; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                RevOps Enterprise OS • Автоматический аудит звонков и RevOps-аналитика для B2B ОП.<br>
                По вопросам: <a href="mailto:info@ai-rop.ru" style="color: #6366f1;">info@ai-rop.ru</a>
            </p>
        </div>
    </body>
    </html>
    """

    if not smtp_host:
        logger.info(f"📧 [Email Simulation] SMTP не настроен. Письмо клиенту {to_email}: login={login}, pass={password}")
        return True

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = smtp_from
        msg["To"] = to_email
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if smtp_port in (587, 25):
                server.starttls()
            if smtp_user and smtp_pass:
                server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_from, [to_email], msg.as_string())
        logger.info(f"✅ Письмо с доступами успешно отправлено на {to_email}")
        return True
    except Exception as e:
        logger.error(f"❌ Ошибка отправки письма на {to_email}: {e}")
        return False


def register_client_credentials(tenant_id: str, company: str, clean_email: str, plain_password: str):
    """Saves user credentials into registered_clients.json so UI /app/ login works immediately."""
    clients_candidates = [
        BASE_DIR / "data" / "registered_clients.json",
        BASE_DIR / "apps" / "api" / "registered_clients.json",
        BASE_DIR / "registered_clients.json",
    ]
    password_hash = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
    now_iso = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    for cl_path in clients_candidates:
        try:
            cl_path.parent.mkdir(parents=True, exist_ok=True)
            clients = []
            if cl_path.exists():
                with open(cl_path, "r", encoding="utf-8") as f:
                    clients = json.load(f)
            
            existing = next((c for c in clients if c.get("login", "").lower() == clean_email), None)
            if existing:
                if password_hash not in existing.get("keyHashes", []):
                    existing.setdefault("keyHashes", []).append(password_hash)
                existing["is_active"] = True
                existing["updated_at"] = now_iso
            else:
                clients.append({
                    "login": clean_email,
                    "keyHashes": [password_hash],
                    "name": company,
                    "role": "РОП • Руководитель ОП",
                    "tenant": f"{tenant_id} • {company}",
                    "is_system": False,
                    "is_active": True,
                    "created_at": now_iso
                })
            with open(cl_path, "w", encoding="utf-8") as f:
                json.dump(clients, f, ensure_ascii=False, indent=2)
            logger.info(f"🔑 Учетная запись {clean_email} записана в {cl_path}")
            break
        except Exception as ex:
            logger.warning(f"Не удалось записать учетную запись в {cl_path}: {ex}")


@router.post("/request-demo")
def request_demo_access(
    payload: DemoRequestPayload,
    request: Request,
    db: Session = Depends(get_db)
) -> dict[str, Any]:
    """
    Public self-serve onboarding endpoint (no auth required):
    1. Enforces IP rate limit (max 3 req/hour per IP).
    2. Validates fields and verifies duplicate email (400 if already exists).
    3. Provisions Tenant, Workspace, and Primary User account.
    4. Seeds realistic demo dataset (5 reps, 30 deals, 200 calls with 20 yesterday leaks).
    5. Dispatches Telegram notification and client email.
    6. Returns access credentials and cabinet direct link.
    """
    # 1. IP Rate Limiting
    client_ip = (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "127.0.0.1")
    )
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Превышен лимит заявок (максимум 3 в час). Пожалуйста, подождите или свяжитесь с поддержкой."
        )

    clean_email = payload.email.strip().lower()
    clean_name = payload.name.strip()
    company_name = (payload.company or f"Компания {clean_name}").strip()
    phone = payload.phone.strip()
    tariff = (payload.tariff or "Pro").strip()

    # 2. Check Duplicate Email
    existing_user = db.query(User).filter(User.email == clean_email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вы уже зарегистрированы. Проверьте почту или воспользуйтесь формой входа."
        )

    # 3. Create Tenant and Primary User
    slug_base = re.sub(r"[^a-z0-9_-]", "", company_name.lower().replace(" ", "-"))[:20]
    if not slug_base:
        slug_base = "demo"
    unique_suffix = secrets.token_hex(3)
    tenant_id = f"demo_{slug_base}_{unique_suffix}"
    slug = f"{slug_base}-{unique_suffix}"

    # Generate user password: RevOps_ + 6 random characters
    pwd_chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    plain_password = "RevOps_" + "".join(secrets.choice(pwd_chars) for _ in range(6))

    try:
        tenant = Tenant(
            id=tenant_id,
            name=company_name,
            slug=slug,
            tier=SubscriptionTier.PRO,
            max_seats=15,
            ai_minutes_quota=3000,
            ai_minutes_used=0,
            is_active=True,
            settings={
                "crm_type": "amocrm",
                "niche_name": company_name,
                "avg_deal_check": 350000,
                "is_demo": True,
                "lead_source": "Landing Page Self-Serve",
                "requested_tariff": tariff,
                "contact_phone": phone,
                "status": "active"
            }
        )
        db.add(tenant)
        db.flush()

        workspace = Workspace(
            id=f"ws_{tenant_id}",
            tenant_id=tenant.id,
            name="Основной отдел продаж (B2B)",
            crm_type="amocrm",
            crm_connected=True,
            settings={"pipeline_name": "Основная воронка RevOps"}
        )
        db.add(workspace)
        db.flush()

        user = User(
            id=f"usr_{tenant_id}_owner",
            tenant_id=tenant.id,
            email=clean_email,
            full_name=clean_name,
            hashed_password=hash_password(plain_password),
            role=UserRole.CEO,
            is_active=True,
        )
        db.add(user)
        db.commit()

        # 4. Seed Demo Data (5 reps, 30 deals, 200 calls)
        seed_demo_data(tenant_id=str(tenant.id), db=db)

        # 5. Register in registered_clients.json
        register_client_credentials(str(tenant.id), company_name, clean_email, plain_password)

        cabinet_url = "https://report.ai-rop.ru/app/"

        # 6. Send Telegram Notification
        tg_text = (
            "🚀 <b>Новая заявка с лендинга на аудит ОП!</b>\n\n"
            f"👤 <b>Имя:</b> {clean_name}\n"
            f"📱 <b>Телефон:</b> {phone}\n"
            f"📧 <b>Email:</b> {clean_email}\n"
            f"🏢 <b>Компания:</b> {company_name}\n"
            f"💳 <b>Тариф:</b> {tariff}\n"
            f"⏰ <b>Время:</b> {datetime.now(timezone.utc).strftime('%d.%m.%Y %H:%M:%S')} UTC\n\n"
            "🔑 <b>Готовые доступы для клиента:</b>\n"
            f"• Персональный: <code>{clean_email}</code> / <code>{plain_password}</code>\n"
            "• Эталонный демо: <code>demo_test@ai-rop.ru</code> / <code>DemoPassword123!</code>\n"
            "• Ссылка для входа: https://report.ai-rop.ru/app/"
        )
        try:
            send_telegram_alert(tg_text)
        except Exception as e:
            logger.warning(f"Could not dispatch Telegram lead alert: {e}")

        # 7. Send Client Email
        send_client_demo_email(
            to_email=clean_email,
            name=clean_name,
            login=clean_email,
            password=plain_password,
            cabinet_url=cabinet_url
        )

        return {
            "success": True,
            "tenant_id": tenant.id,
            "login": clean_email,
            "password": plain_password,
            "cabinet_url": cabinet_url,
            "message": "Демо-доступ успешно сформирован. Учетные данные отправлены на указанный Email."
        }

    except Exception as e:
        db.rollback()
        logger.error(f"❌ Ошибка регистрации демо-доступа: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка развертывания демо-доступа: {e!s}"
        )
