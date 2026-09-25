import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
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


class PriceList(Base):
    __tablename__ = "price_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(320), default="", nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="THB", nullable=False)
    is_no_price: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    prices: Mapped[list["ProductPrice"]] = relationship(back_populates="price_list")
    requests: Mapped[list["PriceChangeRequest"]] = relationship(
        back_populates="price_list"
    )


class ProductPrice(Base):
    __tablename__ = "product_prices"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_product_price_non_negative"),
        CheckConstraint(
            "expires_at IS NULL OR expires_at > effective_from",
            name="ck_product_price_dates",
        ),
        Index("ix_product_prices_lookup", "product_id", "price_list_id", "status"),
        Index("ix_product_prices_effective", "effective_from", "expires_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    price_list_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("price_lists.id", ondelete="RESTRICT"), nullable=False
    )
    currency: Mapped[str] = mapped_column(String(3), default="THB", nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    price_list: Mapped[PriceList] = relationship(back_populates="prices")


class PriceChangeRequest(Base):
    __tablename__ = "price_change_requests"
    __table_args__ = (
        CheckConstraint(
            "proposed_amount >= 0",
            name="ck_price_request_non_negative",
        ),
        Index("ix_price_requests_status", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    price_list_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("price_lists.id", ondelete="RESTRICT"), nullable=False
    )
    proposed_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="THB", nullable=False)
    effective_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    reason: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    reviewed_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    review_reason: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    resulting_price_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("product_prices.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    price_list: Mapped[PriceList] = relationship(back_populates="requests")


class Catalogue(Base):
    __tablename__ = "catalogues"
    __table_args__ = (
        CheckConstraint(
            "valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from",
            name="ck_catalogue_valid_dates",
        ),
        Index("ix_catalogues_status_updated", "status", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    slug: Mapped[str] = mapped_column(String(240), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    brand: Mapped[str | None] = mapped_column(String(120))
    audience: Mapped[str] = mapped_column(String(120), default="Internal", nullable=False)
    price_list_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("price_lists.id", ondelete="SET NULL")
    )
    show_prices: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="THB", nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    published_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    price_list: Mapped[PriceList | None] = relationship()
    product_links: Mapped[list["CatalogueProduct"]] = relationship(
        back_populates="catalogue",
        cascade="all, delete-orphan",
        order_by="CatalogueProduct.sort_order",
        lazy="selectin",
    )
    versions: Mapped[list["CatalogueVersion"]] = relationship(
        back_populates="catalogue",
        cascade="all, delete-orphan",
        order_by="CatalogueVersion.version_number.desc()",
    )
    share_links: Mapped[list["CatalogueShareLink"]] = relationship(
        back_populates="catalogue", cascade="all, delete-orphan", lazy="selectin"
    )


class CatalogueProduct(Base):
    __tablename__ = "catalogue_products"
    __table_args__ = (
        UniqueConstraint("catalogue_id", "product_id", name="uq_catalogue_product"),
        UniqueConstraint("catalogue_id", "sort_order", name="uq_catalogue_sort_order"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    catalogue_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("products.id", ondelete="RESTRICT"), nullable=False
    )
    section_title: Mapped[str] = mapped_column(String(180), default="", nullable=False)
    override_description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    hide_price: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    include_video: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    selected_video_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("product_videos.id", ondelete="SET NULL"))
    video_title_override: Mapped[str] = mapped_column(String(255), default="", server_default="", nullable=False)
    video_description_override: Mapped[str] = mapped_column(Text, default="", server_default="", nullable=False)
    video_display_mode: Mapped[str] = mapped_column(String(30), default="product_detail", server_default="product_detail", nullable=False)
    video_thumbnail_mode: Mapped[str] = mapped_column(String(30), default="video_thumbnail", server_default="video_thumbnail", nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False)

    catalogue: Mapped[Catalogue] = relationship(back_populates="product_links")
    product: Mapped["Product"] = relationship(back_populates="catalogue_links")
    selected_video: Mapped["ProductVideo | None"] = relationship(foreign_keys=[selected_video_id])


class CatalogueVersion(Base):
    __tablename__ = "catalogue_versions"
    __table_args__ = (
        UniqueConstraint(
            "catalogue_id", "version_number", name="uq_catalogue_version"
        ),
        Index("ix_catalogue_versions_published", "published_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    catalogue_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    published_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    catalogue: Mapped[Catalogue] = relationship(back_populates="versions")


class CatalogueAudienceType(Base):
    __tablename__ = "catalogue_audience_types"
    __table_args__ = (
        UniqueConstraint("code", name="uq_catalogue_audience_type_code"),
        Index("ix_catalogue_audience_active_order", "is_active", "display_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    price_list_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("price_lists.id", ondelete="SET NULL"))
    show_prices: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    button_style_key: Mapped[str] = mapped_column(String(30), default="default", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    price_list: Mapped[PriceList | None] = relationship()
    share_links: Mapped[list["CatalogueShareLink"]] = relationship(back_populates="audience_type")


class UserCataloguePriceMapping(Base):
    """A user's customer-level label to ERP price-list preference."""

    __tablename__ = "user_catalogue_price_mappings"
    __table_args__ = (
        UniqueConstraint("user_id", "audience_type_id", name="uq_user_catalogue_price_mapping"),
        Index("ix_user_catalogue_price_mapping_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    audience_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("catalogue_audience_types.id", ondelete="CASCADE"), nullable=False)
    price_list_id: Mapped[int] = mapped_column(Integer, ForeignKey("price_lists.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    audience_type: Mapped[CatalogueAudienceType] = relationship(lazy="joined")
    price_list: Mapped[PriceList] = relationship(lazy="joined")


class UserBrandCataloguePriceMapping(Base):
    """A brand-specific override for a user's catalogue audience pricing."""

    __tablename__ = "user_brand_catalogue_price_mappings"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "brand_key",
            "audience_type_id",
            name="uq_user_brand_catalogue_price_mapping",
        ),
        Index(
            "ix_user_brand_catalogue_price_mapping_lookup",
            "user_id",
            "brand_key",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    brand_key: Mapped[str] = mapped_column(String(120), nullable=False)
    brand_name: Mapped[str] = mapped_column(String(120), nullable=False)
    audience_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("catalogue_audience_types.id", ondelete="CASCADE"), nullable=False)
    price_list_id: Mapped[int] = mapped_column(Integer, ForeignKey("price_lists.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    audience_type: Mapped[CatalogueAudienceType] = relationship(lazy="joined")
    price_list: Mapped[PriceList] = relationship(lazy="joined")


class CatalogueShareLink(Base):
    __tablename__ = "catalogue_share_links"
    __table_args__ = (
        UniqueConstraint(
            "catalogue_id",
            "audience_type_id",
            "created_by_id",
            "customer_code",
            name="uq_catalogue_audience_user_customer_share_link",
        ),
        UniqueConstraint("token_hash", name="uq_catalogue_share_token_hash"),
        Index("ix_catalogue_share_link_status", "status", "expires_at"),
        Index(
            "ix_catalogue_share_link_customer",
            "catalogue_id",
            "created_by_id",
            "customer_code",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    catalogue_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("catalogues.id", ondelete="CASCADE"), nullable=False)
    audience_type_id: Mapped[int] = mapped_column(Integer, ForeignKey("catalogue_audience_types.id", ondelete="RESTRICT"), nullable=False)
    # Empty customer fields identify the reusable audience shortcuts shown on
    # catalogue cards. Named customer links can coexist for the same audience
    # and are the secure pricing context used by a shared customer login.
    customer_code: Mapped[str] = mapped_column(String(80), default="", server_default="", nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(160))
    price_list_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("price_lists.id", ondelete="SET NULL"))
    show_prices: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version_mode: Mapped[str] = mapped_column(String(30), default="latest_published", nullable=False)
    fixed_version_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("catalogue_versions.id", ondelete="SET NULL"))
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    encrypted_token: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    password_hash: Mapped[str | None] = mapped_column(String(512))
    allow_pdf_download: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_print: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    revoked_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_accessed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    catalogue: Mapped[Catalogue] = relationship(back_populates="share_links")
    audience_type: Mapped[CatalogueAudienceType] = relationship(back_populates="share_links", lazy="joined")
    price_list: Mapped[PriceList | None] = relationship(lazy="joined")
    fixed_version: Mapped[CatalogueVersion | None] = relationship()
