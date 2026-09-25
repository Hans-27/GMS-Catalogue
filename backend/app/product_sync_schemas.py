import uuid
from datetime import datetime

from pydantic import BaseModel


class ProductSyncRunResponse(BaseModel):
    id: uuid.UUID
    status: str
    sync_type: str
    trigger: str
    source_database: str
    rows_read: int
    rows_created: int
    rows_updated: int
    rows_skipped: int
    products_matched: int
    stock_values_updated: int
    price_values_updated: int
    products_missing: int
    error_count: int
    retry_count: int
    duration_seconds: float | None
    message: str
    error_summary: str
    details: dict | None
    requested_by_id: uuid.UUID | None
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class ProductSyncStatusResponse(BaseModel):
    status: str
    enabled: bool
    interval_seconds: int
    batch_size: int
    next_scheduled_sync: datetime | None
    last_successful_sync: datetime | None
    last_failed_sync: datetime | None
    current_run: ProductSyncRunResponse | None
    latest_run: ProductSyncRunResponse | None
    source_database_status: str
    records_read: int
    products_updated: int
    stock_values_updated: int
    price_values_updated: int
    products_missing: int
    duration_seconds: float | None
    data_is_stale: bool
    stale_level: str
    stale_warning_seconds: int
    stale_critical_seconds: int

