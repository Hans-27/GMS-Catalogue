import re
import time
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Callable

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, noload, selectinload

from app.commerce_models import Catalogue, CatalogueProduct, PriceList, ProductPrice
from app.config import settings
from app.database import SessionLocal
from app.erp_integration import (
    _connect,
    _erp_brand_names,
    _setting,
    _sync_erp_brand_directory,
)
from app.erp_models import (
    ErpConnectionSetting,
    ErpCustomerPriceLevel,
    ErpProductCustomerPrice,
    ErpSyncRun,
    ProductSyncLock,
)
from app.erp_product_images import ERP_IMAGE_SLOTS, _normalized_image
from app.models import (
    AuditLog,
    Brand,
    CatalogueEntry,
    Category,
    Product,
    ProductImage,
    ProductWarehouseStock,
)
from app.product_lifecycle import apply_erp_lifecycle, apply_missing_lifecycle
from app.catalogue_lifecycle import reconcile_erp_catalogue_membership


PRODUCT_BATCH_QUERY = """
SELECT TOP {batch_size}
 p.Id AS erp_id,
 RTRIM(CONVERT(nvarchar(80), p.Code)) AS sku,
 COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), p.EngName))), N''), NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), p.ThaiName))), N''), LTRIM(RTRIM(CONVERT(nvarchar(255), p.PosName)))) AS product_name,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), p.ThaiName))), N'') AS product_name_th,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), p.PosName))), N'') AS pos_name,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(max), p.ProductDescEng))), N'') AS description_en,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(max), p.productdesc))), N'') AS description_th,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(max), p.howtouse))), N'') AS how_to_use,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(500), p.Remark))), N'') AS remark,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(120), brand_ref.Description))), N'') AS brand,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(120), category_ref.Description))), N'') AS category,
 unit_row.BarCode AS barcode,
 unit_row.ProductUnitsId AS erp_product_units_id,
 COALESCE(unit_row.UnitName, N'piece') AS unit,
 COALESCE(price_row.Price01, fallback_price_row.Price01, unit_row.Price01) AS Price01,
 COALESCE(price_row.Price02, fallback_price_row.Price02, unit_row.Price02) AS Price02,
 COALESCE(price_row.Price03, fallback_price_row.Price03, unit_row.Price03) AS Price03,
 COALESCE(price_row.Price04, fallback_price_row.Price04, unit_row.Price04) AS Price04,
 COALESCE(price_row.Price05, fallback_price_row.Price05, unit_row.Price05) AS Price05,
 COALESCE(price_row.Price06, fallback_price_row.Price06) AS Price06,
 COALESCE(price_row.Price07, fallback_price_row.Price07) AS Price07,
 NULLIF(p.Size_W, 0) AS size_width,
 NULLIF(p.Size_L, 0) AS size_length,
 NULLIF(p.Size_H, 0) AS size_height,
 NULLIF(p.GrossWeight, 0) AS gross_weight,
 NULLIF(p.NetWeight, 0) AS net_weight,
 NULLIF(p.PackSize, 0) AS pack_size,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80), warranty_ref.Description))), N'') AS warranty_description,
 warranty_ref.WarrantyDays AS warranty_days,
 CASE WHEN LTRIM(RTRIM(COALESCE(p.Blocked, ''))) IN ('Y','1','T') THEN 1 ELSE 0 END AS is_discontinued,
 COALESCE(p.ExportDate,p.importdate,p.AddDate,p.ProductDate) AS erp_updated_at
FROM dbo.Product p
LEFT JOIN dbo.Misc brand_ref ON p.pgroup = brand_ref.Id
LEFT JOIN dbo.Misc category_ref ON p.PType = category_ref.Id
LEFT JOIN dbo.Warranty warranty_ref ON p.warranty = warranty_ref.Id
OUTER APPLY (
 SELECT TOP 1
  pu.Id AS ProductUnitsId,
  NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80), pu.BarCode))), N'') AS BarCode,
  NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(30), pu.UnitName))), N'') AS UnitName,
  pu.Price01, pu.Price02, pu.Price03, pu.Price04, pu.Price05
 FROM dbo.ProductUnits pu
 WHERE pu.Product=p.Id
 ORDER BY CASE WHEN pu.StockUnitFlag IN ('Y','1','T') THEN 0 WHEN pu.SaleFlag IN ('Y','1','T') THEN 1 ELSE 2 END, pu.Id
) unit_row
OUTER APPLY (
 SELECT
  MAX(CASE WHEN pp.PriceType=19 THEN pp.Price END) AS Price01,
  MAX(CASE WHEN pp.PriceType=4479 THEN pp.Price END) AS Price02,
  MAX(CASE WHEN pp.PriceType=4480 THEN pp.Price END) AS Price03,
  MAX(CASE WHEN pp.PriceType=19477 THEN pp.Price END) AS Price04,
  MAX(CASE WHEN pp.PriceType=19478 THEN pp.Price END) AS Price05,
  MAX(CASE WHEN pp.PriceType=4481 THEN pp.Price END) AS Price06,
  MAX(CASE WHEN pp.PriceType=22885 THEN pp.Price END) AS Price07
 FROM dbo.ProductPrice pp
 WHERE pp.Product=p.Id
   AND (unit_row.ProductUnitsId IS NULL OR pp.ProductUnits=unit_row.ProductUnitsId)
) price_row
OUTER APPLY (
 SELECT
  MAX(CASE WHEN pp.PriceType=19 THEN pp.Price END) AS Price01,
  MAX(CASE WHEN pp.PriceType=4479 THEN pp.Price END) AS Price02,
  MAX(CASE WHEN pp.PriceType=4480 THEN pp.Price END) AS Price03,
  MAX(CASE WHEN pp.PriceType=19477 THEN pp.Price END) AS Price04,
  MAX(CASE WHEN pp.PriceType=19478 THEN pp.Price END) AS Price05,
  MAX(CASE WHEN pp.PriceType=4481 THEN pp.Price END) AS Price06,
  MAX(CASE WHEN pp.PriceType=22885 THEN pp.Price END) AS Price07
 FROM dbo.ProductPrice pp
 WHERE pp.Product=p.Id
) fallback_price_row
WHERE NULLIF(LTRIM(RTRIM(p.Code)), '') IS NOT NULL AND p.Id > %s
ORDER BY p.Id
"""

WAREHOUSE_BATCH_QUERY = """
SELECT CONVERT(nvarchar(120), po.Product) AS erp_id,
       CONVERT(nvarchar(80), po.Warehouse) AS warehouse_code,
       SUM(COALESCE(po.Quantity, 0)) AS on_hand
FROM dbo.ProductOnhand po
INNER JOIN dbo.Warehouse warehouse_ref ON warehouse_ref.Id = po.Warehouse
WHERE po.Product IN ({placeholders})
  AND po.BalanceYear = YEAR(GETDATE())
  AND po.Periodno BETWEEN 0 AND MONTH(GETDATE())
  AND COALESCE(LTRIM(RTRIM(warehouse_ref.blocked)), '') NOT IN ('Y','1','T')
  AND COALESCE(LTRIM(RTRIM(warehouse_ref.Defect)), '') NOT IN ('Y','1','T')
GROUP BY po.Product, po.Warehouse
"""

ERP_BARCODES_BATCH_QUERY = """
SELECT CONVERT(nvarchar(120), pu.Product) AS erp_id,
       NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80), pu.BarCode))), N'') AS barcode
FROM dbo.ProductUnits pu
WHERE pu.Product IN ({placeholders})
  AND NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80), pu.BarCode))), N'') IS NOT NULL
ORDER BY pu.Product, pu.Id
"""

ERP_IMAGE_METADATA_QUERY = """
SELECT p.Id AS erp_id,
       DATALENGTH(p.image1) AS image1_size,
       CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), p.image1)), 2) AS image1_hash,
       NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(40), p.Picture1Desc))), N'') AS image1_description,
       DATALENGTH(p.image2) AS image2_size,
       CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), p.image2)), 2) AS image2_hash,
       NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(40), p.Picture2Desc))), N'') AS image2_description,
       DATALENGTH(p.image3) AS image3_size,
       CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), p.image3)), 2) AS image3_hash,
       NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(40), p.Picture3Desc))), N'') AS image3_description,
       DATALENGTH(p.image4) AS image4_size,
       CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), p.image4)), 2) AS image4_hash,
       DATALENGTH(p.image5) AS image5_size,
       CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), p.image5)), 2) AS image5_hash,
       DATALENGTH(p.image6) AS image6_size,
       CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), p.image6)), 2) AS image6_hash
FROM dbo.Product p
WHERE p.Id IN ({placeholders})
"""

ERP_IMAGE_CONTENT_QUERY = """
SELECT p.Id AS erp_id,
       p.image1, p.image2, p.image3, p.image4, p.image5, p.image6
FROM dbo.Product p
WHERE p.Id IN ({placeholders})
"""

ERP_IMAGE_FILE_PATTERN = re.compile(r"-erp-image-([1-6])\.webp$", re.IGNORECASE)

ERP_PRICE_LEVEL_QUERY = """
SELECT pp.PriceType AS erp_price_type_id,
       COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(120), m.Description))), N''),
                CONCAT(N'Price Type ', pp.PriceType)) AS source_name,
       COUNT(DISTINCT pp.Product) AS product_count
FROM dbo.ProductPrice pp
LEFT JOIN dbo.Misc m ON m.Id=pp.PriceType
GROUP BY pp.PriceType, m.Description
ORDER BY pp.PriceType
"""

ERP_PRICE_LEVEL_MAPPING = {
    19: ("SP1", "NORMAL", 1),
    4479: ("SP2", "VIP", 2),
    4480: ("SP3", "BIG_CUSTOMER", 3),
    19477: ("SP5", "DEALER", 5),
    19478: ("SP6", "WHOLESALE", 6),
    4481: ("SRP", "RETAIL", 4),
    22885: ("SP7", "VVIP", 7),
}


def utcnow() -> datetime:
    return datetime.now(UTC)


def safe_error(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        return str(exc.detail)[:500]
    message = re.sub(r"(?i)(password|pwd|user id|uid)\s*=\s*[^;\s]+", r"\1=<redacted>", str(exc))
    return message[:500] or "Source synchronization failed."


def price_mapping() -> dict[str, str]:
    result: dict[str, str] = {}
    for pair in settings.product_sync_price_mapping.split(","):
        source, separator, target = pair.partition(":")
        if separator and source.strip() and target.strip():
            result[source.strip()] = target.strip().upper()
    return result


def _erp_price_level_rows(setting: ErpConnectionSetting) -> list[dict]:
    with _connect(setting) as connection:
        cursor = connection.cursor()
        cursor.execute(ERP_PRICE_LEVEL_QUERY)
        return list(cursor.fetchall())


def _sync_erp_price_levels(
    db: Session, setting: ErpConnectionSetting
) -> dict[str, int]:
    rows = _erp_price_level_rows(setting)
    price_lists = {item.code: item for item in db.scalars(select(PriceList))}
    levels = {
        item.erp_price_type_id: item
        for item in db.scalars(select(ErpCustomerPriceLevel))
    }
    source_ids: set[int] = set()
    created = 0
    updated = 0
    deactivated = 0
    synced_at = utcnow()

    target_names = {
        "NORMAL": "Normal",
        "VIP": "VIP BKK",
        "BIG_CUSTOMER": "Big Customer",
        "DEALER": "Dealer",
        "WHOLESALE": "Wholesale",
        "RETAIL": "Retail",
        "VVIP": "VVIP",
    }
    for index, row in enumerate(rows, start=1):
        source_id = int(row["erp_price_type_id"])
        source_ids.add(source_id)
        source_name = str(row.get("source_name") or f"Price Type {source_id}").strip()[:120]
        mapped = ERP_PRICE_LEVEL_MAPPING.get(source_id)
        if mapped:
            source_code, target_code, sort_order = mapped
        else:
            normalized = re.sub(r"[^A-Z0-9]+", "_", source_name.upper()).strip("_")
            source_code = (normalized or f"TYPE_{source_id}")[:40]
            target_code = f"ERP_{source_code}"[:40]
            sort_order = 100 + index

        price_list = price_lists.get(target_code)
        if not price_list:
            price_list = PriceList(
                code=target_code,
                name=target_names.get(target_code, f"ERP {source_name}")[:120],
                description=f"Customer price synchronized from ERP {source_name}."[:320],
                currency="THB",
                is_no_price=False,
                is_active=True,
            )
            db.add(price_list)
            db.flush()
            price_lists[target_code] = price_list

        level = levels.get(source_id)
        values = {
            "source_code": source_code,
            "source_name": source_name,
            "price_list_id": price_list.id,
            "product_count": int(row.get("product_count") or 0),
            "sort_order": sort_order,
            "is_active": True,
            "last_synced_at": synced_at,
        }
        if not level:
            level = ErpCustomerPriceLevel(
                erp_price_type_id=source_id,
                **values,
            )
            db.add(level)
            levels[source_id] = level
            created += 1
        else:
            if any(getattr(level, field) != value for field, value in values.items()):
                updated += 1
            for field, value in values.items():
                setattr(level, field, value)

    for source_id, level in levels.items():
        if source_id not in source_ids and level.is_active:
            level.is_active = False
            deactivated += 1

    return {
        "price_levels_available": len(rows),
        "price_levels_created": created,
        "price_levels_updated": updated,
        "price_levels_deactivated": deactivated,
    }


def _decimal(value) -> Decimal | None:
    if value is None:
        return None
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    return parsed if parsed.is_finite() and parsed >= 0 else None


def _stock_decimal(value) -> Decimal:
    """Parse signed ERP stock movements without applying price/dimension rules."""
    if value is None:
        return Decimal(0)
    try:
        parsed = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return Decimal(0)
    return parsed if parsed.is_finite() else Decimal(0)


def _stock_total(rows: list[dict]) -> Decimal:
    """Return the signed total represented by the current ERP warehouse rows."""
    return sum(
        (_stock_decimal(row.get("on_hand")) for row in rows),
        start=Decimal(0),
    )


def acquire_sync_lock(owner_token: str) -> bool:
    now = utcnow()
    expires = now + timedelta(seconds=settings.product_sync_lock_seconds)
    with SessionLocal() as db:
        if not db.get(ProductSyncLock, 1):
            db.add(ProductSyncLock(id=1))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
        result = db.execute(
            update(ProductSyncLock)
            .where(
                ProductSyncLock.id == 1,
                or_(ProductSyncLock.locked_until.is_(None), ProductSyncLock.locked_until < now),
            )
            .values(owner_token=owner_token, acquired_at=now, locked_until=expires, updated_at=now)
        )
        db.commit()
        return result.rowcount == 1


def release_sync_lock(owner_token: str) -> None:
    with SessionLocal() as db:
        db.execute(
            update(ProductSyncLock)
            .where(ProductSyncLock.id == 1, ProductSyncLock.owner_token == owner_token)
            .values(owner_token=None, acquired_at=None, locked_until=None, updated_at=utcnow())
        )
        db.commit()


def renew_sync_lock(owner_token: str) -> None:
    now = utcnow()
    with SessionLocal() as db:
        db.execute(
            update(ProductSyncLock)
            .where(
                ProductSyncLock.id == 1,
                ProductSyncLock.owner_token == owner_token,
            )
            .values(
                locked_until=now + timedelta(seconds=settings.product_sync_lock_seconds),
                updated_at=now,
            )
        )
        db.commit()


def _source_batches(setting: ErpConnectionSetting):
    last_id = 0
    with _connect(setting) as connection:
        while True:
            cursor = connection.cursor()
            cursor.execute(PRODUCT_BATCH_QUERY.format(batch_size=int(settings.product_sync_batch_size)), (last_id,))
            rows = list(cursor.fetchall())
            if not rows:
                break
            ids = [int(row["erp_id"]) for row in rows]
            stock_cursor = connection.cursor()
            placeholders = ",".join(["%s"] * len(ids))
            stock_cursor.execute(WAREHOUSE_BATCH_QUERY.format(placeholders=placeholders), tuple(ids))
            stocks: dict[str, list[dict]] = {}
            for stock in stock_cursor.fetchall():
                stocks.setdefault(str(stock["erp_id"]), []).append(stock)
            barcode_cursor = connection.cursor()
            barcode_cursor.execute(
                ERP_BARCODES_BATCH_QUERY.format(placeholders=placeholders),
                tuple(ids),
            )
            barcodes: dict[str, list[str]] = {}
            for barcode_row in barcode_cursor.fetchall():
                source_id = str(barcode_row["erp_id"])
                value = str(barcode_row.get("barcode") or "").strip()[:80]
                if value and value not in barcodes.setdefault(source_id, []):
                    barcodes[source_id].append(value)
            for row in rows:
                primary = str(row.get("barcode") or "").strip()[:80]
                values = list(barcodes.get(str(row["erp_id"]), []))
                if primary:
                    values = [primary, *(value for value in values if value != primary)]
                row["barcodes"] = values
            yield rows, stocks
            last_id = max(ids)


def _source_image_metadata(
    setting: ErpConnectionSetting, source_ids: list[int]
) -> dict[str, dict]:
    if not source_ids:
        return {}
    placeholders = ",".join(["%s"] * len(source_ids))
    with _connect(setting) as connection:
        cursor = connection.cursor()
        cursor.execute(
            ERP_IMAGE_METADATA_QUERY.format(placeholders=placeholders),
            tuple(source_ids),
        )
        return {str(row["erp_id"]): row for row in cursor.fetchall()}


def _source_image_content(
    setting: ErpConnectionSetting, source_ids: list[int]
) -> dict[str, dict]:
    if not source_ids:
        return {}
    placeholders = ",".join(["%s"] * len(source_ids))
    with _connect(setting) as connection:
        cursor = connection.cursor()
        cursor.execute(
            ERP_IMAGE_CONTENT_QUERY.format(placeholders=placeholders),
            tuple(source_ids),
        )
        return {str(row["erp_id"]): row for row in cursor.fetchall()}


def _erp_image_slot(image: ProductImage) -> int | None:
    match = ERP_IMAGE_FILE_PATTERN.search(image.file_name)
    return int(match.group(1)) if match else None


def _image_sync_due(db: Session, run: ErpSyncRun) -> bool:
    if run.trigger == "manual":
        return True
    previous_runs = db.scalars(
        select(ErpSyncRun)
        .where(
            ErpSyncRun.id != run.id,
            ErpSyncRun.sync_type == "product_source_data",
            ErpSyncRun.status.in_(["completed", "completed_with_warnings"]),
        )
        .order_by(ErpSyncRun.completed_at.desc())
        .limit(50)
    )
    for previous in previous_runs:
        completed_value = (previous.details or {}).get("image_sync_completed_at")
        if not completed_value:
            continue
        try:
            completed = datetime.fromisoformat(str(completed_value))
        except ValueError:
            continue
        completed = completed.replace(tzinfo=UTC) if completed.tzinfo is None else completed.astimezone(UTC)
        return (utcnow() - completed).total_seconds() >= settings.product_sync_image_interval_seconds
    return True


def _sync_batch_images(
    db: Session,
    setting: ErpConnectionSetting,
    products_by_source_id: dict[str, Product],
    metadata: dict[str, dict],
    actor_id: uuid.UUID | None,
) -> tuple[dict[str, int], list[Path], list[Path], set[uuid.UUID]]:
    counts = {
        "images_checked": 0,
        "images_imported": 0,
        "images_updated": 0,
        "images_unchanged": 0,
        "images_removed": 0,
        "images_skipped": 0,
    }
    product_ids = [product.id for product in products_by_source_id.values()]
    images = list(
        db.scalars(select(ProductImage).where(ProductImage.product_id.in_(product_ids)))
    ) if product_ids else []
    images_by_product: dict[uuid.UUID, list[ProductImage]] = {}
    for image in images:
        images_by_product.setdefault(image.product_id, []).append(image)

    requested: dict[str, set[int]] = {}
    removed_ids: set[uuid.UUID] = set()
    retired_paths: list[Path] = []
    upload_directory = Path(settings.upload_dir).resolve()
    upload_directory.mkdir(parents=True, exist_ok=True)
    changed_product_ids: set[uuid.UUID] = set()

    for source_id, product in products_by_source_id.items():
        source = metadata.get(source_id, {})
        existing_slots = {
            slot: image
            for image in images_by_product.get(product.id, [])
            if (slot := _erp_image_slot(image)) is not None
        }
        for slot in ERP_IMAGE_SLOTS:
            counts["images_checked"] += 1
            size = int(source.get(f"image{slot}_size") or 0)
            fingerprint = str(source.get(f"image{slot}_hash") or "").strip().casefold()
            existing = existing_slots.get(slot)
            if not size or not fingerprint:
                if existing:
                    db.delete(existing)
                    removed_ids.add(existing.id)
                    old_path = (upload_directory / existing.storage_name).resolve()
                    if upload_directory in old_path.parents:
                        retired_paths.append(old_path)
                    counts["images_removed"] += 1
                    changed_product_ids.add(product.id)
                continue
            expected_name = f"erp-{product.id.hex}-{slot}-{fingerprint}.webp"
            expected_path = (upload_directory / expected_name).resolve()
            if (
                existing
                and existing.storage_name == expected_name
                and expected_path.is_file()
            ):
                counts["images_unchanged"] += 1
                continue
            requested.setdefault(source_id, set()).add(slot)

    created_paths: list[Path] = []
    requested_source_ids = [source_id for source_id in requested if source_id.isdigit()]
    for offset in range(0, len(requested_source_ids), 25):
        source_id_chunk = requested_source_ids[offset : offset + 25]
        content_rows = _source_image_content(
            setting,
            [int(source_id) for source_id in source_id_chunk],
        )
        for source_id in source_id_chunk:
            slots = requested[source_id]
            product = products_by_source_id[source_id]
            source = metadata.get(source_id, {})
            content_row = content_rows.get(source_id, {})
            product_images = images_by_product.setdefault(product.id, [])
            existing_slots = {
                slot: image
                for image in product_images
                if image.id not in removed_ids
                if (slot := _erp_image_slot(image)) is not None
            }
            next_sort_order = max(
                (image.sort_order for image in product_images), default=-1
            ) + 1
            for slot in sorted(slots):
                content = bytes(content_row.get(f"image{slot}") or b"")
                if not content:
                    counts["images_skipped"] += 1
                    continue
                try:
                    normalized, _, _ = _normalized_image(content, preview=False)
                except HTTPException:
                    counts["images_skipped"] += 1
                    continue
                fingerprint = str(
                    source.get(f"image{slot}_hash") or ""
                ).strip().casefold()
                storage_name = f"erp-{product.id.hex}-{slot}-{fingerprint}.webp"
                target = (upload_directory / storage_name).resolve()
                if upload_directory not in target.parents:
                    counts["images_skipped"] += 1
                    continue
                target_existed = target.exists()
                target.write_bytes(normalized)
                if not target_existed:
                    created_paths.append(target)

                description = str(
                    source.get(f"image{slot}_description") or ""
                ).strip()
                existing = existing_slots.get(slot)
                if existing:
                    if existing.storage_name != storage_name:
                        old_path = (upload_directory / existing.storage_name).resolve()
                        if upload_directory in old_path.parents and old_path != target:
                            retired_paths.append(old_path)
                    existing.storage_name = storage_name
                    existing.public_url = f"/uploads/{storage_name}"
                    existing.content_type = "image/webp"
                    if not existing.alt_text:
                        existing.alt_text = (description or product.erp_name)[:255]
                    counts["images_updated"] += 1
                    changed_product_ids.add(product.id)
                else:
                    is_primary = not any(
                        image.is_primary and image.id not in removed_ids
                        for image in product_images
                    )
                    image = ProductImage(
                        product_id=product.id,
                        file_name=f"{product.sku}-erp-image-{slot}.webp"[:255],
                        storage_name=storage_name,
                        public_url=f"/uploads/{storage_name}",
                        content_type="image/webp",
                        alt_text=(description or product.erp_name)[:255],
                        sort_order=next_sort_order,
                        is_primary=is_primary,
                        uploaded_by_id=actor_id,
                    )
                    next_sort_order += 1
                    db.add(image)
                    product_images.append(image)
                    existing_slots[slot] = image
                    counts["images_imported"] += 1
                    changed_product_ids.add(product.id)

            active_images = [
                image for image in product_images if image.id not in removed_ids
            ]
            if active_images and not any(image.is_primary for image in active_images):
                min(active_images, key=lambda image: image.sort_order).is_primary = True

    return counts, created_paths, retired_paths, changed_product_ids


def _current_prices(db: Session, product_ids: list[uuid.UUID], price_list_ids: list[int]) -> dict[tuple[uuid.UUID, int], ProductPrice]:
    if not product_ids or not price_list_ids:
        return {}
    result: dict[tuple[uuid.UUID, int], ProductPrice] = {}
    rows = db.scalars(
        select(ProductPrice).where(
            ProductPrice.product_id.in_(product_ids),
            ProductPrice.price_list_id.in_(price_list_ids),
            ProductPrice.status == "active",
        ).order_by(ProductPrice.effective_from.desc())
    )
    for row in rows:
        result.setdefault((row.product_id, row.price_list_id), row)
    return result


def _sync_attempt(
    run_id: uuid.UUID,
    actor_id: uuid.UUID | None,
    owner_token: str | None = None,
) -> None:
    with SessionLocal() as db:
        run = db.get(ErpSyncRun, run_id)
        setting = _setting(db)
        image_sync = _image_sync_due(db, run)
        image_counts = {
            "images_checked": 0,
            "images_imported": 0,
            "images_updated": 0,
            "images_unchanged": 0,
            "images_removed": 0,
            "images_skipped": 0,
        }
        brand_sync = _sync_erp_brand_directory(db, _erp_brand_names(setting))
        price_level_sync = _sync_erp_price_levels(db, setting)
        mapping = price_mapping()
        lists = {item.code: item for item in db.scalars(select(PriceList).where(PriceList.code.in_(mapping.values()), PriceList.is_active.is_(True)))}
        levels_by_price_list_id = {
            level.price_list_id: level
            for level in db.scalars(
                select(ErpCustomerPriceLevel).where(
                    ErpCustomerPriceLevel.is_active.is_(True)
                )
            )
        }
        erp_price_matrix_values_updated = 0
        categories = {item.name.casefold(): item for item in db.scalars(select(Category))}
        brands = {item.name.casefold(): item for item in db.scalars(select(Brand))}
        seen_source_ids: set[str] = set()
        changed_product_ids: set[uuid.UUID] = set()
        now = utcnow()
        for rows, warehouse_rows in _source_batches(setting):
            run.rows_read += len(rows)
            skus = [str(row.get("sku") or "").strip()[:80] for row in rows]
            source_barcodes = {
                str(row.get("barcode") or "").strip()[:80]
                for row in rows
                if str(row.get("barcode") or "").strip()
            }
            product_batch_query = select(Product).options(
                noload("*"),
                selectinload(Product.categories).noload(Category.products),
            ).where(Product.sku.in_(skus))
            products = {
                item.sku.casefold(): item
                for item in db.scalars(product_batch_query)
            }
            barcode_owners = {
                barcode: product_id
                for barcode, product_id in db.execute(
                    select(Product.barcode, Product.id).where(Product.barcode.in_(source_barcodes))
                )
                if barcode
            } if source_barcodes else {}
            batch_product_ids = [item.id for item in products.values()]
            current_prices = _current_prices(db, batch_product_ids, [item.id for item in lists.values()])
            erp_customer_prices = {
                (item.product_id, item.price_level_id): item
                for item in db.scalars(
                    select(ErpProductCustomerPrice).where(
                        ErpProductCustomerPrice.product_id.in_(batch_product_ids)
                    )
                )
            } if batch_product_ids else {}
            existing_stocks = {
                (item.product_id, item.warehouse_code): item
                for item in db.scalars(select(ProductWarehouseStock).where(ProductWarehouseStock.product_id.in_(batch_product_ids)))
            } if batch_product_ids else {}
            stocks_by_product: dict[uuid.UUID, dict[str, ProductWarehouseStock]] = {}
            for (stock_product_id, warehouse_code), stock in existing_stocks.items():
                stocks_by_product.setdefault(stock_product_id, {})[warehouse_code] = stock
            for source in rows:
                sku = str(source.get("sku") or "").strip()[:80]
                name = str(source.get("product_name") or "").strip()[:255]
                if not sku or not name:
                    run.rows_skipped += 1
                    continue
                source_id = str(source.get("erp_id") or sku)[:120]
                seen_source_ids.add(source_id)
                product = products.get(sku.casefold())
                created = product is None
                if created:
                    source_discontinued = bool(source.get("is_discontinued"))
                    product = Product(
                        sku=sku,
                        erp_name=name,
                        status="inactive" if source_discontinued else "active",
                        inactive_reason="erp_discontinued" if source_discontinued else None,
                        inactive_note=(
                            "ERP marks this product as blocked/discontinued."
                            if source_discontinued
                            else ""
                        ),
                        inactivated_at=now if source_discontinued else None,
                        lifecycle_status_source=(
                            "erp_discontinued" if source_discontinued else "erp_active"
                        ),
                        source_system="gms_erp",
                        source_record_id=source_id,
                        catalogue_entry=CatalogueEntry(display_name=name, updated_by_id=actor_id),
                    )
                    db.add(product)
                    db.flush()
                    products[sku.casefold()] = product
                    run.rows_created += 1
                else:
                    run.products_matched += 1
                changed = False
                category_name = str(source.get("category") or "").strip()[:120] or None
                brand_name = str(source.get("brand") or "").strip()[:120] or None
                barcode = str(source.get("barcode") or "").strip()[:80] or None
                product_barcodes = []
                for source_barcode in source.get("barcodes") or ([barcode] if barcode else []):
                    normalized_barcode = str(source_barcode or "").strip()[:80]
                    if normalized_barcode and normalized_barcode not in product_barcodes:
                        product_barcodes.append(normalized_barcode)
                unit = str(source.get("unit") or "piece").strip()[:30] or "piece"
                source_modified = source.get("erp_updated_at") if isinstance(source.get("erp_updated_at"), datetime) else now
                controlled = {
                    "erp_name": name,
                    "erp_name_th": str(source.get("product_name_th") or "").strip()[:255] or None,
                    "erp_pos_name": str(source.get("pos_name") or "").strip()[:255] or None,
                    "erp_description_en": str(source.get("description_en") or "").strip() or None,
                    "erp_description_th": str(source.get("description_th") or "").strip() or None,
                    "erp_how_to_use": str(source.get("how_to_use") or "").strip() or None,
                    "erp_remark": str(source.get("remark") or "").strip()[:500] or None,
                    "brand": brand_name,
                    "barcodes": product_barcodes,
                    "erp_category": category_name,
                    "unit": unit,
                    "is_discontinued": bool(source.get("is_discontinued")),
                    "source_system": "gms_erp",
                    "source_record_id": source_id,
                    "source_record_exists": True,
                    "source_sync_status": "synced",
                    "source_sync_error": "",
                    "erp_updated_at": source_modified,
                    "size_width": _decimal(source.get("size_width")),
                    "size_length": _decimal(source.get("size_length")),
                    "size_height": _decimal(source.get("size_height")),
                    "gross_weight": _decimal(source.get("gross_weight")),
                    "net_weight": _decimal(source.get("net_weight")),
                    "pack_size": int(source["pack_size"]) if source.get("pack_size") else None,
                    "warranty_description": (
                        str(source.get("warranty_description") or "").strip()[:80] or None
                    ),
                    "warranty_days": (
                        int(source["warranty_days"])
                        if source.get("warranty_days") is not None
                        else None
                    ),
                }
                if barcode:
                    owner_id = barcode_owners.get(barcode)
                    if owner_id is None or owner_id == product.id:
                        controlled["barcode"] = barcode
                        barcode_owners[barcode] = product.id
                    elif product.barcode != barcode:
                        run.error_count += 1
                else:
                    controlled["barcode"] = None
                for field, value in controlled.items():
                    if getattr(product, field) != value:
                        setattr(product, field, value)
                        changed = True
                lifecycle_history = apply_erp_lifecycle(
                    product,
                    is_discontinued=bool(source.get("is_discontinued")),
                    changed_at=now,
                    actor_id=actor_id,
                )
                if lifecycle_history:
                    db.add(lifecycle_history)
                    changed = True
                product.last_source_sync_at = now
                if category_name:
                    category = categories.get(category_name.casefold())
                    if not category:
                        slug_base = re.sub(r"[^a-z0-9]+", "-", category_name.casefold()).strip("-") or f"erp-{source_id}"
                        slug = slug_base
                        suffix = 2
                        while db.scalar(select(Category.id).where(Category.slug == slug)):
                            slug = f"{slug_base}-{suffix}"
                            suffix += 1
                        category = Category(name=category_name, slug=slug, description="Imported from the ERP PType hierarchy.")
                        db.add(category)
                        db.flush()
                        categories[category_name.casefold()] = category
                    if [item.id for item in product.categories] != [category.id]:
                        product.categories = [category]
                        changed = True
                if brand_name and brand_name.casefold() not in brands:
                    code = re.sub(r"[^A-Z0-9]+", "_", brand_name.upper()).strip("_")[:30] or f"ERP_{source_id}"
                    while db.scalar(select(Brand.id).where(Brand.code == code)):
                        code = f"{code[:25]}_{len(brands)+1}"
                    brand = Brand(name=brand_name, code=code, description="Imported from ERP.")
                    db.add(brand)
                    brands[brand_name.casefold()] = brand

                source_stocks = warehouse_rows.get(source_id, [])
                source_warehouse_codes: set[str] = set()
                total = _stock_total(source_stocks)
                for source_stock in source_stocks:
                    warehouse = str(source_stock.get("warehouse_code") or "UNKNOWN")[:80]
                    source_warehouse_codes.add(warehouse)
                    on_hand = _stock_decimal(source_stock.get("on_hand"))
                    key = (product.id, warehouse)
                    stock = existing_stocks.get(key)
                    if not stock:
                        stock = ProductWarehouseStock(product_id=product.id, warehouse_code=warehouse)
                        db.add(stock)
                        existing_stocks[key] = stock
                        stocks_by_product.setdefault(product.id, {})[warehouse] = stock
                    if stock.on_hand is None or Decimal(str(stock.on_hand)) != on_hand or stock.available is None or Decimal(str(stock.available)) != on_hand:
                        stock.on_hand = on_hand
                        stock.available = on_hand
                        run.stock_values_updated += 1
                    stock.source_updated_at = source_modified
                    stock.last_synced_at = now
                for warehouse, stock in stocks_by_product.get(product.id, {}).items():
                    if warehouse in source_warehouse_codes:
                        continue
                    if Decimal(str(stock.on_hand)) != 0 or Decimal(str(stock.available)) != 0:
                        stock.on_hand = Decimal(0)
                        stock.available = Decimal(0)
                        run.stock_values_updated += 1
                    stock.source_updated_at = source_modified
                    stock.last_synced_at = now
                total_int = int(total)
                if product.stock_quantity != total_int:
                    product.stock_quantity = total_int
                    changed = True
                    run.stock_values_updated += 1
                product.stock_last_synced_at = now

                for source_field, list_code in mapping.items():
                    amount = _decimal(source.get(source_field))
                    price_list = lists.get(list_code)
                    if not price_list:
                        continue
                    price_level = levels_by_price_list_id.get(price_list.id)
                    matrix_key = (
                        (product.id, price_level.id) if price_level else None
                    )
                    matrix_price = (
                        erp_customer_prices.get(matrix_key) if matrix_key else None
                    )
                    current = current_prices.get((product.id, price_list.id))
                    if amount is None:
                        if matrix_price:
                            db.delete(matrix_price)
                            erp_customer_prices.pop(matrix_key, None)
                            erp_price_matrix_values_updated += 1
                        if current:
                            current.status = "expired"
                            current.expires_at = now
                            current_prices.pop((product.id, price_list.id), None)
                            run.price_values_updated += 1
                            changed = True
                        if list_code == "NORMAL" and product.price is not None:
                            product.price = None
                            changed = True
                        continue
                    product.price_last_synced_at = now
                    if list_code == "NORMAL" and (product.price is None or Decimal(str(product.price)) != amount):
                        product.price = amount
                        changed = True
                    if price_level:
                        matrix_values = {
                            "erp_product_id": source_id,
                            "erp_product_units_id": str(
                                source.get("erp_product_units_id") or ""
                            )[:120] or None,
                            "amount": amount,
                            "currency": price_list.currency,
                            "source_updated_at": source_modified,
                            "last_synced_at": now,
                        }
                        if not matrix_price:
                            matrix_price = ErpProductCustomerPrice(
                                product_id=product.id,
                                price_level_id=price_level.id,
                                **matrix_values,
                            )
                            db.add(matrix_price)
                            erp_customer_prices[matrix_key] = matrix_price
                            erp_price_matrix_values_updated += 1
                        else:
                            comparable = {
                                key: value
                                for key, value in matrix_values.items()
                                if key != "last_synced_at"
                            }
                            if any(
                                getattr(matrix_price, field) != value
                                for field, value in comparable.items()
                            ):
                                erp_price_matrix_values_updated += 1
                            for field, value in matrix_values.items():
                                setattr(matrix_price, field, value)
                    if current and Decimal(str(current.amount)) == amount:
                        continue
                    if current:
                        current.status = "expired"
                        current.expires_at = now
                    replacement = ProductPrice(
                        product_id=product.id,
                        price_list_id=price_list.id,
                        currency=price_list.currency,
                        amount=amount,
                        effective_from=source_modified,
                        status="active",
                        reason="Synchronized from GMS ERP.",
                        created_by_id=actor_id,
                        approved_by_id=actor_id,
                        approved_at=now,
                    )
                    db.add(replacement)
                    current_prices[(product.id, price_list.id)] = replacement
                    run.price_values_updated += 1
                    changed = True
                if changed and not created:
                    run.rows_updated += 1
                if changed or created:
                    changed_product_ids.add(product.id)
            created_image_paths: list[Path] = []
            retired_image_paths: list[Path] = []
            if image_sync:
                products_by_source_id = {
                    str(source.get("erp_id")): products[sku.casefold()]
                    for source in rows
                    if (sku := str(source.get("sku") or "").strip()[:80])
                    and sku.casefold() in products
                }
                source_ids = [
                    int(source_id)
                    for source_id in products_by_source_id
                    if source_id.isdigit()
                ]
                metadata = _source_image_metadata(setting, source_ids)
                (
                    batch_image_counts,
                    created_image_paths,
                    retired_image_paths,
                    image_product_ids,
                ) = _sync_batch_images(
                    db,
                    setting,
                    products_by_source_id,
                    metadata,
                    actor_id,
                )
                for key, value in batch_image_counts.items():
                    image_counts[key] += value
                run.error_count += batch_image_counts["images_skipped"]
                changed_product_ids.update(image_product_ids)
            db.flush()
            # Bound memory and release SQLite's single-writer lock after each
            # configurable batch. Replays are idempotent if a later batch fails.
            try:
                db.commit()
            except Exception:
                for path in created_image_paths:
                    path.unlink(missing_ok=True)
                raise
            for path in retired_image_paths:
                path.unlink(missing_ok=True)
            if owner_token:
                renew_sync_lock(owner_token)

        # Compare in Python so a large ERP catalogue cannot exceed a database's
        # bound-parameter limit (SQLite is especially easy to hit here).
        missing = [
            product
            for product in db.scalars(select(Product).options(noload("*")).where(
                Product.source_system == "gms_erp",
                Product.source_record_id.is_not(None),
            ))
            if product.source_record_id not in seen_source_ids
        ] if seen_source_ids else []
        for product in missing:
            if product.source_record_exists or product.source_sync_status != "missing":
                product.source_record_exists = False
                product.source_sync_status = "missing"
                product.source_sync_error = "Product was not present in the latest complete ERP synchronization."
            run.products_missing += 1
            lifecycle_history = apply_missing_lifecycle(product, changed_at=now)
            if lifecycle_history:
                db.add(lifecycle_history)
                changed_product_ids.add(product.id)
        affected_catalogue_ids = list(db.scalars(select(CatalogueProduct.catalogue_id).where(
            CatalogueProduct.product_id.in_(changed_product_ids)
        ).distinct())) if changed_product_ids else []
        if affected_catalogue_ids:
            db.execute(update(Catalogue).where(Catalogue.id.in_(affected_catalogue_ids)).values(updated_at=now))
        catalogue_membership = reconcile_erp_catalogue_membership(
            db,
            actor_id=actor_id,
            product_ids=changed_product_ids,
        )
        run.status = "completed_with_warnings" if run.products_missing or run.error_count else "completed"
        run.message = "Product source-data synchronization completed."
        run.completed_at = utcnow()
        started = run.started_at.replace(tzinfo=UTC) if run.started_at.tzinfo is None else run.started_at
        run.duration_seconds = max(0, (run.completed_at - started).total_seconds())
        run.details = {
            "records_read": run.rows_read,
            "products_created": run.rows_created,
            "products_updated": run.rows_updated,
            "stock_values_updated": run.stock_values_updated,
            "price_values_updated": run.price_values_updated,
            "erp_price_matrix_values_updated": erp_price_matrix_values_updated,
            "products_missing": run.products_missing,
            "price_mapping": mapping,
            "invalidated_catalogues": len(affected_catalogue_ids),
            "catalogue_membership": catalogue_membership,
            "image_sync_performed": image_sync,
            **image_counts,
            **brand_sync,
            **price_level_sync,
        }
        if image_sync:
            run.details["image_sync_completed_at"] = run.completed_at.isoformat()
        setting.last_sync_status = run.status
        setting.last_synced_at = run.completed_at
        setting.last_sync_summary = run.details
        setting.last_test_status = "connected"
        setting.last_tested_at = run.completed_at
        db.add(AuditLog(user_id=actor_id, action=f"{run.trigger}_product_sync_completed", module="data_sync", status="success", identifier=str(run.id), details=run.details))
        db.commit()


def run_product_sync(
    *,
    trigger: str = "automatic",
    actor_id: uuid.UUID | None = None,
    sleep: Callable[[float], None] = time.sleep,
    retry_backoffs: tuple[int, ...] = (15, 30, 60),
) -> uuid.UUID:
    owner = uuid.uuid4().hex
    if not acquire_sync_lock(owner):
        with SessionLocal() as db:
            running = db.scalar(select(ErpSyncRun).where(
                ErpSyncRun.sync_type == "product_source_data",
                ErpSyncRun.status == "running",
            ).order_by(ErpSyncRun.started_at.desc()))
            if running:
                return running.id
            skipped = ErpSyncRun(status="skipped", sync_type="product_source_data", trigger=trigger, source_preset="gms_product_master", requested_limit=50000, requested_by_id=actor_id, message="Skipped because another synchronization lease is active.", completed_at=utcnow())
            db.add(skipped)
            db.commit()
            return skipped.id
    try:
        with SessionLocal() as db:
            run = ErpSyncRun(status="running", sync_type="product_source_data", trigger=trigger, source_preset="gms_product_master", source_database=settings.product_sync_source, requested_limit=50000, requested_by_id=actor_id)
            db.add(run)
            db.commit()
            run_id = run.id
        attempts = min(settings.product_sync_max_retries, len(retry_backoffs)) + 1
        for attempt in range(attempts):
            try:
                _sync_attempt(run_id, actor_id, owner)
                return run_id
            except Exception as exc:
                with SessionLocal() as db:
                    failed = db.get(ErpSyncRun, run_id)
                    failed.retry_count = attempt
                    failed.error_summary = safe_error(exc)
                    failed.message = "Synchronization failed; the last valid product data was preserved."
                    db.add(AuditLog(user_id=actor_id, action="product_sync_retry" if attempt + 1 < attempts else "product_sync_failed", module="data_sync", status="warning" if attempt + 1 < attempts else "failed", identifier=str(run_id), details={"attempt": attempt + 1, "error_summary": failed.error_summary}))
                    if attempt + 1 >= attempts:
                        failed.status = "failed"
                        failed.error_count += 1
                        failed.completed_at = utcnow()
                        started = failed.started_at.replace(tzinfo=UTC) if failed.started_at.tzinfo is None else failed.started_at
                        failed.duration_seconds = max(0, (failed.completed_at - started).total_seconds())
                    db.commit()
                if attempt + 1 >= attempts:
                    return run_id
                sleep(retry_backoffs[attempt])
        return run_id
    finally:
        release_sync_lock(owner)
