import io
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.access import has_record_access, require_permission
from app.catalogue_schemas import ImageResponse
from app.config import settings
from app.database import get_db
from app.erp_integration import _connect, _setting
from app.models import AuditLog, Product, ProductImage, User


router = APIRouter(prefix="/catalogue/products", tags=["ERP product images"])
ERP_IMAGE_SLOTS = tuple(range(1, 7))
MAX_ERP_IMAGE_BYTES = settings.product_image_max_size_mb * 1024 * 1024
MAX_IMAGE_PIXELS = 80_000_000


class ErpProductImageCandidate(BaseModel):
    slot: int
    description: str
    file_size: int
    mime_type: str | None
    supported: bool
    preview_url: str


class ErpProductImageImport(BaseModel):
    alt_text: str = Field(default="", max_length=255)
    make_primary: bool = True

    @field_validator("alt_text")
    @classmethod
    def strip_alt_text(cls, value: str) -> str:
        return value.strip()


def _product(
    db: Session, product_id: uuid.UUID, actor: User, permission_code: str
) -> Product:
    item = db.scalar(
        select(Product)
        .options(selectinload(Product.images))
        .where(Product.id == product_id)
    )
    if not item or not has_record_access(db, actor, permission_code, item):
        raise HTTPException(status_code=404, detail="Product not found.")
    if item.source_system != "gms_erp":
        raise HTTPException(
            status_code=409,
            detail="ERP images are available only for products synchronized from GMS ERP.",
        )
    return item


def _source_where(product: Product) -> tuple[str, object]:
    source_id = str(product.source_record_id or "").strip()
    if source_id.isdigit():
        return "p.Id = %s", int(source_id)
    return "LTRIM(RTRIM(CONVERT(nvarchar(80), p.Code))) = %s", product.sku


def _mime_type(header: bytes | None) -> str | None:
    value = bytes(header or b"")
    if value.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if value.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if value.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if value.startswith(b"BM"):
        return "image/bmp"
    if value.startswith((b"II*\x00", b"MM\x00*")):
        return "image/tiff"
    if value.startswith(b"RIFF") and value[8:12] == b"WEBP":
        return "image/webp"
    return None


def _candidate_row(product: Product) -> dict | None:
    fields = []
    for slot in ERP_IMAGE_SLOTS:
        description = (
            f"NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(40), p.Picture{slot}Desc))), N'')"
            if slot <= 3
            else "CAST(NULL AS nvarchar(40))"
        )
        fields.extend(
            (
                f"DATALENGTH(p.image{slot}) AS image{slot}_size",
                f"SUBSTRING(p.image{slot}, 1, 16) AS image{slot}_header",
                f"{description} AS image{slot}_description",
            )
        )
    where, value = _source_where(product)
    with _connect(_setting_db()) as connection:
        cursor = connection.cursor()
        cursor.execute(f"SELECT {', '.join(fields)} FROM dbo.Product p WHERE {where}", (value,))
        return cursor.fetchone()


def _setting_db():
    """Return the configured ERP setting without leaking credentials to callers."""

    from app.database import SessionLocal

    with SessionLocal() as db:
        setting = _setting(db)
        db.expunge(setting)
        return setting


def _source_image(product: Product, slot: int) -> tuple[bytes, str]:
    if slot not in ERP_IMAGE_SLOTS:
        raise HTTPException(status_code=404, detail="ERP image slot not found.")
    where, value = _source_where(product)
    description = (
        f"NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(40), p.Picture{slot}Desc))), N'')"
        if slot <= 3
        else "CAST(NULL AS nvarchar(40))"
    )
    with _connect(_setting_db()) as connection:
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT p.image{slot} AS content, "
            f"{description} AS description "
            f"FROM dbo.Product p WHERE {where}",
            (value,),
        )
        row = cursor.fetchone()
    content = bytes(row.get("content") or b"") if row else b""
    if not content:
        raise HTTPException(status_code=404, detail="ERP product image not found.")
    if len(content) > MAX_ERP_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="The ERP image is too large to import.")
    return content, str(row.get("description") or "").strip()


def _normalized_image(content: bytes, *, preview: bool) -> tuple[bytes, int, int]:
    try:
        with Image.open(io.BytesIO(content)) as source:
            source.load()
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise HTTPException(status_code=422, detail="The ERP image dimensions are too large.")
            image = ImageOps.exif_transpose(source).copy()
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="The ERP image is invalid or unsupported.") from exc

    image.thumbnail((520, 520) if preview else (2400, 2400), Image.Resampling.LANCZOS)
    if image.mode not in {"RGB", "RGBA"}:
        image = image.convert("RGBA" if "transparency" in image.info else "RGB")
    output = io.BytesIO()
    image.save(output, format="WEBP", quality=82 if preview else 88, method=6)
    result = output.getvalue()
    if (
        not preview
        and len(result) > settings.product_image_max_size_mb * 1024 * 1024
    ):
        raise HTTPException(
            status_code=413,
            detail=(
                "The normalized ERP image exceeds "
                f"{settings.product_image_max_size_mb} MB."
            ),
        )
    return result, image.width, image.height


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


@router.get("/{product_id}/erp-images", response_model=list[ErpProductImageCandidate])
def list_erp_product_images(
    product_id: uuid.UUID,
    actor: User = Depends(require_permission("product_images.view")),
    db: Session = Depends(get_db),
) -> list[ErpProductImageCandidate]:
    product = _product(db, product_id, actor, "product_images.view")
    row = _candidate_row(product)
    if not row:
        return []
    result = []
    for slot in ERP_IMAGE_SLOTS:
        size = int(row.get(f"image{slot}_size") or 0)
        if not size:
            continue
        mime_type = _mime_type(row.get(f"image{slot}_header"))
        result.append(
            ErpProductImageCandidate(
                slot=slot,
                description=str(row.get(f"image{slot}_description") or "").strip(),
                file_size=size,
                mime_type=mime_type,
                supported=mime_type is not None and size <= MAX_ERP_IMAGE_BYTES,
                preview_url=f"{settings.api_prefix}/catalogue/products/{product.id}/erp-images/{slot}/preview",
            )
        )
    return result


@router.get("/{product_id}/erp-images/{slot}/preview")
def preview_erp_product_image(
    product_id: uuid.UUID,
    slot: int,
    actor: User = Depends(require_permission("product_images.view")),
    db: Session = Depends(get_db),
) -> Response:
    product = _product(db, product_id, actor, "product_images.view")
    content, _ = _source_image(product, slot)
    preview, _, _ = _normalized_image(content, preview=True)
    return Response(
        preview,
        media_type="image/webp",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.post(
    "/{product_id}/erp-images/{slot}/import",
    response_model=ImageResponse,
    status_code=status.HTTP_201_CREATED,
)
def import_erp_product_image(
    product_id: uuid.UUID,
    slot: int,
    payload: ErpProductImageImport,
    request: Request,
    actor: User = Depends(require_permission("product_images.upload")),
    db: Session = Depends(get_db),
) -> ImageResponse:
    product = _product(db, product_id, actor, "product_images.upload")
    content, description = _source_image(product, slot)
    normalized, _, _ = _normalized_image(content, preview=False)
    upload_directory = Path(settings.upload_dir).resolve()
    upload_directory.mkdir(parents=True, exist_ok=True)
    storage_name = f"{uuid.uuid4().hex}.webp"
    target = (upload_directory / storage_name).resolve()
    if upload_directory not in target.parents:
        raise HTTPException(status_code=400, detail="Invalid image path.")
    target.write_bytes(normalized)

    make_primary = payload.make_primary or not product.images
    if make_primary:
        for existing in product.images:
            existing.is_primary = False
    max_sort_order = db.scalar(
        select(func.max(ProductImage.sort_order)).where(
            ProductImage.product_id == product.id
        )
    )
    image = ProductImage(
        product_id=product.id,
        file_name=f"{product.sku}-erp-image-{slot}.webp"[:255],
        storage_name=storage_name,
        public_url=f"/uploads/{storage_name}",
        content_type="image/webp",
        alt_text=(payload.alt_text or description or product.erp_name)[:255],
        sort_order=(max_sort_order + 1) if max_sort_order is not None else 0,
        is_primary=make_primary,
        uploaded_by_id=actor.id,
    )
    db.add(image)
    db.add(
        AuditLog(
            user_id=actor.id,
            action="erp_product_image_imported",
            module="catalogue",
            status="success",
            identifier=product.sku,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            details={
                "product_id": str(product.id),
                "erp_source_record_id": product.source_record_id,
                "erp_image_slot": slot,
                "file_name": image.file_name,
                "make_primary": make_primary,
            },
        )
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        target.unlink(missing_ok=True)
        raise
    db.refresh(image)
    return _image_response(image)
