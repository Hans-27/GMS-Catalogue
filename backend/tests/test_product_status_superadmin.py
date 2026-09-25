import inspect
import os
import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException, Request


os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "product-status-superadmin-test-secret")

from app.access import has_permission, is_superadmin, require_superadmin
from app.catalogue import list_products
from app.commerce import preview_catalogue
from app.models import Permission, Role, User
from app.product_admin import change_product_status, product_detail


def _legacy_catalogue_manager() -> User:
    role = Role(
        name="catalogue_manager",
        key="catalogue_manager",
        description="Legacy catalogue manager",
        is_active=True,
        is_system=False,
        permissions=[
            Permission(
                code="products.view",
                module="products",
                action="view",
                description="View products",
                is_active=True,
            ),
            Permission(
                code="products.view_inactive",
                module="products",
                action="view_inactive",
                description="Legacy inactive product access",
                is_active=True,
            ),
            Permission(
                code="products.change_status",
                module="products",
                action="change_status",
                description="Legacy product status access",
                is_active=True,
            ),
        ],
    )
    return User(
        username="legacy.manager",
        email="legacy.manager@example.com",
        full_name="Legacy Manager",
        password_hash="unused",
        is_active=True,
        roles=[role],
    )


def _request(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "headers": [],
            "client": ("127.0.0.1", 50000),
            "scheme": "http",
            "server": ("testserver", 80),
            "query_string": b"",
        }
    )


def test_legacy_permissions_do_not_make_a_user_superadmin() -> None:
    actor = _legacy_catalogue_manager()

    assert has_permission(actor, "products.view_inactive")
    assert has_permission(actor, "products.change_status")
    assert not is_superadmin(actor)
    with pytest.raises(HTTPException) as caught:
        require_superadmin(actor)
    assert caught.value.status_code == 403


def test_status_mutation_route_requires_canonical_superadmin() -> None:
    actor_dependency = inspect.signature(change_product_status).parameters["actor"].default

    assert actor_dependency.dependency is require_superadmin


def test_legacy_manager_cannot_request_inactive_product_list() -> None:
    with pytest.raises(HTTPException) as caught:
        list_products(
            q="",
            workflow_status=None,
            brand=None,
            category_id=None,
            needs=None,
            price_level_id=None,
            audience_type_id=None,
            product_status="all",
            page=1,
            page_size=20,
            user=_legacy_catalogue_manager(),
            db=MagicMock(),
        )

    assert caught.value.status_code == 403
    assert caught.value.detail == "SuperAdmin access is required to view inactive products."


def test_legacy_manager_cannot_open_an_inactive_product(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "app.product_admin._get_product",
        lambda _db, _product_id: SimpleNamespace(status="inactive"),
    )
    monkeypatch.setattr("app.product_admin._require_product_access", lambda *_args: None)

    with pytest.raises(HTTPException) as caught:
        product_detail(
            uuid.uuid4(),
            actor=_legacy_catalogue_manager(),
            db=MagicMock(),
        )

    assert caught.value.status_code == 404


def test_legacy_manager_cannot_include_inactive_products_in_preview(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.commerce._get_scoped_catalogue",
        lambda *_args: SimpleNamespace(id=uuid.uuid4()),
    )
    monkeypatch.setattr("app.commerce._presentation_source", lambda *_args: ({}, None))
    monkeypatch.setattr(
        "app.commerce._safe_presentation",
        lambda *_args, **_kwargs: pytest.fail(
            "A non-SuperAdmin reached inactive catalogue presentation."
        ),
    )

    with pytest.raises(HTTPException) as caught:
        preview_catalogue(
            uuid.uuid4(),
            _request("/api/v1/catalogues/test/preview"),
            version=None,
            version_number=None,
            audience_type_id=None,
            include_inactive=True,
            actor=_legacy_catalogue_manager(),
            db=MagicMock(),
        )

    assert caught.value.status_code == 403
    assert caught.value.detail == "SuperAdmin access is required to view inactive products."
