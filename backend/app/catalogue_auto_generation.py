from __future__ import annotations

import hashlib
import html
import io
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from http.cookiejar import CookieJar
from urllib import parse, request

from PIL import Image, UnidentifiedImageError
from sqlalchemy import delete, insert, select
from sqlalchemy.orm import Session, selectinload

from app.commerce_models import (
    Catalogue,
    CatalogueAudienceType,
    CatalogueProduct,
    PriceList,
)
from app.config import settings
from app.erp_models import ErpCustomerPriceLevel
from app.models import Category, Product, ProductImage
from app.platform_models import (
    CatalogueCategorySetting,
    CatalogueCoverAsset,
    CatalogueCoverSetting,
)
from app.storage import cover_storage, storage


AUTO_SLUG_PREFIX = "erp-brand-"
AUTO_COVER_ALT_PREFIX = "Automatically generated from GMS ERP for "
AUTO_COVER_PALETTE = (
    ("#103f2a", "#071d13"),
    ("#123d4a", "#061d24"),
    ("#3f2f18", "#21170a"),
    ("#3b2447", "#1d0f24"),
    ("#153b3a", "#071d1c"),
)


def _match_key(value: str | None) -> str:
    return re.sub(r"[\W_]+", "", (value or "").casefold(), flags=re.UNICODE)


def _slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")
    if slug:
        return slug[:190]
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:16]


def _natural_key(value: str) -> tuple:
    return tuple(
        int(part) if part.isdigit() else part.casefold()
        for part in re.split(r"(\d+)", value or "")
    )


def _cover_palette(brand: str) -> tuple[str, str]:
    digest = hashlib.sha1(brand.casefold().encode("utf-8")).digest()
    return AUTO_COVER_PALETTE[digest[0] % len(AUTO_COVER_PALETTE)]


def _cover_year(products: list[Product]) -> str:
    source_dates = [
        product.last_source_sync_at or product.erp_updated_at
        for product in products
        if product.last_source_sync_at or product.erp_updated_at
    ]
    return str(max(source_dates).year if source_dates else datetime.now(timezone.utc).year)


def _representative_product_image(
    products: list[Product],
) -> tuple[Product, ProductImage] | None:
    ranked_products = sorted(
        products,
        key=lambda product: (
            product.stock_quantity <= 0,
            _natural_key(product.sku),
            product.erp_name.casefold(),
        ),
    )
    for product in ranked_products:
        ranked_images = sorted(
            product.images,
            key=lambda image: (not image.is_primary, image.sort_order, image.created_at),
        )
        for image in ranked_images:
            try:
                if storage.resolve(image.storage_name).is_file():
                    return product, image
            except Exception:
                continue
    return None


def _copy_erp_image_to_cover(
    catalogue: Catalogue,
    brand: str,
    products: list[Product],
    actor_id,
) -> CatalogueCoverAsset | None:
    representative = _representative_product_image(products)
    if representative is None:
        return None
    product, product_image = representative
    try:
        content = storage.resolve(product_image.storage_name).read_bytes()
        with Image.open(io.BytesIO(content)) as opened:
            image_format = (opened.format or "").upper()
            width, height = opened.size
            opened.verify()
    except (OSError, ValueError, UnidentifiedImageError):
        return None

    formats = {
        "JPEG": ("image/jpeg", ".jpg"),
        "PNG": ("image/png", ".png"),
        "WEBP": ("image/webp", ".webp"),
    }
    resolved_format = formats.get(image_format)
    if not resolved_format:
        return None
    mime_type, extension = resolved_format
    checksum = hashlib.sha256(content).hexdigest()
    storage_key = (
        f"{catalogue.id}/decorative_image/"
        f"erp-{product_image.id}-{checksum[:12]}{extension}"
    )
    target = cover_storage.resolve(storage_key)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.write_bytes(content)

    original_stem = re.sub(
        r"[^A-Za-z0-9._-]+", "-", product_image.file_name.rsplit(".", 1)[0]
    ).strip("-.") or "erp-product"
    return CatalogueCoverAsset(
        catalogue_id=catalogue.id,
        asset_type="decorative_image",
        storage_key=storage_key,
        preview_storage_key=None,
        original_filename=f"{original_stem[:220]}{extension}",
        mime_type=mime_type,
        file_size=len(content),
        width=width,
        height=height,
        checksum=checksum,
        alt_text=(
            product_image.alt_text.strip()
            or f"{product.erp_name} from the {brand} ERP product collection"
        )[:255],
        position_x_percent=77,
        position_y_percent=53,
        width_percent=38,
        height_percent=62,
        opacity=1,
        rotation=0,
        z_index=5,
        uploaded_by=actor_id,
    )


def _is_unedited_default_cover(
    cover: CatalogueCoverSetting,
    catalogue: Catalogue,
    has_assets: bool,
) -> bool:
    return (
        not has_assets
        and not cover.subtitle
        and not cover.company_name
        and not cover.collection_name
        and cover.catalogue_name == catalogue.title
        and cover.cover_alt_text in {"", catalogue.title}
    )


def _ensure_erp_cover(
    db: Session,
    catalogue: Catalogue,
    brand: str,
    products: list[Product],
    category_count: int,
    actor_id,
    cover: CatalogueCoverSetting | None,
    has_assets: bool,
) -> tuple[CatalogueCoverSetting, bool]:
    auto_managed = (
        cover is None
        or cover.cover_alt_text.startswith(AUTO_COVER_ALT_PREFIX)
        or _is_unedited_default_cover(cover, catalogue, has_assets)
    )
    if cover is None:
        cover = CatalogueCoverSetting(
            catalogue_id=catalogue.id,
            catalogue_name=catalogue.title,
            created_by=actor_id,
            updated_by=actor_id,
        )
        db.add(cover)

    if auto_managed:
        background_color, overlay_color = _cover_palette(brand)
        values = {
            "cover_mode": "custom",
            "catalogue_name": f"{brand} Catalogue",
            "catalogue_year": _cover_year(products),
            "subtitle": (
                f"{len(products)} ERP products • {category_count} categories • "
                "All synchronized customer price levels"
            ),
            "company_name": "G.M.S. Corporation Co., Ltd.",
            "collection_name": f"{brand} • ERP PRODUCT COLLECTION"[:220],
            "background_color": background_color,
            "overlay_color": overlay_color,
            "overlay_opacity": 0.16,
            "background_fit": "contain",
            "show_catalogue_name": True,
            "show_catalogue_year": True,
            "show_subtitle": True,
            "show_brand_logo": True,
            "show_company_logo": False,
            "show_start_button": True,
            "title_color": "#ffffff",
            "title_font_size": 62,
            "title_alignment": "left",
            "title_position_x_percent": 8,
            "title_position_y_percent": 55,
            "title_width_percent": 58,
            "title_z_index": 20,
            "subtitle_color": "#e3f2e9",
            "subtitle_font_size": 16,
            "subtitle_position_x_percent": 8,
            "subtitle_position_y_percent": 84,
            "cover_alt_text": f"{AUTO_COVER_ALT_PREFIX}{brand}"[:255],
            "updated_by": actor_id,
        }
        for field_name, value in values.items():
            setattr(cover, field_name, value)

    image_added = False
    if auto_managed and not has_assets:
        asset = _copy_erp_image_to_cover(catalogue, brand, products, actor_id)
        if asset is not None:
            db.add(asset)
            image_added = True
    return cover, has_assets or image_added


class _LegacyCategoryParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[tuple[int, str, str]] = []
        self._row: dict[str, str] | None = None
        self._capture: str | None = None
        self._capture_tag: str | None = None
        self._buffer: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = set((values.get("class") or "").split())
        if tag == "tr" and "table-row" in classes:
            self._row = {}
        if self._row is None:
            return
        if tag == "span" and "order-badge" in classes:
            self._start_capture("order", tag)
        elif tag == "span" and "brand-tag" in classes:
            self._start_capture("brand", tag)
        elif tag == "strong" and "category" not in self._row:
            self._start_capture("category", tag)

    def _start_capture(self, name: str, tag: str) -> None:
        self._capture = name
        self._capture_tag = tag
        self._buffer = []

    def handle_data(self, data: str) -> None:
        if self._capture:
            self._buffer.append(data)

    def handle_endtag(self, tag: str) -> None:
        if self._row is not None and self._capture and tag == self._capture_tag:
            self._row[self._capture] = html.unescape("".join(self._buffer)).strip()
            self._capture = None
            self._capture_tag = None
            self._buffer = []
        if tag == "tr" and self._row is not None:
            try:
                order = int(self._row.get("order", ""))
            except ValueError:
                order = 0
            category = self._row.get("category", "").strip()
            brand = self._row.get("brand", "").strip()
            if order > 0 and category and brand:
                self.rows.append((order, brand, category))
            self._row = None


@dataclass
class LegacyCategoryOrder:
    by_brand: dict[str, dict[str, int]] = field(default_factory=dict)
    row_count: int = 0
    warnings: list[str] = field(default_factory=list)


def fetch_legacy_category_order() -> LegacyCategoryOrder:
    source_url = settings.legacy_catalogue_url.strip()
    username = settings.legacy_catalogue_username.strip()
    password = settings.legacy_catalogue_password.get_secret_value()
    result = LegacyCategoryOrder()
    if not source_url or not username or not password:
        result.warnings.append(
            "Legacy catalogue credentials are not configured; ERP ordering was used."
        )
        return result

    parsed_url = parse.urlsplit(source_url)
    endpoint = parse.urlunsplit(
        (parsed_url.scheme, parsed_url.netloc, parsed_url.path, "", "")
    )
    login_url = f"{endpoint}?{parse.urlencode({'r': 'site/login'})}"
    categories_url = f"{endpoint}?{parse.urlencode({'r': 'sale/categories'})}"
    opener = request.build_opener(request.HTTPCookieProcessor(CookieJar()))
    opener.addheaders = [("User-Agent", "GMS-Catalogue-Data-Importer/1.0")]
    login_payload = parse.urlencode(
        {
            "LoginForm[username]": username,
            "LoginForm[password]": password,
            "yt0": "Login",
        }
    ).encode("utf-8")

    try:
        opener.open(login_url, data=login_payload, timeout=30).read()
        response = opener.open(categories_url, timeout=60)
        document = response.read().decode("utf-8", errors="replace")
        if "LoginForm[username]" in document:
            raise RuntimeError("Legacy catalogue login was rejected.")
        parser = _LegacyCategoryParser()
        parser.feed(document)
        for order, brand, category in parser.rows:
            brand_rows = result.by_brand.setdefault(_match_key(brand), {})
            brand_rows.setdefault(_match_key(category), order)
        result.row_count = len(parser.rows)
        if not result.row_count:
            result.warnings.append(
                "The legacy catalogue returned no category ordering; ERP ordering was used."
            )
    except Exception as exc:  # The ERP generator must still work when the old site is down.
        result.warnings.append(
            f"Legacy ordering was unavailable ({type(exc).__name__}); ERP ordering was used."
        )
    return result


def _ensure_customer_level_audiences(
    db: Session, actor_id
) -> tuple[int, list[str]]:
    warnings: list[str] = []
    levels = list(
        db.scalars(
            select(ErpCustomerPriceLevel)
            .where(ErpCustomerPriceLevel.is_active.is_(True))
            .order_by(ErpCustomerPriceLevel.sort_order)
        )
    )
    existing = list(db.scalars(select(CatalogueAudienceType)))
    price_lists = {
        item.id: item
        for item in db.scalars(
            select(PriceList).where(
                PriceList.id.in_([level.price_list_id for level in levels])
            )
        )
    } if levels else {}
    by_price_list = {
        audience.price_list_id: audience
        for audience in existing
        if (
            audience.price_list_id is not None
            and audience.is_active
            and audience.code.casefold() != "vip_province"
        )
    }
    by_code = {audience.code.casefold(): audience for audience in existing}
    for level in levels:
        price_list = price_lists.get(level.price_list_id)
        source_label = level.source_code.strip() or level.source_name.strip()
        price_label = price_list.name.strip() if price_list else ""
        display_name = (
            f"{source_label} · {price_label}"
            if price_label and _match_key(source_label) != _match_key(price_label)
            else source_label
        )
        code = level.source_code.strip().casefold().replace(" ", "_")[:50]
        audience = by_price_list.get(level.price_list_id) or by_code.get(code)
        if (
            level.source_code.strip().casefold() == "sp2"
            or (
                price_list
                and price_list.code.strip().casefold() == "vip"
            )
        ):
            display_name = "VIP BKK"
        if audience:
            audience.display_name = display_name
            audience.price_list_id = level.price_list_id
            audience.show_prices = True
            audience.display_order = level.sort_order
            audience.is_active = True
            audience.updated_by_id = actor_id
        else:
            audience = CatalogueAudienceType(
                code=code,
                display_name=display_name,
                price_list_id=level.price_list_id,
                show_prices=True,
                display_order=level.sort_order,
                button_style_key="default",
                is_active=True,
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
            db.add(audience)
            existing.append(audience)
        by_price_list[level.price_list_id] = audience
        by_code[code] = audience
    next_display_order = max((level.sort_order for level in levels), default=0) + 1
    vip_level = next(
        (
            level
            for level in levels
            if level.source_code.strip().casefold() == "sp2"
            or (
                price_lists.get(level.price_list_id)
                and price_lists[level.price_list_id].code.casefold() == "vip"
            )
        ),
        None,
    )
    if vip_level:
        vip_province = by_code.get("vip_province")
        if vip_province:
            vip_province.display_name = "VIP Province"
            vip_province.price_list_id = vip_level.price_list_id
            vip_province.show_prices = True
            vip_province.display_order = next_display_order
            vip_province.button_style_key = "vip"
            vip_province.is_active = True
            vip_province.updated_by_id = actor_id
        else:
            vip_province = CatalogueAudienceType(
                code="vip_province",
                display_name="VIP Province",
                price_list_id=vip_level.price_list_id,
                show_prices=True,
                display_order=next_display_order,
                button_style_key="vip",
                is_active=True,
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
            db.add(vip_province)
            existing.append(vip_province)
            by_code["vip_province"] = vip_province
        next_display_order += 1
    no_price_list_ids = set(
        db.scalars(select(PriceList.id).where(PriceList.is_no_price.is_(True)))
    )
    for audience in existing:
        if audience.price_list_id in no_price_list_ids:
            audience.display_order = next_display_order
            audience.show_prices = False
            audience.updated_by_id = actor_id
    if not levels:
        warnings.append("No active ERP customer price levels were found.")
    return len(levels), warnings


def _product_category(
    product: Product, legacy_order: dict[str, int]
) -> tuple[Category | None, int, str]:
    if not product.categories:
        category_name = (product.erp_category or "Uncategorised").strip()
        return None, 1_000_000, category_name
    ranked = sorted(
        product.categories,
        key=lambda category: (
            legacy_order.get(_match_key(category.name), 1_000_000),
            category.name.casefold(),
        ),
    )
    category = ranked[0]
    return (
        category,
        legacy_order.get(_match_key(category.name), 1_000_000),
        category.name,
    )


def generate_erp_brand_catalogues(db: Session, actor_id) -> dict:
    legacy = fetch_legacy_category_order()
    customer_level_count, audience_warnings = _ensure_customer_level_audiences(
        db, actor_id
    )
    warnings = [*legacy.warnings, *audience_warnings]
    normal_price_list = db.scalar(
        select(PriceList).where(PriceList.code == "NORMAL")
    )

    products = list(
        db.scalars(
            select(Product)
            .options(
                selectinload(Product.categories),
                selectinload(Product.images),
            )
            .where(
                Product.source_system == "gms_erp",
                Product.source_record_exists.is_(True),
                Product.status == "active",
                Product.brand.is_not(None),
                Product.brand != "",
            )
        ).unique()
    )
    products_by_brand: dict[str, tuple[str, list[Product]]] = {}
    for product in products:
        brand = (product.brand or "").strip()
        if not brand:
            continue
        key = brand.casefold()
        if key not in products_by_brand:
            products_by_brand[key] = (brand, [])
        products_by_brand[key][1].append(product)

    product_ids_with_images = set(
        db.scalars(
            select(ProductImage.product_id)
            .where(ProductImage.product_id.in_([product.id for product in products]))
            .distinct()
        )
    ) if products else set()
    existing_catalogues = {
        catalogue.slug: catalogue
        for catalogue in db.scalars(
            select(Catalogue)
            .where(Catalogue.slug.like(f"{AUTO_SLUG_PREFIX}%"))
        )
    }
    existing_covers = {
        cover.catalogue_id: cover
        for cover in db.scalars(
            select(CatalogueCoverSetting)
            .join(Catalogue, Catalogue.id == CatalogueCoverSetting.catalogue_id)
            .where(Catalogue.slug.like(f"{AUTO_SLUG_PREFIX}%"))
        )
    }
    catalogue_ids_with_cover_assets = set(
        db.scalars(
            select(CatalogueCoverAsset.catalogue_id)
            .join(Catalogue, Catalogue.id == CatalogueCoverAsset.catalogue_id)
            .where(
                Catalogue.slug.like(f"{AUTO_SLUG_PREFIX}%"),
                CatalogueCoverAsset.deleted_at.is_(None),
            )
            .distinct()
        )
    )

    created = 0
    updated = 0
    total_category_settings = 0
    legacy_matched_brands = 0
    cover_count = 0
    covers_with_erp_image = 0
    for _, (brand, brand_products) in sorted(
        products_by_brand.items(), key=lambda item: item[1][0].casefold()
    ):
        base_slug = f"{AUTO_SLUG_PREFIX}{_slug(brand)}"
        catalogue = existing_catalogues.get(base_slug)
        if catalogue and _match_key(catalogue.brand) != _match_key(brand):
            digest = hashlib.sha1(brand.encode("utf-8")).hexdigest()[:8]
            base_slug = f"{base_slug}-{digest}"
            catalogue = existing_catalogues.get(base_slug)

        if catalogue is None:
            catalogue = Catalogue(
                title=f"{brand} Catalogue",
                slug=base_slug,
                description=(
                    "Automatically generated from current GMS ERP product data. "
                    "Legacy catalogue data is used only for compatible category ordering."
                ),
                brand=brand,
                audience="All customer levels",
                price_list_id=normal_price_list.id if normal_price_list else None,
                show_prices=normal_price_list is not None,
                currency="THB",
                language="en-th",
                status="draft",
                is_public=False,
                owner_id=actor_id,
                created_by_id=actor_id,
                updated_by_id=actor_id,
            )
            db.add(catalogue)
            db.flush()
            existing_catalogues[base_slug] = catalogue
            created += 1
        else:
            catalogue.title = f"{brand} Catalogue"
            catalogue.brand = brand
            catalogue.audience = "All customer levels"
            catalogue.price_list_id = normal_price_list.id if normal_price_list else None
            catalogue.show_prices = normal_price_list is not None
            catalogue.language = "en-th"
            catalogue.is_public = False
            catalogue.updated_by_id = actor_id
            catalogue.revision += 1
            if catalogue.status == "published":
                catalogue.status = "draft"
            updated += 1

        legacy_order = legacy.by_brand.get(_match_key(brand), {})
        if legacy_order:
            legacy_matched_brands += 1
        ranked_products = []
        for product in brand_products:
            category, category_rank, category_name = _product_category(
                product, legacy_order
            )
            ranked_products.append(
                (category_rank, category_name, product, category)
            )
        ranked_products.sort(
            key=lambda item: (
                item[0],
                item[1].casefold(),
                _natural_key(item[2].sku),
                item[2].erp_name.casefold(),
            )
        )

        db.execute(
            delete(CatalogueProduct).where(
                CatalogueProduct.catalogue_id == catalogue.id
            )
        )
        last_category = None
        new_links: list[dict] = []
        ordered_categories: dict[int, tuple[Category, int, str]] = {}
        for sort_order, (category_rank, category_name, product, category) in enumerate(
            ranked_products, start=1
        ):
            category_key = category.id if category else None
            section_title = category_name if category_key != last_category else ""
            last_category = category_key
            new_links.append(
                {
                    "catalogue_id": catalogue.id,
                    "product_id": product.id,
                    "section_title": section_title,
                    "override_description": "",
                    "hide_price": False,
                    "include_video": True,
                    "selected_video_id": None,
                    "video_title_override": "",
                    "video_description_override": "",
                    "video_display_mode": "product_detail",
                    "video_thumbnail_mode": "video_thumbnail",
                    "sort_order": sort_order,
                }
            )
            if category is not None:
                ordered_categories.setdefault(
                    category.id, (category, category_rank, category_name)
                )
        if new_links:
            db.execute(insert(CatalogueProduct), new_links)

        current_settings = {
            setting.category_id: setting
            for setting in db.scalars(
                select(CatalogueCategorySetting).where(
                    CatalogueCategorySetting.catalogue_id == catalogue.id
                )
            )
        }
        category_rows = sorted(
            ordered_categories.values(),
            key=lambda item: (item[1], item[2].casefold()),
        )
        active_category_ids = {category.id for category, _, _ in category_rows}
        for category_id, setting in current_settings.items():
            if category_id not in active_category_ids:
                db.delete(setting)
        for display_order, (category, _, _) in enumerate(category_rows, start=1):
            setting = current_settings.get(category.id)
            if setting is None:
                setting = CatalogueCategorySetting(
                    catalogue_id=catalogue.id,
                    category_id=category.id,
                    display_order=display_order,
                )
                db.add(setting)
            else:
                setting.display_order = display_order
        total_category_settings += len(category_rows)

        cover, has_cover_image = _ensure_erp_cover(
            db,
            catalogue,
            brand,
            brand_products,
            len(category_rows),
            actor_id,
            existing_covers.get(catalogue.id),
            catalogue.id in catalogue_ids_with_cover_assets,
        )
        existing_covers[catalogue.id] = cover
        cover_count += 1
        covers_with_erp_image += int(has_cover_image)

    total_products = sum(len(items) for _, items in products_by_brand.values())
    products_with_images = sum(
        product.id in product_ids_with_images for product in products
    )
    return {
        "created": created,
        "updated": updated,
        "brand_count": len(products_by_brand),
        "product_count": total_products,
        "products_with_images": products_with_images,
        "products_missing_images": total_products - products_with_images,
        "category_setting_count": total_category_settings,
        "customer_level_count": customer_level_count,
        "legacy_category_rows": legacy.row_count,
        "legacy_matched_brands": legacy_matched_brands,
        "cover_count": cover_count,
        "covers_with_erp_image": covers_with_erp_image,
        "covers_with_fallback_design": cover_count - covers_with_erp_image,
        "warnings": warnings,
    }
