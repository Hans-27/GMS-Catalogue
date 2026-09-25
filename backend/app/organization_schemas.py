from pydantic import BaseModel, Field, field_validator, model_validator


class NamedEntityCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Za-z0-9_-]+$")
    description: str = Field(default="", max_length=320)
    is_active: bool = True

    @field_validator("name", "code", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.upper()


class DepartmentCreate(NamedEntityCreate):
    parent_id: int | None = None


class DepartmentResponse(NamedEntityCreate):
    id: int
    parent_id: int | None
    position_count: int = 0
    team_count: int = 0
    user_count: int = 0


class PositionCreate(NamedEntityCreate):
    department_id: int


class PositionResponse(NamedEntityCreate):
    id: int
    department_id: int
    department_name: str
    user_count: int = 0
    permission_ids: list[int] = Field(default_factory=list)


class BrandCreate(NamedEntityCreate):
    inactive_reason: str = Field(default="", max_length=500)

    @field_validator("inactive_reason")
    @classmethod
    def strip_inactive_reason(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def require_disable_reason(self) -> "BrandCreate":
        if not self.is_active and not self.inactive_reason:
            raise ValueError("Enter a reason before disabling this brand.")
        return self


class BrandResponse(NamedEntityCreate):
    id: int
    inactive_reason: str = ""
    team_count: int = 0


class BrandStatusUpdate(BaseModel):
    is_active: bool
    inactive_reason: str = Field(default="", max_length=500)

    @field_validator("inactive_reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def require_disable_reason(self) -> "BrandStatusUpdate":
        if not self.is_active and not self.inactive_reason:
            raise ValueError("Enter a reason before disabling this brand.")
        return self


class TeamCreate(NamedEntityCreate):
    department_id: int
    brand_ids: list[int] = Field(default_factory=list)

    @field_validator("brand_ids")
    @classmethod
    def unique_brands(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class TeamResponse(NamedEntityCreate):
    id: int
    department_id: int
    department_name: str
    brand_ids: list[int]
    brand_names: list[str]
    user_count: int = 0
    permission_ids: list[int] = Field(default_factory=list)


class PermissionCreate(BaseModel):
    code: str = Field(
        min_length=3,
        max_length=100,
        pattern=r"^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$",
    )
    module: str = Field(min_length=2, max_length=50)
    description: str = Field(min_length=2, max_length=255)

    @field_validator("code", "module", "description")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip()


class PermissionResponse(PermissionCreate):
    id: int
    role_names: list[str]


class RolePermissionUpdate(BaseModel):
    permission_ids: list[int]

    @field_validator("permission_ids")
    @classmethod
    def unique_permissions(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class OrganizationSummary(BaseModel):
    departments: int
    positions: int
    teams: int
    brands: int
    permissions: int
    assigned_users: int


class CatalogueAccessUpdate(BaseModel):
    can_view: bool
    can_manage: bool


class CatalogueAccessResponse(CatalogueAccessUpdate):
    department_id: int
    department_name: str
    brand_id: int
    brand_name: str
