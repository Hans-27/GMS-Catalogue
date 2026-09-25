"""Seed realistic, presentation-only data without overwriting existing records.

This command is deliberately opt-in.  It is safe to run more than once: records
are identified by stable demo codes, usernames, SKUs, slugs, and audit markers;
existing records are reused or skipped and are never deleted.

Run after migrations from the ``backend`` directory::

    $env:DEMO_SEED_ENABLED = "true"
    $env:DEMO_CATALOGUE_PASSWORD = "..."
    $env:DEMO_SALES_PASSWORD = "..."
    $env:DEMO_SALES_MANAGER_PASSWORD = "..."
    $env:DEMO_PRICE_MANAGER_PASSWORD = "..."
    python -m app.scripts.seed_demo_presentation

Existing demo account passwords are intentionally not reset by later runs.
"""

from __future__ import annotations

import os
import sys
from collections import Counter
from datetime import UTC, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from urllib.parse import quote_plus

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

# Import both model modules so every relationship/table is registered with the
# shared SQLAlchemy metadata before the command starts querying it.
from app.commerce_models import (
    Catalogue,
    CatalogueProduct,
    CatalogueVersion,
    PriceChangeRequest,
    PriceList,
    ProductPrice,
)
from app.database import SessionLocal
from app.models import (
    AuditLog,
    Brand,
    CatalogueEntry,
    Category,
    Department,
    DepartmentBrandAccess,
    Permission,
    Position,
    Product,
    ProductImage,
    Role,
    Team,
    User,
    UserOrganizationProfile,
)
from app.security import hash_password

try:
    # Feedback is a demo module and may not be present on older schema versions.
    from app.feedback_models import Feedback
except ImportError:  # pragma: no cover - compatibility with an older checkout
    Feedback = None  # type: ignore[assignment,misc]


SEED_MARKER = "gms-demo-presentation-v1"
TRUE_VALUES = {"1", "true", "yes", "on"}
PASSWORD_ENV_VARS = {
    "demo_catalogue": "DEMO_CATALOGUE_PASSWORD",
    "demo_sales": "DEMO_SALES_PASSWORD",
    "demo_sales_manager": "DEMO_SALES_MANAGER_PASSWORD",
    "demo_price_manager": "DEMO_PRICE_MANAGER_PASSWORD",
}


PERMISSION_DEFINITIONS: dict[str, tuple[str, str]] = {
    "dashboard.view": ("dashboard", "View the permission-aware demo dashboard."),
    "catalogue.view": ("catalogue", "View product catalogue content."),
    "catalogue.edit": ("catalogue", "Edit catalogue-owned product content and media."),
    "catalogue.approve": ("catalogue", "Review and approve product content."),
    "catalogue.publish": ("catalogue", "Publish product content."),
    "products.view": ("products", "View products."),
    "products.create": ("products", "Create products."),
    "products.edit": ("products", "Edit products."),
    "products.delete": ("products", "Delete products."),
    "product_images.view": ("product_images", "View product images."),
    "product_images.upload": ("product_images", "Upload product images."),
    "product_images.edit": ("product_images", "Reorder and update product images."),
    "product_images.delete": ("product_images", "Delete product images."),
    "products.prices.view": ("pricing", "View product prices and history."),
    "products.prices.propose": ("pricing", "Propose product price changes."),
    "products.prices.edit": ("pricing", "Create approved product prices."),
    "products.prices.approve": ("pricing", "Approve or reject price changes."),
    "prices.view": ("pricing", "View permitted price lists."),
    "prices.edit": ("pricing", "Edit or propose prices."),
    "prices.approve": ("pricing", "Approve or reject proposed prices."),
    "catalogues.view": ("catalogues", "View catalogues and published versions."),
    "catalogues.preview": ("catalogues", "Preview draft and published catalogues."),
    "catalogues.create": ("catalogues", "Create catalogues."),
    "catalogues.edit": ("catalogues", "Edit catalogue settings and products."),
    "catalogues.duplicate": ("catalogues", "Duplicate catalogues."),
    "catalogues.publish": ("catalogues", "Publish immutable catalogue versions."),
    "catalogues.archive": ("catalogues", "Archive catalogues."),
    "catalogues.export_pdf": ("catalogues", "Export catalogue PDF files."),
    "catalogues.export_excel": ("catalogues", "Export catalogue spreadsheets."),
    "catalogues.export": ("catalogues", "Export catalogues."),
    "catalogues.print": ("catalogues", "Print catalogues."),
    "catalogues.delete": ("catalogues", "Delete catalogues."),
    "catalogues.cover.view": ("catalogues", "View catalogue title pages."),
    "catalogues.cover.upload": ("catalogues", "Upload catalogue title pages."),
    "catalogues.cover.edit": ("catalogues", "Edit catalogue title pages."),
    "catalogues.cover.delete": ("catalogues", "Delete catalogue title pages."),
    "catalogue_categories.view": ("catalogues", "View catalogue category presentation."),
    "catalogue_categories.manage": ("catalogues", "Manage catalogue category presentation."),
    "settings.view": ("settings", "View settings and operations."),
    "backups.view": ("backups", "View backup jobs."),
    "backups.create": ("backups", "Create backups."),
    "backups.download": ("backups", "Download backups."),
    "backups.delete": ("backups", "Delete backups."),
    "backups.schedule": ("backups", "Manage backup schedules."),
    "backups.restore": ("backups", "Restore backups when enabled."),
    "system_metrics.view": ("settings", "View safe system metrics."),
    "system_information.view": ("settings", "View safe system information."),
    "brands.view": ("brands", "View brands."),
    "brands.manage": ("brands", "Manage brands."),
    "categories.view": ("categories", "View categories."),
    "categories.manage": ("categories", "Manage categories."),
    "users.view": ("users", "View users."),
    "users.create": ("users", "Create users."),
    "users.edit": ("users", "Edit users."),
    "users.deactivate": ("users", "Deactivate users."),
    "users.manage": ("users", "Manage users and organization assignments."),
    "organization.view": ("organization", "View organization master data."),
    "organization.manage": ("organization", "Manage organization master data."),
    "departments.manage": ("organization", "Manage departments."),
    "positions.manage": ("organization", "Manage positions."),
    "roles.manage": ("security", "Manage roles."),
    "permissions.manage": ("security", "Manage permissions and assignments."),
    "audit.view": ("audit", "View recent platform activity."),
    "feedback.create": ("feedback", "Submit demo feedback."),
    "feedback.view": ("feedback", "View demo feedback."),
    "feedback.manage": ("feedback", "Review and manage demo feedback."),
    "settings.manage": ("settings", "Manage application and pricing settings."),
}

ROLE_DEFINITIONS: dict[str, tuple[str, set[str]]] = {
    "catalogue_department": (
        "Catalogue department demo user: products, images, and catalogue authoring.",
        {
            "dashboard.view", "catalogue.view", "catalogue.edit", "products.view",
            "products.create", "products.edit", "product_images.view",
            "product_images.upload", "product_images.edit", "product_images.delete",
            "products.prices.view", "prices.view", "catalogues.view", "catalogues.preview",
            "catalogues.create", "catalogues.edit", "catalogues.duplicate",
            "catalogues.export", "catalogues.export_pdf", "catalogues.export_excel", "catalogues.print",
            "catalogues.cover.view", "catalogues.cover.upload", "catalogues.cover.edit", "catalogues.cover.delete",
            "catalogue_categories.view", "catalogue_categories.manage",
            "feedback.create", "brands.view", "categories.view",
        },
    ),
    "sales_user": (
        "Sales demo user with read-only access to published catalogues.",
        {
            "dashboard.view", "products.view", "catalogue.view", "catalogues.view", "catalogues.preview",
            "catalogues.export", "catalogues.export_pdf", "catalogues.print",
            "catalogues.cover.view", "catalogue_categories.view",
            "products.prices.view", "prices.view", "feedback.create",
        },
    ),
    "sales_manager": (
        "Sales manager demo user with catalogue review and report access.",
        {
            "dashboard.view", "products.view", "catalogue.view", "catalogue.approve",
            "catalogues.view", "catalogues.preview", "catalogues.export", "catalogues.export_pdf",
            "catalogues.export_excel", "catalogues.print", "products.prices.view",
            "prices.view", "feedback.create", "feedback.view", "audit.view",
        },
    ),
    "price_manager": (
        "Price management demo user with price proposal, history, and approval access.",
        {
            "dashboard.view", "products.view", "catalogue.view", "catalogues.view", "catalogues.preview",
            "products.prices.view", "products.prices.propose", "products.prices.edit",
            "products.prices.approve", "prices.view", "prices.edit", "prices.approve",
            "feedback.create", "audit.view",
        },
    ),
}

PRICE_LIST_DATA = (
    ("NORMAL", "Normal", "Standard customer price list.", False),
    ("VIP", "VIP BKK", "Preferred VIP BKK customer pricing.", False),
    ("BIG_CUSTOMER", "Big Customer", "Large customer account pricing.", False),
    ("DEALER", "Dealer", "Authorized dealer pricing.", False),
    ("WHOLESALE", "Wholesale", "Wholesale channel pricing.", False),
    ("RETAIL", "Retail", "Recommended retail pricing.", False),
    ("NO_PRICE", "No Price", "Catalogue without monetary values.", True),
)

DEPARTMENT_DATA = (
    ("CAT", "Catalogue & Content", "Maintains product content, media, and catalogues."),
    ("SAL", "Sales", "Supports retail, dealer, and key-account customers."),
    ("PRC", "Pricing & Commercial", "Owns price lists and commercial governance."),
    ("MKT", "Marketing", "Coordinates brands, campaigns, and product launches."),
)

POSITION_DATA = (
    ("CAT-SPEC", "Catalogue Specialist", "CAT", 2),
    ("CAT-MGR", "Catalogue Manager", "CAT", 4),
    ("SAL-EXEC", "Sales Executive", "SAL", 2),
    ("SAL-MGR", "Sales Manager", "SAL", 4),
    ("PRC-ANL", "Pricing Analyst", "PRC", 2),
    ("PRC-MGR", "Pricing Manager", "PRC", 4),
    ("MKT-BRAND", "Brand Executive", "MKT", 2),
)

BRAND_DATA = (
    ("GMS_FRESH", "GMS Fresh", "Fresh food selected for dependable everyday quality."),
    ("MORI", "Mori", "Modern tea, coffee, and refreshment products."),
    ("GOLDEN_FIELD", "Golden Field", "Thai pantry staples and premium rice."),
    ("GREEN_HOME", "Green Home", "Thoughtful household cleaning products."),
    ("KIND_SKIN", "Kind Skin", "Gentle daily personal-care essentials."),
    ("SIAM_GROVE", "Siam Grove", "Thai cooking ingredients and tropical foods."),
    ("CLEAR_MOUNTAIN", "Clear Mountain", "Water and naturally refreshing beverages."),
    ("NORTHSTAR", "Northstar", "Reliable office and technology accessories."),
)

TEAM_DATA = (
    ("CAT-OPS", "Catalogue Operations", "CAT", ("GMS_FRESH", "MORI", "GOLDEN_FIELD", "GREEN_HOME", "KIND_SKIN", "SIAM_GROVE", "CLEAR_MOUNTAIN", "NORTHSTAR")),
    ("SAL-KEY", "Key Accounts", "SAL", ("GMS_FRESH", "MORI", "GOLDEN_FIELD", "SIAM_GROVE")),
    ("SAL-RTL", "Retail Sales", "SAL", ("MORI", "GREEN_HOME", "KIND_SKIN", "CLEAR_MOUNTAIN", "NORTHSTAR")),
    ("PRC-GOV", "Price Governance", "PRC", ("GMS_FRESH", "MORI", "GOLDEN_FIELD", "GREEN_HOME", "KIND_SKIN", "SIAM_GROVE", "CLEAR_MOUNTAIN", "NORTHSTAR")),
)

CATEGORY_DATA = (
    ("Fresh Produce", "fresh-produce", "Fresh fruit, vegetables, and herbs."),
    ("Pantry", "pantry", "Shelf-stable cooking and grocery essentials."),
    ("Beverages", "beverages", "Water, tea, coffee, juice, and ready-to-drink products."),
    ("Household", "household", "Home care and household essentials."),
    ("Personal Care", "personal-care", "Everyday health and personal-care products."),
    ("Office & Technology", "office-technology", "Useful office and technology accessories."),
)

# sku suffix, name, brand code, category slug, unit, ERP category, normal price, stock
PRODUCT_DATA = (
    ("FR-001", "Premium Cavendish Bananas 1kg", "GMS_FRESH", "fresh-produce", "bag", "Fruit", "59.00", 148),
    ("FR-002", "Hydroponic Salad Mix 200g", "GMS_FRESH", "fresh-produce", "pack", "Vegetables", "69.00", 52),
    ("FR-003", "Sweet Cherry Tomatoes 250g", "GMS_FRESH", "fresh-produce", "pack", "Vegetables", "55.00", 74),
    ("FR-004", "Thai Nam Dok Mai Mango 1kg", "GMS_FRESH", "fresh-produce", "box", "Fruit", "129.00", 38),
    ("FR-005", "Seedless Lime 500g", "GMS_FRESH", "fresh-produce", "bag", "Fruit", "49.00", 92),
    ("FR-006", "Baby Spinach 150g", "GMS_FRESH", "fresh-produce", "pack", "Vegetables", "79.00", 31),
    ("PT-001", "Thai Jasmine Rice 5kg", "GOLDEN_FIELD", "pantry", "bag", "Rice", "229.00", 64),
    ("PT-002", "Brown Jasmine Rice 2kg", "GOLDEN_FIELD", "pantry", "bag", "Rice", "139.00", 46),
    ("PT-003", "Organic Coconut Milk 400ml", "SIAM_GROVE", "pantry", "can", "Cooking Ingredients", "49.00", 119),
    ("PT-004", "Thai Red Curry Paste 200g", "SIAM_GROVE", "pantry", "jar", "Cooking Ingredients", "65.00", 83),
    ("PT-005", "Roasted Cashew Nuts 180g", "SIAM_GROVE", "pantry", "pouch", "Snacks", "119.00", 57),
    ("PT-006", "Golden Field Rice Bran Oil 1L", "GOLDEN_FIELD", "pantry", "bottle", "Cooking Oil", "109.00", 70),
    ("BV-001", "Cold Brew Green Tea 500ml", "MORI", "beverages", "bottle", "Ready to Drink", "35.00", 82),
    ("BV-002", "Unsweetened Jasmine Tea 500ml", "MORI", "beverages", "bottle", "Ready to Drink", "32.00", 94),
    ("BV-003", "Arabica Cold Brew Coffee 250ml", "MORI", "beverages", "bottle", "Coffee", "59.00", 63),
    ("BV-004", "Mineral Water 1.5L", "CLEAR_MOUNTAIN", "beverages", "bottle", "Water", "22.00", 240),
    ("BV-005", "Sparkling Mineral Water 330ml", "CLEAR_MOUNTAIN", "beverages", "can", "Water", "29.00", 171),
    ("BV-006", "Lychee Green Tea 350ml", "MORI", "beverages", "bottle", "Ready to Drink", "39.00", 77),
    ("HH-001", "Plant-Based Dishwashing Liquid 750ml", "GREEN_HOME", "household", "bottle", "Cleaning", "89.00", 37),
    ("HH-002", "Concentrated Laundry Liquid 1.5L", "GREEN_HOME", "household", "bottle", "Laundry", "169.00", 45),
    ("HH-003", "Multipurpose Surface Cleaner 500ml", "GREEN_HOME", "household", "bottle", "Cleaning", "79.00", 68),
    ("HH-004", "Recycled Kitchen Towels 6 Rolls", "GREEN_HOME", "household", "pack", "Paper Goods", "135.00", 53),
    ("HH-005", "Natural Deodorizing Spray 300ml", "GREEN_HOME", "household", "bottle", "Home Care", "99.00", 26),
    ("HH-006", "Compostable Food Bags 30 Pack", "GREEN_HOME", "household", "box", "Food Storage", "85.00", 61),
    ("PC-001", "Aloe Vera Hand Wash 400ml", "KIND_SKIN", "personal-care", "bottle", "Hand Care", "79.00", 40),
    ("PC-002", "Gentle Daily Shampoo 500ml", "KIND_SKIN", "personal-care", "bottle", "Hair Care", "149.00", 36),
    ("PC-003", "Moisturizing Body Wash 500ml", "KIND_SKIN", "personal-care", "bottle", "Body Care", "139.00", 42),
    ("PC-004", "Mineral Sunscreen SPF50 50ml", "KIND_SKIN", "personal-care", "tube", "Skin Care", "289.00", 28),
    ("PC-005", "Refreshing Facial Cleanser 120ml", "KIND_SKIN", "personal-care", "tube", "Skin Care", "179.00", 34),
    ("PC-006", "Herbal Hand Cream 50ml", "KIND_SKIN", "personal-care", "tube", "Hand Care", "95.00", 49),
    ("OT-001", "Wireless Silent Mouse", "NORTHSTAR", "office-technology", "piece", "Computer Accessories", "459.00", 25),
    ("OT-002", "USB-C 65W Wall Charger", "NORTHSTAR", "office-technology", "piece", "Power Accessories", "890.00", 18),
    ("OT-003", "Aluminium Laptop Stand", "NORTHSTAR", "office-technology", "piece", "Office Accessories", "790.00", 21),
    ("OT-004", "1080p Conference Webcam", "NORTHSTAR", "office-technology", "piece", "Video Accessories", "1290.00", 13),
    ("OT-005", "Ergonomic Keyboard", "NORTHSTAR", "office-technology", "piece", "Computer Accessories", "1190.00", 16),
    ("OT-006", "USB-C 8-in-1 Travel Hub", "NORTHSTAR", "office-technology", "piece", "Computer Accessories", "1490.00", 11),
)

PRICE_MULTIPLIERS = {
    "NORMAL": Decimal("1.00"),
    "VIP": Decimal("0.95"),
    "BIG_CUSTOMER": Decimal("0.91"),
    "DEALER": Decimal("0.87"),
    "WHOLESALE": Decimal("0.82"),
    "RETAIL": Decimal("1.05"),
}

ACCOUNT_DATA = (
    ("demo_catalogue", "catalogue.demo@demo.gms.example.com", "Narin Catalogue", "catalogue_department", "CAT", "CAT-SPEC", "CAT-OPS", "GMS-DEMO-CAT-001"),
    ("demo_sales", "sales.demo@demo.gms.example.com", "Mali Sales", "sales_user", "SAL", "SAL-EXEC", "SAL-RTL", "GMS-DEMO-SAL-001"),
    ("demo_sales_manager", "sales.manager.demo@demo.gms.example.com", "Anan Sales Manager", "sales_manager", "SAL", "SAL-MGR", "SAL-KEY", "GMS-DEMO-SAL-002"),
    ("demo_price_manager", "pricing.demo@demo.gms.example.com", "Pim Pricing Manager", "price_manager", "PRC", "PRC-MGR", "PRC-GOV", "GMS-DEMO-PRC-001"),
)

LEGACY_DEMO_EMAILS = {
    "demo_catalogue": "catalogue.demo@gms.local",
    "demo_sales": "sales.demo@gms.local",
    "demo_sales_manager": "sales.manager.demo@gms.local",
    "demo_price_manager": "pricing.demo@gms.local",
}


def _enabled() -> bool:
    return os.getenv("DEMO_SEED_ENABLED", "").strip().casefold() in TRUE_VALUES


def _validated_passwords() -> dict[str, str]:
    passwords: dict[str, str] = {}
    errors: list[str] = []
    for username, variable in PASSWORD_ENV_VARS.items():
        value = os.getenv(variable, "")
        if not value:
            errors.append(f"{variable} is required")
        elif len(value) < 12:
            errors.append(f"{variable} must contain at least 12 characters")
        else:
            passwords[username] = value
    if errors:
        raise SystemExit("Demo seed configuration error:\n- " + "\n- ".join(errors))
    return passwords


def _record(summary: Counter[str], kind: str, created: bool) -> None:
    summary[f"{kind}_{'created' if created else 'reused'}"] += 1


def _ensure_permissions_and_roles(
    db: Session, summary: Counter[str]
) -> tuple[dict[str, Permission], dict[str, Role]]:
    permissions: dict[str, Permission] = {}
    for code, (module, description) in PERMISSION_DEFINITIONS.items():
        item = db.scalar(select(Permission).where(Permission.code == code))
        created = item is None
        if item is None:
            item = Permission(code=code, module=module, description=description)
            db.add(item)
        permissions[code] = item
        _record(summary, "permissions", created)
    db.flush()

    roles: dict[str, Role] = {}
    for name, (description, grants) in ROLE_DEFINITIONS.items():
        role = db.scalar(select(Role).where(Role.name == name))
        created = role is None
        if role is None:
            role = Role(name=name, description=description)
            db.add(role)
            db.flush()
        existing = {permission.code for permission in role.permissions}
        role.permissions.extend(
            permissions[code] for code in sorted(grants - existing)
        )
        roles[name] = role
        _record(summary, "roles", created)

    # An existing SuperAdmin role receives every new permission, but no admin
    # account is created or modified by this demo-only command.
    superadmin = db.scalar(select(Role).where(Role.name == "superadmin"))
    if superadmin is not None:
        existing = {permission.code for permission in superadmin.permissions}
        superadmin.permissions.extend(
            permissions[code] for code in sorted(set(permissions) - existing)
        )
    return permissions, roles


def _ensure_price_lists(db: Session, summary: Counter[str]) -> dict[str, PriceList]:
    result: dict[str, PriceList] = {}
    for code, name, description, is_no_price in PRICE_LIST_DATA:
        item = db.scalar(select(PriceList).where(PriceList.code == code))
        created = item is None
        if item is None:
            item = PriceList(
                code=code,
                name=name,
                description=description,
                currency="THB",
                is_no_price=is_no_price,
            )
            db.add(item)
        result[code] = item
        _record(summary, "price_lists", created)
    db.flush()
    return result


def _ensure_organization(
    db: Session,
    permissions: dict[str, Permission],
    summary: Counter[str],
) -> tuple[dict[str, Department], dict[str, Position], dict[str, Brand], dict[str, Team]]:
    departments: dict[str, Department] = {}
    for code, name, description in DEPARTMENT_DATA:
        item = db.scalar(
            select(Department).where(or_(Department.code == code, Department.name == name))
        )
        created = item is None
        if item is None:
            item = Department(code=code, name=name, description=description)
            db.add(item)
        departments[code] = item
        _record(summary, "departments", created)
    db.flush()

    position_grants = {
        "CAT-SPEC": {"catalogue.view", "catalogue.edit", "products.view", "products.edit", "product_images.upload", "catalogues.view", "catalogues.preview", "catalogues.edit"},
        "CAT-MGR": {"catalogue.view", "catalogue.edit", "catalogue.approve", "catalogues.view", "catalogues.preview", "catalogues.edit", "catalogues.publish"},
        "SAL-EXEC": {"catalogue.view", "products.view", "catalogues.view", "catalogues.preview", "catalogues.print"},
        "SAL-MGR": {"catalogue.view", "products.view", "catalogues.view", "catalogues.preview", "catalogues.export", "audit.view"},
        "PRC-ANL": {"products.view", "products.prices.view", "products.prices.propose"},
        "PRC-MGR": {"products.view", "products.prices.view", "products.prices.edit", "products.prices.approve"},
        "MKT-BRAND": {"products.view", "brands.view", "catalogues.view", "catalogues.preview"},
    }
    positions: dict[str, Position] = {}
    for code, name, department_code, level in POSITION_DATA:
        item = db.scalar(select(Position).where(Position.code == code))
        created = item is None
        if item is None:
            item = Position(
                code=code,
                name=name,
                department=departments[department_code],
                level=level,
                description=f"Demo position for {name.lower()} workflows.",
            )
            db.add(item)
            db.flush()
        existing = {permission.code for permission in item.permissions}
        item.permissions.extend(
            permissions[code]
            for code in sorted(position_grants[code] - existing)
        )
        positions[code] = item
        _record(summary, "positions", created)

    brands: dict[str, Brand] = {}
    for code, name, description in BRAND_DATA:
        item = db.scalar(
            select(Brand).where(or_(Brand.code == code, Brand.name == name))
        )
        created = item is None
        if item is None:
            item = Brand(code=code, name=name, description=description)
            db.add(item)
        brands[code] = item
        _record(summary, "brands", created)
    db.flush()

    team_grants = {
        "CAT-OPS": {"catalogue.view", "catalogue.edit", "products.view", "product_images.upload", "catalogues.view", "catalogues.preview", "catalogues.create", "catalogues.edit"},
        "SAL-KEY": {"catalogue.view", "products.view", "catalogues.view", "catalogues.preview", "products.prices.view"},
        "SAL-RTL": {"catalogue.view", "products.view", "catalogues.view", "catalogues.preview", "catalogues.print"},
        "PRC-GOV": {"products.view", "products.prices.view", "products.prices.propose", "products.prices.approve"},
    }
    teams: dict[str, Team] = {}
    for code, name, department_code, brand_codes in TEAM_DATA:
        item = db.scalar(select(Team).where(Team.code == code))
        created = item is None
        if item is None:
            item = Team(
                code=code,
                name=name,
                department=departments[department_code],
                description=f"Demo {name.lower()} team.",
            )
            db.add(item)
            db.flush()
        existing_brands = {brand.code for brand in item.brands}
        item.brands.extend(brands[brand] for brand in brand_codes if brand not in existing_brands)
        existing_permissions = {permission.code for permission in item.permissions}
        item.permissions.extend(
            permissions[permission]
            for permission in sorted(team_grants[code] - existing_permissions)
        )
        teams[code] = item
        _record(summary, "teams", created)

    manage_departments = {"CAT", "PRC", "MKT"}
    for department_code, department in departments.items():
        for brand in brands.values():
            existing = db.get(
                DepartmentBrandAccess,
                {"department_id": department.id, "brand_id": brand.id},
            )
            if existing is None:
                db.add(
                    DepartmentBrandAccess(
                        department=department,
                        brand=brand,
                        can_view=True,
                        can_manage=department_code in manage_departments,
                    )
                )
                summary["brand_access_created"] += 1
            else:
                summary["brand_access_reused"] += 1
    db.flush()
    return departments, positions, brands, teams


def _ensure_accounts(
    db: Session,
    passwords: dict[str, str],
    roles: dict[str, Role],
    departments: dict[str, Department],
    positions: dict[str, Position],
    teams: dict[str, Team],
    summary: Counter[str],
) -> dict[str, User]:
    accounts: dict[str, User] = {}
    for username, email, full_name, role_name, dept_code, pos_code, team_code, employee_code in ACCOUNT_DATA:
        user = db.scalar(
            select(User).where(
                or_(
                    func.lower(User.username) == username.casefold(),
                    func.lower(User.email) == email.casefold(),
                )
            )
        )
        created = user is None
        if user is None:
            user = User(
                username=username,
                email=email,
                full_name=full_name,
                password_hash=hash_password(passwords[username]),
                roles=[roles[role_name]],
                teams=[teams[team_code]],
            )
            db.add(user)
            db.flush()
            user.organization_profile = UserOrganizationProfile(
                department=departments[dept_code],
                position=positions[pos_code],
                employee_code=employee_code,
            )
        elif (
            user.username.casefold() == username.casefold()
            and user.email.casefold()
            in {email.casefold(), LEGACY_DEMO_EMAILS[username].casefold()}
        ):
            # Complete safe, non-secret assignments after a previously interrupted
            # seed; never overwrite identity fields or a password.
            # Early demo builds used the non-deliverable ``.local`` suffix, which
            # fails strict EmailStr response validation. Upgrade only that known
            # seed identity; unrelated user email addresses remain untouched.
            if user.email.casefold().endswith("@gms.local"):
                user.email = email
            if role_name not in {role.name for role in user.roles}:
                user.roles.append(roles[role_name])
            if team_code not in {team.code for team in user.teams}:
                user.teams.append(teams[team_code])
            if user.organization_profile is None:
                user.organization_profile = UserOrganizationProfile(
                    department=departments[dept_code],
                    position=positions[pos_code],
                    employee_code=employee_code,
                )
        else:
            raise RuntimeError(
                f"Refusing to touch conflicting user for demo identity {username!r}/{email!r}."
            )
        accounts[username] = user
        _record(summary, "accounts", created)
    db.flush()
    return accounts


def _ensure_categories(db: Session, summary: Counter[str]) -> dict[str, Category]:
    categories: dict[str, Category] = {}
    for name, slug, description in CATEGORY_DATA:
        item = db.scalar(
            select(Category).where(or_(Category.slug == slug, Category.name == name))
        )
        created = item is None
        if item is None:
            item = Category(name=name, slug=slug, description=description)
            db.add(item)
        categories[slug] = item
        _record(summary, "categories", created)
    db.flush()
    return categories


def _ensure_products(
    db: Session,
    accounts: dict[str, User],
    brands: dict[str, Brand],
    categories: dict[str, Category],
    summary: Counter[str],
) -> dict[str, Product]:
    now = datetime.now(UTC)
    products: dict[str, Product] = {}
    for index, (suffix, name, brand_code, category_slug, unit, erp_category, amount, stock) in enumerate(PRODUCT_DATA):
        sku = f"GMS-DEMO-{suffix}"
        barcode = f"8859001{index + 1:06d}"
        item = db.scalar(
            select(Product).where(or_(Product.sku == sku, Product.barcode == barcode))
        )
        created = item is None
        if item is None:
            workflow = ("published", "approved", "in_review", "draft")[index % 4]
            published = workflow == "published"
            readable_name = name.replace("  ", " ")
            description = (
                f"A presentation-ready {readable_name.lower()} from {brands[brand_code].name}, "
                "selected for dependable quality and convenient everyday use."
            )
            entry = CatalogueEntry(
                display_name=readable_name,
                short_description=description[:320],
                long_description=(
                    f"{readable_name} is included in the GMS functional demo to show "
                    "product search, content editing, pricing, and catalogue publishing workflows."
                ),
                seo_title=readable_name,
                seo_description=description[:320],
                visibility="public" if published else "hidden",
                workflow_status=workflow,
                is_featured=index % 9 == 0,
                version=1,
                updated_by_id=accounts["demo_catalogue"].id,
                approved_by_id=accounts["demo_sales_manager"].id if workflow in {"approved", "published"} else None,
                published_by_id=accounts["demo_catalogue"].id if published else None,
                submitted_at=now - timedelta(days=8, hours=index),
                approved_at=now - timedelta(days=6, hours=index) if workflow in {"approved", "published"} else None,
                published_at=now - timedelta(days=4, hours=index) if published else None,
            )
            item = Product(
                sku=sku,
                erp_name=readable_name,
                brand=brands[brand_code].name,
                barcode=barcode,
                unit=unit,
                erp_category=erp_category,
                price=Decimal(amount),
                stock_quantity=stock,
                erp_updated_at=now - timedelta(hours=index * 2),
                catalogue_entry=entry,
                categories=[categories[category_slug]],
            )
            db.add(item)
            db.flush()
            # Keep a deliberate subset without images so dashboard empty-state and
            # "missing image" counters have realistic data.
            if index % 5 != 4:
                encoded_name = quote_plus(readable_name[:32])
                db.add(
                    ProductImage(
                        product_id=item.id,
                        file_name=f"{sku.lower()}.png",
                        storage_name=f"{SEED_MARKER}-{sku.lower()}.png",
                        public_url=f"https://placehold.co/800x800/eef2ff/3730a3?text={encoded_name}",
                        content_type="image/png",
                        alt_text=f"Placeholder image of {readable_name}",
                        sort_order=0,
                        is_primary=True,
                        uploaded_by_id=accounts["demo_catalogue"].id,
                    )
                )
                summary["product_images_created"] += 1
        products[sku] = item
        _record(summary, "products", created)
    db.flush()
    return products


def _ensure_prices(
    db: Session,
    products: dict[str, Product],
    price_lists: dict[str, PriceList],
    accounts: dict[str, User],
    summary: Counter[str],
) -> None:
    effective_from = datetime(2026, 8, 1, tzinfo=UTC)
    for product in products.values():
        normal_amount = Decimal(product.price)
        for code, multiplier in PRICE_MULTIPLIERS.items():
            price_list = price_lists[code]
            existing = db.scalar(
                select(ProductPrice.id).where(
                    ProductPrice.product_id == product.id,
                    ProductPrice.price_list_id == price_list.id,
                    ProductPrice.status == "active",
                ).limit(1)
            )
            if existing is not None:
                summary["product_prices_reused"] += 1
                continue
            amount = (normal_amount * multiplier).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            db.add(
                ProductPrice(
                    product_id=product.id,
                    price_list_id=price_list.id,
                    currency="THB",
                    amount=amount,
                    effective_from=effective_from,
                    status="active",
                    reason=f"[{SEED_MARKER}] Initial demo {price_list.name} price.",
                    created_by_id=accounts["demo_price_manager"].id,
                    approved_by_id=accounts["demo_sales_manager"].id,
                    approved_at=effective_from,
                )
            )
            summary["product_prices_created"] += 1
    db.flush()

    request_specs = (
        ("GMS-DEMO-BV-001", "VIP", "pending", Decimal("31.00"), "Seasonal VIP promotion review."),
        ("GMS-DEMO-PT-001", "BIG_CUSTOMER", "approved", Decimal("205.00"), "Key-account volume agreement."),
        ("GMS-DEMO-OT-002", "DEALER", "rejected", Decimal("690.00"), "Requested dealer launch price."),
        ("GMS-DEMO-HH-002", "WHOLESALE", "pending", Decimal("132.00"), "Quarterly wholesale price review."),
    )
    for sku, price_code, status, amount, reason in request_specs:
        marked_reason = f"[{SEED_MARKER}] {reason}"
        existing = db.scalar(
            select(PriceChangeRequest.id).where(PriceChangeRequest.reason == marked_reason)
        )
        if existing is not None:
            summary["price_requests_reused"] += 1
            continue
        reviewed = status != "pending"
        db.add(
            PriceChangeRequest(
                product_id=products[sku].id,
                price_list_id=price_lists[price_code].id,
                proposed_amount=amount,
                currency="THB",
                effective_from=datetime.now(UTC) + timedelta(days=7),
                reason=marked_reason,
                status=status,
                requested_by_id=accounts["demo_price_manager"].id,
                reviewed_by_id=accounts["demo_sales_manager"].id if reviewed else None,
                review_reason="Reviewed during demo commercial meeting." if reviewed else "",
                reviewed_at=datetime.now(UTC) - timedelta(days=1) if reviewed else None,
            )
        )
        summary["price_requests_created"] += 1


def _snapshot_for(
    catalogue: Catalogue,
    links: list[CatalogueProduct],
    products_by_id: dict[Any, Product],
    amount_by_product: dict[Any, Decimal],
    version: int,
) -> dict[str, Any]:
    show_prices = bool(
        catalogue.show_prices
        and catalogue.price_list is not None
        and not catalogue.price_list.is_no_price
    )
    items: list[dict[str, Any]] = []
    for link in links:
        product = products_by_id[link.product_id]
        entry = product.catalogue_entry
        image = next((item for item in product.images if item.is_primary), None)
        row: dict[str, Any] = {
            "sku": product.sku,
            "name": entry.display_name or product.erp_name,
            "brand": product.brand,
            "description": link.override_description or entry.short_description,
            "long_description": entry.long_description,
            "categories": sorted(category.name for category in product.categories),
            "image_url": image.public_url if image else None,
            "section_title": link.section_title,
            "sort_order": link.sort_order,
        }
        if show_prices and not link.hide_price:
            row["price"] = str(amount_by_product[product.id])
            row["currency"] = catalogue.currency
        items.append(row)
    snapshot: dict[str, Any] = {
        "catalogue_id": str(catalogue.id),
        "title": catalogue.title,
        "description": catalogue.description,
        "audience": catalogue.audience,
        "language": catalogue.language,
        "show_prices": show_prices,
        "products": items,
        "generated_at": datetime.now(UTC).isoformat(),
        "version": version,
    }
    if show_prices:
        snapshot["currency"] = catalogue.currency
        snapshot["price_list"] = catalogue.price_list.name
    return snapshot


def _ensure_catalogues(
    db: Session,
    products: dict[str, Product],
    price_lists: dict[str, PriceList],
    accounts: dict[str, User],
    summary: Counter[str],
) -> None:
    product_list = list(products.values())
    specs = (
        ("hana-catalog-2026", "HANA CATALOG 2026", "published", "NO_PRICE", False, "HANA", product_list[:24]),
        ("fresh-everyday-essentials-demo", "Fresh & Everyday Essentials", "published", "NORMAL", True, "GMS Fresh", product_list[:14]),
        ("key-account-selection-demo", "Key Account Selection", "draft", "BIG_CUSTOMER", True, None, product_list[5:22]),
        ("retail-beverage-guide-demo", "Retail Beverage Guide", "published", "RETAIL", True, "Mori", product_list[12:24]),
        ("company-product-overview-demo", "Company Product Overview", "pending_review", "NO_PRICE", False, None, product_list[::2]),
        ("dealer-office-offers-demo", "Dealer Office Offers", "wip", "DEALER", True, "Northstar", product_list[28:]),
    )
    now = datetime.now(UTC)
    for spec_index, (slug, title, status, price_code, show_prices, brand, selected) in enumerate(specs):
        existing = db.scalar(select(Catalogue).where(Catalogue.slug == slug))
        if existing is not None:
            summary["catalogues_reused"] += 1
            continue
        published = status == "published"
        catalogue = Catalogue(
            title=title,
            slug=slug,
            description=f"Presentation catalogue for {title.lower()} workflows.",
            brand=brand,
            audience="Company customers" if published else "Internal review",
            price_list=price_lists[price_code],
            show_prices=show_prices,
            currency="THB",
            language="en",
            status=status,
            version=1 if published else 0,
            revision=2 if published else 1,
            valid_from=now - timedelta(days=3) if published else None,
            valid_until=now + timedelta(days=90) if published else None,
            is_public=published,
            owner_id=accounts["demo_catalogue"].id,
            created_by_id=accounts["demo_catalogue"].id,
            updated_by_id=accounts["demo_catalogue"].id,
            published_by_id=accounts["demo_sales_manager"].id if published else None,
            published_at=now - timedelta(days=spec_index + 1) if published else None,
        )
        db.add(catalogue)
        db.flush()
        links: list[CatalogueProduct] = []
        for order, product in enumerate(selected, start=1):
            link = CatalogueProduct(
                catalogue_id=catalogue.id,
                product_id=product.id,
                section_title=product.erp_category or "Products",
                override_description="",
                hide_price=False,
                sort_order=order,
            )
            db.add(link)
            links.append(link)
        db.flush()
        if published:
            active_prices = db.execute(
                select(ProductPrice.product_id, ProductPrice.amount).where(
                    ProductPrice.price_list_id == catalogue.price_list_id,
                    ProductPrice.product_id.in_([item.id for item in selected]),
                    ProductPrice.status == "active",
                )
            ).all()
            amount_by_product = {product_id: amount for product_id, amount in active_prices}
            snapshot = _snapshot_for(
                catalogue,
                links,
                {item.id: item for item in selected},
                amount_by_product,
                1,
            )
            db.add(
                CatalogueVersion(
                    catalogue_id=catalogue.id,
                    version_number=1,
                    snapshot=snapshot,
                    published_by_id=accounts["demo_sales_manager"].id,
                    published_at=catalogue.published_at,
                )
            )
            summary["catalogue_versions_created"] += 1
        summary["catalogues_created"] += 1


def _ensure_feedback(db: Session, accounts: dict[str, User], summary: Counter[str]) -> None:
    if Feedback is None:
        summary["feedback_unavailable"] += 1
        return
    specs = (
        ("products", "improvement", "Add Thai product name column", "Show Thai and English names together in product search.", "Add a configurable Thai-name column.", "high", "under_review", "demo_sales"),
        ("catalogues", "ui_change", "Larger catalogue preview", "The preview should use more screen width during customer meetings.", "Add a full-screen preview action.", "medium", "accepted", "demo_sales_manager"),
        ("pricing", "workflow_change", "Bulk price review", "Pricing would like to review several proposed changes together.", "Add a filtered batch review screen after the demo.", "medium", "new", "demo_price_manager"),
        ("product_images", "improvement", "Image quality guidance", "Users need clear recommended dimensions before upload.", "Show dimensions and file size beside the uploader.", "low", "completed", "demo_catalogue"),
    )
    for module, feedback_type, title, description, suggestion, priority, status, username in specs:
        marked_title = f"[Demo] {title}"
        existing = db.scalar(select(Feedback.id).where(Feedback.title == marked_title))
        if existing is not None:
            summary["feedback_reused"] += 1
            continue
        db.add(
            Feedback(
                module_page=module,
                feedback_type=feedback_type,
                title=marked_title,
                description=description,
                suggested_change=suggestion,
                priority=priority,
                status=status,
                internal_note=f"Seeded for the {SEED_MARKER} presentation.",
                submitted_by_id=accounts[username].id,
                assigned_to_id=accounts["demo_sales_manager"].id if status != "new" else None,
            )
        )
        summary["feedback_created"] += 1


def _ensure_audit_activity(
    db: Session, accounts: dict[str, User], summary: Counter[str]
) -> None:
    now = datetime.now(UTC)
    specs = (
        ("demo_login", "authentication", "success", "demo_catalogue", "Catalogue user signed in."),
        ("demo_product_updated", "products", "success", "demo_catalogue", "Updated product description."),
        ("demo_image_uploaded", "product_images", "success", "demo_catalogue", "Uploaded a main product image."),
        ("demo_catalogue_created", "catalogues", "success", "demo_catalogue", "Created Key Account Selection."),
        ("demo_catalogue_published", "catalogues", "success", "demo_sales_manager", "Published Fresh & Everyday Essentials."),
        ("demo_catalogue_exported", "catalogues", "success", "demo_sales", "Exported the permitted retail catalogue."),
        ("demo_price_proposed", "pricing", "success", "demo_price_manager", "Proposed a seasonal VIP price."),
        ("demo_price_approved", "pricing", "success", "demo_sales_manager", "Approved a key-account price."),
        ("demo_feedback_submitted", "feedback", "success", "demo_sales", "Submitted product-list feedback."),
        ("demo_product_searched", "products", "success", "demo_sales", "Searched published products."),
        ("demo_catalogue_previewed", "catalogues", "success", "demo_sales_manager", "Previewed the No Price catalogue."),
        ("demo_price_rejected", "pricing", "success", "demo_sales_manager", "Rejected a dealer price proposal."),
    )
    for index, (action, module, status, username, message) in enumerate(specs):
        identifier = f"{SEED_MARKER}:{action}"
        existing = db.scalar(select(AuditLog.id).where(AuditLog.identifier == identifier))
        if existing is not None:
            summary["audit_logs_reused"] += 1
            continue
        db.add(
            AuditLog(
                user_id=accounts[username].id,
                action=action,
                module=module,
                status=status,
                identifier=identifier,
                ip_address="127.0.0.1",
                user_agent="GMS Demo Presentation Seeder",
                details={"message": message, "seed": SEED_MARKER},
                created_at=now - timedelta(hours=index * 4),
            )
        )
        summary["audit_logs_created"] += 1


def seed_demo(db: Session, passwords: dict[str, str]) -> Counter[str]:
    """Add demo records to ``db`` and return a created/reused summary."""

    summary: Counter[str] = Counter()
    permissions, roles = _ensure_permissions_and_roles(db, summary)
    price_lists = _ensure_price_lists(db, summary)
    departments, positions, brands, teams = _ensure_organization(
        db, permissions, summary
    )
    accounts = _ensure_accounts(
        db,
        passwords,
        roles,
        departments,
        positions,
        teams,
        summary,
    )
    categories = _ensure_categories(db, summary)
    products = _ensure_products(db, accounts, brands, categories, summary)
    _ensure_prices(db, products, price_lists, accounts, summary)
    _ensure_catalogues(db, products, price_lists, accounts, summary)
    _ensure_feedback(db, accounts, summary)
    _ensure_audit_activity(db, accounts, summary)
    db.flush()
    return summary


def _print_summary(summary: Counter[str]) -> None:
    print("Demo presentation seed completed (no existing data was deleted).")
    for key in sorted(summary):
        print(f"  {key.replace('_', ' '):36} {summary[key]:>4}")
    print("\nDemo accounts (passwords come from environment variables):")
    for username, variable in PASSWORD_ENV_VARS.items():
        print(f"  {username:24} {variable}")
    print("Existing account passwords are never overwritten on repeat runs.")


def main() -> None:
    if not _enabled():
        raise SystemExit(
            "Refusing to seed demo data. Set DEMO_SEED_ENABLED=true explicitly, "
            "then run this command again."
        )
    if os.getenv("APP_ENV", "development").strip().casefold() == "production" and (
        os.getenv("DEMO_SEED_ALLOW_PRODUCTION", "").strip().casefold() not in TRUE_VALUES
    ):
        raise SystemExit(
            "Refusing to seed APP_ENV=production. Use a demo database, or explicitly "
            "set DEMO_SEED_ALLOW_PRODUCTION=true after confirming the target."
        )
    passwords = _validated_passwords()
    with SessionLocal() as db:
        try:
            summary = seed_demo(db, passwords)
            db.commit()
        except Exception:
            db.rollback()
            raise
    _print_summary(summary)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Demo seed cancelled; no data was committed.", file=sys.stderr)
        raise SystemExit(130) from None
