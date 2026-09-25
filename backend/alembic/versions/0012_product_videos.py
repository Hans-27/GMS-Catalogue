"""Add private product videos and catalogue-level video selection.

Revision ID: 0012_product_videos
Revises: 0011_catalogue_share_links
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_product_videos"
down_revision = "0011_catalogue_share_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "product_videos",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False),
        sa.Column("title_en", sa.String(255), nullable=False, server_default=""),
        sa.Column("title_th", sa.String(255), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("alt_text", sa.String(255), nullable=False, server_default=""),
        sa.Column("storage_key", sa.String(500)),
        sa.Column("playback_storage_key", sa.String(500)),
        sa.Column("external_url", sa.String(1000)),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("external_video_id", sa.String(160)),
        sa.Column("thumbnail_storage_key", sa.String(500)),
        sa.Column("caption_storage_key", sa.String(500)),
        sa.Column("original_filename", sa.String(255)),
        sa.Column("mime_type", sa.String(100)),
        sa.Column("file_size", sa.Integer()),
        sa.Column("checksum", sa.String(64)),
        sa.Column("duration_seconds", sa.Numeric(10, 3)),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_featured", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("show_in_catalogue", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("show_in_public_catalogue", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("show_controls", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allow_download", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("autoplay", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("muted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("loop", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("processing_status", sa.String(30), nullable=False, server_default="pending_upload"),
        sa.Column("processing_error", sa.String(500), nullable=False, server_default=""),
        sa.Column("uploaded_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_product_videos_product", "product_videos", ["product_id", "display_order"])
    op.create_index("ix_product_videos_active", "product_videos", ["is_active", "deleted_at"])

    with op.batch_alter_table("catalogue_products") as batch:
        batch.add_column(sa.Column("include_video", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.add_column(sa.Column("selected_video_id", sa.Uuid(), nullable=True))
        batch.add_column(sa.Column("video_title_override", sa.String(255), nullable=False, server_default=""))
        batch.add_column(sa.Column("video_description_override", sa.Text(), nullable=False, server_default=""))
        batch.add_column(sa.Column("video_display_mode", sa.String(30), nullable=False, server_default="product_detail"))
        batch.create_foreign_key("fk_catalogue_products_selected_video", "product_videos", ["selected_video_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    with op.batch_alter_table("catalogue_products") as batch:
        batch.drop_constraint("fk_catalogue_products_selected_video", type_="foreignkey")
        batch.drop_column("video_display_mode")
        batch.drop_column("video_description_override")
        batch.drop_column("video_title_override")
        batch.drop_column("selected_video_id")
        batch.drop_column("include_video")
    op.drop_index("ix_product_videos_active", table_name="product_videos")
    op.drop_index("ix_product_videos_product", table_name="product_videos")
    op.drop_table("product_videos")
