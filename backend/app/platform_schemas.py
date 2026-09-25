import uuid
from datetime import datetime, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator


HEX_COLOR = r"^#[0-9A-Fa-f]{6}$"


class CoverSettingsUpdate(BaseModel):
    cover_mode: Literal["full_image", "custom"] | None = None
    catalogue_name: str | None = Field(default=None, min_length=2, max_length=220)
    catalogue_year: str | None = Field(default=None, max_length=12)
    subtitle: str | None = Field(default=None, max_length=320)
    company_name: str | None = Field(default=None, max_length=220)
    collection_name: str | None = Field(default=None, max_length=220)
    background_color: str | None = Field(default=None, pattern=HEX_COLOR)
    overlay_color: str | None = Field(default=None, pattern=HEX_COLOR)
    overlay_opacity: float | None = Field(default=None, ge=0, le=1)
    background_fit: Literal["contain", "cover", "full-page"] | None = None
    show_catalogue_name: bool | None = None
    show_catalogue_year: bool | None = None
    show_subtitle: bool | None = None
    show_brand_logo: bool | None = None
    show_company_logo: bool | None = None
    show_start_button: bool | None = None
    title_color: str | None = Field(default=None, pattern=HEX_COLOR)
    title_font_size: int | None = Field(default=None, ge=16, le=180)
    title_alignment: Literal["left", "center", "right"] | None = None
    title_position_x_percent: float | None = Field(default=None, ge=0, le=100)
    title_position_y_percent: float | None = Field(default=None, ge=0, le=100)
    title_width_percent: float | None = Field(default=None, gt=0, le=100)
    title_z_index: int | None = Field(default=None, ge=0, le=100)
    subtitle_color: str | None = Field(default=None, pattern=HEX_COLOR)
    subtitle_font_size: int | None = Field(default=None, ge=8, le=96)
    subtitle_position_x_percent: float | None = Field(default=None, ge=0, le=100)
    subtitle_position_y_percent: float | None = Field(default=None, ge=0, le=100)
    cover_alt_text: str | None = Field(default=None, max_length=255)

    @field_validator("catalogue_name")
    @classmethod
    def valid_catalogue_name(cls, value: str | None):
        if value is not None and len(value.strip()) < 2:
            raise ValueError("Catalogue name must contain at least two visible characters.")
        return value.strip() if value is not None else value


class CoverAssetPatch(BaseModel):
    alt_text: str | None = Field(default=None, max_length=255)
    position_x_percent: float | None = Field(default=None, ge=0, le=100)
    position_y_percent: float | None = Field(default=None, ge=0, le=100)
    width_percent: float | None = Field(default=None, gt=0, le=100)
    height_percent: float | None = Field(default=None, gt=0, le=100)
    opacity: float | None = Field(default=None, ge=0, le=1)
    rotation: float | None = Field(default=None, ge=-180, le=180)
    z_index: int | None = Field(default=None, ge=0, le=100)
    restore: bool = False


class CoverAssetResponse(BaseModel):
    id: uuid.UUID
    catalogue_id: uuid.UUID
    asset_type: Literal["background", "brand_logo", "secondary_logo", "decorative_image", "full_cover"]
    original_filename: str
    mime_type: str
    file_size: int
    width: int
    height: int
    checksum: str
    alt_text: str
    position_x_percent: float
    position_y_percent: float
    width_percent: float
    height_percent: float
    opacity: float
    rotation: float
    z_index: int
    file_url: str
    preview_url: str
    uploaded_by: uuid.UUID | None
    uploaded_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None = None


class CoverResponse(BaseModel):
    id: uuid.UUID
    catalogue_id: uuid.UUID
    cover_mode: Literal["full_image", "custom"]
    catalogue_name: str
    catalogue_year: str
    subtitle: str
    company_name: str
    collection_name: str
    background_color: str
    overlay_color: str
    overlay_opacity: float
    background_fit: Literal["contain", "cover", "full-page"]
    show_catalogue_name: bool
    show_catalogue_year: bool
    show_subtitle: bool
    show_brand_logo: bool
    show_company_logo: bool
    show_start_button: bool
    title_color: str
    title_font_size: int
    title_alignment: Literal["left", "center", "right"]
    title_position_x_percent: float
    title_position_y_percent: float
    title_width_percent: float
    title_z_index: int
    subtitle_color: str
    subtitle_font_size: int
    subtitle_position_x_percent: float
    subtitle_position_y_percent: float
    cover_alt_text: str
    created_by: uuid.UUID | None
    updated_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    assets: list[CoverAssetResponse] = Field(default_factory=list)
    asset_history: list[CoverAssetResponse] = Field(default_factory=list)


class CategorySettingInput(BaseModel):
    category_id: int
    display_name: str = Field(default="", max_length=180)
    description: str = Field(default="", max_length=4000)
    display_order: int = Field(ge=1)
    is_visible: bool = True
    show_product_count: bool = True
    default_expanded: bool = False


class CategorySettingsUpdate(BaseModel):
    categories: list[CategorySettingInput] = Field(max_length=500)

    @field_validator("categories")
    @classmethod
    def unique_categories(cls, value: list[CategorySettingInput]):
        ids = [item.category_id for item in value]
        orders = [item.display_order for item in value]
        if len(ids) != len(set(ids)) or len(orders) != len(set(orders)):
            raise ValueError("Category IDs and display orders must be unique.")
        return value


class CategorySettingResponse(CategorySettingInput):
    id: uuid.UUID | None = None
    master_name: str
    slug: str
    master_description: str
    banner_url: str | None = None
    product_count: int


BackupStatus = Literal["pending", "running", "completed", "failed", "deleted"]


class BackupCreate(BaseModel):
    description: str = Field(default="", max_length=500)
    components: list[Literal["source", "uploads", "static", "config_templates", "migrations"]] = Field(default_factory=list)


class BackupResponse(BaseModel):
    id: uuid.UUID
    backup_type: Literal["database", "application"]
    status: BackupStatus
    description: str
    requested_by: uuid.UUID | None
    requested_by_name: str | None = None
    started_at: datetime | None
    completed_at: datetime | None
    duration_seconds: float | None
    file_name: str | None
    file_size: int | None
    checksum: str | None
    application_version: str | None
    error_message: str | None
    metadata_json: dict | None
    created_at: datetime
    deleted_at: datetime | None


class BackupScheduleUpdate(BaseModel):
    is_enabled: bool = False
    frequency: Literal["daily", "weekly", "monthly"] = "daily"
    scheduled_time: time | None = None
    timezone: str = Field(default="Asia/Bangkok", max_length=80)
    retention_days: int = Field(default=30, ge=1, le=3650)
    retention_count: int = Field(default=10, ge=1, le=1000)


class BackupScheduleResponse(BackupScheduleUpdate):
    id: uuid.UUID
    backup_type: Literal["database", "application"]
    updated_at: datetime


class SystemMetricsResponse(BaseModel):
    status: Literal["healthy", "warning", "critical", "unknown"]
    timestamp: datetime
    thresholds: dict
    system: dict
    application: dict
    database: dict
    backups: dict
    warnings: list[str]
