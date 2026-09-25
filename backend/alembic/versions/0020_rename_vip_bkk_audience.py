"""Rename the VIP catalogue customer level to VIP BKK.

Revision ID: 0020_rename_vip_bkk_audience
Revises: 0019_user_catalogue_price_mappings
"""

from alembic import op


revision = "0020_rename_vip_bkk_audience"
down_revision = "0019_user_catalogue_price_mappings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE catalogue_audience_types "
        "SET display_name = 'VIP BKK' "
        "WHERE code = 'vip'"
    )
    op.execute(
        "UPDATE price_lists "
        "SET name = 'VIP BKK', "
        "description = 'Preferred VIP BKK customer pricing.' "
        "WHERE code = 'VIP'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE catalogue_audience_types "
        "SET display_name = 'VIP' "
        "WHERE code = 'vip'"
    )
    op.execute(
        "UPDATE price_lists "
        "SET name = 'VIP', "
        "description = 'Preferred VIP customer pricing.' "
        "WHERE code = 'VIP'"
    )
