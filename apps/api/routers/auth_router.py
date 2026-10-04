"""
Auth Router: Tenant Onboarding, Login, and Profile.
"""

import re
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from packages.database.models import Tenant, User, Workspace, UserRole, SubscriptionTier
from packages.database.session import get_db
from ..auth import hash_password, verify_password, create_access_token, get_current_user
from ..schemas import TenantRegisterRequest, LoginRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication & Tenants"])


@router.post("/register-tenant", response_model=TokenResponse)
def register_tenant(req: TenantRegisterRequest, db: Session = Depends(get_db)):
    """Creates a new Organization (Tenant) and default Admin/CEO account."""
    slug = re.sub(r"[^a-z0-9_-]", "", req.company_name.lower().replace(" ", "-"))
    if not slug:
        slug = f"tenant-{uuid.uuid4().hex[:8]}"

    existing_tenant = db.query(Tenant).filter(Tenant.slug == slug).first()
    if existing_tenant:
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    # 1. Create Tenant
    tenant = Tenant(
        name=req.company_name,
        slug=slug,
        tier=SubscriptionTier.PRO,
        max_seats=15,
        ai_minutes_quota=2500,
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

    # Generate Token
    token = create_access_token({
        "sub": user.id,
        "tenant_id": tenant.id,
        "role": user.role.value,
        "email": user.email
    })

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        tenant_id=tenant.id,
        role=user.role.value,
        full_name=user.full_name,
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Authenticates user and returns JWT scoped to their tenant."""
    user = db.query(User).filter(User.email == req.email.lower(), User.is_active == True).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль"
        )

    token = create_access_token({
        "sub": user.id,
        "tenant_id": user.tenant_id,
        "role": user.role.value,
        "email": user.email
    })

    return TokenResponse(
        access_token=token,
        user_id=user.id,
        tenant_id=user.tenant_id,
        role=user.role.value,
        full_name=user.full_name,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Returns profile info and role of current authenticated user."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role.value,
        tenant_id=current_user.tenant_id,
        is_active=current_user.is_active,
    )
