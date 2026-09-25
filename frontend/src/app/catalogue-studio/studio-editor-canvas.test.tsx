import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudioElement, StudioPageDocument } from "@/lib/studio-api";
import StudioEditorCanvas, { resolveCrossPageDropDirection, resolveElementMeasurements, resolveSmartGuides } from "./studio-editor-canvas";

vi.mock("react-konva", async () => {
  const React = await import("react");
  const mockComponent = (name: string) => React.forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
    function MockKonvaComponent({ children }, ref) {
      return <div data-konva-component={name} ref={ref}>{children}</div>;
    },
  );
  return {
    Group: mockComponent("Group"),
    Image: mockComponent("Image"),
    Layer: mockComponent("Layer"),
    Line: mockComponent("Line"),
    Rect: mockComponent("Rect"),
    Stage: mockComponent("Stage"),
    Text: mockComponent("Text"),
    Transformer: mockComponent("Transformer"),
  };
});

vi.mock("konva", () => ({
  default: {
    Easings: { EaseOut: () => undefined },
    Tween: class MockTween {
      play() {}
      destroy() {}
    },
  },
}));

const element: StudioElement = {
  id: "visibility-test",
  type: "text",
  name: "Visibility test",
  text: "Product title",
  xPercent: 5,
  yPercent: 5,
  widthPercent: 30,
  heightPercent: 10,
  rotation: 0,
  opacity: 1,
  zIndex: 1,
  locked: false,
  visible: false,
  style: {},
  responsive: {},
};

function page(visible: boolean): StudioPageDocument {
  return {
    pageId: "page-1",
    pageType: "blank",
    name: "Page 1",
    canvas: {
      width: 794,
      height: 1123,
      backgroundColor: "#FFFFFF",
      gridSize: 10,
      showGrid: false,
      showGuides: false,
      showSafeArea: false,
      bleed: 0,
    },
    elements: [{ ...element, visible }],
    dataMode: "live",
  };
}

describe("StudioEditorCanvas", () => {
  it("measures the pixel gap between two separated elements", () => {
    const second = { ...element, id: "second", visible: true, xPercent: 50, yPercent: 30 };
    const measurements = resolveElementMeasurements([{ ...element, visible: true }, second], { width: 1000, height: 800 });

    expect(measurements).toEqual(expect.arrayContaining([
      expect.objectContaining({ axis: "horizontal", distance: 150 }),
      expect.objectContaining({ axis: "vertical", distance: 120 }),
    ]));
  });

  it("snaps a moving element to nearby edges and centers", () => {
    const result = resolveSmartGuides(
      { x: 196, y: 98, width: 100, height: 100 },
      [{ x: 300, y: 100, width: 100, height: 100 }],
      { width: 800, height: 600 },
      6,
    );
    expect(result.x).toBe(200);
    expect(result.y).toBe(100);
    expect(result.guides).toEqual(expect.arrayContaining([
      { axis: "vertical", position: 300 },
      { axis: "horizontal", position: 100 },
    ]));
  });

  it("treats the lower page edge as a drop zone for the next page", () => {
    expect(resolveCrossPageDropDirection({
      nodeY: 900,
      nodeHeight: 40,
      canvasHeight: 1123,
      pointerY: 1100,
      canMoveToPreviousPage: false,
      canMoveToNextPage: true,
    })).toBe(1);
  });

  it("moves to the previous page at the upper edge and respects unavailable pages", () => {
    const input = {
      nodeY: 4,
      nodeHeight: 40,
      canvasHeight: 1123,
      pointerY: 4,
      canMoveToNextPage: false,
    };
    expect(resolveCrossPageDropDirection({ ...input, canMoveToPreviousPage: true })).toBe(-1);
    expect(resolveCrossPageDropDirection({ ...input, canMoveToPreviousPage: false })).toBeNull();
  });

  it("does not change pages while an element stays away from the page edges", () => {
    expect(resolveCrossPageDropDirection({
      nodeY: 450,
      nodeHeight: 80,
      canvasHeight: 1123,
      pointerY: 490,
      canMoveToPreviousPage: true,
      canMoveToNextPage: true,
    })).toBeNull();
  });

  it("keeps a stable hook order when a canvas element becomes visible", () => {
    const props = {
      designId: "design-1",
      pageNumber: 1,
      selectedIds: [] as string[],
      selectionMode: false,
      cropModeElementId: null,
      interactionMode: "edit" as const,
      zoom: 1,
      onSelect: vi.fn(),
      onSelectMany: vi.fn(),
      onChange: vi.fn(),
      onMoveSelection: vi.fn(),
      onTransformSelection: vi.fn(),
      onMoveAcrossPage: vi.fn(),
      canMoveToPreviousPage: false,
      canMoveToNextPage: false,
      onProductImageStep: vi.fn(),
      onProductImagePreview: vi.fn(),
      onElementContextMenu: vi.fn(),
      onStageReady: vi.fn(),
    };
    const { rerender } = render(<StudioEditorCanvas {...props} document={page(false)} />);

    expect(() => rerender(<StudioEditorCanvas {...props} document={page(true)} />)).not.toThrow();
  });
});
