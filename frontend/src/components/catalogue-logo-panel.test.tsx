import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CatalogueLogoPanel,
  dominantLogoColor,
} from "@/components/catalogue-logo-panel";

describe("catalogue logo background", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the dominant saturated logo colour instead of neutral image margins", () => {
    // Production defect: black letterboxing can outnumber a brand-colour panel
    // and incorrectly make every catalogue logo background black.
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 255,
      4, 4, 4, 255,
      10, 10, 10, 255,
      245, 81, 30, 255,
      245, 81, 30, 255,
      245, 81, 30, 255,
    ]);

    expect(dominantLogoColor(pixels)).toBe("#f5511e");
  });

  it("applies the extracted colour to the rendered logo panel", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([
          245, 81, 30, 255,
          245, 81, 30, 255,
        ]),
      })),
    } as unknown as CanvasRenderingContext2D);

    render(
      <CatalogueLogoPanel logoUrl="/lumira.png" alt="Lumira logo">
        <button type="button">Change logo</button>
      </CatalogueLogoPanel>,
    );

    fireEvent.load(screen.getByRole("img", { name: "Lumira logo" }));

    expect(screen.getByTestId("catalogue-logo-panel")).toHaveStyle({
      backgroundColor: "#f5511e",
    });
  });
});
