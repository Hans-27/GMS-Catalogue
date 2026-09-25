import os
import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import httpx
import pytest


os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "purchase-order-catalogue-test-secret")

from app.commerce import _safe_presentation
from app import purchase_order_api


@pytest.fixture(autouse=True)
def reset_purchase_order_cache() -> None:
    purchase_order_api._cached_rows = None
    purchase_order_api._cache_expires_at = 0.0


def test_catalogue_products_show_aggregated_intransit_and_ordered_quantities() -> None:
    """Regression: the PO API must populate the card instead of leaving a dash."""

    db = MagicMock()
    db.scalar.return_value = None
    db.scalars.return_value.all.return_value = []
    catalogue = SimpleNamespace(
        id=uuid.uuid4(),
        slug="purchase-order-test",
        status="published",
        title="Purchase order test",
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
                "name": "Nubwo NK56 Purple",
                "sku": "27224",
                "brand": "Nubwo",
                "sort_order": 1,
                "categories": [],
                "erp_details": {"model": "NK56 Purple"},
            }
        ],
        "categories": [],
        "generated_at": datetime.now(UTC),
    }
    response = MagicMock()
    response.json.return_value = {
        "status": "success",
        "count": 4,
        "data": [
            {"item_code": "27224", "loading_qty": "2,000 PCS", "status": "In Transit"},
            {"item_code": "27224", "loading_qty": "300 PCS", "status": "In Transit"},
            {"item_code": "27224", "loading_qty": "500 PCS", "status": "Ordered"},
            {"item_code": "OTHER", "loading_qty": "9,999 PCS", "status": "In Transit"},
        ],
    }

    with patch("httpx.get", return_value=response):
        presentation = _safe_presentation(
            db,
            catalogue,
            snapshot,
            1,
            None,
            include_inactive=True,
        )

    details = presentation.products[0].erp_details
    assert details["in_transit"] == "2,300"
    assert details["ordered"] == "500"


def test_catalogue_still_opens_when_purchase_order_api_is_unavailable() -> None:
    db = MagicMock()
    db.scalar.return_value = None
    db.scalars.return_value.all.return_value = []
    catalogue = SimpleNamespace(
        id=uuid.uuid4(),
        slug="purchase-order-fallback-test",
        status="published",
        title="Purchase order fallback test",
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
                "name": "Nubwo NK56 Purple",
                "sku": "27224",
                "brand": "Nubwo",
                "sort_order": 1,
                "categories": [],
                "erp_details": {"model": "NK56 Purple"},
            }
        ],
        "categories": [],
        "generated_at": datetime.now(UTC),
    }

    with patch("httpx.get", side_effect=httpx.ConnectError("ERP unavailable")):
        presentation = _safe_presentation(
            db,
            catalogue,
            snapshot,
            1,
            None,
            include_inactive=True,
        )

    assert len(presentation.products) == 1
    assert "in_transit" not in presentation.products[0].erp_details
    assert "ordered" not in presentation.products[0].erp_details


def test_not_shipped_purchase_orders_count_as_ordered() -> None:
    response = MagicMock()
    response.json.return_value = {
        "status": "success",
        "data": [
            {"item_code": "27224", "loading_qty": "450 PCS", "status": "Not Shipped"},
        ],
    }

    with patch("httpx.get", return_value=response):
        quantities = purchase_order_api.purchase_order_quantities()

    assert quantities["27224"] == {"in_transit": "0", "ordered": "450"}
