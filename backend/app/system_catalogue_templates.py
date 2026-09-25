"""Approved, reusable complete-catalogue templates for Catalogue Studio."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.design_studio_models import CatalogueTemplate


PAGE_WIDTH = 794
PAGE_HEIGHT = 1123
SYSTEM_TAG = "system:gms-governed"
TEMPLATE_VERSION = 4
GREEN = "#126B3A"
DARK = "#173C29"
MUTED = "#60746A"
PALE = "#EDF7F0"
WHITE = "#FFFFFF"


def _element(
    element_type: str,
    name: str,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
    text: str | None = None,
    binding: str | None = None,
    style: dict | None = None,
    locked: bool = False,
    z: int = 1,
) -> dict:
    return {
        "id": str(uuid.uuid4()), "type": element_type, "name": name,
        "xPercent": x, "yPercent": y, "widthPercent": width, "heightPercent": height,
        "rotation": 0, "opacity": 1, "zIndex": z, "locked": locked, "visible": True,
        "groupId": None, "text": text, "assetId": None, "productId": None,
        "categoryId": None, "templateId": None, "binding": binding, "target": None,
        "style": style or {}, "responsive": {}, "carousel": None,
    }


def _shape(
    name: str,
    x: float,
    y: float,
    width: float,
    height: float,
    color: str,
    *,
    radius: int = 0,
    locked: bool = True,
    z: int = 1,
) -> dict:
    return _element(
        "shape", name, x=x, y=y, width=width, height=height, locked=locked, z=z,
        style={"backgroundColor": color, "color": color, "borderColor": color, "borderWidth": 0, "borderRadius": radius},
    )


def _text(
    name: str,
    text: str,
    x: float,
    y: float,
    width: float,
    height: float,
    *,
    size: int = 24,
    color: str = DARK,
    bold: bool = False,
    align: str = "left",
    binding: str | None = None,
    locked: bool = False,
    z: int = 2,
) -> dict:
    return _element(
        "text", name, x=x, y=y, width=width, height=height, text=text,
        binding=binding, locked=locked, z=z,
        style={
            "fontFamily": "Arial", "fontSize": size, "fontWeight": "bold" if bold else "normal",
            "fontStyle": "normal", "textAlign": align, "color": color,
            "backgroundColor": "transparent", "borderWidth": 0,
            "governedStyleKeys": "fontFamily,color" if locked else "fontFamily",
            "governedFontFamily": "Arial",
            **({"governedColor": color} if locked else {}),
        },
    )


def _product_grid(*, card_key: str = "gms-essential", two_prices: bool = False) -> dict:
    required = "image,name,code,price" if not two_prices else "image,name,code,price,secondary_price"
    return _element(
        "product_grid", "ERP product grid", x=6, y=20, width=88, height=72,
        binding="{{catalogue.products}}",
        style={
            "fontFamily": "Arial", "backgroundColor": WHITE, "borderColor": "#C9DDD1",
            "accentColor": GREEN, "productNameColor": DARK, "productPriceColor": "#0E7A43",
            "columns": 2, "rows": 3, "cardTemplateKey": card_key,
            "requiredFields": required,
            "showProductImage": True, "showProductName": True, "showProductSku": True,
            "showProductPrice": True, "showSecondaryPrice": two_prices,
            "governedStyleKeys": "fontFamily,accentColor,productNameColor,productPriceColor",
            "governedRequiredFields": required,
            "governedFontFamily": "Arial", "governedAccentColor": GREEN,
            "governedProductNameColor": DARK, "governedProductPriceColor": "#0E7A43",
        },
        z=3,
    )


def _page(page_type: str, name: str, background: str, elements: list[dict], *, locked: bool = False) -> dict:
    page_id = str(uuid.uuid4())
    return {
        "pageName": name, "pageType": page_type, "width": PAGE_WIDTH, "height": PAGE_HEIGHT,
        "orientation": "portrait", "isVisible": True, "isLocked": locked,
        "pageData": {
            "pageId": page_id, "pageType": page_type, "name": name,
            "canvas": {
                "width": PAGE_WIDTH, "height": PAGE_HEIGHT, "backgroundColor": background,
                "gridSize": 10, "showGrid": False, "showGuides": True,
                "showSafeArea": True, "bleed": 0,
            },
            "elements": elements, "dataMode": "live",
        },
    }


def _landscape_page(page_type: str, name: str, background: str, elements: list[dict]) -> dict:
    item = _page(page_type, name, background, elements)
    item.update({"width": PAGE_HEIGHT, "height": PAGE_WIDTH, "orientation": "landscape"})
    item["pageData"]["canvas"].update({"width": PAGE_HEIGHT, "height": PAGE_WIDTH})
    return item


def _go_camp_card(slot: int) -> list[dict]:
    left = 4 + slot * 49
    group = str(uuid.uuid4())
    elements = [
        _shape(f"Card {slot + 1} background", left, 9, 45, 78, WHITE, radius=70, locked=False, z=2),
        _shape(f"Card {slot + 1} orange title", left + 3, 15, 39, 7, "#FFA640", radius=12, locked=False, z=3),
        _text(f"Card {slot + 1} title", "PRODUCT CODE · PRODUCT NAME", left + 6, 15.7, 34, 5, size=18, color=WHITE, bold=True, align="center", binding="{{product.name}}", z=4),
        _element("image_carousel", f"Card {slot + 1} product images", x=left + 4, y=29, width=17, height=31, binding="{{product.images}}", style={"backgroundColor": "transparent", "objectFit": "contain", "borderRadius": 8, "downloadButtonDesign": "classic", "downloadButtonXPercent": 1, "downloadButtonYPercent": 1}, z=4),
        _element("table", f"Card {slot + 1} live inventory", x=left + 22, y=31, width=20, height=25, text="CODE | BARCODE | STOCK\n— | — | —", binding="{{product.erp_table_inventory}}", style={"tableSource": "erp", "tablePreset": "inventory", "tableHeader": True, "tableStriped": False, "tableShowBorders": True, "tableHeaderColor": "transparent", "tableHeaderTextColor": "#000000", "tableCellColor": "transparent", "tableAlternateColor": "transparent", "tableStockColor": "#16884C", "tableGridColor": "#C9D3CD", "tableBorderWidth": 1, "tableCellPadding": 5, "fontFamily": "Arial", "fontSize": 12, "color": "#000000", "textAlign": "center"}, z=4),
        _text(f"Card {slot + 1} details", "SIZE: — cm.\nPACK: — pcs/carton", left + 4, 68, 22, 10, size=14, color="#111111", binding="{{product.description}}", z=4),
        _shape(f"Card {slot + 1} price pill", left + 29, 73, 13, 5, "#FFA640", radius=18, locked=False, z=3),
        _text(f"Card {slot + 1} price", "THB 0.00", left + 29, 73.3, 13, 4, size=16, color=WHITE, bold=True, align="center", binding="{{product.price}}", z=4),
        _element("button", f"Card {slot + 1} download", x=left + 3.2, y=15.5, width=3, height=5, text="⇩", style={"backgroundColor": "#FFFFFF", "borderRadius": 999, "borderWidth": 1, "borderColor": "#D5E6DC", "color": "#16884C", "fontSize": 22, "textAlign": "center", "downloadAction": "product_image"}, z=5),
    ]
    for item in elements:
        item["groupId"] = group
    return elements


def _go_camp_product_page(name: str) -> list[dict]:
    return [
        _text("Category heading", name.upper(), 4, 2, 92, 6, size=28, color="#173C29", bold=True, align="center"),
        *_go_camp_card(0), *_go_camp_card(1),
        _text("Page number", "1", 91, 95, 5, 3, size=12, color=MUTED, align="right", binding="{{page.number}}"),
    ]


def _cover(subtitle: str, accent: str = "#80D39B") -> list[dict]:
    return [
        _shape("Locked GMS cover background", 0, 0, 100, 100, "#0B4F2F"),
        _shape("Cover accent", 7, 8, 86, 1.2, accent, radius=6, locked=False, z=2),
        _text("GMS wordmark", "GMS", 9, 12, 24, 7, size=42, color=WHITE, bold=True),
        _text("Catalogue title", "Catalogue title", 9, 34, 78, 22, size=54, color=WHITE, bold=True, binding="{{catalogue.name}}"),
        _text("Cover subtitle", subtitle, 10, 62, 70, 10, size=17, color="#D8EFE0"),
        _text("Edition", "CURRENT EDITION", 67, 78, 23, 6, size=15, color=WHITE, bold=True, align="center"),
        _text("Company footer", "G.M.S. CORPORATION CO., LTD.", 10, 91, 80, 4, size=12, color="#BDE8CA", bold=True),
    ]


def _contents() -> list[dict]:
    return [
        _text("Section label", "01 / CONTENTS", 7, 6, 45, 4, size=14, color=GREEN, bold=True, locked=True),
        _text("Contents heading", "Catalogue contents", 7, 12, 75, 8, size=38, bold=True),
        _text("Contents guidance", "Categories and product sections are populated from the selected active ERP products.", 7, 22, 82, 6, size=16, color=MUTED),
        _element("category_field", "ERP category navigation", x=7, y=34, width=86, height=52, binding="{{catalogue.categories}}", style={"fontFamily": "Arial", "color": DARK, "accentColor": GREEN, "governedStyleKeys": "fontFamily,accentColor", "governedFontFamily": "Arial", "governedAccentColor": GREEN}),
        _text("Page footer", "GMS CATALOGUE", 7, 94, 86, 3, size=11, color=MUTED, align="center"),
    ]


def _product_page(title: str, *, card_key: str = "gms-essential", two_prices: bool = False) -> list[dict]:
    return [
        _shape("Header accent", 0, 0, 100, 2, GREEN, locked=False),
        _text("Product section", title, 6, 7, 72, 8, size=35, bold=True, binding="{{category.name}}"),
        _text("Product section description", "Active ERP products with synchronized images and approved catalogue fields.", 6, 15, 82, 4, size=14, color=MUTED),
        _product_grid(card_key=card_key, two_prices=two_prices),
        _text("Page footer", "PAGE", 83, 95, 11, 3, size=11, color=MUTED, align="right", binding="{{page.number}}"),
    ]


def _final() -> list[dict]:
    return [
        _shape("Locked final background", 0, 0, 100, 100, "#0B4F2F"),
        _text("Final GMS wordmark", "GMS", 10, 18, 25, 8, size=42, color=WHITE, bold=True),
        _text("Final heading", "Thank you", 10, 40, 70, 10, size=54, color=WHITE, bold=True),
        _text("Final message", "Contact your GMS representative for product availability and current commercial terms.", 10, 55, 68, 10, size=18, color="#D8EFE0"),
        _text("Final footer", "G.M.S. CORPORATION CO., LTD.", 10, 91, 80, 4, size=12, color="#BDE8CA", bold=True),
    ]


def _definitions() -> tuple[dict, ...]:
    governance = {
        "profile": "gms-brand-v1", "brandLocked": True, "fontFamily": "Arial",
        "palette": [GREEN, DARK, "#0E7A43", WHITE],
        "requiredProductFields": ["image", "name", "code"],
    }
    return (
        {
            "key": "gms-standard-brand", "name": "GMS Standard Brand Catalogue",
            "description": "Four-page approved brand catalogue with cover, contents, ERP product grid and closing page.",
            "tags": ["standard", "single-brand", SYSTEM_TAG],
            "pages": [
                _page("cover", "Cover", "#0B4F2F", _cover("A clear, dependable product catalogue powered by synchronized ERP data.")),
                _page("table_of_contents", "Contents", WHITE, _contents()),
                _page("product_grid", "Products", WHITE, _product_page("Product collection")),
                _page("final", "Final page", "#0B4F2F", _final()),
            ], "governance": governance,
        },
        {
            "key": "gms-multi-brand", "name": "GMS Multi-Brand Catalogue",
            "description": "Four-page approved structure for user-selected products from multiple ERP brands.",
            "tags": ["standard", "multi-brand", SYSTEM_TAG],
            "pages": [
                _page("cover", "Multi-brand cover", "#0B4F2F", _cover("Selected brands. One consistent customer-ready catalogue.")),
                _page("table_of_contents", "Brand and category contents", WHITE, _contents()),
                _page("product_grid", "Multi-brand products", WHITE, _product_page("Multi-brand product collection", card_key="gms-horizontal-sales")),
                _page("final", "Final page", "#0B4F2F", _final()),
            ], "governance": {**governance, "supportsMultipleBrands": True},
        },
        {
            "key": "gms-promotion", "name": "GMS Promotion Catalogue",
            "description": "Four-page approved promotion structure with two mapped prices, schedule messaging and terms.",
            "tags": ["promotion", "two-price", SYSTEM_TAG],
            "pages": [
                _page("cover", "Promotion cover", "#0B4F2F", _cover("Limited-time offers using two authorized ERP price slots.", "#F2C94C")),
                _page("promotion", "Promotion products", "#FFFBE9", _product_page("Promotion products", card_key="gms-promotion-two-price", two_prices=True)),
                _page("terms", "Promotion terms", WHITE, [
                    _text("Terms label", "PROMOTION TERMS", 7, 8, 60, 5, size=14, color=GREEN, bold=True, locked=True),
                    _text("Terms heading", "Dates, availability and conditions", 7, 15, 82, 9, size=36, bold=True),
                    _element("promotion_field", "Promotion schedule", x=7, y=30, width=86, height=18, binding="{{promotion.schedule}}", style={"fontFamily": "Arial", "color": DARK, "accentColor": GREEN, "governedStyleKeys": "fontFamily,accentColor", "governedFontFamily": "Arial", "governedAccentColor": GREEN}),
                    _element("promotion_field", "Promotion terms", x=7, y=54, width=86, height=30, binding="{{promotion.terms}}", style={"fontFamily": "Arial", "color": DARK, "accentColor": GREEN, "governedStyleKeys": "fontFamily,accentColor", "governedFontFamily": "Arial", "governedAccentColor": GREEN}),
                    _text("Terms footer", "GMS CATALOGUE", 7, 94, 86, 3, size=11, color=MUTED, align="center"),
                ]),
                _page("final", "Final page", "#0B4F2F", _final()),
            ], "governance": {**governance, "requiredPriceSlots": 2, "requiresPromotionSchedule": True},
        },
        {
            "key": "gms-go-camp-reference", "name": "GMS Go Camp Product Catalogue",
            "description": "Editable landscape catalogue inspired by the supplied Go Camp reference: light-blue pages, two rounded product cards, orange accents, carousel, live inventory table, details, price and download controls.",
            "tags": ["landscape", "outdoor", "two-card", "erp-stock", SYSTEM_TAG],
            "pages": [
                _landscape_page("cover", "Go Camp cover", "#ADD8E6", [
                    _shape("Cover white panel", 5, 7, 90, 86, WHITE, radius=42, locked=False),
                    _text("Cover brand", "GMS", 10, 13, 20, 8, size=38, color="#126B3A", bold=True),
                    _text("Cover title", "GO CAMP", 10, 35, 80, 15, size=64, color="#173C29", bold=True, align="center", binding="{{catalogue.name}}"),
                    _text("Cover subtitle", "Outdoor collection · Chairs · Tables · Beds", 15, 55, 70, 7, size=22, color=MUTED, align="center"),
                    _shape("Cover orange accent", 24, 68, 52, 2, "#FFA640", radius=8, locked=False, z=2),
                ]),
                _landscape_page("product_grid", "Chair", "#ADD8E6", _go_camp_product_page("Chair")),
                _landscape_page("product_grid", "Table", "#ADD8E6", _go_camp_product_page("Table")),
                _landscape_page("product_grid", "Bed", "#ADD8E6", _go_camp_product_page("Bed")),
            ],
            "governance": {**governance, "supportsMultipleBrands": True, "referenceLayout": "go-camp", "requiredProductFields": ["image", "name", "code", "barcode", "stock", "price"]},
        },
    )


def ensure_system_catalogue_templates(db: Session) -> None:
    definitions = _definitions()
    existing = {
        item.name: item for item in db.scalars(
            select(CatalogueTemplate).where(CatalogueTemplate.is_company_template.is_(True))
        )
    }
    changed = False
    for definition in definitions:
        template_data = {
            "schemaVersion": 2, "systemTemplateVersion": TEMPLATE_VERSION,
            "systemTemplateKey": definition["key"], "governance": definition["governance"],
            "pages": definition["pages"],
        }
        item = existing.get(definition["name"])
        if item is None:
            item = CatalogueTemplate(
                template_type="catalogue", name=definition["name"], description=definition["description"],
                template_data_json=template_data, visibility_scope="company", is_company_template=True,
                approval_status="approved", is_active=True, tags=definition["tags"], version=1,
            )
            db.add(item)
            changed = True
            continue
        current = item.template_data_json or {}
        if int(current.get("systemTemplateVersion", 0)) < TEMPLATE_VERSION:
            item.template_data_json = template_data
            item.description = definition["description"]
            item.tags = definition["tags"]
            item.version += 1
            changed = True
        if not item.is_active or item.approval_status != "approved":
            item.is_active = True
            item.approval_status = "approved"
            changed = True
    if changed:
        db.commit()
