import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudioElement } from "@/lib/studio-api";
import { activeCarouselImages, StudioImageCarousel } from "./studio-image-carousel";

vi.mock("@/lib/api", () => ({ API_ORIGIN: "http://127.0.0.1:8000" }));

function carouselElement(overrides: Partial<NonNullable<StudioElement["carousel"]>> = {}): StudioElement {
  return {
    id: "carousel-1", type: "image_carousel", name: "Product gallery", xPercent: 0, yPercent: 0,
    widthPercent: 50, heightPercent: 30, rotation: 0, opacity: 1, zIndex: 1, locked: false, visible: true,
    style: {}, responsive: {}, productId: "11111111-1111-1111-1111-111111111111",
    carousel: {
      sourceType: "selected_product_images", productId: "11111111-1111-1111-1111-111111111111",
      includeMainImage: true, includeAdditionalImages: true, selectedImageIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"], autoIncludeNewImages: false, currentIndex: 0,
      images: [
        { id: "first", productImageId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", fileName: "front.jpg", altText: "Front of product", sourceType: "product_image", displayOrder: 1, isActive: true, fit: "contain", positionX: 50, positionY: 50, zoom: 1 },
        { id: "second", productImageId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", fileName: "back.jpg", altText: "Back of product", sourceType: "product_image", displayOrder: 2, isActive: true, fit: "cover", positionX: 40, positionY: 60, zoom: 1.2 },
      ],
      transition: { type: "slide", durationMs: 350, direction: "horizontal", easing: "ease", autoplay: false, autoplayDelayMs: 4000, loop: true, pauseOnHover: true, swipe: true },
      navigation: { showArrows: true, showSingleImageArrows: false, arrowVisibility: "always", arrowPosition: "inside", arrowSize: 36, arrowBackground: "#FFFFFF", arrowColor: "#126B3A", arrowOpacity: .96, arrowCornerRadius: 999, paginationType: "dots", paginationPosition: "inside_bottom", indicatorSize: 8, indicatorSpacing: 6, showImageCount: true },
      display: { fit: "contain", backgroundColor: "#FFFFFF", padding: 0, borderRadius: 8, loadingPlaceholder: "Loading image" },
      pdf: { fallbackMode: "first_image", selectedImageId: null, gridColumns: 2 },
      ...overrides,
    },
  };
}

describe("StudioImageCarousel", () => {
  it("navigates ordered ERP images with arrows, keyboard and a live count", () => {
    render(<StudioImageCarousel designId="design-1" element={carouselElement()} />);
    expect(screen.getByRole("img", { name: "Front of product" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("img", { name: "Back of product" })).toBeInTheDocument();
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("region", { name: "Product gallery" }), { key: "ArrowRight" });
    expect(screen.getByRole("img", { name: "Front of product" })).toBeInTheDocument();
  });

  it("disables boundary arrows when loop is off", () => {
    const element = carouselElement({ transition: { ...carouselElement().carousel!.transition, loop: false } });
    render(<StudioImageCarousel designId="design-1" element={element} />);
    expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();
  });

  it("automatically advances every three seconds and loops", () => {
    vi.useFakeTimers();
    render(<StudioImageCarousel designId="design-1" element={carouselElement()} />);
    expect(screen.getByRole("img", { name: "Front of product" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("img", { name: "Back of product" })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("img", { name: "Front of product" })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("uses the selected static fallback and removes interactive controls for PDF", () => {
    const element = carouselElement({ pdf: { fallbackMode: "selected_cover", selectedImageId: "second", gridColumns: 2 } });
    render(<StudioImageCarousel designId="design-1" element={element} mode="pdf" />);
    expect(screen.getByRole("img", { name: "Back of product" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next image" })).not.toBeInTheDocument();
  });

  it("shows a clear empty state instead of broken media", () => {
    render(<StudioImageCarousel designId="design-1" element={carouselElement({ images: [], selectedImageIds: [] })} />);
    expect(screen.getByText("No images added")).toBeInTheDocument();
    expect(screen.getByText("Add Images")).toBeInTheDocument();
  });

  it("ignores duplicate persisted carousel image keys", () => {
    const element = carouselElement();
    element.carousel!.images.push({ ...element.carousel!.images[0], displayOrder: 3 });
    expect(activeCarouselImages(element)).toHaveLength(2);
    render(<StudioImageCarousel designId="design-1" element={element} />);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });
});
