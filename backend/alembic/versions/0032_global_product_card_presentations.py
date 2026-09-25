"""Add global product-card drafts and immutable published versions."""

from alembic import op
import sqlalchemy as sa


revision = "0032_global_product_cards"
down_revision = "0031_online_catalogue_cover"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    if "global_product_cards" not in tables:
        op.create_table(
            "global_product_cards",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("product_id", sa.Uuid(), sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
            sa.Column("template_id", sa.Uuid(), sa.ForeignKey("product_card_templates.id", ondelete="SET NULL")),
            sa.Column("draft_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("published_json", sa.JSON()),
            sa.Column("draft_revision", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("active_version", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("drafted_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("published_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("published_at", sa.DateTime(timezone=True)),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("product_id", name="uq_global_product_card_product"),
        )
        op.create_index("ix_global_product_cards_updated", "global_product_cards", ["updated_at"])
    if "global_product_card_versions" not in tables:
        op.create_table(
            "global_product_card_versions",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("card_id", sa.Uuid(), sa.ForeignKey("global_product_cards.id", ondelete="CASCADE"), nullable=False),
            sa.Column("template_id", sa.Uuid(), sa.ForeignKey("product_card_templates.id", ondelete="SET NULL")),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("presentation_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("change_note", sa.String(500), nullable=False, server_default=""),
            sa.Column("published_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("published_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("card_id", "version_number", name="uq_global_product_card_version"),
        )
        op.create_index(
            "ix_global_product_card_versions_card",
            "global_product_card_versions",
            ["card_id", "version_number"],
        )


def downgrade() -> None:
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "global_product_card_versions" in tables:
        op.drop_index("ix_global_product_card_versions_card", table_name="global_product_card_versions")
        op.drop_table("global_product_card_versions")
    if "global_product_cards" in tables:
        op.drop_index("ix_global_product_cards_updated", table_name="global_product_cards")
        op.drop_table("global_product_cards")
