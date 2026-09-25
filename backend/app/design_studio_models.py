import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Float,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class CatalogueDesign(Base):
    __tablename__ = "catalogue_designs"
    __table_args__ = (
        Index("ix_catalogue_designs_owner_updated", "created_by_id", "updated_at"),
        Index("ix_catalogue_designs_status", "status", "deleted_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    catalogue_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("catalogues.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(220), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    page_width: Mapped[int] = mapped_column(Integer, default=794, nullable=False)
    page_height: Mapped[int] = mapped_column(Integer, default=1123, nullable=False)
    orientation: Mapped[str] = mapped_column(String(20), default="portrait", nullable=False)
    size_preset: Mapped[str] = mapped_column(String(30), default="a4_portrait", nullable=False)
    data_mode: Mapped[str] = mapped_column(String(20), default="live", nullable=False)
    catalogue_type: Mapped[str] = mapped_column(String(30), default="standard", nullable=False)
    brand_mode: Mapped[str] = mapped_column(String(20), default="single", nullable=False)
    start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timezone: Mapped[str] = mapped_column(String(80), default="Asia/Bangkok", nullable=False)
    promotion_name: Mapped[str] = mapped_column(String(220), default="", nullable=False)
    promotion_status: Mapped[str | None] = mapped_column(String(30))
    promotion_occasion_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("promotion_occasions.id", ondelete="SET NULL")
    )
    promotion_priority: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    promotion_terms: Mapped[str] = mapped_column(Text, default="", nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # Independent from printable cover pages; promoted only during Publish.
    online_cover_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    published_online_cover_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    pages: Mapped[list["CatalogueDesignPage"]] = relationship(
        back_populates="design", cascade="all, delete-orphan", order_by="CatalogueDesignPage.display_order"
    )
    versions: Mapped[list["CatalogueDesignVersion"]] = relationship(
        back_populates="design", cascade="all, delete-orphan", order_by="CatalogueDesignVersion.version_number.desc()"
    )
    selected_brands: Mapped[list["CatalogueDesignBrand"]] = relationship(
        back_populates="design", cascade="all, delete-orphan", order_by="CatalogueDesignBrand.display_order"
    )
    price_slots: Mapped[list["CatalogueDesignPriceSlot"]] = relationship(
        back_populates="design", cascade="all, delete-orphan", order_by="CatalogueDesignPriceSlot.slot_number"
    )
    product_items: Mapped[list["CatalogueDesignProduct"]] = relationship(
        back_populates="design", cascade="all, delete-orphan", order_by="CatalogueDesignProduct.display_order"
    )


class CatalogueDesignPage(Base):
    __tablename__ = "catalogue_design_pages"
    __table_args__ = (
        UniqueConstraint("design_id", "display_order", name="uq_design_page_order"),
        Index("ix_design_pages_design_visible", "design_id", "is_visible"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    design_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False
    )
    page_type: Mapped[str] = mapped_column(String(40), nullable=False)
    page_name: Mapped[str] = mapped_column(String(160), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    orientation: Mapped[str] = mapped_column(String(20), default="portrait", nullable=False)
    background_color: Mapped[str] = mapped_column(String(9), default="#FFFFFF", nullable=False)
    page_data_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    thumbnail_storage_key: Mapped[str | None] = mapped_column(String(500))
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("catalogue_templates.id", ondelete="SET NULL")
    )
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    design: Mapped[CatalogueDesign] = relationship(back_populates="pages")


class CatalogueDesignBrand(Base):
    __tablename__ = "catalogue_design_brands"
    __table_args__ = (
        UniqueConstraint("design_id", "brand_id", name="uq_catalogue_design_brand"),
        UniqueConstraint("design_id", "display_order", name="uq_catalogue_design_brand_order"),
        Index("ix_catalogue_design_brands_brand", "brand_id", "is_visible"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    design_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False)
    brand_id: Mapped[int] = mapped_column(Integer, ForeignKey("brands.id", ondelete="RESTRICT"), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    design: Mapped[CatalogueDesign] = relationship(back_populates="selected_brands")


class CatalogueDesignPriceSlot(Base):
    __tablename__ = "catalogue_design_price_slots"
    __table_args__ = (
        UniqueConstraint("design_id", "slot_number", name="uq_catalogue_design_price_slot"),
        Index("ix_catalogue_design_price_slots_price_list", "price_list_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    design_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False)
    slot_number: Mapped[int] = mapped_column(Integer, nullable=False)
    price_list_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("price_lists.id", ondelete="SET NULL"))
    display_label: Mapped[str] = mapped_column(String(120), nullable=False)
    currency_display: Mapped[str] = mapped_column(String(20), default="code", nullable=False)
    decimal_places: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    design: Mapped[CatalogueDesign] = relationship(back_populates="price_slots")


class CatalogueDesignProduct(Base):
    __tablename__ = "catalogue_design_products"
    __table_args__ = (
        UniqueConstraint("design_id", "product_id", name="uq_catalogue_design_product"),
        UniqueConstraint("design_id", "display_order", name="uq_catalogue_design_product_order"),
        Index("ix_catalogue_design_products_visibility", "design_id", "is_visible"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    design_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    hidden_reason: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    selected_video_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("product_videos.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    design: Mapped[CatalogueDesign] = relationship(back_populates="product_items")


class CatalogueTemplate(Base):
    __tablename__ = "catalogue_templates"
    __table_args__ = (
        Index("ix_catalogue_templates_type_active", "template_type", "is_active"),
        Index("ix_catalogue_templates_owner", "owner_user_id", "visibility_scope"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    template_type: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    thumbnail_storage_key: Mapped[str | None] = mapped_column(String(500))
    template_data_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    brand_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("brands.id", ondelete="SET NULL"))
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.id", ondelete="SET NULL"))
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    brand_scope_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    category_scope_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    visibility_scope: Mapped[str] = mapped_column(String(30), default="company", nullable=False)
    is_company_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approval_status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProductCardTemplate(Base):
    __tablename__ = "product_card_templates"
    __table_args__ = (Index("ix_product_card_templates_active", "is_active", "updated_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    template_type: Mapped[str] = mapped_column(String(40), default="standard", nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.id", ondelete="SET NULL"))
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    thumbnail_storage_key: Mapped[str | None] = mapped_column(String(500))
    template_data_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    card_width: Mapped[int] = mapped_column(Integer, default=320, nullable=False)
    card_height: Mapped[int] = mapped_column(Integer, default=420, nullable=False)
    dimension_unit: Mapped[str] = mapped_column(String(12), default="px", nullable=False)
    layout_mode: Mapped[str] = mapped_column(String(20), default="responsive", nullable=False)
    min_width: Mapped[int] = mapped_column(Integer, default=120, nullable=False)
    min_height: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    aspect_ratio: Mapped[float | None] = mapped_column(Float)
    price_mode: Mapped[str] = mapped_column(String(20), default="one_price", nullable=False)
    visibility_scope: Mapped[str] = mapped_column(String(30), default="only_me", nullable=False)
    is_company_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    approval_status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    brand_scope_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    category_scope_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    border_radius: Mapped[int] = mapped_column(Integer, default=16, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    versions: Mapped[list["ProductCardTemplateVersion"]] = relationship(
        back_populates="template", cascade="all, delete-orphan", order_by="ProductCardTemplateVersion.version_number"
    )


class ProductCardTemplateVersion(Base):
    __tablename__ = "product_card_template_versions"
    __table_args__ = (
        UniqueConstraint("template_id", "version_number", name="uq_product_card_template_version"),
        Index("ix_product_card_template_versions_template", "template_id", "version_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("product_card_templates.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    layout_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    card_properties_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    elements_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    change_note: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    template: Mapped[ProductCardTemplate] = relationship(back_populates="versions")


class DesignAsset(Base):
    __tablename__ = "design_assets"
    __table_args__ = (
        Index("ix_design_assets_owner_type", "owner_user_id", "asset_type"),
        UniqueConstraint("checksum", "owner_user_id", name="uq_design_asset_owner_checksum"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    asset_type: Mapped[str] = mapped_column(String(40), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(120), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    alt_text: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    tags: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CatalogueDesignVersion(Base):
    __tablename__ = "catalogue_design_versions"
    __table_args__ = (
        UniqueConstraint("design_id", "version_number", name="uq_catalogue_design_version"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    design_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    change_summary: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    design: Mapped[CatalogueDesign] = relationship(back_populates="versions")


class CatalogueExportJob(Base):
    __tablename__ = "catalogue_export_jobs"
    __table_args__ = (Index("ix_catalogue_export_jobs_status", "status", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    design_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False)
    version_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("catalogue_design_versions.id", ondelete="SET NULL"))
    export_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)
    options_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(500))
    file_size: Mapped[int | None] = mapped_column(Integer)
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_message: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DesignColorPalette(Base):
    __tablename__ = "design_color_palettes"
    __table_args__ = (Index("ix_design_color_palettes_brand_active", "brand_id", "is_active"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    brand_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("brands.id", ondelete="SET NULL"))
    colors_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
