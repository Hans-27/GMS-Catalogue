"""Catalogue Studio commerce, visibility and promotion configuration.

Revision ID: 0022_catalogue_studio_commerce
Revises: 0021_catalogue_design_studio
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_catalogue_studio_commerce"
down_revision = "0021_catalogue_design_studio"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    design_columns = {column["name"] for column in inspector.get_columns("catalogue_designs")}
    additions = [
        sa.Column("catalogue_type", sa.String(30), nullable=False, server_default="standard"),
        sa.Column("brand_mode", sa.String(20), nullable=False, server_default="single"),
        sa.Column("start_at", sa.DateTime(timezone=True)),
        sa.Column("end_at", sa.DateTime(timezone=True)),
        sa.Column("timezone", sa.String(80), nullable=False, server_default="Asia/Bangkok"),
        sa.Column("promotion_name", sa.String(220), nullable=False, server_default=""),
        sa.Column("promotion_status", sa.String(30)),
        sa.Column("promotion_occasion_id", sa.Integer(), sa.ForeignKey("promotion_occasions.id", ondelete="SET NULL")),
        sa.Column("promotion_priority", sa.Integer(), nullable=False, server_default="50"),
        sa.Column("promotion_terms", sa.Text(), nullable=False, server_default=""),
    ]
    missing = [column for column in additions if column.name not in design_columns]
    if bind.dialect.name == "sqlite" and missing:
        with op.batch_alter_table("catalogue_designs") as batch:
            for column in missing:
                batch.add_column(column)
    else:
        for column in missing:
            op.add_column("catalogue_designs", column)
    page_columns = {column["name"] for column in sa.inspect(bind).get_columns("catalogue_design_pages")}
    if "is_locked" not in page_columns:
        op.add_column("catalogue_design_pages", sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.create_table(
        "catalogue_design_brands",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("design_id", sa.Uuid(), sa.ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("brand_id", sa.Integer(), sa.ForeignKey("brands.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("design_id", "brand_id", name="uq_catalogue_design_brand"),
        sa.UniqueConstraint("design_id", "display_order", name="uq_catalogue_design_brand_order"),
    )
    op.create_index("ix_catalogue_design_brands_brand", "catalogue_design_brands", ["brand_id", "is_visible"])
    op.create_table(
        "catalogue_design_price_slots",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("design_id", sa.Uuid(), sa.ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slot_number", sa.Integer(), nullable=False),
        sa.Column("price_list_id", sa.Integer(), sa.ForeignKey("price_lists.id", ondelete="SET NULL")),
        sa.Column("display_label", sa.String(120), nullable=False),
        sa.Column("currency_display", sa.String(20), nullable=False, server_default="code"),
        sa.Column("decimal_places", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("design_id", "slot_number", name="uq_catalogue_design_price_slot"),
    )
    op.create_index("ix_catalogue_design_price_slots_price_list", "catalogue_design_price_slots", ["price_list_id"])
    op.create_table(
        "catalogue_design_products",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("design_id", sa.Uuid(), sa.ForeignKey("catalogue_designs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("is_visible", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("hidden_reason", sa.String(200), nullable=False, server_default=""),
        sa.Column("selected_video_id", sa.Uuid(), sa.ForeignKey("product_videos.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("design_id", "product_id", name="uq_catalogue_design_product"),
        sa.UniqueConstraint("design_id", "display_order", name="uq_catalogue_design_product_order"),
    )
    op.create_index("ix_catalogue_design_products_visibility", "catalogue_design_products", ["design_id", "is_visible"])


def downgrade():
    op.drop_index("ix_catalogue_design_products_visibility", table_name="catalogue_design_products")
    op.drop_table("catalogue_design_products")
    op.drop_index("ix_catalogue_design_price_slots_price_list", table_name="catalogue_design_price_slots")
    op.drop_table("catalogue_design_price_slots")
    op.drop_index("ix_catalogue_design_brands_brand", table_name="catalogue_design_brands")
    op.drop_table("catalogue_design_brands")
    op.drop_column("catalogue_design_pages", "is_locked")
    for name in ("promotion_terms", "promotion_priority", "promotion_occasion_id", "promotion_status", "promotion_name", "timezone", "end_at", "start_at", "brand_mode", "catalogue_type"):
        op.drop_column("catalogue_designs", name)
