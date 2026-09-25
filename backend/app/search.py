"""Permission- and record-scope-aware global search."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import false, func, or_, select
from sqlalchemy.orm import Session

from app.access import (
    allowed_brand_names,
    assigned_category_ids,
    effective_permission_access,
    has_permission,
    is_superadmin,
)
from app.auth import get_current_user
from app.catalogue import _product_scope_filter
from app.commerce_models import Catalogue
from app.dashboard import _catalogue_scope_filter, _promotion_scope_filter
from app.database import get_db
from app.models import Brand, Category, Product, User, product_categories
from app.promotion_models import Promotion
from app.search_schemas import GlobalSearchItem, GlobalSearchResponse


router = APIRouter(prefix="/search", tags=["Search"])


def _pattern(value: str) -> str:
    escaped = value.casefold().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _matches(column, pattern: str):
    return func.lower(func.coalesce(column, "")).like(pattern, escape="\\")


@router.get("/global", response_model=GlobalSearchResponse)
def global_search(
    q: str = Query(min_length=2, max_length=80),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> GlobalSearchResponse:
    query_text = q.strip()
    if len(query_text) < 2:
        return GlobalSearchResponse(query=query_text)
    pattern = _pattern(query_text)
    groups: dict[str, list[GlobalSearchItem]] = {}

    if has_permission(user, "products.view"):
        product_query = select(Product).where(
            or_(
                _matches(Product.sku, pattern),
                _matches(Product.barcode, pattern),
                _matches(Product.erp_name, pattern),
                _matches(Product.erp_name_th, pattern),
                _matches(Product.brand, pattern),
            )
        )
        product_scope = _product_scope_filter(db, user, "products.view")
        if product_scope is not None:
            product_query = product_query.where(product_scope)
        if not is_superadmin(user):
            product_query = product_query.where(Product.status == "active")
        products = list(db.scalars(product_query.order_by(Product.erp_name).limit(5)).unique())
        if products:
            groups["products"] = [
                GlobalSearchItem(
                    kind="product",
                    id=str(product.id),
                    title=product.erp_name,
                    subtitle=" · ".join(item for item in [product.sku, product.brand] if item),
                    href=f"/dashboard?view=products&q={product.sku}",
                    search_value=product.sku,
                )
                for product in products
            ]

    if has_permission(user, "catalogues.view"):
        catalogue_query = select(Catalogue).where(
            or_(_matches(Catalogue.title, pattern), _matches(Catalogue.brand, pattern))
        )
        catalogue_scope = _catalogue_scope_filter(db, user)
        if catalogue_scope is not None:
            catalogue_query = catalogue_query.where(catalogue_scope)
        catalogues = list(db.scalars(catalogue_query.order_by(Catalogue.updated_at.desc()).limit(5)).unique())
        if catalogues:
            groups["catalogues"] = [
                GlobalSearchItem(
                    kind="catalogue",
                    id=str(item.id),
                    title=item.title,
                    subtitle=" · ".join(value for value in [item.brand, item.status.title()] if value),
                    href=(f"/catalogues/{item.id}/preview" if item.status == "published" else f"/dashboard?view=catalogues&catalogue={item.id}"),
                )
                for item in catalogues
            ]

    if has_permission(user, "promotions.view"):
        promotion_query = select(Promotion).where(
            Promotion.deleted_at.is_(None),
            or_(
                _matches(Promotion.code, pattern),
                _matches(Promotion.name_en, pattern),
                _matches(Promotion.name_th, pattern),
                _matches(Promotion.short_title, pattern),
            ),
        )
        promotion_scope = _promotion_scope_filter(db, user)
        if promotion_scope is not None:
            promotion_query = promotion_query.where(promotion_scope)
        promotions = list(db.scalars(promotion_query.order_by(Promotion.updated_at.desc()).limit(5)).unique())
        if promotions:
            groups["promotions"] = [
                GlobalSearchItem(
                    kind="promotion",
                    id=str(item.id),
                    title=item.name_en,
                    subtitle=f"{item.code} · {item.status.title()}",
                    href=f"/promotions/{item.id}",
                )
                for item in promotions
            ]

    if has_permission(user, "brands.view"):
        brand_access = effective_permission_access(db, user, "brands.view")
        brand_query = select(Brand).where(Brand.is_active.is_(True), _matches(Brand.name, pattern))
        if not is_superadmin(user) and "all" not in brand_access.scopes:
            names = allowed_brand_names(db, user, edit=False)
            brand_query = brand_query.where(func.lower(Brand.name).in_(names) if names else false())
        brands = list(db.scalars(brand_query.order_by(Brand.name).limit(5)))
        if brands:
            groups["brands"] = [
                GlobalSearchItem(
                    kind="brand",
                    id=str(item.id),
                    title=item.name,
                    subtitle=item.code,
                    href=f"/dashboard?view=products&brand={item.name}",
                    search_value=item.name,
                )
                for item in brands
            ]

    if has_permission(user, "categories.view"):
        category_access = effective_permission_access(db, user, "categories.view")
        category_query = select(Category).where(
            Category.is_active.is_(True),
            or_(_matches(Category.name, pattern), _matches(Category.description, pattern)),
        )
        if not is_superadmin(user) and "all" not in category_access.scopes:
            conditions = []
            if "assigned_categories" in category_access.scopes:
                category_ids = assigned_category_ids(db, user, edit=False)
                if category_ids:
                    conditions.append(Category.id.in_(category_ids))
            if {"assigned_brands", "department"}.intersection(category_access.scopes):
                names = allowed_brand_names(db, user, edit=False)
                if names:
                    conditions.append(
                        select(product_categories.c.category_id)
                        .join(Product, Product.id == product_categories.c.product_id)
                        .where(
                            product_categories.c.category_id == Category.id,
                            func.lower(Product.brand).in_(names),
                        )
                        .exists()
                    )
            category_query = category_query.where(or_(*conditions) if conditions else false())
        categories = list(db.scalars(category_query.order_by(Category.name).limit(5)))
        if categories:
            groups["categories"] = [
                GlobalSearchItem(
                    kind="category",
                    id=str(item.id),
                    title=item.name,
                    subtitle=item.description,
                    href=f"/dashboard?view=products&category={item.id}",
                    search_value=str(item.id),
                )
                for item in categories
            ]

    return GlobalSearchResponse(
        query=query_text,
        groups=groups,
        total=sum(len(items) for items in groups.values()),
    )
