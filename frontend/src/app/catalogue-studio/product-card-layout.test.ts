import { describe, expect, it } from "vitest";

import type { StudioElement, StudioPageDocument, StudioProductCardTemplate } from "@/lib/studio-api";
import {
  applyCardPreset,
  autoLayoutProductCards,
  cardPresetSize,
  fitInsidePage,
  millimetersToPixels,
  percentToPixels,
  pixelsToMillimeters,
  pixelsToPercent,
  templateStyle,
} from "./product-card-layout";

function card(id: string, xPercent = 0, yPercent = 0): StudioElement {
  return {
    id,
    type: "product_card",
    name: id,
    xPercent,
    yPercent,
    widthPercent: 20,
    heightPercent: 20,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    style: {},
    responsive: {},
  };
}

function page(elements: StudioElement[] = []): StudioPageDocument {
  return {
    pageId: "page-1",
    pageType: "product_grid",
    name: "Products",
    canvas: {
      width: 800,
      height: 1000,
      backgroundColor: "#fff",
      gridSize: 10,
      showGrid: true,
      showGuides: true,
      showSafeArea: true,
      bleed: 0,
    },
    elements,
    dataMode: "live",
  };
}

describe("product card geometry", () => {
  it("converts pixels, percentages and millimetres without drift", () => {
    expect(percentToPixels(pixelsToPercent(320, 800), 800)).toBeCloseTo(320);
    expect(millimetersToPixels(pixelsToMillimeters(96))).toBeCloseTo(96);
    expect(pixelsToPercent(10, 0)).toBe(0);
  });

  it("keeps resized cards inside the page", () => {
    const result = fitInsidePage(
      { ...card("outside", 95, 98), widthPercent: 40, heightPercent: 30 },
      page(),
    );
    expect(result.xPercent).toBe(60);
    expect(result.yPercent).toBe(70);
    expect(result.widthPercent).toBe(40);
    expect(result.heightPercent).toBe(30);
  });

  it("supports A4 count presets and converts them to element percentages", () => {
    const document = page([card("one")]);
    const dimensions = cardPresetSize("a4-4", 800, 1000);
    const resized = applyCardPreset(document.elements[0], document, "a4-4");
    expect(dimensions.width).toBeGreaterThan(300);
    expect(dimensions.height).toBeGreaterThan(400);
    expect(resized.widthPercent).toBeCloseTo((dimensions.width / 800) * 100);
    expect(resized.heightPercent).toBeCloseTo((dimensions.height / 1000) * 100);
  });

  it("lays out only selected product cards while preserving other elements", () => {
    const text: StudioElement = { ...card("heading"), type: "text", text: "Heading" };
    const document = page([card("card-1"), card("card-2"), card("card-3"), text]);
    const result = autoLayoutProductCards(document, ["card-1", "card-2", "card-3"], {
      columns: 2,
      cardWidth: 300,
      cardHeight: 320,
      horizontalGap: 20,
      verticalGap: 24,
      margin: 40,
    });
    const cards = result.elements.filter((item) => item.type === "product_card");
    expect(cards[0].xPercent).toBe(5);
    expect(cards[1].xPercent).toBeGreaterThan(cards[0].xPercent);
    expect(cards[2].yPercent).toBeGreaterThan(cards[0].yPercent);
    expect(result.elements.find((item) => item.id === "heading")).toEqual(text);
    expect(result.overflowCount).toBe(0);
  });

  it("reports cards that cannot fit vertically", () => {
    const document = page(Array.from({ length: 8 }, (_, index) => card(`card-${index}`)));
    const result = autoLayoutProductCards(
      document,
      document.elements.map((item) => item.id),
      { columns: 2, cardWidth: 360, cardHeight: 300, horizontalGap: 10, verticalGap: 20, margin: 40 },
    );
    expect(result.overflowCount).toBe(4);
  });

  it("carries company governance into each independent card instance", () => {
    const template = {
      template_data_json: {
        style: { fontFamily: "Arial", backgroundColor: "#FFFFFF", productNameColor: "#173C29" },
        governance: {
          profile: "gms-brand-v1", lockedStyleKeys: ["fontFamily", "backgroundColor", "productNameColor"],
          requiredFields: ["image", "name", "code"],
        },
      },
      border_radius: 18, layout_mode: "responsive", min_width: 120, min_height: 100,
      current_version: 1, price_mode: "one_price",
    } as unknown as StudioProductCardTemplate;
    const style = templateStyle(template);
    expect(style.governanceProfile).toBe("gms-brand-v1");
    expect(style.governedStyleKeys).toBe("fontFamily,backgroundColor,productNameColor");
    expect(style.governedRequiredFields).toBe("image,name,code");
    expect(style.governedFontFamily).toBe("Arial");
    expect(style.governedProductNameColor).toBe("#173C29");
  });
});
