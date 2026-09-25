"""End-to-end organization and permission API smoke test."""

import os
import shutil
import tempfile
from pathlib import Path


test_directory = Path(tempfile.mkdtemp(prefix="gms-organization-test-"))
os.environ["DATABASE_URL"] = (
    f"sqlite+pysqlite:///{(test_directory / 'organization.db').as_posix()}"
)
os.environ["SECRET_KEY"] = "organization-smoke-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["UPLOAD_DIR"] = str(test_directory / "uploads")

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models import Role, User
from app.security import hash_password


def main() -> None:
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                role = db.scalar(select(Role).where(Role.name == "superadmin"))
                admin = User(
                    username="organization.admin",
                    email="organization.admin@example.com",
                    full_name="Organization Admin",
                    password_hash=hash_password("OrganizationAdmin123!"),
                    roles=[role],
                )
                db.add(admin)
                db.commit()

            login = client.post(
                "/api/auth/login",
                json={
                    "identifier": "organization.admin",
                    "password": "OrganizationAdmin123!",
                    "remember_me": False,
                },
            )
            assert login.status_code == 200, login.text

            department = client.post(
                "/api/organization/departments",
                json={
                    "name": "Marketing",
                    "code": "MKT",
                    "description": "Brand and campaign management.",
                    "parent_id": None,
                    "is_active": True,
                },
            )
            assert department.status_code == 201, department.text
            department_id = department.json()["id"]

            position = client.post(
                "/api/organization/positions",
                json={
                    "name": "Brand Manager",
                    "code": "MKT_BM",
                    "description": "Owns brand execution.",
                    "department_id": department_id,
                    "is_active": True,
                },
            )
            assert position.status_code == 201, position.text
            assert "level" not in position.json()
            position_id = position.json()["id"]

            brand = client.post(
                "/api/organization/brands",
                json={
                    "name": "North Star",
                    "code": "NSTAR",
                    "description": "Test brand.",
                    "is_active": True,
                },
            )
            assert brand.status_code == 201, brand.text
            brand_id = brand.json()["id"]

            access = client.put(
                f"/api/organization/catalogue-access/{department_id}/{brand_id}",
                json={"can_view": True, "can_manage": False},
            )
            assert access.status_code == 200, access.text
            assert access.json()["can_view"] is True
            assert access.json()["can_manage"] is False
            access_list = client.get("/api/organization/catalogue-access")
            assert access_list.status_code == 200
            assert len(access_list.json()) == 1

            team = client.post(
                "/api/organization/teams",
                json={
                    "name": "North Star Team",
                    "code": "NSTAR_TEAM",
                    "description": "Manages North Star.",
                    "department_id": department_id,
                    "brand_ids": [brand_id],
                    "is_active": True,
                },
            )
            assert team.status_code == 201, team.text
            team_id = team.json()["id"]

            managed = client.post(
                "/api/users",
                json={
                    "full_name": "Brand Owner",
                    "username": "brand.owner",
                    "email": "brand.owner@example.com",
                    "password": "BrandOwnerPassword123!",
                    "role_names": ["catalogue_editor"],
                    "department_id": department_id,
                    "position_id": position_id,
                    "employee_code": "EMP-100",
                    "team_ids": [team_id],
                },
            )
            assert managed.status_code == 201, managed.text
            body = managed.json()
            assert body["department_name"] == "Marketing"
            assert body["position_name"] == "Brand Manager"
            assert body["team_names"] == ["North Star Team"]
            assert body["brand_names"] == ["North Star"]

            permissions = client.get("/api/organization/permissions")
            assert permissions.status_code == 200
            assert len(permissions.json()) >= 10
            permission_by_code = {
                item["code"]: item["id"] for item in permissions.json()
            }
            position_grants = client.put(
                f"/api/organization/positions/{position_id}/permissions",
                json={
                    "permission_ids": [permission_by_code["audit.view"]],
                },
            )
            assert position_grants.status_code == 200, position_grants.text
            team_grants = client.put(
                f"/api/organization/teams/{team_id}/permissions",
                json={
                    "permission_ids": [permission_by_code["users.manage"]],
                },
            )
            assert team_grants.status_code == 200, team_grants.text

            summary = client.get("/api/organization/summary")
            assert summary.status_code == 200
            assert summary.json()["assigned_users"] == 1

            managed_login = client.post(
                "/api/auth/login",
                json={
                    "identifier": "brand.owner",
                    "password": "BrandOwnerPassword123!",
                    "remember_me": False,
                },
            )
            assert managed_login.status_code == 200, managed_login.text
            effective_permissions = set(
                managed_login.json()["user"]["permissions"]
            )
            assert {"audit.view", "users.manage"}.issubset(
                effective_permissions
            )
            inherited_user_access = client.get("/api/users")
            assert inherited_user_access.status_code == 200

        print("Organization and permissions smoke test: OK")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
