"""Permission-aware, aggregated data for the application overview.

The dashboard deliberately returns a small projection instead of reusing the
large management-page payloads.  Every section is omitted when the current
user lacks the matching permission, and row filters mirror the protected list
routes.
"""

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import and_, false, func, or_, select
from sqlalchemy.orm import Session, aliased, noload, selectinload

from app.access import (
    allowed_brand_names,
    allowed_price_list_ids,
    assigned_catalogue_ids,
    effective_permission_access,
    has_permission,
    is_superadmin,
    require_permission,
)
from app.catalogue import _product_scope_filter, stats as catalogue_stats
from app.commerce_models import (
    Catalogue,
    CatalogueProduct,
    PriceChangeRequest,
    ProductPrice,
    UserCataloguePriceMapping,
)
from app.dashboard_schemas import (
    DashboardAttentionItem,
    DashboardCatalogueItem,
    DashboardOverviewResponse,
    DashboardProductItem,
    DashboardPromotionItem,
    DashboardSummary,
    DashboardSyncStatus,
    DashboardSystemHealth,
    DashboardWorkItem,
)
from app.database import get_db
from app.design_studio_models import CatalogueDesign
from app.erp_models import ErpSyncRun
from app.models import (
    CatalogueEntry,
    Product,
    ProductVideo,
    User,
    UserOrganizationProfile,
)
from app.platform_admin import system_metrics
from app.promotion_models import Promotion


router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _catalogue_scope_filter(db: Session, user: User):
    access = effective_permission_access(db, user, "catalogues.view")
    if not access.allowed:
        return false()
    if is_superadmin(user) or "all" in access.scopes:
        condition = None
    else:
        conditions = []
        scopes = access.scopes - {"none"}
        if "assigned_catalogues" in scopes:
            catalogue_ids = assigned_catalogue_ids(db, user)
            if catalogue_ids:
                conditions.append(Catalogue.id.in_(catalogue_ids))
        if "assigned_brands" in scopes or "department" in scopes:
            brands = allowed_brand_names(db, user, edit=False)
            if brands:
                conditions.append(
                    func.lower(Catalogue.brand).in_(
                        {brand.casefold() for brand in brands}
                    )
                )
        if "own" in scopes:
            conditions.append(
                or_(
                    Catalogue.owner_id == user.id,
                    Catalogue.created_by_id == user.id,
                    Catalogue.updated_by_id == user.id,
                )
            )
        if (
            "department" in scopes
            and user.organization_profile
            and user.organization_profile.department_id
        ):
            department_users = select(UserOrganizationProfile.user_id).where(
                UserOrganizationProfile.department_id
                == user.organization_profile.department_id
            )
            conditions.append(
                or_(
                    Catalogue.owner_id.in_(department_users),
                    Catalogue.created_by_id.in_(department_users),
                )
            )
        condition = or_(*conditions) if conditions else false()
    if (
        user.data_scope
        and user.data_scope.published_only
        and not is_superadmin(user)
        and "all" not in access.scopes
    ):
        published = Catalogue.status == "published"
        return published if condition is None else and_(condition, published)
    return condition


def _promotion_scope_filter(user: User):
    # Keep this aligned with the protected promotions list/detail routes.
    if is_superadmin(user) or has_permission(user, "promotions.view_all"):
        return None
    return or_(
        Promotion.owner_user_id == user.id,
        Promotion.created_by_id == user.id,
    )


def _sync_status(db: Session, user: User) -> DashboardSyncStatus:
    latest = db.scalar(
        select(ErpSyncRun)
        .where(ErpSyncRun.sync_type == "product_source_data")
        .order_by(ErpSyncRun.started_at.desc())
        .limit(1)
    )
    latest_success = db.scalar(
        select(ErpSyncRun.completed_at)
        .where(
            ErpSyncRun.sync_type == "product_source_data",
            ErpSyncRun.status.in_(("completed", "completed_with_warnings")),
        )
        .order_by(ErpSyncRun.completed_at.desc())
        .limit(1)
    )
    latest_failure = db.scalar(
        select(ErpSyncRun.completed_at)
        .where(
            ErpSyncRun.sync_type == "product_source_data",
            ErpSyncRun.status == "failed",
        )
        .order_by(ErpSyncRun.completed_at.desc())
        .limit(1)
    )
    success_at = _as_utc(latest_success)
    failure_at = _as_utc(latest_failure)
    technical_allowed = has_permission(user, "data_sync.view")
    if latest and latest.status == "running":
        safe_status, label = "updating", "Updating"
    elif not success_at:
        safe_status, label = "unknown", "Sync status unknown"
    elif latest and latest.status == "failed" and (
        not failure_at or not success_at or failure_at >= success_at
    ):
        safe_status, label = "data_may_be_outdated", "Data may be outdated"
    else:
        age = datetime.now(UTC) - success_at
        if age <= timedelta(minutes=6):
            safe_status, label = "up_to_date", "Up to date"
        elif age <= timedelta(minutes=15):
            safe_status, label = "data_may_be_outdated", "Sync delayed"
        else:
            safe_status, label = "data_may_be_outdated", "Data may be outdated"
    return DashboardSyncStatus(
        safe_status=safe_status,
        display_label=label,
        last_successful_at=success_at,
        technical_status=(latest.status if latest and technical_allowed else None),
        last_failed_at=(failure_at if technical_allowed else None),
        can_open_details=technical_allowed,
    )


def _system_health(db: Session, user: User) -> DashboardSystemHealth | None:
    if not has_permission(user, "system_metrics.view"):
        return None
    # The overview only displays live CPU/memory/disk/database health. Avoid
    # walking the large product-media tree here; detailed storage totals remain
    # available on the dedicated system metrics page.
    metrics = system_metrics(_=user, db=db, include_storage_sizes=False)
    return DashboardSystemHealth(
        status=metrics.status,
        measured_at=metrics.timestamp,
        cpu_percent=metrics.system.get("cpu_percent"),
        memory_percent=metrics.system.get("memory_percent"),
        disk_percent=metrics.system.get("disk_percent"),
        database_status=metrics.database.get("status"),
        database_response_ms=metrics.database.get("response_ms"),
        api_response_ms=metrics.application.get("api_response_ms"),
        application_uptime_seconds=metrics.application.get("uptime_seconds"),
        last_database_backup=metrics.backups.get("last_database_backup"),
        last_application_backup=metrics.backups.get("last_application_backup"),
        current_background_jobs=metrics.application.get("current_background_jobs"),
        recent_failed_logins=metrics.application.get("recent_failed_logins"),
        recent_server_errors=metrics.application.get("recent_server_errors"),
        warnings=metrics.warnings,
    )


def _catalogue_primary_action(status: str) -> str:
    return {
        "draft": "Continue editing",
        "published": "Preview",
        "in_review": "Review",
        "scheduled": "View schedule",
        "active": "Open promotion",
        "expired": "View history",
    }.get(status, "Open")


@router.get("/sync-status", response_model=DashboardSyncStatus)
def dashboard_sync_status(
    user: User = Depends(require_permission("dashboard.view")),
    db: Session = Depends(get_db),
) -> DashboardSyncStatus:
    """Small, safe status projection used by the persistent application header."""

    return _sync_status(db, user)


@router.get("/overview", response_model=DashboardOverviewResponse)
def dashboard_overview(
    user: User = Depends(require_permission("dashboard.view")),
    db: Session = Depends(get_db),
) -> DashboardOverviewResponse:
    can_view_products = has_permission(user, "products.view")
    can_view_inactive = is_superadmin(user)
    can_view_catalogues = has_permission(user, "catalogues.view")
    can_view_promotions = has_permission(user, "promotions.view")
    can_view_prices = has_permission(user, "prices.view")
    product_metrics = catalogue_stats(user=user, db=db) if can_view_products else None
    catalogue_scope = _catalogue_scope_filter(db, user) if can_view_catalogues else false()
    promotion_scope = _promotion_scope_filter(user) if can_view_promotions else false()

    published_catalogues = draft_catalogues = None
    if can_view_catalogues:
        catalogue_counts = select(
            func.count().filter(Catalogue.status == "published").label("published"),
            func.count().filter(Catalogue.status == "draft").label("draft"),
        ).select_from(Catalogue)
        if catalogue_scope is not None:
            catalogue_counts = catalogue_counts.where(catalogue_scope)
        catalogue_metrics = db.execute(catalogue_counts).one()
        published_catalogues = int(catalogue_metrics.published)
        draft_catalogues = int(catalogue_metrics.draft)

    active_promotions = None
    if can_view_promotions:
        now = datetime.now(UTC)
        promotion_count = select(func.count(Promotion.id)).where(
            Promotion.deleted_at.is_(None),
            Promotion.is_active.is_(True),
            Promotion.status == "active",
            Promotion.start_at <= now,
            Promotion.end_at > now,
        )
        if promotion_scope is not None:
            promotion_count = promotion_count.where(promotion_scope)
        active_promotions = int(db.scalar(promotion_count) or 0)

    approval_count: int | None = None
    if any(
        has_permission(user, code)
        for code in ("catalogues.approve", "prices.approve")
    ):
        approval_count = 0
        if has_permission(user, "catalogues.approve") and can_view_catalogues:
            query = select(func.count(Catalogue.id)).where(
                Catalogue.status == "in_review"
            )
            if catalogue_scope is not None:
                query = query.where(catalogue_scope)
            approval_count += int(db.scalar(query) or 0)
        if has_permission(user, "prices.approve"):
            query = select(func.count(PriceChangeRequest.id)).where(
                PriceChangeRequest.status == "pending"
            )
            allowed_lists = allowed_price_list_ids(db, user)
            if allowed_lists is not None:
                query = query.where(PriceChangeRequest.price_list_id.in_(allowed_lists))
            approval_count += int(db.scalar(query) or 0)

    attention: list[DashboardAttentionItem] = []
    if product_metrics:
        attention_candidates = [
            ("missing_image", "Products missing main image", product_metrics.missing_images, "warning", "image"),
            ("missing_category", "Products missing category", product_metrics.missing_categories, "warning", "category"),
            ("missing_description", "Products missing description", product_metrics.missing_descriptions, "information", "description"),
        ]
        for key, title, count, severity, value in attention_candidates:
            if count:
                attention.append(
                    DashboardAttentionItem(
                        key=key,
                        title=title,
                        count=count,
                        severity=severity,
                        target="products",
                        filter_name="needs",
                        filter_value=value,
                    )
                )
        product_scope = _product_scope_filter(db, user, "products.view")
        barcode_query = select(func.count(Product.id)).select_from(Product).join(CatalogueEntry).where(
            Product.status == "active",
            or_(Product.barcode.is_(None), Product.barcode == ""),
        )
        video_query = select(func.count(Product.id)).select_from(Product).join(CatalogueEntry).where(
            Product.status == "active",
            ~select(ProductVideo.id).where(
                ProductVideo.product_id == Product.id,
                ProductVideo.deleted_at.is_(None),
                ProductVideo.is_active.is_(True),
            ).exists(),
        )
        if product_scope is not None:
            barcode_query = barcode_query.where(product_scope)
            video_query = video_query.where(product_scope)
        for key, title, count, value in (
            ("missing_barcode", "Products missing barcode", int(db.scalar(barcode_query) or 0), "barcode"),
            ("missing_video", "Products missing video", int(db.scalar(video_query) or 0), "missing_video"),
        ):
            if count:
                attention.append(
                    DashboardAttentionItem(
                        key=key,
                        title=title,
                        count=count,
                        severity="information",
                        target="products",
                        filter_name="needs",
                        filter_value=value,
                    )
                )
        if can_view_prices:
            price_query = select(func.count(Product.id)).select_from(Product).join(CatalogueEntry).where(
                Product.status == "active", Product.price.is_(None)
            )
            if product_scope is not None:
                price_query = price_query.where(product_scope)
            missing_prices = int(db.scalar(price_query) or 0)
            if missing_prices:
                attention.append(
                    DashboardAttentionItem(
                        key="missing_price",
                        title="Products missing price",
                        count=missing_prices,
                        severity="critical",
                        target="products",
                        filter_name="needs",
                        filter_value="price",
                    )
                )
        if has_permission(user, "data_sync.view"):
            for key, title, count, value in (
                ("missing_source", "Products missing from source", product_metrics.products_missing_from_source or 0, "source"),
                ("stale_stock", "Products with stale stock", product_metrics.products_with_stale_stock or 0, "stale_stock"),
            ):
                if count:
                    attention.append(
                        DashboardAttentionItem(
                            key=key,
                            title=title,
                            count=count,
                            severity="critical" if key == "missing_source" else "warning",
                            target="products",
                            filter_name="needs",
                            filter_value=value,
                        )
                    )

    my_work: list[DashboardWorkItem] = []
    if can_view_catalogues:
        own_catalogues = select(Catalogue).where(
            Catalogue.status.in_(("draft", "in_review")),
            or_(
                Catalogue.owner_id == user.id,
                Catalogue.created_by_id == user.id,
                Catalogue.updated_by_id == user.id,
            ),
        )
        if catalogue_scope is not None:
            own_catalogues = own_catalogues.where(catalogue_scope)
        for item in db.scalars(own_catalogues.order_by(Catalogue.updated_at.desc()).limit(4)):
            my_work.append(
                DashboardWorkItem(
                    id=item.id,
                    item_type="catalogue",
                    name=item.title,
                    status=item.status,
                    priority="high" if item.status == "in_review" else "normal",
                    updated_at=item.updated_at,
                    action="Review" if item.status == "in_review" else "Continue editing",
                    href=f"/dashboard?view=catalogues&catalogue={item.id}",
                )
            )
    if has_permission(user, "catalogue_designs.view"):
        design_query = select(CatalogueDesign).where(
            CatalogueDesign.deleted_at.is_(None),
            CatalogueDesign.status == "draft",
            or_(
                CatalogueDesign.created_by_id == user.id,
                CatalogueDesign.updated_by_id == user.id,
            ),
        )
        for item in db.scalars(design_query.order_by(CatalogueDesign.updated_at.desc()).limit(4)):
            my_work.append(
                DashboardWorkItem(
                    id=item.id,
                    item_type="studio_design",
                    name=item.name,
                    status=item.status,
                    updated_at=item.updated_at,
                    action="Open Studio",
                    href=f"/catalogue-studio/{item.id}/editor",
                )
            )
    if can_view_promotions:
        promotion_query = select(Promotion).where(
            Promotion.deleted_at.is_(None),
            Promotion.status.in_(("draft", "pending_review", "approved", "scheduled")),
            or_(Promotion.owner_user_id == user.id, Promotion.created_by_id == user.id),
        )
        for item in db.scalars(promotion_query.order_by(Promotion.updated_at.desc()).limit(4)):
            my_work.append(
                DashboardWorkItem(
                    id=item.id,
                    item_type="promotion",
                    name=item.name_en,
                    status="draft" if item.status in {"pending_review", "approved", "rejected"} else item.status,
                    priority="normal",
                    updated_at=item.updated_at,
                    due_at=item.start_at,
                    action="Continue editing",
                    href=f"/promotions/{item.id}",
                )
            )
    my_work.sort(key=lambda item: _as_utc(item.updated_at) or datetime.min.replace(tzinfo=UTC), reverse=True)
    my_work = my_work[:6]

    recent_catalogues: list[DashboardCatalogueItem] = []
    if can_view_catalogues:
        product_counts = (
            select(
                CatalogueProduct.catalogue_id.label("catalogue_id"),
                func.count(CatalogueProduct.id).label("product_count"),
            )
            .group_by(CatalogueProduct.catalogue_id)
            .subquery()
        )
        editor = aliased(User)
        query = (
            select(
                Catalogue,
                func.coalesce(product_counts.c.product_count, 0),
                editor.full_name,
            )
            .outerjoin(product_counts, product_counts.c.catalogue_id == Catalogue.id)
            .outerjoin(editor, editor.id == Catalogue.updated_by_id)
            .options(noload(Catalogue.product_links), noload(Catalogue.share_links))
        )
        if catalogue_scope is not None:
            query = query.where(catalogue_scope)
        rows = db.execute(query.order_by(Catalogue.updated_at.desc()).limit(6)).unique().all()
        catalogue_ids = [item.id for item, _, _ in rows]
        designs = {
            item.catalogue_id: item
            for item in db.scalars(
                select(CatalogueDesign).where(
                    CatalogueDesign.catalogue_id.in_(catalogue_ids),
                    CatalogueDesign.deleted_at.is_(None),
                )
            )
        } if catalogue_ids else {}
        for item, product_count, editor_name in rows:
            design = designs.get(item.id)
            recent_catalogues.append(
                DashboardCatalogueItem(
                    id=item.id,
                    title=item.title,
                    brand=item.brand,
                    brand_mode=(design.brand_mode if design and design.brand_mode in {"single", "multi"} else ("single" if item.brand else "multi")),
                    catalogue_type=design.catalogue_type if design else "standard",
                    status=item.status,
                    product_count=int(product_count),
                    price_mode=("restricted" if not can_view_prices else "priced" if item.show_prices else "no_price"),
                    updated_by=editor_name,
                    updated_at=item.updated_at,
                    primary_action=_catalogue_primary_action(item.status),
                    href=(f"/catalogues/{item.id}/preview" if item.status == "published" else f"/dashboard?view=catalogues&catalogue={item.id}"),
                    studio_href=(f"/catalogue-studio/{design.id}/editor" if design and has_permission(user, "catalogue_designs.view") else None),
                )
            )

    recent_products: list[DashboardProductItem] = []
    if can_view_products:
        product_scope = _product_scope_filter(db, user, "products.view")
        updater = aliased(User)
        query = (
            select(Product, CatalogueEntry, updater.full_name)
            .select_from(Product)
            .join(CatalogueEntry, CatalogueEntry.product_id == Product.id)
            .outerjoin(updater, updater.id == CatalogueEntry.updated_by_id)
            .options(selectinload(Product.images), selectinload(Product.categories))
        )
        if product_scope is not None:
            query = query.where(product_scope)
        if not can_view_inactive:
            query = query.where(Product.status == "active")
        product_rows = db.execute(
            query.order_by(CatalogueEntry.updated_at.desc()).limit(6)
        ).unique().all()
        visible_prices: dict = {}
        visible_currency: dict = {}
        if can_view_prices and product_rows:
            allowed_lists = allowed_price_list_ids(db, user)
            mapped_list_id = db.scalar(
                select(UserCataloguePriceMapping.price_list_id)
                .where(UserCataloguePriceMapping.user_id == user.id)
                .order_by(UserCataloguePriceMapping.id)
                .limit(1)
            )
            if mapped_list_id and (allowed_lists is None or mapped_list_id in allowed_lists):
                price_rows = db.execute(
                    select(ProductPrice)
                    .where(
                        ProductPrice.product_id.in_([row[0].id for row in product_rows]),
                        ProductPrice.price_list_id == mapped_list_id,
                        ProductPrice.status == "active",
                        ProductPrice.effective_from <= datetime.now(UTC),
                        or_(ProductPrice.expires_at.is_(None), ProductPrice.expires_at > datetime.now(UTC)),
                    )
                    .order_by(ProductPrice.effective_from.desc())
                ).scalars()
                for price in price_rows:
                    visible_prices.setdefault(price.product_id, price.amount)
                    visible_currency.setdefault(price.product_id, price.currency)
        for product, entry, updater_name in product_rows:
            image = next((item for item in product.images if item.is_primary), None)
            if image is None and product.images:
                image = product.images[0]
            recent_products.append(
                DashboardProductItem(
                    id=product.id,
                    code=product.sku,
                    name=entry.display_name or product.erp_name,
                    brand=product.brand,
                    category=(product.categories[0].name if product.categories else product.erp_category),
                    status=product.status,
                    workflow_status=entry.workflow_status,
                    stock=product.stock_quantity,
                    price=visible_prices.get(product.id),
                    currency=visible_currency.get(product.id),
                    image_url=image.public_url if image else None,
                    updated_by=updater_name,
                    updated_at=entry.updated_at,
                )
            )

    upcoming_promotions: list[DashboardPromotionItem] = []
    if can_view_promotions:
        now = datetime.now(UTC)
        query = (
            select(Promotion)
            .where(
                Promotion.deleted_at.is_(None),
                Promotion.is_active.is_(True),
                Promotion.end_at > now,
                Promotion.status.in_(("approved", "scheduled", "active")),
            )
            .options(
                selectinload(Promotion.brands),
                selectinload(Promotion.products),
                selectinload(Promotion.audiences),
            )
        )
        if promotion_scope is not None:
            query = query.where(promotion_scope)
        for item in db.scalars(query.order_by(Promotion.start_at.asc()).limit(6)).unique():
            upcoming_promotions.append(
                DashboardPromotionItem(
                    id=item.id,
                    name=item.name_en,
                    occasion=item.occasion.name_en if item.occasion else None,
                    brands=[row.brand.name for row in item.brands],
                    start_at=item.start_at,
                    end_at=item.end_at,
                    timezone=item.timezone,
                    status=item.status,
                    audiences=[row.audience_type.display_name for row in item.audiences],
                    product_count=len({row.product_id for row in item.products}),
                    href=f"/promotions/{item.id}",
                )
            )

    return DashboardOverviewResponse(
        summary=DashboardSummary(
            active_products=product_metrics.active_products if product_metrics else None,
            inactive_products=(product_metrics.inactive_products if product_metrics and can_view_inactive else None),
            published_catalogues=published_catalogues,
            draft_catalogues=draft_catalogues,
            active_promotions=active_promotions,
            pending_my_approval=approval_count,
        ),
        product_metrics=product_metrics,
        attention=attention,
        my_work=my_work,
        recent_catalogues=recent_catalogues,
        recent_products=recent_products,
        upcoming_promotions=upcoming_promotions,
        sync_status=_sync_status(db, user),
        system_health=_system_health(db, user),
    )
