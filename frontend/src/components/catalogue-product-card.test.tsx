import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CataloguePreviewProduct } from "@/lib/api";
import { CatalogueProductCard } from "./catalogue-product-card";

const apiConfig = vi.hoisted(() => ({ origin: "http://127.0.0.1:8000" }));

vi.mock("@/lib/api", () => ({
  get API_ORIGIN() {
    return apiConfig.origin;
  },
}));

afterEach(() => {
  apiConfig.origin = "http://127.0.0.1:8000";
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

function product(
  overrides: Partial<CataloguePreviewProduct> = {},
): CataloguePreviewProduct {
  return {
    id: "product-1",
    code: "LP-002U",
    name: "Universal adapter",
    name_en: "Universal adapter",
    brand: "Glink",
    category_name: "Adapters",
    description: "Travel adapter",
    long_description: "Universal travel adapter",
    erp_details: { model: "LP-002U", warranty: "1 Yr" },
    categories: ["Adapters"],
    main_image_url: "/media/front.png",
    image_urls: ["/media/front.png", "/media/back.jpg"],
    barcode: "8850000000001",
    stock_quantity: 25,
    section_title: "Adapters",
    display_order: 1,
    featured: false,
    product_status: "active",
    price: "150.00",
    currency: "THB",
    ...overrides,
  };
}

describe("CatalogueProductCard reference template", () => {
  it("shows an inactive ribbon and status switch only when management is enabled", () => {
    const onStatusChange = vi.fn();

    render(
      <CatalogueProductCard
        product={product({ product_status: "inactive" })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
        canManageStatus
        onStatusChange={onStatusChange}
      />,
    );

    expect(screen.getByText("INACTIVE")).toBeInTheDocument();
    const toggle = screen.getByRole("switch", {
      name: "Set Universal adapter active",
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(onStatusChange).toHaveBeenCalledWith("active");
  });

  it("never exposes lifecycle controls without explicit management access", () => {
    render(
      <CatalogueProductCard
        product={product({ product_status: "inactive" })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    expect(screen.queryByText("INACTIVE")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("disables lifecycle changes while a status update is pending", () => {
    render(
      <CatalogueProductCard
        product={product()}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
        canManageStatus
        statusUpdating
        onStatusChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("switch", { name: "Updating Universal adapter status" })).toBeDisabled();
  });

  it("uses only the exact neutral catalogue template instead of legacy card presentation", () => {
    render(
      <CatalogueProductCard
        product={product({
          featured: true,
          promotion_badge: "Sale",
          erp_details: { model: "NM010 Black", pack_size: "16", warranty: "1 Yr" },
          wholesale_price: "90.00",
          online_price: "120.00",
          retail_price: "110.00",
          card_presentation: {
            display_name: "Legacy presentation name",
            description: "Legacy description",
            badge: "Legacy badge",
            appearance: { surface_color: "#fff4a3", accent_color: "#ffe600" },
            visible_fields: { stock: false, barcode: false },
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
        cardStyle="erp_detail"
      />,
    );

    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("data-card-template", "catalogue-reference");
    expect(card).not.toHaveAttribute("style");
    expect(within(card).getByRole("heading", { name: "Universal adapter" })).toBeInTheDocument();
    expect(within(card).getByText("NM010 Black", { exact: true })).toBeInTheDocument();
    expect(within(card).getByText("1 Yr", { exact: true })).toBeInTheDocument();
    expect(within(card).getByText("Stock", { exact: true })).toBeInTheDocument();
    expect(within(card).getByText("Barcode", { exact: true })).toBeInTheDocument();
    expect(within(card).getByText("Wholesale price", { exact: true })).toBeInTheDocument();
    expect(within(card).getByText("Online price", { exact: true })).toBeInTheDocument();
    expect(within(card).getByText("Intransit / Order", { exact: true })).toBeInTheDocument();
    expect(within(card).getByLabelText("Retail price: THB 110.00")).toBeInTheDocument();
    expect(within(card).queryByText("Legacy presentation name")).not.toBeInTheDocument();
    expect(within(card).queryByText("Legacy description")).not.toBeInTheDocument();
    expect(within(card).queryByText("Legacy badge")).not.toBeInTheDocument();
    expect(within(card).queryByText("Pack size: 16")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Download product card/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /Previous image|Next image/ })).not.toBeInTheDocument();
  });

  it("renders ERP stock, barcode, prices, and the empty supply value in stacked rows", () => {
    render(
      <CatalogueProductCard
        product={product({
          wholesale_price: "90.00",
          online_price: "120.00",
          retail_price: "110.00",
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const facts = screen.getByLabelText("Product stock and pricing");
    expect(facts).toHaveTextContent("25 available");
    expect(facts).toHaveTextContent("8850000000001");
    expect(facts).toHaveTextContent("Wholesale priceTHB 90.00");
    expect(facts).toHaveTextContent("Online priceTHB 120.00");
    expect(facts).toHaveTextContent("Intransit / Order—");
    expect(screen.getByLabelText("Retail price: THB 110.00")).toBeInTheDocument();
  });

  it("places the Shopee logo beside the online price label", () => {
    // Production defect: marketplace pricing can be shown without identifying
    // Shopee, leaving customers unable to distinguish the online sales channel.
    render(
      <CatalogueProductCard
        product={product({ online_price: "120.00" })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const onlinePriceLabel = screen.getByText("Online price");
    expect(within(onlinePriceLabel).getByRole("img", { name: "Shopee" })).toHaveAttribute(
      "src",
      "/branding/shopee-logo.svg",
    );
  });

  it("never substitutes the generic catalogue price for a missing ERP card price", () => {
    // Production defect: a missing SP6 or SP5 value can be silently replaced by
    // the audience catalogue price, which gives the field the wrong ERP meaning.
    render(
      <CatalogueProductCard
        product={product({
          price: "999.00",
          wholesale_price: undefined,
          online_price: undefined,
          retail_price: undefined,
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const facts = screen.getByLabelText("Product stock and pricing");
    expect(facts).toHaveTextContent("Wholesale price—");
    expect(facts).toHaveTextContent("Online price—");
    expect(screen.getByLabelText("Retail price: —")).toBeInTheDocument();
    expect(screen.queryByText("THB 999.00")).not.toBeInTheDocument();
  });

  it("does not invent price fields when a catalogue hides prices", () => {
    render(
      <CatalogueProductCard
        product={product({
          wholesale_price: "90.00",
          online_price: "120.00",
          retail_price: "110.00",
        })}
        showPrices={false}
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const facts = screen.getByLabelText("Product stock and pricing");
    expect(within(facts).getByText("Stock")).toBeInTheDocument();
    expect(within(facts).getByText("Barcode")).toBeInTheDocument();
    expect(within(facts).getByText("Intransit / Order")).toBeInTheDocument();
    expect(within(facts).queryByText("Wholesale price")).not.toBeInTheDocument();
    expect(within(facts).queryByText("Online price")).not.toBeInTheDocument();
    expect(screen.queryByText("Retail price")).not.toBeInTheDocument();
  });

  it("shows the purchase-order API statuses with their quantities", () => {
    render(
      <CatalogueProductCard
        product={product({
          erp_details: {
            model: "LP-002U",
            warranty: "1 Yr",
            in_transit: "12",
            ordered: "8",
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    expect(screen.getByLabelText("Product stock and pricing")).toHaveTextContent(
      "Intransit / OrderIn Transit 12 / Ordered 8",
    );
  });

  it("shows only the active purchase-order API status", () => {
    render(
      <CatalogueProductCard
        product={product({
          erp_details: {
            model: "LP-002U",
            warranty: "1 Yr",
            in_transit: "2,000",
            ordered: "0",
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    expect(screen.getByLabelText("Product stock and pricing")).toHaveTextContent(
      "Intransit / OrderIn Transit 2,000",
    );
    expect(screen.getByLabelText("Product stock and pricing")).not.toHaveTextContent(
      "Ordered 0",
    );
  });

  it("automatically advances the image every five seconds and wraps", () => {
    vi.useFakeTimers();
    render(
      <CatalogueProductCard
        product={product()}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const image = screen.getByRole("img", { name: "Universal adapter" });
    expect(image).toHaveAttribute("src", "http://127.0.0.1:8000/media/front.png");

    act(() => vi.advanceTimersByTime(4_999));
    expect(image).toHaveAttribute("src", "http://127.0.0.1:8000/media/front.png");

    act(() => vi.advanceTimersByTime(1));
    expect(image).toHaveAttribute("src", "http://127.0.0.1:8000/media/back.jpg");

    act(() => vi.advanceTimersByTime(5_000));
    expect(image).toHaveAttribute("src", "http://127.0.0.1:8000/media/front.png");
  });

  it("opens the complete image list at the image currently shown", () => {
    vi.useFakeTimers();
    const onOpenImages = vi.fn();
    render(
      <CatalogueProductCard
        product={product()}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
        onOpenImages={onOpenImages}
      />,
    );

    act(() => vi.advanceTimersByTime(5_000));
    const opener = screen.getByRole("button", {
      name: "View and download images for Universal adapter",
    });
    fireEvent.click(opener);

    expect(onOpenImages).toHaveBeenCalledOnce();
    expect(onOpenImages).toHaveBeenCalledWith({
      productName: "Universal adapter",
      productCode: "LP-002U",
      images: [
        { url: "http://127.0.0.1:8000/media/front.png", altText: "Universal adapter image 1" },
        { url: "http://127.0.0.1:8000/media/back.jpg", altText: "Universal adapter image 2" },
      ],
      index: 1,
      returnFocus: opener,
    });
  });

  it("uses the no-image fallback without exposing an image opener", () => {
    render(
      <CatalogueProductCard
        product={product({ image_urls: [], main_image_url: null })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
        onOpenImages={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /View and download images for/i })).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Universal adapter" })).toHaveAttribute(
      "src",
      "/no-image.png",
    );
  });
});
