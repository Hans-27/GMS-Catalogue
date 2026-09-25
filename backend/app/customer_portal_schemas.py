from datetime import datetime
import uuid

from pydantic import BaseModel


class CustomerPortalIdentity(BaseModel):
    code: str
    name: str
    audience_code: str
    audience_name: str


class CustomerPortalCatalogue(BaseModel):
    id: uuid.UUID
    title: str
    brand: str | None = None
    description: str
    updated_at: datetime
    product_count: int
    cover_url: str | None = None
    public_url: str
    pdf_url: str | None = None
    allow_pdf_download: bool


class CustomerPortalPromotion(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    cover_url: str | None = None
    start_at: datetime
    end_at: datetime
    public_url: str
    catalogue_ids: list[uuid.UUID]


class CustomerPortalBrandPrice(BaseModel):
    brand: str
    price_list_code: str
    price_list_name: str
    is_brand_override: bool


class CustomerPortalResponse(BaseModel):
    customer: CustomerPortalIdentity
    catalogues: list[CustomerPortalCatalogue]
    promotions: list[CustomerPortalPromotion]
    brand_prices: list[CustomerPortalBrandPrice]
