"""Replace demo users with the active legacy catalogue usernames.

SuperAdmin is always preserved. New accounts receive the least-privilege
``system_user`` role and a cryptographically random, unrecoverable initial
password. SuperAdmin must set a real password before handing an account to a
user.

Usage:
    python -m app.scripts.reconcile_legacy_users
    python -m app.scripts.reconcile_legacy_users --apply
"""

from __future__ import annotations

import argparse
import secrets

from sqlalchemy import delete, func, select

from app.database import SessionLocal
from app.models import AuditLog, Role, User
from app.security import hash_password


LEGACY_USERS = {
    "admin": "Admin",
    "wa": "WA",
    "rabbit": "Rabbit",
    "chermin": "Chermin",
    "godown": "Godown",
    "sale": "Sale",
    "admin19": "Admin 19",
    "warehouse": "Warehouse",
    "packer": "Packer",
}


def preview() -> dict[str, list[str]]:
    with SessionLocal() as db:
        current = list(db.scalars(select(User.username).order_by(User.username)))
        remove = [name for name in current if name.casefold() != "superadmin"]
        existing = {name.casefold() for name in current}
        create = [name for name in LEGACY_USERS if name.casefold() not in existing]
        return {
            "preserve": [name for name in current if name.casefold() == "superadmin"],
            "remove": remove,
            "create": create,
        }


def apply() -> dict[str, list[str] | int]:
    with SessionLocal() as db:
        superadmin = db.scalar(
            select(User).where(func.lower(User.username) == "superadmin")
        )
        if superadmin is None or not superadmin.is_active:
            raise RuntimeError("An active SuperAdmin account is required.")

        system_user = db.scalar(
            select(Role).where(Role.name == "system_user", Role.is_active.is_(True))
        )
        if system_user is None:
            raise RuntimeError("The active system_user role is required.")

        removed = list(
            db.scalars(
                select(User.username)
                .where(func.lower(User.username) != "superadmin")
                .order_by(User.username)
            )
        )
        db.execute(delete(User).where(func.lower(User.username) != "superadmin"))
        db.flush()

        created: list[str] = []
        for username, full_name in LEGACY_USERS.items():
            user = User(
                username=username,
                email=f"{username}@gms.co.th",
                full_name=full_name,
                password_hash=hash_password(secrets.token_urlsafe(32) + "Aa1!"),
                is_active=True,
                roles=[system_user],
            )
            db.add(user)
            created.append(username)

        db.add(
            AuditLog(
                user_id=superadmin.id,
                action="legacy_users_reconciled",
                module="users",
                status="success",
                identifier="legacy-catalogue-user-list",
                details={
                    "preserved": [superadmin.username],
                    "removed": removed,
                    "created": created,
                    "new_role": "system_user",
                    "password_policy": "SuperAdmin reset required before first login",
                },
            )
        )
        db.commit()
        return {
            "removed_count": len(removed),
            "removed": removed,
            "created_count": len(created),
            "created": created,
            "preserved": [superadmin.username],
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    print(apply() if args.apply else preview())


if __name__ == "__main__":
    main()
