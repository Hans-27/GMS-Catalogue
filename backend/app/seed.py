from datetime import UTC, datetime, timedelta
from decimal import Decimal
import re

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, noload

from app.commerce_models import CatalogueAudienceType, PriceList, ProductPrice
from app.models import Brand, CatalogueEntry, Category, Permission, Product, Role, User, role_permissions
from app.promotion_models import PromotionOccasion


ROLE_DEFINITIONS = {
    "system_user": "Baseline account with read-only access to all ERP products.",
    "superadmin": "Protected system role with unrestricted platform access.",
    "catalogue_manager": "Manages products, categories, images and catalogue presentation.",
    "catalogue_editor": "Creates assigned products, images and draft catalogues.",
    "price_manager": "Manages prices for explicitly assigned price lists.",
    "catalogue_approver": "Reviews, rejects, approves and publishes catalogues.",
    "sales_manager": "Sales Admin: operational access without People & Access administration.",
    "sales_user": "Sales: views published catalogues and copies customer share links.",
    "customer_user": "Customer: opens published catalogues without platform management or link administration.",
    "auditor": "Read-only access to activity and audit information.",
    "system_operator": "Operates backups and system health without business-data access.",
    "promotion_manager": "Creates promotion content, products, prices, media and schedules.",
    "promotion_approver": "Legacy promotion operator with direct publishing access.",
    "promotion_publisher": "Publishes, pauses and cancels promotions.",
    # Kept as restricted compatibility templates for existing installations.
    "product_editor": "Legacy alias for the Catalogue Editor template.",
    "catalogue_admin": "Legacy catalogue manager template; not a SuperAdmin.",
    "viewer": "Legacy read-only template.",
}

PERMISSION_CODES = {
    "dashboard": ["view", "view_all_departments", "view_financial_metrics"],
    "products": ["view", "view_inactive", "change_status", "create", "edit", "delete", "restore", "import", "export", "publish", "bulk_edit"],
    "data_sync": ["view", "run", "configure"],
    "product_images": ["view", "upload", "edit", "delete", "approve"],
    "product_videos": ["view", "upload", "create_link", "edit", "delete", "set_featured", "publish", "view_inactive"],
    "brands": ["view", "create", "edit", "delete"],
    "categories": ["view", "create", "edit", "delete"],
    "prices": ["view", "propose", "edit", "approve", "reject", "import", "export", "view_cost", "view_margin", "view_history"],
    "catalogues": ["view", "create", "edit", "delete", "duplicate", "submit_review", "approve", "reject", "publish", "archive", "preview", "print", "export_pdf", "export_excel", "share", "view_drafts", "view_all_versions"],
    "catalogues.cover": ["view", "upload", "edit", "delete", "publish"],
    "catalogue_share_links": ["view", "create", "copy", "edit", "regenerate", "revoke", "delete"],
    "customer_portal": ["view"],
    "catalogue_audience_types": ["view", "manage"],
    "departments": ["view", "manage"],
    "positions": ["view", "create", "edit", "duplicate", "activate", "deactivate", "delete", "assign", "manage"],
    "teams": ["view", "create", "edit", "duplicate", "activate", "deactivate", "delete", "assign_members", "assign_roles"],
    "roles": ["view", "create", "edit", "delete", "assign", "duplicate", "activate", "deactivate", "manage_permissions"],
    "permissions": ["view", "manage"],
    "users": ["view", "create", "edit", "deactivate", "reset_password", "assign_roles", "assign_data_scope", "view_effective_permissions", "manage_superadmin"],
    "feedback": ["create", "view_own", "view_all", "manage"],
    "settings": ["view", "manage"],
    "backups": ["view", "create", "download", "delete", "schedule", "restore"],
    "system_metrics": ["view"],
    "system_information": ["view"],
    "system_settings": ["manage"],
    "audit_logs": ["view", "export"],
    "promotions": ["view", "create", "edit", "delete", "duplicate", "preview", "publish", "pause", "cancel", "view_all", "manage_products", "manage_prices", "manage_media", "manage_schedule", "manage_share_links", "export"],
    "promotion_occasions": ["view", "manage"],
    "catalogue_designs": ["view", "create", "edit", "delete", "duplicate", "publish", "export_pdf", "export_images", "export_templates", "manage_pages", "manage_elements"],
    "catalogue_studio": ["view", "create", "edit", "autosave", "preview", "publish", "export_pdf", "manage_pages", "manage_elements", "use_multiple_brands", "use_two_prices", "view_stock", "view_barcode", "view_additional_fields", "product_cards.add", "product_cards.edit", "product_cards.resize", "product_cards.delete", "product_cards.bulk_add", "product_cards.auto_layout", "product_cards.edit_fields", "product_cards.edit_prices", "product_cards.view_stock", "product_cards.view_barcode", "image_carousel.view", "image_carousel.add", "image_carousel.edit", "image_carousel.delete", "image_carousel.upload", "image_carousel.select_product_images", "image_carousel.reorder", "image_carousel.configure_transition", "image_carousel.configure_pdf"],
    "templates": ["view", "create", "edit", "delete", "publish", "share"],
    "catalogue_templates": ["view", "create", "edit_own", "edit_all", "delete_own", "delete_all", "upload", "share", "approve"],
    "promotion_catalogues": ["view", "create", "edit", "schedule", "approve", "publish", "pause", "cancel"],
    "product_card_templates": ["view", "create", "edit", "delete", "edit_own", "edit_all", "delete_own", "delete_all", "duplicate", "share", "approve", "view_versions", "restore_version"],
    "product_cards": ["view", "edit", "publish"],
    "design_media": ["view", "upload", "edit", "delete"],
}
HIGH_RISK_PERMISSIONS = {
    "products.delete", "catalogues.delete", "permissions.manage", "roles.delete",
    "users.manage_superadmin", "backups.delete", "backups.restore",
    "settings.manage", "system_information.view",
    "promotions.publish", "promotions.cancel", "promotions.delete",
}
PERMISSION_DEFINITIONS = {
    f"{module}.{action}": (module, f"{action.replace('_', ' ').title()} {module.replace('_', ' ')}.")
    for module, actions in PERMISSION_CODES.items()
    for action in actions
}
LEGACY_PERMISSION_DEFINITIONS = {
    "users.manage": ("users", "Legacy alias for user administration."),
    "organization.manage": ("organization", "Legacy organization management alias."),
    "catalogue.view": ("catalogue", "Legacy alias for product viewing."),
    "catalogue.edit": ("catalogue", "Legacy alias for product editing."),
    "catalogue.approve": ("catalogue", "Legacy catalogue approval alias."),
    "catalogue.publish": ("catalogue", "Legacy catalogue publishing alias."),
    "audit.view": ("audit", "Legacy audit viewing alias."),
    "overview.view": ("dashboard", "Legacy dashboard viewing alias."),
    "activity.view_own": ("audit", "Legacy own-activity alias."),
    "activity.view_department": ("audit", "Legacy department-activity alias."),
    "activity.view_all": ("audit", "Legacy full-activity alias."),
    "organization.view": ("organization", "Legacy organization viewing alias."),
    "catalogue_covers.view": ("catalogues.cover", "Legacy cover viewing alias."),
    "catalogue_covers.upload": ("catalogues.cover", "Legacy cover upload alias."),
    "catalogue_covers.edit": ("catalogues.cover", "Legacy cover editing alias."),
    "catalogue_covers.delete": ("catalogues.cover", "Legacy cover deletion alias."),
    "catalogue_covers.publish": ("catalogues.cover", "Legacy cover publishing alias."),
}
PERMISSION_DEFINITIONS.update(LEGACY_PERMISSION_DEFINITIONS)

PEOPLE_ACCESS_PERMISSION_MODULES = {
    "users",
    "departments",
    "positions",
    "teams",
    "roles",
    "permissions",
    "organization",
}

ROLE_PERMISSION_CODES = {
    "system_user": {"products.view"},
    "catalogue_manager": {"dashboard.view", "products.view", "products.view_inactive", "products.change_status", "products.create", "products.edit", "products.publish", "product_images.view", "product_images.upload", "product_images.edit", "product_images.delete", "product_images.approve", "product_videos.view", "product_videos.upload", "product_videos.create_link", "product_videos.edit", "product_videos.delete", "product_videos.set_featured", "product_videos.publish", "product_videos.view_inactive", "brands.view", "brands.create", "brands.edit", "categories.view", "categories.create", "categories.edit", "prices.view", "catalogues.view", "catalogues.create", "catalogues.edit", "catalogues.preview", "catalogues.duplicate", "catalogues.submit_review", "catalogues.approve", "catalogues.reject", "catalogues.publish", "catalogues.print", "catalogues.export_pdf", "catalogues.export_excel", "catalogues.view_all_versions", "catalogues.cover.view", "catalogues.cover.upload", "catalogues.cover.edit", "catalogues.cover.publish", "catalogue_share_links.view", "catalogue_share_links.create", "catalogue_share_links.copy", "catalogue_share_links.edit", "catalogue_share_links.regenerate", "catalogue_share_links.revoke", "catalogue_audience_types.view", "feedback.create"},
    "catalogue_editor": {"dashboard.view", "products.view", "products.create", "products.edit", "product_images.view", "product_images.upload", "product_images.edit", "product_videos.view", "product_videos.upload", "product_videos.create_link", "product_videos.edit", "product_videos.set_featured", "brands.view", "categories.view", "prices.view", "catalogues.view", "catalogues.create", "catalogues.edit", "catalogues.preview", "catalogues.cover.view", "feedback.create"},
    "price_manager": {"dashboard.view", "products.view", "prices.view", "prices.propose", "prices.edit", "prices.approve", "prices.reject", "prices.view_history", "feedback.create"},
    "catalogue_approver": {"dashboard.view", "products.view", "catalogues.view", "catalogues.preview", "catalogues.approve", "catalogues.reject", "catalogues.publish", "catalogues.print", "catalogues.export_pdf", "catalogues.view_all_versions", "audit_logs.view", "feedback.create"},
    "sales_manager": {
        code
        for code in PERMISSION_DEFINITIONS
        if code.split(".", maxsplit=1)[0] not in PEOPLE_ACCESS_PERMISSION_MODULES
    },
    "sales_user": {
        "catalogues.view", "catalogues.preview", "catalogues.cover.view",
        "catalogue_share_links.view", "catalogue_share_links.copy",
        "data_sync.view", "system_metrics.view", "settings.view",
    },
    "customer_user": {
        "catalogues.view", "catalogues.preview", "catalogues.cover.view",
        "customer_portal.view",
    },
    "viewer": {"dashboard.view", "catalogues.view", "catalogues.preview", "catalogues.cover.view"},
    "auditor": {"dashboard.view", "audit_logs.view", "audit_logs.export", "products.view", "catalogues.view", "catalogues.preview", "prices.view_history"},
    "system_operator": {"dashboard.view", "system_metrics.view", "backups.view", "backups.create", "backups.download"},
    "promotion_manager": {"dashboard.view", "products.view", "brands.view", "categories.view", "prices.view", "catalogues.view", "promotions.view", "promotions.create", "promotions.edit", "promotions.duplicate", "promotions.preview", "promotions.publish", "promotions.pause", "promotions.cancel", "promotions.view_all", "promotions.manage_products", "promotions.manage_prices", "promotions.manage_media", "promotions.manage_schedule", "promotions.manage_share_links", "promotions.export", "promotion_occasions.view", "feedback.create"},
    "promotion_approver": {"dashboard.view", "products.view", "brands.view", "prices.view", "promotions.view", "promotions.view_all", "promotions.preview", "promotions.publish", "promotions.pause", "promotions.cancel", "promotion_occasions.view", "audit_logs.view", "feedback.create"},
    "promotion_publisher": {"dashboard.view", "products.view", "catalogues.view", "promotions.view", "promotions.view_all", "promotions.preview", "promotions.publish", "promotions.pause", "promotions.cancel", "promotions.manage_share_links", "promotions.export", "promotion_occasions.view", "feedback.create"},
}
ROLE_PERMISSION_CODES["product_editor"] = set(ROLE_PERMISSION_CODES["catalogue_editor"])
ROLE_PERMISSION_CODES["catalogue_admin"] = set(ROLE_PERMISSION_CODES["catalogue_manager"])

DEPRECATED_PERMISSION_CODES = {
    "promotions.submit",
    "promotions.approve",
    "promotions.reject",
}

STUDIO_EDITOR_PERMISSIONS = {
    "catalogue_designs.view", "catalogue_designs.create", "catalogue_designs.edit",
    "catalogue_designs.duplicate", "catalogue_designs.export_pdf",
    "catalogue_designs.export_images", "catalogue_designs.manage_pages",
    "catalogue_designs.manage_elements", "templates.view", "templates.create",
    "templates.edit", "product_card_templates.view", "product_card_templates.create",
    "product_card_templates.edit", "product_card_templates.edit_own", "product_card_templates.delete_own",
    "product_card_templates.duplicate", "product_card_templates.view_versions",
    "design_media.view", "design_media.upload",
    "design_media.edit", "products.view",
    "catalogue_studio.view", "catalogue_studio.create", "catalogue_studio.edit",
    "catalogue_studio.autosave", "catalogue_studio.preview", "catalogue_studio.export_pdf",
    "catalogue_studio.manage_pages", "catalogue_studio.manage_elements",
    "catalogue_studio.view_barcode", "catalogue_studio.product_cards.add",
    "catalogue_studio.product_cards.edit", "catalogue_studio.product_cards.resize",
    "catalogue_studio.product_cards.delete", "catalogue_studio.product_cards.bulk_add",
    "catalogue_studio.product_cards.auto_layout", "catalogue_studio.product_cards.edit_fields",
    "catalogue_studio.product_cards.edit_prices", "catalogue_studio.product_cards.view_barcode",
    "catalogue_studio.image_carousel.view", "catalogue_studio.image_carousel.add",
    "catalogue_studio.image_carousel.edit", "catalogue_studio.image_carousel.delete",
    "catalogue_studio.image_carousel.upload", "catalogue_studio.image_carousel.select_product_images",
    "catalogue_studio.image_carousel.reorder", "catalogue_studio.image_carousel.configure_transition",
    "catalogue_studio.image_carousel.configure_pdf",
    "catalogue_templates.view", "catalogue_templates.create",
    "catalogue_templates.edit_own", "catalogue_templates.delete_own", "catalogue_templates.upload",
}
ROLE_PERMISSION_CODES["catalogue_editor"].update(STUDIO_EDITOR_PERMISSIONS)
ROLE_PERMISSION_CODES["product_editor"].update(STUDIO_EDITOR_PERMISSIONS)
ROLE_PERMISSION_CODES["catalogue_manager"].update(STUDIO_EDITOR_PERMISSIONS | {
    "catalogue_designs.delete", "catalogue_designs.publish", "catalogue_designs.export_templates",
    "templates.delete", "templates.publish", "templates.share", "product_card_templates.delete",
    "product_card_templates.edit_all", "product_card_templates.delete_all",
    "product_card_templates.share", "product_card_templates.approve",
    "product_card_templates.restore_version", "catalogue_studio.product_cards.view_stock",
    "design_media.delete",
    "catalogue_studio.publish", "catalogue_studio.use_multiple_brands",
    "catalogue_studio.use_two_prices", "catalogue_studio.view_stock",
    "catalogue_studio.view_additional_fields", "catalogue_templates.edit_all",
    "catalogue_templates.delete_all", "catalogue_templates.share", "catalogue_templates.approve",
    "promotion_catalogues.view", "promotion_catalogues.create", "promotion_catalogues.edit",
    "promotion_catalogues.schedule", "promotion_catalogues.approve", "promotion_catalogues.publish",
    "promotion_catalogues.pause", "promotion_catalogues.cancel",
})
ROLE_PERMISSION_CODES["catalogue_admin"].update(ROLE_PERMISSION_CODES["catalogue_manager"])

RECORD_PERMISSION_PREFIXES = (
    "products.", "product_images.", "product_videos.", "brands.", "categories.",
    "prices.", "catalogues.", "promotions.",
)


def _template_scope(role_name: str, permission_code: str) -> str:
    if not permission_code.startswith(RECORD_PERMISSION_PREFIXES):
        return "all"
    if role_name == "system_user" and permission_code == "products.view":
        return "all"
    if role_name == "catalogue_manager":
        return "all"
    if role_name in {"catalogue_editor", "product_editor"}:
        return "own" if permission_code.startswith("catalogues.") else "assigned_brands"
    if role_name == "price_manager":
        return "assigned_brands"
    if role_name == "catalogue_approver":
        return "department"
    if role_name == "sales_manager":
        return "all"
    if role_name == "sales_user":
        if permission_code.startswith("catalogues."):
            return "all"
        return "none"
    if role_name == "customer_user":
        if permission_code.startswith("catalogues."):
            return "all"
        return "none"
    if role_name == "viewer":
        if permission_code.startswith("catalogues."):
            return "assigned_catalogues"
        return "assigned_brands"
    if role_name == "auditor":
        return "department"
    if role_name == "catalogue_admin":
        return "all"
    return "none"

PRICE_LIST_DATA = [
    ("NORMAL", "Normal", "Standard customer price list.", False),
    ("VIP", "VIP BKK", "Preferred VIP BKK customer pricing.", False),
    ("BIG_CUSTOMER", "Big Customer", "Large customer account pricing.", False),
    ("DEALER", "Dealer", "Authorized dealer pricing.", False),
    ("WHOLESALE", "Wholesale", "Wholesale channel pricing.", False),
    ("RETAIL", "Retail", "Retail channel pricing.", False),
    ("NO_PRICE", "No Price", "Catalogue without monetary values.", True),
    ("VVIP", "VVIP", "Configurable very-VIP customer pricing.", False),
]

AUDIENCE_TYPE_DATA = [
    ("normal", "Normal", "NORMAL", True, 1, "normal"),
    ("big_customer_vip", "Big Customer & VIP", "BIG_CUSTOMER", True, 2, "business"),
    ("vip", "VIP BKK", "VIP", True, 3, "vip"),
    ("vip_province", "VIP Province", "VIP", True, 4, "vip"),
    ("vvip", "VVIP", "VVIP", True, 5, "vvip"),
    ("no_price", "No Price", "NO_PRICE", False, 6, "no_price"),
]

PROMOTION_OCCASION_DATA = [
    ("NEW_YEAR", "New Year", "ปีใหม่", "celebration", 1, 1, 1, 31, 10),
    ("CHINESE_NEW_YEAR", "Chinese New Year", "ตรุษจีน", "lantern", None, None, None, None, 20),
    ("VALENTINES", "Valentine's Day", "วันวาเลนไทน์", "heart", 2, 14, 2, 15, 30),
    ("SONGKRAN", "Songkran", "สงกรานต์", "water", 4, 13, 4, 16, 40),
    ("MOTHERS_DAY", "Mother's Day", "วันแม่", "flower", 8, 12, 8, 13, 50),
    ("FATHERS_DAY", "Father's Day", "วันพ่อ", "star", 12, 5, 12, 6, 60),
    ("COMPANY_ANNIVERSARY", "Company Anniversary", "วันครบรอบบริษัท", "building", None, None, None, None, 70),
    ("CHRISTMAS", "Christmas", "คริสต์มาส", "gift", 12, 25, 12, 26, 80),
    ("CAMPAIGN_9_9", "9.9 Campaign", "แคมเปญ 9.9", "sale", 9, 9, 9, 10, 90),
    ("CAMPAIGN_10_10", "10.10 Campaign", "แคมเปญ 10.10", "sale", 10, 10, 10, 11, 100),
    ("CAMPAIGN_11_11", "11.11 Campaign", "แคมเปญ 11.11", "sale", 11, 11, 11, 12, 110),
    ("CAMPAIGN_12_12", "12.12 Campaign", "แคมเปญ 12.12", "sale", 12, 12, 12, 13, 120),
    ("CLEARANCE", "Clearance Sale", "ลดล้างสต็อก", "clearance", None, None, None, None, 130),
    ("BRAND_LAUNCH", "Brand Launch", "เปิดตัวแบรนด์", "rocket", None, None, None, None, 140),
    ("CUSTOM", "Custom Occasion", "โอกาสพิเศษ", "calendar", None, None, None, None, 999),
]

CATEGORY_DATA = [
    ("Fresh Produce", "fresh-produce", "Fresh fruit, vegetables and herbs."),
    ("Pantry", "pantry", "Shelf-stable cooking and grocery essentials."),
    ("Beverages", "beverages", "Water, juices, tea and ready-to-drink products."),
    ("Household", "household", "Home care and household essentials."),
    ("Personal Care", "personal-care", "Everyday health and personal care."),
]

PRODUCT_DATA = [
    {
        "sku": "GMS-FR-001",
        "erp_name": "Premium Cavendish Bananas 1kg",
        "brand": "GMS Fresh",
        "barcode": "8850001000011",
        "unit": "bag",
        "erp_category": "Fruit",
        "price": Decimal("59.00"),
        "stock_quantity": 148,
        "category": "Fresh Produce",
        "status": "published",
        "visibility": "public",
        "featured": True,
        "short": "Naturally sweet Cavendish bananas, selected for everyday freshness.",
        "long": (
            "A one-kilogram pack of carefully selected Cavendish bananas. "
            "Ideal for breakfast, smoothies, baking and healthy snacks."
        ),
    },
    {
        "sku": "GMS-BV-014",
        "erp_name": "Cold Brew Green Tea 500ml",
        "brand": "Mori",
        "barcode": "8850001000141",
        "unit": "bottle",
        "erp_category": "Ready to Drink",
        "price": Decimal("35.00"),
        "stock_quantity": 82,
        "category": "Beverages",
        "status": "in_review",
        "visibility": "hidden",
        "featured": False,
        "short": "Smooth cold-brewed green tea with a clean, refreshing finish.",
        "long": (
            "Slow-steeped green tea made for a balanced taste with gentle "
            "aroma and low bitterness. Best served chilled."
        ),
    },
    {
        "sku": "GMS-PT-022",
        "erp_name": "Thai Jasmine Rice 5kg",
        "brand": "Golden Field",
        "barcode": "8850001000226",
        "unit": "bag",
        "erp_category": "Rice",
        "price": Decimal("229.00"),
        "stock_quantity": 64,
        "category": "Pantry",
        "status": "approved",
        "visibility": "hidden",
        "featured": True,
        "short": "Fragrant Thai jasmine rice with soft, naturally aromatic grains.",
        "long": (
            "Premium Thai Hom Mali rice selected for its floral aroma and "
            "soft texture. Suitable for everyday meals and special occasions."
        ),
    },
    {
        "sku": "GMS-HH-031",
        "erp_name": "Plant-Based Dishwashing Liquid 750ml",
        "brand": "Green Home",
        "barcode": "8850001000318",
        "unit": "bottle",
        "erp_category": "Cleaning",
        "price": Decimal("89.00"),
        "stock_quantity": 37,
        "category": "Household",
        "status": "draft",
        "visibility": "hidden",
        "featured": False,
        "short": "Effective plant-based dishwashing liquid for everyday cleaning.",
        "long": "",
    },
    {
        "sku": "GMS-PC-043",
        "erp_name": "Aloe Vera Hand Wash 400ml",
        "brand": "Kind Skin",
        "barcode": "8850001000431",
        "unit": "bottle",
        "erp_category": "Hand Care",
        "price": Decimal("79.00"),
        "stock_quantity": 0,
        "category": "Personal Care",
        "status": "draft",
        "visibility": "hidden",
        "featured": False,
        "short": "",
        "long": "",
    },
    {
        "sku": "GMS-FR-052",
        "erp_name": "Hydroponic Salad Mix 200g",
        "brand": "GMS Fresh",
        "barcode": "8850001000523",
        "unit": "pack",
        "erp_category": "Vegetables",
        "price": Decimal("69.00"),
        "stock_quantity": 23,
        "category": "Fresh Produce",
        "status": "published",
        "visibility": "public",
        "featured": False,
        "short": "Crisp hydroponic greens washed and ready for salads.",
        "long": (
            "A colorful mix of tender hydroponic lettuce varieties, packed "
            "fresh for quick salads, sandwiches and healthy sides."
        ),
    },
    {
        "sku": "GMS-PT-067",
        "erp_name": "Organic Coconut Milk 400ml",
        "brand": "Siam Grove",
        "barcode": "8850001000677",
        "unit": "can",
        "erp_category": "Cooking Ingredients",
        "price": Decimal("49.00"),
        "stock_quantity": 119,
        "category": "Pantry",
        "status": "in_review",
        "visibility": "hidden",
        "featured": False,
        "short": "Rich organic coconut milk for curries, desserts and drinks.",
        "long": (
            "Smooth coconut milk made from organically grown coconuts. "
            "A versatile pantry staple for savory and sweet recipes."
        ),
    },
    {
        "sku": "GMS-BV-074",
        "erp_name": "Mineral Water 1.5L",
        "brand": "Clear Mountain",
        "barcode": "8850001000745",
        "unit": "bottle",
        "erp_category": "Water",
        "price": Decimal("22.00"),
        "stock_quantity": 240,
        "category": "Beverages",
        "status": "draft",
        "visibility": "hidden",
        "featured": False,
        "short": "",
        "long": "",
    },
]


def _ensure_brand_master(db: Session, brand_names: set[str]) -> None:
    existing_codes = set(db.scalars(select(Brand.code)))
    for name in sorted(brand_names):
        if db.scalar(select(Brand).where(func.lower(Brand.name) == name.casefold())):
            continue
        base_code = re.sub(r"[^A-Z0-9]+", "_", name.upper()).strip("_")[:24]
        base_code = base_code or "BRAND"
        code = base_code
        suffix = 2
        while code in existing_codes:
            code = f"{base_code[:25]}_{suffix}"
            suffix += 1
        db.add(
            Brand(
                name=name,
                code=code,
                description=f"Brand synchronized from the ERP product master: {name}.",
            )
        )
        existing_codes.add(code)


def _backfill_normal_prices(db: Session) -> None:
    """Copy legacy ERP reference prices once into the normalized Normal list."""

    normal = db.scalar(select(PriceList).where(PriceList.code == "NORMAL"))
    if not normal:
        return
    existing_product_ids = set(
        db.scalars(
            select(ProductPrice.product_id).where(
                ProductPrice.price_list_id == normal.id
            )
        )
    )
    products = db.scalars(select(Product).options(noload("*")).where(Product.price.is_not(None))).all()
    for product in products:
        if product.id in existing_product_ids:
            continue
        db.add(
            ProductPrice(
                product_id=product.id,
                price_list_id=normal.id,
                currency=normal.currency,
                amount=product.price,
                effective_from=product.erp_updated_at,
                status="active",
                reason="Initial price imported from the ERP reference value.",
                approved_at=product.erp_updated_at,
            )
        )


def ensure_reference_data(db: Session, *, include_demo_products: bool) -> None:
    roles: dict[str, Role] = {}
    for name, description in ROLE_DEFINITIONS.items():
        role = db.scalar(select(Role).where(Role.name == name))
        if role:
            role.key = name
            role.description = description
        else:
            role = Role(name=name, key=name, description=description)
        role.is_active = True
        role.is_system = name == "superadmin"
        role.system_key = "SUPERADMIN" if name == "superadmin" else None
        role.role_type = "system" if name in {"superadmin", "system_user"} else "custom"
        role.default_scope = "all" if name in {"superadmin", "sales_manager", "system_user"} else "none"
        db.add(role)
        roles[name] = role

    permissions: dict[str, Permission] = {}
    for code, (module, description) in PERMISSION_DEFINITIONS.items():
        permission = db.scalar(select(Permission).where(Permission.code == code))
        if permission:
            permission.module = module
            permission.description = description
        else:
            permission = Permission(
                code=code,
                module=module,
                description=description,
            )
        permission.action = code.split(".", maxsplit=1)[1]
        permission.is_high_risk = code in HIGH_RISK_PERMISSIONS
        permission.is_active = True
        db.add(permission)
        permissions[code] = permission

    for code in DEPRECATED_PERMISSION_CODES:
        permission = db.scalar(select(Permission).where(Permission.code == code))
        if permission:
            permission.is_active = False

    db.flush()
    for role_name, role in roles.items():
        codes = ROLE_PERMISSION_CODES.get(role_name, set())
        role.permissions = [permissions[code] for code in sorted(codes)]
    db.flush()
    for role_name, role in roles.items():
        for code in ROLE_PERMISSION_CODES.get(role_name, set()):
            db.execute(
                update(role_permissions)
                .where(
                    role_permissions.c.role_id == role.id,
                    role_permissions.c.permission_id == permissions[code].id,
                )
                .values(effect="allow", access_scope=_template_scope(role_name, code))
            )

    for user in db.scalars(select(User)):
        if any(role.is_system and role.system_key == "SUPERADMIN" for role in user.roles):
            continue
        assigned_names = {role.name for role in user.roles}
        if "sales_manager" in assigned_names:
            if {role.id for role in user.roles} != {roles["sales_manager"].id}:
                user.roles = [roles["sales_manager"]]
                user.permissions_version = (user.permissions_version or 0) + 1
            continue
        if "sales_user" in assigned_names:
            if {role.id for role in user.roles} != {roles["sales_user"].id}:
                user.roles = [roles["sales_user"]]
                user.permissions_version = (user.permissions_version or 0) + 1
            continue
        if "customer_user" in assigned_names:
            if {role.id for role in user.roles} != {roles["customer_user"].id}:
                user.roles = [roles["customer_user"]]
                user.permissions_version = (user.permissions_version or 0) + 1
            continue
        legacy_admin_roles = assigned_names.difference({"system_user", "viewer"})
        replacement = roles["sales_manager"] if legacy_admin_roles else roles["sales_user"]
        if {role.id for role in user.roles} != {replacement.id}:
            user.roles = [replacement]
            user.permissions_version = (user.permissions_version or 0) + 1

    for code, name, description, is_no_price in PRICE_LIST_DATA:
        price_list = db.scalar(select(PriceList).where(PriceList.code == code))
        if not price_list:
            db.add(
                PriceList(
                    code=code,
                    name=name,
                    description=description,
                    currency="THB",
                    is_no_price=is_no_price,
                )
            )
    db.flush()
    price_lists_by_code = {item.code: item for item in db.scalars(select(PriceList))}
    for code, display_name, price_code, show_prices, display_order, style_key in AUDIENCE_TYPE_DATA:
        audience = db.scalar(select(CatalogueAudienceType).where(CatalogueAudienceType.code == code))
        if not audience:
            db.add(
                CatalogueAudienceType(
                    code=code,
                    display_name=display_name,
                    price_list_id=price_lists_by_code[price_code].id,
                    show_prices=show_prices,
                    display_order=display_order,
                    button_style_key=style_key,
                    is_active=True,
                )
            )
    for code, name_en, name_th, icon, start_month, start_day, end_month, end_day, display_order in PROMOTION_OCCASION_DATA:
        occasion = db.scalar(select(PromotionOccasion).where(PromotionOccasion.code == code))
        if not occasion:
            occasion = PromotionOccasion(code=code, name_en=name_en)
            db.add(occasion)
        occasion.name_en = name_en
        occasion.name_th = name_th
        occasion.icon_key = icon
        occasion.recurring_annually = start_month is not None
        occasion.default_start_month = start_month
        occasion.default_start_day = start_day
        occasion.default_end_month = end_month
        occasion.default_end_day = end_day
        occasion.display_order = display_order
        occasion.is_active = True
    db.flush()
    all_price_lists = list(db.scalars(select(PriceList).where(PriceList.is_active.is_(True))))
    for role_name in {
        "catalogue_manager", "catalogue_admin", "catalogue_editor",
        "product_editor", "price_manager", "catalogue_approver",
        "sales_manager", "sales_user", "viewer",
    }:
        roles[role_name].allowed_price_lists = all_price_lists

    categories: dict[str, Category] = {}
    if include_demo_products:
        for name, slug, description in CATEGORY_DATA:
            category = db.scalar(select(Category).where(Category.slug == slug))
            if not category:
                category = Category(
                    name=name,
                    slug=slug,
                    description=description,
                )
                db.add(category)
                db.flush()
            categories[name] = category

    product_count = db.scalar(select(func.count()).select_from(Product)) or 0
    if not include_demo_products or product_count:
        product_brands = {
            brand.strip()
            for brand in db.scalars(
                select(Product.brand).where(Product.brand.is_not(None))
            )
            if brand and brand.strip()
        }
        _ensure_brand_master(db, product_brands)
        _backfill_normal_prices(db)
        db.commit()
        return

    now = datetime.now(UTC)
    for index, data in enumerate(PRODUCT_DATA):
        status = data["status"]
        entry = CatalogueEntry(
            short_description=data["short"],
            long_description=data["long"],
            seo_title=data["erp_name"] if status != "draft" else "",
            seo_description=data["short"],
            visibility=data["visibility"],
            workflow_status=status,
            is_featured=data["featured"],
            version=1,
            submitted_at=now - timedelta(days=3) if status != "draft" else None,
            approved_at=(
                now - timedelta(days=2)
                if status in {"approved", "published"}
                else None
            ),
            published_at=now - timedelta(days=1) if status == "published" else None,
        )
        product = Product(
            sku=data["sku"],
            erp_name=data["erp_name"],
            brand=data["brand"],
            barcode=data["barcode"],
            unit=data["unit"],
            erp_category=data["erp_category"],
            price=data["price"],
            stock_quantity=data["stock_quantity"],
            erp_updated_at=now - timedelta(hours=index * 3),
            catalogue_entry=entry,
            categories=[categories[data["category"]]],
        )
        db.add(product)

    _ensure_brand_master(
        db,
        {str(data["brand"]).strip() for data in PRODUCT_DATA if data["brand"]},
    )
    db.flush()
    _backfill_normal_prices(db)
    db.commit()
