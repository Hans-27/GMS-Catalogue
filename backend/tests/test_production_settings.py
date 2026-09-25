import os

import pytest
from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "production-settings-test-secret")

from app.config import Settings


PRODUCTION_SETTINGS = {
    "app_env": "production",
    "database_url": "postgresql+psycopg://catalogue_user:password@postgres:5432/catalogue_management",
    "secret_key": "a-production-secret-with-more-than-thirty-two-characters",
    "cookie_secure": True,
    "auto_create_tables": False,
    "seed_demo_data": False,
    "demo_mode": False,
    "public_app_url": "https://catalogue.example.test",
    "cors_origins": "https://catalogue.example.test",
}


def production_settings(**overrides) -> Settings:
    return Settings(_env_file=None, **(PRODUCTION_SETTINGS | overrides))


def test_production_settings_accept_hardened_configuration() -> None:
    production_settings()


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"secret_key": "replace-with-a-secret"}, "SECRET_KEY"),
        ({"database_url": "sqlite:///catalogue.db"}, "PostgreSQL"),
        ({"cookie_secure": False}, "COOKIE_SECURE"),
        ({"auto_create_tables": True}, "AUTO_CREATE_TABLES"),
        ({"seed_demo_data": True}, "SEED_DEMO_DATA"),
        ({"demo_mode": True}, "DEMO_MODE"),
        ({"public_app_url": "http://catalogue.example.test"}, "PUBLIC_APP_URL"),
        ({"cors_origins": "https://admin.example.test"}, "CORS_ORIGINS"),
    ],
)
def test_production_settings_reject_unsafe_configuration(
    overrides: dict[str, object],
    message: str,
) -> None:
    """A production process must fail before serving with unsafe settings."""

    with pytest.raises(ValidationError, match=message):
        production_settings(**overrides)
