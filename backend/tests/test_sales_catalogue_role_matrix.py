from app.access import effective_permission_names, has_permission
from app.models import Permission, Role, User
from app.seed import ROLE_PERMISSION_CODES, _template_scope


def test_sales_admin_catalogue_matrix() -> None:
    permissions = ROLE_PERMISSION_CODES["sales_manager"]

    required = {
        "catalogues.view",
        "catalogues.create",
        "catalogues.edit",
        "catalogues.delete",
        "catalogues.publish",
        "catalogues.export_pdf",
        "catalogue_share_links.view",
        "catalogue_share_links.create",
        "catalogue_share_links.copy",
        "prices.view",
        "prices.edit",
        "promotions.view",
        "promotions.create",
        "promotions.edit",
        "promotions.publish",
        "catalogue_studio.manage_pages",
        "audit_logs.view",
        "product_cards.view",
        "product_cards.edit",
        "product_cards.publish",
    }
    assert required <= permissions
    assert {
        "settings.manage",
        "data_sync.configure",
        "backups.view",
        "audit_logs.export",
    } <= permissions
    assert permissions.isdisjoint({
        "users.view",
        "users.create",
        "departments.view",
        "positions.view",
        "teams.view",
        "roles.view",
        "permissions.view",
        "organization.view",
    })


def test_sales_admin_cannot_regain_people_access_from_an_extra_grant() -> None:
    role = Role(
        name="sales_manager",
        key="sales_manager",
        is_active=True,
        is_system=False,
        permissions=[
            Permission(
                code="users.view",
                module="users",
                action="view",
                description="View users.",
                is_active=True,
            ),
            Permission(
                code="products.view",
                module="products",
                action="view",
                description="View products.",
                is_active=True,
            ),
        ],
    )
    sales_admin = User(
        username="sales.admin",
        email="sales.admin@example.com",
        full_name="Sales Admin",
        password_hash="unused",
        is_active=True,
        roles=[role],
    )

    assert "users.view" not in effective_permission_names(sales_admin)
    assert not has_permission(sales_admin, "users.view")
    assert has_permission(sales_admin, "products.view")


def test_sales_user_catalogue_matrix() -> None:
    permissions = ROLE_PERMISSION_CODES["sales_user"]

    assert {
        "catalogues.view",
        "catalogues.preview",
        "catalogue_share_links.view",
        "catalogue_share_links.copy",
        "data_sync.view",
        "system_metrics.view",
        "settings.view",
    } <= permissions
    assert permissions.isdisjoint({
        "catalogues.create",
        "catalogues.edit",
        "catalogues.delete",
        "catalogues.publish",
        "catalogues.export_pdf",
        "catalogue_share_links.create",
        "data_sync.run",
        "data_sync.configure",
        "settings.manage",
        "prices.edit",
        "audit_logs.view",
        "users.view",
        "roles.view",
        "data_sync.configure",
        "backups.view",
        "product_cards.view",
        "product_cards.edit",
        "product_cards.publish",
    })
    assert _template_scope("sales_user", "catalogues.view") == "all"


def test_customer_user_has_published_catalogue_access_only() -> None:
    permissions = ROLE_PERMISSION_CODES["customer_user"]

    assert permissions == {
        "catalogues.view",
        "catalogues.preview",
        "catalogues.cover.view",
        "customer_portal.view",
    }
    assert _template_scope("customer_user", "catalogues.view") == "all"
    assert "catalogue_share_links.view" not in permissions
    assert "catalogue_share_links.copy" not in permissions
    assert "dashboard.view" not in permissions
    assert "settings.view" not in permissions
