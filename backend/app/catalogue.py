import re
import uuid
from datetime import UTC, datetime, timedelta
from math import ceil
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import and_, case, delete, false, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, noload, selectinload

from app.access import (
    allowed_price_list_ids,
    assigned_product_ids,
    assigned_category_ids,
    allowed_brand_names,
    effective_permission_access,
    effective_permission_names,
    has_permission,
    has_record_access,
    is_superadmin,
    require_permission,
)
from app.auth import get_current_user
from app.catalogue_schemas import (
    ActivityResponse,
    CatalogueContentUpdate,
    CatalogueStats,
    CategoryCreate,
    CategoryResponse,
    CategoryUpdate,
    ImageResponse,
    ErpSyncRequest,
    ErpSyncResponse,
    ProductCreate,
    ProductDetail,
    ProductListItem,
    ProductMasterUpdate,
    ProductPage,
    WorkflowResponse,
)
from app.config import settings
from app.commerce_models import (
    CatalogueAudienceType,
    CatalogueProduct,
    PriceChangeRequest,
    PriceList,
    ProductPrice,
    UserCataloguePriceMapping,
)
from app.database import get_db
from app.erp_models import ErpCustomerPriceLevel, ErpProductCustomerPrice, ErpSyncRun
from app.models import (
    AuditLog,
    Brand,
    CatalogueEntry,
    Category,
    Product,
    ProductImage,
    ProductVideo,
    ProductStatusHistory,
    User,
    product_categories,
)
from app.product_content import (
    catalogue_long_description,
    catalogue_short_description,
    erp_details,
)
from app.product_videos import video_response
from app.promotion_models import PromotionPriceHistory, PromotionProduct
from app.storage import video_storage


router = APIRouter(prefix="/catalogue", tags=["Catalogue"])

EDITOR_ROLES = {
    "system_user",
    "catalogue_editor",
    "catalogue_approver",
    "catalogue_admin",
    "superadmin",
}
APPROVER_ROLES = {"catalogue_approver", "catalogue_admin", "superadmin"}
ADMIN_ROLES = {"catalogue_admin", "superadmin"}
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _has_catalogue_description():
    """SQL expression matching the ERP fallback used by product_content."""
    pos_name = func.trim(func.coalesce(Product.erp_pos_name, ""))
    english_name = func.trim(func.coalesce(Product.erp_name, ""))
    thai_name = func.trim(func.coalesce(Product.erp_name_th, ""))
    useful_pos_name = and_(
        pos_name != "",
        func.lower(pos_name) != func.lower(english_name),
        func.lower(pos_name) != func.lower(thai_name),
    )
    useful_warranty = and_(
        Product.warranty_description.is_not(None),
        func.lower(func.trim(Product.warranty_description)) != "none",
    )
    return or_(
        CatalogueEntry.short_description != "",
        Product.erp_description_en.is_not(None),
        Product.erp_description_th.is_not(None),
        useful_pos_name,
        Product.erp_remark.is_not(None),
        Product.erp_how_to_use.is_not(None),
        Product.size_width.is_not(None),
        Product.size_length.is_not(None),
        Product.size_height.is_not(None),
        Product.gross_weight.is_not(None),
        Product.net_weight.is_not(None),
        Product.pack_size.is_not(None),
        useful_warranty,
    )


def _role_names(user: User) -> set[str]:
    return {role.name for role in user.roles}


def _permission_names(user: User) -> set[str]:
    return effective_permission_names(user)


def require_editor(user: User = Depends(get_current_user)) -> User:
    if not has_permission(user, "products.edit"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to edit catalogue content.",
        )
    return user


def require_viewer(user: User = Depends(get_current_user)) -> User:
    if not has_permission(user, "products.view"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Catalogue viewing permission is required.",
        )
    return user


def require_approver(user: User = Depends(get_current_user)) -> User:
    if not (has_permission(user, "catalogues.approve") or has_permission(user, "catalogues.publish")):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An approver role is required for this action.",
        )
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not _role_names(user).intersection(ADMIN_ROLES):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="An administrator role is required for this action.",
        )
    return user


def require_audit_viewer(user: User = Depends(get_current_user)) -> User:
    if (
        "superadmin" not in _role_names(user)
        and "audit.view" not in _permission_names(user)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Audit viewing permission is required.",
        )
    return user


def _brand_scope(user: User, *, manage: bool, db: Session | None = None) -> set[str] | None:
    if is_superadmin(user):
        return None
    allowed_brands = {
        brand.name
        for team in user.teams
        for brand in team.brands
        if brand.is_active and team.is_active
    }
    if db is not None:
        allowed_brands.update(allowed_brand_names(db, user, edit=manage))
    profile = user.organization_profile
    if profile and profile.department:
        allowed_brands.update(
            rule.brand.name
            for rule in profile.department.brand_access_rules
            if rule.brand.is_active
            and (rule.can_manage if manage else rule.can_view)
        )
    return allowed_brands


def _product_scope_filter(db: Session, user: User, permission_code: str):
    """Build the same row policy used by detail routes before pagination/counting."""

    access = effective_permission_access(db, user, permission_code)
    if not access.allowed:
        return false()
    if "all" in access.scopes or is_superadmin(user):
        condition = None
    else:
        conditions = []
        scopes = access.scopes - {"none"}
        if "assigned_brands" in scopes or "department" in scopes:
            brands = _brand_scope(user, manage=permission_code != "products.view", db=db) or set()
            if brands:
                conditions.append(func.lower(Product.brand).in_({brand.casefold() for brand in brands}))
        if "assigned_products" in scopes:
            product_ids = assigned_product_ids(db, user, edit=permission_code != "products.view")
            if product_ids:
                conditions.append(Product.id.in_(product_ids))
        if "assigned_categories" in scopes:
            category_ids = assigned_category_ids(db, user, edit=permission_code != "products.view")
            if category_ids:
                conditions.append(
                    select(product_categories.c.product_id)
                    .where(
                        product_categories.c.product_id == Product.id,
                        product_categories.c.category_id.in_(category_ids),
                    )
                    .exists()
                )
        if "own" in scopes:
            conditions.append(CatalogueEntry.updated_by_id == user.id)
        condition = or_(*conditions) if conditions else false()
    if (
        user.data_scope
        and user.data_scope.published_only
        and "all" not in access.scopes
        and not is_superadmin(user)
    ):
        published = CatalogueEntry.workflow_status == "published"
        return published if condition is None else condition & published
    return condition


def _require_product_access(
    db: Session,
    user: User,
    permission_code: str,
    product: Product,
) -> None:
    if not has_record_access(db, user, permission_code, product):
        # A hidden record is indistinguishable from a missing record.
        raise HTTPException(status_code=404, detail="Product not found.")


def _require_brand_access(
    user: User,
    product: Product,
    *,
    manage: bool,
) -> None:
    scope = _brand_scope(user, manage=manage)
    if scope is None:
        return
    normalized_scope = {brand.casefold() for brand in scope}
    if not product.brand or product.brand.casefold() not in normalized_scope:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Your department or teams are not permitted to manage this brand."
                if manage
                else "This brand is hidden from your department and teams."
            ),
        )


def _client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",", maxsplit=1)[0].strip()
    return request.client.host if request.client else None


def _audit(
    db: Session,
    request: Request,
    user: User,
    *,
    action: str,
    product: Product | None = None,
    status_value: str = "success",
    details: dict | None = None,
) -> None:
    combined_details = dict(details or {})
    if product:
        combined_details.update(
            {
                "product_id": str(product.id),
                "sku": product.sku,
                "product_name": product.erp_name,
            }
        )
    db.add(
        AuditLog(
            user_id=user.id,
            action=action,
            module="catalogue",
            status=status_value,
            identifier=product.sku if product else None,
            ip_address=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
            details=combined_details or None,
        )
    )


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    return slug or f"category-{uuid.uuid4().hex[:8]}"


def _entry_for(product: Product) -> CatalogueEntry:
    if product.catalogue_entry is None:
        product.catalogue_entry = CatalogueEntry()
    return product.catalogue_entry


def _primary_image(product: Product) -> ProductImage | None:
    return next(
        (image for image in product.images if image.is_primary),
        product.images[0] if product.images else None,
    )


def _category_response(
    category: Category,
    brand_master_by_name: dict[str, Brand] | None = None,
) -> CategoryResponse:
    brand_counts: dict[str, int] = {}
    for product in category.products:
        brand_name = (product.brand or "").strip()
        if brand_name:
            brand_counts[brand_name] = brand_counts.get(brand_name, 0) + 1
    return CategoryResponse(
        id=category.id,
        name=category.name,
        slug=category.slug,
        description=category.description,
        is_active=category.is_active,
        inactive_reason=category.inactive_reason,
        product_count=len(category.products),
        brands=[
            {
                "name": name,
                "product_count": count,
                "id": (
                    brand_master_by_name[name.casefold()].id
                    if brand_master_by_name and name.casefold() in brand_master_by_name
                    else None
                ),
                "is_active": (
                    brand_master_by_name[name.casefold()].is_active
                    if brand_master_by_name and name.casefold() in brand_master_by_name
                    else True
                ),
                "inactive_reason": (
                    brand_master_by_name[name.casefold()].inactive_reason
                    if brand_master_by_name and name.casefold() in brand_master_by_name
                    else ""
                ),
            }
            for name, count in sorted(
                brand_counts.items(), key=lambda item: item[0].casefold()
            )
        ],
    )


def _image_response(image: ProductImage) -> ImageResponse:
    return ImageResponse(
        id=image.id,
        file_name=image.file_name,
        public_url=image.public_url,
        content_type=image.content_type,
        alt_text=image.alt_text,
        sort_order=image.sort_order,
        is_primary=image.is_primary,
        created_at=image.created_at,
    )


def _product_list_item(
    product: Product,
    actor: User | None = None,
    *,
    selected_price: ErpProductCustomerPrice | None = None,
    selected_level: ErpCustomerPriceLevel | None = None,
    selected_price_list_name: str | None = None,
    customer_pricing_selected: bool = False,
) -> ProductListItem:
    entry = _entry_for(product)
    primary_image = _primary_image(product)
    ordered_images = ([primary_image] if primary_image else []) + [
        image for image in product.images if image is not primary_image
    ]
    return ProductListItem(
        id=product.id,
        sku=product.sku,
        erp_name=product.erp_name,
        display_name=entry.display_name,
        brand=product.brand,
        price=selected_price.amount if selected_level and selected_price else (
            None if customer_pricing_selected else product.price
        ),
        stock_quantity=product.stock_quantity,
        product_status=product.status,
        inactive_reason=product.inactive_reason,
        inactive_note=product.inactive_note,
        status_updated_at=product.status_updated_at,
        stock_last_synced_at=product.stock_last_synced_at,
        price_last_synced_at=product.price_last_synced_at,
        source_sync_status=product.source_sync_status,
        source_record_exists=product.source_record_exists,
        is_discontinued=product.is_discontinued,
        lifecycle_status_source=product.lifecycle_status_source,
        legacy_catalogue_present=product.legacy_catalogue_present,
        workflow_status=entry.workflow_status,
        visibility=entry.visibility,
        is_featured=entry.is_featured,
        short_description=catalogue_short_description(product, entry),
        primary_image_url=primary_image.public_url if primary_image else None,
        image_urls=[image.public_url for image in ordered_images],
        price_level_code=(
            None
            if customer_pricing_selected
            else selected_level.source_code if selected_level else "SP1"
        ),
        price_list_name=(
            selected_price_list_name
            if customer_pricing_selected or selected_level
            else "Normal"
        ),
        price_currency=selected_price.currency if selected_price else "THB",
        category_names=sorted(category.name for category in product.categories),
        updated_at=entry.updated_at or product.created_at,
        has_video=bool(actor and has_permission(actor, "product_videos.view") and any(
            video.deleted_at is None and video.is_active and (
                has_permission(actor, "product_videos.edit")
                or (video.show_in_catalogue and entry.workflow_status == "published" and entry.visibility == "public")
            ) for video in product.videos
        )),
    )


def _product_detail(product: Product, actor: User | None = None) -> ProductDetail:
    entry = _entry_for(product)
    list_item = _product_list_item(product, actor)
    return ProductDetail(
        **list_item.model_dump(),
        barcode=product.barcode,
        unit=product.unit,
        erp_category=product.erp_category,
        erp_name_th=product.erp_name_th,
        erp_pos_name=product.erp_pos_name,
        erp_description_en=product.erp_description_en,
        erp_description_th=product.erp_description_th,
        erp_how_to_use=product.erp_how_to_use,
        erp_remark=product.erp_remark,
        size_width=product.size_width,
        size_length=product.size_length,
        size_height=product.size_height,
        gross_weight=product.gross_weight,
        net_weight=product.net_weight,
        pack_size=product.pack_size,
        warranty_description=product.warranty_description,
        warranty_days=product.warranty_days,
        erp_details=erp_details(product),
        erp_updated_at=product.erp_updated_at,
        legacy_catalogue_synced_at=product.legacy_catalogue_synced_at,
        long_description=catalogue_long_description(product, entry),
        seo_title=entry.seo_title,
        seo_description=entry.seo_description or catalogue_short_description(product, entry),
        version=entry.version,
        submitted_at=entry.submitted_at,
        approved_at=entry.approved_at,
        published_at=entry.published_at,
        categories=[_category_response(category) for category in product.categories],
        images=[_image_response(image) for image in product.images],
        videos=[video_response(video) for video in product.videos if video.deleted_at is None and actor is not None and has_permission(actor, "product_videos.view") and (has_permission(actor, "product_videos.edit") or has_permission(actor, "product_videos.view_inactive") or (video.is_active and video.show_in_catalogue and entry.workflow_status == "published" and entry.visibility == "public"))],
        inactivated_at=product.inactivated_at,
        reactivated_at=product.reactivated_at,
        status_history=[
            {
                "id": item.id,
                "old_status": item.old_status,
                "new_status": item.new_status,
                "reason": item.reason,
                "note": item.note,
                "changed_by_user_id": item.changed_by_user_id,
                "changed_at": item.changed_at,
            }
            for item in product.status_history
        ],
        catalogue_assignments=[
            {"id": str(link.catalogue.id), "title": link.catalogue.title, "status": link.catalogue.status}
            for link in product.catalogue_links
        ],
    )


def _product_query():
    return select(Product).options(
        selectinload(Product.catalogue_entry),
        selectinload(Product.categories).selectinload(Category.products),
        selectinload(Product.images),
        selectinload(Product.videos).selectinload(ProductVideo.uploaded_by),
        selectinload(Product.status_history),
        selectinload(Product.catalogue_links).selectinload(CatalogueProduct.catalogue),
    )


def _product_list_query():
    """Load only relationships required by ``ProductListItem``.

    The editor/detail query deliberately loads history, catalogue assignments,
    upload users and the products attached to every category. Reusing that query
    for a 20-row list caused SQLAlchemy to hydrate a large part of the ERP product
    table on every dashboard visit.
    """

    return select(Product).options(
        selectinload(Product.catalogue_entry),
        selectinload(Product.categories),
        selectinload(Product.images),
        selectinload(Product.videos),
        noload(Product.status_history),
        noload(Product.warehouse_stocks),
        noload(Product.catalogue_links),
    )


def _get_product(db: Session, product_id: uuid.UUID) -> Product:
    product = db.scalar(_product_query().where(Product.id == product_id))
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )
    return product


def _ensure_brand(db: Session, brand_name: str | None) -> None:
    if not brand_name or db.scalar(
        select(Brand).where(func.lower(Brand.name) == brand_name.casefold())
    ):
        return
    base_code = re.sub(
        r"[^A-Z0-9]+",
        "_",
        brand_name.upper(),
    ).strip("_")[:24] or "BRAND"
    code = base_code
    suffix = 2
    while db.scalar(select(Brand.id).where(Brand.code == code)):
        code = f"{base_code[:25]}_{suffix}"
        suffix += 1
    db.add(
        Brand(
            name=brand_name,
            code=code,
            description=f"Brand created from product master data: {brand_name}.",
        )
    )


@router.post("/erp/sync", response_model=ErpSyncResponse)
def sync_erp_products(
    payload: ErpSyncRequest,
    request: Request,
    user: User = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db),
) -> ErpSyncResponse:
    """Upsert ERP-owned fields without modifying catalogue-owned content."""

    incoming_skus = [record.sku.casefold() for record in payload.products]
    existing_products = list(
        db.scalars(
            select(Product)
            .options(selectinload(Product.catalogue_entry))
            .where(func.lower(Product.sku).in_(incoming_skus))
        )
    )
    by_sku = {product.sku.casefold(): product for product in existing_products}
    created = 0
    updated = 0

    for record in payload.products:
        product = by_sku.get(record.sku.casefold())
        if product is None:
            product = Product(
                sku=record.sku,
                erp_name=record.erp_name,
                catalogue_entry=CatalogueEntry(),
            )
            db.add(product)
            by_sku[record.sku.casefold()] = product
            created += 1
        else:
            updated += 1

        product.erp_name = record.erp_name
        # Partial ERP payloads update only the fields supplied by the caller.
        # This allows safe product-code/name imports without clearing existing
        # brand, barcode, pricing, inventory or category data.
        supplied_fields = record.model_fields_set
        for field_name in (
            "brand",
            "barcode",
            "unit",
            "erp_category",
            "price",
            "stock_quantity",
            "is_discontinued",
        ):
            if field_name in supplied_fields:
                setattr(product, field_name, getattr(record, field_name))
        if "erp_updated_at" in supplied_fields:
            product.erp_updated_at = record.erp_updated_at or datetime.now(UTC)

    _audit(
        db,
        request,
        user,
        action="erp_products_synchronized",
        details={
            "created": created,
            "updated": updated,
            "record_count": len(payload.products),
        },
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The ERP payload contains a barcode or SKU already in use.",
        ) from None
    return ErpSyncResponse(
        message="ERP product synchronization completed.",
        created=created,
        updated=updated,
    )


@router.get("/stats", response_model=CatalogueStats)
def stats(
    user: User = Depends(require_permission("dashboard.view")),
    db: Session = Depends(get_db),
) -> CatalogueStats:
    scope_filter = _product_scope_filter(db, user, "products.view")
    products_with_images = (
        select(ProductImage.product_id.label("product_id"))
        .group_by(ProductImage.product_id)
        .subquery()
    )
    products_with_categories = (
        select(product_categories.c.product_id.label("product_id"))
        .group_by(product_categories.c.product_id)
        .subquery()
    )
    has_image = products_with_images.c.product_id.is_not(None)
    has_category = products_with_categories.c.product_id.is_not(None)
    # Catalogue copy falls back to the synchronized ERP description whenever
    # an editor has not supplied an override. Readiness and missing-content
    # queues must use the same rule as the product response and PDF renderer.
    has_description = _has_catalogue_description()
    can_view_inactive = is_superadmin(user)
    data_sync_allowed = has_permission(user, "data_sync.view")
    stale_cutoff = datetime.now(UTC) - timedelta(seconds=settings.product_sync_stale_warning_seconds)
    active = Product.status == "active"
    workflow_scope = Product.status.in_(("active", "inactive")) if can_view_inactive else active
    count_when = lambda condition: func.coalesce(
        func.sum(case((condition, 1), else_=0)), 0
    )
    aggregate_query = select(
        count_when(active).label("active_total"),
        count_when(Product.status == "inactive").label("inactive_total"),
        count_when(and_(workflow_scope, CatalogueEntry.workflow_status == "draft")).label("draft"),
        count_when(and_(workflow_scope, CatalogueEntry.workflow_status == "in_review")).label("in_review"),
        count_when(and_(workflow_scope, CatalogueEntry.workflow_status == "approved")).label("approved"),
        count_when(and_(workflow_scope, CatalogueEntry.workflow_status == "published")).label("published"),
        count_when(and_(workflow_scope, CatalogueEntry.visibility == "hidden")).label("hidden"),
        count_when(and_(active, ~has_image)).label("missing_images"),
        count_when(and_(active, ~has_description)).label("missing_descriptions"),
        count_when(and_(active, ~has_category)).label("missing_categories"),
        # Every synchronized ERP product is catalogue-ready by source
        # authority. Lifecycle state remains a separate Active/Inactive badge.
        # Missing content remains visible in the quality counters above.
        count_when(
            and_(
                workflow_scope,
                Product.source_system == "gms_erp",
                Product.source_record_exists.is_(True),
            )
        ).label("ready_products"),
        count_when(Product.source_record_exists.is_(False)).label("products_missing_from_source"),
        count_when(and_(active, or_(Product.stock_last_synced_at.is_(None), Product.stock_last_synced_at < stale_cutoff))).label("products_with_stale_stock"),
        count_when(and_(active, or_(Product.price_last_synced_at.is_(None), Product.price_last_synced_at < stale_cutoff))).label("products_with_stale_prices"),
    ).select_from(Product).join(CatalogueEntry).outerjoin(
        products_with_images,
        products_with_images.c.product_id == Product.id,
    ).outerjoin(
        products_with_categories,
        products_with_categories.c.product_id == Product.id,
    )
    if scope_filter is not None:
        aggregate_query = aggregate_query.where(scope_filter)
    metrics = db.execute(aggregate_query).one()
    active_total = int(metrics.active_total)
    inactive_total = int(metrics.inactive_total) if can_view_inactive else None
    total = active_total + (inactive_total or 0)

    current_sync_status = last_successful_sync_at = last_failed_sync_at = None
    if data_sync_allowed:
        sync_type_filter = ErpSyncRun.sync_type == "product_source_data"
        latest_status_query = (
            select(ErpSyncRun.status)
            .where(sync_type_filter)
            .order_by(ErpSyncRun.started_at.desc())
            .limit(1)
            .scalar_subquery()
        )
        sync_summary = db.execute(
            select(
                latest_status_query.label("current_status"),
                func.max(
                    case(
                        (ErpSyncRun.status.in_(("completed", "completed_with_warnings")), ErpSyncRun.completed_at)
                    )
                ).label("last_successful"),
                func.max(
                    case((ErpSyncRun.status == "failed", ErpSyncRun.completed_at))
                ).label("last_failed"),
            ).where(sync_type_filter)
        ).one()
        current_sync_status = sync_summary.current_status
        last_successful_sync_at = sync_summary.last_successful
        last_failed_sync_at = sync_summary.last_failed
    return CatalogueStats(
        total_products=total,
        active_products=active_total,
        inactive_products=inactive_total,
        products_missing_from_source=(
            int(metrics.products_missing_from_source)
            if data_sync_allowed
            else None
        ),
        products_with_stale_stock=(
            int(metrics.products_with_stale_stock)
            if data_sync_allowed else None
        ),
        products_with_stale_prices=(
            int(metrics.products_with_stale_prices)
            if data_sync_allowed else None
        ),
        current_sync_status=current_sync_status,
        last_successful_sync=last_successful_sync_at,
        last_failed_sync=last_failed_sync_at,
        draft=int(metrics.draft),
        in_review=int(metrics.in_review),
        approved=int(metrics.approved),
        published=int(metrics.published),
        hidden=int(metrics.hidden),
        missing_images=int(metrics.missing_images),
        missing_descriptions=int(metrics.missing_descriptions),
        missing_categories=int(metrics.missing_categories),
        ready_products=int(metrics.ready_products),
        completion_rate=round(
            (int(metrics.ready_products) / total * 100) if total else 0, 2
        ),
    )


@router.get("/products", response_model=ProductPage)
def list_products(
    q: str = Query(default="", max_length=120),
    workflow_status: str | None = Query(default=None, alias="status"),
    brand: str | None = Query(default=None, max_length=120),
    category_id: int | None = None,
    needs: str | None = Query(default=None),
    price_level_id: int | None = None,
    audience_type_id: int | None = None,
    product_status: str | None = Query(default=None, pattern="^(active|inactive|all)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=5, le=100),
    user: User = Depends(require_permission("products.view")),
    db: Session = Depends(get_db),
) -> ProductPage:
    can_view_inactive = is_superadmin(user)
    resolved_product_status = product_status or ("all" if is_superadmin(user) else "active")
    if resolved_product_status in {"inactive", "all"} and not can_view_inactive:
        raise HTTPException(
            status_code=403,
            detail="SuperAdmin access is required to view inactive products.",
        )
    query = select(Product.id).join(CatalogueEntry)
    scope_filter = _product_scope_filter(db, user, "products.view")
    if scope_filter is not None:
        query = query.where(scope_filter)
    if resolved_product_status != "all":
        query = query.where(Product.status == resolved_product_status)
    brand_query = select(Product.brand).join(CatalogueEntry).where(Product.brand.is_not(None))
    if scope_filter is not None:
        brand_query = brand_query.where(scope_filter)
    if resolved_product_status != "all":
        brand_query = brand_query.where(Product.status == resolved_product_status)
    available_brands = sorted(
        {
            name.strip()
            for name in db.scalars(brand_query.distinct())
            if name and name.strip()
        },
        key=str.casefold,
    )
    if q.strip():
        pattern = f"%{q.strip()}%"
        query = query.where(
            or_(
                Product.sku.ilike(pattern),
                Product.erp_name.ilike(pattern),
                CatalogueEntry.display_name.ilike(pattern),
                Product.brand.ilike(pattern),
                Product.barcode.ilike(pattern),
            )
        )
    if workflow_status:
        query = query.where(CatalogueEntry.workflow_status == workflow_status)
    if brand and brand.strip():
        query = query.where(func.lower(Product.brand) == brand.strip().casefold())
    if category_id is not None:
        query = query.join(product_categories).where(
            product_categories.c.category_id == category_id
        )
    has_description = _has_catalogue_description()
    if needs == "description":
        query = query.where(~has_description)
    elif needs == "image":
        query = query.where(
            ~select(ProductImage.id)
            .where(ProductImage.product_id == Product.id)
            .exists()
        )
    elif needs == "category":
        query = query.where(
            ~select(product_categories.c.product_id)
            .where(product_categories.c.product_id == Product.id)
            .exists()
        )
    elif needs == "barcode":
        query = query.where(or_(Product.barcode.is_(None), Product.barcode == ""))
    elif needs == "price":
        query = query.where(Product.price.is_(None))
    elif needs == "source":
        if not has_permission(user, "data_sync.view"):
            raise HTTPException(status_code=403, detail="Permission required: data_sync.view")
        query = query.where(Product.source_record_exists.is_(False))
    elif needs == "stale_stock":
        if not has_permission(user, "data_sync.view"):
            raise HTTPException(status_code=403, detail="Permission required: data_sync.view")
        stale_cutoff = datetime.now(UTC) - timedelta(
            seconds=settings.product_sync_stale_warning_seconds
        )
        query = query.where(
            or_(
                Product.stock_last_synced_at.is_(None),
                Product.stock_last_synced_at < stale_cutoff,
            )
        )
    elif needs == "ready":
        query = query.where(
            Product.source_system == "gms_erp",
            Product.source_record_exists.is_(True),
        )
    elif needs in {"video", "missing_video", "video_processing", "video_failed", "video_visible", "video_hidden"}:
        active_video = select(ProductVideo.id).where(
            ProductVideo.product_id == Product.id,
            ProductVideo.deleted_at.is_(None),
            ProductVideo.is_active.is_(True),
        )
        if needs == "video": query = query.where(active_video.exists())
        elif needs == "missing_video": query = query.where(~active_video.exists())
        elif needs == "video_processing": query = query.where(select(ProductVideo.id).where(ProductVideo.product_id == Product.id, ProductVideo.deleted_at.is_(None), ProductVideo.processing_status.in_(["pending_upload", "uploading", "processing"])).exists())
        elif needs == "video_failed": query = query.where(select(ProductVideo.id).where(ProductVideo.product_id == Product.id, ProductVideo.deleted_at.is_(None), ProductVideo.processing_status == "failed").exists())
        elif needs == "video_visible": query = query.where(active_video.where(ProductVideo.show_in_catalogue.is_(True)).exists())
        elif needs == "video_hidden": query = query.where(active_video.where(ProductVideo.show_in_catalogue.is_(False)).exists())
    elif needs:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unknown catalogue readiness filter.",
        )

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    product_ids = list(
        db.scalars(
            query.order_by(Product.brand.is_(None), func.lower(Product.brand), Product.erp_name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    selected_level: ErpCustomerPriceLevel | None = None
    selected_price_list_name: str | None = None
    selected_prices: dict[uuid.UUID, ErpProductCustomerPrice] = {}
    customer_pricing_selected = False
    if audience_type_id is None and price_level_id is None and has_permission(user, "prices.view"):
        default_audience = db.scalar(
            select(CatalogueAudienceType).where(
                CatalogueAudienceType.code == "normal",
                CatalogueAudienceType.is_active.is_(True),
            )
        )
        audience_type_id = default_audience.id if default_audience else None

    if audience_type_id is not None:
        if not has_permission(user, "prices.view"):
            raise HTTPException(
                status_code=403,
                detail="Permission required: prices.view",
            )
        audience = db.scalar(
            select(CatalogueAudienceType).where(
                CatalogueAudienceType.id == audience_type_id,
                CatalogueAudienceType.is_active.is_(True),
            )
        )
        if not audience:
            raise HTTPException(status_code=404, detail="Customer level not found.")
        mapping = db.scalar(
            select(UserCataloguePriceMapping).where(
                UserCataloguePriceMapping.user_id == user.id,
                UserCataloguePriceMapping.audience_type_id == audience.id,
            )
        )
        mapped_price_list_id = (
            mapping.price_list_id if mapping else audience.price_list_id
        )
        mapped_price_list = (
            db.get(PriceList, mapped_price_list_id)
            if mapped_price_list_id is not None
            else None
        )
        allowed_lists = allowed_price_list_ids(db, user)
        if (
            mapped_price_list_id is not None
            and not (mapped_price_list and mapped_price_list.is_no_price)
            and allowed_lists is not None
            and mapped_price_list_id not in allowed_lists
        ):
            raise HTTPException(status_code=404, detail="Customer level not found.")
        customer_pricing_selected = True
        selected_price_list_name = audience.display_name
        if (
            audience.show_prices
            and mapped_price_list_id is not None
            and mapped_price_list
            and not mapped_price_list.is_no_price
        ):
            selected_level = db.scalar(
                select(ErpCustomerPriceLevel).where(
                    ErpCustomerPriceLevel.price_list_id == mapped_price_list_id,
                    ErpCustomerPriceLevel.is_active.is_(True),
                )
            )
    elif price_level_id is not None:
        if not has_permission(user, "prices.view"):
            raise HTTPException(
                status_code=403,
                detail="Permission required: prices.view",
            )
        selected_level = db.scalar(
            select(ErpCustomerPriceLevel)
            .where(
                ErpCustomerPriceLevel.id == price_level_id,
                ErpCustomerPriceLevel.is_active.is_(True),
            )
        )
        allowed_lists = allowed_price_list_ids(db, user)
        if (
            not selected_level
            or (
                allowed_lists is not None
                and selected_level.price_list_id not in allowed_lists
            )
        ):
            raise HTTPException(status_code=404, detail="Price level not found.")
        selected_price_list_name = db.scalar(
            select(PriceList.name).where(PriceList.id == selected_level.price_list_id)
        )

    if product_ids:
        products = list(
            db.scalars(
                _product_list_query()
                .where(Product.id.in_(product_ids))
                .order_by(Product.brand.is_(None), func.lower(Product.brand), Product.erp_name)
            ).unique()
        )
        if selected_level:
            selected_prices = {
                price.product_id: price
                for price in db.scalars(
                    select(ErpProductCustomerPrice).where(
                        ErpProductCustomerPrice.product_id.in_(product_ids),
                        ErpProductCustomerPrice.price_level_id == selected_level.id,
                    )
                )
            }
    else:
        products = []

    return ProductPage(
        items=[
            _product_list_item(
                product,
                user,
                selected_price=selected_prices.get(product.id),
                selected_level=selected_level,
                selected_price_list_name=selected_price_list_name,
                customer_pricing_selected=customer_pricing_selected,
            )
            for product in products
        ],
        brands=available_brands,
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, ceil(total / page_size)),
    )


@router.post(
    "/products",
    response_model=ProductDetail,
    status_code=status.HTTP_201_CREATED,
)
def create_product(
    payload: ProductCreate,
    request: Request,
    user: User = Depends(require_permission("products.create")),
    db: Session = Depends(get_db),
) -> ProductDetail:
    """Create a product directly for catalogue teams without an ERP import."""

    categories = list(
        db.scalars(
            select(Category).where(
                Category.id.in_(payload.category_ids),
                Category.is_active.is_(True),
            )
        )
    )
    if len(categories) != len(payload.category_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more selected categories are unavailable.",
        )

    product = Product(
        sku=payload.sku,
        erp_name=payload.name,
        brand=payload.brand,
        barcode=payload.barcode,
        unit=payload.unit,
        erp_category=payload.erp_category,
        price=payload.price,
        stock_quantity=payload.stock_quantity,
        erp_updated_at=datetime.now(UTC),
        catalogue_entry=CatalogueEntry(
            display_name=payload.name,
            short_description=payload.short_description,
            long_description=payload.long_description,
            seo_title=payload.name,
            seo_description=payload.short_description,
            updated_by_id=user.id,
        ),
        categories=categories,
    )
    _require_product_access(db, user, "products.create", product)
    db.add(product)
    _ensure_brand(db, payload.brand)
    try:
        db.flush()
        if payload.price is not None:
            normal_price_list = db.scalar(
                select(PriceList).where(PriceList.code == "NORMAL")
            )
            if normal_price_list:
                db.add(
                    ProductPrice(
                        product_id=product.id,
                        price_list_id=normal_price_list.id,
                        currency=normal_price_list.currency,
                        amount=payload.price,
                        effective_from=product.erp_updated_at,
                        status="active",
                        reason="Initial price supplied during product creation.",
                        created_by_id=user.id,
                        approved_by_id=user.id,
                        approved_at=product.erp_updated_at,
                    )
                )
        _audit(
            db,
            request,
            user,
            action="product_created",
            product=product,
            details={"source": "catalogue", "category_ids": payload.category_ids},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That SKU or barcode is already in use.",
        ) from None
    return _product_detail(_get_product(db, product.id), user)


@router.get("/products/{product_id}", response_model=ProductDetail)
def get_product(
    product_id: uuid.UUID,
    user: User = Depends(require_permission("products.view")),
    db: Session = Depends(get_db),
) -> ProductDetail:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "products.view", product)
    if product.status == "inactive" and not is_superadmin(user):
        raise HTTPException(status_code=404, detail="Product not found.")
    return _product_detail(product, user)


@router.delete(
    "/products/{product_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_product(
    product_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_permission("products.delete")),
    db: Session = Depends(get_db),
) -> None:
    """Delete the local catalogue copy; ERP remains the source of truth."""

    product = _get_product(db, product_id)
    _require_product_access(db, user, "products.delete", product)
    image_files = [image.storage_name for image in product.images]
    video_files = {
        key
        for video in product.videos
        for key in (
            video.storage_key,
            video.playback_storage_key,
            video.thumbnail_storage_key,
            video.caption_storage_key,
        )
        if key
    }
    source_system = product.source_system

    _audit(
        db,
        request,
        user,
        action="product_deleted",
        product=product,
        details={
            "source_system": source_system,
            "erp_master_unchanged": source_system == "gms_erp",
        },
    )
    # These working tables intentionally use RESTRICT so deletion is always
    # explicit. Immutable catalogue-version snapshots remain untouched.
    db.execute(delete(PromotionPriceHistory).where(PromotionPriceHistory.product_id == product.id))
    db.execute(delete(PromotionProduct).where(PromotionProduct.product_id == product.id))
    db.execute(delete(PriceChangeRequest).where(PriceChangeRequest.product_id == product.id))
    db.execute(delete(ProductPrice).where(ProductPrice.product_id == product.id))
    db.execute(delete(CatalogueProduct).where(CatalogueProduct.product_id == product.id))
    db.delete(product)
    db.commit()

    upload_directory = Path(settings.upload_dir).resolve()
    for storage_name in image_files:
        target = (upload_directory / storage_name).resolve()
        if upload_directory in target.parents and target.exists():
            target.unlink()
    for storage_key in video_files:
        video_storage.delete(storage_key)


@router.patch(
    "/products/{product_id}/master-data",
    response_model=ProductDetail,
)
def update_product_master_data(
    product_id: uuid.UUID,
    payload: ProductMasterUpdate,
    request: Request,
    user: User = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db),
) -> ProductDetail:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "products.edit", product)
    previous = {
        "erp_name": product.erp_name,
        "brand": product.brand,
        "barcode": product.barcode,
        "erp_category": product.erp_category,
        "price": str(product.price) if product.price is not None else None,
        "stock_quantity": product.stock_quantity,
    }
    product.erp_name = payload.erp_name
    product.brand = payload.brand
    product.barcode = payload.barcode
    product.erp_category = payload.erp_category
    product.price = payload.price
    product.stock_quantity = payload.stock_quantity
    product.erp_updated_at = datetime.now(UTC)

    _ensure_brand(db, payload.brand)

    _audit(
        db,
        request,
        user,
        action="product_master_data_updated",
        product=product,
        details={
            "previous": previous,
            "updated": {
                "erp_name": product.erp_name,
                "brand": product.brand,
                "barcode": product.barcode,
                "erp_category": product.erp_category,
                "price": (
                    str(product.price) if product.price is not None else None
                ),
                "stock_quantity": product.stock_quantity,
            },
        },
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="That barcode or brand is already in use.",
        ) from None
    return _product_detail(_get_product(db, product_id), user)


@router.put("/products/{product_id}/content", response_model=ProductDetail)
def update_product_content(
    product_id: uuid.UUID,
    payload: CatalogueContentUpdate,
    request: Request,
    user: User = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db),
) -> ProductDetail:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "products.edit", product)
    entry = _entry_for(product)
    categories = list(
        db.scalars(
            select(Category).where(
                Category.id.in_(payload.category_ids),
                Category.is_active.is_(True),
            )
        )
    )
    if len(categories) != len(payload.category_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="One or more selected categories are unavailable.",
        )

    previous_status = entry.workflow_status
    if payload.display_name is not None:
        entry.display_name = payload.display_name
    entry.short_description = payload.short_description
    entry.long_description = payload.long_description
    entry.seo_title = payload.seo_title
    entry.seo_description = payload.seo_description
    # Catalogue changes remain hidden until an approver publishes them.
    entry.visibility = "hidden"
    entry.is_featured = payload.is_featured
    entry.updated_by_id = user.id
    entry.version += 1
    product.categories = categories

    if previous_status != "draft":
        entry.workflow_status = "draft"
        entry.submitted_at = None
        entry.approved_at = None
        entry.approved_by_id = None
        if previous_status == "published":
            entry.published_at = None
            entry.published_by_id = None

    _audit(
        db,
        request,
        user,
        action="product_content_updated",
        product=product,
        details={
            "previous_status": previous_status,
            "version": entry.version,
        },
    )
    db.commit()
    return _product_detail(_get_product(db, product_id), user)


def _validate_ready_for_review(product: Product) -> None:
    entry = _entry_for(product)
    missing: list[str] = []
    if not entry.short_description:
        missing.append("short description")
    if not entry.long_description:
        missing.append("long description")
    if not product.categories:
        missing.append("category")
    if missing:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Complete the {', '.join(missing)} before submitting.",
        )


@router.post("/products/{product_id}/submit", response_model=WorkflowResponse)
def submit_product(
    product_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_permission("products.edit")),
    db: Session = Depends(get_db),
) -> WorkflowResponse:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "products.edit", product)
    entry = _entry_for(product)
    if entry.workflow_status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only draft products can be submitted for review.",
        )
    _validate_ready_for_review(product)
    entry.workflow_status = "in_review"
    entry.submitted_at = datetime.now(UTC)
    entry.updated_by_id = user.id
    _audit(db, request, user, action="product_submitted", product=product)
    db.commit()
    return WorkflowResponse(
        message="Product submitted for review.",
        product=_product_detail(_get_product(db, product_id), user),
    )


@router.post("/products/{product_id}/approve", response_model=WorkflowResponse)
def approve_product(
    product_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_permission("catalogues.approve")),
    db: Session = Depends(get_db),
) -> WorkflowResponse:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "catalogues.approve", product)
    entry = _entry_for(product)
    if entry.workflow_status != "in_review":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only products in review can be approved.",
        )
    entry.workflow_status = "approved"
    entry.approved_at = datetime.now(UTC)
    entry.approved_by_id = user.id
    _audit(db, request, user, action="product_approved", product=product)
    db.commit()
    return WorkflowResponse(
        message="Product approved.",
        product=_product_detail(_get_product(db, product_id), user),
    )


@router.post("/products/{product_id}/publish", response_model=WorkflowResponse)
def publish_product(
    product_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_permission("products.publish")),
    db: Session = Depends(get_db),
) -> WorkflowResponse:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "products.publish", product)
    entry = _entry_for(product)
    if entry.workflow_status != "approved":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only approved products can be published.",
        )
    _validate_ready_for_review(product)
    entry.workflow_status = "published"
    entry.visibility = "public"
    entry.published_at = datetime.now(UTC)
    entry.published_by_id = user.id
    _audit(db, request, user, action="product_published", product=product)
    db.commit()
    return WorkflowResponse(
        message="Product published.",
        product=_product_detail(_get_product(db, product_id), user),
    )


@router.post("/products/{product_id}/unpublish", response_model=WorkflowResponse)
def unpublish_product(
    product_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_permission("products.publish")),
    db: Session = Depends(get_db),
) -> WorkflowResponse:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "products.publish", product)
    entry = _entry_for(product)
    if entry.workflow_status != "published":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only published products can be unpublished.",
        )
    entry.workflow_status = "draft"
    entry.visibility = "hidden"
    entry.published_at = None
    entry.published_by_id = None
    entry.version += 1
    _audit(db, request, user, action="product_unpublished", product=product)
    db.commit()
    return WorkflowResponse(
        message="Product unpublished and returned to draft.",
        product=_product_detail(_get_product(db, product_id), user),
    )


@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(
    include_inactive: bool = False,
    include_brands: bool = True,
    actor: User = Depends(require_permission("categories.view")),
    db: Session = Depends(get_db),
) -> list[CategoryResponse]:
    product_counts = (
        select(
            product_categories.c.category_id.label("category_id"),
            func.count(product_categories.c.product_id).label("product_count"),
        )
        .group_by(product_categories.c.category_id)
        .subquery()
    )
    query = (
        select(
            Category,
            func.coalesce(product_counts.c.product_count, 0).label("product_count"),
        )
        .outerjoin(product_counts, product_counts.c.category_id == Category.id)
    )
    if not include_inactive:
        query = query.where(Category.is_active.is_(True))
    access = effective_permission_access(db, actor, "categories.view")
    if "all" not in access.scopes and not is_superadmin(actor):
        conditions = []
        if "assigned_categories" in access.scopes:
            category_ids = assigned_category_ids(db, actor, edit=False)
            if category_ids:
                conditions.append(Category.id.in_(category_ids))
        if {"assigned_brands", "department"}.intersection(access.scopes):
            brands = _brand_scope(actor, manage=False, db=db) or set()
            if brands:
                conditions.append(
                    select(product_categories.c.category_id)
                    .join(Product, Product.id == product_categories.c.product_id)
                    .where(
                        product_categories.c.category_id == Category.id,
                        func.lower(Product.brand).in_({brand.casefold() for brand in brands}),
                    )
                    .exists()
                )
        query = query.where(or_(*conditions) if conditions else false())
    rows = db.execute(query.order_by(Category.name)).all()
    category_ids = [category.id for category, _ in rows]
    brand_counts_by_category: dict[
        int, list[dict[str, str | int | bool | None]]
    ] = {
        category_id: [] for category_id in category_ids
    }
    if category_ids and include_brands:
        brand_rows = db.execute(
            select(
                product_categories.c.category_id,
                Product.brand,
                func.count(Product.id),
            )
            .join(Product, Product.id == product_categories.c.product_id)
            .where(
                product_categories.c.category_id.in_(category_ids),
                Product.brand.is_not(None),
                func.trim(Product.brand) != "",
            )
            .group_by(product_categories.c.category_id, Product.brand)
            .order_by(product_categories.c.category_id, func.lower(Product.brand))
        ).all()
        brand_master_by_name = {
            item.name.casefold(): item
            for item in db.scalars(select(Brand)).all()
        }
        for category_id, brand_name, brand_product_count in brand_rows:
            brand_name = brand_name.strip()
            brand_master = brand_master_by_name.get(brand_name.casefold())
            brand_counts_by_category[category_id].append(
                {
                    "name": brand_name,
                    "product_count": int(brand_product_count),
                    "id": brand_master.id if brand_master else None,
                    "is_active": brand_master.is_active if brand_master else True,
                    "inactive_reason": (
                        brand_master.inactive_reason if brand_master else ""
                    ),
                }
            )
    return [
        CategoryResponse(
            id=category.id,
            name=category.name,
            slug=category.slug,
            description=category.description,
            is_active=category.is_active,
            inactive_reason=category.inactive_reason,
            product_count=int(product_count),
            brands=brand_counts_by_category.get(category.id, []),
        )
        for category, product_count in rows
    ]


@router.post(
    "/categories",
    response_model=CategoryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_category(
    payload: CategoryCreate,
    request: Request,
    user: User = Depends(require_permission("categories.create")),
    db: Session = Depends(get_db),
) -> CategoryResponse:
    category = Category(
        name=payload.name,
        slug=_slugify(payload.name),
        description=payload.description,
    )
    db.add(category)
    try:
        db.flush()
        _audit(
            db,
            request,
            user,
            action="category_created",
            details={"category_id": category.id, "category_name": category.name},
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with that name already exists.",
        ) from None
    category = db.scalar(
        select(Category)
        .options(selectinload(Category.products))
        .where(Category.id == category.id)
    )
    return _category_response(category)


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    payload: CategoryUpdate,
    request: Request,
    user: User = Depends(require_permission("categories.edit")),
    db: Session = Depends(get_db),
) -> CategoryResponse:
    category = db.scalar(
        select(Category)
        .options(selectinload(Category.products))
        .where(Category.id == category_id)
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found.")
    access = effective_permission_access(db, user, "categories.edit")
    category_allowed = "all" in access.scopes or is_superadmin(user)
    if not category_allowed and "assigned_categories" in access.scopes:
        category_allowed = category.id in assigned_category_ids(db, user, edit=True)
    if not category_allowed and {"assigned_brands", "department"}.intersection(access.scopes):
        allowed_brands = {name.casefold() for name in (_brand_scope(user, manage=True, db=db) or set())}
        category_allowed = any(product.brand and product.brand.casefold() in allowed_brands for product in category.products)
    if not category_allowed:
        raise HTTPException(status_code=404, detail="Category not found.")
    if payload.name is not None and payload.name != category.name:
        category.name = payload.name
        category.slug = _slugify(payload.name)
    if payload.description is not None:
        category.description = payload.description
    if payload.is_active is not None:
        category.is_active = payload.is_active
        category.inactive_reason = (
            "" if payload.is_active else (payload.inactive_reason or "")
        )
    try:
        _audit(
            db,
            request,
            user,
            action="category_updated",
            details={
                "category_id": category.id,
                "category_name": category.name,
                "is_active": category.is_active,
                "inactive_reason": category.inactive_reason,
            },
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A category with that name already exists.",
        ) from None
    brand_master_by_name = {
        item.name.casefold(): item for item in db.scalars(select(Brand)).all()
    }
    return _category_response(category, brand_master_by_name)


@router.post(
    "/products/{product_id}/images",
    response_model=ImageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_product_image(
    product_id: uuid.UUID,
    request: Request,
    file: UploadFile = File(...),
    alt_text: str = Form(default="", max_length=255),
    user: User = Depends(require_permission("product_images.upload")),
    db: Session = Depends(get_db),
) -> ImageResponse:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "product_images.upload", product)
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Upload a JPEG, PNG or WebP image.",
        )
    max_bytes = settings.product_image_max_size_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Images must be {settings.product_image_max_size_mb} MB or smaller."
            ),
        )
    if not content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The uploaded image is empty.",
        )

    upload_directory = Path(settings.upload_dir).resolve()
    upload_directory.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid.uuid4().hex}{ALLOWED_IMAGE_TYPES[file.content_type]}"
    target = (upload_directory / storage_name).resolve()
    if upload_directory not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid image path.")
    target.write_bytes(content)

    max_sort_order = db.scalar(
        select(func.max(ProductImage.sort_order)).where(
            ProductImage.product_id == product.id
        )
    )
    image = ProductImage(
        product_id=product.id,
        file_name=(file.filename or "product-image")[:255],
        storage_name=storage_name,
        public_url=f"/uploads/{storage_name}",
        content_type=file.content_type,
        alt_text=alt_text.strip(),
        sort_order=(max_sort_order + 1) if max_sort_order is not None else 0,
        is_primary=not product.images,
        uploaded_by_id=user.id,
    )
    db.add(image)
    _audit(
        db,
        request,
        user,
        action="product_image_uploaded",
        product=product,
        details={"file_name": image.file_name},
    )
    db.commit()
    db.refresh(image)
    return _image_response(image)


@router.post(
    "/products/{product_id}/images/{image_id}/primary",
    response_model=ImageResponse,
)
def set_primary_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_permission("product_images.edit")),
    db: Session = Depends(get_db),
) -> ImageResponse:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "product_images.edit", product)
    image = next((item for item in product.images if item.id == image_id), None)
    if not image:
        raise HTTPException(status_code=404, detail="Product image not found.")
    for item in product.images:
        item.is_primary = item.id == image.id
    _audit(
        db,
        request,
        user,
        action="product_primary_image_changed",
        product=product,
        details={"image_id": str(image.id)},
    )
    db.commit()
    return _image_response(image)


@router.delete(
    "/products/{product_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_product_image(
    product_id: uuid.UUID,
    image_id: uuid.UUID,
    request: Request,
    user: User = Depends(require_permission("product_images.delete")),
    db: Session = Depends(get_db),
) -> None:
    product = _get_product(db, product_id)
    _require_product_access(db, user, "product_images.delete", product)
    image = next((item for item in product.images if item.id == image_id), None)
    if not image:
        raise HTTPException(status_code=404, detail="Product image not found.")

    upload_directory = Path(settings.upload_dir).resolve()
    target = (upload_directory / image.storage_name).resolve()
    was_primary = image.is_primary
    db.delete(image)
    db.flush()
    if was_primary:
        next_image = db.scalar(
            select(ProductImage)
            .where(ProductImage.product_id == product.id)
            .order_by(ProductImage.sort_order)
            .limit(1)
        )
        if next_image:
            next_image.is_primary = True
    _audit(
        db,
        request,
        user,
        action="product_image_deleted",
        product=product,
        details={"image_id": str(image.id), "file_name": image.file_name},
    )
    db.commit()

    if upload_directory in target.parents and target.exists():
        target.unlink()


@router.get("/activity", response_model=list[ActivityResponse])
def list_activity(
    limit: int = Query(default=20, ge=1, le=100),
    _: User = Depends(require_permission("audit_logs.view")),
    db: Session = Depends(get_db),
) -> list[ActivityResponse]:
    rows = db.execute(
        select(AuditLog, User.full_name)
        .outerjoin(User, User.id == AuditLog.user_id)
        .where(AuditLog.module == "catalogue")
        .order_by(AuditLog.created_at.desc())
        .limit(limit)
    ).all()
    return [
        ActivityResponse(
            id=audit.id,
            action=audit.action,
            status=audit.status,
            user_name=user_name,
            identifier=audit.identifier,
            details=audit.details,
            created_at=audit.created_at,
        )
        for audit, user_name in rows
    ]
