"""Separate public catalogue delivery from editorial status.

Revision ID: 0034_catalogue_public_access
Revises: 0033_master_status_reasons
"""

from alembic import op
import sqlalchemy as sa


revision = "0034_catalogue_public_access"
down_revision = "0033_master_status_reasons"
branch_labels = None
depends_on = None


def _columns(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if table_name not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    if "public_access_enabled" in _columns("catalogues"):
        return
    op.add_column(
        "catalogues",
        sa.Column(
            "public_access_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    catalogues = sa.table(
        "catalogues",
        sa.column("version", sa.Integer()),
        sa.column("status", sa.String()),
        sa.column("public_access_enabled", sa.Boolean()),
    )
    op.execute(
        catalogues.update()
        .where(
            catalogues.c.version >= 1,
            catalogues.c.status.in_(("published", "draft")),
        )
        .values(public_access_enabled=True)
    )


def downgrade() -> None:
    if "public_access_enabled" in _columns("catalogues"):
        op.drop_column("catalogues", "public_access_enabled")
