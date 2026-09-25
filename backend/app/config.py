from functools import lru_cache
import re
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "GMS Catalogue Management API"
    app_env: str = "development"
    api_prefix: str = "/api"
    database_url: str
    secret_key: SecretStr
    token_issuer: str = "gms-catalogue"
    access_token_minutes: int = Field(default=180, ge=5, le=1440)
    remember_me_days: int = Field(default=14, ge=1, le=90)
    auth_cookie_name: str = "catalogue_session"
    cookie_secure: bool = False
    cors_origins: str = "http://localhost,http://127.0.0.1"
    cors_origin_regex: str = ""
    max_login_attempts: int = Field(default=5, ge=3, le=20)
    login_lock_minutes: int = Field(default=15, ge=1, le=1440)
    auto_create_tables: bool = True
    seed_demo_data: bool = True
    upload_dir: str = "./uploads"
    product_image_max_size_mb: int = Field(default=50, ge=1, le=100)
    cover_upload_dir: str = "./private_uploads/catalogue-covers"
    catalogue_pdf_cache_dir: str = "./.cache/catalogue-pdfs"
    catalogue_pdf_cache_retention_days: int = Field(default=14, ge=1, le=365)
    max_upload_mb: int = Field(default=8, ge=1, le=50)
    product_video_upload_dir: str = "./private_uploads/product-videos"
    product_video_max_size_mb: int = Field(default=100, ge=1, le=2048)
    product_video_max_duration_seconds: int = Field(default=600, ge=1, le=86400)
    product_video_allowed_types: str = "video/mp4,video/webm"
    product_video_youtube_enabled: bool = True
    product_video_vimeo_enabled: bool = True
    product_video_direct_url_enabled: bool = False
    max_cover_upload_mb: int = Field(default=20, ge=1, le=100)
    min_cover_width: int = Field(default=800, ge=100, le=8000)
    min_cover_height: int = Field(default=600, ge=100, le=8000)
    max_cover_dimension: int = Field(default=12000, ge=1000, le=30000)
    backup_dir: str = "./backups"
    application_root: str = ".."
    pg_dump_path: str = "pg_dump"
    enable_backup_restore: bool = False
    backup_retention_days: int = Field(default=30, ge=1, le=3650)
    backup_retention_count: int = Field(default=10, ge=1, le=1000)
    health_cpu_warning: float = Field(default=85, ge=1, le=100)
    health_memory_warning: float = Field(default=85, ge=1, le=100)
    health_disk_warning: float = Field(default=85, ge=1, le=100)
    health_database_ms_warning: float = Field(default=500, ge=1, le=60000)
    demo_mode: bool = True
    demo_version: str = "0.1.0"
    feedback_enabled: bool = True
    public_app_url: str = "http://127.0.0.1"
    design_export_worker_enabled: bool = True
    design_export_poll_seconds: float = Field(default=2.0, ge=0.5, le=60)
    product_sync_enabled: bool = True
    product_sync_interval_seconds: int = Field(default=180, ge=60, le=86400)
    product_sync_batch_size: int = Field(default=500, ge=50, le=5000)
    product_sync_stale_warning_seconds: int = Field(default=360, ge=60, le=86400)
    product_sync_stale_critical_seconds: int = Field(default=900, ge=120, le=172800)
    product_sync_source: str = "MSSQL"
    product_sync_timezone: str = "Asia/Bangkok"
    product_sync_max_retries: int = Field(default=3, ge=0, le=5)
    product_sync_lock_seconds: int = Field(default=900, ge=120, le=7200)
    product_sync_price_mapping: str = "Price01:NORMAL,Price02:VIP,Price03:BIG_CUSTOMER,Price04:DEALER,Price05:WHOLESALE,Price06:RETAIL,Price07:VVIP"
    product_sync_image_interval_seconds: int = Field(default=86400, ge=3600, le=604800)
    purchase_order_api_url: str = "http://gms25.homeip.net/pm/index.php?r=site/POListApi&id="
    purchase_order_api_timeout_seconds: float = Field(default=5.0, ge=0.5, le=30)
    purchase_order_api_cache_seconds: int = Field(default=60, ge=1, le=3600)
    legacy_catalogue_url: str = ""
    legacy_catalogue_username: str = ""
    legacy_catalogue_password: SecretStr = SecretStr("")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def allowed_origin_regex(self) -> str | None:
        return self.cors_origin_regex.strip() or None

    def is_origin_allowed(self, origin: str) -> bool:
        return origin in self.allowed_origins or bool(
            self.allowed_origin_regex
            and re.fullmatch(self.allowed_origin_regex, origin)
        )

    @property
    def allowed_product_video_types(self) -> set[str]:
        return {value.strip().casefold() for value in self.product_video_allowed_types.split(",") if value.strip()}

    @model_validator(mode="after")
    def validate_production_safety(self) -> "Settings":
        if self.app_env.strip().casefold() != "production":
            return self

        secret = self.secret_key.get_secret_value().strip()
        if len(secret) < 32 or any(
            marker in secret.casefold()
            for marker in ("replace-with", "change-me", "example")
        ):
            raise ValueError(
                "SECRET_KEY must be a non-placeholder value of at least 32 characters in production."
            )
        if not self.database_url.strip().casefold().startswith(
            ("postgresql://", "postgresql+psycopg://")
        ):
            raise ValueError("Production DATABASE_URL must use PostgreSQL.")
        if not self.cookie_secure:
            raise ValueError("COOKIE_SECURE must be true in production.")
        if self.auto_create_tables:
            raise ValueError("AUTO_CREATE_TABLES must be false in production; use Alembic migrations.")
        if self.seed_demo_data:
            raise ValueError("SEED_DEMO_DATA must be false in production.")
        if self.demo_mode:
            raise ValueError("DEMO_MODE must be false in production.")

        public_url = self.public_app_url.strip().rstrip("/")
        parsed_public_url = urlsplit(public_url)
        if parsed_public_url.scheme.casefold() != "https" or not parsed_public_url.netloc:
            raise ValueError("PUBLIC_APP_URL must be an absolute HTTPS URL in production.")
        public_origin = f"{parsed_public_url.scheme.casefold()}://{parsed_public_url.netloc.casefold()}"
        allowed_origins = {origin.rstrip("/").casefold() for origin in self.allowed_origins}
        if public_origin not in allowed_origins:
            raise ValueError("CORS_ORIGINS must include the PUBLIC_APP_URL origin in production.")
        if any(urlsplit(origin).scheme.casefold() != "https" for origin in allowed_origins):
            raise ValueError("Every CORS_ORIGINS entry must use HTTPS in production.")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
