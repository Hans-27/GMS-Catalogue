import re
import uuid
from datetime import UTC, datetime
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.access import has_permission, has_record_access, is_superadmin, require_any_permission, require_permission
from app.config import settings
from app.database import get_db
from app.models import AuditLog, Product, ProductVideo, User
from app.product_video_schemas import ProductVideoReorder, ProductVideoResponse, ProductVideoUpdate
from app.storage import video_storage


router = APIRouter(prefix="/products", tags=["Product videos"])
YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{6,20}$")
VIMEO_ID = re.compile(r"^\d{5,15}$")


def _product(db: Session, product_id: uuid.UUID, actor: User, permission: str) -> Product:
    product = db.scalar(select(Product).options(selectinload(Product.videos).selectinload(ProductVideo.uploaded_by)).where(Product.id == product_id))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")
    if not has_record_access(db, actor, permission, product):
        raise HTTPException(status_code=403, detail="You do not have access to this product.")
    return product


def _video(product: Product, video_id: uuid.UUID, *, include_deleted: bool = False) -> ProductVideo:
    video = next((item for item in product.videos if item.id == video_id and (include_deleted or item.deleted_at is None)), None)
    if not video:
        raise HTTPException(status_code=404, detail="Product video not found.")
    return video


def _can_view_video(actor: User, product: Product, video: ProductVideo) -> bool:
    if is_superadmin(actor) or has_permission(actor, "product_videos.edit") or has_permission(actor, "product_videos.view_inactive"):
        return True
    entry = product.catalogue_entry
    return bool(product.status == "active" and video.is_active and video.show_in_catalogue and entry and entry.workflow_status == "published" and entry.visibility == "public")


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",", 1)[0].strip() if forwarded else (request.client.host if request.client else None)


def _audit(db: Session, request: Request, actor: User, product: Product, video: ProductVideo, action: str, changes: dict | None = None) -> None:
    db.add(AuditLog(
        user_id=actor.id, action=action, module="product_videos", status="success",
        identifier=product.sku, ip_address=_client_ip(request), user_agent=request.headers.get("user-agent"),
        details={
            "product_id": str(product.id), "video_id": str(video.id),
            "request_id": getattr(request.state, "request_id", request.headers.get("x-request-id")),
            "changes": changes or {},
        },
    ))


def _normalize_external_url(raw: str) -> tuple[str, str, str]:
    value = raw.strip()
    try:
        parsed = urlparse(value)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="The external video URL is invalid.") from error
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=422, detail="External videos require a valid HTTPS URL.")
    host = parsed.hostname.casefold().removeprefix("www.")
    video_id = ""
    if host in {"youtube.com", "m.youtube.com"} and settings.product_video_youtube_enabled:
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [""])[0]
        elif parsed.path.startswith(("/embed/", "/shorts/")):
            video_id = parsed.path.rstrip("/").split("/")[-1]
        if not YOUTUBE_ID.fullmatch(video_id):
            raise HTTPException(status_code=422, detail="The YouTube video URL is invalid.")
        return "youtube", video_id, f"https://www.youtube.com/watch?v={video_id}"
    if host == "youtu.be" and settings.product_video_youtube_enabled:
        video_id = parsed.path.strip("/").split("/", 1)[0]
        if not YOUTUBE_ID.fullmatch(video_id):
            raise HTTPException(status_code=422, detail="The YouTube video URL is invalid.")
        return "youtube", video_id, f"https://www.youtube.com/watch?v={video_id}"
    if host in {"vimeo.com", "player.vimeo.com"} and settings.product_video_vimeo_enabled:
        candidates = [part for part in parsed.path.split("/") if part.isdigit()]
        video_id = candidates[-1] if candidates else ""
        if not VIMEO_ID.fullmatch(video_id):
            raise HTTPException(status_code=422, detail="The Vimeo video URL is invalid.")
        return "vimeo", video_id, f"https://vimeo.com/{video_id}"
    if settings.product_video_direct_url_enabled and parsed.path.casefold().endswith((".mp4", ".webm")):
        return "direct_url", "", value
    raise HTTPException(status_code=422, detail="This external video provider is not approved.")


def normalize_external_video_url(raw: str) -> tuple[str, str, str]:
    """Validate and normalize a URL using the platform's approved video providers."""
    return _normalize_external_url(raw)


def _playback_url(video: ProductVideo) -> str:
    if video.source_type == "upload":
        return f"{settings.api_prefix}/v1/products/{video.product_id}/videos/{video.id}/content"
    if video.provider == "youtube":
        return f"https://www.youtube-nocookie.com/embed/{video.external_video_id}"
    if video.provider == "vimeo":
        return f"https://player.vimeo.com/video/{video.external_video_id}"
    return video.external_url or ""


def video_response(video: ProductVideo) -> ProductVideoResponse:
    return ProductVideoResponse(
        id=video.id, product_id=video.product_id, source_type=video.source_type,
        title_en=video.title_en, title_th=video.title_th, description=video.description, alt_text=video.alt_text,
        provider=video.provider, external_url=video.external_url if video.source_type == "external" else None,
        external_video_id=video.external_video_id, playback_url=_playback_url(video),
        thumbnail_url=(f"{settings.api_prefix}/v1/products/{video.product_id}/videos/{video.id}/thumbnail/content" if video.thumbnail_storage_key else None),
        caption_url=(f"{settings.api_prefix}/v1/products/{video.product_id}/videos/{video.id}/caption/content" if video.caption_storage_key else None),
        original_filename=video.original_filename, mime_type=video.mime_type, file_size=video.file_size,
        duration_seconds=float(video.duration_seconds) if video.duration_seconds is not None else None,
        width=video.width, height=video.height, display_order=video.display_order,
        is_featured=video.is_featured, is_active=video.is_active,
        show_in_catalogue=video.show_in_catalogue, show_in_public_catalogue=video.show_in_public_catalogue,
        show_controls=video.show_controls, allow_download=video.allow_download,
        autoplay=video.autoplay, muted=video.muted, loop=video.loop,
        processing_status=video.processing_status, uploaded_by_id=video.uploaded_by_id,
        uploaded_by_name=video.uploaded_by.full_name if video.uploaded_by else None,
        created_at=video.created_at, updated_at=video.updated_at,
    )


def _set_featured(db: Session, product: Product, selected: ProductVideo) -> None:
    for item in product.videos:
        if item.deleted_at is None:
            item.is_featured = False
    selected.is_featured = False
    db.flush()
    selected.is_featured = True


@router.get("/{product_id}/videos", response_model=list[ProductVideoResponse])
def list_product_videos(product_id: uuid.UUID, actor: User = Depends(require_permission("product_videos.view")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.view")
    return [video_response(item) for item in product.videos if item.deleted_at is None and _can_view_video(actor, product, item)]


@router.post("/{product_id}/videos", response_model=ProductVideoResponse, status_code=status.HTTP_201_CREATED)
async def create_product_video(
    product_id: uuid.UUID, request: Request,
    source_type: str = Form(...), file: UploadFile | None = File(default=None), external_url: str = Form(default=""),
    title_en: str = Form(default="", max_length=255), title_th: str = Form(default="", max_length=255),
    description: str = Form(default="", max_length=12000), alt_text: str = Form(default="", max_length=255),
    display_order: int = Form(default=0, ge=0), is_featured: bool = Form(default=True),
    is_active: bool = Form(default=True), show_in_catalogue: bool = Form(default=True),
    show_in_public_catalogue: bool = Form(default=False), show_controls: bool = Form(default=True),
    allow_download: bool = Form(default=False), autoplay: bool = Form(default=False), muted: bool = Form(default=False), loop: bool = Form(default=False),
    actor: User = Depends(require_any_permission("product_videos.upload", "product_videos.create_link")), db: Session = Depends(get_db),
):
    product = _product(db, product_id, actor, "products.edit")
    source_type = source_type.strip().casefold()
    if autoplay and not muted:
        raise HTTPException(status_code=422, detail="Autoplay videos must be muted.")
    maximum_order = db.scalar(select(func.max(ProductVideo.display_order)).where(ProductVideo.product_id == product.id, ProductVideo.deleted_at.is_(None)))
    order = display_order if display_order else ((maximum_order or 0) + 1)
    make_featured = is_featured or not any(item.deleted_at is None for item in product.videos)
    video = ProductVideo(
        product_id=product.id, source_type=source_type, title_en=title_en.strip(), title_th=title_th.strip(),
        description=description.strip(), alt_text=alt_text.strip(), display_order=order,
        is_featured=False,
        is_active=is_active, show_in_catalogue=show_in_catalogue, show_in_public_catalogue=show_in_public_catalogue,
        show_controls=show_controls, allow_download=allow_download, autoplay=autoplay, muted=muted, loop=loop,
        uploaded_by_id=actor.id,
    )
    stored_key = None
    if source_type == "upload":
        if not has_permission(actor, "product_videos.upload"):
            raise HTTPException(status_code=403, detail="Permission required: product_videos.upload")
        if not file:
            raise HTTPException(status_code=422, detail="Choose an MP4 or WebM video file.")
        media = await video_storage.save_product_video(file, product_id=product.id)
        stored_key = media.storage_key
        video.provider = "internal"; video.storage_key = media.storage_key; video.playback_storage_key = media.storage_key
        video.original_filename = media.original_filename; video.mime_type = media.mime_type; video.file_size = media.file_size
        video.checksum = media.checksum; video.duration_seconds = media.duration_seconds; video.width = media.width; video.height = media.height; video.processing_status = "ready"
    elif source_type == "external":
        if not has_permission(actor, "product_videos.create_link"):
            raise HTTPException(status_code=403, detail="Permission required: product_videos.create_link")
        provider, external_id, normalized = _normalize_external_url(external_url)
        video.provider = provider; video.external_video_id = external_id or None; video.external_url = normalized
        video.processing_status = "ready"
    else:
        raise HTTPException(status_code=422, detail="Video source type must be upload or external.")
    try:
        db.add(video); db.flush()
        if make_featured: _set_featured(db, product, video)
        _audit(db, request, actor, product, video, "product_video_uploaded" if source_type == "upload" else "product_external_video_added")
        db.commit(); db.refresh(video)
    except Exception:
        db.rollback()
        if stored_key: video_storage.delete(stored_key)
        raise
    return video_response(video)


@router.get("/{product_id}/videos/{video_id}", response_model=ProductVideoResponse)
def get_product_video(product_id: uuid.UUID, video_id: uuid.UUID, actor: User = Depends(require_permission("product_videos.view")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.view"); video = _video(product, video_id)
    if not video.is_active and not (is_superadmin(actor) or has_permission(actor, "product_videos.view_inactive")):
        raise HTTPException(status_code=404, detail="Product video not found.")
    if not _can_view_video(actor, product, video):
        raise HTTPException(status_code=404, detail="Product video not found.")
    return video_response(video)


@router.patch("/{product_id}/videos/{video_id}", response_model=ProductVideoResponse)
def update_product_video(product_id: uuid.UUID, video_id: uuid.UUID, payload: ProductVideoUpdate, request: Request, actor: User = Depends(require_permission("product_videos.edit")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.edit"); video = _video(product, video_id)
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("autoplay") is True and changes.get("muted", video.muted) is not True:
        raise HTTPException(status_code=422, detail="Autoplay videos must be muted.")
    if changes.get("show_in_public_catalogue") is True and not has_permission(actor, "product_videos.publish"):
        raise HTTPException(status_code=403, detail="Permission required: product_videos.publish")
    old = {field: getattr(video, field) for field in changes}
    for field, value in changes.items(): setattr(video, field, value)
    if changes.get("is_featured"): _set_featured(db, product, video)
    _audit(db, request, actor, product, video, "product_video_edited", {"old": old, "new": changes})
    db.commit(); db.refresh(video); return video_response(video)


@router.delete("/{product_id}/videos/{video_id}", status_code=204)
def delete_product_video(product_id: uuid.UUID, video_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("product_videos.delete")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.edit"); video = _video(product, video_id)
    video.deleted_at = datetime.now(UTC); video.is_active = False; video.is_featured = False; video.processing_status = "inactive"
    next_video = next((item for item in product.videos if item.id != video.id and item.deleted_at is None and item.is_active), None)
    if next_video: _set_featured(db, product, next_video)
    _audit(db, request, actor, product, video, "product_video_deleted")
    db.commit()


@router.post("/{product_id}/videos/{video_id}/set-featured", response_model=ProductVideoResponse)
def set_featured_video(product_id: uuid.UUID, video_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("product_videos.set_featured")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.edit"); video = _video(product, video_id)
    if not video.is_active: raise HTTPException(status_code=409, detail="Activate the video before featuring it.")
    _set_featured(db, product, video); _audit(db, request, actor, product, video, "product_video_featured")
    db.commit(); return video_response(video)


@router.post("/{product_id}/videos/reorder", response_model=list[ProductVideoResponse])
def reorder_product_videos(product_id: uuid.UUID, payload: ProductVideoReorder, request: Request, actor: User = Depends(require_permission("product_videos.edit")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.edit")
    by_id = {item.id: item for item in product.videos if item.deleted_at is None}
    if any(item.video_id not in by_id for item in payload.videos): raise HTTPException(status_code=404, detail="One or more videos were not found.")
    for item in payload.videos: by_id[item.video_id].display_order = item.display_order
    first = by_id[payload.videos[0].video_id]; _audit(db, request, actor, product, first, "product_videos_reordered")
    db.commit(); return [video_response(item) for item in sorted(by_id.values(), key=lambda value: value.display_order)]


@router.post("/{product_id}/videos/{video_id}/thumbnail", response_model=ProductVideoResponse)
async def upload_video_thumbnail(product_id: uuid.UUID, video_id: uuid.UUID, request: Request, file: UploadFile = File(...), actor: User = Depends(require_permission("product_videos.edit")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.edit"); video = _video(product, video_id)
    media = await video_storage.save_video_thumbnail(file, product_id=product.id, video_id=video.id)
    old_key = video.thumbnail_storage_key; video.thumbnail_storage_key = media.storage_key
    _audit(db, request, actor, product, video, "product_video_thumbnail_uploaded")
    db.commit()
    if old_key: video_storage.delete(old_key)
    return video_response(video)


@router.post("/{product_id}/videos/{video_id}/replace", response_model=ProductVideoResponse)
async def replace_product_video(product_id: uuid.UUID, video_id: uuid.UUID, request: Request, file: UploadFile = File(...), actor: User = Depends(require_permission("product_videos.upload")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.edit"); video = _video(product, video_id)
    media = await video_storage.save_product_video(file, product_id=product.id)
    old_keys = {video.storage_key, video.playback_storage_key} - {None}
    video.source_type = "upload"; video.provider = "internal"; video.external_url = None; video.external_video_id = None
    video.storage_key = media.storage_key; video.playback_storage_key = media.storage_key
    video.original_filename = media.original_filename; video.mime_type = media.mime_type; video.file_size = media.file_size
    video.checksum = media.checksum; video.duration_seconds = media.duration_seconds; video.width = media.width; video.height = media.height
    video.processing_status = "ready"; video.processing_error = ""
    _audit(db, request, actor, product, video, "product_video_replaced")
    try: db.commit(); db.refresh(video)
    except Exception: db.rollback(); video_storage.delete(media.storage_key); raise
    for key in old_keys: video_storage.delete(key)
    return video_response(video)


@router.post("/{product_id}/videos/{video_id}/caption", response_model=ProductVideoResponse)
async def upload_video_caption(product_id: uuid.UUID, video_id: uuid.UUID, request: Request, file: UploadFile = File(...), actor: User = Depends(require_permission("product_videos.edit")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.edit"); video = _video(product, video_id)
    media = await video_storage.save_video_caption(file, product_id=product.id, video_id=video.id)
    old_key = video.caption_storage_key; video.caption_storage_key = media.storage_key
    _audit(db, request, actor, product, video, "product_video_caption_uploaded")
    db.commit()
    if old_key: video_storage.delete(old_key)
    return video_response(video)


def _media_file(product_id: uuid.UUID, video_id: uuid.UUID, kind: str, actor: User, db: Session):
    product = _product(db, product_id, actor, "products.view"); video = _video(product, video_id)
    if not video.is_active and not (is_superadmin(actor) or has_permission(actor, "product_videos.view_inactive")):
        raise HTTPException(status_code=404, detail="This video is currently unavailable.")
    if not _can_view_video(actor, product, video):
        raise HTTPException(status_code=404, detail="This video is currently unavailable.")
    key = video.playback_storage_key or video.storage_key if kind == "content" else (video.thumbnail_storage_key if kind == "thumbnail" else video.caption_storage_key)
    if not key: raise HTTPException(status_code=404, detail="This video asset is unavailable.")
    path = video_storage.resolve(key)
    if not path.is_file(): raise HTTPException(status_code=404, detail="This video asset is unavailable.")
    mime = video.mime_type if kind == "content" else ("text/vtt" if kind == "caption" else None)
    return FileResponse(path, media_type=mime, filename=None, content_disposition_type="inline", headers={"Cache-Control": "private, max-age=300", "Accept-Ranges": "bytes"})


@router.get("/{product_id}/videos/{video_id}/content")
def video_content(product_id: uuid.UUID, video_id: uuid.UUID, actor: User = Depends(require_permission("product_videos.view")), db: Session = Depends(get_db)):
    product = _product(db, product_id, actor, "products.view"); video = _video(product, video_id)
    if video.source_type == "external": return RedirectResponse(_playback_url(video), status_code=307)
    return _media_file(product_id, video_id, "content", actor, db)


@router.get("/{product_id}/videos/{video_id}/thumbnail/content")
def video_thumbnail_content(product_id: uuid.UUID, video_id: uuid.UUID, actor: User = Depends(require_permission("product_videos.view")), db: Session = Depends(get_db)):
    return _media_file(product_id, video_id, "thumbnail", actor, db)


@router.get("/{product_id}/videos/{video_id}/caption/content")
def video_caption_content(product_id: uuid.UUID, video_id: uuid.UUID, actor: User = Depends(require_permission("product_videos.view")), db: Session = Depends(get_db)):
    return _media_file(product_id, video_id, "caption", actor, db)
