"""Track the authoritative source of product master records.

Revision ID: 0008_product_source_tracking
Revises: 0007_erp_integration
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "0008_product_source_tracking"
down_revision = "0007_erp_integration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("products")}
    with op.batch_alter_table("products") as batch_op:
        if "source_system" not in columns:
            batch_op.add_column(sa.Column("source_system", sa.String(length=40), nullable=True))
        if "source_record_id" not in columns:
            batch_op.add_column(sa.Column("source_record_id", sa.String(length=120), nullable=True))
        if "last_source_sync_at" not in columns:
            batch_op.add_column(sa.Column("last_source_sync_at", sa.DateTime(timezone=True), nullable=True))
    indexes = {index["name"] for index in inspect(op.get_bind()).get_indexes("products")}
    if "ix_products_source_system" not in indexes:
        op.create_index("ix_products_source_system", "products", ["source_system"])


def downgrade() -> None:
    indexes = {index["name"] for index in inspect(op.get_bind()).get_indexes("products")}
    if "ix_products_source_system" in indexes:
        op.drop_index("ix_products_source_system", table_name="products")
    columns = {column["name"] for column in inspect(op.get_bind()).get_columns("products")}
    with op.batch_alter_table("products") as batch_op:
        for name in ("last_source_sync_at", "source_record_id", "source_system"):
            if name in columns:
                batch_op.drop_column(name)
