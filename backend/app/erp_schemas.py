import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class ErpConnectionUpdate(BaseModel):
    name: str = Field(default="GMS ERP", min_length=2, max_length=120)
    server: str = Field(min_length=1, max_length=255)
    port: int = Field(default=1433, ge=1, le=65535)
    database_name: str = Field(min_length=1, max_length=128)
    username: str = Field(min_length=1, max_length=128)
    password: str | None = Field(default=None, max_length=1024)
    is_enabled: bool = True
    connection_timeout_seconds: int = Field(default=10, ge=3, le=60)

    @field_validator("name", "server", "database_name", "username")
    @classmethod
    def strip_values(cls, value: str) -> str:
        return value.strip()


class ErpConnectionResponse(BaseModel):
    configured: bool
    name: str = "GMS ERP"
    server: str = ""
    port: int = 1433
    database_name: str = ""
    username: str = ""
    password_configured: bool = False
    connector: str = "python-tds"
    source_preset: str = "gms_product_master"
    is_enabled: bool = False
    connection_timeout_seconds: int = 10
    last_test_status: str = "not_tested"
    last_test_message: str = ""
    last_test_latency_ms: float | None = None
    last_tested_at: datetime | None = None
    last_server_name: str | None = None
    discovered_table_count: int | None = None
    last_sync_status: str = "never"
    last_synced_at: datetime | None = None
    last_sync_summary: dict | None = None
    updated_at: datetime | None = None


class ErpConnectionTestResponse(BaseModel):
    connected: bool
    message: str
    latency_ms: float
    server_name: str | None = None
    database_name: str | None = None
    product_count: int | None = None
    table_count: int | None = None


class ErpTableResponse(BaseModel):
    schema_name: str
    table_name: str


class ErpPreviewResponse(BaseModel):
    columns: list[str]
    rows: list[dict]
    source: str
    limit: int


class ErpSyncRequest(BaseModel):
    limit: int = Field(default=25000, ge=1, le=50000)
    include_discontinued: bool = True


class ErpSyncRunResponse(BaseModel):
    id: uuid.UUID
    status: str
    source_preset: str
    requested_limit: int
    rows_read: int
    rows_created: int
    rows_updated: int
    rows_skipped: int
    error_count: int
    message: str
    details: dict | None
    requested_by_id: uuid.UUID | None
    started_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
