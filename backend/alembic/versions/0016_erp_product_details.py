"""Store richer ERP-owned product details.

Revision ID: 0016_erp_product_details
Revises: 0015_promotion_management
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_erp_product_details"
down_revision = "0015_promotion_management"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = (
        sa.Column("erp_name_th", sa.String(255)),
        sa.Column("erp_pos_name", sa.String(255)),
        sa.Column("erp_description_en", sa.Text()),
        sa.Column("erp_description_th", sa.Text()),
        sa.Column("erp_how_to_use", sa.Text()),
        sa.Column("erp_remark", sa.String(500)),
        sa.Column("size_width", sa.Numeric(14, 3)),
        sa.Column("size_length", sa.Numeric(14, 3)),
        sa.Column("size_height", sa.Numeric(14, 3)),
        sa.Column("gross_weight", sa.Numeric(14, 3)),
        sa.Column("net_weight", sa.Numeric(14, 3)),
        sa.Column("pack_size", sa.Integer()),
        sa.Column("warranty_description", sa.String(80)),
        sa.Column("warranty_days", sa.Integer()),
    )
    for column in columns:
        op.add_column("products", column)


def downgrade() -> None:
    for name in (
        "warranty_days", "warranty_description", "pack_size", "net_weight",
        "gross_weight", "size_height", "size_length", "size_width", "erp_remark",
        "erp_how_to_use", "erp_description_th", "erp_description_en", "erp_pos_name",
        "erp_name_th",
    ):
        op.drop_column("products", name)
