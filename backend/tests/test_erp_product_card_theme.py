import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "erp-product-card-theme-test-secret-key-2026")

from app.commerce import _erp_product_card_theme


GLINK_THEME = {
    "key": "brand-glink",
    "variant": "contrast",
    "accent_color": "#8DE2DC",
    "strong_color": "#267A74",
    "surface_color": "#267A74",
    "border_color": "#164F4B",
    "text_color": "#164F4B",
}

EGA_THEME = {
    "key": "brand-ega",
    "variant": "framed",
    "accent_color": "#65F58A",
    "strong_color": "#087A3D",
    "surface_color": "#EAFFEF",
    "border_color": "#159447",
    "text_color": "#073B22",
}

NUBWO_THEME = {
    "key": "brand-nubwo",
    "variant": "framed",
    "accent_color": "#FFF05A",
    "strong_color": "#7A6400",
    "surface_color": "#FFFCE5",
    "border_color": "#C8A900",
    "text_color": "#332A00",
}


def test_glink_catalogues_use_the_approved_teal_theme() -> None:
    """Regression: hashed brand colours must not replace GLINK's approved palette."""

    assert _erp_product_card_theme("GLINK-CCTV") == GLINK_THEME
    assert _erp_product_card_theme("G-Link Fiber Optical") == GLINK_THEME


def test_ega_catalogues_use_the_approved_bright_green_theme() -> None:
    """Regression: EGA cards must not fall back to generated pink colours."""

    assert _erp_product_card_theme("EGA") == EGA_THEME
    assert _erp_product_card_theme("EGA Catalogue") == EGA_THEME


def test_nubwo_catalogues_use_the_approved_bright_yellow_theme() -> None:
    """Regression: Nubwo cards must use the EGA-style frame in yellow."""

    assert _erp_product_card_theme("Nubwo") == NUBWO_THEME
    assert _erp_product_card_theme("Nubwo Catalogue 2026") == NUBWO_THEME


def test_other_brands_keep_their_existing_generated_theme() -> None:
    assert _erp_product_card_theme("Ceflar") != GLINK_THEME
    assert _erp_product_card_theme("Ceflar") != EGA_THEME
    assert _erp_product_card_theme("Ceflar") != NUBWO_THEME
