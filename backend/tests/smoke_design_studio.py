"""Catalogue Design Studio API regression test.

Run from ``backend`` with::

    python -m tests.smoke_design_studio
"""

import os
import shutil
import tempfile
from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path


test_directory = Path(tempfile.mkdtemp(prefix="gms-design-studio-test-"))
os.environ["DATABASE_URL"] = (
    f"sqlite+pysqlite:///{(test_directory / 'studio.db').as_posix()}"
)
os.environ["SECRET_KEY"] = "design-studio-smoke-secret"
os.environ["AUTO_CREATE_TABLES"] = "true"
os.environ["SEED_DEMO_DATA"] = "true"
os.environ["UPLOAD_DIR"] = str(test_directory / "uploads")

from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfWriter
from sqlalchemy import select

from app.database import SessionLocal
from app.design_studio_export import render_pdf, render_raster
from app.main import app
from app.commerce_models import CatalogueAudienceType, PriceList, ProductPrice, UserBrandCataloguePriceMapping, UserCataloguePriceMapping
from app.models import AuditLog, Brand, Product, Role, User
from app.security import hash_password
from app.workers.design_export_worker import process_next


def main() -> None:
    try:
        with TestClient(app) as client:
            with SessionLocal() as db:
                superadmin_role = db.scalar(
                    select(Role).where(Role.system_key == "SUPERADMIN")
                )
                viewer_role = db.scalar(select(Role).where(Role.name == "viewer"))
                assert superadmin_role is not None and viewer_role is not None
                db.add_all([
                    User(
                        username="studio.admin",
                        email="studio.admin@example.com",
                        full_name="Studio Administrator",
                        password_hash=hash_password("StudioPassword123!"),
                        roles=[superadmin_role],
                    ),
                    User(
                        username="studio.viewer",
                        email="studio.viewer@example.com",
                        full_name="Studio Viewer",
                        password_hash=hash_password("StudioViewer123!"),
                        roles=[viewer_role],
                    ),
                ])
                db.add_all([
                    Brand(name="Studio Brand A", code="SBA", description="", is_active=True),
                    Brand(name="Studio Brand B", code="SBB", description="", is_active=True),
                    PriceList(code="STUDIO1", name="Studio Normal", description="", currency="THB", is_active=True),
                    PriceList(code="STUDIO2", name="Studio VIP", description="", currency="THB", is_active=True),
                    Product(sku="ST-ACTIVE", erp_name="Active Studio Product", brand="Studio Brand A", status="active"),
                    Product(sku="ST-INACTIVE", erp_name="Inactive Studio Product", brand="Studio Brand A", status="inactive", inactive_reason="discontinued"),
                ])
                db.commit()
                studio_admin = db.scalar(select(User).where(User.username == "studio.admin"))
                studio_normal = db.scalar(select(PriceList).where(PriceList.code == "STUDIO1"))
                studio_vip = db.scalar(select(PriceList).where(PriceList.code == "STUDIO2"))
                studio_product = db.scalar(select(Product).where(Product.sku == "ST-ACTIVE"))
                studio_level = CatalogueAudienceType(
                    code="STUDIO_CUSTOMER",
                    display_name="Studio Customer",
                    price_list_id=studio_normal.id,
                    show_prices=True,
                    display_order=999,
                    is_active=True,
                )
                db.add(studio_level)
                db.flush()
                db.add_all([
                    UserCataloguePriceMapping(
                        user_id=studio_admin.id,
                        audience_type_id=studio_level.id,
                        price_list_id=studio_normal.id,
                    ),
                    UserBrandCataloguePriceMapping(
                        user_id=studio_admin.id,
                        brand_key="studio brand a",
                        brand_name="Studio Brand A",
                        audience_type_id=studio_level.id,
                        price_list_id=studio_vip.id,
                    ),
                    ProductPrice(
                        product_id=studio_product.id,
                        price_list_id=studio_normal.id,
                        currency="THB",
                        amount=Decimal("45.00"),
                        effective_from=datetime.now(UTC),
                        status="active",
                        reason="Studio price picker smoke test",
                        created_by_id=studio_admin.id,
                        approved_by_id=studio_admin.id,
                    ),
                    ProductPrice(
                        product_id=studio_product.id,
                        price_list_id=studio_vip.id,
                        currency="THB",
                        amount=Decimal("35.00"),
                        effective_from=datetime.now(UTC),
                        status="active",
                        reason="Studio brand price mapping smoke test",
                        created_by_id=studio_admin.id,
                        approved_by_id=studio_admin.id,
                    ),
                ])
                db.commit()

            login = client.post(
                "/api/auth/login",
                json={
                    "identifier": "studio.admin",
                    "password": "StudioPassword123!",
                    "remember_me": False,
                },
            )
            assert login.status_code == 200, login.text

            template = client.post(
                "/api/v1/catalogue-studio/templates",
                json={
                    "template_type": "cover",
                    "name": "Green cover",
                    "description": "Reusable cover",
                    "template_data": {"pageType": "cover", "elements": []},
                    "visibility_scope": "company",
                    "tags": ["green"],
                },
            )
            assert template.status_code == 201, template.text
            reusable_document = {
                "pageId": "template-cover", "pageType": "cover", "name": "Template Cover",
                "canvas": {"width": 794, "height": 1123, "backgroundColor": "#FFFFFF", "gridSize": 10, "showGrid": False, "showGuides": True, "showSafeArea": True, "bleed": 0},
                "elements": [], "dataMode": "live",
            }
            reusable = client.post("/api/v1/catalogue-studio/templates", json={
                "template_type": "catalogue", "name": "Reusable catalogue", "description": "",
                "template_data": {"pages": [{"pageName": "Template Cover", "pageData": reusable_document}]},
                "visibility_scope": "private", "tags": [],
            })
            assert reusable.status_code == 201, reusable.text
            from_template = client.post("/api/v1/catalogue-studio/designs", json={
                "name": "From reusable template", "start_mode": "my_template", "template_id": reusable.json()["id"],
                "size_preset": "a4_portrait", "page_width": 794, "page_height": 1123,
                "orientation": "portrait", "data_mode": "live",
            })
            assert from_template.status_code == 201, from_template.text
            assert from_template.json()["pages"][0]["page_name"] == "Template Cover"
            design_listing = client.get("/api/v1/catalogue-studio/designs/summary")
            assert design_listing.status_code == 200, design_listing.text
            listed_template = next(row for row in design_listing.json() if row["id"] == from_template.json()["id"])
            assert listed_template["page_count"] == 1
            assert listed_template["product_count"] == 0
            assert listed_template["brand_count"] == 0
            assert "pages" not in listed_template, "The library endpoint must not return full canvas documents."
            exported_template = client.get(f"/api/v1/catalogue-studio/templates/{reusable.json()['id']}/export")
            assert exported_template.status_code == 200 and exported_template.json()["schema_version"] == 1
            assert exported_template.headers["content-type"].startswith("application/vnd.gms.catalogue-template+json")
            assert ".gmstemplate" in exported_template.headers["content-disposition"]
            imported_template = client.post(
                "/api/v1/catalogue-studio/templates/import",
                files={"file": ("safe-template.gmstemplate", exported_template.content, "application/vnd.gms.catalogue-template+json")},
            )
            assert imported_template.status_code == 201, imported_template.text

            for extension, mime_type, image_format in [
                ("png", "image/png", "PNG"),
                ("jpg", "image/jpeg", "JPEG"),
                ("webp", "image/webp", "WEBP"),
            ]:
                image_buffer = BytesIO()
                Image.new("RGB", (1200, 800), "#147A43").save(image_buffer, format=image_format)
                visual_template = client.post(
                    "/api/v1/catalogue-studio/templates/import",
                    data={"template_type": "catalogue"},
                    files={
                        "file": (
                            f"visual-template.{extension}",
                            image_buffer.getvalue(),
                            mime_type,
                        )
                    },
                )
                assert visual_template.status_code == 201, visual_template.text
                visual_body = visual_template.json()
                assert visual_body["template_type"] == "catalogue"
                assert len(visual_body["template_data_json"]["pages"]) == 1
                background = visual_body["template_data_json"]["pages"][0]["pageData"]["elements"][0]
                assert background["type"] == "image" and background["locked"] is True
                asset_content = client.get(
                    f"/api/v1/catalogue-studio/assets/{background['assetId']}/content"
                )
                assert asset_content.status_code == 200
                assert asset_content.headers["content-type"].startswith("image/png")

            pdf_buffer = BytesIO()
            pdf_writer = PdfWriter()
            pdf_writer.add_blank_page(width=595, height=842)
            pdf_writer.add_blank_page(width=842, height=595)
            pdf_writer.write(pdf_buffer)
            pdf_template = client.post(
                "/api/v1/catalogue-studio/templates/import",
                data={"template_type": "catalogue"},
                files={"file": ("two-page-template.pdf", pdf_buffer.getvalue(), "application/pdf")},
            )
            assert pdf_template.status_code == 201, pdf_template.text
            assert len(pdf_template.json()["template_data_json"]["pages"]) == 2
            cover_from_pdf = client.post(
                "/api/v1/catalogue-studio/templates/import",
                data={"template_type": "cover"},
                files={"file": ("cover-template.pdf", pdf_buffer.getvalue(), "application/pdf")},
            )
            assert cover_from_pdf.status_code == 201, cover_from_pdf.text
            cover_body = cover_from_pdf.json()
            assert cover_body["template_type"] == "cover"
            assert len(cover_body["template_data_json"]["pages"]) == 1
            assert cover_body["template_data_json"]["pages"][0]["pageType"] == "cover"

            card_template = client.post(
                "/api/v1/catalogue-studio/product-card-templates",
                json={
                    "name": "Rounded card",
                    "description": "Product card smoke test",
                    "template_data": {"fields": ["name_en", "price"]},
                    "card_width": 320,
                    "card_height": 420,
                    "border_radius": 24,
                },
            )
            assert card_template.status_code == 201, card_template.text
            assert card_template.json()["border_radius"] == 24

            # The reusable product-card library is separate from card instances.
            # Instances continue to be saved inside the versioned page document,
            # while these endpoints own template metadata, scope and history.
            library = client.get("/api/v1/product-card-templates")
            assert library.status_code == 200, library.text
            system_cards = [row for row in library.json() if row["is_company_template"]]
            assert len(system_cards) == 6
            assert {row["template_type"] for row in system_cards} == {
                "gms_essential", "gms_erp_detail", "gms_retail_story",
                "gms_horizontal_sales", "gms_promotion_two_price", "gms_technical_no_price",
            }
            for governed_card in system_cards:
                governance = governed_card["template_data_json"]["governance"]
                assert governance["brandLocked"] is True
                assert governance["fontFamily"] == "Arial"
                assert governance["requiredFields"]
            erp_card = next(row for row in system_cards if row["template_type"] == "gms_erp_detail")
            assert erp_card["template_data_json"]["style"]["showProductBarcode"] is True

            complete_templates = client.get("/api/v1/catalogue-studio/templates")
            assert complete_templates.status_code == 200, complete_templates.text
            governed_catalogues = [
                row for row in complete_templates.json()
                if "system:gms-governed" in row["tags"]
            ]
            assert {row["name"] for row in governed_catalogues} == {
                "GMS Standard Brand Catalogue", "GMS Multi-Brand Catalogue", "GMS Promotion Catalogue",
                "GMS Go Camp Product Catalogue",
            }
            assert all(len(row["template_data_json"]["pages"]) == 4 for row in governed_catalogues)
            assert all(row["template_data_json"]["governance"]["brandLocked"] for row in governed_catalogues)
            go_camp_template = next(row for row in governed_catalogues if row["name"] == "GMS Go Camp Product Catalogue")
            assert all(page["orientation"] == "landscape" for page in go_camp_template["template_data_json"]["pages"])
            assert any(element["type"] == "table" for element in go_camp_template["template_data_json"]["pages"][1]["pageData"]["elements"])

            personal_card = client.post(
                "/api/v1/product-card-templates",
                json={
                    "name": "Studio personal card",
                    "description": "Reusable personal ERP card",
                    "template_type": "custom",
                    "template_data": {
                        "schemaVersion": 2,
                        "style": {
                            "cardLayout": "image_left",
                            "showProductName": True,
                            "showProductStock": True,
                            "showProductBarcode": True,
                            "priceMode": "two_prices",
                        },
                    },
                    "card_width": 420,
                    "card_height": 260,
                    "min_width": 180,
                    "min_height": 120,
                    "layout_mode": "responsive",
                    "price_mode": "two_prices",
                    "visibility_scope": "only_me",
                },
            )
            assert personal_card.status_code == 201, personal_card.text
            personal_id = personal_card.json()["id"]
            assert personal_card.json()["current_version"] == 1

            updated_card = client.patch(
                f"/api/v1/product-card-templates/{personal_id}",
                json={"card_width": 460, "change_note": "Wider card"},
            )
            assert updated_card.status_code == 200, updated_card.text
            assert updated_card.json()["current_version"] == 2
            assert updated_card.json()["card_width"] == 460

            versions = client.get(f"/api/v1/product-card-templates/{personal_id}/versions")
            assert versions.status_code == 200, versions.text
            assert [row["version_number"] for row in versions.json()] == [2, 1]

            restored_card = client.post(
                f"/api/v1/product-card-templates/{personal_id}/restore/{versions.json()[-1]['id']}"
            )
            assert restored_card.status_code == 200, restored_card.text
            assert restored_card.json()["current_version"] == 3
            assert restored_card.json()["card_width"] == 420

            copied_card = client.post(f"/api/v1/product-card-templates/{personal_id}/duplicate")
            assert copied_card.status_code == 201, copied_card.text
            assert copied_card.json()["name"].endswith("Copy")
            assert client.delete(
                f"/api/v1/product-card-templates/{copied_card.json()['id']}"
            ).status_code == 204

            viewer_login = client.post(
                "/api/auth/login",
                json={"identifier": "studio.viewer", "password": "StudioViewer123!", "remember_me": False},
            )
            assert viewer_login.status_code == 200, viewer_login.text
            assert client.post(
                "/api/v1/catalogue-studio/templates",
                json={
                    "template_type": "cover", "name": "Denied", "description": "",
                    "template_data": {"elements": []}, "tags": [],
                },
            ).status_code == 403

            login = client.post(
                "/api/auth/login",
                json={"identifier": "studio.admin", "password": "StudioPassword123!", "remember_me": False},
            )
            assert login.status_code == 200, login.text

            created = client.post(
                "/api/v1/catalogue-studio/designs",
                json={
                    "name": "Autumn catalogue",
                    "size_preset": "a4_portrait",
                    "page_width": 794,
                    "page_height": 1123,
                    "orientation": "portrait",
                    "data_mode": "live",
                },
            )
            assert created.status_code == 201, created.text
            design = created.json()
            design_id = design["id"]
            assert design["revision"] == 1
            assert len(design["pages"]) == 1

            with SessionLocal() as db:
                brands = list(db.scalars(select(Brand).where(Brand.code.in_(("SBA", "SBB"))).order_by(Brand.code)))
                price_lists = list(db.scalars(select(PriceList).where(PriceList.code.in_(("STUDIO1", "STUDIO2"))).order_by(PriceList.code)))
                active_product = db.scalar(select(Product).where(Product.sku == "ST-ACTIVE"))
                inactive_product = db.scalar(select(Product).where(Product.sku == "ST-INACTIVE"))
            multi = client.post("/api/v1/catalogue-studio/designs", json={
                "name":"Blank multi-brand", "start_mode":"blank", "catalogue_type":"standard",
                "brand_mode":"multiple", "brand_ids":[brand.id for brand in brands],
                "size_preset":"a4_landscape", "page_width":1123, "page_height":794, "orientation":"landscape", "data_mode":"live",
                "price_slots":[
                    {"slot_number":1,"price_list_id":price_lists[0].id,"display_label":"Normal Price","currency_display":"code","decimal_places":2,"is_visible":True},
                    {"slot_number":2,"price_list_id":price_lists[1].id,"display_label":"VIP Price","currency_display":"code","decimal_places":2,"is_visible":True},
                ],
            })
            assert multi.status_code == 201, multi.text
            multi_body = multi.json()
            assert multi_body["brand_mode"] == "multiple" and len(multi_body["selected_brands"]) == 2
            assert multi_body["pages"][0]["page_type"] == "blank" and not multi_body["pages"][0]["page_data_json"]["elements"]
            assert len(multi_body["price_slots"]) == 2
            invalid_product = client.put(f"/api/v1/catalogue-studio/designs/{multi_body['id']}/products", json={"expected_revision":multi_body["revision"],"products":[{"product_id":str(inactive_product.id),"is_visible":True}]})
            assert invalid_product.status_code == 422, invalid_product.text
            active_selection = client.put(f"/api/v1/catalogue-studio/designs/{multi_body['id']}/products", json={"expected_revision":multi_body["revision"],"products":[{"product_id":str(active_product.id),"is_visible":True}]})
            assert active_selection.status_code == 200, active_selection.text
            pricing_overview = client.get(
                f"/api/v1/catalogue-studio/designs/{multi_body['id']}/pricing-overview"
            )
            assert pricing_overview.status_code == 200, pricing_overview.text
            overview_product = next(
                row for row in pricing_overview.json()["products"]
                if row["id"] == str(active_product.id)
            )
            overview_customer_price = next(
                row for row in overview_product["options"]
                if row["customer_level_code"] == "STUDIO_CUSTOMER"
            )
            assert overview_customer_price["price_list_code"] == "STUDIO2"
            assert overview_customer_price["mapping_source"] == "brand"
            assert overview_customer_price["status"] == "ready"
            assert overview_customer_price["amount"] == "35.00"
            mapping_summary = client.get("/api/v1/my-catalogue-price-mapping-summary")
            assert mapping_summary.status_code == 200, mapping_summary.text
            studio_brand_summary = next(
                row for row in mapping_summary.json()
                if row["brand"] == "Studio Brand A"
            )
            assert studio_brand_summary["override_count"] >= 1
            assert studio_brand_summary["status"] in {"partial", "custom"}
            hidden = client.patch(f"/api/v1/catalogue-studio/designs/{multi_body['id']}/products/{active_product.id}/visibility", json={"expected_revision":active_selection.json()["revision"],"is_visible":False})
            assert hidden.status_code == 200 and hidden.json()["product_items"][0]["is_visible"] is False
            available = client.get(f"/api/v1/catalogue-studio/designs/{multi_body['id']}/products/available?q=ST-")
            assert available.status_code == 200, available.text
            assert any(row["id"] == str(active_product.id) for row in available.json())
            assert all(row["id"] != str(inactive_product.id) for row in available.json())
            active_row = next(row for row in available.json() if row["id"] == str(active_product.id))
            assert set(active_row["prices"]) == {"1", "2"}
            assert active_row["prices"]["1"]["display_label"] == "Normal Price"
            assert active_row["prices"]["2"]["display_label"] == "VIP Price"
            assert active_row["prices"]["1"]["price_list_id"] == price_lists[1].id
            assert active_row["prices"]["1"]["amount"] == "35.00"
            price_options = client.get(
                f"/api/v1/catalogue-studio/designs/{multi_body['id']}/products/{active_product.id}/price-options"
            )
            assert price_options.status_code == 200, price_options.text
            studio_customer_price = next(
                row for row in price_options.json()["options"]
                if row["customer_level_code"] == "STUDIO_CUSTOMER"
            )
            assert studio_customer_price["amount"] == "35.00"
            assert studio_customer_price["price_list_code"] == "STUDIO2"
            assert studio_customer_price["is_custom_mapping"] is True
            brand_search = client.get(
                f"/api/v1/catalogue-studio/designs/{multi_body['id']}/products/available?q={active_product.brand}"
            )
            assert brand_search.status_code == 200, brand_search.text
            assert any(row["id"] == str(active_product.id) for row in brand_search.json())
            with SessionLocal() as db:
                assert db.get(Product, active_product.id).status == "active"
            invalid_promotion = client.post("/api/v1/catalogue-studio/designs", json={
                "name":"Invalid promotion", "start_mode":"blank", "catalogue_type":"promotion", "brand_mode":"single", "brand_ids":[brands[0].id],
                "size_preset":"square", "page_width":1080, "page_height":1080, "orientation":"square", "data_mode":"live",
                "promotion":{"promotion_name":"Bad dates","occasion_id":None,"start_at":"2027-01-02T00:00:00Z","end_at":"2027-01-01T00:00:00Z","timezone":"Asia/Bangkok","priority":50,"terms":""},
            })
            assert invalid_promotion.status_code == 422, invalid_promotion.text
            promotion = client.post("/api/v1/catalogue-studio/designs", json={
                "name":"Scheduled promotion", "start_mode":"blank", "catalogue_type":"promotion", "brand_mode":"single", "brand_ids":[brands[0].id],
                "size_preset":"square", "page_width":1080, "page_height":1080, "orientation":"square", "data_mode":"live",
                "promotion":{"promotion_name":"Launch","occasion_id":None,"start_at":"2027-01-01T00:00:00Z","end_at":"2027-01-02T00:00:00Z","timezone":"Asia/Bangkok","priority":50,"terms":"While stocks last"},
            })
            assert promotion.status_code == 201, promotion.text
            promotion_body = promotion.json()
            for action, status in (("submit", "pending_review"), ("approve", "approved"), ("schedule", "scheduled")):
                transitioned = client.post(
                    f"/api/v1/catalogue-studio/designs/{promotion_body['id']}/promotion/{action}",
                    json={"expected_revision": promotion_body["revision"]},
                )
                assert transitioned.status_code == 200, transitioned.text
                promotion_body = transitioned.json()
                assert promotion_body["promotion_status"] == status

            page = design["pages"][0]
            document = page["page_data_json"]
            document["elements"].append(
                {
                    "id": "headline",
                    "type": "text",
                    "name": "Headline",
                    "xPercent": 10,
                    "yPercent": 12,
                    "widthPercent": 75,
                    "heightPercent": 10,
                    "rotation": 0,
                    "opacity": 1,
                    "zIndex": 2,
                    "locked": False,
                    "visible": True,
                    "text": "Autumn collection",
                    "style": {"color": "#14532d", "fontSize": 52},
                    "responsive": {},
                }
            )
            document["elements"].append({
                "id": "hero-carousel", "type": "image_carousel", "name": "Hero images",
                "xPercent": 15, "yPercent": 28, "widthPercent": 70, "heightPercent": 30,
                "rotation": 0, "opacity": 1, "zIndex": 3, "locked": False, "visible": True,
                "style": {"backgroundColor": "#FFFFFF", "borderRadius": 12}, "responsive": {},
                "carousel": {
                    "sourceType": "uploaded_images", "productId": None,
                    "includeMainImage": True, "includeAdditionalImages": True,
                    "selectedImageIds": [], "autoIncludeNewImages": False, "currentIndex": 0,
                    "images": [{
                        "id": "carousel-image-1", "url": "https://example.invalid/sample.webp",
                        "fileName": "sample.webp", "altText": "Sample catalogue product",
                        "sourceType": "user_upload", "displayOrder": 1, "isActive": True,
                        "fit": "contain", "positionX": 50, "positionY": 50, "zoom": 1,
                    }],
                    "transition": {"type": "slide", "durationMs": 350, "direction": "horizontal", "easing": "ease", "autoplay": False, "autoplayDelayMs": 4000, "loop": True, "pauseOnHover": True, "swipe": True},
                    "navigation": {"showArrows": True, "showSingleImageArrows": False, "arrowVisibility": "hover", "arrowPosition": "inside", "arrowSize": 36, "arrowBackground": "#FFFFFF", "arrowColor": "#126B3A", "arrowOpacity": .96, "arrowCornerRadius": 999, "paginationType": "dots", "paginationPosition": "inside_bottom", "indicatorSize": 8, "indicatorSpacing": 6, "showImageCount": True},
                    "display": {"fit": "contain", "backgroundColor": "#FFFFFF", "padding": 0, "borderRadius": 12, "loadingPlaceholder": "Loading image"},
                    "pdf": {"fallbackMode": "first_image", "selectedImageId": None, "gridColumns": 2},
                },
            })
            saved = client.patch(
                f"/api/v1/catalogue-studio/designs/{design_id}/pages/{page['id']}",
                json={"page_data": document, "expected_revision": 1},
            )
            assert saved.status_code == 200, saved.text
            assert saved.json()["pages"][0]["page_data_json"]["elements"][-1]["id"] == "hero-carousel"

            stale = client.patch(
                f"/api/v1/catalogue-studio/designs/{design_id}/pages/{page['id']}",
                json={"page_data": document, "expected_revision": 1},
            )
            assert stale.status_code == 409, stale.text

            unsafe_document = dict(document)
            unsafe_document["elements"] = [
                {
                    "id": "unsafe-image",
                    "type": "image",
                    "name": "Unsafe image",
                    "xPercent": 0,
                    "yPercent": 0,
                    "widthPercent": 10,
                    "heightPercent": 10,
                    "rotation": 0,
                    "opacity": 1,
                    "zIndex": 1,
                    "locked": False,
                    "visible": True,
                    "assetId": "data:text/html,<script>alert(1)</script>",
                    "style": {},
                    "responsive": {},
                }
            ]
            unsafe = client.patch(
                f"/api/v1/catalogue-studio/designs/{design_id}/pages/{page['id']}",
                json={"page_data": unsafe_document, "expected_revision": 2},
            )
            assert unsafe.status_code == 422, unsafe.text

            version = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/versions",
                json={"change_summary": "Review copy", "expected_revision": 2},
            )
            assert version.status_code == 201, version.text
            assert version.json()["snapshot_json"]["pages"][0]["pageData"]
            saved_version_id = version.json()["id"]

            published = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/publish",
                json={
                    "change_summary": "Published smoke version",
                    "expected_revision": 2,
                },
            )
            assert published.status_code == 200, published.text
            assert published.json()["current_version"] == 2
            catalogue_id = published.json()["catalogue_id"]
            assert catalogue_id

            catalogues = client.get("/api/v1/catalogues")
            assert catalogues.status_code == 200, catalogues.text
            matching_catalogue = next(
                (
                    item
                    for item in catalogues.json()
                    if item["id"] == catalogue_id
                ),
                None,
            )
            assert matching_catalogue is not None
            assert matching_catalogue["status"] == "published"
            assert matching_catalogue["title"] == published.json()["name"]

            unpublished = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/unpublish",
                json={
                    "change_summary": "Unpublished smoke version",
                    "expected_revision": published.json()["revision"],
                },
            )
            assert unpublished.status_code == 200, unpublished.text
            assert unpublished.json()["status"] == "draft"
            assert unpublished.json()["catalogue_id"] == catalogue_id

            published_filter = client.get(
                "/api/v1/catalogues", params={"status": "published"}
            )
            assert published_filter.status_code == 200, published_filter.text
            assert all(
                item["id"] != catalogue_id for item in published_filter.json()
            )

            catalogues_after_unpublish = client.get("/api/v1/catalogues")
            assert catalogues_after_unpublish.status_code == 200
            matching_draft = next(
                item
                for item in catalogues_after_unpublish.json()
                if item["id"] == catalogue_id
            )
            assert matching_draft["status"] == "draft"

            republished = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/publish",
                json={
                    "change_summary": "Republished smoke version",
                    "expected_revision": unpublished.json()["revision"],
                },
            )
            assert republished.status_code == 200, republished.text
            assert republished.json()["status"] == "published"
            assert republished.json()["catalogue_id"] == catalogue_id

            republished_filter = client.get(
                "/api/v1/catalogues", params={"status": "published"}
            )
            assert republished_filter.status_code == 200, republished_filter.text
            assert any(
                item["id"] == catalogue_id for item in republished_filter.json()
            )

            exported = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/exports",
                json={"export_type": "template", "options": {}},
            )
            assert exported.status_code == 202, exported.text
            assert exported.json()["status"] == "completed"
            assert exported.json()["storage_key"].endswith(".gmstemplate")
            template_content = client.get(
                f"/api/v1/catalogue-studio/exports/{exported.json()['id']}/content"
            )
            assert template_content.status_code == 200, template_content.text
            assert template_content.headers["content-type"].startswith("application/vnd.gms.catalogue-template+json")
            assert template_content.json()["format"] == "gms-catalogue-studio"
            assert template_content.json()["template"]["name"] == design["name"]
            reimported_design_template = client.post(
                "/api/v1/catalogue-studio/templates/import",
                files={
                    "file": (
                        "exported-design.gmstemplate",
                        template_content.content,
                        "application/vnd.gms.catalogue-template+json",
                    )
                },
            )
            assert reimported_design_template.status_code == 201, reimported_design_template.text
            assert reimported_design_template.json()["name"] == design["name"]

            queued_pdf = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/exports",
                json={"export_type": "pdf", "options": {"include_cover": True}},
            )
            assert queued_pdf.status_code == 202, queued_pdf.text
            assert queued_pdf.json()["status"] == "queued"
            assert process_next() is True
            pdf_content = client.get(
                f"/api/v1/catalogue-studio/exports/{queued_pdf.json()['id']}/content"
            )
            assert pdf_content.status_code == 200, pdf_content.text
            assert pdf_content.headers["content-type"].startswith("application/pdf")
            assert pdf_content.content.startswith(b"%PDF")
            deleted_pdf = client.delete(
                f"/api/v1/catalogue-studio/exports/{queued_pdf.json()['id']}"
            )
            assert deleted_pdf.status_code == 204, deleted_pdf.text
            assert client.get(
                f"/api/v1/catalogue-studio/exports/{queued_pdf.json()['id']}/content"
            ).status_code == 404

            detail_snapshot = {
                "pages": [{
                    "id": "erp-detail-page", "width": 800, "height": 600, "isVisible": True,
                    "pageData": {
                        "pageId": "erp-detail-page", "pageType": "product", "name": "ERP detail",
                        "canvas": {"width": 800, "height": 600, "backgroundColor": "#AEDDEA"},
                        "elements": [{
                            "id": "erp-detail-card", "type": "product_card", "name": "ERP detail card",
                            "productId": "erp-detail-product", "xPercent": 5, "yPercent": 5,
                            "widthPercent": 90, "heightPercent": 90, "rotation": 0, "opacity": 1,
                            "zIndex": 1, "locked": False, "visible": True, "responsive": {},
                            "style": {
                                "cardLayout": "erp_detail", "backgroundColor": "#FFFFFF",
                                "borderColor": "#D6DED9", "borderWidth": 1, "borderRadius": 38,
                                "detailAccentColor": "#F9A83B", "productName": "Cat litter 10L",
                                "productSku": "23-01178", "productBarcode": "8859790002006",
                                "productStock": 1181, "productPackSize": 10, "productUnit": "Liter",
                                "productDescription": "Premium cat litter", "showProductDescription": True,
                                "productPrice": "THB 690.00", "showProductImage": True,
                                "showProductPrice": True, "cardPadding": 12,
                            },
                        }, {
                            "id": "comparison-table", "type": "table", "name": "Product comparison",
                            "xPercent": 10, "yPercent": 68, "widthPercent": 80, "heightPercent": 24,
                            "rotation": 0, "opacity": 1, "zIndex": 2, "locked": False,
                            "visible": True, "responsive": {},
                            "text": "Code | Barcode | Stock\n23-01178 | 8859790002006 | 1181",
                            "style": {
                                "tableHeader": True, "tableHeaderColor": "#126B3A",
                                "tableHeaderTextColor": "#FFFFFF", "tableCellColor": "#FFFFFF",
                                "tableAlternateColor": "#F2F8F4", "tableGridColor": "#B9CCC0",
                                "fontSize": 14, "fontWeight": "bold", "fontStyle": "italic",
                                "tableStriped": True, "tableShowBorders": True,
                                "tableBorderWidth": 2, "tableVerticalAlign": "middle",
                                "backgroundColor": "#FFFFFF",
                            },
                        }],
                    },
                }],
                "productData": {"erp-detail-product": {"sku": "23-01178", "name_en": "Cat litter 10L", "barcode": "8859790002006", "stock_on_hand": 1181, "prices": {"1": {"currency": "THB", "amount": "690.00"}}}},
            }
            detail_pdf = test_directory / "erp-detail-card.pdf"
            detail_png = test_directory / "erp-detail-card.png"
            with SessionLocal() as db:
                render_pdf(db, detail_snapshot, detail_pdf, {})
                render_raster(db, detail_snapshot, detail_png, {}, "png")
            assert detail_pdf.read_bytes().startswith(b"%PDF")
            assert detail_png.read_bytes().startswith(b"\x89PNG")

            pages = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/pages",
                json={
                    "page_type": "product_grid",
                    "page_name": "Products",
                    "width": 794,
                    "height": 1123,
                    "orientation": "portrait",
                    "background_color": "#FFFFFF",
                    "is_visible": True,
                    "page_data": {
                        "pageId": "products-page",
                        "pageType": "product_grid",
                        "name": "Products",
                        "canvas": {
                            "width": 794,
                            "height": 1123,
                            "backgroundColor": "#FFFFFF",
                            "gridSize": 10,
                            "showGrid": False,
                            "showGuides": True,
                            "showSafeArea": True,
                            "bleed": 0,
                        },
                        "elements": [{
                            "id": "saved-table", "type": "table", "name": "Saved table",
                            "xPercent": 10, "yPercent": 10, "widthPercent": 60, "heightPercent": 24,
                            "rotation": 0, "opacity": 1, "zIndex": 1, "locked": False,
                            "visible": True, "text": "Code | Stock\nA-1 | 5",
                            "style": {"tableHeader": True, "tableHeaderColor": "#126B3A", "fontWeight": "bold", "fontStyle": "italic", "tableStriped": True, "tableShowBorders": True, "tableBorderWidth": 1, "tableVerticalAlign": "bottom"},
                            "responsive": {},
                        }],
                        "dataMode": "live",
                    },
                },
            )
            assert pages.status_code == 201, pages.text

            refreshed = client.get(
                f"/api/v1/catalogue-studio/designs/{design_id}"
            )
            assert refreshed.status_code == 200, refreshed.text
            refreshed_body = refreshed.json()
            assert [item["display_order"] for item in refreshed_body["pages"]] == [1, 2]

            reordered = client.put(
                f"/api/v1/catalogue-studio/designs/{design_id}/pages/order",
                json={
                    "page_ids": [
                        refreshed_body["pages"][1]["id"],
                        refreshed_body["pages"][0]["id"],
                    ],
                    "expected_revision": refreshed_body["revision"],
                },
            )
            assert reordered.status_code == 200, reordered.text
            assert [item["page_name"] for item in reordered.json()["pages"]] == ["Products", "Cover"]

            restored = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/versions/{saved_version_id}/restore",
                json={
                    "change_summary": "Restore the review copy",
                    "expected_revision": reordered.json()["revision"],
                },
            )
            assert restored.status_code == 200, restored.text
            assert restored.json()["status"] == "draft"
            assert [item["page_name"] for item in restored.json()["pages"]] == ["Cover"]

            duplicated = client.post(
                f"/api/v1/catalogue-studio/designs/{design_id}/duplicate?version_id={saved_version_id}"
            )
            assert duplicated.status_code == 201, duplicated.text
            assert duplicated.json()["name"].endswith(" copy")
            assert duplicated.json()["status"] == "draft"
            assert client.delete(
                f"/api/v1/catalogue-studio/designs/{duplicated.json()['id']}"
            ).status_code == 204

            removed = client.delete(
                f"/api/v1/catalogue-studio/designs/{design_id}"
            )
            assert removed.status_code == 204, removed.text

            assert client.get(
                f"/api/v1/catalogue-studio/designs/{design_id}"
            ).status_code == 404

            with SessionLocal() as db:
                actions = set(db.scalars(select(AuditLog.action).where(AuditLog.module == "catalogue_studio")))
                assert {
                    "catalogue_design_created", "catalogue_design_page_saved",
                    "catalogue_design_published", "catalogue_design_restored",
                    "catalogue_design_export_requested", "catalogue_design_export_deleted", "catalogue_template_created",
                    "product_card_template_created",
                    "image_carousel_added", "image_carousel_images_uploaded",
                }.issubset(actions)
                card_actions = set(db.scalars(select(AuditLog.action).where(AuditLog.module == "product_card_templates")))
                assert {
                    "product_card_template_created", "product_card_template_updated",
                    "product_card_template_version_restored", "product_card_template_duplicated",
                    "product_card_template_deleted",
                }.issubset(card_actions)

        print("Design Studio smoke tests passed.")
    finally:
        shutil.rmtree(test_directory, ignore_errors=True)


if __name__ == "__main__":
    main()
