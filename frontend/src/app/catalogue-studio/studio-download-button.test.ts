import { describe, expect, it } from "vitest";
import type { StudioElement } from "@/lib/studio-api";
import { downloadButtonDesign, downloadButtonPosition, downloadButtonSize, supportsProductImageDownload } from "./studio-download-button";

const baseElement: StudioElement = {
  id: "image-1", type: "image", name: "Product image", productId: "product-1",
  xPercent: 0, yPercent: 0, widthPercent: 30, heightPercent: 30,
  rotation: 0, opacity: 1, zIndex: 1, locked: false, visible: true,
  style: {}, responsive: {},
};

describe("studio download button configuration", () => {
  it("resolves a saved design, size and position", () => {
    const style = { downloadButtonDesign: "tray", downloadButtonSize: 48, downloadButtonXPercent: 35, downloadButtonYPercent: 62 };
    expect(downloadButtonDesign(style).glyph).toBe("⇩");
    expect(downloadButtonSize(style)).toBe(48);
    expect(downloadButtonPosition(style)).toEqual({ xPercent: 35, yPercent: 62 });
  });

  it("uses safe defaults and clamps values inside the product element", () => {
    expect(downloadButtonDesign({ downloadButtonDesign: "unknown" }).id).toBe("classic");
    expect(downloadButtonSize({ downloadButtonSize: 200 })).toBe(64);
    expect(downloadButtonPosition({ downloadButtonXPercent: -5, downloadButtonYPercent: 120 })).toEqual({ xPercent: 0, yPercent: 92 });
  });

  it("supports ERP product images, cards and every populated carousel", () => {
    expect(supportsProductImageDownload(baseElement)).toBe(true);
    expect(supportsProductImageDownload({ ...baseElement, type: "product_card" })).toBe(true);
    expect(supportsProductImageDownload({ ...baseElement, type: "image_carousel", productId: null, carousel: { productId: null, images: [{ isActive: true }] } as StudioElement["carousel"] })).toBe(true);
    expect(supportsProductImageDownload({ ...baseElement, type: "image_carousel", productId: null, carousel: { productId: null, images: [{ isActive: false }] } as StudioElement["carousel"] })).toBe(false);
    expect(supportsProductImageDownload({ ...baseElement, type: "logo", productId: null })).toBe(false);
  });
});
