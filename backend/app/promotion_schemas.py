import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator


PromotionType = Literal["percentage", "fixed_amount", "special_price"]
PromotionStatus = Literal["draft", "pending_review", "rejected", "approved", "scheduled", "active", "paused", "expired", "cancelled"]


class OccasionInput(BaseModel):
    code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    name_en: str = Field(min_length=2, max_length=120)
    name_th: str = Field(default="", max_length=120)
    description: str = Field(default="", max_length=500)
    icon_key: str = Field(default="calendar", max_length=80)
    default_banner_style: str = Field(default="default", max_length=80)
    recurring_annually: bool = False
    default_start_month: int | None = Field(default=None, ge=1, le=12)
    default_start_day: int | None = Field(default=None, ge=1, le=31)
    default_end_month: int | None = Field(default=None, ge=1, le=12)
    default_end_day: int | None = Field(default=None, ge=1, le=31)
    display_order: int = Field(default=0, ge=0)
    is_active: bool = True


class OccasionUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=2, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    name_en: str | None = Field(default=None, min_length=2, max_length=120)
    name_th: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    icon_key: str | None = Field(default=None, max_length=80)
    default_banner_style: str | None = Field(default=None, max_length=80)
    recurring_annually: bool | None = None
    default_start_month: int | None = Field(default=None, ge=1, le=12)
    default_start_day: int | None = Field(default=None, ge=1, le=31)
    default_end_month: int | None = Field(default=None, ge=1, le=12)
    default_end_day: int | None = Field(default=None, ge=1, le=31)
    display_order: int | None = Field(default=None, ge=0)
    is_active: bool | None = None


class OccasionResponse(OccasionInput):
    id: int
    created_at: datetime
    updated_at: datetime


class PromotionBrandInput(BaseModel):
    brand_id: int
    include_all_active_products: bool = False


class PromotionProductInput(BaseModel):
    product_id: uuid.UUID
    audience_type_id: int | None = None
    price_list_id: int | None = None
    promotion_type: PromotionType | None = None
    discount_percent: Decimal | None = Field(default=None, gt=0, le=100)
    discount_amount: Decimal | None = Field(default=None, gt=0)
    promotion_price: Decimal | None = Field(default=None, ge=0)
    include_in_promotion: bool = True
    display_order: int = Field(default=0, ge=0)


class PromotionAudienceInput(BaseModel):
    audience_type_id: int
    price_list_id: int | None = None
    show_prices: bool = True


class PromotionCreate(BaseModel):
    code: str | None = Field(default=None, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    name_en: str = Field(min_length=2, max_length=220)
    name_th: str = Field(default="", max_length=220)
    short_title: str = Field(default="", max_length=160)
    description_en: str = ""
    description_th: str = ""
    occasion_id: int | None = None
    promotion_type: PromotionType
    discount_percent: Decimal | None = Field(default=None, gt=0, le=100)
    discount_amount: Decimal | None = Field(default=None, gt=0)
    promotion_price: Decimal | None = Field(default=None, ge=0)
    priority: int = Field(default=50, ge=1, le=100)
    allow_stacking: bool = False
    base_price_change_behavior: Literal["keep_approved", "recalculate", "require_reapproval", "pause_products"] = "require_reapproval"
    owner_user_id: uuid.UUID | None = None
    department_id: int | None = None
    team_id: int | None = None
    start_at: datetime
    end_at: datetime
    timezone: str = Field(default="Asia/Bangkok", max_length=60)
    publish_at: datetime | None = None
    automatic_activation: bool = True
    automatic_expiration: bool = True
    repeat_annually: bool = False
    expiration_warning_days: int = Field(default=7, ge=0, le=90)
    show_stock: bool = True
    hide_out_of_stock: bool = False
    minimum_stock: int = Field(default=0, ge=0)
    stop_product_at_zero_stock: bool = False
    terms_en: str = ""
    terms_th: str = ""
    internal_note: str = ""
    is_active: bool = True
    brand_rules: list[PromotionBrandInput] = Field(min_length=1)
    products: list[PromotionProductInput] = Field(default_factory=list)
    audiences: list[PromotionAudienceInput] = Field(min_length=1)
    catalogue_ids: list[uuid.UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_schedule_and_products(self):
        if self.end_at <= self.start_at:
            raise ValueError("End date and time must be later than start date and time.")
        if not self.products and not any(item.include_all_active_products for item in self.brand_rules):
            raise ValueError("Select products or include all active products from a selected brand.")
        if self.allow_stacking:
            raise ValueError("Promotion stacking is not enabled in this release.")
        return self


class PromotionUpdate(BaseModel):
    name_en: str | None = Field(default=None, min_length=2, max_length=220)
    name_th: str | None = Field(default=None, max_length=220)
    short_title: str | None = Field(default=None, max_length=160)
    description_en: str | None = None
    description_th: str | None = None
    occasion_id: int | None = None
    promotion_type: PromotionType | None = None
    discount_percent: Decimal | None = Field(default=None, gt=0, le=100)
    discount_amount: Decimal | None = Field(default=None, gt=0)
    promotion_price: Decimal | None = Field(default=None, ge=0)
    priority: int | None = Field(default=None, ge=1, le=100)
    base_price_change_behavior: Literal["keep_approved", "recalculate", "require_reapproval", "pause_products"] | None = None
    owner_user_id: uuid.UUID | None = None
    department_id: int | None = None
    team_id: int | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    timezone: str | None = Field(default=None, max_length=60)
    publish_at: datetime | None = None
    automatic_activation: bool | None = None
    automatic_expiration: bool | None = None
    repeat_annually: bool | None = None
    expiration_warning_days: int | None = Field(default=None, ge=0, le=90)
    show_stock: bool | None = None
    hide_out_of_stock: bool | None = None
    minimum_stock: int | None = Field(default=None, ge=0)
    stop_product_at_zero_stock: bool | None = None
    terms_en: str | None = None
    terms_th: str | None = None
    internal_note: str | None = None
    is_active: bool | None = None
    brand_rules: list[PromotionBrandInput] | None = None
    products: list[PromotionProductInput] | None = None
    audiences: list[PromotionAudienceInput] | None = None
    catalogue_ids: list[uuid.UUID] | None = None


class PromotionBrandResponse(BaseModel):
    brand_id: int
    brand_name: str
    brand_code: str
    include_all_active_products: bool
    active_product_count: int = 0
    selected_product_count: int = 0


class PromotionProductResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_code: str
    product_name: str
    image_url: str | None
    brand: str | None
    category: str | None
    stock: int
    product_status: str
    audience_type_id: int | None
    price_list_id: int | None
    price_list_name: str | None
    promotion_type: str
    base_price: Decimal | None
    approved_base_price: Decimal | None
    discount_percent: Decimal | None
    discount_amount: Decimal | None
    promotion_price: Decimal | None
    currency: str
    include_in_promotion: bool
    warning: str | None = None


class PromotionAudienceResponse(BaseModel):
    audience_type_id: int
    audience_code: str
    audience_name: str
    price_list_id: int | None
    price_list_name: str | None
    show_prices: bool


class PromotionMediaResponse(BaseModel):
    id: uuid.UUID
    media_type: str
    url: str | None
    external_url: str | None
    original_filename: str
    mime_type: str | None
    file_size: int | None
    alt_text: str
    display_order: int


class PromotionResponse(BaseModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_th: str
    short_title: str
    description_en: str
    description_th: str
    occasion_id: int | None
    occasion_name: str | None
    promotion_type: str
    status: PromotionStatus
    priority: int
    allow_stacking: bool
    base_price_change_behavior: str
    owner_user_id: uuid.UUID | None
    department_id: int | None
    team_id: int | None
    start_at: datetime
    end_at: datetime
    timezone: str
    publish_at: datetime | None
    automatic_activation: bool
    automatic_expiration: bool
    repeat_annually: bool
    expiration_warning_days: int
    show_stock: bool
    hide_out_of_stock: bool
    minimum_stock: int
    stop_product_at_zero_stock: bool
    terms_en: str
    terms_th: str
    internal_note: str | None = None
    is_active: bool
    published_at: datetime | None
    approved_at: datetime | None
    rejection_reason: str | None
    created_by_id: uuid.UUID | None
    updated_by_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    brands: list[PromotionBrandResponse]
    products: list[PromotionProductResponse]
    audiences: list[PromotionAudienceResponse]
    catalogue_ids: list[uuid.UUID]
    media: list[PromotionMediaResponse]
    cover_url: str | None = None
    conflicts: list[dict] = Field(default_factory=list)


class PromotionListPage(BaseModel):
    items: list[PromotionResponse]
    total: int
    page: int
    page_size: int
    pages: int
    summary: dict[str, int]


class WorkflowReason(BaseModel):
    reason: str = Field(default="", max_length=2000)


class ShareLinkCreate(BaseModel):
    audience_type_id: int
    expires_at: datetime | None = None
    allow_pdf: bool = True
    allow_print: bool = True


class ShareLinkResponse(BaseModel):
    id: uuid.UUID
    promotion_id: uuid.UUID
    audience_type_id: int
    audience_name: str
    status: str
    url: str | None
    expires_at: datetime | None
    allow_pdf: bool
    allow_print: bool
    view_count: int
    created_at: datetime


class PublicPromotionProduct(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    name_th: str | None
    brand: str | None
    category: str | None
    image_url: str | None
    stock: int | None
    out_of_stock: bool
    base_price: Decimal | None
    promotion_price: Decimal | None
    discount_percent: Decimal | None
    currency: str | None
    price_message: str | None


class PublicPromotionResponse(BaseModel):
    id: uuid.UUID
    code: str
    name_en: str
    name_th: str
    short_title: str
    description_en: str
    description_th: str
    occasion_name: str | None
    start_at: datetime
    end_at: datetime
    timezone: str
    terms_en: str
    terms_th: str
    banner_url: str | None
    video_url: str | None
    audience: str
    audience_code: str
    show_prices: bool
    allow_pdf: bool
    allow_print: bool
    products: list[PublicPromotionProduct]
