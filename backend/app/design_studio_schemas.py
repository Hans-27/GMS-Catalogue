import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


PageType = Literal[
    "cover", "introduction", "category", "product_grid", "product_detail", "product",
    "promotion", "terms", "blank", "brand_intro", "table_of_contents", "free_layout", "final",
]
ElementType = Literal[
    "text", "image", "image_carousel", "logo", "video", "shape", "icon", "button", "qr_code",
    "line", "rectangle", "circle", "barcode", "page_number", "catalogue_field",
    "promotion_field", "product_card", "product_grid", "product_field", "category_field", "background", "table",
]


class CarouselImage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    assetId: uuid.UUID | None = None
    productImageId: uuid.UUID | None = None
    productId: uuid.UUID | None = None
    url: str | None = Field(default=None, max_length=2000)
    fileName: str = Field(default="Image", max_length=255)
    altText: str = Field(default="", max_length=320)
    sourceType: Literal["product_image", "catalogue_media", "brand_media", "user_upload"] = "user_upload"
    displayOrder: int = Field(ge=1, le=1000)
    isActive: bool = True
    fit: Literal["contain", "cover", "fill", "custom"] = "contain"
    positionX: float = Field(default=50, ge=0, le=100)
    positionY: float = Field(default=50, ge=0, le=100)
    zoom: float = Field(default=1, ge=1, le=4)


class CarouselTransition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["slide", "fade", "none"] = "slide"
    durationMs: int = Field(default=350, ge=0, le=5000)
    direction: Literal["horizontal", "vertical"] = "horizontal"
    easing: Literal["ease", "ease-in", "ease-out", "ease-in-out", "linear"] = "ease"
    autoplay: bool = True
    autoplayDelayMs: int = Field(default=3000, ge=2000, le=120000)
    loop: bool = True
    pauseOnHover: bool = True
    swipe: bool = True


class CarouselNavigation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    showArrows: bool = True
    showSingleImageArrows: bool = False
    arrowVisibility: Literal["always", "hover", "hidden"] = "hover"
    arrowPosition: Literal["inside", "outside"] = "inside"
    arrowSize: int = Field(default=36, ge=24, le=96)
    arrowBackground: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    arrowColor: str = Field(default="#126B3A", pattern=r"^#[0-9A-Fa-f]{6}$")
    arrowOpacity: float = Field(default=.96, ge=0, le=1)
    arrowCornerRadius: int = Field(default=999, ge=0, le=999)
    paginationType: Literal["dots", "numbers", "thumbnails", "hidden"] = "dots"
    paginationPosition: Literal["inside_bottom", "outside_bottom", "inside_top"] = "inside_bottom"
    indicatorSize: int = Field(default=8, ge=4, le=32)
    indicatorSpacing: int = Field(default=6, ge=0, le=40)
    showImageCount: bool = False


class CarouselDisplay(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fit: Literal["contain", "cover", "fill", "custom"] = "contain"
    backgroundColor: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    padding: int = Field(default=0, ge=0, le=200)
    borderRadius: int = Field(default=8, ge=0, le=500)
    loadingPlaceholder: str = Field(default="Loading image…", max_length=160)


class CarouselPdfFallback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fallbackMode: Literal["first_image", "selected_cover", "image_grid", "contact_sheet"] = "first_image"
    selectedImageId: str | None = Field(default=None, max_length=100)
    gridColumns: Literal[2, 3, 4] = 2


class CarouselConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sourceType: Literal["product_images", "selected_product_images", "uploaded_images", "mixed"] = "selected_product_images"
    productId: uuid.UUID | None = None
    productIds: list[uuid.UUID] = Field(default_factory=list, max_length=100)
    includeMainImage: bool = True
    includeAdditionalImages: bool = True
    selectedImageIds: list[uuid.UUID] = Field(default_factory=list, max_length=200)
    autoIncludeNewImages: bool = False
    currentIndex: int = Field(default=0, ge=0, le=999)
    images: list[CarouselImage] = Field(default_factory=list, max_length=200)
    transition: CarouselTransition = Field(default_factory=CarouselTransition)
    navigation: CarouselNavigation = Field(default_factory=CarouselNavigation)
    display: CarouselDisplay = Field(default_factory=CarouselDisplay)
    pdf: CarouselPdfFallback = Field(default_factory=CarouselPdfFallback)

    @field_validator("images")
    @classmethod
    def validate_image_order(cls, value):
        orders = [image.displayOrder for image in value]
        if len(orders) != len(set(orders)):
            raise ValueError("Carousel image order must be unique.")
        return value


def reject_unsafe_document(value: Any, *, depth: int = 0) -> Any:
    if depth > 12:
        raise ValueError("The editor document is nested too deeply.")
    if isinstance(value, dict):
        if len(value) > 500:
            raise ValueError("The editor document contains too many properties.")
        for key, nested in value.items():
            normalized = str(key).casefold()
            if normalized in {"html", "innerhtml", "dangerouslysetinnerhtml", "javascript", "script", "srcdoc"}:
                raise ValueError("HTML and JavaScript are not allowed in editor documents.")
            reject_unsafe_document(nested, depth=depth + 1)
    elif isinstance(value, list):
        if len(value) > 1000:
            raise ValueError("The editor document contains too many items.")
        for nested in value:
            reject_unsafe_document(nested, depth=depth + 1)
    elif isinstance(value, str):
        normalized = value.casefold().replace(" ", "")
        if "<script" in normalized or "javascript:" in normalized or "data:text/html" in normalized:
            raise ValueError("Unsafe HTML or JavaScript is not allowed.")
    return value


class ElementStyle(BaseModel):
    model_config = ConfigDict(extra="allow")
    backgroundColor: str | None = None
    color: str | None = None
    borderRadius: int | str | None = None
    borderWidth: int | None = Field(default=None, ge=0, le=100)
    borderColor: str | None = None
    fontSize: int | None = Field(default=None, ge=6, le=500)
    fontFamily: str | None = None
    fontWeight: Literal["normal", "bold"] | None = None
    fontStyle: Literal["normal", "italic"] | None = None
    textAlign: Literal["left", "center", "right", "justify"] | None = None
    objectFit: Literal["contain", "cover", "fill", "original", "custom"] | None = None
    tableHeader: bool | None = None
    tableStriped: bool | None = None
    tableShowBorders: bool | None = None
    tableCellPadding: int | None = Field(default=None, ge=0, le=100)
    tableBorderWidth: int | None = Field(default=None, ge=0, le=20)
    tableVerticalAlign: Literal["top", "middle", "bottom"] | None = None


class DesignElement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=100)
    type: ElementType
    name: str = Field(default="Element", max_length=160)
    xPercent: float = Field(default=10, ge=-100, le=200)
    yPercent: float = Field(default=10, ge=-100, le=200)
    widthPercent: float = Field(default=30, gt=0, le=300)
    heightPercent: float = Field(default=20, gt=0, le=300)
    rotation: float = Field(default=0, ge=-3600, le=3600)
    opacity: float = Field(default=1, ge=0, le=1)
    zIndex: int = Field(default=1, ge=-10000, le=10000)
    locked: bool = False
    visible: bool = True
    groupId: str | None = Field(default=None, max_length=100)
    text: str | None = Field(default=None, max_length=5000)
    assetId: uuid.UUID | None = None
    productId: uuid.UUID | None = None
    categoryId: int | None = None
    templateId: uuid.UUID | None = None
    binding: str | None = Field(default=None, max_length=160)
    target: str | None = Field(default=None, max_length=2000)
    style: ElementStyle = Field(default_factory=ElementStyle)
    responsive: dict[str, Any] = Field(default_factory=dict)
    carousel: CarouselConfig | None = None

    @model_validator(mode="after")
    def validate_payload(self):
        reject_unsafe_document(self.model_dump(mode="json"))
        return self


class CanvasSettings(BaseModel):
    width: int = Field(ge=200, le=10000)
    height: int = Field(ge=200, le=10000)
    backgroundColor: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$")
    gridSize: int = Field(default=10, ge=1, le=500)
    showGrid: bool = False
    showGuides: bool = True
    showSafeArea: bool = True
    bleed: int = Field(default=0, ge=0, le=200)


class PageDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pageId: str = Field(min_length=1, max_length=100)
    pageType: PageType
    name: str = Field(min_length=1, max_length=160)
    navigationCategory: str | None = Field(default=None, max_length=160)
    # Promotion pages retain a lightweight reference to the promotion record.
    # The public catalogue uses this reference to include the page only while
    # that promotion is active for the current catalogue audience.
    promotionId: uuid.UUID | None = None
    promotionStatus: str | None = Field(default=None, max_length=30)
    promotionStartAt: datetime | None = None
    promotionEndAt: datetime | None = None
    canvas: CanvasSettings
    elements: list[DesignElement] = Field(default_factory=list, max_length=1000)
    dataMode: Literal["live", "snapshot"] = "live"


class DesignCreate(BaseModel):
    catalogue_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=220)
    size_preset: Literal["a4_portrait", "a4_landscape", "square", "landscape_16_9", "custom"] = "a4_portrait"
    page_width: int = Field(default=794, ge=200, le=10000)
    page_height: int = Field(default=1123, ge=200, le=10000)
    orientation: Literal["portrait", "landscape", "square"] = "portrait"
    data_mode: Literal["live", "snapshot"] = "live"
    start_mode: Literal["blank", "system_template", "my_template", "upload_template"] = "system_template"
    template_id: uuid.UUID | None = None
    catalogue_type: Literal["standard", "booklet", "promotion"] = "standard"
    brand_mode: Literal["single", "multiple"] = "single"
    brand_ids: list[int] = Field(default_factory=list, max_length=200)
    price_slots: list["PriceSlotPayload"] = Field(default_factory=list, max_length=2)
    promotion: "PromotionSettingsPayload | None" = None

    @model_validator(mode="after")
    def validate_design_options(self):
        if self.brand_mode == "multiple" and len(set(self.brand_ids)) < 2:
            raise ValueError("Multiple-brand catalogues require at least two brands.")
        if self.brand_mode == "single" and len(set(self.brand_ids)) > 1:
            raise ValueError("Single-brand catalogues may select only one brand.")
        if self.catalogue_type == "promotion" and not self.promotion:
            raise ValueError("Promotion settings are required for a promotion catalogue.")
        return self


# Resolve forward annotations used by the create workflow after all related
# request models in this module have been declared.


class DesignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=220)
    status: Literal["draft", "in_review", "approved", "published", "archived"] | None = None
    data_mode: Literal["live", "snapshot"] | None = None
    expected_revision: int = Field(ge=1)


class PageCreate(BaseModel):
    page_type: PageType
    page_name: str = Field(min_length=1, max_length=160)
    width: int = Field(ge=200, le=10000)
    height: int = Field(ge=200, le=10000)
    orientation: Literal["portrait", "landscape", "square"] = "portrait"
    background_color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$")
    page_data: PageDocument
    is_visible: bool = True
    is_locked: bool = False


class PageUpdate(BaseModel):
    page_name: str | None = Field(default=None, min_length=1, max_length=160)
    page_type: PageType | None = None
    background_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}(?:[0-9A-Fa-f]{2})?$")
    page_data: PageDocument | None = None
    is_visible: bool | None = None
    is_locked: bool | None = None
    width: int | None = Field(default=None, ge=200, le=10000)
    height: int | None = Field(default=None, ge=200, le=10000)
    orientation: Literal["portrait", "landscape", "square"] | None = None
    expected_revision: int = Field(ge=1)


class PageOrderUpdate(BaseModel):
    page_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)
    expected_revision: int = Field(ge=1)


class ElementMutation(BaseModel):
    element: DesignElement
    expected_revision: int = Field(ge=1)


class ElementsBulkMutation(BaseModel):
    elements: list[DesignElement] = Field(max_length=1000)
    expected_revision: int = Field(ge=1)


class VersionCreate(BaseModel):
    change_summary: str = Field(default="Manual checkpoint", max_length=500)
    expected_revision: int = Field(ge=1)


class PriceSlotPayload(BaseModel):
    slot_number: Literal[1, 2]
    price_list_id: int | None = None
    display_label: str = Field(min_length=1, max_length=120)
    currency_display: Literal["code", "symbol", "hidden"] = "code"
    decimal_places: int = Field(default=2, ge=0, le=4)
    is_visible: bool = True


class PromotionSettingsPayload(BaseModel):
    promotion_name: str = Field(min_length=1, max_length=220)
    occasion_id: int | None = None
    start_at: datetime
    end_at: datetime
    timezone: str = Field(default="Asia/Bangkok", min_length=1, max_length=80)
    priority: int = Field(default=50, ge=0, le=1000)
    terms: str = Field(default="", max_length=12000)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_at <= self.start_at:
            raise ValueError("Promotion end date must be later than its start date.")
        return self


class DesignConfigurationUpdate(BaseModel):
    expected_revision: int = Field(ge=1)
    brand_mode: Literal["single", "multiple"]
    brand_ids: list[int] = Field(default_factory=list, max_length=200)
    price_slots: list[PriceSlotPayload] = Field(default_factory=list, max_length=2)
    promotion: PromotionSettingsPayload | None = None

    @model_validator(mode="after")
    def validate_options(self):
        if self.brand_mode == "multiple" and len(set(self.brand_ids)) < 2:
            raise ValueError("Multiple-brand catalogues require at least two brands.")
        if self.brand_mode == "single" and len(set(self.brand_ids)) > 1:
            raise ValueError("Single-brand catalogues may select only one brand.")
        if len({slot.slot_number for slot in self.price_slots}) != len(self.price_slots):
            raise ValueError("Each price slot may be configured only once.")
        return self


class DesignProductPayload(BaseModel):
    product_id: uuid.UUID
    is_visible: bool = True
    selected_video_id: uuid.UUID | None = None


class DesignProductsUpdate(BaseModel):
    expected_revision: int = Field(ge=1)
    products: list[DesignProductPayload] = Field(default_factory=list, max_length=5000)

    @field_validator("products")
    @classmethod
    def unique_products(cls, value):
        ids = [item.product_id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("A product can be selected only once.")
        return value


class DesignProductVisibilityUpdate(BaseModel):
    expected_revision: int = Field(ge=1)
    is_visible: bool


class PromotionActionPayload(BaseModel):
    expected_revision: int = Field(ge=1)


class StudioValidateResponse(BaseModel):
    valid: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DesignBrandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    brand_id: int
    display_order: int
    is_visible: bool


class DesignPriceSlotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    slot_number: int
    price_list_id: int | None
    display_label: str
    currency_display: str
    decimal_places: int
    is_visible: bool


class DesignProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    product_id: uuid.UUID
    display_order: int
    is_visible: bool
    hidden_reason: str
    selected_video_id: uuid.UUID | None


class TemplatePayload(BaseModel):
    template_type: Literal["catalogue", "cover", "category", "product_page", "product_card", "product_image", "promotion", "final", "blank_layout"]
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2000)
    template_data: dict[str, Any]
    brand_id: int | None = None
    department_id: int | None = None
    team_id: int | None = None
    brand_scope: list[int] = Field(default_factory=list, max_length=200)
    category_scope: list[int] = Field(default_factory=list, max_length=500)
    visibility_scope: Literal["private", "company", "department", "team"] = "company"
    tags: list[str] = Field(default_factory=list, max_length=30)

    @field_validator("template_data")
    @classmethod
    def safe_template(cls, value):
        return reject_unsafe_document(value)


class ProductCardTemplatePayload(BaseModel):
    name: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=2000)
    template_type: str = Field(default="standard", min_length=1, max_length=40)
    template_data: dict[str, Any] = Field(default_factory=dict)
    card_width: int = Field(default=320, ge=80, le=3000)
    card_height: int = Field(default=420, ge=80, le=3000)
    border_radius: int = Field(default=16, ge=0, le=1000)
    dimension_unit: Literal["px", "mm", "%"] = "px"
    layout_mode: Literal["responsive", "fixed", "freeform"] = "responsive"
    min_width: int = Field(default=120, ge=40, le=3000)
    min_height: int = Field(default=100, ge=40, le=3000)
    aspect_ratio: float | None = Field(default=None, gt=0, le=20)
    price_mode: Literal["one_price", "two_prices", "no_price"] = "one_price"
    visibility_scope: Literal["only_me", "team", "department", "selected_users", "company"] = "only_me"
    is_company_template: bool = False
    brand_scope: list[int] = Field(default_factory=list, max_length=500)
    category_scope: list[int] = Field(default_factory=list, max_length=500)
    thumbnail_storage_key: str | None = Field(default=None, max_length=500)
    is_active: bool = True
    change_note: str = Field(default="Initial version", max_length=500)

    @field_validator("template_data")
    @classmethod
    def safe_template(cls, value):
        return reject_unsafe_document(value)

    @model_validator(mode="after")
    def valid_dimensions(self):
        if self.min_width > self.card_width or self.min_height > self.card_height:
            raise ValueError("Minimum dimensions cannot exceed the default card dimensions.")
        return self


class ProductCardTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=2000)
    template_type: str | None = Field(default=None, min_length=1, max_length=40)
    template_data: dict[str, Any] | None = None
    card_width: int | None = Field(default=None, ge=80, le=3000)
    card_height: int | None = Field(default=None, ge=80, le=3000)
    border_radius: int | None = Field(default=None, ge=0, le=1000)
    dimension_unit: Literal["px", "mm", "%"] | None = None
    layout_mode: Literal["responsive", "fixed", "freeform"] | None = None
    min_width: int | None = Field(default=None, ge=40, le=3000)
    min_height: int | None = Field(default=None, ge=40, le=3000)
    aspect_ratio: float | None = Field(default=None, gt=0, le=20)
    price_mode: Literal["one_price", "two_prices", "no_price"] | None = None
    visibility_scope: Literal["only_me", "team", "department", "selected_users", "company"] | None = None
    is_company_template: bool | None = None
    brand_scope: list[int] | None = Field(default=None, max_length=500)
    category_scope: list[int] | None = Field(default=None, max_length=500)
    thumbnail_storage_key: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None
    change_note: str = Field(default="Updated template", max_length=500)

    @field_validator("template_data")
    @classmethod
    def safe_template(cls, value):
        return reject_unsafe_document(value) if value is not None else value


class ProductCardTemplateVersionPayload(BaseModel):
    change_note: str = Field(default="Saved version", max_length=500)
    template_data: dict[str, Any] | None = None

    @field_validator("template_data")
    @classmethod
    def safe_template(cls, value):
        return reject_unsafe_document(value) if value is not None else value


class ExportJobCreate(BaseModel):
    export_type: Literal["pdf", "print_pdf", "web_pdf", "png", "jpeg", "template"]
    version_id: uuid.UUID | None = None
    options: dict[str, Any] = Field(default_factory=dict)

    @field_validator("options")
    @classmethod
    def safe_options(cls, value):
        return reject_unsafe_document(value)


class PalettePayload(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    brand_id: int | None = None
    colors: dict[str, str]
    is_active: bool = True

    @field_validator("colors")
    @classmethod
    def validate_colors(cls, value):
        if not value or len(value) > 30:
            raise ValueError("Provide between 1 and 30 palette colors.")
        for color in value.values():
            if not isinstance(color, str) or not color.startswith("#") or len(color) not in {7, 9}:
                raise ValueError("Palette colors must use HEX format.")
        return value


class PageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    design_id: uuid.UUID
    page_type: str
    page_name: str
    display_order: int
    width: int
    height: int
    orientation: str
    background_color: str
    page_data_json: dict
    is_visible: bool
    is_locked: bool
    created_at: datetime
    updated_at: datetime


class DesignResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    catalogue_id: uuid.UUID | None
    name: str
    status: str
    page_width: int
    page_height: int
    orientation: str
    size_preset: str
    data_mode: str
    catalogue_type: str
    brand_mode: str
    start_at: datetime | None
    end_at: datetime | None
    timezone: str
    promotion_name: str
    promotion_status: str | None
    promotion_occasion_id: int | None
    promotion_priority: int
    promotion_terms: str
    current_version: int
    revision: int
    online_cover_json: dict | None = None
    published_online_cover_json: dict | None = None
    created_at: datetime
    updated_at: datetime
    pages: list[PageResponse] = Field(default_factory=list)
    selected_brands: list[DesignBrandResponse] = Field(default_factory=list)
    price_slots: list[DesignPriceSlotResponse] = Field(default_factory=list)
    product_items: list[DesignProductResponse] = Field(default_factory=list)


class DesignSummaryResponse(BaseModel):
    """Lightweight catalogue card data for the Studio library.

    Canvas documents and product selections can be large, so the collection
    endpoint deliberately returns counts instead of loading every child row.
    """

    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    catalogue_id: uuid.UUID | None
    name: str
    status: str
    page_width: int
    page_height: int
    orientation: str
    size_preset: str
    data_mode: str
    catalogue_type: str
    brand_mode: str
    current_version: int
    revision: int
    created_at: datetime
    updated_at: datetime
    page_count: int = 0
    product_count: int = 0
    brand_count: int = 0


class TemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    template_type: str
    name: str
    description: str
    template_data_json: dict
    owner_user_id: uuid.UUID | None
    department_id: int | None
    team_id: int | None
    brand_scope_json: list
    category_scope_json: list
    visibility_scope: str
    is_company_template: bool
    approval_status: str
    approved_by_id: uuid.UUID | None
    approved_at: datetime | None
    version: int
    is_active: bool
    usage_count: int
    tags: list
    created_at: datetime
    updated_at: datetime


class ProductCardTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: str
    template_type: str
    template_data_json: dict
    card_width: int
    card_height: int
    border_radius: int
    dimension_unit: str
    layout_mode: str
    min_width: int
    min_height: int
    aspect_ratio: float | None
    price_mode: str
    visibility_scope: str
    is_company_template: bool
    approval_status: str
    current_version: int
    brand_scope_json: list
    category_scope_json: list
    thumbnail_storage_key: str | None
    owner_user_id: uuid.UUID | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ProductCardTemplateVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    template_id: uuid.UUID
    version_number: int
    width: int
    height: int
    layout_mode: str
    card_properties_json: dict
    elements_json: list
    change_note: str
    created_by_id: uuid.UUID | None
    created_at: datetime


class VersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    design_id: uuid.UUID
    version_number: int
    snapshot_json: dict
    change_summary: str
    created_at: datetime


class AssetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    asset_type: str
    original_filename: str
    mime_type: str
    file_size: int
    width: int | None
    height: int | None
    alt_text: str
    tags: list
    url: str
    created_at: datetime


class ExportJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    design_id: uuid.UUID
    version_id: uuid.UUID | None
    export_type: str
    status: str
    options_json: dict
    storage_key: str | None
    file_size: int | None
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


class PaletteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    brand_id: int | None
    colors_json: dict
    is_active: bool
    created_at: datetime
    updated_at: datetime


DesignCreate.model_rebuild()
