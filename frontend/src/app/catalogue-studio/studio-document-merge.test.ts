import { describe, expect, it } from "vitest";
import type { StudioElement, StudioPageDocument } from "@/lib/studio-api";
import { mergeStudioDocuments } from "./studio-document-merge";

function element(id: string, name = id): StudioElement {
  return { id, type: "image", name, xPercent: 0, yPercent: 0, widthPercent: 20, heightPercent: 20, rotation: 0, opacity: 1, zIndex: 1, locked: false, visible: true, style: {}, responsive: {} };
}

function page(elements: StudioElement[]): StudioPageDocument {
  return { pageId: "page-1", pageType: "blank", name: "Page 1", canvas: { width: 1000, height: 800, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: true, bleed: 0 }, elements, dataMode: "live" };
}

describe("Studio autosave conflict merge", () => {
  it("preserves a carousel added by a newer editor tab", () => {
    const base = page([element("existing")]);
    const local = page([{ ...element("existing"), xPercent: 12 }]);
    const carousel = { ...element("carousel", "Product Image Carousel"), type: "image_carousel" as const };
    const remote = page([element("existing"), carousel]);

    const merged = mergeStudioDocuments(base, local, remote);

    expect(merged.elements.map((item) => item.id)).toEqual(["existing", "carousel"]);
    expect(merged.elements[0].xPercent).toBe(12);
  });

  it("keeps an intentional local deletion", () => {
    const base = page([element("keep"), element("delete")]);
    const merged = mergeStudioDocuments(base, page([element("keep")]), base);
    expect(merged.elements.map((item) => item.id)).toEqual(["keep"]);
  });

  it("respects a remote deletion when the local element was unchanged", () => {
    const base = page([element("keep"), element("removed-remotely")]);
    const remote = page([element("keep")]);
    const merged = mergeStudioDocuments(base, base, remote);
    expect(merged.elements.map((item) => item.id)).toEqual(["keep"]);
  });
});
