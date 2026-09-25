import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.access import (
    bump_permissions_version,
    effective_permission_names,
    has_permission,
    is_superadmin,
    require_permission,
    require_superadmin as require_system_superadmin,
)
from app.auth import get_current_user
from app.database import get_db
from app.models import (
    AuditLog,
    Department,
    Permission,
    Position,
    Role,
    Team,
    User,
    UserOrganizationProfile,
    UserPermissionOverride,
    user_teams,
)
from app.security import hash_password
from app.user_schemas import (
    ManagedUserCreate,
    ManagedUserResponse,
    ManagedUserUpdate,
    PasswordResetRequest,
    RoleResponse,
    UserManagementMessage,
    UserPermissionOverrideResponse,
    UserPermissionOverrideUpdate,
)


router = APIRouter(prefix="/users", tags=["User management"])
USER_ADMIN_ROLES = {"sales_manager", "superadmin"}
ACCOUNT_ROLES = {"superadmin", "sales_manager", "sales_user", "customer_user"}


def _role_names(user: User) -> set[str]:
    return {role.name for role in user.roles}


def _permission_names(user: User) -> set[str]:
    return effective_permission_names(user)


def require_user_admin(user: User = Depends(get_current_user)) -> User:
    if not (is_superadmin(user) or has_permission(user, "users.view")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A user administrator role is required.",
        )
    return user


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    return require_system_superadmin(user)


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", maxsplit=1)[0].strip()
    return request.client.host if request.client else None


def _audit(
    db: Session,
    request: Request,
    actor: User,
    target: User,
    *,
    action: str,
    details: dict | None = None,
) -> None:
    combined_details = {
        "target_user_id": str(target.id),
        "target_username": target.username,
        **(details or {}),
    }
    db.add(
        AuditLog(
            user_id=actor.id,
            action=action,
            module="user_management",
            status="success",
            identifier=target.username,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            details=combined_details,
        )
    )


def _to_response(user: User) -> ManagedUserResponse:
    profile = user.organization_profile
    brand_names = sorted(
        {
            brand.name
            for team in user.teams
            for brand in team.brands
        }
    )
    inherited_roles = []
    if profile and profile.department:
        inherited_roles.extend({"name": role.name, "source": "department", "source_name": profile.department.name} for role in profile.department.roles if role.is_active)
    if profile and profile.position:
        inherited_roles.extend({"name": role.name, "source": "position", "source_name": profile.position.name} for role in profile.position.roles if role.is_active)
    for team in user.teams:
        inherited_roles.extend({"name": role.name, "source": "team", "source_name": team.name} for role in team.roles if role.is_active and team.is_active)
    return ManagedUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=sorted(role.name for role in user.roles),
        department_id=profile.department_id if profile else None,
        department_name=(
            profile.department.name if profile and profile.department else None
        ),
        position_id=profile.position_id if profile else None,
        position_name=profile.position.name if profile and profile.position else None,
        primary_team_id=profile.primary_team_id if profile else None,
        primary_team_name=profile.primary_team.name if profile and profile.primary_team else None,
        employee_code=profile.employee_code if profile else None,
        team_ids=sorted(team.id for team in user.teams),
        team_names=sorted(team.name for team in user.teams),
        brand_names=brand_names,
        direct_roles=sorted(role.name for role in user.roles),
        inherited_roles=sorted(inherited_roles, key=lambda item: (item["name"], item["source"])),
        failed_login_attempts=user.failed_login_attempts,
        locked_until=user.locked_until,
        last_login_at=user.last_login_at,
        created_at=user.created_at,
    )


def _get_user(db: Session, user_id: uuid.UUID) -> User:
    user = db.scalar(
        select(User)
        .options(
            selectinload(User.roles),
            selectinload(User.organization_profile).selectinload(
                UserOrganizationProfile.department
            ),
            selectinload(User.organization_profile).selectinload(
                UserOrganizationProfile.position
            ),
            selectinload(User.organization_profile).selectinload(UserOrganizationProfile.primary_team),
            selectinload(User.teams).selectinload(Team.brands),
            selectinload(User.teams).selectinload(Team.roles),
            selectinload(User.permission_overrides).selectinload(
                UserPermissionOverride.permission
            ),
        )
        .where(User.id == user_id)
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _permission_override_response(
    override: UserPermissionOverride,
) -> UserPermissionOverrideResponse:
    return UserPermissionOverrideResponse(
        permission_id=override.permission_id,
        permission_code=override.permission.code,
        module=override.permission.module,
        is_allowed=override.is_allowed,
        reason=override.reason,
        created_at=override.created_at,
    )


def _resolve_organization(
    db: Session,
    *,
    department_id: int | None,
    position_id: int | None,
    team_ids: list[int],
    primary_team_id: int | None,
) -> tuple[Department | None, Position | None, list[Team], Team | None]:
    department = db.get(Department, department_id) if department_id else None
    if department_id and not department:
        raise HTTPException(status_code=422, detail="Department not found.")
    position = db.get(Position, position_id) if position_id else None
    if position_id and not position:
        raise HTTPException(status_code=422, detail="Position not found.")
    if position and not department:
        raise HTTPException(status_code=422, detail="Select a department before selecting a position.")
    if position and department and position.department_id != department.id:
        raise HTTPException(
            status_code=422,
            detail="The selected position does not belong to the selected department.",
        )
    teams = (
        list(
            db.scalars(
                select(Team)
                .options(selectinload(Team.brands))
                .where(Team.id.in_(team_ids))
            )
        )
        if team_ids
        else []
    )
    if len(teams) != len(team_ids):
        raise HTTPException(status_code=422, detail="One or more teams do not exist.")
    if teams and not department:
        raise HTTPException(status_code=422, detail="Select a department before selecting teams.")
    invalid_teams = [team.name for team in teams if team.department_id != department.id]
    if invalid_teams:
        raise HTTPException(status_code=422, detail="Every selected team must belong to the selected department.")
    primary_team = next((team for team in teams if team.id == primary_team_id), None) if primary_team_id else None
    if primary_team_id and not primary_team:
        raise HTTPException(status_code=422, detail="The primary team must also be selected as a team membership.")
    return department, position, teams, primary_team


def _resolve_roles(
    db: Session,
    role_names: list[str],
    actor: User,
) -> list[Role]:
    if not role_names:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assign at least one role.",
        )
    unsupported = set(role_names).difference(ACCOUNT_ROLES)
    if unsupported or len(set(role_names)) != 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Account type must be SuperAdmin, Sales Admin, Sales, or Customer.",
        )
    if "superadmin" in role_names and not is_superadmin(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a SuperAdmin can assign the SuperAdmin role.",
        )
    roles = list(db.scalars(select(Role).where(Role.name.in_(role_names))))
    if len(roles) != len(role_names):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more selected roles do not exist.",
        )
    fixed_account_roles = {"sales_manager", "sales_user", "customer_user"}
    if (
        not fixed_account_roles.intersection(role_names)
        and not any(role.is_system and role.system_key == "SUPERADMIN" for role in roles)
    ):
        baseline_role = db.scalar(select(Role).where(Role.name == "system_user"))
        if baseline_role and all(role.id != baseline_role.id for role in roles):
            roles.append(baseline_role)
    return roles


def _sync_primary_team_flag(db: Session, user: User) -> None:
    db.execute(update(user_teams).where(user_teams.c.user_id == user.id).values(is_primary=False))
    profile = user.organization_profile
    if profile and profile.primary_team_id:
        db.execute(
            update(user_teams)
            .where(user_teams.c.user_id == user.id, user_teams.c.team_id == profile.primary_team_id)
            .values(is_primary=True)
        )


def _active_superadmin_count(db: Session) -> int:
    return (
        db.scalar(
            select(func.count(func.distinct(User.id)))
            .select_from(User)
            .join(User.roles)
            .where(
                User.is_active.is_(True),
                Role.is_system.is_(True),
                Role.system_key == "SUPERADMIN",
            )
        )
        or 0
    )


@router.get("", response_model=list[ManagedUserResponse])
def list_users(
    q: str = Query(default="", max_length=120),
    _: User = Depends(require_permission("users.view")),
    db: Session = Depends(get_db),
) -> list[ManagedUserResponse]:
    query = select(User).options(
        selectinload(User.roles),
        selectinload(User.organization_profile).selectinload(
            UserOrganizationProfile.department
        ),
        selectinload(User.organization_profile).selectinload(
            UserOrganizationProfile.position
        ),
        selectinload(User.organization_profile).selectinload(
            UserOrganizationProfile.primary_team
        ),
        selectinload(User.teams).selectinload(Team.brands),
        selectinload(User.teams).selectinload(Team.roles),
    )
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.full_name.ilike(pattern),
            )
        )
    users = list(db.scalars(query.order_by(User.full_name, User.username)).unique())
    return [_to_response(user) for user in users]


@router.get("/roles", response_model=list[RoleResponse])
def list_roles(
    _: User = Depends(require_permission("roles.view")),
    db: Session = Depends(get_db),
) -> list[RoleResponse]:
    roles = list(db.scalars(select(Role).order_by(Role.name)))
    return [
        RoleResponse(
            id=role.id,
            name=role.name,
            description=role.description,
            permission_ids=sorted(permission.id for permission in role.permissions),
        )
        for role in roles
    ]


@router.get(
    "/{user_id}/permission-overrides",
    response_model=list[UserPermissionOverrideResponse],
)
def list_user_permission_overrides(
    user_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[UserPermissionOverrideResponse]:
    target = _get_user(db, user_id)
    return [
        _permission_override_response(override)
        for override in sorted(
            target.permission_overrides,
            key=lambda item: item.permission.code,
        )
    ]


@router.put(
    "/{user_id}/permission-overrides",
    response_model=list[UserPermissionOverrideResponse],
)
def update_user_permission_overrides(
    user_id: uuid.UUID,
    payload: UserPermissionOverrideUpdate,
    request: Request,
    actor: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> list[UserPermissionOverrideResponse]:
    target = _get_user(db, user_id)
    permission_ids = {item.permission_id for item in payload.overrides}
    permissions = {
        permission.id: permission
        for permission in db.scalars(
            select(Permission).where(Permission.id.in_(permission_ids))
        )
    }
    if len(permissions) != len(permission_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more permissions do not exist.",
        )

    old_values = [
        {
            "permission": override.permission.code,
            "effect": "allow" if override.is_allowed else "deny",
            "reason": override.reason,
        }
        for override in sorted(
            target.permission_overrides,
            key=lambda item: item.permission.code,
        )
    ]
    existing = {
        override.permission_id: override
        for override in target.permission_overrides
    }
    requested = {item.permission_id: item for item in payload.overrides}

    for permission_id, override in list(existing.items()):
        if permission_id not in requested:
            target.permission_overrides.remove(override)

    for permission_id, item in requested.items():
        override = existing.get(permission_id)
        if override:
            override.is_allowed = item.is_allowed
            override.reason = item.reason
        else:
            target.permission_overrides.append(
                UserPermissionOverride(
                    permission=permissions[permission_id],
                    is_allowed=item.is_allowed,
                    reason=item.reason,
                )
            )

    db.flush()
    bump_permissions_version(target)
    new_values = [
        {
            "permission": override.permission.code,
            "effect": "allow" if override.is_allowed else "deny",
            "reason": override.reason,
        }
        for override in sorted(
            target.permission_overrides,
            key=lambda item: item.permission.code,
        )
    ]
    _audit(
        db,
        request,
        actor,
        target,
        action="user_permission_overrides_updated",
        details={"old_overrides": old_values, "new_overrides": new_values},
    )
    db.commit()
    return [
        _permission_override_response(override)
        for override in sorted(
            target.permission_overrides,
            key=lambda item: item.permission.code,
        )
    ]


@router.post(
    "",
    response_model=ManagedUserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    payload: ManagedUserCreate,
    request: Request,
    actor: User = Depends(require_permission("users.create")),
    db: Session = Depends(get_db),
) -> ManagedUserResponse:
    if payload.role_names and not has_permission(actor, "users.assign_roles"):
        raise HTTPException(status_code=403, detail="Permission required: users.assign_roles")
    if "superadmin" in payload.role_names:
        raise HTTPException(status_code=409, detail="Create the user first, then grant protected SuperAdmin access in the access editor with password confirmation.")
    username = payload.username.casefold()
    email = str(payload.email).casefold()
    existing = db.scalar(
        select(User).where(
            or_(
                func.lower(User.username) == username,
                func.lower(User.email) == email,
            )
        )
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username or email is already registered.",
        )
    roles = _resolve_roles(db, payload.role_names, actor)
    department, position, teams, primary_team = _resolve_organization(
        db,
        department_id=payload.department_id,
        position_id=payload.position_id,
        team_ids=payload.team_ids,
        primary_team_id=payload.primary_team_id,
    )
    user = User(
        username=payload.username,
        email=str(payload.email),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        roles=roles,
        teams=teams,
    )
    if department or position or primary_team or payload.employee_code:
        user.organization_profile = UserOrganizationProfile(
            department=department,
            position=position,
            primary_team=primary_team,
            employee_code=payload.employee_code,
        )
    db.add(user)
    try:
        db.flush()
        _sync_primary_team_flag(db, user)
        _audit(
            db,
            request,
            actor,
            user,
            action="user_created",
            details={"roles": sorted(payload.role_names)},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That username or email is already registered.",
        ) from None
    return _to_response(user)


@router.patch("/{user_id}", response_model=ManagedUserResponse)
def update_user(
    user_id: uuid.UUID,
    payload: ManagedUserUpdate,
    request: Request,
    actor: User = Depends(require_permission("users.edit")),
    db: Session = Depends(get_db),
) -> ManagedUserResponse:
    target = _get_user(db, user_id)
    actor_roles = _role_names(actor)
    target_roles = _role_names(target)
    if payload.role_names is not None and not has_permission(actor, "users.assign_roles"):
        raise HTTPException(status_code=403, detail="Permission required: users.assign_roles")
    if payload.is_active is False and not has_permission(actor, "users.deactivate"):
        raise HTTPException(status_code=403, detail="Permission required: users.deactivate")
    if payload.model_fields_set.intersection({"department_id", "position_id", "team_ids"}) and not has_permission(actor, "users.assign_data_scope"):
        raise HTTPException(status_code=403, detail="Permission required: users.assign_data_scope")
    if is_superadmin(target) and not is_superadmin(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a SuperAdmin can modify another SuperAdmin.",
        )

    new_roles = (
        _resolve_roles(db, payload.role_names, actor)
        if payload.role_names is not None
        else target.roles
    )
    resulting_role_names = {role.name for role in new_roles}
    resulting_active = (
        payload.is_active if payload.is_active is not None else target.is_active
    )
    had_protected_super = is_superadmin(target)
    will_have_protected_super = any(role.is_system and role.system_key == "SUPERADMIN" for role in new_roles)
    if had_protected_super != will_have_protected_super:
        raise HTTPException(status_code=409, detail="Change protected SuperAdmin access in the access editor with password confirmation.")
    if had_protected_super and payload.is_active is not None and payload.is_active != target.is_active:
        raise HTTPException(status_code=409, detail="Protected SuperAdmin accounts cannot be activated or deactivated from the basic user editor.")

    if target.id == actor.id and not resulting_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot deactivate your own account.",
        )
    if target.id == actor.id and not resulting_role_names.intersection(
        USER_ADMIN_ROLES
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You cannot remove your own user-administrator access.",
        )
    if (
        is_superadmin(target)
        and (not any(role.is_system and role.system_key == "SUPERADMIN" for role in new_roles) or not resulting_active)
        and _active_superadmin_count(db) <= 1
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The final active SuperAdmin cannot be removed or deactivated.",
        )

    if payload.full_name is not None:
        target.full_name = payload.full_name
    if payload.email is not None:
        target.email = str(payload.email)
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.role_names is not None:
        target.roles = new_roles
        bump_permissions_version(target)
    organization_fields = {
        "department_id",
        "position_id",
        "employee_code",
        "team_ids",
        "primary_team_id",
    }
    if payload.model_fields_set.intersection(organization_fields):
        current_profile = target.organization_profile
        department_id = (
            payload.department_id
            if "department_id" in payload.model_fields_set
            else (current_profile.department_id if current_profile else None)
        )
        position_id = (
            payload.position_id
            if "position_id" in payload.model_fields_set
            else (current_profile.position_id if current_profile else None)
        )
        team_ids = (
            payload.team_ids
            if payload.team_ids is not None
            else [team.id for team in target.teams]
        )
        primary_team_id = (
            payload.primary_team_id
            if "primary_team_id" in payload.model_fields_set
            else (current_profile.primary_team_id if current_profile else None)
        )
        department, position, teams, primary_team = _resolve_organization(
            db,
            department_id=department_id,
            position_id=position_id,
            team_ids=team_ids,
            primary_team_id=primary_team_id,
        )
        if not current_profile:
            current_profile = UserOrganizationProfile(user=target)
            target.organization_profile = current_profile
        current_profile.department = department
        current_profile.position = position
        current_profile.primary_team = primary_team
        if "employee_code" in payload.model_fields_set:
            current_profile.employee_code = payload.employee_code
        target.teams = teams

    try:
        db.flush()
        _sync_primary_team_flag(db, target)
        _audit(
            db,
            request,
            actor,
            target,
            action="user_updated",
            details={
                "is_active": target.is_active,
                "roles": sorted(resulting_role_names),
                "department_id": (
                    target.organization_profile.department_id
                    if target.organization_profile
                    else None
                ),
                "team_ids": sorted(team.id for team in target.teams),
            },
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That email address is already registered.",
        ) from None
    return _to_response(target)


@router.post("/{user_id}/reset-password", response_model=UserManagementMessage)
def reset_user_password(
    user_id: uuid.UUID,
    payload: PasswordResetRequest,
    request: Request,
    actor: User = Depends(require_permission("users.reset_password")),
    db: Session = Depends(get_db),
) -> UserManagementMessage:
    target = _get_user(db, user_id)
    if is_superadmin(target) and not is_superadmin(actor):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a SuperAdmin can reset another SuperAdmin's password.",
        )
    target.password_hash = hash_password(payload.password)
    target.failed_login_attempts = 0
    target.locked_until = None
    _audit(db, request, actor, target, action="user_password_reset")
    db.commit()
    return UserManagementMessage(
        message="Password reset successfully.",
        user=_to_response(target),
    )


@router.post("/{user_id}/unlock", response_model=UserManagementMessage)
def unlock_user(
    user_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("users.edit")),
    db: Session = Depends(get_db),
) -> UserManagementMessage:
    target = _get_user(db, user_id)
    target.failed_login_attempts = 0
    target.locked_until = None
    _audit(db, request, actor, target, action="user_unlocked")
    db.commit()
    return UserManagementMessage(
        message="Account unlocked.",
        user=_to_response(target),
    )
