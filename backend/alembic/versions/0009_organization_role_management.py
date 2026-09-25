"""Expand role, position, team, and user organization management.

Revision ID: 0009_org_role_management
Revises: 0008_product_source_tracking
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect, text


revision = "0009_org_role_management"
down_revision = "0008_product_source_tracking"
branch_labels = None
depends_on = None


def _columns(table: str) -> set[str]:
    return {column["name"] for column in inspect(op.get_bind()).get_columns(table)}


def _add_columns(table: str, columns: list[sa.Column]) -> None:
    existing = _columns(table)
    missing = [column for column in columns if column.name not in existing]
    if not missing:
        return
    with op.batch_alter_table(table) as batch:
        for column in missing:
            batch.add_column(column)


def upgrade() -> None:
    _add_columns("user_roles", [
        sa.Column("assigned_by_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_user_roles_assigned_by", ondelete="SET NULL"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ])
    _add_columns("user_teams", [
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    ])
    _add_columns("roles", [
        sa.Column("role_type", sa.String(20), nullable=False, server_default="custom"),
        sa.Column("default_scope", sa.String(40), nullable=False, server_default="none"),
        sa.Column("department_restriction_id", sa.Integer(), sa.ForeignKey("departments.id", name="fk_roles_department_restriction", ondelete="SET NULL"), nullable=True),
        sa.Column("team_restriction_id", sa.Integer(), sa.ForeignKey("teams.id", name="fk_roles_team_restriction", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_roles_created_by", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_roles_updated_by", ondelete="SET NULL"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ])
    _add_columns("positions", [
        sa.Column("name_th", sa.String(120), nullable=False, server_default=""),
        sa.Column("management_level", sa.String(40), nullable=False, server_default="staff"),
        sa.Column("default_team_id", sa.Integer(), sa.ForeignKey("teams.id", name="fk_positions_default_team", ondelete="SET NULL"), nullable=True),
        sa.Column("reports_to_position_id", sa.Integer(), sa.ForeignKey("positions.id", name="fk_positions_reports_to", ondelete="SET NULL"), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_positions_created_by", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_positions_updated_by", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ])
    _add_columns("teams", [
        sa.Column("name_th", sa.String(120), nullable=False, server_default=""),
        sa.Column("team_leader_user_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_teams_leader", ondelete="SET NULL"), nullable=True),
        sa.Column("parent_team_id", sa.Integer(), sa.ForeignKey("teams.id", name="fk_teams_parent", ondelete="SET NULL"), nullable=True),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_teams_created_by", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by_id", sa.Uuid(), sa.ForeignKey("users.id", name="fk_teams_updated_by", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ])
    _add_columns("user_organization_profiles", [
        sa.Column("primary_team_id", sa.Integer(), sa.ForeignKey("teams.id", name="fk_user_org_primary_team", ondelete="SET NULL"), nullable=True),
    ])

    connection = op.get_bind()
    connection.execute(text("UPDATE roles SET role_type = 'system' WHERE is_system = 1 OR lower(name) = 'system_user'"))
    connection.execute(text("UPDATE roles SET default_scope = 'all' WHERE is_system = 1 OR lower(name) = 'system_user'"))
    connection.execute(text("UPDATE positions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    connection.execute(text("UPDATE positions SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
    connection.execute(text("UPDATE teams SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    connection.execute(text("UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))
    with op.batch_alter_table("positions") as batch:
        batch.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
        batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
    with op.batch_alter_table("teams") as batch:
        batch.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())
        batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())

    if "team_roles" not in set(inspect(connection).get_table_names()):
        op.create_table(
            "team_roles",
            sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", name="fk_team_roles_team", ondelete="CASCADE"), primary_key=True),
            sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id", name="fk_team_roles_role", ondelete="CASCADE"), primary_key=True),
        )

    indexes = {index["name"] for table in ("roles", "positions", "teams", "user_organization_profiles") for index in inspect(connection).get_indexes(table)}
    for name, table, columns in (
        ("ix_roles_active_deleted", "roles", ["is_active", "deleted_at"]),
        ("ix_positions_department_active", "positions", ["department_id", "is_active"]),
        ("ix_positions_reports_to", "positions", ["reports_to_position_id"]),
        ("ix_teams_department_active", "teams", ["department_id", "is_active"]),
        ("ix_teams_parent", "teams", ["parent_team_id"]),
        ("ix_user_org_primary_team", "user_organization_profiles", ["primary_team_id"]),
    ):
        if name not in indexes:
            op.create_index(name, table, columns)


def downgrade() -> None:
    connection = op.get_bind()
    for name, table in (
        ("ix_user_org_primary_team", "user_organization_profiles"),
        ("ix_teams_parent", "teams"),
        ("ix_teams_department_active", "teams"),
        ("ix_positions_reports_to", "positions"),
        ("ix_positions_department_active", "positions"),
        ("ix_roles_active_deleted", "roles"),
    ):
        if name in {index["name"] for index in inspect(connection).get_indexes(table)}:
            op.drop_index(name, table_name=table)
    if "team_roles" in set(inspect(connection).get_table_names()):
        op.drop_table("team_roles")
    for table, names in (
        ("user_organization_profiles", ["primary_team_id"]),
        ("teams", ["deleted_at", "updated_at", "created_at", "updated_by_id", "created_by_id", "display_order", "parent_team_id", "team_leader_user_id", "name_th"]),
        ("positions", ["deleted_at", "updated_at", "created_at", "updated_by_id", "created_by_id", "display_order", "reports_to_position_id", "default_team_id", "management_level", "name_th"]),
        ("roles", ["deleted_at", "updated_by_id", "created_by_id", "team_restriction_id", "department_restriction_id", "default_scope", "role_type"]),
        ("user_teams", ["assigned_at", "is_primary"]),
        ("user_roles", ["assigned_at", "assigned_by_id"]),
    ):
        existing = _columns(table)
        with op.batch_alter_table(table) as batch:
            for name in names:
                if name in existing:
                    batch.drop_column(name)
