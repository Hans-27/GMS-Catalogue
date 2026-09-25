"""Add per-action scopes and scoped record assignments.

Revision ID: 0006_scoped_permission_grants
Revises: 0005_deny_by_default_access
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

from app import commerce_models, models, platform_models  # noqa: F401
from app.database import Base


revision = "0006_scoped_permission_grants"
down_revision = "0005_deny_by_default_access"
branch_labels = None
depends_on = None

NEW_TABLES = [
    "user_product_access",
    "role_price_list_access",
    "permission_change_logs",
]


def _columns(connection, table: str) -> set[str]:
    return {column["name"] for column in inspect(connection).get_columns(table)}


def _add(connection, table: str, column: sa.Column) -> None:
    if column.name not in _columns(connection, table):
        op.add_column(table, column)


def upgrade() -> None:
    connection = op.get_bind()
    _add(connection, "role_permissions", sa.Column("effect", sa.String(10), nullable=False, server_default="allow"))
    _add(connection, "role_permissions", sa.Column("access_scope", sa.String(40), nullable=False, server_default="none"))
    _add(connection, "user_permission_overrides", sa.Column("access_scope", sa.String(40), nullable=False, server_default="none"))
    for table in ("user_brand_access", "user_category_access"):
        _add(connection, table, sa.Column("can_view", sa.Boolean(), nullable=False, server_default=sa.true()))
        _add(connection, table, sa.Column("can_edit", sa.Boolean(), nullable=False, server_default=sa.false()))
    _add(connection, "user_catalogue_access", sa.Column("can_view", sa.Boolean(), nullable=False, server_default=sa.true()))
    _add(connection, "user_catalogue_access", sa.Column("can_edit", sa.Boolean(), nullable=False, server_default=sa.false()))
    _add(connection, "user_catalogue_access", sa.Column("can_export", sa.Boolean(), nullable=False, server_default=sa.false()))

    existing = set(inspect(connection).get_table_names())
    Base.metadata.create_all(
        bind=connection,
        tables=[Base.metadata.tables[name] for name in NEW_TABLES if name not in existing],
    )

    # Preserve the current SuperAdmin and existing role behavior during the
    # migration. Seed synchronization applies the restrictive template scopes.
    connection.execute(text("""
        UPDATE role_permissions SET access_scope = 'all'
        WHERE role_id IN (
            SELECT id FROM roles WHERE is_system = 1 AND system_key = 'SUPERADMIN'
        )
    """))


def downgrade() -> None:
    for table in reversed(NEW_TABLES):
        if table in set(inspect(op.get_bind()).get_table_names()):
            op.drop_table(table)
    with op.batch_alter_table("user_catalogue_access") as batch:
        batch.drop_column("can_export")
        batch.drop_column("can_edit")
        batch.drop_column("can_view")
    for table in ("user_category_access", "user_brand_access"):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("can_edit")
            batch.drop_column("can_view")
    op.drop_column("user_permission_overrides", "access_scope")
    op.drop_column("role_permissions", "access_scope")
    op.drop_column("role_permissions", "effect")
