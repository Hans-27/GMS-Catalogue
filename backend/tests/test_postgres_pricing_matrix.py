"""PostgreSQL regression coverage for the ERP product price matrix.

Run explicitly against a configured PostgreSQL database with:
    $env:RUN_POSTGRES_PRICING_INTEGRATION = "1"
    python -m pytest tests/test_postgres_pricing_matrix.py -q

The test is read-only.  It catches the production defect where PostgreSQL
rejects a DISTINCT product-id query ordered by a non-selected SKU column.
"""

import os

import pytest
from sqlalchemy import select


if os.getenv("RUN_POSTGRES_PRICING_INTEGRATION") != "1":
    pytest.skip(
        "Set RUN_POSTGRES_PRICING_INTEGRATION=1 to run against PostgreSQL.",
        allow_module_level=True,
    )


from app.commerce import get_erp_product_price_matrix
from app.database import SessionLocal, engine
from app.models import Role, User


def test_erp_product_price_matrix_loads_on_postgresql() -> None:
    assert engine.dialect.name == "postgresql"

    with SessionLocal() as db:
        actor = db.scalar(
            select(User)
            .join(User.roles)
            .where(Role.system_key == "SUPERADMIN")
        )
        assert actor is not None

        page = get_erp_product_price_matrix(
            q="",
            brand=None,
            category_id=None,
            page=1,
            page_size=50,
            actor=actor,
            db=db,
        )

        assert page.total > 0
        assert page.items
        assert all(item.product_sku for item in page.items)
