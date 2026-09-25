"""Catalogue cover, category presentation, backups, metrics, and audit smoke test.

Run from ``backend`` with:
    python -m tests.smoke_platform_operations
"""

import io
import os
import shutil
import tempfile
import uuid
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


test_directory = Path(tempfile.mkdtemp(prefix="gms-platform-ops-test-"))
application_root = test_directory / "application"
(application_root / "backend" / "app").mkdir(parents=True)
(application_root / "frontend" / "src").mkdir(parents=True)
(application_root / "backend" / "app" / "sample.py").write_text("APP_VERSION = 'test'\n", encoding="utf-8")
(application_root / "frontend" / "src" / "sample.ts").write_text("export const ready = true;\n", encoding="utf-8")
os.environ.update({
    "DATABASE_URL": f"sqlite+pysqlite:///{(test_directory / 'operations.db').as_posix()}",
    "SECRET_KEY": "platform-operations-smoke-secret",
    "AUTO_CREATE_TABLES": "true",
    "SEED_DEMO_DATA": "true",
    "UPLOAD_DIR": str(test_directory / "uploads"),
    "COVER_UPLOAD_DIR": str(test_directory / "private-cover-assets"),
    "BACKUP_DIR": str(test_directory / "backups"),
    "APPLICATION_ROOT": str(application_root),
    "MIN_COVER_WIDTH": "100",
    "MIN_COVER_HEIGHT": "100",
})

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database import SessionLocal
from app.commerce_models import Catalogue
from app.branding import LOGO_VERSION, default_logo_path
from app.main import app
from app.models import AuditLog, Role, User
from app.platform_models import BackupJob, CatalogueCoverAsset, CatalogueCoverSetting
from app.security import hash_password


def login(client: TestClient, username: str, password: str):
    response = client.post("/api/auth/login", json={"identifier": username, "password": password, "remember_me": False})
    assert response.status_code == 200, response.text


def png_bytes(color: tuple[int, int, int]) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (1200, 1600), color).save(output, format="PNG")
    return output.getvalue()


def assert_a4_landscape(content: bytes) -> None:
    reader = PdfReader(io.BytesIO(content))
    assert reader.pages
    dimensions = []
    for page in reader.pages:
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        assert width > height, (width, height)
        assert abs(width - 841.89) < 1.0, width
        assert abs(height - 595.28) < 1.0, height
        dimensions.append((round(width, 2), round(height, 2)))
    assert len(set(dimensions)) == 1, dimensions


def assert_category_starts_with_product(content: bytes, presentation: dict) -> None:
    page_text = [page.extract_text() or "" for page in PdfReader(io.BytesIO(content)).pages]
    checked = 0
    for category in presentation["categories"]:
        category_products = [
            product
            for product in presentation["products"]
            if category["name"] == product.get("category_name")
            or category["name"] in product.get("categories", [])
        ]
        if not category_products:
            continue
        first = category_products[0]
        product_name = first.get("name_th") or first.get("name_en") or first["name"]
        assert any(
            category["name"] in text and product_name in text
            for text in page_text
        ), (category["name"], product_name)
        checked += 1
    assert checked > 0


def main():
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                admin_role = db.scalar(select(Role).where(Role.name == "superadmin"))
                viewer_role = db.scalar(select(Role).where(Role.name == "viewer"))
                db.add_all([
                    User(username="ops.admin", email="ops.admin@example.com", full_name="Operations Administrator", password_hash=hash_password("OperationsAdmin123!"), roles=[admin_role]),
                    User(username="ops.denied", email="ops.denied@example.com", full_name="Restricted User", password_hash=hash_password("OperationsDenied123!"), roles=[viewer_role]),
                ])
                db.commit()

            login(client, "ops.denied", "OperationsDenied123!")
            assert client.get("/api/v1/admin/system/metrics").status_code == 403
            assert client.post("/api/v1/admin/backups/application", json={"description": "denied", "components": []}).status_code == 403

            client.post("/api/auth/logout")
            login(client, "ops.admin", "OperationsAdmin123!")
            price_lists = client.get("/api/v1/price-lists").json()
            no_price = next(item for item in price_lists if item["is_no_price"])
            catalogue = client.post("/api/v1/catalogues", json={
                "title": "HANA CATALOG 2026", "slug": "hana-catalog-2026", "description": "HANA company catalogue.",
                "brand": "HANA", "audience": "Company Users", "price_list_id": no_price["id"], "show_prices": False,
                "currency": "THB", "language": "en-th", "valid_from": None, "valid_until": None, "is_public": False,
            })
            assert catalogue.status_code == 201, catalogue.text
            catalogue_id = catalogue.json()["id"]
            products = client.get("/api/catalogue/products?page_size=10").json()["items"][:3]
            saved = client.put(f"/api/v1/catalogues/{catalogue_id}/products", json={"products": [{"product_id": item["id"], "section_title": "", "override_description": "", "hide_price": False} for item in products]})
            assert saved.status_code == 200, saved.text
            with SessionLocal() as db:
                restricted_user = db.scalar(select(User).where(User.username == "ops.denied"))
                assigned_catalogue = db.get(Catalogue, uuid.UUID(catalogue_id))
                restricted_user.assigned_catalogues.append(assigned_catalogue)
                db.commit()

            client.post("/api/auth/logout")
            login(client, "ops.denied", "OperationsDenied123!")
            assert client.get(f"/api/v1/catalogues/{catalogue_id}/cover").status_code == 200
            assert client.put(f"/api/v1/catalogues/{catalogue_id}/cover", json={"catalogue_name": "Forbidden"}).status_code == 403
            assert client.post(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets",
                files={"file": ("forbidden.png", png_bytes((0, 0, 0)), "image/png")},
                data={"asset_type": "background"},
            ).status_code == 403
            client.post("/api/auth/logout")
            login(client, "ops.admin", "OperationsAdmin123!")

            cover_settings = client.get(f"/api/v1/catalogues/{catalogue_id}/cover")
            assert cover_settings.status_code == 200, cover_settings.text
            denied_image = client.post(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets",
                files={"file": ("cover.exe", b"MZ", "application/octet-stream")},
                data={"asset_type": "background"},
            )
            assert denied_image.status_code == 422
            unsafe_svg = client.post(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets",
                files={"file": ("unsafe.svg", b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script></svg>', "image/svg+xml")},
                data={"asset_type": "decorative_image"},
            )
            assert unsafe_svg.status_code == 422
            configured_cover = client.put(f"/api/v1/catalogues/{catalogue_id}/cover", json={
                "catalogue_name": "HANA CATALOG", "catalogue_year": "2026", "subtitle": "Company Product Collection",
                "cover_mode": "custom", "background_fit": "cover", "show_catalogue_name": True,
                "show_catalogue_year": True, "show_subtitle": True, "title_position_x_percent": 14,
                "title_position_y_percent": 62, "title_font_size": 74, "overlay_opacity": 0.25,
            })
            assert configured_cover.status_code == 200, configured_cover.text
            uploaded = client.post(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets",
                files={"file": ("cover-background.png", png_bytes((20, 95, 56)), "image/png")},
                data={"asset_type": "background", "alt_text": "Green catalogue cover background"},
            )
            assert uploaded.status_code == 201, uploaded.text
            first_cover_id = uploaded.json()["id"]
            replacement = client.post(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets",
                files={"file": ("cover-background-new.png", png_bytes((30, 115, 72)), "image/png")},
                data={"asset_type": "background", "alt_text": "Updated cover background"},
            )
            assert replacement.status_code == 201, replacement.text
            assert replacement.json()["id"] != first_cover_id
            assert replacement.json()["original_filename"] == "cover-background-new.png"
            purged_previous = client.delete(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets/{first_cover_id}?permanent=true"
            )
            assert purged_previous.status_code == 204, purged_previous.text
            assert not any(
                asset["id"] == first_cover_id
                for asset in client.get(
                    f"/api/v1/catalogues/{catalogue_id}/cover"
                ).json()["asset_history"]
            )
            logo = client.post(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets",
                files={"file": ("brand-logo.png", png_bytes((255, 255, 255)), "image/png")},
                data={"asset_type": "brand_logo", "alt_text": "Catalogue brand logo"},
            )
            assert logo.status_code == 201, logo.text
            moved_logo = client.patch(f"/api/v1/catalogues/{catalogue_id}/cover/assets/{logo.json()['id']}", json={
                "position_x_percent": 22.5, "position_y_percent": 16, "width_percent": 28,
                "height_percent": 18, "opacity": 0.9, "rotation": 3, "z_index": 12,
            })
            assert moved_logo.status_code == 200, moved_logo.text
            assert moved_logo.json()["position_x_percent"] == 22.5
            safe_svg = client.post(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets",
                files={"file": ("decoration.svg", b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><circle cx="60" cy="40" r="34" fill="#ffffff"/></svg>', "image/svg+xml")},
                data={"asset_type": "decorative_image", "alt_text": "Circular cover decoration"},
            )
            assert safe_svg.status_code == 201, safe_svg.text

            categories = client.get(f"/api/v1/catalogues/{catalogue_id}/categories")
            assert categories.status_code == 200, categories.text
            category_rows = categories.json()
            assert category_rows
            configured = []
            for index, item in enumerate(reversed(category_rows), 1):
                configured.append({"category_id": item["category_id"], "display_name": f"HANA {item['master_name']}", "description": "Catalogue-specific section.", "display_order": index, "is_visible": True, "show_product_count": True, "default_expanded": index == 1})
            updated_categories = client.put(f"/api/v1/catalogues/{catalogue_id}/categories", json={"categories": configured})
            assert updated_categories.status_code == 200, updated_categories.text
            assert updated_categories.json()[0]["display_name"].startswith("HANA ")

            preview = client.get(f"/api/v1/catalogues/{catalogue_id}/preview")
            assert preview.status_code == 200, preview.text
            presentation = preview.json()
            assert presentation["title"] == "HANA CATALOG 2026"
            assert presentation["cover"]["catalogue_name"] == "HANA CATALOG"
            assert presentation["cover"]["default_company_logo_version"] == LOGO_VERSION
            assert {asset["asset_type"] for asset in presentation["cover"]["assets"]} == {"background", "brand_logo", "decorative_image"}
            assert [item["display_order"] for item in presentation["categories"]] == sorted(item["display_order"] for item in presentation["categories"])
            assert "price" not in presentation["products"][0]

            published = client.post(f"/api/v1/catalogues/{catalogue_id}/publish")
            assert published.status_code == 200, published.text
            pdf = client.get(f"/api/v1/catalogues/{catalogue_id}/export/pdf?include_cover=true&include_table_of_contents=true")
            assert pdf.status_code == 200, pdf.text
            assert "HANA-CATALOG-2026-v1.pdf" in pdf.headers["content-disposition"]
            assert len(PdfReader(io.BytesIO(pdf.content)).pages) >= 2
            assert_a4_landscape(pdf.content)
            assert_category_starts_with_product(pdf.content, presentation)
            cached_pdf = client.get(f"/api/v1/catalogues/{catalogue_id}/export/pdf?include_cover=true&include_table_of_contents=true")
            assert cached_pdf.status_code == 200, cached_pdf.text
            assert cached_pdf.headers["x-catalogue-pdf-cache"] == "HIT"
            assert cached_pdf.content == pdf.content
            portrait = client.get(f"/api/v1/catalogues/{catalogue_id}/export/pdf?orientation=portrait")
            assert portrait.status_code == 422, portrait.text

            application_backup = client.post("/api/v1/admin/backups/application", json={"description": "Presentation backup", "components": ["source", "uploads", "migrations"]})
            assert application_backup.status_code == 201, application_backup.text
            application_job = application_backup.json()
            assert application_job["status"] == "completed", application_job
            download = client.get(f"/api/v1/admin/backups/application/{application_job['id']}/download")
            assert download.status_code == 200 and download.content.startswith(b"PK")

            database_backup = client.post("/api/v1/admin/backups/database", json={"description": "Must be real", "components": []})
            assert database_backup.status_code == 201
            assert database_backup.json()["status"] == "failed"
            assert "PostgreSQL" in database_backup.json()["error_message"]

            metrics = client.get("/api/v1/admin/system/metrics")
            assert metrics.status_code == 200, metrics.text
            metrics_json = metrics.json()
            assert {"cpu_percent", "memory_percent", "disk_percent"}.issubset(metrics_json["system"])
            assert "database_url" not in str(metrics_json).lower()
            assert "password" not in str(metrics_json).lower()

            with SessionLocal() as db:
                actions = set(db.scalars(select(AuditLog.action)).all())
                assert {"catalogue_cover_settings_changed", "catalogue_cover_background_uploaded", "catalogue_cover_background_replaced", "catalogue_cover_brand_logo_uploaded", "catalogue_cover_asset_changed", "catalogue_category_settings_changed", "catalogue_preview_opened", "application_backup_completed", "database_backup_failed", "backup_downloaded"}.issubset(actions)
                assert db.scalar(select(BackupJob).where(BackupJob.id == uuid.UUID(application_job["id"]))) is not None
                assert db.scalar(select(CatalogueCoverSetting).where(CatalogueCoverSetting.catalogue_id == uuid.UUID(catalogue_id))) is not None
                assert len(db.scalars(select(CatalogueCoverAsset).where(CatalogueCoverAsset.catalogue_id == uuid.UUID(catalogue_id))).all()) == 3

            deleted = client.delete(f"/api/v1/catalogues/{catalogue_id}/cover/assets/{logo.json()['id']}")
            assert deleted.status_code == 204
            protected_delete = client.delete(
                f"/api/v1/catalogues/{catalogue_id}/cover/assets/{logo.json()['id']}?permanent=true"
            )
            assert protected_delete.status_code == 409, protected_delete.text
            assert not any(asset["asset_type"] == "brand_logo" for asset in client.get(f"/api/v1/catalogues/{catalogue_id}/cover").json()["assets"])
            default_preview = client.get(f"/api/v1/catalogues/{catalogue_id}/preview")
            assert default_preview.status_code == 200, default_preview.text
            assert default_preview.json()["cover"]["default_company_logo_version"] == LOGO_VERSION
            assert default_logo_path() is not None
            default_pdf = client.get(f"/api/v1/catalogues/{catalogue_id}/export/pdf?include_cover=true")
            assert default_pdf.status_code == 200 and default_pdf.content.startswith(b"%PDF"), default_pdf.text
            assert_a4_landscape(default_pdf.content)
        print("Platform operations smoke test: OK")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
