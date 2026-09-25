import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProductCardEditor } from "./product-card-editor";

const api = vi.hoisted(() => ({ get: vi.fn(), versions: vi.fn(), save: vi.fn(), publish: vi.fn(), restore: vi.fn(), templates: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/lib/api", () => ({
  API_ORIGIN: "", getGlobalProductCard: (...args: unknown[]) => api.get(...args),
  getGlobalProductCardVersions: (...args: unknown[]) => api.versions(...args),
  saveGlobalProductCardDraft: (...args: unknown[]) => api.save(...args),
  publishGlobalProductCard: (...args: unknown[]) => api.publish(...args),
  restoreGlobalProductCardVersion: (...args: unknown[]) => api.restore(...args),
}));
vi.mock("@/lib/studio-api", () => ({ getStudioProductCardTemplates: (...args: unknown[]) => api.templates(...args) }));

const detail = { product_id: "p1", code: "M1", name: "Gaming mouse", brand: "EGA", category: "Mouse", primary_image_url: "/uploads/m1.jpg", template_id: null, has_draft: false, is_published: false, draft_revision: 0, active_version: 0, affected_catalogue_count: 1, updated_at: null, draft: {}, published: null, images: [{ id: "i1", url: "/uploads/m1.jpg", alt_text: "Mouse", is_primary: true }], affected_catalogues: [{ id: "c1", title: "EGA Catalogue", status: "published" }], erp_fields: { code: "M1", barcode: "8850001", stock_quantity: 9, price: "370.00", name: "ERP mouse", description: "ERP details" }, published_at: null };

describe("ProductCardEditor", () => {
  it("edits presentation fields while keeping ERP facts locked", async () => {
    api.get.mockResolvedValue(detail); api.versions.mockResolvedValue([]); api.templates.mockResolvedValue([]); api.save.mockResolvedValue({ ...detail, draft_revision: 1, has_draft: true });
    render(<ProductCardEditor productId="p1" />);

    expect(await screen.findByRole("heading", { name: "Locked ERP fields" })).toBeInTheDocument();
    expect(screen.getAllByText("8850001")).toHaveLength(2);
    expect(screen.getAllByText("9")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("English display name"), { target: { value: "Sales mouse" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    const payload = api.save.mock.calls[0][1];
    expect(payload.presentation.display_name).toBe("Sales mouse");
    expect(payload.presentation).not.toHaveProperty("stock_quantity");
    expect(payload.presentation).not.toHaveProperty("barcode");
    expect(payload.presentation).not.toHaveProperty("price");
  });
});
