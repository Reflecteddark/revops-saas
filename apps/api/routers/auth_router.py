"""
Auth Router: Tenant Onboarding, Login, and Profile.
"""

import hashlib
import hmac
import logging
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from packages.database.models import RevokedToken, SubscriptionTier, Tenant, User, UserRole, Workspace
from packages.database.session import get_db

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..schemas import LoginRequest, TenantRegisterRequest, TokenResponse, UserResponse
from ..tenant_provisioner import generate_tenant_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication & Tenants"])


@router.post("/register-tenant", response_model=TokenResponse)
def register_tenant(req: TenantRegisterRequest, db: Session = Depends(get_db)):
    """Creates a new Organization (Tenant) and default Admin/CEO account."""
    slug = re.sub(r"[^a-z0-9_-]", "", req.company_name.lower().replace(" ", "-"))
    if not slug:
        slug = f"tenant-{uuid.uuid4().hex[:8]}"

    base_slug = slug
    while db.query(Tenant).filter(Tenant.slug == slug).first():
        slug = f"{base_slug}-{uuid.uuid4().hex[:8]}"

    # 1. Create Tenant with unified TNT-XXX namespace and clean spreadsheet settings
    new_tnt_id = generate_tenant_id()
    tenant = Tenant(
        id=new_tnt_id,
        name=req.company_name,
        slug=slug,
        tier=SubscriptionTier.PRO,
        max_seats=15,
        ai_minutes_quota=2500,
        settings={"spreadsheet_id": None},
    )
    db.add(tenant)
    db.flush()

    # 2. Create Default Workspace
    ws = Workspace(
        tenant_id=tenant.id,
        name="Основной отдел продаж (B2B)",
        crm_type="amocrm",
        crm_connected=False,
    )
    db.add(ws)

    # 3. Create Admin/CEO User
    user = User(
        tenant_id=tenant.id,
        email=req.admin_email.lower(),
        full_name=req.admin_name,
        hashed_password=hash_password(req.password),
        role=UserRole.CEO,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    from ..tenant_registry import _REGISTRY_CACHE
    _REGISTRY_CACHE["data"] = None
    _REGISTRY_CACHE["timestamp"] = 0

    # Generate Token
    token = create_access_token({
        "sub": user.id,
        "tenant_id": tenant.id,
        "role": user.role.value,
        "email": user.email
    })

    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        tenant_id=str(tenant.id),
        role=str(user.role.value),
        full_name=str(user.full_name),
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticates user and returns JWT scoped to their tenant."""
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not verify_password(req.password, str(user.hashed_password)):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Аккаунт заблокирован"
        )

    token = create_access_token({
        "sub": user.id,
        "tenant_id": user.tenant_id,
        "role": user.role.value,
        "email": user.email
    })

    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        tenant_id=str(user.tenant_id),
        role=str(user.role.value),
        full_name=str(user.full_name),
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns profile info and role of current authenticated user."""
    return UserResponse(
        id=str(current_user.id),
        email=str(current_user.email),
        full_name=str(current_user.full_name),
        role=str(current_user.role.value),
        tenant_id=str(current_user.tenant_id),
        is_active=bool(current_user.is_active),
    )


class ClientLoginRequest(BaseModel):
    login: str
    password: str


@router.post("/client-login")
def client_login(req: ClientLoginRequest, response: Response, request: Request):
    """
    Server-side authentication for client and admin accounts.
    Eliminates client-side password hash verification and salt exposure.
    Sets signed HttpOnly session cookie and returns user profile.
    """
    from .admin_router import (
        COOKIE_ADMIN_AUTH_NAME,
        generate_admin_cookie_token,
        load_registered_clients,
    )

    login_clean = (req.login or "").strip().lower()
    pass_clean = (req.password or "").strip()

    if not login_clean or not pass_clean:
        raise HTTPException(status_code=400, detail="Логин и пароль обязательны для заполнения")

    input_hash = hashlib.sha256(pass_clean.encode("utf-8")).hexdigest()

    clients = load_registered_clients()
    matched_client = None

    for c in clients:
        c_login = str(c.get("login", "")).strip().lower()
        if c_login == login_clean:
            user_hashes = [str(h).lower() for h in c.get("keyHashes", [])]
            if any(hmac.compare_digest(input_hash, h) for h in user_hashes):
                matched_client = c
                break
            pwd_hash = str(c.get("password_hash", "")).strip()
            if pwd_hash:
                if hmac.compare_digest(input_hash, pwd_hash.lower()):
                    matched_client = c
                    break
                try:
                    from ..auth import verify_password
                    if verify_password(pass_clean, pwd_hash):
                        matched_client = c
                        break
                except Exception:
                    pass

    # Check database users table with bcrypt password verification
    if not matched_client:
        from packages.database.models import User
        from packages.database.session import SessionLocal
        from ..auth import verify_password
        db_session = SessionLocal()
        try:
            db_user = db_session.query(User).filter(User.email == login_clean).first()
            if db_user and db_user.hashed_password and verify_password(pass_clean, str(db_user.hashed_password)):
                t_name = db_user.tenant.name if db_user.tenant else db_user.tenant_id
                role_val = db_user.role.value if hasattr(db_user.role, "value") else str(db_user.role)
                matched_client = {
                    "login": db_user.email,
                    "name": db_user.full_name,
                    "role": role_val,
                    "tenant": f"{db_user.tenant_id} • {t_name}",
                    "is_active": db_user.is_active
                }
        finally:
            db_session.close()

    if not matched_client:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль"
        )

    if matched_client.get("is_active") is False:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ к аккаунту приостановлен администратором (контур заморожен)"
        )

    is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" or bool(request.headers.get("cf-connecting-ip"))
    host = request.headers.get("host", "").lower()
    cookie_domain = ".ai-rop.ru" if (is_https and ("ai-rop.ru" in host or bool(request.headers.get("cf-connecting-ip")))) else None
    cookie_samesite: Literal["lax", "strict", "none"] = "none" if (is_https and cookie_domain) else "lax"

    role_str = str(matched_client.get("role", "")).lower()
    is_admin = (
        matched_client.get("role") == UserRole.ADMIN
        or "admin" in role_str
        or "супервайзер" in role_str
    )

    # Set admin cookie if user has admin privileges
    if is_admin:
        admin_token = generate_admin_cookie_token()
        response.set_cookie(
            key=COOKIE_ADMIN_AUTH_NAME,
            value=admin_token,
            httponly=True,
            secure=is_https,
            samesite=cookie_samesite,
            domain=cookie_domain,
            max_age=7 * 86400,
            path="/"
        )

    tenant_str = str(matched_client.get("tenant") or "TNT-001")
    t_match = re.search(r"TNT-[A-Z0-9_-]+", tenant_str, re.IGNORECASE)
    effective_tenant = t_match.group(0).upper() if t_match else "TNT-001"

    from ..auth import create_access_token
    token_payload = {
        "sub": matched_client.get("login"),
        "tenant_id": effective_tenant,
        "role": "admin" if is_admin else (matched_client.get("role") or "РОП"),
        "name": matched_client.get("name") or matched_client.get("login")
    }
    jwt_access_token = create_access_token(token_payload)

    response.set_cookie(
        key="access_token",
        value=jwt_access_token,
        httponly=True,
        secure=is_https,
        samesite=cookie_samesite,
        domain=cookie_domain,
        max_age=7 * 86400,
        path="/"
    )

    session_token = secrets.token_hex(32)
    response.set_cookie(
        key="revops_client_auth",
        value=session_token,
        httponly=True,
        secure=is_https,
        samesite=cookie_samesite,
        domain=cookie_domain,
        max_age=7 * 86400,
        path="/"
    )

    return {
        "authenticated": True,
        "session_token": session_token,
        "access_token": jwt_access_token,
        "token": jwt_access_token,
        "is_admin": is_admin,
        "user": {
            "login": matched_client.get("login"),
            "name": matched_client.get("name") or matched_client.get("login"),
            "role": matched_client.get("role") or "Сотрудник",
            "tenant": matched_client.get("tenant") or "TNT-001 • Самозанятый",
            "is_admin": is_admin
        }
    }


def _revoke_current_token(request: Request, db: Session):
    token = None
    auth_header = request.headers.get("Authorization") or ""
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
    elif request.cookies.get("access_token"):
        token = request.cookies.get("access_token")

    if token:
        try:
            from ..auth import ALGORITHM, SECRET_KEY
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti:
                expires_at = datetime.fromtimestamp(exp, tz=timezone.utc) if exp else datetime.now(timezone.utc) + timedelta(days=1)
                existing = db.query(RevokedToken).filter(RevokedToken.jti == str(jti)).first()
                if not existing:
                    revoked = RevokedToken(jti=str(jti), expires_at=expires_at)
                    db.add(revoked)
                    db.commit()
        except Exception as e:
            logger.debug(f"Could not revoke token on logout: {e}")


def _clear_auth_cookies(response: Response, request: Request):
    from .admin_router import COOKIE_ADMIN_AUTH_NAME
    is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https" or bool(request.headers.get("cf-connecting-ip"))
    host = request.headers.get("host", "").lower()
    cookie_domain = ".ai-rop.ru" if (is_https and ("ai-rop.ru" in host or bool(request.headers.get("cf-connecting-ip")))) else None
    cookie_samesite: Literal["lax", "strict", "none"] = "none" if (is_https and cookie_domain) else "lax"

    keys = ["access_token", "revops_client_auth", COOKIE_ADMIN_AUTH_NAME]
    for key in keys:
        if cookie_domain:
            response.delete_cookie(key=key, path="/", domain=cookie_domain, secure=is_https, samesite=cookie_samesite)
        response.delete_cookie(key=key, path="/")


@router.post("/logout")
def logout_alias(response: Response, request: Request, db: Session = Depends(get_db)):
    """Logs out user, revokes JWT token, clears session/access cookies and returns 200 OK."""
    _revoke_current_token(request, db)
    _clear_auth_cookies(response, request)
    return {"status": "logged_out", "message": "Сессия успешно завершена"}


@router.post("/client-logout")
def client_logout(response: Response, request: Request, db: Session = Depends(get_db)):
    """Logs out client, revokes JWT token and clears session cookies."""
    _revoke_current_token(request, db)
    _clear_auth_cookies(response, request)
    return {"status": "ok", "message": "Сессия успешно завершена"}


@router.get("/registered-clients")
def get_registered_clients_public(current_user: User = Depends(get_current_user)):
    """Returns safe client directory with zero password hashes exposed to frontend. Admin only."""
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ разрешен только администраторам")
    from .admin_router import load_registered_clients
    clients = load_registered_clients()
    safe_clients = [
        {
            "login": c.get("login"),
            "name": c.get("name"),
            "role": c.get("role"),
            "tenant": c.get("tenant"),
            "is_active": c.get("is_active", True),
            "created_at": c.get("created_at")
        }
        for c in clients
    ]
    return {"clients": safe_clients}


class ChangePasswordRequest(BaseModel):
    login: str | None = None
    tenant_id: str | None = None
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., description="New password")


class UpdateProfileRequest(BaseModel):
    tenant_id: str | None = None
    login: str | None = None
    email: str | None = None
    full_name: str | None = None
    tg_contact: str | None = None
    phone: str | None = None


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Allows authenticated users to change their password securely.
    Verifies current password via bcrypt in database, updates hashed_password,
    enforces minimum 12 characters.
    """
    if len(req.new_password) < 12:
        raise HTTPException(
            status_code=400,
            detail="Новый пароль слишком короткий (минимум 12 символов)"
        )

    target_login = (req.login or "").strip().lower()
    if target_login and target_login != current_user.email.lower():
        if not current_user.is_admin:
            raise HTTPException(status_code=403, detail="Недостаточно прав для смены пароля другого пользователя")
        target_user = db.query(User).filter(User.email == target_login).first()
        if not target_user:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
    else:
        target_user = current_user

    if not verify_password(req.current_password, str(target_user.hashed_password)):
        raise HTTPException(status_code=401, detail="Текущий пароль указан неверно")

    setattr(target_user, "hashed_password", hash_password(req.new_password))
    db.commit()

    return {"status": "ok", "message": "Пароль успешно обновлен. Новый ключ доступа активен."}


@router.post("/update-profile")
def update_profile(
    req: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Updates client contact info (Email, Full Name, Telegram) in registry and auth config."""
    from ..tenant_registry import (
        load_tenants_registry,
        save_tenants_registry,
    )
    from .admin_router import load_registered_clients, save_registered_clients

    target_tenant = (req.tenant_id or current_user.tenant_id or "TNT-001").strip().upper()
    target_login = (req.login or "").strip().lower()

    if target_tenant != str(current_user.tenant_id).upper() and not current_user.is_admin:
        raise HTTPException(status_code=403, detail="cross-tenant access denied")

    # 1. Update in tenants_registry.json
    updated_tenant: dict[str, Any] | None = None
    try:
        registry = load_tenants_registry()
        updated = False
        for t in registry.get("tenants", []):
            if str(t.get("tenant_id", "")).upper() == target_tenant:
                if req.email:
                    t["email"] = req.email.strip()
                    t["client_email"] = req.email.strip()
                if req.full_name:
                    t["contact_name"] = req.full_name.strip()
                    t["name"] = req.full_name.strip()
                if req.tg_contact:
                    t["tg_chat_id"] = req.tg_contact.strip()
                    t["tg_username"] = req.tg_contact.strip()
                if req.phone:
                    t["phone"] = req.phone.strip()
                t["updated_at"] = datetime.now().isoformat()
                updated = True
                updated_tenant = t
                break
        if updated:
            save_tenants_registry(registry)
    except Exception as e:
        logger.warning(f"Failed to update profile in tenants_registry: {e}")

    # 2. Update in registered_clients.json
    clients = load_registered_clients()
    for c in clients:
        if (target_login and str(c.get("login", "")).lower() == target_login) or (target_tenant in str(c.get("tenant", "")).upper()):
            if req.full_name:
                c["name"] = req.full_name.strip()
            if req.email and "@" in req.email:
                c["login"] = req.email.strip().lower()
            save_registered_clients(clients)
            break

    return {"status": "ok", "message": "Профиль и контактные данные успешно сохранены.", "tenant": updated_tenant or {"tenant_id": target_tenant}}

