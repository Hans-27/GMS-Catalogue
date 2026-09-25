"""Add configurable catalogue audiences and secure share links.

Revision ID: 0011_catalogue_share_links
Revises: 0010_product_status_sync
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_catalogue_share_links"
down_revision = "0010_product_status_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "catalogue_audience_types",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("code", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("price_list_id", sa.Integer(), sa.ForeignKey("price_lists.id", ondelete="SET NULL")),
        sa.Column("show_prices", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("button_style_key", sa.String(30), nullable=False, server_default="default"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("updated_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("code", name="uq_catalogue_audience_type_code"),
    )
    op.create_index("ix_catalogue_audience_active_order", "catalogue_audience_types", ["is_active", "display_order"])
    op.create_table(
        "catalogue_share_links",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("catalogue_id", sa.Uuid(), sa.ForeignKey("catalogues.id", ondelete="CASCADE"), nullable=False),
        sa.Column("audience_type_id", sa.Integer(), sa.ForeignKey("catalogue_audience_types.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("version_mode", sa.String(30), nullable=False, server_default="latest_published"),
        sa.Column("fixed_version_id", sa.Uuid(), sa.ForeignKey("catalogue_versions.id", ondelete="SET NULL")),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("encrypted_token", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="active"),
        sa.Column("expires_at", sa.DateTime(timezone=True)),
        sa.Column("password_hash", sa.String(512)),
        sa.Column("allow_pdf_download", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allow_print", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("revoked_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True)),
        sa.Column("view_count", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("catalogue_id", "audience_type_id", name="uq_catalogue_audience_share_link"),
        sa.UniqueConstraint("token_hash", name="uq_catalogue_share_token_hash"),
    )
    op.create_index("ix_catalogue_share_link_status", "catalogue_share_links", ["status", "expires_at"])


def downgrade() -> None:
    op.drop_index("ix_catalogue_share_link_status", table_name="catalogue_share_links")
    op.drop_table("catalogue_share_links")
    op.drop_index("ix_catalogue_audience_active_order", table_name="catalogue_audience_types")
    op.drop_table("catalogue_audience_types")
