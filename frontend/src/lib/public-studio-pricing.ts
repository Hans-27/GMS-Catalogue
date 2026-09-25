import { API_ORIGIN, API_URL, type PublicCatalogue } from "@/lib/api";
import { NO_PRODUCT_IMAGE_URL, productImageUrls } from "@/lib/product-image";
import type { StudioDesign, StudioElement } from "@/lib/studio-api";

function mediaUrl(path?: string | null) {
  if (!path) return null;
  if (path === NO_PRODUCT_IMAGE_URL || path.startsWith("http")) return path;
  return `${API_ORIGIN}${path}`;
}

function publicPrice(catalogue: PublicCatalogue, productId?: string | null, sku?: string | null) {
  const product = catalogue.products.find(
    (item) => (productId && item.id === productId) || (sku && item.code === sku),
  );
  if (!product || !catalogue.show_prices || product.price == null) {
    return { product, formatted: "" };
  }
  const currency = product.currency || catalogue.currency || "THB";
  return {
    product,
    formatted: `${currency} ${Number(product.price).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  };
}

function hydrateElement(
  element: StudioElement,
  catalogue: PublicCatalogue,
  token: string,
) {
  const style = { ...element.style };
  if (element.assetId) {
    style.publicAssetUrl = `${API_URL}/v1/public/catalogues/${encodeURIComponent(token)}/studio/assets/${element.assetId}/content`;
  }

  if (element.type === "image_carousel" && element.carousel) {
    const productOffsets = new Map<string, number>();
    for (const image of element.carousel.images) {
      const imageProductId = image.productId || element.carousel.productIds?.[0];
      if (!imageProductId) continue;
      const boundProduct = catalogue.products.find((item) => item.id === imageProductId);
      const urls = productImageUrls(boundProduct?.image_urls, boundProduct?.main_image_url)
        .map(mediaUrl)
        .filter((value): value is string => Boolean(value));
      const offset = productOffsets.get(imageProductId) || 0;
      image.url = urls[offset] || urls[0] || image.url;
      productOffsets.set(imageProductId, offset + 1);
    }
  }

  const sku = String(style.productSku || "");
  const { product, formatted } = publicPrice(catalogue, element.productId, sku);
  if (product && ["image", "product_card", "button"].includes(element.type)) {
    const urls = productImageUrls(product.image_urls, product.main_image_url)
      .map(mediaUrl)
      .filter((value): value is string => Boolean(value));
    style.publicProductImageUrls = JSON.stringify(urls);
    if (element.carousel && element.type !== "image_carousel" && urls.length) {
      element.carousel.images = urls.map((url, index) => ({
        id: `public-${index}`,
        url,
        fileName: `${sku || product.code}-image-${index + 1}`,
        altText: `${element.name} image ${index + 1}`,
        sourceType: "product_image",
        displayOrder: index + 1,
        isActive: true,
        fit: "contain",
        positionX: 50,
        positionY: 50,
        zoom: 1,
      }));
    }
  }

  const isMappedPrice =
    style.priceSource === "erp" ||
    String(element.binding || "").startsWith("{{product.price");
  if (element.type === "product_card" && element.productId && style.useErpPrice !== false) {
    style.productPrice = formatted;
    style.productSecondaryPrice = "";
    style.showProductPrice = Boolean(formatted) && style.priceMode !== "no_price" && style.showProductPrice !== false;
    style.showSecondaryPrice = false;
  } else if (isMappedPrice && element.productId) {
    element.text = formatted;
    if (!formatted) element.visible = false;
  }
  element.style = style;
}

/** Rebind public Studio pages to the audience-safe product data from the link. */
export function hydratePublicStudioDesign(
  source: StudioDesign,
  catalogue: PublicCatalogue,
  token: string,
) {
  const design = structuredClone(source);
  for (const page of design.pages) {
    for (const element of page.page_data_json.elements) {
      hydrateElement(element, catalogue, token);
    }
  }
  return design;
}
