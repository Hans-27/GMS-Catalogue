import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CatalogueOnlineCover } from "./catalogue-online-cover";

const props = { title: "Example catalogue", productCount: 217, exploreHref: "#products", exploreLabel: "Explore products", productsLabel: "products", fallback: <h1>Generated cover</h1> };

describe("CatalogueOnlineCover", () => {
  it("keeps the existing cover when no upload is published", () => {
    render(<CatalogueOnlineCover {...props} cover={null} />);
    expect(screen.getByRole("heading", { name: "Generated cover" })).toBeVisible();
  });
  it("contains the finished image and retains a print-only fallback", () => {
    render(<CatalogueOnlineCover {...props} cover={{ url: "/api/cover.png", width: 900, height: 1200 }} />);
    expect(screen.getByRole("img")).toHaveAttribute("width", "900");
    expect(screen.getByRole("link")).toHaveAttribute("href", "#products");
    expect(screen.getByText("Generated cover").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("heading", { name: "Generated cover" })).not.toBeInTheDocument();
    expect(screen.getByText("217 products")).toBeVisible();
  });
  it("falls back on image failure and retries when a new cover URL arrives", () => {
    const { rerender } = render(<CatalogueOnlineCover {...props} cover={{ url: "/missing.png", width: 900, height: 1200 }} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByRole("heading")).toHaveTextContent("Generated cover");
    rerender(<CatalogueOnlineCover {...props} cover={{ url: "/replacement.png", width: 900, height: 1200 }} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", expect.stringContaining("/replacement.png"));
  });
  it("opens products within the booklet instead of changing the URL", () => {
    const onExplore = vi.fn();
    render(<CatalogueOnlineCover {...props} onExplore={onExplore} cover={{ url: "/cover.png", width: 900, height: 1200 }} />);
    fireEvent.click(screen.getByRole("link"));
    expect(onExplore).toHaveBeenCalledOnce();
  });
});
