import uuid
from datetime import datetime, time

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CatalogueCoverFile(Base):
    __tablename__ = "catalogue_cover_files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    catalogue_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), unique=True, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    preview_storage_key: Mapped[str | None] = mapped_column(String(500))
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    display_mode: Mapped[str] = mapped_column(String(20), default="cover", nullable=False)
    alt_text: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    subtitle: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    show_title_overlay: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_logo_overlay: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    cover_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    position_x: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    position_y: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CatalogueCoverSetting(Base):
    """Editable cover configuration for the current catalogue draft.

    Published catalogues keep an immutable copy of this data inside the
    CatalogueVersion snapshot.  Coordinates are percentages so the same
    configuration can be rendered on web, mobile, print, and A4 PDF pages.
    """

    __tablename__ = "catalogue_cover_settings"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    catalogue_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), unique=True, nullable=False)
    cover_mode: Mapped[str] = mapped_column(String(30), default="custom", nullable=False)
    catalogue_name: Mapped[str] = mapped_column(String(220), nullable=False)
    catalogue_year: Mapped[str] = mapped_column(String(12), default="", nullable=False)
    subtitle: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    company_name: Mapped[str] = mapped_column(String(220), default="", nullable=False)
    collection_name: Mapped[str] = mapped_column(String(220), default="", nullable=False)
    background_color: Mapped[str] = mapped_column(String(9), default="#164f35", nullable=False)
    overlay_color: Mapped[str] = mapped_column(String(9), default="#081f14", nullable=False)
    overlay_opacity: Mapped[float] = mapped_column(Float, default=0.28, nullable=False)
    background_fit: Mapped[str] = mapped_column(String(20), default="cover", nullable=False)
    show_catalogue_name: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_catalogue_year: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_subtitle: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_brand_logo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_company_logo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    show_start_button: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    title_color: Mapped[str] = mapped_column(String(9), default="#ffffff", nullable=False)
    title_font_size: Mapped[int] = mapped_column(Integer, default=72, nullable=False)
    title_alignment: Mapped[str] = mapped_column(String(10), default="left", nullable=False)
    title_position_x_percent: Mapped[float] = mapped_column(Float, default=10, nullable=False)
    title_position_y_percent: Mapped[float] = mapped_column(Float, default=68, nullable=False)
    title_width_percent: Mapped[float] = mapped_column(Float, default=80, nullable=False)
    title_z_index: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    subtitle_color: Mapped[str] = mapped_column(String(9), default="#ffffff", nullable=False)
    subtitle_font_size: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    subtitle_position_x_percent: Mapped[float] = mapped_column(Float, default=10, nullable=False)
    subtitle_position_y_percent: Mapped[float] = mapped_column(Float, default=86, nullable=False)
    cover_alt_text: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CatalogueCoverAsset(Base):
    __tablename__ = "catalogue_cover_assets"
    __table_args__ = (
        Index("ix_catalogue_cover_assets_active", "catalogue_id", "asset_type", "deleted_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    catalogue_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(30), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    preview_storage_key: Mapped[str | None] = mapped_column(String(500))
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(80), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    alt_text: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    position_x_percent: Mapped[float] = mapped_column(Float, default=50, nullable=False)
    position_y_percent: Mapped[float] = mapped_column(Float, default=15, nullable=False)
    width_percent: Mapped[float] = mapped_column(Float, default=24, nullable=False)
    height_percent: Mapped[float] = mapped_column(Float, default=16, nullable=False)
    opacity: Mapped[float] = mapped_column(Float, default=1, nullable=False)
    rotation: Mapped[float] = mapped_column(Float, default=0, nullable=False)
    z_index: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CatalogueCategorySetting(Base):
    __tablename__ = "catalogue_category_settings"
    __table_args__ = (
        UniqueConstraint("catalogue_id", "category_id", name="uq_catalogue_category_setting"),
        Index("ix_catalogue_category_order", "catalogue_id", "display_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    catalogue_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False)
    display_name: Mapped[str] = mapped_column(String(180), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    banner_storage_key: Mapped[str | None] = mapped_column(String(500))
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    show_product_count: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    default_expanded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class BackupJob(Base):
    __tablename__ = "backup_jobs"
    __table_args__ = (Index("ix_backup_jobs_type_created", "backup_type", "created_at"), Index("ix_backup_jobs_status", "status"))

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    backup_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    description: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    file_name: Mapped[str | None] = mapped_column(String(255))
    storage_path: Mapped[str | None] = mapped_column(String(800))
    file_size: Mapped[int | None] = mapped_column(Integer)
    checksum: Mapped[str | None] = mapped_column(String(64))
    application_version: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BackupSchedule(Base):
    __tablename__ = "backup_schedules"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    backup_type: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    frequency: Mapped[str] = mapped_column(String(20), default="daily", nullable=False)
    scheduled_time: Mapped[time | None] = mapped_column()
    timezone: Mapped[str] = mapped_column(String(80), default="Asia/Bangkok", nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    retention_count: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SystemMetricSnapshot(Base):
    __tablename__ = "system_metric_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    cpu_percent: Mapped[float] = mapped_column(Float, nullable=False)
    memory_percent: Mapped[float] = mapped_column(Float, nullable=False)
    disk_percent: Mapped[float] = mapped_column(Float, nullable=False)
    api_response_ms: Mapped[float] = mapped_column(Float, nullable=False)
    database_response_ms: Mapped[float] = mapped_column(Float, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
