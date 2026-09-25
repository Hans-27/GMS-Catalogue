import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { CataloguePreview } from "@/lib/api";
import { CataloguePreviewPage } from "./catalogue-preview";

const api = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  previewCatalogue: vi.fn(),
  changeProductStatus: vi.fn(),
  downloadCatalogueExport: vi.fn(),
  recordCataloguePrint: vi.fn(),
}));
const navigation = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const access = vi.hoisted(() => ({ canAccess: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

vi.mock("@/lib/api", () => ({
  API_ORIGIN: "http://127.0.0.1:8000",
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.status = status;
    }
  },
  getCurrentUser: api.getCurrentUser,
  previewCatalogue: api.previewCatalogue,
  changeProductStatus: api.changeProductStatus,
  downloadCatalogueExport: api.downloadCatalogueExport,
  recordCataloguePrint: api.recordCataloguePrint,
}));

vi.mock("@/lib/access", () => ({
  canAccess: access.canAccess,
  isSuperAdmin: (user: { is_superadmin?: boolean } | null) => Boolean(user?.is_superadmin),
}));
vi.mock("@/lib/clipboard", () => ({ copyTextToClipboard: vi.fn() }));

const preview = {
  id: "catalogue-1",
  version: 1,
  title: "Adapter Catalogue",
  description: "Adapters",
  audience: "Normal",
  language: "en",
  status: "draft",
  is_draft: true,
  show_prices: true,
  currency: "THB",
  product_count: 1,
  cover: null,
  categories: [{
    slug: "adapter",
    name: "Adapter",
    description: "",
    display_order: 1,
    product_count: 1,
    show_product_count: true,
    default_expanded: true,
  }],
  products: [{
    id: "product-1",
    code: "LP-002U",
    name: "Universal adapter",
    name_en: "Universal adapter",
    brand: "Glink",
    category_name: "Adapter",
    categories: ["Adapter"],
    description: "Travel adapter",
    long_description: "",
    main_image_url: "/media/front.png",
    image_urls: ["/media/front.png"],
    section_title: "Adapter",
    display_order: 1,
    featured: false,
    product_status: "active",
    price: "150.00",
    currency: "THB",
  }],
  product_card_style: "erp_detail",
  product_card_theme: null,
  studio_preview_href: null,
} as unknown as CataloguePreview;

describe("CataloguePreviewPage image controls", () => {
  beforeEach(() => {
    navigation.push.mockReset();
    navigation.replace.mockReset();
    access.canAccess.mockReset().mockReturnValue(true);
    api.getCurrentUser.mockResolvedValue({
      id: "user-1",
      full_name: "Super Administrator",
      roles: ["superadmin"],
      permissions: [],
      is_superadmin: true,
    });
    api.previewCatalogue.mockResolvedValue(preview);
    api.changeProductStatus.mockReset().mockResolvedValue({
      id: "product-1",
      product_status: "inactive",
    });
  });

  it("requests inactive rows and manages product status only for a canonical SuperAdmin", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("Duplicate catalogue listing");
    api.previewCatalogue.mockResolvedValue({
      ...preview,
      product_count: 2,
      products: [
        ...preview.products,
        {
          ...preview.products[0],
          id: "inactive-product",
          code: "LP-INACTIVE",
          name: "Inactive adapter",
          name_en: "Inactive adapter",
          product_status: "inactive",
        },
      ],
    });

    render(
      <LanguageProvider>
        <CataloguePreviewPage catalogueId="catalogue-1" />
      </LanguageProvider>,
    );

    const toggle = await screen.findByRole("switch", {
      name: "Set Universal adapter inactive",
    });
    expect(api.previewCatalogue).toHaveBeenCalledWith(
      "catalogue-1",
      undefined,
      undefined,
      true,
    );
    expect(screen.getByText("Inactive adapter")).toBeInTheDocument();
    expect(screen.getByText("INACTIVE")).toBeInTheDocument();

    fireEvent.click(toggle);

    await waitFor(() => expect(api.changeProductStatus).toHaveBeenCalledWith(
      "product-1",
      {
        status: "inactive",
        reason: "other",
        note: "Duplicate catalogue listing",
      },
    ));
    expect(prompt).toHaveBeenCalledOnce();
  });

  it("defensively hides inactive rows and controls from every non-SuperAdmin", async () => {
    api.getCurrentUser.mockResolvedValue({
      id: "manager-1",
      username: "manager",
      email: "manager@example.com",
      full_name: "Catalogue Manager",
      roles: ["catalogue_manager"],
      permissions: ["products.view_inactive", "products.change_status"],
      is_superadmin: false,
    });
    api.previewCatalogue.mockResolvedValue({
      ...preview,
      product_count: 2,
      products: [
        ...preview.products,
        {
          ...preview.products[0],
          id: "inactive-product",
          code: "LP-INACTIVE",
          name: "Inactive adapter",
          name_en: "Inactive adapter",
          product_status: "inactive",
        },
      ],
    });

    render(
      <LanguageProvider>
        <CataloguePreviewPage catalogueId="catalogue-1" />
      </LanguageProvider>,
    );

    expect(await screen.findByText("Universal adapter")).toBeInTheDocument();
    expect(api.previewCatalogue).toHaveBeenCalledWith(
      "catalogue-1",
      undefined,
      undefined,
      false,
    );
    expect(screen.queryByText("Inactive adapter")).not.toBeInTheDocument();
    expect(screen.queryByText("INACTIVE")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("renders the standard preview when a baseline viewer cannot access Studio", async () => {
    api.getCurrentUser.mockResolvedValue({
      id: "basic-user",
      username: "basic.user",
      email: "basic.user@example.com",
      full_name: "Basic User",
      roles: [],
      permissions: [],
      is_superadmin: false,
    });
    access.canAccess.mockImplementation(
      (_user: unknown, permission: string) =>
        permission !== "catalogue_designs.view",
    );
    api.previewCatalogue.mockResolvedValue({
      ...preview,
      status: "published",
      is_draft: false,
      studio_preview_href: "/catalogue-studio/design-1/preview",
    });

    render(
      <LanguageProvider>
        <CataloguePreviewPage catalogueId="catalogue-1" />
      </LanguageProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Adapter Catalogue" })).toBeInTheDocument();
    expect(navigation.replace).not.toHaveBeenCalledWith("/catalogue-studio/design-1/preview");
  });

  it("shows the same popup controls on authenticated catalogue cards", async () => {
    render(
      <LanguageProvider>
        <CataloguePreviewPage catalogueId="catalogue-1" />
      </LanguageProvider>,
    );

    const sidebar = await screen.findByRole("complementary", { name: "Catalogue categories" });
    expect(within(sidebar).queryByRole("button", { name: /All Products/ })).not.toBeInTheDocument();
    const opener = await screen.findByRole("button", {
      name: "View and download images for Universal adapter",
    });
    fireEvent.click(opener);

    expect(screen.getByRole("dialog", { name: "Universal adapter" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close image preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download image" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next image" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Close image preview" }));
    expect(opener).toHaveFocus();
  });

  it("shows only products from the selected category in the authenticated preview", async () => {
    window.history.replaceState(null, "", "/catalogues/catalogue-1/preview");
    api.previewCatalogue.mockResolvedValue({
      ...preview,
      product_count: 2,
      categories: [
        ...(preview.categories ?? []),
        { slug: "keyboards", name: "Keyboards", description: "Imported from the ERP product group.", display_order: 2, product_count: 1, show_product_count: true, default_expanded: true },
      ],
      products: [
        ...preview.products,
        { ...preview.products[0], id: "product-2", code: "KB-001", name: "Gaming Keyboard", name_en: "Gaming Keyboard", category_name: "Keyboards", categories: ["Keyboards"] },
      ],
    });

    render(
      <LanguageProvider>
        <CataloguePreviewPage catalogueId="catalogue-1" />
      </LanguageProvider>,
    );

    const sidebar = await screen.findByRole("complementary", { name: "Catalogue categories" });
    const search = within(sidebar).getByRole("searchbox", { name: "Search products" });
    const adapter = within(sidebar).getByRole("button", { name: /Adapter/ });
    const keyboards = within(sidebar).getByRole("button", { name: /Keyboards/ });

    fireEvent.click(keyboards);
    expect(keyboards).toHaveAttribute("aria-current", "page");
    const keyboardSection = screen.getByRole("heading", { name: "Keyboards" }).closest("section");
    expect(keyboardSection).not.toBeNull();
    expect(within(keyboardSection!).queryByText(/02.*CATEGORY/)).not.toBeInTheDocument();
    expect(within(keyboardSection!).queryByText("Imported from the ERP product group.")).not.toBeInTheDocument();
    expect(screen.getByText("Gaming Keyboard")).toBeInTheDocument();
    expect(screen.queryByText("Universal adapter")).not.toBeInTheDocument();
    expect(within(sidebar).getByText("Search within Keyboards")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "keyboard" } });
    fireEvent.click(adapter);
    expect(search).toHaveValue("");
    expect(screen.getByText("Universal adapter")).toBeInTheDocument();
    expect(screen.queryByText("Gaming Keyboard")).not.toBeInTheDocument();
  });
});
