from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.erp_integration import ERP_BRAND_DESCRIPTION, _sync_erp_brand_directory
from app.models import Brand


def main() -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Brand.__table__.create(engine)

    with Session(engine) as db:
        db.add_all(
            [
                Brand(
                    name="Legacy ERP Brand",
                    code="LEGACY_ERP",
                    description=ERP_BRAND_DESCRIPTION,
                    is_active=True,
                ),
                Brand(
                    name="User Brand",
                    code="USER_BRAND",
                    description="Created by a catalogue administrator.",
                    is_active=True,
                ),
                Brand(
                    name="Returning Brand",
                    code="RETURNING",
                    description=ERP_BRAND_DESCRIPTION,
                    is_active=False,
                ),
            ]
        )
        db.commit()

        result = _sync_erp_brand_directory(
            db,
            ["New ERP Brand", "Returning Brand"],
        )
        db.commit()

        brands = {brand.name: brand for brand in db.scalars(select(Brand))}
        assert brands["New ERP Brand"].is_active is True
        assert brands["Returning Brand"].is_active is True
        assert brands["Legacy ERP Brand"].is_active is False
        assert brands["User Brand"].is_active is True
        assert result == {
            "brands_available": 2,
            "brands_created": 1,
            "brands_reactivated": 1,
            "brands_deactivated": 1,
        }

    print("ERP brand directory synchronization smoke test: OK")


if __name__ == "__main__":
    main()
