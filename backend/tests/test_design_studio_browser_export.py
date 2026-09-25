from pathlib import Path
from tempfile import TemporaryDirectory
import uuid

from pypdf import PdfReader, PdfWriter

from app.design_studio_browser_export import _merge_pdf_pages, _page_url


def _single_page_pdf(path: Path, width: float, height: float) -> None:
    writer = PdfWriter()
    writer.add_blank_page(width=width, height=height)
    with path.open("wb") as handle:
        writer.write(handle)


def test_merge_preserves_mixed_page_sizes_and_order() -> None:
    with TemporaryDirectory() as directory:
        root = Path(directory)
        landscape = root / "landscape.pdf"
        portrait = root / "portrait.pdf"
        output = root / "catalogue.pdf"
        _single_page_pdf(landscape, 842, 595)
        _single_page_pdf(portrait, 595, 842)

        _merge_pdf_pages([landscape, portrait], output)

        pages = PdfReader(str(output)).pages
        assert len(pages) == 2
        assert (float(pages[0].mediabox.width), float(pages[0].mediabox.height)) == (842, 595)
        assert (float(pages[1].mediabox.width), float(pages[1].mediabox.height)) == (595, 842)


def test_internal_render_url_pins_version_and_page() -> None:
    design_id = uuid.uuid4()
    version_id = uuid.uuid4()

    url = _page_url(design_id, version_id, "page with spaces")

    assert f"/catalogue-studio/{design_id}/pdf-render?" in url
    assert f"versionId={version_id}" in url
    assert "pageId=page+with+spaces" in url
