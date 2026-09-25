import uuid

import pytest
from pydantic import ValidationError

from app.product_card_models import GlobalProductCard, GlobalProductCardVersion
from app.product_card_schemas import ProductCardDraftPayload


def test_global_product_card_models_enforce_one_card_and_unique_versions() -> None:
    card_constraints = {constraint.name for constraint in GlobalProductCard.__table__.constraints}
    version_constraints = {constraint.name for constraint in GlobalProductCardVersion.__table__.constraints}

    assert "uq_global_product_card_product" in card_constraints
    assert "uq_global_product_card_version" in version_constraints
    assert GlobalProductCard.__tablename__ == "global_product_cards"
    assert GlobalProductCardVersion.__tablename__ == "global_product_card_versions"


def test_product_card_draft_accepts_presentation_fields_and_synchronized_images() -> None:
    payload = ProductCardDraftPayload(
        template_id=uuid.uuid4(),
        revision=0,
        presentation={
            "display_name": "Sales name",
            "description": "Approved description",
            "image_urls": ["/uploads/product-front.webp"],
            "appearance": {"accent_color": "#16A05A"},
            "visible_fields": {"stock": True},
        },
    )

    assert payload.presentation["display_name"] == "Sales name"


@pytest.mark.parametrize("field", ["stock_quantity", "barcode", "sku", "price", "product_code"])
def test_product_card_draft_rejects_erp_owned_fields(field: str) -> None:
    with pytest.raises(ValidationError, match="ERP-owned or unsupported"):
        ProductCardDraftPayload(revision=0, presentation={field: "changed"})


def test_product_card_draft_rejects_external_or_unmanaged_images() -> None:
    with pytest.raises(ValidationError, match="synchronized /uploads/"):
        ProductCardDraftPayload(
            revision=0,
            presentation={"image_urls": ["https://example.com/unmanaged.jpg"]},
        )
