"""Import only catalogue cover artwork from the authenticated legacy site.

The importer deliberately does not read or mutate legacy product, category, price,
or customer-link data.  A cover is applied only when the normalized legacy card
name exactly matches a current ERP catalogue brand.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import hashlib
import io
import json
import re
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib import parse, request
from http.cookiejar import CookieJar

from PIL import Image, ImageOps
from sqlalchemy import func, select
from starlette.datastructures import Headers, UploadFile

import app.main  # noqa: F401 - registers every ORM model before queries run
from app.branding import LOGO_VERSION
from app.commerce_models import Catalogue, CatalogueVersion
from app.config import settings
from app.database import SessionLocal
from app.models import AuditLog
from app.platform_models import CatalogueCoverAsset, CatalogueCoverSetting
from app.storage import cover_storage


USER_AGENT = "GMS-Catalogue-Cover-Importer/1.0"
COVER_FIELDS = (
    "cover_mode",
    "catalogue_name",
    "catalogue_year",
    "subtitle",
    "company_name",
    "collection_name",
    "background_color",
    "overlay_color",
    "overlay_opacity",
    "background_fit",
    "show_catalogue_name",
    "show_catalogue_year",
    "show_subtitle",
    "show_brand_logo",
    "show_company_logo",
    "show_start_button",
    "title_color",
    "title_font_size",
    "title_alignment",
    "title_position_x_percent",
    "title_position_y_percent",
    "title_width_percent",
    "title_z_index",
    "subtitle_color",
    "subtitle_font_size",
    "subtitle_position_x_percent",
    "subtitle_position_y_percent",
    "cover_alt_text",
)


def _match_key(value: str | None) -> str:
    return re.sub(r"[\W_]+", "", (value or "").casefold(), flags=re.UNICODE)


@dataclass(frozen=True)
class LegacyCover:
    brand: str
    image_path: str


class _LegacyCoverParser(HTMLParser):
    """Extract the visible cover card image and its brand heading."""

    def __init__(self) -> None:
        super().__init__()
        self.covers: list[LegacyCover] = []
        self._card_depth = 0
        self._image_path = ""
        self._capture_brand = False
        self._brand_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = set((values.get("class") or "").split())
        if tag == "div" and self._card_depth:
            self._card_depth += 1
        elif tag == "div" and "ecommerce-card" in classes:
            self._card_depth = 1
            self._image_path = ""
            self._brand_parts = []
        if not self._card_depth:
            return
        if tag == "img" and (values.get("alt") or "").casefold() == "cover":
            self._image_path = (values.get("src") or "").strip()
        if tag == "h6" and "item-name" in classes:
            self._capture_brand = True
            self._brand_parts = []

    def handle_data(self, data: str) -> None:
        if self._capture_brand:
            self._brand_parts.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "h6" and self._capture_brand:
            self._capture_brand = False
        if tag != "div" or not self._card_depth:
            return
        self._card_depth -= 1
        if self._card_depth:
            return
        brand = " ".join(" ".join(self._brand_parts).split())
        if brand and self._image_path:
            self.covers.append(LegacyCover(brand=brand, image_path=self._image_path))


def _legacy_opener() -> tuple[request.OpenerDirector, str]:
    source_url = settings.legacy_catalogue_url.strip()
    username = settings.legacy_catalogue_username.strip()
    password = settings.legacy_catalogue_password.get_secret_value()
    if not source_url or not username or not password:
        raise RuntimeError("Legacy catalogue connection settings are incomplete.")
    parts = parse.urlsplit(source_url)
    endpoint = parse.urlunsplit((parts.scheme, parts.netloc, parts.path, "", ""))
    login_url = f"{endpoint}?{parse.urlencode({'r': 'site/login'})}"
    opener = request.build_opener(request.HTTPCookieProcessor(CookieJar()))
    headers = {"User-Agent": USER_AGENT}
    opener.open(request.Request(login_url, headers=headers), timeout=30).read()
    payload = parse.urlencode(
        {
            "LoginForm[username]": username,
            "LoginForm[password]": password,
            "yt0": "Login",
        }
    ).encode()
    opener.open(
        request.Request(login_url, data=payload, headers=headers), timeout=30
    ).read()
    return opener, endpoint


def _fetch_legacy_covers() -> tuple[request.OpenerDirector, str, list[LegacyCover]]:
    opener, endpoint = _legacy_opener()
    index_url = f"{endpoint}?{parse.urlencode({'r': 'sale/index'})}"
    response = opener.open(
        request.Request(index_url, headers={"User-Agent": USER_AGENT}), timeout=45
    )
    document = response.read().decode("utf-8", errors="replace")
    if "LoginForm[username]" in document or "r=site%2Flogin" in response.geturl():
        raise RuntimeError("The legacy catalogue login was not accepted.")
    parser = _LegacyCoverParser()
    parser.feed(document)
    unique: dict[str, LegacyCover] = {}
    for cover in parser.covers:
        unique.setdefault(_match_key(cover.brand), cover)
    return opener, endpoint, list(unique.values())


def _safe_asset_url(endpoint: str, image_path: str) -> str:
    endpoint_parts = parse.urlsplit(endpoint)
    absolute = parse.urljoin(
        f"{endpoint_parts.scheme}://{endpoint_parts.netloc}/", image_path
    )
    parts = parse.urlsplit(absolute)
    if parts.scheme not in {"http", "https"} or parts.netloc != endpoint_parts.netloc:
        raise RuntimeError("A legacy cover points outside the configured legacy host.")
    return parse.urlunsplit(
        (parts.scheme, parts.netloc, parse.quote(parse.unquote(parts.path), safe="/@"), parts.query, "")
    )


def _normalized_image(
    opener: request.OpenerDirector, endpoint: str, cover: LegacyCover
) -> tuple[bytes, str, str, int, int]:
    url = _safe_asset_url(endpoint, cover.image_path)
    maximum = settings.max_cover_upload_mb * 1024 * 1024
    response = opener.open(
        request.Request(url, headers={"User-Agent": USER_AGENT}), timeout=60
    )
    content = response.read(maximum + 1)
    if not content or len(content) > maximum:
        raise RuntimeError(f"Legacy cover for {cover.brand} is empty or exceeds the upload limit.")

    # This legacy HANA cover is a very large, trusted JPEG.  Read its header,
    # cap the total decoded area, and use JPEG draft decoding before resizing.
    previous_limit = Image.MAX_IMAGE_PIXELS
    Image.MAX_IMAGE_PIXELS = None
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(content)) as probe:
                original_width, original_height = probe.size
                image_format = (probe.format or "").upper()
        if (
            original_width <= 0
            or original_height <= 0
            or original_width > 30_000
            or original_height > 30_000
            or original_width * original_height > 350_000_000
        ):
            raise RuntimeError(f"Legacy cover dimensions for {cover.brand} are unsafe.")
        if image_format not in {"JPEG", "PNG", "WEBP"}:
            raise RuntimeError(f"Legacy cover format for {cover.brand} is unsupported.")

        target_dimension = min(settings.max_cover_dimension, 6000)
        requires_resize = max(original_width, original_height) > target_dimension
        if requires_resize:
            with Image.open(io.BytesIO(content)) as opened:
                if image_format == "JPEG":
                    opened.draft("RGB", (target_dimension, target_dimension))
                image = ImageOps.exif_transpose(opened).convert("RGB")
                image.thumbnail((target_dimension, target_dimension), Image.Resampling.LANCZOS)
                output = io.BytesIO()
                image.save(output, format="JPEG", quality=92, optimize=True)
                content = output.getvalue()
                filename = f"{Path(parse.unquote(cover.image_path)).stem}-web.jpg"
                mime_type = "image/jpeg"
                width, height = image.size
        else:
            filename = Path(parse.unquote(cover.image_path)).name[:255]
            mime_type = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}[image_format]
            width, height = original_width, original_height
    finally:
        Image.MAX_IMAGE_PIXELS = previous_limit
    return content, filename, mime_type, width, height


async def _store_cover(
    content: bytes,
    filename: str,
    mime_type: str,
    catalogue_id,
):
    upload = UploadFile(
        io.BytesIO(content),
        filename=filename,
        headers=Headers({"content-type": mime_type}),
    )
    return await cover_storage.save_cover_asset(
        upload, catalogue_id=catalogue_id, asset_type="full_cover"
    )


def _cover_snapshot(
    cover: CatalogueCoverSetting, asset: CatalogueCoverAsset
) -> dict:
    values = {field: getattr(cover, field) for field in COVER_FIELDS}
    values["default_company_logo_version"] = LOGO_VERSION
    asset_url = (
        f"{settings.api_prefix}/v1/catalogues/{asset.catalogue_id}"
        f"/cover/assets/{asset.id}/content"
    )
    values["assets"] = [
        {
            "id": str(asset.id),
            "asset_type": asset.asset_type,
            "file_url": asset_url,
            "preview_url": f"{asset_url}?preview=true",
            "mime_type": asset.mime_type,
            "original_filename": asset.original_filename,
            "file_size": asset.file_size,
            "width": asset.width,
            "height": asset.height,
            "alt_text": asset.alt_text,
            "position_x_percent": asset.position_x_percent,
            "position_y_percent": asset.position_y_percent,
            "width_percent": asset.width_percent,
            "height_percent": asset.height_percent,
            "opacity": asset.opacity,
            "rotation": asset.rotation,
            "z_index": asset.z_index,
            "storage_key": asset.storage_key,
            "preview_storage_key": asset.preview_storage_key,
        }
    ]
    return values


def _apply_cover(
    db,
    catalogue: Catalogue,
    legacy: LegacyCover,
    media,
) -> tuple[bool, int]:
    current_asset = db.scalar(
        select(CatalogueCoverAsset).where(
            CatalogueCoverAsset.catalogue_id == catalogue.id,
            CatalogueCoverAsset.asset_type == "full_cover",
            CatalogueCoverAsset.deleted_at.is_(None),
        )
    )
    active_assets = db.scalars(
        select(CatalogueCoverAsset).where(
            CatalogueCoverAsset.catalogue_id == catalogue.id,
            CatalogueCoverAsset.deleted_at.is_(None),
        )
    ).all()
    cover = db.scalar(
        select(CatalogueCoverSetting).where(
            CatalogueCoverSetting.catalogue_id == catalogue.id
        )
    )
    if (
        cover
        and cover.cover_mode == "full_image"
        and current_asset
        and current_asset.checksum == media.checksum
        and len(active_assets) == 1
    ):
        return False, catalogue.version

    actor_id = catalogue.updated_by_id or catalogue.owner_id or catalogue.created_by_id
    now = datetime.now(timezone.utc)
    for old_asset in active_assets:
        old_asset.deleted_at = now

    if cover is None:
        cover = CatalogueCoverSetting(
            catalogue_id=catalogue.id,
            catalogue_name=catalogue.title,
            created_by=actor_id,
        )
        db.add(cover)
    cover.cover_mode = "full_image"
    cover.background_fit = "contain"
    cover.overlay_opacity = 0
    cover.show_catalogue_name = False
    cover.show_catalogue_year = False
    cover.show_subtitle = False
    cover.show_brand_logo = False
    cover.show_company_logo = False
    cover.show_start_button = False
    cover.cover_alt_text = f"Legacy {legacy.brand} catalogue cover"[:255]
    cover.updated_by = actor_id

    asset = CatalogueCoverAsset(
        catalogue_id=catalogue.id,
        asset_type="full_cover",
        storage_key=media.storage_key,
        preview_storage_key=media.preview_storage_key,
        original_filename=media.original_filename,
        mime_type=media.mime_type,
        file_size=media.file_size,
        width=media.width,
        height=media.height,
        checksum=media.checksum,
        alt_text=cover.cover_alt_text,
        position_x_percent=50,
        position_y_percent=50,
        width_percent=100,
        height_percent=100,
        opacity=1,
        rotation=0,
        z_index=0,
        uploaded_by=actor_id,
    )
    db.add(asset)
    db.flush()

    latest = db.scalar(
        select(CatalogueVersion)
        .where(CatalogueVersion.catalogue_id == catalogue.id)
        .order_by(CatalogueVersion.version_number.desc())
        .limit(1)
    )
    if latest is None:
        raise RuntimeError(f"{catalogue.title} has no published snapshot to update safely.")
    next_version = latest.version_number + 1
    snapshot = copy.deepcopy(latest.snapshot)
    snapshot["cover"] = _cover_snapshot(cover, asset)
    snapshot["generated_at"] = now.isoformat()
    snapshot["status"] = "published"
    db.add(
        CatalogueVersion(
            catalogue_id=catalogue.id,
            version_number=next_version,
            snapshot=snapshot,
            published_by_id=actor_id,
            published_at=now,
        )
    )
    catalogue.version = next_version
    catalogue.revision += 1
    catalogue.status = "published"
    catalogue.published_by_id = actor_id
    catalogue.published_at = now
    catalogue.updated_by_id = actor_id
    db.add(
        AuditLog(
            user_id=actor_id,
            action="legacy_catalogue_cover_imported",
            module="catalogues",
            status="success",
            identifier=catalogue.slug,
            details={
                "catalogue_id": str(catalogue.id),
                "brand": catalogue.brand,
                "legacy_brand": legacy.brand,
                "cover_filename": media.original_filename,
                "cover_checksum": media.checksum,
                "version": next_version,
                "scope": "cover_only",
            },
        )
    )
    return True, next_version


def run(*, apply: bool) -> dict:
    opener, endpoint, legacy_covers = _fetch_legacy_covers()
    legacy_by_brand = {_match_key(item.brand): item for item in legacy_covers}
    result = {
        "mode": "apply" if apply else "dry-run",
        "legacy_covers_found": len(legacy_covers),
        "matched_catalogues": [],
        "unmatched_legacy_brands": [],
        "updated": 0,
        "unchanged": 0,
    }
    stored_keys: list[tuple[str, str | None]] = []
    with SessionLocal() as db:
        catalogues = db.scalars(
            select(Catalogue).where(Catalogue.brand.is_not(None)).order_by(Catalogue.brand)
        ).all()
        current_by_brand = {_match_key(row.brand): row for row in catalogues}
        matches = [
            (current_by_brand[key], legacy)
            for key, legacy in legacy_by_brand.items()
            if key in current_by_brand
        ]
        result["matched_catalogues"] = [
            {"brand": catalogue.brand, "catalogue_id": str(catalogue.id), "legacy_brand": legacy.brand}
            for catalogue, legacy in matches
        ]
        result["unmatched_legacy_brands"] = [
            legacy.brand for key, legacy in legacy_by_brand.items() if key not in current_by_brand
        ]
        if not apply:
            return result
        try:
            for catalogue, legacy in matches:
                content, filename, mime_type, _, _ = _normalized_image(opener, endpoint, legacy)
                checksum = hashlib.sha256(content).hexdigest()
                current = db.scalar(
                    select(CatalogueCoverAsset).where(
                        CatalogueCoverAsset.catalogue_id == catalogue.id,
                        CatalogueCoverAsset.asset_type == "full_cover",
                        CatalogueCoverAsset.deleted_at.is_(None),
                    )
                )
                active_count = db.scalar(
                    select(func.count(CatalogueCoverAsset.id)).where(
                        CatalogueCoverAsset.catalogue_id == catalogue.id,
                        CatalogueCoverAsset.deleted_at.is_(None),
                    )
                )
                cover = db.scalar(
                    select(CatalogueCoverSetting).where(
                        CatalogueCoverSetting.catalogue_id == catalogue.id
                    )
                )
                if current and current.checksum == checksum and active_count == 1 and cover and cover.cover_mode == "full_image":
                    result["unchanged"] += 1
                    continue
                media = asyncio.run(
                    _store_cover(content, filename, mime_type, catalogue.id)
                )
                stored_keys.append((media.storage_key, media.preview_storage_key))
                changed, version = _apply_cover(db, catalogue, legacy, media)
                if changed:
                    result["updated"] += 1
                    for item in result["matched_catalogues"]:
                        if item["catalogue_id"] == str(catalogue.id):
                            item["published_version"] = version
                            item["dimensions"] = [media.width, media.height]
                            break
            db.commit()
        except Exception:
            db.rollback()
            for storage_key, preview_key in stored_keys:
                cover_storage.delete(storage_key)
                cover_storage.delete(preview_key)
            raise
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Import exact brand-matched cover assets and publish cover-only versions.",
    )
    arguments = parser.parse_args()
    print(json.dumps(run(apply=arguments.apply), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
