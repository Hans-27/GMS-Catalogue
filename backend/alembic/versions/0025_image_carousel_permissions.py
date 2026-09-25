"""Granular Catalogue Studio Image Carousel permissions.

Revision ID: 0025_image_carousel_permissions
Revises: 0024_product_card_template_library
"""

from alembic import op
import sqlalchemy as sa


revision = "0025_image_carousel_permissions"
down_revision = "0024_product_card_template_library"
branch_labels = None
depends_on = None


PERMISSIONS = (
    ("catalogue_studio.image_carousel.view", "View Image Carousel elements."),
    ("catalogue_studio.image_carousel.add", "Add Image Carousel elements."),
    ("catalogue_studio.image_carousel.edit", "Edit Image Carousel elements."),
    ("catalogue_studio.image_carousel.delete", "Delete Image Carousel elements."),
    ("catalogue_studio.image_carousel.upload", "Upload images into Image Carousel elements."),
    ("catalogue_studio.image_carousel.select_product_images", "Select ERP product images for Image Carousel elements."),
    ("catalogue_studio.image_carousel.reorder", "Reorder images inside Image Carousel elements."),
    ("catalogue_studio.image_carousel.configure_transition", "Configure Image Carousel transitions and navigation."),
    ("catalogue_studio.image_carousel.configure_pdf", "Configure Image Carousel PDF and print fallbacks."),
)
EDITOR_ROLES = ("catalogue_editor", "product_editor", "catalogue_manager", "catalogue_admin")


def upgrade():
    bind = op.get_bind()
    permissions = sa.table(
        "permissions",
        sa.column("id", sa.Integer), sa.column("code", sa.String), sa.column("module", sa.String),
        sa.column("description", sa.String), sa.column("action", sa.String),
        sa.column("is_high_risk", sa.Boolean), sa.column("is_active", sa.Boolean),
    )
    roles = sa.table("roles", sa.column("id", sa.Integer), sa.column("name", sa.String))
    role_permissions = sa.table(
        "role_permissions", sa.column("role_id", sa.Integer), sa.column("permission_id", sa.Integer),
        sa.column("effect", sa.String), sa.column("access_scope", sa.String),
    )
    existing = set(bind.execute(sa.select(permissions.c.code).where(permissions.c.code.in_([code for code, _ in PERMISSIONS]))).scalars())
    for code, description in PERMISSIONS:
        if code not in existing:
            bind.execute(permissions.insert().values(
                code=code, module="catalogue_studio", description=description,
                action=code.split(".", 1)[1], is_high_risk=False, is_active=True,
            ))
    permission_ids = dict(bind.execute(sa.select(permissions.c.code, permissions.c.id).where(permissions.c.code.in_([code for code, _ in PERMISSIONS]))).all())
    role_ids = [row[0] for row in bind.execute(sa.select(roles.c.id).where(roles.c.name.in_(EDITOR_ROLES))).all()]
    existing_pairs = set(bind.execute(sa.select(role_permissions.c.role_id, role_permissions.c.permission_id).where(role_permissions.c.role_id.in_(role_ids), role_permissions.c.permission_id.in_(list(permission_ids.values())))).all()) if role_ids else set()
    for role_id in role_ids:
        for permission_id in permission_ids.values():
            if (role_id, permission_id) not in existing_pairs:
                bind.execute(role_permissions.insert().values(role_id=role_id, permission_id=permission_id, effect="allow", access_scope="all"))


def downgrade():
    bind = op.get_bind()
    permissions = sa.table("permissions", sa.column("id", sa.Integer), sa.column("code", sa.String))
    role_permissions = sa.table("role_permissions", sa.column("permission_id", sa.Integer))
    ids = [row[0] for row in bind.execute(sa.select(permissions.c.id).where(permissions.c.code.in_([code for code, _ in PERMISSIONS]))).all()]
    if ids:
        bind.execute(role_permissions.delete().where(role_permissions.c.permission_id.in_(ids)))
        bind.execute(permissions.delete().where(permissions.c.id.in_(ids)))
