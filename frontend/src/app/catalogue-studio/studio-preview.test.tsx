import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioPage } from "@/lib/studio-api";
import { CataloguePageRenderer, StudioPreview } from "./studio-preview";

const mocks = vi.hoisted(() => ({ getDesign: vi.fn(), createExport: vi.fn(), createVersion: vi.fn() }));

vi.mock("@/lib/api", () => ({ API_ORIGIN: "http://127.0.0.1:8000" }));
vi.mock("@/lib/studio-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/studio-api")>("@/lib/studio-api");
  return { ...actual, getStudioDesign: mocks.getDesign, createStudioExport: mocks.createExport, createStudioVersion: mocks.createVersion };
});

const baseElement = {
  xPercent: 0, yPercent: 0, widthPercent: 40, heightPercent: 20,
  rotation: 0, opacity: 1, zIndex: 1, locked: false, visible: true,
  style: {}, responsive: {},
};

describe("StudioPreview", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Image unavailable in test")));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview-image") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    mocks.getDesign.mockResolvedValue({
      id: "design-1", name: "Visibility test", product_items: [
        { id: "item-1", product_id: "active-product", is_visible: true },
        { id: "item-2", product_id: "inactive-product", is_visible: false },
      ],
      pages: [{
        id: "page-1", is_visible: true, width: 800, height: 1000,
        page_data_json: {
          canvas: { backgroundColor: "#FFFFFF" },
          elements: [
            { ...baseElement, id: "active-element", type: "product_card", name: "Active", productId: "active-product", style: { productName: "Active product" } },
            { ...baseElement, id: "inactive-element", type: "product_card", name: "Inactive", productId: "inactive-product", style: { productName: "Inactive product" } },
          ],
        },
      }],
    });
  });

  it("omits products marked inactive for this catalogue", async () => {
    render(<StudioPreview designId="design-1" />);
    expect(await screen.findByText("Active product")).toBeInTheDocument();
    expect(screen.queryByText("Inactive product")).not.toBeInTheDocument();
  });

  it("highlights the selected section and keeps booklet navigation keys out of category search", async () => {
    mocks.getDesign.mockResolvedValueOnce({ id: "design-1", name: "Keyboard test", product_items: [], pages: [
      { id: "first", page_name: "First", is_visible: true, width: 800, height: 1000, page_data_json: { canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
      { id: "last", page_name: "Last", is_visible: true, width: 800, height: 1000, page_data_json: { canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
    ] });
    render(<StudioPreview designId="design-1" />);
    const category = await screen.findByRole("button", { name: "First, 1 page" });
    fireEvent.click(category);
    expect(category).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: "Booklet" }));
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search categories" }), { key: "End" });
    expect(category).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
  });

  it("groups several pages under one searchable category button", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Grouped catalogue", product_items: [],
      pages: [
        { id: "chair-1", page_name: "Chair 1", is_visible: true, width: 800, height: 1000, page_data_json: { navigationCategory: "Chair", canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
        { id: "chair-2", page_name: "Chair 2", is_visible: true, width: 800, height: 1000, page_data_json: { navigationCategory: "Chair", canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
        { id: "table-1", page_name: "Table 1", is_visible: true, width: 800, height: 1000, page_data_json: { navigationCategory: "Table", canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
      ],
    });
    render(<StudioPreview designId="design-1" />);
    expect(await screen.findAllByRole("button", { name: "Chair, 2 pages" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Table, 1 page" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search categories" }), { target: { value: "table" } });
    expect(screen.queryByRole("button", { name: "Chair, 2 pages" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Table, 1 page" })).toBeInTheDocument();
  });

  it("opens the catalogue as a navigable booklet", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Booklet catalogue", product_items: [],
      pages: [
        { id: "cover", page_name: "Cover", is_visible: true, width: 800, height: 1000, page_data_json: { canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
        { id: "products", page_name: "Products", is_visible: true, width: 800, height: 1000, page_data_json: { canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
      ],
    });
    render(<StudioPreview designId="design-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Booklet" }));
    expect(screen.getByRole("region", { name: "Booklet catalogue viewer" })).toBeInTheDocument();
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous booklet page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open page 1: Cover" }).tagName).toBe("DIV");
    fireEvent.click(screen.getByRole("button", { name: "Next booklet page" }));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    expect(screen.getAllByText("Products")).toHaveLength(2);
  });

  it("turns booklet spreads by dragging the pages", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Draggable booklet", catalogue_type: "booklet", product_items: [],
      pages: [
        { id: "cover", page_name: "Cover", is_visible: true, width: 800, height: 1000, page_data_json: { canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
        { id: "inside-left", page_name: "Inside left", is_visible: true, width: 800, height: 1000, page_data_json: { canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
        { id: "inside-right", page_name: "Inside right", is_visible: true, width: 800, height: 1000, page_data_json: { canvas: { backgroundColor: "#FFFFFF" }, elements: [] } },
      ],
    });
    render(<StudioPreview designId="design-1" />);
    const pages = await screen.findByRole("group", { name: "Drag booklet pages left or right to turn" });
    fireEvent.pointerDown(pages, { pointerId: 1, isPrimary: true, button: 0, clientX: 500, clientY: 300 });
    fireEvent.pointerMove(pages, { pointerId: 1, isPrimary: true, clientX: 380, clientY: 304 });
    fireEvent.pointerUp(pages, { pointerId: 1, isPrimary: true, button: 0, clientX: 380, clientY: 304 });
    expect(screen.getByText("2–3 / 3")).toBeInTheDocument();
  });

  it("automatically opens booklet catalogues in booklet mode", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Saved booklet", catalogue_type: "booklet", product_items: [],
      pages: [{ id: "cover", page_name: "Cover", is_visible: true, width: 800, height: 1000, page_data_json: { canvas: { backgroundColor: "#FFFFFF" }, elements: [] } }],
    });
    render(<StudioPreview designId="design-1" />);
    expect(await screen.findByRole("region", { name: "Booklet catalogue viewer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Booklet" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a recoverable error instead of an endless loader", async () => {
    mocks.getDesign.mockRejectedValueOnce(new Error("Database temporarily unavailable"));
    render(<StudioPreview designId="design-1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Database temporarily unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Active product")).toBeInTheDocument();
    expect(mocks.getDesign).toHaveBeenCalledTimes(2);
  });

  it("renders the ERP detail-table product-card layout", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "ERP detail", product_items: [],
      pages: [{ id: "page-1", page_name: "Products", is_visible: true, width: 800, height: 1000, page_data_json: {
        canvas: { backgroundColor: "#FFFFFF" }, elements: [{
          ...baseElement, id: "detail-card", type: "product_card", name: "Cat litter", productId: "active-product",
          style: { cardLayout: "erp_detail", productName: "Cat litter 10L", productSku: "23-01178", productBarcode: "8859790002006", productStock: 1181, productPackSize: 10, productUnit: "Liter", productPrice: "THB 690.00", showProductDescription: true, productDescription: "Premium cat litter" },
        }],
      } }],
    });
    render(<StudioPreview designId="design-1" />);
    expect(await screen.findByRole("table", { name: "ERP product details" })).toBeInTheDocument();
    expect(screen.getAllByText("23-01178").length).toBeGreaterThan(0);
    expect(screen.getByText("8859790002006")).toBeInTheDocument();
    expect(screen.getByText("THB 690.00")).toBeInTheDocument();
  });

  it("loads protected product-card images with credentials and renders the local blob", async () => {
    const imageBlob = new Blob(["image"], { type: "image/png" });
    const authenticatedFetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: vi.fn().mockResolvedValue(imageBlob),
    });
    vi.stubGlobal("fetch", authenticatedFetch);
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Product image preview", product_items: [{ id: "item-1", product_id: "active-product", is_visible: true }],
      pages: [{ id: "page-1", page_name: "Products", is_visible: true, width: 800, height: 1000, page_data_json: {
        canvas: { backgroundColor: "#FFFFFF" }, elements: [{
          ...baseElement, id: "product-card", type: "product_card", name: "ERP product", productId: "active-product",
          style: { productName: "ERP product", productImageIds: "erp-image-1", productImageId: "erp-image-1" },
        }],
      } }],
    });

    const { container } = render(<StudioPreview designId="design-1" />);
    expect(await screen.findByText("ERP product")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector<HTMLImageElement>('[data-product-card="true"] img')?.src).toContain("blob:preview-image"));
    expect(authenticatedFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/catalogue-studio/designs/design-1/products/active-product/images/erp-image-1",
      expect.objectContaining({
        credentials: "include",
        cache: "force-cache",
        headers: { Accept: "image/*" },
      }),
    );
    expect(URL.createObjectURL).toHaveBeenCalledWith(imageBlob);
  });

  it("limits the product image area so it cannot cover the product name", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Safe product card", product_items: [{ id: "item-1", product_id: "active-product", is_visible: true }],
      pages: [{ id: "page-1", page_name: "Products", is_visible: true, width: 800, height: 1000, page_data_json: {
        canvas: { backgroundColor: "#FFFFFF" }, elements: [{
          ...baseElement, id: "oversized-image-card", type: "product_card", name: "ERP product", productId: "active-product",
          style: { productName: "Product name stays visible", productImageHeight: 90, showProductName: true },
        }],
      } }],
    });

    const { container } = render(<StudioPreview designId="design-1" />);
    expect(await screen.findByText("Product name stays visible")).toBeInTheDocument();
    expect(container.querySelector('[data-product-card="true"]')).toHaveStyle({
      gridTemplateRows: "48% minmax(0, 1fr)",
    });
    const imageArea = container.querySelector('[data-preview-product-image="true"]');
    expect(imageArea).not.toHaveStyle({ height: "min(100%, 300px)" });
    expect(imageArea?.querySelector("img")).toHaveStyle({ objectFit: "contain", transform: "scale(1.2)" });
  });

  it("renders an editable Studio table element", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Table design", product_items: [],
      pages: [{ id: "page-1", page_name: "Table", is_visible: true, width: 800, height: 1000, page_data_json: {
        canvas: { backgroundColor: "#FFFFFF" }, elements: [{
          ...baseElement, id: "table-1", type: "table", name: "Product comparison",
          text: "Code | Barcode | Stock\n23-01178 | 8859790002006 | 1181",
          style: { tableHeader: true, tableHeaderColor: "#126B3A", fontWeight: "bold", fontStyle: "italic" },
        }],
      } }],
    });
    render(<StudioPreview designId="design-1" />);
    const table = await screen.findByRole("table", { name: "Product comparison" });
    expect(table).toBeInTheDocument();
    expect(table.parentElement).toHaveStyle({ fontWeight: "bold", fontStyle: "italic" });
    expect(table.parentElement).toHaveStyle({ overflow: "visible" });
    expect(screen.getByRole("columnheader", { name: "Barcode" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "8859790002006" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "1181" })).toHaveStyle({ color: "#16884C" });
  });

  it("omits empty preview table rows and evenly sizes the remaining rows", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Equal table rows", product_items: [],
      pages: [{ id: "page-1", page_name: "Table", is_visible: true, width: 800, height: 1000, page_data_json: {
        canvas: { backgroundColor: "#FFFFFF" }, elements: [{
          ...baseElement, id: "table-1", type: "table", name: "Wholesale inventory",
          text: "Barcode | Stock | Wholesale Price\n | | \n8859790009142 | 933 | THB 250.00\n8859790009143 | 100 | THB 150.00",
          style: { tableHeader: true },
        }],
      } }],
    });

    render(<StudioPreview designId="design-1" />);

    const table = await screen.findByRole("table", { name: "Wholesale inventory" });
    const rows = Array.from(table.querySelectorAll("tr"));
    expect(rows).toHaveLength(3);
    expect(screen.getByRole("cell", { name: "8859790009142" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "8859790009143" })).toBeInTheDocument();
    rows.forEach((row) => expect(row).toHaveStyle({ height: "33.333333333333336%" }));
  });

  it("keeps a multi-product ERP table when its primary product is hidden", async () => {
    const page = {
      id: "page-table", design_id: "design-1", page_type: "product", page_name: "Products",
      display_order: 1, width: 800, height: 1000, orientation: "portrait",
      background_color: "#FFFFFF", is_visible: true, is_locked: false, created_at: "", updated_at: "",
      page_data_json: {
        pageId: "page-table", pageType: "product", name: "Products", dataMode: "live",
        canvas: { width: 800, height: 1000, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: false, bleed: 0 },
        elements: [{
          ...baseElement, id: "inventory-table", type: "table", name: "Selected product inventory",
          productId: "hidden-product", text: "Code | Barcode | Stock\nA-1 | 88590001 | 10\nB-2 | 88590002 | 20",
          style: { tableSource: "erp_products", tableProductIds: "hidden-product,active-product", tableHeader: true },
        }],
      },
    } as StudioPage;

    render(<CataloguePageRenderer designId="design-1" page={page} pageNumber={1} mode="desktop" hiddenProductIds={new Set(["hidden-product"])} />);

    expect(screen.getByRole("table", { name: "Selected product inventory" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "B-2" })).toBeInTheDocument();
  });

  it("renders barcode bars from the saved style value", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Barcode design", product_items: [],
      pages: [{ id: "page-1", page_name: "Barcode", is_visible: true, width: 800, height: 1000, page_data_json: {
        canvas: { backgroundColor: "#FFFFFF" }, elements: [{
          ...baseElement, id: "barcode-1", type: "barcode", name: "ERP barcode",
          style: { barcodeValue: "8859790017475", backgroundColor: "#FFFFFF" },
        }],
      } }],
    });
    const { container } = render(<StudioPreview designId="design-1" />);
    expect(await screen.findByText("8859790017475")).toBeInTheDocument();
    expect(container.querySelector('[data-studio-barcode="true"] rect')).toBeInTheDocument();
  });

  it("opens the product download popup from a standalone download icon", () => {
    const page = {
      id: "page-download", design_id: "design-1", page_type: "product", page_name: "Product",
      display_order: 1, width: 800, height: 1000, orientation: "portrait",
      background_color: "#FFFFFF", is_visible: true, is_locked: false, created_at: "", updated_at: "",
      page_data_json: {
        pageId: "page-download", pageType: "product", name: "Product", dataMode: "live",
        canvas: { width: 800, height: 1000, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: false, bleed: 0 },
        elements: [{
          ...baseElement, id: "download-product", type: "button", name: "Download button", productId: "active-product",
          text: "⇩", style: { productName: "Custom chair card", productSku: "CHAIR-1", downloadButtonDesign: "tray", publicProductImageUrls: JSON.stringify(["https://cdn.example.test/chair.jpg"]) },
        }],
      },
    } as StudioPage;
    const openProductImage = vi.fn();

    render(<CataloguePageRenderer designId="design-1" page={page} pageNumber={1} mode="desktop" onOpenProductImage={openProductImage} />);
    const downloadButton = screen.getByRole("button", { name: "Download Custom chair card" });
    expect(downloadButton.style.backgroundImage).toBe("");
    fireEvent.click(downloadButton);

    expect(openProductImage).toHaveBeenCalledWith(expect.objectContaining({
      title: "Custom chair card",
      images: [expect.objectContaining({ url: "https://cdn.example.test/chair.jpg" })],
    }));
  });

  it("renders configurable shadows without exposing internal element names", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Shadow design", product_items: [],
      pages: [{ id: "page-1", page_name: "Shapes", is_visible: true, width: 800, height: 1000, page_data_json: {
        canvas: { backgroundColor: "#FFFFFF" }, elements: [{
          ...baseElement, id: "shape-1", type: "shape", name: "Shadow shape",
          style: { backgroundColor: "#F0F5A5", shadowBlur: 18, shadowOffsetX: 7, shadowOffsetY: 9, shadowOpacity: 45, shadowColor: "#112233" },
        }],
      } }],
    });
    const { container } = render(<StudioPreview designId="design-1" />);
    await screen.findAllByText("Shadow design");
    expect(screen.queryByText("Shadow shape")).not.toBeInTheDocument();
    expect(container.querySelector('[data-studio-element-id="shape-1"]')).toHaveStyle({ boxShadow: "7px 9px 18px rgba(17, 34, 51, 0.45)" });
  });

  it("shows previous and next controls for an image-only product with multiple images", async () => {
    mocks.getDesign.mockResolvedValueOnce({
      id: "design-1", name: "Product images", product_items: [{ id: "item-1", product_id: "active-product", is_visible: true }],
      pages: [{ id: "page-1", page_name: "Images", is_visible: true, width: 800, height: 1000, page_data_json: {
        canvas: { backgroundColor: "#FFFFFF" }, elements: [{
          ...baseElement, id: "image-1", type: "image", name: "Product gallery", productId: "active-product",
          style: { productImageIds: "first-image,second-image", productImageId: "first-image", productImageIndex: 0, productImageCount: 2, downloadButtonDesign: "tray", downloadButtonXPercent: 42, downloadButtonYPercent: 17, downloadButtonSize: 40 },
        }],
      } }],
    });
    render(<StudioPreview designId="design-1" />);
    const previous = await screen.findByRole("button", { name: "Previous image for Product gallery" });
    const next = screen.getByRole("button", { name: "Next image for Product gallery" });
    expect(previous).toHaveTextContent("<");
    expect(next).toHaveTextContent(">");
    const imageLayer = previous.parentElement?.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(imageLayer?.style.backgroundImage).toContain("first-image");
    fireEvent.click(next);
    const transitionedImageLayer = previous.parentElement?.querySelector<HTMLElement>('span[aria-hidden="true"]');
    expect(transitionedImageLayer?.style.backgroundImage).toContain("second-image");
    expect(transitionedImageLayer?.className).toContain("productImageTransition");
    expect(screen.getByText("2/2")).toBeInTheDocument();
    const downloadControl = screen.getByRole("button", { name: "Expand and download Product gallery" });
    expect(downloadControl).toHaveTextContent("⇩");
    expect(downloadControl).toHaveStyle({ left: "42%", top: "17%", width: "40px", height: "40px" });
    fireEvent.click(downloadControl);
    const dialog = screen.getByRole("dialog", { name: "Product gallery" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "↓ Download image" })).toBeInTheDocument();
    expect(dialog.querySelector("img")?.getAttribute("src")).toContain("second-image");
  });

  it("uses one native coordinate system and applies preview scale only to the outer page", () => {
    const page = {
      id: "page-native", design_id: "design-1", page_type: "cover", page_name: "Cover",
      display_order: 1, width: 1123, height: 794, orientation: "landscape",
      background_color: "#52F0CF", is_visible: true, is_locked: false, created_at: "", updated_at: "",
      page_data_json: {
        pageId: "page-native", pageType: "cover", name: "Cover", dataMode: "snapshot",
        canvas: { width: 1123, height: 794, backgroundColor: "#52F0CF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: false, bleed: 0 },
        elements: [{ ...baseElement, id: "title", type: "text", name: "Title", text: "Pixel faithful", widthPercent: 80 }],
      },
    } as StudioPage;

    const { container, rerender } = render(<CataloguePageRenderer designId="design-1" page={page} pageNumber={1} mode="desktop" scale={0.5} />);
    const outer = container.querySelector<HTMLElement>("article")!;
    const logical = outer.firstElementChild as HTMLElement;
    expect(outer).toHaveStyle({ width: "561.5px", height: "397px" });
    expect(logical).toHaveStyle({ width: "1123px", height: "794px", transform: "scale(0.5)" });

    rerender(<CataloguePageRenderer designId="design-1" page={page} pageNumber={1} mode="pdf" scale={1} renderOnly />);
    expect(container.querySelector("article")).toHaveStyle({ width: "1123px", height: "794px" });
    expect(container.querySelector("article")?.firstElementChild).toHaveStyle({ transform: "scale(1)" });
  });

  it("keeps protected ERP media pending until its authenticated fetch completes", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => undefined)));
    const page = {
      id: "page-media", design_id: "design-1", page_type: "product", page_name: "Product",
      display_order: 1, width: 800, height: 600, orientation: "landscape",
      background_color: "#FFFFFF", is_visible: true, is_locked: false, created_at: "", updated_at: "",
      page_data_json: {
        pageId: "page-media", pageType: "product", name: "Product", dataMode: "snapshot",
        canvas: { width: 800, height: 600, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: false, bleed: 0 },
        elements: [{ ...baseElement, id: "erp-image", type: "image", name: "ERP image", productId: "product-1", style: { productImageId: "image-1", productImageIds: "image-1" } }],
      },
    } as StudioPage;

    const { container } = render(<CataloguePageRenderer designId="design-1" page={page} pageNumber={1} mode="pdf" renderOnly />);
    expect(container.querySelector('[data-studio-media-state="pending"]')).toBeInTheDocument();
  });

  it("keeps a bound price frame on the same coordinates and text metrics in PDF mode", () => {
    const page = {
      id: "price-page", design_id: "design-1", page_type: "product", page_name: "Product",
      display_order: 1, width: 794, height: 1123, orientation: "portrait",
      background_color: "#FFFFFF", is_visible: true, is_locked: false, created_at: "", updated_at: "",
      page_data_json: {
        pageId: "price-page", pageType: "product", name: "Product", dataMode: "snapshot",
        canvas: { width: 794, height: 1123, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: false, bleed: 0 },
        elements: [{ ...baseElement, id: "price", type: "product_field", name: "Price", text: "THB 2,150.00", binding: "{{product.price}}", productId: "product-1", xPercent: 65, yPercent: 51, widthPercent: 28, heightPercent: 7, style: { fontSize: 24, textAlign: "center", fontWeight: "bold", productSku: "19029", publicProductImageUrls: JSON.stringify(["https://cdn.example.test/product-thumb.jpg"]) } }],
      },
    } as StudioPage;
    const { container } = render(<CataloguePageRenderer designId="design-1" page={page} pageNumber={1} mode="pdf" renderOnly />);
    const price = container.querySelector<HTMLElement>('[data-studio-element-id="price"]');
    expect(price).toHaveStyle({ left: "65%", top: "51%", width: "28%", height: "7%", lineHeight: "1", alignItems: "center", justifyContent: "center" });
    expect(price?.style.backgroundImage).toBe("");
  });
});
