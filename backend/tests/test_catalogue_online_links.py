import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "catalogue-online-link-test-secret-2026")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app import catalogue_share_links, promotion_models  # register related tables
from app.auth import get_current_user
from app.commerce_models import Catalogue, CatalogueAudienceType, CatalogueShareLink
from app.database import Base, get_db
from app.models import User


def test_active_user_can_open_published_catalogue_online_without_link_management(tmp_path, monkeypatch) -> None:
    """Regression: lacking share-link management must not hide a published online catalogue."""

    monkeypatch.setattr(catalogue_share_links.settings, "public_app_url", "http://catalogue.test")
    engine = create_engine(
        f"sqlite:///{tmp_path / 'online-links.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        publisher = User(
            username="publisher",
            email="publisher@example.test",
            full_name="Publisher",
            password_hash="unused",
            is_active=True,
        )
        viewer = User(
            username="viewer",
            email="viewer@example.test",
            full_name="Viewer",
            password_hash="unused",
            is_active=True,
        )
        catalogue = Catalogue(
            title="Published catalogue",
            slug="published-catalogue",
            status="published",
            version=1,
        )
        legacy_catalogue = Catalogue(
            title="Legacy published catalogue",
            slug="legacy-published-catalogue",
            status="published",
            version=1,
        )
        draft_catalogue = Catalogue(
            title="Draft catalogue",
            slug="draft-catalogue",
            status="draft",
        )
        normal = CatalogueAudienceType(
            code="normal",
            display_name="Normal",
            show_prices=True,
            display_order=1,
        )
        vip = CatalogueAudienceType(
            code="vip",
            display_name="VIP",
            show_prices=True,
            display_order=2,
        )
        db.add_all([
            publisher,
            viewer,
            catalogue,
            legacy_catalogue,
            draft_catalogue,
            normal,
            vip,
        ])
        db.flush()
        normal_token, normal_hash, normal_encrypted = catalogue_share_links._new_token()
        _, vip_hash, vip_encrypted = catalogue_share_links._new_token()
        db.add_all(
            [
                CatalogueShareLink(
                    catalogue_id=catalogue.id,
                    audience_type_id=normal.id,
                    token_hash=normal_hash,
                    encrypted_token=normal_encrypted,
                    created_by_id=publisher.id,
                    status="active",
                ),
                CatalogueShareLink(
                    catalogue_id=catalogue.id,
                    audience_type_id=vip.id,
                    token_hash=vip_hash,
                    encrypted_token=vip_encrypted,
                    created_by_id=publisher.id,
                    status="active",
                ),
            ]
        )
        db.commit()

        app = FastAPI()
        app.include_router(catalogue_share_links.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: viewer

        with TestClient(app) as client:
            response = client.get("/api/v1/catalogue-online-links")

        assert response.status_code == 200, response.text
        assert response.json() == {
            str(catalogue.id): f"http://catalogue.test/c/{normal_token}",
            str(legacy_catalogue.id): (
                f"http://catalogue.test/catalogues/{legacy_catalogue.id}/preview"
            ),
        }
    engine.dispose()
