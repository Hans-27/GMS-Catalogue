"""Remove business data while preserving schema and one SuperAdmin account.

Run only after creating a database/upload backup:
    python -m app.scripts.reset_catalogue_data --confirm-reset
"""

import argparse

from sqlalchemy import delete, func, select

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
    Position,
    Product,
    ProductImage,
    Team,
    User,
    UserOrganizationProfile,
    UserPermissionOverride,
    position_permissions,
    product_categories,
    team_brands,
    team_permissions,
    user_roles,
    user_teams,
)


def _count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Reset products, media metadata, pricing and catalogue data while "
            "preserving users, roles, permissions and organization records."
        )
    )
    parser.add_argument(
        "--confirm-reset",
        action="store_true",
        help="Required confirmation for the destructive database reset.",
    )
    parser.add_argument(
        "--keep-user",
        default="SuperAdmin",
        help="The single SuperAdmin username to preserve (default: SuperAdmin).",
    )
    args = parser.parse_args()
    if not args.confirm_reset:
        parser.error("Pass --confirm-reset after creating a backup.")

    with SessionLocal() as db:
        preserved_user = db.scalar(
            select(User).where(func.lower(User.username) == args.keep_user.casefold())
        )
        if not preserved_user or "superadmin" not in {
            role.name for role in preserved_user.roles
        }:
            raise SystemExit(
                f"Reset cancelled: {args.keep_user!r} is not a SuperAdmin account."
            )
        before = {
            "products": _count(db, Product),
            "images": _count(db, ProductImage),
            "categories": _count(db, Category),
            "brands": _count(db, Brand),
            "catalogues": _count(db, Catalogue),
            "prices": _count(db, ProductPrice),
            "price_lists": _count(db, PriceList),
            "audit_logs": _count(db, AuditLog),
            "users": _count(db, User),
            "departments": _count(db, Department),
        }

        # Delete leaf and association records first so this works consistently
        # with SQLite and PostgreSQL foreign-key enforcement.
        db.execute(delete(CatalogueVersion))
        db.execute(delete(CatalogueProduct))
        db.execute(delete(Catalogue))
        db.execute(delete(PriceChangeRequest))
        db.execute(delete(ProductPrice))
        db.execute(delete(ProductImage))
        db.execute(delete(product_categories))
        db.execute(delete(CatalogueEntry))
        db.execute(delete(Product))
        db.execute(delete(DepartmentBrandAccess))
        db.execute(delete(team_brands))
        db.execute(delete(Category))
        db.execute(delete(Brand))
        db.execute(delete(PriceList))
        db.execute(delete(AuditLog))
        db.execute(delete(UserPermissionOverride))
        db.execute(delete(user_teams))
        db.execute(
            delete(user_roles).where(user_roles.c.user_id != preserved_user.id)
        )
        db.execute(delete(UserOrganizationProfile))
        db.execute(delete(team_permissions))
        db.execute(delete(position_permissions))
        db.execute(delete(Team))
        db.execute(delete(Position))
        db.execute(delete(Department))
        db.execute(delete(User).where(User.id != preserved_user.id))
        db.commit()

        after = {
            "products": _count(db, Product),
            "images": _count(db, ProductImage),
            "categories": _count(db, Category),
            "brands": _count(db, Brand),
            "catalogues": _count(db, Catalogue),
            "prices": _count(db, ProductPrice),
            "price_lists": _count(db, PriceList),
            "audit_logs": _count(db, AuditLog),
            "users": _count(db, User),
            "departments": _count(db, Department),
        }

    print(f"Before reset: {before}")
    print(f"After reset:  {after}")
    print(f"Preserved SuperAdmin account: {args.keep_user}")
    print("Database schema, roles and permissions were preserved.")


if __name__ == "__main__":
    main()
