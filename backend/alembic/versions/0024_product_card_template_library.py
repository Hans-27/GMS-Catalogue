"""Reusable product-card templates and immutable template versions.

Revision ID: 0024_product_card_template_library
Revises: 0023_catalogue_template_governance
"""

from alembic import op
import sqlalchemy as sa


revision = "0024_product_card_template_library"
down_revision = "0023_catalogue_template_governance"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    # SQLite batch mode can leave this exact temporary table behind if an
    # earlier migration attempt is interrupted before the rename step.
    if bind.dialect.name == "sqlite" and "_alembic_tmp_product_card_templates" in inspector.get_table_names():
        op.drop_table("_alembic_tmp_product_card_templates")
        inspector = sa.inspect(bind)
    existing = {column["name"] for column in inspector.get_columns("product_card_templates")}
    columns = [
        sa.Column("template_type", sa.String(40), nullable=False, server_default="standard"),
        sa.Column("owner_user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL", name="fk_product_card_templates_owner")),
        sa.Column("department_id", sa.Integer(), sa.ForeignKey("departments.id", ondelete="SET NULL", name="fk_product_card_templates_department")),
        sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL", name="fk_product_card_templates_team")),
        sa.Column("dimension_unit", sa.String(12), nullable=False, server_default="px"),
        sa.Column("layout_mode", sa.String(20), nullable=False, server_default="responsive"),
        sa.Column("min_width", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("min_height", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("aspect_ratio", sa.Float()),
        sa.Column("price_mode", sa.String(20), nullable=False, server_default="one_price"),
        sa.Column("visibility_scope", sa.String(30), nullable=False, server_default="only_me"),
        sa.Column("is_company_template", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("approval_status", sa.String(30), nullable=False, server_default="draft"),
        sa.Column("current_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("brand_scope_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("category_scope_json", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
    ]
    missing = [column for column in columns if column.name not in existing]
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("product_card_templates") as batch:
            for column in missing:
                batch.add_column(column)
    else:
        for column in missing:
            op.add_column("product_card_templates", column)

    if "product_card_template_versions" not in inspector.get_table_names():
        op.create_table(
            "product_card_template_versions",
            sa.Column("id", sa.Uuid(), primary_key=True),
            sa.Column("template_id", sa.Uuid(), sa.ForeignKey("product_card_templates.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version_number", sa.Integer(), nullable=False),
            sa.Column("width", sa.Integer(), nullable=False),
            sa.Column("height", sa.Integer(), nullable=False),
            sa.Column("layout_mode", sa.String(20), nullable=False),
            sa.Column("card_properties_json", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("elements_json", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("change_note", sa.String(500), nullable=False, server_default=""),
            sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL")),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("template_id", "version_number", name="uq_product_card_template_version"),
        )
        op.create_index(
            "ix_product_card_template_versions_template",
            "product_card_template_versions",
            ["template_id", "version_number"],
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "product_card_template_versions" in inspector.get_table_names():
        op.drop_index("ix_product_card_template_versions_template", table_name="product_card_template_versions")
        op.drop_table("product_card_template_versions")
    names = [
        "deleted_at", "category_scope_json", "brand_scope_json", "current_version",
        "approval_status", "is_company_template", "visibility_scope", "price_mode",
        "aspect_ratio", "min_height", "min_width", "layout_mode", "dimension_unit",
        "team_id", "department_id", "owner_user_id", "template_type",
    ]
    existing = {column["name"] for column in sa.inspect(bind).get_columns("product_card_templates")}
    with op.batch_alter_table("product_card_templates") as batch:
        for name in names:
            if name in existing:
                batch.drop_column(name)
