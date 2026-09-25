"""Add product lifecycle and scheduled source-data synchronization.

Revision ID: 0010_product_status_sync
Revises: 0009_org_role_management
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0010_product_status_sync"
down_revision = "0009_org_role_management"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _add_columns(table: str, columns: list[sa.Column]) -> None:
    existing = _columns(table)
    missing = [column for column in columns if column.name not in existing]
    if not missing:
        return
    with op.batch_alter_table(table) as batch:
        for column in missing:
            batch.add_column(column)


def upgrade() -> None:
    _add_columns("products", [
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("inactive_reason", sa.String(50)),
        sa.Column("inactive_note", sa.String(500), nullable=False, server_default=""),
        sa.Column("inactivated_at", sa.DateTime(timezone=True)),
        sa.Column("inactivated_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_products_inactivated_by", ondelete="SET NULL")),
        sa.Column("reactivated_at", sa.DateTime(timezone=True)),
        sa.Column("reactivated_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_products_reactivated_by", ondelete="SET NULL")),
        sa.Column("status_updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("stock_last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("price_last_synced_at", sa.DateTime(timezone=True)),
        sa.Column("source_sync_status", sa.String(30), nullable=False, server_default="never"),
        sa.Column("source_sync_error", sa.String(500), nullable=False, server_default=""),
        sa.Column("source_record_exists", sa.Boolean(), nullable=False, server_default=sa.true()),
    ])
    _add_columns("erp_sync_runs", [
        sa.Column("sync_type", sa.String(40), nullable=False, server_default="product_source_data"),
        sa.Column("trigger", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("products_matched", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("stock_values_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("price_values_updated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("products_missing", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_seconds", sa.Float()),
        sa.Column("source_database", sa.String(40), nullable=False, server_default="MSSQL"),
        sa.Column("error_summary", sa.String(500), nullable=False, server_default=""),
    ])

    connection = op.get_bind()
    tables = set(inspect(connection).get_table_names())
    if "product_status_history" not in tables:
        op.create_table(
            "product_status_history",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", name="fk_product_status_history_product", ondelete="CASCADE"), nullable=False),
            sa.Column("old_status", sa.String(20), nullable=False),
            sa.Column("new_status", sa.String(20), nullable=False),
            sa.Column("reason", sa.String(50), nullable=False, server_default=""),
            sa.Column("note", sa.String(500), nullable=False, server_default=""),
            sa.Column("changed_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_product_status_history_user", ondelete="SET NULL")),
            sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
    if "product_warehouse_stocks" not in tables:
        op.create_table(
            "product_warehouse_stocks",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", name="fk_product_warehouse_stock_product", ondelete="CASCADE"), nullable=False),
            sa.Column("warehouse_code", sa.String(80), nullable=False),
            sa.Column("on_hand", sa.Numeric(16, 4), nullable=False, server_default="0"),
            sa.Column("available", sa.Numeric(16, 4), nullable=False, server_default="0"),
            sa.Column("reserved", sa.Numeric(16, 4), nullable=False, server_default="0"),
            sa.Column("incoming", sa.Numeric(16, 4), nullable=False, server_default="0"),
            sa.Column("source_updated_at", sa.DateTime(timezone=True)),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("product_id", "warehouse_code", name="uq_product_warehouse_stock"),
        )
    if "product_sync_locks" not in tables:
        op.create_table(
            "product_sync_locks",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("owner_token", sa.String(80)),
            sa.Column("acquired_at", sa.DateTime(timezone=True)),
            sa.Column("locked_until", sa.DateTime(timezone=True)),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )

    indexes = {index["name"] for table in ("products", "erp_sync_runs", "product_status_history", "product_warehouse_stocks") for index in inspect(connection).get_indexes(table)}
    for name, table, columns in (
        ("ix_products_status", "products", ["status"]),
        ("ix_products_source_sync_status", "products", ["source_sync_status"]),
        ("ix_erp_sync_runs_status_started", "erp_sync_runs", ["status", "started_at"]),
        ("ix_product_status_history_product", "product_status_history", ["product_id", "changed_at"]),
        ("ix_product_warehouse_stock_product", "product_warehouse_stocks", ["product_id"]),
    ):
        if name not in indexes:
            op.create_index(name, table, columns)


def downgrade() -> None:
    connection = op.get_bind()
    for table in ("product_sync_locks", "product_warehouse_stocks", "product_status_history"):
        if table in set(inspect(connection).get_table_names()):
            op.drop_table(table)
    for table, names in (
        ("erp_sync_runs", ["error_summary", "source_database", "duration_seconds", "retry_count", "products_missing", "price_values_updated", "stock_values_updated", "products_matched", "trigger", "sync_type"]),
        ("products", ["source_record_exists", "source_sync_error", "source_sync_status", "price_last_synced_at", "stock_last_synced_at", "status_updated_at", "reactivated_by_user_id", "reactivated_at", "inactivated_by_user_id", "inactivated_at", "inactive_note", "inactive_reason", "status"]),
    ):
        existing = _columns(table)
        with op.batch_alter_table(table) as batch:
            for name in names:
                if name in existing:
                    batch.drop_column(name)
