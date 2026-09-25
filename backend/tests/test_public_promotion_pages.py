from types import SimpleNamespace

from app.catalogue_share_links import (
    _current_public_studio_snapshot,
    _filter_public_promotion_pages,
    _filter_public_promotion_snapshot,
)
from app.design_studio_schemas import PageDocument


def test_linked_promotion_pages_only_appear_while_active_for_the_link() -> None:
    presentation = SimpleNamespace(
        promotions=[{"id": "active-promotion", "code": "ACTIVE"}],
        products=[
            SimpleNamespace(id="eligible-product", promotion_code="ACTIVE"),
            SimpleNamespace(id="regular-product", promotion_code=None),
        ],
    )
    design = SimpleNamespace(pages=[
        SimpleNamespace(page_type="cover", page_data_json={}),
        SimpleNamespace(page_type="promotion", page_data_json={"promotionId": "expired-promotion"}),
        SimpleNamespace(page_type="promotion", page_data_json={
            "promotionId": "active-promotion",
            "elements": [
                {"id": "eligible", "productId": "eligible-product", "visible": True},
                {"id": "regular", "productId": "regular-product", "visible": True},
            ],
        }),
        SimpleNamespace(page_type="product_grid", page_data_json={}),
    ])

    filtered = _filter_public_promotion_pages(design, presentation)

    assert [page.page_type for page in filtered.pages] == ["cover", "promotion", "product_grid"]
    assert filtered.pages[1].page_data_json["promotionId"] == "active-promotion"
    assert [element["visible"] for element in filtered.pages[1].page_data_json["elements"]] == [True, False]


def test_public_pdf_removes_inactive_promotion_without_leaving_a_blank_page() -> None:
    snapshot = {
        "pages": [
            {"pageType": "cover", "pageData": {}},
            {"pageType": "promotion", "pageData": {"promotionId": "inactive"}},
            {"pageType": "product_grid", "pageData": {}},
        ],
    }

    presentation = SimpleNamespace(promotions=[], products=[])
    filtered = _filter_public_promotion_snapshot(snapshot, presentation)

    assert [page["pageType"] for page in filtered["pages"]] == ["cover", "product_grid"]
    assert len(snapshot["pages"]) == 3


def test_public_pdf_uses_every_page_in_the_current_public_design(monkeypatch) -> None:
    current_snapshot = {
        "design": {"dataMode": "snapshot"},
        "pages": [
            {"id": "cover", "pageType": "cover", "pageData": {}},
            {"id": "products-1", "pageType": "product_grid", "pageData": {}},
            {"id": "products-2", "pageType": "product_grid", "pageData": {}},
        ],
    }
    saved_version_snapshot = {
        "design": {"dataMode": "snapshot"},
        "pages": current_snapshot["pages"][:2],
    }
    design = SimpleNamespace(saved_version_snapshot=saved_version_snapshot)
    presentation = SimpleNamespace(promotions=[], products=[], currency="THB")
    monkeypatch.setattr(
        "app.catalogue_share_links._snapshot",
        lambda selected_design, db: current_snapshot,
    )

    result = _current_public_studio_snapshot(object(), design, presentation)

    assert [page["id"] for page in result["pages"]] == [
        "cover",
        "products-1",
        "products-2",
    ]


def test_studio_page_document_accepts_a_linked_promotion_reference() -> None:
    document = PageDocument.model_validate({
        "pageId": "promotion-page",
        "pageType": "promotion",
        "name": "New Year Sale",
        "promotionId": "dfc8a14a-a90f-4fd3-b959-7c8dc9b7f3ca",
        "promotionStatus": "scheduled",
        "promotionStartAt": "2026-12-20T00:00:00Z",
        "promotionEndAt": "2027-01-15T00:00:00Z",
        "canvas": {"width": 794, "height": 1123},
        "elements": [],
        "dataMode": "live",
    })

    assert str(document.promotionId) == "dfc8a14a-a90f-4fd3-b959-7c8dc9b7f3ca"
    assert document.pageType == "promotion"
