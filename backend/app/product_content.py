from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.models import CatalogueEntry, Product


def _text(value: Any) -> str:
    return str(value or "").strip()


def _number(value: Any) -> str:
    if value is None:
        return ""
    number = Decimal(str(value))
    return format(number.normalize(), "f")


def erp_description(product: Product, language: str = "en") -> str:
    if language == "th":
        return _text(product.erp_description_th) or _text(product.erp_description_en)
    return _text(product.erp_description_en) or _text(product.erp_description_th)


def erp_details(product: Product) -> dict[str, str]:
    """Return only useful, non-empty ERP facts in a stable display order."""
    details: dict[str, str] = {}
    if _text(product.erp_pos_name) and _text(product.erp_pos_name).casefold() not in {
        _text(product.erp_name).casefold(),
        _text(product.erp_name_th).casefold(),
    }:
        details["model"] = _text(product.erp_pos_name)
    dimensions = [
        _number(product.size_width),
        _number(product.size_length),
        _number(product.size_height),
    ]
    if any(dimensions):
        details["dimensions"] = " × ".join(value or "–" for value in dimensions)
    if product.gross_weight not in (None, 0):
        details["gross_weight"] = _number(product.gross_weight)
    if product.net_weight not in (None, 0):
        details["net_weight"] = _number(product.net_weight)
    if product.pack_size not in (None, 0):
        details["pack_size"] = str(product.pack_size)
    if _text(product.warranty_description).casefold() not in {"", "none"}:
        details["warranty"] = _text(product.warranty_description)
    if _text(product.erp_remark):
        details["remark"] = _text(product.erp_remark)
    if _text(product.erp_how_to_use):
        details["how_to_use"] = _text(product.erp_how_to_use)
    return details


def erp_summary(product: Product, language: str = "en", max_length: int = 320) -> str:
    description = erp_description(product, language)
    if not description:
        labels = {
            "model": "Model",
            "dimensions": "Size (W × L × H)",
            "gross_weight": "Gross weight",
            "net_weight": "Net weight",
            "pack_size": "Pack size",
            "warranty": "Warranty",
            "remark": "Remark",
            "how_to_use": "How to use",
        }
        description = " · ".join(
            f"{labels[key]}: {value}" for key, value in erp_details(product).items()
        )
    if len(description) <= max_length:
        return description
    return description[: max_length - 1].rstrip() + "…"


def catalogue_short_description(
    product: Product,
    entry: CatalogueEntry,
    override: str | None = None,
) -> str:
    return _text(override) or _text(entry.short_description) or erp_summary(product)


def catalogue_long_description(product: Product, entry: CatalogueEntry) -> str:
    return _text(entry.long_description) or erp_description(product)
