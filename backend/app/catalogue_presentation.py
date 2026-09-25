import uuid
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.access import has_permission, has_record_access, require_permission
from app.auth import get_current_user
from app.commerce_models import Catalogue, CatalogueProduct, CatalogueVersion
from app.config import settings
from app.database import get_db
from app.models import AuditLog, Category, Product, User
from app.platform_models import CatalogueCategorySetting, CatalogueCoverAsset, CatalogueCoverSetting
from app.platform_schemas import CategorySettingResponse, CategorySettingsUpdate, CoverAssetPatch, CoverAssetResponse, CoverResponse, CoverSettingsUpdate
from app.storage import cover_storage, storage


router = APIRouter(prefix="/catalogues", tags=["Catalogue Presentation"])


def _catalogue(db: Session, catalogue_id: uuid.UUID, actor: User | None = None, permission_code: str = "catalogues.view") -> Catalogue:
    item = db.get(Catalogue, catalogue_id)
    if not item:
        raise HTTPException(status_code=404, detail="Catalogue not found.")
    if actor is not None and not has_record_access(db, actor, permission_code, item):
        raise HTTPException(status_code=404, detail="Catalogue not found.")
    return item


def _audit(db: Session, request: Request, actor: User, action: str, catalogue: Catalogue, details: dict | None = None):
    db.add(AuditLog(user_id=actor.id, action=action, module="catalogues", status="success", identifier=catalogue.slug, ip_address=request.client.host if request.client else None, user_agent=request.headers.get("user-agent"), details=details))


ASSET_TYPES = {"background", "brand_logo", "secondary_logo", "decorative_image", "full_cover"}
RESET_COVER_VALUES = {
    "cover_mode": "custom", "background_color": "#164f35", "overlay_color": "#081f14",
    "overlay_opacity": 0.28, "background_fit": "cover", "show_catalogue_name": True,
    "show_catalogue_year": True, "show_subtitle": True, "show_brand_logo": True,
    "show_company_logo": False, "show_start_button": True, "title_color": "#ffffff",
    "title_font_size": 72, "title_alignment": "left", "title_position_x_percent": 10,
    "title_position_y_percent": 68, "title_width_percent": 80, "title_z_index": 20,
    "subtitle_color": "#ffffff", "subtitle_font_size": 20,
    "subtitle_position_x_percent": 10, "subtitle_position_y_percent": 86,
}
COVER_SETTING_FIELDS = (
    "cover_mode", "catalogue_name", "catalogue_year", "subtitle", "company_name", "collection_name",
    "background_color", "overlay_color", "overlay_opacity", "background_fit", "show_catalogue_name",
    "show_catalogue_year", "show_subtitle", "show_brand_logo", "show_company_logo", "show_start_button",
    "title_color", "title_font_size", "title_alignment", "title_position_x_percent", "title_position_y_percent",
    "title_width_percent", "title_z_index", "subtitle_color", "subtitle_font_size",
    "subtitle_position_x_percent", "subtitle_position_y_percent", "cover_alt_text",
)


def _initial_cover_name(catalogue: Catalogue) -> tuple[str, str]:
    match = re.match(r"^(.*?)\s+((?:19|20)\d{2})$", catalogue.title.strip())
    return (match.group(1), match.group(2)) if match else (catalogue.title, "")


def _ensure_cover_settings(db: Session, catalogue: Catalogue, actor: User | None = None) -> CatalogueCoverSetting:
    cover = db.scalar(select(CatalogueCoverSetting).where(CatalogueCoverSetting.catalogue_id == catalogue.id))
    if cover:
        return cover
    name, year = _initial_cover_name(catalogue)
    cover = CatalogueCoverSetting(
        catalogue_id=catalogue.id,
        catalogue_name=name,
        catalogue_year=year,
        cover_alt_text=catalogue.title,
        created_by=actor.id if actor else None,
        updated_by=actor.id if actor else None,
    )
    db.add(cover)
    db.flush()
    return cover


def _asset_url(asset: CatalogueCoverAsset, *, preview: bool = False) -> str:
    suffix = "?preview=true" if preview else ""
    return f"{settings.api_prefix}/v1/catalogues/{asset.catalogue_id}/cover/assets/{asset.id}/content{suffix}"


def asset_response(db: Session, asset: CatalogueCoverAsset) -> CoverAssetResponse:
    uploader = db.get(User, asset.uploaded_by) if asset.uploaded_by else None
    return CoverAssetResponse(
        id=asset.id, catalogue_id=asset.catalogue_id, asset_type=asset.asset_type,
        original_filename=asset.original_filename, mime_type=asset.mime_type, file_size=asset.file_size,
        width=asset.width, height=asset.height, checksum=asset.checksum, alt_text=asset.alt_text,
        position_x_percent=asset.position_x_percent, position_y_percent=asset.position_y_percent,
        width_percent=asset.width_percent, height_percent=asset.height_percent, opacity=asset.opacity,
        rotation=asset.rotation, z_index=asset.z_index, file_url=_asset_url(asset),
        preview_url=_asset_url(asset, preview=True), uploaded_by=asset.uploaded_by,
        uploaded_by_name=uploader.full_name if uploader else None, created_at=asset.created_at,
        updated_at=asset.updated_at, deleted_at=asset.deleted_at,
    )


def cover_response(db: Session, cover: CatalogueCoverSetting) -> CoverResponse:
    rows = db.scalars(
        select(CatalogueCoverAsset)
        .where(CatalogueCoverAsset.catalogue_id == cover.catalogue_id)
        .order_by(CatalogueCoverAsset.created_at.desc())
    ).all()
    values = {field: getattr(cover, field) for field in COVER_SETTING_FIELDS}
    return CoverResponse(
        id=cover.id, catalogue_id=cover.catalogue_id, created_by=cover.created_by,
        updated_by=cover.updated_by, created_at=cover.created_at, updated_at=cover.updated_at,
        assets=[asset_response(db, row) for row in rows if row.deleted_at is None],
        asset_history=[asset_response(db, row) for row in rows if row.deleted_at is not None],
        **values,
    )


def _touch_catalogue(catalogue: Catalogue, actor: User) -> None:
    catalogue.revision += 1
    if catalogue.status == "published":
        catalogue.status = "draft"
    catalogue.updated_by_id = actor.id


def _display_title(cover: CatalogueCoverSetting) -> str:
    name = cover.catalogue_name.strip()
    year = cover.catalogue_year.strip()
    return name if not year or name.casefold().endswith(year.casefold()) else f"{name} {year}"


@router.get("/{catalogue_id}/cover", response_model=CoverResponse | None)
def get_cover(catalogue_id: uuid.UUID, actor: User = Depends(require_permission("catalogues.cover.view")), db: Session = Depends(get_db)):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogues.cover.view")
    cover = _ensure_cover_settings(db, catalogue, actor)
    db.commit()
    db.refresh(cover)
    return cover_response(db, cover)


@router.put("/{catalogue_id}/cover", response_model=CoverResponse)
def update_cover(catalogue_id: uuid.UUID, payload: CoverSettingsUpdate, request: Request, actor: User = Depends(require_permission("catalogues.cover.edit")), db: Session = Depends(get_db)):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogues.cover.edit")
    cover = _ensure_cover_settings(db, catalogue, actor)
    changes: dict[str, dict] = {}
    for field, value in payload.model_dump(exclude_unset=True, exclude_none=True).items():
        old_value = getattr(cover, field)
        if old_value == value:
            continue
        changes[field] = {"old": old_value, "new": value}
        setattr(cover, field, value)
    if changes:
        cover.updated_by = actor.id
        display_title = _display_title(cover)
        if len(display_title) > 220:
            raise HTTPException(status_code=422, detail="Catalogue name and year may not exceed 220 characters together.")
        catalogue.title = display_title
        _touch_catalogue(catalogue, actor)
        _audit(db, request, actor, "catalogue_cover_settings_changed", catalogue, {"changes": changes})
    db.commit()
    db.refresh(cover)
    return cover_response(db, cover)


@router.post("/{catalogue_id}/cover/assets", response_model=CoverAssetResponse, status_code=status.HTTP_201_CREATED)
async def upload_cover_asset(
    catalogue_id: uuid.UUID, request: Request, file: UploadFile = File(...),
    asset_type: str = Form(...), alt_text: str = Form(default=""),
    actor: User = Depends(require_permission("catalogues.cover.upload")), db: Session = Depends(get_db),
):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogues.cover.upload")
    if asset_type not in ASSET_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported cover asset type.")
    if len(alt_text) > 255:
        raise HTTPException(status_code=422, detail="Alternative text may not exceed 255 characters.")
    _ensure_cover_settings(db, catalogue, actor)
    media = await cover_storage.save_cover_asset(file, catalogue_id=catalogue_id, asset_type=asset_type)
    previous = db.scalar(select(CatalogueCoverAsset).where(
        CatalogueCoverAsset.catalogue_id == catalogue_id,
        CatalogueCoverAsset.asset_type == asset_type,
        CatalogueCoverAsset.deleted_at.is_(None),
    ))
    if previous:
        previous.deleted_at = datetime.now(timezone.utc)
    defaults = {
        "background": (50, 50, 100, 100, 0), "full_cover": (50, 50, 100, 100, 0),
        "brand_logo": (15, 13, 24, 16, 10), "secondary_logo": (85, 13, 18, 12, 11),
        "decorative_image": (75, 55, 35, 35, 5),
    }[asset_type]
    asset = CatalogueCoverAsset(
        catalogue_id=catalogue_id, asset_type=asset_type, alt_text=alt_text,
        position_x_percent=defaults[0], position_y_percent=defaults[1], width_percent=defaults[2],
        height_percent=defaults[3], z_index=defaults[4], uploaded_by=actor.id,
        storage_key=media.storage_key, preview_storage_key=media.preview_storage_key,
        original_filename=media.original_filename, mime_type=media.mime_type,
        file_size=media.file_size, width=media.width, height=media.height,
        checksum=media.checksum,
    )
    db.add(asset)
    _touch_catalogue(catalogue, actor)
    _audit(db, request, actor, f"catalogue_cover_{asset_type}_{'replaced' if previous else 'uploaded'}", catalogue, {
        "asset_type": asset_type, "filename": media.original_filename, "file_size": media.file_size,
        "mime_type": media.mime_type, "width": media.width, "height": media.height,
    })
    db.commit()
    db.refresh(asset)
    return asset_response(db, asset)


def _cover_asset(db: Session, catalogue_id: uuid.UUID, asset_id: uuid.UUID) -> CatalogueCoverAsset:
    asset = db.scalar(select(CatalogueCoverAsset).where(CatalogueCoverAsset.id == asset_id, CatalogueCoverAsset.catalogue_id == catalogue_id))
    if not asset:
        raise HTTPException(status_code=404, detail="Cover asset not found.")
    return asset


def _asset_is_in_published_version(
    db: Session, asset: CatalogueCoverAsset
) -> bool:
    """Protect immutable catalogue versions from losing their cover media."""

    asset_id = str(asset.id)
    for snapshot in db.scalars(
        select(CatalogueVersion.snapshot).where(
            CatalogueVersion.catalogue_id == asset.catalogue_id
        )
    ):
        for item in ((snapshot or {}).get("cover") or {}).get("assets") or []:
            if (
                str(item.get("id") or "") == asset_id
                or item.get("storage_key") == asset.storage_key
            ):
                return True
    return False


@router.get("/{catalogue_id}/cover/assets/{asset_id}/content")
def cover_asset_content(
    catalogue_id: uuid.UUID, asset_id: uuid.UUID, preview: bool = False,
    actor: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    if not (has_permission(actor, "catalogues.cover.view") or has_permission(actor, "catalogues.preview")):
        raise HTTPException(status_code=403, detail="Permission required: catalogues.cover.view or catalogues.preview")
    permission_code = "catalogues.cover.view" if has_permission(actor, "catalogues.cover.view") else "catalogues.preview"
    _catalogue(db, catalogue_id, actor, permission_code)
    asset = _cover_asset(db, catalogue_id, asset_id)
    key = asset.preview_storage_key if preview and asset.preview_storage_key else asset.storage_key
    path = cover_storage.resolve(key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Cover asset file not found.")
    mime_type = "image/webp" if key == asset.preview_storage_key else asset.mime_type
    return FileResponse(path, media_type=mime_type, filename=asset.original_filename, content_disposition_type="inline")


@router.patch("/{catalogue_id}/cover/assets/{asset_id}", response_model=CoverAssetResponse)
def update_cover_asset(
    catalogue_id: uuid.UUID, asset_id: uuid.UUID, payload: CoverAssetPatch, request: Request,
    actor: User = Depends(require_permission("catalogues.cover.edit")), db: Session = Depends(get_db),
):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogues.cover.edit")
    asset = _cover_asset(db, catalogue_id, asset_id)
    if asset.deleted_at and not payload.restore:
        raise HTTPException(status_code=409, detail="Restore this previous asset before editing it.")
    changes: dict[str, dict] = {}
    if payload.restore:
        current = db.scalar(select(CatalogueCoverAsset).where(
            CatalogueCoverAsset.catalogue_id == catalogue_id,
            CatalogueCoverAsset.asset_type == asset.asset_type,
            CatalogueCoverAsset.deleted_at.is_(None),
            CatalogueCoverAsset.id != asset.id,
        ))
        if current:
            current.deleted_at = datetime.now(timezone.utc)
        changes["restored"] = {"old": False, "new": True}
        asset.deleted_at = None
    for field, value in payload.model_dump(exclude_unset=True, exclude={"restore"}).items():
        if value is not None and getattr(asset, field) != value:
            changes[field] = {"old": getattr(asset, field), "new": value}
            setattr(asset, field, value)
    if changes:
        _touch_catalogue(catalogue, actor)
        _audit(db, request, actor, "catalogue_cover_asset_changed", catalogue, {"asset_id": str(asset.id), "asset_type": asset.asset_type, "changes": changes})
    db.commit()
    db.refresh(asset)
    return asset_response(db, asset)


@router.delete("/{catalogue_id}/cover/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cover_asset(
    catalogue_id: uuid.UUID, asset_id: uuid.UUID, request: Request,
    permanent: bool = False,
    actor: User = Depends(require_permission("catalogues.cover.delete")), db: Session = Depends(get_db),
):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogues.cover.delete")
    asset = _cover_asset(db, catalogue_id, asset_id)
    if permanent:
        if asset.deleted_at is None:
            raise HTTPException(
                status_code=409,
                detail="Remove the active image before deleting it permanently.",
            )
        if _asset_is_in_published_version(db, asset):
            raise HTTPException(
                status_code=409,
                detail="This image is used by a published catalogue version and cannot be deleted.",
            )
        storage_keys = {asset.storage_key, asset.preview_storage_key} - {None}
        _audit(
            db,
            request,
            actor,
            f"catalogue_cover_{asset.asset_type}_deleted",
            catalogue,
            {"asset_id": str(asset.id), "filename": asset.original_filename},
        )
        db.delete(asset)
        db.commit()
        for key in storage_keys:
            try:
                cover_storage.delete(key)
            except OSError:
                # The database deletion is authoritative. Storage audits can
                # clean an inaccessible orphan without making the UI retry.
                pass
        return
    if asset.deleted_at is None:
        asset.deleted_at = datetime.now(timezone.utc)
        _touch_catalogue(catalogue, actor)
        _audit(db, request, actor, f"catalogue_cover_{asset.asset_type}_removed", catalogue, {"asset_id": str(asset.id), "filename": asset.original_filename})
        db.commit()


@router.get("/{catalogue_id}/cover/preview", response_model=CoverResponse)
def preview_cover(catalogue_id: uuid.UUID, actor: User = Depends(require_permission("catalogues.cover.view")), db: Session = Depends(get_db)):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogues.cover.view")
    cover = _ensure_cover_settings(db, catalogue, actor)
    db.commit()
    return cover_response(db, cover)


@router.post("/{catalogue_id}/cover/reset", response_model=CoverResponse)
def reset_cover(catalogue_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("catalogues.cover.edit")), db: Session = Depends(get_db)):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogues.cover.edit")
    cover = _ensure_cover_settings(db, catalogue, actor)
    for field, value in RESET_COVER_VALUES.items():
        setattr(cover, field, value)
    for asset in db.scalars(select(CatalogueCoverAsset).where(CatalogueCoverAsset.catalogue_id == catalogue_id, CatalogueCoverAsset.deleted_at.is_(None))).all():
        defaults_by_type = {
            "background": (50, 50, 100, 100, 0), "full_cover": (50, 50, 100, 100, 0),
            "brand_logo": (15, 13, 24, 16, 10), "secondary_logo": (85, 13, 18, 12, 11),
            "decorative_image": (75, 55, 35, 35, 5),
        }[asset.asset_type]
        asset.position_x_percent, asset.position_y_percent, asset.width_percent, asset.height_percent, asset.z_index = defaults_by_type
        asset.opacity, asset.rotation = 1, 0
    cover.updated_by = actor.id
    _touch_catalogue(catalogue, actor)
    _audit(db, request, actor, "catalogue_cover_layout_reset", catalogue)
    db.commit()
    db.refresh(cover)
    return cover_response(db, cover)


@router.post("/{catalogue_id}/cover/publish", response_model=CoverResponse)
def publish_cover(catalogue_id: uuid.UUID, request: Request, actor: User = Depends(require_permission("catalogues.cover.publish")), db: Session = Depends(get_db)):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogues.cover.publish")
    cover = _ensure_cover_settings(db, catalogue, actor)
    _audit(db, request, actor, "catalogue_cover_published", catalogue, {"catalogue_name": cover.catalogue_name, "catalogue_year": cover.catalogue_year})
    db.commit()
    return cover_response(db, cover)


def category_rows(
    db: Session,
    catalogue_id: uuid.UUID,
    brand: str | None = None,
) -> list[CategorySettingResponse]:
    product_ids = select(CatalogueProduct.product_id).where(
        CatalogueProduct.catalogue_id == catalogue_id
    )
    normalized_brand = brand.strip() if brand else ""
    if normalized_brand:
        product_ids = product_ids.join(
            Product, Product.id == CatalogueProduct.product_id
        ).where(func.lower(Product.brand) == normalized_brand.casefold())
    categories = db.scalars(select(Category).join(Category.products).where(Product.id.in_(product_ids)).distinct()).all()
    settings_by_id = {item.category_id: item for item in db.scalars(select(CatalogueCategorySetting).where(CatalogueCategorySetting.catalogue_id == catalogue_id)).all()}
    counts = dict(db.execute(select(Category.id, func.count(Product.id)).join(Category.products).where(Product.id.in_(product_ids)).group_by(Category.id)).all())
    rows = []
    for fallback_order, category in enumerate(categories, 1):
        setting = settings_by_id.get(category.id)
        rows.append(CategorySettingResponse(
            id=setting.id if setting else None, category_id=category.id, master_name=category.name, slug=category.slug,
            master_description=category.description, display_name=setting.display_name if setting else "",
            description=setting.description if setting else "", display_order=setting.display_order if setting else fallback_order,
            is_visible=setting.is_visible if setting else True, show_product_count=setting.show_product_count if setting else True,
            default_expanded=setting.default_expanded if setting else False, banner_url=storage.public_url(setting.banner_storage_key) if setting else None,
            product_count=int(counts.get(category.id, 0)),
        ))
    return sorted(rows, key=lambda row: (row.display_order, row.master_name))


@router.get("/{catalogue_id}/categories", response_model=list[CategorySettingResponse])
def get_categories(
    catalogue_id: uuid.UUID,
    brand: str | None = Query(default=None, max_length=120),
    actor: User = Depends(require_permission("catalogue_categories.view")),
    db: Session = Depends(get_db),
):
    _catalogue(db, catalogue_id, actor, "catalogue_categories.view")
    return category_rows(db, catalogue_id, brand)


@router.put("/{catalogue_id}/categories", response_model=list[CategorySettingResponse])
def update_categories(
    catalogue_id: uuid.UUID,
    payload: CategorySettingsUpdate,
    request: Request,
    brand: str | None = Query(default=None, max_length=120),
    actor: User = Depends(require_permission("catalogue_categories.manage")),
    db: Session = Depends(get_db),
):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogue_categories.manage")
    valid_ids = {row.category_id for row in category_rows(db, catalogue_id, brand)}
    if any(item.category_id not in valid_ids for item in payload.categories):
        raise HTTPException(status_code=422, detail="Only categories used by catalogue products can be configured.")
    existing = {item.category_id: item for item in db.scalars(select(CatalogueCategorySetting).where(CatalogueCategorySetting.catalogue_id == catalogue_id)).all()}
    for item in payload.categories:
        target = existing.get(item.category_id)
        if not target:
            target = CatalogueCategorySetting(catalogue_id=catalogue_id, category_id=item.category_id, display_order=item.display_order)
            db.add(target)
        for field, value in item.model_dump().items():
            if field != "category_id":
                setattr(target, field, value)
    catalogue.revision += 1
    if catalogue.status == "published":
        catalogue.status = "draft"
    catalogue.updated_by_id = actor.id
    _audit(db, request, actor, "catalogue_category_settings_changed", catalogue, {"category_count": len(payload.categories)})
    db.commit()
    return category_rows(db, catalogue_id, brand)


@router.post("/{catalogue_id}/categories/{category_id}/banner", response_model=list[CategorySettingResponse])
async def upload_category_banner(catalogue_id: uuid.UUID, category_id: int, request: Request, file: UploadFile = File(...), actor: User = Depends(require_permission("catalogue_categories.manage")), db: Session = Depends(get_db)):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogue_categories.manage")
    if (file.content_type or "").casefold() not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(status_code=422, detail="Category banners must be JPG, PNG, or WebP images.")
    valid_ids = {row.category_id for row in category_rows(db, catalogue_id)}
    if category_id not in valid_ids:
        raise HTTPException(status_code=404, detail="Catalogue category not found.")
    media = await storage.save_cover(file, folder="category-banners")
    setting = db.scalar(select(CatalogueCategorySetting).where(CatalogueCategorySetting.catalogue_id == catalogue_id, CatalogueCategorySetting.category_id == category_id))
    if not setting:
        next_order = (db.scalar(select(func.max(CatalogueCategorySetting.display_order)).where(CatalogueCategorySetting.catalogue_id == catalogue_id)) or 0) + 1
        setting = CatalogueCategorySetting(catalogue_id=catalogue_id, category_id=category_id, display_order=next_order)
        db.add(setting)
    old_key = setting.banner_storage_key
    setting.banner_storage_key = media.preview_storage_key or media.storage_key
    catalogue.revision += 1
    if catalogue.status == "published":
        catalogue.status = "draft"
    catalogue.updated_by_id = actor.id
    _audit(db, request, actor, "catalogue_category_banner_uploaded", catalogue, {"category_id": category_id, "filename": media.original_filename})
    db.commit()
    # Retain the previous banner when a published snapshot still references it.
    if media.preview_storage_key:
        storage.delete(media.storage_key)
    return category_rows(db, catalogue_id)


@router.delete("/{catalogue_id}/categories/{category_id}/banner", response_model=list[CategorySettingResponse])
def delete_category_banner(catalogue_id: uuid.UUID, category_id: int, request: Request, actor: User = Depends(require_permission("catalogue_categories.manage")), db: Session = Depends(get_db)):
    catalogue = _catalogue(db, catalogue_id, actor, "catalogue_categories.manage")
    setting = db.scalar(select(CatalogueCategorySetting).where(CatalogueCategorySetting.catalogue_id == catalogue_id, CatalogueCategorySetting.category_id == category_id))
    if not setting or not setting.banner_storage_key:
        raise HTTPException(status_code=404, detail="Category banner not found.")
    old_key = setting.banner_storage_key
    setting.banner_storage_key = None
    catalogue.revision += 1
    if catalogue.status == "published":
        catalogue.status = "draft"
    catalogue.updated_by_id = actor.id
    _audit(db, request, actor, "catalogue_category_banner_deleted", catalogue, {"category_id": category_id})
    db.commit()
    # Retain the file for immutable published catalogue versions.
    return category_rows(db, catalogue_id)
