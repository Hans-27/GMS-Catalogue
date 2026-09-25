import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ErpConnectionSetting(Base):
    __tablename__ = "erp_connection_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    name: Mapped[str] = mapped_column(String(120), default="GMS ERP", nullable=False)
    server: Mapped[str] = mapped_column(String(255), nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=1433, nullable=False)
    database_name: Mapped[str] = mapped_column(String(128), nullable=False)
    username: Mapped[str] = mapped_column(String(128), nullable=False)
    password_ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    connector: Mapped[str] = mapped_column(String(50), default="python-tds", nullable=False)
    source_preset: Mapped[str] = mapped_column(String(50), default="gms_product_master", nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    connection_timeout_seconds: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    last_test_status: Mapped[str] = mapped_column(String(20), default="not_tested", nullable=False)
    last_test_message: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    last_test_latency_ms: Mapped[float | None] = mapped_column()
    last_tested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_server_name: Mapped[str | None] = mapped_column(String(255))
    discovered_table_count: Mapped[int | None] = mapped_column(Integer)
    last_sync_status: Mapped[str] = mapped_column(String(20), default="never", nullable=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_summary: Mapped[dict | None] = mapped_column(JSON)
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ErpCustomerPriceLevel(Base):
    __tablename__ = "erp_customer_price_levels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    erp_price_type_id: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    source_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    source_name: Mapped[str] = mapped_column(String(120), nullable=False)
    price_list_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("price_lists.id", ondelete="RESTRICT"),
        nullable=False,
    )
    product_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ErpProductCustomerPrice(Base):
    __tablename__ = "erp_product_customer_prices"
    __table_args__ = (
        UniqueConstraint(
            "product_id",
            "price_level_id",
            name="uq_erp_product_customer_price_level",
        ),
        Index("ix_erp_product_customer_prices_level", "price_level_id", "product_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    product_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        ForeignKey("products.id", ondelete="CASCADE"),
        nullable=False,
    )
    price_level_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("erp_customer_price_levels.id", ondelete="CASCADE"),
        nullable=False,
    )
    erp_product_id: Mapped[str] = mapped_column(String(120), nullable=False)
    erp_product_units_id: Mapped[str | None] = mapped_column(String(120))
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="THB", nullable=False)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class ErpSyncRun(Base):
    __tablename__ = "erp_sync_runs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(String(20), default="running", nullable=False)
    sync_type: Mapped[str] = mapped_column(String(40), default="product_source_data", server_default="product_source_data", nullable=False)
    trigger: Mapped[str] = mapped_column(String(20), default="manual", server_default="manual", nullable=False)
    source_preset: Mapped[str] = mapped_column(String(50), nullable=False)
    requested_limit: Mapped[int] = mapped_column(Integer, nullable=False)
    rows_read: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rows_skipped: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    products_matched: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    stock_values_updated: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    price_values_updated: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    products_missing: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    duration_seconds: Mapped[float | None] = mapped_column(Float)
    source_database: Mapped[str] = mapped_column(String(40), default="MSSQL", server_default="MSSQL", nullable=False)
    error_summary: Mapped[str] = mapped_column(String(500), default="", server_default="", nullable=False)
    message: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    details: Mapped[dict | None] = mapped_column(JSON)
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProductSyncLock(Base):
    __tablename__ = "product_sync_locks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    owner_token: Mapped[str | None] = mapped_column(String(80))
    acquired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


Index("ix_erp_sync_runs_status_started", ErpSyncRun.status, ErpSyncRun.started_at)
