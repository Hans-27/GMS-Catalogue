"""Track ERP lifecycle authority and legacy-catalogue membership.

Revision ID: 0017_product_source_lifecycle
Revises: 0016_erp_product_details
"""

from alembic import op
import sqlalchemy as sa


revision = "0017_product_source_lifecycle"
down_revision = "0016_erp_product_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "lifecycle_status_source",
            sa.String(40),
            nullable=False,
            server_default="erp_active",
        ),
    )
    op.add_column(
        "products",
        sa.Column(
            "legacy_catalogue_present",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.add_column(
        "products",
        sa.Column("legacy_catalogue_synced_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_products_lifecycle_status_source",
        "products",
        ["lifecycle_status_source"],
    )
    op.create_index(
        "ix_products_legacy_catalogue_present",
        "products",
        ["legacy_catalogue_present"],
    )


def downgrade() -> None:
    op.drop_index("ix_products_legacy_catalogue_present", table_name="products")
    op.drop_index("ix_products_lifecycle_status_source", table_name="products")
    op.drop_column("products", "legacy_catalogue_synced_at")
    op.drop_column("products", "legacy_catalogue_present")
    op.drop_column("products", "lifecycle_status_source")
