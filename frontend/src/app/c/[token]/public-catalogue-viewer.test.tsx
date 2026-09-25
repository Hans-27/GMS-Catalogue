import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { PublicCatalogue } from "@/lib/api";
import { PublicCatalogueViewer } from "./public-catalogue-viewer";

vi.mock("@/app/catalogue-studio/studio-preview", () => ({
  CataloguePageRenderer: ({ page, pageNumber }: { page: { page_name: string }; pageNumber: number }) => <div data-testid={`rendered-studio-page-${pageNumber}`}>{page.page_name}</div>,
}));

const publicCatalogue = {
  version: 2,
  title: "AIGO Catalogue",
  description: "Current AIGO products.",
  audience_type: "VIP Province",
  audience_code: "vip_province",
  audience: "VIP Province",
  language: "en",
  status: "published",
  is_draft: false,
  price_list: { id: 2, name: "VIP", show_price: true },
  show_prices: true,
  currency: "THB",
  product_count: 1,
  generated_at: "2026-08-10T10:00:00+07:00",
  categories: [
    {
      slug: "accessories",
      name: "Accessories",
      description: "",
      display_order: 1,
      product_count: 1,
      show_product_count: true,
      default_expanded: true,
    },
  ],
  products: [
    {
      code: "AIGO-001",
      name: "Cooling Fan",
      name_en: "Cooling Fan",
      brand: "AIGO",
      category_name: "Accessories",
      categories: ["Accessories"],
      description: "Quiet cooling fan.",
      long_description: "",
      main_image_url: null,
      section_title: "Accessories",
      display_order: 1,
      featured: false,
      price: "199.00",
      currency: "THB",
    },
  ],
  allow_pdf_download: true,
  allow_print: true,
  password_protected: false,
} as unknown as PublicCatalogue;

describe("PublicCatalogueViewer", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses labelled page counts when a Studio section has no product bindings", async () => {
    const design = { id: "unbound-sections", catalogue_type: "standard", pages: [1, 2].map((i) => ({
      id: `empty-${i}`, page_type: "free_layout", page_name: `Empty ${i}`, width: 794, height: 1123, is_visible: true,
      page_data_json: { navigationCategory: "Empty sections", elements: [] },
    })) };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/pdf")) return new Promise(() => undefined);
      return Promise.resolve({ ok: true, status: 200, json: async () => String(input).endsWith("/studio") ? design : { ...publicCatalogue, products: [], product_count: 0, studio_design_id: design.id } });
    }));
    render(<LanguageProvider><PublicCatalogueViewer token="empty-section-token" /></LanguageProvider>);
    expect(await screen.findByRole("link", { name: "Empty sections, 2 pages" })).toHaveTextContent("2 pages");
  });

  it("makes Studio and booklet navigation searchable without turning pages while editing search", async () => {
    const design = { id: "booklet-sidebar", catalogue_type: "booklet", pages: [
      { id: "cover", page_type: "cover", page_name: "Cover", width: 794, height: 1123, is_visible: true, page_data_json: { elements: [] } },
      { id: "accessories", page_type: "product_grid", page_name: "Accessories", width: 794, height: 1123, is_visible: true, page_data_json: { navigationCategory: "Accessories", elements: [] } },
    ] };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("/pdf")) return new Promise(() => undefined);
      return Promise.resolve({ ok: true, status: 200, json: async () => String(input).endsWith("/studio") ? design : { ...publicCatalogue, studio_design_id: design.id } });
    }));
    render(<LanguageProvider><PublicCatalogueViewer token="booklet-sidebar-token" /></LanguageProvider>);
    const sidebar = await screen.findByRole("complementary", { name: "Catalogue categories" });
    await within(sidebar).findByRole("link", { name: /Accessories/ });
    expect(within(sidebar).queryByRole("link", { name: /All Products/ })).not.toBeInTheDocument();
    const search = within(sidebar).getByRole("searchbox", { name: "Search categories" });
    fireEvent.keyDown(search, { key: "End" });
    expect(within(sidebar).getByRole("link", { name: "Back to Cover" })).toHaveAttribute("aria-current", "page");
    fireEvent.change(search, { target: { value: "not-a-category" } });
    expect(within(sidebar).queryByRole("link", { name: /Accessories/ })).not.toBeInTheDocument();
    expect(within(document.getElementById("studio-catalogue")!).getAllByTestId("rendered-studio-page-1").length).toBeGreaterThan(0);
  });

  it("shows only the selected category products and keeps search easy to reset", async () => {
    const catalogue = {
      ...publicCatalogue,
      product_count: 2,
      categories: [
        ...(publicCatalogue.categories ?? []),
        { slug: "keyboards", name: "Keyboards", description: "Imported from the ERP product group.", display_order: 2, product_count: 1, show_product_count: true, default_expanded: true },
      ],
      products: [
        ...publicCatalogue.products,
        { ...publicCatalogue.products[0], code: "AIGO-KB-001", name: "Gaming Keyboard", name_en: "Gaming Keyboard", category_name: "Keyboards", categories: ["Keyboards"], price: "799.00" },
      ],
    } as unknown as PublicCatalogue;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => catalogue }));
    render(<LanguageProvider><PublicCatalogueViewer token="sidebar-test-token" /></LanguageProvider>);
    const sidebar = await screen.findByRole("complementary", { name: "Catalogue categories" });
    expect(within(sidebar).queryByRole("link", { name: /All Products/ })).not.toBeInTheDocument();
    const search = within(sidebar).getByRole("searchbox", { name: "Search products" });
    const accessories = within(sidebar).getByRole("link", { name: /Accessories/ });
    const keyboards = within(sidebar).getByRole("link", { name: /Keyboards/ });

    fireEvent.click(keyboards);
    expect(keyboards).toHaveAttribute("aria-current", "page");
    const keyboardSection = screen.getByRole("heading", { name: "Keyboards" }).closest("section");
    expect(keyboardSection).not.toBeNull();
    expect(within(keyboardSection!).queryByText("02")).not.toBeInTheDocument();
    expect(within(keyboardSection!).queryByText("Imported from the ERP product group.")).not.toBeInTheDocument();
    expect(screen.getByText("Gaming Keyboard")).toBeInTheDocument();
    expect(screen.queryByText("Cooling Fan")).not.toBeInTheDocument();
    expect(within(sidebar).getByText("Search within Keyboards")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "unmatched-product" } });
    expect(within(sidebar).getByRole("link", { name: /Accessories/ })).toBeInTheDocument();
    expect(within(sidebar).getByRole("link", { name: /Keyboards/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No products found" })).toBeInTheDocument();

    fireEvent.click(within(sidebar).getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(screen.getByText("Gaming Keyboard")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "keyboard" } });
    fireEvent.click(accessories);
    expect(search).toHaveValue("");
    expect(accessories).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Cooling Fan")).toBeInTheDocument();
    expect(screen.queryByText("Gaming Keyboard")).not.toBeInTheDocument();
  });

  it("downloads one category as Excel from its aligned sidebar action", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/categories/accessories/excel")) {
        expect(init?.headers).toEqual({ "X-Catalogue-Password": "catalogue-secret" });
        return Promise.resolve(new Response(new Blob(["workbook"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), {
          status: 200,
          headers: { "Content-Disposition": 'attachment; filename="aigo-accessories.xlsx"' },
        }));
      }
      if (!init?.headers) return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
      expect(init.headers).toEqual({ "X-Catalogue-Password": "catalogue-secret" });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ...publicCatalogue, password_protected: true }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn(() => "blob:category-excel"), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(<LanguageProvider><PublicCatalogueViewer token="category-excel-token" /></LanguageProvider>);
    const passwordInput = await screen.findByPlaceholderText("Catalogue password");
    fireEvent.change(passwordInput, { target: { value: "catalogue-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Open catalogue" }));
    const sidebar = await screen.findByRole("complementary", { name: "Catalogue categories" });
    fireEvent.click(within(sidebar).getByRole("button", { name: "Download Accessories as Excel" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/public/catalogues/category-excel-token/categories/accessories/excel",
      { headers: { "X-Catalogue-Password": "catalogue-secret" } },
    ));
    expect(click).toHaveBeenCalledOnce();
    expect(click.mock.instances[0]).toHaveProperty("download", "aigo-accessories.xlsx");
  });

  it("hides category Excel actions when downloads are disabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ...publicCatalogue, allow_pdf_download: false }),
    }));
    render(<LanguageProvider><PublicCatalogueViewer token="no-category-download-token" /></LanguageProvider>);
    const sidebar = await screen.findByRole("complementary", { name: "Catalogue categories" });
    expect(within(sidebar).queryByRole("button", { name: "Download Accessories as Excel" })).not.toBeInTheDocument();
  });

  it("keeps the catalogue identity in the sidebar and removes platform branding from the top toolbar", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => publicCatalogue }));

    const { container } = render(
      <LanguageProvider>
        <PublicCatalogueViewer token="header-title-test-token" />
      </LanguageProvider>,
    );

    const sidebar = await screen.findByRole("complementary", { name: "Catalogue categories" });
    expect(within(sidebar).getByText("AIGO Catalogue")).toBeInTheDocument();
    const toolbar = within(container.querySelector("header")!);
    expect(toolbar.queryByText("AIGO Catalogue")).not.toBeInTheDocument();
    expect(toolbar.queryByRole("link", { name: "Back to Dashboard" })).not.toBeInTheDocument();
    expect(toolbar.queryByText("PRODUCT CATALOGUE")).not.toBeInTheDocument();
  });

  it("removes platform branding from the Studio catalogue toolbar", async () => {
    const design = {
      id: "studio-toolbar",
      catalogue_type: "standard",
      pages: [{ id: "cover", page_type: "cover", page_name: "Cover", width: 794, height: 1123, is_visible: true, page_data_json: { elements: [] } }],
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      status: 200,
      json: async () => String(input).endsWith("/studio") ? design : { ...publicCatalogue, studio_design_id: design.id },
    })));

    const { container } = render(
      <LanguageProvider>
        <PublicCatalogueViewer token="studio-toolbar-test-token" />
      </LanguageProvider>,
    );

    await screen.findByRole("complementary", { name: "Catalogue categories" });
    const toolbar = within(container.querySelector("header")!);
    expect(toolbar.queryByRole("link", { name: "Back to Dashboard" })).not.toBeInTheDocument();
    expect(toolbar.queryByText("PRODUCT CATALOGUE")).not.toBeInTheDocument();
  });

  it("shows the uploaded online cover without a green overlay and preserves product navigation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({
      ...publicCatalogue, online_cover: { asset_id: "online-1", file_name: "finished.png", width: 900, height: 1200, url: "/api/online-cover/content" },
    }) }));
    render(<LanguageProvider><PublicCatalogueViewer token="public-token-1234567890" /></LanguageProvider>);
    const cover = await screen.findByRole("img", { name: "AIGO Catalogue online cover" });
    expect(cover).toHaveAttribute("src", "http://localhost:8000/api/online-cover/content");
    expect(cover).not.toHaveAttribute("style", expect.stringContaining("gradient"));
    expect(screen.getByRole("link", { name: /Explore products/ })).toHaveAttribute("href", "#category-accessories");
    fireEvent.error(cover);
    expect(await screen.findByRole("heading", { name: "AIGO Catalogue" })).toBeVisible();
    expect(screen.queryByRole("img", { name: "AIGO Catalogue online cover" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore products/ })).toHaveAttribute("data-catalogue-explore", "true");
  });

  it("adds an online cover without replacing the first product page when Studio has no cover page", async () => {
    const catalogue = { ...publicCatalogue, studio_design_id: "studio-no-cover", online_cover: { asset_id: "online-1", file_name: "finished.png", width: 900, height: 1200, url: "/api/cover" } };
    const design = { id: "studio-no-cover", catalogue_type: "standard", pages: [{ id: "products", page_type: "product_grid", page_name: "Products", width: 794, height: 1123, is_visible: true, page_data_json: { elements: [] } }] };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve({ ok: true, status: 200, json: async () => String(input).endsWith("/studio") ? design : catalogue })));
    render(<LanguageProvider><PublicCatalogueViewer token="public-token-1234567890" /></LanguageProvider>);
    const productsPage = await screen.findByRole("region", { name: "Page 1: Products" });
    expect(await screen.findByRole("img", { name: "AIGO Catalogue online cover" })).toBeInTheDocument();
    expect(within(productsPage).queryByRole("img", { name: "AIGO Catalogue online cover" })).not.toBeInTheDocument();
    expect(within(productsPage).getByTestId("rendered-studio-page-1")).toHaveTextContent("Products");
  });

  it("defensively hides inactive products and lifecycle controls on public links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...publicCatalogue,
        product_count: 2,
        categories: [{ ...publicCatalogue.categories![0], product_count: 2 }],
        products: [
          { ...publicCatalogue.products[0], product_status: "active" },
          {
            ...publicCatalogue.products[0],
            id: "inactive-public-product",
            code: "AIGO-INACTIVE",
            name: "Inactive public product",
            name_en: "Inactive public product",
            product_status: "inactive",
          },
        ],
      }),
    }));

    render(
      <LanguageProvider>
        <PublicCatalogueViewer token="inactive-product-token" />
      </LanguageProvider>,
    );

    expect(await screen.findByText("Cooling Fan")).toBeInTheDocument();
    expect(screen.queryByText("Inactive public product")).not.toBeInTheDocument();
    expect(screen.queryByText("INACTIVE")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("keeps customer levels hidden while applying their prices", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...publicCatalogue,
          customer_name: "Siam Retail Co.",
        }),
      }),
    );

    render(
      <LanguageProvider>
        <PublicCatalogueViewer token="public-token-1234567890" />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: "AIGO Catalogue" });
    expect(screen.queryByText("VIP Province")).not.toBeInTheDocument();
    expect(screen.queryByText("VIP")).not.toBeInTheDocument();
    expect(screen.getByText("Prices for Siam Retail Co.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Correct brand prices are applied automatically from this secure link.",
      ),
    ).toBeInTheDocument();
    const retailPrice = screen.getByLabelText(/Retail price: THB\s*199\.00/);
    expect(retailPrice).toBeInTheDocument();
    expect(retailPrice).toHaveTextContent("Retail price");
    const categorySidebar = screen.getByRole("complementary", {
      name: "Catalogue categories",
    });
    expect(
      within(categorySidebar).getByRole("link", { name: /Accessories/ }),
    ).toHaveAttribute("href", "#category-accessories");
    await waitFor(() => expect(document.title).toBe("AIGO Catalogue | GMS Catalogue"));
  });

  it("shows the Ceflar brand image instead of catalogue initials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...publicCatalogue,
          title: "Ceflar Smart Home Catalogue",
          products: [{ ...publicCatalogue.products[0], brand: "Ceflar" }],
        }),
      }),
    );

    render(
      <LanguageProvider>
        <PublicCatalogueViewer token="ceflar-public-token" />
      </LanguageProvider>,
    );

    const logo = await screen.findByRole("img", {
      name: "Ceflar Smart Home Catalogue brand",
    });
    expect(logo).toHaveAttribute(
      "src",
      "https://pim-cdn0.ofm.co.th/brands/original/64acffd8f41e6df81f5a0d0a.jpg",
    );
    expect(screen.queryByText("CE")).not.toBeInTheDocument();
  });

  it("renders every visible standard Studio page in the published catalogue", async () => {
    const studioCatalogue = { ...publicCatalogue, studio_design_id: "studio-design-1" };
    const studioDesign = {
      id: "studio-design-1",
      catalogue_type: "standard",
      pages: [
        { id: "page-1", page_type: "cover", page_name: "Cover", width: 794, height: 1123, is_visible: true, page_data_json: { elements: [] } },
        { id: "page-2", page_type: "product_grid", page_name: "Products", width: 794, height: 1123, is_visible: true, page_data_json: { elements: [] } },
        { id: "page-3", page_type: "free_layout", page_name: "Internal notes", width: 794, height: 1123, is_visible: false, page_data_json: { elements: [] } },
      ],
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/studio")) return Promise.resolve({ ok: true, status: 200, json: async () => studioDesign });
      if (url.includes("/pdf")) return new Promise(() => undefined);
      return Promise.resolve({ ok: true, status: 200, json: async () => studioCatalogue });
    }));

    render(
      <LanguageProvider>
        <PublicCatalogueViewer token="studio-public-token" />
      </LanguageProvider>,
    );

    expect(await screen.findByRole("region", { name: "Page 1: Cover" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Page 2: Products" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Page 3: Internal notes" })).not.toBeInTheDocument();
    expect(screen.getAllByTestId("rendered-studio-page-1")[1]).toHaveTextContent("Cover");
    expect(screen.getByTestId("rendered-studio-page-2")).toHaveTextContent("Products");
    expect(screen.getByRole("img", { name: "AIGO Catalogue cover preview" })).toContainElement(screen.getAllByTestId("rendered-studio-page-1")[0]);
  });

  it("places active promotion navigation before products without treating it as a category", async () => {
    const studioCatalogue = { ...publicCatalogue, studio_design_id: "studio-design-promotion" };
    const studioDesign = {
      id: "studio-design-promotion",
      catalogue_type: "standard",
      pages: [
        { id: "cover", page_type: "cover", page_name: "Cover", width: 794, height: 1123, is_visible: true, page_data_json: { elements: [] } },
        { id: "promotion", page_type: "promotion", page_name: "New Year Sale", width: 794, height: 1123, is_visible: true, page_data_json: { navigationCategory: "Do not show as category", elements: [] } },
        { id: "products", page_type: "product_grid", page_name: "Products", width: 794, height: 1123, is_visible: true, page_data_json: { navigationCategory: "Accessories", elements: [] } },
      ],
    };
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/studio")) return Promise.resolve({ ok: true, status: 200, json: async () => studioDesign });
      if (url.includes("/pdf")) return new Promise(() => undefined);
      return Promise.resolve({ ok: true, status: 200, json: async () => studioCatalogue });
    }));

    render(
      <LanguageProvider>
        <PublicCatalogueViewer token="studio-promotion-token" />
      </LanguageProvider>,
    );

    const promotionLink = await screen.findByRole("link", { name: "New Year Sale" });
    const sidebar = screen.getByRole("complementary", { name: "Catalogue categories" });
    expect(within(sidebar).getByRole("link", { name: "New Year Sale" })).toBe(promotionLink);
    expect(within(sidebar).queryByText("Do not show as category")).not.toBeInTheDocument();
    expect(within(sidebar).queryByRole("link", { name: /All Products/ })).not.toBeInTheDocument();
  });

  it("uses the saved cover asset in the sidebar and as the hero background without repeating the description", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...publicCatalogue,
        cover: { assets: [{ asset_type: "full_cover", file_url: "/media/aigo-cover.jpg", preview_url: "" }] },
      }),
    }));

    const { container } = render(
      <LanguageProvider>
        <PublicCatalogueViewer token="catalogue-with-cover" />
      </LanguageProvider>,
    );

    const cover = await screen.findByRole("img", { name: "AIGO Catalogue cover" });
    expect(cover).toHaveAttribute("src", "http://localhost:8000/media/aigo-cover.jpg");
    const coverArtwork = container.querySelector('[data-catalogue-cover-artwork="true"]');
    expect(coverArtwork).toHaveAttribute(
      "src",
      "http://localhost:8000/media/aigo-cover.jpg",
    );
    // Production defect: a saved logo-like cover asset can be rendered as a
    // separate foreground rectangle instead of filling the cover background.
    expect(coverArtwork?.closest("section")).toHaveAttribute(
      "data-logo-layout",
      "background-watermark",
    );
    expect(screen.queryByText("Current AIGO products.")).not.toBeInTheDocument();
  });

  it("uses an available brand logo as a decorative cover watermark", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...publicCatalogue,
        cover: {
          assets: [{
            asset_type: "brand_logo",
            file_url: "/media/aigo-logo.png",
            preview_url: "",
          }],
        },
      }),
    }));

    const { container } = render(
      <LanguageProvider>
        <PublicCatalogueViewer token="catalogue-with-brand-logo" />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: "AIGO Catalogue" });
    const watermark = container.querySelector(
      '[data-catalogue-brand-watermark="true"]',
    );
    expect(watermark).toHaveAttribute(
      "src",
      "http://localhost:8000/media/aigo-logo.png",
    );
    expect(watermark).toHaveAttribute("aria-hidden", "true");
    // Production defect: the brand logo can regress into a separate foreground
    // panel instead of acting as the cover's decorative background watermark.
    expect(watermark?.closest("section")).toHaveAttribute(
      "data-logo-layout",
      "background-watermark",
    );
  });

  it("keeps the generated cover free of a watermark when no brand logo exists", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => publicCatalogue,
    }));

    const { container } = render(
      <LanguageProvider>
        <PublicCatalogueViewer token="catalogue-without-brand-logo" />
      </LanguageProvider>,
    );

    await screen.findByRole("heading", { name: "AIGO Catalogue" });
    expect(
      container.querySelector('[data-catalogue-brand-watermark="true"]'),
    ).not.toBeInTheDocument();
  });

  it("uses the exact neutral reference card for every product and ignores legacy theme data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...publicCatalogue,
        product_card_style: "erp_detail",
        product_card_theme: {
          key: "existing-aigo-theme",
          variant: "rounded",
          accent_color: "#fff45a",
          strong_color: "#176536",
          surface_color: "#f8ffd8",
          border_color: "#d9e3ba",
          text_color: "#263425",
        },
        product_count: 2,
        categories: [{ ...publicCatalogue.categories![0], product_count: 2 }],
        products: [
          {
            ...publicCatalogue.products[0],
            id: "product-a",
            barcode: "8850000000001",
            stock_quantity: 24,
            erp_details: { model: "CFX-M1", pack_size: "16", warranty: "2 years" },
          },
          {
            ...publicCatalogue.products[0],
            id: "product-b",
            code: "AIGO-002",
            name: "Cooling Fan Pro",
            name_en: "Cooling Fan Pro",
            barcode: "8850000000002",
            stock_quantity: 8,
          },
        ],
      }),
    }));

    const { container } = render(
      <LanguageProvider>
        <PublicCatalogueViewer token="catalogue-card-contract" />
      </LanguageProvider>,
    );

    const facts = await screen.findAllByLabelText("Product stock and pricing");
    expect(facts).toHaveLength(2);
    expect(within(facts[0]).getByText("Barcode")).toBeInTheDocument();
    expect(within(facts[0]).getByText("Stock")).toBeInTheDocument();
    expect(within(facts[0]).getByText("Wholesale price")).toBeInTheDocument();
    expect(screen.getByText("CFX-M1", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("2 years", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Pack size: 16")).not.toBeInTheDocument();

    const cards = Array.from(container.querySelectorAll("[data-catalogue-product-card]"));
    expect(cards).toHaveLength(2);
    expect(cards.every((card) => card.getAttribute("data-card-template") === "catalogue-reference")).toBe(true);
    expect(cards.every((card) => card.getAttribute("data-card-style") === null)).toBe(true);
    expect(cards.every((card) => card.getAttribute("data-colour-index") === null)).toBe(true);
    expect(cards.every((card) => card.getAttribute("style") === null)).toBe(true);
  });

  it("does not repeat the product code and brand below the live-data table", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...publicCatalogue,
        products: [{
          ...publicCatalogue.products[0],
          code: "GLINK-FOOTER-001",
          brand: "Footer-only brand",
          erp_details: { model: "GLC010 220ML", warranty: "1 year" },
        }],
      }),
    }));

    render(
      <LanguageProvider>
        <PublicCatalogueViewer token="catalogue-without-identity-footer" />
      </LanguageProvider>,
    );

    await screen.findByLabelText("Product stock and pricing");
    expect(screen.queryByText("GLINK-FOOTER-001")).not.toBeInTheDocument();
    expect(screen.queryByText("Footer-only brand")).not.toBeInTheDocument();
  });

  it("shows all image controls in a protected generated catalogue", async () => {
    let catalogueRequests = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/media/front.png")) {
        return Promise.resolve(
          new Response(new Blob(["original image"], { type: "image/png" }), {
            status: 200,
            headers: { "Content-Type": "image/png" },
          }),
        );
      }
      if (url.includes("/v1/public/catalogues/")) {
        catalogueRequests += 1;
        if (catalogueRequests === 1) {
          return Promise.resolve({ ok: false, status: 401, json: async () => ({}) });
        }
        expect(init?.headers).toEqual({ "X-Catalogue-Password": "catalogue-secret" });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            ...publicCatalogue,
            password_protected: true,
            products: [{
              ...publicCatalogue.products[0],
              main_image_url: "/media/front.png",
              image_urls: ["/media/front.png", "/media/back.jpg"],
            }],
          }),
        });
      }
      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <LanguageProvider>
        <PublicCatalogueViewer token="protected-catalogue-token" />
      </LanguageProvider>,
    );

    fireEvent.change(await screen.findByPlaceholderText("Catalogue password"), {
      target: { value: "catalogue-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Open catalogue" }));

    const opener = await screen.findByRole("button", {
      name: "View and download images for Cooling Fan",
    });
    fireEvent.click(opener);
    expect(screen.getByRole("dialog", { name: "Cooling Fan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close image preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download image" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next image" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Download image" }));
    await waitFor(() => {
      const imageRequest = fetchMock.mock.calls.find(([request]) =>
        String(request).endsWith("/media/front.png"),
      );
      expect(imageRequest?.[1]?.headers).toEqual({
        "X-Catalogue-Password": "catalogue-secret",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Close image preview" }));
    expect(opener).toHaveFocus();
  });
});
