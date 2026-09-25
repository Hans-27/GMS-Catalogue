"""Add brand-specific catalogue price mappings.

Revision ID: 0029_brand_price_mappings
Revises: 0028_product_barcodes
"""

from alembic import op
import sqlalchemy as sa


revision = "0029_brand_price_mappings"
down_revision = "0028_product_barcodes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if "user_brand_catalogue_price_mappings" in inspector.get_table_names():
        return
    op.create_table(
        "user_brand_catalogue_price_mappings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_key", sa.String(length=120), nullable=False),
        sa.Column("brand_name", sa.String(length=120), nullable=False),
        sa.Column("audience_type_id", sa.Integer(), sa.ForeignKey("catalogue_audience_types.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price_list_id", sa.Integer(), sa.ForeignKey("price_lists.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "brand_key", "audience_type_id", name="uq_user_brand_catalogue_price_mapping"),
    )
    op.create_index(
        "ix_user_brand_catalogue_price_mapping_lookup",
        "user_brand_catalogue_price_mappings",
        ["user_id", "brand_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_brand_catalogue_price_mapping_lookup", table_name="user_brand_catalogue_price_mappings")
    op.drop_table("user_brand_catalogue_price_mappings")
