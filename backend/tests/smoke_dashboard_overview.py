"""Permission-aware dashboard regression test.

Run with ``python -m tests.smoke_dashboard_overview``.
"""

import os
import shutil
import tempfile
from pathlib import Path


test_directory = Path(tempfile.mkdtemp(prefix="gms-dashboard-test-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{(test_directory / 'dashboard.db').as_posix()}"
os.environ["SECRET_KEY"] = "dashboard-overview-smoke-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal
from app.main import app
from app.models import Brand, Role, User, UserDataScope
from app.security import hash_password


def login(client: TestClient, identifier: str, password: str) -> dict:
    response = client.post(
        "/api/auth/login",
        json={"identifier": identifier, "password": password, "remember_me": False},
    )
    assert response.status_code == 200, response.text
    return response.json()["user"]


def main() -> None:
    try:
        with TestClient(app) as client:
            assert client.get("/api/v1/dashboard/overview").status_code == 401

            with SessionLocal() as db:
                super_role = db.scalar(select(Role).where(Role.system_key == "SUPERADMIN"))
                editor_role = db.scalar(select(Role).where(Role.name == "catalogue_editor"))
                mori = db.scalar(select(Brand).where(func.lower(Brand.name) == "mori"))
                assert super_role and editor_role and mori

                super_user = User(
                    username="dashboard.super",
                    email="dashboard.super@example.com",
                    full_name="Dashboard SuperAdmin",
                    password_hash=hash_password("DashboardSuper123!"),
                    roles=[super_role],
                )
                editor = User(
                    username="dashboard.editor",
                    email="dashboard.editor@example.com",
                    full_name="Scoped Dashboard Editor",
                    password_hash=hash_password("DashboardEditor123!"),
                    roles=[editor_role],
                    assigned_brands=[mori],
                    data_scope=UserDataScope(published_only=False),
                )
                db.add_all([super_user, editor])
                db.commit()

            login(client, "dashboard.editor", "DashboardEditor123!")
            response = client.get("/api/v1/dashboard/overview")
            assert response.status_code == 200, response.text
            scoped = response.json()
            assert scoped["summary"]["active_products"] >= 1
            assert scoped["summary"]["inactive_products"] is None
            assert scoped["system_health"] is None
            assert scoped["sync_status"]["technical_status"] is None
            assert scoped["sync_status"]["last_failed_at"] is None
            assert scoped["recent_products"]
            assert {item["brand"] for item in scoped["recent_products"]} == {"Mori"}

            search = client.get("/api/v1/search/global", params={"q": "Mori"})
            assert search.status_code == 200, search.text
            assert search.json()["groups"].get("products")
            assert all("Mori" in item["subtitle"] for item in search.json()["groups"]["products"])
            outside_scope = client.get("/api/v1/search/global", params={"q": "Lumira"})
            assert outside_scope.status_code == 200, outside_scope.text
            assert not outside_scope.json()["groups"].get("products")

            sync = client.get("/api/v1/dashboard/sync-status")
            assert sync.status_code == 200, sync.text
            assert sync.json()["technical_status"] is None

            login(client, "dashboard.super", "DashboardSuper123!")
            response = client.get("/api/v1/dashboard/overview")
            assert response.status_code == 200, response.text
            privileged = response.json()
            stats = client.get("/api/catalogue/stats")
            assert stats.status_code == 200, stats.text
            assert privileged["product_metrics"] == stats.json()
            assert privileged["summary"]["inactive_products"] is not None
            assert privileged["system_health"] is not None

        print("Permission-aware dashboard smoke test: OK")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
