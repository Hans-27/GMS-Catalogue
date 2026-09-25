import os
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "active-category-test-secret-key-2026")

from app.commerce import _safe_presentation
from app.catalogue_schemas import CategoryUpdate
from app.organization_schemas import BrandStatusUpdate


def test_inactive_master_categories_are_removed_from_catalogue_presentations() -> None:
    """Regression: published snapshots must not keep an inactive category public."""

    db = MagicMock()
    db.scalar.return_value = None
    db.scalars.return_value.all.return_value = [
        SimpleNamespace(id=1, is_active=True),
        SimpleNamespace(id=2, is_active=False),
    ]
    catalogue = SimpleNamespace(
        id=uuid.uuid4(),
        slug="category-status-test",
        status="draft",
        title="Category status test",
        audience="public",
        language="en",
        brand=None,
    )
    snapshot = {
        "title": catalogue.title,
        "description": "",
        "audience": catalogue.audience,
        "language": catalogue.language,
        "show_prices": False,
        "products": [
            {
                "name": "Active mouse",
                "sku": "MOUSE-1",
                "sort_order": 1,
                "categories": ["Mouse"],
            },
            {
                "name": "Inactive keyboard",
                "sku": "KEYBOARD-1",
                "sort_order": 2,
                "categories": ["Keyboard"],
            },
        ],
        "categories": [
            {
                "id": 1,
                "slug": "mouse",
                "name": "Mouse",
                "description": "",
                "display_order": 1,
                "product_count": 0,
            },
            {
                "id": 2,
                "slug": "keyboard",
                "name": "Keyboard",
                "description": "",
                "display_order": 2,
                "product_count": 0,
            },
        ],
        "generated_at": datetime.now(UTC),
    }

    presentation = _safe_presentation(
        db,
        catalogue,
        snapshot,
        None,
        None,
        include_inactive=True,
    )

    assert [category.name for category in presentation.categories] == ["Mouse"]
    assert [product.name for product in presentation.products] == ["Active mouse"]


def test_disabling_category_requires_a_reason() -> None:
    """Regression: a category must not become inactive without an audit reason."""

    with pytest.raises(ValidationError):
        CategoryUpdate(is_active=False, inactive_reason="")

    payload = CategoryUpdate(
        is_active=False,
        inactive_reason="Seasonal range paused",
    )
    assert payload.inactive_reason == "Seasonal range paused"


def test_disabling_brand_requires_a_reason() -> None:
    """Regression: an administrator must record why a brand is hidden."""

    with pytest.raises(ValidationError):
        BrandStatusUpdate(is_active=False, inactive_reason="   ")

    payload = BrandStatusUpdate(
        is_active=False,
        inactive_reason="Supplier distribution paused",
    )
    assert payload.inactive_reason == "Supplier distribution paused"


def test_inactive_brand_products_are_removed_from_existing_catalogues() -> None:
    """Regression: an old snapshot must not expose products from a disabled brand."""

    db = MagicMock()
    db.scalar.return_value = None
    db.scalars.return_value.all.return_value = [
        SimpleNamespace(id=11, name="Nubwo", is_active=False),
    ]
    catalogue = SimpleNamespace(
        id=uuid.uuid4(),
        slug="brand-status-test",
        status="published",
        title="Brand status test",
        audience="public",
        language="en",
        brand="Nubwo",
    )
    snapshot = {
        "title": catalogue.title,
        "description": "",
        "audience": catalogue.audience,
        "language": catalogue.language,
        "show_prices": False,
        "products": [
            {
                "name": "Nubwo mouse",
                "sku": "NUBWO-1",
                "brand": "Nubwo",
                "sort_order": 1,
                "categories": [],
            }
        ],
        "categories": [],
        "generated_at": datetime.now(UTC),
    }

    presentation = _safe_presentation(
        db,
        catalogue,
        snapshot,
        1,
        None,
        include_inactive=True,
    )

    assert presentation.products == []
