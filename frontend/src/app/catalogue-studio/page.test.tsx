import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CatalogueStudioHome from "./page";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  getStudioDesigns: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("@/lib/api", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1" }),
}));
vi.mock("@/lib/access", () => ({ canAccess: () => true }));
vi.mock("@/lib/studio-api", () => ({
  getStudioDesigns: () => mocks.getStudioDesigns(),
}));

const designs = [
  {
    id: "design-1",
    catalogue_id: "catalogue-1",
    name: "Alpha Catalogue",
    status: "draft",
    page_width: 297,
    page_height: 210,
    orientation: "landscape",
    size_preset: "a4_landscape",
    data_mode: "live",
    catalogue_type: "standard",
    brand_mode: "single",
    current_version: 1,
    revision: 4,
    created_at: "2026-08-10T10:00:00+07:00",
    updated_at: "2026-08-17T10:00:00+07:00",
    page_count: 3,
    product_count: 12,
    brand_count: 1,
  },
  {
    id: "design-2",
    catalogue_id: "catalogue-2",
    name: "Beta Promotion",
    status: "published",
    page_width: 210,
    page_height: 297,
    orientation: "portrait",
    size_preset: "a4_portrait",
    data_mode: "snapshot",
    catalogue_type: "promotion",
    brand_mode: "multiple",
    current_version: 2,
    revision: 7,
    created_at: "2026-08-12T10:00:00+07:00",
    updated_at: "2026-08-18T10:00:00+07:00",
    page_count: 5,
    product_count: 20,
    brand_count: 3,
  },
];

describe("Catalogue Studio home", () => {
  beforeEach(() => {
    mocks.replace.mockReset();
    mocks.getStudioDesigns.mockReset();
    mocks.getStudioDesigns.mockResolvedValue(designs);
  });

  it("shows workspace totals and clear open actions", async () => {
    render(<CatalogueStudioHome />);

    expect(await screen.findByRole("link", { name: "Back to Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(await screen.findByRole("link", { name: "Open Alpha Catalogue in Studio" })).toHaveAttribute(
      "href",
      "/catalogue-studio/design-1/editor",
    );
    expect(screen.getByRole("link", { name: "Open Beta Promotion in Studio" })).toBeInTheDocument();

    const summary = screen.getByLabelText("Studio summary");
    expect(within(summary).getByText("Designs")).toBeInTheDocument();
    expect(within(summary).getByText("Published")).toBeInTheDocument();
    expect(within(summary).getByText("32")).toBeInTheDocument();
  });

  it("filters designs instantly by status and search", async () => {
    render(<CatalogueStudioHome />);
    await screen.findByRole("link", { name: "Open Alpha Catalogue in Studio" });

    fireEvent.change(screen.getByLabelText("Filter by status"), { target: { value: "published" } });
    expect(screen.queryByRole("link", { name: "Open Alpha Catalogue in Studio" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Beta Promotion in Studio" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Search designs"), { target: { value: "missing" } });
    expect(screen.getByRole("heading", { name: "No catalogue designs found" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Open Alpha Catalogue in Studio" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Open Beta Promotion in Studio" })).toBeInTheDocument();
    });
  });

  it("uses summary buttons to filter and reveal matching designs", async () => {
    render(<CatalogueStudioHome />);
    await screen.findByRole("link", { name: "Open Alpha Catalogue in Studio" });

    fireEvent.click(screen.getByRole("button", { name: "Show published designs" }));
    expect(screen.queryByRole("link", { name: "Open Alpha Catalogue in Studio" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Beta Promotion in Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by status")).toHaveValue("published");

    fireEvent.click(screen.getByRole("button", { name: "Show all designs" }));
    expect(screen.getByRole("link", { name: "Open Alpha Catalogue in Studio" })).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by status")).toHaveValue("all");
  });
});
