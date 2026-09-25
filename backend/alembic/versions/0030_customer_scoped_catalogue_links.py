"""Add customer-scoped catalogue links for shared portal accounts.

Revision ID: 0030_customer_scoped_catalogue_links
Revises: 0029_brand_price_mappings
"""

from alembic import op
import sqlalchemy as sa


revision = "0030_customer_scoped_catalogue_links"
down_revision = "0029_brand_price_mappings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("catalogue_share_links")}
    with op.batch_alter_table("catalogue_share_links", recreate="always") as batch:
        if "customer_code" not in columns:
            batch.add_column(
                sa.Column(
                    "customer_code",
                    sa.String(length=80),
                    nullable=False,
                    server_default="",
                )
            )
        if "customer_name" not in columns:
            batch.add_column(sa.Column("customer_name", sa.String(length=160), nullable=True))
        unique_names = {
            constraint.get("name")
            for constraint in inspector.get_unique_constraints("catalogue_share_links")
        }
        if "uq_catalogue_audience_user_share_link" in unique_names:
            batch.drop_constraint("uq_catalogue_audience_user_share_link", type_="unique")
        if "uq_catalogue_audience_user_customer_share_link" not in unique_names:
            batch.create_unique_constraint(
                "uq_catalogue_audience_user_customer_share_link",
                ["catalogue_id", "audience_type_id", "created_by_id", "customer_code"],
            )
    indexes = {
        index.get("name")
        for index in sa.inspect(op.get_bind()).get_indexes("catalogue_share_links")
    }
    if "ix_catalogue_share_link_customer" not in indexes:
        op.create_index(
            "ix_catalogue_share_link_customer",
            "catalogue_share_links",
            ["catalogue_id", "created_by_id", "customer_code"],
        )


def downgrade() -> None:
    # Legacy schemas support only one link per audience and owner. Customer-
    # specific links cannot be represented there, so retain only base links.
    op.execute("DELETE FROM catalogue_share_links WHERE customer_code <> ''")
    op.drop_index("ix_catalogue_share_link_customer", table_name="catalogue_share_links")
    with op.batch_alter_table("catalogue_share_links", recreate="always") as batch:
        batch.drop_constraint(
            "uq_catalogue_audience_user_customer_share_link",
            type_="unique",
        )
        batch.create_unique_constraint(
            "uq_catalogue_audience_user_share_link",
            ["catalogue_id", "audience_type_id", "created_by_id"],
        )
        batch.drop_column("customer_name")
        batch.drop_column("customer_code")
