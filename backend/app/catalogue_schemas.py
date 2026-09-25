import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator
from app.product_video_schemas import ProductVideoResponse


WorkflowStatus = Literal["draft", "in_review", "approved", "published"]
Visibility = Literal["hidden", "public"]
ProductStatus = Literal["active", "inactive"]


class ProductStatusHistoryResponse(BaseModel):
    id: uuid.UUID
    old_status: ProductStatus
    new_status: ProductStatus
    reason: str
    note: str
    changed_by_user_id: uuid.UUID | None
    changed_at: datetime


class ProductStatusUpdate(BaseModel):
    status: ProductStatus
    reason: str = Field(default="", max_length=50)
    note: str = Field(default="", max_length=500)

    @field_validator("reason", "note")
    @classmethod
    def strip_status_text(cls, value: str) -> str:
        return value.strip()


class CategoryBrandResponse(BaseModel):
    name: str
    product_count: int = 0
    id: int | None = None
    is_active: bool = True
    inactive_reason: str = ""


class CategoryResponse(BaseModel):
    id: int
    name: str
    slug: str
    description: str
    is_active: bool
    inactive_reason: str = ""
    product_count: int = 0
    brands: list[CategoryBrandResponse] = Field(default_factory=list)


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=320)

    @field_validator("name", "description")
    @classmethod
    def strip_fields(cls, value: str) -> str:
        return value.strip()


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=320)
    is_active: bool | None = None
    inactive_reason: str | None = Field(default=None, max_length=500)

    @field_validator("name", "description", "inactive_reason")
    @classmethod
    def strip_fields(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def require_disable_reason(self) -> "CategoryUpdate":
        if self.is_active is False and not self.inactive_reason:
            raise ValueError("Enter a reason before disabling this category.")
        return self


class ImageResponse(BaseModel):
    id: uuid.UUID
    file_name: str
    public_url: str
    content_type: str
    alt_text: str
    sort_order: int
    is_primary: bool
    created_at: datetime


class ProductListItem(BaseModel):
    id: uuid.UUID
    sku: str
    erp_name: str
    display_name: str
    brand: str | None
    price: Decimal | None
    stock_quantity: int
    product_status: ProductStatus
    inactive_reason: str | None
    inactive_note: str = ""
    status_updated_at: datetime
    stock_last_synced_at: datetime | None
    price_last_synced_at: datetime | None
    source_sync_status: str
    source_record_exists: bool
    is_discontinued: bool
    lifecycle_status_source: str
    legacy_catalogue_present: bool
    workflow_status: WorkflowStatus
    visibility: Visibility
    is_featured: bool
    short_description: str
    primary_image_url: str | None
    image_urls: list[str] = Field(default_factory=list)
    price_level_code: str | None = None
    price_list_name: str | None = None
    price_currency: str = "THB"
    category_names: list[str]
    updated_at: datetime
    has_video: bool = False


class ProductDetail(ProductListItem):
    barcode: str | None
    unit: str
    erp_category: str | None
    erp_name_th: str | None = None
    erp_pos_name: str | None = None
    erp_description_en: str | None = None
    erp_description_th: str | None = None
    erp_how_to_use: str | None = None
    erp_remark: str | None = None
    size_width: Decimal | None = None
    size_length: Decimal | None = None
    size_height: Decimal | None = None
    gross_weight: Decimal | None = None
    net_weight: Decimal | None = None
    pack_size: int | None = None
    warranty_description: str | None = None
    warranty_days: int | None = None
    erp_details: dict[str, str] = Field(default_factory=dict)
    erp_updated_at: datetime
    legacy_catalogue_synced_at: datetime | None = None
    long_description: str
    seo_title: str
    seo_description: str
    version: int
    submitted_at: datetime | None
    approved_at: datetime | None
    published_at: datetime | None
    categories: list[CategoryResponse]
    images: list[ImageResponse]
    videos: list[ProductVideoResponse] = Field(default_factory=list)
    inactive_note: str
    inactivated_at: datetime | None
    reactivated_at: datetime | None
    status_history: list[ProductStatusHistoryResponse] = Field(default_factory=list)
    catalogue_assignments: list[dict] = Field(default_factory=list)


class ProductPage(BaseModel):
    items: list[ProductListItem]
    brands: list[str]
    total: int
    page: int
    page_size: int
    pages: int


class CatalogueContentUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=255)
    short_description: str = Field(default="", max_length=320)
    long_description: str = Field(default="", max_length=12000)
    seo_title: str = Field(default="", max_length=180)
    seo_description: str = Field(default="", max_length=320)
    visibility: Visibility = "hidden"
    is_featured: bool = False
    category_ids: list[int] = Field(default_factory=list, max_length=20)

    @field_validator(
        "short_description",
        "long_description",
        "seo_title",
        "seo_description",
    )
    @classmethod
    def strip_content(cls, value: str) -> str:
        return value.strip()

    @field_validator("display_name")
    @classmethod
    def strip_display_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("category_ids")
    @classmethod
    def unique_category_ids(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class ProductMasterUpdate(BaseModel):
    erp_name: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=120)
    barcode: str | None = Field(default=None, max_length=80)
    erp_category: str | None = Field(default=None, max_length=120)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    stock_quantity: int = Field(ge=0)

    @field_validator("erp_name")
    @classmethod
    def strip_master_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Product name cannot be empty.")
        return stripped

    @field_validator("brand", "barcode", "erp_category")
    @classmethod
    def strip_optional_master_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=120)
    barcode: str | None = Field(default=None, max_length=80)
    unit: str = Field(default="piece", min_length=1, max_length=30)
    erp_category: str | None = Field(default=None, max_length=120)
    price: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    stock_quantity: int = Field(default=0, ge=0)
    short_description: str = Field(default="", max_length=320)
    long_description: str = Field(default="", max_length=12000)
    category_ids: list[int] = Field(default_factory=list, max_length=20)

    @field_validator("sku", "name", "unit")
    @classmethod
    def strip_required_create_fields(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("This field cannot be empty.")
        return stripped

    @field_validator("brand", "barcode", "erp_category")
    @classmethod
    def strip_optional_create_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("short_description", "long_description")
    @classmethod
    def strip_create_content(cls, value: str) -> str:
        return value.strip()

    @field_validator("category_ids")
    @classmethod
    def unique_create_category_ids(cls, value: list[int]) -> list[int]:
        return list(dict.fromkeys(value))


class CatalogueStats(BaseModel):
    total_products: int
    active_products: int
    inactive_products: int | None = None
    products_missing_from_source: int | None = None
    products_with_stale_stock: int | None = None
    products_with_stale_prices: int | None = None
    current_sync_status: str | None = None
    last_successful_sync: datetime | None = None
    last_failed_sync: datetime | None = None
    draft: int
    in_review: int
    approved: int
    published: int
    hidden: int
    missing_images: int
    missing_descriptions: int
    missing_categories: int
    ready_products: int
    completion_rate: float


class WorkflowResponse(BaseModel):
    message: str
    product: ProductDetail


class ActivityResponse(BaseModel):
    id: uuid.UUID
    action: str
    status: str
    user_name: str | None
    identifier: str | None
    details: dict | None
    created_at: datetime


class ErpProductRecord(BaseModel):
    sku: str = Field(min_length=1, max_length=80)
    erp_name: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=120)
    barcode: str | None = Field(default=None, max_length=80)
    unit: str = Field(default="piece", min_length=1, max_length=30)
    erp_category: str | None = Field(default=None, max_length=120)
    price: Decimal | None = Field(default=None, ge=0)
    stock_quantity: int = Field(default=0, ge=0)
    is_discontinued: bool = False
    erp_updated_at: datetime | None = None

    @field_validator(
        "sku",
        "erp_name",
        "brand",
        "barcode",
        "unit",
        "erp_category",
    )
    @classmethod
    def strip_erp_fields(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class ErpSyncRequest(BaseModel):
    products: list[ErpProductRecord] = Field(min_length=1, max_length=1000)

    @field_validator("products")
    @classmethod
    def unique_skus(cls, value: list[ErpProductRecord]) -> list[ErpProductRecord]:
        normalized = [product.sku.casefold() for product in value]
        if len(normalized) != len(set(normalized)):
            raise ValueError("Each SKU can appear only once in a sync request.")
        return value


class ErpSyncResponse(BaseModel):
    message: str
    created: int
    updated: int
