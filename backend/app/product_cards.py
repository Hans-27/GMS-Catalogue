import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.access import require_permission
from app.catalogue import _require_product_access
from app.commerce_models import Catalogue, CatalogueProduct
from app.database import get_db
from app.design_studio_models import ProductCardTemplate
from app.models import AuditLog, Product, User
from app.product_card_models import GlobalProductCard, GlobalProductCardVersion
from app.product_card_schemas import (
    ProductCardDetail,
    ProductCardDraftPayload,
    ProductCardPage,
    ProductCardPublishPayload,
    ProductCardRestorePayload,
    ProductCardSummary,
    ProductCardVersionResponse,
)


router = APIRouter(prefix="/product-cards", tags=["Global Product Cards"])


def _product(db: Session, product_id: uuid.UUID, actor: User) -> Product:
    product = db.scalar(
        select(Product)
        .options(selectinload(Product.images), selectinload(Product.categories), selectinload(Product.catalogue_entry))
        .where(Product.id == product_id)
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    _require_product_access(db, actor, "products.view", product)
    return product


def _template(db: Session, template_id: uuid.UUID | None) -> ProductCardTemplate | None:
    if template_id is None:
        return None
    item = db.get(ProductCardTemplate, template_id)
    if (
        item is None
        or item.deleted_at is not None
        or not item.is_active
        or not item.is_company_template
        or item.approval_status != "approved"
    ):
        raise HTTPException(status_code=422, detail="Choose an active approved company product-card design.")
    return item


def _catalogues(db: Session, product_id: uuid.UUID) -> list[Catalogue]:
    return list(
        db.scalars(
            select(Catalogue)
            .join(CatalogueProduct, CatalogueProduct.catalogue_id == Catalogue.id)
            .where(CatalogueProduct.product_id == product_id)
            .order_by(Catalogue.title)
        )
    )


def _primary_image(product: Product) -> str | None:
    image = next((item for item in product.images if item.is_primary), None)
    return (image or (product.images[0] if product.images else None)).public_url if image or product.images else None


def _name(product: Product) -> str:
    entry = product.catalogue_entry
    return (entry.display_name if entry and entry.display_name else product.erp_name)


def _category(product: Product) -> str | None:
    return product.categories[0].name if product.categories else product.erp_category


def _summary(product: Product, card: GlobalProductCard | None, affected_count: int) -> ProductCardSummary:
    return ProductCardSummary(
        product_id=product.id,
        code=product.sku,
        name=_name(product),
        brand=product.brand,
        category=_category(product),
        primary_image_url=_primary_image(product),
        template_id=card.template_id if card else None,
        has_draft=bool(card and card.draft_json),
        is_published=bool(card and card.published_json is not None),
        draft_revision=card.draft_revision if card else 0,
        active_version=card.active_version if card else 0,
        affected_catalogue_count=affected_count,
        updated_at=card.updated_at if card else None,
    )


def _detail(db: Session, product: Product, card: GlobalProductCard | None) -> ProductCardDetail:
    catalogues = _catalogues(db, product.id)
    summary = _summary(product, card, len(catalogues))
    entry = product.catalogue_entry
    return ProductCardDetail(
        **summary.model_dump(),
        draft=dict(card.draft_json) if card else {},
        published=dict(card.published_json) if card and card.published_json is not None else None,
        published_at=card.published_at if card else None,
        images=[
            {"id": str(image.id), "url": image.public_url, "alt_text": image.alt_text, "is_primary": image.is_primary}
            for image in product.images
        ],
        affected_catalogues=[
            {"id": str(catalogue.id), "title": catalogue.title, "status": catalogue.status}
            for catalogue in catalogues
        ],
        erp_fields={
            "code": product.sku,
            "barcode": product.barcode,
            "stock_quantity": product.stock_quantity,
            "price": str(product.price) if product.price is not None else None,
            "name": product.erp_name,
            "description": entry.short_description if entry else "",
        },
    )


def _audit(db: Session, request: Request, actor: User, action: str, product: Product, details: dict) -> None:
    db.add(
        AuditLog(
            user_id=actor.id,
            action=action,
            module="product_cards",
            status="success",
            identifier=product.sku,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            details=details,
        )
    )


@router.get("", response_model=ProductCardPage)
def list_product_cards(
    q: str = "",
    brand: str = "",
    category: str = "",
    template_id: uuid.UUID | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    actor: User = Depends(require_permission("product_cards.view")),
    db: Session = Depends(get_db),
) -> ProductCardPage:
    del actor
    filters = [Product.status == "active"]
    if q.strip():
        term = f"%{q.strip()}%"
        filters.append(or_(Product.sku.ilike(term), Product.erp_name.ilike(term), Product.barcode.ilike(term)))
    if brand.strip():
        filters.append(Product.brand == brand.strip())
    if category.strip():
        filters.append(Product.erp_category == category.strip())
    if template_id is not None:
        filters.append(GlobalProductCard.template_id == template_id)
    base = select(Product).outerjoin(GlobalProductCard, GlobalProductCard.product_id == Product.id).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    products = list(
        db.scalars(
            base.options(selectinload(Product.images), selectinload(Product.categories), selectinload(Product.catalogue_entry))
            .order_by(Product.erp_name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).unique()
    )
    cards = {
        item.product_id: item
        for item in db.scalars(select(GlobalProductCard).where(GlobalProductCard.product_id.in_([p.id for p in products])))
    } if products else {}
    counts = {
        product_id: count
        for product_id, count in db.execute(
            select(CatalogueProduct.product_id, func.count(CatalogueProduct.id))
            .where(CatalogueProduct.product_id.in_([p.id for p in products]))
            .group_by(CatalogueProduct.product_id)
        )
    } if products else {}
    return ProductCardPage(
        items=[_summary(product, cards.get(product.id), int(counts.get(product.id, 0))) for product in products],
        total=int(total), page=page, page_size=page_size,
    )


@router.get("/{product_id}", response_model=ProductCardDetail)
def get_product_card(
    product_id: uuid.UUID,
    actor: User = Depends(require_permission("product_cards.view")),
    db: Session = Depends(get_db),
) -> ProductCardDetail:
    product = _product(db, product_id, actor)
    card = db.scalar(select(GlobalProductCard).where(GlobalProductCard.product_id == product.id))
    return _detail(db, product, card)


@router.put("/{product_id}/draft", response_model=ProductCardDetail)
def save_product_card_draft(
    product_id: uuid.UUID,
    payload: ProductCardDraftPayload,
    request: Request,
    actor: User = Depends(require_permission("product_cards.edit")),
    db: Session = Depends(get_db),
) -> ProductCardDetail:
    product = _product(db, product_id, actor)
    _template(db, payload.template_id)
    card = db.scalar(select(GlobalProductCard).where(GlobalProductCard.product_id == product.id).with_for_update())
    current_revision = card.draft_revision if card else 0
    if payload.revision != current_revision:
        raise HTTPException(status_code=409, detail="This product card changed. Reload before saving again.")
    if card is None:
        card = GlobalProductCard(product_id=product.id)
        db.add(card)
    card.template_id = payload.template_id
    card.draft_json = payload.presentation
    card.draft_revision = current_revision + 1
    card.drafted_by_id = actor.id
    _audit(db, request, actor, "product_card_draft_saved", product, {"revision": card.draft_revision})
    db.commit()
    db.refresh(card)
    return _detail(db, product, card)


@router.post("/{product_id}/publish", response_model=ProductCardDetail)
def publish_product_card(
    product_id: uuid.UUID,
    payload: ProductCardPublishPayload,
    request: Request,
    actor: User = Depends(require_permission("product_cards.publish")),
    db: Session = Depends(get_db),
) -> ProductCardDetail:
    product = _product(db, product_id, actor)
    card = db.scalar(select(GlobalProductCard).where(GlobalProductCard.product_id == product.id).with_for_update())
    if card is None or not card.draft_json:
        raise HTTPException(status_code=409, detail="Save a product-card draft before publishing.")
    if card.draft_revision != payload.revision:
        raise HTTPException(status_code=409, detail="This product card changed. Reload before publishing.")
    _template(db, card.template_id)
    next_version = card.active_version + 1
    now = datetime.now(UTC)
    card.published_json = dict(card.draft_json)
    card.active_version = next_version
    card.published_by_id = actor.id
    card.published_at = now
    db.add(GlobalProductCardVersion(
        card=card,
        template_id=card.template_id,
        version_number=next_version,
        presentation_json=dict(card.draft_json),
        change_note=payload.change_note,
        published_by_id=actor.id,
        published_at=now,
    ))
    affected = len(_catalogues(db, product.id))
    _audit(db, request, actor, "product_card_published", product, {"version": next_version, "affected_catalogues": affected})
    db.commit()
    db.refresh(card)
    return _detail(db, product, card)


@router.get("/{product_id}/versions", response_model=list[ProductCardVersionResponse])
def product_card_versions(
    product_id: uuid.UUID,
    actor: User = Depends(require_permission("product_cards.view")),
    db: Session = Depends(get_db),
) -> list[GlobalProductCardVersion]:
    product = _product(db, product_id, actor)
    card = db.scalar(select(GlobalProductCard).where(GlobalProductCard.product_id == product.id))
    if card is None:
        return []
    return list(db.scalars(
        select(GlobalProductCardVersion)
        .where(GlobalProductCardVersion.card_id == card.id)
        .order_by(GlobalProductCardVersion.version_number.desc())
    ))


@router.post("/{product_id}/restore/{version_id}", response_model=ProductCardDetail)
def restore_product_card(
    product_id: uuid.UUID,
    version_id: uuid.UUID,
    payload: ProductCardRestorePayload,
    request: Request,
    actor: User = Depends(require_permission("product_cards.publish")),
    db: Session = Depends(get_db),
) -> ProductCardDetail:
    product = _product(db, product_id, actor)
    card = db.scalar(select(GlobalProductCard).where(GlobalProductCard.product_id == product.id).with_for_update())
    if card is None:
        raise HTTPException(status_code=404, detail="Published product card not found.")
    source = db.scalar(select(GlobalProductCardVersion).where(
        GlobalProductCardVersion.id == version_id,
        GlobalProductCardVersion.card_id == card.id,
    ))
    if source is None:
        raise HTTPException(status_code=404, detail="Product-card version not found.")
    _template(db, source.template_id)
    next_version = card.active_version + 1
    now = datetime.now(UTC)
    card.template_id = source.template_id
    card.draft_json = dict(source.presentation_json)
    card.published_json = dict(source.presentation_json)
    card.draft_revision += 1
    card.active_version = next_version
    card.drafted_by_id = actor.id
    card.published_by_id = actor.id
    card.published_at = now
    db.add(GlobalProductCardVersion(
        card=card,
        template_id=source.template_id,
        version_number=next_version,
        presentation_json=dict(source.presentation_json),
        change_note=payload.change_note,
        published_by_id=actor.id,
        published_at=now,
    ))
    _audit(db, request, actor, "product_card_version_restored", product, {"source_version": source.version_number, "version": next_version})
    db.commit()
    db.refresh(card)
    return _detail(db, product, card)
