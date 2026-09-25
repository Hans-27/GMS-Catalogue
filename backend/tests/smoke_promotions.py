"""End-to-end Promotion Management smoke test.

Run from ``backend`` with ``python -m tests.smoke_promotions``.
"""

import os
import shutil
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path


test_directory = Path(tempfile.mkdtemp(prefix="gms-promotion-test-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{(test_directory / 'promotions.db').as_posix()}"
os.environ["SECRET_KEY"] = "promotion-smoke-test-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["UPLOAD_DIR"] = str(test_directory / "uploads")
os.environ["PUBLIC_APP_URL"] = "http://testserver"

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.main import app
from app.models import Product, ProductImage, Role, User
from app.security import hash_password
from app.promotion_service import calculate_price


def ok(response, expected=200):
    assert response.status_code == expected, response.text
    return response.json()


def main() -> None:
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                role = db.scalar(select(Role).where(Role.name == "superadmin"))
                admin = User(username="promotion.admin", email="promotion.admin@example.com", full_name="Promotion Admin", password_hash=hash_password("PromotionAdmin123!"), roles=[role])
                db.add(admin); db.commit()
            ok(client.post("/api/auth/login", json={"identifier": "promotion.admin", "password": "PromotionAdmin123!", "remember_me": False}))
            metadata = ok(client.get("/api/v1/promotions/metadata?page_size=200"))
            assert len(metadata["occasions"]) >= 15
            product = next(row for row in metadata["products"] if row["price"] is not None)
            brand = next(row for row in metadata["brands"] if row["name"] == product["brand"])
            normal = next(row for row in metadata["audiences"] if row["code"] == "normal")
            no_price = next(row for row in metadata["audiences"] if row["code"] == "no_price")
            now = datetime.now(UTC)
            with SessionLocal() as db:
                db.add(ProductImage(
                    product_id=uuid.UUID(product["id"]), file_name="promotion-cover.webp",
                    storage_name=f"promotion-cover-{uuid.uuid4()}.webp",
                    public_url="/uploads/promotion-cover.webp", content_type="image/webp",
                    alt_text="Promotion product cover", sort_order=0, is_primary=True,
                ))
                db.commit()
            assert calculate_price(Decimal("100"), "fixed_amount", None, Decimal("15"), None)[0] == Decimal("85.00")
            assert calculate_price(Decimal("100"), "special_price", None, None, Decimal("79"))[0] == Decimal("79.00")
            payload = {
                "name_en": "Smoke Test Promotion", "name_th": "โปรโมชั่นทดสอบ", "short_title": "Limited time",
                "description_en": "Promotion service test", "description_th": "", "occasion_id": metadata["occasions"][0]["id"],
                "promotion_type": "percentage", "discount_percent": 10, "priority": 80, "base_price_change_behavior": "require_reapproval",
                "department_id": None, "team_id": None, "start_at": (now - timedelta(minutes=5)).isoformat(),
                "end_at": (now + timedelta(days=5)).isoformat(), "timezone": "Asia/Bangkok",
                "automatic_activation": True, "automatic_expiration": True, "repeat_annually": False,
                "expiration_warning_days": 2, "show_stock": True, "hide_out_of_stock": False,
                "minimum_stock": 0, "stop_product_at_zero_stock": False, "terms_en": "While stock lasts.",
                "terms_th": "", "internal_note": "smoke", "is_active": True,
                "brand_rules": [{"brand_id": brand["id"], "include_all_active_products": False}],
                "products": [{"product_id": product["id"], "promotion_type": "percentage", "discount_percent": 10}],
                "audiences": [
                    {"audience_type_id": normal["id"], "price_list_id": normal["price_list_id"], "show_prices": True},
                    {"audience_type_id": no_price["id"], "price_list_id": no_price["price_list_id"], "show_prices": False},
                ], "catalogue_ids": [],
            }
            created = ok(client.post("/api/v1/promotions", json=payload), 201)
            assert created["code"].startswith("PROMO-")
            assert created["cover_url"] == "/uploads/promotion-cover.webp"
            assert len(created["products"]) == 2
            assert all(row["image_url"] == "/uploads/promotion-cover.webp" for row in created["products"])
            priced = next(row for row in created["products"] if row["audience_type_id"] == normal["id"])
            assert float(priced["promotion_price"]) == round(float(priced["base_price"]) * 0.9, 2)
            hidden = next(row for row in created["products"] if row["audience_type_id"] == no_price["id"])
            assert hidden["promotion_price"] is None
            promotion_id = created["id"]
            catalogue = ok(client.post("/api/v1/catalogues", json={
                "title": "Promotion Placement Catalogue",
                "slug": "promotion-placement-catalogue",
                "description": "Tests optional promotion page placement.",
                "brand": product["brand"],
                "audience": "Customers",
                "price_list_id": normal["price_list_id"],
                "show_prices": True,
                "currency": "THB",
                "language": "en-th",
                "valid_from": None,
                "valid_until": None,
                "is_public": False,
            }), 201)
            catalogue_id = catalogue["id"]
            attached = ok(client.post(f"/api/v1/promotions/{promotion_id}/catalogues/{catalogue_id}"))
            assert catalogue_id in attached["catalogue_ids"]
            detached = ok(client.delete(f"/api/v1/promotions/{promotion_id}/catalogues/{catalogue_id}"))
            assert catalogue_id not in detached["catalogue_ids"]
            listing = ok(client.get("/api/v1/promotions"))
            assert "pending_review" not in listing["summary"]
            assert client.post(f"/api/v1/promotions/{promotion_id}/submit", json={"reason": "obsolete"}).status_code == 404
            assert client.post(f"/api/v1/promotions/{promotion_id}/approve", json={"reason": "obsolete"}).status_code == 404
            published = ok(client.post(f"/api/v1/promotions/{promotion_id}/publish", json={"reason": "Ready"}))
            assert published["status"] == "active"
            link = ok(client.post(f"/api/v1/promotions/{promotion_id}/share-links", json={"audience_type_id": normal["id"], "allow_pdf": True, "allow_print": True}), 201)
            token = link["url"].rsplit("/", 1)[-1]
            public = ok(client.get(f"/api/v1/public/promotions/{token}"))
            assert public["show_prices"] is True and public["products"][0]["promotion_price"] is not None
            no_price_link = ok(client.post(f"/api/v1/promotions/{promotion_id}/share-links", json={"audience_type_id": no_price["id"], "allow_pdf": True, "allow_print": True}), 201)
            no_price_public = ok(client.get(f"/api/v1/public/promotions/{no_price_link['url'].rsplit('/', 1)[-1]}"))
            assert no_price_public["show_prices"] is False
            assert no_price_public["products"][0]["base_price"] is None and no_price_public["products"][0]["promotion_price"] is None
            assert client.get(f"/api/v1/public/promotions/{token}/pdf").headers["content-type"].startswith("application/pdf")
            ok(client.post(f"/api/v1/promotions/{promotion_id}/pause", json={"reason": "Stock review"}))
            assert client.get(f"/api/v1/public/promotions/{token}").status_code == 410
            ok(client.post(f"/api/v1/promotions/{promotion_id}/resume", json={"reason": "Resume"}))
            ok(client.post(f"/api/v1/promotions/{promotion_id}/share-links/{link['id']}/revoke"))
            assert client.get(f"/api/v1/public/promotions/{token}").status_code == 410
            duplicate = ok(client.post(f"/api/v1/promotions/{promotion_id}/duplicate"), 201)
            assert duplicate["status"] == "draft"
            assert client.post(f"/api/v1/promotions/{duplicate['id']}/publish", json={"reason": "Conflict check"}).status_code == 409
            assert client.delete(f"/api/v1/promotions/{promotion_id}").status_code == 409
            cancelled_duplicate = ok(client.post(f"/api/v1/promotions/{duplicate['id']}/cancel", json={"reason": "No longer needed"}))
            assert cancelled_duplicate["status"] == "cancelled"
            assert client.delete(f"/api/v1/promotions/{duplicate['id']}").status_code == 204
            assert client.get(f"/api/v1/promotions/{duplicate['id']}").status_code == 404
            brand_wide = {
                **payload, "name_en": "Brand-wide Smoke Promotion", "name_th": "",
                "start_at": (now + timedelta(days=6)).isoformat(), "end_at": (now + timedelta(days=8)).isoformat(),
                "discount_percent": 5, "brand_rules": [{"brand_id": brand["id"], "include_all_active_products": True}],
                "products": [], "audiences": [{"audience_type_id": normal["id"], "price_list_id": normal["price_list_id"], "show_prices": True}],
            }
            brand_wide_created = ok(client.post("/api/v1/promotions", json=brand_wide), 201)
            assert brand_wide_created["products"] and all(float(row["discount_percent"]) == 5 for row in brand_wide_created["products"])
            with SessionLocal() as db:
                source = db.get(Product, uuid.UUID(product["id"]))
                source.status = "inactive"; db.commit()
            public_after_inactive = ok(client.get(f"/api/v1/public/promotions/{no_price_link['url'].rsplit('/', 1)[-1]}"))
            assert public_after_inactive["products"] == []
            ok(client.post("/api/auth/logout"))
            with SessionLocal() as db:
                role = db.scalar(select(Role).where(Role.name == "system_user"))
                viewer = User(username="promotion.viewer", email="promotion.viewer@example.com", full_name="Promotion Viewer", password_hash=hash_password("PromotionViewer123!"), roles=[role])
                db.add(viewer); db.commit()
            ok(client.post("/api/auth/login", json={"identifier": "promotion.viewer", "password": "PromotionViewer123!", "remember_me": False}))
            assert client.post("/api/v1/promotions", json=payload).status_code == 403
            print("Promotion smoke test passed.")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
