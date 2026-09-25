import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.commerce_schemas import CataloguePreviewResponse


class AudienceTypeCreate(BaseModel):
    code: str = Field(pattern=r"^[a-z0-9_]+$", min_length=2, max_length=50)
    display_name: str = Field(min_length=2, max_length=120)
    price_list_id: int | None = None
    show_prices: bool = True
    display_order: int = Field(default=0, ge=0, le=1000)
    button_style_key: str = Field(default="default", max_length=30)
    is_active: bool = True


class AudienceTypeUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=120)
    price_list_id: int | None = None
    show_prices: bool | None = None
    display_order: int | None = Field(default=None, ge=0, le=1000)
    button_style_key: str | None = Field(default=None, max_length=30)
    is_active: bool | None = None


class AudienceTypeResponse(BaseModel):
    id: int
    code: str
    display_name: str
    price_list_id: int | None
    price_list_name: str | None = None
    show_prices: bool
    display_order: int
    button_style_key: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class ShareLinkCreate(BaseModel):
    audience_type_id: int
    customer_code: str | None = Field(
        default=None,
        min_length=2,
        max_length=80,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]*$",
    )
    customer_name: str | None = Field(default=None, min_length=2, max_length=160)
    version_mode: Literal["latest_published", "fixed_published"] = "latest_published"
    fixed_version_number: int | None = Field(default=None, ge=1)
    expires_at: datetime | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    allow_pdf_download: bool = True
    allow_print: bool = True


class ShareLinkUpdate(BaseModel):
    customer_name: str | None = Field(default=None, min_length=2, max_length=160)
    version_mode: Literal["latest_published", "fixed_published"] | None = None
    fixed_version_number: int | None = Field(default=None, ge=1)
    expires_at: datetime | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    allow_pdf_download: bool | None = None
    allow_print: bool | None = None


class ShareLinkResponse(BaseModel):
    id: uuid.UUID | None = None
    catalogue_id: uuid.UUID
    audience_type_id: int
    audience_code: str
    audience_name: str
    customer_code: str | None = None
    customer_name: str | None = None
    price_list_id: int | None
    price_list_name: str | None
    show_prices: bool
    button_style_key: str
    status: str
    version_mode: str
    fixed_version_number: int | None
    expires_at: datetime | None
    has_password: bool
    allow_pdf_download: bool
    allow_print: bool
    created_at: datetime | None
    updated_at: datetime | None
    last_accessed_at: datetime | None
    view_count: int
    public_url: str | None = None


class PublicCatalogueResponse(CataloguePreviewResponse):
    audience_type: str
    audience_code: str
    customer_name: str | None = None
    allow_pdf_download: bool
    allow_print: bool
    password_protected: bool
