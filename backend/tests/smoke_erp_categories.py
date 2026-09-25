"""Small regression check for ERP hierarchy normalization."""

from app.erp_integration import _erp_brand_name, _erp_category_name


def main() -> None:
    assert _erp_category_name("เครื่องดื่ม") == "เครื่องดื่ม"
    assert _erp_category_name(" SVC ") == "SVC"
    assert _erp_category_name("ไม่ระบุ") is None
    assert _erp_category_name("ไม่กำหนด") is None
    assert _erp_category_name("Unspecified") is None
    assert _erp_category_name("N/A") is None
    assert _erp_category_name(None) is None
    assert _erp_brand_name(" PET EMPIRE ") == "PET EMPIRE"
    assert _erp_brand_name("\u0e44\u0e21\u0e48\u0e23\u0e30\u0e1a\u0e38") is None
    assert _erp_brand_name("\u0e44\u0e21\u0e48\u0e21\u0e35\u0e22\u0e35\u0e48\u0e2b\u0e49\u0e2d") is None
    assert _erp_brand_name("Unbranded") is None
    assert _erp_brand_name(None) is None
    print("ERP brand/category normalization smoke test: OK")


if __name__ == "__main__":
    main()
