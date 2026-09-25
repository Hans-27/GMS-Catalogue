import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GlobalProductCard(Base):
    __tablename__ = "global_product_cards"
    __table_args__ = (
        UniqueConstraint("product_id", name="uq_global_product_card_product"),
        Index("ix_global_product_cards_updated", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("products.id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("product_card_templates.id", ondelete="SET NULL")
    )
    draft_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    published_json: Mapped[dict | None] = mapped_column(JSON)
    draft_revision: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    active_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    drafted_by_id: Mapped[uuid.UUID | None] = mapped_column(
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
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    versions: Mapped[list["GlobalProductCardVersion"]] = relationship(
        back_populates="card",
        cascade="all, delete-orphan",
        order_by="GlobalProductCardVersion.version_number.desc()",
    )


class GlobalProductCardVersion(Base):
    __tablename__ = "global_product_card_versions"
    __table_args__ = (
        UniqueConstraint("card_id", "version_number", name="uq_global_product_card_version"),
        Index("ix_global_product_card_versions_card", "card_id", "version_number"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    card_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("global_product_cards.id", ondelete="CASCADE"), nullable=False
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("product_card_templates.id", ondelete="SET NULL")
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    presentation_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    change_note: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    published_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    published_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    card: Mapped[GlobalProductCard] = relationship(back_populates="versions")
