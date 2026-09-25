"""Publish initial ERP catalogue versions and create every customer-level link.

This backfill is intentionally idempotent. Existing published versions and
share-link tokens are preserved; only missing versions or audience links are
created. Customer-facing prices remain selected by each ERP-mapped audience
link, so the catalogue master itself uses the No Price list.
"""

from __future__ import annotations

import argparse
from datetime import UTC, datetime

from sqlalchemy import func, select

from app.catalogue_auto_generation import AUTO_SLUG_PREFIX, _ensure_customer_level_audiences
from app.catalogue_share_links import ensure_share_links_for_catalogue
from app.commerce import _build_snapshot, _get_catalogue
from app.commerce_models import Catalogue, CatalogueShareLink, CatalogueVersion, PriceList
from app.database import SessionLocal
from app.models import AuditLog, Product, User


def publish_erp_customer_links(actor_username: str) -> dict:
    published = 0
    already_published = 0
    failed: list[str] = []
    with SessionLocal() as db:
        actor = db.scalar(
            select(User).where(func.lower(User.username) == actor_username.casefold())
        )
        if actor is None:
            raise RuntimeError(f"User {actor_username!r} was not found.")
        _, warnings = _ensure_customer_level_audiences(db, actor.id)
        no_price = db.scalar(
            select(PriceList).where(
                PriceList.is_no_price.is_(True),
                PriceList.is_active.is_(True),
            )
        )
        if no_price is None:
            raise RuntimeError("The active No Price list is missing.")
        db.commit()

        catalogue_ids = list(
            db.scalars(
                select(Catalogue.id)
                .where(Catalogue.slug.like(f"{AUTO_SLUG_PREFIX}%"))
                .order_by(Catalogue.title)
            )
        )
        for position, catalogue_id in enumerate(catalogue_ids, start=1):
            try:
                catalogue = _get_catalogue(db, catalogue_id)
                if not catalogue.product_links:
                    failed.append(f"{catalogue.slug}: no products")
                    continue
                if catalogue.version < 1:
                    catalogue.price_list = no_price
                    catalogue.price_list_id = no_price.id
                    catalogue.show_prices = False
                    catalogue.audience = "All ERP customer levels"
                    snapshot = _build_snapshot(db, catalogue, strict_prices=False)
                    snapshot["version"] = 1
                    published_at = datetime.now(UTC)
                    db.add(
                        CatalogueVersion(
                            catalogue_id=catalogue.id,
                            version_number=1,
                            snapshot=snapshot,
                            published_by_id=actor.id,
                            published_at=published_at,
                        )
                    )
                    catalogue.version = 1
                    catalogue.status = "published"
                    catalogue.published_by_id = actor.id
                    catalogue.published_at = published_at
                    catalogue.updated_by_id = actor.id
                    catalogue.revision += 1
                    db.add(
                        AuditLog(
                            user_id=actor.id,
                            action="erp_catalogue_initial_version_published",
                            module="catalogues",
                            status="success",
                            identifier=catalogue.slug,
                            details={
                                "version": 1,
                                "pricing": "customer_level_share_links",
                                "product_count": len(catalogue.product_links),
                            },
                        )
                    )
                    db.flush()
                    published += 1
                else:
                    already_published += 1
                ensure_share_links_for_catalogue(db, catalogue, actor.id)
                db.commit()
            except Exception as exc:
                db.rollback()
                failed.append(f"{catalogue_id}: {type(exc).__name__}: {exc}")
            if position % 10 == 0 or position == len(catalogue_ids):
                print(f"Processed {position}/{len(catalogue_ids)} catalogues", flush=True)

        link_count = db.scalar(
            select(func.count(CatalogueShareLink.id))
            .join(Catalogue, Catalogue.id == CatalogueShareLink.catalogue_id)
            .where(Catalogue.slug.like(f"{AUTO_SLUG_PREFIX}%"))
        ) or 0
        return {
            "catalogues": len(catalogue_ids),
            "published": published,
            "already_published": already_published,
            "customer_links": link_count,
            "warnings": warnings,
            "failures": failed,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--actor", default="superadmin")
    args = parser.parse_args()
    print(publish_erp_customer_links(args.actor))


if __name__ == "__main__":
    main()
