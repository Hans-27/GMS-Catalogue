"""Add Catalogue Design Studio persistence.

Revision ID: 0021_catalogue_design_studio
Revises: 0020_rename_vip_bkk_audience
"""

from alembic import op
import sqlalchemy as sa


revision = "0021_catalogue_design_studio"
down_revision = "0020_rename_vip_bkk_audience"
branch_labels = None
depends_on = None


def timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ]


def upgrade() -> None:
    op.create_table(
        "catalogue_designs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("catalogue_id", sa.Uuid(), sa.ForeignKey("catalogues.id", ondelete="SET NULL")),
        sa.Column("name", sa.String(220), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("page_width", sa.Integer(), nullable=False, server_default="794"),
        sa.Column("page_height", sa.Integer(), nullable=False, server_default="1123"),
        sa.Column("orientation", sa.String(20), nullable=False, server_default="portrait"),
        sa.Column("size_preset", sa.String(30), nullable=False, server_default="a4_portrait"),
        sa.Column("data_mode", sa.String(20), nullable=False, server_default="live"),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        *timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_catalogue_designs_owner_updated", "catalogue_designs", ["created_by_id", "updated_at"])
    op.create_index("ix_catalogue_designs_status", "catalogue_designs", ["status", "deleted_at"])

    op.create_table(
        "catalogue_templates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("template_type", sa.String(40), nullable=False),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("thumbnail_storage_key", sa.String(500)),
        sa.Column("template_data_json", sa.JSON(), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="SET NULL")),
        sa.Column("owner_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("visibility_scope", sa.String(30), nullable=False, server_default="company"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("usage_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        *timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_catalogue_templates_type_active", "catalogue_templates", ["template_type", "is_active"])
    op.create_index("ix_catalogue_templates_owner", "catalogue_templates", ["owner_user_id", "visibility_scope"])

    op.create_table(
        "catalogue_design_pages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("design_id", sa.Uuid(), sa.ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("page_type", sa.String(40), nullable=False),
        sa.Column("page_name", sa.String(160), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer(), nullable=False),
        sa.Column("height", sa.Integer(), nullable=False),
        sa.Column("orientation", sa.String(20), nullable=False, server_default="portrait"),
        sa.Column("background_color", sa.String(9), nullable=False, server_default="#FFFFFF"),
        sa.Column("page_data_json", sa.JSON(), nullable=False),
        sa.Column("thumbnail_storage_key", sa.String(500)),
        sa.Column("template_id", sa.Uuid(), sa.ForeignKey("catalogue_templates.id", ondelete="SET NULL")),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        *timestamps(),
        sa.UniqueConstraint("design_id", "display_order", name="uq_design_page_order"),
    )
    op.create_index("ix_design_pages_design_visible", "catalogue_design_pages", ["design_id", "is_visible"])

    op.create_table(
        "product_card_templates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(180), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("thumbnail_storage_key", sa.String(500)),
        sa.Column("template_data_json", sa.JSON(), nullable=False),
        sa.Column("card_width", sa.Integer(), nullable=False, server_default="320"),
        sa.Column("card_height", sa.Integer(), nullable=False, server_default="420"),
        sa.Column("border_radius", sa.Integer(), nullable=False, server_default="16"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        *timestamps(),
    )
    op.create_index("ix_product_card_templates_active", "product_card_templates", ["is_active", "updated_at"])

    op.create_table(
        "design_assets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("owner_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("asset_type", sa.String(40), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(120), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("width", sa.Integer()),
        sa.Column("height", sa.Integer()),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("alt_text", sa.String(320), nullable=False, server_default=""),
        sa.Column("tags", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("checksum", "owner_user_id", name="uq_design_asset_owner_checksum"),
    )
    op.create_index("ix_design_assets_owner_type", "design_assets", ["owner_user_id", "asset_type"])

    op.create_table(
        "catalogue_design_versions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("design_id", sa.Uuid(), sa.ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", sa.JSON(), nullable=False),
        sa.Column("change_summary", sa.String(500), nullable=False, server_default=""),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("design_id", "version_number", name="uq_catalogue_design_version"),
    )

    op.create_table(
        "catalogue_export_jobs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("design_id", sa.Uuid(), sa.ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Uuid(), sa.ForeignKey("catalogue_design_versions.id", ondelete="SET NULL")),
        sa.Column("export_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
        sa.Column("options_json", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("storage_key", sa.String(500)),
        sa.Column("file_size", sa.Integer()),
        sa.Column("requested_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("error_message", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_catalogue_export_jobs_status", "catalogue_export_jobs", ["status", "created_at"])

    op.create_table(
        "design_color_palettes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="SET NULL")),
        sa.Column("colors_json", sa.JSON(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        *timestamps(),
    )
    op.create_index("ix_design_color_palettes_brand_active", "design_color_palettes", ["brand_id", "is_active"])


def downgrade() -> None:
    op.drop_table("design_color_palettes")
    op.drop_table("catalogue_export_jobs")
    op.drop_table("catalogue_design_versions")
    op.drop_table("design_assets")
    op.drop_table("product_card_templates")
    op.drop_table("catalogue_design_pages")
    op.drop_table("catalogue_templates")
    op.drop_table("catalogue_designs")
