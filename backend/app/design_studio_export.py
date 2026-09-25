"""Render Catalogue Studio JSON documents without switching templates.

The same percentage-based page document used by the browser editor is the
source of truth for PDF and raster exports. The renderer deliberately accepts
only the validated element vocabulary; it never evaluates HTML or scripts.
"""

from __future__ import annotations

import logging
import math
import uuid
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

from PIL import Image, ImageColor, ImageDraw, ImageFilter, ImageFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas as pdf_canvas
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.design_studio_models import CatalogueDesign, CatalogueDesignVersion, DesignAsset
from app.config import settings
from app.storage import cover_storage


logger = logging.getLogger(__name__)

# Studio uses rounded 96-DPI logical canvases (794 x 1123 or 1123 x 794).
# PDF media boxes must use the exact ISO A4 dimensions; converting those
# rounded pixels directly to points makes the result fractionally oversized
# and causes physical printers to apply an unwanted "fit" reduction.
NO_PRODUCT_IMAGE_PATH = Path(__file__).resolve().parent / "assets" / "no-image.png"


def _a4_pdf_page_size(width: float, height: float) -> tuple[float, float]:
    return landscape(A4) if width > height else A4


def design_snapshot(db: Session, design: CatalogueDesign, version_id: uuid.UUID | None) -> dict:
    if version_id:
        version = db.scalar(
            select(CatalogueDesignVersion).where(
                CatalogueDesignVersion.id == version_id,
                CatalogueDesignVersion.design_id == design.id,
            )
        )
        if not version:
            raise ValueError("The selected catalogue version is unavailable.")
        from app.design_studio import _snapshot_with_current_live_stock

        return _snapshot_with_current_live_stock(db, version.snapshot_json)
    # Draft/test exports still need the same resolved and permission-filtered
    # product snapshot as an immutable published version.
    from app.design_studio import _snapshot, _snapshot_with_current_live_stock

    return _snapshot_with_current_live_stock(db, _snapshot(design, db))


def _asset_paths(db: Session, snapshot: dict) -> dict[str, Path]:
    identifiers: set[uuid.UUID] = set()
    for page in snapshot.get("pages", []):
        document = page.get("pageData") or page.get("page_data_json") or {}
        for element in document.get("elements", []):
            value = element.get("assetId")
            if value:
                try:
                    identifiers.add(uuid.UUID(str(value)))
                except ValueError:
                    continue
            for image in ((element.get("carousel") or {}).get("images") or []):
                value = image.get("assetId")
                if value:
                    try:
                        identifiers.add(uuid.UUID(str(value)))
                    except ValueError:
                        continue
    if not identifiers:
        return {}
    assets = db.scalars(
        select(DesignAsset).where(
            DesignAsset.id.in_(identifiers), DesignAsset.deleted_at.is_(None)
        )
    )
    return {
        str(asset.id): cover_storage.resolve(asset.storage_key)
        for asset in assets
        if cover_storage.resolve(asset.storage_key).is_file()
    }


def _product_image_paths(snapshot: dict) -> dict[str, list[Path]]:
    root = Path(settings.upload_dir).resolve()
    output: dict[str, list[Path]] = {}
    for product_id, product in (snapshot.get("productData") or {}).items():
        names = product.get("image_storage_names") or [product.get("primary_image_storage_name")]
        paths: list[Path] = []
        for name in names:
            if not name:
                continue
            target = (root / str(name)).resolve()
            if root in target.parents and target.is_file():
                paths.append(target)
        if paths:
            output[str(product_id)] = paths
    return output


def _selected_product_image(product_images: dict[str, list[Path]], element: dict) -> Path | None:
    paths = product_images.get(str(element.get("productId") or "")) or []
    if not paths:
        return NO_PRODUCT_IMAGE_PATH if element.get("productId") and NO_PRODUCT_IMAGE_PATH.is_file() else None
    index = max(0, min(len(paths) - 1, round(_number((element.get("style") or {}).get("productImageIndex")))))
    return paths[index]


def _carousel_export_images(snapshot: dict, assets: dict[str, Path], product_images: dict[str, list[Path]], element: dict) -> list[tuple[Path, dict]]:
    """Resolve the deterministic static carousel fallback stored in the snapshot."""
    config = element.get("carousel") or {}
    resolved: list[tuple[Path, dict]] = []
    for item in sorted((row for row in (config.get("images") or []) if row.get("isActive", True)), key=lambda row: row.get("displayOrder", 0)):
        path = assets.get(str(item.get("assetId") or ""))
        if path is None and item.get("productImageId"):
            product_id = str(item.get("productId") or ((config.get("productIds") or [None])[0]) or element.get("productId") or config.get("productId") or "")
            product = (snapshot.get("productData") or {}).get(product_id) or {}
            product_ids = [str(value) for value in (product.get("image_ids") or [])]
            product_paths = product_images.get(product_id) or []
            try:
                image_index = product_ids.index(str(item["productImageId"]))
                path = product_paths[image_index] if image_index < len(product_paths) else None
            except (ValueError, IndexError):
                path = None
        if path and path.is_file():
            resolved.append((path, item))
    if not resolved:
        return []
    fallback = config.get("pdf") or {}
    mode = fallback.get("fallbackMode", "first_image")
    if mode == "selected_cover":
        selected_id = str(fallback.get("selectedImageId") or "")
        return [next((row for row in resolved if str(row[1].get("id")) == selected_id), resolved[0])]
    if mode in {"image_grid", "contact_sheet"}:
        columns = max(2, min(4, round(_number(fallback.get("gridColumns"), 2))))
        return resolved[:columns * 2]
    return [resolved[0]]


def _carousel_image_style(config: dict, image: dict) -> dict[str, Any]:
    display = config.get("display") or {}
    fit = image.get("fit") or display.get("fit") or "contain"
    return {
        "objectFit": "cover" if fit == "custom" else fit,
        "cropZoom": max(100, min(400, _number(image.get("zoom"), 1) * 100)),
        "cropX": _number(image.get("positionX"), 50),
        "cropY": _number(image.get("positionY"), 50),
    }


def _page_document(page: dict) -> dict:
    return page.get("pageData") or page.get("page_data_json") or {}


def _visible_for(element: dict, mode: str) -> bool:
    if not element.get("visible", True):
        return False
    responsive = element.get("responsive") or {}
    settings = responsive.get(mode) or {}
    return not bool(settings.get("hidden"))


def _hex(value: object, fallback: str = "#FFFFFF") -> str:
    if isinstance(value, str) and value.startswith("#"):
        normalized = value.strip()
        if len(normalized) in {4, 5}:
            normalized = "#" + "".join(character * 2 for character in normalized[1:])
        if len(normalized) not in {7, 9}:
            return fallback
        try:
            ImageColor.getrgb(normalized[:7])
            return normalized[:7]
        except ValueError:
            pass
    return fallback


def _number(value: object, fallback: float = 0) -> float:
    try:
        return float(value) if value is not None else fallback
    except (TypeError, ValueError):
        return fallback


def _table_fill(value: object, fallback: str) -> str | None:
    return None if str(value or "").casefold() == "transparent" else _hex(value, fallback)


def _is_transparent_color(value: object) -> bool:
    """Return True for CSS colors that should not create a PDF/raster fill."""
    if not isinstance(value, str):
        return False
    normalized = value.strip().lower().replace(" ", "")
    if normalized in {"", "none", "transparent"}:
        return True
    if normalized.startswith("#"):
        if len(normalized) == 5:
            return normalized[-1] == "0"
        if len(normalized) == 9:
            return normalized[-2:] == "00"
    if normalized.startswith("rgba(") and normalized.endswith(")"):
        try:
            return float(normalized[5:-1].split(",")[-1]) == 0
        except (TypeError, ValueError):
            return False
    return False


def _clamped_radius(value: object, width: float, height: float) -> float:
    """Match the browser's border-radius clamping for pills and rounded boxes."""
    return min(max(0, _number(value)), max(0, width / 2), max(0, height / 2))


def _pdf_round_rect(
    canvas,
    x: float,
    y: float,
    width: float,
    height: float,
    radius: float,
    *,
    fill: int,
    stroke: int,
) -> None:
    """Draw a browser-compatible rounded rectangle.

    ReportLab's ``roundRect`` can overshoot the box when the radius is exactly
    half its height. That is the normal CSS representation of a pill, so the
    overshoot showed up as pointed ends in exported catalogues. Building the
    path explicitly keeps every control point inside the element bounds.
    """
    radius = _clamped_radius(radius, width, height)
    if radius <= 0:
        canvas.rect(x, y, width, height, fill=fill, stroke=stroke)
        return

    # Cubic Bezier approximation of a quarter circle.
    control = radius * 0.5522847498307936
    path = canvas.beginPath()
    path.moveTo(x + radius, y)
    path.lineTo(x + width - radius, y)
    path.curveTo(
        x + width - radius + control,
        y,
        x + width,
        y + radius - control,
        x + width,
        y + radius,
    )
    path.lineTo(x + width, y + height - radius)
    path.curveTo(
        x + width,
        y + height - radius + control,
        x + width - radius + control,
        y + height,
        x + width - radius,
        y + height,
    )
    path.lineTo(x + radius, y + height)
    path.curveTo(
        x + radius - control,
        y + height,
        x,
        y + height - radius + control,
        x,
        y + height - radius,
    )
    path.lineTo(x, y + radius)
    path.curveTo(
        x,
        y + radius - control,
        x + radius - control,
        y,
        x + radius,
        y,
    )
    path.close()
    canvas.drawPath(path, fill=fill, stroke=stroke)


def _barcode_value(element: dict, snapshot: dict) -> str:
    """Resolve a barcode consistently across browser, PDF, and image exports."""
    style = element.get("style") or {}
    product = (snapshot.get("productData") or {}).get(str(element.get("productId") or "")) or {}
    candidates = (
        product.get("barcode"),
        style.get("productBarcode"),
        style.get("barcodeValue"),
        element.get("target"),
        element.get("text"),
    )
    for candidate in candidates:
        for value in str(candidate or "").replace("\r", "").split("\n"):
            value = value.strip()
            if value:
                return value
    return ""


def _element_text(element: dict, snapshot: dict, page_number: int = 1) -> str:
    """Resolve the normalized Studio binding from the immutable snapshot."""
    binding = str(element.get("binding") or "").strip()
    product_id = str(element.get("productId") or "")
    product = (snapshot.get("productData") or {}).get(product_id) or {}
    if binding.startswith("{{") and binding.endswith("}}"):
        key = binding[2:-2].strip()
        if key.startswith("product.price_list_"):
            price_list_id = key.removeprefix("product.price_list_")
            price = (product.get("prices_by_list") or {}).get(price_list_id) or {}
            if price:
                return _price_text(price.get("amount"), price.get("currency"))
            return ""
        if key.startswith("product.price_"):
            slot = key.rsplit("_", 1)[-1]
            price = (product.get("prices") or {}).get(slot) or {}
            if price:
                return _price_text(price.get("amount"), price.get("currency"))
            return ""
        if key == "product.price":
            # Studio's generic price field represents the first visible price
            # slot. Older immutable snapshots only contain the per-slot map,
            # so retain that fallback instead of exporting an empty badge.
            primary_price = (product.get("prices") or {}).get("1") or {}
            amount = product.get("price")
            currency = product.get("price_currency")
            if amount is None:
                amount = primary_price.get("amount")
                currency = primary_price.get("currency")
            return _price_text(amount, currency)
        if key.startswith("product."):
            value = product.get(key.removeprefix("product."))
            return "" if value is None else str(value)
        if key == "catalogue.title":
            return str((snapshot.get("design") or {}).get("name") or "")
        if key == "promotion.name":
            return str((snapshot.get("design") or {}).get("promotionName") or "")
        if key == "page.number":
            return str(page_number)
    # Element names are editor-only layer metadata. Never use them as visible
    # catalogue content when a text field or binding is empty.
    return str(element.get("text") or binding or "")


def _price_text(amount: object, currency: object = "THB") -> str:
    """Format a Studio price consistently for vector and raster exports."""
    if amount is None or str(amount).strip() == "":
        return ""
    try:
        formatted_amount = f"{Decimal(str(amount).replace(',', '')):,.2f}"
    except (InvalidOperation, ValueError):
        formatted_amount = str(amount).strip()
    return f"{str(currency or '').strip()} {formatted_amount}".strip()


def _product_card_prices(product: dict, style: dict) -> tuple[str, str]:
    """Resolve mapped live prices before falling back to saved card text."""
    prices_by_list = product.get("prices_by_list") or {}

    def mapped(field_name: str) -> str:
        raw_identifier = style.get(field_name)
        if raw_identifier in (None, ""):
            return ""
        price = prices_by_list.get(str(raw_identifier)) or {}
        return _price_text(price.get("amount"), price.get("currency")) if price else ""

    slot_one = (product.get("prices") or {}).get("1") or {}
    slot_two = (product.get("prices") or {}).get("2") or {}
    primary_live = mapped("primaryPriceListId") if style.get("useErpPrice") is True else ""
    secondary_live = mapped("secondaryPriceListId") if style.get("useErpPrice") is True else ""
    primary = primary_live or str(style.get("productPrice") or "") or _price_text(slot_one.get("amount"), slot_one.get("currency"))
    secondary = secondary_live or str(style.get("productSecondaryPrice") or "") or _price_text(slot_two.get("amount"), slot_two.get("currency"))
    return primary, secondary


def _table_rows(element: dict) -> list[list[str]]:
    source = str(element.get("text") if element.get("text") is not None else "Code | Barcode | Stock\n23-01178 | 8859790002006 | 1,181").replace("\r", "")
    rows = [
        [cell.strip() for cell in line.split("|")[:12]]
        for line in source.split("\n")
        if "|" in line or line.strip()
    ][:30]
    column_count = max([len(row) for row in rows], default=1)
    return [row + [""] * (column_count - len(row)) for row in rows]


def _font(size: int, bold: bool = False, family: str = "Tahoma", italic: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    windows_fonts = {
        "arial": {(False, False): "arial.ttf", (True, False): "arialbd.ttf", (False, True): "ariali.ttf", (True, True): "arialbi.ttf"},
        "tahoma": {(False, False): "tahoma.ttf", (True, False): "tahomabd.ttf", (False, True): "tahomai.ttf", (True, True): "tahomabi.ttf"},
        "georgia": {(False, False): "georgia.ttf", (True, False): "georgiab.ttf", (False, True): "georgiai.ttf", (True, True): "georgiaz.ttf"},
        "verdana": {(False, False): "verdana.ttf", (True, False): "verdanab.ttf", (False, True): "verdanai.ttf", (True, True): "verdanaz.ttf"},
    }
    normalized_family = family.casefold() if family else "tahoma"
    requested = windows_fonts.get(normalized_family, windows_fonts["tahoma"])[(bold, italic)]
    arial_fallback = windows_fonts["arial"][(bold, italic)]
    candidates = [
        Path("C:/Windows/Fonts") / requested,
        Path("C:/Windows/Fonts") / arial_fallback,
        Path("/usr/share/fonts/truetype/noto/NotoSansThai-Bold.ttf" if bold else "/usr/share/fonts/truetype/noto/NotoSansThai-Regular.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf" if bold and italic else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf" if italic else "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for path in candidates:
        if path.is_file():
            return ImageFont.truetype(str(path), max(8, size))
    return ImageFont.load_default()


def _pdf_font(family: object, *, bold: bool = False, italic: bool = False) -> str:
    base = "Times" if str(family or "").casefold() == "georgia" else "Helvetica"
    if base == "Times":
        return "Times-BoldItalic" if bold and italic else "Times-Bold" if bold else "Times-Italic" if italic else "Times-Roman"
    return "Helvetica-BoldOblique" if bold and italic else "Helvetica-Bold" if bold else "Helvetica-Oblique" if italic else "Helvetica"


def _draw_wrapped_pdf(canvas, text: str, width: float, height: float, size: float, color: str, align: str, family: object = "Arial", bold: bool = False, italic: bool = False) -> None:
    from reportlab.pdfbase.pdfmetrics import stringWidth

    font_name = _pdf_font(family, bold=bold, italic=italic)
    words = str(text or "").replace("\r", "").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font_name, size) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    canvas.setFont(font_name, max(6, size))
    canvas.setFillColor(HexColor(color))
    line_height = size * 1.25
    baseline = -line_height
    for line in lines[: max(1, math.floor(height / line_height))]:
        if align == "center":
            canvas.drawCentredString(width / 2, baseline, line)
        elif align == "right":
            canvas.drawRightString(width, baseline, line)
        else:
            canvas.drawString(0, baseline, line)
        baseline -= line_height


def _image_crop_value(style: dict[str, Any], key: str, default: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, _number(style.get(key), default)))


def _pdf_draw_image(canvas, path: Path, x: float, y: float, width: float, height: float, style: dict[str, Any]) -> None:
    mode = str(style.get("objectFit") or "contain")
    with Image.open(path) as source:
        source_width, source_height = source.size
    if mode == "fill":
        draw_width, draw_height = width, height
    elif mode == "original":
        draw_width, draw_height = float(source_width), float(source_height)
    else:
        scale = max(width / source_width, height / source_height) if mode == "cover" else min(width / source_width, height / source_height)
        draw_width, draw_height = source_width * scale, source_height * scale
    zoom = _image_crop_value(style, "cropZoom", 100, 100, 400) / 100
    crop_x = _image_crop_value(style, "cropX", 50, 0, 100) / 100
    crop_y = _image_crop_value(style, "cropY", 50, 0, 100) / 100
    draw_width *= zoom
    draw_height *= zoom
    draw_x = (width - draw_width) * crop_x
    # ReportLab coordinates start at the bottom, while cropY starts at the top.
    draw_y = (height - draw_height) * (1 - crop_y)
    canvas.saveState()
    clip = canvas.beginPath(); clip.rect(x, y, width, height); canvas.clipPath(clip, stroke=0, fill=0)
    canvas.translate(x + draw_x + draw_width / 2, y + draw_y + draw_height / 2)
    canvas.rotate(-_number(style.get("imageRotation")))
    canvas.scale(-1 if style.get("flipX") is True else 1, -1 if style.get("flipY") is True else 1)
    canvas.drawImage(str(path), -draw_width / 2, -draw_height / 2, draw_width, draw_height, preserveAspectRatio=False, mask="auto")
    canvas.restoreState()


def _fit_raster_asset(asset: Image.Image, width: int, height: int, fit: object) -> Image.Image:
    mode = str(fit or "contain")
    if mode == "fill":
        return asset.resize((width, height), Image.Resampling.LANCZOS)
    if mode == "original":
        return asset
    if mode == "cover":
        scale = max(width / asset.width, height / asset.height)
        resized = asset.resize((max(1, round(asset.width * scale)), max(1, round(asset.height * scale))), Image.Resampling.LANCZOS)
        left = max(0, (resized.width - width) // 2); top = max(0, (resized.height - height) // 2)
        return resized.crop((left, top, left + width, top + height))
    asset.thumbnail((width, height), Image.Resampling.LANCZOS)
    return asset


def _crop_raster_asset(asset: Image.Image, width: int, height: int, style: dict[str, Any]) -> Image.Image:
    mode = str(style.get("objectFit") or "contain")
    if mode == "fill":
        draw_width, draw_height = width, height
    elif mode == "original":
        draw_width, draw_height = asset.width, asset.height
    else:
        scale = max(width / asset.width, height / asset.height) if mode == "cover" else min(width / asset.width, height / asset.height)
        draw_width, draw_height = max(1, round(asset.width * scale)), max(1, round(asset.height * scale))
    zoom = _image_crop_value(style, "cropZoom", 100, 100, 400) / 100
    draw_width, draw_height = max(1, round(draw_width * zoom)), max(1, round(draw_height * zoom))
    prepared = asset.resize((draw_width, draw_height), Image.Resampling.LANCZOS)
    if style.get("flipX") is True:
        prepared = prepared.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    if style.get("flipY") is True:
        prepared = prepared.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    rotation = _number(style.get("imageRotation")) % 360
    if rotation:
        prepared = prepared.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=True)
    crop_x = _image_crop_value(style, "cropX", 50, 0, 100) / 100
    crop_y = _image_crop_value(style, "cropY", 50, 0, 100) / 100
    image_center_x = (width - draw_width) * crop_x + draw_width / 2
    image_center_y = (height - draw_height) * crop_y + draw_height / 2
    left = round(image_center_x - prepared.width / 2)
    top = round(image_center_y - prepared.height / 2)
    frame = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    frame.alpha_composite(prepared, (left, top))
    return frame


def _apply_raster_shadow(tile: Image.Image, style: dict[str, Any]) -> tuple[Image.Image, int, int]:
    """Place a configurable, non-destructive shadow behind a rendered element."""
    blur = max(0, _number(style.get("shadowBlur")))
    if not blur:
        return tile, 0, 0
    offset_x = round(_number(style.get("shadowOffsetX"), 0))
    offset_y = round(_number(style.get("shadowOffsetY"), 3))
    opacity = max(0, min(1, _number(style.get("shadowOpacity"), 22) / 100))
    padding = max(1, math.ceil(blur * 2 + max(abs(offset_x), abs(offset_y))))
    size = (tile.width + padding * 2, tile.height + padding * 2)
    alpha = Image.new("L", size, 0)
    alpha.paste(tile.getchannel("A"), (padding + offset_x, padding + offset_y))
    alpha = alpha.filter(ImageFilter.GaussianBlur(radius=blur))
    if opacity < 1:
        alpha = alpha.point(lambda value: round(value * opacity))
    shadow_color = ImageColor.getrgb(_hex(style.get("shadowColor"), "#0B3E25"))
    shadow = Image.new("RGBA", size, shadow_color + (0,))
    shadow.putalpha(alpha)
    shadow.alpha_composite(tile, (padding, padding))
    return shadow, padding, padding


def render_pdf(db: Session, snapshot: dict, output_path: Path, options: dict[str, Any]) -> None:
    pages = [page for page in snapshot.get("pages", []) if page.get("isVisible", True)]
    if not pages:
        raise ValueError("The catalogue has no visible pages.")
    assets = _asset_paths(db, snapshot)
    product_images = _product_image_paths(snapshot)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    first = pages[0]
    first_page_size = _a4_pdf_page_size(float(first["width"]), float(first["height"]))
    canvas = pdf_canvas.Canvas(
        str(output_path),
        pagesize=first_page_size,
        pageCompression=1,
    )
    for page_number, page in enumerate(pages, start=1):
        width, height = float(page["width"]), float(page["height"])
        page_width_points, page_height_points = _a4_pdf_page_size(width, height)
        canvas.setPageSize((page_width_points, page_height_points))
        canvas.scale(page_width_points / width, page_height_points / height)
        document = _page_document(page)
        background = _hex((document.get("canvas") or {}).get("backgroundColor"), "#FFFFFF")
        canvas.setFillColor(HexColor(background)); canvas.rect(0, 0, width, height, fill=1, stroke=0)
        elements = sorted(document.get("elements", []), key=lambda item: item.get("zIndex", 0))
        for element in elements:
            if not _visible_for(element, "pdf"):
                continue
            product_id = str(element.get("productId") or (element.get("carousel") or {}).get("productId") or "")
            if product_id and product_id not in (snapshot.get("productData") or {}):
                continue
            x = float(element.get("xPercent", 0)) * width / 100
            y_top = float(element.get("yPercent", 0)) * height / 100
            item_width = max(1.0, float(element.get("widthPercent", 1)) * width / 100)
            item_height = max(1.0, float(element.get("heightPercent", 1)) * height / 100)
            style = element.get("style") or {}
            element_type = element.get("type", "shape")
            if element_type == "image_carousel":
                display = (element.get("carousel") or {}).get("display") or {}
                style = {**style, "backgroundColor": display.get("backgroundColor", style.get("backgroundColor", "#FFFFFF")), "borderRadius": display.get("borderRadius", style.get("borderRadius", 8))}
            style_bold = style.get("fontWeight") == "bold"
            style_italic = style.get("fontStyle") == "italic"
            canvas.saveState()
            canvas.translate(x, height - y_top)
            canvas.rotate(-float(element.get("rotation", 0)))
            canvas.setFillAlpha(float(element.get("opacity", 1)))
            background_value = style.get("backgroundColor")
            transparent_fill = _is_transparent_color(background_value) or (element_type == "text" and background_value is None)
            fill = _hex(background_value, "#FFFFFF")
            radius = _clamped_radius(style.get("borderRadius"), item_width, item_height)
            border_width = max(0, _number(style.get("borderWidth")))
            has_decoration = element_type != "line" and (element_type != "text" or not transparent_fill or border_width > 0 or _number(style.get("shadowBlur")) > 0)
            if has_decoration:
                shadow = max(0, _number(style.get("shadowBlur")))
                if shadow:
                    shadow_x = _number(style.get("shadowOffsetX"), 0)
                    shadow_y = _number(style.get("shadowOffsetY"), 3)
                    shadow_opacity = max(0, min(1, _number(style.get("shadowOpacity"), 22) / 100))
                    shadow_steps = max(1, min(6, round(shadow / 5)))
                    canvas.saveState()
                    canvas.setFillColor(HexColor(_hex(style.get("shadowColor"), "#0B3E25")))
                    for step in range(shadow_steps, 0, -1):
                        spread = shadow * .32 * step / shadow_steps
                        canvas.setFillAlpha(shadow_opacity * float(element.get("opacity", 1)) / shadow_steps)
                        _pdf_round_rect(
                            canvas,
                            shadow_x - spread,
                            -item_height - shadow_y - spread,
                            item_width + spread * 2,
                            item_height + spread * 2,
                            radius + spread,
                            fill=1,
                            stroke=0,
                        )
                    canvas.restoreState()
                canvas.setFillColor(HexColor(fill)); canvas.setStrokeColor(HexColor(_hex(style.get("borderColor"), "#BDD0C4"))); canvas.setLineWidth(border_width)
                _pdf_round_rect(canvas, 0, -item_height, item_width, item_height, radius, fill=0 if transparent_fill else 1, stroke=1 if border_width else 0)
            if element_type == "line":
                thickness = max(1, _number(style.get("lineThickness"), 4))
                line_style = str(style.get("lineStyle") or "solid")
                canvas.setStrokeColor(HexColor(_hex(style.get("lineColor") or style.get("color"), "#126B3A")))
                canvas.setLineWidth(thickness)
                if line_style == "dashed":
                    canvas.setDash(thickness * 3, thickness * 2)
                elif line_style == "dotted":
                    canvas.setDash(thickness, thickness * 1.5)
                else:
                    canvas.setDash()
                canvas.line(0, -item_height / 2, item_width, -item_height / 2)
                canvas.setDash()
            asset_path = assets.get(str(element.get("assetId") or "")) or _selected_product_image(product_images, element)
            if element_type == "image_carousel":
                config = element.get("carousel") or {}
                items = _carousel_export_images(snapshot, assets, product_images, element)
                if items:
                    columns = max(1, min(len(items), round(_number((config.get("pdf") or {}).get("gridColumns"), 2)))) if len(items) > 1 else 1
                    rows = math.ceil(len(items) / columns)
                    gap = 6 if len(items) > 1 else 0
                    padding = max(0, _number((config.get("display") or {}).get("padding"), 0))
                    cell_width = max(1, (item_width - padding * 2 - gap * (columns - 1)) / columns)
                    cell_height = max(1, (item_height - padding * 2 - gap * (rows - 1)) / rows)
                    for index, (path, carousel_image) in enumerate(items):
                        column, row = index % columns, index // columns
                        image_x = padding + column * (cell_width + gap)
                        image_y = -padding - (row + 1) * cell_height - row * gap
                        try:
                            _pdf_draw_image(canvas, path, image_x, image_y, cell_width, cell_height, _carousel_image_style(config, carousel_image))
                        except Exception:
                            logger.warning("Could not render carousel image %s", path)
            elif element_type in {"image", "logo", "background"} and asset_path:
                try:
                    _pdf_draw_image(canvas, asset_path, 0, -item_height, item_width, item_height, style)
                except Exception:
                    logger.warning("Could not render design asset %s", asset_path)
            elif element_type == "table":
                rows = _table_rows(element)
                if rows:
                    row_height = item_height / len(rows)
                    column_width = item_width / len(rows[0])
                    use_header = style.get("tableHeader", True) is not False
                    padding = max(2, _number(style.get("tableCellPadding"), 8))
                    font_size = max(6, min(_number(style.get("fontSize"), 16), row_height * .34))
                    border_width = 0 if style.get("tableShowBorders") is False else max(0, _number(style.get("tableBorderWidth"), 1))
                    canvas.setLineWidth(border_width)
                    for row_index, row in enumerate(rows):
                        header = use_header and row_index == 0
                        body_index = -1 if header else row_index - (1 if use_header else 0)
                        alternate = style.get("tableStriped", True) is not False and body_index % 2 == 1
                        fill_color = _table_fill(style.get("tableHeaderColor"), "#126B3A") if header else _table_fill(style.get("tableAlternateColor"), "#F2F8F4") if alternate else _table_fill(style.get("tableCellColor"), "#FFFFFF")
                        cell_y = -(row_index + 1) * row_height
                        for column_index, value in enumerate(row):
                            stock_column = str(rows[0][column_index]).strip().casefold() == "stock"
                            text_color = _hex(style.get("tableHeaderTextColor"), "#FFFFFF") if header else _hex(style.get("tableStockColor"), "#16884C") if stock_column else _hex(style.get("color"), "#17251F")
                            cell_x = column_index * column_width
                            if fill_color: canvas.setFillColor(HexColor(fill_color))
                            canvas.setStrokeColor(HexColor(_hex(style.get("tableGridColor"), "#B9CCC0")))
                            canvas.rect(cell_x, cell_y, column_width, row_height, fill=1 if fill_color else 0, stroke=1 if border_width else 0)
                            line_height = font_size * 1.25
                            vertical = str(style.get("tableVerticalAlign") or "middle")
                            text_top = cell_y + row_height - padding if vertical == "top" else cell_y + padding + line_height if vertical == "bottom" else cell_y + (row_height + line_height) / 2
                            canvas.saveState(); canvas.translate(cell_x + padding, text_top)
                            _draw_wrapped_pdf(canvas, value, max(1, column_width - padding * 2), max(1, row_height - padding * 2), font_size, text_color, str(style.get("textAlign") or "left"), style.get("fontFamily"), header or style_bold, style_italic)
                            canvas.restoreState()
            elif element_type == "product_card":
                product = (snapshot.get("productData") or {}).get(str(element.get("productId") or "")) or {}
                name = str(style.get("productName") or product.get("name_en") or "Product")
                price, secondary_price = _product_card_prices(product, style)
                layout = str(style.get("cardLayout") or "classic")
                if layout == "erp_detail":
                    accent = _hex(style.get("detailAccentColor"), "#F9A83B")
                    padding = max(4, _number(style.get("cardPadding"), 8))
                    header_height = max(22, item_height * .12)
                    canvas.setFillColor(HexColor(accent))
                    _pdf_round_rect(canvas, padding, -padding - header_height, item_width - padding * 2, header_height, 6, fill=1, stroke=0)
                    canvas.saveState(); canvas.translate(padding + 8, -padding - header_height * .22); _draw_wrapped_pdf(canvas, name, item_width - padding * 2 - 16, header_height * .8, max(8, min(18, item_height * .045)), "#FFFFFF", "center", style.get("fontFamily"), True, style_italic); canvas.restoreState()
                    image_x, image_y = padding + 4, -item_height * .73
                    image_width, image_height = item_width * .34, item_height * .47
                    if asset_path and style.get("showProductImage", True) is not False:
                        try:
                            _pdf_draw_image(canvas, asset_path, image_x, image_y, image_width, image_height, style)
                        except Exception:
                            logger.warning("Could not render product image %s", asset_path)
                    size_text = " ".join(value for value in [str(style.get("productPackSize") or ""), str(style.get("productUnit") or "")] if value)
                    canvas.setFillColor(HexColor("#17251F")); canvas.setFont(_pdf_font(style.get("fontFamily")), max(7, min(13, item_height * .03)))
                    if size_text: canvas.drawCentredString(image_x + image_width / 2, -item_height * .20, size_text)
                    canvas.setFont(_pdf_font(style.get("fontFamily"), bold=True), max(7, min(13, item_height * .03))); canvas.drawCentredString(image_x + image_width / 2, -item_height * .78, str(style.get("productSku") or product.get("sku") or ""))
                    table_x, table_top, table_width, table_height = item_width * .41, -item_height * .21, item_width * .55, item_height * .19
                    canvas.setStrokeColor(HexColor("#C9D3CD")); canvas.setLineWidth(.7); canvas.rect(table_x, table_top - table_height, table_width, table_height, fill=0, stroke=1)
                    canvas.line(table_x, table_top - table_height / 2, table_x + table_width, table_top - table_height / 2)
                    for ratio in (.33, .72): canvas.line(table_x + table_width * ratio, table_top, table_x + table_width * ratio, table_top - table_height)
                    columns = [("CODE", str(style.get("productSku") or product.get("sku") or "—"), .165), ("BARCODE", str(style.get("productBarcode") or product.get("barcode") or "—"), .525), ("STOCK", str(style.get("productStock") if style.get("productStock") is not None else product.get("stock_on_hand", "—")), .86)]
                    canvas.setFont(_pdf_font(style.get("fontFamily"), bold=True), max(6, min(10, item_height * .022)))
                    for heading, value, ratio in columns:
                        canvas.setFillColor(HexColor("#16884C" if heading == "STOCK" else "#263B30")); canvas.drawCentredString(table_x + table_width * ratio, table_top - table_height * .35, heading)
                        canvas.setFont(_pdf_font(style.get("fontFamily")), max(6, min(10, item_height * .022))); canvas.drawCentredString(table_x + table_width * ratio, table_top - table_height * .83, value); canvas.setFont(_pdf_font(style.get("fontFamily"), bold=True), max(6, min(10, item_height * .022)))
                    description = str(style.get("productDescription") or product.get("description") or style.get("productRemark") or "")
                    if description and style.get("showProductDescription"):
                        canvas.saveState(); canvas.translate(padding + 5, -item_height * .84); _draw_wrapped_pdf(canvas, description, item_width * .54, item_height * .1, max(6, min(9, item_height * .021)), _hex(style.get("productMetaColor"), "#60746A"), "left", style.get("fontFamily")); canvas.restoreState()
                    if price and style.get("showProductPrice", True) is not False and style.get("priceMode") != "no_price":
                        price_x, price_y, price_width, price_height = item_width * .65, -item_height * .94, item_width * .31, max(20, item_height * .09)
                        canvas.setFillColor(HexColor(accent)); _pdf_round_rect(canvas, price_x, price_y, price_width, price_height, price_height / 2, fill=1, stroke=0)
                        canvas.setFillColor(HexColor("#FFFFFF")); canvas.setFont(_pdf_font(style.get("fontFamily"), bold=True), max(7, min(12, item_height * .026))); canvas.drawCentredString(price_x + price_width / 2, price_y + price_height * .34, price)
                    canvas.restoreState()
                    continue
                show_image = style.get("showProductImage", True) is not False and layout != "minimal"
                show_name = style.get("showProductName", True) is not False and layout != "image_only"
                show_price = style.get("showProductPrice", True) is not False and style.get("priceMode") != "no_price" and layout != "image_only"
                padding = max(0, _number(style.get("cardPadding"), 8))
                requested_image_ratio = _number(style.get("productImageHeight"), 52) / 100
                image_ratio = max(.2, min(.48 if show_name else .9, requested_image_ratio))
                text_scale = max(.5, min(1.5, _number(style.get("productTextScale"), 85) / 100))
                meta_size = _number(style.get("productMetaSize"), 16) * text_scale
                name_size = _number(style.get("productNameSize"), max(10, item_width * .06)) * text_scale
                price_size = _number(style.get("productPriceSize"), max(9, item_width * .055)) * text_scale
                content_x = item_width * .49 if layout == "image_left" else padding
                content_width = item_width * .47 - padding if layout == "image_left" else item_width - padding * 2
                if asset_path and show_image:
                    try:
                        image_x = padding
                        image_y = -item_height + padding if layout == "image_left" else -item_height * image_ratio
                        image_width = item_width * .46 - padding * 1.5 if layout == "image_left" else item_width - padding * 2
                        image_height = item_height - padding * 2 if layout == "image_left" else item_height * image_ratio - padding
                        _pdf_draw_image(canvas, asset_path, image_x, image_y, image_width, image_height, style)
                    except Exception:
                        logger.warning("Could not render product image %s", asset_path)
                # Image-top cards use two non-overlapping tracks, matching the
                # editor/browser renderer. Text starts below the image instead
                # of at the card's top edge.
                content_top = padding if layout == "image_left" or not show_image else item_height * image_ratio + padding
                meta_y = -content_top - meta_size
                if style.get("showProductCategory") and layout != "image_only":
                    canvas.setFillColor(HexColor(_hex(style.get("productMetaColor"), "#60746A"))); canvas.setFont("Helvetica-Bold", meta_size); canvas.drawString(content_x, meta_y, str(style.get("productCategory") or product.get("category_name") or "")); meta_y -= meta_size * 1.35
                if style.get("showProductBrand") and layout != "image_only":
                    canvas.setFillColor(HexColor(_hex(style.get("productMetaColor"), "#60746A"))); canvas.setFont("Helvetica", meta_size); canvas.drawString(content_x, meta_y, str(style.get("productBrand") or product.get("brand_name") or "")); meta_y -= meta_size * 1.35
                if style.get("showProductSku", True) is not False and layout != "image_only":
                    canvas.setFillColor(HexColor(_hex(style.get("productMetaColor"), "#60746A"))); canvas.setFont("Helvetica", meta_size); canvas.drawString(content_x, meta_y, str(style.get("productSku") or product.get("sku") or "")); meta_y -= meta_size * 1.35
                if show_name:
                    reserved_price_top = -item_height + padding + price_size * 2.7
                    name_height = max(name_size * 1.2, meta_y - reserved_price_top)
                    canvas.saveState(); canvas.translate(content_x, meta_y); _draw_wrapped_pdf(canvas, name, content_width, name_height, name_size, _hex(style.get("productNameColor"), "#173C29"), "left", style.get("fontFamily"), True, style_italic); canvas.restoreState()
                if style.get("showProductDescription") and layout != "image_only":
                    description = str(style.get("productDescription") or product.get("description") or "")
                    if description:
                        canvas.saveState(); canvas.translate(content_x, meta_y - _number(style.get("productNameSize"), 24) * 1.7); _draw_wrapped_pdf(canvas, description, content_width, item_height * .16, max(7, _number(style.get("productMetaSize"), 16) * .75), _hex(style.get("productMetaColor"), "#60746A"), "left", style.get("fontFamily"), style_bold, style_italic); canvas.restoreState()
                facts = []
                if style.get("showProductBarcode", True) is not False and layout != "image_only": facts.append(f"Barcode {style.get('productBarcode') or product.get('barcode') or ''}")
                if style.get("showProductStock", True) is not False and layout != "image_only": facts.append(f"Stock {style.get('productStock') if style.get('productStock') is not None else product.get('stock_on_hand', '')}")
                facts = [value for value in facts if value.split(" ", 1)[-1]]
                if facts:
                    canvas.setFillColor(HexColor(_hex(style.get("productMetaColor"), "#60746A"))); canvas.setFont("Helvetica", max(7, meta_size * .72)); canvas.drawString(content_x, -item_height + padding + price_size * 2, "  •  ".join(facts))
                if price and show_price:
                    canvas.setFillColor(HexColor(_hex(style.get("productPriceColor"), "#0E7A43"))); canvas.setFont("Helvetica-Bold", price_size); canvas.drawString(content_x, -item_height + padding + price_size, price)
                if secondary_price and show_price and style.get("showSecondaryPrice") is True:
                    canvas.setFillColor(HexColor(_hex(style.get("secondaryPriceColor"), "#B42318"))); canvas.setFont("Helvetica-Bold", _number(style.get("secondaryPriceSize"), max(8, item_width * .045))); canvas.drawString(content_x, -item_height + padding + _number(style.get("productPriceSize"), 24) * 2.1, secondary_price)
            elif element_type in {"text", "button", "product_field", "category_field", "page_number"}:
                text = _element_text(element, snapshot, page_number)
                if element_type == "button" and element.get("target"):
                    text = f"{text}: {element['target']}"
                _draw_wrapped_pdf(canvas, str(text), item_width, item_height, _number(style.get("fontSize"), 24), _hex(style.get("color"), "#17251F"), str(style.get("textAlign") or "left"), style.get("fontFamily"), element_type == "button" or style_bold, style_italic)
            elif element_type == "barcode":
                from reportlab.graphics.barcode import code128

                value = _barcode_value(element, snapshot)
                if value:
                    barcode = code128.Code128(value, barWidth=1, barHeight=50, humanReadable=True)
                    scale = min(item_width * .9 / max(1, barcode.width), item_height * .9 / max(1, barcode.height))
                    canvas.saveState()
                    # ReportLab's barcode widget inherits the current fill
                    # colour. The element background is drawn immediately
                    # before this branch, so without resetting it the bars are
                    # white on white and appear to have disappeared.
                    barcode_color = HexColor(_hex(style.get("color"), "#111111"))
                    canvas.setFillColor(barcode_color)
                    canvas.setStrokeColor(barcode_color)
                    canvas.translate((item_width - barcode.width * scale) / 2, -item_height + (item_height - barcode.height * scale) / 2)
                    canvas.scale(scale, scale)
                    barcode.drawOn(canvas, 0, 0)
                    canvas.restoreState()
            elif element_type == "qr_code":
                from reportlab.graphics import renderPDF
                from reportlab.graphics.barcode.qr import QrCodeWidget
                from reportlab.graphics.shapes import Drawing

                value = str(element.get("target") or "")
                if value:
                    show_label = style.get("qrShowLabel") is True and bool(str(style.get("qrLabel") or "").strip())
                    label_height = max(14, item_height * .14) if show_label else 0
                    qr_size = max(1, min(item_width, item_height - label_height))
                    qr_x = (item_width - qr_size) / 2
                    qr_y = -qr_size
                    canvas.setFillColor(HexColor(_hex(style.get("qrBackground"), "#FFFFFF")))
                    canvas.rect(qr_x, qr_y, qr_size, qr_size, stroke=0, fill=1)
                    qr = QrCodeWidget(value)
                    qr.barWidth = qr_size
                    qr.barHeight = qr_size
                    qr.barFillColor = HexColor(_hex(style.get("qrForeground"), "#111111"))
                    drawing = Drawing(qr_size, qr_size)
                    drawing.add(qr)
                    renderPDF.draw(drawing, canvas, qr_x, qr_y)
                    if show_label:
                        label = str(style.get("qrLabel") or "")
                        canvas.setFillColor(HexColor(_hex(style.get("color"), "#17251F")))
                        canvas.setFont("Helvetica-Bold", max(7, min(_number(style.get("fontSize"), 16), label_height * .52)))
                        canvas.drawCentredString(item_width / 2, -item_height + max(3, label_height * .22), label)
            canvas.restoreState()
        canvas.showPage()
    canvas.save()


def _raster_page(db: Session, page: dict, assets: dict[str, Path], snapshot: dict, transparent: bool = False, page_number: int = 1) -> Image.Image:
    width, height = int(page["width"]), int(page["height"])
    document = _page_document(page)
    background = _hex((document.get("canvas") or {}).get("backgroundColor"), "#FFFFFF")
    image = Image.new("RGBA", (width, height), (0, 0, 0, 0) if transparent else ImageColor.getrgb(background) + (255,))
    product_images = _product_image_paths(snapshot)
    for element in sorted(document.get("elements", []), key=lambda item: item.get("zIndex", 0)):
        if not _visible_for(element, "print"):
            continue
        product_id = str(element.get("productId") or (element.get("carousel") or {}).get("productId") or "")
        if product_id and product_id not in (snapshot.get("productData") or {}):
            continue
        x = round(float(element.get("xPercent", 0)) * width / 100)
        y = round(float(element.get("yPercent", 0)) * height / 100)
        item_width = max(1, round(float(element.get("widthPercent", 1)) * width / 100))
        item_height = max(1, round(float(element.get("heightPercent", 1)) * height / 100))
        tile = Image.new("RGBA", (item_width, item_height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(tile)
        style = element.get("style") or {}
        element_type = element.get("type", "shape")
        if element_type == "image_carousel":
            display = (element.get("carousel") or {}).get("display") or {}
            style = {**style, "backgroundColor": display.get("backgroundColor", style.get("backgroundColor", "#FFFFFF")), "borderRadius": display.get("borderRadius", style.get("borderRadius", 8))}
        style_bold = style.get("fontWeight") == "bold"
        style_italic = style.get("fontStyle") == "italic"
        background_value = style.get("backgroundColor")
        transparent_fill = _is_transparent_color(background_value) or (element_type == "text" and background_value is None)
        radius = round(_clamped_radius(style.get("borderRadius"), item_width, item_height))
        has_decoration = element_type != "line" and (element_type != "text" or not transparent_fill or _number(style.get("borderWidth")) > 0 or _number(style.get("shadowBlur")) > 0)
        if has_decoration:
            border_width = max(0, round(_number(style.get("borderWidth"))))
            draw.rounded_rectangle(
                (0, 0, item_width - 1, item_height - 1),
                radius=radius,
                fill=None if transparent_fill else _hex(background_value, "#FFFFFF"),
                outline=_hex(style.get("borderColor"), "#BDD0C4") if border_width else None,
                width=border_width,
            )
        if element_type == "line":
            thickness = max(1, round(_number(style.get("lineThickness"), 4)))
            line_style = str(style.get("lineStyle") or "solid")
            color = _hex(style.get("lineColor") or style.get("color"), "#126B3A")
            center_y = item_height // 2
            if line_style == "solid":
                draw.line((0, center_y, item_width, center_y), fill=color, width=thickness)
            else:
                segment = max(1, thickness * (3 if line_style == "dashed" else 1))
                gap = max(1, thickness * (2 if line_style == "dashed" else 2))
                cursor = 0
                while cursor < item_width:
                    draw.line((cursor, center_y, min(item_width, cursor + segment), center_y), fill=color, width=thickness)
                    cursor += segment + gap
        asset_path = assets.get(str(element.get("assetId") or "")) or _selected_product_image(product_images, element)
        if element_type == "image_carousel":
            config = element.get("carousel") or {}
            items = _carousel_export_images(snapshot, assets, product_images, element)
            if items:
                columns = max(1, min(len(items), round(_number((config.get("pdf") or {}).get("gridColumns"), 2)))) if len(items) > 1 else 1
                rows = math.ceil(len(items) / columns)
                gap = 6 if len(items) > 1 else 0
                padding = max(0, round(_number((config.get("display") or {}).get("padding"), 0)))
                cell_width = max(1, round((item_width - padding * 2 - gap * (columns - 1)) / columns))
                cell_height = max(1, round((item_height - padding * 2 - gap * (rows - 1)) / rows))
                for index, (path, carousel_image) in enumerate(items):
                    column, row = index % columns, index // columns
                    try:
                        asset = Image.open(path).convert("RGBA")
                        fitted = _crop_raster_asset(asset, cell_width, cell_height, _carousel_image_style(config, carousel_image))
                        left = padding + column * (cell_width + gap)
                        top = padding + row * (cell_height + gap)
                        tile.alpha_composite(fitted, (left, top))
                    except Exception:
                        logger.warning("Could not render carousel image %s", path)
        elif element_type in {"image", "logo", "background"} and asset_path:
            try:
                asset = Image.open(asset_path).convert("RGBA")
                asset = _crop_raster_asset(asset, item_width, item_height, style)
                tile.alpha_composite(asset, (0, 0))
            except Exception:
                logger.warning("Could not render design asset %s", asset_path)
        text = ""
        if element_type == "table":
            rows = _table_rows(element)
            if rows:
                row_height = item_height / len(rows)
                column_width = item_width / len(rows[0])
                use_header = style.get("tableHeader", True) is not False
                padding = max(2, round(_number(style.get("tableCellPadding"), 8)))
                font_size = max(8, min(round(_number(style.get("fontSize"), 16)), round(row_height * .34)))
                border_width = 0 if style.get("tableShowBorders") is False else max(0, round(_number(style.get("tableBorderWidth"), 1)))
                for row_index, row in enumerate(rows):
                    header = use_header and row_index == 0
                    body_index = -1 if header else row_index - (1 if use_header else 0)
                    alternate = style.get("tableStriped", True) is not False and body_index % 2 == 1
                    fill_color = _table_fill(style.get("tableHeaderColor"), "#126B3A") if header else _table_fill(style.get("tableAlternateColor"), "#F2F8F4") if alternate else _table_fill(style.get("tableCellColor"), "#FFFFFF")
                    font = _font(font_size, header or style_bold, str(style.get("fontFamily") or "Tahoma"), style_italic)
                    for column_index, value in enumerate(row):
                        stock_column = str(rows[0][column_index]).strip().casefold() == "stock"
                        text_color = _hex(style.get("tableHeaderTextColor"), "#FFFFFF") if header else _hex(style.get("tableStockColor"), "#16884C") if stock_column else _hex(style.get("color"), "#17251F")
                        left = round(column_index * column_width); top = round(row_index * row_height)
                        right = round((column_index + 1) * column_width); bottom = round((row_index + 1) * row_height)
                        if border_width:
                            draw.rectangle((left, top, right, bottom), fill=fill_color, outline=_hex(style.get("tableGridColor"), "#B9CCC0"), width=border_width)
                        else:
                            draw.rectangle((left, top, right, bottom), fill=fill_color)
                        available = max(1, right - left - padding * 2)
                        label = value
                        while label and draw.textbbox((0, 0), label, font=font)[2] > available:
                            label = label[:-1]
                        if label != value and len(label) > 1: label = label[:-1] + "…"
                        box = draw.textbbox((0, 0), label, font=font); text_height = box[3] - box[1]
                        alignment = str(style.get("textAlign") or "left")
                        text_x = left + padding if alignment == "left" else right - padding - (box[2] - box[0]) if alignment == "right" else left + (right - left - (box[2] - box[0])) / 2
                        vertical = str(style.get("tableVerticalAlign") or "middle")
                        text_y = top + padding if vertical == "top" else bottom - padding - text_height if vertical == "bottom" else top + (bottom - top - text_height) / 2
                        draw.text((text_x, text_y), label, fill=text_color, font=font)
        elif element_type == "product_card":
            product = (snapshot.get("productData") or {}).get(str(element.get("productId") or "")) or {}
            layout = str(style.get("cardLayout") or "classic")
            price, secondary_price = _product_card_prices(product, style)
            if layout == "erp_detail":
                accent = _hex(style.get("detailAccentColor"), "#F9A83B")
                padding = max(4, round(_number(style.get("cardPadding"), 8)))
                header_height = max(24, round(item_height * .12))
                draw.rounded_rectangle((padding, padding, item_width - padding, padding + header_height), radius=6, fill=accent)
                title_font = _font(max(8, min(20, round(item_height * .045))), True, str(style.get("fontFamily") or "Tahoma"), style_italic)
                title = str(style.get("productName") or product.get("name_en") or "Product")
                title_box = draw.textbbox((0, 0), title, font=title_font); draw.text(((item_width - (title_box[2] - title_box[0])) / 2, padding + 3), title, fill="#FFFFFF", font=title_font)
                image_box = (padding + 4, round(item_height * .24), round(item_width * .38), round(item_height * .72))
                if asset_path and style.get("showProductImage", True) is not False:
                    try:
                        asset = Image.open(asset_path).convert("RGBA")
                        asset = _fit_raster_asset(asset, image_box[2] - image_box[0], image_box[3] - image_box[1], style.get("objectFit"))
                        tile.alpha_composite(asset, (image_box[0] + (image_box[2] - image_box[0] - asset.width) // 2, image_box[1] + (image_box[3] - image_box[1] - asset.height) // 2))
                    except Exception:
                        logger.warning("Could not render product image %s", asset_path)
                small_font = _font(max(7, min(13, round(item_height * .026))), False, str(style.get("fontFamily") or "Tahoma"))
                bold_font = _font(max(7, min(13, round(item_height * .027))), True, str(style.get("fontFamily") or "Tahoma"))
                size_text = " ".join(value for value in [str(style.get("productPackSize") or ""), str(style.get("productUnit") or "")] if value)
                if size_text: draw.text((image_box[0], round(item_height * .18)), size_text, fill="#17251F", font=bold_font)
                draw.text((image_box[0], round(item_height * .74)), str(style.get("productSku") or product.get("sku") or ""), fill="#17251F", font=bold_font)
                table = (round(item_width * .41), round(item_height * .21), round(item_width * .96), round(item_height * .40))
                draw.rectangle(table, outline="#C9D3CD", width=1); draw.line((table[0], (table[1] + table[3]) // 2, table[2], (table[1] + table[3]) // 2), fill="#C9D3CD", width=1)
                boundaries = [table[0], round(item_width * .59), round(item_width * .80), table[2]]
                for boundary in boundaries[1:-1]: draw.line((boundary, table[1], boundary, table[3]), fill="#C9D3CD", width=1)
                headings = ["CODE", "BARCODE", "STOCK"]
                values = [str(style.get("productSku") or product.get("sku") or "—"), str(style.get("productBarcode") or product.get("barcode") or "—"), str(style.get("productStock") if style.get("productStock") is not None else product.get("stock_on_hand", "—"))]
                for index, (heading, value) in enumerate(zip(headings, values, strict=True)):
                    center = (boundaries[index] + boundaries[index + 1]) / 2
                    for value_index, label in enumerate((heading, value)):
                        font = bold_font if value_index == 0 else small_font; box = draw.textbbox((0, 0), label, font=font)
                        draw.text((center - (box[2] - box[0]) / 2, table[1] + 3 + value_index * ((table[3] - table[1]) / 2)), label, fill="#16884C" if index == 2 else "#263B30", font=font)
                description = str(style.get("productDescription") or product.get("description") or style.get("productRemark") or "")
                if description and style.get("showProductDescription"): draw.text((padding + 5, round(item_height * .84)), description[:120], fill=_hex(style.get("productMetaColor"), "#60746A"), font=small_font)
                if price and style.get("showProductPrice", True) is not False and style.get("priceMode") != "no_price":
                    price_box = (round(item_width * .65), round(item_height * .84), round(item_width * .96), round(item_height * .94)); draw.rounded_rectangle(price_box, radius=max(12, (price_box[3] - price_box[1]) // 2), fill=accent)
                    box = draw.textbbox((0, 0), price, font=bold_font); draw.text(((price_box[0] + price_box[2] - (box[2] - box[0])) / 2, price_box[1] + 3), price, fill="#FFFFFF", font=bold_font)
            else:
                text = str(style.get("productName") or product.get("name_en") or "Product") if style.get("showProductName", True) is not False and layout != "image_only" else ""
                details = []
                if style.get("showProductCategory"): details.append(str(style.get("productCategory") or product.get("category_name") or ""))
                if style.get("showProductSku", True) is not False: details.append(f"Code {style.get('productSku') or product.get('sku') or ''}")
                if style.get("showProductBarcode", True) is not False: details.append(f"Barcode {style.get('productBarcode') or product.get('barcode') or ''}")
                if style.get("showProductStock", True) is not False: details.append(f"Stock {style.get('productStock') if style.get('productStock') is not None else product.get('stock_on_hand', '')}")
                if style.get("showProductDescription"): details.append(str(style.get("productDescription") or product.get("description") or ""))
                details = [value for value in details if value and not value.endswith(" ")]
                if details and text: text += "\n" + " • ".join(details)
                if asset_path and style.get("showProductImage", True) is not False and layout != "minimal":
                    try:
                        asset = Image.open(asset_path).convert("RGBA")
                        asset = _fit_raster_asset(asset, round(item_width * .88), round(item_height * .48), style.get("objectFit"))
                        tile.alpha_composite(asset, ((item_width - asset.width) // 2, round(item_height * .30)))
                    except Exception:
                        logger.warning("Could not render product image %s", asset_path)
                if price and style.get("showProductPrice", True) is not False and style.get("priceMode") != "no_price" and layout != "image_only": text += f"\n{price}"
                if secondary_price and style.get("showSecondaryPrice") is True and style.get("priceMode") != "no_price" and layout != "image_only": text += f"\n{secondary_price}"
        elif element_type == "barcode":
            value = _barcode_value(element, snapshot)
            if value:
                widths = [2, 1, 2, 1, 3, 1]
                for character in value:
                    code = ord(character)
                    widths.extend([1 + (code & 3), 1 + ((code >> 2) & 3), 1 + ((code >> 4) & 3), 1 + ((code >> 6) & 3)])
                widths.extend([2, 3, 1, 2])
                total = max(1, sum(widths)); cursor = item_width * .06
                for index, module_width in enumerate(widths):
                    bar_width = item_width * .88 * module_width / total
                    if index % 2 == 0:
                        draw.rectangle((cursor, item_height * .08, cursor + max(1, bar_width), item_height * .72), fill="#111111")
                    cursor += bar_width
                font = _font(max(8, round(min(item_height * .16, _number(style.get("fontSize"), 16)))), False, "Courier New")
                box = draw.textbbox((0, 0), value, font=font)
                draw.text(((item_width - (box[2] - box[0])) / 2, item_height * .76), value, fill="#111111", font=font)
        elif element_type == "qr_code":
            value = str(element.get("target") or "")
            if value:
                import qrcode
                from qrcode.constants import ERROR_CORRECT_H, ERROR_CORRECT_L, ERROR_CORRECT_M, ERROR_CORRECT_Q

                correction = {
                    "L": ERROR_CORRECT_L,
                    "Q": ERROR_CORRECT_Q,
                    "H": ERROR_CORRECT_H,
                }.get(str(style.get("qrErrorCorrection") or "M").upper(), ERROR_CORRECT_M)
                margin = max(0, min(8, round(_number(style.get("qrMargin"), 4))))
                qr = qrcode.QRCode(version=None, error_correction=correction, box_size=10, border=margin)
                qr.add_data(value)
                qr.make(fit=True)
                qr_image = qr.make_image(
                    fill_color=_hex(style.get("qrForeground"), "#111111"),
                    back_color=_hex(style.get("qrBackground"), "#FFFFFF"),
                ).convert("RGBA")
                show_label = style.get("qrShowLabel") is True and bool(str(style.get("qrLabel") or "").strip())
                label_height = max(16, round(item_height * .15)) if show_label else 0
                qr_size = max(1, min(item_width, item_height - label_height))
                qr_image = qr_image.resize((qr_size, qr_size), Image.Resampling.NEAREST)
                tile.alpha_composite(qr_image, ((item_width - qr_size) // 2, 0))
                if show_label:
                    label = str(style.get("qrLabel") or "")
                    label_font = _font(max(8, min(round(_number(style.get("fontSize"), 16)), round(label_height * .5))), True, str(style.get("fontFamily") or "Tahoma"))
                    label_box = draw.textbbox((0, 0), label, font=label_font)
                    draw.text(((item_width - (label_box[2] - label_box[0])) / 2, item_height - label_height + 2), label, fill=_hex(style.get("color"), "#17251F"), font=label_font)
        elif element_type in {"text", "button", "product_field", "category_field", "page_number"}:
            text = _element_text(element, snapshot, page_number)
        if text:
            font = _font(round(_number(style.get("fontSize"), max(12, item_width * .06))), element_type in {"product_card", "button"} or style_bold, str(style.get("fontFamily") or "Tahoma"), style_italic)
            box = draw.multiline_textbbox((0, 0), text, font=font, spacing=4)
            text_width = box[2] - box[0]; alignment = str(style.get("textAlign") or "left")
            text_x = max(4, (item_width - text_width) / 2) if alignment == "center" else max(4, item_width - text_width - item_width * .05) if alignment == "right" else max(4, item_width * .05)
            draw.multiline_text((text_x, max(4, item_height * .08)), text, fill=_hex(style.get("color"), "#17251F"), font=font, spacing=4, align=alignment if alignment in {"left", "center", "right"} else "left")
        tile, shadow_origin_x, shadow_origin_y = _apply_raster_shadow(tile, style)
        x -= shadow_origin_x
        y -= shadow_origin_y
        rotation = float(element.get("rotation", 0))
        if rotation:
            before_rotation_width, before_rotation_height = tile.size
            tile = tile.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC)
            x -= (tile.width - before_rotation_width) // 2; y -= (tile.height - before_rotation_height) // 2
        opacity = max(0, min(1, float(element.get("opacity", 1))))
        if opacity < 1:
            alpha = tile.getchannel("A").point(lambda value: round(value * opacity)); tile.putalpha(alpha)
        image.alpha_composite(tile, (x, y))
    return image


def render_raster(db: Session, snapshot: dict, output_path: Path, options: dict[str, Any], image_type: str) -> None:
    pages = [page for page in snapshot.get("pages", []) if page.get("isVisible", True)]
    page_id = str(options.get("page_id") or "")
    page = next((item for item in pages if str(item.get("id")) == page_id), pages[0] if pages else None)
    if not page:
        raise ValueError("The catalogue has no visible pages.")
    assets = _asset_paths(db, snapshot)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image = _raster_page(
        db,
        page,
        assets,
        snapshot,
        transparent=bool(options.get("transparent")) and image_type == "png",
        page_number=pages.index(page) + 1,
    )
    quality = max(40, min(100, int(options.get("quality", 90))))
    if image_type == "jpeg":
        image.convert("RGB").save(output_path, format="JPEG", quality=quality, optimize=True)
    else:
        image.save(output_path, format="PNG", optimize=True)
