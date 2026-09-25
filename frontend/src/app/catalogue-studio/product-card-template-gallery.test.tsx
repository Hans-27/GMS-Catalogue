import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StudioProductCardTemplate } from "@/lib/studio-api";
import { ProductCardTemplateGallery } from "./product-card-template-gallery";

const audio = { id: "audio-layout", name: "Audio layout", description: "Wide speaker image", template_type: "erp_detail", card_width: 400, card_height: 250, dimension_unit: "px", border_radius: 10, price_mode: "one_price", is_company_template: true, template_data_json: { includedFields: ["image"], style: {} } } as StudioProductCardTemplate;
const cable = { ...audio, id: "cable-layout", name: "Cable layout", description: "Small accessories" };

describe("Studio card layout search", () => {
  // Catches filtering the wrong data or changing the original template callback.
  it("filters by description and preserves template use and clear-search behavior", () => {
    const onUse = vi.fn();
    render(<ProductCardTemplateGallery templates={[audio, cable]} loading={false} onUse={onUse} onPreview={vi.fn()} onCreateScratch={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search card layouts"), { target: { value: "SPEAKER" } });
    expect(screen.queryByRole("button", { name: "Preview Cable layout" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use Template" }));
    expect(onUse).toHaveBeenCalledWith(audio);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: "Preview Cable layout" })).toBeInTheDocument();
  });

  // Catches a no-results state that exposes a restricted template action.
  it("shows no matches and retains the existing read-only use permission", () => {
    render(<ProductCardTemplateGallery templates={[audio]} loading={false} canUse={false} onUse={vi.fn()} onPreview={vi.fn()} onCreateScratch={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Use Template" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search card layouts"), { target: { value: "unavailable" } });
    expect(screen.getByText("No card layouts match your search.")).toBeInTheDocument();
  });
});
