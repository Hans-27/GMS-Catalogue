"""Add protected roles, permission metadata and explicit data scopes.

Revision ID: 0005_deny_by_default_access
Revises: 0004_cover_page_editor
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text

from app import commerce_models, models, platform_models  # noqa: F401
from app.database import Base


revision = "0005_deny_by_default_access"
down_revision = "0004_cover_page_editor"
branch_labels = None
depends_on = None

NEW_TABLES = [
    "department_roles",
    "position_roles",
    "user_brand_access",
    "user_category_access",
    "user_catalogue_access",
    "user_price_list_access",
    "user_data_scopes",
]


def _columns(connection, table: str) -> set[str]:
    return {column["name"] for column in inspect(connection).get_columns(table)}


def _add(connection, table: str, column: sa.Column) -> None:
    if column.name not in _columns(connection, table):
        op.add_column(table, column)


def upgrade() -> None:
    connection = op.get_bind()
    _add(connection, "users", sa.Column("permissions_version", sa.Integer(), nullable=False, server_default="1"))

    _add(connection, "roles", sa.Column("key", sa.String(50), nullable=True))
    _add(connection, "roles", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    _add(connection, "roles", sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()))
    _add(connection, "roles", sa.Column("system_key", sa.String(50), nullable=True))
    # SQLite cannot ALTER an existing table with a non-constant datetime
    # default. Add nullable, backfill, then rebuild through batch mode.
    _add(connection, "roles", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
    _add(connection, "roles", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    connection.execute(text("UPDATE roles SET key = name WHERE key IS NULL"))
    connection.execute(text("UPDATE roles SET is_system = 1, system_key = 'SUPERADMIN' WHERE lower(name) = 'superadmin'"))
    connection.execute(text("UPDATE roles SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    connection.execute(text("UPDATE roles SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
    with op.batch_alter_table("roles") as batch:
        batch.alter_column("key", existing_type=sa.String(50), nullable=False)
        batch.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
        batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
        batch.create_unique_constraint("uq_roles_key", ["key"])
        batch.create_unique_constraint("uq_roles_system_key", ["system_key"])

    _add(connection, "permissions", sa.Column("action", sa.String(50), nullable=False, server_default="view"))
    _add(connection, "permissions", sa.Column("is_high_risk", sa.Boolean(), nullable=False, server_default=sa.false()))
    _add(connection, "permissions", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()))
    connection.execute(text("UPDATE permissions SET action = substr(code, instr(code, '.') + 1)"))

    _add(connection, "user_permission_overrides", sa.Column("granted_by_id", sa.Uuid(), nullable=True))
    _add(connection, "user_permission_overrides", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))

    existing = set(inspect(connection).get_table_names())
    Base.metadata.create_all(
        bind=connection,
        tables=[Base.metadata.tables[name] for name in NEW_TABLES if name not in existing],
    )

    # Only the protected system role receives global row scope. Everyone else is
    # intentionally restricted until SuperAdmin assigns a scope.
    connection.execute(text("""
        INSERT INTO user_data_scopes (user_id, all_access, own_department, own_records, published_only)
        SELECT DISTINCT ur.user_id, 1, 0, 0, 0
        FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE r.is_system = 1 AND r.system_key = 'SUPERADMIN'
          AND NOT EXISTS (SELECT 1 FROM user_data_scopes uds WHERE uds.user_id = ur.user_id)
    """))


def downgrade() -> None:
    for name in reversed(NEW_TABLES):
        if name in set(inspect(op.get_bind()).get_table_names()):
            op.drop_table(name)
    with op.batch_alter_table("user_permission_overrides") as batch:
        batch.drop_column("expires_at")
        batch.drop_column("granted_by_id")
    with op.batch_alter_table("permissions") as batch:
        batch.drop_column("is_active")
        batch.drop_column("is_high_risk")
        batch.drop_column("action")
    with op.batch_alter_table("roles") as batch:
        batch.drop_constraint("uq_roles_system_key", type_="unique")
        batch.drop_constraint("uq_roles_key", type_="unique")
        batch.drop_column("updated_at")
        batch.drop_column("created_at")
        batch.drop_column("system_key")
        batch.drop_column("is_system")
        batch.drop_column("is_active")
        batch.drop_column("key")
    op.drop_column("users", "permissions_version")
