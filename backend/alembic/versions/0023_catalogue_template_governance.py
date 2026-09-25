"""Catalogue template ownership, scope and approval workflow.

Revision ID: 0023_catalogue_template_governance
Revises: 0022_catalogue_studio_commerce
"""

from alembic import op
import sqlalchemy as sa


revision = "0023_catalogue_template_governance"
down_revision = "0022_catalogue_studio_commerce"
branch_labels = None
depends_on = None


def upgrade():
    columns = [
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id", ondelete="SET NULL", name="fk_catalogue_templates_department")),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL", name="fk_catalogue_templates_team")),
        sa.Column("brand_scope_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("category_scope_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("is_company_template", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("approval_status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("approved_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_catalogue_templates_approved_by")),
        sa.Column("approved_at", sa.DateTime(timezone=True)),
    ]
    bind = op.get_bind()
    existing = {column["name"] for column in sa.inspect(bind).get_columns("catalogue_templates")}
    missing = [column for column in columns if column.name not in existing]
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("catalogue_templates") as batch:
            for column in missing:
                batch.add_column(column)
    else:
        for column in missing:
            op.add_column("catalogue_templates", column)


def downgrade():
    names = ["approved_at", "approved_by_id", "approval_status", "is_company_template", "category_scope_json", "brand_scope_json", "team_id", "department_id"]
    with op.batch_alter_table("catalogue_templates") as batch:
        for name in names:
            batch.drop_column(name)
