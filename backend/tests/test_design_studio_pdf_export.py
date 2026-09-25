from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from pypdf import PdfReader
from reportlab.lib.pagesizes import A4, landscape

from app.design_studio_export import (
    _element_text,
    _pdf_round_rect,
    _product_card_prices,
    render_pdf,
)


class _RecordingPath:
    def __init__(self) -> None:
        self.points: list[tuple[float, float]] = []

    def moveTo(self, x: float, y: float) -> None:
        self.points.append((x, y))

    def lineTo(self, x: float, y: float) -> None:
        self.points.append((x, y))

    def curveTo(self, *values: float) -> None:
        self.points.extend(zip(values[::2], values[1::2]))

    def close(self) -> None:
        pass


class _RecordingCanvas:
    def __init__(self) -> None:
        self.path = _RecordingPath()

    def beginPath(self) -> _RecordingPath:
        return self.path

    def drawPath(self, path: _RecordingPath, *, fill: int, stroke: int) -> None:
        assert path is self.path
        assert fill == 1
        assert stroke == 0

    def rect(self, *args, **kwargs) -> None:
        raise AssertionError("A rounded rectangle should use a bounded path.")


class DesignStudioPdfExportTests(unittest.TestCase):
    def test_generic_product_price_uses_primary_snapshot_slot(self) -> None:
        snapshot = {
            "productData": {
                "product-1": {
                    "prices": {"1": {"amount": "2150.00", "currency": "THB"}}
                }
            }
        }
        element = {
            "productId": "product-1",
            "binding": "{{product.price}}",
            "text": "THB 0.00",
        }

        self.assertEqual(_element_text(element, snapshot), "THB 2,150.00")

    def test_explicit_price_binding_uses_export_price_format(self) -> None:
        snapshot = {
            "productData": {
                "product-1": {
                    "prices_by_list": {
                        "19": {"amount": "2150", "currency": "THB"}
                    }
                }
            }
        }
        element = {
            "productId": "product-1",
            "binding": "{{product.price_list_19}}",
        }

        self.assertEqual(_element_text(element, snapshot), "THB 2,150.00")

    def test_product_card_export_uses_current_mapped_price_list(self) -> None:
        product = {
            "prices": {"1": {"amount": "999.00", "currency": "THB"}},
            "prices_by_list": {"27": {"amount": "2150.00", "currency": "THB"}},
        }
        style = {
            "useErpPrice": True,
            "primaryPriceListId": 27,
            "productPrice": "THB 100.00",
        }

        primary, secondary = _product_card_prices(product, style)

        self.assertEqual(primary, "THB 2,150.00")
        self.assertEqual(secondary, "")

    def test_pdf_pill_path_stays_inside_element_bounds(self) -> None:
        canvas = _RecordingCanvas()

        _pdf_round_rect(canvas, 10, 20, 200, 50, 100, fill=1, stroke=0)

        self.assertTrue(canvas.path.points)
        self.assertTrue(all(10 <= x <= 210 for x, _ in canvas.path.points))
        self.assertTrue(all(20 <= y <= 70 for _, y in canvas.path.points))

    def test_pdf_barcode_resets_fill_colour_after_white_background(self) -> None:
        snapshot = {
            "pages": [
                {
                    "width": 300,
                    "height": 200,
                    "isVisible": True,
                    "pageData": {
                        "canvas": {"backgroundColor": "#FFFFFF"},
                        "elements": [
                            {
                                "id": "barcode",
                                "type": "barcode",
                                "xPercent": 10,
                                "yPercent": 10,
                                "widthPercent": 80,
                                "heightPercent": 50,
                                "visible": True,
                                "style": {
                                    "backgroundColor": "#FFFFFF",
                                    "barcodeValue": "8859790017475",
                                    "color": "#111111",
                                },
                            }
                        ],
                    },
                }
            ],
            "productData": {},
        }

        with TemporaryDirectory() as directory:
            output_path = Path(directory) / "barcode.pdf"
            render_pdf(None, snapshot, output_path, {})
            page = PdfReader(str(output_path)).pages[0]
            content = page.get_contents().get_data()

        self.assertIn(b"8859790017475", content)
        self.assertIn(b".066667 .066667 .066667 rg", content)
        expected_page_size = landscape(A4)
        self.assertAlmostEqual(float(page.mediabox.width), expected_page_size[0], places=2)
        self.assertAlmostEqual(float(page.mediabox.height), expected_page_size[1], places=2)


if __name__ == "__main__":
    unittest.main()
