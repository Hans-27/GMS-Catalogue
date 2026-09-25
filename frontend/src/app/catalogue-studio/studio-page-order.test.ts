import { describe, expect, it } from "vitest";
import { reorderStructuredStudioPageIds, reorderStudioPageIds, structuredStudioPageIds } from "./studio-page-order";

describe("Catalogue Studio page ordering", () => {
  const pages = ["cover", "contents", "products", "final"];

  it("moves a page before the selected drop target", () => {
    expect(reorderStudioPageIds(pages, "final", "contents", "before")).toEqual([
      "cover", "final", "contents", "products",
    ]);
  });

  it("moves a page after the selected drop target", () => {
    expect(reorderStudioPageIds(pages, "cover", "products", "after")).toEqual([
      "contents", "products", "cover", "final",
    ]);
  });

  it("keeps the original array when the drop does not change order", () => {
    expect(reorderStudioPageIds(pages, "contents", "products", "before")).toBe(pages);
  });

  it("places optional promotion pages after the cover and before catalogue content", () => {
    expect(structuredStudioPageIds([
      { id: "products", page_type: "product_grid" },
      { id: "promotion-two", page_type: "promotion" },
      { id: "cover", page_type: "cover" },
      { id: "promotion-one", page_type: "promotion" },
      { id: "terms", page_type: "terms" },
    ])).toEqual(["cover", "promotion-two", "promotion-one", "products", "terms"]);
  });

  it("allows reordering within a group without moving promotions behind products", () => {
    const structured = [
      { id: "cover", page_type: "cover" },
      { id: "promotion-one", page_type: "promotion" },
      { id: "promotion-two", page_type: "promotion" },
      { id: "products", page_type: "product_grid" },
    ];
    expect(reorderStructuredStudioPageIds(structured, "promotion-two", "promotion-one", "before"))
      .toEqual(["cover", "promotion-two", "promotion-one", "products"]);
    expect(reorderStructuredStudioPageIds(structured, "products", "cover", "before"))
      .toEqual(["cover", "promotion-one", "promotion-two", "products"]);
  });
});
