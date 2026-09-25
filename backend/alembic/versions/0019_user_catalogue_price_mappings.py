"""Add per-user catalogue price mappings and user-owned share links.

Revision ID: 0019_user_catalogue_price_mappings
Revises: 0018_vip_province_catalogue_audience
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_user_catalogue_price_mappings"
down_revision = "0018_vip_province_catalogue_audience"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_catalogue_price_mappings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("audience_type_id", sa.Integer(), sa.ForeignKey("catalogue_audience_types.id", ondelete="CASCADE"), nullable=False),
        sa.Column("price_list_id", sa.Integer(), sa.ForeignKey("price_lists.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "audience_type_id", name="uq_user_catalogue_price_mapping"),
    )
    op.create_index("ix_user_catalogue_price_mapping_user", "user_catalogue_price_mappings", ["user_id"])

    # Historical automation could create links without an owner. Preserve
    # those links in the SuperAdmin workspace before links become user-owned.
    op.execute(
        """
        UPDATE catalogue_share_links
        SET created_by_id = (
            SELECT user_roles.user_id
            FROM user_roles
            JOIN roles ON roles.id = user_roles.role_id
            WHERE roles.system_key = 'SUPERADMIN'
            ORDER BY user_roles.user_id
            LIMIT 1
        )
        WHERE created_by_id IS NULL
          AND EXISTS (
            SELECT 1
            FROM user_roles
            JOIN roles ON roles.id = user_roles.role_id
            WHERE roles.system_key = 'SUPERADMIN'
          )
        """
    )

    with op.batch_alter_table("catalogue_share_links", recreate="always") as batch:
        batch.add_column(sa.Column("price_list_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("show_prices", sa.Boolean(), nullable=False, server_default=sa.true()))
        batch.create_foreign_key(
            "fk_catalogue_share_links_price_list",
            "price_lists",
            ["price_list_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.drop_constraint("uq_catalogue_audience_share_link", type_="unique")
        batch.create_unique_constraint(
            "uq_catalogue_audience_user_share_link",
            ["catalogue_id", "audience_type_id", "created_by_id"],
        )
    op.execute(
        """
        UPDATE catalogue_share_links
        SET price_list_id = (
                SELECT price_list_id
                FROM catalogue_audience_types
                WHERE catalogue_audience_types.id = catalogue_share_links.audience_type_id
            ),
            show_prices = (
                SELECT show_prices
                FROM catalogue_audience_types
                WHERE catalogue_audience_types.id = catalogue_share_links.audience_type_id
            )
        """
    )


def downgrade() -> None:
    with op.batch_alter_table("catalogue_share_links", recreate="always") as batch:
        batch.drop_constraint("uq_catalogue_audience_user_share_link", type_="unique")
        batch.create_unique_constraint(
            "uq_catalogue_audience_share_link",
            ["catalogue_id", "audience_type_id"],
        )
        batch.drop_constraint("fk_catalogue_share_links_price_list", type_="foreignkey")
        batch.drop_column("show_prices")
        batch.drop_column("price_list_id")
    op.drop_index("ix_user_catalogue_price_mapping_user", table_name="user_catalogue_price_mappings")
    op.drop_table("user_catalogue_price_mappings")
