"""Add encrypted ERP connection settings and synchronization history.

Revision ID: 0007_erp_integration
Revises: 0006_scoped_permission_grants
"""

from alembic import op
from sqlalchemy import inspect

from app import commerce_models, erp_models, models, platform_models  # noqa: F401
from app.database import Base


revision = "0007_erp_integration"
down_revision = "0006_scoped_permission_grants"
branch_labels = None
depends_on = None


TABLES = ["erp_connection_settings", "erp_sync_runs"]


def upgrade() -> None:
    connection = op.get_bind()
    existing = set(inspect(connection).get_table_names())
    Base.metadata.create_all(
        bind=connection,
        tables=[Base.metadata.tables[name] for name in TABLES if name not in existing],
    )


def downgrade() -> None:
    existing = set(inspect(op.get_bind()).get_table_names())
    for name in reversed(TABLES):
        if name in existing:
            op.drop_table(name)

