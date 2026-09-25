import math
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.commerce_models import Catalogue, CatalogueAudienceType, PriceList, ProductPrice
from app.config import settings
from app.models import AuditLog, Brand, Product
from app.promotion_models import (
    Promotion,
    PromotionAudience,
    PromotionBrand,
    PromotionCatalogue,
    PromotionMedia,
    PromotionPriceHistory,
    PromotionProduct,
    PromotionStatusHistory,
)
from app.promotion_schemas import (
    PromotionAudienceResponse,
    PromotionBrandResponse,
    PromotionCreate,
    PromotionMediaResponse,
    PromotionProductResponse,
    PromotionResponse,
)
from app.storage import promotion_storage


ACTIVE_PUBLIC_STATUSES = {"scheduled", "active"}
MATERIAL_FIELDS = {
    "promotion_type", "discount_percent", "discount_amount", "promotion_price", "priority", "start_at", "end_at", "terms_en", "terms_th",
    "brand_rules", "products", "audiences", "catalogue_ids", "is_active",
}


def now_utc() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def promotion_query():
    return select(Promotion).options(
        selectinload(Promotion.brands).selectinload(PromotionBrand.brand),
        selectinload(Promotion.products).selectinload(PromotionProduct.product),
        selectinload(Promotion.products).selectinload(PromotionProduct.price_list),
        selectinload(Promotion.products).selectinload(PromotionProduct.audience_type),
        selectinload(Promotion.audiences).selectinload(PromotionAudience.audience_type),
        selectinload(Promotion.audiences).selectinload(PromotionAudience.price_list),
        selectinload(Promotion.catalogues),
        selectinload(Promotion.media),
    )


def get_promotion(db: Session, promotion_id: uuid.UUID) -> Promotion:
    item = db.scalar(promotion_query().where(Promotion.id == promotion_id, Promotion.deleted_at.is_(None)))
    if not item:
        raise HTTPException(status_code=404, detail="Promotion not found.")
    return item


def audit(db: Session, action: str, promotion: Promotion, actor_id: uuid.UUID | None, details: dict | None = None) -> None:
    db.add(AuditLog(
        user_id=actor_id, action=action, module="promotions", status="success",
        identifier=promotion.code,
        details={"promotion_id": str(promotion.id), **(details or {})},
    ))


def status_change(db: Session, promotion: Promotion, new_status: str, actor_id: uuid.UUID | None, reason: str = "") -> None:
    old_status = promotion.status
    promotion.status = new_status
    db.add(PromotionStatusHistory(
        promotion_id=promotion.id, old_status=old_status, new_status=new_status,
        reason=reason.strip(), changed_by_id=actor_id,
    ))
    audit(db, f"promotion_{new_status}", promotion, actor_id, {"old_status": old_status, "reason": reason})


def generate_code(db: Session) -> str:
    year = datetime.now(UTC).year
    prefix = f"PROMO-{year}-"
    last = db.scalar(select(Promotion.code).where(Promotion.code.like(f"{prefix}%")).order_by(Promotion.code.desc()).limit(1))
    sequence = int(last.rsplit("-", 1)[-1]) + 1 if last and last.rsplit("-", 1)[-1].isdigit() else 1
    return f"{prefix}{sequence:05d}"


def current_base_price(db: Session, product_id: uuid.UUID, price_list_id: int | None, at: datetime | None = None) -> tuple[Decimal | None, str]:
    at = at or now_utc()
    if price_list_id:
        row = db.scalar(select(ProductPrice).where(
            ProductPrice.product_id == product_id,
            ProductPrice.price_list_id == price_list_id,
            ProductPrice.status == "active",
            ProductPrice.effective_from <= at,
            or_(ProductPrice.expires_at.is_(None), ProductPrice.expires_at > at),
        ).order_by(ProductPrice.effective_from.desc(), ProductPrice.created_at.desc()).limit(1))
        if row:
            return Decimal(row.amount), row.currency
    product = db.get(Product, product_id)
    return (Decimal(product.price), "THB") if product and product.price is not None else (None, "THB")


def calculate_price(base: Decimal | None, promotion_type: str, discount_percent: Decimal | None, discount_amount: Decimal | None, special_price: Decimal | None) -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    if base is None:
        raise HTTPException(status_code=422, detail="A selected product has no base price for this audience.")
    money = Decimal("0.01")
    if promotion_type == "percentage":
        if discount_percent is None or discount_percent <= 0 or discount_percent > 100:
            raise HTTPException(status_code=422, detail="Percentage discount must be greater than 0 and no more than 100.")
        result = (base * (Decimal("1") - discount_percent / Decimal("100"))).quantize(money, rounding=ROUND_HALF_UP)
        amount = (base - result).quantize(money)
        return result, amount, discount_percent
    if promotion_type == "fixed_amount":
        if discount_amount is None or discount_amount <= 0:
            raise HTTPException(status_code=422, detail="Fixed discount must be greater than zero.")
        result = (base - discount_amount).quantize(money, rounding=ROUND_HALF_UP)
        if result < 0:
            raise HTTPException(status_code=422, detail="The fixed discount cannot produce a negative price.")
        percent = ((discount_amount / base) * 100).quantize(Decimal("0.01")) if base else Decimal("0")
        return result, discount_amount.quantize(money), percent
    if promotion_type == "special_price":
        if special_price is None or special_price < 0:
            raise HTTPException(status_code=422, detail="Special promotion price must be zero or greater.")
        if special_price > base:
            raise HTTPException(status_code=422, detail="Special promotion price cannot exceed the base price.")
        amount = (base - special_price).quantize(money)
        percent = ((amount / base) * 100).quantize(Decimal("0.01")) if base else Decimal("0")
        return special_price.quantize(money), amount, percent
    raise HTTPException(status_code=422, detail="Unsupported promotion type.")


def _resolve_products(db: Session, payload: PromotionCreate) -> list:
    brands = {row.brand_id: db.get(Brand, row.brand_id) for row in payload.brand_rules}
    if any(item is None or not item.is_active for item in brands.values()):
        raise HTTPException(status_code=422, detail="One or more selected brands are unavailable.")
    allowed_brand_names = {value.name.casefold() for value in brands.values() if value}
    selected = {row.product_id: row for row in payload.products}
    for rule in payload.brand_rules:
        if rule.include_all_active_products:
            brand = brands[rule.brand_id]
            rows = db.scalars(select(Product).where(Product.status == "active", func.lower(Product.brand) == brand.name.casefold())).all()
            for product in rows:
                selected.setdefault(product.id, None)
    products = {product.id: product for product in db.scalars(select(Product).where(Product.id.in_(selected))).all()}
    if not products:
        raise HTTPException(status_code=422, detail="No eligible active products were selected.")
    for product in products.values():
        if product.status != "active":
            raise HTTPException(status_code=422, detail=f"Inactive product {product.sku} cannot be selected.")
        if not product.brand or product.brand.casefold() not in allowed_brand_names:
            raise HTTPException(status_code=422, detail=f"Product {product.sku} does not belong to a selected brand.")
    return [(product, selected[product.id]) for product in products.values()]


def replace_configuration(db: Session, promotion: Promotion, payload: PromotionCreate) -> None:
    promotion.brands.clear(); promotion.products.clear(); promotion.audiences.clear(); promotion.catalogues.clear()
    db.flush()
    audience_rows: list[tuple[CatalogueAudienceType, int | None, bool]] = []
    for item in payload.audiences:
        audience = db.get(CatalogueAudienceType, item.audience_type_id)
        if not audience or not audience.is_active:
            raise HTTPException(status_code=422, detail="One or more audience types are unavailable.")
        price_list_id = item.price_list_id if item.price_list_id is not None else audience.price_list_id
        price_list = db.get(PriceList, price_list_id) if price_list_id else None
        show_prices = bool(item.show_prices and audience.show_prices and price_list and not price_list.is_no_price)
        promotion.audiences.append(PromotionAudience(audience_type_id=audience.id, price_list_id=price_list_id, show_prices=show_prices))
        audience_rows.append((audience, price_list_id, show_prices))
    for item in payload.brand_rules:
        promotion.brands.append(PromotionBrand(brand_id=item.brand_id, include_all_active_products=item.include_all_active_products))
    for catalogue_id in set(payload.catalogue_ids):
        if not db.get(Catalogue, catalogue_id):
            raise HTTPException(status_code=422, detail="A selected catalogue does not exist.")
        promotion.catalogues.append(PromotionCatalogue(catalogue_id=catalogue_id))
    resolved = _resolve_products(db, payload)
    for order, (product, requested) in enumerate(resolved):
        targets = audience_rows
        if requested and requested.audience_type_id:
            targets = [row for row in targets if row[0].id == requested.audience_type_id]
            if not targets:
                raise HTTPException(status_code=422, detail=f"Product {product.sku} targets an audience not selected for the promotion.")
        for audience, configured_price_list_id, show_prices in targets:
            price_list_id = requested.price_list_id if requested and requested.price_list_id is not None else configured_price_list_id
            base_price, currency = current_base_price(db, product.id, price_list_id)
            promo_type = requested.promotion_type if requested and requested.promotion_type else payload.promotion_type
            if show_prices:
                promotion_price, amount, percent = calculate_price(
                    base_price, promo_type,
                    requested.discount_percent if requested and requested.discount_percent is not None else payload.discount_percent,
                    requested.discount_amount if requested and requested.discount_amount is not None else payload.discount_amount,
                    requested.promotion_price if requested and requested.promotion_price is not None else payload.promotion_price,
                )
            else:
                promotion_price = amount = percent = None
            promotion.products.append(PromotionProduct(
                product_id=product.id, audience_type_id=audience.id, price_list_id=price_list_id,
                promotion_type=promo_type, base_price=base_price, discount_percent=percent,
                discount_amount=amount, promotion_price=promotion_price, currency=currency,
                include_in_promotion=requested.include_in_promotion if requested else True,
                display_order=requested.display_order if requested else order,
            ))


def conflicts_for(db: Session, promotion: Promotion) -> list[dict]:
    if not promotion.products:
        return []
    ids = {item.product_id for item in promotion.products if item.include_in_promotion}
    audiences = {item.audience_type_id for item in promotion.audiences}
    candidates = db.scalars(promotion_query().where(
        Promotion.id != promotion.id,
        Promotion.deleted_at.is_(None), Promotion.is_active.is_(True),
        Promotion.status.in_(["approved", "scheduled", "active"]),
        Promotion.start_at < promotion.end_at, Promotion.end_at > promotion.start_at,
    )).unique().all()
    result = []
    for other in candidates:
        shared_products = ids & {item.product_id for item in other.products if item.include_in_promotion}
        shared_audiences = audiences & {item.audience_type_id for item in other.audiences}
        if shared_products and shared_audiences:
            winner = promotion if promotion.priority > other.priority else other
            result.append({
                "promotion_id": str(other.id), "code": other.code, "name": other.name_en,
                "product_count": len(shared_products), "audience_count": len(shared_audiences),
                "start_at": other.start_at.isoformat(), "end_at": other.end_at.isoformat(),
                "priority": other.priority, "winner_code": winner.code,
            })
    return result


def promotion_response(db: Session, promotion: Promotion, *, include_internal: bool = True, with_conflicts: bool = False) -> PromotionResponse:
    product_counts = {}
    for row in promotion.products:
        product_counts[row.product.brand.casefold() if row.product.brand else ""] = product_counts.get(row.product.brand.casefold() if row.product.brand else "", 0) + 1
    brands = []
    for row in promotion.brands:
        active_count = db.scalar(select(func.count(Product.id)).where(Product.status == "active", func.lower(Product.brand) == row.brand.name.casefold())) or 0
        brands.append(PromotionBrandResponse(
            brand_id=row.brand_id, brand_name=row.brand.name, brand_code=row.brand.code,
            include_all_active_products=row.include_all_active_products,
            active_product_count=active_count,
            selected_product_count=product_counts.get(row.brand.name.casefold(), 0),
        ))
    products = []
    for row in promotion.products:
        product = row.product
        product_image = next(
            (image for image in product.images if image.is_primary),
            product.images[0] if product.images else None,
        )
        warning = None
        current, _ = current_base_price(db, product.id, row.price_list_id)
        if product.status != "active": warning = "Product is inactive and will not be shown publicly."
        elif current is None: warning = "Base price is missing."
        elif row.approved_base_price is not None and current != row.approved_base_price: warning = "ERP base price changed after publishing."
        elif product.stock_quantity <= 0: warning = "Product is out of stock."
        products.append(PromotionProductResponse(
            id=row.id, product_id=product.id, product_code=product.sku, product_name=product.erp_name,
            image_url=product_image.public_url if product_image else None,
            brand=product.brand, category=product.erp_category, stock=product.stock_quantity,
            product_status=product.status, audience_type_id=row.audience_type_id,
            price_list_id=row.price_list_id, price_list_name=row.price_list.name if row.price_list else None,
            promotion_type=row.promotion_type, base_price=row.base_price,
            approved_base_price=row.approved_base_price, discount_percent=row.discount_percent,
            discount_amount=row.discount_amount, promotion_price=row.promotion_price,
            currency=row.currency, include_in_promotion=row.include_in_promotion, warning=warning,
        ))
    audiences = [PromotionAudienceResponse(
        audience_type_id=row.audience_type_id, audience_code=row.audience_type.code,
        audience_name=row.audience_type.display_name, price_list_id=row.price_list_id,
        price_list_name=row.price_list.name if row.price_list else None, show_prices=row.show_prices,
    ) for row in promotion.audiences]
    media = [PromotionMediaResponse(
        id=row.id, media_type=row.media_type,
        url=(f"{settings.api_prefix}/v1/promotions/{promotion.id}/media/{row.id}/content" if row.media_type == "video" and row.storage_key else promotion_storage.public_url(row.preview_storage_key or row.storage_key)), external_url=row.external_url,
        original_filename=row.original_filename, mime_type=row.mime_type, file_size=row.file_size,
        alt_text=row.alt_text, display_order=row.display_order,
    ) for row in sorted(promotion.media, key=lambda item: (item.display_order, item.created_at)) if row.is_active]
    banner = next((item for item in media if item.media_type == "banner" and item.url), None)
    fallback_product_image = next((
        next((image for image in row.product.images if image.is_primary), row.product.images[0])
        for row in promotion.products
        if row.include_in_promotion and row.product.images
    ), None)
    cover_url = banner.url if banner else (fallback_product_image.public_url if fallback_product_image else None)
    return PromotionResponse(
        id=promotion.id, code=promotion.code, name_en=promotion.name_en, name_th=promotion.name_th,
        short_title=promotion.short_title, description_en=promotion.description_en, description_th=promotion.description_th,
        occasion_id=promotion.occasion_id, occasion_name=promotion.occasion.name_en if promotion.occasion else None,
        promotion_type=promotion.promotion_type, status=promotion.status, priority=promotion.priority,
        allow_stacking=promotion.allow_stacking, base_price_change_behavior=promotion.base_price_change_behavior,
        owner_user_id=promotion.owner_user_id, department_id=promotion.department_id, team_id=promotion.team_id,
        start_at=promotion.start_at, end_at=promotion.end_at, timezone=promotion.timezone, publish_at=promotion.publish_at,
        automatic_activation=promotion.automatic_activation, automatic_expiration=promotion.automatic_expiration,
        repeat_annually=promotion.repeat_annually, expiration_warning_days=promotion.expiration_warning_days,
        show_stock=promotion.show_stock, hide_out_of_stock=promotion.hide_out_of_stock,
        minimum_stock=promotion.minimum_stock, stop_product_at_zero_stock=promotion.stop_product_at_zero_stock,
        terms_en=promotion.terms_en, terms_th=promotion.terms_th,
        internal_note=promotion.internal_note if include_internal else None, is_active=promotion.is_active,
        published_at=promotion.published_at, approved_at=promotion.approved_at,
        rejection_reason=promotion.rejection_reason or None,
        created_by_id=promotion.created_by_id, updated_by_id=promotion.updated_by_id,
        created_at=promotion.created_at, updated_at=promotion.updated_at,
        brands=brands, products=products, audiences=audiences,
        catalogue_ids=[item.catalogue_id for item in promotion.catalogues], media=media, cover_url=cover_url,
        conflicts=conflicts_for(db, promotion) if with_conflicts else [],
    )


def prepare_for_publish(db: Session, promotion: Promotion) -> None:
    """Validate a promotion and freeze its current audience prices for publishing."""
    conflicts = conflicts_for(db, promotion)
    if conflicts:
        raise HTTPException(status_code=409, detail="Resolve overlapping product and audience conflicts before publishing.")
    for row in promotion.products:
        if row.product.status != "active" or not row.include_in_promotion:
            continue
        current, _ = current_base_price(db, row.product_id, row.price_list_id)
        if row.audience_type and row.audience_type.show_prices and current is None:
            raise HTTPException(status_code=422, detail=f"Product {row.product.sku} has no required source price.")
        row.base_price = current
        row.approved_base_price = current
        if row.promotion_price is not None:
            row.promotion_price, row.discount_amount, row.discount_percent = calculate_price(
                current, row.promotion_type, row.discount_percent,
                row.discount_amount if row.promotion_type == "fixed_amount" else None,
                row.promotion_price if row.promotion_type == "special_price" else None,
            )
    promotion.approved_at = None
    promotion.approved_by_user_id = None
    promotion.rejection_reason = ""


def process_scheduled_promotions(db: Session) -> dict[str, int]:
    now = now_utc(); activated = expired = republish = recalculated = paused_products = 0
    rows = db.scalars(promotion_query().where(Promotion.deleted_at.is_(None), Promotion.is_active.is_(True))).unique().all()
    for promotion in rows:
        if promotion.status in {"approved", "scheduled"} and promotion.automatic_activation and as_utc(promotion.start_at) <= now < as_utc(promotion.end_at):
            status_change(db, promotion, "active", None, "Automatic activation"); promotion.published_at = promotion.published_at or now; activated += 1
        if promotion.status in {"approved", "scheduled", "active"} and promotion.automatic_expiration and as_utc(promotion.end_at) <= now:
            status_change(db, promotion, "expired", None, "Automatic expiration"); expired += 1; continue
        if promotion.status not in {"scheduled", "active"}:
            continue
        changed = []
        for row in promotion.products:
            current, _ = current_base_price(db, row.product_id, row.price_list_id, now)
            if row.approved_base_price is None or current == row.approved_base_price:
                continue
            changed.append((row, current))
        if not changed:
            continue
        if promotion.base_price_change_behavior == "require_reapproval":
            status_change(db, promotion, "draft", None, "ERP base price changed; republishing required"); promotion.published_at = None; republish += 1
        elif promotion.base_price_change_behavior == "recalculate":
            for row, current in changed:
                old_base, old_price = row.base_price, row.promotion_price
                if current is not None and row.promotion_type in {"percentage", "fixed_amount"}:
                    row.promotion_price, row.discount_amount, row.discount_percent = calculate_price(current, row.promotion_type, row.discount_percent, row.discount_amount, None)
                    row.base_price = current; row.approved_base_price = current; recalculated += 1
                    db.add(PromotionPriceHistory(promotion_id=promotion.id, product_id=row.product_id, audience_type_id=row.audience_type_id, old_base_price=old_base, new_base_price=current, old_promotion_price=old_price, new_promotion_price=row.promotion_price, reason="Automatic ERP base-price recalculation"))
        elif promotion.base_price_change_behavior == "pause_products":
            for row, _ in changed: row.include_in_promotion = False; paused_products += 1
    db.commit()
    return {"activated": activated, "expired": expired, "republish_required": republish, "recalculated": recalculated, "paused_products": paused_products}


def summary_counts(db: Session) -> dict[str, int]:
    result = {key: 0 for key in ["draft", "scheduled", "active", "expiring_soon", "expired"]}
    for status, count in db.execute(select(Promotion.status, func.count(Promotion.id)).where(Promotion.deleted_at.is_(None)).group_by(Promotion.status)):
        if status in {"draft", "pending_review", "rejected", "approved"}:
            result["draft"] += count
        elif status in result:
            result[status] = count
    result["expiring_soon"] = db.scalar(select(func.count(Promotion.id)).where(Promotion.status == "active", Promotion.end_at > now_utc(), Promotion.end_at <= now_utc() + timedelta(days=7), Promotion.deleted_at.is_(None))) or 0
    return result


def apply_promotions_to_catalogue(
    db: Session, *, catalogue_id: uuid.UUID, products: list, audience_type_id: int | None,
    price_list_id: int | None, show_prices: bool, at: datetime | None = None,
    price_list_ids_by_product: dict[uuid.UUID, int | None] | None = None,
    show_prices_by_product: dict[uuid.UUID, bool] | None = None,
) -> list[dict]:
    """Attach the single winning active promotion to each safe catalogue product."""
    at = at or now_utc()
    active = db.scalars(promotion_query().where(
        Promotion.status == "active", Promotion.is_active.is_(True), Promotion.deleted_at.is_(None),
        Promotion.start_at <= at, Promotion.end_at > at,
    ).order_by(Promotion.priority.desc(), Promotion.published_at.desc())).unique().all()
    active = [row for row in active if (not row.catalogues or any(link.catalogue_id == catalogue_id for link in row.catalogues)) and (audience_type_id is None or any(a.audience_type_id == audience_type_id for a in row.audiences))]
    by_id = {item.id: item for item in products if getattr(item, "id", None)}
    used: dict[uuid.UUID, Promotion] = {}
    for promotion in active:
        for row in promotion.products:
            product = by_id.get(row.product_id)
            if not product or row.product.status != "active" or not row.include_in_promotion:
                continue
            if audience_type_id is not None and row.audience_type_id != audience_type_id:
                continue
            if (
                price_list_ids_by_product is not None
                and row.product_id in price_list_ids_by_product
                and row.price_list_id != price_list_ids_by_product[row.product_id]
            ):
                continue
            if audience_type_id is None and price_list_id is not None and row.price_list_id != price_list_id:
                continue
            if promotion.hide_out_of_stock and row.product.stock_quantity <= 0:
                continue
            if promotion.stop_product_at_zero_stock and row.product.stock_quantity <= 0:
                continue
            if row.product.stock_quantity < promotion.minimum_stock:
                continue
            if row.product_id in used:
                continue
            used[row.product_id] = promotion
            product.promotion_code = promotion.code
            product.promotion_name = promotion.name_en
            product.promotion_badge = promotion.occasion.name_en if promotion.occasion else "Limited Time"
            product.promotion_end_at = promotion.end_at
            product_shows_prices = (
                show_prices_by_product.get(row.product_id, show_prices)
                if show_prices_by_product is not None
                else show_prices
            )
            if product_shows_prices:
                product.original_price = row.base_price
                product.promotion_price = row.promotion_price
                product.discount_percent = row.discount_percent
                product.price = row.promotion_price
                product.currency = row.currency
            else:
                product.original_price = product.promotion_price = product.discount_percent = None
                product.price = None
    banners = []
    for promotion in active:
        if promotion.id not in {item.id for item in used.values()}:
            continue
        banner = next((item for item in promotion.media if item.is_active and item.media_type == "banner"), None)
        banners.append({"id": str(promotion.id), "code": promotion.code, "name_en": promotion.name_en, "name_th": promotion.name_th, "short_title": promotion.short_title, "occasion": promotion.occasion.name_en if promotion.occasion else None, "end_at": promotion.end_at.isoformat(), "banner_url": promotion_storage.public_url(banner.preview_storage_key or banner.storage_key) if banner else None})
    return banners


def pages(total: int, page_size: int) -> int:
    return max(1, math.ceil(total / page_size))
