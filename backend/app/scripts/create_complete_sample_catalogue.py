"""Create one polished, editable Catalogue Studio sample from live ERP data.

This command is intentionally idempotent: an existing sample with the same
name is returned unchanged. It never updates or deletes a user's catalogue.
"""

from __future__ import annotations

import uuid
from copy import deepcopy
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app import promotion_models as _promotion_models  # noqa: F401 - register FK tables
from app.commerce_models import PriceList, ProductPrice
from app.database import SessionLocal
from app.design_studio import _snapshot
from app.design_studio_models import (
    CatalogueDesign,
    CatalogueDesignBrand,
    CatalogueDesignPage,
    CatalogueDesignPriceSlot,
    CatalogueDesignProduct,
    CatalogueDesignVersion,
)
from app.models import AuditLog, Brand, Product, ProductImage, User


SAMPLE_NAME = "GMS Complete Sample Catalogue 2026"
PAGE_WIDTH = 794
PAGE_HEIGHT = 1123
BRAND_NAMES = ("Nubwo", "HANA", "PET EMPIRE")


def element(
    element_type: str,
    name: str,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
    text: str | None = None,
    z: int = 1,
    style: dict | None = None,
    product_id: uuid.UUID | None = None,
    binding: str | None = None,
    target: str | None = None,
) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "type": element_type,
        "name": name,
        "xPercent": x,
        "yPercent": y,
        "widthPercent": width,
        "heightPercent": height,
        "rotation": 0,
        "opacity": 1,
        "zIndex": z,
        "locked": False,
        "visible": True,
        "groupId": None,
        "text": text,
        "assetId": None,
        "productId": str(product_id) if product_id else None,
        "categoryId": None,
        "templateId": None,
        "binding": binding,
        "target": target,
        "style": style or {},
        "responsive": {
            "mobile": {"hidden": False},
            "pdf": {"hidden": False},
            "print": {"hidden": False},
        },
    }


def text_element(
    name: str,
    text: str,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
    size: int = 24,
    color: str = "#173C29",
    bold: bool = False,
    align: str = "left",
    background: str = "transparent",
    radius: int = 0,
    z: int = 2,
) -> dict:
    return element(
        "text",
        name,
        x=x,
        y=y,
        width=width,
        height=height,
        text=text,
        z=z,
        style={
            "backgroundColor": background,
            "color": color,
            "borderRadius": radius,
            "borderWidth": 0,
            "borderColor": "transparent",
            "fontSize": size,
            "fontFamily": "Arial",
            "fontWeight": "bold" if bold else "normal",
            "textAlign": align,
        },
    )


def shape(
    name: str,
    *,
    x: float,
    y: float,
    width: float,
    height: float,
    color: str,
    radius: int = 0,
    z: int = 1,
) -> dict:
    return element(
        "shape",
        name,
        x=x,
        y=y,
        width=width,
        height=height,
        z=z,
        style={
            "backgroundColor": color,
            "color": color,
            "borderRadius": radius,
            "borderWidth": 0,
            "borderColor": color,
        },
    )


def product_description(product: Product) -> str:
    if product.erp_description_en:
        return product.erp_description_en
    if product.erp_description_th:
        return product.erp_description_th
    category = product.erp_category or "catalogue"
    return f"ERP-synchronized {category} product from {product.brand or 'GMS'}."


def latest_prices(db, product_ids: list[uuid.UUID], price_list_ids: list[int]) -> dict[tuple[uuid.UUID, int], Decimal]:
    if not product_ids or not price_list_ids:
        return {}
    now = datetime.now(UTC)
    result: dict[tuple[uuid.UUID, int], Decimal] = {}
    rows = db.scalars(
        select(ProductPrice)
        .where(
            ProductPrice.product_id.in_(product_ids),
            ProductPrice.price_list_id.in_(price_list_ids),
            ProductPrice.status == "active",
            ProductPrice.effective_from <= now,
            (ProductPrice.expires_at.is_(None) | (ProductPrice.expires_at > now)),
        )
        .order_by(ProductPrice.effective_from.desc())
    )
    for row in rows:
        result.setdefault((row.product_id, row.price_list_id), row.amount)
    return result


def product_card(product: Product, amount: Decimal | None, *, x: float, y: float) -> dict:
    images = sorted(product.images, key=lambda image: (not image.is_primary, image.sort_order, image.created_at))
    category = product.erp_category or (product.categories[0].name if product.categories else "Uncategorized")
    price = f"THB {amount:,.2f}" if amount is not None else (f"THB {product.price:,.2f}" if product.price is not None else "")
    image_ids = [str(image.id) for image in images]
    return element(
        "product_card",
        product.erp_name,
        x=x,
        y=y,
        width=42,
        height=33,
        product_id=product.id,
        binding=f"{{{{product:{product.id}}}}}",
        z=3,
        style={
            "backgroundColor": "#FFFFFF",
            "color": "#173C29",
            "borderRadius": 18,
            "borderWidth": 1,
            "borderColor": "#CADCD1",
            "shadowBlur": 10,
            "objectFit": "contain",
            "cardLayout": "classic",
            "cardPadding": 10,
            "productImageHeight": 49,
            "showProductImage": True,
            "showProductName": True,
            "showProductPrice": True,
            "showProductBrand": False,
            "showProductSku": True,
            "showProductCategory": False,
            "showProductDescription": False,
            "showProductBarcode": True,
            "showProductStock": True,
            "productName": product.erp_name,
            "productPrice": price,
            "productBrand": product.brand or "",
            "productSku": product.sku,
            "productCategory": category,
            "productDescription": product_description(product),
            "productBarcode": product.barcode or "",
            "productStock": product.stock_quantity,
            "useErpName": True,
            "useErpPrice": True,
            "useErpBrand": True,
            "useErpSku": True,
            "useErpCategory": True,
            "useErpDescription": True,
            "useErpBarcode": True,
            "useErpStock": True,
            "productImageUrl": images[0].public_url if images else "",
            "productImageId": image_ids[0] if image_ids else "",
            "productImageIndex": 0,
            "productImageIds": ",".join(image_ids),
            "productImageCount": len(image_ids),
            "productNameColor": "#173C29",
            "productPriceColor": "#0E7A43",
            "productMetaColor": "#60746A",
            "productNameSize": 20,
            "productPriceSize": 19,
            "productMetaSize": 12,
        },
    )


def page_document(page_id: uuid.UUID, page_type: str, name: str, background: str, elements: list[dict]) -> dict:
    return {
        "pageId": str(page_id),
        "pageType": page_type,
        "name": name,
        "canvas": {
            "width": PAGE_WIDTH,
            "height": PAGE_HEIGHT,
            "backgroundColor": background,
            "gridSize": 10,
            "showGrid": False,
            "showGuides": True,
            "showSafeArea": True,
            "bleed": 0,
        },
        "elements": elements,
        "dataMode": "live",
    }


def page(design_id: uuid.UUID, order: int, page_type: str, name: str, background: str, elements: list[dict]) -> CatalogueDesignPage:
    page_id = uuid.uuid4()
    return CatalogueDesignPage(
        id=page_id,
        design_id=design_id,
        page_type=page_type,
        page_name=name,
        display_order=order,
        width=PAGE_WIDTH,
        height=PAGE_HEIGHT,
        orientation="portrait",
        background_color=background,
        page_data_json=page_document(page_id, page_type, name, background, elements),
        is_visible=True,
        is_locked=False,
    )


def cover_elements() -> list[dict]:
    return [
        shape("Deep green background", x=0, y=0, width=100, height=100, color="#0B4F2F"),
        shape("Top accent", x=7, y=7, width=86, height=1.3, color="#80D39B", radius=4, z=2),
        shape("Cover glow", x=61, y=10, width=49, height=44, color="#176D45", radius=220, z=1),
        text_element("GMS mark", "GMS", x=9, y=11, width=26, height=8, size=42, color="#FFFFFF", bold=True),
        text_element("Department", "CATALOGUE DEPARTMENT  /  ฝ่ายแค็ตตาล็อก", x=10, y=27, width=78, height=5, size=15, color="#9DE2B2", bold=True),
        text_element("Cover title", "COMPLETE\nCATALOGUE\nSAMPLE", x=9, y=34, width=72, height=30, size=54, color="#FFFFFF", bold=True),
        text_element("Cover subtitle", "A fully editable catalogue built from active ERP products, synchronized images, stock, barcode, categories and customer pricing.", x=10, y=67, width=69, height=11, size=17, color="#D8EFE0"),
        text_element("Thai subtitle", "ตัวอย่างแค็ตตาล็อกที่แก้ไขได้ พร้อมข้อมูลสินค้าและรูปภาพจาก ERP", x=10, y=79, width=70, height=5, size=15, color="#BDE8CA"),
        text_element("Edition", "2026\nSAMPLE EDITION", x=74, y=73, width=17, height=12, size=20, color="#0B4F2F", bold=True, align="center", background="#FFFFFF", radius=18),
        text_element("Brand scope", "NUBWO  •  HANA  •  PET EMPIRE", x=10, y=91, width=78, height=4, size=14, color="#FFFFFF", bold=True),
    ]


def contents_elements(groups: list[tuple[str, list[Product]]]) -> list[dict]:
    elements = [
        text_element("Section marker", "01  /  CONTENTS", x=7, y=6, width=50, height=4, size=14, color="#0E7A43", bold=True),
        text_element("Contents title", "Explore the sample", x=7, y=11, width=80, height=8, size=39, bold=True),
        text_element("Contents intro", "Use the preview sidebar to jump between sections. Search by product name, code, brand or barcode. In Studio, every layer, field, image and product card remains editable.", x=7, y=21, width=84, height=9, size=17, color="#526B5D"),
        shape("Contents divider", x=7, y=32, width=86, height=.3, color="#C8D9CF", z=1),
    ]
    y_positions = [37, 54, 71]
    colors = ["#E8F6ED", "#EFF8F1", "#F4F0E7"]
    for index, ((brand, products), y) in enumerate(zip(groups, y_positions, strict=True), start=1):
        categories = ", ".join(dict.fromkeys((product.erp_category or "Uncategorized") for product in products))
        elements.extend([
            text_element(f"{brand} number", f"0{index}", x=8, y=y, width=9, height=9, size=28, color="#FFFFFF", bold=True, align="center", background="#0E6A3F", radius=16),
            text_element(f"{brand} title", brand, x=20, y=y, width=34, height=5, size=24, color="#173C29", bold=True),
            text_element(f"{brand} categories", categories, x=20, y=y + 6, width=62, height=5, size=14, color="#60746A"),
            text_element(f"{brand} count", f"{len(products)} selected ERP products", x=72, y=y + 1, width=19, height=7, size=13, color="#0E6A3F", bold=True, align="center", background=colors[index - 1], radius=16),
        ])
    elements.extend([
        text_element("Included features", "INCLUDED IN THIS SAMPLE", x=7, y=89, width=40, height=4, size=14, color="#0E7A43", bold=True),
        text_element("Feature list", "✓ Active ERP products only   ✓ Multiple synchronized images   ✓ Stock and barcode   ✓ Two configurable price slots   ✓ Editable pages and layers   ✓ Web preview and PDF export", x=7, y=94, width=86, height=5, size=13, color="#385647"),
    ])
    return elements


def product_page_elements(brand: str, products: list[Product], prices: dict[tuple[uuid.UUID, int], Decimal], normal_id: int) -> list[dict]:
    categories = " • ".join(dict.fromkeys((product.erp_category or "Uncategorized") for product in products))
    elements = [
        text_element(f"{brand} section", f"PRODUCT COLLECTION  /  {brand.upper()}", x=6, y=4, width=72, height=4, size=13, color="#0E7A43", bold=True),
        text_element(f"{brand} heading", brand, x=6, y=8, width=68, height=7, size=38, bold=True),
        text_element(f"{brand} categories", categories, x=6, y=15, width=75, height=4, size=14, color="#60746A"),
        text_element(f"{brand} product count", f"{len(products)} products", x=80, y=8, width=14, height=6, size=13, color="#0E6A3F", bold=True, align="center", background="#E7F4EB", radius=18),
        shape(f"{brand} divider", x=6, y=19, width=88, height=.25, color="#C8D9CF"),
    ]
    positions = [(6, 22), (52, 22), (6, 58), (52, 58)]
    for product, (x, y) in zip(products, positions, strict=True):
        elements.append(product_card(product, prices.get((product.id, normal_id)), x=x, y=y))
    elements.append(text_element(f"{brand} footer", "Prices shown use this sample catalogue’s configured price slot. Customer labels are not printed.", x=6, y=94, width=88, height=3, size=11, color="#718278", align="center"))
    return elements


def detail_elements(products: list[Product], prices: dict[tuple[uuid.UUID, int], Decimal], normal_id: int, vip_id: int) -> list[dict]:
    featured = products[:2]
    elements = [
        text_element("Detail marker", "05  /  FEATURED DETAILS", x=7, y=5, width=60, height=4, size=14, color="#0E7A43", bold=True),
        text_element("Detail title", "More product information, fewer clicks", x=7, y=10, width=84, height=7, size=34, bold=True),
        text_element("Detail intro", "These product cards demonstrate the synchronized fields available to users: images, name, code, barcode, stock, category and price. Select any card in Studio to change its layout or visible fields.", x=7, y=18, width=85, height=9, size=16, color="#526B5D"),
    ]
    for index, product in enumerate(featured):
        images = sorted(product.images, key=lambda image: (not image.is_primary, image.sort_order, image.created_at))
        normal = prices.get((product.id, normal_id))
        vip = prices.get((product.id, vip_id))
        y = 31 + index * 30
        image_ids = [str(image.id) for image in images]
        elements.append(element(
            "product_card",
            f"Featured {product.erp_name}",
            x=7,
            y=y,
            width=86,
            height=26,
            product_id=product.id,
            binding=f"{{{{product:{product.id}}}}}",
            z=3,
            style={
                "backgroundColor": "#FFFFFF", "color": "#173C29", "borderRadius": 20,
                "borderWidth": 1, "borderColor": "#CADCD1", "shadowBlur": 10,
                "objectFit": "contain", "cardLayout": "image_left", "cardPadding": 12,
                "showProductImage": True, "showProductName": True, "showProductPrice": True,
                "showProductBrand": True, "showProductSku": True, "showProductCategory": True,
                "showProductDescription": True, "showProductBarcode": True, "showProductStock": True,
                "productName": product.erp_name,
                "productPrice": f"THB {normal:,.2f}" if normal is not None else "",
                "productBrand": product.brand or "", "productSku": product.sku,
                "productCategory": product.erp_category or "", "productDescription": product_description(product),
                "productBarcode": product.barcode or "", "productStock": product.stock_quantity,
                "useErpName": True, "useErpPrice": True, "useErpBrand": True, "useErpSku": True,
                "useErpCategory": True, "useErpDescription": True, "useErpBarcode": True, "useErpStock": True,
                "productImageUrl": images[0].public_url if images else "", "productImageId": image_ids[0] if image_ids else "",
                "productImageIndex": 0, "productImageIds": ",".join(image_ids), "productImageCount": len(image_ids),
                "productNameColor": "#173C29", "productPriceColor": "#0E7A43", "productMetaColor": "#60746A",
                "productNameSize": 22, "productPriceSize": 18, "productMetaSize": 12,
            },
        ))
        if vip is not None:
            elements.append(text_element(
                f"VIP price {product.sku}",
                f"THB {vip:,.2f}",
                x=70,
                y=y + 21,
                width=20,
                height=3,
                size=11,
                color="#7A5A00",
                bold=True,
                align="center",
                background="#FFF2B8",
                radius=12,
                z=5,
            ))
    elements.extend([
        text_element("Price note title", "Flexible price mapping", x=7, y=91, width=30, height=3, size=13, color="#0E7A43", bold=True),
        text_element("Price note", "Two price slots are configured. Each user can map them to authorized ERP price levels before publishing; customer-level names stay out of the catalogue.", x=34, y=91, width=58, height=5, size=12, color="#60746A"),
    ])
    return elements


def final_elements() -> list[dict]:
    return [
        shape("Final background", x=0, y=0, width=100, height=100, color="#0B4F2F"),
        shape("Final accent", x=8, y=11, width=84, height=1, color="#80D39B", radius=4, z=2),
        text_element("Final GMS", "GMS", x=10, y=18, width=25, height=8, size=42, color="#FFFFFF", bold=True),
        text_element("Final title", "READY TO\nCUSTOMIZE", x=10, y=36, width=75, height=20, size=53, color="#FFFFFF", bold=True),
        text_element("Final text", "Open this sample in Catalogue Studio to replace products, reorder layers, upload media, change layouts, configure prices, preview responsively and export the finished catalogue as PDF.", x=10, y=60, width=70, height=12, size=18, color="#D8EFE0"),
        text_element("Final action", "OPEN THE EDITOR  →", x=10, y=77, width=37, height=6, size=17, color="#0B4F2F", bold=True, align="center", background="#FFFFFF", radius=14),
        text_element("Final footer", "G.M.S. Corporation Co., Ltd.  •  Catalogue Department  •  Sample edition 2026", x=10, y=92, width=80, height=4, size=13, color="#BDE8CA"),
    ]


def select_products(db) -> list[tuple[str, list[Product]]]:
    groups: list[tuple[str, list[Product]]] = []
    for brand in BRAND_NAMES:
        candidates = list(db.scalars(
            select(Product)
            .options(
                selectinload(Product.images),
                selectinload(Product.categories),
            )
            .join(ProductImage, ProductImage.product_id == Product.id)
            .where(
                Product.status == "active",
                Product.brand == brand,
                Product.source_record_exists.is_(True),
                Product.barcode.is_not(None),
                Product.stock_quantity > 0,
            )
            .group_by(Product.id)
            .order_by(Product.stock_quantity.desc(), Product.erp_name.asc())
            .limit(24)
        ).unique())
        selected: list[Product] = []
        used_categories: set[str] = set()
        for candidate in candidates:
            category = (candidate.erp_category or "").casefold()
            if category and category not in used_categories:
                selected.append(candidate)
                used_categories.add(category)
            if len(selected) == 4:
                break
        if len(selected) < 4:
            for candidate in candidates:
                if candidate not in selected:
                    selected.append(candidate)
                if len(selected) == 4:
                    break
        if len(selected) != 4:
            raise RuntimeError(f"{brand} does not have four active ERP products with images, barcode and stock.")
        groups.append((brand, selected))
    return groups


def main() -> None:
    with SessionLocal() as db:
        existing = db.scalar(select(CatalogueDesign).where(
            CatalogueDesign.name == SAMPLE_NAME,
            CatalogueDesign.deleted_at.is_(None),
        ))
        if existing:
            changed = False
            replacements = {
                "✓ Active ERP products only   ✓ Multiple synchronized images   ✓ Stock and barcode   ✓ Normal + VIP BKK price slots   ✓ Editable pages and layers   ✓ Web preview and PDF export":
                    "✓ Active ERP products only   ✓ Multiple synchronized images   ✓ Stock and barcode   ✓ Two configurable price slots   ✓ Editable pages and layers   ✓ Web preview and PDF export",
                "Normal and VIP BKK are sample audience labels. Each user can map those labels to authorized ERP price levels before publishing.":
                    "Two price slots are configured. Each user can map them to authorized ERP price levels before publishing; customer-level names stay out of the catalogue.",
            }
            for saved_page in existing.pages:
                document = deepcopy(saved_page.page_data_json)
                for saved_element in document.get("elements", []):
                    current_text = saved_element.get("text")
                    if current_text in replacements:
                        saved_element["text"] = replacements[current_text]
                        changed = True
                    saved_style = saved_element.get("style") or {}
                    current_price = str(saved_style.get("productPrice") or "")
                    if current_price.startswith("Normal THB "):
                        saved_style["productPrice"] = current_price.removeprefix("Normal ")
                        changed = True
                    if str(saved_element.get("name") or "").startswith("VIP price ") and isinstance(current_text, str) and current_text.startswith("VIP BKK  THB "):
                        saved_element["text"] = current_text.removeprefix("VIP BKK  ")
                        changed = True
                saved_page.page_data_json = document
            if changed:
                existing.revision += 1
                existing.updated_by_id = existing.created_by_id
                version_number = existing.current_version + 1
                db.flush()
                db.add(CatalogueDesignVersion(
                    design_id=existing.id,
                    version_number=version_number,
                    snapshot_json=_snapshot(existing, db),
                    change_summary="Hide internal customer-level names from catalogue output",
                    created_by_id=existing.created_by_id,
                ))
                existing.current_version = version_number
                db.commit()
                print(f"Updated sample to version {version_number}.")
            print(f"Sample already exists: {existing.id}")
            print(f"Editor:  http://127.0.0.1/catalogue-studio/{existing.id}/editor")
            print(f"Preview: http://127.0.0.1/catalogue-studio/{existing.id}/preview")
            return

        actor = db.scalar(select(User).where(User.username == "SuperAdmin", User.is_active.is_(True)))
        if not actor:
            raise RuntimeError("The active SuperAdmin account is required to own the sample.")

        brands = list(db.scalars(select(Brand).where(Brand.name.in_(BRAND_NAMES), Brand.is_active.is_(True))))
        by_brand = {brand.name: brand for brand in brands}
        missing = [name for name in BRAND_NAMES if name not in by_brand]
        if missing:
            raise RuntimeError(f"ERP brand records are missing: {', '.join(missing)}")

        normal = db.scalar(select(PriceList).where(PriceList.code == "NORMAL", PriceList.is_active.is_(True)))
        vip = db.scalar(select(PriceList).where(PriceList.code == "VIP", PriceList.is_active.is_(True)))
        if not normal or not vip:
            raise RuntimeError("The NORMAL and VIP ERP price lists are required.")

        groups = select_products(db)
        selected_products = [product for _, products in groups for product in products]
        prices = latest_prices(db, [product.id for product in selected_products], [normal.id, vip.id])

        design = CatalogueDesign(
            name=SAMPLE_NAME,
            status="published",
            page_width=PAGE_WIDTH,
            page_height=PAGE_HEIGHT,
            orientation="portrait",
            size_preset="a4_portrait",
            data_mode="live",
            catalogue_type="standard",
            brand_mode="multiple",
            timezone="Asia/Bangkok",
            current_version=0,
            revision=1,
            created_by_id=actor.id,
            updated_by_id=actor.id,
        )
        db.add(design)
        db.flush()

        for order, name in enumerate(BRAND_NAMES, start=1):
            db.add(CatalogueDesignBrand(
                design_id=design.id,
                brand_id=by_brand[name].id,
                display_order=order,
                is_visible=True,
            ))
        db.add_all([
            CatalogueDesignPriceSlot(
                design_id=design.id,
                slot_number=1,
                price_list_id=normal.id,
                display_label="Normal",
                currency_display="code",
                decimal_places=2,
                is_visible=True,
            ),
            CatalogueDesignPriceSlot(
                design_id=design.id,
                slot_number=2,
                price_list_id=vip.id,
                display_label="VIP BKK",
                currency_display="code",
                decimal_places=2,
                is_visible=True,
            ),
        ])
        for order, product in enumerate(selected_products, start=1):
            db.add(CatalogueDesignProduct(
                design_id=design.id,
                product_id=product.id,
                display_order=order,
                is_visible=True,
            ))

        pages = [
            page(design.id, 1, "cover", "Cover", "#0B4F2F", cover_elements()),
            page(design.id, 2, "table_of_contents", "Contents", "#F7FAF8", contents_elements(groups)),
        ]
        for order, (brand, products) in enumerate(groups, start=3):
            pages.append(page(
                design.id,
                order,
                "product_grid",
                brand,
                "#F5F8F6",
                product_page_elements(brand, products, prices, normal.id),
            ))
        pages.extend([
            page(design.id, 6, "product_detail", "Featured details", "#F7FAF8", detail_elements(selected_products, prices, normal.id, vip.id)),
            page(design.id, 7, "final", "Finish", "#0B4F2F", final_elements()),
        ])
        db.add_all(pages)
        db.flush()

        version = CatalogueDesignVersion(
            design_id=design.id,
            version_number=1,
            snapshot_json=_snapshot(design, db),
            change_summary="Complete ERP-backed sample catalogue",
            created_by_id=actor.id,
        )
        db.add(version)
        design.current_version = 1
        db.add(AuditLog(
            user_id=actor.id,
            action="catalogue_design_sample_created",
            module="catalogue_studio",
            status="success",
            identifier=str(design.id),
            details={
                "name": SAMPLE_NAME,
                "brands": list(BRAND_NAMES),
                "product_count": len(selected_products),
                "page_count": len(pages),
                "price_lists": [normal.code, vip.code],
            },
        ))
        db.commit()

        print(f"Created sample: {design.id}")
        print(f"Pages: {len(pages)}")
        print(f"Active ERP products: {len(selected_products)}")
        print(f"Brands: {', '.join(BRAND_NAMES)}")
        print(f"Editor:  http://127.0.0.1/catalogue-studio/{design.id}/editor")
        print(f"Preview: http://127.0.0.1/catalogue-studio/{design.id}/preview")


if __name__ == "__main__":
    main()
