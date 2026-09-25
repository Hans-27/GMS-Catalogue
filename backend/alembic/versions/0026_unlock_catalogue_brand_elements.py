"""Unlock catalogue wordmarks, footers and accents.

Revision ID: 0026_unlock_catalogue_brand_elements
Revises: 0025_image_carousel_permissions
"""

from __future__ import annotations

import copy

from alembic import op
import sqlalchemy as sa


revision = "0026_unlock_catalogue_brand_elements"
down_revision = "0025_image_carousel_permissions"
branch_labels = None
depends_on = None


UNLOCKED_NAME_PARTS = ("wordmark", "footer", "accent")


def _unlock_elements(document: dict | None) -> tuple[dict | None, bool]:
    if not isinstance(document, dict):
        return document, False
    result = copy.deepcopy(document)
    changed = False
    elements = result.get("elements")
    if not isinstance(elements, list):
        return result, False
    for element in elements:
        if not isinstance(element, dict):
            continue
        name = str(element.get("name") or "")
        if not any(part in name.lower() for part in UNLOCKED_NAME_PARTS):
            continue
        if element.get("locked") is not False:
            element["locked"] = False
            changed = True
        if name.lower().startswith("locked "):
            element["name"] = name[7:]
            changed = True
        style = element.get("style")
        if not isinstance(style, dict):
            continue
        governed = [
            key.strip()
            for key in str(style.get("governedStyleKeys") or "").split(",")
            if key.strip() and key.strip() != "color"
        ]
        governed_value = ",".join(governed)
        if style.get("governedStyleKeys") != governed_value:
            style["governedStyleKeys"] = governed_value
            changed = True
        if "governedColor" in style:
            style.pop("governedColor", None)
            changed = True
    return result, changed


def _unlock_template_data(data: dict | None) -> tuple[dict | None, bool]:
    if not isinstance(data, dict):
        return data, False
    result = copy.deepcopy(data)
    changed = False
    pages = result.get("pages")
    if not isinstance(pages, list):
        return result, False
    for page in pages:
        if not isinstance(page, dict):
            continue
        for key in ("pageData", "page_data_json"):
            updated, page_changed = _unlock_elements(page.get(key))
            if page_changed:
                page[key] = updated
                changed = True
    return result, changed


def upgrade():
    bind = op.get_bind()
    metadata = sa.MetaData()
    metadata.reflect(bind=bind, only=("catalogue_design_pages", "catalogue_templates"))
    pages = metadata.tables["catalogue_design_pages"]
    templates = metadata.tables["catalogue_templates"]

    for row in bind.execute(sa.select(pages.c.id, pages.c.page_data_json)).mappings():
        updated, changed = _unlock_elements(row["page_data_json"])
        if changed:
            bind.execute(pages.update().where(pages.c.id == row["id"]).values(page_data_json=updated))

    for row in bind.execute(sa.select(templates.c.id, templates.c.template_data_json)).mappings():
        updated, changed = _unlock_template_data(row["template_data_json"])
        if changed:
            bind.execute(templates.update().where(templates.c.id == row["id"]).values(template_data_json=updated))


def downgrade():
    # Existing users may have intentionally restyled these elements after this
    # migration. Re-locking them would discard that new editing freedom.
    pass
