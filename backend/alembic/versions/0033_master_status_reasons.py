"""Store administrator reasons for disabled brands and categories."""

from alembic import op
import sqlalchemy as sa


revision = "0033_master_status_reasons"
down_revision = "0032_global_product_cards"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    for table_name in ("brands", "categories"):
        if "inactive_reason" not in _columns(table_name):
            op.add_column(
                table_name,
                sa.Column(
                    "inactive_reason",
                    sa.String(500),
                    nullable=False,
                    server_default="",
                ),
            )


def downgrade() -> None:
    for table_name in ("categories", "brands"):
        if "inactive_reason" in _columns(table_name):
            op.drop_column(table_name, "inactive_reason")
