import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from app.access import (
    allowed_price_list_ids,
    bump_permissions_version,
    canonical_permission,
    effective_permission_access,
    effective_permission_names,
    is_superadmin,
    require_permission,
    require_superadmin,
)
from app.access_schemas import (
    CurrentAccessResponse,
    EffectivePermissionItem,
    RoleAccessResponse,
    RoleAccessUpdate,
    UserAccessResponse,
    UserAccessUpdate,
    UserDataScopeInput,
)
from app.auth import get_current_user
from app.commerce_models import Catalogue, PriceList
from app.database import get_db
from app.models import (
    AuditLog,
    Brand,
    Category,
    Permission,
    PermissionChangeLog,
    Product,
    Role,
    User,
    UserDataScope,
    UserPermissionOverride,
    department_roles,
    position_roles,
    role_permissions,
    user_brand_access,
    user_catalogue_access,
    user_category_access,
    user_price_list_access,
    user_product_access,
)
from app.security import verify_password


router = APIRouter(tags=["Access control"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",", 1)[0].strip() if forwarded else (request.client.host if request.client else None)


def _permission_codes(db: Session, user: User) -> list[str]:
    if is_superadmin(user):
        return sorted({canonical_permission(code) for code in db.scalars(select(Permission.code).where(Permission.is_active.is_(True)))})
    return sorted({canonical_permission(code) for code in effective_permission_names(user)})


def _permission_items(db: Session, user: User) -> list[EffectivePermissionItem]:
    items = []
    for code in _permission_codes(db, user):
        access = effective_permission_access(db, user, code)
        if access.allowed:
            items.append(EffectivePermissionItem(key=code, scopes=sorted(access.scopes), sources=access.sources))
    return items


def _scope_payload(user: User) -> UserDataScopeInput:
    scope = user.data_scope
    return UserDataScopeInput(
        all_access=bool(scope and scope.all_access),
        own_department=bool(scope and scope.own_department),
        own_records=bool(scope and scope.own_records),
        published_only=True if scope is None else scope.published_only,
    )


def _current_response(db: Session, user: User) -> CurrentAccessResponse:
    permissions = _permission_items(db, user)
    allowed_prices = allowed_price_list_ids(db, user)
    profile = user.organization_profile
    return CurrentAccessResponse(
        user={
            "id": str(user.id),
            "display_name": user.full_name,
            "department": profile.department.name if profile and profile.department else None,
            "position": profile.position.name if profile and profile.position else None,
            "is_super_admin": is_superadmin(user),
        },
        permissions_version=user.permissions_version,
        permissions=[item.key for item in permissions],
        scopes={item.key: {"types": item.scopes} for item in permissions},
        price_list_ids=(
            list(db.scalars(select(PriceList.id).where(PriceList.is_active.is_(True))))
            if allowed_prices is None else sorted(allowed_prices)
        ),
    )


@router.get("/auth/me/permissions", response_model=CurrentAccessResponse)
def current_permissions(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CurrentAccessResponse:
    return _current_response(db, user)


def _inherited_roles(db: Session, user: User) -> list[dict]:
    profile = user.organization_profile
    inherited: list[dict] = []
    if profile and profile.department_id:
        for role in db.scalars(
            select(Role).join(department_roles).where(department_roles.c.department_id == profile.department_id, Role.is_active.is_(True))
        ):
            inherited.append({"source": "department", "id": role.id, "key": role.key, "name": role.name})
    if profile and profile.position_id:
        for role in db.scalars(
            select(Role).join(position_roles).where(position_roles.c.position_id == profile.position_id, Role.is_active.is_(True))
        ):
            inherited.append({"source": "position", "id": role.id, "key": role.key, "name": role.name})
    for team in user.teams:
        if not team.is_active:
            continue
        for role in team.roles:
            if role.is_active:
                inherited.append({"source": "team", "source_id": team.id, "source_name": team.name, "id": role.id, "key": role.key, "name": role.name})
    return inherited


def _user_access_response(db: Session, target: User) -> UserAccessResponse:
    permissions = _permission_items(db, target)
    codes = {item.key for item in permissions}
    modules = sorted({code.split(".", 1)[0] for code in codes})
    restricted = []
    if "prices.view_cost" not in codes and not is_superadmin(target):
        restricted.extend(["cost_price", "purchase_price", "supplier_cost", "landed_cost"])
    if "prices.view_margin" not in codes and not is_superadmin(target):
        restricted.extend(["margin_amount", "margin_percentage", "minimum_margin"])
    if "system_information.view" not in codes and not is_superadmin(target):
        restricted.extend(["server_information", "database_version", "storage_paths", "process_details"])
    allowed_prices = allowed_price_list_ids(db, target)
    return UserAccessResponse(
        user_id=target.id,
        username=target.username,
        full_name=target.full_name,
        is_super_admin=is_superadmin(target),
        permissions_version=target.permissions_version,
        direct_role_ids=sorted(role.id for role in target.roles),
        inherited_roles=_inherited_roles(db, target),
        overrides=[
            {
                "permission_id": item.permission_id,
                "key": item.permission.code,
                "effect": "allow" if item.is_allowed else "deny",
                "access_scope": item.access_scope,
                "reason": item.reason,
                "expires_at": item.expires_at,
            }
            for item in target.permission_overrides
        ],
        data_scope=_scope_payload(target),
        brand_ids=sorted(item.id for item in target.assigned_brands),
        category_ids=sorted(item.id for item in target.assigned_categories),
        product_ids=sorted((item.id for item in target.assigned_products), key=str),
        catalogue_ids=sorted((item.id for item in target.assigned_catalogues), key=str),
        price_list_ids=(
            sorted(item.id for item in target.assigned_price_lists)
            if allowed_prices is not None else sorted(db.scalars(select(PriceList.id)))
        ),
        effective_permissions=permissions,
        visible_modules=modules,
        restricted_fields=restricted,
    )


def _target_user(db: Session, user_id: uuid.UUID) -> User:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")
    return target


@router.get("/access/users/{user_id}", response_model=UserAccessResponse)
@router.get("/access/users/{user_id}/simulate", response_model=UserAccessResponse)
def get_user_access(
    user_id: uuid.UUID,
    _: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> UserAccessResponse:
    return _user_access_response(db, _target_user(db, user_id))


def _replace_assignments(db: Session, table, user_id, column, values, extra: dict | None = None) -> None:
    db.execute(delete(table).where(table.c.user_id == user_id))
    if values:
        db.execute(insert(table), [{"user_id": user_id, column: value, **(extra or {})} for value in values])


def _active_superadmin_count(db: Session) -> int:
    return int(db.scalar(
        select(func.count(func.distinct(User.id)))
        .select_from(User)
        .join(User.roles)
        .where(User.is_active.is_(True), Role.is_active.is_(True), Role.is_system.is_(True), Role.system_key == "SUPERADMIN")
    ) or 0)


@router.put("/access/users/{user_id}", response_model=UserAccessResponse)
def update_user_access(
    user_id: uuid.UUID,
    payload: UserAccessUpdate,
    request: Request,
    actor: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> UserAccessResponse:
    target = _target_user(db, user_id)
    old = _user_access_response(db, target).model_dump(mode="json")
    if payload.role_ids is not None:
        roles = list(db.scalars(select(Role).where(Role.id.in_(payload.role_ids), Role.is_active.is_(True)))) if payload.role_ids else []
        if len(roles) != len(set(payload.role_ids)):
            raise HTTPException(status_code=422, detail="One or more roles are unavailable.")
        had_super = is_superadmin(target)
        will_super = any(role.is_system and role.system_key == "SUPERADMIN" for role in roles)
        if had_super != will_super:
            if not payload.reauth_password or not verify_password(payload.reauth_password, actor.password_hash):
                raise HTTPException(status_code=403, detail="Re-enter your password to change SuperAdmin access.")
            if had_super and not will_super and _active_superadmin_count(db) <= 1:
                raise HTTPException(status_code=409, detail="The final active SuperAdmin cannot be removed.")
        target.roles = roles

    if payload.overrides is not None:
        permission_ids = {item.permission_id for item in payload.overrides}
        if len(permission_ids) != len(payload.overrides):
            raise HTTPException(status_code=422, detail="Each permission may have one override.")
        existing_ids = set(db.scalars(select(Permission.id).where(Permission.id.in_(permission_ids)))) if permission_ids else set()
        if existing_ids != permission_ids:
            raise HTTPException(status_code=422, detail="One or more permissions are unavailable.")
        target.permission_overrides.clear()
        db.flush()
        target.permission_overrides.extend(
            UserPermissionOverride(
                permission_id=item.permission_id,
                is_allowed=item.effect == "allow",
                access_scope=item.access_scope,
                reason=item.reason or payload.reason,
                expires_at=item.expires_at,
                granted_by_id=actor.id,
            )
            for item in payload.overrides
        )
    if payload.data_scope is not None:
        if target.data_scope is None:
            target.data_scope = UserDataScope(user_id=target.id)
        for key, value in payload.data_scope.model_dump().items():
            setattr(target.data_scope, key, value)
        target.data_scope.updated_by_id = actor.id

    if payload.brand_ids is not None:
        _replace_assignments(db, user_brand_access, target.id, "brand_id", payload.brand_ids, {"can_view": True, "can_edit": True})
    if payload.category_ids is not None:
        _replace_assignments(db, user_category_access, target.id, "category_id", payload.category_ids, {"can_view": True, "can_edit": True})
    if payload.product_ids is not None:
        _replace_assignments(db, user_product_access, target.id, "product_id", payload.product_ids, {"can_view": True, "can_edit": True})
    if payload.catalogue_ids is not None:
        _replace_assignments(db, user_catalogue_access, target.id, "catalogue_id", payload.catalogue_ids, {"can_view": True, "can_edit": True, "can_export": True})
    if payload.price_list_ids is not None:
        _replace_assignments(db, user_price_list_access, target.id, "price_list_id", payload.price_list_ids)

    bump_permissions_version(target)
    db.flush()
    db.expire(target)
    new = _user_access_response(db, target).model_dump(mode="json")
    action = "superadmin_access_changed" if old["is_super_admin"] != new["is_super_admin"] else "user_access_changed"
    change = PermissionChangeLog(
        changed_by_id=actor.id, target_user_id=target.id, action=action,
        old_values=old, new_values=new, reason=payload.reason,
        ip_address=_client_ip(request), request_id=request.headers.get("x-request-id"),
    )
    db.add(change)
    db.flush()
    db.add(AuditLog(
        user_id=actor.id, action=action, module="permissions", status="success",
        identifier=target.username, ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
        details={"target_user_id": str(target.id), "reason": payload.reason, "change_log_id": str(change.id)},
    ))
    db.commit()
    return _user_access_response(db, target)


def _role_response(db: Session, role: Role) -> RoleAccessResponse:
    rows = db.execute(
        select(Permission.id, Permission.code, Permission.module, role_permissions.c.effect, role_permissions.c.access_scope)
        .select_from(role_permissions)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .where(role_permissions.c.role_id == role.id)
        .order_by(Permission.module, Permission.code)
    ).all()
    return RoleAccessResponse(
        role_id=role.id, role_key=role.key, role_name=role.name,
        is_active=role.is_active, is_system=role.is_system,
        grants=[{"permission_id": row.id, "key": row.code, "module": row.module, "effect": row.effect, "access_scope": row.access_scope} for row in rows],
        price_list_ids=sorted(item.id for item in role.allowed_price_lists),
    )


@router.get("/access/roles/{role_id}", response_model=RoleAccessResponse)
def get_role_access(role_id: int, _: User = Depends(require_permission("roles.view")), db: Session = Depends(get_db)) -> RoleAccessResponse:
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found.")
    return _role_response(db, role)


@router.put("/access/roles/{role_id}", response_model=RoleAccessResponse)
def update_role_access(
    role_id: int,
    payload: RoleAccessUpdate,
    request: Request,
    actor: User = Depends(require_permission("roles.manage_permissions")),
    db: Session = Depends(get_db),
) -> RoleAccessResponse:
    role = db.get(Role, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found.")
    if role.is_system:
        raise HTTPException(status_code=409, detail="The protected SuperAdmin role has automatic access and cannot use a permission matrix.")
    old = _role_response(db, role).model_dump(mode="json")
    permission_ids = {item.permission_id for item in payload.grants}
    if len(permission_ids) != len(payload.grants):
        raise HTTPException(status_code=422, detail="Each permission may have one role grant.")
    if permission_ids != set(db.scalars(select(Permission.id).where(Permission.id.in_(permission_ids)))):
        raise HTTPException(status_code=422, detail="One or more permissions are unavailable.")
    price_lists = list(db.scalars(select(PriceList).where(PriceList.id.in_(payload.price_list_ids)))) if payload.price_list_ids else []
    if len(price_lists) != len(set(payload.price_list_ids)):
        raise HTTPException(status_code=422, detail="One or more price lists are unavailable.")
    db.execute(delete(role_permissions).where(role_permissions.c.role_id == role.id))
    if payload.grants:
        db.execute(insert(role_permissions), [
            {"role_id": role.id, "permission_id": item.permission_id, "effect": item.effect, "access_scope": item.access_scope}
            for item in payload.grants
        ])
    role.allowed_price_lists = price_lists
    for user in db.scalars(select(User)):
        bump_permissions_version(user)
    db.flush()
    db.expire(role)
    new = _role_response(db, role).model_dump(mode="json")
    db.add(PermissionChangeLog(
        changed_by_id=actor.id, target_role_id=role.id, action="role_permission_matrix_changed",
        old_values=old, new_values=new, reason=payload.reason,
        ip_address=_client_ip(request), request_id=request.headers.get("x-request-id"),
    ))
    db.add(AuditLog(
        user_id=actor.id, action="role_permission_matrix_changed", module="permissions", status="success",
        identifier=role.key, ip_address=_client_ip(request), user_agent=request.headers.get("user-agent"),
        details={"role_id": role.id, "reason": payload.reason},
    ))
    db.commit()
    return _role_response(db, role)
