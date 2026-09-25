"""Remove local/demo products after a successful authoritative ERP sync.

The command is intentionally deny-by-default. Run without the confirmation flag
to preview the cleanup counts.
"""

import argparse
from pathlib import Path

from sqlalchemy import delete, or_, select, update

from app.commerce_models import (
    Catalogue,
    CatalogueProduct,
    CatalogueVersion,
    PriceChangeRequest,
    ProductPrice,
)
from app.config import settings
from app.database import SessionLocal
from app.models import (
    AuditLog,
    CatalogueEntry,
    Product,
    ProductImage,
    product_categories,
    user_product_access,
)


SOURCE_SYSTEM = "gms_erp"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--confirm-remove-non-erp", action="store_true")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        product_rows = db.execute(
            select(Product.id, Product.sku).where(
                or_(Product.source_system.is_(None), Product.source_system != SOURCE_SYSTEM)
            )
        ).all()
        product_ids = [row.id for row in product_rows]
        if not product_ids:
            print("No non-ERP products found.")
            return

        image_rows = db.execute(
            select(ProductImage.storage_name).where(ProductImage.product_id.in_(product_ids))
        ).all()
        catalogue_ids = list(
            db.scalars(
                select(CatalogueProduct.catalogue_id)
                .where(CatalogueProduct.product_id.in_(product_ids))
                .distinct()
            )
        )
        counts = {
            "products": len(product_ids),
            "images": len(image_rows),
            "catalogues_reset": len(catalogue_ids),
            "catalogue_links": db.query(CatalogueProduct).filter(CatalogueProduct.product_id.in_(product_ids)).count(),
            "catalogue_versions": db.query(CatalogueVersion).filter(CatalogueVersion.catalogue_id.in_(catalogue_ids)).count() if catalogue_ids else 0,
            "product_prices": db.query(ProductPrice).filter(ProductPrice.product_id.in_(product_ids)).count(),
            "price_requests": db.query(PriceChangeRequest).filter(PriceChangeRequest.product_id.in_(product_ids)).count(),
        }
        print(counts)
        print("SKUs:", ", ".join(sorted(row.sku for row in product_rows)))
        if not args.confirm_remove_non_erp:
            print("Preview only. Pass --confirm-remove-non-erp to execute.")
            return

        db.execute(delete(PriceChangeRequest).where(PriceChangeRequest.product_id.in_(product_ids)))
        db.execute(delete(ProductPrice).where(ProductPrice.product_id.in_(product_ids)))
        if catalogue_ids:
            db.execute(delete(CatalogueVersion).where(CatalogueVersion.catalogue_id.in_(catalogue_ids)))
        db.execute(delete(CatalogueProduct).where(CatalogueProduct.product_id.in_(product_ids)))
        if catalogue_ids:
            db.execute(
                update(Catalogue)
                .where(Catalogue.id.in_(catalogue_ids))
                .values(
                    status="draft",
                    version=0,
                    is_public=False,
                    published_by_id=None,
                    published_at=None,
                    revision=Catalogue.revision + 1,
                )
            )
        db.execute(delete(user_product_access).where(user_product_access.c.product_id.in_(product_ids)))
        db.execute(delete(product_categories).where(product_categories.c.product_id.in_(product_ids)))
        db.execute(delete(ProductImage).where(ProductImage.product_id.in_(product_ids)))
        db.execute(delete(CatalogueEntry).where(CatalogueEntry.product_id.in_(product_ids)))
        db.execute(delete(Product).where(Product.id.in_(product_ids)))
        db.add(
            AuditLog(
                action="non_erp_products_removed",
                module="erp_integration",
                status="success",
                identifier=SOURCE_SYSTEM,
                details=counts,
            )
        )
        db.commit()

        upload_root = Path(settings.upload_dir).resolve()
        files_removed = 0
        for row in image_rows:
            target = (upload_root / row.storage_name).resolve()
            if upload_root in target.parents and target.is_file():
                target.unlink()
                files_removed += 1
        print({**counts, "image_files_removed": files_removed, "status": "completed"})
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
