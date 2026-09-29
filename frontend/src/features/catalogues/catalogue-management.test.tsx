import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CatalogueManagement,
  catalogueCardShareLinks,
  catalogueLinkLabel,
} from "@/features/catalogues/catalogue-management";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  getCatalogues: vi.fn(),
  getPriceLists: vi.fn(),
  getProducts: vi.fn(),
  getCatalogueBrandOptions: vi.fn(),
  getCatalogueAudienceTypes: vi.fn(),
  getCatalogueCardLinks: vi.fn(),
  getCatalogueOnlineLinks: vi.fn(),
  getCatalogue: vi.fn(),
  getCatalogueVersions: vi.fn(),
  publishCatalogue: vi.fn(),
  unpublishCatalogue: vi.fn(),
  createCatalogue: vi.fn(),
  deleteCatalogue: vi.fn(),
  generateErpBrandCatalogues: vi.fn(),
  saveBrand: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  getCatalogues: mocks.getCatalogues,
  getPriceLists: mocks.getPriceLists,
  getProducts: mocks.getProducts,
  getCatalogueBrandOptions: mocks.getCatalogueBrandOptions,
  getCatalogueAudienceTypes: mocks.getCatalogueAudienceTypes,
  getCatalogueCardLinks: mocks.getCatalogueCardLinks,
  getCatalogueOnlineLinks: mocks.getCatalogueOnlineLinks,
  archiveCatalogue: vi.fn(),
  createCatalogue: mocks.createCatalogue,
  deleteCatalogue: mocks.deleteCatalogue,
  generateErpBrandCatalogues: mocks.generateErpBrandCatalogues,
  saveBrand: mocks.saveBrand,
  downloadCatalogueExport: vi.fn(),
  duplicateCatalogue: vi.fn(),
  getCatalogue: mocks.getCatalogue,
  getCatalogueVersions: mocks.getCatalogueVersions,
  publishCatalogue: mocks.publishCatalogue,
  unpublishCatalogue: mocks.unpublishCatalogue,
  setCatalogueProducts: vi.fn(),
  updateCatalogue: vi.fn(),
}));

const catalogue = {
  id: "catalogue-1",
  title: "Retail Beverage Guide",
  slug: "retail-beverage-guide",
  description: "A customer-ready beverage catalogue.",
  brand: "Mori",
  audience: "Company Customers",
  price_list_id: 1,
  price_list_name: "Normal",
  show_prices: true,
  currency: "THB",
  language: "en" as const,
  status: "published" as const,
  version: 3,
  revision: 4,
  valid_from: null,
  valid_until: null,
  is_public: false,
  public_access_enabled: true,
  owner_id: null,
  product_count: 12,
  products: [],
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-03T00:00:00Z",
  published_at: "2026-08-03T00:00:00Z",
};

const alphaCatalogue = {
  ...catalogue,
  id: "catalogue-2",
  title: "Alpha Catalogue",
  slug: "alpha-catalogue",
  product_count: 4,
  updated_at: "2026-08-02T00:00:00Z",
};

const draftCatalogue = {
  ...catalogue,
  id: "catalogue-3",
  title: "Work in Progress Catalogue",
  slug: "work-in-progress-catalogue",
  status: "draft" as const,
  public_access_enabled: false,
  published_at: null,
};

describe("catalogueLinkLabel", () => {
  it.each([
    ["SP1 · Normal", "Normal"],
    ["SP2 · VIP", "VIP BKK"],
    ["SP3 · Big Customer", "Big Customer"],
    ["SRP · Retail", "Retail"],
    ["SP5 · Dealer", "Dealer"],
    ["SP6 · Wholesale", "Wholesale"],
    ["SP7 · VVIP", "VVIP"],
    ["VIP Province", "VIP Province"],
    ["No Price", "No Price"],
  ])("shows %s as %s", (source, expected) => {
    expect(catalogueLinkLabel(source)).toBe(expected);
  });
});

describe("catalogueCardShareLinks", () => {
  const normalLink = {
    id: "normal",
    audience_code: "normal",
    show_prices: true,
  } as never;
  const vipLink = {
    id: "vip",
    audience_code: "vip",
    show_prices: true,
  } as never;
  const noPriceLink = {
    id: "catalog",
    audience_code: "no_price",
    show_prices: false,
  } as never;
  const vvipLink = {
    id: "vvip",
    audience_code: "vvip",
    audience_name: "VVIP",
    price_list_name: "SP7",
    show_prices: true,
  } as never;

  it("shows only one no-price link for an unpriced booklet", () => {
    expect(catalogueCardShareLinks(
      { catalogue_type: "booklet", show_prices: false },
      [normalLink, vipLink, noPriceLink],
    )).toEqual([noPriceLink]);
  });

  it("shows only Normal and No Price links for every brand catalogue", () => {
    expect(catalogueCardShareLinks(
      { catalogue_type: "booklet", show_prices: true },
      [vipLink, noPriceLink, normalLink],
    )).toEqual([normalLink, noPriceLink]);
    expect(catalogueCardShareLinks(
      { catalogue_type: "standard", show_prices: false },
      [vipLink, noPriceLink, normalLink],
    )).toEqual([normalLink, noPriceLink]);
  });

  it.each(["GLINK", "GLINK-CCTV1", "LUMIRA", "LUMIRA SOLAR"])(
    "adds the SP7 VVIP link for the %s brand family",
    (brand) => {
      // Production defect: GLINK and LUMIRA cards hide the existing VVIP/SP7
      // audience link, leaving only the normal and no-price choices.
      expect(catalogueCardShareLinks(
        { catalogue_type: "standard", show_prices: true, brand },
        [vvipLink, noPriceLink, normalLink],
      )).toEqual([normalLink, vvipLink, noPriceLink]);
    },
  );
});

describe("CatalogueManagement preview action", () => {
  beforeEach(() => {
    mocks.getCatalogues.mockResolvedValue([catalogue]);
    mocks.getPriceLists.mockResolvedValue([]);
    mocks.getProducts.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      pages: 1,
    });
    mocks.getCatalogueBrandOptions.mockResolvedValue([
      { id: 1, name: "Mori", code: "MORI", product_count: 12 },
    ]);
    mocks.getCatalogueAudienceTypes.mockResolvedValue([]);
    mocks.getCatalogueCardLinks.mockResolvedValue({});
    mocks.getCatalogueOnlineLinks.mockResolvedValue({});
    mocks.getCatalogue.mockResolvedValue(catalogue);
    mocks.getCatalogueVersions.mockResolvedValue([]);
    mocks.publishCatalogue.mockResolvedValue({
      id: "version-4",
      catalogue_id: catalogue.id,
      version_number: 4,
      snapshot: {},
      published_by_id: "user-publisher",
      published_at: "2026-09-29T00:00:00Z",
    });
    mocks.unpublishCatalogue.mockResolvedValue({
      ...catalogue,
      status: "draft",
      public_access_enabled: false,
      revision: catalogue.revision + 1,
    });
    mocks.createCatalogue.mockResolvedValue({
      ...catalogue,
      id: "catalogue-created",
      title: "New priced catalogue",
      status: "draft",
      version: 0,
      product_count: 0,
      products: [],
      published_at: null,
    });
    mocks.deleteCatalogue.mockResolvedValue(undefined);
    mocks.generateErpBrandCatalogues.mockResolvedValue({
      created: 136,
      updated: 0,
      brand_count: 136,
      product_count: 22888,
      products_with_images: 14015,
      products_missing_images: 8873,
      category_setting_count: 1264,
      customer_level_count: 7,
      legacy_category_rows: 95,
      legacy_matched_brands: 5,
      cover_count: 136,
      covers_with_erp_image: 121,
      covers_with_fallback_design: 15,
      warnings: [],
    });
    mocks.saveBrand.mockResolvedValue({
      id: 22,
      name: "Aurora Home",
      code: "AURORA_HOME",
      description: "New home brand",
      is_active: true,
      team_count: 0,
    });
  });

  it("opens the dedicated preview route instead of edit mode", async () => {
    render(
      <CatalogueManagement
        currentUser={{
          id: "user-1",
          username: "catalogue.manager",
          email: "manager@example.com",
          full_name: "Catalogue Manager",
          roles: [],
          permissions: ["catalogues.view", "catalogues.preview"],
        }}
        onToast={vi.fn()}
      />,
    );
    expect(
      await screen.findByText("Retail Beverage Guide"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More catalogue actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Preview" }));
    expect(mocks.push).toHaveBeenCalledWith("/catalogues/catalogue-1/preview");
  });

  it("keeps a baseline viewer on the readable catalogue preview", async () => {
    mocks.getCatalogues.mockResolvedValue([
      {
        ...catalogue,
        studio_design_id: "design-1",
        studio_preview_href: "/catalogue-studio/design-1/preview",
      },
    ]);

    render(
      <CatalogueManagement
        currentUser={{
          id: "basic-user",
          username: "basic.user",
          email: "basic.user@example.com",
          full_name: "Basic User",
          roles: [],
          permissions: [],
        }}
        onToast={vi.fn()}
      />,
    );

    expect(await screen.findByText("Retail Beverage Guide")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Preview" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More catalogue actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Preview" }));
    expect(mocks.push).toHaveBeenCalledWith("/catalogues/catalogue-1/preview");
  });

  it("lets a baseline viewer open the published customer catalogue online", async () => {
    mocks.getCatalogueOnlineLinks.mockResolvedValue({
      [catalogue.id]: "http://example.test/c/published-normal-token",
    });

    render(
      <CatalogueManagement
        currentUser={{
          id: "basic-online-user",
          username: "basic.online",
          email: "basic.online@example.com",
          full_name: "Basic Online User",
          roles: [],
          permissions: [],
        }}
        onToast={vi.fn()}
      />,
    );

    await screen.findByText("Retail Beverage Guide");
    expect(screen.queryByRole("link", { name: "View online" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More catalogue actions" }));
    const onlineLink = await screen.findByRole("menuitem", { name: "View online" });
    expect(mocks.getCatalogueOnlineLinks).toHaveBeenCalledOnce();
    expect(onlineLink).toHaveAttribute(
      "href",
      "http://example.test/c/published-normal-token",
    );
    expect(onlineLink).toHaveAttribute("target", "_blank");
    expect(onlineLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("opens Catalogue Studio in a safe new tab", async () => {
    render(<CatalogueManagement currentUser={{ id:"studio-user", username:"studio", email:"studio@example.com", full_name:"Studio User", roles:[], permissions:["catalogues.view","catalogues.edit"] }} onToast={vi.fn()} />);
    await screen.findByText("Retail Beverage Guide");
    expect(screen.queryByRole("link", { name: "Open Studio" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "More catalogue actions" }));
    const studio = await screen.findByRole("menuitem", { name: "Open Studio" });
    expect(studio).toHaveAttribute("href", "/catalogues/catalogue-1/studio");
    expect(studio).toHaveAttribute("target", "_blank");
    expect(studio).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps only the approved catalogue card information", async () => {
    render(<CatalogueManagement currentUser={{ id:"metadata-user", username:"metadata", email:"metadata@example.com", full_name:"Metadata User", roles:[], permissions:["catalogues.view", "catalogue_share_links.view"] }} onToast={vi.fn()} />);

    const title = await screen.findByRole("heading", { level: 3, name: "Retail Beverage Guide" });
    const card = title.closest("article");
    expect(card).not.toBeNull();
    expect(within(card!).getByText("12")).toBeInTheDocument();
    expect(within(card!).getByText("products")).toBeInTheDocument();
    expect(within(card!).getByText("Published")).toBeInTheDocument();
    expect(within(card!).getByText(/Updated/)).toBeInTheDocument();
    expect(within(card!).getByRole("button", { name: "Catalogue links for Retail Beverage Guide" })).toBeInTheDocument();
    expect(within(card!).getByRole("button", { name: "More catalogue actions" })).toBeInTheDocument();
    expect(within(card!).queryByText("version")).not.toBeInTheDocument();
    expect(within(card!).queryByText("pricing")).not.toBeInTheDocument();
    expect(within(card!).queryByText("MO")).not.toBeInTheDocument();
    expect(within(card!).queryByText("Catalogue")).not.toBeInTheDocument();
    expect(within(card!).queryByText("Product Catalogue")).not.toBeInTheDocument();
    expect(within(card!).queryByText("Mori · Company Customers")).not.toBeInTheDocument();
    expect(within(card!).queryByText("A customer-ready beverage catalogue.")).not.toBeInTheDocument();
  });

  it("shows lifecycle actions from public access and draft state", async () => {
    const liveDraft = {
      ...catalogue,
      id: "catalogue-live-draft",
      title: "Catalogue With Pending Changes",
      status: "draft" as const,
      public_access_enabled: true,
    };
    const neverPublished = {
      ...draftCatalogue,
      id: "catalogue-never-published",
      title: "New Catalogue",
      version: 0,
    };
    mocks.getCatalogues.mockResolvedValue([catalogue, liveDraft, neverPublished]);

    render(
      <CatalogueManagement
        currentUser={{
          id: "publisher",
          username: "publisher",
          email: "publisher@example.com",
          full_name: "Publisher",
          roles: ["sales_manager"],
          permissions: ["catalogues.view", "catalogues.publish"],
        }}
        onToast={vi.fn()}
      />,
    );

    const publishedCard = (await screen.findByText("Retail Beverage Guide")).closest("article")!;
    fireEvent.click(within(publishedCard).getByRole("button", { name: "More catalogue actions" }));
    expect(within(publishedCard).getByRole("menuitem", { name: "Unpublish catalogue" })).toBeInTheDocument();
    expect(within(publishedCard).queryByRole("menuitem", { name: "Publish catalogue" })).not.toBeInTheDocument();

    const liveDraftCard = screen.getByText("Catalogue With Pending Changes").closest("article")!;
    fireEvent.click(within(liveDraftCard).getByRole("button", { name: "More catalogue actions" }));
    expect(within(liveDraftCard).getByRole("menuitem", { name: "Publish changes" })).toBeInTheDocument();
    expect(within(liveDraftCard).getByRole("menuitem", { name: "Unpublish catalogue" })).toBeInTheDocument();

    const newCard = screen.getByText("New Catalogue").closest("article")!;
    fireEvent.click(within(newCard).getByRole("button", { name: "More catalogue actions" }));
    expect(within(newCard).getByRole("menuitem", { name: "Publish catalogue" })).toBeInTheDocument();
    expect(within(newCard).queryByRole("menuitem", { name: "Unpublish catalogue" })).not.toBeInTheDocument();
  });

  it("confirms unpublishing and updates the card without revoking its links", async () => {
    const onToast = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <CatalogueManagement
        currentUser={{
          id: "sales-admin",
          username: "sales.admin",
          email: "sales.admin@example.com",
          full_name: "Sales Admin",
          roles: ["sales_manager"],
          permissions: ["catalogues.view", "catalogues.publish"],
        }}
        onToast={onToast}
      />,
    );

    const card = (await screen.findByText("Retail Beverage Guide")).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "More catalogue actions" }));
    fireEvent.click(within(card).getByRole("menuitem", { name: "Unpublish catalogue" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("All customer links will stop working immediately"));
    await waitFor(() => expect(mocks.unpublishCatalogue).toHaveBeenCalledWith(catalogue.id));
    expect(within(card).getByText("Draft")).toBeInTheDocument();
    expect(onToast).toHaveBeenCalledWith("Catalogue unpublished. Customer links are now suspended.");
  });

  it("hides lifecycle actions without catalogue publish permission", async () => {
    render(
      <CatalogueManagement
        currentUser={{
          id: "viewer",
          username: "viewer",
          email: "viewer@example.com",
          full_name: "Viewer",
          roles: [],
          permissions: ["catalogues.view"],
        }}
        onToast={vi.fn()}
      />,
    );

    const card = (await screen.findByText("Retail Beverage Guide")).closest("article")!;
    fireEvent.click(within(card).getByRole("button", { name: "More catalogue actions" }));
    expect(within(card).queryByRole("menuitem", { name: "Publish catalogue" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("menuitem", { name: "Publish changes" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("menuitem", { name: "Unpublish catalogue" })).not.toBeInTheDocument();
  });

  it("sorts catalogue cards alphabetically in both directions", async () => {
    mocks.getCatalogues.mockResolvedValue([catalogue, alphaCatalogue]);

    render(
      <CatalogueManagement
        currentUser={{
          id: "user-sort",
          username: "catalogue.viewer",
          email: "viewer@example.com",
          full_name: "Catalogue Viewer",
          roles: [],
          permissions: ["catalogues.view"],
        }}
        onToast={vi.fn()}
      />,
    );

    await screen.findByText("Alpha Catalogue");
    const cardTitles = () =>
      screen
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent);

    expect(cardTitles()).toEqual(["Alpha Catalogue", "Retail Beverage Guide"]);

    fireEvent.change(
      screen.getByRole("combobox", { name: "Sort catalogues" }),
      {
        target: { value: "za" },
      },
    );

    expect(cardTitles()).toEqual(["Retail Beverage Guide", "Alpha Catalogue"]);
  });

  // Regression: the search input previously updated only its draft value, so
  // catalogue cards stayed unchanged until the separate Apply filters button
  // was pressed.
  it("filters catalogue cards immediately as the search is typed", async () => {
    mocks.getCatalogues.mockResolvedValue([catalogue, alphaCatalogue]);

    render(
      <CatalogueManagement
        currentUser={{
          id: "user-search",
          username: "catalogue.viewer",
          email: "viewer@example.com",
          full_name: "Catalogue Viewer",
          roles: [],
          permissions: ["catalogues.view"],
        }}
        onToast={vi.fn()}
      />,
    );

    await screen.findByText("Retail Beverage Guide");
    expect(screen.getByText("Alpha Catalogue")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Search catalogues"), {
      target: { value: "alpha" },
    });

    expect(screen.getByText("Alpha Catalogue")).toBeInTheDocument();
    expect(screen.queryByText("Retail Beverage Guide")).not.toBeInTheDocument();
  });

  it("loads price links for catalogue cards on every pagination page", async () => {
    const manyCatalogues = Array.from({ length: 20 }, (_, index) => ({
      ...catalogue,
      id: `catalogue-${String(index + 1).padStart(2, "0")}`,
      title: `Brand ${String(index + 1).padStart(2, "0")} Catalogue`,
    }));
    const secondPageCatalogue = manyCatalogues[18];
    mocks.getCatalogues.mockResolvedValue(manyCatalogues);
    mocks.getCatalogueCardLinks.mockResolvedValue({
      [secondPageCatalogue.id]: [
        {
          id: "link-page-2",
          catalogue_id: secondPageCatalogue.id,
          audience_type_id: 1,
          audience_code: "normal",
          audience_name: "Normal",
          price_list_id: 1,
          price_list_name: "SP1",
          show_prices: true,
          button_style_key: "normal",
          status: "active",
          version_mode: "latest_published",
          fixed_version_number: null,
          expires_at: null,
          has_password: false,
          allow_pdf_download: true,
          allow_print: true,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
          last_accessed_at: null,
          view_count: 0,
          public_url: "http://example.test/catalogue-page-2",
        },
      ],
    });

    render(
      <CatalogueManagement
        currentUser={{
          id: "user-links",
          username: "catalogue.links",
          email: "links@example.com",
          full_name: "Catalogue Links",
          roles: [],
          permissions: [
            "catalogues.view",
            "catalogue_share_links.view",
            "catalogue_share_links.copy",
          ],
        }}
        onToast={vi.fn()}
      />,
    );

    await screen.findByText("Brand 01 Catalogue");
    await waitFor(() => expect(mocks.getCatalogueCardLinks).toHaveBeenCalledWith());
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Brand 19 Catalogue")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Catalogue links for Brand 19 Catalogue",
      }),
    );
    expect(screen.getByTitle(/Open Price catalogue/)).toBeInTheDocument();
  });

  it("opens a catalogue card link in a new tab instead of copying it", async () => {
    // Regression guard: quick-link buttons must launch the customer catalogue;
    // restoring the old clipboard handler would leave window.open untouched.
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    mocks.getCatalogueCardLinks.mockResolvedValue({
      [catalogue.id]: [
        {
          id: "link-normal",
          catalogue_id: catalogue.id,
          audience_type_id: 1,
          audience_code: "normal",
          audience_name: "Normal",
          price_list_id: 1,
          price_list_name: "SP1",
          show_prices: true,
          button_style_key: "normal",
          status: "active",
          version_mode: "latest_published",
          fixed_version_number: null,
          expires_at: null,
          has_password: false,
          allow_pdf_download: true,
          allow_print: true,
          created_at: "2026-08-01T00:00:00Z",
          updated_at: "2026-08-01T00:00:00Z",
          last_accessed_at: null,
          view_count: 0,
          public_url: "http://example.test/catalogue-normal",
        },
      ],
    });

    render(
      <CatalogueManagement
        currentUser={{
          id: "user-dropdown",
          username: "catalogue.dropdown",
          email: "dropdown@example.com",
          full_name: "Catalogue Dropdown",
          roles: [],
          permissions: [
            "catalogues.view",
            "catalogue_share_links.view",
            "catalogue_share_links.copy",
          ],
        }}
        onToast={vi.fn()}
      />,
    );

    const dropdown = await screen.findByRole("button", {
      name: "Catalogue links for Retail Beverage Guide",
    });
    expect(dropdown).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTitle(/Open Price catalogue/)).not.toBeInTheDocument();

    fireEvent.click(dropdown);

    expect(dropdown).toHaveAttribute("aria-expanded", "true");
    const normalLinkButton = document.querySelector<HTMLButtonElement>(
      'button[data-style="normal"]',
    );
    expect(normalLinkButton).toBeEnabled();
    expect(normalLinkButton).toHaveTextContent("Price");
    expect(normalLinkButton).not.toHaveTextContent("Normal");
    expect(normalLinkButton).toHaveAttribute(
      "title",
      "Open Price catalogue using SP1 in a new tab",
    );

    fireEvent.click(normalLinkButton!);

    expect(openWindow).toHaveBeenCalledWith(
      "http://example.test/catalogue-normal",
      "_blank",
      "noopener,noreferrer",
    );

    fireEvent.click(dropdown);

    expect(dropdown).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTitle(/Open Price catalogue/)).not.toBeInTheDocument();
  });

  it("filters catalogue cards from the summary buttons and status dropdown", async () => {
    mocks.getCatalogues.mockResolvedValue([catalogue, draftCatalogue]);

    render(
      <CatalogueManagement
        currentUser={{
          id: "user-filter",
          username: "catalogue.viewer",
          email: "viewer@example.com",
          full_name: "Catalogue Viewer",
          roles: [],
          permissions: ["catalogues.view"],
        }}
        onToast={vi.fn()}
      />,
    );

    await screen.findByText("Work in Progress Catalogue");
    fireEvent.click(screen.getByRole("button", { name: /Published/ }));
    expect(screen.getByText("Retail Beverage Guide")).toBeInTheDocument();
    expect(
      screen.queryByText("Work in Progress Catalogue"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /In progress/ }));
    expect(screen.queryByText("Retail Beverage Guide")).not.toBeInTheDocument();
    expect(screen.getByText("Work in Progress Catalogue")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("combobox", { name: "Catalogue status" }),
      { target: { value: "" } },
    );
    expect(screen.getByText("Retail Beverage Guide")).toBeInTheDocument();
    expect(screen.getByText("Work in Progress Catalogue")).toBeInTheDocument();
  });

  it("does not expose the retired guided catalogue creator", async () => {
    render(
      <CatalogueManagement
        currentUser={{
          id: "user-2",
          username: "catalogue.creator",
          email: "creator@example.com",
          full_name: "Catalogue Creator",
          roles: [],
          permissions: ["catalogues.view", "catalogues.create"],
        }}
        onToast={vi.fn()}
      />,
    );

    await screen.findByText("Retail Beverage Guide");
    expect(screen.queryByRole("button", { name: "+ New catalogue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create catalogue" })).not.toBeInTheDocument();
  });

  it("shows Sales a read-only catalogue portal with only Price and No Price links", async () => {
    mocks.getCatalogues.mockResolvedValue([catalogue, draftCatalogue]);
    const salesLinks = [
      ["normal", "Normal"],
      ["vip", "VIP BKK"],
      ["big_customer", "Big Customer"],
      ["retail", "Retail"],
      ["no_price", "No Price"],
    ].map(([audienceCode, audienceName], index) => ({
      id: `sales-link-${index + 1}`,
      catalogue_id: catalogue.id,
      audience_type_id: index + 1,
      audience_code: audienceCode,
      audience_name: audienceName,
      price_list_id: index + 1,
      price_list_name: audienceName,
      show_prices: audienceCode !== "no_price",
      button_style_key: audienceCode,
      status: "active" as const,
      version_mode: "latest_published" as const,
      fixed_version_number: null,
      expires_at: null,
      has_password: false,
      allow_pdf_download: false,
      allow_print: false,
      created_at: catalogue.created_at,
      updated_at: catalogue.updated_at,
      last_accessed_at: null,
      view_count: 0,
      public_url: `http://example.test/c/sales-${index + 1}`,
    }));
    mocks.getCatalogueCardLinks.mockResolvedValue({
      [catalogue.id]: salesLinks,
    });
    render(
      <CatalogueManagement
        currentUser={{
          id: "sales-1",
          username: "sales",
          email: "sales@example.com",
          full_name: "Sales User",
          roles: ["sales_user"],
          permissions: [
            "catalogues.view",
            "catalogues.preview",
            "catalogue_share_links.view",
            "catalogue_share_links.create",
            "catalogue_share_links.copy",
          ],
        }}
        onToast={vi.fn()}
      />,
    );

    expect(await screen.findByText("Browse published catalogues and open a customer catalogue.")).toBeInTheDocument();
    expect(screen.queryByText("Work in Progress Catalogue")).not.toBeInTheDocument();
    expect(screen.queryByText("Catalogue status summary")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete catalogue" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open Studio" })).not.toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Catalogue links for Retail Beverage Guide",
      }),
    );
    const openWindow = vi.spyOn(window, "open").mockImplementation(() => null);
    const priceButton = screen.getByTitle(/Open Price catalogue/);
    const noPriceButton = screen.getByRole("button", { name: /No Price/ });
    expect(priceButton).toBeEnabled();
    expect(noPriceButton).toBeEnabled();
    fireEvent.click(priceButton);
    fireEvent.click(noPriceButton);
    expect(openWindow).toHaveBeenNthCalledWith(
      1,
      "http://example.test/c/sales-1",
      "_blank",
      "noopener,noreferrer",
    );
    expect(openWindow).toHaveBeenNthCalledWith(
      2,
      "http://example.test/c/sales-5",
      "_blank",
      "noopener,noreferrer",
    );
    expect(screen.queryByRole("button", { name: /VIP BKK/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Big Customer/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retail$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /View all links/ })).not.toBeInTheDocument();
  });

  it("deletes the selected catalogue after confirmation", async () => {
    const onToast = vi.fn();
    render(
      <CatalogueManagement
        currentUser={{
          id: "user-3",
          username: "catalogue.admin",
          email: "admin@example.com",
          full_name: "Catalogue Administrator",
          roles: [],
          permissions: ["catalogues.view", "catalogues.delete"],
        }}
        onToast={onToast}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "More catalogue actions" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Catalogue details" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete catalogue" }),
    );
    expect(mocks.deleteCatalogue).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("dialog", {
      name: "Delete this catalogue?",
    });
    expect(dialog).toHaveTextContent("Retail Beverage Guide");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete catalogue" }),
    );

    expect(mocks.deleteCatalogue).toHaveBeenCalledWith("catalogue-1");
    expect(
      await screen.findByText("No catalogues match the selected filters."),
    ).toBeInTheDocument();
    expect(onToast).toHaveBeenCalledWith("Catalogue deleted.");
  });

  it("warns that deleting a Studio-managed catalogue also deletes its source design", async () => {
    const studioCatalogue = {
      ...catalogue,
      studio_design_id: "design-1",
      description: "Created and managed in Catalogue Studio.",
    };
    mocks.getCatalogues.mockResolvedValue([studioCatalogue]);
    mocks.getCatalogue.mockResolvedValue(studioCatalogue);

    render(
      <CatalogueManagement
        currentUser={{
          id: "user-3",
          username: "catalogue.admin",
          email: "admin@example.com",
          full_name: "Catalogue Administrator",
          roles: [],
          permissions: ["catalogues.view", "catalogues.delete"],
        }}
        onToast={vi.fn()}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "More catalogue actions" }),
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Catalogue details" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Delete catalogue" }),
    );

    expect(
      await screen.findByRole("dialog", { name: "Delete this catalogue?" }),
    ).toHaveTextContent(
      "The Catalogue Studio design will also be permanently deleted.",
    );
  });

  it("generates all ERP brand catalogues after confirmation", async () => {
    const onToast = vi.fn();
    render(
      <CatalogueManagement
        currentUser={{
          id: "user-4",
          username: "catalogue.generator",
          email: "generator@example.com",
          full_name: "Catalogue Generator",
          roles: [],
          permissions: [
            "catalogues.view",
            "catalogues.create",
            "catalogues.edit",
          ],
        }}
        onToast={onToast}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Generate all ERP brands" }),
    );
    expect(mocks.generateErpBrandCatalogues).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog", {
      name: "Generate catalogues for every ERP brand?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Generate catalogues" }),
    );
    await waitFor(() =>
      expect(mocks.generateErpBrandCatalogues).toHaveBeenCalledOnce(),
    );
    expect(onToast).toHaveBeenCalledWith(
      "Generated 136 new and refreshed 0 brand catalogues with 22888 ERP products.",
    );
  });
});
