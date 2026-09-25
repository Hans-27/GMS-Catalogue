import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { CatalogueStudioEditor } from "./studio-editor";
const coverMocks = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), validate: vi.fn() }));

const mocks = vi.hoisted(() => ({ getDesign: vi.fn(), updatePage: vi.fn(), createPage: vi.fn(), deletePage: vi.fn(), reorderPages: vi.fn(), createVersion: vi.fn(), exportDesign: vi.fn(), publishDesign: vi.fn(), unpublishDesign: vi.fn(), getProducts: vi.fn(), getAvailableProducts: vi.fn(), getStudioProduct: vi.fn(), getProductPriceOptions: vi.fn(), getPricingOverview: vi.fn(), getErpPriceLevels: vi.fn(), uploadProductImage: vi.fn(), uploadAsset: vi.fn(), runProductSync: vi.fn(), getErpImages: vi.fn(), importErpImage: vi.fn(), deleteProductImage: vi.fn(), getAssets: vi.fn(), getPromotions: vi.fn(), attachPromotion: vi.fn(), detachPromotion: vi.fn() }));
vi.mock("next/dynamic", () => ({
  default: () => function MockCanvas({ document, cropModeElementId, onSelectMany, onMoveSelection, onProductImageStep, onProductImagePreview, onElementContextMenu }: {
    document: { elements: Array<{ id: string; type?:string; name?: string; zIndex: number; xPercent:number; groupId?:string|null; assetId?:string|null; style:Record<string,unknown> }> };
    cropModeElementId:string|null;
    onSelectMany:(ids:string[], additive:boolean)=>void;
    onMoveSelection:(sourceId:string, deltaX:number, deltaY:number)=>void;
    onProductImageStep:(element:{ id:string; style:Record<string,unknown> },direction:-1|1)=>void;
    onProductImagePreview:(element:{ id:string; style:Record<string,unknown> })=>void;
    onElementContextMenu:(elementId:string,clientX:number,clientY:number)=>void;
  }) {
    const carousel = document.elements.find((element) => element.style.productImageMode === "carousel");
    const image = document.elements.find((element) => element.type === "image");
    return <>
      <div data-testid="studio-canvas">{document.elements.slice().sort((a, b) => b.zIndex - a.zIndex).map((element) => `${element.id}:${element.zIndex}:${element.name || ""}:${element.xPercent}:${String(element.style.backgroundColor || "")}${element.style.productImageId ? `:${String(element.style.productImageId)}` : ""}`).join(",")}</div>
      <output data-testid="studio-groups">{document.elements.map((element) => `${element.id}:${element.groupId || "none"}`).join(",")}</output>
      <output data-testid="crop-mode">{cropModeElementId || "none"}</output>
      <button onClick={() => onSelectMany(["front", "back"], false)}>Mock select both</button>
      <button onClick={() => onMoveSelection("front", 5, 4)}>Mock move selection</button>
      <button disabled={!carousel} onClick={() => carousel && onProductImageStep(carousel, 1)}>Mock next product image</button>
      <button disabled={!carousel} onClick={() => carousel && onProductImagePreview(carousel)}>Mock preview product image</button>
      <button disabled={!image} onClick={() => image && onElementContextMenu(image.id, 100, 100)}>Mock image context menu</button>
    </>;
  },
}));
vi.mock("next/navigation", () => {
  const router = { replace: vi.fn(), push: vi.fn() };
  return { useRouter: () => router };
});
vi.mock("@/lib/access", () => ({ canAccess: () => true }));
vi.mock("@/lib/api", () => ({
  API_ORIGIN: "http://127.0.0.1:8000",
  ApiError: class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } },
  getCurrentUser: vi.fn().mockResolvedValue({ id: "user-1", is_superadmin: true, permissions: [] }),
  getPromotions: mocks.getPromotions,
  attachPromotionToCatalogue: mocks.attachPromotion,
  detachPromotionFromCatalogue: mocks.detachPromotion,
  getProducts: mocks.getProducts,
  deleteProductImage: mocks.deleteProductImage,
  getErpProductImages: mocks.getErpImages,
  getErpCustomerPriceLevels: mocks.getErpPriceLevels,
  importErpProductImage: mocks.importErpImage,
  runProductSync: mocks.runProductSync,
}));
vi.mock("@/lib/studio-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studio-api")>("@/lib/studio-api");
  return {
    ...actual,
    getStudioDesign: mocks.getDesign,
    getStudioAvailableProducts: mocks.getAvailableProducts,
    getStudioProduct: mocks.getStudioProduct,
    getStudioProductPriceOptions: mocks.getProductPriceOptions,
    getStudioPricingOverview: mocks.getPricingOverview,
    uploadStudioProductImage: mocks.uploadProductImage,
    uploadStudioAsset: mocks.uploadAsset,
    createStudioExport: mocks.exportDesign,
    getStudioAssets: mocks.getAssets,
    updateStudioPage: mocks.updatePage,
    createStudioPage: mocks.createPage,
    deleteStudioPage: mocks.deletePage,
    reorderStudioPages: mocks.reorderPages,
    createStudioVersion: mocks.createVersion,
    publishStudioDesign: mocks.publishDesign,
    unpublishStudioDesign: mocks.unpublishDesign,
    saveStudioOnlineCover: coverMocks.save,
    removeStudioOnlineCover: coverMocks.remove,
    validateStudioDesign: coverMocks.validate,
  };
});

const design = {
  id: "design-1", catalogue_id: null, name: "Test Catalogue", status: "draft",
  page_width: 794, page_height: 1123, orientation: "portrait", size_preset: "a4_portrait",
  data_mode: "live", current_version: 0, revision: 1, created_at: "2026-08-11", updated_at: "2026-08-11",
  pages: [{ id: "page-1", design_id: "design-1", page_type: "cover", page_name: "Cover", display_order: 1, width: 794, height: 1123, orientation: "portrait", background_color: "#FFFFFF", is_visible: true, created_at: "2026-08-11", updated_at: "2026-08-11", page_data_json: { pageId: "page-1", pageType: "cover", name: "Cover", canvas: { width: 794, height: 1123, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: true, bleed: 0 }, elements: [
    { id: "front", type: "text", name: "Front layer", xPercent: 0, yPercent: 0, widthPercent: 20, heightPercent: 10, rotation: 0, opacity: 1, zIndex: 20, locked: false, visible: true, style: {}, responsive: {} },
    { id: "back", type: "text", name: "Back layer", xPercent: 0, yPercent: 10, widthPercent: 20, heightPercent: 10, rotation: 0, opacity: 1, zIndex: 10, locked: false, visible: true, style: {}, responsive: {} },
  ], dataMode: "live" } }],
};

describe("CatalogueStudioEditor", () => {
  it("provides a simplified mobile section switcher for pages and content", async () => {
    // Removing the mobile switcher would leave phone users inside the desktop-only canvas controls.
    render(<CatalogueStudioEditor designId="design-1" />);
    await screen.findByText("Saved automatically");
    const mobileSections = screen.getByLabelText("Mobile editor sections");
    expect(mobileSections).toBeInTheDocument();
    fireEvent.click(within(mobileSections).getByRole("button", { name: "Pages", hidden: true }));
    expect(await screen.findByRole("region", { name: "Catalogue page structure" })).toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.getDesign.mockResolvedValue(design);
    coverMocks.validate.mockResolvedValue({ valid: true, errors: [], warnings: [] });
    mocks.updatePage.mockResolvedValue({ ...design, revision: 2 });
    mocks.reorderPages.mockResolvedValue({ ...design, revision: 2 });
    mocks.createVersion.mockResolvedValue({ id: "version-1", design_id: "design-1", version_number: 1, change_summary: "Automatic export snapshot", created_by_id: "user-1", created_at: "2026-08-20" });
    mocks.exportDesign.mockResolvedValue({ id: "export-1", export_type: "print_pdf", status: "queued" });
    mocks.publishDesign.mockResolvedValue({ ...design, status: "published", revision: 3 });
    mocks.unpublishDesign.mockResolvedValue({ ...design, status: "draft", revision: 3 });
    mocks.getProducts.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 20, pages: 0, brands: [] });
    mocks.getAvailableProducts.mockResolvedValue([]);
    mocks.getStudioProduct.mockResolvedValue({ images: [] });
    mocks.getProductPriceOptions.mockResolvedValue({ product: { id: "product-1", sku: "ERP-1", name: "ERP Product", brand: "Brand A" }, options: [] });
    mocks.getPricingOverview.mockResolvedValue({ audiences: [], products: [] });
    mocks.getErpPriceLevels.mockResolvedValue([]);
    mocks.runProductSync.mockResolvedValue({ status: "completed", rows_created: 1, rows_updated: 2, details: { images_imported: 3, images_updated: 4 } });
    mocks.getErpImages.mockResolvedValue([]);
    mocks.importErpImage.mockResolvedValue({});
    mocks.deleteProductImage.mockResolvedValue(undefined);
    mocks.getAssets.mockResolvedValue([]);
    mocks.getPromotions.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 100, pages: 0, summary: {} });
    mocks.attachPromotion.mockResolvedValue({});
    mocks.detachPromotion.mockResolvedValue({});
  });

  it("shows promotions as optional without inserting a blank page", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pages" }));

    expect(screen.getByRole("region", { name: "Catalogue page structure" })).toHaveTextContent("Cover");
    expect(screen.getByRole("region", { name: "Catalogue page structure" })).toHaveTextContent("PromotionsOptional");
    expect(screen.getByText("No promotion is attached. Products will follow the cover with no blank page.")).toBeInTheDocument();
  });

  it("opens Cover page and saves its image without changing printable canvas pages", async () => {
    const cover = { asset_id: "cover-1", file_name: "cover.png", width: 900, height: 1200, url: "/api/cover/content" };
    coverMocks.save.mockResolvedValue({ ...design, revision: 2, online_cover_json: cover });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:cover");
    render(<CatalogueStudioEditor designId="design-1" />);
    await screen.findByText("Test Catalogue");
    fireEvent.click(screen.getByRole("button", { name: "Cover" }));
    const file = new File(["image"], "cover.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Choose cover image"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Save cover" }));
    await waitFor(() => expect(coverMocks.save).toHaveBeenCalledWith("design-1", file, 1));
    expect(await screen.findByText("Cover saved. Publish to update the online catalogue.")).toBeInTheDocument();
    expect(mocks.updatePage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pages" }));
    expect(screen.getByRole("region", { name: "Catalogue page structure" })).toHaveTextContent("Cover");
  });

  it("offers publishing cover changes without taking the existing catalogue offline", async () => {
    const draftCover = { asset_id: "cover-new", file_name: "cover.png", width: 900, height: 1200, url: "/api/cover/content" };
    mocks.getDesign.mockResolvedValue({ ...design, status: "published", online_cover_json: draftCover, published_online_cover_json: { ...draftCover, asset_id: "cover-old" } });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByRole("button", { name: "Publish cover changes" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Unpublish" })).toBeEnabled();
    expect(mocks.unpublishDesign).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Publish cover changes" }));
    await waitFor(() => expect(mocks.publishDesign).toHaveBeenCalledWith("design-1", 1));
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("adds a reusable promotion page after the cover and attaches its catalogue", async () => {
    const promotion = {
      id: "promotion-1", code: "PROMO-1", name_en: "Spring Sale", name_th: "", short_title: "Spring Sale",
      description_en: "Selected offers.", description_th: "", occasion_name: "Seasonal", status: "scheduled",
      start_at: "2026-09-10T00:00:00Z", end_at: "2026-09-30T00:00:00Z", cover_url: null,
      products: [{ product_id: "product-1", product_code: "P-1", product_name: "Product one", brand: "Brand A", promotion_price: "90", currency: "THB", include_in_promotion: true }],
      catalogue_ids: [],
    };
    const linkedDesign = { ...design, catalogue_id: "catalogue-1" };
    const promotionPage = {
      ...design.pages[0], id: "promotion-page", page_type: "promotion", page_name: "Spring Sale", display_order: 2,
      page_data_json: { ...design.pages[0].page_data_json, pageId: "promotion-page", pageType: "promotion", name: "Spring Sale", promotionId: "promotion-1", elements: [] },
    };
    const refreshedDesign = { ...linkedDesign, revision: 2, pages: [...linkedDesign.pages, promotionPage] };
    mocks.getDesign.mockResolvedValueOnce(linkedDesign).mockResolvedValueOnce(refreshedDesign);
    mocks.getPromotions.mockResolvedValue({ items: [promotion], total: 1, page: 1, page_size: 100, pages: 1, summary: {} });
    mocks.createPage.mockResolvedValue(promotionPage);
    mocks.attachPromotion.mockResolvedValue({ ...promotion, catalogue_ids: ["catalogue-1"] });

    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pages" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
    expect(await screen.findByText("Spring Sale")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use" }));

    await waitFor(() => expect(mocks.createPage).toHaveBeenCalledWith("design-1", expect.objectContaining({
      page_type: "promotion",
      page_data: expect.objectContaining({ promotionId: "promotion-1" }),
    })));
    expect(mocks.attachPromotion).toHaveBeenCalledWith("promotion-1", "catalogue-1");
    expect(await screen.findByText("Spring Sale promotion page added after the cover.")).toBeInTheDocument();
  });

  it("adds one page at a time and keeps inactive pages lightweight", async () => {
    const addedPage = {
      ...design.pages[0],
      id: "page-2",
      page_type: "blank",
      page_name: "Blank page",
      display_order: 2,
      page_data_json: { ...design.pages[0].page_data_json, pageId: "page-2", pageType: "blank", name: "Blank page", elements: [] },
    };
    const refreshedDesign = { ...design, revision: 2, pages: [...design.pages, addedPage] };
    mocks.getDesign.mockResolvedValueOnce(design).mockResolvedValueOnce(refreshedDesign);
    mocks.createPage.mockResolvedValue(addedPage);
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pages" }));
    fireEvent.click(screen.getByRole("button", { name: "Add blank" }));

    await waitFor(() => expect(mocks.createPage).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Blank page added.")).toBeInTheDocument();
    expect(screen.getAllByTestId("studio-canvas")).toHaveLength(1);
    expect(globalThis.document.getElementById("studio-editor-static-page-page-1")).toBeInTheDocument();
  });

  it("loads a saved design and exposes the download formats", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    expect(screen.getByTestId("studio-canvas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(screen.getByRole("button", { name: /Print PDF/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /JPEG/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Print PDF/i }));
    await waitFor(() => expect(mocks.exportDesign).toHaveBeenCalledWith("design-1", "print_pdf", expect.objectContaining({ include_cover: true }), "version-1"));
  });

  it("applies one customer link using a different brand mapping for each product", async () => {
    const pageOne = {
      ...design.pages[0],
      page_type: "product",
      page_name: "Brand A",
      page_data_json: {
        ...design.pages[0].page_data_json,
        elements: [{ ...design.pages[0].page_data_json.elements[0], id: "card-a", type: "product_card", productId: "product-a", style: { productPrice: "" } }],
      },
    };
    const pageTwo = {
      ...pageOne,
      id: "page-2",
      page_name: "Brand B",
      display_order: 2,
      page_data_json: {
        ...pageOne.page_data_json,
        pageId: "page-2",
        name: "Brand B",
        elements: [{ ...pageOne.page_data_json.elements[0], id: "card-b", productId: "product-b" }],
      },
    };
    const multiBrandDesign = {
      ...design,
      pages: [pageOne, pageTwo],
      product_items: [
        { id: "item-a", product_id: "product-a", display_order: 1, is_visible: true, hidden_reason: "", selected_video_id: null },
        { id: "item-b", product_id: "product-b", display_order: 2, is_visible: true, hidden_reason: "", selected_video_id: null },
      ],
    };
    const revisionTwo = { ...multiBrandDesign, revision: 2 };
    mocks.getDesign.mockReset().mockResolvedValueOnce(multiBrandDesign).mockResolvedValueOnce(revisionTwo);
    mocks.updatePage.mockReset()
      .mockResolvedValueOnce(revisionTwo)
      .mockResolvedValueOnce({ ...multiBrandDesign, revision: 3 })
      .mockResolvedValueOnce({ ...multiBrandDesign, revision: 4 });
    mocks.getPricingOverview.mockResolvedValue({
      audiences: [{ id: 1, code: "normal", name: "Normal", show_prices: true }],
      products: [
        { id: "product-a", sku: "A-1", name: "Product A", brand: "Brand A", options: [{ customer_level_id: 1, customer_level_code: "normal", customer_level_name: "Normal", price_list_id: 11, price_list_code: "A-SP1", price_list_name: "Brand A Normal", erp_source_code: "A-SP1", amount: "125.00", currency: "THB", mapping_source: "brand", is_brand_override: true, show_prices: true, status: "ready" }] },
        { id: "product-b", sku: "B-1", name: "Product B", brand: "Brand B", options: [{ customer_level_id: 1, customer_level_code: "normal", customer_level_name: "Normal", price_list_id: 22, price_list_code: "B-SRP", price_list_name: "Brand B Retail", erp_source_code: "B-SRP", amount: "210.00", currency: "THB", mapping_source: "brand", is_brand_override: true, show_prices: true, status: "ready" }] },
      ],
    });

    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("2 brands ready")).toBeInTheDocument();
    const applyButton = screen.getByRole("button", { name: "Apply to catalogue" });
    await waitFor(() => expect(applyButton).toBeEnabled());
    fireEvent.click(applyButton);

    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledTimes(3));
    const firstMappedPage = mocks.updatePage.mock.calls[1][2].page_data;
    const secondMappedPage = mocks.updatePage.mock.calls[2][2].page_data;
    expect(firstMappedPage.elements[0].style).toMatchObject({ primaryPriceListId: 11, productPrice: "THB 125.00", pricingMappingSource: "brand" });
    expect(secondMappedPage.elements[0].style).toMatchObject({ primaryPriceListId: 22, productPrice: "THB 210.00", pricingMappingSource: "brand" });
  });

  it("retains product search when the integrated tool panel is collapsed and reopened", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    await screen.findByText("Test Catalogue");
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    fireEvent.change(screen.getByLabelText("Find product"), { target: { value: "adapter" } });
    fireEvent.click(screen.getByRole("button", { name: "Collapse tool panel" }));
    expect(screen.getByLabelText("Find product")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    expect(screen.getByLabelText("Find product")).toBeVisible();
    expect(screen.getByLabelText("Find product")).toHaveValue("adapter");
    expect(mocks.updatePage).not.toHaveBeenCalled();
  });

  it("keeps common editor tools visible and moves technical tools into a secondary section", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    expect(screen.getByRole("navigation", { name: "Studio tools" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Products" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elements" })).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: "Card layouts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uploads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pages" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    expect(screen.getByText("Catalogue products")).toBeInTheDocument();
    expect(screen.getByText("Choose ERP products for this page.")).toBeInTheDocument();

    const moreTools = screen.getByRole("button", { name: "More tools" });
    fireEvent.click(moreTools);
    expect(moreTools).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(moreTools).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("heading", { name: "Layers" })).toBeInTheDocument();
  });

  it("adds a standalone draggable download icon from the Elements panel", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    await screen.findByText("Test Catalogue");

    fireEvent.click(screen.getByRole("button", { name: "⇩ Download" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Download button");
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("Download button");
  });

  it("renames the selected page from the Pages panel", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    await screen.findByText("Test Catalogue");
    fireEvent.click(screen.getByRole("button", { name: "Pages" }));

    const pageName = screen.getByLabelText("Rename selected page");
    fireEvent.change(pageName, { target: { value: "Summer Chairs" } });
    fireEvent.blur(pageName);

    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_name: "Summer Chairs",
      page_data: expect.objectContaining({ name: "Summer Chairs" }),
    })));
  });

  it("deletes the active page immediately and selects its neighbour", async () => {
    const secondPage = structuredClone(design.pages[0]);
    secondPage.id = "page-2";
    secondPage.page_name = "Page 2";
    secondPage.page_type = "blank";
    secondPage.display_order = 2;
    secondPage.page_data_json.pageId = "page-2";
    secondPage.page_data_json.name = "Page 2";
    const twoPageDesign = { ...design, pages: [design.pages[0], secondPage] };
    mocks.getDesign.mockResolvedValue(twoPageDesign);
    mocks.deletePage.mockResolvedValue({ ...design, pages: [secondPage], revision: 2 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<CatalogueStudioEditor designId="design-1" />);
    await screen.findByText("Test Catalogue");
    fireEvent.click(screen.getByRole("button", { name: "Pages" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByLabelText("Rename selected page")).toHaveValue("Page 2");
    await waitFor(() => expect(mocks.deletePage).toHaveBeenCalledWith("design-1", "page-1", 1));
    expect(await screen.findByText("Cover was deleted.")).toBeInTheDocument();
    confirm.mockRestore();
  });

  it("allows the active page to be resized while explaining A4 output", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    await screen.findByText("Test Catalogue");

    expect(screen.getByRole("button", { name: "Drag to resize page width and height" })).toBeInTheDocument();
    expect(screen.getByLabelText("Canvas width")).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("Canvas height")).not.toHaveAttribute("readonly");
    expect(screen.getByText(/Print and PDF output scale the complete design to exact A4/)).toBeInTheDocument();
  });

  it("unpublishes a published design after confirmation", async () => {
    mocks.getDesign.mockResolvedValue({ ...design, status: "published" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByRole("button", { name: "Unpublish" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));

    await waitFor(() => expect(mocks.unpublishDesign).toHaveBeenCalledWith("design-1", 1));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("customer catalogue links will be disabled"));
    expect(await screen.findByRole("button", { name: "Publish" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it("shows only the publication action that is valid for the current design", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);

    expect(await screen.findByRole("button", { name: "Publish" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Unpublish" })).not.toBeInTheDocument();
  });

  it("renders every page in one continuous stack with only one active editor canvas", async () => {
    const secondPage = JSON.parse(JSON.stringify(design.pages[0]));
    secondPage.id = "page-2";
    secondPage.page_name = "Product Grid";
    secondPage.page_type = "product_grid";
    secondPage.display_order = 2;
    secondPage.page_data_json.pageId = "page-2";
    secondPage.page_data_json.pageType = "product_grid";
    secondPage.page_data_json.name = "Product Grid";
    secondPage.page_data_json.elements = [{
      ...JSON.parse(JSON.stringify(design.pages[0].page_data_json.elements[0])),
      id: "page-two-element",
      name: "Page two product",
    }];
    mocks.getDesign.mockResolvedValue({ ...design, pages: [design.pages[0], secondPage] });

    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    expect(screen.queryByText(/drag an element through the lower edge/i)).not.toBeInTheDocument();
    const canvases = screen.getAllByTestId("studio-canvas");
    expect(canvases).toHaveLength(1);
    const staticSecondPage = globalThis.document.getElementById("studio-editor-static-page-page-2");
    expect(staticSecondPage).toBeInTheDocument();
    expect(staticSecondPage?.querySelector('[data-studio-element-id="page-two-element"]')).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.click(staticSecondPage!);
    await waitFor(() => expect(screen.getByText("2 / 2")).toBeInTheDocument());
    expect(screen.getAllByTestId("studio-canvas")).toHaveLength(1);
  });

  it("offers text with or without a background before adding it", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /T Text/ }));
    expect(screen.getByRole("dialog", { name: "Choose a text style" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Text without background" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Text without background");
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("Text without background");
    expect(screen.queryByRole("dialog", { name: "Choose a text style" })).not.toBeInTheDocument();
  });

  it("creates a polished product card from synchronized ERP product data", async () => {
    const erpProduct = {
      id: "product-1", sku: "ERP-1", erp_name: "ERP Product", display_name: "ERP Product",
      name_en: "ERP Product", name_th: "สินค้า ERP", description_en: "A synchronized ERP description.", description_th: null,
      how_to_use: null, remark: null, brand: "Brand A", category: "Category A", category_names: ["Category A"],
      barcode: "8859790002006", stock_quantity: 18, unit: "PCS", pack_size: 1, warranty: "1 year",
      price: "340.00", price_currency: "THB", prices: { "1": { amount: "340.00", currency: "THB", price_list_id: 19, display_label: "Normal" } },
      primary_image_url: "/erp-front.webp", image_urls: ["/erp-front.webp", "/erp-side.webp"], images: [
        { id: "image-1", url: "/erp-front.webp", file_name: "erp-front.webp", alt_text: "ERP Product front", is_primary: true, sort_order: 0 },
        { id: "image-2", url: "/erp-side.webp", file_name: "erp-side.webp", alt_text: "ERP Product side", is_primary: false, sort_order: 1 },
      ], has_video: false, product_status: "active", already_used: false, catalogue_visible: true, last_synchronized_at: "2026-08-19T04:00:00Z",
    };
    mocks.getAvailableProducts.mockResolvedValue([erpProduct]);
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /PC Product card/ }));
    expect(screen.getByRole("dialog", { name: "Add ERP product card" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Horizontal/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Add ERP Product product card" }));

    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("ERP Product");
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "product_card", productId: "product-1", widthPercent: 58, heightPercent: 31,
        style: expect.objectContaining({
          cardLayout: "image_left", productName: "ERP Product", productPrice: "THB 340.00",
          productBrand: "Brand A", productCategory: "Category A", productBarcode: "8859790002006",
          productStock: 18, productImageId: "image-1", productImageCount: 2,
          showProductDescription: true, borderRadius: 20, shadowBlur: 15,
        }),
      })]) }),
    })));
  });

  it("offers a reusable shape library and adds the selected shape", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Shape/ }));
    expect(screen.getByRole("dialog", { name: "Choose a shape" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Rounded rectangle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Circle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Divider" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Circle" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Circle");
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("Circle");
    expect(screen.queryByRole("dialog", { name: "Choose a shape" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "shape",
        name: "Circle",
        style: expect.objectContaining({ shapePreset: "circle", borderRadius: 90 }),
      })]) }),
    })));
  });

  it("adds a visible line and saves its thickness, colour, and style", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Line$/ }));
    expect(screen.getByLabelText("Name")).toHaveValue("Line");
    expect(screen.getByLabelText("Line thickness")).toHaveValue("4");
    fireEvent.change(screen.getByLabelText("Line thickness"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Line style"), { target: { value: "dashed" } });
    fireEvent.change(screen.getByLabelText("Line colour"), { target: { value: "#CC5500" } });
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));

    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "line",
        widthPercent: 40,
        heightPercent: 3,
        style: expect.objectContaining({ lineThickness: 12, lineColor: "#CC5500", lineStyle: "dashed" }),
      })]) }),
    }))); 
  });

  it("adds the current page number to the page and keeps it dynamically bound", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Page number$/ }));
    expect(screen.getByLabelText("Name")).toHaveValue("Page number");
    expect(screen.getByLabelText("Data binding")).toHaveValue("{{page.number}}");
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));

    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "page_number",
        text: "1",
        binding: "{{page.number}}",
        xPercent: 84,
        yPercent: 88,
      })]) }),
    })));
  });

  it("uploads and binds a video dropped into the selected video element", async () => {
    mocks.uploadAsset.mockResolvedValue({
      id: "video-asset-1",
      asset_type: "product_video",
      original_filename: "catalogue-demo.mp4",
      mime_type: "video/mp4",
      file_size: 2048,
      width: null,
      height: null,
      alt_text: "",
      tags: [],
      url: "/api/v1/catalogue-studio/assets/video-asset-1/content",
      created_at: "2026-08-19T10:00:00+07:00",
    });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Video/ }));
    const dropZone = screen.getByText("Drop MP4 or WebM here").closest("label");
    expect(dropZone).not.toBeNull();
    expect(screen.getByLabelText("Choose video file")).toHaveAttribute("accept", expect.stringContaining("video/mp4"));

    const file = new File(["video-bytes"], "catalogue-demo.mp4", { type: "video/mp4" });
    fireEvent.drop(dropZone!, { dataTransfer: { files: [file] } });

    await waitFor(() => expect(mocks.uploadAsset).toHaveBeenCalledWith(file, "product_video", "catalogue-demo.mp4"));
    await waitFor(() => expect(screen.getByTestId("studio-canvas")).toHaveTextContent("catalogue-demo.mp4"));
    expect(screen.getByText("Attached: catalogue-demo.mp4")).toBeInTheDocument();
  });

  it("resizes both side panels by dragging or using the keyboard and resets on double-click", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    const leftResize = screen.getByRole("separator", { name: "Resize Elements panel" });
    const rightResize = screen.getByRole("separator", { name: "Resize Properties panel" });
    expect(leftResize).toHaveAttribute("aria-valuenow", "348");
    expect(rightResize).toHaveAttribute("aria-valuenow", "300");
    fireEvent.pointerDown(leftResize, { clientX: 260 });
    fireEvent.pointerMove(window, { clientX: 340 });
    fireEvent.pointerUp(window);
    expect(leftResize).toHaveAttribute("aria-valuenow", "428");
    expect(leftResize.parentElement).toHaveStyle({ "--studio-left-panel-width": "428px" });
    fireEvent.keyDown(rightResize, { key: "ArrowLeft" });
    expect(rightResize).toHaveAttribute("aria-valuenow", "316");
    fireEvent.doubleClick(leftResize);
    expect(leftResize).toHaveAttribute("aria-valuenow", "348");
    expect(window.localStorage.getItem("catalogue-studio-left-panel-width")).toBe("348");
  });

  it("moves layers forward and backward from the Layers panel", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByText(/Drag layers up/)).toBeInTheDocument();
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("front:20:Front layer:0:,back:10:Back layer:0:");
    fireEvent.click(screen.getByRole("button", { name: "Move Back layer forward" }));
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("back:2:Back layer:0:,front:1:Front layer:0:");
    expect(screen.getByRole("button", { name: "Select layer Back layer" })).toBeInTheDocument();
  });

  it("locks and unlocks a layer directly from the Layers panel", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));

    const lockButton = screen.getByRole("button", { name: "Lock Front layer" });
    fireEvent.click(lockButton);
    expect(screen.getByRole("button", { name: "Unlock Front layer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Front layer backward" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Unlock Front layer" }));
    expect(screen.getByRole("button", { name: "Lock Front layer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Front layer backward" })).toBeEnabled();
  });

  it("groups a drag-selected set and moves every grouped part together", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select parts" }));
    expect(screen.getByRole("button", { name: "Cancel selection" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mock select both" }));
    expect(screen.getByRole("button", { name: "Select parts" })).toBeInTheDocument();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Group" })[0]);
    expect(screen.getByTestId("studio-groups")).not.toHaveTextContent("front:none");
    expect(screen.getByTestId("studio-groups")).not.toHaveTextContent("back:none");
    fireEvent.click(screen.getByRole("button", { name: "Mock move selection" }));
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("front:20:Front layer:5:");
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("back:10:Back layer:5:");
    fireEvent.click(screen.getAllByRole("button", { name: "Ungroup" })[0]);
    expect(screen.getByTestId("studio-groups")).toHaveTextContent("front:none,back:none");
  });

  it("selects multiple layers with Ctrl-click before grouping", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));

    fireEvent.click(screen.getByRole("button", { name: "Select layer Front layer" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer Back layer" }), { ctrlKey: true });

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Group" })[0]);
    expect(screen.getByTestId("studio-groups")).not.toHaveTextContent("front:none");
    expect(screen.getByTestId("studio-groups")).not.toHaveTextContent("back:none");
  });

  it("applies general Properties changes to the selected canvas element", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer Front layer" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Updated headline" } });
    fireEvent.change(screen.getByLabelText("X %"), { target: { value: "12.5" } });
    const hexInput = screen.getAllByDisplayValue("#FFFFFF").find((control) => (control as HTMLInputElement).type === "text");
    expect(hexInput).toBeTruthy();
    fireEvent.change(hexInput!, { target: { value: "#DDEEFF" } });
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("front:20:Updated headline:12.5:#DDEEFF");
    expect(screen.getByText("Changes pending")).toBeInTheDocument();
  });

  it("configures a shadow for shapes and other Studio elements", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer Front layer" }));
    fireEvent.change(screen.getByLabelText("Shadow blur"), { target: { value: "18" } });
    expect(screen.getByLabelText("Horizontal offset")).toHaveValue(0);
    expect(screen.getByLabelText("Vertical offset")).toHaveValue(3);
    fireEvent.change(screen.getByLabelText("Horizontal offset"), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText("Vertical offset"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Shadow opacity"), { target: { value: "45" } });
    expect(screen.getByLabelText("Shadow opacity")).toHaveValue("45");
    fireEvent.click(screen.getByRole("button", { name: "Remove shadow" }));
    expect(screen.queryByLabelText("Horizontal offset")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Shadow blur")).toHaveValue("0");
  });

  it("provides non-destructive crop, rotate, flip, fit, and reset tools for images", async () => {
    const imageElement = { id: "image-layer", type: "image", name: "ERP image", xPercent: 10, yPercent: 10, widthPercent: 30, heightPercent: 30, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { objectFit: "contain", cropZoom: 100, cropX: 50, cropY: 50, imageRotation: 0, flipX: false, flipY: false }, responsive: {} };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, imageElement] } }],
    });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer ERP image" }));
    fireEvent.click(screen.getByRole("button", { name: "Drag to crop" }));
    expect(screen.getByTestId("crop-mode")).toHaveTextContent("image-layer");
    expect(screen.getByRole("button", { name: "Finish cropping" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Finish cropping" }));
    expect(screen.getByTestId("crop-mode")).toHaveTextContent("none");
    fireEvent.change(screen.getByLabelText("Crop zoom"), { target: { value: "175" } });
    expect(screen.getByLabelText("Crop zoom")).toHaveValue("175");
    fireEvent.change(screen.getByLabelText("Horizontal crop"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Vertical crop"), { target: { value: "75" } });
    fireEvent.click(screen.getByRole("button", { name: "Rotate image right" }));
    fireEvent.click(screen.getByRole("button", { name: "↔ Flip horizontal" }));
    expect(screen.getByRole("button", { name: "↔ Flip horizontal" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Fill frame" }));
    expect(screen.getByLabelText("Image fit")).toHaveValue("cover");
    fireEvent.click(screen.getByRole("button", { name: "Reset image" }));
    expect(screen.getByLabelText("Crop zoom")).toHaveValue("100");
    expect(screen.getByLabelText("Horizontal crop")).toHaveValue("50");
    expect(screen.getByLabelText("Vertical crop")).toHaveValue("50");
    expect(screen.getByLabelText("Image fit")).toHaveValue("contain");
    expect(screen.getByRole("button", { name: "↔ Flip horizontal" })).toHaveAttribute("aria-pressed", "false");
  });

  it("starts and finishes image cropping from the right-click menu", async () => {
    const imageElement = { id: "context-image", type: "image", name: "Catalogue image", assetId: "asset-1", xPercent: 10, yPercent: 10, widthPercent: 30, heightPercent: 30, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { objectFit: "contain", cropZoom: 100, cropX: 50, cropY: 50 }, responsive: {} };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, imageElement] } }],
    });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mock image context menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Crop image/ }));
    expect(screen.getByTestId("crop-mode")).toHaveTextContent("context-image");
    expect(screen.getByLabelText("Image fit")).toHaveValue("cover");
    expect(screen.queryByRole("menu", { name: "Element actions" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mock image context menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Finish cropping/ }));
    expect(screen.getByTestId("crop-mode")).toHaveTextContent("none");
  });

  it("shows and adds the selected product's exact mapped ERP price", async () => {
    const productCard = { id: "price-card", type: "product_card", name: "ERP Product", productId: "product-1", xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { productName: "ERP Product", productSku: "ERP-1" }, responsive: {} };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, productCard] } }],
    });
    mocks.getProductPriceOptions.mockResolvedValue({ product: { id: "product-1", sku: "ERP-1", name: "ERP Product", brand: "Brand A" }, options: [{ customer_level_id: 1, customer_level_code: "NORMAL", customer_level_name: "Normal", price_list_id: 19, price_list_code: "SP1", price_list_name: "SP1", amount: "45.00", currency: "THB", is_custom_mapping: true }] });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Price" }));
    expect(screen.getByRole("dialog", { name: "Select customer level" })).toBeInTheDocument();
    expect(await screen.findByText("THB 45.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select Normal price" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Normal price");
    expect(screen.getByLabelText("Data binding")).toHaveValue("{{product.price_list_19}}");
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("Normal price");
  });

  it("shows every authorized ERP customer level and lets the user apply it to a product card", async () => {
    const productCard = { id: "price-slot-card", type: "product_card", name: "ERP Product", productId: "product-1", xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { productName: "ERP Product", productSku: "ERP-1" }, responsive: {} };
    mocks.getDesign.mockResolvedValue({
      ...design,
      price_slots: [{ id: "slot-1", slot_number: 1, price_list_id: 1, display_label: "Price 1", currency_display: "code", decimal_places: 2, is_visible: true }],
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, productCard] } }],
    });
    mocks.getErpPriceLevels.mockResolvedValue([{ id: 1, erp_price_type_id: 19, source_code: "SP1", source_name: "SP1", price_list_id: 1, price_list_code: "NORMAL", price_list_name: "Normal", product_count: 22365, sort_order: 1, is_active: true, last_synced_at: "2026-08-19T03:51:54Z" }]);
    mocks.getStudioProduct.mockResolvedValue({ id: "product-1", sku: "ERP-1", erp_name: "ERP Product", display_name: "ERP Product", prices: { "1": { amount: "45.00", currency: "THB", price_list_id: 1, display_label: "Price 1" } }, images: [] });
    mocks.getProductPriceOptions.mockResolvedValue({ product: { id: "product-1", sku: "ERP-1", name: "ERP Product", brand: "Brand A" }, options: [{ customer_level_id: 1, customer_level_code: "NORMAL", customer_level_name: "Normal", price_list_id: 1, price_list_code: "SP1", price_list_name: "Normal", amount: "45.00", currency: "THB", is_custom_mapping: true }] });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Prices" }));
    expect(await screen.findByText("SP1")).toBeInTheDocument();
    expect(screen.getByText("THB 45.00")).toBeInTheDocument();
    expect(screen.getAllByText("Normal").length).toBeGreaterThan(0);
    expect(screen.getByText(/22,365 ERP products/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use in card" }));
    expect(screen.getByLabelText("Primary price")).toHaveValue("THB 45.00");
  });

  it("lets the user choose a product before choosing its customer-level price", async () => {
    const productCards = [
      { id: "price-card-1", type: "product_card", name: "First Product", productId: "product-1", xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { productName: "First Product", productSku: "ERP-1" }, responsive: {} },
      { id: "price-card-2", type: "product_card", name: "Second Product", productId: "product-2", xPercent: 40, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 31, locked: false, visible: true, style: { productName: "Second Product", productSku: "ERP-2" }, responsive: {} },
    ];
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, ...productCards] } }],
    });
    mocks.getProductPriceOptions.mockResolvedValue({ product: { id: "product-2", sku: "ERP-2", name: "Second Product", brand: "Brand B" }, options: [{ customer_level_id: 2, customer_level_code: "VIP", customer_level_name: "VIP BKK", price_list_id: 4479, price_list_code: "SP2", price_list_name: "SP2", amount: "46.00", currency: "THB", is_custom_mapping: false }] });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Price" }));
    fireEvent.change(screen.getByLabelText("Product for price"), { target: { value: "product-2" } });
    await waitFor(() => expect(mocks.getProductPriceOptions).toHaveBeenCalledWith("design-1", "product-2"));
    expect(await screen.findByText("THB 46.00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select VIP BKK price" }));
    expect(screen.getByLabelText("Name")).toHaveValue("VIP BKK price");
    expect(screen.getByLabelText("Data binding")).toHaveValue("{{product.price_list_4479}}");
  });

  it("binds a standalone barcode element to the selected product's ERP barcode", async () => {
    const productCard = { id: "barcode-card", type: "product_card", name: "ERP Product", productId: "product-1", xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { productName: "ERP Product", productSku: "ERP-1" }, responsive: {} };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, productCard] } }],
    });
    mocks.getStudioProduct.mockResolvedValue({ id: "product-1", sku: "ERP-1", display_name: "ERP Product", erp_name: "ERP Product", barcode: "8859790002006", images: [] });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "BC Barcode" }));
    expect(screen.getByRole("dialog", { name: "Add product barcode" })).toBeInTheDocument();
    expect(await screen.findByText("8859790002006")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add ERP barcode" }));
    expect(screen.getByLabelText("Name")).toHaveValue("ERP Product barcode");
    expect(screen.getByLabelText("Data binding")).toHaveValue("{{product.barcode}}");
    expect(screen.getByLabelText("ERP barcode")).toHaveValue("8859790002006");
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("ERP Product barcode");
  });

  it("generates a standalone editable barcode from a user value", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "BC Barcode" }));
    fireEvent.change(screen.getByLabelText("Barcode value to generate"), { target: { value: "GMS-2026-001" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate barcode" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Generated barcode");
    expect(screen.getByLabelText("Generated barcode value")).toHaveValue("GMS-2026-001");
    fireEvent.change(screen.getByLabelText("Generated barcode value"), { target: { value: "GMS-2026-002" } });
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));

    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "barcode",
        text: "GMS-2026-002",
        target: "GMS-2026-002",
        style: expect.objectContaining({ barcodeSource: "manual", barcodeValue: "GMS-2026-002" }),
      })]) }),
    })));
  });

  it("adds the selected product's synchronized ERP image from the Elements panel", async () => {
    const productCard = { id: "image-card", type: "product_card", name: "ERP Product", productId: "product-1", xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { productName: "ERP Product", productSku: "ERP-1" }, responsive: {} };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, productCard] } }],
    });
    mocks.getStudioProduct.mockResolvedValue({ id: "product-1", sku: "ERP-1", display_name: "ERP Product", erp_name: "ERP Product", primary_image_url: "/erp-primary.webp", barcode: "8859790002006", images: [{ id: "erp-image-1", url: "/erp-primary.webp", file_name: "ERP-1-primary.webp", alt_text: "ERP Product", is_primary: true, sort_order: 0 }, { id: "erp-image-2", url: "/erp-side.webp", file_name: "ERP-1-side.webp", alt_text: "ERP Product side", is_primary: false, sort_order: 1 }] });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "IM Image" }));
    expect(screen.getByRole("dialog", { name: "Add product image" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Select ERP image ERP-1-side.webp" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select ERP image ERP-1-side.webp" }));
    fireEvent.click(screen.getByRole("button", { name: "Add selected ERP image" }));
    expect(screen.getByLabelText("Name")).toHaveValue("ERP Product · ERP image");
    expect(screen.getByLabelText("Data binding")).toHaveValue("{{product.image}}");
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("ERP Product · ERP image");
  });

  it("shows Product Master names instead of carousel layer names in product dropdowns", async () => {
    const carousel = (id: string, productId: string, name: string) => ({ id, type: "image_carousel", name, productId, xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: {}, responsive: {}, carousel: { productIds: [productId], images: [] } });
    mocks.getDesign.mockResolvedValue({ ...design, pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [carousel("one", "product-1", "Product Image Carousel"), carousel("two", "product-2", "Product Image Carousel copy")] } }] });
    mocks.getAvailableProducts.mockResolvedValue([
      { id: "product-1", sku: "A-1", display_name: "First Product", erp_name: "First Product" },
      { id: "product-2", sku: "B-2", display_name: "Second Product", erp_name: "Second Product" },
    ]);
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "IM Image" }));
    expect(await screen.findByRole("option", { name: "First Product · A-1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Second Product · B-2" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Product Image Carousel copy" })).not.toBeInTheDocument();
  });

  it("builds a saved table from the selected product's current ERP information and prices", async () => {
    const productCard = { id: "table-card", type: "product_card", name: "ERP Product", productId: "product-1", xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { productName: "ERP Product", productSku: "ERP-1" }, responsive: {} };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, productCard] } }],
    });
    mocks.getStudioProduct.mockResolvedValue({
      id: "product-1", sku: "ERP-1", erp_name: "ERP Product", display_name: "ERP Product", name_en: "ERP Product", name_th: "สินค้า ERP",
      description_en: "ERP description", description_th: null, how_to_use: null, remark: null, brand: "Brand A", category: "Accessories", category_names: ["Accessories"],
      barcode: "8859790002006", barcodes: ["8859790002006", "8859790002013"], unit: "PCS", pack_size: 12, warranty: "1 year", stock_quantity: 48, price: "45.00", price_currency: "THB", prices: {},
      primary_image_url: null, image_urls: [], images: [], has_video: false, product_status: "active", already_used: true, catalogue_visible: true, last_synchronized_at: "2026-08-14T10:00:00+07:00",
    });
    mocks.getProductPriceOptions.mockResolvedValue({ product: { id: "product-1", sku: "ERP-1", name: "ERP Product", brand: "Brand A" }, options: [
      { customer_level_id: 1, customer_level_code: "NORMAL", customer_level_name: "Normal", price_list_id: 19, price_list_code: "SP1", price_list_name: "SP1", amount: "45.00", currency: "THB", is_custom_mapping: true },
      { customer_level_id: 2, customer_level_code: "VIP", customer_level_name: "VIP BKK", price_list_id: 4479, price_list_code: "SP2", price_list_name: "SP2", amount: "42.50", currency: "THB", is_custom_mapping: true },
    ] });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TB Table" }));
    expect(screen.getByRole("dialog", { name: "Add a table" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText((_, node) => node?.tagName === "SMALL" && node.textContent?.includes("Stock 48") === true)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Code, barcode & stock/ }));
    expect(screen.getByText(/ERP-1 \| 8859790002006 \| 48/)).toBeInTheDocument();
    expect(screen.getByText(/ERP-1 \| 8859790002013 \| 48/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Customer prices/ }));
    expect(screen.getByText(/VIP BKK \| SP2 \| THB 42.50/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add ERP table" }));
    expect(screen.getByLabelText("Name")).toHaveValue("ERP Product · ERP Customer prices");
    expect(screen.getByLabelText("Data binding")).toHaveValue("{{product.erp_table_prices}}");
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "table", productId: "product-1", binding: "{{product.erp_table_prices}}",
        text: expect.stringContaining("VIP BKK | SP2 | THB 42.50"),
        style: expect.objectContaining({ tableSource: "erp", tablePreset: "prices", productSku: "ERP-1", backgroundColor: null, borderWidth: 0 }),
      })]) }),
    })));
    const savedDocument = mocks.updatePage.mock.calls.at(-1)?.[2]?.page_data;
    expect(savedDocument.elements.map((element: { id: string }) => element.id)).toEqual(expect.arrayContaining(["front", "back", "table-card"]));
    expect(savedDocument.elements).toHaveLength(4);
  });

  it("adds an editable blank table without requiring an ERP product", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TB Table" }));
    expect(screen.getByRole("dialog", { name: "Add a table" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Blank table/ }));
    expect(screen.getByLabelText("Name")).toHaveValue("Blank table");
    expect(screen.getByLabelText("Row 1, column 1")).toHaveValue("");
    expect(screen.getByLabelText("Row 3, column 3")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "table",
        name: "Blank table",
        binding: null,
        style: expect.objectContaining({ tableSource: "blank", tablePreset: "blank" }),
      })]) }),
    })));
  });

  it("builds one ERP table from multiple independently selected products", async () => {
    mocks.getAvailableProducts.mockResolvedValue([
      { id: "product-1", sku: "ERP-1", erp_name: "First product", display_name: "First product", category_names: [], barcode: "111", stock_quantity: 12, catalogue_visible: true },
      { id: "product-2", sku: "ERP-2", erp_name: "Second product", display_name: "Second product", category_names: [], barcode: "222", stock_quantity: 34, catalogue_visible: true },
    ]);
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "TB Table" }));
    fireEvent.click(screen.getByRole("button", { name: /Select multiple products/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /First product/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Second product/ }));
    fireEvent.click(screen.getByRole("button", { name: /Code, barcode & stock/ }));
    expect(screen.getByText(/ERP-1 \| 111 \| 12/)).toBeInTheDocument();
    expect(screen.getByText(/ERP-2 \| 222 \| 34/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add multi-product ERP table" }));
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "table", productId: null,
        style: expect.objectContaining({ tableSource: "erp_products", tableProductIds: "product-1,product-2" }),
      })]) }),
    })));
  });

  it("schedules autosave and saves the latest design changes", async () => {
    const timerSpy = vi.spyOn(globalThis, "setTimeout");
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer Front layer" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Autosaved headline" } });
    expect(screen.getByText("Changes pending")).toBeInTheDocument();
    expect(timerSpy).toHaveBeenCalledWith(expect.any(Function), 1200);
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({ id: "front", name: "Autosaved headline" })]) }),
      expected_revision: 1,
    })));
    expect(await screen.findByText("Saved automatically")).toBeInTheDocument();
    timerSpy.mockRestore();
  });

  it("retries a failed table autosave when the editor regains focus", async () => {
    const productCard = { id: "table-autosave-card", type: "product_card", name: "ERP Product", productId: "product-1", xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true, style: { productName: "ERP Product", productSku: "ERP-1" }, responsive: {} };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, productCard] } }],
    });
    mocks.getStudioProduct.mockResolvedValue({ id: "product-1", sku: "ERP-1", erp_name: "ERP Product", display_name: "ERP Product", name_en: "ERP Product", name_th: null, description_en: null, description_th: null, how_to_use: null, remark: null, brand: "Brand A", category: "Category", category_names: ["Category"], barcode: "123", unit: "PCS", pack_size: 1, warranty: null, stock_quantity: 5, price: null, price_currency: "THB", prices: {}, primary_image_url: null, image_urls: [], images: [], has_video: false, product_status: "active", already_used: true, catalogue_visible: true, last_synchronized_at: null });
    mocks.updatePage
      .mockRejectedValueOnce(new Error("Temporary API failure"))
      .mockResolvedValueOnce({ ...design, revision: 2 });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "TB Table" }));
    expect(await screen.findByRole("dialog", { name: "Add a table" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add ERP table" }));
    fireEvent.change(screen.getByLabelText("Row 1, column 1"), { target: { value: "Updated code" } });
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    expect(await screen.findByText("Autosave failed")).toBeInTheDocument();

    fireEvent.focus(window);
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenLastCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        type: "table",
        text: expect.stringContaining("Updated code"),
      })]) }),
    })));
    expect(await screen.findByText("Saved automatically")).toBeInTheDocument();
  });

  it("recovers autosave after another tab advances the design revision", async () => {
    mocks.getDesign.mockResolvedValueOnce(design).mockResolvedValue({ ...design, revision: 7 });
    mocks.updatePage
      .mockRejectedValueOnce(new ApiError("This design was changed by another user.", 409))
      .mockResolvedValueOnce({ ...design, revision: 8 });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer Front layer" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Conflict-safe headline" } });
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledTimes(2));
    expect(mocks.getDesign).toHaveBeenCalledTimes(2);
    expect(mocks.updatePage).toHaveBeenLastCalledWith("design-1", "page-1", expect.objectContaining({
      expected_revision: 7,
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({ id: "front", name: "Conflict-safe headline" })]) }),
    }));
    expect(await screen.findByText("Autosave merged a newer design revision. New elements and your current canvas changes were both preserved.")).toBeInTheDocument();
    expect(await screen.findByText("Saved automatically")).toBeInTheDocument();
  });

  it("repairs a stale product-image selection after Product Master images change", async () => {
    const imageElement = {
      id: "stale-product-image", type: "image", name: "ERP image", productId: "product-1",
      xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 30, rotation: 0, opacity: 1, zIndex: 30,
      locked: false, visible: true, style: { productImageMode: "single", productImageId: "removed-image", productImageIds: "removed-image", productImageCount: 1, productImageIndex: 4, productImageUrl: "/removed.webp" }, responsive: {},
    };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, imageElement] } }],
    });
    mocks.getStudioProduct.mockResolvedValue({
      id: "product-1", display_name: "ERP Product", erp_name: "ERP Product", primary_image_url: "/current.webp",
      images: [{ id: "current-image", url: "/current.webp", file_name: "current.webp", alt_text: "Current image", is_primary: true, sort_order: 0 }],
    });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer ERP image" }));

    await waitFor(() => expect(screen.getByTestId("studio-canvas")).toHaveTextContent("current-image"));
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalledWith("design-1", "page-1", expect.objectContaining({
      page_data: expect.objectContaining({ elements: expect.arrayContaining([expect.objectContaining({
        id: "stale-product-image",
        style: expect.objectContaining({ productImageId: "current-image", productImageIds: "current-image", productImageIndex: 0, productImageUrl: "/current.webp" }),
      })]) }),
    })));
  });

  it("adds every synchronized ERP product image to one navigable image carousel", async () => {
    const availableProduct = {
      id: "product-1", sku: "ERP-1", erp_name: "ERP Product", display_name: "ERP Product",
      name_en: "ERP Product", name_th: null, brand: "Brand A", category: "Category",
      category_names: ["Category"], barcode: "123", stock_quantity: 9, price: "100.00",
      price_currency: "THB", primary_image_url: "/api/v1/catalogue-studio/designs/design-1/products/product-1/primary-image",
      image_urls: ["/image-1", "/image-2", "/image-3"], images: [
        { id: "image-1", url: "/image-1", file_name: "erp-front.webp", alt_text: "", is_primary: true, sort_order: 0 },
        { id: "image-2", url: "/image-2", file_name: "erp-side.webp", alt_text: "", is_primary: false, sort_order: 1 },
        { id: "image-3", url: "/image-3", file_name: "erp-box.webp", alt_text: "", is_primary: false, sort_order: 2 },
      ], has_video: false, product_status: "active",
      already_used: false, catalogue_visible: true, last_synchronized_at: null,
    };
    mocks.getAvailableProducts.mockResolvedValue([availableProduct]);
    mocks.getStudioProduct.mockResolvedValue(availableProduct);
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    expect(await screen.findByRole("img", { name: "ERP Product ERP image" })).toHaveStyle({ backgroundImage: "url(http://127.0.0.1:8000/api/v1/catalogue-studio/designs/design-1/products/product-1/primary-image)" });
    fireEvent.click(screen.getByRole("button", { name: "Add image only" }));
    expect(await screen.findByText("Added one image carousel with 3 ERP images. Use the arrows to move between images.")).toBeInTheDocument();
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("ERP Product · image carousel");
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("image-1");
    fireEvent.click(screen.getByRole("button", { name: "Mock next product image" }));
    expect(screen.getByTestId("studio-canvas")).toHaveTextContent("image-2");
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalled());
    const savedImages = mocks.updatePage.mock.calls
      .map((call) => call[2]?.page_data?.elements || [])
      .find((elements) => elements.filter((element: { type: string; productId?: string }) => element.type === "image" && element.productId === "product-1").length === 1)
      ?.filter((element: { type: string; productId?: string }) => element.type === "image" && element.productId === "product-1");
    expect(savedImages).toHaveLength(1);
    expect(savedImages?.[0].style).toMatchObject({
      productImageId: "image-2",
      productImageIds: "image-1,image-2,image-3",
      productImageCount: 3,
      productImageMode: "carousel",
    });
  });

  it("fits a chosen ERP image inside the next empty image-grid cell", async () => {
    const gridCell = {
      id: "grid-cell-1", type: "image", name: "Grid image 1",
      xPercent: 12, yPercent: 18, widthPercent: 36, heightPercent: 28,
      rotation: 0, opacity: 1, zIndex: 30, locked: false, visible: true,
      groupId: "grid-1", assetId: null, productId: null,
      style: { imageGridCell: true, imageGridIndex: 0, objectFit: "cover", backgroundColor: "#EDF4EF", borderWidth: 2 },
      responsive: {},
    };
    const availableProduct = {
      id: "product-grid", sku: "GRID-1", erp_name: "Grid Product", display_name: "Grid Product",
      name_en: "Grid Product", name_th: null, description_en: null, description_th: null,
      how_to_use: null, remark: null, brand: "Brand A", category: "Category", category_names: ["Category"],
      barcode: "123", barcodes: ["123"], unit: "PCS", pack_size: 1, warranty: null,
      stock_quantity: 9, price: "100.00", price_currency: "THB", prices: {},
      primary_image_url: "/grid-image.webp", image_urls: ["/grid-image.webp"], images: [
        { id: "grid-image", url: "/grid-image.webp", file_name: "grid-image.webp", alt_text: "Grid product", is_primary: true, sort_order: 0 },
      ], has_video: false, product_status: "active" as const, already_used: false,
      catalogue_visible: true, last_synchronized_at: null,
    };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, gridCell] } }],
    });
    mocks.getAvailableProducts.mockResolvedValue([availableProduct]);
    mocks.getStudioProduct.mockResolvedValue(availableProduct);

    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    fireEvent.click(await screen.findByRole("button", { name: "Add image only" }));

    expect(await screen.findByText("Product image fitted inside the grid cell.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalled());
    const savedElements = mocks.updatePage.mock.calls.at(-1)?.[2]?.page_data?.elements || [];
    const fittedCell = savedElements.find((element: { id: string }) => element.id === "grid-cell-1");
    expect(fittedCell).toMatchObject({
      id: "grid-cell-1", productId: "product-grid", assetId: null,
      xPercent: 12, yPercent: 18, widthPercent: 36, heightPercent: 28,
      style: expect.objectContaining({ imageGridCell: true, objectFit: "contain", productImageId: "grid-image" }),
    });
    expect(savedElements.filter((element: { productId?: string }) => element.productId === "product-grid")).toHaveLength(1);
  });

  it("opens product images at full size, navigates every ERP image, and offers a single-image download", async () => {
    const imageElement = {
      id: "preview-image", type: "image", name: "ERP Product · image carousel", productId: "product-1",
      xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 30, rotation: 0, opacity: 1, zIndex: 30,
      locked: false, visible: true, style: { productImageMode: "carousel", productImageId: "image-1", productImageIds: "image-1,image-2", productImageCount: 2, productImageIndex: 0, productName: "ERP Product", productSku: "ERP-1" }, responsive: {},
    };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, imageElement] } }],
    });
    mocks.getStudioProduct.mockResolvedValue({
      id: "product-1", sku: "ERP-1", erp_name: "ERP Product", display_name: "ERP Product", name_en: "ERP Product", name_th: null,
      description_en: null, description_th: null, how_to_use: null, remark: null, brand: "Brand A", category: "Category", category_names: ["Category"],
      barcode: "123", unit: "PCS", pack_size: 1, warranty: null, stock_quantity: 5, price: null, price_currency: "THB", prices: {},
      primary_image_url: "/image-1", image_urls: ["/image-1", "/image-2"], images: [
        { id: "image-1", url: "/image-1", file_name: "erp-front.webp", alt_text: "Front image", is_primary: true, sort_order: 0 },
        { id: "image-2", url: "/image-2", file_name: "erp-side.webp", alt_text: "Side image", is_primary: false, sort_order: 1 },
      ], has_video: false, product_status: "active", already_used: true, catalogue_visible: true, last_synchronized_at: null,
    });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mock preview product image" }));
    expect(await screen.findByRole("dialog", { name: "ERP Product" })).toBeInTheDocument();
    expect(screen.getByText("erp-front.webp")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download this image" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next full-size product image" }));
    expect(screen.getByText("erp-side.webp")).toBeInTheDocument();
    expect(screen.getByText("Image 2 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close image preview" }));
    expect(screen.queryByRole("dialog", { name: "ERP Product" })).not.toBeInTheDocument();
  });

  it("synchronizes ERP product information and images from the Products library", async () => {
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    fireEvent.click(screen.getByRole("button", { name: "Sync products & images from ERP" }));
    await waitFor(() => expect(mocks.runProductSync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.getAvailableProducts).toHaveBeenCalledWith("design-1", ""));
    expect(await screen.findByText(/ERP synchronized: 1 new, 2 updated, 3 images added and 4 images refreshed/)).toBeInTheDocument();
  });

  it("pulls the selected product card image directly from ERP", async () => {
    const productCard = {
      id: "card-1", type: "product_card", name: "ERP Product", productId: "product-1",
      xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30,
      locked: false, visible: true, style: { productImageId: "", productImageIds: "", productImageCount: 0 }, responsive: {},
    };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, productCard] } }],
    });
    const emptyProduct = { id: "product-1", display_name: "ERP Product", erp_name: "ERP Product", images: [], primary_image_url: null };
    const refreshedProduct = { ...emptyProduct, primary_image_url: "/primary", images: [{ id: "image-1", url: "/image-1", file_name: "ERP-1-erp-image-1.webp", alt_text: "ERP Product", is_primary: true, sort_order: 0 }] };
    mocks.getStudioProduct.mockResolvedValueOnce(emptyProduct).mockResolvedValue(refreshedProduct);
    mocks.getErpImages.mockResolvedValue([{ slot: 1, description: "ERP Product", file_size: 2048, mime_type: "image/jpeg", supported: true, preview_url: "/preview" }]);
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer ERP Product" }));
    await waitFor(() => expect(mocks.getStudioProduct).toHaveBeenCalledWith("design-1", "product-1"));
    fireEvent.click(screen.getByRole("button", { name: "Pull images from ERP" }));
    await waitFor(() => expect(mocks.importErpImage).toHaveBeenCalledWith("product-1", 1, expect.objectContaining({ make_primary: true })));
    expect(await screen.findByText("Pulled 1 ERP image into this product card.")).toBeInTheDocument();
  });

  it("deletes the selected product image after confirmation", async () => {
    const productCard = {
      id: "card-delete", type: "product_card", name: "Deletable Product", productId: "product-delete",
      xPercent: 5, yPercent: 5, widthPercent: 30, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30,
      locked: false, visible: true, style: { productImageId: "image-delete", productImageIds: "image-delete", productImageCount: 1, productImageIndex: 0 }, responsive: {},
    };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, productCard] } }],
    });
    const currentProduct = { id: "product-delete", display_name: "Deletable Product", erp_name: "Deletable Product", primary_image_url: "/primary", images: [{ id: "image-delete", url: "/image-delete", file_name: "delete-me.webp", alt_text: "", is_primary: true, sort_order: 0 }] };
    const emptyProduct = { ...currentProduct, primary_image_url: null, images: [] };
    mocks.getStudioProduct.mockResolvedValueOnce(currentProduct).mockResolvedValue(emptyProduct);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    fireEvent.click(screen.getByRole("button", { name: "Select layer Deletable Product" }));
    const deleteButton = screen.getByRole("button", { name: "Delete selected image" });
    await waitFor(() => expect(deleteButton).toBeEnabled());
    fireEvent.click(deleteButton);
    await waitFor(() => expect(mocks.deleteProductImage).toHaveBeenCalledWith("product-delete", "image-delete"));
    expect(await screen.findByText("delete-me.webp was deleted from Product Master.")).toBeInTheDocument();
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining("affect other catalogues"));
    confirmSpy.mockRestore();
  });

  it("removes an image binding while preserving its grid frame", async () => {
    const gridImage = {
      id: "grid-image", type: "image", name: "Uploaded chair", assetId: "asset-1",
      xPercent: 25, yPercent: 30, widthPercent: 40, heightPercent: 35, rotation: 0, opacity: 1, zIndex: 30,
      locked: false, visible: true, style: { imageGridCell: true, borderWidth: 2, sourceFileName: "chair.jpg", objectFit: "cover" }, responsive: {},
    };
    mocks.getDesign.mockResolvedValue({
      ...design,
      pages: [{ ...design.pages[0], page_data_json: { ...design.pages[0].page_data_json, elements: [...design.pages[0].page_data_json.elements, gridImage] } }],
    });
    render(<CatalogueStudioEditor designId="design-1" />);
    expect(await screen.findByText("Test Catalogue")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mock image context menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Remove image/ }));
    expect(await screen.findByText("Image removed. The frame, position, size and styling were kept.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save now" }));
    await waitFor(() => expect(mocks.updatePage).toHaveBeenCalled());
    const savedElements = mocks.updatePage.mock.calls.at(-1)?.[2]?.page_data?.elements || mocks.updatePage.mock.calls.at(-1)?.[2]?.page_data_json?.elements || [];
    expect(savedElements).toEqual(expect.arrayContaining([expect.objectContaining({ id: "grid-image", assetId: null, xPercent: 25, yPercent: 30, widthPercent: 40, heightPercent: 35, style: expect.objectContaining({ imageGridCell: true, borderWidth: 2, sourceFileName: "" }) })]));
  });
});
