"""Enforce one active featured video per product.

Revision ID: 0013_featured_video_uniqueness
Revises: 0012_product_videos
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_featured_video_uniqueness"
down_revision = "0012_product_videos"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_product_videos_active_featured", "product_videos", ["product_id"], unique=True,
        sqlite_where=sa.text("is_featured = 1 AND is_active = 1 AND deleted_at IS NULL"),
        postgresql_where=sa.text("is_featured IS TRUE AND is_active IS TRUE AND deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_product_videos_active_featured", table_name="product_videos")
