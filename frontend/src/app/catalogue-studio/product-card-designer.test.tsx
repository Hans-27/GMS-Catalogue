import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioProductCardTemplate } from "@/lib/studio-api";
import { ProductCardDesigner } from "./product-card-designer";

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn() }));

vi.mock("@/lib/studio-api", () => ({
  getStudioProductCardTemplates: mocks.list,
  createStudioProductCardTemplate: mocks.create,
  updateStudioProductCardTemplate: mocks.update,
}));

function template(overrides: Partial<StudioProductCardTemplate> = {}): StudioProductCardTemplate {
  return {
    id: "card-1",
    name: "My Product Card",
    description: "",
    template_type: "image_above",
    template_data_json: {
      includedFields: ["image", "code", "name_en", "price"],
      style: { cardLayout: "image_above", backgroundColor: "#FFFFFF", borderColor: "#CFE0D5", borderRadius: 24 },
    },
    card_width: 320,
    card_height: 420,
    border_radius: 24,
    dimension_unit: "px",
    layout_mode: "responsive",
    min_width: 80,
    min_height: 80,
    aspect_ratio: null,
    price_mode: "one_price",
    visibility_scope: "only_me",
    is_company_template: false,
    approval_status: "draft",
    current_version: 1,
    brand_scope_json: [],
    category_scope_json: [],
    thumbnail_storage_key: null,
    owner_user_id: "user-1",
    is_active: true,
    created_at: "2026-08-11",
    updated_at: "2026-08-11",
    ...overrides,
  };
}

describe("ProductCardDesigner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue([]);
    mocks.create.mockResolvedValue(template());
    mocks.update.mockResolvedValue(template());
  });

  it("offers multiple layouts and previews radius changes immediately", async () => {
    const { container } = render(<ProductCardDesigner />);
    expect(await screen.findByRole("button", { name: /Image Above/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /No Price/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Corner radius/i), { target: { value: "24" } });
    expect(container.querySelector("[data-layout]")).toHaveStyle({ borderRadius: "24px" });
  });

  it("saves field bindings and card style as a reusable template", async () => {
    render(<ProductCardDesigner />);
    await screen.findByRole("button", { name: /Image Above/i });
    fireEvent.click(screen.getByRole("button", { name: "Save template" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    const payload = mocks.create.mock.calls[0][0];
    expect(payload.template_data.bindings.name_en).toBe("product.name_en");
    expect(payload.template_data.style.borderRadius).toBe(16);
    expect(await screen.findByText("Product card template saved as your editable copy.")).toBeInTheDocument();
  });

  it("opens a company template and saves it as an editable personal copy", async () => {
    const companyTemplate = template({
      id: "system-blue",
      name: "ERP Specification Blue Card",
      is_company_template: true,
      owner_user_id: null,
      card_width: 520,
      card_height: 340,
      border_radius: 26,
      template_type: "erp_detail",
      template_data_json: {
        includedFields: ["image", "name_en", "code", "barcode", "stock", "price"],
        style: { cardLayout: "erp_detail", backgroundColor: "#F2F7FF", borderColor: "#2563EB", borderRadius: 26 },
        governance: { brandLocked: true, requiredFields: ["image", "name", "code"], lockedStyleKeys: ["fontFamily", "backgroundColor"] },
      },
    });
    mocks.list.mockResolvedValue([companyTemplate]);
    mocks.create.mockResolvedValue(template({ id: "personal-copy", name: "ERP Specification Blue Card Copy" }));

    render(<ProductCardDesigner />);
    fireEvent.click(await screen.findByRole("button", { name: "Open ERP Specification Blue Card" }));

    expect(screen.getByLabelText("Template name")).toHaveValue("ERP Specification Blue Card Copy");
    expect(screen.getByLabelText("Width")).toHaveValue(520);
    expect(screen.getByLabelText("Height")).toHaveValue(340);
    expect(screen.getByText(/Saving creates your editable personal copy/)).toBeInTheDocument();
    expect(screen.getByLabelText("Background")).toBeDisabled();
    expect(screen.getByLabelText("Border")).not.toBeDisabled();
    expect(screen.getByLabelText(/image \(required\)/i)).toBeDisabled();
    expect(screen.getByText(/GMS font, palette and required ERP fields are protected/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save as my copy" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][0].template_data.governance.brandLocked).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("opens and updates a personal template directly", async () => {
    const personalTemplate = template({ id: "personal-card", name: "My Retail Card" });
    mocks.list.mockResolvedValue([personalTemplate]);
    mocks.update.mockResolvedValue(personalTemplate);

    render(<ProductCardDesigner />);
    fireEvent.click(await screen.findByRole("button", { name: "Open My Retail Card" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(
      "personal-card",
      expect.objectContaining({ name: "My Retail Card", change_note: "Updated in Product Card Designer" }),
    ));
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
