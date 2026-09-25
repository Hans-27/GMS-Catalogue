import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


def validate_password_strength(value: str) -> str:
    checks = (
        re.search(r"[a-z]", value),
        re.search(r"[A-Z]", value),
        re.search(r"\d", value),
        re.search(r"[^A-Za-z0-9]", value),
    )
    if not all(checks):
        raise ValueError(
            "Password must include uppercase, lowercase, number and symbol."
        )
    return value


class ManagedUserResponse(BaseModel):
    id: uuid.UUID
    username: str
    email: EmailStr
    full_name: str
    is_active: bool
    roles: list[str]
    department_id: int | None
    department_name: str | None
    position_id: int | None
    position_name: str | None
    primary_team_id: int | None
    primary_team_name: str | None
    employee_code: str | None
    team_ids: list[int]
    team_names: list[str]
    brand_names: list[str]
    direct_roles: list[str]
    inherited_roles: list[dict]
    failed_login_attempts: int
    locked_until: datetime | None
    last_login_at: datetime | None
    created_at: datetime


class RoleResponse(BaseModel):
    id: int
    name: str
    description: str
    permission_ids: list[int] = Field(default_factory=list)


class UserPermissionOverrideItem(BaseModel):
    permission_id: int = Field(gt=0)
    is_allowed: bool
    reason: str = Field(default="", max_length=320)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return value.strip()


class UserPermissionOverrideUpdate(BaseModel):
    overrides: list[UserPermissionOverrideItem]

    @field_validator("overrides")
    @classmethod
    def unique_permissions(
        cls,
        value: list[UserPermissionOverrideItem],
    ) -> list[UserPermissionOverrideItem]:
        permission_ids = [item.permission_id for item in value]
        if len(permission_ids) != len(set(permission_ids)):
            raise ValueError("Each permission can have only one user override.")
        return value


class UserPermissionOverrideResponse(BaseModel):
    permission_id: int
    permission_code: str
    module: str
    is_allowed: bool
    reason: str
    created_at: datetime


class ManagedUserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    username: str = Field(
        min_length=3,
        max_length=80,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    email: EmailStr
    password: str = Field(min_length=12, max_length=1024)
    role_names: list[str] = Field(default_factory=lambda: ["system_user"])
    department_id: int | None = None
    position_id: int | None = None
    employee_code: str | None = Field(default=None, max_length=50)
    team_ids: list[int] = Field(default_factory=list)
    primary_team_id: int | None = None

    @field_validator("full_name", "username")
    @classmethod
    def strip_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("role_names")
    @classmethod
    def unique_roles(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))

    @field_validator("employee_code")
    @classmethod
    def strip_employee_code(cls, value: str | None) -> str | None:
        stripped = value.strip() if value else None
        return stripped or None

    @field_validator("team_ids")
    @classmethod
    def unique_teams(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class ManagedUserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    email: EmailStr | None = None
    is_active: bool | None = None
    role_names: list[str] | None = None
    department_id: int | None = None
    position_id: int | None = None
    employee_code: str | None = Field(default=None, max_length=50)
    team_ids: list[int] | None = None
    primary_team_id: int | None = None

    @field_validator("full_name")
    @classmethod
    def strip_full_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("role_names")
    @classmethod
    def unique_roles(cls, value: list[str] | None) -> list[str] | None:
        return list(dict.fromkeys(value)) if value is not None else None

    @field_validator("employee_code")
    @classmethod
    def strip_employee_code(cls, value: str | None) -> str | None:
        stripped = value.strip() if value else None
        return stripped or None

    @field_validator("team_ids")
    @classmethod
    def unique_teams(cls, value: list[int] | None) -> list[int] | None:
        return list(dict.fromkeys(value)) if value is not None else None


class PasswordResetRequest(BaseModel):
    password: str = Field(min_length=12, max_length=1024)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return validate_password_strength(value)


class UserManagementMessage(BaseModel):
    message: str
    user: ManagedUserResponse
