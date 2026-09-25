import base64
import csv
import hashlib
import io
import secrets
import uuid
from datetime import UTC, datetime
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.access import has_permission, has_record_access, is_superadmin, require_permission
from app.commerce_models import Catalogue, CatalogueAudienceType, PriceList
from app.config import settings
from app.database import get_db
from app.models import AuditLog, Brand, Department, Product, Team, User
from app.promotion_models import (
    Promotion,
    PromotionAudience,
    PromotionBrand,
    PromotionCatalogue,
    PromotionMedia,
    PromotionOccasion,
    PromotionShareLink,
    PromotionStatusHistory,
)
from app.promotion_schemas import (
    OccasionInput,
    OccasionResponse,
    OccasionUpdate,
    PromotionCreate,
    PromotionListPage,
    PromotionResponse,
    PromotionUpdate,
    PublicPromotionProduct,
    PublicPromotionResponse,
    ShareLinkCreate,
    ShareLinkResponse,
    WorkflowReason,
)
from app.promotion_service import (
    MATERIAL_FIELDS,
    as_utc,
    audit,
    conflicts_for,
    generate_code,
    get_promotion,
    now_utc,
    pages,
    prepare_for_publish,
    process_scheduled_promotions,
    promotion_query,
    promotion_response,
    replace_configuration,
    status_change,
    summary_counts,
)
from app.product_videos import normalize_external_video_url
from app.storage import promotion_storage, video_storage


router = APIRouter(prefix="/promotions", tags=["Promotions"])
public_router = APIRouter(prefix="/public/promotions", tags=["Public promotions"])
occasion_router = APIRouter(prefix="/promotion-occasions", tags=["Promotion occasions"])
report_router = APIRouter(prefix="/promotion-reports", tags=["Promotion reports"])
scheduler_router = APIRouter(prefix="/promotion-scheduler", tags=["Promotion scheduler"])


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",", 1)[0].strip() if forwarded else (request.client.host if request.client else None)


def _fernet() -> Fernet:
    digest = hashlib.sha256((settings.secret_key.get_secret_value() + ":promotion-share-links").encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _new_token() -> tuple[str, str, str]:
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest(), _fernet().encrypt(token.encode()).decode()


def _token(link: PromotionShareLink) -> str:
    try:
        return _fernet().decrypt(link.encrypted_token.encode()).decode()
    except (InvalidToken, ValueError) as error:
        raise HTTPException(status_code=500, detail="The promotion link must be regenerated.") from error


def _link_response(link: PromotionShareLink, expose: bool) -> ShareLinkResponse:
    return ShareLinkResponse(
        id=link.id, promotion_id=link.promotion_id, audience_type_id=link.audience_type_id,
        audience_name=link.audience_type.display_name, status=link.status,
        url=f"{settings.public_app_url.rstrip('/')}/p/{_token(link)}" if expose and link.status == "active" else None,
        expires_at=link.expires_at, allow_pdf=link.allow_pdf, allow_print=link.allow_print,
        view_count=link.view_count, created_at=link.created_at,
    )


def _occasion_response(item: PromotionOccasion) -> OccasionResponse:
    return OccasionResponse.model_validate(item, from_attributes=True)


def _assert_owner_or_all(actor: User, promotion: Promotion) -> None:
    if is_superadmin(actor) or has_permission(actor, "promotions.view_all") or promotion.owner_user_id == actor.id or promotion.created_by_id == actor.id:
        return
    raise HTTPException(status_code=403, detail="You do not have access to this promotion.")


@router.get("/metadata", response_model=dict)
def promotion_metadata(
    brand_id: int | None = None, q: str = "", category: str = "", page: int = Query(default=1, ge=1), page_size: int = Query(default=50, ge=1, le=200),
    actor: User = Depends(require_permission("promotions.view")), db: Session = Depends(get_db),
):
    brands = db.scalars(select(Brand).where(Brand.is_active.is_(True)).order_by(Brand.name)).all()
    product_query = select(Product).where(Product.status == "active")
    selected_brand = db.get(Brand, brand_id) if brand_id else None
    if selected_brand: product_query = product_query.where(func.lower(Product.brand) == selected_brand.name.casefold())
    if q.strip():
        pattern = f"%{q.strip()}%"; product_query = product_query.where(or_(Product.sku.ilike(pattern), Product.erp_name.ilike(pattern), Product.barcode.ilike(pattern)))
    if category.strip(): product_query = product_query.where(Product.erp_category == category.strip())
    total = db.scalar(select(func.count()).select_from(product_query.subquery())) or 0
    products = db.scalars(product_query.order_by(Product.erp_name).offset((page - 1) * page_size).limit(page_size)).all()
    audiences = db.scalars(select(CatalogueAudienceType).where(CatalogueAudienceType.is_active.is_(True)).order_by(CatalogueAudienceType.display_order)).all()
    price_lists = db.scalars(select(PriceList).where(PriceList.is_active.is_(True)).order_by(PriceList.name)).all()
    catalogues = db.scalars(select(Catalogue).order_by(Catalogue.title)).all()
    occasions = db.scalars(select(PromotionOccasion).where(PromotionOccasion.is_active.is_(True)).order_by(PromotionOccasion.display_order)).all()
    return {
        "brands": [{"id": row.id, "code": row.code, "name": row.name} for row in brands],
        "products": [{"id": str(row.id), "code": row.sku, "name": row.erp_name, "brand": row.brand, "category": row.erp_category, "barcode": row.barcode, "price": str(row.price) if row.price is not None else None, "stock": row.stock_quantity, "status": row.status, "image_url": row.images[0].public_url if row.images else None} for row in products],
        "product_total": total, "product_page": page, "product_pages": pages(total, page_size),
        "audiences": [{"id": row.id, "code": row.code, "name": row.display_name, "price_list_id": row.price_list_id, "show_prices": row.show_prices} for row in audiences],
        "price_lists": [{"id": row.id, "code": row.code, "name": row.name, "currency": row.currency, "is_no_price": row.is_no_price} for row in price_lists],
        "catalogues": [{"id": str(row.id), "title": row.title, "status": row.status} for row in catalogues],
        "occasions": [_occasion_response(row).model_dump(mode="json") for row in occasions],
        "departments": [{"id": row.id, "name": row.name} for row in db.scalars(select(Department).where(Department.is_active.is_(True)).order_by(Department.name))],
        "teams": [{"id": row.id, "name": row.name, "department_id": row.department_id} for row in db.scalars(select(Team).where(Team.is_active.is_(True)).order_by(Team.name))],
        "users": [{"id": str(row.id), "name": row.full_name} for row in db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name))],
    }


@router.get("", response_model=PromotionListPage)
def list_promotions(
    q: str = "", status_filter: str = Query(default="", alias="status"), brand_id: int | None = None,
    occasion_id: int | None = None, audience_id: int | None = None, active_now: bool = False,
    expiring_soon: bool = False, sort: str = "updated_desc", page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100), actor: User = Depends(require_permission("promotions.view")), db: Session = Depends(get_db),
) -> PromotionListPage:
    query = promotion_query().where(Promotion.deleted_at.is_(None))
    count_query = select(func.count(Promotion.id)).where(Promotion.deleted_at.is_(None))
    if not (is_superadmin(actor) or has_permission(actor, "promotions.view_all")):
        owner_filter = or_(Promotion.owner_user_id == actor.id, Promotion.created_by_id == actor.id)
        query = query.where(owner_filter); count_query = count_query.where(owner_filter)
    if q.strip():
        pattern = f"%{q.strip()}%"; clause = or_(Promotion.name_en.ilike(pattern), Promotion.name_th.ilike(pattern), Promotion.code.ilike(pattern)); query = query.where(clause); count_query = count_query.where(clause)
    if status_filter:
        statuses = ("draft", "pending_review", "rejected", "approved") if status_filter == "draft" else (status_filter,)
        query = query.where(Promotion.status.in_(statuses)); count_query = count_query.where(Promotion.status.in_(statuses))
    if occasion_id: query = query.where(Promotion.occasion_id == occasion_id); count_query = count_query.where(Promotion.occasion_id == occasion_id)
    if brand_id: query = query.join(PromotionBrand).where(PromotionBrand.brand_id == brand_id); count_query = count_query.join(PromotionBrand).where(PromotionBrand.brand_id == brand_id)
    if audience_id: query = query.join(PromotionAudience).where(PromotionAudience.audience_type_id == audience_id); count_query = count_query.join(PromotionAudience).where(PromotionAudience.audience_type_id == audience_id)
    now = now_utc()
    if active_now: query = query.where(Promotion.status == "active", Promotion.start_at <= now, Promotion.end_at > now); count_query = count_query.where(Promotion.status == "active", Promotion.start_at <= now, Promotion.end_at > now)
    if expiring_soon: query = query.where(Promotion.end_at > now, Promotion.end_at <= now + __import__("datetime").timedelta(days=7)); count_query = count_query.where(Promotion.end_at > now, Promotion.end_at <= now + __import__("datetime").timedelta(days=7))
    order = Promotion.start_at.asc() if sort == "start_asc" else (Promotion.name_en.asc() if sort == "name_asc" else Promotion.updated_at.desc())
    total = db.scalar(count_query) or 0
    rows = db.scalars(query.order_by(order).offset((page - 1) * page_size).limit(page_size)).unique().all()
    return PromotionListPage(items=[promotion_response(db, row) for row in rows], total=total, page=page, page_size=page_size, pages=pages(total, page_size), summary=summary_counts(db))


@router.post("", response_model=PromotionResponse, status_code=status.HTTP_201_CREATED)
def create_promotion(payload: PromotionCreate, request: Request, actor: User = Depends(require_permission("promotions.create")), db: Session = Depends(get_db)) -> PromotionResponse:
    code = payload.code.strip().upper() if payload.code else generate_code(db)
    scalar = payload.model_dump(exclude={"code", "owner_user_id", "discount_percent", "discount_amount", "promotion_price", "brand_rules", "products", "audiences", "catalogue_ids"})
    promotion = Promotion(code=code, **scalar, owner_user_id=payload.owner_user_id or actor.id, created_by_id=actor.id, updated_by_id=actor.id)
    try:
        db.add(promotion); db.flush(); replace_configuration(db, promotion, payload); status_change(db, promotion, "draft", actor.id, "Promotion created")
        audit(db, "promotion_created", promotion, actor.id, {"client_ip": _client_ip(request)}); db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(status_code=409, detail="Promotion code already exists.") from None
    return promotion_response(db, get_promotion(db, promotion.id), with_conflicts=True)


@router.get("/{promotion_id}", response_model=PromotionResponse)
def read_promotion(promotion_id: uuid.UUID, actor: User = Depends(require_permission("promotions.view")), db: Session = Depends(get_db)) -> PromotionResponse:
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion); return promotion_response(db, promotion, with_conflicts=True)


@router.post("/{promotion_id}/catalogues/{catalogue_id}", response_model=PromotionResponse)
def attach_promotion_to_catalogue(
    promotion_id: uuid.UUID,
    catalogue_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("promotions.edit")),
    db: Session = Depends(get_db),
) -> PromotionResponse:
    """Attach a reusable promotion without resetting its schedule or status."""
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion)
    catalogue = db.get(Catalogue, catalogue_id)
    if not catalogue:
        raise HTTPException(status_code=404, detail="Catalogue not found.")
    if not has_record_access(db, actor, "catalogues.edit", catalogue):
        raise HTTPException(status_code=403, detail="You do not have access to this catalogue.")
    if not any(item.catalogue_id == catalogue_id for item in promotion.catalogues):
        promotion.catalogues.append(PromotionCatalogue(catalogue_id=catalogue_id))
        promotion.updated_by_id = actor.id
        audit(db, "promotion_catalogue_attached", promotion, actor.id, {"catalogue_id": str(catalogue_id), "client_ip": _client_ip(request)})
        db.commit()
    return promotion_response(db, get_promotion(db, promotion.id), with_conflicts=True)


@router.delete("/{promotion_id}/catalogues/{catalogue_id}", response_model=PromotionResponse)
def detach_promotion_from_catalogue(
    promotion_id: uuid.UUID,
    catalogue_id: uuid.UUID,
    request: Request,
    actor: User = Depends(require_permission("promotions.edit")),
    db: Session = Depends(get_db),
) -> PromotionResponse:
    """Remove one catalogue placement while keeping the promotion reusable."""
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion)
    catalogue = db.get(Catalogue, catalogue_id)
    if not catalogue:
        raise HTTPException(status_code=404, detail="Catalogue not found.")
    if not has_record_access(db, actor, "catalogues.edit", catalogue):
        raise HTTPException(status_code=403, detail="You do not have access to this catalogue.")
    placement = next((item for item in promotion.catalogues if item.catalogue_id == catalogue_id), None)
    if placement:
        promotion.catalogues.remove(placement)
        promotion.updated_by_id = actor.id
        audit(db, "promotion_catalogue_detached", promotion, actor.id, {"catalogue_id": str(catalogue_id), "client_ip": _client_ip(request)})
        db.commit()
    return promotion_response(db, get_promotion(db, promotion.id), with_conflicts=True)


@router.patch("/{promotion_id}", response_model=PromotionResponse)
def update_promotion(promotion_id: uuid.UUID, payload: PromotionUpdate, request: Request, actor: User = Depends(require_permission("promotions.edit")), db: Session = Depends(get_db)) -> PromotionResponse:
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion)
    if promotion.status in {"cancelled", "expired"}: raise HTTPException(status_code=409, detail="Cancelled or expired promotions cannot be edited.")
    changes = payload.model_dump(exclude_unset=True)
    start_at = changes.get("start_at", promotion.start_at); end_at = changes.get("end_at", promotion.end_at)
    if as_utc(end_at) <= as_utc(start_at): raise HTTPException(status_code=422, detail="End date and time must be later than start date and time.")
    scope_keys = {"brand_rules", "products", "audiences", "catalogue_ids"}
    pricing_keys = {"discount_percent", "discount_amount", "promotion_price"}
    if (scope_keys | pricing_keys) & changes.keys():
        if not scope_keys.issubset(changes): raise HTTPException(status_code=422, detail="Send brands, products, audiences, and catalogues together when changing promotion scope or pricing.")
        complete = PromotionCreate(
            code=promotion.code,
            name_en=changes.get("name_en", promotion.name_en), name_th=changes.get("name_th", promotion.name_th), short_title=changes.get("short_title", promotion.short_title),
            description_en=changes.get("description_en", promotion.description_en), description_th=changes.get("description_th", promotion.description_th), occasion_id=changes.get("occasion_id", promotion.occasion_id),
            promotion_type=changes.get("promotion_type", promotion.promotion_type), discount_percent=changes.get("discount_percent"), discount_amount=changes.get("discount_amount"), promotion_price=changes.get("promotion_price"), priority=changes.get("priority", promotion.priority), allow_stacking=False,
            base_price_change_behavior=changes.get("base_price_change_behavior", promotion.base_price_change_behavior), owner_user_id=changes.get("owner_user_id", promotion.owner_user_id), department_id=changes.get("department_id", promotion.department_id), team_id=changes.get("team_id", promotion.team_id),
            start_at=start_at, end_at=end_at, timezone=changes.get("timezone", promotion.timezone), publish_at=changes.get("publish_at", promotion.publish_at), automatic_activation=changes.get("automatic_activation", promotion.automatic_activation), automatic_expiration=changes.get("automatic_expiration", promotion.automatic_expiration), repeat_annually=changes.get("repeat_annually", promotion.repeat_annually), expiration_warning_days=changes.get("expiration_warning_days", promotion.expiration_warning_days),
            show_stock=changes.get("show_stock", promotion.show_stock), hide_out_of_stock=changes.get("hide_out_of_stock", promotion.hide_out_of_stock), minimum_stock=changes.get("minimum_stock", promotion.minimum_stock), stop_product_at_zero_stock=changes.get("stop_product_at_zero_stock", promotion.stop_product_at_zero_stock), terms_en=changes.get("terms_en", promotion.terms_en), terms_th=changes.get("terms_th", promotion.terms_th), internal_note=changes.get("internal_note", promotion.internal_note), is_active=changes.get("is_active", promotion.is_active),
            brand_rules=changes["brand_rules"], products=changes["products"], audiences=changes["audiences"], catalogue_ids=changes["catalogue_ids"],
        )
        replace_configuration(db, promotion, complete)
    for field, value in changes.items():
        if field not in scope_keys | pricing_keys: setattr(promotion, field, value)
    material = bool(MATERIAL_FIELDS & changes.keys())
    if material and promotion.status not in {"draft", "rejected"}: status_change(db, promotion, "draft", actor.id, "Material change requires republishing"); promotion.published_at = None; promotion.approved_at = None; promotion.approved_by_user_id = None
    promotion.updated_by_id = actor.id; audit(db, "promotion_edited", promotion, actor.id, {"fields": sorted(changes), "client_ip": _client_ip(request)}); db.commit()
    return promotion_response(db, get_promotion(db, promotion.id), with_conflicts=True)


@router.delete("/{promotion_id}", status_code=204)
def delete_promotion(promotion_id: uuid.UUID, actor: User = Depends(require_permission("promotions.delete")), db: Session = Depends(get_db)) -> None:
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion)
    if promotion.status not in {"draft", "rejected", "pending_review", "approved", "cancelled"}: raise HTTPException(status_code=409, detail="Only unpublished or cancelled promotions can be deleted.")
    promotion.deleted_at = now_utc(); promotion.is_active = False; audit(db, "promotion_deleted", promotion, actor.id); db.commit()


@router.post("/{promotion_id}/duplicate", response_model=PromotionResponse, status_code=201)
def duplicate_promotion(promotion_id: uuid.UUID, actor: User = Depends(require_permission("promotions.duplicate")), db: Session = Depends(get_db)) -> PromotionResponse:
    source = get_promotion(db, promotion_id); _assert_owner_or_all(actor, source)
    payload = PromotionCreate(
        name_en=f"{source.name_en} Copy", name_th=source.name_th, short_title=source.short_title, description_en=source.description_en, description_th=source.description_th,
        occasion_id=source.occasion_id, promotion_type=source.promotion_type,
        discount_percent=next((row.discount_percent for row in source.products if row.discount_percent is not None), None),
        discount_amount=next((row.discount_amount for row in source.products if row.discount_amount is not None), None),
        promotion_price=next((row.promotion_price for row in source.products if row.promotion_type == "special_price" and row.promotion_price is not None), None),
        priority=source.priority, base_price_change_behavior=source.base_price_change_behavior,
        start_at=source.start_at, end_at=source.end_at, timezone=source.timezone, automatic_activation=source.automatic_activation, automatic_expiration=source.automatic_expiration,
        terms_en=source.terms_en, terms_th=source.terms_th, internal_note=source.internal_note,
        brand_rules=[{"brand_id": row.brand_id, "include_all_active_products": row.include_all_active_products} for row in source.brands],
        products=[{"product_id": row.product_id, "promotion_type": row.promotion_type, "discount_percent": row.discount_percent if row.promotion_type == "percentage" else None, "discount_amount": row.discount_amount if row.promotion_type == "fixed_amount" else None, "promotion_price": row.promotion_price if row.promotion_type == "special_price" else None, "include_in_promotion": row.include_in_promotion, "display_order": row.display_order} for index, row in enumerate(source.products) if row.product_id not in {previous.product_id for previous in source.products[:index]}],
        audiences=[{"audience_type_id": row.audience_type_id, "price_list_id": row.price_list_id, "show_prices": row.show_prices} for row in source.audiences], catalogue_ids=[row.catalogue_id for row in source.catalogues],
    )
    new = Promotion(code=generate_code(db), **payload.model_dump(exclude={"code", "owner_user_id", "discount_percent", "discount_amount", "promotion_price", "brand_rules", "products", "audiences", "catalogue_ids"}), owner_user_id=actor.id, created_by_id=actor.id, updated_by_id=actor.id)
    db.add(new); db.flush(); replace_configuration(db, new, payload); status_change(db, new, "draft", actor.id, f"Duplicated from {source.code}"); audit(db, "promotion_duplicated", new, actor.id, {"source_id": str(source.id)}); db.commit()
    return promotion_response(db, get_promotion(db, new.id))


def _workflow(promotion_id: uuid.UUID, action: str, payload: WorkflowReason, actor: User, db: Session) -> PromotionResponse:
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion); reason = payload.reason.strip()
    if action == "publish":
        if promotion.status not in {"draft", "rejected", "pending_review", "approved", "scheduled", "active"}: raise HTTPException(status_code=409, detail="Only an unpublished, scheduled, or active promotion can be published.")
        if as_utc(promotion.end_at) <= now_utc(): raise HTTPException(status_code=409, detail="An expired schedule cannot be published.")
        prepare_for_publish(db, promotion)
        next_status = "active" if as_utc(promotion.start_at) <= now_utc() else "scheduled"; status_change(db, promotion, next_status, actor.id, reason or "Published"); promotion.published_at = now_utc()
    elif action == "pause":
        if promotion.status not in {"scheduled", "active"}: raise HTTPException(status_code=409, detail="Only scheduled or active promotions can be paused.")
        promotion.paused_at = now_utc(); status_change(db, promotion, "paused", actor.id, reason or "Paused")
    elif action == "resume":
        if promotion.status != "paused": raise HTTPException(status_code=409, detail="Only paused promotions can be resumed.")
        if as_utc(promotion.end_at) <= now_utc(): status_change(db, promotion, "expired", actor.id, "Schedule ended while paused")
        else: status_change(db, promotion, "active" if as_utc(promotion.start_at) <= now_utc() else "scheduled", actor.id, reason or "Resumed")
    elif action == "cancel":
        if promotion.status in {"cancelled", "expired"}: raise HTTPException(status_code=409, detail="Promotion is already closed.")
        promotion.cancelled_at = now_utc(); promotion.is_active = False; status_change(db, promotion, "cancelled", actor.id, reason or "Cancelled")
    db.commit(); return promotion_response(db, get_promotion(db, promotion.id), with_conflicts=True)


@router.post("/{promotion_id}/publish", response_model=PromotionResponse)
def publish(promotion_id: uuid.UUID, payload: WorkflowReason, actor: User = Depends(require_permission("promotions.publish")), db: Session = Depends(get_db)): return _workflow(promotion_id, "publish", payload, actor, db)
@router.post("/{promotion_id}/pause", response_model=PromotionResponse)
def pause(promotion_id: uuid.UUID, payload: WorkflowReason, actor: User = Depends(require_permission("promotions.pause")), db: Session = Depends(get_db)): return _workflow(promotion_id, "pause", payload, actor, db)
@router.post("/{promotion_id}/resume", response_model=PromotionResponse)
def resume(promotion_id: uuid.UUID, payload: WorkflowReason, actor: User = Depends(require_permission("promotions.pause")), db: Session = Depends(get_db)): return _workflow(promotion_id, "resume", payload, actor, db)
@router.post("/{promotion_id}/cancel", response_model=PromotionResponse)
def cancel(promotion_id: uuid.UUID, payload: WorkflowReason, actor: User = Depends(require_permission("promotions.cancel")), db: Session = Depends(get_db)): return _workflow(promotion_id, "cancel", payload, actor, db)


@router.get("/{promotion_id}/preview", response_model=PromotionResponse)
def preview(promotion_id: uuid.UUID, actor: User = Depends(require_permission("promotions.preview")), db: Session = Depends(get_db)): promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion); return promotion_response(db, promotion, with_conflicts=True)
@router.get("/{promotion_id}/conflicts", response_model=list[dict])
def conflicts(promotion_id: uuid.UUID, actor: User = Depends(require_permission("promotions.view")), db: Session = Depends(get_db)): promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion); return conflicts_for(db, promotion)
@router.get("/{promotion_id}/history", response_model=list[dict])
def history(promotion_id: uuid.UUID, actor: User = Depends(require_permission("promotions.view")), db: Session = Depends(get_db)):
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion)
    return [{"id": str(row.id), "old_status": row.old_status, "new_status": row.new_status, "reason": row.reason, "changed_by_id": str(row.changed_by_id) if row.changed_by_id else None, "changed_at": row.changed_at.isoformat()} for row in db.scalars(select(PromotionStatusHistory).where(PromotionStatusHistory.promotion_id == promotion_id).order_by(PromotionStatusHistory.changed_at.desc()))]


@router.post("/{promotion_id}/media", response_model=PromotionResponse, status_code=201)
async def upload_media(
    promotion_id: uuid.UUID, request: Request, media_type: str = Form(...), alt_text: str = Form(default=""), external_url: str = Form(default=""), file: UploadFile | None = File(default=None),
    actor: User = Depends(require_permission("promotions.manage_media")), db: Session = Depends(get_db),
):
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion)
    allowed = {"banner", "mobile_banner", "brand_logo", "product_image", "video", "terms_pdf"}
    if media_type not in allowed: raise HTTPException(status_code=422, detail="Unsupported promotion media type.")
    if media_type in {"banner", "mobile_banner", "brand_logo", "video", "terms_pdf"}:
        for existing in db.scalars(select(PromotionMedia).where(PromotionMedia.promotion_id == promotion.id, PromotionMedia.media_type == media_type, PromotionMedia.is_active.is_(True))):
            existing.is_active = False
    row = PromotionMedia(promotion_id=promotion.id, media_type=media_type, alt_text=alt_text.strip(), uploaded_by_id=actor.id)
    saved_storage = None
    if external_url.strip():
        if media_type != "video": raise HTTPException(status_code=422, detail="External URLs are only supported for promotion videos.")
        _, _, normalized_url = normalize_external_video_url(external_url)
        row.external_url = normalized_url
    elif file:
        if media_type == "video":
            media = await video_storage.save_product_video(file, product_id=promotion.id)
        else:
            media = await promotion_storage.save_cover(file, folder=f"promotions/{promotion.id}/{media_type}")
            if media_type == "terms_pdf" and media.mime_type != "application/pdf": raise HTTPException(status_code=422, detail="Terms documents must be PDF files.")
        saved_storage = media.storage_key; row.storage_key = media.storage_key; row.preview_storage_key = media.preview_storage_key; row.original_filename = media.original_filename; row.mime_type = media.mime_type; row.file_size = media.file_size
    else: raise HTTPException(status_code=422, detail="Choose a file or enter an approved external video URL.")
    try:
        db.add(row); audit(db, "promotion_media_uploaded", promotion, actor.id, {"media_type": media_type, "client_ip": _client_ip(request)}); db.commit()
    except Exception:
        db.rollback()
        if saved_storage: (video_storage if media_type == "video" else promotion_storage).delete(saved_storage)
        raise
    return promotion_response(db, get_promotion(db, promotion.id))


@router.get("/{promotion_id}/media/{media_id}/content")
def media_content(promotion_id: uuid.UUID, media_id: uuid.UUID, actor: User = Depends(require_permission("promotions.view")), db: Session = Depends(get_db)):
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion); media = db.get(PromotionMedia, media_id)
    if not media or media.promotion_id != promotion_id or not media.is_active or not media.storage_key: raise HTTPException(status_code=404, detail="Promotion media not found.")
    store = video_storage if media.media_type == "video" else promotion_storage; path = store.resolve(media.storage_key)
    if not path.is_file(): raise HTTPException(status_code=404, detail="Promotion media file is unavailable.")
    return FileResponse(path, media_type=media.mime_type, content_disposition_type="inline", headers={"Cache-Control": "private, max-age=300"})


@router.delete("/{promotion_id}/media/{media_id}", status_code=204)
def delete_media(promotion_id: uuid.UUID, media_id: uuid.UUID, actor: User = Depends(require_permission("promotions.manage_media")), db: Session = Depends(get_db)):
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion); media = db.get(PromotionMedia, media_id)
    if not media or media.promotion_id != promotion_id: raise HTTPException(status_code=404, detail="Promotion media not found.")
    media.is_active = False; audit(db, "promotion_media_removed", promotion, actor.id, {"media_type": media.media_type}); db.commit()


@router.get("/{promotion_id}/share-links", response_model=list[ShareLinkResponse])
def list_links(promotion_id: uuid.UUID, actor: User = Depends(require_permission("promotions.manage_share_links")), db: Session = Depends(get_db)):
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion); rows = db.scalars(select(PromotionShareLink).where(PromotionShareLink.promotion_id == promotion_id).order_by(PromotionShareLink.created_at.desc())).all(); return [_link_response(row, True) for row in rows]


@router.post("/{promotion_id}/share-links", response_model=ShareLinkResponse, status_code=201)
def create_link(promotion_id: uuid.UUID, payload: ShareLinkCreate, actor: User = Depends(require_permission("promotions.manage_share_links")), db: Session = Depends(get_db)):
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion)
    if promotion.status not in {"scheduled", "active"}: raise HTTPException(status_code=409, detail="Publish the promotion before creating a public link.")
    if not any(row.audience_type_id == payload.audience_type_id for row in promotion.audiences): raise HTTPException(status_code=422, detail="This audience is not assigned to the promotion.")
    audience = db.get(CatalogueAudienceType, payload.audience_type_id); token, digest, encrypted = _new_token()
    link = PromotionShareLink(promotion_id=promotion.id, audience_type_id=audience.id, token_hash=digest, encrypted_token=encrypted, expires_at=payload.expires_at, allow_pdf=payload.allow_pdf, allow_print=payload.allow_print, created_by_id=actor.id)
    db.add(link); audit(db, "promotion_share_link_generated", promotion, actor.id, {"audience": audience.code}); db.commit(); db.refresh(link); return _link_response(link, True)


@router.post("/{promotion_id}/share-links/{link_id}/revoke", response_model=ShareLinkResponse)
def revoke_link(promotion_id: uuid.UUID, link_id: uuid.UUID, actor: User = Depends(require_permission("promotions.manage_share_links")), db: Session = Depends(get_db)):
    promotion = get_promotion(db, promotion_id); _assert_owner_or_all(actor, promotion); link = db.get(PromotionShareLink, link_id)
    if not link or link.promotion_id != promotion_id: raise HTTPException(status_code=404, detail="Promotion link not found.")
    link.status = "revoked"; link.revoked_at = now_utc(); audit(db, "promotion_share_link_revoked", promotion, actor.id, {"audience": link.audience_type.code}); db.commit(); return _link_response(link, False)


@report_router.get("/export.csv")
@router.get("/export/csv")
def export_promotions(actor: User = Depends(require_permission("promotions.export")), db: Session = Depends(get_db)):
    rows = db.scalars(promotion_query().where(Promotion.deleted_at.is_(None)).order_by(Promotion.updated_at.desc())).unique().all(); stream = io.StringIO(); writer = csv.writer(stream); writer.writerow(["Code", "Name", "Status", "Start", "End", "Brands", "Products", "Audiences"])
    for row in rows: writer.writerow([row.code, row.name_en, row.status, row.start_at.isoformat(), row.end_at.isoformat(), ", ".join(item.brand.name for item in row.brands), len(row.products), ", ".join(item.audience_type.display_name for item in row.audiences)])
    return StreamingResponse(iter([stream.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=promotions.csv"})


@scheduler_router.post("/run", response_model=dict)
@router.get("/worker/run", response_model=dict)
def run_schedule(_: User = Depends(require_permission("promotions.publish")), db: Session = Depends(get_db)): return process_scheduled_promotions(db)


@occasion_router.get("", response_model=list[OccasionResponse])
@router.get("/occasions/all", response_model=list[OccasionResponse])
def list_occasions(_: User = Depends(require_permission("promotion_occasions.view")), db: Session = Depends(get_db)): return [_occasion_response(row) for row in db.scalars(select(PromotionOccasion).order_by(PromotionOccasion.display_order, PromotionOccasion.name_en))]
@occasion_router.post("", response_model=OccasionResponse, status_code=201)
@router.post("/occasions", response_model=OccasionResponse, status_code=201)
def create_occasion(payload: OccasionInput, actor: User = Depends(require_permission("promotion_occasions.manage")), db: Session = Depends(get_db)):
    row = PromotionOccasion(**payload.model_dump(), created_by_id=actor.id, updated_by_id=actor.id); db.add(row)
    try: db.commit()
    except IntegrityError: db.rollback(); raise HTTPException(status_code=409, detail="Occasion code already exists.") from None
    return _occasion_response(row)
@occasion_router.patch("/{occasion_id}", response_model=OccasionResponse)
@router.patch("/occasions/{occasion_id}", response_model=OccasionResponse)
def update_occasion(occasion_id: int, payload: OccasionUpdate, actor: User = Depends(require_permission("promotion_occasions.manage")), db: Session = Depends(get_db)):
    row = db.get(PromotionOccasion, occasion_id)
    if not row: raise HTTPException(status_code=404, detail="Promotion occasion not found.")
    for field, value in payload.model_dump(exclude_unset=True).items(): setattr(row, field, value)
    row.updated_by_id = actor.id; db.commit(); return _occasion_response(row)


def _public_link(db: Session, token: str, request: Request) -> tuple[PromotionShareLink, PublicPromotionResponse]:
    if len(token) < 20: raise HTTPException(status_code=404, detail="Promotion link not found.")
    link = db.scalar(select(PromotionShareLink).where(PromotionShareLink.token_hash == hashlib.sha256(token.encode()).hexdigest()))
    if not link: raise HTTPException(status_code=404, detail="Promotion link not found.")
    now = now_utc()
    if link.status == "revoked": raise HTTPException(status_code=410, detail="This promotion link has been revoked.")
    if link.expires_at and as_utc(link.expires_at) <= now: link.status = "expired"; db.commit(); raise HTTPException(status_code=410, detail="This promotion link has expired.")
    promotion = get_promotion(db, link.promotion_id)
    if promotion.status != "active" or not promotion.is_active or not (as_utc(promotion.start_at) <= now < as_utc(promotion.end_at)): raise HTTPException(status_code=410, detail="This promotion is not currently active.")
    audience = next((row for row in promotion.audiences if row.audience_type_id == link.audience_type_id), None)
    if not audience: raise HTTPException(status_code=404, detail="Promotion audience is unavailable.")
    show_prices = audience.show_prices and audience.audience_type.show_prices and not bool(audience.price_list and audience.price_list.is_no_price)
    products = []
    seen = set()
    for row in sorted(promotion.products, key=lambda item: item.display_order):
        product = row.product
        if row.audience_type_id != audience.audience_type_id or not row.include_in_promotion or product.status != "active" or product.id in seen: continue
        if promotion.hide_out_of_stock and product.stock_quantity <= 0: continue
        if promotion.stop_product_at_zero_stock and product.stock_quantity <= 0: continue
        if product.stock_quantity < promotion.minimum_stock: continue
        seen.add(product.id); image_url = product.images[0].public_url if product.images else None
        products.append(PublicPromotionProduct(id=product.id, code=product.sku, name=product.erp_name, name_th=(product.catalogue_entry.display_name or None) if product.catalogue_entry else None, brand=product.brand, category=product.erp_category, image_url=image_url, stock=product.stock_quantity if promotion.show_stock else None, out_of_stock=product.stock_quantity <= 0, base_price=row.base_price if show_prices else None, promotion_price=row.promotion_price if show_prices else None, discount_percent=row.discount_percent if show_prices else None, currency=row.currency if show_prices else None, price_message=None if show_prices else "Special Promotion"))
    banner = next((row for row in promotion.media if row.is_active and row.media_type == "banner"), None); video = next((row for row in promotion.media if row.is_active and row.media_type == "video"), None)
    link.last_accessed_at = now; link.view_count += 1; db.add(AuditLog(action="public_promotion_opened", module="promotions", status="success", identifier=promotion.code, ip_address=_client_ip(request), user_agent=request.headers.get("user-agent", "")[:500], details={"promotion_id": str(promotion.id), "audience": audience.audience_type.code})); db.commit()
    video_url = None
    if video:
        video_url = video.external_url or (f"{settings.api_prefix}/v1/public/promotions/{token}/media/{video.id}" if video.storage_key else None)
    return link, PublicPromotionResponse(id=promotion.id, code=promotion.code, name_en=promotion.name_en, name_th=promotion.name_th, short_title=promotion.short_title, description_en=promotion.description_en, description_th=promotion.description_th, occasion_name=promotion.occasion.name_en if promotion.occasion else None, start_at=promotion.start_at, end_at=promotion.end_at, timezone=promotion.timezone, terms_en=promotion.terms_en, terms_th=promotion.terms_th, banner_url=promotion_storage.public_url(banner.preview_storage_key or banner.storage_key) if banner else None, video_url=video_url, audience=audience.audience_type.display_name, audience_code=audience.audience_type.code, show_prices=show_prices, allow_pdf=link.allow_pdf, allow_print=link.allow_print, products=products)


@public_router.get("/{token}", response_model=PublicPromotionResponse)
def public_promotion(token: str, request: Request, db: Session = Depends(get_db)): return _public_link(db, token, request)[1]


@public_router.get("/{token}/media/{media_id}")
def public_media(token: str, media_id: uuid.UUID, request: Request, db: Session = Depends(get_db)):
    link, _ = _public_link(db, token, request); media = db.get(PromotionMedia, media_id)
    if not media or media.promotion_id != link.promotion_id or not media.is_active or not media.storage_key: raise HTTPException(status_code=404, detail="Promotion media not found.")
    store = video_storage if media.media_type == "video" else promotion_storage; path = store.resolve(media.storage_key)
    if not path.is_file(): raise HTTPException(status_code=404, detail="Promotion media file is unavailable.")
    return FileResponse(path, media_type=media.mime_type, content_disposition_type="inline", headers={"Cache-Control": "public, max-age=300"})


@public_router.get("/{token}/pdf")
def public_pdf(token: str, request: Request, db: Session = Depends(get_db)):
    link, promotion = _public_link(db, token, request)
    if not link.allow_pdf: raise HTTPException(status_code=403, detail="PDF download is disabled for this promotion link.")
    output = io.BytesIO(); pdf = canvas.Canvas(output, pagesize=A4); width, height = A4; pdf.setFillColorRGB(0.05, 0.32, 0.19); pdf.rect(0, height - 150, width, 150, fill=1, stroke=0); pdf.setFillColorRGB(1, 1, 1); pdf.setFont("Helvetica-Bold", 22); pdf.drawString(42, height - 70, promotion.name_en[:55]); pdf.setFont("Helvetica", 10); pdf.drawString(42, height - 95, f"Valid {promotion.start_at:%d %b %Y} - {promotion.end_at:%d %b %Y}"); y = height - 185; pdf.setFillColorRGB(0, 0, 0)
    for item in promotion.products:
        if y < 60: pdf.showPage(); y = height - 50
        pdf.setFont("Helvetica-Bold", 10); pdf.drawString(42, y, f"{item.code}  {item.name[:55]}"); pdf.setFont("Helvetica", 9)
        price = f"{item.currency} {item.promotion_price:,.2f}" if promotion.show_prices and item.promotion_price is not None else (item.price_message or "Special Promotion"); pdf.drawRightString(width - 42, y, price); y -= 22
    pdf.save(); output.seek(0); db.add(AuditLog(action="promotion_pdf_downloaded", module="promotions", status="success", identifier=promotion.code, details={"promotion_id": str(promotion.id), "audience": promotion.audience_code})); db.commit()
    return StreamingResponse(output, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{promotion.code}.pdf"'})
