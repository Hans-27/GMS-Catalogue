"""Business rules for reusable Catalogue Studio product-card templates.

Card *instances* intentionally remain in the versioned page JSON document.  A
template is copied into an instance when it is used, so later template edits
cannot silently change a draft or an immutable published catalogue version.
"""

from __future__ import annotations

import copy
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.access import has_permission, is_superadmin
from app.design_studio_models import ProductCardTemplate, ProductCardTemplateVersion
from app.design_studio_schemas import ProductCardTemplatePayload, ProductCardTemplateUpdate
from app.models import User


def _style(layout: str, fields: list[str], *, price_mode: str = "one_price", **extra) -> dict:
    base = {
        "cardLayout": layout,
        "layoutMode": "responsive",
        "backgroundColor": "#FFFFFF",
        "borderColor": "#D7E3DC",
        "borderWidth": 1,
        "borderStyle": "solid",
        "borderRadius": 18,
        "boxShadow": 8,
        "shadowBlur": 8,
        "shadowColor": "#123D29",
        "shadowOpacity": 18,
        "shadowOffsetY": 4,
        "padding": 16,
        "cardPadding": 16,
        "internalGap": 10,
        "imageFit": "contain",
        "objectFit": "contain",
        "imagePosition": "center",
        "imageAreaRatio": 48,
        "productImageHeight": 52,
        "textAreaRatio": 52,
        "showProductImage": "image" in fields,
        "showProductName": "name" in fields,
        "showProductSku": "code" in fields,
        "showProductBrand": "brand" in fields,
        "showProductCategory": "category" in fields,
        "showProductDescription": "description" in fields,
        "showProductStock": "stock" in fields,
        "showProductBarcode": "barcode" in fields,
        "showProductPrice": price_mode != "no_price",
        "showSecondaryPrice": price_mode == "two_prices",
        "priceMode": price_mode,
        "overflowBehavior": "hidden",
        "lockAspectRatio": False,
    }
    base.update(extra)
    return base


SYSTEM_TEMPLATE_DEFINITIONS: tuple[dict, ...] = (
    {"name": "Standard Product Card", "template_type": "standard", "size": (320, 420), "layout": "classic", "fields": ["image", "name", "code", "brand", "price"]},
    {"name": "Compact Product Card", "template_type": "compact", "size": (260, 240), "layout": "minimal", "fields": ["image", "name", "code", "price"], "style": {"padding": 10, "borderRadius": 12, "boxShadow": 2}},
    {"name": "Horizontal Product Card", "template_type": "horizontal", "size": (520, 260), "layout": "image_left", "fields": ["image", "name", "code", "brand", "description", "price"]},
    {"name": "Image Focus Product Card", "template_type": "image_focus", "size": (360, 420), "layout": "classic", "fields": ["image", "name", "price"], "style": {"imageAreaRatio": 70, "textAreaRatio": 30}},
    {"name": "Two Price Product Card", "template_type": "two_price", "size": (360, 430), "layout": "price_focus", "fields": ["image", "name", "code", "price"], "price_mode": "two_prices", "style": {"secondaryPriceColor": "#B42318"}},
    {"name": "Product Specification Card", "template_type": "specification", "size": (440, 460), "layout": "erp_detail", "fields": ["image", "name", "code", "category", "description", "stock", "barcode", "price"]},
    {"name": "Promotion Product Card", "template_type": "promotion", "size": (360, 420), "layout": "price_focus", "fields": ["image", "name", "code", "price"], "style": {"backgroundColor": "#FFF9D8", "accentColor": "#F59E0B", "showPromotionBadge": True}},
    {"name": "No Price Product Card", "template_type": "no_price", "size": (320, 390), "layout": "classic", "fields": ["image", "name", "code", "brand", "description"], "price_mode": "no_price"},
    {"name": "Product Card with Stock", "template_type": "stock", "size": (340, 420), "layout": "classic", "fields": ["image", "name", "code", "stock", "price"], "style": {"stockMode": "available"}},
    {"name": "Product Card with Barcode", "template_type": "barcode", "size": (360, 430), "layout": "classic", "fields": ["image", "name", "code", "barcode", "price"], "style": {"showBarcodeText": True}},
    {
        "name": "Emerald Showcase Card",
        "description": "Premium green showcase for general retail products and brand catalogues.",
        "template_type": "emerald_showcase",
        "size": (360, 440),
        "layout": "classic",
        "fields": ["image", "name", "code", "brand", "price"],
        "recommended_for": "General retail and flagship products",
        "style": {
            "backgroundColor": "#F3FFF7", "borderColor": "#17804A", "borderWidth": 2,
            "borderRadius": 28, "shadowBlur": 18, "shadowColor": "#0C5B35",
            "shadowOpacity": 20, "shadowOffsetY": 7, "cardPadding": 16,
            "productImageHeight": 58, "productNameColor": "#123B27",
            "productPriceColor": "#08783E", "productMetaColor": "#4D7060",
            "productNameSize": 25, "productPriceSize": 24, "productMetaSize": 13,
            "accentColor": "#31C978",
        },
    },
    {
        "name": "Midnight Technology Card",
        "description": "Dark landscape card with vivid teal details for electronics and gaming products.",
        "template_type": "midnight_technology",
        "size": (540, 270),
        "layout": "image_left",
        "fields": ["image", "name", "code", "brand", "description", "price"],
        "recommended_for": "Technology, gaming and electronics",
        "style": {
            "backgroundColor": "#101827", "borderColor": "#2DD4BF", "borderWidth": 2,
            "borderRadius": 18, "shadowBlur": 20, "shadowColor": "#020617",
            "shadowOpacity": 32, "shadowOffsetY": 8, "cardPadding": 15,
            "productNameColor": "#F8FAFC", "productPriceColor": "#5EEAD4",
            "productMetaColor": "#A7F3D0", "productNameSize": 25,
            "productPriceSize": 23, "productMetaSize": 13, "accentColor": "#2DD4BF",
        },
    },
    {
        "name": "Sunrise Promotion Card",
        "description": "Warm high-impact card for promotions, launches and limited-time offers.",
        "template_type": "sunrise_promotion",
        "size": (370, 440),
        "layout": "classic",
        "fields": ["image", "name", "code", "price", "badge"],
        "recommended_for": "Promotions and new-product launches",
        "style": {
            "backgroundColor": "#FFF7E6", "borderColor": "#FB923C", "borderWidth": 2,
            "borderRadius": 36, "shadowBlur": 17, "shadowColor": "#C2410C",
            "shadowOpacity": 18, "shadowOffsetY": 7, "cardPadding": 17,
            "productImageHeight": 60, "productNameColor": "#7C2D12",
            "productPriceColor": "#EA580C", "productMetaColor": "#9A5A34",
            "productNameSize": 25, "productPriceSize": 28, "productMetaSize": 13,
            "accentColor": "#F97316", "showPromotionBadge": True,
        },
    },
    {
        "name": "Royal Premium Card",
        "description": "Elegant violet card for premium ranges, beauty, gifting and lifestyle products.",
        "template_type": "royal_premium",
        "size": (360, 450),
        "layout": "classic",
        "fields": ["image", "name", "code", "brand", "description", "price"],
        "recommended_for": "Premium, beauty and lifestyle ranges",
        "style": {
            "backgroundColor": "#FBF8FF", "borderColor": "#8B5CF6", "borderWidth": 2,
            "borderRadius": 22, "shadowBlur": 22, "shadowColor": "#4C1D95",
            "shadowOpacity": 19, "shadowOffsetY": 8, "cardPadding": 18,
            "productImageHeight": 57, "productNameColor": "#3B1764",
            "productPriceColor": "#6D28D9", "productMetaColor": "#76578F",
            "productNameSize": 24, "productPriceSize": 24, "productMetaSize": 13,
            "accentColor": "#A78BFA",
        },
    },
    {
        "name": "Clean Retail Card",
        "description": "Simple border-light layout for dense catalogues and easy price comparison.",
        "template_type": "clean_retail",
        "size": (330, 400),
        "layout": "classic",
        "fields": ["image", "name", "code", "price"],
        "recommended_for": "Dense catalogues and price-led retail",
        "style": {
            "backgroundColor": "#FFFFFF", "borderColor": "#D8E0E7", "borderWidth": 1,
            "borderRadius": 6, "shadowBlur": 0, "shadowOpacity": 0, "cardPadding": 13,
            "productImageHeight": 64, "productNameColor": "#17212B",
            "productPriceColor": "#0F766E", "productMetaColor": "#64748B",
            "productNameSize": 22, "productPriceSize": 22, "productMetaSize": 12,
            "accentColor": "#14B8A6",
        },
    },
    {
        "name": "ERP Specification Blue Card",
        "description": "Structured ERP-detail card with image, product code, barcode, stock and mapped price.",
        "template_type": "erp_specification_blue",
        "size": (520, 340),
        "layout": "erp_detail",
        "fields": ["image", "name", "code", "category", "description", "stock", "barcode", "price"],
        "recommended_for": "Technical products and stock-led sales",
        "style": {
            "backgroundColor": "#F2F7FF", "borderColor": "#2563EB", "borderWidth": 2,
            "borderRadius": 26, "shadowBlur": 16, "shadowColor": "#1E3A8A",
            "shadowOpacity": 18, "shadowOffsetY": 6, "cardPadding": 14,
            "productNameColor": "#172554", "productPriceColor": "#1D4ED8",
            "productMetaColor": "#526481", "productNameSize": 23,
            "productPriceSize": 22, "productMetaSize": 12,
            "detailAccentColor": "#2563EB", "accentColor": "#60A5FA",
            "showProductDescription": True,
        },
    },
)


# Keep the governed company library intentionally small.  The definitions
# above are retained only so older seeded names can be retired safely; user
# templates are never removed or hidden by this migration.
GOVERNED_SYSTEM_TEMPLATE_DEFINITIONS: tuple[dict, ...] = (
    {
        "key": "gms-essential",
        "name": "GMS Essential Card",
        "description": "Approved everyday card with the minimum ERP identity and mapped selling price.",
        "template_type": "gms_essential",
        "size": (330, 410),
        "layout": "classic",
        "fields": ["image", "name", "code", "price"],
        "required_fields": ["image", "name", "code", "price"],
        "recommended_for": "General brand catalogues and everyday sales",
        "style": {
            "fontFamily": "Arial", "backgroundColor": "#FFFFFF", "borderColor": "#C9DDD1",
            "borderRadius": 18, "accentColor": "#126B3A", "productNameColor": "#173C29",
            "productPriceColor": "#0E7A43", "productMetaColor": "#60746A",
            "productNameSize": 23, "productPriceSize": 22, "productMetaSize": 12,
        },
    },
    {
        "key": "gms-erp-detail",
        "name": "GMS ERP Detail Card",
        "description": "Approved technical card with synchronized code, barcode, stock and price.",
        "template_type": "gms_erp_detail",
        "size": (520, 340),
        "layout": "erp_detail",
        "fields": ["image", "name", "code", "barcode", "stock", "price"],
        "required_fields": ["image", "name", "code", "barcode", "stock"],
        "recommended_for": "Technical, wholesale and stock-led catalogues",
        "style": {
            "fontFamily": "Arial", "backgroundColor": "#F3F8F5", "borderColor": "#126B3A",
            "borderWidth": 2, "borderRadius": 24, "accentColor": "#126B3A",
            "detailAccentColor": "#126B3A", "productNameColor": "#173C29",
            "productPriceColor": "#0E7A43", "productMetaColor": "#526B5D",
            "showBarcodeText": True,
        },
    },
    {
        "key": "gms-retail-story",
        "name": "GMS Retail Story Card",
        "description": "Approved image-led retail card with customer-facing description and brand context.",
        "template_type": "gms_retail_story",
        "size": (370, 460),
        "layout": "classic",
        "fields": ["image", "name", "code", "brand", "description", "price"],
        "required_fields": ["image", "name", "code"],
        "recommended_for": "Consumer, lifestyle and image-led ranges",
        "style": {
            "fontFamily": "Arial", "backgroundColor": "#F7FCF9", "borderColor": "#AFCFBA",
            "borderRadius": 28, "accentColor": "#31A66A", "productImageHeight": 58,
            "productNameColor": "#173C29", "productPriceColor": "#0E7A43",
            "productMetaColor": "#60746A", "showProductDescription": True,
        },
    },
    {
        "key": "gms-horizontal-sales",
        "name": "GMS Horizontal Sales Card",
        "description": "Approved wide card for product stories, specifications and sales presentations.",
        "template_type": "gms_horizontal_sales",
        "size": (540, 280),
        "layout": "image_left",
        "fields": ["image", "name", "code", "brand", "model", "warranty", "description", "price"],
        "required_fields": ["image", "name", "code"],
        "recommended_for": "Landscape pages, presentations and detailed product stories",
        "style": {
            "fontFamily": "Arial", "backgroundColor": "#FFFFFF", "borderColor": "#B9D0C1",
            "borderRadius": 16, "accentColor": "#126B3A", "imageAreaRatio": 42,
            "productNameColor": "#173C29", "productPriceColor": "#0E7A43",
            "productMetaColor": "#60746A", "showProductDescription": True,
        },
    },
    {
        "key": "gms-promotion-two-price",
        "name": "GMS Promotion Two-Price Card",
        "description": "Approved promotional card with two user-mapped ERP price slots.",
        "template_type": "gms_promotion_two_price",
        "size": (370, 440),
        "layout": "price_focus",
        "fields": ["image", "name", "code", "badge", "price"],
        "required_fields": ["image", "name", "code", "price"],
        "price_mode": "two_prices",
        "recommended_for": "Promotions that compare two authorized customer prices",
        "style": {
            "fontFamily": "Arial", "backgroundColor": "#FFF8D9", "borderColor": "#D7A900",
            "borderWidth": 2, "borderRadius": 30, "accentColor": "#F2C94C",
            "productNameColor": "#3C3100", "productPriceColor": "#0E7A43",
            "secondaryPriceColor": "#B42318", "productMetaColor": "#6F6330",
            "showPromotionBadge": True,
        },
    },
    {
        "key": "gms-technical-no-price",
        "name": "GMS Technical No-Price Card",
        "description": "Approved specification card for catalogues where monetary values must remain hidden.",
        "template_type": "gms_technical_no_price",
        "size": (440, 450),
        "layout": "erp_detail",
        "fields": ["image", "name", "code", "barcode", "stock", "description"],
        "required_fields": ["image", "name", "code", "barcode"],
        "price_mode": "no_price",
        "recommended_for": "Technical sheets and no-price customer catalogues",
        "style": {
            "fontFamily": "Arial", "backgroundColor": "#F5F8F6", "borderColor": "#64776C",
            "borderRadius": 18, "accentColor": "#526B5D", "detailAccentColor": "#526B5D",
            "productNameColor": "#17251F", "productMetaColor": "#60746A",
            "showProductDescription": True, "showBarcodeText": True,
        },
    },
)

GOVERNED_STYLE_KEYS = (
    "fontFamily", "backgroundColor", "borderColor", "accentColor", "detailAccentColor",
    "productNameColor", "productPriceColor", "productMetaColor", "secondaryPriceColor",
)


def ensure_system_templates(db: Session) -> None:
    existing = {
        item.name: item
        for item in db.scalars(
            select(ProductCardTemplate).where(ProductCardTemplate.is_company_template.is_(True))
        )
    }
    changed = False
    governed_names = {definition["name"] for definition in GOVERNED_SYSTEM_TEMPLATE_DEFINITIONS}
    legacy_names = {definition["name"] for definition in SYSTEM_TEMPLATE_DEFINITIONS} - governed_names
    for item in existing.values():
        if item.owner_user_id is None and item.name in legacy_names and item.is_active:
            item.is_active = False
            changed = True
    for definition in GOVERNED_SYSTEM_TEMPLATE_DEFINITIONS:
        width, height = definition["size"]
        price_mode = definition.get("price_mode", "one_price")
        style = _style(definition["layout"], definition["fields"], price_mode=price_mode, **definition.get("style", {}))
        template_data = {
            "schemaVersion": 4,
            "systemTemplateVersion": 1,
            "style": style,
            "includedFields": definition["fields"],
            "bindings": {field: f"product.{field}" for field in definition["fields"]},
            "recommendedFor": definition.get("recommended_for", "Everyday catalogue use"),
            "governance": {
                "profile": "gms-brand-v1",
                "systemTemplateKey": definition["key"],
                "brandLocked": True,
                "lockedStyleKeys": list(GOVERNED_STYLE_KEYS),
                "requiredFields": definition["required_fields"],
                "fontFamily": "Arial",
                "palette": ["#126B3A", "#173C29", "#0E7A43", "#FFFFFF"],
            },
        }
        current = existing.get(definition["name"])
        if current is not None:
            # Upgrade only older built-in definitions. Personal templates and
            # later user-created instances remain untouched and independent.
            current_data = current.template_data_json or {}
            if int(current_data.get("schemaVersion", 1)) < 4 or int(current_data.get("systemTemplateVersion", 0)) < 1:
                current.template_data_json = template_data
                current.description = definition.get(
                    "description",
                    f"Ready-to-use {definition['name'].lower()} with live ERP product bindings.",
                )
                current.template_type = definition["template_type"]
                current.card_width = width
                current.card_height = height
                current.aspect_ratio = width / height
                current.price_mode = price_mode
                current.current_version += 1
                current.is_active = True
                current.approval_status = "approved"
                add_version(db, current, None, "Applied GMS brand governance")
                changed = True
            continue
        template = ProductCardTemplate(
            name=definition["name"],
            description=definition.get(
                "description",
                f"Ready-to-use {definition['name'].lower()} with live ERP product bindings.",
            ),
            template_type=definition["template_type"],
            template_data_json=template_data,
            card_width=width,
            card_height=height,
            min_width=min(120, width),
            min_height=min(100, height),
            aspect_ratio=width / height,
            border_radius=int(style.get("borderRadius", 16)),
            dimension_unit="px",
            layout_mode="responsive",
            price_mode=price_mode,
            visibility_scope="company",
            is_company_template=True,
            approval_status="approved",
            current_version=1,
            is_active=True,
        )
        db.add(template)
        db.flush()
        add_version(db, template, None, "Initial system template")
        changed = True
    if changed:
        db.commit()


def _scope_ids(actor: User) -> tuple[int | None, int | None]:
    profile = actor.organization_profile
    return (
        profile.department_id if profile else None,
        profile.primary_team_id if profile else None,
    )


def visible_query(actor: User):
    if is_superadmin(actor):
        return ProductCardTemplate.deleted_at.is_(None)
    department_id, team_id = _scope_ids(actor)
    clauses = [
        ProductCardTemplate.owner_user_id == actor.id,
        ProductCardTemplate.is_company_template.is_(True),
        ProductCardTemplate.visibility_scope == "company",
    ]
    if department_id is not None:
        clauses.append(
            (ProductCardTemplate.visibility_scope == "department")
            & (ProductCardTemplate.department_id == department_id)
        )
    if team_id is not None:
        clauses.append(
            (ProductCardTemplate.visibility_scope == "team")
            & (ProductCardTemplate.team_id == team_id)
        )
    return ProductCardTemplate.deleted_at.is_(None) & or_(*clauses)


def get_visible_template(db: Session, actor: User, template_id: uuid.UUID) -> ProductCardTemplate:
    item = db.scalar(select(ProductCardTemplate).where(ProductCardTemplate.id == template_id, visible_query(actor)))
    if item is None:
        raise HTTPException(status_code=404, detail="Product card template not found.")
    return item


def _can_manage(actor: User, item: ProductCardTemplate, own_permission: str, all_permission: str) -> bool:
    if is_superadmin(actor) or has_permission(actor, all_permission):
        return True
    return item.owner_user_id == actor.id and has_permission(actor, own_permission)


def assert_can_edit(actor: User, item: ProductCardTemplate) -> None:
    if item.is_company_template and not is_superadmin(actor) and not has_permission(actor, "product_card_templates.edit_all"):
        raise HTTPException(status_code=403, detail="System templates cannot be edited directly. Duplicate the template first.")
    if not _can_manage(actor, item, "product_card_templates.edit_own", "product_card_templates.edit_all"):
        raise HTTPException(status_code=403, detail="You cannot edit this product card template.")


def assert_can_delete(actor: User, item: ProductCardTemplate) -> None:
    if item.is_company_template and not is_superadmin(actor):
        raise HTTPException(status_code=403, detail="System templates cannot be deleted.")
    if not _can_manage(actor, item, "product_card_templates.delete_own", "product_card_templates.delete_all"):
        raise HTTPException(status_code=403, detail="You cannot delete this product card template.")


def add_version(
    db: Session,
    template: ProductCardTemplate,
    actor: User | None,
    change_note: str,
    *,
    template_data: dict | None = None,
    version_number: int | None = None,
) -> ProductCardTemplateVersion:
    data = copy.deepcopy(template_data if template_data is not None else template.template_data_json)
    version_number = version_number or template.current_version
    version = ProductCardTemplateVersion(
        template_id=template.id,
        version_number=version_number,
        width=template.card_width,
        height=template.card_height,
        layout_mode=template.layout_mode,
        card_properties_json=data.get("style", data),
        elements_json=data.get("elements", []),
        change_note=change_note,
        created_by_id=actor.id if actor else None,
    )
    db.add(version)
    return version


def create_template(db: Session, actor: User, payload: ProductCardTemplatePayload) -> ProductCardTemplate:
    department_id, team_id = _scope_ids(actor)
    if payload.is_company_template and not has_permission(actor, "product_card_templates.approve"):
        raise HTTPException(status_code=403, detail="Approval permission is required for company templates.")
    item = ProductCardTemplate(
        name=payload.name,
        description=payload.description,
        template_type=payload.template_type,
        owner_user_id=actor.id,
        department_id=department_id if payload.visibility_scope == "department" else None,
        team_id=team_id if payload.visibility_scope == "team" else None,
        thumbnail_storage_key=payload.thumbnail_storage_key,
        template_data_json=copy.deepcopy(payload.template_data),
        card_width=payload.card_width,
        card_height=payload.card_height,
        dimension_unit=payload.dimension_unit,
        layout_mode=payload.layout_mode,
        min_width=payload.min_width,
        min_height=payload.min_height,
        aspect_ratio=payload.aspect_ratio or payload.card_width / payload.card_height,
        price_mode=payload.price_mode,
        visibility_scope=payload.visibility_scope,
        is_company_template=payload.is_company_template,
        approval_status="approved" if payload.is_company_template and has_permission(actor, "product_card_templates.approve") else "draft",
        current_version=1,
        brand_scope_json=payload.brand_scope,
        category_scope_json=payload.category_scope,
        border_radius=payload.border_radius,
        is_active=payload.is_active,
        created_by_id=actor.id,
        updated_by_id=actor.id,
    )
    db.add(item)
    db.flush()
    add_version(db, item, actor, payload.change_note, version_number=1)
    return item


def update_template(db: Session, actor: User, item: ProductCardTemplate, payload: ProductCardTemplateUpdate) -> ProductCardTemplate:
    assert_can_edit(actor, item)
    values = payload.model_dump(exclude_unset=True)
    change_note = values.pop("change_note", "Updated template")
    if "visibility_scope" in values and values["visibility_scope"] != item.visibility_scope:
        if not is_superadmin(actor) and not has_permission(actor, "product_card_templates.share"):
            raise HTTPException(status_code=403, detail="Sharing permission is required to change template visibility.")
    mapping = {
        "template_data": "template_data_json",
        "brand_scope": "brand_scope_json",
        "category_scope": "category_scope_json",
    }
    for key, value in values.items():
        setattr(item, mapping.get(key, key), copy.deepcopy(value))
    if item.min_width > item.card_width or item.min_height > item.card_height:
        raise HTTPException(status_code=422, detail="Minimum dimensions cannot exceed the default card dimensions.")
    item.aspect_ratio = item.aspect_ratio or item.card_width / item.card_height
    item.current_version += 1
    item.updated_by_id = actor.id
    add_version(db, item, actor, change_note)
    return item


def duplicate_template(db: Session, actor: User, source: ProductCardTemplate) -> ProductCardTemplate:
    payload = ProductCardTemplatePayload(
        name=f"{source.name} Copy",
        description=source.description,
        template_type=source.template_type,
        template_data=copy.deepcopy(source.template_data_json),
        card_width=source.card_width,
        card_height=source.card_height,
        border_radius=source.border_radius,
        dimension_unit=source.dimension_unit,
        layout_mode=source.layout_mode,
        min_width=source.min_width,
        min_height=source.min_height,
        aspect_ratio=source.aspect_ratio,
        price_mode=source.price_mode,
        visibility_scope="only_me",
        is_company_template=False,
        brand_scope=copy.deepcopy(source.brand_scope_json),
        category_scope=copy.deepcopy(source.category_scope_json),
        change_note=f"Duplicated from {source.name}",
    )
    return create_template(db, actor, payload)


def restore_version(db: Session, actor: User, item: ProductCardTemplate, version: ProductCardTemplateVersion) -> ProductCardTemplate:
    assert_can_edit(actor, item)
    item.card_width = version.width
    item.card_height = version.height
    item.layout_mode = version.layout_mode
    item.template_data_json = {
        **copy.deepcopy(item.template_data_json),
        "style": copy.deepcopy(version.card_properties_json),
        "elements": copy.deepcopy(version.elements_json),
    }
    item.current_version += 1
    item.updated_by_id = actor.id
    add_version(db, item, actor, f"Restored version {version.version_number}")
    return item


def soft_delete(item: ProductCardTemplate, actor: User) -> None:
    assert_can_delete(actor, item)
    item.is_active = False
    item.deleted_at = datetime.now(UTC)
    item.updated_by_id = actor.id
