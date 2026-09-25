"""Normalize legacy Catalogue Studio font style values.

Revision ID: 0027_normalize_studio_font_styles
Revises: 0026_unlock_catalogue_brand_elements
"""

from __future__ import annotations

import copy
import math

from alembic import op
import sqlalchemy as sa


revision = "0027_normalize_studio_font_styles"
down_revision = "0026_unlock_catalogue_brand_elements"
branch_labels = None
depends_on = None


def _font_weight(value: object) -> str | None:
    if value is None or value == "":
        return None
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"bold", "bolder"}:
            return "bold"
        if normalized in {"normal", "lighter"}:
            return "normal"
        try:
            numeric = float(normalized)
        except ValueError:
            return "normal"
    elif isinstance(value, (int, float)) and not isinstance(value, bool):
        numeric = float(value)
    else:
        return "normal"
    return "bold" if math.isfinite(numeric) and numeric >= 600 else "normal"


def _font_style(value: object) -> str | None:
    if value is None or value == "":
        return None
    return "italic" if str(value).strip().lower() in {"italic", "oblique"} else "normal"


def _normalize(value: object) -> tuple[object, bool]:
    result = copy.deepcopy(value)
    changed = False

    def visit(nested: object) -> None:
        nonlocal changed
        if isinstance(nested, dict):
            if "fontWeight" in nested:
                normalized_weight = _font_weight(nested.get("fontWeight"))
                if nested.get("fontWeight") != normalized_weight:
                    nested["fontWeight"] = normalized_weight
                    changed = True
            if "fontStyle" in nested:
                normalized_style = _font_style(nested.get("fontStyle"))
                if nested.get("fontStyle") != normalized_style:
                    nested["fontStyle"] = normalized_style
                    changed = True
            for child in nested.values():
                visit(child)
        elif isinstance(nested, list):
            for child in nested:
                visit(child)

    visit(result)
    return result, changed


def _normalize_column(bind, table, column_name: str) -> None:
    column = table.c[column_name]
    for row in bind.execute(sa.select(table.c.id, column)).mappings():
        updated, changed = _normalize(row[column_name])
        if changed:
            bind.execute(table.update().where(table.c.id == row["id"]).values({column_name: updated}))


def upgrade():
    bind = op.get_bind()
    metadata = sa.MetaData()
    metadata.reflect(
        bind=bind,
        only=(
            "catalogue_design_pages",
            "catalogue_design_versions",
            "catalogue_templates",
            "product_card_templates",
            "product_card_template_versions",
        ),
    )

    targets = (
        ("catalogue_design_pages", "page_data_json"),
        ("catalogue_design_versions", "snapshot_json"),
        ("catalogue_templates", "template_data_json"),
        ("product_card_templates", "template_data_json"),
        ("product_card_template_versions", "card_properties_json"),
        ("product_card_template_versions", "elements_json"),
    )
    for table_name, column_name in targets:
        _normalize_column(bind, metadata.tables[table_name], column_name)


def downgrade():
    # The legacy numeric values violated the current API contract. Restoring
    # them would make the affected designs impossible to autosave again.
    pass
