import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


PriceRequestStatus = Literal["pending", "approved", "rejected"]
CatalogueStatus = Literal[
    "draft", "pending_review", "approved", "published", "wip", "archived"
]


class CatalogueBrandOption(BaseModel):
    id: int
    name: str
    code: str
    product_count: int


class PriceListCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=320)
    currency: str = Field(default="THB", min_length=3, max_length=3)
    is_no_price: bool = False
    is_active: bool = True

    @field_validator("code", "name", "description", "currency")
    @classmethod
    def strip_price_list_fields(cls, value: str) -> str:
        return value.strip()

    @field_validator("code", "currency")
    @classmethod
    def uppercase_codes(cls, value: str) -> str:
        return value.upper()


class PriceListResponse(PriceListCreate):
    id: int
    created_at: datetime
    updated_at: datetime


class ErpCustomerPriceLevelResponse(BaseModel):
    id: int
    erp_price_type_id: int
    source_code: str
    source_name: str
    price_list_id: int
    price_list_code: str
    price_list_name: str
    product_count: int
    sort_order: int
    is_active: bool
    last_synced_at: datetime


class UserCataloguePriceMappingResponse(BaseModel):
    audience_type_id: int
    audience_code: str
    audience_name: str
    price_list_id: int
    price_list_code: str
    price_list_name: str
    erp_source_code: str | None = None
    erp_source_name: str | None = None
    show_prices: bool
    is_custom: bool
    brand: str | None = None
    is_brand_override: bool = False


class UserCataloguePriceMappingUpdate(BaseModel):
    audience_type_id: int
    price_list_id: int


class UserCataloguePriceMappingsUpdate(BaseModel):
    mappings: list[UserCataloguePriceMappingUpdate] = Field(min_length=1)
    brand: str | None = Field(default=None, max_length=120)


class UserBrandCataloguePriceMappingSummary(BaseModel):
    brand: str
    product_count: int
    override_count: int
    audience_count: int
    status: Literal["custom", "partial", "default"]


class ErpProductCustomerPriceResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_sku: str
    product_name: str
    product_brand: str | None
    category_names: list[str] = Field(default_factory=list)
    price_level_id: int
    source_code: str
    source_name: str
    price_list_code: str
    price_list_name: str
    amount: Decimal
    currency: str
    source_updated_at: datetime | None
    last_synced_at: datetime


class ErpProductCustomerPricePage(BaseModel):
    items: list[ErpProductCustomerPriceResponse]
    total: int
    page: int
    page_size: int
    pages: int


class ErpPriceBrandOption(BaseModel):
    name: str
    product_count: int


class ErpPriceCategoryOption(BaseModel):
    id: int
    name: str
    product_count: int


class ErpCustomerPriceFilters(BaseModel):
    brands: list[ErpPriceBrandOption]
    categories: list[ErpPriceCategoryOption]


class ErpProductPriceMatrixValue(BaseModel):
    price_level_id: int
    source_code: str
    source_name: str
    price_list_code: str
    price_list_name: str
    amount: Decimal
    currency: str
    last_synced_at: datetime


class ErpProductPriceMatrixItem(BaseModel):
    product_id: uuid.UUID
    product_sku: str
    product_name: str
    product_brand: str | None
    category_names: list[str] = Field(default_factory=list)
    prices: list[ErpProductPriceMatrixValue] = Field(default_factory=list)


class ErpProductPriceMatrixPage(BaseModel):
    items: list[ErpProductPriceMatrixItem]
    total: int
    page: int
    page_size: int
    pages: int


class PriceProposalCreate(BaseModel):
    product_id: uuid.UUID
    price_list_id: int
    proposed_amount: Decimal = Field(ge=0, decimal_places=2)
    effective_from: datetime = Field(default_factory=lambda: datetime.now(UTC))
    reason: str = Field(min_length=3, max_length=500)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return value.strip()


class PriceReview(BaseModel):
    approve: bool
    reason: str = Field(default="", max_length=500)

    @field_validator("reason")
    @classmethod
    def strip_review_reason(cls, value: str) -> str:
        return value.strip()


class ProductPriceResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_sku: str
    product_name: str
    price_list_id: int
    price_list_name: str
    currency: str
    amount: Decimal
    effective_from: datetime
    expires_at: datetime | None
    status: str
    reason: str
    created_by_id: uuid.UUID | None
    approved_by_id: uuid.UUID | None
    created_at: datetime
    approved_at: datetime | None


class PriceRequestResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    product_sku: str
    product_name: str
    price_list_id: int
    price_list_name: str
    current_amount: Decimal | None
    proposed_amount: Decimal
    currency: str
    effective_from: datetime
    reason: str
    status: PriceRequestStatus
    requested_by_id: uuid.UUID | None
    reviewed_by_id: uuid.UUID | None
    review_reason: str
    resulting_price_id: uuid.UUID | None
    created_at: datetime
    reviewed_at: datetime | None


class CatalogueCreate(BaseModel):
    title: str = Field(min_length=2, max_length=220)
    slug: str | None = Field(default=None, max_length=240)
    description: str = Field(default="", max_length=12000)
    brand: str | None = Field(default=None, max_length=120)
    audience: str = Field(default="Internal", max_length=120)
    price_list_id: int | None = None
    show_prices: bool = True
    currency: str = Field(default="THB", min_length=3, max_length=3)
    language: Literal["en", "th", "en-th"] = "en"
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    is_public: bool = False

    @field_validator(
        "title", "slug", "description", "brand", "audience", "currency"
    )
    @classmethod
    def strip_catalogue_fields(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def validate_dates(self):
        if self.valid_from and self.valid_until and self.valid_until <= self.valid_from:
            raise ValueError("Valid-until must be later than valid-from.")
        return self


class CatalogueGenerationResponse(BaseModel):
    created: int
    updated: int
    brand_count: int
    product_count: int
    products_with_images: int
    products_missing_images: int
    category_setting_count: int
    customer_level_count: int
    legacy_category_rows: int
    legacy_matched_brands: int
    cover_count: int
    covers_with_erp_image: int
    covers_with_fallback_design: int
    warnings: list[str] = Field(default_factory=list)


class CatalogueUpdate(CatalogueCreate):
    status: CatalogueStatus = "draft"
    expected_revision: int = Field(ge=1)


class CatalogueProductInput(BaseModel):
    product_id: uuid.UUID
    section_title: str = Field(default="", max_length=180)
    override_description: str = Field(default="", max_length=12000)
    hide_price: bool = False
    include_video: bool = True
    selected_video_id: uuid.UUID | None = None
    video_title_override: str = Field(default="", max_length=255)
    video_description_override: str = Field(default="", max_length=12000)
    video_display_mode: Literal["card_icon", "product_detail", "media_section"] = "product_detail"
    video_thumbnail_mode: Literal["video_thumbnail", "product_image", "placeholder"] = "video_thumbnail"

    @field_validator("section_title", "override_description", "video_title_override", "video_description_override")
    @classmethod
    def strip_product_overrides(cls, value: str) -> str:
        return value.strip()


class CatalogueProductsUpdate(BaseModel):
    products: list[CatalogueProductInput] = Field(default_factory=list, max_length=5000)

    @field_validator("products")
    @classmethod
    def unique_products(
        cls, value: list[CatalogueProductInput]
    ) -> list[CatalogueProductInput]:
        ids = [item.product_id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("A product can appear only once in a catalogue.")
        return value


class CatalogueProductResponse(CatalogueProductInput):
    sort_order: int
    sku: str
    name: str
    brand: str | None
    primary_image_url: str | None
    product_status: Literal["active", "inactive"] = "active"


class CatalogueResponse(BaseModel):
    id: uuid.UUID
    title: str
    slug: str
    description: str
    brand: str | None
    audience: str
    price_list_id: int | None
    price_list_name: str | None
    show_prices: bool
    currency: str
    language: str
    status: CatalogueStatus
    version: int
    revision: int
    valid_from: datetime | None
    valid_until: datetime | None
    is_public: bool
    owner_id: uuid.UUID | None
    product_count: int
    products: list[CatalogueProductResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    published_at: datetime | None
    studio_design_id: uuid.UUID | None = None
    catalogue_type: str = "standard"
    brand_logo_url: str | None = None
    studio_editor_href: str | None = None
    studio_preview_href: str | None = None


class CataloguePreviewPriceList(BaseModel):
    id: int | None = None
    name: str
    show_price: bool


class CataloguePreviewProduct(BaseModel):
    id: uuid.UUID | None = None
    code: str
    name: str
    name_th: str | None = None
    name_en: str | None = None
    brand: str | None = None
    category_name: str | None = None
    categories: list[str] = Field(default_factory=list)
    description: str = ""
    long_description: str = ""
    description_en: str = ""
    description_th: str = ""
    long_description_en: str = ""
    long_description_th: str = ""
    erp_details: dict[str, str] = Field(default_factory=dict)
    main_image_url: str | None = None
    image_urls: list[str] = Field(default_factory=list)
    barcode: str | None = None
    stock_quantity: int | None = None
    card_presentation: dict | None = None
    section_title: str = ""
    display_order: int
    featured: bool = False
    product_status: Literal["active", "inactive"] = "active"
    price: Decimal | None = None
    wholesale_price: Decimal | None = None
    online_price: Decimal | None = None
    retail_price: Decimal | None = None
    currency: str | None = None
    promotion_code: str | None = None
    promotion_name: str | None = None
    promotion_badge: str | None = None
    original_price: Decimal | None = None
    promotion_price: Decimal | None = None
    discount_percent: Decimal | None = None
    promotion_end_at: datetime | None = None
    video: "CataloguePreviewVideo | None" = None


class CataloguePreviewVideo(BaseModel):
    id: uuid.UUID
    source_type: Literal["upload", "external"]
    provider: Literal["internal", "youtube", "vimeo", "direct_url"]
    title: str = ""
    description: str = ""
    alt_text: str = ""
    thumbnail_url: str | None = None
    playback_url: str | None = None
    caption_url: str | None = None
    mime_type: str | None = None
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    display_mode: Literal["card_icon", "product_detail", "media_section"] = "product_detail"
    show_controls: bool = True
    allow_download: bool = False
    autoplay: bool = False
    muted: bool = False
    loop: bool = False


class CataloguePreviewCoverAsset(BaseModel):
    id: uuid.UUID | None = None
    asset_type: str
    file_url: str
    preview_url: str
    mime_type: str
    original_filename: str
    file_size: int
    width: int
    height: int
    alt_text: str = ""
    position_x_percent: float = 50
    position_y_percent: float = 50
    width_percent: float = 25
    height_percent: float = 15
    opacity: float = 1
    rotation: float = 0
    z_index: int = 10
    storage_key: str | None = Field(default=None, exclude=True)
    preview_storage_key: str | None = Field(default=None, exclude=True)


class CataloguePreviewCover(BaseModel):
    cover_mode: str = "custom"
    catalogue_name: str
    catalogue_year: str = ""
    subtitle: str = ""
    company_name: str = ""
    collection_name: str = ""
    background_color: str = "#164f35"
    overlay_color: str = "#081f14"
    overlay_opacity: float = 0.28
    background_fit: str = "cover"
    show_catalogue_name: bool = True
    show_catalogue_year: bool = True
    show_subtitle: bool = True
    show_brand_logo: bool = True
    show_company_logo: bool = False
    show_start_button: bool = True
    title_color: str = "#ffffff"
    title_font_size: int = 72
    title_alignment: str = "left"
    title_position_x_percent: float = 10
    title_position_y_percent: float = 68
    title_width_percent: float = 80
    title_z_index: int = 20
    subtitle_color: str = "#ffffff"
    subtitle_font_size: int = 20
    subtitle_position_x_percent: float = 10
    subtitle_position_y_percent: float = 86
    cover_alt_text: str = ""
    default_company_logo_version: str | None = None
    assets: list[CataloguePreviewCoverAsset] = Field(default_factory=list)


class CataloguePreviewCategory(BaseModel):
    id: int | None = None
    slug: str
    name: str
    description: str = ""
    banner_url: str | None = None
    display_order: int
    product_count: int
    show_product_count: bool = True
    default_expanded: bool = False


class CataloguePreviewCardTheme(BaseModel):
    key: str
    variant: Literal["rounded", "editorial", "framed", "contrast", "minimal"]
    accent_color: str
    strong_color: str
    surface_color: str
    border_color: str
    text_color: str


class CatalogueOnlineCover(BaseModel):
    asset_id: uuid.UUID
    file_name: str
    width: int
    height: int
    url: str


class CataloguePreviewResponse(BaseModel):
    catalogue_id: uuid.UUID
    studio_design_id: uuid.UUID | None = None
    studio_preview_href: str | None = None
    version: int | None
    title: str
    description: str
    audience: str
    language: str
    status: CatalogueStatus
    is_draft: bool
    product_card_style: Literal["standard", "erp_detail"] = "standard"
    product_card_theme: CataloguePreviewCardTheme | None = None
    price_list: CataloguePreviewPriceList | None = None
    show_prices: bool
    currency: str | None
    product_count: int
    products: list[CataloguePreviewProduct]
    categories: list[CataloguePreviewCategory] = Field(default_factory=list)
    cover: CataloguePreviewCover | None = None
    online_cover: CatalogueOnlineCover | None = None
    valid_from: datetime | None = None
    valid_until: datetime | None = None
    generated_at: datetime
    promotions: list[dict] = Field(default_factory=list)


class CatalogueVersionResponse(BaseModel):
    id: uuid.UUID
    catalogue_id: uuid.UUID
    version_number: int
    snapshot: dict
    published_by_id: uuid.UUID | None
    published_at: datetime
