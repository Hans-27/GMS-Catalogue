import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("SECRET_KEY", "catalogue-template-test-secret-key-2026")

from app.system_catalogue_templates import _definitions


def test_go_camp_reference_template_is_complete_and_editable():
    template = next(item for item in _definitions() if item["key"] == "gms-go-camp-reference")
    pages = template["pages"]

    assert [page["pageName"] for page in pages] == ["Go Camp cover", "Chair", "Table", "Bed"]
    assert all(page["orientation"] == "landscape" for page in pages)
    assert all(page["width"] > page["height"] for page in pages)

    product_elements = pages[1]["pageData"]["elements"]
    assert sum(item["type"] == "image_carousel" for item in product_elements) == 2
    assert sum(item["type"] == "table" for item in product_elements) == 2
    assert sum(item["type"] == "button" for item in product_elements) == 2
    assert all(item["locked"] is False for item in product_elements if item["type"] in {"image_carousel", "table", "button"})
