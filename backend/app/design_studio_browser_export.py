"""Pixel-faithful Catalogue Studio PDF export using the shared browser renderer."""

from __future__ import annotations

import os
import shutil
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlencode, urlparse

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright
from pypdf import PdfReader, PdfWriter
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User
from app.security import create_access_token


def _chrome_executable() -> str | None:
    configured = os.getenv("CATALOGUE_CHROME_PATH", "").strip()
    candidates = [
        configured,
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    for binary in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        resolved = shutil.which(binary)
        if resolved:
            return resolved
    return None


def _page_url(
    design_id: uuid.UUID,
    version_id: uuid.UUID,
    page_id: str,
    public_token: str | None = None,
) -> str:
    parameters = {"versionId": str(version_id), "pageId": page_id}
    if public_token:
        parameters["publicToken"] = public_token
    query = urlencode(parameters)
    return f"{settings.public_app_url.rstrip('/')}/catalogue-studio/{design_id}/pdf-render?{query}"


def _merge_pdf_pages(page_files: list[Path], output_path: Path) -> None:
    writer = PdfWriter()
    for page_file in page_files:
        reader = PdfReader(str(page_file))
        if len(reader.pages) != 1:
            raise RuntimeError(f"Browser renderer returned {len(reader.pages)} pages for {page_file.name}; expected exactly one.")
        writer.add_page(reader.pages[0])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as handle:
        writer.write(handle)


def render_browser_pdf(
    db: Session,
    snapshot: dict,
    output_path: Path,
    options: dict,
    *,
    design_id: uuid.UUID,
    version_id: uuid.UUID | None,
    requested_by_id: uuid.UUID | None,
    public_token: str | None = None,
    public_password: str | None = None,
) -> None:
    """Render every visible saved page with the same React/CSS component as Preview."""
    if version_id is None:
        raise RuntimeError("PDF export requires an immutable catalogue version.")
    quality = int(options.get("quality", 92) or 92)
    if quality < 1:
        raise RuntimeError("PDF quality must be a positive number.")
    actor = db.get(User, requested_by_id) if requested_by_id else None
    if not actor or not actor.is_active:
        raise RuntimeError("The user who requested this export is unavailable or inactive.")
    chrome = _chrome_executable()
    if not chrome:
        raise RuntimeError("Google Chrome or Chromium is required for Catalogue Studio PDF export. Set CATALOGUE_CHROME_PATH when it is installed in a non-standard location.")

    visible_pages = sorted(
        (page for page in snapshot.get("pages", []) if page.get("isVisible", True)),
        key=lambda page: int(page.get("displayOrder", 0)),
    )
    if not visible_pages:
        raise RuntimeError("The saved catalogue version has no visible pages to export.")

    token, _ = create_access_token(
        user_id=actor.id,
        roles=[role.name for role in actor.roles if role.is_active],
        remember_me=False,
    )
    parsed_app_url = urlparse(settings.public_app_url)
    cookie_secure = parsed_app_url.scheme == "https"
    with tempfile.TemporaryDirectory(prefix="catalogue-browser-pdf-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        page_files: list[Path] = []
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                executable_path=chrome,
                args=["--disable-dev-shm-usage", "--no-sandbox", "--font-render-hinting=none"],
            )
            try:
                context_options = {"device_scale_factor": 1}
                if public_token and public_password:
                    context_options["extra_http_headers"] = {"X-Catalogue-Password": public_password}
                context = browser.new_context(**context_options)
                context.add_cookies([{
                    "name": settings.auth_cookie_name,
                    "value": token,
                    "url": settings.public_app_url,
                    "httpOnly": True,
                    "secure": cookie_secure,
                    "sameSite": "Lax",
                }])
                for index, page_data in enumerate(visible_pages, start=1):
                    width = max(1, int(page_data.get("width") or snapshot.get("design", {}).get("pageWidth") or 1123))
                    height = max(1, int(page_data.get("height") or snapshot.get("design", {}).get("pageHeight") or 794))
                    physical_width = "297mm" if width > height else "210mm"
                    physical_height = "210mm" if width > height else "297mm"
                    page_id = str(page_data.get("id") or "")
                    if not page_id:
                        raise RuntimeError(f"Saved catalogue page {index} has no page ID.")
                    browser_page = context.new_page()
                    browser_page.set_viewport_size({"width": width, "height": height})
                    try:
                        browser_page.goto(
                            _page_url(design_id, version_id, page_id, public_token),
                            wait_until="networkidle",
                            timeout=60_000,
                        )
                        browser_page.wait_for_function(
                            "document.body.dataset.pdfReady === 'true' || Boolean(document.body.dataset.pdfError)",
                            timeout=60_000,
                        )
                        render_error = browser_page.evaluate("document.body.dataset.pdfError || ''")
                        if render_error:
                            raise RuntimeError(f"Page {index} assets are incomplete: {render_error}")
                        browser_page.emulate_media(media="print")
                        page_file = temporary_path / f"page-{index:04d}.pdf"
                        browser_page.pdf(
                            path=str(page_file),
                            width=physical_width,
                            height=physical_height,
                            margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                            print_background=True,
                            prefer_css_page_size=True,
                            scale=1,
                            tagged=True,
                        )
                        page_files.append(page_file)
                    except PlaywrightTimeoutError as error:
                        raise RuntimeError(f"Timed out rendering saved catalogue page {index}. Check that the frontend is running at {settings.public_app_url} and that its assets are reachable.") from error
                    finally:
                        browser_page.close()
            finally:
                browser.close()
        _merge_pdf_pages(page_files, output_path)
