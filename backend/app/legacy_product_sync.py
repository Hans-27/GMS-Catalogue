from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime, timedelta
from html.parser import HTMLParser
from http.cookiejar import CookieJar
import html
import re
from urllib import parse, request

from sqlalchemy import func, select, update

from app.config import settings
from app.database import SessionLocal
from app.models import AuditLog, Product


class _ProductGridParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.codes: set[str] = set()
        self._in_table = False
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "table" and "items" in (values.get("class") or "").split():
            self._in_table = True
        elif self._in_table and tag == "tr":
            self._row = []
        elif self._in_table and self._row is not None and tag == "td":
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self._cell is not None and self._row is not None:
            self._row.append(html.unescape("".join(self._cell)).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            # The second legacy-grid column is Product Code. Catalogue Code in
            # the first column is frequently blank and is not the ERP SKU.
            if len(self._row) > 1 and self._row[1]:
                self.codes.add(self._row[1][:80])
            self._row = None
            self._cell = None
        elif tag == "table" and self._in_table:
            self._in_table = False


def _parse_codes(document: str) -> set[str]:
    parser = _ProductGridParser()
    parser.feed(document)
    return parser.codes


def fetch_legacy_product_codes() -> set[str]:
    source_url = settings.legacy_catalogue_url.strip()
    username = settings.legacy_catalogue_username.strip()
    password = settings.legacy_catalogue_password.get_secret_value()
    if not source_url or not username or not password:
        raise RuntimeError("Legacy catalogue credentials are not configured.")

    parsed = parse.urlsplit(source_url)
    endpoint = parse.urlunsplit((parsed.scheme, parsed.netloc, parsed.path, "", ""))
    login_url = f"{endpoint}?{parse.urlencode({'r': 'site/login'})}"
    products_url = f"{endpoint}?{parse.urlencode({'r': 'sale/products'})}"
    jar = CookieJar()
    opener = request.build_opener(request.HTTPCookieProcessor(jar))
    opener.addheaders = [("User-Agent", "GMS-Catalogue-Data-Importer/1.0")]
    login_payload = parse.urlencode(
        {
            "LoginForm[username]": username,
            "LoginForm[password]": password,
            "yt0": "Login",
        }
    ).encode("utf-8")
    opener.open(login_url, data=login_payload, timeout=30).read()
    first = opener.open(products_url, timeout=45).read().decode("utf-8", "replace")
    if "LoginForm[username]" in first:
        raise RuntimeError("Legacy catalogue login was rejected.")
    pages = [int(value) for value in re.findall(r"Import_page=(\d+)", first)]
    last_page = max(pages, default=1)
    codes = _parse_codes(first)
    cookie_header = "; ".join(f"{cookie.name}={cookie.value}" for cookie in jar)

    def fetch_page(page: int) -> set[str]:
        url = f"{endpoint}?{parse.urlencode({'r': 'sale/products', 'Import_page': page})}"
        page_request = request.Request(
            url,
            headers={
                "User-Agent": "GMS-Catalogue-Data-Importer/1.0",
                "Cookie": cookie_header,
            },
        )
        document = request.urlopen(page_request, timeout=45).read().decode(
            "utf-8", "replace"
        )
        if "LoginForm[username]" in document:
            raise RuntimeError(f"Legacy session expired on page {page}.")
        return _parse_codes(document)

    failures: list[int] = []
    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = {
            executor.submit(fetch_page, page): page
            for page in range(2, last_page + 1)
        }
        for future in as_completed(futures):
            page = futures[future]
            try:
                codes.update(future.result())
            except Exception:
                failures.append(page)
    if failures:
        raise RuntimeError(
            f"Legacy catalogue product sync was incomplete ({len(failures)} pages failed)."
        )
    return codes


def sync_legacy_product_presence(*, force: bool = False) -> dict[str, int | bool]:
    now = datetime.now(UTC)
    with SessionLocal() as db:
        latest = db.scalar(select(func.max(Product.legacy_catalogue_synced_at)))
        if latest and latest.tzinfo is None:
            latest = latest.replace(tzinfo=UTC)
        if not force and latest and latest >= now - timedelta(hours=24):
            return {"skipped": True, "legacy_codes": 0, "matched_products": 0}

    codes = fetch_legacy_product_codes()
    with SessionLocal() as db:
        db.execute(
            update(Product).values(
                legacy_catalogue_present=False,
                legacy_catalogue_synced_at=now,
            )
        )
        matched = 0
        ordered_codes = sorted(codes)
        for start in range(0, len(ordered_codes), 500):
            result = db.execute(
                update(Product)
                .where(Product.sku.in_(ordered_codes[start : start + 500]))
                .values(legacy_catalogue_present=True)
            )
            matched += int(result.rowcount or 0)
        details = {
            "skipped": False,
            "legacy_codes": len(codes),
            "matched_products": matched,
            "unmatched_legacy_codes": max(0, len(codes) - matched),
        }
        db.add(
            AuditLog(
                action="legacy_product_presence_synchronized",
                module="data_sync",
                status="success",
                details=details,
            )
        )
        db.commit()
        return details
