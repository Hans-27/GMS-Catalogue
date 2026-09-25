import { describe, expect, it } from "vitest";
import type { PublicCatalogue } from "@/lib/api";
import type { StudioDesign, StudioElement } from "@/lib/studio-api";
import { hydratePublicStudioDesign } from "./public-studio-pricing";

function designWith(elements: StudioElement[]) {
  return {
    id: "design-1",
    catalogue_id: "catalogue-1",
    name: "Mapped catalogue",
    status: "published",
    page_width: 794,
    page_height: 1123,
    orientation: "portrait",
    size_preset: "a4_portrait",
    data_mode: "live",
    current_version: 1,
    revision: 1,
    catalogue_type: "standard",
    brand_mode: "multiple",
    start_at: null,
    end_at: null,
    timezone: "Asia/Bangkok",
    promotion_name: "",
    promotion_status: null,
    promotion_occasion_id: null,
    promotion_priority: 0,
    promotion_terms: "",
    selected_brands: [],
    price_slots: [],
    product_items: [],
    created_at: "",
    updated_at: "",
    pages: [{
      id: "page-1",
      design_id: "design-1",
      page_type: "product_grid",
      page_name: "Products",
      display_order: 1,
      width: 794,
      height: 1123,
      orientation: "portrait",
      background_color: "#ffffff",
      page_data_json: {
        pageId: "page-1",
        pageType: "product_grid",
        name: "Products",
        canvas: { width: 794, height: 1123, backgroundColor: "#ffffff", gridSize: 10, showGrid: false, showGuides: false, showSafeArea: false, bleed: 0 },
        elements,
        dataMode: "live",
      },
      is_visible: true,
      is_locked: false,
      created_at: "",
      updated_at: "",
    }],
  } as StudioDesign;
}

function element(overrides: Partial<StudioElement>): StudioElement {
  return {
    id: "element-1",
    type: "text",
    name: "Price",
    xPercent: 0,
    yPercent: 0,
    widthPercent: 20,
    heightPercent: 5,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    style: {},
    responsive: {},
    ...overrides,
  };
}

function catalogue(showPrices = true, price: string | undefined = "2150.00") {
  return {
    show_prices: showPrices,
    currency: "THB",
    products: [{ id: "product-1", code: "SKU-1", price, currency: "THB" }],
  } as unknown as PublicCatalogue;
}

describe("public Studio price mapping", () => {
  it("replaces saved card and bound-element prices with the public link price", () => {
    const source = designWith([
      element({
        id: "card",
        type: "product_card",
        productId: "product-1",
        style: { useErpPrice: true, productPrice: "THB 9,999.00", productSecondaryPrice: "THB 8,888.00", showProductPrice: true, showSecondaryPrice: true },
      }),
      element({ id: "price", productId: "product-1", binding: "{{product.price_1}}", text: "THB 9,999.00", style: { priceSource: "erp" } }),
    ]);

    const hydrated = hydratePublicStudioDesign(source, catalogue(), "public-token");
    const [card, price] = hydrated.pages[0].page_data_json.elements;

    expect(card.style.productPrice).toBe("THB 2,150.00");
    expect(card.style.productSecondaryPrice).toBe("");
    expect(card.style.showSecondaryPrice).toBe(false);
    expect(price.text).toBe("THB 2,150.00");
    expect(source.pages[0].page_data_json.elements[0].style.productPrice).toBe("THB 9,999.00");
  });

  it("hides ERP prices when the audience or brand mapping is No Price", () => {
    const hydrated = hydratePublicStudioDesign(designWith([
      element({ id: "card", type: "product_card", productId: "product-1", style: { useErpPrice: true, productPrice: "THB 9,999.00", showProductPrice: true } }),
      element({ id: "price", productId: "product-1", binding: "{{product.price}}", text: "THB 9,999.00", style: { priceSource: "erp" } }),
    ]), catalogue(false, undefined), "public-token");
    const [card, price] = hydrated.pages[0].page_data_json.elements;

    expect(card.style.productPrice).toBe("");
    expect(card.style.showProductPrice).toBe(false);
    expect(price.text).toBe("");
    expect(price.visible).toBe(false);
  });
});
