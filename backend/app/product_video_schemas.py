import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class ProductVideoResponse(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    source_type: Literal["upload", "external"]
    title_en: str
    title_th: str
    description: str
    alt_text: str
    provider: Literal["internal", "youtube", "vimeo", "direct_url"]
    external_url: str | None = None
    external_video_id: str | None = None
    playback_url: str
    thumbnail_url: str | None = None
    caption_url: str | None = None
    original_filename: str | None = None
    mime_type: str | None = None
    file_size: int | None = None
    duration_seconds: float | None = None
    width: int | None = None
    height: int | None = None
    display_order: int
    is_featured: bool
    is_active: bool
    show_in_catalogue: bool
    show_in_public_catalogue: bool
    show_controls: bool
    allow_download: bool
    autoplay: bool
    muted: bool
    loop: bool
    processing_status: str
    uploaded_by_id: uuid.UUID | None = None
    uploaded_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class ProductVideoUpdate(BaseModel):
    title_en: str | None = Field(default=None, max_length=255)
    title_th: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=12000)
    alt_text: str | None = Field(default=None, max_length=255)
    display_order: int | None = Field(default=None, ge=0, le=10000)
    is_featured: bool | None = None
    is_active: bool | None = None
    show_in_catalogue: bool | None = None
    show_in_public_catalogue: bool | None = None
    show_controls: bool | None = None
    allow_download: bool | None = None
    autoplay: bool | None = None
    muted: bool | None = None
    loop: bool | None = None

    @field_validator("title_en", "title_th", "description", "alt_text")
    @classmethod
    def strip_text(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def autoplay_requires_muted(self):
        if self.autoplay is True and self.muted is False:
            raise ValueError("Autoplay videos must be muted.")
        return self


class VideoReorderItem(BaseModel):
    video_id: uuid.UUID
    display_order: int = Field(ge=0, le=10000)


class ProductVideoReorder(BaseModel):
    videos: list[VideoReorderItem] = Field(min_length=1, max_length=100)

    @field_validator("videos")
    @classmethod
    def unique_ids(cls, value: list[VideoReorderItem]) -> list[VideoReorderItem]:
        ids = [item.video_id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("Each video may be listed only once.")
        return value
