"""Add the VIP Province catalogue-link audience.

Revision ID: 0018_vip_province_catalogue_audience
Revises: 0017_product_source_lifecycle
"""

from alembic import op
import sqlalchemy as sa


revision = "0018_vip_province_catalogue_audience"
down_revision = "0017_product_source_lifecycle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    price_lists = sa.Table(
        "price_lists",
        metadata,
        sa.Column("id", sa.Integer),
        sa.Column("code", sa.String),
        sa.Column("is_no_price", sa.Boolean),
    )
    audiences = sa.Table(
        "catalogue_audience_types",
        metadata,
        sa.Column("id", sa.Integer),
        sa.Column("code", sa.String),
        sa.Column("display_name", sa.String),
        sa.Column("price_list_id", sa.Integer),
        sa.Column("show_prices", sa.Boolean),
        sa.Column("display_order", sa.Integer),
        sa.Column("button_style_key", sa.String),
        sa.Column("is_active", sa.Boolean),
    )

    exists = bind.scalar(
        sa.select(audiences.c.id).where(audiences.c.code == "vip_province")
    )
    if exists is not None:
        return

    vip_price_list_id = bind.scalar(
        sa.select(price_lists.c.id).where(price_lists.c.code == "VIP")
    )
    if vip_price_list_id is None:
        return

    highest_priced_order = bind.scalar(
        sa.select(sa.func.max(audiences.c.display_order))
        .select_from(
            audiences.join(
                price_lists,
                audiences.c.price_list_id == price_lists.c.id,
            )
        )
        .where(price_lists.c.is_no_price.is_(False))
    ) or 0
    vip_province_order = int(highest_priced_order) + 1
    bind.execute(
        audiences.insert().values(
            code="vip_province",
            display_name="VIP Province",
            price_list_id=vip_price_list_id,
            show_prices=True,
            display_order=vip_province_order,
            button_style_key="vip",
            is_active=True,
        )
    )
    bind.execute(
        audiences.update()
        .where(audiences.c.code == "no_price")
        .values(display_order=vip_province_order + 1)
    )


def downgrade() -> None:
    bind = op.get_bind()
    metadata = sa.MetaData()
    audiences = sa.Table(
        "catalogue_audience_types",
        metadata,
        sa.Column("id", sa.Integer),
        sa.Column("code", sa.String),
    )
    links = sa.Table(
        "catalogue_share_links",
        metadata,
        sa.Column("audience_type_id", sa.Integer),
    )
    audience_id = bind.scalar(
        sa.select(audiences.c.id).where(audiences.c.code == "vip_province")
    )
    if audience_id is not None:
        bind.execute(
            links.delete().where(links.c.audience_type_id == audience_id)
        )
        bind.execute(audiences.delete().where(audiences.c.id == audience_id))
