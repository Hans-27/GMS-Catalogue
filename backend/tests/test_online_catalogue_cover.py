import io
import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "online-cover-test-secret-key-2026")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy import select

from app import catalogue_share_links, design_studio, promotion_models  # register related tables
from app.auth import get_current_user
from app.database import Base, get_db
from app.design_studio_models import CatalogueDesign, CatalogueDesignPage
from app.commerce_models import CatalogueAudienceType, CatalogueShareLink, CatalogueVersion
from app.security import hash_password
from app.models import Role, User
from app.storage import LocalStorage


@pytest.fixture
def cover_client(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(username="cover-editor", email="cover@example.test", full_name="Cover editor", password_hash="unused", roles=[Role(name="SuperAdmin", description="Test", is_system=True, system_key="SUPERADMIN")])
        db.add(user)
        db.flush()
        design = CatalogueDesign(name="Cover test", created_by_id=user.id, updated_by_id=user.id,
            pages=[CatalogueDesignPage(page_type="cover", page_name="Printable cover", display_order=1, width=794, height=1123,
                page_data_json={"schemaVersion": 1, "canvas": {"width": 794, "height": 1123, "backgroundColor": "#FFFFFF"}, "elements": []})])
        db.add(design)
        db.commit()
        app = FastAPI()
        app.include_router(design_studio.router, prefix="/api/v1")
        app.include_router(catalogue_share_links.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: user
        storage = LocalStorage(tmp_path / "covers")
        monkeypatch.setattr(design_studio, "cover_storage", storage)
        monkeypatch.setattr(catalogue_share_links, "cover_storage", storage)
        with TestClient(app) as client:
            yield client, db, design, user, storage
    engine.dispose()


def image_bytes(color="green", fmt="PNG"):
    output = io.BytesIO()
    Image.new("RGB", (900, 1200), color).save(output, format=fmt)
    return output.getvalue()


def test_save_and_remove_cover_preserve_pages_and_publication(cover_client):
    client, db, design, _, _ = cover_client
    original_pages = [page.page_data_json for page in design.pages]
    url = f"/api/v1/catalogue-studio/designs/{design.id}/online-cover"
    data = image_bytes()
    response = client.post(url, data={"expected_revision": design.revision}, files={"file": ("cover.png", data, "image/png")})
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["online_cover_json"]["width"] == 900
    assert saved["online_cover_json"]["height"] == 1200
    assert saved["published_online_cover_json"] is None
    assert saved["revision"] == 2
    assert [page.page_data_json for page in design.pages] == original_pages
    assert client.get(saved["online_cover_json"]["url"]).content == data
    assert client.delete(url, params={"expected_revision": 1}).status_code == 409
    removed = client.delete(url, params={"expected_revision": 2})
    assert removed.status_code == 200, removed.text
    assert removed.json()["online_cover_json"] is None
    assert client.get(url + "/content").status_code == 404


@pytest.mark.parametrize("filename,mime,data", [("cover.pdf", "application/pdf", b"%PDF-1.4"), ("cover.png", "image/png", b"not an image"), ("cover.gif", "image/gif", b"GIF89a")])
def test_cover_rejects_unsupported_or_invalid_files(cover_client, filename, mime, data):
    client, _, design, _, _ = cover_client
    response = client.post(f"/api/v1/catalogue-studio/designs/{design.id}/online-cover", data={"expected_revision": 1}, files={"file": (filename, data, mime)})
    assert response.status_code == 422, response.text


def test_cover_respects_edit_permission(cover_client):
    client, db, design, user, _ = cover_client
    user.roles = []
    db.commit()
    response = client.post(f"/api/v1/catalogue-studio/designs/{design.id}/online-cover", data={"expected_revision": 1}, files={"file": ("cover.png", image_bytes(), "image/png")})
    assert response.status_code == 403, response.text
    assert client.delete(f"/api/v1/catalogue-studio/designs/{design.id}/online-cover", params={"expected_revision": 1}).status_code == 403
    assert client.get(f"/api/v1/catalogue-studio/designs/{design.id}/online-cover/content").status_code == 403
    assert client.post(f"/api/v1/catalogue-studio/designs/{design.id}/publish", json={"expected_revision": 1}).status_code == 403


@pytest.mark.parametrize("fmt,filename,mime", [("PNG", "cover.png", "image/png"), ("JPEG", "cover.jpeg", "image/jpeg"), ("WEBP", "cover.webp", "image/webp")])
def test_upload_keeps_original_image_bytes(cover_client, fmt, filename, mime):
    client, _, design, _, _ = cover_client
    original = image_bytes(fmt=fmt)
    response = client.post(f"/api/v1/catalogue-studio/designs/{design.id}/online-cover", data={"expected_revision": 1}, files={"file": (filename, original, mime)})
    assert response.status_code == 200, response.text
    assert client.get(response.json()["online_cover_json"]["url"]).content == original


def test_invalid_or_oversized_replacement_keeps_existing_cover(cover_client):
    client, _, design, _, _ = cover_client
    url = f"/api/v1/catalogue-studio/designs/{design.id}/online-cover"
    original = client.post(url, data={"expected_revision": 1}, files={"file": ("cover.png", image_bytes(), "image/png")}).json()["online_cover_json"]
    invalid = client.post(url, data={"expected_revision": 2}, files={"file": ("invalid.png", b"invalid", "image/png")})
    assert invalid.status_code == 422
    oversized = client.post(url, data={"expected_revision": 2}, files={"file": ("huge.png", b"x" * (20 * 1024 * 1024 + 1), "image/png")})
    assert oversized.status_code == 413
    assert design.online_cover_json == original
    assert design.revision == 2


def test_only_published_cover_is_public_and_fixed_links_keep_their_cover(cover_client):
    client, db, design, user, _ = cover_client
    cover_url = f"/api/v1/catalogue-studio/designs/{design.id}/online-cover"
    publish_url = f"/api/v1/catalogue-studio/designs/{design.id}/publish"
    old_image = image_bytes("green")
    first = client.post(cover_url, data={"expected_revision": design.revision}, files={"file": ("first.png", old_image, "image/png")})
    assert first.status_code == 200, first.text
    published = client.post(publish_url, json={"expected_revision": design.revision})
    assert published.status_code == 200, published.text
    original_version = db.scalar(select(CatalogueVersion).where(CatalogueVersion.catalogue_id == design.catalogue_id))
    assert original_version.snapshot["online_cover"]["asset_id"] == first.json()["online_cover_json"]["asset_id"]
    audience = CatalogueAudienceType(code="TEST", display_name="Test audience", show_prices=False)
    db.add(audience)
    db.flush()
    token = "test-online-cover-token-unique-123456789"
    fixed_token = "test-fixed-cover-token-unique-123456789"
    link = CatalogueShareLink(catalogue_id=design.catalogue_id, audience_type_id=audience.id, token_hash=catalogue_share_links._token_hash(token), encrypted_token="unused", created_by_id=user.id, password_hash=hash_password("secret"))
    fixed = CatalogueShareLink(catalogue_id=design.catalogue_id, audience_type_id=audience.id, token_hash=catalogue_share_links._token_hash(fixed_token), encrypted_token="unused", created_by_id=user.id, customer_code="FIXED", version_mode="fixed_published", fixed_version_id=original_version.id)
    db.add_all([link, fixed])
    db.commit()
    assert client.get(f"/api/v1/public/catalogues/{token}").status_code == 401
    public_url = f"/api/v1/public/catalogues/{token}"
    public = client.get(public_url, headers={"X-Catalogue-Password": "secret"}).json()
    image_url = public["online_cover"]["url"]
    assert client.get(image_url).content == old_image
    assert client.get(image_url.split("?")[0]).status_code == 401
    new_image = image_bytes("blue")
    changed = client.post(cover_url, data={"expected_revision": design.revision}, files={"file": ("second.png", new_image, "image/png")})
    assert changed.status_code == 200, changed.text
    assert design.status == "published"
    assert client.get(public_url, headers={"X-Catalogue-Password": "secret"}).json()["online_cover"]["asset_id"] == first.json()["online_cover_json"]["asset_id"]
    # Public Studio payload must not leak the un-published upload.
    studio = client.get(public_url + "/studio", headers={"X-Catalogue-Password": "secret"}).json()
    assert studio.get("online_cover_json") is None
    assert client.post(publish_url, json={"expected_revision": design.revision}).status_code == 200
    current = client.get(public_url, headers={"X-Catalogue-Password": "secret"}).json()["online_cover"]
    assert client.get(current["url"]).content == new_image
    assert client.get(image_url).status_code == 403  # signature bound to old asset, not new version
    fixed_cover = client.get(f"/api/v1/public/catalogues/{fixed_token}").json()["online_cover"]
    assert client.get(fixed_cover["url"]).content == old_image
    assert client.delete(cover_url, params={"expected_revision": design.revision}).status_code == 200
    assert client.get(public_url, headers={"X-Catalogue-Password": "secret"}).json()["online_cover"] is not None
    assert client.post(publish_url, json={"expected_revision": design.revision}).status_code == 200
    assert client.get(public_url, headers={"X-Catalogue-Password": "secret"}).json().get("online_cover") is None
    assert design.pages[0].page_name == "Printable cover"
    link.status = "revoked"
    db.commit()
    assert client.get(current["url"]).status_code == 410


def test_online_cover_does_not_change_pdf_pages(cover_client, tmp_path):
    import fitz
    from app.design_studio_export import render_pdf

    client, db, design, _, _ = cover_client
    before = design_studio._snapshot(design)
    response = client.post(f"/api/v1/catalogue-studio/designs/{design.id}/online-cover", data={"expected_revision": 1}, files={"file": ("cover.png", image_bytes(), "image/png")})
    assert response.status_code == 200
    after = design_studio._snapshot(design)
    assert before["pages"] == after["pages"]
    signatures = []
    for index, snapshot in enumerate([before, after]):
        output = tmp_path / f"cover-{index}.pdf"
        render_pdf(db, snapshot, output, {})
        with fitz.open(output) as pdf:
            signatures.append([(page.rect, page.get_text(), len(page.get_images()), page.get_pixmap().samples) for page in pdf])
    assert signatures[0] == signatures[1]
