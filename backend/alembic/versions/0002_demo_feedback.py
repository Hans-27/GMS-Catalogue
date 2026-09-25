"""Add demo feedback workflow records.

Revision ID: 0002_demo_feedback
Revises: 0001_existing_platform_baseline
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0002_demo_feedback"
down_revision = "0001_existing_platform_baseline"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Development installations may have created this table through the
    # application's AUTO_CREATE_TABLES compatibility setting before Alembic ran.
    if inspect(op.get_bind()).has_table("demo_feedback"):
        return
    op.create_table(
        "demo_feedback",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("module_page", sa.String(length=160), nullable=False),
        sa.Column("feedback_type", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=220), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("suggested_change", sa.Text(), server_default="", nullable=False),
        sa.Column("priority", sa.String(length=20), server_default="medium", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="new", nullable=False),
        sa.Column("internal_note", sa.Text(), server_default="", nullable=False),
        sa.Column("screenshot_original_name", sa.String(length=255)),
        sa.Column("screenshot_storage_name", sa.String(length=255), unique=True),
        sa.Column("screenshot_url", sa.String(length=500)),
        sa.Column("screenshot_content_type", sa.String(length=80)),
        sa.Column("screenshot_size", sa.Integer()),
        sa.Column("submitted_by_id", sa.Uuid()),
        sa.Column("assigned_to_id", sa.Uuid()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["submitted_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_to_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_demo_feedback_status_created",
        "demo_feedback",
        ["status", "created_at"],
    )
    op.create_index("ix_demo_feedback_priority", "demo_feedback", ["priority"])
    op.create_index("ix_demo_feedback_type", "demo_feedback", ["feedback_type"])
    op.create_index(
        "ix_demo_feedback_module_page", "demo_feedback", ["module_page"]
    )


def downgrade() -> None:
    op.drop_index("ix_demo_feedback_module_page", table_name="demo_feedback")
    op.drop_index("ix_demo_feedback_type", table_name="demo_feedback")
    op.drop_index("ix_demo_feedback_priority", table_name="demo_feedback")
    op.drop_index("ix_demo_feedback_status_created", table_name="demo_feedback")
    op.drop_table("demo_feedback")
