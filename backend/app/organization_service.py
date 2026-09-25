import uuid
from datetime import UTC, datetime
from math import ceil

from fastapi import HTTPException
from sqlalchemy import delete, func, insert, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.commerce_models import PriceList
from app.models import (
    Brand,
    Department,
    Position,
    Permission,
    Role,
    Team,
    User,
    UserOrganizationProfile,
    department_roles,
    position_roles,
    role_permissions,
    team_roles,
    user_roles,
    user_teams,
)
from app.organization_admin_schemas import (
    PositionPage,
    PositionSummary,
    PositionWrite,
    RolePage,
    RoleSummary,
    RoleWrite,
    TeamMembersUpdate,
    TeamPage,
    TeamSummary,
    TeamWrite,
    UserSummary,
)


LEVEL_ORDER = {
    "staff": 1,
    "senior_staff": 2,
    "supervisor": 3,
    "team_leader": 4,
    "manager": 5,
    "department_head": 6,
    "executive": 7,
}


def now() -> datetime:
    return datetime.now(UTC)


def _not_found(label: str) -> HTTPException:
    return HTTPException(status_code=404, detail=f"{label} not found.")


def get_role(db: Session, role_id: int) -> Role:
    role = db.scalar(
        select(Role)
        .options(
            selectinload(Role.permissions),
            selectinload(Role.allowed_price_lists),
            selectinload(Role.users),
            selectinload(Role.departments),
            selectinload(Role.positions),
            selectinload(Role.teams),
        )
        .where(Role.id == role_id, Role.deleted_at.is_(None))
    )
    if not role:
        raise _not_found("Role")
    return role


def role_summary(role: Role) -> RoleSummary:
    return RoleSummary(
        id=role.id,
        name=role.name,
        code=role.key,
        description=role.description,
        role_type=role.role_type,
        is_system_role=bool(role.is_system or role.role_type == "system"),
        is_active=role.is_active,
        default_scope=role.default_scope,
        department_restriction_id=role.department_restriction_id,
        team_restriction_id=role.team_restriction_id,
        user_count=len(role.users),
        permission_count=len(role.permissions),
        department_count=len(role.departments),
        position_count=len(role.positions),
        team_count=len(role.teams),
        permission_ids=sorted(permission.id for permission in role.permissions),
        price_list_ids=sorted(item.id for item in role.allowed_price_lists),
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


def list_roles(
    db: Session,
    *,
    q: str,
    active: bool | None,
    role_type: str | None,
    page: int,
    page_size: int,
) -> RolePage:
    query = select(Role).where(Role.deleted_at.is_(None))
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(or_(Role.name.ilike(pattern), Role.key.ilike(pattern), Role.description.ilike(pattern)))
    if active is not None:
        query = query.where(Role.is_active.is_(active))
    if role_type:
        query = query.where(Role.role_type == role_type)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    roles = list(db.scalars(
        query.options(
            selectinload(Role.permissions), selectinload(Role.allowed_price_lists),
            selectinload(Role.users), selectinload(Role.departments),
            selectinload(Role.positions), selectinload(Role.teams),
        )
        .order_by(Role.role_type.desc(), Role.name)
        .offset((page - 1) * page_size).limit(page_size)
    ).unique())
    return RolePage(items=[role_summary(item) for item in roles], total=total, page=page, page_size=page_size, pages=max(1, ceil(total / page_size)))


def _resolve_many(db: Session, model, ids: list[int], label: str):
    if not ids:
        return []
    items = list(db.scalars(select(model).where(model.id.in_(ids))))
    if len(items) != len(set(ids)):
        raise HTTPException(status_code=422, detail=f"One or more {label} do not exist.")
    return items


def set_role_grants(db: Session, role: Role, payload: RoleWrite) -> None:
    if role.is_system or role.role_type == "system":
        return
    permission_ids = [item.permission_id for item in payload.permission_grants]
    permissions = _resolve_many(db, Permission, permission_ids, "permissions")
    permission_by_id = {item.id: item for item in permissions}
    db.execute(delete(role_permissions).where(role_permissions.c.role_id == role.id))
    if payload.permission_grants:
        db.execute(insert(role_permissions), [
            {
                "role_id": role.id,
                "permission_id": grant.permission_id,
                "effect": grant.effect,
                "access_scope": grant.access_scope,
            }
            for grant in payload.permission_grants
            if grant.permission_id in permission_by_id
        ])
    role.allowed_price_lists = _resolve_many(db, PriceList, payload.price_list_ids, "price lists")


def apply_role(db: Session, role: Role, payload: RoleWrite, actor: User, *, creating: bool = False) -> None:
    protected = bool(role.is_system or role.role_type == "system") and not creating
    if protected and role.key != payload.code:
        raise HTTPException(status_code=409, detail="A protected system role code cannot be changed.")
    if protected and payload.role_type != "system":
        raise HTTPException(status_code=409, detail="A protected system role cannot be converted to a custom role.")
    if protected and (
        payload.default_scope != role.default_scope
        or payload.department_restriction_id != role.department_restriction_id
        or payload.team_restriction_id != role.team_restriction_id
    ):
        raise HTTPException(status_code=409, detail="Protected system role scope and organization restrictions cannot be changed.")
    if payload.role_type == "system" and not actor.roles:
        raise HTTPException(status_code=403, detail="Only SuperAdmin may create a system role.")
    if payload.department_restriction_id:
        department = db.get(Department, payload.department_restriction_id)
        if not department:
            raise _not_found("Department restriction")
    if payload.team_restriction_id:
        team = db.get(Team, payload.team_restriction_id)
        if not team:
            raise _not_found("Team restriction")
        if payload.department_restriction_id and team.department_id != payload.department_restriction_id:
            raise HTTPException(status_code=422, detail="The restricted team must belong to the restricted department.")
    role.name = payload.name
    role.key = payload.code
    role.description = payload.description
    role.role_type = payload.role_type
    role.default_scope = payload.default_scope
    role.department_restriction_id = payload.department_restriction_id
    role.team_restriction_id = payload.team_restriction_id
    role.is_active = payload.is_active
    role.updated_by_id = actor.id
    if creating:
        role.created_by_id = actor.id
    db.flush()
    set_role_grants(db, role, payload)


def role_users(db: Session, role: Role) -> list[UserSummary]:
    ids = set(db.scalars(select(user_roles.c.user_id).where(user_roles.c.role_id == role.id)))
    ids.update(db.scalars(
        select(UserOrganizationProfile.user_id).join(department_roles, department_roles.c.department_id == UserOrganizationProfile.department_id).where(department_roles.c.role_id == role.id)
    ))
    ids.update(db.scalars(
        select(UserOrganizationProfile.user_id).join(position_roles, position_roles.c.position_id == UserOrganizationProfile.position_id).where(position_roles.c.role_id == role.id)
    ))
    ids.update(db.scalars(
        select(user_teams.c.user_id).join(team_roles, team_roles.c.team_id == user_teams.c.team_id).where(team_roles.c.role_id == role.id)
    ))
    users = list(db.scalars(select(User).where(User.id.in_(ids)).order_by(User.full_name))) if ids else []
    return [UserSummary(id=user.id, username=user.username, full_name=user.full_name, email=user.email, is_active=user.is_active, department_id=user.organization_profile.department_id if user.organization_profile else None) for user in users]


def get_position(db: Session, position_id: int) -> Position:
    item = db.scalar(
        select(Position).options(
            selectinload(Position.department), selectinload(Position.default_team),
            selectinload(Position.reports_to), selectinload(Position.direct_reports),
            selectinload(Position.user_profiles), selectinload(Position.roles),
        ).where(Position.id == position_id, Position.deleted_at.is_(None))
    )
    if not item:
        raise _not_found("Position")
    return item


def position_summary(item: Position) -> PositionSummary:
    return PositionSummary(
        id=item.id, code=item.code, name_en=item.name, name_th=item.name_th,
        description=item.description, department_id=item.department_id,
        department_name=item.department.name, default_team_id=item.default_team_id,
        default_team_name=item.default_team.name if item.default_team else None,
        reports_to_position_id=item.reports_to_position_id,
        reports_to_position_name=item.reports_to.name if item.reports_to else None,
        management_level=item.management_level, display_order=item.display_order,
        is_active=item.is_active, user_count=len(item.user_profiles),
        child_position_count=len(item.direct_reports),
        default_role_ids=sorted(role.id for role in item.roles),
        created_at=item.created_at, updated_at=item.updated_at,
    )


def list_positions(db: Session, *, q: str, department_id: int | None, team_id: int | None, active: bool | None, page: int, page_size: int) -> PositionPage:
    query = select(Position).where(Position.deleted_at.is_(None))
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(or_(Position.name.ilike(pattern), Position.name_th.ilike(pattern), Position.code.ilike(pattern)))
    if department_id:
        query = query.where(Position.department_id == department_id)
    if team_id:
        query = query.where(Position.default_team_id == team_id)
    if active is not None:
        query = query.where(Position.is_active.is_(active))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = list(db.scalars(query.options(
        selectinload(Position.department), selectinload(Position.default_team), selectinload(Position.reports_to),
        selectinload(Position.direct_reports), selectinload(Position.user_profiles), selectinload(Position.roles),
    ).order_by(Position.display_order, Position.name).offset((page - 1) * page_size).limit(page_size)).unique())
    return PositionPage(items=[position_summary(item) for item in items], total=total, page=page, page_size=page_size, pages=max(1, ceil(total / page_size)))


def _validate_position_cycle(db: Session, item_id: int | None, reports_to_id: int | None) -> None:
    if not reports_to_id:
        return
    if item_id == reports_to_id:
        raise HTTPException(status_code=422, detail="A position cannot report to itself.")
    current = db.get(Position, reports_to_id)
    if not current:
        raise _not_found("Reports-to position")
    visited = {item_id} if item_id else set()
    while current:
        if current.id in visited:
            raise HTTPException(status_code=422, detail="That reports-to selection creates a circular reporting structure.")
        visited.add(current.id)
        current = current.reports_to


def apply_position(db: Session, item: Position, payload: PositionWrite, actor: User, *, creating: bool = False) -> None:
    department = db.get(Department, payload.department_id)
    if not department or not department.is_active:
        raise HTTPException(status_code=422, detail="Select an active department.")
    team = db.get(Team, payload.default_team_id) if payload.default_team_id else None
    if team and (team.department_id != payload.department_id or not team.is_active):
        raise HTTPException(status_code=422, detail="The default team must be active and belong to the selected department.")
    _validate_position_cycle(db, None if creating else item.id, payload.reports_to_position_id)
    manager = db.get(Position, payload.reports_to_position_id) if payload.reports_to_position_id else None
    if manager and manager.department_id != payload.department_id:
        raise HTTPException(status_code=422, detail="The reports-to position must belong to the selected department.")
    if not creating and item.department_id != payload.department_id and item.user_profiles:
        raise HTTPException(status_code=409, detail="Move assigned users before changing this position's department.")
    item.code = payload.code
    item.name = payload.name_en
    item.name_th = payload.name_th
    item.description = payload.description
    item.department_id = payload.department_id
    item.default_team_id = payload.default_team_id
    item.reports_to_position_id = payload.reports_to_position_id
    item.management_level = payload.management_level
    item.level = LEVEL_ORDER[payload.management_level]
    item.roles = _resolve_many(db, Role, payload.default_role_ids, "roles")
    item.is_active = payload.is_active
    item.display_order = payload.display_order
    item.updated_by_id = actor.id
    if creating:
        item.created_by_id = actor.id


def position_users(item: Position) -> list[UserSummary]:
    return [UserSummary(id=profile.user.id, username=profile.user.username, full_name=profile.user.full_name, email=profile.user.email, is_active=profile.user.is_active, department_id=profile.department_id) for profile in item.user_profiles]


def get_team(db: Session, team_id: int) -> Team:
    item = db.scalar(
        select(Team).options(
            selectinload(Team.department), selectinload(Team.team_leader), selectinload(Team.parent),
            selectinload(Team.children), selectinload(Team.default_positions), selectinload(Team.roles),
            selectinload(Team.brands), selectinload(Team.users),
        ).where(Team.id == team_id, Team.deleted_at.is_(None))
    )
    if not item:
        raise _not_found("Team")
    return item


def team_summary(item: Team) -> TeamSummary:
    return TeamSummary(
        id=item.id, code=item.code, name_en=item.name, name_th=item.name_th,
        description=item.description, department_id=item.department_id,
        department_name=item.department.name, team_leader_user_id=item.team_leader_user_id,
        team_leader_name=item.team_leader.full_name if item.team_leader else None,
        parent_team_id=item.parent_team_id, parent_team_name=item.parent.name if item.parent else None,
        display_order=item.display_order, is_active=item.is_active, member_count=len(item.users),
        child_team_count=len(item.children), default_position_ids=sorted(position.id for position in item.default_positions),
        default_role_ids=sorted(role.id for role in item.roles), brand_ids=sorted(brand.id for brand in item.brands),
        created_at=item.created_at, updated_at=item.updated_at,
    )


def list_teams(db: Session, *, q: str, department_id: int | None, leader_id: uuid.UUID | None, active: bool | None, page: int, page_size: int) -> TeamPage:
    query = select(Team).where(Team.deleted_at.is_(None))
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(or_(Team.name.ilike(pattern), Team.name_th.ilike(pattern), Team.code.ilike(pattern)))
    if department_id:
        query = query.where(Team.department_id == department_id)
    if leader_id:
        query = query.where(Team.team_leader_user_id == leader_id)
    if active is not None:
        query = query.where(Team.is_active.is_(active))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = list(db.scalars(query.options(
        selectinload(Team.department), selectinload(Team.team_leader), selectinload(Team.parent),
        selectinload(Team.children), selectinload(Team.default_positions), selectinload(Team.roles),
        selectinload(Team.brands), selectinload(Team.users),
    ).order_by(Team.display_order, Team.name).offset((page - 1) * page_size).limit(page_size)).unique())
    return TeamPage(items=[team_summary(item) for item in items], total=total, page=page, page_size=page_size, pages=max(1, ceil(total / page_size)))


def _validate_team_cycle(db: Session, item_id: int | None, parent_id: int | None) -> None:
    if not parent_id:
        return
    if item_id == parent_id:
        raise HTTPException(status_code=422, detail="A team cannot be its own parent.")
    current = db.get(Team, parent_id)
    if not current:
        raise _not_found("Parent team")
    visited = {item_id} if item_id else set()
    while current:
        if current.id in visited:
            raise HTTPException(status_code=422, detail="That parent creates a circular team hierarchy.")
        visited.add(current.id)
        current = current.parent


def apply_team(db: Session, item: Team, payload: TeamWrite, actor: User, *, creating: bool = False) -> None:
    department = db.get(Department, payload.department_id)
    if not department or not department.is_active:
        raise HTTPException(status_code=422, detail="Select an active department.")
    _validate_team_cycle(db, None if creating else item.id, payload.parent_team_id)
    parent = db.get(Team, payload.parent_team_id) if payload.parent_team_id else None
    if parent and parent.department_id != payload.department_id:
        raise HTTPException(status_code=422, detail="The parent team must belong to the selected department.")
    leader = db.get(User, payload.team_leader_user_id) if payload.team_leader_user_id else None
    if leader and not leader.is_active:
        raise HTTPException(status_code=422, detail="The team leader must be an active user.")
    leader_department = leader.organization_profile.department_id if leader and leader.organization_profile else None
    if leader and leader_department != payload.department_id and not payload.allow_cross_department_leader:
        raise HTTPException(status_code=422, detail="The team leader must belong to the selected department. SuperAdmin may confirm a cross-department exception.")
    positions = _resolve_many(db, Position, payload.default_position_ids, "positions")
    if any(position.department_id != payload.department_id for position in positions):
        raise HTTPException(status_code=422, detail="Every default position must belong to the selected department.")
    if not creating and item.department_id != payload.department_id and item.users:
        raise HTTPException(status_code=409, detail="Move active team members before changing this team's department.")
    item.code = payload.code
    item.name = payload.name_en
    item.name_th = payload.name_th
    item.description = payload.description
    item.department_id = payload.department_id
    item.team_leader_user_id = payload.team_leader_user_id
    item.parent_team_id = payload.parent_team_id
    item.display_order = payload.display_order
    item.is_active = payload.is_active
    item.roles = _resolve_many(db, Role, payload.default_role_ids, "roles")
    item.brands = _resolve_many(db, Brand, payload.brand_ids, "brands")
    item.updated_by_id = actor.id
    if creating:
        item.created_by_id = actor.id
    db.flush()
    for position in positions:
        position.default_team_id = item.id
    for position in list(item.default_positions):
        if position.id not in set(payload.default_position_ids):
            position.default_team_id = None


def team_members(item: Team) -> list[UserSummary]:
    return [UserSummary(id=user.id, username=user.username, full_name=user.full_name, email=user.email, is_active=user.is_active, department_id=user.organization_profile.department_id if user.organization_profile else None) for user in sorted(item.users, key=lambda user: user.full_name.casefold())]


def replace_team_members(db: Session, item: Team, payload: TeamMembersUpdate) -> None:
    users = list(db.scalars(select(User).where(User.id.in_(payload.member_ids)))) if payload.member_ids else []
    if len(users) != len(set(payload.member_ids)):
        raise HTTPException(status_code=422, detail="One or more users do not exist.")
    invalid = [user.username for user in users if not user.organization_profile or user.organization_profile.department_id != item.department_id]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Team members must belong to the team's department: {', '.join(invalid[:5])}.")
    db.execute(delete(user_teams).where(user_teams.c.team_id == item.id))
    primary_ids = set(payload.primary_member_ids)
    if users:
        db.execute(insert(user_teams), [{"user_id": user.id, "team_id": item.id, "is_primary": user.id in primary_ids} for user in users])
    for profile in db.scalars(select(UserOrganizationProfile).where(UserOrganizationProfile.primary_team_id == item.id)):
        if profile.user_id not in primary_ids:
            profile.primary_team_id = None
    for user in users:
        if user.id in primary_ids:
            if not user.organization_profile:
                user.organization_profile = UserOrganizationProfile(department_id=item.department_id)
            user.organization_profile.primary_team_id = item.id


def deactivate_or_delete_role(db: Session, role: Role, *, delete_record: bool) -> str:
    protected = role.is_system or role.role_type == "system"
    if protected:
        raise HTTPException(status_code=409, detail="Protected system roles cannot be deleted or deactivated.")
    usage = len(role.users) + len(role.departments) + len(role.positions) + len(role.teams)
    if delete_record and usage:
        raise HTTPException(status_code=409, detail=f"This role is in use by {usage} assignments. Deactivate it instead.")
    role.is_active = False
    if delete_record:
        role.deleted_at = now()
        return "Role deleted."
    return "Role deactivated."


def deactivate_or_delete_position(item: Position, *, delete_record: bool) -> str:
    usage = len(item.user_profiles) + len(item.direct_reports)
    if delete_record and usage:
        raise HTTPException(status_code=409, detail=f"This position has {usage} active references. Deactivate it instead.")
    item.is_active = False
    if delete_record:
        item.deleted_at = now()
        return "Position deleted."
    return "Position deactivated; assigned users remain active."


def deactivate_or_delete_team(item: Team, *, delete_record: bool) -> str:
    active_members = sum(user.is_active for user in item.users)
    usage = active_members + len(item.children)
    if delete_record and usage:
        raise HTTPException(status_code=409, detail=f"This team has {usage} active member or child references. Deactivate it instead.")
    item.is_active = False
    if delete_record:
        item.deleted_at = now()
        return "Team deleted."
    return "Team deactivated; members remain active and should be reassigned."
