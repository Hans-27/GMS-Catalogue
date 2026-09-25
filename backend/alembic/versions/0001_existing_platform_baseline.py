"""Register the existing platform and create all missing normalized tables.

Revision ID: 0001_existing_platform_baseline
Revises:
Create Date: 2026-08-03
"""

from alembic import op

from app import commerce_models, feedback_models, models, platform_models  # noqa: F401
from app.database import Base


revision = "0001_existing_platform_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Safe for both a clean database and an existing first-release installation.
    # Subsequent revisions use explicit Alembic operations.
    baseline_tables = [
        table
        for table in Base.metadata.sorted_tables
        if table.name not in {
            "demo_feedback",
            "catalogue_cover_files",
            "catalogue_category_settings",
            "backup_jobs",
            "backup_schedules",
            "system_metric_snapshots",
            "catalogue_audience_types",
            "catalogue_share_links",
        }
    ]
    Base.metadata.create_all(bind=op.get_bind(), tables=baseline_tables)


def downgrade() -> None:
    # The baseline represents pre-existing production data and is intentionally
    # non-destructive. Restore from backup instead of dropping the whole schema.
    pass
