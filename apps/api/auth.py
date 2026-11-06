"""
Authentication, Password Hashing, JWT, and Multi-Tenant Context for RevOps SaaS.
"""

import os
import re
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from packages.database.models import RevokedToken, User, UserRole
from packages.database.session import get_db

_raw_secret = os.getenv("SECRET_KEY")
if not _raw_secret or len(_raw_secret) < 32:
    raise RuntimeError("SECRET_KEY is required and must be at least 32 characters")
SECRET_KEY: str = _raw_secret

_ROP_WORD = re.compile(r"(?<!\w)(rop|роп)(?!\w)")  # a whole word, so "Европа" is not a РОП

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days (matches session cookie duration)

# Platform admin is an exact role label, never a substring: a client's job title such as "Супервайзер продаж"
# or "Admin assistant" is free text typed in the panel and must not open every tenant and every /admin route.
ADMIN_ROLE_LABELS = frozenset({"admin", UserRole.ADMIN.value.lower(), "admin / супервайзер"})
SUSPENDED_TENANT_STATUSES = ("frozen", "archived", "offboarded", "blocked")


def is_admin_role(role: object) -> bool:
    return str(getattr(role, "value", role) or "").strip().lower() in ADMIN_ROLE_LABELS


def _reject_if_tenant_suspended(user: object) -> None:
    """A frozen or offboarded company loses the sessions it already holds, not only the login form."""
    if is_admin_role(getattr(user, "role", "")):
        return
    from .tenant_registry import get_tenant_config

    cfg = get_tenant_config(str(getattr(user, "tenant_id", "") or "")) or {}
    if str(cfg.get("status") or "").lower() in SUSPENDED_TENANT_STATUSES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ компании приостановлен администратором")

security = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    if "jti" not in to_encode:
        to_encode["jti"] = str(uuid.uuid4())
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
    request: Request = None,  # type: ignore[assignment]
) -> User:
    """Extracts and verifies current user and tenant from Bearer token or HttpOnly access_token cookie."""
    token: str | None = None
    if credentials:
        token = credentials.credentials
    elif request and request.cookies.get("access_token"):
        token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Требуется авторизация (Bearer токен отсутствует)",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = str(payload.get("sub") or "")
        tenant_id = str(payload.get("tenant_id") or "")
        jti = payload.get("jti")
        if not user_id or not tenant_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный токен")
        if jti:
            revoked = db.query(RevokedToken).filter(RevokedToken.jti == str(jti)).first()
            if revoked:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Токен отозван")
    except jwt.PyJWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Токен истек или недействителен")

    # 1. Primary lookup by User.id
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        # 2. Fallback lookup by User.email (when sub is login/email from client-login)
        db_user = db.query(User).filter(User.email == user_id).first()

    if db_user:
        if not db_user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь не найден")
        _reject_if_tenant_suspended(db_user)
        return db_user

    # 3. Fallback for valid JWT belonging to registered/system client (not present in users DB)
    role_raw = str(payload.get("role") or "").lower()
    if is_admin_role(role_raw):
        assigned_role = UserRole.ADMIN
    elif _ROP_WORD.search(role_raw):
        # checked BEFORE the CEO words: the client label "РОП • Руководитель ОП" is a head of sales, not an owner
        assigned_role = UserRole.ROP
    elif "ceo" in role_raw or "руководитель" in role_raw or "директор" in role_raw:
        assigned_role = UserRole.CEO
    else:
        assigned_role = UserRole.KAM

    user = User(
        id=user_id,
        tenant_id=tenant_id or "TNT-001",
        email=str(payload.get("email") or user_id),
        full_name=str(payload.get("name") or user_id),
        role=assigned_role,
        is_active=True,
    )
    _reject_if_tenant_suspended(user)
    return user


def require_roles(*allowed_roles: UserRole):
    """Dependency for RBAC role checking."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Недостаточно прав. Требуется одна из ролей: {[r.value for r in allowed_roles]}"
            )
        return current_user
    return role_checker
