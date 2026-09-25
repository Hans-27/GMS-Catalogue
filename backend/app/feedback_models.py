import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Feedback(Base):
    """One user-submitted demo review item and its management state."""

    __tablename__ = "demo_feedback"
    __table_args__ = (
        Index("ix_demo_feedback_status_created", "status", "created_at"),
        Index("ix_demo_feedback_priority", "priority"),
        Index("ix_demo_feedback_type", "feedback_type"),
        Index("ix_demo_feedback_module_page", "module_page"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    module_page: Mapped[str] = mapped_column(String(160), nullable=False)
    feedback_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_change: Mapped[str] = mapped_column(Text, default="", nullable=False)
    priority: Mapped[str] = mapped_column(String(20), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="new", nullable=False)
    internal_note: Mapped[str] = mapped_column(Text, default="", nullable=False)

    screenshot_original_name: Mapped[str | None] = mapped_column(String(255))
    screenshot_storage_name: Mapped[str | None] = mapped_column(
        String(255), unique=True
    )
    screenshot_url: Mapped[str | None] = mapped_column(String(500))
    screenshot_content_type: Mapped[str | None] = mapped_column(String(80))
    screenshot_size: Mapped[int | None] = mapped_column(Integer)

    submitted_by_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    assigned_to_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    submitted_by = relationship("User", foreign_keys=[submitted_by_id], lazy="joined")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id], lazy="joined")
