"""Add catalogue presentation, backup, and system operations tables.

Revision ID: 0003_catalogue_operations
Revises: 0002_demo_feedback
Create Date: 2026-08-03
"""

from alembic import op
from sqlalchemy import inspect

from app import platform_models  # noqa: F401
from app.database import Base


revision = "0003_catalogue_operations"
down_revision = "0002_demo_feedback"
branch_labels = None
depends_on = None


TABLES = [
    "catalogue_cover_files",
    "catalogue_category_settings",
    "backup_jobs",
    "backup_schedules",
    "system_metric_snapshots",
]


def upgrade() -> None:
    existing = set(inspect(op.get_bind()).get_table_names())
    tables = [Base.metadata.tables[name] for name in TABLES if name not in existing]
    Base.metadata.create_all(bind=op.get_bind(), tables=tables)


def downgrade() -> None:
    existing = set(inspect(op.get_bind()).get_table_names())
    for name in reversed(TABLES):
        if name in existing:
            op.drop_table(name)
