"""End-to-end user-management API smoke test.

Run from ``backend`` with:
    python -m tests.smoke_users
"""

import os
import shutil
import tempfile
from datetime import datetime, timedelta
from pathlib import Path


test_directory = Path(tempfile.mkdtemp(prefix="gms-users-test-"))
os.environ["DATABASE_URL"] = (
    f"sqlite+pysqlite:///{(test_directory / 'users.db').as_posix()}"
)
os.environ["SECRET_KEY"] = "user-management-smoke-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["UPLOAD_DIR"] = str(test_directory / "uploads")

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models import AuditLog, Permission, Role, User
from app.security import hash_password


def login(client: TestClient, identifier: str, password: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={
            "identifier": identifier,
            "password": password,
            "remember_me": False,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def main() -> None:
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                superadmin_role = db.scalar(
                    select(Role).where(Role.name == "superadmin")
                )
                system_user_role = db.scalar(
                    select(Role).where(Role.name == "system_user")
                )
                assert superadmin_role is not None
                assert system_user_role is not None
                admin = User(
                    username="user.admin",
                    email="user.admin@example.com",
                    full_name="User Administrator",
                    password_hash=hash_password("AdminPassword123!"),
                    roles=[superadmin_role],
                )
                standard_user = User(
                    username="standard.user",
                    email="standard.user@example.com",
                    full_name="Standard User",
                    password_hash=hash_password("StandardPassword123!"),
                    roles=[system_user_role],
                )
                db.add_all([admin, standard_user])
                db.commit()
                admin_id = str(admin.id)
                standard_user_id = str(standard_user.id)

            login(client, "user.admin", "AdminPassword123!")

            role_response = client.get("/api/users/roles")
            assert role_response.status_code == 200
            role_names = {role["name"] for role in role_response.json()}
            assert {"system_user", "catalogue_editor", "superadmin"}.issubset(
                role_names
            )

            list_response = client.get("/api/users")
            assert list_response.status_code == 200
            assert len(list_response.json()) == 2

            create_response = client.post(
                "/api/users",
                json={
                    "full_name": "Managed Editor",
                    "username": "managed.editor",
                    "email": "managed.editor@example.com",
                    "password": "ManagedPassword123!",
                    "role_names": ["catalogue_editor"],
                },
            )
            assert create_response.status_code == 201, create_response.text
            managed = create_response.json()
            assert managed["roles"] == ["catalogue_editor", "system_user"]

            with SessionLocal() as db:
                stored = db.scalar(
                    select(User).where(User.username == "managed.editor")
                )
                assert stored is not None
                assert stored.password_hash != "ManagedPassword123!"

            update_response = client.patch(
                f"/api/users/{managed['id']}",
                json={
                    "full_name": "Managed Catalogue Editor",
                    "email": "managed.editor@example.com",
                    "is_active": False,
                    "role_names": ["catalogue_editor", "viewer"],
                },
            )
            assert update_response.status_code == 200, update_response.text
            assert update_response.json()["is_active"] is False
            assert update_response.json()["roles"] == [
                "catalogue_editor",
                "system_user",
                "viewer",
            ]

            reset_response = client.post(
                f"/api/users/{managed['id']}/reset-password",
                json={"password": "ReplacementPassword123!"},
            )
            assert reset_response.status_code == 200, reset_response.text

            activate_response = client.patch(
                f"/api/users/{managed['id']}",
                json={
                    "is_active": True,
                    "role_names": ["catalogue_editor", "viewer"],
                },
            )
            assert activate_response.status_code == 200
            login(client, "managed.editor", "ReplacementPassword123!")

            login(client, "user.admin", "AdminPassword123!")
            with SessionLocal() as db:
                stored = db.scalar(
                    select(User).where(User.username == "managed.editor")
                )
                stored.failed_login_attempts = 4
                stored.locked_until = datetime.now() + timedelta(minutes=10)
                db.commit()

            unlock_response = client.post(f"/api/users/{managed['id']}/unlock")
            assert unlock_response.status_code == 200
            assert unlock_response.json()["user"]["failed_login_attempts"] == 0
            assert unlock_response.json()["user"]["locked_until"] is None

            remove_final_admin = client.patch(
                f"/api/users/{admin_id}",
                json={"role_names": ["system_user"]},
            )
            assert remove_final_admin.status_code == 409
            deactivate_self = client.patch(
                f"/api/users/{admin_id}",
                json={"is_active": False},
            )
            assert deactivate_self.status_code == 409

            with SessionLocal() as db:
                catalogue_view = db.scalar(
                    select(Permission).where(Permission.code == "catalogue.view")
                )
                users_manage = db.scalar(
                    select(Permission).where(Permission.code == "users.manage")
                )
                assert catalogue_view is not None
                assert users_manage is not None

            override_response = client.put(
                f"/api/users/{standard_user_id}/permission-overrides",
                json={
                    "overrides": [
                        {
                            "permission_id": catalogue_view.id,
                            "is_allowed": False,
                            "reason": "Restrict catalogue access for this user.",
                        },
                        {
                            "permission_id": users_manage.id,
                            "is_allowed": True,
                            "reason": "Temporary user administration duty.",
                        },
                    ]
                },
            )
            assert override_response.status_code == 200, override_response.text
            override_by_code = {
                item["permission_code"]: item
                for item in override_response.json()
            }
            assert override_by_code["catalogue.view"]["is_allowed"] is False
            assert override_by_code["users.manage"]["is_allowed"] is True

            get_overrides = client.get(
                f"/api/users/{standard_user_id}/permission-overrides"
            )
            assert get_overrides.status_code == 200, get_overrides.text
            assert get_overrides.json() == override_response.json()

            with SessionLocal() as db:
                audit = db.scalar(
                    select(AuditLog).where(
                        AuditLog.action == "user_permission_overrides_updated"
                    )
                )
                assert audit is not None
                assert audit.details["target_user_id"] == standard_user_id

            standard_login = login(
                client,
                "standard.user",
                "StandardPassword123!",
            )
            effective_permissions = set(standard_login["user"]["permissions"])
            assert "catalogue.view" not in effective_permissions
            assert "users.manage" in effective_permissions

            denied_catalogue = client.get("/api/catalogue/products")
            assert denied_catalogue.status_code == 403
            allowed_user_admin = client.get("/api/users")
            assert allowed_user_admin.status_code == 200

            forbidden_override_read = client.get(
                f"/api/users/{standard_user_id}/permission-overrides"
            )
            assert forbidden_override_read.status_code == 403
            forbidden_override_write = client.put(
                f"/api/users/{standard_user_id}/permission-overrides",
                json={"overrides": []},
            )
            assert forbidden_override_write.status_code == 403

        print("User management smoke test: OK")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
