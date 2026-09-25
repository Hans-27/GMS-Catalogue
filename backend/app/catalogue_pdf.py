"""Single source of truth for every catalogue PDF export path."""

from dataclasses import dataclass

from reportlab.lib.pagesizes import A4, landscape


@dataclass(frozen=True)
class CataloguePdfConfig:
    paper_size: str = "A4"
    orientation: str = "landscape"
    width_mm: int = 297
    height_mm: int = 210
    content_margin_mm: int = 10
    cover_margin_mm: int = 0
    product_columns: int = 3
    product_rows_per_page: int = 2

    @property
    def reportlab_page_size(self) -> tuple[float, float]:
        return landscape(A4)


CATALOGUE_PDF_CONFIG = CataloguePdfConfig()
