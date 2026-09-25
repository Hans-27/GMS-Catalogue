import uuid
from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from sqlalchemy import delete, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.access import bump_permissions_version, is_superadmin, require_permission
from app.database import get_db
from app.models import AuditLog, Permission, PermissionChangeLog, Position, Role, Team, User, role_permissions
from app.organization_admin_schemas import (
    LifecycleMessage,
    PermissionGrantInput,
    PositionPage,
    PositionSummary,
    PositionWrite,
    RoleDuplicateInput,
    RolePage,
    RolePermissionMatrix,
    RolePermissionUpdate,
    RoleSummary,
    RoleWrite,
    TeamMembersUpdate,
    TeamPage,
    TeamSummary,
    TeamWrite,
    UserSummary,
)
from app.organization_service import (
    apply_position,
    apply_role,
    apply_team,
    deactivate_or_delete_position,
    deactivate_or_delete_role,
    deactivate_or_delete_team,
    get_position,
    get_role,
    get_team,
    list_positions,
    list_roles,
    list_teams,
    position_summary,
    position_users,
    replace_team_members,
    role_summary,
    role_users,
    team_members,
    team_summary,
)


router = APIRouter(tags=["Organization administration"])


def _audit(request: Request, db: Session, actor: User, action: str, module: str, identifier: str, old: dict | None = None, new: dict | None = None, reason: str = "") -> None:
    db.add(AuditLog(
        user_id=actor.id,
        action=action,
        module=module,
        status="success",
        identifier=identifier,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={
            "old_values": old,
            "new_values": new,
            "reason": reason,
            "request_id": request.headers.get("x-request-id"),
        },
    ))


def _commit(db: Session, message: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=message) from exc


def _apply_with_conflict(db: Session, message: str, operation: Callable[[], None]) -> None:
    try:
        operation()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=message) from exc


def _bump_users(db: Session) -> None:
    for user in db.scalars(select(User)):
        bump_permissions_version(user)


@router.get("/roles", response_model=RolePage)
def roles_index(
    q: str = Query(default="", max_length=120),
    active: bool | None = None,
    role_type: str | None = Query(default=None, pattern="^(system|custom)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=5, le=100),
    _: User = Depends(require_permission("roles.view")),
    db: Session = Depends(get_db),
) -> RolePage:
    return list_roles(db, q=q, active=active, role_type=role_type, page=page, page_size=page_size)


@router.post("/roles", response_model=RoleSummary, status_code=status.HTTP_201_CREATED)
def role_create(payload: RoleWrite, request: Request, actor: User = Depends(require_permission("roles.create")), db: Session = Depends(get_db)) -> RoleSummary:
    if payload.role_type == "system" and not is_superadmin(actor):
        raise HTTPException(status_code=403, detail="Only SuperAdmin may create protected system roles.")
    role = Role(name=payload.name, key=payload.code, description=payload.description, role_type=payload.role_type)
    db.add(role)
    _apply_with_conflict(db, "A role with that name or code already exists.", lambda: apply_role(db, role, payload, actor, creating=True))
    _bump_users(db)
    _audit(request, db, actor, "role_created", "roles", role.key, new=payload.model_dump(mode="json"))
    _commit(db, "A role with that name or code already exists.")
    return role_summary(get_role(db, role.id))


@router.get("/roles/{role_id}", response_model=RoleSummary)
def role_detail(role_id: int, _: User = Depends(require_permission("roles.view")), db: Session = Depends(get_db)) -> RoleSummary:
    return role_summary(get_role(db, role_id))


@router.patch("/roles/{role_id}", response_model=RoleSummary)
def role_update(role_id: int, payload: RoleWrite, request: Request, actor: User = Depends(require_permission("roles.edit")), db: Session = Depends(get_db)) -> RoleSummary:
    role = get_role(db, role_id)
    old = role_summary(role).model_dump(mode="json")
    if payload.role_type == "system" and not is_superadmin(actor):
        raise HTTPException(status_code=403, detail="Only SuperAdmin may manage protected system roles.")
    if role.is_system and role.system_key == "SUPERADMIN" and not payload.is_active:
        raise HTTPException(status_code=409, detail="SuperAdmin cannot be deactivated.")
    _apply_with_conflict(db, "A role with that name or code already exists.", lambda: apply_role(db, role, payload, actor))
    _bump_users(db)
    _audit(request, db, actor, "role_edited", "roles", role.key, old=old, new=payload.model_dump(mode="json"))
    _commit(db, "A role with that name or code already exists.")
    return role_summary(get_role(db, role.id))


@router.post("/roles/{role_id}/duplicate", response_model=RoleSummary, status_code=status.HTTP_201_CREATED)
def role_duplicate(role_id: int, payload: RoleDuplicateInput, request: Request, actor: User = Depends(require_permission("roles.duplicate")), db: Session = Depends(get_db)) -> RoleSummary:
    source = get_role(db, role_id)
    rows = db.execute(select(role_permissions.c.permission_id, role_permissions.c.effect, role_permissions.c.access_scope).where(role_permissions.c.role_id == source.id)).all()
    write = RoleWrite(
        name=payload.name,
        code=payload.code,
        description=f"Copy of {source.name}. {source.description}"[:255],
        is_active=True,
        role_type="custom",
        default_scope=source.default_scope,
        permission_grants=[PermissionGrantInput(permission_id=row.permission_id, effect=row.effect, access_scope=row.access_scope) for row in rows],
        price_list_ids=[item.id for item in source.allowed_price_lists],
        department_restriction_id=source.department_restriction_id,
        team_restriction_id=source.team_restriction_id,
    )
    role = Role(name=write.name, key=write.code, description=write.description, role_type="custom")
    db.add(role)
    _apply_with_conflict(db, "A role with that name or code already exists.", lambda: apply_role(db, role, write, actor, creating=True))
    _audit(request, db, actor, "role_duplicated", "roles", role.key, old={"source_role_id": source.id}, new=write.model_dump(mode="json"))
    _commit(db, "A role with that name or code already exists.")
    return role_summary(get_role(db, role.id))


@router.post("/roles/{role_id}/activate", response_model=RoleSummary)
def role_activate(role_id: int, request: Request, actor: User = Depends(require_permission("roles.activate")), db: Session = Depends(get_db)) -> RoleSummary:
    role = get_role(db, role_id)
    role.is_active = True
    role.updated_by_id = actor.id
    _bump_users(db)
    _audit(request, db, actor, "role_activated", "roles", role.key, new={"is_active": True})
    db.commit()
    return role_summary(get_role(db, role.id))


@router.post("/roles/{role_id}/deactivate", response_model=LifecycleMessage)
def role_deactivate(role_id: int, request: Request, actor: User = Depends(require_permission("roles.deactivate")), db: Session = Depends(get_db)) -> LifecycleMessage:
    role = get_role(db, role_id)
    message = deactivate_or_delete_role(db, role, delete_record=False)
    role.updated_by_id = actor.id
    _bump_users(db)
    _audit(request, db, actor, "role_deactivated", "roles", role.key, new={"is_active": False})
    db.commit()
    return LifecycleMessage(message=message)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def role_delete(role_id: int, request: Request, actor: User = Depends(require_permission("roles.delete")), db: Session = Depends(get_db)) -> Response:
    role = get_role(db, role_id)
    deactivate_or_delete_role(db, role, delete_record=True)
    role.updated_by_id = actor.id
    _audit(request, db, actor, "role_deleted", "roles", role.key)
    db.commit()
    return Response(status_code=204)


@router.get("/roles/{role_id}/permissions", response_model=RolePermissionMatrix)
def role_permissions_get(role_id: int, _: User = Depends(require_permission("roles.view")), db: Session = Depends(get_db)) -> RolePermissionMatrix:
    role = get_role(db, role_id)
    rows = db.execute(select(role_permissions.c.permission_id, role_permissions.c.effect, role_permissions.c.access_scope).where(role_permissions.c.role_id == role.id).order_by(role_permissions.c.permission_id)).all()
    return RolePermissionMatrix(role_id=role.id, is_protected=bool(role.is_system or role.role_type == "system"), grants=[PermissionGrantInput(permission_id=row.permission_id, effect=row.effect, access_scope=row.access_scope) for row in rows])


@router.put("/roles/{role_id}/permissions", response_model=RolePermissionMatrix)
def role_permissions_update(role_id: int, payload: RolePermissionUpdate, request: Request, actor: User = Depends(require_permission("roles.manage_permissions")), db: Session = Depends(get_db)) -> RolePermissionMatrix:
    role = get_role(db, role_id)
    if role.is_system or role.role_type == "system":
        raise HTTPException(status_code=409, detail="Protected system role permissions cannot be restricted.")
    ids = [grant.permission_id for grant in payload.grants]
    if set(db.scalars(select(Permission.id).where(Permission.id.in_(ids)))) != set(ids):
        raise HTTPException(status_code=422, detail="One or more permissions do not exist.")
    old = db.execute(select(role_permissions.c.permission_id, role_permissions.c.effect, role_permissions.c.access_scope).where(role_permissions.c.role_id == role.id)).mappings().all()
    db.execute(delete(role_permissions).where(role_permissions.c.role_id == role.id))
    if payload.grants:
        db.execute(insert(role_permissions), [{"role_id": role.id, **grant.model_dump()} for grant in payload.grants])
    _bump_users(db)
    db.add(PermissionChangeLog(changed_by_id=actor.id, target_role_id=role.id, action="role_permission_matrix_changed", old_values={"grants": [dict(row) for row in old]}, new_values={"grants": [grant.model_dump() for grant in payload.grants]}, reason=payload.reason, ip_address=request.client.host if request.client else None, request_id=request.headers.get("x-request-id")))
    _audit(request, db, actor, "role_permission_changed", "roles", role.key, old={"grants": [dict(row) for row in old]}, new={"grants": [grant.model_dump() for grant in payload.grants]}, reason=payload.reason)
    db.commit()
    return role_permissions_get(role.id, actor, db)


@router.get("/roles/{role_id}/users", response_model=list[UserSummary])
def role_users_get(role_id: int, _: User = Depends(require_permission("roles.view")), db: Session = Depends(get_db)) -> list[UserSummary]:
    return role_users(db, get_role(db, role_id))


@router.get("/positions", response_model=PositionPage)
def positions_index(q: str = Query(default="", max_length=120), department_id: int | None = None, team_id: int | None = None, active: bool | None = None, page: int = Query(default=1, ge=1), page_size: int = Query(default=25, ge=5, le=100), _: User = Depends(require_permission("positions.view")), db: Session = Depends(get_db)) -> PositionPage:
    return list_positions(db, q=q, department_id=department_id, team_id=team_id, active=active, page=page, page_size=page_size)


@router.post("/positions", response_model=PositionSummary, status_code=status.HTTP_201_CREATED)
def position_create(payload: PositionWrite, request: Request, actor: User = Depends(require_permission("positions.create")), db: Session = Depends(get_db)) -> PositionSummary:
    item = Position(department_id=payload.department_id, name=payload.name_en, code=payload.code)
    db.add(item)
    _apply_with_conflict(db, "A position with that code or name already exists.", lambda: apply_position(db, item, payload, actor, creating=True))
    _audit(request, db, actor, "position_created", "positions", item.code, new=payload.model_dump(mode="json"))
    _commit(db, "A position with that code or name already exists.")
    return position_summary(get_position(db, item.id))


@router.get("/positions/{position_id}", response_model=PositionSummary)
def position_detail(position_id: int, _: User = Depends(require_permission("positions.view")), db: Session = Depends(get_db)) -> PositionSummary:
    return position_summary(get_position(db, position_id))


@router.patch("/positions/{position_id}", response_model=PositionSummary)
def position_update(position_id: int, payload: PositionWrite, request: Request, actor: User = Depends(require_permission("positions.edit")), db: Session = Depends(get_db)) -> PositionSummary:
    item = get_position(db, position_id)
    old = position_summary(item).model_dump(mode="json")
    _apply_with_conflict(db, "A position with that code or name already exists.", lambda: apply_position(db, item, payload, actor))
    _bump_users(db)
    _audit(request, db, actor, "position_edited", "positions", item.code, old=old, new=payload.model_dump(mode="json"))
    _commit(db, "A position with that code or name already exists.")
    return position_summary(get_position(db, item.id))


def _copy_code(db: Session, model, base: str) -> str:
    for number in range(1, 1000):
        code = f"{base[:24]}_COPY{number}"
        if not db.scalar(select(model.id).where(model.code == code)):
            return code
    raise HTTPException(status_code=409, detail="Could not generate a unique duplicate code.")


@router.post("/positions/{position_id}/duplicate", response_model=PositionSummary, status_code=status.HTTP_201_CREATED)
def position_duplicate(position_id: int, request: Request, actor: User = Depends(require_permission("positions.duplicate")), db: Session = Depends(get_db)) -> PositionSummary:
    source = get_position(db, position_id)
    payload = PositionWrite(code=_copy_code(db, Position, source.code), name_en=f"{source.name} Copy", name_th=source.name_th, description=source.description, department_id=source.department_id, default_team_id=source.default_team_id, reports_to_position_id=source.reports_to_position_id, management_level=source.management_level, default_role_ids=[role.id for role in source.roles], is_active=True, display_order=source.display_order)
    return position_create(payload, request, actor, db)


@router.post("/positions/{position_id}/activate", response_model=PositionSummary)
def position_activate(position_id: int, request: Request, actor: User = Depends(require_permission("positions.activate")), db: Session = Depends(get_db)) -> PositionSummary:
    item = get_position(db, position_id); item.is_active = True; item.updated_by_id = actor.id
    _audit(request, db, actor, "position_activated", "positions", item.code, new={"is_active": True}); db.commit()
    return position_summary(get_position(db, item.id))


@router.post("/positions/{position_id}/deactivate", response_model=LifecycleMessage)
def position_deactivate(position_id: int, request: Request, actor: User = Depends(require_permission("positions.deactivate")), db: Session = Depends(get_db)) -> LifecycleMessage:
    item = get_position(db, position_id); message = deactivate_or_delete_position(item, delete_record=False); item.updated_by_id = actor.id
    _bump_users(db); _audit(request, db, actor, "position_deactivated", "positions", item.code, new={"is_active": False}); db.commit()
    return LifecycleMessage(message=message)


@router.delete("/positions/{position_id}", status_code=status.HTTP_204_NO_CONTENT)
def position_delete(position_id: int, request: Request, actor: User = Depends(require_permission("positions.delete")), db: Session = Depends(get_db)) -> Response:
    item = get_position(db, position_id); deactivate_or_delete_position(item, delete_record=True); item.updated_by_id = actor.id
    _audit(request, db, actor, "position_deleted", "positions", item.code); db.commit(); return Response(status_code=204)


@router.get("/positions/{position_id}/users", response_model=list[UserSummary])
def position_users_get(position_id: int, _: User = Depends(require_permission("positions.view")), db: Session = Depends(get_db)) -> list[UserSummary]:
    return position_users(get_position(db, position_id))


@router.get("/teams", response_model=TeamPage)
def teams_index(q: str = Query(default="", max_length=120), department_id: int | None = None, leader_id: uuid.UUID | None = None, active: bool | None = None, page: int = Query(default=1, ge=1), page_size: int = Query(default=25, ge=5, le=100), _: User = Depends(require_permission("teams.view")), db: Session = Depends(get_db)) -> TeamPage:
    return list_teams(db, q=q, department_id=department_id, leader_id=leader_id, active=active, page=page, page_size=page_size)


@router.post("/teams", response_model=TeamSummary, status_code=status.HTTP_201_CREATED)
def team_create(payload: TeamWrite, request: Request, actor: User = Depends(require_permission("teams.create")), db: Session = Depends(get_db)) -> TeamSummary:
    if payload.allow_cross_department_leader and not is_superadmin(actor):
        raise HTTPException(status_code=403, detail="Only SuperAdmin may confirm a cross-department team leader.")
    item = Team(department_id=payload.department_id, name=payload.name_en, code=payload.code)
    db.add(item); _apply_with_conflict(db, "A team with that code or name already exists.", lambda: apply_team(db, item, payload, actor, creating=True))
    _audit(request, db, actor, "team_created", "teams", item.code, new=payload.model_dump(mode="json")); _commit(db, "A team with that code or name already exists.")
    return team_summary(get_team(db, item.id))


@router.get("/teams/{team_id}", response_model=TeamSummary)
def team_detail(team_id: int, _: User = Depends(require_permission("teams.view")), db: Session = Depends(get_db)) -> TeamSummary:
    return team_summary(get_team(db, team_id))


@router.patch("/teams/{team_id}", response_model=TeamSummary)
def team_update(team_id: int, payload: TeamWrite, request: Request, actor: User = Depends(require_permission("teams.edit")), db: Session = Depends(get_db)) -> TeamSummary:
    if payload.allow_cross_department_leader and not is_superadmin(actor):
        raise HTTPException(status_code=403, detail="Only SuperAdmin may confirm a cross-department team leader.")
    item = get_team(db, team_id); old = team_summary(item).model_dump(mode="json"); _apply_with_conflict(db, "A team with that code or name already exists.", lambda: apply_team(db, item, payload, actor))
    _bump_users(db); _audit(request, db, actor, "team_edited", "teams", item.code, old=old, new=payload.model_dump(mode="json")); _commit(db, "A team with that code or name already exists.")
    return team_summary(get_team(db, item.id))


@router.post("/teams/{team_id}/duplicate", response_model=TeamSummary, status_code=status.HTTP_201_CREATED)
def team_duplicate(team_id: int, request: Request, actor: User = Depends(require_permission("teams.duplicate")), db: Session = Depends(get_db)) -> TeamSummary:
    source = get_team(db, team_id)
    payload = TeamWrite(code=_copy_code(db, Team, source.code), name_en=f"{source.name} Copy", name_th=source.name_th, description=source.description, department_id=source.department_id, parent_team_id=source.parent_team_id, default_position_ids=[], default_role_ids=[role.id for role in source.roles], brand_ids=[brand.id for brand in source.brands], is_active=True, display_order=source.display_order)
    return team_create(payload, request, actor, db)


@router.post("/teams/{team_id}/activate", response_model=TeamSummary)
def team_activate(team_id: int, request: Request, actor: User = Depends(require_permission("teams.activate")), db: Session = Depends(get_db)) -> TeamSummary:
    item = get_team(db, team_id); item.is_active = True; item.updated_by_id = actor.id
    _audit(request, db, actor, "team_activated", "teams", item.code, new={"is_active": True}); db.commit(); return team_summary(get_team(db, item.id))


@router.post("/teams/{team_id}/deactivate", response_model=LifecycleMessage)
def team_deactivate(team_id: int, request: Request, actor: User = Depends(require_permission("teams.deactivate")), db: Session = Depends(get_db)) -> LifecycleMessage:
    item = get_team(db, team_id); message = deactivate_or_delete_team(item, delete_record=False); item.updated_by_id = actor.id
    _bump_users(db); _audit(request, db, actor, "team_deactivated", "teams", item.code, new={"is_active": False}); db.commit(); return LifecycleMessage(message=message)


@router.delete("/teams/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def team_delete(team_id: int, request: Request, actor: User = Depends(require_permission("teams.delete")), db: Session = Depends(get_db)) -> Response:
    item = get_team(db, team_id); deactivate_or_delete_team(item, delete_record=True); item.updated_by_id = actor.id
    _audit(request, db, actor, "team_deleted", "teams", item.code); db.commit(); return Response(status_code=204)


@router.get("/teams/{team_id}/members", response_model=list[UserSummary])
def team_members_get(team_id: int, _: User = Depends(require_permission("teams.view")), db: Session = Depends(get_db)) -> list[UserSummary]:
    return team_members(get_team(db, team_id))


@router.put("/teams/{team_id}/members", response_model=list[UserSummary])
def team_members_update(team_id: int, payload: TeamMembersUpdate, request: Request, actor: User = Depends(require_permission("teams.assign_members")), db: Session = Depends(get_db)) -> list[UserSummary]:
    item = get_team(db, team_id); old_ids = [str(user.id) for user in item.users]; replace_team_members(db, item, payload); _bump_users(db)
    _audit(request, db, actor, "team_members_changed", "teams", item.code, old={"member_ids": old_ids}, new=payload.model_dump(mode="json")); db.commit()
    return team_members(get_team(db, item.id))
