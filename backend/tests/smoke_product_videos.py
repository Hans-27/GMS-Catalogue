"""Product-video upload, security, snapshot and public-playback smoke test.

Run from ``backend`` with: ``python -m tests.smoke_product_videos``.
"""

import os
import shutil
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse


test_directory = Path(tempfile.mkdtemp(prefix="gms-product-video-test-"))
os.environ["DATABASE_URL"] = f"sqlite+pysqlite:///{(test_directory / 'catalogue.db').as_posix()}"
os.environ["SECRET_KEY"] = "product-video-smoke-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["PUBLIC_APP_URL"] = "http://catalogue.test"
os.environ["PRODUCT_VIDEO_UPLOAD_DIR"] = str(test_directory / "private-videos")
os.environ["PRODUCT_VIDEO_MAX_SIZE_MB"] = "1"

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.commerce_models import CatalogueVersion, PriceList
from app.database import SessionLocal
from app.main import app
from app.models import AuditLog, Product, ProductVideo, Role, User
from app.security import hash_password


def ok(response, expected=200):
    assert response.status_code == expected, response.text
    return response.json() if response.status_code != 204 else None


def main() -> None:
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                role = db.scalar(select(Role).where(Role.name == "superadmin"))
                product = db.scalar(select(Product).order_by(Product.sku))
                no_price = db.scalar(select(PriceList).where(PriceList.is_no_price.is_(True)))
                assert role and product and no_price
                user = User(username="video.admin", email="video.admin@example.com", full_name="Video Administrator", password_hash=hash_password("StrongPassword123!"), roles=[role])
                db.add(user); db.commit()
                product_id, no_price_id = str(product.id), no_price.id

            ok(client.post("/api/auth/login", json={"identifier": "video.admin", "password": "StrongPassword123!", "remember_me": False}))
            mp4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 64
            uploaded = ok(client.post(
                f"/api/v1/products/{product_id}/videos",
                data={"source_type": "upload", "title_en": "Product demonstration", "is_featured": "true", "show_in_catalogue": "true", "show_in_public_catalogue": "true"},
                files={"file": ("../../unsafe-name.mp4", mp4, "video/mp4")},
            ), 201)
            assert uploaded["provider"] == "internal" and uploaded["processing_status"] == "ready"
            assert "storage_key" not in uploaded and "private-videos" not in str(uploaded)
            assert uploaded["original_filename"] == "unsafe-name.mp4"
            content = client.get(uploaded["playback_url"])
            assert content.status_code == 200 and content.content == mp4

            webm = b"\x1a\x45\xdf\xa3" + b"\x00" * 64
            webm_video = ok(client.post(
                f"/api/v1/products/{product_id}/videos",
                data={"source_type": "upload", "title_en": "WebM demo", "is_featured": "false"},
                files={"file": ("demo.webm", webm, "video/webm")},
            ), 201)
            assert webm_video["mime_type"] == "video/webm"

            invalid = client.post(f"/api/v1/products/{product_id}/videos", data={"source_type": "upload"}, files={"file": ("bad.exe", b"MZ", "application/octet-stream")})
            assert invalid.status_code == 415
            spoofed = client.post(f"/api/v1/products/{product_id}/videos", data={"source_type": "upload"}, files={"file": ("bad.mp4", b"not-a-video", "video/mp4")})
            assert spoofed.status_code == 422
            oversized = client.post(f"/api/v1/products/{product_id}/videos", data={"source_type": "upload"}, files={"file": ("large.mp4", b"\x00\x00\x00\x18ftypisom" + b"x" * 1024 * 1024, "video/mp4")})
            assert oversized.status_code == 413

            external = ok(client.post(f"/api/v1/products/{product_id}/videos", data={"source_type": "external", "external_url": "https://youtu.be/dQw4w9WgXcQ", "title_en": "YouTube demo", "is_featured": "false"}), 201)
            assert external["provider"] == "youtube" and "iframe" not in str(external).lower()
            assert client.post(f"/api/v1/products/{product_id}/videos", data={"source_type": "external", "external_url": "javascript:alert(1)"}).status_code == 422

            featured = ok(client.post(f"/api/v1/products/{product_id}/videos/{webm_video['id']}/set-featured"))
            assert featured["is_featured"] is True
            rows = ok(client.get(f"/api/v1/products/{product_id}/videos"))
            assert sum(item["is_featured"] for item in rows) == 1
            ok(client.patch(f"/api/v1/products/{product_id}/videos/{uploaded['id']}", json={"title_en": "Updated demonstration"}))

            catalogue = ok(client.post("/api/v1/catalogues", json={"title": "Video Catalogue", "slug": "video-catalogue", "description": "Video snapshot test", "brand": None, "audience": "Public", "price_list_id": no_price_id, "show_prices": False, "currency": "THB", "language": "en", "valid_from": None, "valid_until": None, "is_public": True}), 201)
            catalogue_id = catalogue["id"]
            ok(client.put(f"/api/v1/catalogues/{catalogue_id}/products", json={"products": [{"product_id": product_id, "section_title": "Video", "override_description": "", "hide_price": False, "include_video": True, "selected_video_id": uploaded["id"], "video_title_override": "Versioned title", "video_description_override": "Versioned description", "video_display_mode": "card_icon"}]}))
            ok(client.post(f"/api/v1/catalogues/{catalogue_id}/publish"))
            with SessionLocal() as db:
                version = db.scalar(select(CatalogueVersion).where(CatalogueVersion.catalogue_id == uuid.UUID(catalogue_id)))
                assert version and version.snapshot["products"][0]["video"]["title"] == "Versioned title"
            links = ok(client.get(f"/api/v1/catalogues/{catalogue_id}/share-links"))
            token = urlparse(links[0]["public_url"]).path.rsplit("/", 1)[-1]
            public = ok(client.get(f"/api/v1/public/catalogues/{token}"))
            public_video = public["products"][0]["video"]
            assert "storage_key" not in public_video and "uploaded_by" not in public_video
            playback = client.get(public_video["playback_url"])
            assert playback.status_code == 200 and playback.content == mp4

            ok(client.patch(f"/api/v1/products/{product_id}/videos/{uploaded['id']}", json={"is_active": False}))
            hidden = ok(client.get(f"/api/v1/public/catalogues/{token}"))
            assert "video" not in hidden["products"][0]
            ok(client.delete(f"/api/v1/products/{product_id}/videos/{external['id']}"), 204)
            with SessionLocal() as db:
                deleted = db.get(ProductVideo, uuid.UUID(external["id"]))
                assert deleted and deleted.deleted_at is not None
                actions = set(db.scalars(select(AuditLog.action).where(AuditLog.module == "product_videos")))
                assert {"product_video_uploaded", "product_external_video_added", "product_video_edited", "product_video_deleted"}.issubset(actions)
        print("Product video smoke test passed.")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
