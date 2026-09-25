import hashlib
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.access import role_names, require_permission
from app.catalogue_share_links import _public_url, _token_value
from app.commerce_models import (
    Catalogue,
    CatalogueAudienceType,
    CatalogueProduct,
    CatalogueShareLink,
    PriceList,
    UserBrandCataloguePriceMapping,
    UserCataloguePriceMapping,
)
from app.config import settings
from app.customer_portal_schemas import (
    CustomerPortalBrandPrice,
    CustomerPortalCatalogue,
    CustomerPortalIdentity,
    CustomerPortalPromotion,
    CustomerPortalResponse,
)
from app.database import get_db
from app.erp_models import ErpCustomerPriceLevel
from app.models import Product, User
from app.platform_models import CatalogueCoverAsset
from app.promotion_models import Promotion, PromotionAudience, PromotionCatalogue, PromotionMedia
from app.promotion_service import promotion_response
from app.storage import promotion_storage


router = APIRouter(prefix="/customer-portal", tags=["Customer portal"])


def _now() -> datetime:
    return datetime.now(UTC)


def _utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _is_available(link: CatalogueShareLink, now: datetime) -> bool:
    return (
        link.status == "active"
        and (link.expires_at is None or _utc(link.expires_at) > now)
        and link.catalogue.status == "published"
        and link.catalogue.version >= 1
    )


def _access_link(db: Session, token: str) -> CatalogueShareLink:
    if len(token) < 20:
        raise HTTPException(status_code=404, detail="Customer access code not found.")
    link = db.scalar(
        select(CatalogueShareLink)
        .options(
            selectinload(CatalogueShareLink.catalogue),
            selectinload(CatalogueShareLink.audience_type).selectinload(
                CatalogueAudienceType.price_list
            ),
        )
        .where(CatalogueShareLink.token_hash == hashlib.sha256(token.encode()).hexdigest())
    )
    if not link or not link.customer_code or not link.customer_name:
        raise HTTPException(status_code=404, detail="Customer access code not found.")
    if not _is_available(link, _now()):
        raise HTTPException(status_code=410, detail="This customer access code is unavailable.")
    return link


def _cover_urls(db: Session, catalogue_ids: list) -> dict:
    if not catalogue_ids:
        return {}
    assets = db.scalars(
        select(CatalogueCoverAsset).where(
            CatalogueCoverAsset.catalogue_id.in_(catalogue_ids),
            CatalogueCoverAsset.deleted_at.is_(None),
            CatalogueCoverAsset.asset_type.in_(("full_cover", "background")),
        )
    ).all()
    result = {}
    for asset in sorted(assets, key=lambda item: item.asset_type != "full_cover"):
        result.setdefault(
            asset.catalogue_id,
            f"{settings.api_prefix}/v1/catalogues/{asset.catalogue_id}/cover/assets/{asset.id}/content?preview=true",
        )
    return result


def _brand_prices(
    db: Session,
    link: CatalogueShareLink,
    catalogue_ids: list,
) -> list[CustomerPortalBrandPrice]:
    if not catalogue_ids:
        return []
    catalogue_brand_rows = db.execute(
        select(Catalogue.id, Catalogue.brand).where(Catalogue.id.in_(catalogue_ids))
    ).all()
    configured_brands = {
        brand.strip() for _, brand in catalogue_brand_rows if brand and brand.strip()
    }
    multi_brand_ids = [
        catalogue_id
        for catalogue_id, brand in catalogue_brand_rows
        if not brand or not brand.strip()
    ]
    product_brands = db.scalars(
        select(Product.brand)
        .join(CatalogueProduct, CatalogueProduct.product_id == Product.id)
        .where(
            CatalogueProduct.catalogue_id.in_(multi_brand_ids),
            Product.brand.is_not(None),
        )
    ) if multi_brand_ids else []
    brands = sorted(
        configured_brands | {
            brand.strip() for brand in product_brands if brand and brand.strip()
        },
        key=str.casefold,
    )
    generic = db.scalar(
        select(UserCataloguePriceMapping)
        .options(selectinload(UserCataloguePriceMapping.price_list))
        .where(
            UserCataloguePriceMapping.user_id == link.created_by_id,
            UserCataloguePriceMapping.audience_type_id == link.audience_type_id,
        )
    ) if link.created_by_id else None
    overrides = {
        row.brand_key: row
        for row in db.scalars(
            select(UserBrandCataloguePriceMapping)
            .options(selectinload(UserBrandCataloguePriceMapping.price_list))
            .where(
                UserBrandCataloguePriceMapping.user_id == link.created_by_id,
                UserBrandCataloguePriceMapping.audience_type_id == link.audience_type_id,
            )
        )
    } if link.created_by_id else {}
    fallback = generic.price_list if generic else (link.price_list or link.audience_type.price_list)
    selected_lists: dict[int, PriceList] = {}
    resolved = []
    for brand in brands:
        override = overrides.get(brand.casefold())
        price_list = override.price_list if override else fallback
        if price_list:
            selected_lists[price_list.id] = price_list
        resolved.append((brand, price_list, bool(override)))
    erp_codes = {
        row.price_list_id: row.source_code
        for row in db.scalars(
            select(ErpCustomerPriceLevel).where(
                ErpCustomerPriceLevel.price_list_id.in_(selected_lists),
                ErpCustomerPriceLevel.is_active.is_(True),
            )
        )
    } if selected_lists else {}
    return [
        CustomerPortalBrandPrice(
            brand=brand,
            price_list_code=erp_codes.get(price_list.id, price_list.code) if price_list else "No Price",
            price_list_name=price_list.name if price_list else "No Price",
            is_brand_override=is_override,
        )
        for brand, price_list, is_override in resolved
    ]


def _active_promotions(
    db: Session,
    link: CatalogueShareLink,
    links_by_catalogue: dict,
    request: Request,
) -> list[CustomerPortalPromotion]:
    catalogue_ids = list(links_by_catalogue)
    if not catalogue_ids:
        return []
    now = _now()
    promotions = db.scalars(
        select(Promotion)
        .options(
            selectinload(Promotion.catalogues),
            selectinload(Promotion.media),
        )
        .join(PromotionCatalogue, PromotionCatalogue.promotion_id == Promotion.id)
        .join(PromotionAudience, PromotionAudience.promotion_id == Promotion.id)
        .where(
            PromotionCatalogue.catalogue_id.in_(catalogue_ids),
            PromotionAudience.audience_type_id == link.audience_type_id,
            Promotion.status == "active",
            Promotion.is_active.is_(True),
            Promotion.deleted_at.is_(None),
            Promotion.start_at <= now,
            Promotion.end_at > now,
        )
        .order_by(Promotion.priority.desc(), Promotion.end_at)
    ).unique().all()
    response = []
    for promotion in promotions:
        attached_ids = [
            item.catalogue_id
            for item in promotion.catalogues
            if item.catalogue_id in links_by_catalogue
        ]
        if not attached_ids:
            continue
        banner = next(
            (
                item
                for item in sorted(promotion.media, key=lambda media: media.display_order)
                if item.is_active and item.media_type == "banner" and (item.preview_storage_key or item.storage_key)
            ),
            None,
        )
        cover_url = promotion_storage.public_url(
            banner.preview_storage_key or banner.storage_key
        ) if banner else promotion_response(
            db, promotion, include_internal=False
        ).cover_url
        response.append(
            CustomerPortalPromotion(
                id=promotion.id,
                name=promotion.name_en,
                description=promotion.description_en,
                cover_url=cover_url,
                start_at=promotion.start_at,
                end_at=promotion.end_at,
                public_url=_public_url(links_by_catalogue[attached_ids[0]], request=request),
                catalogue_ids=attached_ids,
            )
        )
    return response


@router.get("", response_model=CustomerPortalResponse)
def customer_portal(
    request: Request,
    x_customer_access: str = Header(min_length=20),
    actor: User = Depends(require_permission("customer_portal.view")),
    db: Session = Depends(get_db),
) -> CustomerPortalResponse:
    if "customer_user" not in role_names(actor):
        raise HTTPException(status_code=403, detail="Customer account access is required.")
    access_link = _access_link(db, x_customer_access.strip())
    candidates = db.scalars(
        select(CatalogueShareLink)
        .options(
            selectinload(CatalogueShareLink.catalogue),
            selectinload(CatalogueShareLink.audience_type),
        )
        .where(
            CatalogueShareLink.customer_code == access_link.customer_code,
            CatalogueShareLink.created_by_id == access_link.created_by_id,
            CatalogueShareLink.audience_type_id == access_link.audience_type_id,
        )
    ).all()
    links_by_catalogue = {
        item.catalogue_id: item for item in candidates if _is_available(item, _now())
    }
    catalogue_ids = list(links_by_catalogue)
    cover_urls = _cover_urls(db, catalogue_ids)
    product_counts = {
        catalogue_id: count
        for catalogue_id, count in db.execute(
            select(CatalogueProduct.catalogue_id, func.count(CatalogueProduct.id))
            .where(CatalogueProduct.catalogue_id.in_(catalogue_ids))
            .group_by(CatalogueProduct.catalogue_id)
        )
    } if catalogue_ids else {}
    catalogue_rows = sorted(
        (item.catalogue for item in links_by_catalogue.values()),
        key=lambda item: item.updated_at,
        reverse=True,
    )
    catalogues = []
    for catalogue in catalogue_rows:
        catalogue_link = links_by_catalogue[catalogue.id]
        public_url = _public_url(catalogue_link, request=request)
        token = _token_value(catalogue_link)
        catalogues.append(
            CustomerPortalCatalogue(
                id=catalogue.id,
                title=catalogue.title,
                brand=catalogue.brand,
                description=catalogue.description,
                updated_at=catalogue.updated_at,
                product_count=product_counts.get(catalogue.id, 0),
                cover_url=cover_urls.get(catalogue.id),
                public_url=public_url,
                pdf_url=(
                    f"{settings.api_prefix}/v1/public/catalogues/{token}/pdf"
                    if catalogue_link.allow_pdf_download
                    else None
                ),
                allow_pdf_download=catalogue_link.allow_pdf_download,
            )
        )
    return CustomerPortalResponse(
        customer=CustomerPortalIdentity(
            code=access_link.customer_code,
            name=access_link.customer_name or access_link.customer_code,
            audience_code=access_link.audience_type.code,
            audience_name=access_link.audience_type.display_name,
        ),
        catalogues=catalogues,
        promotions=_active_promotions(db, access_link, links_by_catalogue, request),
        brand_prices=_brand_prices(db, access_link, catalogue_ids),
    )
