"""End-to-end demo feedback API smoke test."""

import base64
import os
import shutil
import tempfile
from pathlib import Path


test_directory = Path(tempfile.mkdtemp(prefix="gms-feedback-test-"))
os.environ["DATABASE_URL"] = (
    f"sqlite+pysqlite:///{(test_directory / 'feedback.db').as_posix()}"
)
os.environ["SECRET_KEY"] = "feedback-smoke-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["UPLOAD_DIR"] = str(test_directory / "uploads")

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.database import SessionLocal
from app.feedback_models import Feedback
from app.main import app
from app.models import AuditLog, Role, User
from app.security import hash_password


ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUB"
    "AScY42YAAAAASUVORK5CYII="
)


def login(client: TestClient, identifier: str, password: str) -> None:
    response = client.post(
        "/api/auth/login",
        json={
            "identifier": identifier,
            "password": password,
            "remember_me": False,
        },
    )
    assert response.status_code == 200, response.text


def main() -> None:
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                superadmin_role = db.scalar(
                    select(Role).where(Role.name == "superadmin")
                )
                reporter_role = db.scalar(
                    select(Role).where(Role.name == "catalogue_editor")
                )
                admin = User(
                    username="feedback.admin",
                    email="feedback.admin@example.com",
                    full_name="Feedback Administrator",
                    password_hash=hash_password("FeedbackAdmin123!"),
                    roles=[superadmin_role],
                )
                reporter = User(
                    username="feedback.reporter",
                    email="feedback.reporter@example.com",
                    full_name="Demo Reviewer",
                    password_hash=hash_password("FeedbackReporter123!"),
                    roles=[reporter_role],
                )
                db.add_all([admin, reporter])
                db.commit()
                admin_id = admin.id

            login(client, "feedback.reporter", "FeedbackReporter123!")
            created = client.post(
                "/api/v1/feedback",
                json={
                    "module_page": "Product Management",
                    "feedback_type": "improvement",
                    "title": "Make product filters persistent",
                    "description": "The selected filters reset after opening a product.",
                    "suggested_change": "Restore the previous filters on return.",
                    "priority": "medium",
                },
            )
            assert created.status_code == 201, created.text
            feedback_id = created.json()["id"]
            assert created.json()["submitted_by_name"] == "Demo Reviewer"
            assert created.json()["status"] == "new"

            forbidden_list = client.get("/api/v1/feedback")
            assert forbidden_list.status_code == 403, forbidden_list.text

            invalid_image = client.post(
                f"/api/v1/feedback/{feedback_id}/screenshot",
                files={"screenshot": ("fake.png", b"not an image", "image/png")},
            )
            assert invalid_image.status_code == 415, invalid_image.text

            uploaded = client.post(
                f"/api/v1/feedback/{feedback_id}/screenshot",
                files={"screenshot": ("screen.png", ONE_PIXEL_PNG, "image/png")},
            )
            assert uploaded.status_code == 200, uploaded.text
            uploaded_body = uploaded.json()
            assert uploaded_body["screenshot_url"].startswith("/uploads/feedback/")
            stored_path = test_directory / "uploads" / "feedback"
            assert len(list(stored_path.glob("*.png"))) == 1

            multipart = client.post(
                "/api/v1/feedback/with-screenshot",
                data={
                    "module_page": "Catalogue Preview",
                    "feedback_type": "ui_change",
                    "title": "Increase preview text size",
                    "description": "The preview text is difficult to read on a tablet.",
                    "suggested_change": "Use a larger responsive text size.",
                    "priority": "high",
                },
                files={"screenshot": ("preview.webp", b"RIFF\x04\x00\x00\x00WEBP", "image/webp")},
            )
            assert multipart.status_code == 201, multipart.text

            login(client, "feedback.admin", "FeedbackAdmin123!")
            listing = client.get(
                "/api/v1/feedback",
                params={"priority": "high", "search": "preview"},
            )
            assert listing.status_code == 200, listing.text
            assert listing.json()["total"] == 1
            assert listing.json()["items"][0]["feedback_type"] == "ui_change"

            detail = client.get(f"/api/v1/feedback/{feedback_id}")
            assert detail.status_code == 200, detail.text

            managed = client.patch(
                f"/api/v1/feedback/{feedback_id}",
                json={
                    "priority": "high",
                    "status": "under_review",
                    "internal_note": "Confirm expected navigation behavior.",
                    "assigned_to_id": str(admin_id),
                },
            )
            assert managed.status_code == 200, managed.text
            assert managed.json()["assigned_to_name"] == "Feedback Administrator"
            assert managed.json()["status"] == "under_review"

            csv_export = client.get("/api/v1/feedback/export.csv")
            assert csv_export.status_code == 200, csv_export.text
            assert csv_export.content.startswith(b"\xef\xbb\xbf")
            assert b"Product Management" in csv_export.content

            xlsx_export = client.get("/api/v1/feedback/export.xlsx")
            assert xlsx_export.status_code == 200, xlsx_export.text
            assert xlsx_export.content.startswith(b"PK")

            with SessionLocal() as db:
                assert db.scalar(select(func.count()).select_from(Feedback)) == 2
                actions = set(
                    db.scalars(
                        select(AuditLog.action).where(AuditLog.module == "feedback")
                    )
                )
                assert {
                    "feedback_submitted",
                    "feedback_screenshot_uploaded",
                    "feedback_managed",
                    "feedback_exported_csv",
                    "feedback_exported_xlsx",
                }.issubset(actions)

        print("Demo feedback smoke test: OK")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
