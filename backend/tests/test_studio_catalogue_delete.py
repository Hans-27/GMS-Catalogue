import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "studio-catalogue-delete-test-secret-2026")

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app import commerce, design_studio, promotion_models  # register related tables
from app.auth import get_current_user
from app.commerce_models import Catalogue
from app.database import Base, get_db
from app.design_studio_models import CatalogueDesign
from app.models import Role, User


def test_deleting_studio_catalogue_also_deletes_source_design(tmp_path) -> None:
    """Regression: a surviving Studio design must not recreate a deleted catalogue."""

    engine = create_engine(
        f"sqlite:///{tmp_path / 'studio-catalogue-delete.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        actor = User(
            username="superadmin",
            email="superadmin@example.test",
            full_name="Super Administrator",
            password_hash="unused",
            is_active=True,
            roles=[
                Role(
                    name="SuperAdmin",
                    description="Test role",
                    is_system=True,
                    system_key="SUPERADMIN",
                )
            ],
        )
        db.add(actor)
        db.flush()
        catalogue = Catalogue(
            title="24 Aug Test",
            slug="24-aug-test",
            description="Created and managed in Catalogue Studio.",
            status="draft",
            owner_id=actor.id,
            created_by_id=actor.id,
            updated_by_id=actor.id,
        )
        db.add(catalogue)
        db.flush()
        design = CatalogueDesign(
            name="24 Aug Test",
            status="draft",
            catalogue_id=catalogue.id,
            created_by_id=actor.id,
            updated_by_id=actor.id,
        )
        db.add(design)
        db.commit()
        catalogue_id = catalogue.id
        design_id = design.id

        app = FastAPI()
        app.include_router(commerce.router, prefix="/api/v1")
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: actor

        with TestClient(app) as client:
            response = client.delete(f"/api/v1/catalogues/{catalogue_id}")

        assert response.status_code == 204, response.text
        db.expire_all()
        assert db.get(Catalogue, catalogue_id) is None
        deleted_design = db.get(CatalogueDesign, design_id)
        assert deleted_design is not None
        assert deleted_design.deleted_at is not None
        assert deleted_design.catalogue_id is None

        design_studio.synchronize_studio_catalogues(db, actor)
        db.commit()
        assert db.scalar(
            select(Catalogue).where(Catalogue.title == "24 Aug Test")
        ) is None
    engine.dispose()
