import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.catalogue_schemas import CatalogueStats


class DashboardSummary(BaseModel):
    active_products: int | None = None
    inactive_products: int | None = None
    published_catalogues: int | None = None
    draft_catalogues: int | None = None
    active_promotions: int | None = None
    pending_my_approval: int | None = None


class DashboardAttentionItem(BaseModel):
    key: str
    title: str
    count: int
    severity: Literal["information", "warning", "critical"]
    target: Literal["products", "catalogues", "promotions"]
    filter_name: str
    filter_value: str


class DashboardWorkItem(BaseModel):
    id: uuid.UUID
    item_type: Literal["catalogue", "studio_design", "promotion", "product_approval", "price_approval"]
    name: str
    status: str
    priority: Literal["normal", "high", "critical"] = "normal"
    updated_at: datetime
    due_at: datetime | None = None
    action: str
    href: str


class DashboardCatalogueItem(BaseModel):
    id: uuid.UUID
    title: str
    brand: str | None = None
    brand_mode: Literal["single", "multi"]
    catalogue_type: str = "standard"
    status: str
    product_count: int
    price_mode: Literal["priced", "no_price", "restricted"]
    updated_by: str | None = None
    updated_at: datetime
    primary_action: str
    href: str
    studio_href: str | None = None
    cover_thumbnail_url: str | None = None


class DashboardProductItem(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    brand: str | None = None
    category: str | None = None
    status: Literal["active", "inactive"]
    workflow_status: str
    stock: int
    price: Decimal | None = None
    currency: str | None = None
    image_url: str | None = None
    updated_by: str | None = None
    updated_at: datetime


class DashboardPromotionItem(BaseModel):
    id: uuid.UUID
    name: str
    occasion: str | None = None
    brands: list[str] = Field(default_factory=list)
    start_at: datetime
    end_at: datetime
    timezone: str
    status: str
    audiences: list[str] = Field(default_factory=list)
    product_count: int
    href: str


class DashboardSyncStatus(BaseModel):
    safe_status: Literal["up_to_date", "updating", "data_may_be_outdated", "disabled", "unknown"]
    display_label: str
    last_successful_at: datetime | None = None
    technical_status: str | None = None
    last_failed_at: datetime | None = None
    can_open_details: bool = False


class DashboardSystemHealth(BaseModel):
    status: str
    measured_at: datetime
    cpu_percent: float | None = None
    memory_percent: float | None = None
    disk_percent: float | None = None
    database_status: str | None = None
    database_response_ms: float | None = None
    api_response_ms: float | None = None
    application_uptime_seconds: int | None = None
    last_database_backup: datetime | None = None
    last_application_backup: datetime | None = None
    current_background_jobs: int | None = None
    recent_failed_logins: int | None = None
    recent_server_errors: int | None = None
    warnings: list[str] = Field(default_factory=list)


class DashboardOverviewResponse(BaseModel):
    summary: DashboardSummary
    product_metrics: CatalogueStats | None = None
    attention: list[DashboardAttentionItem] = Field(default_factory=list)
    my_work: list[DashboardWorkItem] = Field(default_factory=list)
    recent_catalogues: list[DashboardCatalogueItem] = Field(default_factory=list)
    recent_products: list[DashboardProductItem] = Field(default_factory=list)
    upcoming_promotions: list[DashboardPromotionItem] = Field(default_factory=list)
    sync_status: DashboardSyncStatus
    system_health: DashboardSystemHealth | None = None

