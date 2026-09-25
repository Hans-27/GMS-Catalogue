import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PromotionOccasion(Base):
    __tablename__ = "promotion_occasions"
    __table_args__ = (Index("ix_promotion_occasions_active_order", "is_active", "display_order"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String(120), nullable=False)
    name_th: Mapped[str] = mapped_column(String(120), default="", server_default="", nullable=False)
    description: Mapped[str] = mapped_column(String(500), default="", server_default="", nullable=False)
    icon_key: Mapped[str] = mapped_column(String(80), default="calendar", server_default="calendar", nullable=False)
    default_banner_style: Mapped[str] = mapped_column(String(80), default="default", server_default="default", nullable=False)
    recurring_annually: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    default_start_month: Mapped[int | None] = mapped_column(Integer)
    default_start_day: Mapped[int | None] = mapped_column(Integer)
    default_end_month: Mapped[int | None] = mapped_column(Integer)
    default_end_day: Mapped[int | None] = mapped_column(Integer)
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Promotion(Base):
    __tablename__ = "promotions"
    __table_args__ = (
        CheckConstraint("priority >= 1 AND priority <= 100", name="ck_promotion_priority"),
        CheckConstraint("end_at > start_at", name="ck_promotion_dates"),
        Index("ix_promotions_status_schedule", "status", "start_at", "end_at"),
        Index("ix_promotions_owner", "owner_user_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name_en: Mapped[str] = mapped_column(String(220), nullable=False)
    name_th: Mapped[str] = mapped_column(String(220), default="", server_default="", nullable=False)
    short_title: Mapped[str] = mapped_column(String(160), default="", server_default="", nullable=False)
    description_en: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    description_th: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    occasion_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("promotion_occasions.id", ondelete="SET NULL"))
    promotion_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", server_default="draft", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=50, server_default="50", nullable=False)
    allow_stacking: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    base_price_change_behavior: Mapped[str] = mapped_column(String(40), default="require_reapproval", server_default="require_reapproval", nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.id", ondelete="SET NULL"))
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"))
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone: Mapped[str] = mapped_column(String(60), default="Asia/Bangkok", server_default="Asia/Bangkok", nullable=False)
    publish_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    automatic_activation: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    automatic_expiration: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    repeat_annually: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    expiration_warning_days: Mapped[int] = mapped_column(Integer, default=7, server_default="7", nullable=False)
    show_stock: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    hide_out_of_stock: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    minimum_stock: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    stop_product_at_zero_stock: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    terms_en: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    terms_th: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    internal_note: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    rejection_reason: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    occasion: Mapped[PromotionOccasion | None] = relationship(lazy="joined")
    brands: Mapped[list["PromotionBrand"]] = relationship(back_populates="promotion", cascade="all, delete-orphan", lazy="selectin")
    products: Mapped[list["PromotionProduct"]] = relationship(back_populates="promotion", cascade="all, delete-orphan", lazy="selectin")
    audiences: Mapped[list["PromotionAudience"]] = relationship(back_populates="promotion", cascade="all, delete-orphan", lazy="selectin")
    catalogues: Mapped[list["PromotionCatalogue"]] = relationship(back_populates="promotion", cascade="all, delete-orphan", lazy="selectin")
    media: Mapped[list["PromotionMedia"]] = relationship(back_populates="promotion", cascade="all, delete-orphan", lazy="selectin")


class PromotionBrand(Base):
    __tablename__ = "promotion_brands"
    promotion_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True)
    brand_id: Mapped[int] = mapped_column(Integer, ForeignKey("brands.id", ondelete="RESTRICT"), primary_key=True)
    include_all_active_products: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
    promotion: Mapped[Promotion] = relationship(back_populates="brands")
    brand: Mapped["Brand"] = relationship(lazy="joined")


class PromotionProduct(Base):
    __tablename__ = "promotion_products"
    __table_args__ = (
        UniqueConstraint("promotion_id", "product_id", "audience_type_id", "price_list_id", name="uq_promotion_product_audience_price"),
        CheckConstraint("base_price IS NULL OR base_price >= 0", name="ck_promotion_product_base_price"),
        CheckConstraint("promotion_price IS NULL OR promotion_price >= 0", name="ck_promotion_product_price"),
        Index("ix_promotion_products_lookup", "product_id", "audience_type_id", "price_list_id"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    promotion_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    audience_type_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("catalogue_audience_types.id", ondelete="CASCADE"))
    price_list_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("price_lists.id", ondelete="RESTRICT"))
    promotion_type: Mapped[str] = mapped_column(String(40), nullable=False)
    base_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    approved_base_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(7, 4))
    discount_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    promotion_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    currency: Mapped[str] = mapped_column(String(3), default="THB", server_default="THB", nullable=False)
    include_in_promotion: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    promotion: Mapped[Promotion] = relationship(back_populates="products")
    product: Mapped["Product"] = relationship(lazy="joined")
    audience_type: Mapped["CatalogueAudienceType | None"] = relationship(lazy="joined")
    price_list: Mapped["PriceList | None"] = relationship(lazy="joined")


class PromotionAudience(Base):
    __tablename__ = "promotion_audiences"
    __table_args__ = (UniqueConstraint("promotion_id", "audience_type_id", "price_list_id", name="uq_promotion_audience_price"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    promotion_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False)
    audience_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("catalogue_audience_types.id", ondelete="RESTRICT"), nullable=False)
    price_list_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("price_lists.id", ondelete="SET NULL"))
    show_prices: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    promotion: Mapped[Promotion] = relationship(back_populates="audiences")
    audience_type: Mapped["CatalogueAudienceType"] = relationship(lazy="joined")
    price_list: Mapped["PriceList | None"] = relationship(lazy="joined")


class PromotionCatalogue(Base):
    __tablename__ = "promotion_catalogues"
    promotion_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True)
    catalogue_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), primary_key=True)
    promotion: Mapped[Promotion] = relationship(back_populates="catalogues")
    catalogue: Mapped["Catalogue"] = relationship(lazy="joined")


class PromotionMedia(Base):
    __tablename__ = "promotion_media"
    __table_args__ = (Index("ix_promotion_media_active", "promotion_id", "media_type", "is_active"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    promotion_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False)
    media_type: Mapped[str] = mapped_column(String(40), nullable=False)
    storage_key: Mapped[str | None] = mapped_column(String(500))
    preview_storage_key: Mapped[str | None] = mapped_column(String(500))
    external_url: Mapped[str | None] = mapped_column(String(1000))
    original_filename: Mapped[str] = mapped_column(String(255), default="", server_default="", nullable=False)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    file_size: Mapped[int | None] = mapped_column(Integer)
    alt_text: Mapped[str] = mapped_column(String(255), default="", server_default="", nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    promotion: Mapped[Promotion] = relationship(back_populates="media")


class PromotionShareLink(Base):
    __tablename__ = "promotion_share_links"
    __table_args__ = (
        Index("ix_promotion_share_status", "status", "expires_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    promotion_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False)
    audience_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("catalogue_audience_types.id", ondelete="RESTRICT"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    encrypted_token: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", server_default="active", nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    allow_pdf: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    allow_print: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    view_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    promotion: Mapped[Promotion] = relationship(lazy="joined")
    audience_type: Mapped["CatalogueAudienceType"] = relationship(lazy="joined")


class PromotionStatusHistory(Base):
    __tablename__ = "promotion_status_history"
    __table_args__ = (Index("ix_promotion_status_history", "promotion_id", "changed_at"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    promotion_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False)
    old_status: Mapped[str | None] = mapped_column(String(30))
    new_status: Mapped[str] = mapped_column(String(30), nullable=False)
    reason: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PromotionPriceHistory(Base):
    __tablename__ = "promotion_price_history"
    __table_args__ = (Index("ix_promotion_price_history", "promotion_id", "product_id", "changed_at"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    promotion_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False)
    audience_type_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("catalogue_audience_types.id", ondelete="SET NULL"))
    old_base_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    new_base_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    old_promotion_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    new_promotion_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    changed_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
