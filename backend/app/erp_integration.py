import base64
import hashlib
import re
import time
import uuid
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

import pytds
from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.access import require_permission
from app.commerce_models import PriceList, ProductPrice
from app.config import settings
from app.database import get_db
from app.erp_models import ErpConnectionSetting, ErpSyncRun
from app.erp_schemas import (
    ErpConnectionResponse,
    ErpConnectionTestResponse,
    ErpConnectionUpdate,
    ErpPreviewResponse,
    ErpSyncRequest,
    ErpSyncRunResponse,
    ErpTableResponse,
)
from app.models import AuditLog, Brand, CatalogueEntry, Category, Product, User
from app.product_lifecycle import apply_erp_lifecycle


router = APIRouter(prefix="/admin/erp", tags=["ERP integration"])

GMS_PRODUCT_QUERY = """
SELECT TOP {limit}
 p.Id AS erp_id,
 RTRIM(CONVERT(nvarchar(80), p.Code)) AS sku,
 COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), p.EngName))), N''), NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), p.ThaiName))), N''), LTRIM(RTRIM(CONVERT(nvarchar(255), p.PosName)))) AS product_name,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), p.ThaiName))), N'') AS thai_name,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(255), p.PosName))), N'') AS pos_name,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(max), p.ProductDescEng))), N'') AS description_en,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(max), p.productdesc))), N'') AS description_th,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(max), p.howtouse))), N'') AS how_to_use,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(500), p.Remark))), N'') AS remark,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(120), brand_ref.Description))), N'') AS brand,
 (SELECT TOP 1 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(80), pu.BarCode))), N'') FROM dbo.ProductUnits pu WHERE pu.Product=p.Id ORDER BY CASE WHEN pu.StockUnitFlag IN ('Y','1','T') THEN 0 WHEN pu.SaleFlag IN ('Y','1','T') THEN 1 ELSE 2 END, pu.Id) AS barcode,
 COALESCE((SELECT TOP 1 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(30), pu.UnitName))), N'') FROM dbo.ProductUnits pu WHERE pu.Product=p.Id ORDER BY CASE WHEN pu.StockUnitFlag IN ('Y','1','T') THEN 0 WHEN pu.SaleFlag IN ('Y','1','T') THEN 1 ELSE 2 END, pu.Id), N'piece') AS unit,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(120), category_ref.Description))), N'') AS category,
 COALESCE((SELECT TOP 1 pp.Price FROM dbo.ProductPrice pp WHERE pp.Product=p.Id AND pp.PriceType=19 AND pp.Price IS NOT NULL ORDER BY pp.Id DESC), (SELECT TOP 1 pu.Price01 FROM dbo.ProductUnits pu WHERE pu.Product=p.Id ORDER BY pu.Id), 0) AS price,
 COALESCE((
  SELECT SUM(po.Quantity)
  FROM dbo.ProductOnhand po
  INNER JOIN dbo.Warehouse warehouse_ref ON warehouse_ref.Id=po.Warehouse
  WHERE po.Product=p.Id
    AND po.BalanceYear = YEAR(GETDATE())
    AND po.Periodno BETWEEN 0 AND MONTH(GETDATE())
    AND COALESCE(LTRIM(RTRIM(warehouse_ref.blocked)), '') NOT IN ('Y','1','T')
    AND COALESCE(LTRIM(RTRIM(warehouse_ref.Defect)), '') NOT IN ('Y','1','T')
 ), 0) AS stock_quantity,
 CASE WHEN LTRIM(RTRIM(COALESCE(p.Blocked, ''))) IN ('Y','1','T') THEN 1 ELSE 0 END AS is_discontinued,
 COALESCE(p.ExportDate,p.importdate,p.AddDate,p.ProductDate) AS erp_updated_at,
 NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(500), p.Picture1))), N'') AS image_reference
FROM dbo.Product p
LEFT JOIN dbo.Misc brand_ref ON p.pgroup = brand_ref.Id
LEFT JOIN dbo.Misc category_ref ON p.PType = category_ref.Id
WHERE NULLIF(LTRIM(RTRIM(p.Code)), '') IS NOT NULL
{active_filter}
ORDER BY p.Id
"""

GMS_CATEGORY_QUERY = """
SELECT DISTINCT CONVERT(nvarchar(120), category_ref.Description) AS category_name
FROM dbo.Product p
LEFT JOIN dbo.Misc category_ref ON p.PType = category_ref.Id
WHERE NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(120), p.Code))), N'') IS NOT NULL
"""

GMS_BRAND_QUERY = """
SELECT DISTINCT CONVERT(nvarchar(120), brand_ref.Description) AS brand_name
FROM dbo.Product p
LEFT JOIN dbo.Misc brand_ref ON p.pgroup = brand_ref.Id
WHERE NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(120), p.Code))), N'') IS NOT NULL
"""

ERP_BRAND_DESCRIPTION = "Imported from ERP."


def _now() -> datetime:
    return datetime.now(UTC)


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.secret_key.get_secret_value().encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def _encrypt_password(password: str) -> str:
    return _fernet().encrypt(password.encode("utf-8")).decode("ascii")


def _decrypt_password(setting: ErpConnectionSetting) -> str:
    try:
        return _fernet().decrypt(setting.password_ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise HTTPException(status_code=500, detail="The saved ERP password cannot be decrypted. Save the connection again.") from exc


def _setting(db: Session) -> ErpConnectionSetting:
    item = db.get(ErpConnectionSetting, 1)
    if not item:
        raise HTTPException(status_code=409, detail="Configure the ERP database connection first.")
    return item


def _connect(item: ErpConnectionSetting):
    if not item.is_enabled:
        raise HTTPException(status_code=409, detail="The ERP connection is disabled.")
    try:
        return pytds.connect(
            server=item.server,
            port=item.port,
            database=item.database_name,
            user=item.username,
            password=_decrypt_password(item),
            timeout=item.connection_timeout_seconds,
            login_timeout=item.connection_timeout_seconds,
            as_dict=True,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"ERP SQL Server connection failed: {str(exc)[:300]}") from exc


def _response(item: ErpConnectionSetting | None) -> ErpConnectionResponse:
    if not item:
        return ErpConnectionResponse(configured=False)
    return ErpConnectionResponse(
        configured=True,
        name=item.name,
        server=item.server,
        port=item.port,
        database_name=item.database_name,
        username=item.username,
        password_configured=bool(item.password_ciphertext),
        connector=item.connector,
        source_preset=item.source_preset,
        is_enabled=item.is_enabled,
        connection_timeout_seconds=item.connection_timeout_seconds,
        last_test_status=item.last_test_status,
        last_test_message=item.last_test_message,
        last_test_latency_ms=item.last_test_latency_ms,
        last_tested_at=item.last_tested_at,
        last_server_name=item.last_server_name,
        discovered_table_count=item.discovered_table_count,
        last_sync_status=item.last_sync_status,
        last_synced_at=item.last_synced_at,
        last_sync_summary=item.last_sync_summary,
        updated_at=item.updated_at,
    )


def _audit(db: Session, request: Request, actor: User, action: str, details: dict | None = None) -> None:
    db.add(AuditLog(
        user_id=actor.id,
        action=action,
        module="erp_integration",
        status="success",
        identifier="GMS ERP",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        details=details,
    ))


def _safe_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, bytes):
        return f"<{len(value)} bytes>"
    return value


def _product_rows(item: ErpConnectionSetting, limit: int, include_discontinued: bool) -> list[dict]:
    sql = GMS_PRODUCT_QUERY.format(
        limit=int(limit),
        active_filter="" if include_discontinued else "AND LTRIM(RTRIM(COALESCE(p.Blocked, ''))) NOT IN ('Y','1','T')",
    )
    with _connect(item) as connection:
        cursor = connection.cursor()
        cursor.execute(sql)
        return list(cursor.fetchall())


def _erp_category_names(item: ErpConnectionSetting) -> list[str]:
    """Read the complete authoritative category directory from the ERP hierarchy."""
    with _connect(item) as connection:
        cursor = connection.cursor()
        cursor.execute(GMS_CATEGORY_QUERY)
        names = {
            name
            for row in cursor.fetchall()
            if (name := _erp_category_name(row.get("category_name")))
        }
    return sorted(names, key=str.casefold)


def _erp_brand_names(item: ErpConnectionSetting) -> list[str]:
    """Read the complete brand directory used by ERP products."""
    with _connect(item) as connection:
        cursor = connection.cursor()
        cursor.execute(GMS_BRAND_QUERY)
        names = {
            name
            for row in cursor.fetchall()
            if (name := _erp_brand_name(row.get("brand_name")))
        }
    return sorted(names, key=str.casefold)


def _new_brand_code(db: Session, name: str) -> str:
    base = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")[:30] or "ERP_BRAND"
    code = base
    suffix = 2
    while db.scalar(select(Brand.id).where(Brand.code == code)):
        suffix_text = f"_{suffix}"
        code = f"{base[:30 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return code


def _sync_erp_brand_directory(db: Session, names: list[str]) -> dict[str, int]:
    """Upsert ERP brands while preserving brands that were created by users."""
    authoritative_keys = {name.casefold() for name in names}
    existing = {brand.name.casefold(): brand for brand in db.scalars(select(Brand))}
    created = 0
    reactivated = 0
    deactivated = 0

    for name in names:
        brand = existing.get(name.casefold())
        if brand:
            # A reason marks an intentional administrator decision. ERP sync
            # may revive only brands it disabled automatically when they went
            # missing from the source directory.
            if not brand.is_active and not brand.inactive_reason:
                brand.is_active = True
                reactivated += 1
            continue
        brand = Brand(
            name=name[:120],
            code=_new_brand_code(db, name),
            description=ERP_BRAND_DESCRIPTION,
            is_active=True,
        )
        db.add(brand)
        db.flush()
        existing[name.casefold()] = brand
        created += 1

    for brand in existing.values():
        if (
            brand.description == ERP_BRAND_DESCRIPTION
            and brand.name.casefold() not in authoritative_keys
            and brand.is_active
        ):
            brand.is_active = False
            deactivated += 1

    return {
        "brands_available": len(names),
        "brands_created": created,
        "brands_reactivated": reactivated,
        "brands_deactivated": deactivated,
    }


@router.get("", response_model=ErpConnectionResponse)
def get_erp_connection(_: User = Depends(require_permission("data_sync.configure")), db: Session = Depends(get_db)) -> ErpConnectionResponse:
    return _response(db.get(ErpConnectionSetting, 1))


@router.put("", response_model=ErpConnectionResponse)
def save_erp_connection(
    payload: ErpConnectionUpdate,
    request: Request,
    actor: User = Depends(require_permission("data_sync.configure")),
    db: Session = Depends(get_db),
) -> ErpConnectionResponse:
    item = db.get(ErpConnectionSetting, 1)
    if not item:
        if not payload.password:
            raise HTTPException(status_code=422, detail="Enter the ERP database password.")
        item = ErpConnectionSetting(id=1, server=payload.server, database_name=payload.database_name, username=payload.username, password_ciphertext=_encrypt_password(payload.password))
        db.add(item)
    for field in ("name", "server", "port", "database_name", "username", "is_enabled", "connection_timeout_seconds"):
        setattr(item, field, getattr(payload, field))
    if payload.password:
        item.password_ciphertext = _encrypt_password(payload.password)
    item.updated_by_id = actor.id
    item.last_test_status = "not_tested"
    item.last_test_message = "Connection settings changed; run a new connection test."
    _audit(db, request, actor, "erp_connection_saved", {"server": item.server, "port": item.port, "database": item.database_name, "password_changed": bool(payload.password)})
    db.commit()
    db.refresh(item)
    return _response(item)


@router.post("/test", response_model=ErpConnectionTestResponse)
def test_erp_connection(
    request: Request,
    actor: User = Depends(require_permission("data_sync.configure")),
    db: Session = Depends(get_db),
) -> ErpConnectionTestResponse:
    item = _setting(db)
    started = time.perf_counter()
    tested_at = _now()
    try:
        with _connect(item) as connection:
            cursor = connection.cursor()
            cursor.execute("SELECT DB_NAME() database_name, @@SERVERNAME server_name, (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE') table_count, (SELECT COUNT(*) FROM dbo.Product) product_count")
            row = cursor.fetchone()
        latency = round((time.perf_counter() - started) * 1000, 2)
        item.last_test_status = "connected"
        item.last_test_message = "Connected successfully."
        item.last_test_latency_ms = latency
        item.last_tested_at = tested_at
        item.last_server_name = str(row["server_name"])
        item.discovered_table_count = int(row["table_count"])
        _audit(db, request, actor, "erp_connection_tested", {"connected": True, "latency_ms": latency, "table_count": item.discovered_table_count, "product_count": int(row["product_count"])})
        db.commit()
        return ErpConnectionTestResponse(connected=True, message="Connected successfully.", latency_ms=latency, server_name=item.last_server_name, database_name=str(row["database_name"]), product_count=int(row["product_count"]), table_count=item.discovered_table_count)
    except HTTPException as exc:
        latency = round((time.perf_counter() - started) * 1000, 2)
        item.last_test_status = "failed"
        item.last_test_message = str(exc.detail)[:500]
        item.last_test_latency_ms = latency
        item.last_tested_at = tested_at
        db.commit()
        raise
    except Exception as exc:
        latency = round((time.perf_counter() - started) * 1000, 2)
        item.last_test_status = "failed"
        item.last_test_message = str(exc)[:500]
        item.last_test_latency_ms = latency
        item.last_tested_at = tested_at
        db.commit()
        raise HTTPException(status_code=502, detail=f"ERP connection test failed: {str(exc)[:300]}") from exc


@router.get("/tables", response_model=list[ErpTableResponse])
def list_erp_tables(_: User = Depends(require_permission("data_sync.view")), db: Session = Depends(get_db)) -> list[ErpTableResponse]:
    item = _setting(db)
    with _connect(item) as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT TABLE_SCHEMA schema_name, TABLE_NAME table_name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_SCHEMA, TABLE_NAME")
        return [ErpTableResponse(**row) for row in cursor.fetchall()]


@router.get("/preview", response_model=ErpPreviewResponse)
def preview_erp_products(
    limit: int = Query(default=20, ge=1, le=100),
    include_discontinued: bool = True,
    _: User = Depends(require_permission("data_sync.view")),
    db: Session = Depends(get_db),
) -> ErpPreviewResponse:
    rows = _product_rows(_setting(db), limit, include_discontinued)
    safe_rows = [{key: _safe_value(value) for key, value in row.items()} for row in rows]
    return ErpPreviewResponse(
        columns=list(safe_rows[0]) if safe_rows else [],
        rows=safe_rows,
        source="dbo.Product + ProductUnits + ProductPrice + ProductOnhand + Misc brand/category hierarchy",
        limit=limit,
    )


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-") or f"erp-{uuid.uuid4().hex[:8]}"


def _erp_dimension_name(value, empty_labels: set[str] | None = None) -> str | None:
    """Return a real ERP hierarchy label, excluding explicit placeholder values."""
    name = str(value or "").strip()[:120]
    if not name:
        return None
    normalized = re.sub(r"[\s._/-]+", " ", name.casefold()).strip()
    placeholders = {
        "\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38",  # Thai: unspecified
        "\u0e44\u0e21\u0e48\u0e01\u0e33\u0e2b\u0e19\u0e14",  # Thai: not defined
        "unspecified",
        "unclassified",
        "not specified",
        "none",
        "n a",
    }
    if empty_labels:
        placeholders.update(empty_labels)
    if normalized in placeholders:
        return None
    return name


def _erp_category_name(value) -> str | None:
    """Return the ERP PType category, excluding placeholder values."""
    return _erp_dimension_name(value)


def _erp_brand_name(value) -> str | None:
    """Return the ERP pgroup brand, excluding placeholder/unbranded values."""
    return _erp_dimension_name(value, {
        "\u0e44\u0e21\u0e48\u0e21\u0e35\u0e22\u0e35\u0e48\u0e2b\u0e49\u0e2d",  # Thai: no brand
        "unbranded",
        "no brand",
    })


def _decimal(value) -> Decimal | None:
    try:
        return Decimal(str(value)) if value is not None else None
    except (InvalidOperation, ValueError):
        return None


@router.post("/sync", response_model=ErpSyncRunResponse)
def sync_erp_database(
    payload: ErpSyncRequest,
    request: Request,
    actor: User = Depends(require_permission("data_sync.run")),
    db: Session = Depends(get_db),
) -> ErpSyncRunResponse:
    item = _setting(db)
    run = ErpSyncRun(source_preset=item.source_preset, requested_limit=payload.limit, requested_by_id=actor.id)
    db.add(run)
    db.commit()
    try:
        rows = _product_rows(item, payload.limit, payload.include_discontinued)
        authoritative_category_names = _erp_category_names(item)
        authoritative_brand_names = _erp_brand_names(item)
        brand_sync = _sync_erp_brand_directory(db, authoritative_brand_names)
        authoritative_category_keys = {name.casefold() for name in authoritative_category_names}
        run.rows_read = len(rows)
        normal_price_list = db.scalar(select(PriceList).where(PriceList.code == "NORMAL"))
        products_by_sku = {product.sku.casefold(): product for product in db.scalars(select(Product))}
        current_prices = {}
        if normal_price_list:
            current_prices = {
                price.product_id: price
                for price in db.scalars(
                    select(ProductPrice).where(
                        ProductPrice.price_list_id == normal_price_list.id,
                        ProductPrice.status == "active",
                    ).order_by(ProductPrice.effective_from.desc())
                )
            }
        barcodes = {barcode.casefold(): product_id for barcode, product_id in db.execute(select(Product.barcode, Product.id).where(Product.barcode.is_not(None)))}
        categories = {category.name.casefold(): category for category in db.scalars(select(Category))}
        brands = {brand.name.casefold(): brand for brand in db.scalars(select(Brand))}
        for category_name in authoritative_category_names:
            if category_name.casefold() in categories:
                continue
            base_slug = _slug(category_name)
            slug = base_slug
            suffix = 2
            while db.scalar(select(Category.id).where(Category.slug == slug)):
                slug = f"{base_slug}-{suffix}"
                suffix += 1
            category = Category(
                name=category_name[:120],
                slug=slug,
                description="Imported from the ERP PType hierarchy.",
            )
            db.add(category)
            db.flush()
            categories[category_name.casefold()] = category
        categories_removed = 0
        for category in list(categories.values()):
            if category.name.casefold() not in authoritative_category_keys:
                db.delete(category)
                categories.pop(category.name.casefold(), None)
                categories_removed += 1
        categorized_count = 0
        uncategorized_count = 0
        branded_count = 0
        unbranded_count = 0
        for source in rows:
            sku = str(source.get("sku") or "").strip()[:80]
            name = str(source.get("product_name") or "").strip()[:255]
            if not sku or not name:
                run.rows_skipped += 1
                continue
            barcode = str(source.get("barcode") or "").strip()[:80] or None
            product = products_by_sku.get(sku.casefold())
            if barcode and barcode.casefold() in barcodes and (not product or barcodes[barcode.casefold()] != product.id):
                barcode = None
            category_name = _erp_category_name(source.get("category"))
            brand_name = _erp_brand_name(source.get("brand"))
            erp_updated = source.get("erp_updated_at") if isinstance(source.get("erp_updated_at"), datetime) else _now()
            price = _decimal(source.get("price"))
            quantity_value = _decimal(source.get("stock_quantity")) or Decimal(0)
            quantity = int(quantity_value)
            synced_at = _now()
            source_record_id = str(source.get("erp_id") or sku).strip()[:120]
            description_en = str(source.get("description_en") or "").strip() or None
            description_th = str(source.get("description_th") or "").strip() or None
            pos_name = str(source.get("pos_name") or "").strip()[:255] or None
            how_to_use = str(source.get("how_to_use") or "").strip() or None
            remark = str(source.get("remark") or "").strip()[:500] or None
            if not product:
                source_discontinued = bool(source.get("is_discontinued"))
                product = Product(
                    sku=sku,
                    erp_name=name,
                    erp_name_th=str(source.get("thai_name") or "").strip()[:255] or None,
                    erp_pos_name=pos_name,
                    erp_description_en=description_en,
                    erp_description_th=description_th,
                    erp_how_to_use=how_to_use,
                    erp_remark=remark,
                    brand=brand_name,
                    barcode=barcode,
                    unit=str(source.get("unit") or "piece").strip()[:30] or "piece",
                    erp_category=category_name,
                    price=price,
                    stock_quantity=quantity,
                    source_system="gms_erp",
                    source_record_id=source_record_id,
                    last_source_sync_at=synced_at,
                    is_discontinued=source_discontinued,
                    status="inactive" if source_discontinued else "active",
                    inactive_reason="erp_discontinued" if source_discontinued else None,
                    inactive_note=(
                        "ERP marks this product as blocked/discontinued."
                        if source_discontinued else ""
                    ),
                    inactivated_at=synced_at if source_discontinued else None,
                    lifecycle_status_source=(
                        "erp_discontinued" if source_discontinued else "erp_active"
                    ),
                    erp_updated_at=erp_updated,
                    catalogue_entry=CatalogueEntry(display_name=name, updated_by_id=actor.id),
                )
                db.add(product)
                db.flush()
                products_by_sku[sku.casefold()] = product
                run.rows_created += 1
            else:
                product.erp_name = name
                product.erp_name_th = str(source.get("thai_name") or "").strip()[:255] or None
                product.erp_pos_name = pos_name
                product.erp_description_en = description_en
                product.erp_description_th = description_th
                product.erp_how_to_use = how_to_use
                product.erp_remark = remark
                product.brand = brand_name
                product.barcode = barcode
                product.unit = str(source.get("unit") or "piece").strip()[:30] or "piece"
                product.erp_category = category_name
                product.price = price
                product.stock_quantity = quantity
                product.source_system = "gms_erp"
                product.source_record_id = source_record_id
                product.last_source_sync_at = synced_at
                product.is_discontinued = bool(source.get("is_discontinued"))
                product.erp_updated_at = erp_updated
                lifecycle_history = apply_erp_lifecycle(
                    product,
                    is_discontinued=product.is_discontinued,
                    changed_at=synced_at,
                    actor_id=actor.id,
                )
                if lifecycle_history:
                    db.add(lifecycle_history)
                run.rows_updated += 1
            if barcode:
                barcodes[barcode.casefold()] = product.id
            if category_name:
                category = categories.get(category_name.casefold())
                if not category:
                    base_slug = _slug(category_name)
                    slug = base_slug
                    suffix = 2
                    while db.scalar(select(Category.id).where(Category.slug == slug)):
                        slug = f"{base_slug}-{suffix}"
                        suffix += 1
                    category = Category(name=category_name[:120], slug=slug, description="Imported from the ERP PType hierarchy.")
                    db.add(category)
                    db.flush()
                    categories[category_name.casefold()] = category
                if len(product.categories) != 1 or product.categories[0].id != category.id:
                    product.categories = [category]
                categorized_count += 1
            else:
                if product.categories:
                    product.categories.clear()
                uncategorized_count += 1
            if brand_name and brand_name.casefold() not in brands:
                code = re.sub(r"[^A-Z0-9]+", "_", brand_name.upper()).strip("_")[:30] or f"ERP_{len(brands)+1}"
                while db.scalar(select(Brand.id).where(Brand.code == code)):
                    code = f"{code[:25]}_{len(brands)+1}"
                brand = Brand(name=brand_name[:120], code=code, description="Imported from ERP.")
                db.add(brand)
                brands[brand_name.casefold()] = brand
            if brand_name:
                branded_count += 1
            else:
                unbranded_count += 1
            if normal_price_list and price is not None:
                current = current_prices.get(product.id)
                if not current or current.amount != price:
                    if current:
                        current.status = "expired"
                        current.expires_at = _now()
                    replacement = ProductPrice(product_id=product.id, price_list_id=normal_price_list.id, currency=normal_price_list.currency, amount=price, effective_from=erp_updated, status="active", reason="Synchronized from GMS ERP.", created_by_id=actor.id, approved_by_id=actor.id, approved_at=_now())
                    db.add(replacement)
                    current_prices[product.id] = replacement
        run.status = "completed"
        run.message = "ERP product synchronization completed."
        run.completed_at = _now()
        summary = {
            "read": run.rows_read,
            "created": run.rows_created,
            "updated": run.rows_updated,
            "skipped": run.rows_skipped,
            "errors": run.error_count,
            "branded": branded_count,
            "unbranded": unbranded_count,
            "categorized": categorized_count,
            "uncategorized": uncategorized_count,
            "categories_removed": categories_removed,
            **brand_sync,
        }
        run.details = summary
        item.last_sync_status = "completed"
        item.last_synced_at = run.completed_at
        item.last_sync_summary = summary
        _audit(db, request, actor, "erp_database_synchronized", {"run_id": str(run.id), **summary})
        db.commit()
    except Exception as exc:
        db.rollback()
        failed = db.get(ErpSyncRun, run.id)
        if failed:
            failed.status = "failed"
            failed.message = str(exc)[:500]
            failed.error_count = 1
            failed.completed_at = _now()
            db.commit()
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=502, detail=f"ERP synchronization failed: {str(exc)[:300]}") from exc
    db.refresh(run)
    return ErpSyncRunResponse.model_validate(run)


@router.get("/sync-runs", response_model=list[ErpSyncRunResponse])
def list_erp_sync_runs(_: User = Depends(require_permission("data_sync.view")), db: Session = Depends(get_db)) -> list[ErpSyncRunResponse]:
    return [ErpSyncRunResponse.model_validate(item) for item in db.scalars(select(ErpSyncRun).order_by(ErpSyncRun.started_at.desc()).limit(20))]
