from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import allowed_brand_names, allowed_price_list_ids, has_permission, is_superadmin
from app.commerce_models import PriceList, ProductPrice
from app.design_studio_models import CatalogueDesign
from app.models import Brand, Product, User


def utcnow() -> datetime:
    return datetime.now(UTC)


def validate_brand_access(db: Session, actor: User, brand_ids: list[int], *, multiple: bool) -> list[Brand]:
    if multiple and not (is_superadmin(actor) or has_permission(actor, "catalogue_studio.use_multiple_brands")):
        raise HTTPException(status_code=403, detail="Permission required: catalogue_studio.use_multiple_brands")
    brands = list(db.scalars(select(Brand).where(Brand.id.in_(set(brand_ids)), Brand.is_active.is_(True)))) if brand_ids else []
    if len(brands) != len(set(brand_ids)):
        raise HTTPException(status_code=422, detail="One or more selected brands are unavailable.")
    if not is_superadmin(actor):
        allowed = allowed_brand_names(db, actor, edit=False)
        if any(brand.name.casefold() not in allowed for brand in brands):
            raise HTTPException(status_code=403, detail="One or more selected brands are outside your data scope.")
    return brands


def validate_price_access(db: Session, actor: User, price_list_ids: list[int]) -> list[PriceList]:
    ids = set(price_list_ids)
    if len(ids) > 1 and not (is_superadmin(actor) or has_permission(actor, "catalogue_studio.use_two_prices")):
        raise HTTPException(status_code=403, detail="Permission required: catalogue_studio.use_two_prices")
    price_lists = list(db.scalars(select(PriceList).where(PriceList.id.in_(ids), PriceList.is_active.is_(True)))) if ids else []
    if len(price_lists) != len(ids):
        raise HTTPException(status_code=422, detail="One or more selected price lists are unavailable.")
    allowed = allowed_price_list_ids(db, actor)
    if allowed is not None and any(item.id not in allowed for item in price_lists):
        raise HTTPException(status_code=403, detail="One or more selected price lists are not authorized.")
    return price_lists


def selectable_products(db: Session, design: CatalogueDesign, actor: User, *, query: str = "", brand_ids: list[int] | None = None):
    statement = select(Product).where(Product.status == "active")
    selected_brand_ids = brand_ids if brand_ids is not None else [item.brand_id for item in design.selected_brands if item.is_visible]
    if selected_brand_ids:
        names = list(db.scalars(select(Brand.name).where(Brand.id.in_(selected_brand_ids))))
        statement = statement.where(Product.brand.in_(names))
    if query.strip():
        pattern = f"%{query.strip()}%"
        statement = statement.where(
            Product.sku.ilike(pattern)
            | Product.erp_name.ilike(pattern)
            | Product.erp_name_th.ilike(pattern)
            | Product.barcode.ilike(pattern)
            | Product.brand.ilike(pattern)
        )
    if not is_superadmin(actor):
        allowed_names = allowed_brand_names(db, actor, edit=False)
        statement = statement.where(Product.brand.is_not(None), Product.brand.in_(allowed_names))
    return list(db.scalars(statement.order_by(Product.erp_name).limit(200)))


def validate_selectable_product_ids(
    db: Session,
    design: CatalogueDesign,
    actor: User,
    product_ids: set[uuid.UUID],
) -> dict[uuid.UUID, Product]:
    """Validate canvas/catalogue product bindings without the library's 200-row limit."""
    if not product_ids:
        return {}
    statement = select(Product).where(Product.id.in_(product_ids), Product.status == "active")
    selected_brand_ids = [item.brand_id for item in design.selected_brands if item.is_visible]
    if selected_brand_ids:
        names = list(db.scalars(select(Brand.name).where(Brand.id.in_(selected_brand_ids))))
        statement = statement.where(Product.brand.in_(names))
    if not is_superadmin(actor):
        allowed_names = allowed_brand_names(db, actor, edit=False)
        statement = statement.where(Product.brand.is_not(None), Product.brand.in_(allowed_names))
    products = {item.id: item for item in db.scalars(statement)}
    if set(products) != product_ids:
        raise HTTPException(
            status_code=422,
            detail="One or more canvas products are inactive or outside the selected brand scope.",
        )
    return products


def authorized_product_prices(db: Session, actor: User, product_ids: list[uuid.UUID], price_list_ids: list[int]) -> dict[tuple[uuid.UUID, int], str]:
    validate_price_access(db, actor, price_list_ids)
    if not product_ids or not price_list_ids:
        return {}
    now = utcnow()
    rows = db.execute(
        select(ProductPrice.product_id, ProductPrice.price_list_id, ProductPrice.amount)
        .where(
            ProductPrice.product_id.in_(product_ids),
            ProductPrice.price_list_id.in_(price_list_ids),
            ProductPrice.status == "active",
            ProductPrice.effective_from <= now,
            (ProductPrice.expires_at.is_(None) | (ProductPrice.expires_at > now)),
        )
        .order_by(ProductPrice.effective_from.desc())
    )
    output: dict[tuple[uuid.UUID, int], str] = {}
    for product_id, price_list_id, amount in rows:
        output.setdefault((product_id, price_list_id), str(amount))
    return output


def validate_design_for_publish(db: Session, design: CatalogueDesign, actor: User) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not design.name.strip():
        errors.append("Catalogue title is required.")
    visible_pages = [page for page in design.pages if page.is_visible]
    if not visible_pages:
        errors.append("Catalogue must contain at least one visible page.")
    active_products = {}
    if design.product_items:
        ids = [item.product_id for item in design.product_items]
        active_products = {row.id: row for row in db.scalars(select(Product).where(Product.id.in_(ids), Product.status == "active"))}
        invalid = [item for item in design.product_items if item.is_visible and item.product_id not in active_products]
        if invalid:
            errors.append("Inactive or unavailable products cannot be published.")
    visible_bound_ids: set[uuid.UUID] = set()
    for page in visible_pages:
        for element in (page.page_data_json or {}).get("elements", []):
            if not element.get("visible", True):
                continue
            carousel = element.get("carousel") or {}
            raw_ids = carousel.get("productIds") or [element.get("productId") or carousel.get("productId")]
            for raw_id in filter(None, raw_ids):
                try:
                    visible_bound_ids.add(uuid.UUID(str(raw_id)))
                except ValueError:
                    errors.append("A product element has an invalid product binding.")
            if element.get("type") == "image_carousel":
                active_images = [image for image in (carousel.get("images") or []) if image.get("isActive", True)]
                if not active_images:
                    errors.append(f"Image Carousel '{element.get('name', 'Image Carousel')}' must contain at least one active image before publishing.")
            for key in ("xPercent", "yPercent", "widthPercent", "heightPercent"):
                value = float(element.get(key, 0))
                if key in {"xPercent", "yPercent"} and value < 0:
                    warnings.append(f"Element {element.get('name', 'Element')} extends outside the printable page.")
    if visible_bound_ids:
        active_bound = set(db.scalars(select(Product.id).where(Product.id.in_(visible_bound_ids), Product.status == "active")))
        if visible_bound_ids - active_bound:
            errors.append("One or more canvas elements reference an inactive product.")
        hidden_ids = {item.product_id for item in design.product_items if not item.is_visible}
        if visible_bound_ids & hidden_ids:
            errors.append("A product hidden in this catalogue is still visible on a canvas page.")
    slot_ids = [slot.price_list_id for slot in design.price_slots if slot.is_visible and slot.price_list_id is not None]
    validate_price_access(db, actor, slot_ids)
    if design.catalogue_type == "promotion":
        if not design.start_at or not design.end_at or design.end_at <= design.start_at:
            errors.append("Promotion end date must be later than its start date.")
        if design.promotion_status not in {"approved", "scheduled", "active"}:
            errors.append("Promotion must be approved before it can be published or scheduled.")
    return errors, list(dict.fromkeys(warnings))


def apply_promotion_schedule(design: CatalogueDesign, *, now: datetime | None = None) -> bool:
    if design.catalogue_type != "promotion" or not design.start_at or not design.end_at:
        return False
    current = now or utcnow()
    start_at = design.start_at if design.start_at.tzinfo else design.start_at.replace(tzinfo=UTC)
    end_at = design.end_at if design.end_at.tzinfo else design.end_at.replace(tzinfo=UTC)
    if current.tzinfo is None:
        current = current.replace(tzinfo=UTC)
    old = design.promotion_status
    if old in {"paused", "cancelled", "draft", "pending_review"}:
        return False
    if current >= end_at:
        design.promotion_status = "expired"
    elif current >= start_at and old in {"approved", "scheduled", "active"}:
        design.promotion_status = "active"
    elif current < start_at and old in {"approved", "scheduled"}:
        design.promotion_status = "scheduled"
    return design.promotion_status != old
