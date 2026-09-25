import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductCardManager } from "./product-card-manager";

const getGlobalProductCards = vi.fn();
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/lib/api", () => ({ API_ORIGIN: "", getGlobalProductCards: (...args: unknown[]) => getGlobalProductCards(...args) }));

describe("ProductCardManager", () => {
  it("shows products, global status, catalogue impact and the standalone edit route", async () => {
    getGlobalProductCards.mockResolvedValue({ total: 1, page: 1, page_size: 36, items: [{ product_id: "p1", code: "M1", name: "Gaming mouse", brand: "EGA", category: "Mouse", primary_image_url: "/uploads/m1.jpg", template_id: null, has_draft: true, is_published: true, draft_revision: 2, active_version: 1, affected_catalogue_count: 4, updated_at: null }] });
    render(<ProductCardManager />);

    expect(await screen.findByRole("heading", { name: "Gaming mouse" })).toBeInTheDocument();
    expect(screen.getByText("Published v1")).toBeInTheDocument();
    expect(screen.getByText("4 catalogues")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Edit product card/ })).toHaveAttribute("href", "/product-cards/p1/edit");
    await waitFor(() => expect(getGlobalProductCards).toHaveBeenCalledWith({ q: "", pageSize: 36 }));
  });
});
