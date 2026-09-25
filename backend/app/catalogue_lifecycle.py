from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.catalogue_auto_generation import AUTO_SLUG_PREFIX, _match_key, _natural_key
from app.commerce_models import Catalogue, CatalogueProduct, CatalogueVersion
from app.models import AuditLog, Product


def _category_title(product: Product) -> str:
    return (product.erp_category or "Uncategorised").strip() or "Uncategorised"


def reconcile_erp_catalogue_membership(
    db: Session,
    *,
    actor_id=None,
    product_ids: set | None = None,
    publish_changed_catalogues: bool = True,
) -> dict[str, int]:
    """Make generated ERP-brand catalogues mirror the active ERP product set.

    Manually curated catalogues deliberately retain their saved assignment so a
    temporarily inactive product can return when it is reactivated. All public
    renderers independently enforce the active-only rule. Generated ERP-brand
    catalogues are different: their stored membership is maintained here and
    therefore never contains inactive, missing, or wrong-brand products.
    """

    all_auto_catalogues = list(
        db.scalars(
            select(Catalogue).where(Catalogue.slug.like(f"{AUTO_SLUG_PREFIX}%"))
        )
    )
    if product_ids is not None:
        changed_products = list(
            db.scalars(select(Product).where(Product.id.in_(product_ids)))
        ) if product_ids else []
        changed_brand_keys = {
            _match_key(product.brand) for product in changed_products if product.brand
        }
        linked_catalogue_ids = set(
            db.scalars(
                select(CatalogueProduct.catalogue_id)
                .join(Catalogue, Catalogue.id == CatalogueProduct.catalogue_id)
                .where(
                    Catalogue.slug.like(f"{AUTO_SLUG_PREFIX}%"),
                    CatalogueProduct.product_id.in_(product_ids),
                )
                .distinct()
            )
        ) if product_ids else set()
        scoped_catalogue_ids = {
            catalogue.id
            for catalogue in all_auto_catalogues
            if catalogue.id in linked_catalogue_ids
            or _match_key(catalogue.brand) in changed_brand_keys
        }
        catalogues = list(
            db.scalars(
                select(Catalogue)
                .options(selectinload(Catalogue.product_links))
                .where(Catalogue.id.in_(scoped_catalogue_ids))
            ).unique()
        ) if scoped_catalogue_ids else []
        active_products = [
            product
            for product in changed_products
            if product.source_system == "gms_erp"
            and product.source_record_exists
            and product.status == "active"
            and (product.brand or "").strip()
        ]
    else:
        catalogues = list(
            db.scalars(
                select(Catalogue)
                .options(selectinload(Catalogue.product_links))
                .where(Catalogue.slug.like(f"{AUTO_SLUG_PREFIX}%"))
            ).unique()
        )
        active_products = list(
            db.scalars(
                select(Product).where(
                    Product.source_system == "gms_erp",
                    Product.source_record_exists.is_(True),
                    Product.status == "active",
                    Product.brand.is_not(None),
                    Product.brand != "",
                )
            )
        )
    products_by_brand: dict[str, list[Product]] = {}
    for product in active_products:
        products_by_brand.setdefault(_match_key(product.brand), []).append(product)
    for products in products_by_brand.values():
        products.sort(key=lambda item: (_natural_key(item.sku), item.erp_name.casefold()))

    result = {
        "catalogues_checked": len(catalogues),
        "catalogues_changed": 0,
        "products_added": 0,
        "products_removed": 0,
        "published_versions_created": 0,
    }
    now = datetime.now(UTC)
    changed_catalogues: list[Catalogue] = []

    for catalogue in catalogues:
        desired_products = products_by_brand.get(_match_key(catalogue.brand), [])
        desired_ids = {product.id for product in desired_products}
        existing_by_product = {
            link.product_id: link for link in catalogue.product_links
        }

        removed = [
            link
            for link in catalogue.product_links
            if (product_ids is None or link.product_id in product_ids)
            and link.product_id not in desired_ids
        ]
        missing = [
            product for product in desired_products if product.id not in existing_by_product
        ]
        if not removed and not missing:
            continue

        for link in removed:
            db.delete(link)
        if removed:
            db.flush()

        kept_links = [link for link in catalogue.product_links if link not in removed]
        next_sort_order = max((link.sort_order for link in kept_links), default=0) + 1
        existing_sections = {
            _match_key(link.section_title)
            for link in kept_links
            if link.section_title
        }
        for product in missing:
            category_title = _category_title(product)
            section_key = _match_key(category_title)
            section_title = "" if section_key in existing_sections else category_title
            existing_sections.add(section_key)
            db.add(
                CatalogueProduct(
                    catalogue_id=catalogue.id,
                    product_id=product.id,
                    section_title=section_title,
                    override_description="",
                    hide_price=False,
                    include_video=True,
                    selected_video_id=None,
                    video_title_override="",
                    video_description_override="",
                    video_display_mode="product_detail",
                    video_thumbnail_mode="video_thumbnail",
                    sort_order=next_sort_order,
                )
            )
            next_sort_order += 1

        catalogue.updated_at = now
        catalogue.updated_by_id = actor_id or catalogue.updated_by_id
        catalogue.revision += 1
        result["catalogues_changed"] += 1
        result["products_added"] += len(missing)
        result["products_removed"] += len(removed)
        changed_catalogues.append(catalogue)

    db.flush()

    # Customer links resolve the latest immutable published version. When a
    # published generated catalogue changes membership, publish a replacement
    # snapshot so activation changes become visible without administrator work.
    if publish_changed_catalogues:
        from app.commerce import _build_snapshot

        for catalogue in changed_catalogues:
            if catalogue.status != "published":
                continue
            db.expire(catalogue, ["product_links"])
            next_version = catalogue.version + 1
            snapshot = _build_snapshot(db, catalogue, strict_prices=False)
            snapshot["version"] = next_version
            db.add(
                CatalogueVersion(
                    catalogue_id=catalogue.id,
                    version_number=next_version,
                    snapshot=snapshot,
                    published_by_id=actor_id or catalogue.published_by_id,
                    published_at=now,
                )
            )
            catalogue.version = next_version
            catalogue.published_at = now
            catalogue.published_by_id = actor_id or catalogue.published_by_id
            result["published_versions_created"] += 1

    if result["catalogues_changed"]:
        db.add(
            AuditLog(
                user_id=actor_id,
                action="erp_catalogue_membership_reconciled",
                module="catalogues",
                status="success",
                identifier="erp-brand-catalogues",
                details=result.copy(),
            )
        )
    return result
