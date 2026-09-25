from types import SimpleNamespace

from app import design_studio
from app.design_studio import (
    _design_response_with_live_stock,
    _document_with_live_stock,
    _snapshot_with_current_live_stock,
)


def test_catalogue_erp_table_contains_each_product_and_current_stock():
    products = {
        "one": SimpleNamespace(sku="23-04218", barcode="8859798734367", stock_quantity=239),
        "two": SimpleNamespace(sku="23-04219", barcode="8859798734374", stock_quantity=248),
        "not-selected": SimpleNamespace(sku="23-09999", barcode="8859798999999", stock_quantity=999),
    }
    document = {
        "elements": [
            {"id": "carousel-1", "type": "image_carousel", "carousel": {"productIds": ["one", "two"]}},
            {"type": "table", "text": "CODE | BARCODE | STOCK", "style": {}},
        ],
    }

    hydrated = _document_with_live_stock(document, products)

    assert hydrated["elements"][1]["text"] == (
        "CODE | BARCODE | STOCK\n"
        "23-04218 | 8859798734367 | 239\n"
        "23-04219 | 8859798734374 | 248"
    )
    assert hydrated["elements"][1]["style"]["tableSource"] == "erp_carousel"
    assert hydrated["elements"][1]["style"]["tableCarouselId"] == "carousel-1"
    assert hydrated["elements"][1]["style"]["tableHeaderColor"] == "transparent"
    assert hydrated["elements"][1]["style"]["tableCellColor"] == "transparent"
    assert "23-09999" not in hydrated["elements"][1]["text"]


def test_independently_selected_product_table_refreshes_each_stock_row():
    products = {
        "one": SimpleNamespace(sku="A-1", stock_quantity=12),
        "two": SimpleNamespace(sku="B-2", stock_quantity=34),
    }
    document = {"elements": [{
        "type": "table",
        "text": "Product name | Code | Barcode | Stock\nOne | A-1 | 111 | 0\nTwo | B-2 | 222 | 0",
        "style": {"tableSource": "erp_products", "tableProductIds": "one,two"},
    }]}

    hydrated = _document_with_live_stock(document, products)

    assert hydrated["elements"][0]["text"].endswith("One | A-1 | 111 | 12\nTwo | B-2 | 222 | 34")


def test_snapshot_mode_design_response_still_rebinds_current_erp_stock(monkeypatch):
    # Production defect: snapshot mode used to bypass stock hydration and
    # expose the stock value captured when the catalogue was authored.
    response = SimpleNamespace(pages=[SimpleNamespace(page_data_json={
        "elements": [{
            "type": "product_card",
            "productId": "product-1",
            "style": {"useErpStock": True, "productStock": 2},
        }],
    })])
    design = SimpleNamespace(
        data_mode="snapshot",
        product_items=[SimpleNamespace(product_id="product-1", is_visible=True)],
    )
    current_product = SimpleNamespace(
        stock_quantity=41,
        stock_last_synced_at=None,
    )
    monkeypatch.setattr(
        design_studio,
        "DesignResponse",
        SimpleNamespace(model_validate=lambda _: response),
    )
    monkeypatch.setattr(
        design_studio,
        "_live_stock_products_for_documents",
        lambda *_args: {"product-1": current_product},
    )

    hydrated = _design_response_with_live_stock(SimpleNamespace(), design)

    assert hydrated.pages[0].page_data_json["elements"][0]["style"]["productStock"] == 41


def test_snapshot_mode_render_snapshot_still_rebinds_current_erp_stock(monkeypatch):
    # Production defect: a fixed-price snapshot also froze stock in previews
    # and PDFs even though inventory is operational live data.
    snapshot = {
        "design": {"dataMode": "snapshot"},
        "pages": [{
            "pageData": {
                "elements": [{
                    "type": "product_card",
                    "productId": "product-1",
                    "style": {"useErpStock": True, "productStock": 2},
                }],
            },
        }],
        "productData": {
            "product-1": {"stock_on_hand": "2", "stock_available": "2"},
        },
    }
    current_product = SimpleNamespace(
        stock_quantity=41,
        stock_last_synced_at=None,
        warehouse_stocks=[],
    )
    monkeypatch.setattr(
        design_studio,
        "_live_stock_products_for_documents",
        lambda *_args: {"product-1": current_product},
    )

    hydrated = _snapshot_with_current_live_stock(SimpleNamespace(), snapshot)

    assert hydrated["pages"][0]["pageData"]["elements"][0]["style"]["productStock"] == 41
    assert hydrated["productData"]["product-1"]["stock_on_hand"] == "41"
    assert snapshot["pages"][0]["pageData"]["elements"][0]["style"]["productStock"] == 2
