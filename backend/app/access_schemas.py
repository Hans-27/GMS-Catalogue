import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


VALID_SCOPES = {
    "all", "department", "own", "assigned_brands", "assigned_categories",
    "assigned_catalogues", "assigned_products", "none",
}


class EffectivePermissionItem(BaseModel):
    key: str
    scopes: list[str]
    sources: list[str]


class CurrentAccessResponse(BaseModel):
    user: dict
    permissions_version: int
    permissions: list[str]
    scopes: dict[str, dict]
    price_list_ids: list[int]


class ScopedOverrideInput(BaseModel):
    permission_id: int = Field(gt=0)
    effect: str = Field(pattern=r"^(allow|deny)$")
    access_scope: str = "none"
    reason: str = Field(default="", max_length=320)
    expires_at: datetime | None = None

    @field_validator("access_scope")
    @classmethod
    def valid_scope(cls, value: str) -> str:
        if value not in VALID_SCOPES:
            raise ValueError("Unknown data scope.")
        return value


class UserDataScopeInput(BaseModel):
    all_access: bool = False
    own_department: bool = False
    own_records: bool = False
    published_only: bool = True


class UserAccessUpdate(BaseModel):
    role_ids: list[int] | None = None
    overrides: list[ScopedOverrideInput] | None = None
    data_scope: UserDataScopeInput | None = None
    brand_ids: list[int] | None = None
    category_ids: list[int] | None = None
    product_ids: list[uuid.UUID] | None = None
    catalogue_ids: list[uuid.UUID] | None = None
    price_list_ids: list[int] | None = None
    reason: str = Field(min_length=3, max_length=500)
    reauth_password: str | None = Field(default=None, max_length=1024)


class UserAccessResponse(BaseModel):
    user_id: uuid.UUID
    username: str
    full_name: str
    is_super_admin: bool
    permissions_version: int
    direct_role_ids: list[int]
    inherited_roles: list[dict]
    overrides: list[dict]
    data_scope: UserDataScopeInput
    brand_ids: list[int]
    category_ids: list[int]
    product_ids: list[uuid.UUID]
    catalogue_ids: list[uuid.UUID]
    price_list_ids: list[int]
    effective_permissions: list[EffectivePermissionItem]
    visible_modules: list[str]
    restricted_fields: list[str]


class RolePermissionGrantInput(BaseModel):
    permission_id: int = Field(gt=0)
    effect: str = Field(default="allow", pattern=r"^(allow|deny)$")
    access_scope: str = "none"

    @field_validator("access_scope")
    @classmethod
    def valid_scope(cls, value: str) -> str:
        if value not in VALID_SCOPES:
            raise ValueError("Unknown data scope.")
        return value


class RoleAccessUpdate(BaseModel):
    grants: list[RolePermissionGrantInput]
    price_list_ids: list[int] = Field(default_factory=list)
    reason: str = Field(min_length=3, max_length=500)


class RoleAccessResponse(BaseModel):
    role_id: int
    role_key: str
    role_name: str
    is_active: bool
    is_system: bool
    grants: list[dict]
    price_list_ids: list[int]
