"""Add complete promotion management data model.

Revision ID: 0015_promotion_management
Revises: 0014_catalogue_video_thumbnail_mode
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_promotion_management"
down_revision = "0014_catalogue_video_thumbnail_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "promotion_occasions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name_en", sa.String(120), nullable=False),
        sa.Column("name_th", sa.String(120), nullable=False, server_default=""),
        sa.Column("description", sa.String(500), nullable=False, server_default=""),
        sa.Column("icon_key", sa.String(80), nullable=False, server_default="calendar"),
        sa.Column("default_banner_style", sa.String(80), nullable=False, server_default="default"),
        sa.Column("recurring_annually", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("default_start_month", sa.Integer()), sa.Column("default_start_day", sa.Integer()),
        sa.Column("default_end_month", sa.Integer()), sa.Column("default_end_day", sa.Integer()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_promotion_occasions_active_order", "promotion_occasions", ["is_active", "display_order"])
    op.create_table(
        "promotions",
        sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("code", sa.String(80), nullable=False, unique=True),
        sa.Column("name_en", sa.String(220), nullable=False), sa.Column("name_th", sa.String(220), nullable=False, server_default=""),
        sa.Column("short_title", sa.String(160), nullable=False, server_default=""),
        sa.Column("description_en", sa.Text(), nullable=False, server_default=""), sa.Column("description_th", sa.Text(), nullable=False, server_default=""),
        sa.Column("occasion_id", sa.Integer(), sa.ForeignKey("promotion_occasions.id", ondelete="SET NULL")),
        sa.Column("promotion_type", sa.String(40), nullable=False), sa.Column("status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="50"), sa.Column("allow_stacking", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("base_price_change_behavior", sa.String(40), nullable=False, server_default="require_reapproval"),
        sa.Column("owner_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id", ondelete="SET NULL")),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL")),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False), sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("timezone", sa.String(60), nullable=False, server_default="Asia/Bangkok"), sa.Column("publish_at", sa.DateTime(timezone=True)),
        sa.Column("automatic_activation", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("automatic_expiration", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("repeat_annually", sa.Boolean(), nullable=False, server_default=sa.false()), sa.Column("expiration_warning_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("show_stock", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("hide_out_of_stock", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("minimum_stock", sa.Integer(), nullable=False, server_default="0"), sa.Column("stop_product_at_zero_stock", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("terms_en", sa.Text(), nullable=False, server_default=""), sa.Column("terms_th", sa.Text(), nullable=False, server_default=""),
        sa.Column("internal_note", sa.Text(), nullable=False, server_default=""), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("published_at", sa.DateTime(timezone=True)), sa.Column("approved_at", sa.DateTime(timezone=True)),
        sa.Column("approved_by_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("rejection_reason", sa.Text(), nullable=False, server_default=""), sa.Column("paused_at", sa.DateTime(timezone=True)), sa.Column("cancelled_at", sa.DateTime(timezone=True)),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("updated_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("priority >= 1 AND priority <= 100", name="ck_promotion_priority"), sa.CheckConstraint("end_at > start_at", name="ck_promotion_dates"),
    )
    op.create_index("ix_promotions_status_schedule", "promotions", ["status", "start_at", "end_at"])
    op.create_index("ix_promotions_owner", "promotions", ["owner_user_id", "updated_at"])
    op.create_table(
        "promotion_brands", sa.Column("promotion_id", sa.Uuid(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("include_all_active_products", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_table(
        "promotion_audiences", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("promotion_id", sa.Uuid(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("audience_type_id", sa.Integer(), sa.ForeignKey("catalogue_audience_types.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("price_list_id", sa.Integer(), sa.ForeignKey("price_lists.id", ondelete="SET NULL")),
        sa.Column("show_prices", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("promotion_id", "audience_type_id", "price_list_id", name="uq_promotion_audience_price"),
    )
    op.create_table(
        "promotion_catalogues", sa.Column("promotion_id", sa.Uuid(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("catalogue_id", sa.Uuid(), sa.ForeignKey("catalogues.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_table(
        "promotion_products", sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("promotion_id", sa.Uuid(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("audience_type_id", sa.Integer(), sa.ForeignKey("catalogue_audience_types.id", ondelete="CASCADE")),
        sa.Column("price_list_id", sa.Integer(), sa.ForeignKey("price_lists.id", ondelete="RESTRICT")),
        sa.Column("promotion_type", sa.String(40), nullable=False), sa.Column("base_price", sa.Numeric(14, 2)), sa.Column("approved_base_price", sa.Numeric(14, 2)),
        sa.Column("discount_percent", sa.Numeric(7, 4)), sa.Column("discount_amount", sa.Numeric(14, 2)), sa.Column("promotion_price", sa.Numeric(14, 2)),
        sa.Column("currency", sa.String(3), nullable=False, server_default="THB"), sa.Column("include_in_promotion", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("promotion_id", "product_id", "audience_type_id", "price_list_id", name="uq_promotion_product_audience_price"),
        sa.CheckConstraint("base_price IS NULL OR base_price >= 0", name="ck_promotion_product_base_price"), sa.CheckConstraint("promotion_price IS NULL OR promotion_price >= 0", name="ck_promotion_product_price"),
    )
    op.create_index("ix_promotion_products_lookup", "promotion_products", ["product_id", "audience_type_id", "price_list_id"])
    op.create_table(
        "promotion_media", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("promotion_id", sa.Uuid(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("media_type", sa.String(40), nullable=False), sa.Column("storage_key", sa.String(500)), sa.Column("preview_storage_key", sa.String(500)), sa.Column("external_url", sa.String(1000)),
        sa.Column("original_filename", sa.String(255), nullable=False, server_default=""), sa.Column("mime_type", sa.String(100)), sa.Column("file_size", sa.Integer()), sa.Column("alt_text", sa.String(255), nullable=False, server_default=""),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"), sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("uploaded_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_promotion_media_active", "promotion_media", ["promotion_id", "media_type", "is_active"])
    op.create_table(
        "promotion_share_links", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("promotion_id", sa.Uuid(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("audience_type_id", sa.Integer(), sa.ForeignKey("catalogue_audience_types.id", ondelete="RESTRICT"), nullable=False), sa.Column("token_hash", sa.String(64), nullable=False, unique=True), sa.Column("encrypted_token", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"), sa.Column("expires_at", sa.DateTime(timezone=True)), sa.Column("allow_pdf", sa.Boolean(), nullable=False, server_default=sa.true()), sa.Column("allow_print", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()), sa.Column("revoked_at", sa.DateTime(timezone=True)), sa.Column("last_accessed_at", sa.DateTime(timezone=True)), sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_promotion_share_status", "promotion_share_links", ["status", "expires_at"])
    op.create_table(
        "promotion_status_history", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("promotion_id", sa.Uuid(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("old_status", sa.String(30)), sa.Column("new_status", sa.String(30), nullable=False), sa.Column("reason", sa.Text(), nullable=False, server_default=""), sa.Column("changed_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_promotion_status_history", "promotion_status_history", ["promotion_id", "changed_at"])
    op.create_table(
        "promotion_price_history", sa.Column("id", sa.Uuid(), primary_key=True), sa.Column("promotion_id", sa.Uuid(), sa.ForeignKey("promotions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False), sa.Column("audience_type_id", sa.Integer(), sa.ForeignKey("catalogue_audience_types.id", ondelete="SET NULL")),
        sa.Column("old_base_price", sa.Numeric(14, 2)), sa.Column("new_base_price", sa.Numeric(14, 2)), sa.Column("old_promotion_price", sa.Numeric(14, 2)), sa.Column("new_promotion_price", sa.Numeric(14, 2)),
        sa.Column("reason", sa.String(500), nullable=False), sa.Column("changed_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")), sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_promotion_price_history", "promotion_price_history", ["promotion_id", "product_id", "changed_at"])


def downgrade() -> None:
    for table in ["promotion_price_history", "promotion_status_history", "promotion_share_links", "promotion_media", "promotion_products", "promotion_catalogues", "promotion_audiences", "promotion_brands", "promotions", "promotion_occasions"]:
        op.drop_table(table)

