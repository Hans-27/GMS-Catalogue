"""Store draft and published online-only catalogue cover references."""

from alembic import op
import sqlalchemy as sa

revision = "0031_online_catalogue_cover"
down_revision = "0030_customer_scoped_catalogue_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("catalogue_designs")}
    for name in ("online_cover_json", "published_online_cover_json"):
        if name not in columns:
            op.add_column("catalogue_designs", sa.Column(name, sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("catalogue_designs") as batch:
        batch.drop_column("published_online_cover_json")
        batch.drop_column("online_cover_json")
