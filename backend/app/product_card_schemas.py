import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


ALLOWED_PRESENTATION_KEYS = {
    "display_name",
    "display_name_th",
    "description",
    "description_th",
    "badge",
    "image_urls",
    "appearance",
    "visible_fields",
    "layout",
}


class ProductCardDraftPayload(BaseModel):
    template_id: uuid.UUID | None = None
    revision: int = Field(ge=0)
    presentation: dict[str, Any]

    @field_validator("presentation")
    @classmethod
    def validate_presentation(cls, value: dict[str, Any]) -> dict[str, Any]:
        forbidden = sorted(set(value) - ALLOWED_PRESENTATION_KEYS)
        if forbidden:
            raise ValueError(f"ERP-owned or unsupported fields cannot be edited: {', '.join(forbidden)}")
        images = value.get("image_urls")
        if images is not None and (
            not isinstance(images, list)
            or any(not isinstance(item, str) or not item.startswith("/uploads/") for item in images)
        ):
            raise ValueError("image_urls must contain synchronized /uploads/ image paths")
        return value


class ProductCardPublishPayload(BaseModel):
    revision: int = Field(ge=1)
    change_note: str = Field(default="", max_length=500)


class ProductCardRestorePayload(BaseModel):
    change_note: str = Field(default="Restored previous product-card version", max_length=500)


class ProductCardVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    version_number: int
    template_id: uuid.UUID | None
    presentation_json: dict[str, Any]
    change_note: str
    published_by_id: uuid.UUID | None
    published_at: datetime


class ProductCardSummary(BaseModel):
    product_id: uuid.UUID
    code: str
    name: str
    brand: str | None
    category: str | None
    primary_image_url: str | None
    template_id: uuid.UUID | None
    has_draft: bool
    is_published: bool
    draft_revision: int
    active_version: int
    affected_catalogue_count: int
    updated_at: datetime | None


class ProductCardPage(BaseModel):
    items: list[ProductCardSummary]
    total: int
    page: int
    page_size: int


class ProductCardDetail(ProductCardSummary):
    draft: dict[str, Any]
    published: dict[str, Any] | None
    images: list[dict[str, Any]]
    affected_catalogues: list[dict[str, Any]]
    erp_fields: dict[str, Any]
    published_at: datetime | None
