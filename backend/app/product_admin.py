import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import is_superadmin, require_permission, require_superadmin
from app.catalogue import _get_product, _product_detail, _require_product_access, list_products
from app.catalogue_schemas import ProductDetail, ProductPage, ProductStatusHistoryResponse, ProductStatusUpdate
from app.commerce_models import Catalogue, CatalogueProduct
from app.database import get_db
from app.models import AuditLog, ProductStatusHistory, User
from app.catalogue_lifecycle import reconcile_erp_catalogue_membership


router = APIRouter(prefix="/products", tags=["Product administration"])

INACTIVE_REASONS = {
    "discontinued", "temporarily_unavailable", "replaced", "no_longer_supplied",
    "duplicate", "incomplete_information", "other",
}


@router.get("", response_model=ProductPage)
def products_index(
    status: str | None = Query(default=None, pattern="^(active|inactive|all)$"),
    workflow_status: str | None = Query(default=None, pattern="^(draft|in_review|approved|published)$"),
    q: str = Query(default="", max_length=120),
    brand: str | None = Query(default=None, max_length=120),
    category_id: int | None = None,
    needs: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=100),
    actor: User = Depends(require_permission("products.view")),
    db: Session = Depends(get_db),
) -> ProductPage:
    return list_products(q=q, workflow_status=workflow_status, brand=brand, category_id=category_id, needs=needs, product_status=status, page=page, page_size=page_size, user=actor, db=db)


@router.get("/{product_id}", response_model=ProductDetail)
def product_detail(product_id: uuid.UUID, actor: User = Depends(require_permission("products.view")), db: Session = Depends(get_db)) -> ProductDetail:
    product = _get_product(db, product_id)
    _require_product_access(db, actor, "products.view", product)
    if product.status == "inactive" and not is_superadmin(actor):
        raise HTTPException(status_code=404, detail="Product not found.")
    return _product_detail(product)


@router.get("/{product_id}/status-history", response_model=list[ProductStatusHistoryResponse])
def product_status_history(product_id: uuid.UUID, actor: User = Depends(require_superadmin), db: Session = Depends(get_db)) -> list[ProductStatusHistoryResponse]:
    product = _get_product(db, product_id)
    _require_product_access(db, actor, "products.view", product)
    return [ProductStatusHistoryResponse.model_validate(item, from_attributes=True) for item in product.status_history]


@router.patch("/{product_id}/status", response_model=ProductDetail)
def change_product_status(
    product_id: uuid.UUID,
    payload: ProductStatusUpdate,
    request: Request,
    actor: User = Depends(require_superadmin),
    db: Session = Depends(get_db),
) -> ProductDetail:
    product = _get_product(db, product_id)
    # change_status is the mutation permission; products.view supplies the
    # product data-scope check without requiring unrelated content-edit rights.
    _require_product_access(db, actor, "products.view", product)
    old_status = product.status
    if old_status == payload.status:
        return _product_detail(product)
    if payload.status == "inactive":
        if payload.reason not in INACTIVE_REASONS:
            raise HTTPException(status_code=422, detail="Select a valid inactive reason.")
        if payload.reason == "other" and not payload.note:
            raise HTTPException(status_code=422, detail="Describe why this product is being marked inactive.")
    now = datetime.now(UTC)
    if payload.status == "inactive":
        product.inactive_reason = payload.reason
        product.inactive_note = payload.note
        product.inactivated_at = now
        product.inactivated_by_user_id = actor.id
    else:
        product.reactivated_at = now
        product.reactivated_by_user_id = actor.id
    product.status = payload.status
    product.lifecycle_status_source = "manual"
    product.status_updated_at = now
    db.add(ProductStatusHistory(product_id=product.id, old_status=old_status, new_status=payload.status, reason=payload.reason, note=payload.note, changed_by_user_id=actor.id, changed_at=now))
    db.flush()
    affected_ids = list(db.scalars(select(CatalogueProduct.catalogue_id).where(CatalogueProduct.product_id == product.id).distinct()))
    if affected_ids:
        for catalogue in db.scalars(select(Catalogue).where(Catalogue.id.in_(affected_ids))):
            catalogue.updated_at = now
    catalogue_membership = reconcile_erp_catalogue_membership(
        db,
        actor_id=actor.id,
        product_ids={product.id},
    )
    db.add(AuditLog(
        user_id=actor.id,
        action="product_marked_inactive" if payload.status == "inactive" else "product_reactivated",
        module="products",
        status="success",
        identifier=product.sku,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details={"product_id": str(product.id), "product_code": product.sku, "old_status": old_status, "new_status": payload.status, "reason": payload.reason, "note": payload.note, "request_id": request.headers.get("x-request-id"), "affected_catalogue_ids": [str(value) for value in affected_ids], "catalogue_membership": catalogue_membership},
    ))
    db.commit()
    return _product_detail(_get_product(db, product.id))
