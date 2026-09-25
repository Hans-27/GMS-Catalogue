import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogueExploreLink } from "./catalogue-explore-link";

describe("CatalogueExploreLink", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("smoothly scrolls down to its hash target", () => {
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    const target = document.createElement("section");
    target.id = "products";
    document.body.appendChild(target);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));

    render(<CatalogueExploreLink href="#products" label="Explore products" />);
    fireEvent.click(screen.getByRole("link", { name: /Explore products/ }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(window.location.hash).toBe("#products");
    target.remove();
  });

  it("uses instant scrolling when reduced motion is preferred", () => {
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    const target = document.createElement("section");
    target.id = "products";
    document.body.appendChild(target);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    render(<CatalogueExploreLink href="#products" label="Explore products" />);
    fireEvent.click(screen.getByRole("link", { name: /Explore products/ }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    target.remove();
  });

  it("passes the selected motion behavior to custom cover navigation", () => {
    const onExplore = vi.fn();
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));

    render(
      <CatalogueExploreLink
        href="#studio-page-2"
        label="Explore products"
        onExplore={onExplore}
      />,
    );
    fireEvent.click(screen.getByRole("link", { name: /Explore products/ }));

    expect(onExplore).toHaveBeenCalledWith("smooth");
  });
});
