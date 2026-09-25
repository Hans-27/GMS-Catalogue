from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.access import (
    bump_permissions_version,
    effective_permission_names,
    has_permission,
    is_superadmin,
    require_permission,
    require_any_permission,
)
from app.auth import get_current_user
from app.database import get_db
from app.models import (
    AuditLog,
    Brand,
    Department,
    DepartmentBrandAccess,
    Permission,
    Position,
    Role,
    Team,
    User,
    UserOrganizationProfile,
)
from app.organization_schemas import (
    BrandCreate,
    BrandResponse,
    BrandStatusUpdate,
    CatalogueAccessResponse,
    CatalogueAccessUpdate,
    DepartmentCreate,
    DepartmentResponse,
    OrganizationSummary,
    PermissionCreate,
    PermissionResponse,
    PositionCreate,
    PositionResponse,
    RolePermissionUpdate,
    TeamCreate,
    TeamResponse,
)
router = APIRouter(prefix="/organization", tags=["Organization and access"])


def _role_names(user: User) -> set[str]:
    return {role.name for role in user.roles}


def _permission_names(user: User) -> set[str]:
    return effective_permission_names(user)


def require_organization_admin(
    user: User = Depends(get_current_user),
) -> User:
    if not (
        is_superadmin(user)
        or has_permission(user, "departments.manage")
        or has_permission(user, "positions.manage")
        or has_permission(user, "positions.view")
        or has_permission(user, "teams.view")
        or has_permission(user, "teams.create")
        or has_permission(user, "teams.edit")
        or has_permission(user, "roles.view")
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization management permission is required.",
        )
    return user


def _bump_all_users(db: Session) -> None:
    for user in db.scalars(select(User)):
        bump_permissions_version(user)


def _audit(
    db: Session,
    request: Request,
    actor: User,
    action: str,
    identifier: str,
    details: dict | None = None,
) -> None:
    db.add(
        AuditLog(
            user_id=actor.id,
            action=action,
            module="organization",
            status="success",
            identifier=identifier,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            details=details,
        )
    )


def _commit(db: Session, conflict_message: str) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=conflict_message,
        ) from None


def _get(db: Session, model: type, item_id: int, label: str):
    item = db.get(model, item_id)
    if not item:
        raise HTTPException(status_code=404, detail=f"{label} not found.")
    return item


def _department_response(item: Department) -> DepartmentResponse:
    return DepartmentResponse(
        id=item.id,
        name=item.name,
        code=item.code,
        description=item.description,
        parent_id=item.parent_id,
        is_active=item.is_active,
        position_count=len(item.positions),
        team_count=len(item.teams),
        user_count=len(item.user_profiles),
    )


def _position_response(item: Position) -> PositionResponse:
    return PositionResponse(
        id=item.id,
        name=item.name,
        code=item.code,
        description=item.description,
        is_active=item.is_active,
        department_id=item.department_id,
        department_name=item.department.name,
        user_count=len(item.user_profiles),
        permission_ids=sorted(permission.id for permission in item.permissions),
    )


def _brand_response(item: Brand) -> BrandResponse:
    return BrandResponse(
        id=item.id,
        name=item.name,
        code=item.code,
        description=item.description,
        is_active=item.is_active,
        inactive_reason=item.inactive_reason,
        team_count=len(item.teams),
    )


def _team_response(item: Team) -> TeamResponse:
    return TeamResponse(
        id=item.id,
        name=item.name,
        code=item.code,
        description=item.description,
        is_active=item.is_active,
        department_id=item.department_id,
        department_name=item.department.name,
        brand_ids=sorted(brand.id for brand in item.brands),
        brand_names=sorted(brand.name for brand in item.brands),
        user_count=len(item.users),
        permission_ids=sorted(permission.id for permission in item.permissions),
    )


def _permission_response(item: Permission) -> PermissionResponse:
    return PermissionResponse(
        id=item.id,
        code=item.code,
        module=item.module,
        description=item.description,
        role_names=sorted(role.name for role in item.roles),
    )


def _catalogue_access_response(
    item: DepartmentBrandAccess,
) -> CatalogueAccessResponse:
    return CatalogueAccessResponse(
        department_id=item.department_id,
        department_name=item.department.name,
        brand_id=item.brand_id,
        brand_name=item.brand.name,
        can_view=item.can_view,
        can_manage=item.can_manage,
    )


@router.get("/summary", response_model=OrganizationSummary)
def organization_summary(
    _: User = Depends(require_organization_admin),
    db: Session = Depends(get_db),
) -> OrganizationSummary:
    def count(model: type) -> int:
        return db.scalar(select(func.count()).select_from(model)) or 0

    return OrganizationSummary(
        departments=count(Department),
        positions=count(Position),
        teams=count(Team),
        brands=count(Brand),
        permissions=count(Permission),
        assigned_users=count(UserOrganizationProfile),
    )


@router.get("/departments", response_model=list[DepartmentResponse])
def list_departments(
    _: User = Depends(require_organization_admin),
    db: Session = Depends(get_db),
) -> list[DepartmentResponse]:
    items = db.scalars(
        select(Department)
        .options(
            selectinload(Department.positions),
            selectinload(Department.teams),
            selectinload(Department.user_profiles),
        )
        .order_by(Department.name)
    ).all()
    return [_department_response(item) for item in items]


@router.post(
    "/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_department(
    payload: DepartmentCreate,
    request: Request,
    actor: User = Depends(require_permission("departments.manage")),
    db: Session = Depends(get_db),
) -> DepartmentResponse:
    if payload.parent_id:
        _get(db, Department, payload.parent_id, "Parent department")
    item = Department(**payload.model_dump())
    db.add(item)
    _audit(db, request, actor, "department_created", item.code)
    _commit(db, "A department with that name or code already exists.")
    return _department_response(item)


@router.put("/departments/{item_id}", response_model=DepartmentResponse)
def update_department(
    item_id: int,
    payload: DepartmentCreate,
    request: Request,
    actor: User = Depends(require_permission("departments.manage")),
    db: Session = Depends(get_db),
) -> DepartmentResponse:
    item = _get(db, Department, item_id, "Department")
    if payload.parent_id == item_id:
        raise HTTPException(status_code=422, detail="A department cannot be its own parent.")
    if payload.parent_id:
        parent = _get(db, Department, payload.parent_id, "Parent department")
        visited = {item_id}
        while parent:
            if parent.id in visited:
                raise HTTPException(
                    status_code=422,
                    detail="That parent would create a department hierarchy cycle.",
                )
            visited.add(parent.id)
            parent = parent.parent
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    _audit(db, request, actor, "department_updated", item.code)
    _commit(db, "A department with that name or code already exists.")
    return _department_response(item)


@router.get("/positions", response_model=list[PositionResponse])
def list_positions(
    _: User = Depends(require_organization_admin),
    db: Session = Depends(get_db),
) -> list[PositionResponse]:
    items = db.scalars(
        select(Position)
        .options(
            selectinload(Position.department),
            selectinload(Position.user_profiles),
        )
        .order_by(Position.name)
    ).all()
    return [_position_response(item) for item in items]


@router.post(
    "/positions",
    response_model=PositionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_position(
    payload: PositionCreate,
    request: Request,
    actor: User = Depends(require_any_permission("positions.create", "positions.manage")),
    db: Session = Depends(get_db),
) -> PositionResponse:
    _get(db, Department, payload.department_id, "Department")
    item = Position(**payload.model_dump())
    db.add(item)
    _audit(db, request, actor, "position_created", item.code)
    _commit(db, "A position with that code already exists in this department.")
    return _position_response(item)


@router.put("/positions/{item_id}", response_model=PositionResponse)
def update_position(
    item_id: int,
    payload: PositionCreate,
    request: Request,
    actor: User = Depends(require_any_permission("positions.edit", "positions.manage")),
    db: Session = Depends(get_db),
) -> PositionResponse:
    item = _get(db, Position, item_id, "Position")
    _get(db, Department, payload.department_id, "Department")
    if item.department_id != payload.department_id and item.user_profiles:
        raise HTTPException(
            status_code=409,
            detail="Move assigned users before changing this position's department.",
        )
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    _audit(db, request, actor, "position_updated", item.code)
    _commit(db, "A position with that code already exists in this department.")
    return _position_response(item)


@router.get("/brands", response_model=list[BrandResponse])
def list_brands(
    _: User = Depends(require_permission("brands.view")),
    db: Session = Depends(get_db),
) -> list[BrandResponse]:
    items = db.scalars(
        select(Brand).options(selectinload(Brand.teams)).order_by(Brand.name)
    ).all()
    return [_brand_response(item) for item in items]


@router.post(
    "/brands",
    response_model=BrandResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_brand(
    payload: BrandCreate,
    request: Request,
    actor: User = Depends(require_permission("brands.create")),
    db: Session = Depends(get_db),
) -> BrandResponse:
    item = Brand(**payload.model_dump())
    db.add(item)
    _audit(db, request, actor, "brand_created", item.code)
    _commit(db, "A brand with that name or code already exists.")
    return _brand_response(item)


@router.put("/brands/{item_id}", response_model=BrandResponse)
def update_brand(
    item_id: int,
    payload: BrandCreate,
    request: Request,
    actor: User = Depends(require_permission("brands.edit")),
    db: Session = Depends(get_db),
) -> BrandResponse:
    item = _get(db, Brand, item_id, "Brand")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    _audit(db, request, actor, "brand_updated", item.code)
    _commit(db, "A brand with that name or code already exists.")
    return _brand_response(item)


@router.patch("/brands/{item_id}/status", response_model=BrandResponse)
def update_brand_status(
    item_id: int,
    payload: BrandStatusUpdate,
    request: Request,
    actor: User = Depends(require_permission("brands.edit")),
    db: Session = Depends(get_db),
) -> BrandResponse:
    item = _get(db, Brand, item_id, "Brand")
    item.is_active = payload.is_active
    item.inactive_reason = "" if payload.is_active else payload.inactive_reason
    _audit(
        db,
        request,
        actor,
        "brand_status_updated",
        item.code,
        {
            "is_active": item.is_active,
            "inactive_reason": item.inactive_reason,
        },
    )
    _commit(db, "Could not update the brand status.")
    return _brand_response(item)


def _resolve_brands(db: Session, brand_ids: list[int]) -> list[Brand]:
    if not brand_ids:
        return []
    brands = list(db.scalars(select(Brand).where(Brand.id.in_(brand_ids))))
    if len(brands) != len(brand_ids):
        raise HTTPException(status_code=422, detail="One or more brands do not exist.")
    return brands


@router.get("/teams", response_model=list[TeamResponse])
def list_teams(
    _: User = Depends(require_organization_admin),
    db: Session = Depends(get_db),
) -> list[TeamResponse]:
    items = db.scalars(
        select(Team)
        .options(
            selectinload(Team.department),
            selectinload(Team.brands),
            selectinload(Team.users),
        )
        .order_by(Team.name)
    ).all()
    return [_team_response(item) for item in items]


@router.post(
    "/teams",
    response_model=TeamResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_team(
    payload: TeamCreate,
    request: Request,
    actor: User = Depends(require_permission("teams.create")),
    db: Session = Depends(get_db),
) -> TeamResponse:
    _get(db, Department, payload.department_id, "Department")
    data = payload.model_dump(exclude={"brand_ids"})
    item = Team(**data, brands=_resolve_brands(db, payload.brand_ids))
    db.add(item)
    _audit(
        db,
        request,
        actor,
        "team_created",
        item.code,
        {"brand_ids": payload.brand_ids},
    )
    _commit(db, "A team with that code already exists in this department.")
    return _team_response(item)


@router.put("/teams/{item_id}", response_model=TeamResponse)
def update_team(
    item_id: int,
    payload: TeamCreate,
    request: Request,
    actor: User = Depends(require_permission("teams.edit")),
    db: Session = Depends(get_db),
) -> TeamResponse:
    item = _get(db, Team, item_id, "Team")
    _get(db, Department, payload.department_id, "Department")
    for key, value in payload.model_dump(exclude={"brand_ids"}).items():
        setattr(item, key, value)
    item.brands = _resolve_brands(db, payload.brand_ids)
    _audit(
        db,
        request,
        actor,
        "team_updated",
        item.code,
        {"brand_ids": payload.brand_ids},
    )
    _commit(db, "A team with that code already exists in this department.")
    return _team_response(item)


@router.get("/permissions", response_model=list[PermissionResponse])
def list_permissions(
    _: User = Depends(require_organization_admin),
    db: Session = Depends(get_db),
) -> list[PermissionResponse]:
    items = db.scalars(
        select(Permission)
        .options(selectinload(Permission.roles))
        .order_by(Permission.module, Permission.code)
    ).all()
    return [_permission_response(item) for item in items]


@router.post(
    "/permissions",
    response_model=PermissionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_permission(
    payload: PermissionCreate,
    request: Request,
    actor: User = Depends(require_permission("permissions.manage")),
    db: Session = Depends(get_db),
) -> PermissionResponse:
    item = Permission(**payload.model_dump())
    db.add(item)
    _audit(db, request, actor, "permission_created", item.code)
    _commit(db, "A permission with that code already exists.")
    return _permission_response(item)


@router.put("/permissions/{item_id}", response_model=PermissionResponse)
def update_permission(
    item_id: int,
    payload: PermissionCreate,
    request: Request,
    actor: User = Depends(require_permission("permissions.manage")),
    db: Session = Depends(get_db),
) -> PermissionResponse:
    item = _get(db, Permission, item_id, "Permission")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    _audit(db, request, actor, "permission_updated", item.code)
    _commit(db, "A permission with that code already exists.")
    return _permission_response(item)


@router.put(
    "/roles/{role_id}/permissions",
    response_model=list[PermissionResponse],
)
def update_role_permissions(
    role_id: int,
    payload: RolePermissionUpdate,
    request: Request,
    actor: User = Depends(require_permission("roles.manage_permissions")),
    db: Session = Depends(get_db),
) -> list[PermissionResponse]:
    role = _get(db, Role, role_id, "Role")
    if role.is_system:
        raise HTTPException(status_code=409, detail="The protected SuperAdmin role cannot be edited.")
    permissions = (
        list(
            db.scalars(
                select(Permission).where(Permission.id.in_(payload.permission_ids))
            )
        )
        if payload.permission_ids
        else []
    )
    if len(permissions) != len(payload.permission_ids):
        raise HTTPException(
            status_code=422,
            detail="One or more permissions do not exist.",
        )
    role.permissions = permissions
    _bump_all_users(db)
    _audit(
        db,
        request,
        actor,
        "role_permissions_updated",
        role.name,
        {"permission_ids": payload.permission_ids},
    )
    db.commit()
    items = db.scalars(
        select(Permission)
        .options(selectinload(Permission.roles))
        .where(Permission.id.in_(payload.permission_ids))
        .order_by(Permission.module, Permission.code)
    ).all()
    return [_permission_response(item) for item in items]


def _resolve_permissions(
    db: Session,
    permission_ids: list[int],
) -> list[Permission]:
    permissions = (
        list(
            db.scalars(
                select(Permission).where(Permission.id.in_(permission_ids))
            )
        )
        if permission_ids
        else []
    )
    if len(permissions) != len(permission_ids):
        raise HTTPException(
            status_code=422,
            detail="One or more permissions do not exist.",
        )
    return permissions


@router.put(
    "/positions/{position_id}/permissions",
    response_model=PositionResponse,
)
def update_position_permissions(
    position_id: int,
    payload: RolePermissionUpdate,
    request: Request,
    actor: User = Depends(require_permission("positions.assign")),
    db: Session = Depends(get_db),
) -> PositionResponse:
    position = _get(db, Position, position_id, "Position")
    position.permissions = _resolve_permissions(db, payload.permission_ids)
    _bump_all_users(db)
    _audit(
        db,
        request,
        actor,
        "position_permissions_updated",
        position.code,
        {"permission_ids": payload.permission_ids},
    )
    db.commit()
    return _position_response(position)


@router.put(
    "/teams/{team_id}/permissions",
    response_model=TeamResponse,
)
def update_team_permissions(
    team_id: int,
    payload: RolePermissionUpdate,
    request: Request,
    actor: User = Depends(require_permission("teams.assign_roles")),
    db: Session = Depends(get_db),
) -> TeamResponse:
    team = _get(db, Team, team_id, "Team")
    team.permissions = _resolve_permissions(db, payload.permission_ids)
    _bump_all_users(db)
    _audit(
        db,
        request,
        actor,
        "team_permissions_updated",
        team.code,
        {"permission_ids": payload.permission_ids},
    )
    db.commit()
    return _team_response(team)


@router.get(
    "/catalogue-access",
    response_model=list[CatalogueAccessResponse],
)
def list_catalogue_access(
    _: User = Depends(require_permission("departments.manage")),
    db: Session = Depends(get_db),
) -> list[CatalogueAccessResponse]:
    items = db.scalars(
        select(DepartmentBrandAccess)
        .options(
            selectinload(DepartmentBrandAccess.department),
            selectinload(DepartmentBrandAccess.brand),
        )
        .order_by(
            DepartmentBrandAccess.department_id,
            DepartmentBrandAccess.brand_id,
        )
    ).all()
    return [_catalogue_access_response(item) for item in items]


@router.put(
    "/catalogue-access/{department_id}/{brand_id}",
    response_model=CatalogueAccessResponse,
)
def update_catalogue_access(
    department_id: int,
    brand_id: int,
    payload: CatalogueAccessUpdate,
    request: Request,
    actor: User = Depends(require_permission("departments.manage")),
    db: Session = Depends(get_db),
) -> CatalogueAccessResponse:
    department = _get(db, Department, department_id, "Department")
    brand = _get(db, Brand, brand_id, "Brand")
    item = db.get(
        DepartmentBrandAccess,
        {"department_id": department_id, "brand_id": brand_id},
    )
    if not item:
        item = DepartmentBrandAccess(
            department=department,
            brand=brand,
        )
        db.add(item)
    item.can_view = payload.can_view or payload.can_manage
    item.can_manage = payload.can_manage
    _bump_all_users(db)
    _audit(
        db,
        request,
        actor,
        "catalogue_access_updated",
        f"{department.code}:{brand.code}",
        {
            "department_id": department_id,
            "brand_id": brand_id,
            "can_view": item.can_view,
            "can_manage": item.can_manage,
        },
    )
    db.commit()
    return _catalogue_access_response(item)
