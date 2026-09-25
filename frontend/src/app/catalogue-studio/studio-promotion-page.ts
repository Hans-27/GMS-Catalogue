import { API_ORIGIN, type Promotion } from "@/lib/api";
import type { StudioDesign, StudioElement, StudioPageDocument } from "@/lib/studio-api";

function element(
  id: string,
  type: StudioElement["type"],
  name: string,
  frame: [number, number, number, number],
  options: Partial<StudioElement> = {},
): StudioElement {
  const [xPercent, yPercent, widthPercent, heightPercent] = frame;
  return {
    id,
    type,
    name,
    xPercent,
    yPercent,
    widthPercent,
    heightPercent,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    locked: false,
    visible: true,
    style: {},
    responsive: { mobile: { hidden: false }, pdf: { hidden: false }, print: { hidden: false } },
    ...options,
  };
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(value));
}

/** Build an editable page. Public prices are rebound from the catalogue link at render time. */
export function buildStudioPromotionPage(
  promotion: Promotion,
  design: Pick<StudioDesign, "page_width" | "page_height" | "data_mode">,
  pageId: string,
  createId: () => string = () => crypto.randomUUID(),
): StudioPageDocument {
  const title = promotion.short_title || promotion.name_en;
  const uniqueProducts = [...new Map(promotion.products.filter((item) => item.include_in_promotion).map((item) => [item.product_id, item])).values()].slice(0, 4);
  const hasBanner = Boolean(promotion.cover_url);
  const elements: StudioElement[] = [];

  if (hasBanner) {
    elements.push(element(createId(), "image", `${promotion.name_en} banner`, [0, 0, 100, 48], {
      locked: true,
      style: { productImageUrl: promotion.cover_url?.startsWith("http") ? promotion.cover_url : `${API_ORIGIN}${promotion.cover_url}`, objectFit: "cover", borderRadius: 0 },
    }));
    elements.push(element(createId(), "shape", "Banner contrast", [0, 0, 100, 48], {
      locked: true,
      opacity: 0.5,
      zIndex: 2,
      style: { backgroundColor: "#073B27", borderRadius: 0 },
    }));
  }

  elements.push(
    element(createId(), "text", "Promotion occasion", [6, 8, 70, 5], {
      text: (promotion.occasion_name || "Special promotion").toUpperCase(),
      zIndex: 3,
      style: { color: hasBanner ? "#D8F7E4" : "#137440", backgroundColor: null, fontSize: 18, fontWeight: "bold", textAlign: "left" },
    }),
    element(createId(), "text", "Promotion title", [6, 14, 86, 13], {
      text: title,
      zIndex: 3,
      style: { color: hasBanner ? "#FFFFFF" : "#153326", backgroundColor: null, fontSize: 52, fontWeight: "bold", textAlign: "left" },
    }),
    element(createId(), "text", "Promotion schedule", [6, 29, 80, 6], {
      text: `${displayDate(promotion.start_at)} – ${displayDate(promotion.end_at)}`,
      zIndex: 3,
      style: { color: hasBanner ? "#EFFAF3" : "#557066", backgroundColor: null, fontSize: 20, fontWeight: "normal", textAlign: "left" },
    }),
  );

  if (promotion.description_en) {
    elements.push(element(createId(), "text", "Promotion description", [6, hasBanner ? 39 : 36, 86, 7], {
      text: promotion.description_en,
      zIndex: 3,
      style: { color: hasBanner ? "#EFFAF3" : "#557066", backgroundColor: null, fontSize: 18, fontWeight: "normal", textAlign: "left" },
    }));
  }

  uniqueProducts.forEach((product, index) => {
    const columns = uniqueProducts.length <= 2 ? uniqueProducts.length : 2;
    const rows = Math.ceil(uniqueProducts.length / columns);
    const gap = 3;
    const width = columns === 1 ? 88 : (88 - gap) / 2;
    const height = Math.min(38, (44 - gap * Math.max(0, rows - 1)) / rows);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const amount = product.promotion_price == null ? "" : `${product.currency || "THB"} ${Number(product.promotion_price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    elements.push(element(createId(), "product_card", product.product_name, [6 + column * (width + gap), 52 + row * (height + gap), width, height], {
      productId: product.product_id,
      binding: "{{product}}",
      style: {
        cardLayout: "image_left",
        layoutMode: "responsive",
        productName: product.product_name,
        productSku: product.product_code,
        productBrand: product.brand || "",
        productPrice: amount,
        priceSource: "erp",
        useErpPrice: true,
        priceMode: "one_price",
        showProductImage: true,
        showProductName: true,
        showProductPrice: true,
        showProductBrand: true,
        showProductSku: true,
        showProductCategory: false,
        showProductDescription: false,
        backgroundColor: "#FFFFFF",
        borderColor: "#CBE0D2",
        borderWidth: 1,
        borderRadius: 18,
        cardPadding: 14,
        imageAreaRatio: 42,
        internalGap: 12,
        productNameColor: "#183428",
        productPriceColor: "#08753D",
        productMetaColor: "#63776D",
        productNameSize: 22,
        productPriceSize: 21,
        productMetaSize: 12,
        objectFit: "contain",
        shadowBlur: 8,
        shadowOffsetX: 0,
        shadowOffsetY: 4,
        shadowOpacity: 10,
        shadowColor: "#173C29",
      },
    }));
  });

  return {
    pageId,
    pageType: "promotion",
    name: title,
    promotionId: promotion.id,
    promotionStatus: promotion.status,
    promotionStartAt: promotion.start_at,
    promotionEndAt: promotion.end_at,
    canvas: {
      width: design.page_width,
      height: design.page_height,
      backgroundColor: hasBanner ? "#EEF8F1" : "#F4FAF6",
      gridSize: 10,
      showGrid: false,
      showGuides: true,
      showSafeArea: true,
      bleed: 0,
    },
    elements,
    dataMode: design.data_mode,
  };
}
