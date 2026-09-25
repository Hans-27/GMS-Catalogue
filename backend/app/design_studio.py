import hashlib
import io
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import fitz
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.access import allowed_price_list_ids, has_permission, is_superadmin, require_any_permission, require_permission
from app.commerce_models import (
    Catalogue,
    CatalogueAudienceType,
    CatalogueProduct,
    CatalogueShareLink,
    CatalogueVersion,
    PriceList,
    ProductPrice,
    UserBrandCataloguePriceMapping,
    UserCataloguePriceMapping,
)
from app.config import settings
from app.database import get_db
from app.design_studio_models import (
    CatalogueDesign,
    CatalogueDesignBrand,
    CatalogueDesignPage,
    CatalogueDesignPriceSlot,
    CatalogueDesignProduct,
    CatalogueDesignVersion,
    CatalogueExportJob,
    CatalogueTemplate,
    DesignAsset,
    DesignColorPalette,
    ProductCardTemplate,
)
from app.design_studio_schemas import (
    AssetResponse,
    DesignCreate,
    DesignConfigurationUpdate,
    DesignProductsUpdate,
    DesignProductVisibilityUpdate,
    DesignResponse,
    DesignSummaryResponse,
    DesignUpdate,
    ElementMutation,
    ElementsBulkMutation,
    ExportJobCreate,
    ExportJobResponse,
    PageCreate,
    PageDocument,
    PageOrderUpdate,
    PageResponse,
    PageUpdate,
    PalettePayload,
    PaletteResponse,
    ProductCardTemplatePayload,
    ProductCardTemplateResponse,
    PromotionActionPayload,
    TemplatePayload,
    TemplateResponse,
    StudioValidateResponse,
    VersionCreate,
    VersionResponse,
)
from app.design_studio_service import (
    authorized_product_prices,
    selectable_products,
    validate_brand_access,
    validate_design_for_publish,
    validate_price_access,
    validate_selectable_product_ids,
)
from app.erp_models import ErpCustomerPriceLevel
from app.models import AuditLog, Brand, Product, ProductImage, User
from app.storage import cover_storage
from app.system_catalogue_templates import ensure_system_catalogue_templates


router = APIRouter(prefix="/catalogue-studio", tags=["Catalogue Design Studio"])
studio_compat_router = APIRouter(tags=["Catalogue Studio"])
STUDIO_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
CATALOGUE_TEMPLATE_EXTENSION = ".gmstemplate"
CATALOGUE_TEMPLATE_MEDIA_TYPE = "application/vnd.gms.catalogue-template+json"
VISUAL_TEMPLATE_TYPES = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "image/webp": {".webp"},
}
MAX_TEMPLATE_UPLOAD_BYTES = 20 * 1024 * 1024
A4_PORTRAIT = (794, 1123)
A4_LANDSCAPE = (1123, 794)


def _a4_geometry(orientation: str | None) -> tuple[int, int, str, str]:
    """Return the only supported Studio page size while preserving orientation."""
    if orientation == "landscape":
        return *A4_LANDSCAPE, "landscape", "a4_landscape"
    return *A4_PORTRAIT, "portrait", "a4_portrait"


def _a4_document(document: dict, width: int, height: int) -> dict:
    normalized = dict(document)
    normalized["canvas"] = {**dict(normalized.get("canvas") or {}), "width": width, "height": height}
    return normalized


def _audit(db: Session, request: Request, actor: User, action: str, identifier: str, details: dict | None = None):
    audit_details = dict(details or {})
    request_id = request.headers.get("x-request-id") or request.headers.get("x-correlation-id")
    if request_id:
        audit_details["request_id"] = request_id[:200]
    db.add(AuditLog(
        user_id=actor.id,
        action=action,
        module="catalogue_studio",
        status="success",
        identifier=identifier,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details=audit_details,
    ))


def _require_card_permission(actor: User, permission: str) -> None:
    if not is_superadmin(actor) and not has_permission(actor, permission):
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")


def _require_carousel_permission(actor: User, permission: str) -> None:
    if not is_superadmin(actor) and not has_permission(actor, permission):
        raise HTTPException(status_code=403, detail=f"Missing permission: {permission}")


def _audit_image_carousel_changes(
    db: Session,
    request: Request,
    actor: User,
    design: CatalogueDesign,
    previous_document: dict,
    next_document: dict,
) -> None:
    """Enforce Image Carousel RBAC and write semantic audit events per autosave."""
    previous = {str(row.get("id")): row for row in previous_document.get("elements", []) if row.get("type") == "image_carousel" and row.get("id")}
    current = {str(row.get("id")): row for row in next_document.get("elements", []) if row.get("type") == "image_carousel" and row.get("id")}
    design_id = str(design.id)

    def carousel(row: dict) -> dict:
        return row.get("carousel") or {}

    def images(row: dict) -> list[dict]:
        return list(carousel(row).get("images") or [])

    def image_ids(row: dict, source: str | None = None) -> list[str]:
        return [str(item.get("id")) for item in images(row) if item.get("id") and (source is None or item.get("sourceType") == source)]

    for element_id in current.keys() - previous.keys():
        _require_carousel_permission(actor, "catalogue_studio.image_carousel.add")
        row = current[element_id]
        if row.get("productId") or carousel(row).get("productId") or any(item.get("sourceType") == "product_image" for item in images(row)):
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.select_product_images")
        custom_count = sum(item.get("sourceType") != "product_image" for item in images(row))
        if custom_count:
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.upload")
            _audit(db, request, actor, "image_carousel_images_uploaded", design_id, {"element_id": element_id, "count": custom_count})
        _audit(db, request, actor, "image_carousel_added", design_id, {"element_id": element_id, "image_count": len(images(row))})
    for element_id in previous.keys() - current.keys():
        _require_carousel_permission(actor, "catalogue_studio.image_carousel.delete")
        _audit(db, request, actor, "image_carousel_deleted", design_id, {"element_id": element_id})

    geometry_keys = {"name", "xPercent", "yPercent", "widthPercent", "heightPercent", "rotation", "opacity", "zIndex", "locked", "visible", "style", "responsive"}
    for element_id in current.keys() & previous.keys():
        before, after = previous[element_id], current[element_id]
        before_config, after_config = carousel(before), carousel(after)
        changed = before != after
        if not changed:
            continue
        if any(before.get(key) != after.get(key) for key in geometry_keys):
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.edit")
            _audit(db, request, actor, "image_carousel_edited", design_id, {"element_id": element_id})
        if before.get("productId") != after.get("productId") or before_config.get("productId") != after_config.get("productId") or before_config.get("selectedImageIds") != after_config.get("selectedImageIds"):
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.select_product_images")
            _audit(db, request, actor, "image_carousel_product_images_changed", design_id, {"element_id": element_id, "product_id": after.get("productId") or after_config.get("productId")})
        before_custom = set(image_ids(before)) - set(image_ids(before, "product_image"))
        after_custom = set(image_ids(after)) - set(image_ids(after, "product_image"))
        if after_custom - before_custom:
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.upload")
            _audit(db, request, actor, "image_carousel_images_uploaded", design_id, {"element_id": element_id, "count": len(after_custom - before_custom)})
        before_order = image_ids(before)
        after_order = image_ids(after)
        if set(before_order) == set(after_order) and before_order != after_order:
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.reorder")
            _audit(db, request, actor, "image_carousel_reordered", design_id, {"element_id": element_id, "image_ids": after_order})
        if before_config.get("transition") != after_config.get("transition") or before_config.get("navigation") != after_config.get("navigation"):
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.configure_transition")
            _audit(db, request, actor, "image_carousel_transition_changed", design_id, {"element_id": element_id})
        if before_config.get("pdf") != after_config.get("pdf"):
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.configure_pdf")
            _audit(db, request, actor, "image_carousel_pdf_fallback_changed", design_id, {"element_id": element_id})
        # Any remaining content/display/active-state mutation still needs edit.
        compared_before = {key: value for key, value in before_config.items() if key not in {"transition", "navigation", "pdf", "selectedImageIds", "productId"}}
        compared_after = {key: value for key, value in after_config.items() if key not in {"transition", "navigation", "pdf", "selectedImageIds", "productId"}}
        if compared_before != compared_after:
            _require_carousel_permission(actor, "catalogue_studio.image_carousel.edit")
            _audit(db, request, actor, "image_carousel_content_changed", design_id, {"element_id": element_id, "image_count": len(images(after))})


def _audit_product_card_changes(
    db: Session,
    request: Request,
    actor: User,
    design: CatalogueDesign,
    previous_document: dict,
    next_document: dict,
) -> None:
    """Enforce granular card permissions and log semantic canvas changes.

    Card instances live in the versioned page document by design. Comparing the
    old and new documents here keeps autosave atomic while still enforcing the
    product-card RBAC boundary on the backend.
    """
    previous = {
        str(row.get("id")): row
        for row in previous_document.get("elements", [])
        if row.get("type") == "product_card" and row.get("id")
    }
    current = {
        str(row.get("id")): row
        for row in next_document.get("elements", [])
        if row.get("type") == "product_card" and row.get("id")
    }
    design_id = str(design.id)
    added_ids = current.keys() - previous.keys()
    if len(added_ids) > 1:
        _require_card_permission(actor, "catalogue_studio.product_cards.bulk_add")
        _audit(db, request, actor, "product_cards_bulk_added", design_id, {"card_count": len(added_ids)})
    geometry_keys = ("xPercent", "yPercent", "rotation", "zIndex", "widthPercent", "heightPercent")
    geometry_change_count = sum(
        any(previous[card_id].get(key) != current[card_id].get(key) for key in geometry_keys)
        for card_id in current.keys() & previous.keys()
    )
    if geometry_change_count > 1:
        _require_card_permission(actor, "catalogue_studio.product_cards.auto_layout")
        _audit(db, request, actor, "product_cards_auto_layout_applied", design_id, {"card_count": geometry_change_count})
    for card_id in added_ids:
        _require_card_permission(actor, "catalogue_studio.product_cards.add")
        style = current[card_id].get("style") or {}
        if style.get("showProductStock") is True:
            _require_card_permission(actor, "catalogue_studio.product_cards.view_stock")
        if style.get("showProductBarcode") is True:
            _require_card_permission(actor, "catalogue_studio.product_cards.view_barcode")
        if style.get("showProductPrice") is True or style.get("showSecondaryPrice") is True:
            _require_card_permission(actor, "catalogue_studio.product_cards.edit_prices")
        _audit(db, request, actor, "product_card_added", design_id, {"card_id": card_id})
    for card_id in previous.keys() - current.keys():
        _require_card_permission(actor, "catalogue_studio.product_cards.delete")
        _audit(db, request, actor, "product_card_deleted", design_id, {"card_id": card_id})

    geometry = ("xPercent", "yPercent", "rotation", "zIndex")
    dimensions = ("widthPercent", "heightPercent")
    price_fields = {"priceMode", "showProductPrice", "showSecondaryPrice", "productPrice", "productSecondaryPrice", "primaryPriceListId", "secondaryPriceListId"}
    stock_fields = {"showProductStock", "stockMode", "hideNumericStock", "showStockSyncTime"}
    barcode_fields = {"showProductBarcode", "showBarcodeText", "barcodeWidth", "barcodeHeight", "qrMode", "qrSize"}
    product_fields = {
        "showProductImage", "showProductName", "showProductBrand", "showProductSku",
        "showProductCategory", "showProductDescription", "showProductVideo",
        "productFieldOrder", "productFieldSettings",
    }
    for card_id in current.keys() & previous.keys():
        before = previous[card_id]
        after = current[card_id]
        before_style = before.get("style") or {}
        after_style = after.get("style") or {}
        if any(before.get(key) != after.get(key) for key in geometry):
            _require_card_permission(actor, "catalogue_studio.product_cards.edit")
            _audit(db, request, actor, "product_card_moved", design_id, {"card_id": card_id})
        if any(before.get(key) != after.get(key) for key in dimensions):
            _require_card_permission(actor, "catalogue_studio.product_cards.resize")
            _audit(db, request, actor, "product_card_resized", design_id, {"card_id": card_id})
        if before.get("productId") != after.get("productId") or before.get("templateId") != after.get("templateId"):
            _require_card_permission(actor, "catalogue_studio.product_cards.edit")
            _audit(db, request, actor, "product_card_product_changed", design_id, {"card_id": card_id})
        if any(before_style.get(key) != after_style.get(key) for key in price_fields):
            _require_card_permission(actor, "catalogue_studio.product_cards.edit_prices")
            _audit(db, request, actor, "product_card_price_configuration_changed", design_id, {"card_id": card_id})
        if any(before_style.get(key) != after_style.get(key) for key in product_fields):
            _require_card_permission(actor, "catalogue_studio.product_cards.edit_fields")
            _audit(db, request, actor, "product_card_field_visibility_changed", design_id, {"card_id": card_id})
        if any(before_style.get(key) != after_style.get(key) for key in stock_fields):
            _require_card_permission(actor, "catalogue_studio.product_cards.edit_fields")
            _require_card_permission(actor, "catalogue_studio.product_cards.view_stock")
            _audit(db, request, actor, "product_card_stock_display_changed", design_id, {"card_id": card_id})
        if any(before_style.get(key) != after_style.get(key) for key in barcode_fields):
            _require_card_permission(actor, "catalogue_studio.product_cards.edit_fields")
            _require_card_permission(actor, "catalogue_studio.product_cards.view_barcode")
            _audit(db, request, actor, "product_card_barcode_display_changed", design_id, {"card_id": card_id})


def _design(db: Session, design_id: uuid.UUID) -> CatalogueDesign:
    item = db.scalar(
        select(CatalogueDesign)
        .options(
            selectinload(CatalogueDesign.pages),
            selectinload(CatalogueDesign.selected_brands),
            selectinload(CatalogueDesign.price_slots),
            selectinload(CatalogueDesign.product_items),
        )
        .where(CatalogueDesign.id == design_id, CatalogueDesign.deleted_at.is_(None))
    )
    # Older dashboard links used the linked Catalogue id in Studio URLs. Keep
    # those links working while the frontend migrates to the canonical design id.
    if not item:
        item = db.scalar(
            select(CatalogueDesign)
            .options(
                selectinload(CatalogueDesign.pages),
                selectinload(CatalogueDesign.selected_brands),
                selectinload(CatalogueDesign.price_slots),
                selectinload(CatalogueDesign.product_items),
            )
            .where(
                CatalogueDesign.catalogue_id == design_id,
                CatalogueDesign.deleted_at.is_(None),
            )
        )
    if not item:
        raise HTTPException(status_code=404, detail="Catalogue design not found.")
    return item


def _page(db: Session, design_id: uuid.UUID, page_id: uuid.UUID) -> CatalogueDesignPage:
    item = db.scalar(select(CatalogueDesignPage).where(
        CatalogueDesignPage.id == page_id,
        CatalogueDesignPage.design_id == design_id,
    ))
    if not item:
        raise HTTPException(status_code=404, detail="Catalogue design page not found.")
    return item


def _check_revision(design: CatalogueDesign, expected: int):
    if design.revision != expected:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This design was changed by another user.",
                "current_revision": design.revision,
                "options": ["reload", "create_copy"],
            },
        )


def _table_text_with_live_stock(value: object, stock_quantity: int) -> str:
    """Replace only the stock cells in a Studio ERP table.

    Table layouts remain user-editable, so this deliberately preserves every
    other cell and supports both the field/value and multi-barcode inventory
    layouts generated by the editor.
    """
    lines = str(value or "").splitlines()
    if not lines:
        return str(value or "")
    rows = [[cell.strip() for cell in line.split("|")] for line in lines]
    stock_label = str(stock_quantity)
    header = [cell.casefold() for cell in rows[0]]
    stock_column = next((index for index, cell in enumerate(header) if cell == "stock"), None)
    if stock_column is not None:
        for row in rows[1:]:
            if stock_column < len(row):
                row[stock_column] = stock_label
    for row in rows:
        if len(row) > 1 and row[0].casefold() in {"stock", "stock quantity", "stock on hand"}:
            row[1] = stock_label
    return "\n".join(" | ".join(row) for row in rows)


def _inventory_table_with_live_stock(value: object, stock_quantity: int) -> str:
    """Normalize an inventory binding to Code/Barcode/Stock and refresh stock."""
    rows = [[cell.strip() for cell in line.split("|")] for line in str(value or "").splitlines()]
    if not rows:
        return str(value or "")
    header = [cell.casefold() for cell in rows[0]]
    code_column = next((index for index, cell in enumerate(header) if cell in {"code", "product code"}), 0)
    barcode_column = next((index for index, cell in enumerate(header) if cell == "barcode"), 1)
    stock_column = next((index for index, cell in enumerate(header) if cell == "stock"), 2)
    stock_label = str(stock_quantity)
    normalized = [["CODE", "BARCODE", "STOCK"]]
    for row in rows[1:]:
        normalized.append([
            row[code_column] if code_column < len(row) else "",
            row[barcode_column] if barcode_column < len(row) else "",
            stock_label,
        ])
    return "\n".join(" | ".join(row) for row in normalized)


def _table_text_with_selected_product_stock(value: object, products: dict[str, Product]) -> str:
    rows = [[cell.strip() for cell in line.split("|")] for line in str(value or "").splitlines()]
    if not rows:
        return str(value or "")
    header = [cell.casefold() for cell in rows[0]]
    code_column = next((index for index, cell in enumerate(header) if cell in {"code", "product code"}), None)
    stock_column = next((index for index, cell in enumerate(header) if cell == "stock"), None)
    if code_column is None or stock_column is None:
        return str(value or "")
    stock_by_code = {str(product.sku or ""): str(product.stock_quantity or 0) for product in products.values()}
    for row in rows[1:]:
        if code_column < len(row) and stock_column < len(row) and row[code_column] in stock_by_code:
            row[stock_column] = stock_by_code[row[code_column]]
    return "\n".join(" | ".join(row) for row in rows)


def _catalogue_stock_table(products: dict[str, Product]) -> str:
    """Build the catalogue-wide Code/Barcode/Stock table from the ERP mirror."""
    rows = [["CODE", "BARCODE", "STOCK"]]
    for product in products.values():
        # stock_quantity is the synchronized local ERP mirror. Reading the
        # warehouse detail relationship here can contend with the sync worker.
        stock = float(product.stock_quantity or 0)
        stock_label = str(int(stock)) if stock.is_integer() else f"{stock:g}"
        rows.append([str(product.sku or ""), str(product.barcode or ""), stock_label])
    return "\n".join(" | ".join(row) for row in rows[:30])


def _carousel_product_ids(element: dict) -> list[str]:
    config = element.get("carousel") or {}
    ordered: list[str] = []
    for image in sorted((item for item in config.get("images", []) if item.get("isActive", True)), key=lambda item: item.get("displayOrder", 0)):
        product_id = str(image.get("productId") or "")
        if product_id and product_id not in ordered:
            ordered.append(product_id)
    for raw_id in config.get("productIds") or ([config.get("productId")] if config.get("productId") else []):
        product_id = str(raw_id or "")
        if product_id and product_id not in ordered:
            ordered.append(product_id)
    return ordered


def _document_with_live_stock(document: dict, products: dict[str, Product]) -> dict:
    """Return a page copy whose ERP-bound stock reflects the local ERP mirror."""
    hydrated = json.loads(json.dumps(document or {}))
    elements = hydrated.get("elements", [])
    carousels = {str(item.get("id")): item for item in elements if item.get("type") == "image_carousel"}

    def linked_product_carousel(element: dict, style: dict) -> dict | None:
        """Resolve only the carousel that belongs to this table's product card.

        Falling back to the first carousel on a page corrupts otherwise valid
        tables after cards are moved, duplicated, or edited independently.
        """
        configured_id = str(style.get("tableCarouselId") or "")
        if configured_id and configured_id in carousels:
            return carousels[configured_id]
        group_id = str(element.get("groupId") or "")
        quick_block_id = str(style.get("quickProductBlockId") or "")
        for carousel in carousels.values():
            carousel_style = carousel.get("style") or {}
            if group_id and str(carousel.get("groupId") or "") == group_id:
                return carousel
            if quick_block_id and str(carousel_style.get("quickProductBlockId") or "") == quick_block_id:
                return carousel
        # Older Studio documents did not persist an explicit table/carousel
        # relationship. A single carousel is unambiguous and safe to use;
        # avoid guessing when a page contains multiple carousels.
        if not configured_id and not group_id and not quick_block_id and len(carousels) == 1:
            return next(iter(carousels.values()))
        return None

    for element in elements:
        product_id = str(element.get("productId") or (element.get("carousel") or {}).get("productId") or "")
        product = products.get(product_id)
        style = dict(element.get("style") or {})
        if element.get("type") == "table" and str(style.get("tableSource") or "").startswith("erp"):
            style.update({
                "tableHeaderColor": "transparent",
                "tableHeaderTextColor": "#000000",
                "tableCellColor": "transparent",
                "tableAlternateColor": "transparent",
                "tableStriped": False,
                "tableStockColor": "#16884C",
            })
        if element.get("type") == "table" and style.get("tableSource") == "erp_products":
            selected_ids = [item.strip() for item in str(style.get("tableProductIds") or "").split(",") if item.strip()]
            selected_products = {identifier: products[identifier] for identifier in selected_ids if identifier in products}
            element["text"] = _table_text_with_selected_product_stock(element.get("text"), selected_products)
            style.setdefault("tableStockColor", "#16884C")
            element["style"] = style
            continue
        linked_carousel = linked_product_carousel(element, style)
        if element.get("type") == "table" and linked_carousel is not None:
            selected_ids = _carousel_product_ids(linked_carousel)
            selected_products = {identifier: products[identifier] for identifier in selected_ids if identifier in products}
            element["text"] = _catalogue_stock_table(selected_products)
            style["tableSource"] = "erp_carousel"
            style["tableCarouselId"] = str(linked_carousel.get("id") or "")
            style.update({"tableHeaderColor": "transparent", "tableHeaderTextColor": "#000000", "tableCellColor": "transparent", "tableAlternateColor": "transparent", "tableStriped": False, "tableStockColor": "#16884C"})
            element["style"] = style
            continue
        catalogue_stock_table = style.get("tableSource") == "erp_catalogue"
        if element.get("type") == "table" and catalogue_stock_table:
            element["text"] = _catalogue_stock_table(products)
            style["tableSource"] = "erp_catalogue"
            style.setdefault("tableStockColor", "#16884C")
            element["style"] = style
            continue
        if not product:
            continue
        stock = product.stock_quantity
        if element.get("type") == "product_card" and style.get("useErpStock") is not False:
            style["useErpStock"] = True
            style["productStock"] = stock
        if element.get("type") == "table" and style.get("tableSource") == "erp":
            element["text"] = (
                _inventory_table_with_live_stock(element.get("text"), stock)
                if style.get("tablePreset") == "inventory"
                else _table_text_with_live_stock(element.get("text"), stock)
            )
        if str(element.get("binding") or "") in {
            "{{product.stock}}", "{{product.stock_quantity}}", "{{product.stock_on_hand}}",
        }:
            element["text"] = str(stock)
        style["stockLastSynchronizedAt"] = product.stock_last_synced_at.isoformat() if product.stock_last_synced_at else ""
        element["style"] = style
    return hydrated


def _live_stock_products_for_documents(
    db: Session,
    documents: list[dict],
    additional_product_ids: list[str] | None = None,
) -> dict[str, Product]:
    identifiers: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    def add_identifier(raw_id: object) -> None:
        try:
            identifier = uuid.UUID(str(raw_id))
        except ValueError:
            return
        if identifier not in seen:
            seen.add(identifier)
            identifiers.append(identifier)

    # Catalogue order is the visible order chosen in Studio. Element-bound
    # products are appended only when they are not already in that list.
    for raw_id in additional_product_ids or []:
        add_identifier(raw_id)
    for document in documents:
        for element in (document or {}).get("elements", []):
            style = element.get("style") or {}
            if element.get("type") == "table" and style.get("tableSource") == "erp_products":
                for raw_id in str(style.get("tableProductIds") or "").split(","):
                    if raw_id.strip():
                        add_identifier(raw_id.strip())
            raw_id = element.get("productId") or (element.get("carousel") or {}).get("productId")
            if not raw_id:
                continue
            add_identifier(raw_id)
    if not identifiers:
        return {}
    products = {product.id: product for product in db.scalars(select(Product).where(Product.id.in_(identifiers)))}
    return {str(identifier): products[identifier] for identifier in identifiers if identifier in products}


def _design_response_with_live_stock(db: Session, design: CatalogueDesign) -> DesignResponse:
    """Rebind ERP stock for every catalogue without changing saved content."""
    response = DesignResponse.model_validate(design)
    catalogue_product_ids = [str(item.product_id) for item in design.product_items if item.is_visible]
    products = _live_stock_products_for_documents(
        db,
        [page.page_data_json for page in response.pages],
        catalogue_product_ids,
    )
    for page in response.pages:
        page.page_data_json = _document_with_live_stock(page.page_data_json, products)
    return response


def _snapshot_with_current_live_stock(db: Session, snapshot: dict) -> dict:
    """Rebind current ERP stock in version/export data without mutating it.

    ``dataMode`` controls whether authored prices and product copy are fixed;
    inventory remains operational live data for every catalogue and account.
    """
    hydrated = json.loads(json.dumps(snapshot or {}))
    documents = [page.get("pageData") or page.get("page_data_json") or {} for page in hydrated.get("pages", [])]
    products = _live_stock_products_for_documents(
        db,
        documents,
        list((hydrated.get("productData") or {}).keys()),
    )
    for page in hydrated.get("pages", []):
        key = "pageData" if "pageData" in page else "page_data_json"
        page[key] = _document_with_live_stock(page.get(key) or {}, products)
    for product_id, product_data in (hydrated.get("productData") or {}).items():
        product = products.get(str(product_id))
        if not product:
            continue
        warehouses = list(product.warehouse_stocks)
        product_data["stock_on_hand"] = str(sum(float(row.on_hand) for row in warehouses) if warehouses else product.stock_quantity)
        product_data["stock_available"] = str(sum(float(row.available) for row in warehouses) if warehouses else product.stock_quantity)
        product_data["stock_reserved"] = str(sum(float(row.reserved) for row in warehouses))
        product_data["stock_incoming"] = str(sum(float(row.incoming) for row in warehouses))
        product_data["stock_last_synchronized_at"] = product.stock_last_synced_at.isoformat() if product.stock_last_synced_at else ""
    return hydrated


def _studio_product_rows(
    db: Session,
    design: CatalogueDesign,
    actor: User,
    query: str = "",
) -> list[dict]:
    """Return only catalogue-scoped, active products and authorized data."""
    rows = selectable_products(db, design, actor, query=query)
    can_view_stock = is_superadmin(actor) or has_permission(actor, "catalogue_studio.product_cards.view_stock")
    can_view_barcode = is_superadmin(actor) or has_permission(actor, "catalogue_studio.product_cards.view_barcode")
    slots = [
        item for item in sorted(design.price_slots, key=lambda value: value.slot_number)
        if item.is_visible and item.price_list_id is not None
    ]
    slot = slots[0] if slots else None
    audiences = list(db.scalars(
        select(CatalogueAudienceType)
        .where(CatalogueAudienceType.is_active.is_(True))
        .order_by(CatalogueAudienceType.display_order, CatalogueAudienceType.id)
    )) if slots else []
    generic_mappings = {
        item.audience_type_id: item
        for item in db.scalars(
            select(UserCataloguePriceMapping).where(
                UserCataloguePriceMapping.user_id == actor.id,
                UserCataloguePriceMapping.audience_type_id.in_([audience.id for audience in audiences]),
            )
        )
    } if audiences else {}
    slot_audiences = {
        price_slot.slot_number: next(
            (
                audience for audience in audiences
                if price_slot.price_list_id in {
                    audience.price_list_id,
                    generic_mappings.get(audience.id).price_list_id
                    if generic_mappings.get(audience.id)
                    else None,
                }
            ),
            None,
        )
        for price_slot in slots
    }
    relevant_audience_ids = {
        audience.id for audience in slot_audiences.values() if audience is not None
    }
    brand_keys = {
        row.brand.strip().casefold()
        for row in rows
        if row.brand and row.brand.strip()
    }
    brand_mappings = {
        (item.brand_key, item.audience_type_id): item
        for item in db.scalars(
            select(UserBrandCataloguePriceMapping).where(
                UserBrandCataloguePriceMapping.user_id == actor.id,
                UserBrandCataloguePriceMapping.brand_key.in_(brand_keys),
                UserBrandCataloguePriceMapping.audience_type_id.in_(relevant_audience_ids),
            )
        )
    } if brand_keys and relevant_audience_ids else {}
    resolved_slot_ids: dict[tuple[uuid.UUID, int], int] = {}
    for row in rows:
        brand_key = row.brand.strip().casefold() if row.brand and row.brand.strip() else ""
        for price_slot in slots:
            audience = slot_audiences.get(price_slot.slot_number)
            mapping = (
                brand_mappings.get((brand_key, audience.id))
                or generic_mappings.get(audience.id)
                if audience is not None
                else None
            )
            resolved_slot_ids[(row.id, price_slot.slot_number)] = (
                mapping.price_list_id if mapping else price_slot.price_list_id
            )
    resolved_price_list_ids = list(dict.fromkeys(resolved_slot_ids.values()))
    price_map = authorized_product_prices(
        db,
        actor,
        [row.id for row in rows],
        resolved_price_list_ids,
    )
    visibility = {item.product_id: item.is_visible for item in design.product_items}
    output: list[dict] = []
    for row in rows:
        ordered_images = sorted(row.images, key=lambda image: (not image.is_primary, image.sort_order))
        primary_price_list_id = resolved_slot_ids.get((row.id, slot.slot_number)) if slot else None
        amount = price_map.get((row.id, primary_price_list_id)) if primary_price_list_id else None
        slot_prices = {
            str(item.slot_number): {
                "amount": price_map.get((row.id, resolved_slot_ids[(row.id, item.slot_number)])),
                "currency": "THB",
                "price_list_id": resolved_slot_ids[(row.id, item.slot_number)],
                "display_label": item.display_label,
            }
            for item in slots
        }
        image_rows = [
            {
                "id": str(image.id),
                "url": f"{settings.api_prefix}/v1/catalogue-studio/designs/{design.id}/products/{row.id}/images/{image.id}",
                "file_name": image.file_name,
                "alt_text": image.alt_text,
                "is_primary": image.is_primary,
                "sort_order": image.sort_order,
            }
            for image in ordered_images
        ]
        output.append({
            "id": str(row.id),
            "sku": row.sku,
            "erp_name": row.erp_name,
            "display_name": row.erp_name_th or row.erp_name,
            "name_en": row.erp_name,
            "name_th": row.erp_name_th,
            "description_en": row.erp_description_en,
            "description_th": row.erp_description_th,
            "how_to_use": row.erp_how_to_use,
            "remark": row.erp_remark,
            "brand": row.brand,
            "category": row.erp_category,
            "category_names": sorted(category.name for category in row.categories),
            "barcode": row.barcode if can_view_barcode else None,
            "barcodes": (
                list(dict.fromkeys([value for value in [row.barcode, *(row.barcodes or [])] if value]))
                if can_view_barcode else []
            ),
            "unit": row.unit,
            "pack_size": row.pack_size,
            "warranty": row.warranty_description,
            "stock_quantity": row.stock_quantity if can_view_stock else None,
            "price": amount,
            "price_currency": "THB",
            "prices": slot_prices,
            "primary_image_url": (
                f"{settings.api_prefix}/v1/catalogue-studio/designs/{design.id}/products/{row.id}/primary-image"
                if ordered_images else None
            ),
            "image_urls": [image["url"] for image in image_rows],
            "images": image_rows,
            "has_video": any(video.is_active and video.deleted_at is None for video in row.videos),
            "product_status": "active",
            "already_used": row.id in visibility,
            "catalogue_visible": visibility.get(row.id, True),
            "last_synchronized_at": row.last_source_sync_at,
        })
    return output


def _studio_product_row(
    db: Session,
    design: CatalogueDesign,
    actor: User,
    product_id: uuid.UUID,
) -> dict:
    """Return one authorized Studio product without relying on a paged search result."""
    product = validate_selectable_product_ids(db, design, actor, {product_id})[product_id]
    rows = _studio_product_rows(db, design, actor, query=product.sku)
    match = next((row for row in rows if row["id"] == str(product_id)), None)
    if not match:
        raise HTTPException(status_code=404, detail="This product is not available to this catalogue.")
    return match


def _studio_product_price_options(
    db: Session,
    design: CatalogueDesign,
    actor: User,
    product_id: uuid.UUID,
) -> dict:
    """Resolve this user's customer-level mappings for one authorized product."""
    product = validate_selectable_product_ids(db, design, actor, {product_id})[product_id]
    if not (is_superadmin(actor) or has_permission(actor, "prices.view")):
        raise HTTPException(status_code=403, detail="Permission required: prices.view")

    audiences = list(db.scalars(
        select(CatalogueAudienceType)
        .options(selectinload(CatalogueAudienceType.price_list))
        .where(CatalogueAudienceType.is_active.is_(True))
        .order_by(CatalogueAudienceType.display_order, CatalogueAudienceType.id)
    ))
    mappings = {
        row.audience_type_id: row
        for row in db.scalars(
            select(UserCataloguePriceMapping)
            .options(selectinload(UserCataloguePriceMapping.price_list))
            .where(
                UserCataloguePriceMapping.user_id == actor.id,
                UserCataloguePriceMapping.audience_type_id.in_([item.id for item in audiences]),
            )
        )
    } if audiences else {}
    brand_key = product.brand.strip().casefold() if product.brand and product.brand.strip() else None
    brand_mappings = {
        row.audience_type_id: row
        for row in db.scalars(
            select(UserBrandCataloguePriceMapping)
            .options(selectinload(UserBrandCataloguePriceMapping.price_list))
            .where(
                UserBrandCataloguePriceMapping.user_id == actor.id,
                UserBrandCataloguePriceMapping.brand_key == brand_key,
                UserBrandCataloguePriceMapping.audience_type_id.in_([item.id for item in audiences]),
            )
        )
    } if audiences and brand_key else {}
    allowed = allowed_price_list_ids(db, actor)
    resolved: list[tuple[CatalogueAudienceType, PriceList, bool, str]] = []
    for audience in audiences:
        brand_mapping = brand_mappings.get(audience.id)
        default_mapping = mappings.get(audience.id)
        mapping = brand_mapping or default_mapping
        mapping_source = "brand" if brand_mapping else "default" if default_mapping else "system"
        price_list = mapping.price_list if mapping else audience.price_list
        if (
            not audience.show_prices
            or price_list is None
            or not price_list.is_active
            or price_list.is_no_price
            or (allowed is not None and price_list.id not in allowed)
        ):
            continue
        resolved.append((audience, price_list, mapping is not None, mapping_source))

    price_list_ids = list(dict.fromkeys(item.id for _, item, _, _ in resolved))
    current_prices: dict[int, ProductPrice] = {}
    if price_list_ids:
        now = datetime.now(UTC)
        rows = db.scalars(
            select(ProductPrice)
            .where(
                ProductPrice.product_id == product.id,
                ProductPrice.price_list_id.in_(price_list_ids),
                ProductPrice.status == "active",
                ProductPrice.effective_from <= now,
                (ProductPrice.expires_at.is_(None) | (ProductPrice.expires_at > now)),
            )
            .order_by(ProductPrice.effective_from.desc())
        )
        for row in rows:
            current_prices.setdefault(row.price_list_id, row)

    return {
        "product": {
            "id": str(product.id),
            "sku": product.sku,
            "name": product.erp_name_th or product.erp_name,
            "brand": product.brand,
        },
        "options": [
            {
                "customer_level_id": audience.id,
                "customer_level_code": audience.code,
                "customer_level_name": audience.display_name,
                "price_list_id": price_list.id,
                "price_list_code": price_list.code,
                "price_list_name": price_list.name,
                "amount": str(current_prices[price_list.id].amount) if price_list.id in current_prices else None,
                "currency": current_prices[price_list.id].currency if price_list.id in current_prices else price_list.currency,
                "is_custom_mapping": is_custom,
                "mapping_source": mapping_source,
                "is_brand_override": mapping_source == "brand",
                "show_prices": True,
            }
            for audience, price_list, is_custom, mapping_source in resolved
        ],
    }


def _studio_design_pricing_overview(
    db: Session,
    design: CatalogueDesign,
    actor: User,
) -> dict:
    """Resolve every visible Studio product by its brand and customer audience."""
    if not (is_superadmin(actor) or has_permission(actor, "prices.view")):
        raise HTTPException(status_code=403, detail="Permission required: prices.view")

    product_ids = _published_design_product_ids(design)
    product_rows = list(db.scalars(
        select(Product).where(Product.id.in_(product_ids), Product.status == "active")
    )) if product_ids else []
    products_by_id = {product.id: product for product in product_rows}
    products = [products_by_id[product_id] for product_id in product_ids if product_id in products_by_id]
    audiences = list(db.scalars(
        select(CatalogueAudienceType)
        .options(selectinload(CatalogueAudienceType.price_list))
        .where(CatalogueAudienceType.is_active.is_(True))
        .order_by(CatalogueAudienceType.display_order, CatalogueAudienceType.id)
    ))
    audience_ids = [audience.id for audience in audiences]
    default_mappings = {
        row.audience_type_id: row
        for row in db.scalars(
            select(UserCataloguePriceMapping)
            .options(selectinload(UserCataloguePriceMapping.price_list))
            .where(
                UserCataloguePriceMapping.user_id == actor.id,
                UserCataloguePriceMapping.audience_type_id.in_(audience_ids),
            )
        )
    } if audience_ids else {}
    brand_keys = {
        product.brand.strip().casefold()
        for product in products
        if product.brand and product.brand.strip()
    }
    brand_mappings = {
        (row.brand_key, row.audience_type_id): row
        for row in db.scalars(
            select(UserBrandCataloguePriceMapping)
            .options(selectinload(UserBrandCataloguePriceMapping.price_list))
            .where(
                UserBrandCataloguePriceMapping.user_id == actor.id,
                UserBrandCataloguePriceMapping.brand_key.in_(brand_keys),
                UserBrandCataloguePriceMapping.audience_type_id.in_(audience_ids),
            )
        )
    } if brand_keys and audience_ids else {}
    levels = {
        level.price_list_id: level
        for level in db.scalars(
            select(ErpCustomerPriceLevel).where(ErpCustomerPriceLevel.is_active.is_(True))
        )
    }
    allowed = allowed_price_list_ids(db, actor)
    resolved: dict[tuple[uuid.UUID, int], tuple[PriceList | None, str, str]] = {}
    required_price_list_ids: set[int] = set()
    for product in products:
        brand_key = product.brand.strip().casefold() if product.brand and product.brand.strip() else ""
        for audience in audiences:
            brand_mapping = brand_mappings.get((brand_key, audience.id))
            default_mapping = default_mappings.get(audience.id)
            mapping = brand_mapping or default_mapping
            mapping_source = "brand" if brand_mapping else "default" if default_mapping else "system"
            price_list = mapping.price_list if mapping else audience.price_list
            if price_list is None:
                status = "mapping_required"
            elif not price_list.is_active or (allowed is not None and price_list.id not in allowed):
                status = "unavailable"
            elif not audience.show_prices or price_list.is_no_price:
                status = "hidden"
            else:
                status = "pending"
                required_price_list_ids.add(price_list.id)
            resolved[(product.id, audience.id)] = (price_list, mapping_source, status)

    current_prices: dict[tuple[uuid.UUID, int], ProductPrice] = {}
    if products and required_price_list_ids:
        now = datetime.now(UTC)
        for row in db.scalars(
            select(ProductPrice)
            .where(
                ProductPrice.product_id.in_([product.id for product in products]),
                ProductPrice.price_list_id.in_(required_price_list_ids),
                ProductPrice.status == "active",
                ProductPrice.effective_from <= now,
                (ProductPrice.expires_at.is_(None) | (ProductPrice.expires_at > now)),
            )
            .order_by(ProductPrice.effective_from.desc())
        ):
            current_prices.setdefault((row.product_id, row.price_list_id), row)

    return {
        "audiences": [
            {
                "id": audience.id,
                "code": audience.code,
                "name": audience.display_name,
                "show_prices": audience.show_prices,
            }
            for audience in audiences
        ],
        "products": [
            {
                "id": str(product.id),
                "sku": product.sku,
                "name": product.erp_name_th or product.erp_name,
                "brand": product.brand,
                "options": [
                    _studio_overview_price_option(
                        product,
                        audience,
                        resolved[(product.id, audience.id)],
                        current_prices,
                        levels,
                    )
                    for audience in audiences
                ],
            }
            for product in products
        ],
    }


def _studio_overview_price_option(
    product: Product,
    audience: CatalogueAudienceType,
    resolved: tuple[PriceList | None, str, str],
    current_prices: dict[tuple[uuid.UUID, int], ProductPrice],
    levels: dict[int, ErpCustomerPriceLevel],
) -> dict:
    price_list, mapping_source, status = resolved
    current_price = current_prices.get((product.id, price_list.id)) if price_list else None
    if status == "pending":
        status = "ready" if current_price else "missing_price"
    level = levels.get(price_list.id) if price_list else None
    return {
        "customer_level_id": audience.id,
        "customer_level_code": audience.code,
        "customer_level_name": audience.display_name,
        "price_list_id": price_list.id if price_list else None,
        "price_list_code": price_list.code if price_list else None,
        "price_list_name": price_list.name if price_list else None,
        "erp_source_code": level.source_code if level else None,
        "amount": str(current_price.amount) if current_price else None,
        "currency": current_price.currency if current_price else price_list.currency if price_list else "THB",
        "mapping_source": mapping_source,
        "is_brand_override": mapping_source == "brand",
        "show_prices": status not in {"hidden", "mapping_required", "unavailable"},
        "status": status,
    }


def _snapshot(design: CatalogueDesign, db: Session | None = None) -> dict:
    snapshot = {
        "onlineCover": dict(design.online_cover_json) if design.online_cover_json else None,
        "design": {
            "id": str(design.id), "name": design.name, "pageWidth": design.page_width,
            "pageHeight": design.page_height, "orientation": design.orientation,
            "sizePreset": design.size_preset, "dataMode": design.data_mode,
            "catalogueType": design.catalogue_type, "brandMode": design.brand_mode,
            "startAt": design.start_at.isoformat() if design.start_at else None,
            "endAt": design.end_at.isoformat() if design.end_at else None,
            "timezone": design.timezone, "promotionName": design.promotion_name,
            "promotionStatus": design.promotion_status,
        },
        "brands": [{"brandId": row.brand_id, "displayOrder": row.display_order, "isVisible": row.is_visible} for row in design.selected_brands],
        "priceSlots": [{"slotNumber": row.slot_number, "priceListId": row.price_list_id, "displayLabel": row.display_label, "currencyDisplay": row.currency_display, "decimalPlaces": row.decimal_places, "isVisible": row.is_visible} for row in design.price_slots],
        "products": [{"productId": str(row.product_id), "displayOrder": row.display_order, "isVisible": row.is_visible, "selectedVideoId": str(row.selected_video_id) if row.selected_video_id else None} for row in design.product_items],
        "pages": [
            {
                "id": str(page.id), "pageType": page.page_type, "pageName": page.page_name,
                "displayOrder": page.display_order, "width": page.width, "height": page.height,
                "orientation": page.orientation, "backgroundColor": page.background_color,
                "isVisible": page.is_visible, "isLocked": page.is_locked, "pageData": page.page_data_json,
            }
            for page in design.pages
        ],
    }
    if db is None:
        return snapshot
    identifiers = {item.product_id for item in design.product_items if item.is_visible}
    hidden_ids = {item.product_id for item in design.product_items if not item.is_visible}
    for page in design.pages:
        for element in (page.page_data_json or {}).get("elements", []):
            carousel = element.get("carousel") or {}
            nested_product_ids = carousel.get("productIds") or [carousel.get("productId")]
            if element.get("visible", True):
              for raw_product_id in filter(None, [element.get("productId"), *nested_product_ids]):
                try:
                    product_id = uuid.UUID(str(raw_product_id))
                    if product_id not in hidden_ids:
                        identifiers.add(product_id)
                except ValueError: pass
    products = list(db.scalars(select(Product).where(Product.id.in_(identifiers), Product.status == "active"))) if identifiers else []
    slot_ids = [slot.price_list_id for slot in design.price_slots if slot.is_visible and slot.price_list_id is not None]
    direct_price_list_ids: set[int] = set()
    for page in design.pages:
        for element in (page.page_data_json or {}).get("elements", []):
            style = element.get("style") or {}
            for field_name in ("priceListId", "primaryPriceListId", "secondaryPriceListId"):
                raw_price_list_id = style.get(field_name)
                try:
                    price_list_id = int(raw_price_list_id)
                    if price_list_id > 0:
                        direct_price_list_ids.add(price_list_id)
                except (TypeError, ValueError):
                    pass
    all_price_list_ids = list(dict.fromkeys([*slot_ids, *sorted(direct_price_list_ids)]))
    prices: dict[tuple[str, int], dict] = {}
    if products and all_price_list_ids:
        now = datetime.now(UTC)
        for row in db.scalars(select(ProductPrice).where(
            ProductPrice.product_id.in_([item.id for item in products]),
            ProductPrice.price_list_id.in_(all_price_list_ids),
            ProductPrice.status == "active",
            ProductPrice.effective_from <= now,
            (ProductPrice.expires_at.is_(None) | (ProductPrice.expires_at > now)),
        ).order_by(ProductPrice.effective_from.desc())):
            prices.setdefault((str(row.product_id), row.price_list_id), {"amount": str(row.amount), "currency": row.currency})
    product_data = {}
    primary_slot = next(
        (
            slot
            for slot in sorted(design.price_slots, key=lambda item: item.slot_number)
            if slot.is_visible and slot.price_list_id is not None
        ),
        None,
    )
    for product in products:
        warehouses = list(product.warehouse_stocks)
        ordered_images = sorted(product.images, key=lambda image: (not image.is_primary, image.sort_order))
        primary_price = prices.get((str(product.id), primary_slot.price_list_id)) if primary_slot else None
        product_data[str(product.id)] = {
            "id": str(product.id), "code": product.sku, "sku": product.sku,
            "barcode": product.barcode or "", "name_en": product.erp_name,
            "barcodes": list(dict.fromkeys([value for value in [product.barcode, *(product.barcodes or [])] if value])),
            "name_th": product.erp_name_th or "", "brand_name": product.brand or "",
            "category_name": product.erp_category or "", "description": product.erp_description_en or product.erp_description_th or "",
            "stock_on_hand": str(sum(float(row.on_hand) for row in warehouses) if warehouses else product.stock_quantity),
            "stock_available": str(sum(float(row.available) for row in warehouses) if warehouses else product.stock_quantity),
            "stock_reserved": str(sum(float(row.reserved) for row in warehouses)),
            "stock_incoming": str(sum(float(row.incoming) for row in warehouses)),
            "last_synchronized_at": product.last_source_sync_at.isoformat() if product.last_source_sync_at else "",
            "unit": product.unit, "pack_size": product.pack_size, "weight": str(product.gross_weight or ""),
            "warranty": product.warranty_description or "",
            "price": primary_price.get("amount") if primary_price else None,
            "price_currency": primary_price.get("currency") if primary_price else "THB",
            "primary_image_storage_name": ordered_images[0].storage_name if ordered_images else None,
            "image_storage_names": [image.storage_name for image in ordered_images],
            "image_ids": [str(image.id) for image in ordered_images],
            "prices": {str(slot.slot_number): prices.get((str(product.id), slot.price_list_id)) for slot in design.price_slots if slot.is_visible and slot.price_list_id is not None},
            "prices_by_list": {str(price_list_id): prices.get((str(product.id), price_list_id)) for price_list_id in direct_price_list_ids},
        }
    snapshot["productData"] = product_data
    return snapshot


def _create_version(db: Session, design: CatalogueDesign, actor: User, summary: str) -> CatalogueDesignVersion:
    next_version = (db.scalar(select(func.max(CatalogueDesignVersion.version_number)).where(
        CatalogueDesignVersion.design_id == design.id
    )) or 0) + 1
    version = CatalogueDesignVersion(
        design_id=design.id,
        version_number=next_version,
        snapshot_json=_snapshot(design, db),
        change_summary=summary,
        created_by_id=actor.id,
    )
    design.current_version = next_version
    db.add(version)
    db.flush()
    return version


def _published_design_product_ids(design: CatalogueDesign) -> list[uuid.UUID]:
    """Return visible Studio products in a stable, de-duplicated order."""
    ordered_ids: list[uuid.UUID] = []
    hidden_ids = {item.product_id for item in design.product_items if not item.is_visible}

    def append_identifier(raw_identifier: object) -> None:
        if not raw_identifier:
            return
        try:
            product_id = uuid.UUID(str(raw_identifier))
        except (TypeError, ValueError):
            return
        if product_id not in hidden_ids and product_id not in ordered_ids:
            ordered_ids.append(product_id)

    for item in sorted(design.product_items, key=lambda row: row.display_order):
        if item.is_visible:
            append_identifier(item.product_id)
    for page in sorted(design.pages, key=lambda row: row.display_order):
        if not page.is_visible:
            continue
        for element in (page.page_data_json or {}).get("elements", []):
            if element.get("visible", True):
                append_identifier(
                    element.get("productId")
                    or (element.get("carousel") or {}).get("productId")
                )
    return ordered_ids


def _ensure_design_catalogue_projection(
    db: Session,
    design: CatalogueDesign,
    actor: User,
    *,
    sync_products: bool = True,
) -> Catalogue:
    """Keep a Studio design visible as its linked Catalogue Management record.

    This projection deliberately does not publish or create immutable versions.
    It is safe to call during autosave and makes Studio the source of truth for
    catalogue identity, configuration, and selected products.
    """
    from app.commerce import _slugify

    catalogue = db.get(Catalogue, design.catalogue_id) if design.catalogue_id else None
    if catalogue is None:
        base_slug = _slugify(design.name)
        slug = base_slug
        suffix = str(design.id).split("-")[0]
        attempt = 1
        while db.scalar(select(Catalogue.id).where(Catalogue.slug == slug)) is not None:
            slug = f"{base_slug}-{suffix}" if attempt == 1 else f"{base_slug}-{suffix}-{attempt}"
            attempt += 1
        catalogue = Catalogue(
            title=design.name,
            slug=slug,
            description="Created and managed in Catalogue Studio.",
            audience="Internal",
            currency="THB",
            language="en",
            status="draft",
            owner_id=actor.id,
            created_by_id=actor.id,
            updated_by_id=actor.id,
        )
        db.add(catalogue)
        db.flush()
        design.catalogue_id = catalogue.id

    visible_brand_ids = [
        row.brand_id
        for row in sorted(design.selected_brands, key=lambda item: item.display_order)
        if row.is_visible
    ]
    brand_names = list(
        db.scalars(select(Brand.name).where(Brand.id.in_(visible_brand_ids))).all()
    ) if visible_brand_ids else []
    visible_price_slot = next(
        (
            row
            for row in sorted(design.price_slots, key=lambda item: item.slot_number)
            if row.is_visible and row.price_list_id is not None
        ),
        None,
    )
    price_list = db.get(PriceList, visible_price_slot.price_list_id) if visible_price_slot else None

    catalogue.title = design.name
    catalogue.brand = brand_names[0] if len(brand_names) == 1 else None
    catalogue.price_list_id = price_list.id if price_list else None
    catalogue.show_prices = bool(price_list and not price_list.is_no_price)
    catalogue.valid_from = design.start_at
    catalogue.valid_until = design.end_at
    catalogue.updated_by_id = design.updated_by_id or actor.id

    if sync_products:
        product_ids = _published_design_product_ids(design)
        active_ids = set(
            db.scalars(
                select(Product.id).where(
                    Product.id.in_(product_ids),
                    Product.status == "active",
                )
            ).all()
        ) if product_ids else set()
        desired_ids = [product_id for product_id in product_ids if product_id in active_ids]
        selected_video_ids = {
            item.product_id: item.selected_video_id
            for item in design.product_items
            if item.is_visible
        }
        current_links = list(db.scalars(
            select(CatalogueProduct)
            .where(CatalogueProduct.catalogue_id == catalogue.id)
            .order_by(CatalogueProduct.sort_order, CatalogueProduct.id)
        ).all())
        current_signature = [
            (row.product_id, row.selected_video_id, row.hide_price)
            for row in current_links
        ]
        desired_signature = [
            (product_id, selected_video_ids.get(product_id), not catalogue.show_prices)
            for product_id in desired_ids
        ]
        if current_signature != desired_signature:
            db.execute(delete(CatalogueProduct).where(CatalogueProduct.catalogue_id == catalogue.id))
            db.flush()
            for sort_order, product_id in enumerate(desired_ids, start=1):
                selected_video_id = selected_video_ids.get(product_id)
                db.add(CatalogueProduct(
                    catalogue_id=catalogue.id,
                    product_id=product_id,
                    hide_price=not catalogue.show_prices,
                    include_video=selected_video_id is not None,
                    selected_video_id=selected_video_id,
                    sort_order=sort_order,
                ))
            db.flush()

    # A published design remains published during ordinary Studio autosaves;
    # every other Studio lifecycle state is represented as a management draft.
    catalogue.status = "published" if design.status == "published" else "draft"
    if catalogue.status != "published":
        catalogue.published_by_id = None
        catalogue.published_at = None
    db.flush()
    return catalogue


def synchronize_studio_catalogues(db: Session, actor: User) -> int:
    """Reconcile every Studio design into Catalogue Management.

    Studio owns the editable design. Catalogue Management receives a linked
    projection for discovery, lifecycle filtering, product counts, preview and
    editor navigation. Reconciliation is idempotent and does not publish drafts.
    """
    designs = list(
        db.scalars(
            select(CatalogueDesign)
            .options(
                selectinload(CatalogueDesign.pages),
                selectinload(CatalogueDesign.selected_brands),
                selectinload(CatalogueDesign.price_slots),
                selectinload(CatalogueDesign.product_items),
            )
            .where(CatalogueDesign.deleted_at.is_(None))
            .order_by(CatalogueDesign.updated_at, CatalogueDesign.id)
        ).all()
    )
    for design in designs:
        _ensure_design_catalogue_projection(db, design, actor)
    return len(designs)


def _sync_published_design_to_catalogue(
    db: Session,
    design: CatalogueDesign,
    actor: User,
) -> Catalogue:
    """Publish the Studio projection and create its immutable version."""
    # Imports stay local because commerce also exposes compatibility routes for
    # Studio and should not be required while this module is being imported.
    from app.catalogue_share_links import ensure_share_links_for_catalogue
    from app.commerce import _build_snapshot, _get_catalogue

    catalogue = _ensure_design_catalogue_projection(db, design, actor)

    # Reload after replacing the product links so snapshot generation sees the
    # newly published Studio selection rather than a cached relationship.
    db.expire(catalogue)
    catalogue = _get_catalogue(db, catalogue.id)
    next_version = (db.scalar(
        select(func.max(CatalogueVersion.version_number)).where(
            CatalogueVersion.catalogue_id == catalogue.id
        )
    ) or 0) + 1
    snapshot = _build_snapshot(db, catalogue, strict_prices=False)
    snapshot["version"] = next_version
    snapshot["online_cover"] = {key: value for key, value in design.online_cover_json.items() if key != "url"} if design.online_cover_json else None
    design.published_online_cover_json = dict(design.online_cover_json) if design.online_cover_json else None
    db.add(CatalogueVersion(
        catalogue_id=catalogue.id,
        version_number=next_version,
        snapshot=snapshot,
        published_by_id=actor.id,
    ))
    now = datetime.now(UTC)
    catalogue.version = next_version
    catalogue.revision += 1
    catalogue.status = "published"
    catalogue.published_by_id = actor.id
    catalogue.published_at = now
    catalogue.updated_by_id = actor.id
    ensure_share_links_for_catalogue(db, catalogue, actor.id)
    db.flush()
    return catalogue


def _unpublish_design_catalogue(
    db: Session,
    design: CatalogueDesign,
    actor: User,
) -> Catalogue:
    """Return the linked commerce catalogue to draft and disable public links."""
    catalogue = _ensure_design_catalogue_projection(db, design, actor)

    now = datetime.now(UTC)
    catalogue.status = "draft"
    catalogue.published_by_id = None
    catalogue.published_at = None
    catalogue.updated_by_id = actor.id
    catalogue.revision += 1
    for link in db.scalars(
        select(CatalogueShareLink).where(
            CatalogueShareLink.catalogue_id == catalogue.id,
            CatalogueShareLink.status == "active",
        )
    ):
        link.status = "revoked"
        link.revoked_by_id = actor.id
        link.revoked_at = now
    db.flush()
    return catalogue


def _template_can_view(item: CatalogueTemplate, actor: User) -> bool:
    return bool(
        is_superadmin(actor)
        or item.owner_user_id == actor.id
        or (item.is_company_template and item.approval_status == "approved")
    )


def _template_pages(item: CatalogueTemplate) -> list[dict]:
    """Return only validated platform page documents from a reusable template."""
    raw = item.template_data_json or {}
    pages = raw.get("pages", []) if isinstance(raw, dict) else []
    validated: list[dict] = []
    for index, row in enumerate(pages, start=1):
        if not isinstance(row, dict):
            raise HTTPException(status_code=422, detail=f"Template page {index} is invalid.")
        document = row.get("pageData") or row.get("page_data_json") or row
        try:
            parsed = PageDocument.model_validate(document).model_dump(mode="json")
        except Exception as error:
            raise HTTPException(status_code=422, detail=f"Template page {index} does not match the supported canvas schema.") from error
        validated.append({"metadata": row, "document": parsed})
    return validated


@router.get("/designs/summary", response_model=list[DesignSummaryResponse])
def list_design_summaries(
    query: str = Query(default="", max_length=120),
    _: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    page_count = (
        select(func.count(CatalogueDesignPage.id))
        .where(CatalogueDesignPage.design_id == CatalogueDesign.id)
        .correlate(CatalogueDesign)
        .scalar_subquery()
    )
    product_count = (
        select(func.count(CatalogueDesignProduct.id))
        .where(CatalogueDesignProduct.design_id == CatalogueDesign.id)
        .correlate(CatalogueDesign)
        .scalar_subquery()
    )
    brand_count = (
        select(func.count(CatalogueDesignBrand.id))
        .where(CatalogueDesignBrand.design_id == CatalogueDesign.id)
        .correlate(CatalogueDesign)
        .scalar_subquery()
    )
    statement = select(
        CatalogueDesign,
        page_count.label("page_count"),
        product_count.label("product_count"),
        brand_count.label("brand_count"),
    ).where(CatalogueDesign.deleted_at.is_(None))
    if query.strip():
        statement = statement.where(CatalogueDesign.name.ilike(f"%{query.strip()}%"))
    rows = db.execute(statement.order_by(CatalogueDesign.updated_at.desc())).all()
    return [
        DesignSummaryResponse(
            id=design.id,
            catalogue_id=design.catalogue_id,
            name=design.name,
            status=design.status,
            page_width=design.page_width,
            page_height=design.page_height,
            orientation=design.orientation,
            size_preset=design.size_preset,
            data_mode=design.data_mode,
            catalogue_type=design.catalogue_type,
            brand_mode=design.brand_mode,
            current_version=design.current_version,
            revision=design.revision,
            created_at=design.created_at,
            updated_at=design.updated_at,
            page_count=page_total,
            product_count=product_total,
            brand_count=brand_total,
        )
        for design, page_total, product_total, brand_total in rows
    ]


@router.get("/designs", response_model=list[DesignResponse])
def list_designs(
    query: str = Query(default="", max_length=120),
    _: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    statement = select(CatalogueDesign).options(
        selectinload(CatalogueDesign.pages),
        selectinload(CatalogueDesign.selected_brands),
        selectinload(CatalogueDesign.price_slots),
        selectinload(CatalogueDesign.product_items),
    ).where(CatalogueDesign.deleted_at.is_(None))
    if query.strip():
        statement = statement.where(CatalogueDesign.name.ilike(f"%{query.strip()}%"))
    return list(db.scalars(statement.order_by(CatalogueDesign.updated_at.desc())).unique())


@router.post("/designs", response_model=DesignResponse, status_code=201)
def create_design(
    payload: DesignCreate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.create")),
    db: Session = Depends(get_db),
):
    page_width, page_height, orientation, size_preset = _a4_geometry(payload.orientation)
    validate_brand_access(db, actor, payload.brand_ids, multiple=payload.brand_mode == "multiple")
    validate_price_access(db, actor, [slot.price_list_id for slot in payload.price_slots if slot.price_list_id is not None])
    source_template = None
    template_pages: list[dict] = []
    if payload.template_id:
        source_template = db.get(CatalogueTemplate, payload.template_id)
        if not source_template or source_template.deleted_at or not source_template.is_active or not _template_can_view(source_template, actor):
            raise HTTPException(status_code=404, detail="Catalogue template not found.")
        template_pages = _template_pages(source_template)
        if not template_pages:
            raise HTTPException(status_code=422, detail="This template does not contain a usable page.")
    elif payload.start_mode == "my_template":
        raise HTTPException(status_code=422, detail="Select a template for this starting mode.")
    promotion = payload.promotion
    design = CatalogueDesign(
        catalogue_id=payload.catalogue_id,
        name=payload.name.strip(),
        page_width=page_width,
        page_height=page_height,
        orientation=orientation,
        size_preset=size_preset,
        data_mode=payload.data_mode,
        catalogue_type=payload.catalogue_type,
        brand_mode=payload.brand_mode,
        start_at=promotion.start_at if promotion else None,
        end_at=promotion.end_at if promotion else None,
        timezone=promotion.timezone if promotion else "Asia/Bangkok",
        promotion_name=promotion.promotion_name if promotion else "",
        promotion_status="draft" if promotion else None,
        promotion_occasion_id=promotion.occasion_id if promotion else None,
        promotion_priority=promotion.priority if promotion else 50,
        promotion_terms=promotion.terms if promotion else "",
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(design)
    db.flush()
    for index, brand_id in enumerate(dict.fromkeys(payload.brand_ids), start=1):
        db.add(CatalogueDesignBrand(design_id=design.id, brand_id=brand_id, display_order=index))
    for slot in payload.price_slots:
        db.add(CatalogueDesignPriceSlot(design_id=design.id, **slot.model_dump()))
    if template_pages:
        for index, template_page in enumerate(template_pages, start=1):
            metadata, page_document = template_page["metadata"], template_page["document"]
            page_document["pageId"] = str(uuid.uuid4())
            page_document["name"] = str(metadata.get("pageName") or page_document["name"])
            requested_orientation = str(metadata.get("orientation") or ("landscape" if page_document["canvas"]["width"] > page_document["canvas"]["height"] else "portrait"))
            width, height, page_orientation, _ = _a4_geometry(requested_orientation)
            page_document = _a4_document(page_document, width, height)
            canvas = page_document["canvas"]
            db.add(CatalogueDesignPage(
                design_id=design.id, page_type=page_document["pageType"], page_name=page_document["name"], display_order=index,
                width=int(canvas["width"]), height=int(canvas["height"]),
                orientation=page_orientation,
                background_color=canvas["backgroundColor"], page_data_json=page_document,
                template_id=source_template.id, is_visible=bool(metadata.get("isVisible", True)), is_locked=bool(metadata.get("isLocked", False)),
            ))
        source_template.usage_count += 1
        _audit(db, request, actor, "catalogue_template_applied", str(source_template.id), {"design_id": str(design.id)})
        _audit(db, request, actor, "catalogue_design_created", str(design.id), {"name": design.name, "start_mode": payload.start_mode, "catalogue_type": payload.catalogue_type})
        _ensure_design_catalogue_projection(db, design, actor)
        db.commit()
        return _design(db, design.id)

    is_blank = payload.start_mode in {"blank", "upload_template"}
    document = {
        "pageId": "blank-page" if is_blank else "cover-page",
        "pageType": "blank" if is_blank else "cover",
        "name": "Page 1" if is_blank else "Cover",
        "canvas": {
            "width": design.page_width, "height": design.page_height,
            "backgroundColor": "#FFFFFF" if is_blank else "#0E5A35", "gridSize": 10,
            "showGrid": False, "showGuides": True, "showSafeArea": True, "bleed": 0,
        },
        "elements": [] if is_blank else [{
            "id": "cover-title", "type": "text", "name": "Catalogue title",
            "xPercent": 10, "yPercent": 36, "widthPercent": 80, "heightPercent": 18,
            "rotation": 0, "opacity": 1, "zIndex": 1, "locked": False, "visible": True,
            "text": payload.name, "style": {"color": "#FFFFFF", "fontSize": 64, "textAlign": "center"},
            "responsive": {},
        }],
        "dataMode": payload.data_mode,
    }
    db.add(CatalogueDesignPage(
        design_id=design.id, page_type="blank" if is_blank else "cover", page_name="Page 1" if is_blank else "Cover", display_order=1,
        width=design.page_width, height=design.page_height, orientation=design.orientation,
        background_color="#FFFFFF" if is_blank else "#0E5A35", page_data_json=document,
    ))
    _audit(db, request, actor, "catalogue_design_created", str(design.id), {"name": design.name, "start_mode": payload.start_mode, "catalogue_type": payload.catalogue_type})
    _ensure_design_catalogue_projection(db, design, actor)
    db.commit()
    return _design(db, design.id)


@router.get("/designs/{design_id}", response_model=DesignResponse)
def get_design(
    design_id: uuid.UUID,
    _: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    return _design_response_with_live_stock(db, _design(db, design_id))


@router.get("/designs/{design_id}/render-snapshot", response_model=dict)
def get_render_snapshot(
    design_id: uuid.UUID,
    version_id: uuid.UUID | None = Query(default=None),
    actor: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    """Return the immutable document used by the browser export renderer.

    Preview/PDF parity depends on both surfaces consuming the exact same JSON
    revision.  Live stock is refreshed here because stock is intentionally a
    live ERP field, while all layout and style data remains pinned to the
    selected version.
    """
    design = _design(db, design_id)
    if not has_permission(actor, "catalogue_designs.export_pdf"):
        raise HTTPException(status_code=403, detail="Permission required: catalogue_designs.export_pdf")
    if version_id is None:
        return _snapshot_with_current_live_stock(db, _snapshot(design, db))
    version = db.scalar(select(CatalogueDesignVersion).where(
        CatalogueDesignVersion.id == version_id,
        CatalogueDesignVersion.design_id == design.id,
    ))
    if not version:
        raise HTTPException(status_code=404, detail="Catalogue design version not found.")
    return _snapshot_with_current_live_stock(db, version.snapshot_json)


@router.patch("/designs/{design_id}", response_model=DesignResponse)
def update_design(
    design_id: uuid.UUID,
    payload: DesignUpdate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.edit")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    changes = payload.model_dump(exclude_none=True, exclude={"expected_revision"})
    for field, value in changes.items():
        setattr(design, field, value)
    design.revision += 1
    design.updated_by_id = actor.id
    _audit(db, request, actor, "catalogue_design_updated", str(design.id), {"fields": sorted(changes)})
    _ensure_design_catalogue_projection(db, design, actor)
    db.commit()
    return _design(db, design.id)


@router.delete("/designs/{design_id}", status_code=204)
def delete_design(
    design_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.delete")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    design.deleted_at = datetime.now(UTC)
    design.revision += 1
    catalogue = db.get(Catalogue, design.catalogue_id) if design.catalogue_id else None
    design.catalogue_id = None
    if catalogue and catalogue.description == "Created and managed in Catalogue Studio.":
        other_designs = db.scalar(select(func.count()).select_from(CatalogueDesign).where(
            CatalogueDesign.catalogue_id == catalogue.id,
            CatalogueDesign.id != design.id,
            CatalogueDesign.deleted_at.is_(None),
        )) or 0
        if not other_designs:
            db.delete(catalogue)
    _audit(db, request, actor, "catalogue_design_deleted", str(design.id))
    db.commit()


@router.post("/designs/{design_id}/duplicate", response_model=DesignResponse, status_code=201)
def duplicate_design(
    design_id: uuid.UUID,
    request: Request,
    version_id: uuid.UUID | None = None,
    actor: User = Depends(require_permission("catalogue_designs.duplicate")),
    db: Session = Depends(get_db),
):
    source = _design(db, design_id)
    snapshot = _snapshot(source, db)
    if version_id:
        version = db.scalar(select(CatalogueDesignVersion).where(
            CatalogueDesignVersion.id == version_id,
            CatalogueDesignVersion.design_id == source.id,
        ))
        if not version:
            raise HTTPException(status_code=404, detail="Catalogue design version not found.")
        snapshot = version.snapshot_json
    settings = snapshot.get("design", {})
    duplicate_width, duplicate_height, duplicate_orientation, duplicate_preset = _a4_geometry(str(settings.get("orientation") or source.orientation))
    duplicate = CatalogueDesign(
        catalogue_id=None,
        name=f"{settings.get('name') or source.name} copy",
        status="draft",
        page_width=duplicate_width,
        page_height=duplicate_height,
        orientation=duplicate_orientation,
        size_preset=duplicate_preset,
        data_mode=str(settings.get("dataMode") or source.data_mode),
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(duplicate); db.flush()
    for index, page_snapshot in enumerate(snapshot.get("pages", []), start=1):
        page_data = page_snapshot.get("pageData") or page_snapshot.get("page_data_json") or {}
        page_data = json.loads(json.dumps(page_data))
        page_data["pageId"] = str(uuid.uuid4())
        page_width, page_height, page_orientation, _ = _a4_geometry(str(page_snapshot.get("orientation") or duplicate.orientation))
        page_data = _a4_document(page_data, page_width, page_height)
        db.add(CatalogueDesignPage(
            design_id=duplicate.id,
            page_type=page_snapshot.get("pageType") or "free_layout",
            page_name=page_snapshot.get("pageName") or f"Page {index}",
            display_order=index,
            width=page_width,
            height=page_height,
            orientation=page_orientation,
            background_color=page_snapshot.get("backgroundColor") or (page_data.get("canvas") or {}).get("backgroundColor") or "#FFFFFF",
            page_data_json=page_data,
            is_visible=bool(page_snapshot.get("isVisible", True)),
        ))
    _audit(db, request, actor, "catalogue_design_duplicated", str(duplicate.id), {"source_design_id": str(source.id), "source_version_id": str(version_id) if version_id else None})
    _ensure_design_catalogue_projection(db, duplicate, actor)
    db.commit()
    return _design(db, duplicate.id)


@router.post("/designs/{design_id}/pages", response_model=PageResponse, status_code=201)
def create_page(
    design_id: uuid.UUID,
    payload: PageCreate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.manage_pages")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    width = max(200, min(10000, int(payload.width)))
    height = max(200, min(10000, int(payload.height)))
    orientation = "landscape" if width > height else "portrait" if height > width else "square"
    next_order = (db.scalar(select(func.max(CatalogueDesignPage.display_order)).where(
        CatalogueDesignPage.design_id == design.id
    )) or 0) + 1
    page = CatalogueDesignPage(
        design_id=design.id, page_type=payload.page_type, page_name=payload.page_name,
        display_order=next_order, width=width, height=height,
        orientation=orientation, background_color=payload.background_color,
        page_data_json=_a4_document(payload.page_data.model_dump(mode="json"), width, height), is_visible=payload.is_visible,
        is_locked=payload.is_locked,
    )
    db.add(page)
    design.revision += 1
    design.updated_by_id = actor.id
    _audit(db, request, actor, "catalogue_design_page_added", str(design.id), {"page_name": page.page_name})
    _ensure_design_catalogue_projection(db, design, actor)
    db.commit()
    db.refresh(page)
    return page


@router.patch("/designs/{design_id}/pages/{page_id}", response_model=DesignResponse)
def update_page(
    design_id: uuid.UUID,
    page_id: uuid.UUID,
    payload: PageUpdate,
    request: Request,
    actor: User = Depends(require_any_permission("catalogue_designs.manage_elements", "catalogue_designs.manage_pages")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    page = _page(db, design_id, page_id)
    values = payload.model_dump(exclude_none=True, exclude={"expected_revision", "page_data"})
    if "width" in values or "height" in values or "orientation" in values:
        width = max(200, min(10000, int(values.get("width", page.width))))
        height = max(200, min(10000, int(values.get("height", page.height))))
        orientation = "landscape" if width > height else "portrait" if height > width else "square"
        values.update(width=width, height=height, orientation=orientation)
    for field, value in values.items():
        setattr(page, field, value)
    if payload.page_data is not None:
        next_document = payload.page_data.model_dump(mode="json")
        next_document = _a4_document(next_document, page.width, page.height)
        _audit_product_card_changes(
            db, request, actor, design, page.page_data_json or {}, next_document
        )
        _audit_image_carousel_changes(
            db, request, actor, design, page.page_data_json or {}, next_document
        )
        page.page_data_json = next_document
        bound_ids: set[uuid.UUID] = set()
        for element in page.page_data_json.get("elements", []):
            raw_product_id = element.get("productId") or (element.get("carousel") or {}).get("productId")
            if not raw_product_id:
                continue
            try:
                bound_ids.add(uuid.UUID(str(raw_product_id)))
            except ValueError as exc:
                raise HTTPException(status_code=422, detail="A canvas element has an invalid product binding.") from exc
        validate_selectable_product_ids(db, design, actor, bound_ids)
        existing_ids = {item.product_id for item in design.product_items}
        next_order = max((item.display_order for item in design.product_items), default=0)
        for product_id in bound_ids - existing_ids:
            next_order += 1
            db.add(CatalogueDesignProduct(
                design_id=design.id,
                product_id=product_id,
                display_order=next_order,
                is_visible=True,
            ))
    design.revision += 1
    design.updated_by_id = actor.id
    _audit(db, request, actor, "catalogue_design_page_saved", str(design.id), {"page_id": str(page.id)})
    _ensure_design_catalogue_projection(db, design, actor)
    db.commit()
    return _design(db, design.id)


@router.delete("/designs/{design_id}/pages/{page_id}", response_model=DesignResponse)
def delete_page(
    design_id: uuid.UUID,
    page_id: uuid.UUID,
    expected_revision: int,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.manage_pages")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, expected_revision)
    if len(design.pages) <= 1:
        raise HTTPException(status_code=422, detail="A design must contain at least one page.")
    page = _page(db, design_id, page_id)
    db.delete(page)
    db.flush()
    remaining = list(db.scalars(select(CatalogueDesignPage).where(
        CatalogueDesignPage.design_id == design.id
    ).order_by(CatalogueDesignPage.display_order)))
    # Move every surviving page into a temporary order range before assigning
    # its final contiguous position. Updating 4 -> 3 while another row is still
    # stored as 3 violates the unique (design_id, display_order) constraint on
    # SQLite and PostgreSQL even though that row has just been deleted.
    for index, item in enumerate(remaining, start=1):
        item.display_order = -index
    db.flush()
    for index, item in enumerate(remaining, start=1):
        item.display_order = index
    design.revision += 1
    _audit(db, request, actor, "catalogue_design_page_removed", str(design.id), {"page_id": str(page_id)})
    _ensure_design_catalogue_projection(db, design, actor)
    db.commit()
    return _design(db, design.id)


@router.put("/designs/{design_id}/pages/order", response_model=DesignResponse)
def reorder_pages(
    design_id: uuid.UUID,
    payload: PageOrderUpdate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.manage_pages")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    if set(payload.page_ids) != {page.id for page in design.pages}:
        raise HTTPException(status_code=422, detail="Page order must include every design page exactly once.")
    by_id = {page.id: page for page in design.pages}
    for index, page_id in enumerate(payload.page_ids, start=1):
        by_id[page_id].display_order = -index
    db.flush()
    for index, page_id in enumerate(payload.page_ids, start=1):
        by_id[page_id].display_order = index
    design.revision += 1
    _audit(db, request, actor, "catalogue_design_pages_reordered", str(design.id))
    _ensure_design_catalogue_projection(db, design, actor)
    db.commit()
    # The identity map keeps the pre-reorder Python list even though the row
    # values were updated. Expire it so the response is returned in the new,
    # relationship-defined display order immediately (not only after reload).
    db.expire(design, ["pages"])
    return _design(db, design.id)


@router.post("/designs/{design_id}/versions", response_model=VersionResponse, status_code=201)
def create_version(
    design_id: uuid.UUID,
    payload: VersionCreate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.edit")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    version = _create_version(db, design, actor, payload.change_summary)
    _audit(db, request, actor, "catalogue_design_version_saved", str(design.id), {"version": version.version_number})
    db.commit()
    db.refresh(version)
    return version


@router.get("/designs/{design_id}/versions", response_model=list[VersionResponse])
def list_versions(
    design_id: uuid.UUID,
    _: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    _design(db, design_id)
    return list(db.scalars(select(CatalogueDesignVersion).where(
        CatalogueDesignVersion.design_id == design_id
    ).order_by(CatalogueDesignVersion.version_number.desc())))


@router.post("/designs/{design_id}/versions/{version_id}/restore", response_model=DesignResponse)
def restore_version(
    design_id: uuid.UUID,
    version_id: uuid.UUID,
    payload: VersionCreate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.edit")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    version = db.scalar(select(CatalogueDesignVersion).where(
        CatalogueDesignVersion.id == version_id,
        CatalogueDesignVersion.design_id == design.id,
    ))
    if not version:
        raise HTTPException(status_code=404, detail="Catalogue design version not found.")
    _create_version(db, design, actor, f"Before restoring version {version.version_number}")
    snapshot = version.snapshot_json
    settings = snapshot.get("design", {})
    design.name = str(settings.get("name") or design.name)
    design.page_width, design.page_height, design.orientation, design.size_preset = _a4_geometry(str(settings.get("orientation") or design.orientation))
    design.data_mode = str(settings.get("dataMode") or design.data_mode)
    design.status = "draft"
    for page in list(design.pages):
        db.delete(page)
    db.flush()
    for index, page_snapshot in enumerate(snapshot.get("pages", []), start=1):
        page_data = page_snapshot.get("pageData") or page_snapshot.get("page_data_json") or {}
        page_width, page_height, page_orientation, _ = _a4_geometry(str(page_snapshot.get("orientation") or design.orientation))
        page_data = _a4_document(page_data, page_width, page_height)
        db.add(CatalogueDesignPage(
            design_id=design.id,
            page_type=page_snapshot.get("pageType") or "free_layout",
            page_name=page_snapshot.get("pageName") or f"Page {index}",
            display_order=index,
            width=page_width,
            height=page_height,
            orientation=page_orientation,
            background_color=page_snapshot.get("backgroundColor") or (page_data.get("canvas") or {}).get("backgroundColor") or "#FFFFFF",
            page_data_json=page_data,
            is_visible=bool(page_snapshot.get("isVisible", True)),
        ))
    design.revision += 1; design.updated_by_id = actor.id
    _ensure_design_catalogue_projection(db, design, actor)
    _audit(db, request, actor, "catalogue_design_restored", str(design.id), {"restored_version": version.version_number})
    db.commit(); db.expire(design, ["pages"])
    return _design(db, design.id)


@router.post("/designs/{design_id}/publish", response_model=DesignResponse)
def publish_design(
    design_id: uuid.UUID,
    payload: VersionCreate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.publish")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    errors, _ = validate_design_for_publish(db, design, actor)
    if errors:
        raise HTTPException(status_code=422, detail={"message": "Catalogue validation failed.", "errors": errors})
    # Every catalogue published from Studio keeps inventory live. Layout and
    # descriptive content remain versioned, while stock is rebound per request.
    design.data_mode = "live"
    version = _create_version(db, design, actor, payload.change_summary or "Published")
    design.status = "published"
    design.revision += 1
    design.updated_by_id = actor.id
    catalogue = _sync_published_design_to_catalogue(db, design, actor)
    _audit(db, request, actor, "catalogue_design_published", str(design.id), {
        "version": version.version_number,
        "catalogue_id": str(catalogue.id),
        "catalogue_version": catalogue.version,
    })
    db.commit()
    return _design(db, design.id)


@router.post("/designs/{design_id}/unpublish", response_model=DesignResponse)
def unpublish_design(
    design_id: uuid.UUID,
    payload: VersionCreate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.publish")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    if design.status != "published":
        raise HTTPException(status_code=409, detail="Only published catalogue designs can be unpublished.")

    design.status = "draft"
    design.revision += 1
    design.updated_by_id = actor.id
    catalogue = _unpublish_design_catalogue(db, design, actor)
    _audit(db, request, actor, "catalogue_design_unpublished", str(design.id), {
        "catalogue_id": str(catalogue.id) if catalogue else None,
        "change_summary": payload.change_summary or "Unpublished from Catalogue Studio",
    })
    db.commit()
    return _design(db, design.id)


@router.post("/designs/{design_id}/validate", response_model=StudioValidateResponse)
def validate_design(
    design_id: uuid.UUID,
    actor: User = Depends(require_permission("catalogue_studio.preview")),
    db: Session = Depends(get_db),
):
    errors, warnings = validate_design_for_publish(db, _design(db, design_id), actor)
    return StudioValidateResponse(valid=not errors, errors=errors, warnings=warnings)


@router.put("/designs/{design_id}/configuration", response_model=DesignResponse)
def update_design_configuration(
    design_id: uuid.UUID,
    payload: DesignConfigurationUpdate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_studio.edit")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    validate_brand_access(db, actor, payload.brand_ids, multiple=payload.brand_mode == "multiple")
    validate_price_access(db, actor, [slot.price_list_id for slot in payload.price_slots if slot.price_list_id is not None])
    used_brand_names = set(db.scalars(select(Product.brand).where(
        Product.id.in_([item.product_id for item in design.product_items]), Product.brand.is_not(None)
    ))) if design.product_items else set()
    selected_names = set(db.scalars(select(Brand.name).where(Brand.id.in_(payload.brand_ids)))) if payload.brand_ids else set()
    removed_used = used_brand_names - selected_names
    if removed_used:
        raise HTTPException(status_code=409, detail={"message": "Products from removed brands are still used in this design.", "brands": sorted(removed_used)})
    design.brand_mode = payload.brand_mode
    for row in list(design.selected_brands): db.delete(row)
    for row in list(design.price_slots): db.delete(row)
    db.flush()
    for index, brand_id in enumerate(dict.fromkeys(payload.brand_ids), start=1):
        db.add(CatalogueDesignBrand(design_id=design.id, brand_id=brand_id, display_order=index))
    for slot in payload.price_slots:
        db.add(CatalogueDesignPriceSlot(design_id=design.id, **slot.model_dump()))
    if payload.promotion:
        design.catalogue_type = "promotion"
        design.promotion_name = payload.promotion.promotion_name
        design.promotion_occasion_id = payload.promotion.occasion_id
        design.start_at = payload.promotion.start_at
        design.end_at = payload.promotion.end_at
        design.timezone = payload.promotion.timezone
        design.promotion_priority = payload.promotion.priority
        design.promotion_terms = payload.promotion.terms
        if design.promotion_status in {"approved", "scheduled", "active"}:
            design.promotion_status = "pending_review"
    design.revision += 1; design.updated_by_id = actor.id
    _ensure_design_catalogue_projection(db, design, actor)
    _audit(db, request, actor, "catalogue_design_configuration_changed", str(design.id), {"brand_count": len(payload.brand_ids), "price_slot_count": len(payload.price_slots)})
    db.commit(); return _design(db, design.id)


@router.put("/designs/{design_id}/products", response_model=DesignResponse)
def update_design_products(
    design_id: uuid.UUID,
    payload: DesignProductsUpdate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_studio.manage_elements")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id); _check_revision(design, payload.expected_revision)
    ids = [item.product_id for item in payload.products]
    products = {row.id: row for row in db.scalars(select(Product).where(Product.id.in_(ids)))} if ids else {}
    if len(products) != len(ids):
        raise HTTPException(status_code=404, detail="One or more products were not found.")
    if any(product.status != "active" for product in products.values()):
        raise HTTPException(status_code=422, detail="Inactive products cannot be selected for a catalogue.")
    allowed = {row.id for row in selectable_products(db, design, actor, brand_ids=[item.brand_id for item in design.selected_brands])}
    if any(product_id not in allowed for product_id in ids):
        raise HTTPException(status_code=403, detail="One or more products are outside the selected brand or user scope.")
    for row in list(design.product_items):
        db.delete(row)
    db.flush()
    for index, item in enumerate(payload.products, start=1):
        db.add(CatalogueDesignProduct(
            design_id=design.id,
            product_id=item.product_id,
            display_order=index,
            is_visible=item.is_visible,
            selected_video_id=item.selected_video_id,
        ))
    design.revision += 1; design.updated_by_id = actor.id
    _ensure_design_catalogue_projection(db, design, actor)
    _audit(db, request, actor, "catalogue_design_products_changed", str(design.id), {"product_count": len(ids)})
    db.commit(); return _design(db, design.id)


@router.patch("/designs/{design_id}/products/{product_id}/visibility", response_model=DesignResponse)
def update_product_visibility(
    design_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: DesignProductVisibilityUpdate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_studio.edit")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id); _check_revision(design, payload.expected_revision)
    item = next((row for row in design.product_items if row.product_id == product_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Catalogue product item not found.")
    if payload.is_visible and db.scalar(select(Product.status).where(Product.id == product_id)) != "active":
        raise HTTPException(status_code=422, detail="Inactive products cannot be made visible.")
    item.is_visible = payload.is_visible; item.hidden_reason = "" if payload.is_visible else "Hidden in this catalogue"
    design.revision += 1; design.updated_by_id = actor.id
    _ensure_design_catalogue_projection(db, design, actor)
    _audit(db, request, actor, "catalogue_design_product_visibility_changed", str(design.id), {"product_id": str(product_id), "is_visible": payload.is_visible})
    db.commit(); return _design(db, design.id)


@router.post("/designs/{design_id}/promotion/{action}", response_model=DesignResponse)
def transition_promotion(
    design_id: uuid.UUID,
    action: str,
    payload: PromotionActionPayload,
    request: Request,
    actor: User = Depends(require_permission("promotion_catalogues.view")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, payload.expected_revision)
    if design.catalogue_type != "promotion":
        raise HTTPException(status_code=422, detail="This is not a promotion catalogue.")
    permission_by_action = {
        "submit": "promotion_catalogues.edit",
        "approve": "promotion_catalogues.approve",
        "schedule": "promotion_catalogues.schedule",
        "pause": "promotion_catalogues.pause",
        "cancel": "promotion_catalogues.cancel",
    }
    permission = permission_by_action.get(action)
    if not permission:
        raise HTTPException(status_code=404, detail="Promotion action not found.")
    if not is_superadmin(actor) and not has_permission(actor, permission):
        raise HTTPException(status_code=403, detail=f"Permission required: {permission}")
    transitions = {
        "submit": ({"draft", "paused"}, "pending_review"),
        "approve": ({"pending_review"}, "approved"),
        "schedule": ({"approved"}, "scheduled"),
        "pause": ({"scheduled", "active"}, "paused"),
        "cancel": ({"draft", "pending_review", "approved", "scheduled", "active", "paused"}, "cancelled"),
    }
    allowed_from, target = transitions[action]
    if design.promotion_status not in allowed_from:
        raise HTTPException(status_code=409, detail=f"Promotion cannot be {action}ed from {design.promotion_status or 'unset'} status.")
    if action in {"approve", "schedule"} and (not design.start_at or not design.end_at or design.end_at <= design.start_at):
        raise HTTPException(status_code=422, detail="Promotion end date must be later than its start date.")
    design.promotion_status = target
    design.revision += 1
    design.updated_by_id = actor.id
    _ensure_design_catalogue_projection(db, design, actor)
    _audit(db, request, actor, f"promotion_catalogue_{action}", str(design.id), {"status": target})
    db.commit()
    return _design(db, design.id)


@router.get("/templates", response_model=list[TemplateResponse])
def list_templates(
    template_type: str | None = None,
    actor: User = Depends(require_permission("templates.view")),
    db: Session = Depends(get_db),
):
    ensure_system_catalogue_templates(db)
    statement = select(CatalogueTemplate).where(CatalogueTemplate.deleted_at.is_(None), CatalogueTemplate.is_active.is_(True))
    if not is_superadmin(actor):
        statement = statement.where(or_(
            CatalogueTemplate.owner_user_id == actor.id,
            (CatalogueTemplate.is_company_template.is_(True)) & (CatalogueTemplate.approval_status == "approved"),
        ))
    if template_type:
        statement = statement.where(CatalogueTemplate.template_type == template_type)
    return list(db.scalars(statement.order_by(CatalogueTemplate.updated_at.desc())))


@router.post("/templates", response_model=TemplateResponse, status_code=201)
def create_template(payload: TemplatePayload, request: Request, actor: User = Depends(require_permission("templates.create")), db: Session = Depends(get_db)):
    item = CatalogueTemplate(
        template_type=payload.template_type, name=payload.name, description=payload.description,
        template_data_json=payload.template_data, brand_id=payload.brand_id,
        owner_user_id=actor.id, department_id=payload.department_id, team_id=payload.team_id,
        brand_scope_json=payload.brand_scope, category_scope_json=payload.category_scope,
        visibility_scope=payload.visibility_scope, tags=payload.tags,
    )
    db.add(item); db.flush()
    _audit(db, request, actor, "catalogue_template_created", str(item.id), {"type": item.template_type})
    db.commit(); db.refresh(item)
    return item


def _template_for_actor(db: Session, template_id: uuid.UUID, actor: User) -> CatalogueTemplate:
    item = db.get(CatalogueTemplate, template_id)
    if not item or item.deleted_at or (not is_superadmin(actor) and item.owner_user_id != actor.id and not has_permission(actor, "catalogue_templates.edit_all")):
        raise HTTPException(status_code=404, detail="Catalogue template not found.")
    return item


@router.patch("/templates/{template_id}", response_model=TemplateResponse)
def update_template(template_id: uuid.UUID, payload: TemplatePayload, request: Request, actor: User = Depends(require_permission("templates.edit")), db: Session = Depends(get_db)):
    item = _template_for_actor(db, template_id, actor)
    item.template_type = payload.template_type; item.name = payload.name; item.description = payload.description
    item.template_data_json = payload.template_data; item.brand_id = payload.brand_id
    item.department_id = payload.department_id; item.team_id = payload.team_id
    item.brand_scope_json = payload.brand_scope; item.category_scope_json = payload.category_scope
    item.visibility_scope = payload.visibility_scope; item.tags = payload.tags; item.version += 1
    if item.is_company_template:
        item.approval_status = "pending"
        item.approved_by_id = None; item.approved_at = None
    _audit(db, request, actor, "catalogue_template_updated", str(item.id), {"version": item.version})
    db.commit(); db.refresh(item)
    return item


@router.post("/templates/{template_id}/duplicate", response_model=TemplateResponse, status_code=201)
def duplicate_template(template_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("templates.create")), db: Session = Depends(get_db)):
    source = _template_for_actor(db, template_id, actor)
    item = CatalogueTemplate(template_type=source.template_type, name=f"{source.name} copy", description=source.description, template_data_json=json.loads(json.dumps(source.template_data_json)), brand_id=source.brand_id, owner_user_id=actor.id, department_id=source.department_id, team_id=source.team_id, brand_scope_json=list(source.brand_scope_json), category_scope_json=list(source.category_scope_json), visibility_scope="private", tags=list(source.tags))
    db.add(item); db.flush(); _audit(db, request, actor, "catalogue_template_duplicated", str(item.id), {"source_template_id": str(source.id)}); db.commit(); db.refresh(item)
    return item


@router.delete("/templates/{template_id}", status_code=204)
def delete_template(template_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("templates.delete")), db: Session = Depends(get_db)):
    item = db.get(CatalogueTemplate, template_id)
    if not item or item.deleted_at or (not is_superadmin(actor) and item.owner_user_id != actor.id and not has_permission(actor, "catalogue_templates.delete_all")):
        raise HTTPException(status_code=404, detail="Catalogue template not found.")
    if item.usage_count:
        raise HTTPException(status_code=409, detail="Archive this template because it is already used by catalogue designs.")
    item.deleted_at = datetime.now(UTC); item.is_active = False
    _audit(db, request, actor, "catalogue_template_deleted", str(item.id)); db.commit()


@router.get("/templates/{template_id}", response_model=TemplateResponse)
def get_template(template_id: uuid.UUID, actor: User = Depends(require_permission("templates.view")), db: Session = Depends(get_db)):
    item = db.get(CatalogueTemplate, template_id)
    if not item or item.deleted_at or not _template_can_view(item, actor):
        raise HTTPException(status_code=404, detail="Catalogue template not found.")
    return item


def _render_visual_template_pages(
    raw: bytes,
    media_type: str,
    *,
    cover_only: bool,
) -> list[tuple[bytes, int, int]]:
    """Normalize uploaded artwork into safe PNG pages for Studio templates."""
    if media_type == "application/pdf":
        try:
            document = fitz.open(stream=raw, filetype="pdf")
            if document.needs_pass:
                raise HTTPException(status_code=422, detail="Password-protected PDFs are not supported.")
            if document.page_count < 1:
                raise HTTPException(status_code=422, detail="The PDF does not contain any pages.")
            if document.page_count > 40:
                raise HTTPException(status_code=422, detail="PDF templates may contain no more than 40 pages.")
            output: list[tuple[bytes, int, int]] = []
            page_count = 1 if cover_only else document.page_count
            for index in range(page_count):
                page = document.load_page(index)
                largest_side = max(float(page.rect.width), float(page.rect.height), 1)
                zoom = min(2.0, max(0.25, 1800 / largest_side))
                pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
                output.append((pixmap.tobytes("png"), pixmap.width, pixmap.height))
            return output
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(status_code=422, detail="The PDF is damaged or unreadable.") from error

    try:
        with Image.open(io.BytesIO(raw)) as uploaded:
            normalized = ImageOps.exif_transpose(uploaded)
            normalized.thumbnail((2400, 2400), Image.Resampling.LANCZOS)
            if normalized.mode not in {"RGB", "RGBA"}:
                normalized = normalized.convert("RGBA" if "transparency" in normalized.info else "RGB")
            buffer = io.BytesIO()
            normalized.save(buffer, format="PNG", optimize=True)
            return [(buffer.getvalue(), normalized.width, normalized.height)]
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise HTTPException(status_code=422, detail="The image is damaged or unreadable.") from error


def _store_visual_template_asset(
    db: Session,
    actor: User,
    content: bytes,
    width: int,
    height: int,
    source_name: str,
    page_number: int,
) -> tuple[DesignAsset, bool]:
    checksum = hashlib.sha256(content).hexdigest()
    existing = db.scalar(select(DesignAsset).where(
        DesignAsset.owner_user_id == actor.id,
        DesignAsset.checksum == checksum,
        DesignAsset.deleted_at.is_(None),
    ))
    if existing:
        return existing, False
    safe_stem = "".join(
        character if character.isalnum() or character in "-_" else "-"
        for character in Path(source_name).stem
    ).strip("-")[:70] or "template"
    storage_key = f"design-assets/{actor.id}/{uuid.uuid4().hex}-{safe_stem}-page-{page_number}.png"
    target = cover_storage.resolve(storage_key)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    asset = DesignAsset(
        owner_user_id=actor.id,
        asset_type="template_background",
        storage_key=storage_key,
        original_filename=f"{safe_stem}-page-{page_number}.png",
        mime_type="image/png",
        file_size=len(content),
        width=width,
        height=height,
        checksum=checksum,
        alt_text=f"{Path(source_name).stem} page {page_number}",
        tags=["template-import"],
    )
    db.add(asset)
    db.flush()
    return asset, True


def _visual_template_document(
    asset: DesignAsset,
    *,
    page_number: int,
    page_count: int,
    template_type: str,
) -> dict:
    is_cover = template_type == "cover" or page_number == 1
    page_type = "cover" if is_cover else "free_layout"
    page_name = "Cover" if is_cover else f"Page {page_number}"
    orientation = "landscape" if (asset.width or 0) > (asset.height or 0) else "portrait"
    width, height, orientation, _ = _a4_geometry(orientation)
    page_id = str(uuid.uuid4())
    document = {
        "pageId": page_id,
        "pageType": page_type,
        "name": page_name,
        "canvas": {
            "width": width,
            "height": height,
            "backgroundColor": "#FFFFFF",
            "gridSize": 10,
            "showGrid": False,
            "showGuides": True,
            "showSafeArea": True,
            "bleed": 0,
        },
        "elements": [{
            "id": f"imported-artwork-{page_number}",
            "type": "image",
            "name": f"Imported artwork {page_number}" if page_count > 1 else "Imported artwork",
            "xPercent": 0,
            "yPercent": 0,
            "widthPercent": 100,
            "heightPercent": 100,
            "rotation": 0,
            "opacity": 1,
            "zIndex": 0,
            "locked": True,
            "visible": True,
            "assetId": str(asset.id),
            "style": {
                "objectFit": "contain",
                "sourceMimeType": "image/png",
                "sourceFileName": asset.original_filename,
            },
            "responsive": {},
        }],
        "dataMode": "snapshot",
    }
    validated = PageDocument.model_validate(document).model_dump(mode="json")
    return {
        "pageName": page_name,
        "pageType": page_type,
        "displayOrder": page_number,
        "width": width,
        "height": height,
        "orientation": orientation,
        "backgroundColor": "#FFFFFF",
        "isVisible": True,
        "isLocked": False,
        "pageData": validated,
    }


@router.post("/templates/import", response_model=TemplateResponse, status_code=201)
async def import_template(
    request: Request,
    file: UploadFile = File(...),
    template_type: str = Form(default="catalogue"),
    actor: User = Depends(require_permission("catalogue_templates.upload")),
    db: Session = Depends(get_db),
):
    requested_type = template_type.casefold().strip()
    if requested_type not in {"catalogue", "cover"}:
        raise HTTPException(status_code=422, detail="Choose Catalogue or Cover as the template type.")
    original_filename = Path(file.filename or "template").name
    filename = original_filename.casefold()
    declared_media_type = (file.content_type or "").split(";", 1)[0].casefold()
    suffix = Path(filename).suffix
    is_catalogue_template = filename.endswith(CATALOGUE_TEMPLATE_EXTENSION)
    is_legacy_json = filename.endswith(".json") and declared_media_type in {"application/json", "text/json"}
    visual_media_type = next(
        (
            media_type
            for media_type, extensions in VISUAL_TEMPLATE_TYPES.items()
            if suffix in extensions
            and declared_media_type in {media_type, "application/octet-stream", ""}
        ),
        None,
    )
    if not is_catalogue_template and not is_legacy_json and not visual_media_type:
        raise HTTPException(status_code=415, detail="Upload a PDF, PNG, JPG, WebP, or GMS Template file.")
    raw = await file.read(MAX_TEMPLATE_UPLOAD_BYTES + 1)
    if len(raw) > MAX_TEMPLATE_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Template files may not exceed 20 MB.")
    if not raw:
        raise HTTPException(status_code=422, detail="The uploaded file is empty.")

    if is_catalogue_template or is_legacy_json:
        try:
            decoded = json.loads(raw.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise HTTPException(status_code=422, detail="The Catalogue Template file is damaged or unreadable.") from error
        if not isinstance(decoded, dict) or decoded.get("format") != "gms-catalogue-studio" or decoded.get("schema_version") != 1:
            raise HTTPException(status_code=422, detail="Unsupported template format or schema version.")
        payload = TemplatePayload.model_validate(decoded.get("template"))
        if requested_type == "cover" and payload.template_type != "cover":
            raise HTTPException(status_code=422, detail="Choose a cover template exported from Catalogue Studio.")
        item = CatalogueTemplate(
            template_type=payload.template_type, name=payload.name, description=payload.description,
            template_data_json=payload.template_data, brand_id=payload.brand_id, owner_user_id=actor.id,
            department_id=payload.department_id, team_id=payload.team_id,
            brand_scope_json=payload.brand_scope, category_scope_json=payload.category_scope,
            visibility_scope="private", tags=payload.tags,
        )
        db.add(item); db.flush()
        _audit(db, request, actor, "catalogue_template_uploaded", str(item.id), {"schema_version": 1})
        db.commit(); db.refresh(item)
        return item

    rendered_pages = _render_visual_template_pages(
        raw,
        visual_media_type,
        cover_only=requested_type == "cover",
    )
    created_storage_keys: list[str] = []
    try:
        assets: list[DesignAsset] = []
        for page_number, (content, width, height) in enumerate(rendered_pages, start=1):
            asset, created = _store_visual_template_asset(
                db,
                actor,
                content,
                width,
                height,
                original_filename,
                page_number,
            )
            assets.append(asset)
            if created:
                created_storage_keys.append(asset.storage_key)
        pages = [
            _visual_template_document(
                asset,
                page_number=index,
                page_count=len(assets),
                template_type=requested_type,
            )
            for index, asset in enumerate(assets, start=1)
        ]
        name = " ".join(Path(original_filename).stem.replace("_", " ").replace("-", " ").split())[:180] or "Imported template"
        item = CatalogueTemplate(
            template_type=requested_type,
            name=name,
            description=(
                "Editable cover created from uploaded artwork."
                if requested_type == "cover"
                else f"Editable {len(pages)}-page template created from uploaded artwork."
            ),
            thumbnail_storage_key=assets[0].storage_key,
            template_data_json={
                "pages": pages,
                "source": {
                    "kind": "uploaded_artwork",
                    "fileName": original_filename,
                    "mimeType": visual_media_type,
                },
            },
            owner_user_id=actor.id,
            brand_scope_json=[],
            category_scope_json=[],
            visibility_scope="private",
            tags=["uploaded-artwork"],
        )
        db.add(item); db.flush()
        _audit(db, request, actor, "catalogue_template_uploaded", str(item.id), {
            "file_type": visual_media_type,
            "page_count": len(pages),
        })
        db.commit(); db.refresh(item)
        return item
    except Exception:
        db.rollback()
        for storage_key in created_storage_keys:
            cover_storage.delete(storage_key)
        raise


@router.get("/templates/{template_id}/export")
def export_template(template_id: uuid.UUID, actor: User = Depends(require_permission("templates.view")), db: Session = Depends(get_db)):
    item = db.get(CatalogueTemplate, template_id)
    if not item or item.deleted_at or not _template_can_view(item, actor):
        raise HTTPException(status_code=404, detail="Catalogue template not found.")
    envelope = {"format": "gms-catalogue-studio", "schema_version": 1, "template": {
        "template_type": item.template_type, "name": item.name, "description": item.description,
        "template_data": item.template_data_json, "brand_id": item.brand_id,
        "department_id": item.department_id, "team_id": item.team_id,
        "brand_scope": item.brand_scope_json, "category_scope": item.category_scope_json,
        "visibility_scope": "private", "tags": item.tags,
    }}
    return JSONResponse(
        envelope,
        media_type=CATALOGUE_TEMPLATE_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="catalogue-template-{item.id}{CATALOGUE_TEMPLATE_EXTENSION}"'},
    )


@router.post("/templates/{template_id}/submit", response_model=TemplateResponse)
def submit_template(template_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("templates.edit")), db: Session = Depends(get_db)):
    item = _template_for_actor(db, template_id, actor)
    item.is_company_template = True; item.approval_status = "pending"
    _audit(db, request, actor, "catalogue_template_submitted", str(item.id)); db.commit(); db.refresh(item)
    return item


@router.post("/templates/{template_id}/approve", response_model=TemplateResponse)
def approve_template(template_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("catalogue_templates.approve")), db: Session = Depends(get_db)):
    item = db.get(CatalogueTemplate, template_id)
    if not item or item.deleted_at:
        raise HTTPException(status_code=404, detail="Catalogue template not found.")
    item.is_company_template = True; item.approval_status = "approved"
    item.approved_by_id = actor.id; item.approved_at = datetime.now(UTC); item.visibility_scope = "company"
    _audit(db, request, actor, "catalogue_template_approved", str(item.id)); db.commit(); db.refresh(item)
    return item


# Public contract aliases retained separately from the internal Studio library
# routes so third-party integrations do not depend on the editor's URL layout.
@studio_compat_router.get("/catalogue-templates", response_model=list[TemplateResponse])
def list_catalogue_templates_alias(template_type: str | None = None, actor: User = Depends(require_permission("catalogue_templates.view")), db: Session = Depends(get_db)):
    return list_templates(template_type, actor, db)


@studio_compat_router.post("/catalogue-templates", response_model=TemplateResponse, status_code=201)
def create_catalogue_template_alias(payload: TemplatePayload, request: Request, actor: User = Depends(require_permission("catalogue_templates.create")), db: Session = Depends(get_db)):
    return create_template(payload, request, actor, db)


@studio_compat_router.post("/catalogue-templates/import", response_model=TemplateResponse, status_code=201)
async def import_catalogue_template_alias(request: Request, file: UploadFile = File(...), actor: User = Depends(require_permission("catalogue_templates.upload")), db: Session = Depends(get_db)):
    return await import_template(
        request=request,
        file=file,
        template_type="catalogue",
        actor=actor,
        db=db,
    )


@studio_compat_router.get("/catalogue-templates/{template_id}", response_model=TemplateResponse)
def get_catalogue_template_alias(template_id: uuid.UUID, actor: User = Depends(require_permission("catalogue_templates.view")), db: Session = Depends(get_db)):
    return get_template(template_id, actor, db)


@studio_compat_router.patch("/catalogue-templates/{template_id}", response_model=TemplateResponse)
def update_catalogue_template_alias(template_id: uuid.UUID, payload: TemplatePayload, request: Request, actor: User = Depends(require_permission("catalogue_templates.edit_own")), db: Session = Depends(get_db)):
    return update_template(template_id, payload, request, actor, db)


@studio_compat_router.delete("/catalogue-templates/{template_id}", status_code=204)
def delete_catalogue_template_alias(template_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("catalogue_templates.delete_own")), db: Session = Depends(get_db)):
    return delete_template(template_id, request, actor, db)


@studio_compat_router.post("/catalogue-templates/{template_id}/duplicate", response_model=TemplateResponse, status_code=201)
def duplicate_catalogue_template_alias(template_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("catalogue_templates.create")), db: Session = Depends(get_db)):
    return duplicate_template(template_id, request, actor, db)


@studio_compat_router.get("/catalogue-templates/{template_id}/export")
def export_catalogue_template_alias(template_id: uuid.UUID, actor: User = Depends(require_permission("catalogue_templates.view")), db: Session = Depends(get_db)):
    return export_template(template_id, actor, db)


@studio_compat_router.post("/catalogue-templates/{template_id}/approve", response_model=TemplateResponse)
def approve_catalogue_template_alias(template_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("catalogue_templates.approve")), db: Session = Depends(get_db)):
    return approve_template(template_id, request, actor, db)


@router.get("/product-card-templates", response_model=list[ProductCardTemplateResponse])
def list_product_card_templates(_: User = Depends(require_permission("product_card_templates.view")), db: Session = Depends(get_db)):
    return list(db.scalars(select(ProductCardTemplate).where(ProductCardTemplate.is_active.is_(True)).order_by(ProductCardTemplate.updated_at.desc())))


@router.post("/product-card-templates", response_model=ProductCardTemplateResponse, status_code=201)
def create_product_card_template(payload: ProductCardTemplatePayload, request: Request, actor: User = Depends(require_permission("product_card_templates.create")), db: Session = Depends(get_db)):
    item = ProductCardTemplate(
        name=payload.name, description=payload.description, template_data_json=payload.template_data,
        card_width=payload.card_width, card_height=payload.card_height,
        border_radius=payload.border_radius, created_by_id=actor.id, updated_by_id=actor.id,
    )
    db.add(item); db.flush()
    _audit(db, request, actor, "product_card_template_created", str(item.id))
    db.commit(); db.refresh(item)
    return item


@router.patch("/product-card-templates/{template_id}", response_model=ProductCardTemplateResponse)
def update_product_card_template(template_id: uuid.UUID, payload: ProductCardTemplatePayload, request: Request, actor: User = Depends(require_permission("product_card_templates.edit")), db: Session = Depends(get_db)):
    item = db.get(ProductCardTemplate, template_id)
    if not item or not item.is_active or (not is_superadmin(actor) and item.created_by_id != actor.id):
        raise HTTPException(status_code=404, detail="Product card template not found.")
    item.name = payload.name; item.description = payload.description; item.template_data_json = payload.template_data
    item.card_width = payload.card_width; item.card_height = payload.card_height; item.border_radius = payload.border_radius; item.updated_by_id = actor.id
    _audit(db, request, actor, "product_card_template_updated", str(item.id)); db.commit(); db.refresh(item)
    return item


@router.delete("/product-card-templates/{template_id}", status_code=204)
def delete_product_card_template(template_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("product_card_templates.delete")), db: Session = Depends(get_db)):
    item = db.get(ProductCardTemplate, template_id)
    if not item or not item.is_active or (not is_superadmin(actor) and item.created_by_id != actor.id):
        raise HTTPException(status_code=404, detail="Product card template not found.")
    item.is_active = False; item.updated_by_id = actor.id
    _audit(db, request, actor, "product_card_template_deleted", str(item.id)); db.commit()


def _asset_response(asset: DesignAsset) -> AssetResponse:
    return AssetResponse(
        id=asset.id, asset_type=asset.asset_type, original_filename=asset.original_filename,
        mime_type=asset.mime_type, file_size=asset.file_size, width=asset.width, height=asset.height,
        alt_text=asset.alt_text, tags=asset.tags,
        url=f"/api/v1/catalogue-studio/assets/{asset.id}/content", created_at=asset.created_at,
    )


@router.post("/designs/{design_id}/online-cover", response_model=DesignResponse)
async def save_online_cover(
    design_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    expected_revision: int = Form(..., ge=1),
    actor: User = Depends(require_permission("catalogue_designs.edit")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    _check_revision(design, expected_revision)
    validate_brand_access(db, actor, [row.brand_id for row in design.selected_brands], multiple=False)
    suffixes = {"image/png": {".png"}, "image/jpeg": {".jpg", ".jpeg"}, "image/webp": {".webp"}}
    if file.content_type not in suffixes or Path(file.filename or "").suffix.lower() not in suffixes[file.content_type]:
        raise HTTPException(status_code=422, detail="Upload a PNG, JPG or WebP cover image.")
    content = await file.read(20 * 1024 * 1024 + 1)
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Cover image must be 20 MB or smaller.")
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format != {"image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WEBP"}[file.content_type]:
                raise ValueError("Image format does not match its file type")
            image.verify()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(status_code=422, detail="This image could not be read. Choose a valid PNG, JPG or WebP image.")
    await file.seek(0)
    stored = await cover_storage.save_design_asset(file, owner_id=actor.id)
    asset = db.scalar(select(DesignAsset).where(DesignAsset.owner_user_id == actor.id, DesignAsset.checksum == stored.checksum))
    if asset:
        if cover_storage.resolve(asset.storage_key).is_file():
            cover_storage.delete(stored.storage_key)
        else:
            asset.storage_key = stored.storage_key
        asset.deleted_at = None
    else:
        asset = DesignAsset(owner_user_id=actor.id, asset_type="online_cover", storage_key=stored.storage_key,
            original_filename=stored.original_filename, mime_type=stored.mime_type, file_size=stored.file_size,
            width=stored.width, height=stored.height, checksum=stored.checksum, alt_text=f"{design.name} cover")
        db.add(asset)
        db.flush()
    design.revision += 1
    design.updated_by_id = actor.id
    design.online_cover_json = {"asset_id": str(asset.id), "file_name": asset.original_filename,
        "width": asset.width, "height": asset.height,
        "url": f"/api/v1/catalogue-studio/designs/{design.id}/online-cover/content?revision={design.revision}"}
    _audit(db, request, actor, "studio_online_cover_saved", str(design.id), {"asset_id": str(asset.id)})
    db.commit()
    return _design(db, design.id)


@router.delete("/designs/{design_id}/online-cover", response_model=DesignResponse)
def remove_online_cover(design_id: uuid.UUID, request: Request, expected_revision: int = Query(..., ge=1),
    actor: User = Depends(require_permission("catalogue_designs.edit")), db: Session = Depends(get_db)):
    design = _design(db, design_id)
    _check_revision(design, expected_revision)
    validate_brand_access(db, actor, [row.brand_id for row in design.selected_brands], multiple=False)
    design.online_cover_json = None
    design.revision += 1
    design.updated_by_id = actor.id
    # Retain assets referenced by prior immutable versions.
    _audit(db, request, actor, "studio_online_cover_removed", str(design.id))
    db.commit()
    return _design(db, design.id)


@router.get("/designs/{design_id}/online-cover/content")
def online_cover_content(design_id: uuid.UUID, actor: User = Depends(require_permission("catalogue_designs.view")), db: Session = Depends(get_db)):
    design = _design(db, design_id)
    validate_brand_access(db, actor, [row.brand_id for row in design.selected_brands], multiple=False)
    cover = design.online_cover_json
    asset = db.get(DesignAsset, uuid.UUID(cover["asset_id"])) if cover else None
    if not asset or asset.deleted_at:
        raise HTTPException(status_code=404, detail="Online cover not found.")
    path = cover_storage.resolve(asset.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Online cover file is unavailable.")
    return FileResponse(path, media_type=asset.mime_type, content_disposition_type="inline", headers={"Cache-Control": "private, no-store"})


@router.get("/assets", response_model=list[AssetResponse])
def list_assets(asset_type: str | None = None, actor: User = Depends(require_permission("design_media.view")), db: Session = Depends(get_db)):
    statement = select(DesignAsset).where(DesignAsset.deleted_at.is_(None))
    if not is_superadmin(actor):
        statement = statement.where(DesignAsset.owner_user_id == actor.id)
    if asset_type:
        statement = statement.where(DesignAsset.asset_type == asset_type)
    return [_asset_response(item) for item in db.scalars(statement.order_by(DesignAsset.created_at.desc()))]


@router.post("/assets", response_model=AssetResponse, status_code=201)
async def upload_asset(
    request: Request,
    asset_type: str = Query(default="user_upload", max_length=40),
    alt_text: str = Query(default="", max_length=320),
    file: UploadFile = File(...),
    actor: User = Depends(require_permission("design_media.upload")),
    db: Session = Depends(get_db),
):
    stored = await cover_storage.save_design_asset(file, owner_id=actor.id)
    existing = db.scalar(select(DesignAsset).where(
        DesignAsset.owner_user_id == actor.id,
        DesignAsset.checksum == stored.checksum,
        DesignAsset.deleted_at.is_(None),
    ))
    if existing:
        cover_storage.delete(stored.storage_key)
        return _asset_response(existing)
    item = DesignAsset(
        owner_user_id=actor.id, asset_type=asset_type, storage_key=stored.storage_key,
        original_filename=stored.original_filename, mime_type=stored.mime_type,
        file_size=stored.file_size, width=stored.width, height=stored.height,
        duration_seconds=int(stored.duration_seconds) if stored.duration_seconds else None,
        checksum=stored.checksum, alt_text=alt_text,
    )
    db.add(item); db.flush()
    _audit(db, request, actor, "design_asset_uploaded", str(item.id), {"type": asset_type})
    db.commit(); db.refresh(item)
    return _asset_response(item)


@router.get("/assets/{asset_id}/content")
def asset_content(
    asset_id: uuid.UUID,
    download: bool = False,
    actor: User = Depends(require_permission("design_media.view")),
    db: Session = Depends(get_db),
):
    asset = db.get(DesignAsset, asset_id)
    if not asset or asset.deleted_at or (not is_superadmin(actor) and asset.owner_user_id != actor.id):
        raise HTTPException(status_code=404, detail="Design asset not found.")
    path = cover_storage.resolve(asset.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Design asset file is unavailable.")
    return FileResponse(
        path,
        media_type=asset.mime_type,
        filename=asset.original_filename,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.delete("/assets/{asset_id}", status_code=204)
def delete_asset(asset_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("design_media.delete")), db: Session = Depends(get_db)):
    asset = db.get(DesignAsset, asset_id)
    if not asset or asset.deleted_at or (not is_superadmin(actor) and asset.owner_user_id != actor.id):
        raise HTTPException(status_code=404, detail="Design asset not found.")
    identifier = str(asset.id)
    for cover in db.scalars(select(CatalogueDesign.online_cover_json).where(CatalogueDesign.deleted_at.is_(None))):
        if cover and cover.get("asset_id") == identifier:
            raise HTTPException(status_code=409, detail="This asset is used as an online catalogue cover and cannot be deleted.")
    # Permanent snapshots are immutable and must never be left with a broken
    # media reference. JSON is inspected in Python for SQLite/PostgreSQL parity.
    for snapshot in db.scalars(select(CatalogueDesignVersion.snapshot_json)):
        if identifier in json.dumps(snapshot, ensure_ascii=False):
            raise HTTPException(status_code=409, detail="This asset is used by a saved or published catalogue version and cannot be deleted.")
    asset.deleted_at = datetime.now(UTC)
    _audit(db, request, actor, "design_asset_deleted", str(asset.id))
    db.commit()


@router.post("/designs/{design_id}/exports", response_model=ExportJobResponse, status_code=202)
def create_export_job(
    design_id: uuid.UUID,
    payload: ExportJobCreate,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    design = _design(db, design_id)
    if payload.export_type in {"pdf", "print_pdf", "web_pdf", "png", "jpeg"}:
        errors, warnings = validate_design_for_publish(db, design, actor)
        blocking = [error for error in errors if "Inactive" in error or "inactive" in error or "price" in error.casefold()]
        if blocking:
            raise HTTPException(status_code=422, detail={"message": "Export validation failed.", "errors": blocking, "warnings": warnings})
    permission = (
        "catalogue_designs.export_images"
        if payload.export_type in {"png", "jpeg"}
        else "catalogue_designs.export_templates"
        if payload.export_type == "template"
        else "catalogue_designs.export_pdf"
    )
    if not has_permission(actor, permission):
        raise HTTPException(status_code=403, detail=f"Permission required: {permission}")
    version_id = payload.version_id
    if payload.export_type != "template":
        if version_id is not None:
            version = db.scalar(select(CatalogueDesignVersion).where(
                CatalogueDesignVersion.id == version_id,
                CatalogueDesignVersion.design_id == design.id,
            ))
            if not version:
                raise HTTPException(status_code=404, detail="Catalogue design version not found.")
        else:
            version = _create_version(db, design, actor, "Automatic export snapshot")
            version_id = version.id
    job = CatalogueExportJob(
        design_id=design.id, version_id=version_id, export_type=payload.export_type,
        options_json=payload.options, requested_by_id=actor.id,
    )
    db.add(job); db.flush()
    if payload.export_type == "template":
        key = f"catalogue-studio/exports/{job.id}{CATALOGUE_TEMPLATE_EXTENSION}"
        path = cover_storage.resolve(key); path.parent.mkdir(parents=True, exist_ok=True)
        envelope = {
            "format": "gms-catalogue-studio",
            "schema_version": 1,
            "template": {
                "template_type": "catalogue",
                "name": design.name,
                "description": f"Editable template exported from {design.name}",
                "template_data": _snapshot(design, db),
                "brand_scope": [item.brand_id for item in design.selected_brands],
                "category_scope": [],
                "visibility_scope": "private",
                "tags": ["catalogue-studio-export"],
            },
        }
        content = json.dumps(envelope, ensure_ascii=False, indent=2).encode("utf-8")
        path.write_bytes(content)
        job.storage_key = key; job.file_size = len(content); job.status = "completed"; job.completed_at = datetime.now(UTC)
    _audit(db, request, actor, "catalogue_design_export_requested", str(design.id), {"export_type": job.export_type})
    db.commit(); db.refresh(job)
    return job


@router.get("/exports", response_model=list[ExportJobResponse])
def list_exports(actor: User = Depends(require_permission("catalogue_designs.view")), db: Session = Depends(get_db)):
    statement = select(CatalogueExportJob)
    if not is_superadmin(actor):
        statement = statement.where(CatalogueExportJob.requested_by_id == actor.id)
    return list(db.scalars(statement.order_by(CatalogueExportJob.created_at.desc()).limit(200)))


@router.get("/exports/{job_id}/content")
def export_content(
    job_id: uuid.UUID,
    actor: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    job = db.get(CatalogueExportJob, job_id)
    if not job or (not is_superadmin(actor) and job.requested_by_id != actor.id):
        raise HTTPException(status_code=404, detail="Catalogue export not found.")
    permission = (
        "catalogue_designs.export_images"
        if job.export_type in {"png", "jpeg"}
        else "catalogue_designs.export_templates"
        if job.export_type == "template"
        else "catalogue_designs.export_pdf"
    )
    if not has_permission(actor, permission):
        raise HTTPException(status_code=403, detail=f"Permission required: {permission}")
    if job.status != "completed" or not job.storage_key:
        raise HTTPException(status_code=409, detail="This export is not ready for download.")
    path = cover_storage.resolve(job.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The exported file is unavailable.")
    extension = path.suffix.lower()
    media_type = {
        ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg", ".json": "application/json",
        CATALOGUE_TEMPLATE_EXTENSION: CATALOGUE_TEMPLATE_MEDIA_TYPE,
    }.get(extension, "application/octet-stream")
    exported_at = job.completed_at or job.created_at
    if exported_at.tzinfo is None:
        exported_at = exported_at.replace(tzinfo=UTC)
    bangkok_timestamp = exported_at.astimezone(ZoneInfo("Asia/Bangkok")).strftime("%Y-%m-%d_%H-%M-%S")
    return FileResponse(
        path,
        media_type=media_type,
        filename=f"catalogue-design-{str(job.design_id)[:8]}-{bangkok_timestamp}{extension}",
    )


@router.post("/exports/{job_id}/retry", response_model=ExportJobResponse, status_code=202)
def retry_export(
    job_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    job = db.get(CatalogueExportJob, job_id)
    if not job or (not is_superadmin(actor) and job.requested_by_id != actor.id):
        raise HTTPException(status_code=404, detail="Catalogue export not found.")
    if job.status != "failed":
        raise HTTPException(status_code=409, detail="Only failed exports can be retried.")
    permission = "catalogue_designs.export_images" if job.export_type in {"png", "jpeg"} else "catalogue_designs.export_templates" if job.export_type == "template" else "catalogue_designs.export_pdf"
    if not has_permission(actor, permission):
        raise HTTPException(status_code=403, detail=f"Permission required: {permission}")
    job.status = "queued"
    job.started_at = None
    job.completed_at = None
    job.error_message = None
    job.storage_key = None
    job.file_size = None
    _audit(db, request, actor, "catalogue_design_export_retried", str(job.design_id), {"job_id": str(job.id), "export_type": job.export_type})
    db.commit()
    db.refresh(job)
    return job


@router.delete("/exports/{job_id}", status_code=204)
def delete_export(
    job_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("catalogue_designs.view")),
    db: Session = Depends(get_db),
):
    job = db.get(CatalogueExportJob, job_id)
    if not job or (not is_superadmin(actor) and job.requested_by_id != actor.id):
        raise HTTPException(status_code=404, detail="Catalogue export not found.")
    if job.status in {"queued", "running"}:
        raise HTTPException(status_code=409, detail="Wait for this export to finish before deleting it.")

    storage_key = job.storage_key
    _audit(
        db,
        request,
        actor,
        "catalogue_design_export_deleted",
        str(job.id),
        {"design_id": str(job.design_id), "export_type": job.export_type, "status": job.status},
    )
    db.delete(job)
    db.commit()
    cover_storage.delete(storage_key)


@router.get("/palettes", response_model=list[PaletteResponse])
def list_palettes(_: User = Depends(require_permission("catalogue_designs.view")), db: Session = Depends(get_db)):
    return list(db.scalars(select(DesignColorPalette).where(DesignColorPalette.is_active.is_(True)).order_by(DesignColorPalette.name)))


@router.post("/palettes", response_model=PaletteResponse, status_code=201)
def create_palette(payload: PalettePayload, request: Request, actor: User = Depends(require_permission("catalogue_designs.edit")), db: Session = Depends(get_db)):
    item = DesignColorPalette(name=payload.name, brand_id=payload.brand_id, colors_json=payload.colors, is_active=payload.is_active, created_by_id=actor.id)
    db.add(item); db.flush(); _audit(db, request, actor, "design_palette_created", str(item.id)); db.commit(); db.refresh(item)
    return item


def _design_for_catalogue(db: Session, catalogue_id: uuid.UUID) -> CatalogueDesign:
    design = db.scalar(select(CatalogueDesign).where(
        CatalogueDesign.catalogue_id == catalogue_id, CatalogueDesign.deleted_at.is_(None)
    ).order_by(CatalogueDesign.updated_at.desc()))
    if not design:
        raise HTTPException(status_code=404, detail="This catalogue does not have a Studio design yet.")
    return _design(db, design.id)


@studio_compat_router.get("/catalogues/{catalogue_id}/studio", response_model=DesignResponse)
def get_catalogue_studio(catalogue_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("catalogue_studio.view")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id)
    _audit(db, request, actor, "catalogue_studio_opened", str(design.id), {"catalogue_id": str(catalogue_id)})
    db.commit()
    return _design_response_with_live_stock(db, design)


@studio_compat_router.put("/catalogues/{catalogue_id}/studio", response_model=DesignResponse)
def update_catalogue_studio(catalogue_id: uuid.UUID, payload: DesignUpdate, request: Request, actor: User = Depends(require_permission("catalogue_studio.edit")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id)
    return update_design(design.id, payload, request, actor, db)


@studio_compat_router.post("/catalogues/{catalogue_id}/studio/autosave", response_model=DesignResponse)
def autosave_catalogue_studio(catalogue_id: uuid.UUID, payload: PageUpdate, request: Request, actor: User = Depends(require_permission("catalogue_studio.autosave")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id)
    page_id = uuid.UUID(payload.page_data.pageId) if payload.page_data and _is_uuid(payload.page_data.pageId) else design.pages[0].id
    return update_page(design.id, page_id, payload, request, actor, db)


def _is_uuid(value: str) -> bool:
    try:
        uuid.UUID(value); return True
    except (TypeError, ValueError):
        return False


@studio_compat_router.post("/catalogues/{catalogue_id}/studio/validate", response_model=StudioValidateResponse)
def validate_catalogue_studio(catalogue_id: uuid.UUID, actor: User = Depends(require_permission("catalogue_studio.preview")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id)
    errors, warnings = validate_design_for_publish(db, design, actor)
    return StudioValidateResponse(valid=not errors, errors=errors, warnings=warnings)


@studio_compat_router.post("/catalogues/{catalogue_id}/studio/preview", response_model=StudioValidateResponse)
def preview_catalogue_studio(catalogue_id: uuid.UUID, actor: User = Depends(require_permission("catalogue_studio.preview")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id)
    errors, warnings = validate_design_for_publish(db, design, actor)
    return StudioValidateResponse(valid=not errors, errors=errors, warnings=warnings)


@studio_compat_router.post("/catalogues/{catalogue_id}/studio/publish", response_model=DesignResponse)
def publish_catalogue_studio(catalogue_id: uuid.UUID, payload: VersionCreate, request: Request, actor: User = Depends(require_permission("catalogue_studio.publish")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id)
    return publish_design(design.id, payload, request, actor, db)


@studio_compat_router.post("/catalogues/{catalogue_id}/studio/unpublish", response_model=DesignResponse)
def unpublish_catalogue_studio(catalogue_id: uuid.UUID, payload: VersionCreate, request: Request, actor: User = Depends(require_permission("catalogue_studio.publish")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id)
    return unpublish_design(design.id, payload, request, actor, db)


@studio_compat_router.post("/catalogues/{catalogue_id}/pages", response_model=PageResponse, status_code=201)
def create_catalogue_studio_page(catalogue_id: uuid.UUID, payload: PageCreate, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_pages")), db: Session = Depends(get_db)):
    return create_page(_design_for_catalogue(db, catalogue_id).id, payload, request, actor, db)


@studio_compat_router.patch("/catalogues/{catalogue_id}/pages/{page_id}", response_model=DesignResponse)
def update_catalogue_studio_page(catalogue_id: uuid.UUID, page_id: uuid.UUID, payload: PageUpdate, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_pages")), db: Session = Depends(get_db)):
    return update_page(_design_for_catalogue(db, catalogue_id).id, page_id, payload, request, actor, db)


@studio_compat_router.delete("/catalogues/{catalogue_id}/pages/{page_id}", response_model=DesignResponse)
def delete_catalogue_studio_page(catalogue_id: uuid.UUID, page_id: uuid.UUID, expected_revision: int, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_pages")), db: Session = Depends(get_db)):
    return delete_page(_design_for_catalogue(db, catalogue_id).id, page_id, expected_revision, request, actor, db)


@studio_compat_router.post("/catalogues/{catalogue_id}/pages/reorder", response_model=DesignResponse)
def reorder_catalogue_studio_pages(catalogue_id: uuid.UUID, payload: PageOrderUpdate, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_pages")), db: Session = Depends(get_db)):
    return reorder_pages(_design_for_catalogue(db, catalogue_id).id, payload, request, actor, db)


@studio_compat_router.post("/catalogues/{catalogue_id}/pages/{page_id}/duplicate", response_model=PageResponse, status_code=201)
def duplicate_catalogue_studio_page(catalogue_id: uuid.UUID, page_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_pages")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id); source = _page(db, design.id, page_id)
    document = json.loads(json.dumps(source.page_data_json)); document["pageId"] = str(uuid.uuid4()); document["name"] = f"{source.page_name} copy"
    return create_page(design.id, PageCreate(page_type=source.page_type, page_name=document["name"], width=source.width, height=source.height, orientation=source.orientation, background_color=source.background_color, page_data=document, is_visible=source.is_visible, is_locked=False), request, actor, db)


def _replace_elements(design: CatalogueDesign, page: CatalogueDesignPage, elements: list[dict], expected_revision: int, request: Request, actor: User, db: Session, action: str) -> DesignResponse:
    _check_revision(design, expected_revision)
    document = dict(page.page_data_json); document["elements"] = elements
    page.page_data_json = PageDocument.model_validate(document).model_dump(mode="json")
    design.revision += 1; design.updated_by_id = actor.id
    _audit(db, request, actor, action, str(design.id), {"page_id": str(page.id), "element_count": len(elements)})
    db.commit(); return _design(db, design.id)


@studio_compat_router.post("/catalogues/{catalogue_id}/pages/{page_id}/elements", response_model=DesignResponse, status_code=201)
def add_catalogue_studio_element(catalogue_id: uuid.UUID, page_id: uuid.UUID, payload: ElementMutation, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_elements")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id); page = _page(db, design.id, page_id); elements = list((page.page_data_json or {}).get("elements", []))
    if any(row.get("id") == payload.element.id for row in elements): raise HTTPException(status_code=409, detail="Element ID already exists on this page.")
    return _replace_elements(design, page, [*elements, payload.element.model_dump(mode="json")], payload.expected_revision, request, actor, db, "catalogue_design_element_added")


@studio_compat_router.patch("/catalogues/{catalogue_id}/pages/{page_id}/elements/{element_id}", response_model=DesignResponse)
def update_catalogue_studio_element(catalogue_id: uuid.UUID, page_id: uuid.UUID, element_id: str, payload: ElementMutation, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_elements")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id); page = _page(db, design.id, page_id); elements = list((page.page_data_json or {}).get("elements", []))
    if not any(row.get("id") == element_id for row in elements): raise HTTPException(status_code=404, detail="Canvas element not found.")
    replacement = payload.element.model_dump(mode="json"); replacement["id"] = element_id
    return _replace_elements(design, page, [replacement if row.get("id") == element_id else row for row in elements], payload.expected_revision, request, actor, db, "catalogue_design_element_updated")


@studio_compat_router.delete("/catalogues/{catalogue_id}/pages/{page_id}/elements/{element_id}", response_model=DesignResponse)
def delete_catalogue_studio_element(catalogue_id: uuid.UUID, page_id: uuid.UUID, element_id: str, expected_revision: int, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_elements")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id); page = _page(db, design.id, page_id); elements = list((page.page_data_json or {}).get("elements", []))
    filtered = [row for row in elements if row.get("id") != element_id]
    if len(filtered) == len(elements): raise HTTPException(status_code=404, detail="Canvas element not found.")
    return _replace_elements(design, page, filtered, expected_revision, request, actor, db, "catalogue_design_element_deleted")


@studio_compat_router.post("/catalogues/{catalogue_id}/pages/{page_id}/elements/bulk", response_model=DesignResponse)
def bulk_catalogue_studio_elements(catalogue_id: uuid.UUID, page_id: uuid.UUID, payload: ElementsBulkMutation, request: Request, actor: User = Depends(require_permission("catalogue_studio.manage_elements")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id); page = _page(db, design.id, page_id)
    return _replace_elements(design, page, [element.model_dump(mode="json") for element in payload.elements], payload.expected_revision, request, actor, db, "catalogue_design_elements_bulk_saved")


@studio_compat_router.get("/catalogues/{catalogue_id}/studio/products")
def catalogue_studio_products(catalogue_id: uuid.UUID, q: str = Query(default="", max_length=120), actor: User = Depends(require_permission("catalogue_studio.view")), db: Session = Depends(get_db)):
    design = _design_for_catalogue(db, catalogue_id)
    return _studio_product_rows(db, design, actor, q)


@router.get("/designs/{design_id}/products/available")
def design_studio_products(
    design_id: uuid.UUID,
    q: str = Query(default="", max_length=120),
    actor: User = Depends(require_permission("catalogue_studio.view")),
    db: Session = Depends(get_db),
):
    return _studio_product_rows(db, _design(db, design_id), actor, q)


@router.get("/designs/{design_id}/products/{product_id}")
def design_studio_product(
    design_id: uuid.UUID,
    product_id: uuid.UUID,
    actor: User = Depends(require_permission("catalogue_studio.view")),
    db: Session = Depends(get_db),
):
    return _studio_product_row(db, _design(db, design_id), actor, product_id)


@router.get("/designs/{design_id}/products/{product_id}/price-options")
def design_studio_product_price_options(
    design_id: uuid.UUID,
    product_id: uuid.UUID,
    actor: User = Depends(require_permission("catalogue_studio.view")),
    db: Session = Depends(get_db),
):
    """Return exact current ERP amounts using the signed-in user's price mapping."""
    return _studio_product_price_options(db, _design(db, design_id), actor, product_id)


@router.get("/designs/{design_id}/pricing-overview")
def design_studio_pricing_overview(
    design_id: uuid.UUID,
    actor: User = Depends(require_permission("catalogue_studio.view")),
    db: Session = Depends(get_db),
):
    """Return catalogue-wide, brand-aware pricing for the signed-in user."""
    return _studio_design_pricing_overview(db, _design(db, design_id), actor)


@router.post("/designs/{design_id}/products/{product_id}/images", status_code=201)
async def upload_design_studio_product_image(
    design_id: uuid.UUID,
    product_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    alt_text: str = Form(default="", max_length=255),
    actor: User = Depends(require_any_permission("product_images.upload", "catalogue_designs.manage_elements")),
    db: Session = Depends(get_db),
):
    """Add a Product Master image without leaving the Studio card editor."""
    design = _design(db, design_id)
    product = validate_selectable_product_ids(db, design, actor, {product_id})[product_id]
    if file.content_type not in STUDIO_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG or WebP image.")
    max_bytes = settings.product_image_max_size_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"Images must be {settings.product_image_max_size_mb} MB or smaller.")
    if not content:
        raise HTTPException(status_code=422, detail="The uploaded image is empty.")
    upload_root = Path(settings.upload_dir).resolve()
    upload_root.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid.uuid4().hex}{STUDIO_IMAGE_TYPES[file.content_type]}"
    path = (upload_root / storage_name).resolve()
    if upload_root not in path.parents:
        raise HTTPException(status_code=400, detail="Invalid image path.")
    path.write_bytes(content)
    max_order = db.scalar(select(func.max(ProductImage.sort_order)).where(ProductImage.product_id == product.id))
    image = ProductImage(
        product_id=product.id,
        file_name=(file.filename or "product-image")[:255],
        storage_name=storage_name,
        public_url=f"/uploads/{storage_name}",
        content_type=file.content_type,
        alt_text=alt_text.strip(),
        sort_order=(max_order + 1) if max_order is not None else 0,
        is_primary=not product.images,
        uploaded_by_id=actor.id,
    )
    db.add(image)
    _audit(db, request, actor, "catalogue_studio_product_image_uploaded", str(product.id), {"image_id": str(image.id), "file_name": image.file_name})
    db.commit()
    return _studio_product_row(db, design, actor, product_id)


@router.get("/designs/{design_id}/products/{product_id}/primary-image", response_class=FileResponse)
def design_studio_product_primary_image(
    design_id: uuid.UUID,
    product_id: uuid.UUID,
    request: Request,
    download: bool = False,
    actor: User = Depends(require_permission("catalogue_studio.view")),
    db: Session = Depends(get_db),
):
    """Serve the product's current ERP-synchronized primary image by stable product ID."""
    design = _design(db, design_id)
    product = validate_selectable_product_ids(db, design, actor, {product_id})[product_id]
    ordered_images = sorted(product.images, key=lambda image: (not image.is_primary, image.sort_order))
    if not ordered_images:
        raise HTTPException(status_code=404, detail="This ERP product does not have a synchronized image.")
    image = ordered_images[0]
    upload_root = Path(settings.upload_dir).resolve()
    path = (upload_root / image.storage_name).resolve()
    if upload_root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="The synchronized ERP product image file is unavailable.")
    # The browser loads the same protected file both as an <img> resource and
    # through an authenticated fetch used by the shared renderer.  Always vary
    # on Origin so a cached no-Origin image response cannot poison the later
    # CORS fetch used to create the object URL.
    response_headers = {"Cache-Control": "private, max-age=300", "Vary": "Origin"}
    origin = request.headers.get("origin")
    if origin and settings.is_origin_allowed(origin):
        response_headers.update(
            {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Credentials": "true",
            }
        )
    return FileResponse(
        path,
        media_type=image.content_type,
        filename=image.file_name if download else None,
        content_disposition_type="attachment" if download else "inline",
        headers=response_headers,
    )


@router.get(
    "/designs/{design_id}/products/{product_id}/images/{image_id}",
    response_class=FileResponse,
)
def design_studio_product_image(
    design_id: uuid.UUID,
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    request: Request,
    download: bool = False,
    actor: User = Depends(require_permission("catalogue_studio.view")),
    db: Session = Depends(get_db),
):
    """Serve a chosen ERP or manually uploaded product image by stable ID."""
    design = _design(db, design_id)
    product = validate_selectable_product_ids(db, design, actor, {product_id})[product_id]
    image = next((row for row in product.images if row.id == image_id), None)
    if not image:
        raise HTTPException(status_code=404, detail="Product image not found.")
    upload_root = Path(settings.upload_dir).resolve()
    path = (upload_root / image.storage_name).resolve()
    if upload_root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="The product image file is unavailable.")
    response_headers = {"Cache-Control": "private, max-age=300", "Vary": "Origin"}
    origin = request.headers.get("origin")
    if origin and settings.is_origin_allowed(origin):
        response_headers.update(
            {
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Credentials": "true",
            }
        )
    return FileResponse(
        path,
        media_type=image.content_type,
        filename=image.file_name if download else None,
        content_disposition_type="attachment" if download else "inline",
        headers=response_headers,
    )


@studio_compat_router.get("/catalogues/{catalogue_id}/studio/product-fields")
def catalogue_studio_fields(catalogue_id: uuid.UUID, actor: User = Depends(require_permission("catalogue_studio.view")), db: Session = Depends(get_db)):
    _design_for_catalogue(db, catalogue_id)
    fields = ["product.code", "product.name_en", "product.name_th", "product.brand_name", "product.category_name", "product.description", "product.image", "product.video"]
    if has_permission(actor, "catalogue_studio.product_cards.view_barcode") or is_superadmin(actor): fields.extend(["product.barcode", "product.qr_code"])
    if has_permission(actor, "catalogue_studio.product_cards.view_stock") or is_superadmin(actor): fields.extend(["product.stock_on_hand", "product.stock_available", "product.stock_reserved", "product.stock_incoming", "product.last_synchronized_at"])
    fields.extend(["product.price_1", "product.price_2", "product.currency"])
    if has_permission(actor, "catalogue_studio.view_additional_fields") or is_superadmin(actor): fields.extend(["product.model", "product.specifications", "product.size", "product.weight", "product.warranty", "product.unit", "product.pack_size", "product.custom_fields"])
    return {"fields": fields}


@studio_compat_router.get("/catalogues/{catalogue_id}/studio/price-lists")
def catalogue_studio_price_lists(catalogue_id: uuid.UUID, actor: User = Depends(require_permission("catalogue_studio.view")), db: Session = Depends(get_db)):
    _design_for_catalogue(db, catalogue_id)
    allowed = allowed_price_list_ids(db, actor)
    query = select(PriceList).where(PriceList.is_active.is_(True))
    if allowed is not None: query = query.where(PriceList.id.in_(allowed))
    return [{"id": row.id, "code": row.code, "name": row.name, "currency": row.currency, "is_no_price": row.is_no_price} for row in db.scalars(query.order_by(PriceList.name))]
