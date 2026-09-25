"""Opt-in browser/PDF visual parity check against a saved Studio revision.

Run this test with STUDIO_VISUAL_DESIGN_ID and STUDIO_VISUAL_VERSION_ID set.
It stays skipped in ordinary unit-test runs because it requires the local frontend,
database and Chrome, but it is suitable for the release gate and for reproducing
layout regressions with a real catalogue revision.
"""

from __future__ import annotations

import io
import os
from pathlib import Path
import tempfile
import uuid

import fitz
from PIL import Image, ImageChops
import pytest
from playwright.sync_api import sync_playwright
from sqlalchemy import select

from app.config import settings
from app.database import SessionLocal
from app.design_studio import _snapshot_with_current_live_stock
from app.design_studio_browser_export import (
    _chrome_executable,
    _page_url,
    render_browser_pdf,
)
from app.design_studio_models import CatalogueDesignVersion
from app.models import User
from app.security import create_access_token


DESIGN_ID = os.getenv("STUDIO_VISUAL_DESIGN_ID", "").strip()
VERSION_ID = os.getenv("STUDIO_VISUAL_VERSION_ID", "").strip()


@pytest.mark.skipif(
    not DESIGN_ID or not VERSION_ID,
    reason="Set STUDIO_VISUAL_DESIGN_ID and STUDIO_VISUAL_VERSION_ID for the live visual comparison.",
)
def test_saved_preview_matches_browser_generated_pdf() -> None:
    design_id = uuid.UUID(DESIGN_ID)
    version_id = uuid.UUID(VERSION_ID)
    chrome = _chrome_executable()
    assert chrome, "Chrome/Chromium is required for the visual regression test."

    with SessionLocal() as db:
        version = db.scalar(select(CatalogueDesignVersion).where(
            CatalogueDesignVersion.id == version_id,
            CatalogueDesignVersion.design_id == design_id,
        ))
        assert version is not None, "The requested immutable Studio version does not exist."
        snapshot = _snapshot_with_current_live_stock(db, version.snapshot_json)
        first_page = min(
            (item for item in snapshot.get("pages", []) if item.get("isVisible", True)),
            key=lambda item: int(item.get("displayOrder", 0)),
        )
        width = int(first_page.get("width") or snapshot["design"]["pageWidth"])
        height = int(first_page.get("height") or snapshot["design"]["pageHeight"])
        page_id = str(first_page["id"])
        actor = db.scalar(select(User).where(User.username == "superadmin", User.is_active.is_(True)))
        if actor is None:
            actor = db.scalar(select(User).where(User.is_active.is_(True)).order_by(User.created_at))
        assert actor is not None, "An active export user is required."
        token, _ = create_access_token(
            user_id=actor.id,
            roles=[role.name for role in actor.roles if role.is_active],
            remember_me=False,
        )

        with tempfile.TemporaryDirectory(prefix="catalogue-visual-regression-") as directory:
            root = Path(directory)
            screenshot_path = root / "preview.png"
            pdf_path = root / "catalogue.pdf"

            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    headless=True,
                    executable_path=chrome,
                    args=["--disable-dev-shm-usage", "--no-sandbox", "--font-render-hinting=none"],
                )
                try:
                    context = browser.new_context(device_scale_factor=1)
                    context.add_cookies([{
                        "name": settings.auth_cookie_name,
                        "value": token,
                        "url": settings.public_app_url,
                        "httpOnly": True,
                        "secure": settings.public_app_url.startswith("https://"),
                        "sameSite": "Lax",
                    }])
                    page = context.new_page()
                    page.set_viewport_size({"width": width, "height": height})
                    page.goto(_page_url(design_id, version_id, page_id), wait_until="networkidle", timeout=60_000)
                    page.wait_for_function(
                        "document.body.dataset.pdfReady === 'true' || Boolean(document.body.dataset.pdfError)",
                        timeout=60_000,
                    )
                    assert not page.evaluate("document.body.dataset.pdfError || ''")
                    page.emulate_media(media="print")
                    page.locator("article").screenshot(path=str(screenshot_path), animations="disabled")
                finally:
                    browser.close()

            render_browser_pdf(
                db,
                snapshot,
                pdf_path,
                {"quality": 92},
                design_id=design_id,
                version_id=version_id,
                requested_by_id=actor.id,
            )

            with fitz.open(pdf_path) as document:
                pixmap = document[0].get_pixmap(matrix=fitz.Matrix(96 / 72, 96 / 72), alpha=False)
            pdf_image = Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("RGB")
            preview_image = Image.open(screenshot_path).convert("RGB")
            assert abs(pdf_image.width - preview_image.width) <= 1
            assert abs(pdf_image.height - preview_image.height) <= 1
            common_size = (min(pdf_image.width, preview_image.width), min(pdf_image.height, preview_image.height))
            pdf_image = pdf_image.crop((0, 0, *common_size))
            preview_image = preview_image.crop((0, 0, *common_size))
            difference = ImageChops.difference(preview_image, pdf_image)
            changed = sum(
                1 for pixel in difference.getdata()
                if max(pixel) > 24
            )
            changed_ratio = changed / (common_size[0] * common_size[1])
            assert changed_ratio < 0.03, f"Preview/PDF visual difference was {changed_ratio:.2%}; expected < 3%."
