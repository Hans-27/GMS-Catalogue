import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


ScopeType = Literal[
    "all", "department", "own", "assigned_brands", "assigned_categories",
    "assigned_catalogues", "assigned_products", "none",
]


class PermissionGrantInput(BaseModel):
    permission_id: int = Field(gt=0)
    effect: Literal["allow", "deny"] = "allow"
    access_scope: ScopeType = "all"


class RoleWrite(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    code: str = Field(min_length=2, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")
    description: str = Field(default="", max_length=255)
    is_active: bool = True
    role_type: Literal["system", "custom"] = "custom"
    default_scope: ScopeType = "none"
    permission_grants: list[PermissionGrantInput] = Field(default_factory=list)
    price_list_ids: list[int] = Field(default_factory=list)
    department_restriction_id: int | None = None
    team_restriction_id: int | None = None

    @field_validator("name", "code", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.casefold()

    @model_validator(mode="after")
    def unique_permissions(self):
        ids = [item.permission_id for item in self.permission_grants]
        if len(ids) != len(set(ids)):
            raise ValueError("Each permission may be assigned only once.")
        return self


class RolePatch(RoleWrite):
    pass


class RoleSummary(BaseModel):
    id: int
    name: str
    code: str
    description: str
    role_type: str
    is_system_role: bool
    is_active: bool
    default_scope: str
    department_restriction_id: int | None
    team_restriction_id: int | None
    user_count: int
    permission_count: int
    department_count: int
    position_count: int
    team_count: int
    permission_ids: list[int]
    price_list_ids: list[int]
    created_at: datetime
    updated_at: datetime


class RolePage(BaseModel):
    items: list[RoleSummary]
    total: int
    page: int
    page_size: int
    pages: int


class RoleDuplicateInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    code: str = Field(min_length=2, max_length=50, pattern=r"^[a-z][a-z0-9_]*$")

    @field_validator("name", "code")
    @classmethod
    def normalize(cls, value: str) -> str:
        return value.strip()


class RolePermissionMatrix(BaseModel):
    role_id: int
    is_protected: bool
    grants: list[PermissionGrantInput]


class RolePermissionUpdate(BaseModel):
    grants: list[PermissionGrantInput]
    reason: str = Field(min_length=3, max_length=500)

    @model_validator(mode="after")
    def unique_permissions(self):
        ids = [item.permission_id for item in self.grants]
        if len(ids) != len(set(ids)):
            raise ValueError("Each permission may be assigned only once.")
        return self


class UserSummary(BaseModel):
    id: uuid.UUID
    username: str
    full_name: str
    email: str
    is_active: bool
    department_id: int | None = None


MANAGEMENT_LEVELS = {
    "staff", "senior_staff", "supervisor", "team_leader", "manager",
    "department_head", "executive",
}


class PositionWrite(BaseModel):
    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    name_en: str = Field(min_length=2, max_length=120)
    name_th: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=320)
    department_id: int
    default_team_id: int | None = None
    reports_to_position_id: int | None = None
    management_level: str = "staff"
    default_role_ids: list[int] = Field(default_factory=list)
    is_active: bool = True
    display_order: int = Field(default=0, ge=0, le=100000)

    @field_validator("code", "name_en", "name_th", "description", "management_level")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.upper()

    @field_validator("management_level")
    @classmethod
    def valid_level(cls, value: str) -> str:
        normalized = value.casefold().replace(" ", "_")
        if normalized not in MANAGEMENT_LEVELS:
            raise ValueError("Select a valid management level.")
        return normalized

    @field_validator("default_role_ids")
    @classmethod
    def unique_roles(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class PositionSummary(BaseModel):
    id: int
    code: str
    name_en: str
    name_th: str
    description: str
    department_id: int
    department_name: str
    default_team_id: int | None
    default_team_name: str | None
    reports_to_position_id: int | None
    reports_to_position_name: str | None
    management_level: str
    display_order: int
    is_active: bool
    user_count: int
    child_position_count: int
    default_role_ids: list[int]
    created_at: datetime
    updated_at: datetime


class PositionPage(BaseModel):
    items: list[PositionSummary]
    total: int
    page: int
    page_size: int
    pages: int


class TeamWrite(BaseModel):
    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    name_en: str = Field(min_length=2, max_length=120)
    name_th: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=320)
    department_id: int
    team_leader_user_id: uuid.UUID | None = None
    parent_team_id: int | None = None
    default_position_ids: list[int] = Field(default_factory=list)
    default_role_ids: list[int] = Field(default_factory=list)
    brand_ids: list[int] = Field(default_factory=list)
    is_active: bool = True
    display_order: int = Field(default=0, ge=0, le=100000)
    allow_cross_department_leader: bool = False

    @field_validator("code", "name_en", "name_th", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.upper()

    @field_validator("default_position_ids", "default_role_ids", "brand_ids")
    @classmethod
    def unique_ids(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class TeamSummary(BaseModel):
    id: int
    code: str
    name_en: str
    name_th: str
    description: str
    department_id: int
    department_name: str
    team_leader_user_id: uuid.UUID | None
    team_leader_name: str | None
    parent_team_id: int | None
    parent_team_name: str | None
    display_order: int
    is_active: bool
    member_count: int
    child_team_count: int
    default_position_ids: list[int]
    default_role_ids: list[int]
    brand_ids: list[int]
    created_at: datetime
    updated_at: datetime


class TeamPage(BaseModel):
    items: list[TeamSummary]
    total: int
    page: int
    page_size: int
    pages: int


class TeamMembersUpdate(BaseModel):
    member_ids: list[uuid.UUID]
    primary_member_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def primary_members_must_be_members(self):
        if not set(self.primary_member_ids).issubset(self.member_ids):
            raise ValueError("Primary team assignments must also be team members.")
        return self


class LifecycleMessage(BaseModel):
    message: str
