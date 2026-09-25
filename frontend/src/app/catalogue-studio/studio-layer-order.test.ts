import { describe, expect, it } from "vitest";
import type { StudioPageDocument } from "@/lib/studio-api";
import { clampStudioZIndex, normalizeStudioLayerValues } from "./studio-layer-order";

const document = {
  pageId: "page-1",
  pageType: "blank",
  name: "Page 1",
  canvas: { width: 794, height: 1123, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: true, bleed: 0 },
  elements: [
    { id: "front", type: "text", name: "Front", xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10, rotation: 0, opacity: 1, zIndex: 87_654, locked: false, visible: true, style: {}, responsive: {} },
    { id: "back", type: "text", name: "Back", xPercent: 0, yPercent: 0, widthPercent: 10, heightPercent: 10, rotation: 0, opacity: 1, zIndex: -42_000, locked: false, visible: true, style: {}, responsive: {} },
  ],
  dataMode: "live",
} satisfies StudioPageDocument;

describe("Studio layer validation", () => {
  it("clamps layer values to the API limits", () => {
    expect(clampStudioZIndex(87_654)).toBe(10_000);
    expect(clampStudioZIndex(-42_000)).toBe(-10_000);
  });

  it("repairs an existing page document before autosave", () => {
    const normalized = normalizeStudioLayerValues(document);
    expect(normalized.elements.map((element) => element.zIndex)).toEqual([10_000, -10_000]);
  });

  it("does not replace a valid page document", () => {
    const valid = { ...document, elements: document.elements.map((element, index) => ({ ...element, zIndex: index + 1 })) };
    expect(normalizeStudioLayerValues(valid)).toBe(valid);
  });

  it("repairs legacy numeric font weights before autosave", () => {
    const legacy = {
      ...document,
      elements: [
        { ...document.elements[0], zIndex: 1, style: { fontWeight: 700, fontStyle: "oblique" } },
        { ...document.elements[1], zIndex: 2, style: { fontWeight: "400", fontStyle: "normal" } },
      ],
    } satisfies StudioPageDocument;

    const normalized = normalizeStudioLayerValues(legacy);
    expect(normalized.elements[0].style).toMatchObject({ fontWeight: "bold", fontStyle: "italic" });
    expect(normalized.elements[1].style).toMatchObject({ fontWeight: "normal" });
  });

  it("separates legacy quick image and inventory table frames", () => {
    const legacy = {
      ...document,
      elements: document.elements.map((element, index) => ({
        ...element,
        zIndex: index + 1,
        groupId: "combined-product-frame",
        style: { quickProductBlockId: "product-block-1" },
      })),
    } satisfies StudioPageDocument;

    const normalized = normalizeStudioLayerValues(legacy);
    expect(normalized.elements.every((element) => element.groupId === null)).toBe(true);
    expect(normalized.elements.every((element) => element.style.independentFrames === true)).toBe(true);
  });
});
