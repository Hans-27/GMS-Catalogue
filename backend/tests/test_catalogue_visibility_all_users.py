from types import SimpleNamespace
from unittest.mock import MagicMock

from app.access import has_permission, has_record_access
from app.models import User


def _active_user_without_catalogue_permissions() -> User:
    return User(
        username="basic.user",
        email="basic.user@example.com",
        full_name="Basic User",
        password_hash="unused",
        is_active=True,
        roles=[],
    )


def test_every_active_user_can_view_and_preview_catalogues() -> None:
    """Regression: a valid account must not lose the Catalogue module entirely."""

    user = _active_user_without_catalogue_permissions()

    assert has_permission(user, "catalogues.view")
    assert has_permission(user, "catalogues.preview")
    assert not has_permission(user, "catalogues.edit")


def test_every_active_user_can_access_published_but_not_draft_catalogues() -> None:
    """Regression: baseline visibility must expose published output, not drafts."""

    user = _active_user_without_catalogue_permissions()
    db = MagicMock()

    assert has_record_access(
        db,
        user,
        "catalogues.view",
        SimpleNamespace(status="published"),
    )
    assert has_record_access(
        db,
        user,
        "catalogues.preview",
        SimpleNamespace(status="published"),
    )
    assert not has_record_access(
        db,
        user,
        "catalogues.view",
        SimpleNamespace(status="draft"),
    )


def test_inactive_users_do_not_receive_baseline_catalogue_access() -> None:
    user = _active_user_without_catalogue_permissions()
    user.is_active = False

    assert not has_permission(user, "catalogues.view")
    assert not has_permission(user, "catalogues.preview")
