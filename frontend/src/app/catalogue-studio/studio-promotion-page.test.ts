import { describe, expect, it } from "vitest";
import type { Promotion } from "@/lib/api";
import { buildStudioPromotionPage } from "./studio-promotion-page";

const promotion = {
  id: "promotion-1",
  name_en: "New Year Sale",
  short_title: "Save this New Year",
  description_en: "Selected products for a limited time.",
  occasion_name: "New Year",
  status: "scheduled",
  start_at: "2026-12-20T00:00:00Z",
  end_at: "2027-01-15T00:00:00Z",
  cover_url: "/media/banner.jpg",
  products: [
    { product_id: "product-1", product_code: "P1", product_name: "Product One", brand: "Brand A", promotion_price: "100", currency: "THB", include_in_promotion: true },
    { product_id: "product-1", product_code: "P1", product_name: "Product One", brand: "Brand A", promotion_price: "90", currency: "THB", include_in_promotion: true },
  ],
} as Promotion;

describe("Studio promotion pages", () => {
  it("stores the reusable promotion reference and one editable card per product", () => {
    let id = 0;
    const page = buildStudioPromotionPage(
      promotion,
      { page_width: 794, page_height: 1123, data_mode: "live" },
      "page-1",
      () => `element-${++id}`,
    );
    expect(page.pageType).toBe("promotion");
    expect(page.promotionId).toBe("promotion-1");
    expect(page.promotionStatus).toBe("scheduled");
    expect(page.elements.filter((element) => element.type === "product_card")).toHaveLength(1);
    expect(page.elements.find((element) => element.type === "product_card")?.style.useErpPrice).toBe(true);
  });
});
