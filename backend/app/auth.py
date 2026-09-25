from datetime import UTC, datetime, timedelta

import jwt
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.database import get_db
from app.models import (
    AuditLog,
    Department,
    DepartmentBrandAccess,
    Position,
    Role,
    Team,
    User,
    UserDataScope,
    UserOrganizationProfile,
    UserPermissionOverride,
)
from app.schemas import (
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserResponse,
)
from app.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", maxsplit=1)[0].strip()
    return request.client.host if request.client else None


def _audit(
    db: Session,
    request: Request,
    *,
    action: str,
    status_value: str,
    user: User | None = None,
    identifier: str | None = None,
    details: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            status=status_value,
            identifier=identifier,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            details=details,
        )
    )


def _to_user_response(user: User) -> UserResponse:
    from app.access import effective_permission_names, is_superadmin, role_names

    profile = user.organization_profile
    scope = user.data_scope
    effective = sorted(effective_permission_names(user))
    return UserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        roles=sorted(role_names(user)),
        permissions=effective,
        effective_permissions=effective,
        is_superadmin=is_superadmin(user),
        department=profile.department.name if profile and profile.department else None,
        position=profile.position.name if profile and profile.position else None,
        permissions_version=user.permissions_version,
        data_scopes={
            "all": bool(scope and scope.all_access),
            "own_department": bool(scope and scope.own_department),
            "own_records": bool(scope and scope.own_records),
            "published_only": True if scope is None else scope.published_only,
            "assigned_brand_ids": [brand.id for brand in user.assigned_brands],
            "assigned_category_ids": [category.id for category in user.assigned_categories],
        },
    )


def _set_session_cookie(
    response: Response,
    user: User,
    *,
    remember_me: bool,
) -> None:
    token, max_age = create_access_token(
        user_id=user.id,
        roles=sorted(role.name for role in user.roles),
        remember_me=remember_me,
    )
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        max_age=max_age if remember_me else None,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def _as_utc(value: datetime) -> datetime:
    # SQLite does not retain timezone information for DateTime values.
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def get_current_user(
    session_token: str | None = Cookie(default=None, alias=settings.auth_cookie_name),
    db: Session = Depends(get_db),
) -> User:
    authentication_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Your session is invalid or has expired.",
    )
    if not session_token:
        raise authentication_error

    try:
        user_id = decode_access_token(session_token)
    except (jwt.InvalidTokenError, ValueError):
        raise authentication_error from None

    user = db.scalar(
        select(User)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.roles).selectinload(Role.allowed_price_lists),
            selectinload(User.permission_overrides).selectinload(UserPermissionOverride.permission),
            selectinload(User.data_scope),
            selectinload(User.assigned_brands),
            selectinload(User.assigned_categories),
            selectinload(User.assigned_products),
            selectinload(User.assigned_catalogues),
            selectinload(User.assigned_price_lists),
            selectinload(User.teams).selectinload(Team.brands),
            selectinload(User.teams).selectinload(Team.permissions),
            selectinload(User.teams).selectinload(Team.roles).selectinload(Role.permissions),
            selectinload(User.organization_profile)
            .selectinload(UserOrganizationProfile.department)
            .selectinload(Department.brand_access_rules)
            .selectinload(DepartmentBrandAccess.brand),
            selectinload(User.organization_profile)
            .selectinload(UserOrganizationProfile.department)
            .selectinload(Department.roles)
            .selectinload(Role.permissions),
            selectinload(User.organization_profile)
            .selectinload(UserOrganizationProfile.position)
            .selectinload(Position.permissions),
            selectinload(User.organization_profile)
            .selectinload(UserOrganizationProfile.position)
            .selectinload(Position.roles)
            .selectinload(Role.permissions),
            selectinload(User.organization_profile).selectinload(UserOrganizationProfile.primary_team),
        )
        .where(User.id == user_id)
    )
    if not user or not user.is_active:
        raise authentication_error
    return user


@router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    username = payload.username.casefold()
    email = str(payload.email).casefold()
    existing_user = db.scalar(
        select(User).where(
            or_(
                func.lower(User.username) == username,
                func.lower(User.email) == email,
            )
        )
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username or email is already registered.",
        )

    system_user_role = db.scalar(
        select(Role).where(Role.name == "system_user")
    )
    if not system_user_role:
        system_user_role = Role(
            name="system_user",
            key="system_user",
            description=(
                "Standard catalogue portal user with permissions assigned "
                "by a superadmin."
            ),
        )
        db.add(system_user_role)

    user = User(
        username=payload.username,
        email=str(payload.email),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        roles=[system_user_role],
        data_scope=UserDataScope(published_only=True),
    )
    db.add(user)
    try:
        db.flush()
        _audit(
            db,
            request,
            action="account_created",
            status_value="success",
            user=user,
            identifier=payload.username,
            details={
                "initial_role": "system_user",
                "authenticated": True,
            },
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username or email is already registered.",
        ) from None

    _set_session_cookie(response, user, remember_me=False)
    return AuthResponse(
        message="Account created and signed in.",
        user=_to_user_response(user),
    )


@router.post("/login", response_model=AuthResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> AuthResponse:
    identifier = payload.identifier.casefold()
    user = db.scalar(
        select(User)
        .options(
            selectinload(User.roles).selectinload(Role.permissions),
            selectinload(User.teams).selectinload(Team.brands),
            selectinload(User.teams).selectinload(Team.permissions),
            selectinload(User.organization_profile)
            .selectinload(UserOrganizationProfile.department)
            .selectinload(Department.brand_access_rules)
            .selectinload(DepartmentBrandAccess.brand),
            selectinload(User.organization_profile)
            .selectinload(UserOrganizationProfile.position)
            .selectinload(Position.permissions),
        )
        .where(
            or_(
                func.lower(User.username) == identifier,
                func.lower(User.email) == identifier,
            )
        )
    )

    now = datetime.now(UTC)
    locked_until = _as_utc(user.locked_until) if user and user.locked_until else None
    if user and locked_until and locked_until > now:
        retry_seconds = max(1, int((locked_until - now).total_seconds()))
        _audit(
            db,
            request,
            action="login_blocked",
            status_value="blocked",
            user=user,
            identifier=payload.identifier,
            details={"retry_after_seconds": retry_seconds},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
            headers={"Retry-After": str(retry_seconds)},
        )

    password_is_valid = verify_password(
        payload.password,
        user.password_hash if user else DUMMY_PASSWORD_HASH,
    )
    if not user or not password_is_valid or not user.is_active:
        if user and user.is_active:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.max_login_attempts:
                user.locked_until = now + timedelta(minutes=settings.login_lock_minutes)

        _audit(
            db,
            request,
            action="login_failed",
            status_value="failed",
            user=user,
            identifier=payload.identifier,
            details={"reason": "invalid_credentials"},
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="The username/email or password is incorrect.",
        )

    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login_at = now

    _set_session_cookie(response, user, remember_me=payload.remember_me)
    _audit(
        db,
        request,
        action="login",
        status_value="success",
        user=user,
        identifier=payload.identifier,
        details={"remember_me": payload.remember_me},
    )
    db.commit()
    return AuthResponse(message="Login successful.", user=_to_user_response(user))


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> UserResponse:
    return _to_user_response(user)


@router.post("/logout", response_model=MessageResponse)
def logout(
    request: Request,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    _audit(
        db,
        request,
        action="logout",
        status_value="success",
        user=user,
    )
    db.commit()
    response.delete_cookie(
        key=settings.auth_cookie_name,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="lax",
    )
    return MessageResponse(message="You have been logged out.")
