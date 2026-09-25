"""Store every ERP barcode attached to a product.

Revision ID: 0028_product_barcodes
Revises: 0027_normalize_studio_font_styles
"""

from alembic import op
import sqlalchemy as sa


revision = "0028_product_barcodes"
down_revision = "0027_normalize_studio_font_styles"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("products", sa.Column("barcodes", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("products", "barcodes")
