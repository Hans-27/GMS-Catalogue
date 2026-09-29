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
  it("shows website and video actions in the footer only when their destinations exist", () => {
    // Production defect: catalogue products can carry a website and a selected
    // video, but the shared card exposes neither destination to customers.
    const onPlay = vi.fn();
    render(
      <CatalogueProductCard
        product={product({
          erp_details: {
            model: "LP-002U",
            warranty: "1 Yr",
            website_url: "https://example.com/products/lp-002u",
          },
          video: {
            id: "video-1",
            source_type: "external",
            provider: "youtube",
            title: "Universal adapter demonstration",
            description: "",
            alt_text: "",
            thumbnail_url: null,
            playback_url: "https://www.youtube-nocookie.com/embed/example",
            caption_url: null,
            mime_type: null,
            duration_seconds: null,
            width: null,
            height: null,
            display_mode: "card_icon",
            show_controls: true,
            allow_download: false,
            autoplay: false,
            muted: false,
            loop: false,
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
        onPlay={onPlay}
      />,
    );

    const website = screen.getByRole("link", { name: "Open Universal adapter website" });
    expect(website).toHaveAttribute("href", "https://example.com/products/lp-002u");
    expect(website).toHaveAttribute("target", "_blank");

    const play = screen.getByRole("button", { name: "Play Universal adapter video" });
    fireEvent.click(play);
    expect(onPlay).toHaveBeenCalledWith(play);
  });

  it("does not render empty website or video actions", () => {
    render(
      <CatalogueProductCard
        product={product()}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    expect(screen.queryByRole("link", { name: /website/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /video/i })).not.toBeInTheDocument();
  });

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

  it("shows the ERP pieces-per-carton value beside its label below model and warranty", () => {
    // Production defect: ERP pack size is available in the catalogue payload but
    // is omitted from the shared product card, so customers cannot see carton quantity.
    render(
      <CatalogueProductCard
        product={product({
          erp_details: { model: "UC012", warranty: "1 Yr", pack_size: "20" },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const packSizeLabel = screen.getByText("Pcs/Carton");
    const packSizeRow = packSizeLabel.closest("div");
    expect(packSizeRow).not.toBeNull();
    expect(within(packSizeRow as HTMLElement).getByText("20", { exact: true })).toBeInTheDocument();
    expect(packSizeRow?.className).toContain("packSizeMetadata");
  });

  it.each([
    ["missing", undefined],
    ["empty", "   "],
    ["zero", "0"],
    ["formatted zero", "0.00"],
  ])("shows a dash when the ERP pieces-per-carton value is %s", (_case, packSize) => {
    render(
      <CatalogueProductCard
        product={product({
          erp_details: {
            model: "UC012",
            warranty: "1 Yr",
            ...(packSize === undefined ? {} : { pack_size: packSize }),
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const packSizeRow = screen.getByText("Pcs/Carton").closest("div");
    expect(packSizeRow).not.toBeNull();
    expect(within(packSizeRow as HTMLElement).getByText("—", { exact: true })).toBeInTheDocument();
  });

  it("keeps pieces-per-carton visible when catalogue prices are hidden", () => {
    render(
      <CatalogueProductCard
        product={product({
          erp_details: { model: "UC012", warranty: "1 Yr", pack_size: "20" },
        })}
        showPrices={false}
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const packSizeRow = screen.getByText("Pcs/Carton").closest("div");
    expect(packSizeRow).not.toBeNull();
    expect(within(packSizeRow as HTMLElement).getByText("20", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Wholesale price")).not.toBeInTheDocument();
  });

  it("shows zero stock as a red out-of-stock status while positive stock stays available", () => {
    // Production defect: a zero quantity is presented as green "0 available",
    // which visually suggests that the product can still be purchased.
    const { rerender } = render(
      <CatalogueProductCard
        product={product({ stock_quantity: 0 })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const unavailableStatus = screen.getByText("Out of stock");
    expect(unavailableStatus.className).toContain("outOfStock");
    expect(screen.queryByText("0 available")).not.toBeInTheDocument();

    rerender(
      <CatalogueProductCard
        product={product({ stock_quantity: 25 })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    expect(screen.getByText("25 available").className).toContain("liveStock");
    expect(screen.queryByText("Out of stock")).not.toBeInTheDocument();
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

  it("shows purchase-order amounts with separate status colors", () => {
    // Production defect: purchase-order values include repeated status labels
    // and cannot be visually distinguished by status at a glance.
    render(
      <CatalogueProductCard
        product={product({
          erp_details: {
            model: "LP-002U",
            warranty: "1 Yr",
            in_transit: "500",
            ordered: "300",
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const facts = screen.getByLabelText("Product stock and pricing");
    expect(facts).toHaveTextContent("Intransit / Order500 / 300");
    expect(screen.getByLabelText("In Transit 500").className).toContain("inTransitQuantity");
    expect(screen.getByLabelText("Ordered 300").className).toContain("orderedQuantity");
  });

  it("shows only the active purchase-order API status", () => {
    // Production defect: a zero Ordered quantity can still add status wording
    // or a separator beside the active In Transit amount.
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

    const facts = screen.getByLabelText("Product stock and pricing");
    expect(facts).toHaveTextContent("Intransit / Order2,000");
    expect(screen.getByLabelText("In Transit 2,000").className).toContain("inTransitQuantity");
    expect(screen.queryByLabelText("Ordered 0")).not.toBeInTheDocument();
    expect(within(facts).queryByText("/", { exact: true })).not.toBeInTheDocument();
  });

  it("shows only an active Ordered amount in dark purple", () => {
    // Production defect: a zero In Transit value can leave a misleading label
    // or separator before the active Ordered quantity.
    render(
      <CatalogueProductCard
        product={product({
          erp_details: {
            model: "LP-002U",
            warranty: "1 Yr",
            in_transit: "0",
            ordered: "300",
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const facts = screen.getByLabelText("Product stock and pricing");
    expect(facts).toHaveTextContent("Intransit / Order300");
    expect(screen.getByLabelText("Ordered 300").className).toContain("orderedQuantity");
    expect(screen.queryByLabelText("In Transit 0")).not.toBeInTheDocument();
    expect(within(facts).queryByText("/", { exact: true })).not.toBeInTheDocument();
  });

  it("shows a dash when both purchase-order amounts are zero", () => {
    // Production defect: two inactive quantities can be exposed as status text
    // instead of the catalogue's standard empty-value marker.
    render(
      <CatalogueProductCard
        product={product({
          erp_details: {
            model: "LP-002U",
            warranty: "1 Yr",
            in_transit: "0",
            ordered: "0",
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const row = screen.getByText("Intransit / Order").closest("div");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("—")).toBeInTheDocument();
  });

  it("keeps a legacy combined purchase-order value neutral", () => {
    // Production defect: an unstructured legacy value can be assigned a status
    // color even though it cannot be reliably separated into two quantities.
    render(
      <CatalogueProductCard
        product={product({
          erp_details: {
            model: "LP-002U",
            warranty: "1 Yr",
            intransit_order: "Expected shipment",
          },
        })}
        showPrices
        catalogueCurrency="THB"
        locale="en-US"
      />,
    );

    const legacy = screen.getByText("Expected shipment");
    expect(legacy.className).toContain("purchaseOrderValue");
    expect(legacy.className).not.toContain("inTransitQuantity");
    expect(legacy.className).not.toContain("orderedQuantity");
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
