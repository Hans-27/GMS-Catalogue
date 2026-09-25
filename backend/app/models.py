import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    Uuid,
    func,
    text as sql_text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("assigned_by_id", Uuid, ForeignKey("users.id", ondelete="SET NULL")),
    Column("assigned_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

department_roles = Table(
    "department_roles",
    Base.metadata,
    Column("department_id", Integer, ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

position_roles = Table(
    "position_roles",
    Base.metadata,
    Column("position_id", Integer, ForeignKey("positions.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

team_roles = Table(
    "team_roles",
    Base.metadata,
    Column("team_id", Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
)

role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "permission_id",
        Integer,
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("effect", String(10), default="allow", server_default="allow", nullable=False),
    Column("access_scope", String(40), default="none", server_default="none", nullable=False),
)

position_permissions = Table(
    "position_permissions",
    Base.metadata,
    Column(
        "position_id",
        Integer,
        ForeignKey("positions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "permission_id",
        Integer,
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

team_permissions = Table(
    "team_permissions",
    Base.metadata,
    Column("team_id", Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "permission_id",
        Integer,
        ForeignKey("permissions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

user_teams = Table(
    "user_teams",
    Base.metadata,
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("team_id", Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    Column("is_primary", Boolean, default=False, server_default="0", nullable=False),
    Column("assigned_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

team_brands = Table(
    "team_brands",
    Base.metadata,
    Column("team_id", Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True),
    Column("brand_id", Integer, ForeignKey("brands.id", ondelete="CASCADE"), primary_key=True),
)

product_categories = Table(
    "product_categories",
    Base.metadata,
    Column(
        "product_id",
        Uuid,
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "category_id",
        Integer,
        ForeignKey("categories.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)

user_brand_access = Table(
    "user_brand_access",
    Base.metadata,
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("brand_id", Integer, ForeignKey("brands.id", ondelete="CASCADE"), primary_key=True),
    Column("can_view", Boolean, default=True, server_default="1", nullable=False),
    Column("can_edit", Boolean, default=False, server_default="0", nullable=False),
)

user_category_access = Table(
    "user_category_access",
    Base.metadata,
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("category_id", Integer, ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True),
    Column("can_view", Boolean, default=True, server_default="1", nullable=False),
    Column("can_edit", Boolean, default=False, server_default="0", nullable=False),
)

user_catalogue_access = Table(
    "user_catalogue_access",
    Base.metadata,
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("catalogue_id", Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), primary_key=True),
    Column("can_view", Boolean, default=True, server_default="1", nullable=False),
    Column("can_edit", Boolean, default=False, server_default="0", nullable=False),
    Column("can_export", Boolean, default=False, server_default="0", nullable=False),
)

user_price_list_access = Table(
    "user_price_list_access",
    Base.metadata,
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("price_list_id", Integer, ForeignKey("price_lists.id", ondelete="CASCADE"), primary_key=True),
)

user_product_access = Table(
    "user_product_access",
    Base.metadata,
    Column("user_id", Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("product_id", Uuid, ForeignKey("products.id", ondelete="CASCADE"), primary_key=True),
    Column("can_view", Boolean, default=True, server_default="1", nullable=False),
    Column("can_edit", Boolean, default=False, server_default="0", nullable=False),
)

role_price_list_access = Table(
    "role_price_list_access",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("price_list_id", Integer, ForeignKey("price_lists.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    permissions_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    failed_login_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    roles: Mapped[list["Role"]] = relationship(
        secondary=user_roles,
        back_populates="users",
        lazy="selectin",
        foreign_keys=[user_roles.c.user_id, user_roles.c.role_id],
    )
    organization_profile: Mapped["UserOrganizationProfile | None"] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
        uselist=False,
    )
    teams: Mapped[list["Team"]] = relationship(
        secondary=user_teams,
        back_populates="users",
        lazy="selectin",
    )
    permission_overrides: Mapped[list["UserPermissionOverride"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
        foreign_keys="UserPermissionOverride.user_id",
    )
    data_scope: Mapped["UserDataScope | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", lazy="selectin", uselist=False,
        foreign_keys="UserDataScope.user_id",
    )
    assigned_brands: Mapped[list["Brand"]] = relationship(
        secondary=user_brand_access, lazy="selectin"
    )
    assigned_categories: Mapped[list["Category"]] = relationship(
        secondary=user_category_access, lazy="selectin"
    )
    assigned_products: Mapped[list["Product"]] = relationship(
        secondary=user_product_access, lazy="selectin"
    )
    assigned_catalogues: Mapped[list["Catalogue"]] = relationship(
        secondary=user_catalogue_access, lazy="selectin"
    )
    assigned_price_lists: Mapped[list["PriceList"]] = relationship(
        secondary=user_price_list_access, lazy="selectin"
    )


Index("ix_users_username_lower", func.lower(User.username), unique=True)
Index("ix_users_email_lower", func.lower(User.email), unique=True)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    key: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False,
        default=lambda: f"role_{uuid.uuid4().hex[:20]}",
    )
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    system_key: Mapped[str | None] = mapped_column(String(50), unique=True)
    role_type: Mapped[str] = mapped_column(String(20), default="custom", server_default="custom", nullable=False)
    default_scope: Mapped[str] = mapped_column(String(40), default="none", server_default="none", nullable=False)
    department_restriction_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("departments.id", ondelete="SET NULL")
    )
    team_restriction_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("teams.id", ondelete="SET NULL")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    users: Mapped[list[User]] = relationship(
        secondary=user_roles,
        back_populates="roles",
        foreign_keys=[user_roles.c.user_id, user_roles.c.role_id],
    )
    permissions: Mapped[list["Permission"]] = relationship(
        secondary=role_permissions,
        back_populates="roles",
        lazy="selectin",
    )
    departments: Mapped[list["Department"]] = relationship(
        secondary=department_roles, back_populates="roles"
    )
    positions: Mapped[list["Position"]] = relationship(
        secondary=position_roles, back_populates="roles"
    )
    teams: Mapped[list["Team"]] = relationship(
        secondary=team_roles, back_populates="roles"
    )
    allowed_price_lists: Mapped[list["PriceList"]] = relationship(
        secondary=role_price_list_access, lazy="selectin"
    )


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL"),
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    parent: Mapped["Department | None"] = relationship(
        remote_side=[id],
        back_populates="children",
    )
    children: Mapped[list["Department"]] = relationship(back_populates="parent")
    positions: Mapped[list["Position"]] = relationship(back_populates="department")
    teams: Mapped[list["Team"]] = relationship(back_populates="department")
    user_profiles: Mapped[list["UserOrganizationProfile"]] = relationship(
        back_populates="department"
    )
    brand_access_rules: Mapped[list["DepartmentBrandAccess"]] = relationship(
        back_populates="department",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    roles: Mapped[list[Role]] = relationship(
        secondary=department_roles, back_populates="departments", lazy="selectin"
    )


class Position(Base):
    __tablename__ = "positions"
    __table_args__ = (
        UniqueConstraint("department_id", "name", name="uq_position_department_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_th: Mapped[str] = mapped_column(String(120), default="", server_default="", nullable=False)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    management_level: Mapped[str] = mapped_column(String(40), default="staff", server_default="staff", nullable=False)
    default_team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    reports_to_position_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("positions.id", ondelete="SET NULL"))
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    description: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    department: Mapped[Department] = relationship(back_populates="positions")
    user_profiles: Mapped[list["UserOrganizationProfile"]] = relationship(
        back_populates="position"
    )
    permissions: Mapped[list["Permission"]] = relationship(
        secondary=position_permissions,
        back_populates="positions",
        lazy="selectin",
    )
    roles: Mapped[list[Role]] = relationship(
        secondary=position_roles, back_populates="positions", lazy="selectin"
    )
    default_team: Mapped["Team | None"] = relationship(
        back_populates="default_positions", foreign_keys=[default_team_id]
    )
    reports_to: Mapped["Position | None"] = relationship(
        remote_side=[id], back_populates="direct_reports", foreign_keys=[reports_to_position_id]
    )
    direct_reports: Mapped[list["Position"]] = relationship(
        back_populates="reports_to", foreign_keys=[reports_to_position_id]
    )


class Brand(Base):
    __tablename__ = "brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    inactive_reason: Mapped[str] = mapped_column(
        String(500), default="", server_default="", nullable=False
    )

    teams: Mapped[list["Team"]] = relationship(
        secondary=team_brands,
        back_populates="brands",
    )
    department_access_rules: Mapped[list["DepartmentBrandAccess"]] = relationship(
        back_populates="brand",
        cascade="all, delete-orphan",
    )


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint("department_id", "name", name="uq_team_department_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    department_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="RESTRICT"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    name_th: Mapped[str] = mapped_column(String(120), default="", server_default="", nullable=False)
    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    team_leader_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    parent_team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    department: Mapped[Department] = relationship(back_populates="teams")
    brands: Mapped[list[Brand]] = relationship(
        secondary=team_brands,
        back_populates="teams",
        lazy="selectin",
    )
    users: Mapped[list[User]] = relationship(
        secondary=user_teams,
        back_populates="teams",
    )
    permissions: Mapped[list["Permission"]] = relationship(
        secondary=team_permissions,
        back_populates="teams",
        lazy="selectin",
    )
    roles: Mapped[list[Role]] = relationship(
        secondary=team_roles, back_populates="teams", lazy="selectin"
    )
    team_leader: Mapped["User | None"] = relationship(foreign_keys=[team_leader_user_id])
    parent: Mapped["Team | None"] = relationship(
        remote_side=[id], back_populates="children", foreign_keys=[parent_team_id]
    )
    children: Mapped[list["Team"]] = relationship(
        back_populates="parent", foreign_keys=[parent_team_id]
    )
    default_positions: Mapped[list[Position]] = relationship(
        back_populates="default_team", foreign_keys=[Position.default_team_id]
    )
    primary_user_profiles: Mapped[list["UserOrganizationProfile"]] = relationship(
        back_populates="primary_team", foreign_keys="UserOrganizationProfile.primary_team_id"
    )


class Permission(Base):
    __tablename__ = "permissions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    module: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False)
    action: Mapped[str] = mapped_column(String(50), default="view", nullable=False)
    is_high_risk: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    roles: Mapped[list[Role]] = relationship(
        secondary=role_permissions,
        back_populates="permissions",
    )
    positions: Mapped[list[Position]] = relationship(
        secondary=position_permissions,
        back_populates="permissions",
    )
    teams: Mapped[list[Team]] = relationship(
        secondary=team_permissions,
        back_populates="permissions",
    )
    user_overrides: Mapped[list["UserPermissionOverride"]] = relationship(
        back_populates="permission",
        cascade="all, delete-orphan",
    )


class UserPermissionOverride(Base):
    __tablename__ = "user_permission_overrides"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "permission_id",
            name="uq_user_permission_override",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    permission_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("permissions.id", ondelete="CASCADE"),
        nullable=False,
    )
    is_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    reason: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    granted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    access_scope: Mapped[str] = mapped_column(
        String(40), default="none", server_default="none", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(
        back_populates="permission_overrides", foreign_keys=[user_id]
    )
    permission: Mapped[Permission] = relationship(back_populates="user_overrides")


class UserDataScope(Base):
    """Explicit row-level access. All flags are restrictive by default."""

    __tablename__ = "user_data_scopes"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    all_access: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    own_department: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    own_records: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    published_only: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="data_scope", foreign_keys=[user_id])


class UserOrganizationProfile(Base):
    __tablename__ = "user_organization_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    department_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL"),
    )
    position_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("positions.id", ondelete="SET NULL"),
    )
    primary_team_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("teams.id", ondelete="SET NULL")
    )
    employee_code: Mapped[str | None] = mapped_column(String(50), unique=True)

    user: Mapped[User] = relationship(back_populates="organization_profile")
    department: Mapped[Department | None] = relationship(back_populates="user_profiles")
    position: Mapped[Position | None] = relationship(back_populates="user_profiles")
    primary_team: Mapped[Team | None] = relationship(
        back_populates="primary_user_profiles", foreign_keys=[primary_team_id]
    )


class DepartmentBrandAccess(Base):
    __tablename__ = "department_brand_access"

    department_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="CASCADE"),
        primary_key=True,
    )
    brand_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("brands.id", ondelete="CASCADE"),
        primary_key=True,
    )
    can_view: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    can_manage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    department: Mapped[Department] = relationship(back_populates="brand_access_rules")
    brand: Mapped[Brand] = relationship(back_populates="department_access_rules")


class AuditLog(Base):
    __tablename__ = "catalogue_audit_logs"
    __table_args__ = (
        Index("ix_audit_created_at", "created_at"),
        Index("ix_audit_action", "action"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    module: Mapped[str] = mapped_column(String(80), default="authentication", nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False)
    identifier: Mapped[str | None] = mapped_column(String(255))
    ip_address: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PermissionChangeLog(Base):
    __tablename__ = "permission_change_logs"
    __table_args__ = (
        Index("ix_permission_change_target_user", "target_user_id", "created_at"),
        Index("ix_permission_change_target_role", "target_role_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    target_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    target_role_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("roles.id", ondelete="SET NULL")
    )
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    old_values: Mapped[dict | None] = mapped_column(JSON)
    new_values: Mapped[dict | None] = mapped_column(JSON)
    reason: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64))
    request_id: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Product(Base):
    """Read-only product master data synchronized from the ERP."""

    __tablename__ = "products"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    sku: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    erp_name: Mapped[str] = mapped_column(String(255), nullable=False)
    erp_name_th: Mapped[str | None] = mapped_column(String(255))
    erp_pos_name: Mapped[str | None] = mapped_column(String(255))
    erp_description_en: Mapped[str | None] = mapped_column(Text)
    erp_description_th: Mapped[str | None] = mapped_column(Text)
    erp_how_to_use: Mapped[str | None] = mapped_column(Text)
    erp_remark: Mapped[str | None] = mapped_column(String(500))
    brand: Mapped[str | None] = mapped_column(String(120))
    barcode: Mapped[str | None] = mapped_column(String(80), unique=True)
    barcodes: Mapped[list[str] | None] = mapped_column(JSON)
    unit: Mapped[str] = mapped_column(String(30), default="piece", nullable=False)
    erp_category: Mapped[str | None] = mapped_column(String(120))
    price: Mapped[float | None] = mapped_column(Numeric(12, 2))
    stock_quantity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    size_width: Mapped[float | None] = mapped_column(Numeric(14, 3))
    size_length: Mapped[float | None] = mapped_column(Numeric(14, 3))
    size_height: Mapped[float | None] = mapped_column(Numeric(14, 3))
    gross_weight: Mapped[float | None] = mapped_column(Numeric(14, 3))
    net_weight: Mapped[float | None] = mapped_column(Numeric(14, 3))
    pack_size: Mapped[int | None] = mapped_column(Integer)
    warranty_description: Mapped[str | None] = mapped_column(String(80))
    warranty_days: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active", nullable=False)
    inactive_reason: Mapped[str | None] = mapped_column(String(50))
    inactive_note: Mapped[str] = mapped_column(String(500), default="", server_default="", nullable=False)
    inactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    inactivated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    reactivated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reactivated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    status_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    source_system: Mapped[str | None] = mapped_column(String(40))
    source_record_id: Mapped[str | None] = mapped_column(String(120))
    last_source_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stock_last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    price_last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source_sync_status: Mapped[str] = mapped_column(String(30), default="never", server_default="never", nullable=False)
    source_sync_error: Mapped[str] = mapped_column(String(500), default="", server_default="", nullable=False)
    source_record_exists: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    lifecycle_status_source: Mapped[str] = mapped_column(
        String(40), default="erp_active", server_default="erp_active", nullable=False
    )
    legacy_catalogue_present: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False
    )
    legacy_catalogue_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_discontinued: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    erp_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    catalogue_entry: Mapped["CatalogueEntry"] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
        uselist=False,
    )
    categories: Mapped[list["Category"]] = relationship(
        secondary=product_categories,
        back_populates="products",
        lazy="selectin",
    )
    images: Mapped[list["ProductImage"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ProductImage.sort_order, ProductImage.created_at",
    )
    videos: Mapped[list["ProductVideo"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ProductVideo.display_order, ProductVideo.created_at",
    )
    status_history: Mapped[list["ProductStatusHistory"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin",
        order_by="ProductStatusHistory.changed_at.desc()",
    )
    warehouse_stocks: Mapped[list["ProductWarehouseStock"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", lazy="selectin",
    )
    catalogue_links: Mapped[list["CatalogueProduct"]] = relationship(
        back_populates="product", lazy="selectin"
    )


Index("ix_products_erp_name", Product.erp_name)
Index("ix_products_brand", Product.brand)
Index("ix_products_source_system", Product.source_system)
Index("ix_products_status", Product.status)
Index("ix_products_source_sync_status", Product.source_sync_status)
Index("ix_products_lifecycle_status_source", Product.lifecycle_status_source)
Index("ix_products_legacy_catalogue_present", Product.legacy_catalogue_present)


class ProductStatusHistory(Base):
    __tablename__ = "product_status_history"
    __table_args__ = (Index("ix_product_status_history_product", "product_id", "changed_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    old_status: Mapped[str] = mapped_column(String(20), nullable=False)
    new_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    note: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    product: Mapped[Product] = relationship(back_populates="status_history")


class ProductWarehouseStock(Base):
    __tablename__ = "product_warehouse_stocks"
    __table_args__ = (
        UniqueConstraint("product_id", "warehouse_code", name="uq_product_warehouse_stock"),
        Index("ix_product_warehouse_stock_product", "product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    warehouse_code: Mapped[str] = mapped_column(String(80), nullable=False)
    on_hand: Mapped[float] = mapped_column(Numeric(16, 4), default=0, nullable=False)
    available: Mapped[float] = mapped_column(Numeric(16, 4), default=0, nullable=False)
    reserved: Mapped[float] = mapped_column(Numeric(16, 4), default=0, nullable=False)
    incoming: Mapped[float] = mapped_column(Numeric(16, 4), default=0, nullable=False)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    product: Mapped[Product] = relationship(back_populates="warehouse_stocks")


class CatalogueEntry(Base):
    """Catalogue-owned content and publishing state for an ERP product."""

    __tablename__ = "catalogue_entries"

    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("products.id", ondelete="CASCADE"),
        primary_key=True,
    )
    display_name: Mapped[str] = mapped_column(
        String(255),
        default="",
        server_default="",
        nullable=False,
    )
    short_description: Mapped[str] = mapped_column(
        String(320),
        default="",
        nullable=False,
    )
    long_description: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )
    seo_title: Mapped[str] = mapped_column(String(180), default="", nullable=False)
    seo_description: Mapped[str] = mapped_column(
        String(320),
        default="",
        nullable=False,
    )
    visibility: Mapped[str] = mapped_column(
        String(20),
        default="hidden",
        nullable=False,
    )
    workflow_status: Mapped[str] = mapped_column(
        String(30),
        default="draft",
        nullable=False,
    )
    is_featured: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    published_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    product: Mapped[Product] = relationship(back_populates="catalogue_entry")
    updated_by: Mapped[User | None] = relationship(foreign_keys=[updated_by_id])
    approved_by: Mapped[User | None] = relationship(foreign_keys=[approved_by_id])
    published_by: Mapped[User | None] = relationship(foreign_keys=[published_by_id])


Index("ix_catalogue_workflow_status", CatalogueEntry.workflow_status)
Index("ix_catalogue_visibility", CatalogueEntry.visibility)
Index("ix_catalogue_updated_at", CatalogueEntry.updated_at)


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    slug: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(
        String(320),
        default="",
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    inactive_reason: Mapped[str] = mapped_column(
        String(500), default="", server_default="", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    products: Mapped[list[Product]] = relationship(
        secondary=product_categories,
        back_populates="categories",
    )


class ProductImage(Base):
    __tablename__ = "product_images"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "sort_order",
            name="uq_product_image_sort_order",
        ),
        Index("ix_product_images_product", "product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    public_url: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    alt_text: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    product: Mapped[Product] = relationship(back_populates="images")
    uploaded_by: Mapped[User | None] = relationship(foreign_keys=[uploaded_by_id])


class ProductVideo(Base):
    """Private uploaded media or a normalized, approved external product video."""

    __tablename__ = "product_videos"
    __table_args__ = (
        Index("ix_product_videos_product", "product_id", "display_order"),
        Index("ix_product_videos_active", "is_active", "deleted_at"),
        Index(
            "uq_product_videos_active_featured",
            "product_id",
            unique=True,
            sqlite_where=sql_text("is_featured = 1 AND is_active = 1 AND deleted_at IS NULL"),
            postgresql_where=sql_text("is_featured IS TRUE AND is_active IS TRUE AND deleted_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False)
    title_en: Mapped[str] = mapped_column(String(255), default="", server_default="", nullable=False)
    title_th: Mapped[str] = mapped_column(String(255), default="", server_default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    alt_text: Mapped[str] = mapped_column(String(255), default="", server_default="", nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(500))
    playback_storage_key: Mapped[str | None] = mapped_column(String(500))
    external_url: Mapped[str | None] = mapped_column(String(1000))
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    external_video_id: Mapped[str | None] = mapped_column(String(160))
    thumbnail_storage_key: Mapped[str | None] = mapped_column(String(500))
    caption_storage_key: Mapped[str | None] = mapped_column(String(500))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(100))
    file_size: Mapped[int | None] = mapped_column(Integer)
    checksum: Mapped[str | None] = mapped_column(String(64))
    duration_seconds: Mapped[float | None] = mapped_column(Numeric(10, 3))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    show_in_catalogue: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    show_in_public_catalogue: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    show_controls: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    allow_download: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    autoplay: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    muted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    loop: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    processing_status: Mapped[str] = mapped_column(String(30), default="pending_upload", server_default="pending_upload", nullable=False)
    processing_error: Mapped[str] = mapped_column(String(500), default="", server_default="", nullable=False)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    product: Mapped[Product] = relationship(back_populates="videos")
    uploaded_by: Mapped[User | None] = relationship(foreign_keys=[uploaded_by_id])


# These scoped association tables reference catalogue and price-list tables.
# Importing their model module here keeps Base.metadata complete for isolated
# scripts/tests that import app.models directly.
from app import commerce_models as _commerce_models  # noqa: E402,F401
