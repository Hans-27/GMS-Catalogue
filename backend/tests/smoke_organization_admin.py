"""Acceptance smoke test for role, position, and team administration."""

import os
import shutil
import tempfile
from pathlib import Path


test_directory = Path(tempfile.mkdtemp(prefix="gms-organization-admin-test-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{(test_directory / 'organization-admin.db').as_posix()}"
os.environ["SECRET_KEY"] = "organization-admin-smoke-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["UPLOAD_DIR"] = str(test_directory / "uploads")

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal
from app.main import app
from app.models import AuditLog, PermissionChangeLog, Role, User
from app.security import hash_password


def main() -> None:
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                superadmin_role = db.scalar(select(Role).where(Role.name == "superadmin"))
                admin = User(
                    username="access.admin",
                    email="access.admin@example.com",
                    full_name="Access Administrator",
                    password_hash=hash_password("AccessAdministrator123!"),
                    roles=[superadmin_role],
                )
                db.add(admin)
                db.commit()

            login = client.post("/api/auth/login", json={
                "identifier": "access.admin",
                "password": "AccessAdministrator123!",
                "remember_me": False,
            })
            assert login.status_code == 200, login.text

            permissions = client.get("/api/organization/permissions")
            assert permissions.status_code == 200, permissions.text
            permission_by_code = {item["code"]: item["id"] for item in permissions.json()}
            inherited_permission = permission_by_code["catalogue.edit"]

            role_payload = {
                "name": "Brand Content Manager",
                "code": "brand_content_manager",
                "description": "Maintains assigned brand catalogue content.",
                "is_active": True,
                "role_type": "custom",
                "default_scope": "assigned_brands",
                "permission_grants": [{
                    "permission_id": inherited_permission,
                    "effect": "allow",
                    "access_scope": "assigned_brands",
                }],
                "price_list_ids": [],
                "department_restriction_id": None,
                "team_restriction_id": None,
            }
            role = client.post("/api/v1/roles", json=role_payload)
            assert role.status_code == 201, role.text
            role_id = role.json()["id"]
            assert role.json()["permission_count"] == 1

            conflict = client.post("/api/v1/roles", json={**role_payload, "name": "Other Name"})
            assert conflict.status_code == 409, conflict.text

            duplicate = client.post(f"/api/v1/roles/{role_id}/duplicate", json={
                "name": "Brand Content Manager Copy",
                "code": "brand_content_manager_copy",
            })
            assert duplicate.status_code == 201, duplicate.text
            assert duplicate.json()["permission_ids"] == [inherited_permission]

            update_matrix = client.put(f"/api/v1/roles/{role_id}/permissions", json={
                "grants": [{
                    "permission_id": inherited_permission,
                    "effect": "allow",
                    "access_scope": "department",
                }],
                "reason": "Acceptance test scope adjustment",
            })
            assert update_matrix.status_code == 200, update_matrix.text
            assert update_matrix.json()["grants"][0]["access_scope"] == "department"

            protected = client.get("/api/v1/roles?role_type=system")
            assert protected.status_code == 200, protected.text
            superadmin_role_id = next(item["id"] for item in protected.json()["items"] if item["code"] == "superadmin")
            protected_delete = client.delete(f"/api/v1/roles/{superadmin_role_id}")
            assert protected_delete.status_code == 409, protected_delete.text

            department = client.post("/api/organization/departments", json={
                "name": "Digital Commerce",
                "code": "DIGITAL",
                "description": "Digital catalogue operations.",
                "parent_id": None,
                "is_active": True,
            })
            assert department.status_code == 201, department.text
            department_id = department.json()["id"]

            manager_position = client.post("/api/v1/positions", json={
                "code": "DIG_MGR",
                "name_en": "Digital Commerce Manager",
                "name_th": "ผู้จัดการดิจิทัลคอมเมิร์ซ",
                "description": "Leads digital catalogue operations.",
                "department_id": department_id,
                "default_team_id": None,
                "reports_to_position_id": None,
                "management_level": "manager",
                "default_role_ids": [role_id],
                "is_active": True,
                "display_order": 10,
            })
            assert manager_position.status_code == 201, manager_position.text
            position_id = manager_position.json()["id"]

            child_position = client.post("/api/v1/positions", json={
                "code": "DIG_STAFF",
                "name_en": "Digital Content Staff",
                "name_th": "เจ้าหน้าที่เนื้อหาดิจิทัล",
                "description": "Maintains product content.",
                "department_id": department_id,
                "default_team_id": None,
                "reports_to_position_id": position_id,
                "management_level": "staff",
                "default_role_ids": [],
                "is_active": True,
                "display_order": 20,
            })
            assert child_position.status_code == 201, child_position.text
            child_position_id = child_position.json()["id"]

            position_cycle = client.patch(f"/api/v1/positions/{position_id}", json={
                "code": "DIG_MGR",
                "name_en": "Digital Commerce Manager",
                "name_th": "ผู้จัดการดิจิทัลคอมเมิร์ซ",
                "description": "Leads digital catalogue operations.",
                "department_id": department_id,
                "default_team_id": None,
                "reports_to_position_id": child_position_id,
                "management_level": "manager",
                "default_role_ids": [role_id],
                "is_active": True,
                "display_order": 10,
            })
            assert position_cycle.status_code == 422, position_cycle.text

            parent_team = client.post("/api/v1/teams", json={
                "code": "DIGITAL_MAIN",
                "name_en": "Digital Main Team",
                "name_th": "ทีมดิจิทัลหลัก",
                "description": "Main digital catalogue team.",
                "department_id": department_id,
                "team_leader_user_id": None,
                "parent_team_id": None,
                "default_position_ids": [position_id],
                "default_role_ids": [role_id],
                "brand_ids": [],
                "is_active": True,
                "display_order": 10,
                "allow_cross_department_leader": False,
            })
            assert parent_team.status_code == 201, parent_team.text
            team_id = parent_team.json()["id"]

            child_team = client.post("/api/v1/teams", json={
                "code": "DIGITAL_CHILD",
                "name_en": "Digital Child Team",
                "name_th": "ทีมดิจิทัลย่อย",
                "description": "Child team for hierarchy validation.",
                "department_id": department_id,
                "team_leader_user_id": None,
                "parent_team_id": team_id,
                "default_position_ids": [],
                "default_role_ids": [],
                "brand_ids": [],
                "is_active": True,
                "display_order": 20,
                "allow_cross_department_leader": False,
            })
            assert child_team.status_code == 201, child_team.text

            team_cycle_payload = dict(parent_team.json())
            for field in ("id", "department_name", "team_leader_name", "parent_team_name", "member_count", "child_team_count", "created_at", "updated_at"):
                team_cycle_payload.pop(field, None)
            team_cycle_payload["parent_team_id"] = child_team.json()["id"]
            team_cycle_payload["allow_cross_department_leader"] = False
            team_cycle = client.patch(f"/api/v1/teams/{team_id}", json=team_cycle_payload)
            assert team_cycle.status_code == 422, team_cycle.text

            managed = client.post("/api/users", json={
                "full_name": "Inherited Team User",
                "username": "inherited.team.user",
                "email": "inherited.team.user@example.com",
                "password": "InheritedTeamUser123!",
                "role_names": ["system_user"],
                "department_id": department_id,
                "position_id": child_position_id,
                "employee_code": "DIG-100",
                "team_ids": [team_id],
                "primary_team_id": team_id,
            })
            assert managed.status_code == 201, managed.text
            assert managed.json()["primary_team_id"] == team_id
            assert any(
                item["source"] == "team" and item["source_name"] == "Digital Main Team"
                for item in managed.json()["inherited_roles"]
            )

            login_user = client.post("/api/auth/login", json={
                "identifier": "inherited.team.user",
                "password": "InheritedTeamUser123!",
                "remember_me": False,
            })
            assert login_user.status_code == 200, login_user.text
            assert "catalogue.edit" in login_user.json()["user"]["permissions"]

            unauthorized = client.post("/api/v1/roles", json={**role_payload, "name": "Forbidden Role", "code": "forbidden_role"})
            assert unauthorized.status_code == 403, unauthorized.text

            client.post("/api/auth/login", json={
                "identifier": "access.admin",
                "password": "AccessAdministrator123!",
                "remember_me": False,
            })
            in_use_delete = client.delete(f"/api/v1/roles/{role_id}")
            assert in_use_delete.status_code == 409, in_use_delete.text
            deactivated = client.post(f"/api/v1/roles/{role_id}/deactivate")
            assert deactivated.status_code == 200, deactivated.text

            with SessionLocal() as db:
                assert db.scalar(select(func.count()).select_from(PermissionChangeLog)) >= 1
                audited = db.scalar(select(func.count()).select_from(AuditLog).where(AuditLog.module.in_(["roles", "positions", "teams"])))
                assert audited >= 8

        print("Organization administration acceptance smoke test: OK")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
