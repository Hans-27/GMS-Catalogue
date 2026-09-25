"""Add catalogue-specific video thumbnail selection.

Revision ID: 0014_catalogue_video_thumbnail_mode
Revises: 0013_featured_video_uniqueness
"""

from alembic import op
import sqlalchemy as sa

revision = "0014_catalogue_video_thumbnail_mode"
down_revision = "0013_featured_video_uniqueness"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("catalogue_products") as batch:
        batch.add_column(sa.Column("video_thumbnail_mode", sa.String(30), nullable=False, server_default="video_thumbnail"))


def downgrade() -> None:
    with op.batch_alter_table("catalogue_products") as batch:
        batch.drop_column("video_thumbnail_mode")
