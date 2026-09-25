"""Scoped RBAC regression test. Run with ``python -m tests.smoke_access_control``."""

import os
import shutil
import tempfile
from pathlib import Path

test_directory = Path(tempfile.mkdtemp(prefix="gms-access-test-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{(test_directory / 'access.db').as_posix()}"
os.environ["SECRET_KEY"] = "access-control-smoke-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal
from app.main import app
from app.models import Brand, Permission, Role, User, UserDataScope, UserPermissionOverride
from app.security import hash_password


def login(client: TestClient, identifier: str, password: str):
    response = client.post("/api/auth/login", json={"identifier": identifier, "password": password, "remember_me": False})
    assert response.status_code == 200, response.text
    return response.json()["user"]


def main() -> None:
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                super_role = db.scalar(select(Role).where(Role.system_key == "SUPERADMIN"))
                editor_role = db.scalar(select(Role).where(Role.name == "catalogue_editor"))
                price_role = db.scalar(select(Role).where(Role.name == "price_manager"))
                mori = db.scalar(select(Brand).where(func.lower(Brand.name) == "mori"))
                assert super_role and super_role.is_system and not super_role.permissions
                assert editor_role and price_role and mori
                super_user = User(username="access.super", email="access.super@example.com", full_name="Access SuperAdmin", password_hash=hash_password("AccessSuper123!"), roles=[super_role])
                editor = User(username="access.editor", email="access.editor@example.com", full_name="Scoped Editor", password_hash=hash_password("AccessEditor123!"), roles=[editor_role], assigned_brands=[mori], data_scope=UserDataScope(published_only=False))
                first_price_list = price_role.allowed_price_lists[0]
                price_role.allowed_price_lists = [first_price_list]
                price_user = User(username="access.price", email="access.price@example.com", full_name="Scoped Price", password_hash=hash_password("AccessPrice123!"), roles=[price_role], assigned_brands=[mori], data_scope=UserDataScope(published_only=False))
                # A role can grant price actions while the separate price-list relation
                # determines which lists are actually visible.
                price_user.assigned_price_lists = [first_price_list]
                db.add_all([super_user, editor, price_user])
                db.commit()
                super_id, editor_id = super_user.id, editor.id

            me = login(client, "access.editor", "AccessEditor123!")
            assert not me["is_superadmin"]
            products = client.get("/api/catalogue/products")
            assert products.status_code == 200, products.text
            assert products.json()["items"]
            assert {item["brand"] for item in products.json()["items"]} == {"Mori"}

            with SessionLocal() as db:
                editor = db.get(User, editor_id)
                view_permission = db.scalar(select(Permission).where(Permission.code == "products.view"))
                editor.permission_overrides.append(UserPermissionOverride(permission=view_permission, is_allowed=False, access_scope="none", reason="Deny-wins regression"))
                db.commit()
            login(client, "access.editor", "AccessEditor123!")
            assert client.get("/api/catalogue/products").status_code == 403

            login(client, "access.price", "AccessPrice123!")
            price_lists = client.get("/api/v1/price-lists")
            assert price_lists.status_code == 200, price_lists.text
            assert len(price_lists.json()) == 1

            super_me = login(client, "access.super", "AccessSuper123!")
            assert super_me["is_superadmin"] is True
            effective = client.get("/api/v1/auth/me/permissions")
            assert effective.status_code == 200, effective.text
            assert "permissions.manage" in effective.json()["permissions"]
            # The only active protected SuperAdmin cannot remove their own reserved role.
            blocked = client.put(
                f"/api/v1/access/users/{super_id}",
                json={"role_ids": [], "reason": "Final-admin protection test", "reauth_password": "AccessSuper123!"},
            )
            assert blocked.status_code == 409, blocked.text

        print("Scoped access-control smoke test: OK")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
