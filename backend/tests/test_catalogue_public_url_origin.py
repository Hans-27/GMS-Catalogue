"""Regression tests for runtime catalogue public-origin changes."""

import os
import unittest
from types import SimpleNamespace
from urllib.parse import urlparse

from starlette.requests import Request


os.environ["DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["SECRET_KEY"] = "catalogue-public-origin-test-secret"
os.environ["AUTO_CREATE_TABLES"] = "false"
os.environ["SEED_DEMO_DATA"] = "false"

from app.catalogue_share_links import _fernet, _public_url
from app.config import settings


class CataloguePublicUrlOriginTests(unittest.TestCase):
    @staticmethod
    def request_from_proxy(
        forwarded_host: str,
        *,
        forwarded_proto: str = "http",
        client_host: str = "127.0.0.1",
    ) -> Request:
        return Request(
            {
                "type": "http",
                "method": "GET",
                "scheme": "http",
                "path": "/api/v1/catalogue-share-links/cards",
                "raw_path": b"/api/v1/catalogue-share-links/cards",
                "query_string": b"",
                "headers": [
                    (b"host", b"127.0.0.1:8001"),
                    (b"x-forwarded-host", forwarded_host.encode()),
                    (b"x-forwarded-proto", forwarded_proto.encode()),
                ],
                "client": (client_host, 54000),
                "server": ("127.0.0.1", 8001),
            }
        )

    def test_current_origin_is_used_without_changing_the_share_token(self) -> None:
        token = "stable-encrypted-share-token"
        link = SimpleNamespace(
            encrypted_token=_fernet().encrypt(token.encode()).decode()
        )
        original_public_app_url = settings.public_app_url

        try:
            settings.public_app_url = "http://10.10.5.8:3000"
            first_url = _public_url(link)

            settings.public_app_url = "http://10.10.5.9:3000/"
            second_url = _public_url(link)
        finally:
            settings.public_app_url = original_public_app_url

        self.assertEqual(first_url, f"http://10.10.5.8:3000/c/{token}")
        self.assertEqual(second_url, f"http://10.10.5.9:3000/c/{token}")
        self.assertEqual(
            urlparse(first_url).path.rsplit("/", 1)[-1],
            urlparse(second_url).path.rsplit("/", 1)[-1],
        )

    def test_trusted_frontend_proxy_origin_replaces_stale_configured_origin(self) -> None:
        token = "stable-proxied-share-token"
        link = SimpleNamespace(
            encrypted_token=_fernet().encrypt(token.encode()).decode()
        )
        original_public_app_url = settings.public_app_url

        try:
            settings.public_app_url = "http://172.16.1.94:3000"
            url = _public_url(
                link,
                request=self.request_from_proxy("10.185.179.43:3000"),
            )
        finally:
            settings.public_app_url = original_public_app_url

        self.assertEqual(url, f"http://10.185.179.43:3000/c/{token}")

    def test_localhost_dashboard_keeps_the_configured_lan_origin(self) -> None:
        token = "stable-local-dashboard-token"
        link = SimpleNamespace(
            encrypted_token=_fernet().encrypt(token.encode()).decode()
        )
        original_public_app_url = settings.public_app_url

        try:
            settings.public_app_url = "http://192.168.7.171:3000"
            url = _public_url(
                link,
                request=self.request_from_proxy("localhost:3000"),
            )
        finally:
            settings.public_app_url = original_public_app_url

        self.assertEqual(url, f"http://192.168.7.171:3000/c/{token}")

    def test_direct_clients_cannot_spoof_the_catalogue_origin(self) -> None:
        token = "stable-direct-share-token"
        link = SimpleNamespace(
            encrypted_token=_fernet().encrypt(token.encode()).decode()
        )
        original_public_app_url = settings.public_app_url

        try:
            settings.public_app_url = "http://catalogue.office.test:3000"
            url = _public_url(
                link,
                request=self.request_from_proxy(
                    "10.185.179.99:3000",
                    client_host="10.185.179.50",
                ),
            )
        finally:
            settings.public_app_url = original_public_app_url

        self.assertEqual(url, f"http://catalogue.office.test:3000/c/{token}")


if __name__ == "__main__":
    unittest.main()
