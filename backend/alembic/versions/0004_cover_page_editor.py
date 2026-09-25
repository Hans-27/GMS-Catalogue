"""Add configurable catalogue cover settings and assets.

Revision ID: 0004_cover_page_editor
Revises: 0003_catalogue_operations
Create Date: 2026-08-03
"""

import re
import uuid

from alembic import op
from sqlalchemy import inspect, select

from app import commerce_models, platform_models  # noqa: F401
from app.database import Base


revision = "0004_cover_page_editor"
down_revision = "0003_catalogue_operations"
branch_labels = None
depends_on = None

TABLES = ["catalogue_cover_settings", "catalogue_cover_assets"]


def upgrade() -> None:
    connection = op.get_bind()
    existing = set(inspect(connection).get_table_names())
    Base.metadata.create_all(
        bind=connection,
        tables=[Base.metadata.tables[name] for name in TABLES if name not in existing],
    )
    settings_table = Base.metadata.tables["catalogue_cover_settings"]
    catalogue_table = Base.metadata.tables["catalogues"]
    existing_catalogues = set(connection.execute(select(settings_table.c.catalogue_id)).scalars())
    rows = connection.execute(select(catalogue_table.c.id, catalogue_table.c.title)).all()
    for catalogue_id, title in rows:
        if catalogue_id in existing_catalogues:
            continue
        match = re.match(r"^(.*?)\s+((?:19|20)\d{2})$", (title or "Catalogue").strip())
        name, year = (match.group(1), match.group(2)) if match else (title or "Catalogue", "")
        connection.execute(
            settings_table.insert().values(
                id=uuid.uuid4(),
                catalogue_id=catalogue_id,
                catalogue_name=name,
                catalogue_year=year,
                cover_alt_text=title or "Catalogue cover",
            )
        )


def downgrade() -> None:
    existing = set(inspect(op.get_bind()).get_table_names())
    for name in reversed(TABLES):
        if name in existing:
            op.drop_table(name)
