"""End-to-end catalogue API smoke test using an isolated SQLite database.

Run from ``backend`` with:
    python -m tests.smoke_catalogue
"""

import os
import io
import shutil
import tempfile
import uuid
from pathlib import Path
from unittest.mock import patch


test_directory = Path(tempfile.mkdtemp(prefix="gms-catalogue-test-"))
os.environ["DATABASE_URL"] = (
    f"sqlite+pysqlite:///{(test_directory / 'catalogue.db').as_posix()}"
)
os.environ["SECRET_KEY"] = "catalogue-smoke-test-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["UPLOAD_DIR"] = str(test_directory / "uploads")

from fastapi.testclient import TestClient
from PIL import Image as PILImage
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models import (
    Brand,
    Department,
    DepartmentBrandAccess,
    Role,
    Product,
    User,
    UserOrganizationProfile,
)
from app.security import hash_password


def main() -> None:
    try:
        with TestClient(app) as client:
            health_response = client.get("/api/health")
            assert health_response.status_code == 200, health_response.text
            assert health_response.json()["database"] == "connected"

            with SessionLocal() as db:
                superadmin_role = db.scalar(
                    select(Role).where(Role.name == "superadmin")
                )
                assert superadmin_role is not None
                db.add(
                    User(
                        username="catalogue.admin",
                        email="catalogue.admin@example.com",
                        full_name="Catalogue Administrator",
                        password_hash=hash_password("StrongPassword123!"),
                        roles=[superadmin_role],
                    )
                )
                db.commit()

            login_response = client.post(
                "/api/auth/login",
                json={
                    "identifier": "catalogue.admin",
                    "password": "StrongPassword123!",
                    "remember_me": False,
                },
            )
            assert login_response.status_code == 200, login_response.text
            assert client.cookies.get("catalogue_session")

            preflight_response = client.options(
                "/api/catalogue/products/example/content",
                headers={
                    "Origin": "http://localhost",
                    "Access-Control-Request-Method": "PUT",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            assert preflight_response.status_code == 200, preflight_response.text
            assert preflight_response.headers["access-control-allow-origin"] == (
                "http://localhost"
            )
            assert "PUT" in preflight_response.headers["access-control-allow-methods"]

            stats_response = client.get("/api/catalogue/stats")
            assert stats_response.status_code == 200, stats_response.text
            stats = stats_response.json()
            assert stats["total_products"] == 8
            assert stats["missing_images"] == 8
            assert {
                "missing_descriptions",
                "missing_categories",
                "ready_products",
            }.issubset(stats)
            missing_image_response = client.get(
                "/api/catalogue/products",
                params={"needs": "image"},
            )
            assert missing_image_response.status_code == 200
            assert missing_image_response.json()["total"] == 8
            invalid_queue_response = client.get(
                "/api/catalogue/products",
                params={"needs": "unknown"},
            )
            assert invalid_queue_response.status_code == 422
            review_product_response = client.get(
                "/api/catalogue/products",
                params={"status": "in_review"},
            )
            review_product_id = review_product_response.json()["items"][0]["id"]

            registration_response = client.post(
                "/api/auth/register",
                json={
                    "full_name": "Catalogue Editor",
                    "username": "catalogue.editor",
                    "email": "catalogue.editor@example.com",
                    "password": "EditorPassword123!",
                },
                headers={"Origin": "http://127.0.0.1"},
            )
            assert registration_response.status_code == 201
            assert registration_response.headers["access-control-allow-origin"] == (
                "http://127.0.0.1"
            )
            with SessionLocal() as db:
                registered_user = db.scalar(
                    select(User).where(User.username == "catalogue.editor")
                )
                assert registered_user is not None
                assert registered_user.password_hash != "EditorPassword123!"
                assert [role.name for role in registered_user.roles] == ["system_user"]
            scoped_products = client.get("/api/catalogue/products")
            assert scoped_products.status_code == 200
            assert scoped_products.json()["total"] > 0
            with SessionLocal() as db:
                registered_user = db.scalar(
                    select(User).where(User.username == "catalogue.editor")
                )
                mori = db.scalar(select(Brand).where(Brand.name == "Mori"))
                department = Department(
                    name="Scoped Department",
                    code="SCOPED",
                    description="Catalogue visibility smoke test.",
                )
                db.add(department)
                db.flush()
                registered_user.organization_profile = UserOrganizationProfile(
                    department=department
                )
                editor_role = db.scalar(select(Role).where(Role.name == "catalogue_editor"))
                registered_user.roles = [editor_role]
                registered_user.data_scope.published_only = False
                db.add(
                    DepartmentBrandAccess(
                        department=department,
                        brand=mori,
                        can_view=True,
                        can_manage=False,
                    )
                )
                db.commit()
            scoped_products = client.get("/api/catalogue/products")
            assert scoped_products.status_code == 200
            assert {item["brand"] for item in scoped_products.json()["items"]} == {
                "Mori"
            }
            forbidden_approval = client.post(
                f"/api/catalogue/products/{review_product_id}/approve"
            )
            assert forbidden_approval.status_code == 403

            login_response = client.post(
                "/api/auth/login",
                json={
                    "identifier": "catalogue.admin",
                    "password": "StrongPassword123!",
                    "remember_me": False,
                },
            )
            assert login_response.status_code == 200

            erp_sync_response = client.post(
                "/api/catalogue/erp/sync",
                json={
                    "products": [
                        {
                            "sku": "GMS-HH-031",
                            "erp_name": "Plant-Based Dishwashing Liquid 750ml",
                            "brand": "Green Home",
                            "barcode": "8850001000318",
                            "unit": "bottle",
                            "erp_category": "Cleaning",
                            "price": "89.00",
                            "stock_quantity": 41,
                            "is_discontinued": False,
                        },
                        {
                            "sku": "GMS-NEW-999",
                            "erp_name": "ERP Synchronization Test Product",
                            "brand": "GMS Test",
                            "barcode": "8850001999999",
                            "unit": "piece",
                            "erp_category": "Test",
                            "price": "10.00",
                            "stock_quantity": 5,
                            "is_discontinued": False,
                        },
                    ]
                },
            )
            assert erp_sync_response.status_code == 200, erp_sync_response.text
            assert erp_sync_response.json()["created"] == 1
            assert erp_sync_response.json()["updated"] == 1

            categories_response = client.get("/api/catalogue/categories")
            assert categories_response.status_code == 200
            categories = categories_response.json()
            pantry = next(item for item in categories if item["name"] == "Household")
            assert pantry["brands"], pantry
            assert all(
                {"name", "product_count"}.issubset(brand)
                for brand in pantry["brands"]
            )

            create_response = client.post(
                "/api/catalogue/products",
                json={
                    "sku": "GMS-MANUAL-001",
                    "name": "Manually Created Catalogue Product",
                    "brand": "GMS Test",
                    "barcode": "8850001999001",
                    "unit": "piece",
                    "erp_category": "Test",
                    "price": "125.50",
                    "stock_quantity": 12,
                    "short_description": "Created directly in the catalogue.",
                    "long_description": "A complete product created through the catalogue UI.",
                    "category_ids": [pantry["id"]],
                },
            )
            assert create_response.status_code == 201, create_response.text
            created_product = create_response.json()
            assert created_product["display_name"] == (
                "Manually Created Catalogue Product"
            )
            assert created_product["price"] == "125.50"
            assert created_product["stock_quantity"] == 12
            assert created_product["categories"][0]["id"] == pantry["id"]
            duplicate_response = client.post(
                "/api/catalogue/products",
                json={
                    "sku": "GMS-MANUAL-001",
                    "name": "Duplicate Product",
                },
            )
            assert duplicate_response.status_code == 409

            products_response = client.get(
                "/api/catalogue/products",
                params={"q": "Dishwashing"},
            )
            assert products_response.status_code == 200
            product = products_response.json()["items"][0]
            product_id = product["id"]
            assert product["workflow_status"] == "draft"
            assert product["short_description"].startswith(
                "Effective plant-based dishwashing"
            )

            master_response = client.patch(
                f"/api/catalogue/products/{product_id}/master-data",
                json={
                    "erp_name": "Eco Dishwashing Liquid 750ml",
                    "brand": "Green Home Plus",
                    "barcode": "9990001000318",
                    "erp_category": "Kitchen Cleaning",
                    "price": "95.50",
                    "stock_quantity": 52,
                },
            )
            assert master_response.status_code == 200, master_response.text
            assert master_response.json()["erp_name"] == (
                "Eco Dishwashing Liquid 750ml"
            )
            assert master_response.json()["brand"] == "Green Home Plus"
            assert master_response.json()["barcode"] == "9990001000318"
            assert master_response.json()["erp_category"] == "Kitchen Cleaning"
            assert master_response.json()["price"] == "95.50"
            assert master_response.json()["stock_quantity"] == 52

            update_response = client.put(
                f"/api/catalogue/products/{product_id}/content",
                json={
                    "display_name": "Green Kitchen Dishwashing Liquid 750ml",
                    "short_description": (
                        "Effective plant-based dishwashing liquid for daily use."
                    ),
                    "long_description": (
                        "A concentrated plant-based formula that removes grease "
                        "while remaining gentle for everyday kitchen cleaning."
                    ),
                    "seo_title": "Plant-Based Dishwashing Liquid 750ml",
                    "seo_description": (
                        "Plant-based dishwashing liquid for effective daily cleaning."
                    ),
                    "visibility": "hidden",
                    "is_featured": True,
                    "category_ids": [pantry["id"]],
                },
            )
            assert update_response.status_code == 200, update_response.text
            assert update_response.json()["version"] == 2
            assert update_response.json()["display_name"] == (
                "Green Kitchen Dishwashing Liquid 750ml"
            )
            renamed_search = client.get(
                "/api/catalogue/products",
                params={"q": "Green Kitchen"},
            )
            assert renamed_search.status_code == 200
            assert renamed_search.json()["items"][0]["id"] == product_id

            image_response = client.post(
                f"/api/catalogue/products/{product_id}/images",
                files={"file": ("product.jpg", b"catalogue-image", "image/jpeg")},
                data={"alt_text": "Plant-based dishwashing liquid bottle"},
            )
            assert image_response.status_code == 201, image_response.text
            image = image_response.json()
            assert image["is_primary"] is True
            assert (test_directory / "uploads" / image["public_url"].split("/")[-1]).exists()

            with SessionLocal() as db:
                erp_product = db.get(Product, uuid.UUID(product_id))
                erp_product.source_system = "gms_erp"
                erp_product.source_record_id = "1001"
                db.commit()
            erp_buffer = io.BytesIO()
            PILImage.new("RGB", (640, 480), (32, 128, 72)).save(
                erp_buffer, format="JPEG"
            )
            erp_bytes = erp_buffer.getvalue()
            with patch(
                "app.erp_product_images._candidate_row",
                return_value={
                    "image1_size": len(erp_bytes),
                    "image1_header": erp_bytes[:16],
                    "image1_description": "ERP front view",
                },
            ):
                candidates = client.get(
                    f"/api/catalogue/products/{product_id}/erp-images"
                )
            assert candidates.status_code == 200, candidates.text
            assert candidates.json()[0]["slot"] == 1
            with patch(
                "app.erp_product_images._source_image",
                return_value=(erp_bytes, "ERP front view"),
            ):
                imported = client.post(
                    f"/api/catalogue/products/{product_id}/erp-images/1/import",
                    json={"alt_text": "Selected ERP product image", "make_primary": True},
                )
            assert imported.status_code == 201, imported.text
            assert imported.json()["is_primary"] is True
            assert imported.json()["content_type"] == "image/webp"
            assert (
                test_directory
                / "uploads"
                / imported.json()["public_url"].split("/")[-1]
            ).exists()
            ready_response = client.get(
                "/api/catalogue/products",
                params={"needs": "ready", "q": "Green Kitchen"},
            )
            assert ready_response.status_code == 200, ready_response.text
            assert ready_response.json()["items"][0]["id"] == product_id

            submit_response = client.post(
                f"/api/catalogue/products/{product_id}/submit"
            )
            assert submit_response.status_code == 200, submit_response.text
            assert (
                submit_response.json()["product"]["workflow_status"] == "in_review"
            )

            approve_response = client.post(
                f"/api/catalogue/products/{product_id}/approve"
            )
            assert approve_response.status_code == 200, approve_response.text
            assert approve_response.json()["product"]["workflow_status"] == "approved"

            publish_response = client.post(
                f"/api/catalogue/products/{product_id}/publish"
            )
            assert publish_response.status_code == 200, publish_response.text
            published = publish_response.json()["product"]
            assert published["workflow_status"] == "published"
            assert published["visibility"] == "public"

            category_response = client.post(
                "/api/catalogue/categories",
                json={
                    "name": "Seasonal",
                    "description": "Seasonal catalogue selections.",
                },
            )
            assert category_response.status_code == 201, category_response.text

            activity_response = client.get("/api/catalogue/activity")
            assert activity_response.status_code == 200
            actions = {item["action"] for item in activity_response.json()}
            assert {
                "product_content_updated",
                "product_image_uploaded",
                "product_submitted",
                "product_approved",
                "product_published",
                "category_created",
            }.issubset(actions)

            delete_response = client.delete(
                f"/api/catalogue/products/{product_id}/images/{image['id']}"
            )
            assert delete_response.status_code == 204, delete_response.text

        print("Catalogue platform smoke test: OK")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
