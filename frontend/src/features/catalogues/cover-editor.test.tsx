import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CoverEditor } from "@/features/catalogues/cover-editor";
import type { CatalogueCover } from "@/lib/api";
import { applicationBranding } from "@/lib/branding";

const api = vi.hoisted(() => ({
  getCatalogueCover: vi.fn(), updateCatalogueCover: vi.fn(), updateCatalogueCoverAsset: vi.fn(),
  uploadCatalogueCoverAsset: vi.fn(), deleteCatalogueCoverAsset: vi.fn(), resetCatalogueCover: vi.fn(),
  publishCatalogueCover: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api")>()), ...api }));

const cover: CatalogueCover = {
  id: "cover-1", catalogue_id: "catalogue-1", cover_mode: "custom", catalogue_name: "Spring Collection",
  catalogue_year: "2027", subtitle: "New products", company_name: "", collection_name: "",
  background_color: "#164f35", overlay_color: "#081f14", overlay_opacity: 0.28, background_fit: "cover",
  show_catalogue_name: true, show_catalogue_year: true, show_subtitle: true, show_brand_logo: true,
  show_company_logo: false, show_start_button: true, title_color: "#ffffff", title_font_size: 72,
  title_alignment: "left", title_position_x_percent: 10, title_position_y_percent: 68,
  title_width_percent: 80, title_z_index: 20, subtitle_color: "#ffffff", subtitle_font_size: 20,
  subtitle_position_x_percent: 10, subtitle_position_y_percent: 86, cover_alt_text: "Spring cover",
  created_by: null, updated_by: null, created_at: "2026-08-03T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z", assets: [], asset_history: [],
};

describe("CoverEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.updateCatalogueCover.mockImplementation(async (_id, value) => ({ ...cover, ...value }));
    api.getCatalogueCover.mockResolvedValue(cover);
  });

  it("updates the live title, switches modes without duplicate overlays, and saves settings", async () => {
    const onChanged = vi.fn();
    render(<CoverEditor catalogueId="catalogue-1" initialCover={cover} canUpload canEdit canDelete canPublish={false} onChanged={onChanged} onPublishCatalogue={vi.fn().mockResolvedValue(true)} onToast={vi.fn()} />);

    expect(screen.getByRole("img", { name: applicationBranding.companyName })).toHaveAttribute("src", applicationBranding.defaultLogo);

    fireEvent.change(screen.getAllByLabelText("Catalogue name")[0], { target: { value: "Home Collection" } });
    expect(screen.getAllByText("Home Collection").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Cover mode"), { target: { value: "full_image" } });
    expect(screen.getByText("Upload Full cover image")).toBeInTheDocument();
    expect(screen.queryByText("Home Collection")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(api.updateCatalogueCover).toHaveBeenCalledWith("catalogue-1", expect.objectContaining({ catalogue_name: "Home Collection", cover_mode: "full_image", show_catalogue_name: false })));
  });
});
