from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.models import (
    AuditLog,
    Permission,
    Role,
    User,
    role_permissions,
    user_brand_access,
    user_catalogue_access,
    user_category_access,
    user_product_access,
    user_price_list_access,
)


# Old endpoint names remain accepted during the API migration, but every grant and
# deny is evaluated using one canonical key. This avoids accidentally widening a
# user's access because two names exist for the same operation.
PERMISSION_ALIASES = {
    "overview.view": "dashboard.view",
    "catalogue.view": "products.view",
    "catalogue.edit": "products.edit",
    "catalogue.approve": "catalogues.approve",
    "catalogue.publish": "catalogues.publish",
    "audit.view": "audit_logs.view",
    "products.prices.view": "prices.view",
    "products.prices.propose": "prices.propose",
    "products.prices.edit": "prices.edit",
    "products.prices.approve": "prices.approve",
    "catalogue_covers.view": "catalogues.cover.view",
    "catalogue_covers.upload": "catalogues.cover.upload",
    "catalogue_covers.edit": "catalogues.cover.edit",
    "catalogue_covers.delete": "catalogues.cover.delete",
    "catalogue_covers.publish": "catalogues.cover.publish",
    "catalogue_categories.view": "categories.view",
    "catalogue_categories.manage": "categories.edit",
    "system_health.view": "system_metrics.view",
    "users.manage": "users.view",
    "organization.manage": "departments.manage",
    "system_information.view": "system_information.view",
    "feedback.view": "feedback.view_all",
    # Catalogue Studio supersedes the first design-editor permission names.
    # Canonicalizing them here lets existing roles continue to work while new
    # direct grants/denies are enforced consistently by every API dependency.
    "catalogue_studio.view": "catalogue_designs.view",
    "catalogue_studio.create": "catalogue_designs.create",
    "catalogue_studio.edit": "catalogue_designs.edit",
    "catalogue_studio.autosave": "catalogue_designs.manage_elements",
    "catalogue_studio.preview": "catalogue_designs.view",
    "catalogue_studio.publish": "catalogue_designs.publish",
    "catalogue_studio.export_pdf": "catalogue_designs.export_pdf",
    "catalogue_studio.manage_pages": "catalogue_designs.manage_pages",
    "catalogue_studio.manage_elements": "catalogue_designs.manage_elements",
    "catalogue_templates.view": "templates.view",
    "catalogue_templates.create": "templates.create",
    "catalogue_templates.edit_own": "templates.edit",
    "catalogue_templates.delete_own": "templates.delete",
    "catalogue_templates.upload": "templates.create",
    "catalogue_templates.share": "templates.share",
}

VALID_SCOPE_TYPES = {
    "all", "department", "own", "assigned_brands", "assigned_categories",
    "assigned_catalogues", "assigned_products", "none",
}

BASELINE_CATALOGUE_PERMISSIONS = {
    "catalogues.view",
    "catalogues.preview",
}

SALES_ADMIN_RESTRICTED_MODULES = {
    "users",
    "departments",
    "positions",
    "teams",
    "roles",
    "permissions",
    "organization",
}


def is_people_access_permission(code: str) -> bool:
    return canonical_permission(code).split(".", maxsplit=1)[0] in (
        SALES_ADMIN_RESTRICTED_MODULES
    )


@dataclass
class PermissionAccess:
    allowed: bool
    scopes: set[str] = field(default_factory=set)
    sources: list[str] = field(default_factory=list)


def canonical_permission(code: str) -> str:
    return PERMISSION_ALIASES.get(code, code)


def _active_roles(user: User):
    roles = [role for role in user.roles if role.is_active]
    # The current product uses fixed account types. Department, position and
    # team assignments control data ownership only; they must not silently
    # widen an Admin or Sales account into another permission profile.
    if {role.name for role in roles}.intersection({"superadmin", "sales_manager", "sales_user", "customer_user"}):
        return roles
    profile = user.organization_profile
    if profile and profile.department and profile.department.is_active:
        roles.extend(role for role in profile.department.roles if role.is_active)
    if profile and profile.position and profile.position.is_active:
        roles.extend(role for role in profile.position.roles if role.is_active)
    for team in user.teams:
        if team.is_active:
            roles.extend(role for role in team.roles if role.is_active)
    return roles


def is_superadmin(user: User) -> bool:
    """Return true only for the reserved backend system role."""

    return user.is_active and any(
        role.is_active and role.is_system and role.system_key == "SUPERADMIN"
        for role in user.roles
    )


def role_names(user: User) -> set[str]:
    return {role.name for role in _active_roles(user)}


def _not_expired(value: datetime | None) -> bool:
    if value is None:
        return True
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value > datetime.now(UTC)


def effective_permission_names(user: User) -> set[str]:
    """Evaluate active grants with an explicit-deny-wins rule."""

    raw_permissions = {
        permission.code
        for role in _active_roles(user)
        for permission in role.permissions
        if permission.is_active
    }
    permissions = raw_permissions | {canonical_permission(code) for code in raw_permissions}
    profile = user.organization_profile
    if profile and profile.position and profile.position.is_active:
        position_codes = {
            permission.code
            for permission in profile.position.permissions
            if permission.is_active
        }
        permissions.update(position_codes)
        permissions.update(canonical_permission(code) for code in position_codes)
    team_codes = {
        permission.code
        for team in user.teams
        if team.is_active
        for permission in team.permissions
        if permission.is_active
    }
    permissions.update(team_codes)
    permissions.update(canonical_permission(code) for code in team_codes)
    valid_overrides = [
        override
        for override in user.permission_overrides
        if override.permission.is_active and _not_expired(override.expires_at)
    ]
    for override in valid_overrides:
        codes = {override.permission.code, canonical_permission(override.permission.code)}
        if override.is_allowed:
            permissions.update(codes)
        else:
            permissions.difference_update(codes)
    if "sales_manager" in role_names(user) and not is_superadmin(user):
        permissions = {
            code for code in permissions if not is_people_access_permission(code)
        }
    return permissions


def has_permission(user: User, permission_code: str) -> bool:
    requested = canonical_permission(permission_code)
    if user.is_active and requested in BASELINE_CATALOGUE_PERMISSIONS:
        return True
    return is_superadmin(user) or requested in (
        effective_permission_names(user)
    )


def require_permission(permission_code: str) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if not has_permission(user, permission_code):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission required: {canonical_permission(permission_code)}",
            )
        return user

    return dependency


def require_any_permission(*permission_codes: str) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if not any(has_permission(user, code) for code in permission_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="One of these permissions is required: "
                + ", ".join(canonical_permission(code) for code in permission_codes),
            )
        return user

    return dependency


def require_superadmin(user: User = Depends(get_current_user)) -> User:
    if not is_superadmin(user):
        raise HTTPException(status_code=403, detail="SuperAdmin access is required.")
    return user


def assigned_catalogue_ids(db: Session, user: User) -> set:
    return set(
        db.scalars(
            select(user_catalogue_access.c.catalogue_id).where(
                user_catalogue_access.c.user_id == user.id
            )
        )
    )


def assigned_price_list_ids(db: Session, user: User) -> set[int]:
    return set(
        db.scalars(
            select(user_price_list_access.c.price_list_id).where(
                user_price_list_access.c.user_id == user.id
            )
        )
    )


def assigned_product_ids(db: Session, user: User, *, edit: bool | None = None) -> set:
    query = select(user_product_access.c.product_id).where(user_product_access.c.user_id == user.id)
    if edit is not None:
        query = query.where(
            (user_product_access.c.can_edit if edit else user_product_access.c.can_view).is_(True)
        )
    return set(db.scalars(query))


def assigned_category_ids(db: Session, user: User, *, edit: bool) -> set[int]:
    return set(
        db.scalars(
            select(user_category_access.c.category_id).where(
                user_category_access.c.user_id == user.id,
                (user_category_access.c.can_edit if edit else user_category_access.c.can_view).is_(True),
            )
        )
    )


def allowed_price_list_ids(db: Session, user: User) -> set[int] | None:
    if is_superadmin(user):
        return None
    allowed = assigned_price_list_ids(db, user)
    for role in _active_roles(user):
        allowed.update(price_list.id for price_list in role.allowed_price_lists if price_list.is_active)
    return allowed


def _fallback_scopes(user: User) -> set[str]:
    scope = user.data_scope
    values: set[str] = set()
    if scope:
        if scope.all_access:
            values.add("all")
        if scope.own_department:
            values.add("department")
        if scope.own_records:
            values.add("own")
    if user.assigned_brands:
        values.add("assigned_brands")
    if user.assigned_categories:
        values.add("assigned_categories")
    if user.assigned_products:
        values.add("assigned_products")
    if user.assigned_catalogues:
        values.add("assigned_catalogues")
    return values or {"none"}


def effective_permission_access(
    db: Session,
    user: User,
    permission_code: str,
) -> PermissionAccess:
    """Resolve one action and its union of explicitly granted row scopes.

    Scope unions are intentional: separate role grants broaden access, while a
    direct user deny removes the action completely. SuperAdmin always receives
    the special ``all`` scope without requiring permission rows.
    """

    code = canonical_permission(permission_code)
    if is_superadmin(user):
        return PermissionAccess(True, {"all"}, ["system:SUPERADMIN"])

    valid_overrides = [
        override
        for override in user.permission_overrides
        if override.permission.is_active
        and canonical_permission(override.permission.code) == code
        and _not_expired(override.expires_at)
    ]
    if any(not override.is_allowed for override in valid_overrides):
        return PermissionAccess(False, {"none"}, ["direct_deny"])

    scopes: set[str] = set()
    sources: list[str] = []
    for override in valid_overrides:
        if override.is_allowed:
            scopes.add(override.access_scope if override.access_scope in VALID_SCOPE_TYPES else "none")
            sources.append("direct_allow")

    active_roles = _active_roles(user)
    role_ids = {role.id for role in active_roles}
    if role_ids:
        rows = db.execute(
            select(
                Permission.code,
                Role.key,
                role_permissions.c.effect,
                role_permissions.c.access_scope,
            )
            .select_from(role_permissions)
            .join(Permission, Permission.id == role_permissions.c.permission_id)
            .join(Role, Role.id == role_permissions.c.role_id)
            .where(
                role_permissions.c.role_id.in_(role_ids),
                Permission.is_active.is_(True),
                Role.is_active.is_(True),
            )
        ).all()
        for raw_code, role_key, effect, access_scope in rows:
            if canonical_permission(raw_code) == code and effect == "allow":
                scopes.add(access_scope if access_scope in VALID_SCOPE_TYPES else "none")
                sources.append(f"role:{role_key}")

    # Position/team direct permissions predate scoped role grants. They remain
    # supported but inherit the user's explicit global assignment scope.
    profile = user.organization_profile
    if profile and profile.position and profile.position.is_active:
        if any(canonical_permission(item.code) == code and item.is_active for item in profile.position.permissions):
            scopes.update(_fallback_scopes(user))
            sources.append(f"position:{profile.position.code}")
    for team in user.teams:
        if team.is_active and any(canonical_permission(item.code) == code and item.is_active for item in team.permissions):
            scopes.update(_fallback_scopes(user))
            sources.append(f"team:{team.code}")

    allowed = bool(sources) and "none" not in scopes or bool(scopes - {"none"})
    return PermissionAccess(allowed, scopes or {"none"}, sources)


def _brand_names(db: Session, user: User, *, edit: bool) -> set[str]:
    allowed_direct_ids = set(
        db.scalars(
            select(user_brand_access.c.brand_id).where(
                user_brand_access.c.user_id == user.id,
                (user_brand_access.c.can_edit if edit else user_brand_access.c.can_view).is_(True),
            )
        )
    )
    names = {
        brand.name.casefold()
        for brand in user.assigned_brands
        if brand.is_active and brand.id in allowed_direct_ids
    }
    names.update(
        brand.name.casefold()
        for team in user.teams
        if team.is_active
        for brand in team.brands
        if brand.is_active
    )
    profile = user.organization_profile
    if profile and profile.department and profile.department.is_active:
        names.update(
            rule.brand.name.casefold()
            for rule in profile.department.brand_access_rules
            if rule.brand.is_active and (rule.can_manage if edit else rule.can_view)
        )
    return names


def allowed_brand_names(db: Session, user: User, *, edit: bool) -> set[str]:
    return _brand_names(db, user, edit=edit)


def has_record_access(
    db: Session,
    user: User,
    permission_code: str,
    resource,
) -> bool:
    canonical_code = canonical_permission(permission_code)
    if (
        user.is_active
        and canonical_code in BASELINE_CATALOGUE_PERMISSIONS
        and getattr(resource, "status", None) == "published"
    ):
        return True
    access = effective_permission_access(db, user, permission_code)
    if not access.allowed:
        return False
    if (
        role_names(user).intersection({"sales_user", "customer_user"})
        and canonical_code.startswith("catalogues.")
        and getattr(resource, "status", None) != "published"
    ):
        return False
    if "all" in access.scopes or is_superadmin(user):
        return True
    scopes = access.scopes - {"none"}
    action = canonical_code.rsplit(".", 1)[-1]
    is_edit = action not in {"view", "preview", "print", "export", "export_pdf", "export_excel", "view_history"}

    resource_id = getattr(resource, "id", None)
    brand = getattr(resource, "brand", None)
    if "assigned_brands" in scopes and brand and brand.casefold() in _brand_names(db, user, edit=is_edit):
        return True
    if "assigned_products" in scopes and resource_id is not None:
        product_access = db.execute(
            select(user_product_access.c.can_view, user_product_access.c.can_edit).where(
                user_product_access.c.user_id == user.id,
                user_product_access.c.product_id == resource_id,
            )
        ).first()
        if product_access and (product_access.can_edit if is_edit else product_access.can_view):
            return True
    if "assigned_categories" in scopes and hasattr(resource, "categories"):
        allowed_categories = set(
            db.scalars(
                select(user_category_access.c.category_id).where(
                    user_category_access.c.user_id == user.id,
                    (user_category_access.c.can_edit if is_edit else user_category_access.c.can_view).is_(True),
                )
            )
        )
        if allowed_categories.intersection(item.id for item in resource.categories):
            return True
    if "assigned_catalogues" in scopes and resource_id in assigned_catalogue_ids(db, user):
        assignment = db.execute(
            select(
                user_catalogue_access.c.can_view,
                user_catalogue_access.c.can_edit,
                user_catalogue_access.c.can_export,
            ).where(
                user_catalogue_access.c.user_id == user.id,
                user_catalogue_access.c.catalogue_id == resource_id,
            )
        ).first()
        if assignment:
            return assignment.can_export if action.startswith("export") else assignment.can_edit if is_edit else assignment.can_view
    if "own" in scopes:
        owner_ids = {
            getattr(resource, name, None)
            for name in ("owner_id", "created_by_id", "updated_by_id")
        }
        entry = getattr(resource, "catalogue_entry", None)
        if entry:
            owner_ids.add(getattr(entry, "updated_by_id", None))
        if user.id in owner_ids:
            return True
    if "department" in scopes:
        if brand and brand.casefold() in _brand_names(db, user, edit=is_edit):
            return True
        owner_id = getattr(resource, "owner_id", None) or getattr(resource, "created_by_id", None)
        if owner_id and user.organization_profile and user.organization_profile.department_id:
            from app.models import UserOrganizationProfile
            owner_department = db.scalar(
                select(UserOrganizationProfile.department_id).where(UserOrganizationProfile.user_id == owner_id)
            )
            if owner_department == user.organization_profile.department_id:
                return True
    return False


def bump_permissions_version(*users: User) -> None:
    for user in users:
        user.permissions_version = (user.permissions_version or 0) + 1


def permission_sources(user: User) -> dict[str, list[str]]:
    """Explain effective access for the SuperAdmin user access editor."""

    sources: dict[str, list[str]] = {}
    for role in _active_roles(user):
        for permission in role.permissions:
            if permission.is_active:
                sources.setdefault(canonical_permission(permission.code), []).append(
                    f"role:{role.key}"
                )
    for team in user.teams:
        if team.is_active:
            for permission in team.permissions:
                if permission.is_active:
                    sources.setdefault(canonical_permission(permission.code), []).append(
                        f"team:{team.code}"
                    )
    for override in user.permission_overrides:
        if override.permission.is_active and _not_expired(override.expires_at):
            marker = "direct_allow" if override.is_allowed else "direct_deny"
            sources.setdefault(canonical_permission(override.permission.code), []).append(marker)
    return sources
