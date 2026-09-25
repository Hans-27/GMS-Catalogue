"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import type Konva from "konva";
import { API_ORIGIN, ApiError, attachPromotionToCatalogue, deleteProductImage, detachPromotionFromCatalogue, getCurrentUser, getErpCustomerPriceLevels, getErpProductImages, getPromotions, importErpProductImage, runProductSync, type AuthenticatedUser, type ErpCustomerPriceLevel, type Promotion } from "@/lib/api";
import { canAccess } from "@/lib/access";
import {
  createStudioExport, createStudioPage, createStudioTemplate, createStudioVersion, deleteStudioPage,
  createStudioProductCardTemplate, deleteStudioProductCardTemplate, duplicateStudioProductCardTemplate,
  getStudioAssets, getStudioAvailableProducts, getStudioDesign, getStudioPricingOverview, getStudioProduct, getStudioProductCardTemplates, getStudioProductCardTemplateVersions, getStudioProductPriceOptions, publishStudioDesign, reorderStudioPages, restoreStudioProductCardTemplateVersion, unpublishStudioDesign, updateStudioPage,
  updateStudioProductCardTemplate,
  uploadStudioAsset,
  uploadStudioProductImage,
  updateStudioProductVisibility,
  transitionStudioPromotion,
  validateStudioDesign,
  saveStudioOnlineCover, removeStudioOnlineCover,
  type StudioAsset,
  type StudioDesign, type StudioElement, type StudioElementType, type StudioPage,
  type StudioPageDocument, type StudioPageType, type StudioAvailableProduct, type StudioProductCardTemplate, type StudioProductImage, type StudioProductPriceOption, type StudioProductPriceOptions, type StudioPricingOverview, type StudioPricingResolution, type StudioCarouselConfig, type StudioCarouselImage,
} from "@/lib/studio-api";
import { formatRgb565, hexToRgb, hslToRgb, parseRgb565, rgb565ToRgb, rgbToHex, rgbToHsl, rgbToRgb565 } from "@/lib/rgb565";
import { DEFAULT_STUDIO_TABLE, STUDIO_TABLE_PRESETS } from "./studio-table";
import { StudioTableProperties } from "./studio-table-properties";
import { StudioCarouselProperties } from "./studio-carousel-properties";
import { StudioQrProperties } from "./studio-qr-properties";
import { StudioOnlineCover } from "./studio-online-cover";
import { StudioToolSidebar, type StudioToolTab as EditorPanelTab } from "./studio-tool-sidebar";
import { StudioMediaLibrary } from "./studio-media-library";
import sidebarStyles from "./studio-tool-sidebar.module.css";
import { normalizeStudioLayerValues, STUDIO_Z_INDEX_MAX } from "./studio-layer-order";
import { reorderStructuredStudioPageIds, structuredStudioPageIds, type StudioPageDropPosition } from "./studio-page-order";
import { buildStudioPromotionPage } from "./studio-promotion-page";
import { mergeStudioDocuments } from "./studio-document-merge";
import { ProductCardTemplateGallery, ProductCardTemplateSample } from "./product-card-template-gallery";
import { applyCardPreset, autoLayoutProductCards, fitInsidePage, percentToPixels, pixelsToMillimeters, pixelsToPercent, templateStyle, type ProductCardSizePreset } from "./product-card-layout";
import { DOWNLOAD_BUTTON_DESIGNS, supportsProductImageDownload } from "./studio-download-button";
import { startStudioImageDownload } from "./studio-image-download";
import { CataloguePageRenderer } from "./studio-preview";
import { NO_PRODUCT_IMAGE_URL } from "@/lib/product-image";
import styles from "./studio.module.css";

const EditorCanvas = dynamic(() => import("./studio-editor-canvas"), { ssr: false });

function resizePageDocument(document: StudioPageDocument, width: number, height: number): StudioPageDocument {
  if (width === document.canvas.width && height === document.canvas.height) return document;
  return {
    ...document,
    canvas: { ...document.canvas, width, height },
    // Element geometry is percentage based. Rebase it so changing the page
    // boundary never changes an element's pixel position or dimensions.
    elements: document.elements.map((element) => ({
      ...element,
      xPercent: element.xPercent * document.canvas.width / width,
      yPercent: element.yPercent * document.canvas.height / height,
      widthPercent: element.widthPercent * document.canvas.width / width,
      heightPercent: element.heightPercent * document.canvas.height / height,
    })),
  };
}

const PAGE_TYPES: Array<[StudioPageType, string]> = [
  ["blank", "Blank Page"], ["cover", "Cover Page"], ["introduction", "Introduction Page"], ["category", "Category Page"], ["product_grid", "Product Grid"],
  ["product_detail", "Product Detail"], ["brand_intro", "Brand Introduction"],
  ["terms", "Terms Page"], ["table_of_contents", "Table of Contents"], ["free_layout", "Free Layout"], ["final", "Final / Contact"],
];

const ELEMENTS: Array<[StudioElementType, string, string]> = [
  ["text", "T", "Text"], ["image", "IM", "Image"], ["image_carousel", "↔", "Image Carousel"], ["logo", "LG", "Logo"],
  ["video", "▶", "Video"], ["shape", "□", "Shape"],
  ["qr_code", "QR", "QR code"], ["product_card", "PC", "Product card"],
  ["table", "TB", "Table"],
  ["barcode", "BC", "Barcode"], ["line", "—", "Line"], ["rectangle", "▭", "Rectangle"],
  ["page_number", "#", "Page number"], ["button", "⇩", "Download"],
];

const LEFT_PANEL_DEFAULT = 348;
const RIGHT_PANEL_DEFAULT = 300;
const LEFT_PANEL_MIN = 292;
const LEFT_PANEL_MAX = 460;
const RIGHT_PANEL_MIN = 260;
const RIGHT_PANEL_MAX = 520;
const STUDIO_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

const PRIMARY_EDITOR_TABS: readonly EditorPanelTab[] = ["products", "cover", "elements", "cards", "media", "pages"];
const ADVANCED_EDITOR_TABS: readonly EditorPanelTab[] = ["prices", "fields", "layers"];

const IMAGE_GRID_PRESETS = [
  { id: "full", name: "Full page", cells: [[0, 0, 100, 100]] },
  { id: "rows", name: "Two rows", cells: [[0, 0, 100, 50], [0, 50, 100, 50]] },
  { id: "columns", name: "Two columns", cells: [[0, 0, 50, 100], [50, 0, 50, 100]] },
  { id: "four", name: "2 × 2", cells: [[0, 0, 50, 50], [50, 0, 50, 50], [0, 50, 50, 50], [50, 50, 50, 50]] },
  { id: "hero_two", name: "Large + two", cells: [[0, 0, 66, 100], [66, 0, 34, 50], [66, 50, 34, 50]] },
  { id: "banner_body", name: "Banner + body", cells: [[0, 0, 100, 28], [0, 28, 100, 72]] },
] as const;

function isStudioVideoFile(file: File) {
  return ["video/mp4", "video/webm"].includes(file.type.toLowerCase())
    || /\.(mp4|webm)$/i.test(file.name);
}

function boundedPanelWidth(value: number, side: "left" | "right") {
  const minimum = side === "left" ? LEFT_PANEL_MIN : RIGHT_PANEL_MIN;
  const maximum = side === "left" ? LEFT_PANEL_MAX : RIGHT_PANEL_MAX;
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : side === "left" ? LEFT_PANEL_DEFAULT : RIGHT_PANEL_DEFAULT));
}

function savedPanelWidth(side: "left" | "right") {
  if (typeof window === "undefined") return side === "left" ? LEFT_PANEL_DEFAULT : RIGHT_PANEL_DEFAULT;
  const stored = window.localStorage.getItem(`catalogue-studio-${side}-panel-width`);
  return stored === null ? side === "left" ? LEFT_PANEL_DEFAULT : RIGHT_PANEL_DEFAULT : boundedPanelWidth(Number(stored), side);
}

function governedStyleKeys(element: StudioElement | null | undefined) {
  return new Set(String(element?.style.governedStyleKeys || "").split(",").map((item) => item.trim()).filter(Boolean));
}

function governedRequiredStyleKeys(element: StudioElement | null | undefined) {
  const fieldToStyle:Record<string,string> = {
    image: "showProductImage", name: "showProductName", name_en: "showProductName", name_th: "showProductName",
    code: "showProductSku", barcode: "showProductBarcode", stock: "showProductStock",
    price: "showProductPrice", description: "showProductDescription", brand: "showProductBrand",
    category: "showProductCategory",
  };
  return new Set(String(element?.style.governedRequiredFields || "").split(",").map((item) => fieldToStyle[item.trim()]).filter(Boolean));
}

function newElement(type: StudioElementType, xPercent = 10, yPercent = 10): StudioElement {
  const names: Record<string, string> = { text: "Text", image: "Product image", image_carousel: "Product Image Carousel", logo: "Brand logo", video: "Product video", shape: "Shape", button: "Download button", qr_code: "QR code", product_card: "Product card", product_grid: "Product grid", product_field: "Product name", category_field: "Category name", table: "Table", line: "Line", page_number: "Page number" };
  return {
    id: crypto.randomUUID(), type, name: names[type] || "Element", xPercent, yPercent,
    widthPercent: type === "button" ? 4 : type === "table" ? 60 : type === "line" ? 40 : type === "page_number" ? 12 : type === "image_carousel" ? 34 : type === "product_card" ? 28 : type === "text" ? 46 : type === "qr_code" ? 22 : 24,
    heightPercent: type === "button" ? 6 : type === "table" ? 26 : type === "line" ? 3 : type === "page_number" ? 8 : type === "image_carousel" ? 28 : type === "product_card" ? 36 : type === "text" ? 10 : type === "qr_code" ? 22 : 18,
    // New elements start at the front while remaining inside the API's +/-10,000 contract.
    rotation: 0, opacity: 1, zIndex: STUDIO_Z_INDEX_MAX, locked: false, visible: true,
    text: type === "table" ? DEFAULT_STUDIO_TABLE : type === "text" ? "Edit this text" : type === "button" ? "⇩" : type === "page_number" ? "1" : undefined,
    binding: type === "product_field" ? "{{product.name_en}}" : type === "category_field" ? "{{category.name}}" : type === "page_number" ? "{{page.number}}" : undefined,
    style: {
      color: type === "button" ? "#FFFFFF" : type === "line" ? "#126B3A" : "#17251F",
      backgroundColor: type === "line" || type === "table" ? null : type === "button" ? "#126B3A" : type === "shape" ? "#DDF3E5" : "#FFFFFF",
      borderRadius: type === "product_card" ? 16 : 8, borderWidth: type === "product_card" ? 1 : 0,
      borderColor: "#BDD0C4", fontSize: type === "text" ? 36 : type === "table" ? 16 : 20, fontWeight: type === "button" ? "bold" : "normal", fontStyle: "normal", textAlign: "left", objectFit: "contain",
      shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 3, shadowOpacity: 22, shadowColor: "#0B3E25",
      ...(["image", "logo", "background"].includes(type) ? { cropZoom: 100, cropX: 50, cropY: 50, imageRotation: 0, flipX: false, flipY: false } : {}),
      ...(type === "table" ? { tableHeader: true, tableStriped: false, tableShowBorders: true, tableHeaderColor: "transparent", tableHeaderTextColor: "#000000", tableCellColor: "transparent", tableAlternateColor: "transparent", tableStockColor: "#16884C", tableGridColor: "#B9CCC0", tableBorderWidth: 1, tableCellPadding: 8, tableVerticalAlign: "middle" } : {}),
      ...(type === "line" ? { lineThickness: 4, lineColor: "#126B3A", lineStyle: "solid", borderWidth: 0, shadowBlur: 0 } : {}),
      ...(type === "page_number" ? { backgroundColor: null, borderWidth: 0, fontSize: 28, fontWeight: "bold", textAlign: "center", color: "#17251F" } : {}),
      ...(type === "button" ? { backgroundColor: "#FFFFFF", borderColor: "#D5E6DC", borderWidth: 1, borderRadius: 999, color: "#16884C", fontSize: 28, textAlign: "center", shadowBlur: 8, shadowOpacity: 18, downloadButtonDesign: "classic", downloadAction: "product_image" } : {}),
      ...(type === "qr_code" ? { qrContentType: "url", qrValue: "", qrForeground: "#111111", qrBackground: "#FFFFFF", qrErrorCorrection: "M", qrMargin: 4, qrShowLabel: false, qrLabel: "" } : {}),
    },
    responsive: { mobile: { hidden: false }, pdf: { hidden: false }, print: { hidden: false } },
    carousel: type === "image_carousel" ? defaultCarouselConfig() : undefined,
  };
}

function imageGridCellHasMedia(element: StudioElement) {
  return Boolean(
    element.assetId
    || element.productId
    || element.style.productImageId
    || element.style.productImageUrl,
  );
}

function imageGridTarget(
  pageDocument: StudioPageDocument,
  selectedIds: string[],
  preferredId?: string,
) {
  const cells = pageDocument.elements
    .filter((element) => element.type === "image" && element.style.imageGridCell === true && !element.locked)
    .sort((left, right) => {
      const indexDifference = Number(left.style.imageGridIndex ?? Number.MAX_SAFE_INTEGER)
        - Number(right.style.imageGridIndex ?? Number.MAX_SAFE_INTEGER);
      return indexDifference || left.yPercent - right.yPercent || left.xPercent - right.xPercent;
    });
  if (preferredId) {
    const preferred = cells.find((cell) => cell.id === preferredId);
    if (preferred) return preferred;
  }
  const selectedCells = cells.filter((cell) => selectedIds.includes(cell.id));
  const selectedEmptyCell = selectedCells.find((cell) => !imageGridCellHasMedia(cell));
  if (selectedEmptyCell) return selectedEmptyCell;
  if (selectedCells.length === 1) return selectedCells[0];
  return cells.find((cell) => !imageGridCellHasMedia(cell)) || null;
}

function productImageGridCell(
  cell: StudioElement,
  product: StudioAvailableProduct,
  images: StudioProductImage[],
  selectedIndex = 0,
) {
  const safeIndex = Math.max(0, Math.min(Math.max(0, images.length - 1), selectedIndex));
  const selectedImage = images[safeIndex];
  const productName = product.display_name || product.erp_name;
  return {
    ...cell,
    assetId: null,
    productId: product.id,
    carousel: null,
    name: images.length > 1 ? `${productName} · image carousel` : `${productName} · ERP image`,
    binding: "{{product.image}}",
    style: {
      ...cell.style,
      objectFit: "contain",
      backgroundColor: "transparent",
      productImageUrl: selectedImage?.url || product.primary_image_url || NO_PRODUCT_IMAGE_URL,
      productImageId: selectedImage?.id || "",
      productImageIndex: safeIndex,
      productImageIds: images.map((image) => image.id).filter(Boolean).join(","),
      productImageCount: images.length,
      productImageMode: images.length > 1 ? "carousel" : "single",
      productName,
      productSku: product.sku,
      imageSource: "erp",
      sourceMimeType: "",
      sourceFileName: selectedImage?.file_name || "",
      cropZoom: 100,
      cropX: 50,
      cropY: 50,
    },
  } satisfies StudioElement;
}

function mediaImageGridCell(cell: StudioElement, asset: StudioAsset) {
  return {
    ...cell,
    assetId: asset.id,
    productId: null,
    carousel: null,
    binding: null,
    name: asset.alt_text || asset.original_filename,
    style: {
      ...cell.style,
      objectFit: "contain",
      backgroundColor: "transparent",
      productImageUrl: "",
      productImageId: "",
      productImageIds: "",
      productImageIndex: 0,
      productImageCount: 0,
      productImageMode: "single",
      imageSource: "asset",
      sourceMimeType: asset.mime_type,
      sourceFileName: asset.original_filename,
      cropZoom: 100,
      cropX: 50,
      cropY: 50,
    },
  } satisfies StudioElement;
}

function defaultCarouselConfig(): StudioCarouselConfig {
  return {
    sourceType: "selected_product_images", productId: null, productIds: [], includeMainImage: true, includeAdditionalImages: true,
    selectedImageIds: [], autoIncludeNewImages: false, currentIndex: 0, images: [],
    transition: { type: "slide", durationMs: 350, direction: "horizontal", easing: "ease", autoplay: true, autoplayDelayMs: 3000, loop: true, pauseOnHover: true, swipe: true },
    navigation: { showArrows: true, showSingleImageArrows: false, arrowVisibility: "hover", arrowPosition: "inside", arrowSize: 36, arrowBackground: "#FFFFFF", arrowColor: "#126B3A", arrowOpacity: .96, arrowCornerRadius: 999, paginationType: "dots", paginationPosition: "inside_bottom", indicatorSize: 8, indicatorSpacing: 6, showImageCount: false },
    display: { fit: "contain", backgroundColor: "#FFFFFF", padding: 0, borderRadius: 8, loadingPlaceholder: "Loading image…" },
    pdf: { fallbackMode: "first_image", selectedImageId: null, gridColumns: 2 },
  };
}

type CarouselUploadItem = { id: string; name: string; status: "uploading" | "success" | "failed" | "cancelled"; error?: string; controller: AbortController };

const PRODUCT_FIELDS = [
  ["Product code","{{product.code}}"],["Barcode","{{product.barcode}}"],["SKU","{{product.sku}}"],
  ["Thai name","{{product.name_th}}"],["English name","{{product.name_en}}"],["Model","{{product.model}}"],
  ["Brand","{{product.brand_name}}"],["Category","{{product.category_name}}"],["Description","{{product.description}}"],
  ["Specifications","{{product.specifications}}"],["Stock on hand","{{product.stock_on_hand}}"],["Available stock","{{product.stock_available}}"],
  ["Reserved stock","{{product.stock_reserved}}"],["Incoming stock","{{product.stock_incoming}}"],["Last synchronized","{{product.last_synchronized_at}}"],
  ["Warranty","{{product.warranty}}"],["Pack size","{{product.pack_size}}"],["Weight","{{product.weight}}"],
] as const;

type PendingPriceElement = { x: number; y: number };
type PendingTextElement = { x: number; y: number };
type PendingShapeElement = { x: number; y: number };
type PendingBarcodeElement = { x: number; y: number };
type PendingProductCardElement = { x: number; y: number };
type ProductCardQuickStyle = "showcase" | "horizontal" | "erp_detail" | "compact";
type PendingErpImageElement = { x: number; y: number };
type PendingErpTableElement = { x: number; y: number; editElementId?: string };
type ErpTablePreset = "details" | "inventory" | "prices" | "complete";

const ERP_TABLE_PRESETS: Array<{ id: ErpTablePreset; name: string; description: string }> = [
  { id: "details", name: "Product details", description: "Product name, code, brand, category, barcode and stock." },
  { id: "inventory", name: "Code, barcode & stock", description: "A compact single-row ERP inventory table." },
  { id: "prices", name: "Customer prices", description: "Every authorized customer level with its current ERP price." },
  { id: "complete", name: "Complete ERP details", description: "All available product details plus the authorized ERP prices." },
];

function erpTableCell(value: unknown) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "/").trim();
  return normalized || "—";
}

function formatErpTablePrice(option: StudioProductPriceOption) {
  return option.amount === null
    ? "No current ERP price"
    : `${option.currency || "THB"} ${Number(option.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMappedPrice(option: Pick<StudioPricingResolution, "amount" | "currency">) {
  return option.amount === null
    ? ""
    : `${option.currency || "THB"} ${Number(option.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function productBarcodes(product: StudioAvailableProduct) {
  return Array.from(new Set([product.barcode, ...(product.barcodes || [])].filter((value): value is string => Boolean(value?.trim()))));
}

function buildErpTableText(preset: ErpTablePreset, product: StudioAvailableProduct, priceOptions: StudioProductPriceOptions | null) {
  const productName = product.display_name || product.erp_name;
  const category = product.category || product.category_names[0] || "";
  const barcodes = productBarcodes(product);
  const detailRows: Array<[string, unknown]> = [
    ["Product name", productName], ["Product code", product.sku], ["Brand", product.brand], ["Category", category],
    ...((barcodes.length ? barcodes : [null]).map((barcode, index): [string, unknown] => [barcodes.length > 1 ? `Barcode ${index + 1}` : "Barcode", barcode])),
    ["Stock", product.stock_quantity], ["Unit", product.unit], ["Pack size", product.pack_size],
  ];
  const priceRows = (priceOptions?.options || []).map((option) => [
    option.customer_level_name,
    option.price_list_code || option.price_list_name,
    formatErpTablePrice(option),
  ]);
  if (preset === "inventory") {
    return [
      ["CODE", "BARCODE", "STOCK"],
      ...(barcodes.length ? barcodes : [null]).map((barcode) => [product.sku, barcode, product.stock_quantity]),
    ].map((row) => row.map(erpTableCell).join(" | ")).join("\n");
  }
  if (preset === "prices") {
    return [["Customer level", "ERP price list", "Price"], ...priceRows]
      .map((row) => row.map(erpTableCell).join(" | ")).join("\n");
  }
  const rows: Array<Array<unknown>> = [["ERP field", "Value"], ...detailRows];
  if (preset === "complete") {
    rows.push(
      ["English name", product.name_en], ["Thai name", product.name_th],
      ["English description", product.description_en], ["Thai description", product.description_th],
      ["How to use", product.how_to_use], ["Remark", product.remark], ["Warranty", product.warranty],
      ["Last synchronized", product.last_synchronized_at],
      ...priceRows.map((row) => [`Price · ${row[0]} · ${row[1]}`, row[2]]),
    );
  }
  return rows.map((row) => row.map(erpTableCell).join(" | ")).join("\n");
}

function buildCarouselInventoryTable(products: StudioAvailableProduct[]) {
  return [
    ["CODE", "BARCODE", "STOCK"],
    ...products.map((product) => [product.sku, product.barcode, product.stock_quantity]),
  ].map((row) => row.map(erpTableCell).join(" | ")).join("\n");
}

function buildMultiProductTableText(preset: ErpTablePreset, products: StudioAvailableProduct[]) {
  if (preset === "inventory") return buildCarouselInventoryTable(products);
  if (preset === "prices") return [["Product", "Code", "Price"], ...products.map((product) => [product.display_name || product.erp_name, product.sku, product.price ? `${product.price_currency || "THB"} ${product.price}` : null])].map((row) => row.map(erpTableCell).join(" | ")).join("\n");
  const complete = preset === "complete";
  const header = ["Product name", "Code", "Brand", "Category", "Barcode", "Stock", ...(complete ? ["Unit", "Pack size", "Warranty"] : [])];
  const rows = products.map((product) => [product.display_name || product.erp_name, product.sku, product.brand, product.category || product.category_names[0], product.barcode, product.stock_quantity, ...(complete ? [product.unit, product.pack_size, product.warranty] : [])]);
  return [header, ...rows].map((row) => row.map(erpTableCell).join(" | ")).join("\n");
}

function boundField(name:string,binding:string):StudioElement{const element=newElement(binding.includes("barcode")?"barcode":"product_field");element.name=name;element.binding=binding;element.text=name;return element;}

function productSequenceBlockKey(element: StudioElement) {
  // A user-created canvas group is the strongest definition of a complete
  // product card: it can include the background, title and decorative parts
  // in addition to the ERP image, table and price frames.
  if (element.groupId) return `group:${element.groupId}`;
  const explicit = String(element.style.quickProductBlockId || "").trim();
  if (explicit) return explicit;
  const productIds = element.carousel?.productIds?.length
    ? element.carousel.productIds
    : String(element.style.tableProductIds || "").split(",").filter(Boolean);
  if (productIds.length) return `legacy-products:${[...productIds].sort().join(",")}`;
  return element.productId && ["image", "image_carousel", "table", "product_field", "button"].includes(element.type)
    ? `legacy-product:${element.productId}`
    : "";
}

function productCardBindingStyle(product:StudioAvailableProduct){
  const priceOne = product.prices?.["1"];
  const priceTwo = product.prices?.["2"];
  return {
    productName: product.display_name || product.erp_name,
    productPrice: priceOne?.amount ? `${priceOne.currency || "THB"} ${priceOne.amount}` : product.price ? `${product.price_currency} ${product.price}` : "",
    productSecondaryPrice: priceTwo?.amount ? `${priceTwo.currency || "THB"} ${priceTwo.amount}` : "",
    primaryPriceListId: priceOne?.price_list_id ?? null, secondaryPriceListId: priceTwo?.price_list_id ?? null,
    productBrand: product.brand || "", productSku: product.sku,
    productNameTh: product.name_th || "", productNameEn: product.name_en || product.display_name || product.erp_name,
    productCategory: product.category || product.category_names[0] || "",
    productDescription: product.description_en || product.description_th || "",
    productBarcode: productBarcodes(product).join("\n"), productStock: product.stock_quantity ?? "",
    productUnit: product.unit || "", productPackSize: product.pack_size ?? "",
    productWarranty: product.warranty || "", productRemark: product.remark || product.how_to_use || "",
    useErpName: true, useErpPrice: true, useErpBrand: true, useErpSku: true,
    useErpCategory: true, useErpDescription: true, useErpBarcode: true, useErpStock: true,
    productImageUrl: product.primary_image_url || NO_PRODUCT_IMAGE_URL,
    productImageId: product.images?.[0]?.id || "", productImageIndex: 0,
    productImageIds: (product.images || []).map((image) => image.id).join(","), productImageCount: product.images?.length || 0,
  } satisfies Record<string,string|number|boolean|null>;
}

const PRODUCT_CARD_QUICK_STYLES: Record<ProductCardQuickStyle, {
  name: string;
  description: string;
  widthPercent: number;
  heightPercent: number;
  style: Record<string, string | number | boolean | null>;
}> = {
  showcase: {
    name: "Showcase",
    description: "Large image, clear title and complete ERP facts.",
    widthPercent: 38,
    heightPercent: 46,
    style: {
      cardLayout: "classic", cardPadding: 14, imageHeight: 54, imageAreaRatio: 54, internalGap: 10,
      backgroundColor: "#FFFFFF", borderColor: "#C7DBCE", borderWidth: 1, borderRadius: 22,
      shadowBlur: 18, shadowOffsetX: 0, shadowOffsetY: 7, shadowOpacity: 16, shadowColor: "#173C29",
      showProductImage: true, showProductName: true, showProductPrice: true, showProductBrand: true,
      showProductSku: true, showProductCategory: true, showProductDescription: false,
      productNameColor: "#173C29", productPriceColor: "#0E7A43", productMetaColor: "#60746A",
      productNameSize: 27, productPriceSize: 24, productMetaSize: 14, detailAccentColor: "#126B3A",
      objectFit: "contain", priceMode: "one_price", layoutMode: "responsive",
    },
  },
  horizontal: {
    name: "Horizontal",
    description: "Wide card for image, description, stock and barcode.",
    widthPercent: 58,
    heightPercent: 31,
    style: {
      cardLayout: "image_left", cardPadding: 14, imageHeight: 100, imageAreaRatio: 42, internalGap: 14,
      backgroundColor: "#FFFFFF", borderColor: "#C7DBCE", borderWidth: 1, borderRadius: 20,
      shadowBlur: 15, shadowOffsetX: 0, shadowOffsetY: 6, shadowOpacity: 15, shadowColor: "#173C29",
      showProductImage: true, showProductName: true, showProductPrice: true, showProductBrand: true,
      showProductSku: true, showProductCategory: true, showProductDescription: true,
      productNameColor: "#173C29", productPriceColor: "#0E7A43", productMetaColor: "#60746A",
      productNameSize: 25, productPriceSize: 23, productMetaSize: 13, detailAccentColor: "#126B3A",
      objectFit: "contain", priceMode: "one_price", layoutMode: "responsive",
    },
  },
  erp_detail: {
    name: "ERP details",
    description: "Product image with ERP code, barcode, stock and description.",
    widthPercent: 62,
    heightPercent: 42,
    style: {
      cardLayout: "erp_detail", cardPadding: 16, imageHeight: 100, imageAreaRatio: 40, internalGap: 14,
      backgroundColor: "#F8FFF9", borderColor: "#AFCDB9", borderWidth: 1, borderRadius: 30,
      shadowBlur: 16, shadowOffsetX: 0, shadowOffsetY: 6, shadowOpacity: 15, shadowColor: "#173C29",
      showProductImage: true, showProductName: true, showProductPrice: true, showProductBrand: true,
      showProductSku: true, showProductCategory: true, showProductDescription: true,
      productNameColor: "#173C29", productPriceColor: "#0E7A43", productMetaColor: "#50675B",
      productNameSize: 25, productPriceSize: 23, productMetaSize: 13, detailAccentColor: "#126B3A",
      objectFit: "contain", priceMode: "one_price", layoutMode: "responsive",
    },
  },
  compact: {
    name: "Compact",
    description: "Space-saving card for product grids and promotions.",
    widthPercent: 29,
    heightPercent: 35,
    style: {
      cardLayout: "classic", cardPadding: 10, imageHeight: 50, imageAreaRatio: 50, internalGap: 7,
      backgroundColor: "#FFFFFF", borderColor: "#D2E2D7", borderWidth: 1, borderRadius: 14,
      shadowBlur: 9, shadowOffsetX: 0, shadowOffsetY: 4, shadowOpacity: 12, shadowColor: "#173C29",
      showProductImage: true, showProductName: true, showProductPrice: true, showProductBrand: false,
      showProductSku: true, showProductCategory: false, showProductDescription: false,
      productNameColor: "#173C29", productPriceColor: "#0E7A43", productMetaColor: "#60746A",
      productNameSize: 21, productPriceSize: 20, productMetaSize: 12, detailAccentColor: "#126B3A",
      objectFit: "contain", priceMode: "one_price", layoutMode: "responsive",
    },
  },
};

function cloneDocument(document: StudioPageDocument) {
  return structuredClone(document);
}

export function CatalogueStudioEditor({ designId }: { designId: string }) {
  const router = useRouter();
  const [design, setDesign] = useState<StudioDesign | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUser | null>(null);
  const [activePageId, setActivePageId] = useState("");
  const [document, setDocument] = useState<StudioPageDocument | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [interactionMode, setInteractionMode] = useState<"edit" | "preview">("edit");
  const [cropModeElementId, setCropModeElementId] = useState<string | null>(null);
  const [history, setHistory] = useState<StudioPageDocument[]>([]);
  const [future, setFuture] = useState<StudioPageDocument[]>([]);
  const [zoom, setZoom] = useState(.68);
  const [pageResizeDraft, setPageResizeDraft] = useState<{ width: number; height: number } | null>(null);
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => savedPanelWidth("left"));
  const [rightPanelWidth, setRightPanelWidth] = useState(() => savedPanelWidth("right"));
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "failed">("saved");
  const [publicationAction, setPublicationAction] = useState<"publish" | "unpublish" | null>(null);
  const [addingPage, setAddingPage] = useState(false);
  const [reorderingPages, setReorderingPages] = useState(false);
  const [deletingPageId, setDeletingPageId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [leftTab, setLeftTab] = useState<EditorPanelTab>("elements");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [promotionPickerOpen, setPromotionPickerOpen] = useState(false);
  const [promotionChoices, setPromotionChoices] = useState<Promotion[]>([]);
  const [promotionsLoading, setPromotionsLoading] = useState(false);
  const [addingPromotionId, setAddingPromotionId] = useState<string | null>(null);
  const [cardTemplates, setCardTemplates] = useState<StudioProductCardTemplate[]>([]);
  const [cardTemplatesLoading, setCardTemplatesLoading] = useState(false);
  const [cardTemplatePreview, setCardTemplatePreview] = useState<StudioProductCardTemplate | null>(null);
  const [bulkProductIds, setBulkProductIds] = useState<string[]>([]);
  const [quickSelectedProducts, setQuickSelectedProducts] = useState<StudioAvailableProduct[]>([]);
  const [quickCompletedBatches, setQuickCompletedBatches] = useState<StudioAvailableProduct[][]>([]);
  const [quickGeneratedProductIds, setQuickGeneratedProductIds] = useState<string[]>([]);
  const [productSequenceOpen, setProductSequenceOpen] = useState(false);
  const [productSequenceBusy, setProductSequenceBusy] = useState(false);
  const [quickEditingTableId, setQuickEditingTableId] = useState<string | null>(null);
  const [quickProductGenerating, setQuickProductGenerating] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState<StudioAvailableProduct[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<StudioAvailableProduct | null>(null);
  const [productImageUploading, setProductImageUploading] = useState(false);
  const [erpImagePulling, setErpImagePulling] = useState(false);
  const [productImageDeleting, setProductImageDeleting] = useState(false);
  const [elementAssetUploading, setElementAssetUploading] = useState(false);
  const [elementAssetDragActive, setElementAssetDragActive] = useState(false);
  const [carouselUploads, setCarouselUploads] = useState<CarouselUploadItem[]>([]);
  const [carouselDraggingImageId, setCarouselDraggingImageId] = useState<string | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [erpSyncing, setErpSyncing] = useState(false);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [pendingTextElement, setPendingTextElement] = useState<PendingTextElement | null>(null);
  const [pendingShapeElement, setPendingShapeElement] = useState<PendingShapeElement | null>(null);
  const [imageGridPickerOpen, setImageGridPickerOpen] = useState(false);
  const [customGridRows, setCustomGridRows] = useState(2);
  const [customGridColumns, setCustomGridColumns] = useState(2);
  const [pendingPriceElement, setPendingPriceElement] = useState<PendingPriceElement | null>(null);
  const [priceProductId, setPriceProductId] = useState("");
  const [priceOptions, setPriceOptions] = useState<StudioProductPriceOptions | null>(null);
  const [pricePickerSearch, setPricePickerSearch] = useState("");
  const [priceOptionsLoading, setPriceOptionsLoading] = useState(false);
  const [priceOptionsError, setPriceOptionsError] = useState("");
  const [erpPriceLevels, setErpPriceLevels] = useState<ErpCustomerPriceLevel[]>([]);
  const [priceTabProductId, setPriceTabProductId] = useState("");
  const [priceTabProduct, setPriceTabProduct] = useState<StudioAvailableProduct | null>(null);
  const [priceTabOptions, setPriceTabOptions] = useState<StudioProductPriceOptions | null>(null);
  const [priceProductSearch, setPriceProductSearch] = useState("");
  const [priceProductResults, setPriceProductResults] = useState<StudioAvailableProduct[]>([]);
  const [priceProductSearchLoading, setPriceProductSearchLoading] = useState(false);
  const [priceSearch, setPriceSearch] = useState("");
  const [priceTabLoading, setPriceTabLoading] = useState(false);
  const [priceTabError, setPriceTabError] = useState("");
  const [pricingOverview, setPricingOverview] = useState<StudioPricingOverview | null>(null);
  const [pricingAudienceId, setPricingAudienceId] = useState("");
  const [pricingOverviewLoading, setPricingOverviewLoading] = useState(false);
  const [pricingOverviewError, setPricingOverviewError] = useState("");
  const [pricingApplying, setPricingApplying] = useState(false);
  const [pendingBarcodeElement, setPendingBarcodeElement] = useState<PendingBarcodeElement | null>(null);
  const [pendingProductCardElement, setPendingProductCardElement] = useState<PendingProductCardElement | null>(null);
  const [productCardQuickStyle, setProductCardQuickStyle] = useState<ProductCardQuickStyle>("showcase");
  const [barcodeProductId, setBarcodeProductId] = useState("");
  const [barcodeProduct, setBarcodeProduct] = useState<StudioAvailableProduct | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState("");
  const [generatedBarcodeValue, setGeneratedBarcodeValue] = useState("");
  const [generatedBarcodeError, setGeneratedBarcodeError] = useState("");
  const [pendingErpImageElement, setPendingErpImageElement] = useState<PendingErpImageElement | null>(null);
  const [erpImageProductId, setErpImageProductId] = useState("");
  const [erpImageProduct, setErpImageProduct] = useState<StudioAvailableProduct | null>(null);
  const [erpImageId, setErpImageId] = useState("");
  const [erpImageLoading, setErpImageLoading] = useState(false);
  const [erpImageError, setErpImageError] = useState("");
  const [pendingErpTableElement, setPendingErpTableElement] = useState<PendingErpTableElement | null>(null);
  const [erpTableProductId, setErpTableProductId] = useState("");
  const [erpTableProduct, setErpTableProduct] = useState<StudioAvailableProduct | null>(null);
  const [erpTablePriceOptions, setErpTablePriceOptions] = useState<StudioProductPriceOptions | null>(null);
  const [erpTablePreset, setErpTablePreset] = useState<ErpTablePreset>("details");
  const [erpTableSelectionMode, setErpTableSelectionMode] = useState<"single" | "multiple">("single");
  const [erpTableSelectedProductIds, setErpTableSelectedProductIds] = useState<string[]>([]);
  const [erpTableProductSearch, setErpTableProductSearch] = useState("");
  const [erpTableSearchResults, setErpTableSearchResults] = useState<StudioAvailableProduct[]>([]);
  const [erpTableKnownProducts, setErpTableKnownProducts] = useState<StudioAvailableProduct[]>([]);
  const [erpTableLoading, setErpTableLoading] = useState(false);
  const [erpTableError, setErpTableError] = useState("");
  const [imagePreviewElement, setImagePreviewElement] = useState<StudioElement | null>(null);
  const [imagePreviewProduct, setImagePreviewProduct] = useState<StudioAvailableProduct | null>(null);
  const [imagePreviewImages, setImagePreviewImages] = useState<StudioProductImage[]>([]);
  const [imagePreviewIndex, setImagePreviewIndex] = useState(0);
  const [imagePreviewLoading, setImagePreviewLoading] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState("");
  const [imagePreviewDownloading, setImagePreviewDownloading] = useState(false);
  const [draggingLayerId, setDraggingLayerId] = useState<string | null>(null);
  const [layerDropTarget, setLayerDropTarget] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [pageDropTarget, setPageDropTarget] = useState<{ id: string; position: StudioPageDropPosition } | null>(null);
  const [elementContextMenu, setElementContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [rgb565Input, setRgb565Input] = useState("0xFFFF");
  const [rgbInput, setRgbInput] = useState("255, 255, 255");
  const [hslInput, setHslInput] = useState("0, 0, 100");
  const [stage, setStage] = useState<Konva.Stage | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromise = useRef<Promise<boolean> | null>(null);
  const imagePreviewRequest = useRef(0);
  const autosaveRetryCount = useRef(0);
  const editVersion = useRef(0);
  const documentRef = useRef<StudioPageDocument | null>(null);
  const baseDocumentRef = useRef<StudioPageDocument | null>(null);
  const activePageIdRef = useRef("");
  const canvasWorkspaceRef = useRef<HTMLElement | null>(null);
  const crossPageMoveLockRef = useRef(false);
  const pageOrderBusyRef = useRef(false);
  const latestRevision = useRef(1);
  const clipboard = useRef<StudioElement[]>([]);
  const activePage = design?.pages.find((page) => page.id === activePageId) ?? null;
  const activePageIndex = design?.pages.findIndex((page) => page.id === activePageId) ?? -1;
  const previousPage = activePageIndex > 0 ? design?.pages[activePageIndex - 1] ?? null : null;
  const nextPage = activePageIndex >= 0 && activePageIndex < (design?.pages.length ?? 0) - 1 ? design?.pages[activePageIndex + 1] ?? null : null;
  const selected = document?.elements.find((element) => element.id === selectedIds[0]) ?? null;
  const selectedIsImageFrame = Boolean(selected && ["image", "logo", "background"].includes(selected.type));
  const selectedImageFrameHasMedia = Boolean(selectedIsImageFrame && selected && (
    selected.assetId || selected.productId || selected.style.productImageId || selected.style.productImageIds || selected.style.productImageUrl
  ));
  const filteredPriceOptions = (priceTabOptions?.options || []).filter((option) => {
    const needle = priceSearch.trim().toLocaleLowerCase();
    if (!needle) return true;
    const amount = option.amount === null ? "" : `${option.currency || "THB"} ${Number(option.amount).toFixed(2)}`;
    return [option.customer_level_name, option.customer_level_code, option.price_list_name, option.price_list_code, amount]
      .some((value) => String(value || "").toLocaleLowerCase().includes(needle));
  });
  const filteredPickerPriceOptions = (priceOptions?.options || []).filter((option) => {
    const needle = pricePickerSearch.trim().toLocaleLowerCase();
    if (!needle) return true;
    const amount = option.amount === null ? "" : `${option.currency || "THB"} ${Number(option.amount).toFixed(2)}`;
    return [option.customer_level_name, option.customer_level_code, option.price_list_name, option.price_list_code, amount, option.is_custom_mapping ? "my mapping" : "default mapping"]
      .some((value) => String(value || "").toLocaleLowerCase().includes(needle));
  });
  const selectedSupportsProductImageDownload = supportsProductImageDownload(selected);
  const selectedProductImage = selectedProduct?.images.find((image) => image.id === String(selected?.style.productImageId || ""))
    ?? selectedProduct?.images[Math.max(0, Math.min((selectedProduct?.images.length || 1) - 1, Number(selected?.style.productImageIndex || 0)))]
    ?? null;
  const imagePreviewImage = imagePreviewImages[Math.max(0, Math.min(Math.max(0, imagePreviewImages.length - 1), imagePreviewIndex))] ?? null;
  const canManageElements = currentUser ? canAccess(currentUser, "catalogue_designs.manage_elements") : false;
  const canManagePages = currentUser ? canAccess(currentUser, "catalogue_designs.manage_pages") : false;
  const canEdit = currentUser ? canAccess(currentUser, "catalogue_designs.edit") : false;
  const canPublish = currentUser ? canAccess(currentUser, "catalogue_designs.publish") : false;
  const hasOnlineCoverChanges = (design?.online_cover_json?.asset_id || null) !== (design?.published_online_cover_json?.asset_id || null);
  const canExportPdf = currentUser ? canAccess(currentUser, "catalogue_designs.export_pdf") : false;
  const canExportImages = currentUser ? canAccess(currentUser, "catalogue_designs.export_images") : false;
  const canExportTemplates = currentUser ? canAccess(currentUser, "catalogue_designs.export_templates") : false;
  const canCreateTemplates = currentUser ? canAccess(currentUser, "templates.create") : false;
  const canCreateCardTemplates = currentUser ? canAccess(currentUser, "product_card_templates.create") : false;
  const canDuplicateCardTemplates = currentUser ? canAccess(currentUser, "product_card_templates.duplicate") : false;
  const canDeleteOwnCardTemplates = currentUser ? canAccess(currentUser, "product_card_templates.delete_own") || canAccess(currentUser, "product_card_templates.delete_all") : false;
  const canEditCardTemplates = currentUser ? canAccess(currentUser, "product_card_templates.edit_own") || canAccess(currentUser, "product_card_templates.edit_all") : false;
  const canShareCardTemplates = currentUser ? canAccess(currentUser, "product_card_templates.share") : false;
  const canViewCardTemplateVersions = currentUser ? canAccess(currentUser, "product_card_templates.view_versions") : false;
  const canRestoreCardTemplateVersions = currentUser ? canAccess(currentUser, "product_card_templates.restore_version") : false;
  const canAddProductCards = currentUser ? canAccess(currentUser, "catalogue_studio.product_cards.add") : false;
  const canEditCardPrices = currentUser ? canAccess(currentUser, "catalogue_studio.product_cards.edit_prices") : false;
  const canViewMappedPrices = currentUser ? canAccess(currentUser, "prices.view") : false;
  const canViewCardStock = currentUser ? canAccess(currentUser, "catalogue_studio.product_cards.view_stock") : false;
  const canViewCardBarcode = currentUser ? canAccess(currentUser, "catalogue_studio.product_cards.view_barcode") : false;
  const canViewCarousels = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.view") : false;
  const canAddCarousels = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.add") : false;
  const canEditCarousels = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.edit") : false;
  const canDeleteCarousels = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.delete") : false;
  const canUploadCarouselImages = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.upload") : false;
  const canSelectCarouselProductImages = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.select_product_images") : false;
  const canReorderCarouselImages = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.reorder") : false;
  const canConfigureCarouselTransition = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.configure_transition") : false;
  const canConfigureCarouselPdf = currentUser ? canAccess(currentUser, "catalogue_studio.image_carousel.configure_pdf") : false;
  const canRunDataSync = currentUser ? canAccess(currentUser, "data_sync.run") : false;
  const canViewPromotions = currentUser ? canAccess(currentUser, "promotions.view") : false;
  const canCreatePromotions = currentUser ? canAccess(currentUser, "promotions.create") : false;
  const canEditPromotions = currentUser ? canAccess(currentUser, "promotions.edit") : false;
  const boundProductCandidates = Array.from((document?.elements || []).reduce((items, element) => {
    if (element.productId && !items.has(element.productId)) {
      const product = products.find((item) => item.id === element.productId);
      items.set(element.productId, {
        id: element.productId,
        name: String(product?.display_name || product?.erp_name || element.style.productName || element.name || "Product"),
        sku: String(product?.sku || element.style.productSku || ""),
      });
    }
    return items;
  }, new Map<string, { id:string; name:string; sku:string }>()).values());
  const propertiesPanelVisible = leftTab !== "cover" && (Boolean(selected) || leftTab === "pages");
  const pricingProductSignature = (design?.product_items || [])
    .filter((item) => item.is_visible)
    .map((item) => item.product_id)
    .sort()
    .join("|");
  const selectedPricingAudience = pricingOverview?.audiences.find((audience) => String(audience.id) === pricingAudienceId)
    ?? pricingOverview?.audiences[0]
    ?? null;
  const selectedPricingRows = (pricingOverview?.products || []).map((product) => ({
    product,
    option: product.options.find((option) => option.customer_level_id === selectedPricingAudience?.id) ?? null,
  }));
  const pricingBlockingCount = selectedPricingRows.filter(({ option }) => !option || ["missing_price", "mapping_required", "unavailable"].includes(option.status)).length;
  const pricingBrandCount = new Set(selectedPricingRows.map(({ product }) => product.brand || "Unbranded")).size;
  const pricingCustomBrandCount = new Set(selectedPricingRows.filter(({ option }) => option?.mapping_source === "brand").map(({ product }) => product.brand || "Unbranded")).size;
  const coverPages = design?.pages.filter((page) => page.page_type === "cover") || [];
  const promotionPages = design?.pages.filter((page) => page.page_type === "promotion") || [];
  const catalogueContentPages = design?.pages.filter((page) => !["cover", "promotion"].includes(page.page_type)) || [];
  const attachedPromotionIds = new Set(promotionPages.map((page) => page.page_data_json.promotionId).filter(Boolean));

  function updatePanelWidth(side: "left" | "right", value: number) {
    const width = boundedPanelWidth(value, side);
    if (side === "left") setLeftPanelWidth(width);
    else setRightPanelWidth(width);
    window.localStorage.setItem(`catalogue-studio-${side}-panel-width`, String(width));
  }

  function updateDesignWithoutPageViewportJump(nextDesign: StudioDesign, pageId: string) {
    const workspace = canvasWorkspaceRef.current;
    const currentPage = workspace?.querySelector<HTMLElement>(`[data-studio-page-id="${pageId}"]`);
    const previousTop = currentPage?.getBoundingClientRect().top;
    setDesign(nextDesign);
    if (!workspace || previousTop === undefined) return;
    // React first needs to place the reordered page in its new stack position.
    // Compensate the workspace scroll by that exact layout delta so the same
    // point of the active canvas stays under the user's cursor.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const movedPage = workspace.querySelector<HTMLElement>(`[data-studio-page-id="${pageId}"]`);
      if (!movedPage) return;
      workspace.scrollTop += movedPage.getBoundingClientRect().top - previousTop;
    }));
  }

  function beginPanelResize(side: "left" | "right", event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = side === "left" ? leftPanelWidth : rightPanelWidth;
    const body = window.document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = "col-resize";
    body.style.userSelect = "none";
    const move = (pointerEvent: PointerEvent) => {
      const movement = pointerEvent.clientX - startX;
      updatePanelWidth(side, startWidth + (side === "left" ? movement : -movement));
    };
    const finish = () => {
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", finish);
  }

  function resizePanelWithKeyboard(side: "left" | "right", event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") {
      updatePanelWidth(side, side === "left" ? LEFT_PANEL_DEFAULT : RIGHT_PANEL_DEFAULT);
      return;
    }
    const handleMovement = event.key === "ArrowRight" ? 16 : -16;
    updatePanelWidth(side, (side === "left" ? leftPanelWidth : rightPanelWidth) + (side === "left" ? handleMovement : -handleMovement));
  }

  const loadStudioPricing = useCallback(async () => {
    setPricingOverviewLoading(true);
    setPricingOverviewError("");
    try {
      const overview = await getStudioPricingOverview(designId);
      setPricingOverview(overview);
      setPricingAudienceId((current) => overview.audiences.some((audience) => String(audience.id) === current)
        ? current
        : String(overview.audiences.find((audience) => audience.code.toLocaleLowerCase() === "normal")?.id || overview.audiences[0]?.id || ""));
      return overview;
    } catch (caught) {
      setPricingOverview(null);
      setPricingOverviewError(caught instanceof ApiError ? caught.message : "Could not load catalogue pricing.");
      return null;
    } finally {
      setPricingOverviewLoading(false);
    }
  }, [designId]);

  useEffect(() => {
    const color = String(selected?.style.backgroundColor || "#FFFFFF");
    try {
      const rgb = hexToRgb(color.slice(0, 7)); const hsl = rgbToHsl(rgb);
      const timer = window.setTimeout(() => {
        setRgb565Input(formatRgb565(rgbToRgb565(rgb)));
        setRgbInput(`${rgb.r}, ${rgb.g}, ${rgb.b}`);
        setHslInput(`${hsl.h}, ${hsl.s}, ${hsl.l}`);
      }, 0);
      return () => window.clearTimeout(timer);
    } catch { /* keep the user's current input while a partial HEX value is being typed */ }
  }, [selected?.id, selected?.style.backgroundColor]);

  useEffect(() => {
    let active = true;
    Promise.all([getCurrentUser(), getStudioDesign(designId)])
      .then(([user, item]) => {
        if (!active) return;
        if (!canAccess(user, "catalogue_designs.view")) { router.replace("/dashboard"); return; }
        setCurrentUser(user);
        setDesign(item); latestRevision.current = item.revision;
        const first = item.pages[0];
        if (first) {
          const initialDocument=normalizeStudioLayerValues(cloneDocument(first.page_data_json));
          activePageIdRef.current=first.id; documentRef.current=initialDocument; baseDocumentRef.current=cloneDocument(initialDocument);
          setActivePageId(first.id); setDocument(initialDocument);
          if (initialDocument.elements.length === 0 && canAccess(user, "catalogue_designs.manage_elements")) setLeftTab("products");
        }
      })
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Could not load Catalogue Studio."));
    return () => { active = false; };
  }, [designId, router]);

  useEffect(() => {
    if (!currentUser || !canViewMappedPrices) return;
    const timer = window.setTimeout(() => void loadStudioPricing(), 250);
    return () => window.clearTimeout(timer);
  }, [canViewMappedPrices, currentUser, loadStudioPricing, pricingProductSignature]);

  useEffect(() => {
    if (leftTab !== "products" && leftTab !== "cards" && !["product_card", "image_carousel"].includes(selected?.type || "") && !pendingProductCardElement && !pendingPriceElement && !pendingBarcodeElement && !pendingErpImageElement && !pendingErpTableElement) return;
    let active = true;
    const timer = setTimeout(() => {
      setProductsLoading(true);
      void getStudioAvailableProducts(designId, productSearch)
        .then((result) => { if (active) setProducts(result); })
        .catch(() => { if (active) setError("Could not load products from Product Master."); })
        .finally(() => { if (active) setProductsLoading(false); });
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [designId, leftTab, pendingBarcodeElement, pendingErpImageElement, pendingErpTableElement, pendingPriceElement, pendingProductCardElement, productSearch, selected?.type]);

  useEffect(() => {
    if (!pendingErpTableElement || erpTableSelectionMode !== "multiple") return;
    let active = true;
    const timer = window.setTimeout(() => {
      setProductsLoading(true);
      void getStudioAvailableProducts(designId, erpTableProductSearch)
        .then((result) => { if (active) { setErpTableSearchResults(result); setErpTableKnownProducts((current) => Array.from(new Map([...current, ...result].map((product) => [product.id, product])).values())); } })
        .catch(() => { if (active) setErpTableError("Could not search Product Master."); })
        .finally(() => { if (active) setProductsLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [designId, erpTableProductSearch, erpTableSelectionMode, pendingErpTableElement]);

  useEffect(() => {
    if (leftTab !== "cards") return;
    let active = true;
    const timer = window.setTimeout(() => {
      setCardTemplatesLoading(true);
      void getStudioProductCardTemplates()
        .then((result) => { if (active) setCardTemplates(result); })
        .catch((caught) => { if (active) setError(caught instanceof ApiError ? caught.message : "Could not load Product Card Templates."); })
        .finally(() => { if (active) setCardTemplatesLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [leftTab]);

  useEffect(() => {
    if (!selected?.productId || !["product_card", "image", "image_carousel"].includes(selected.type)) {
      const timer = window.setTimeout(() => setSelectedProduct(null), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    void getStudioProduct(designId, selected.productId)
      .then((product) => { if (active) setSelectedProduct(product); })
      .catch(() => { if (active) setSelectedProduct(null); });
    return () => { active = false; };
  }, [designId, selected?.id, selected?.productId, selected?.type]);

  useEffect(() => {
    if (!pendingPriceElement || !priceProductId) {
      const timer = window.setTimeout(() => {
        setPriceOptions(null);
        setPriceOptionsError("");
        setPriceOptionsLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    void getStudioProductPriceOptions(designId, priceProductId)
      .then((result) => { if (active) setPriceOptions(result); })
      .catch((caught) => {
        if (!active) return;
        setPriceOptions(null);
        setPriceOptionsError(caught instanceof ApiError ? caught.message : "Could not load this product's ERP prices.");
      })
      .finally(() => { if (active) setPriceOptionsLoading(false); });
    return () => { active = false; };
  }, [designId, pendingPriceElement, priceProductId]);

  useEffect(() => {
    if (leftTab !== "prices") return;
    let active = true;
    setPriceTabLoading(true);
    setPriceTabError("");
    void getErpCustomerPriceLevels()
      .then((levels) => { if (active) setErpPriceLevels(levels.filter((level) => level.is_active)); })
      .catch((caught) => {
        if (!active) return;
        setErpPriceLevels([]);
        setPriceTabError(caught instanceof ApiError ? caught.message : "Could not load synchronized ERP price levels.");
      })
      .finally(() => { if (active) setPriceTabLoading(false); });
    return () => { active = false; };
  }, [leftTab]);

  useEffect(() => {
    if (leftTab !== "prices") return;
    const placedProductIds = Array.from(new Set((document?.elements || [])
      .map((element) => element.productId)
      .filter((productId): productId is string => Boolean(productId))));
    setPriceTabProductId(selected?.productId || (placedProductIds.length === 1 ? placedProductIds[0] : ""));
    setPriceSearch("");
  }, [document?.elements, leftTab, selected?.productId]);

  useEffect(() => {
    if (leftTab !== "prices") return;
    const query = priceProductSearch.trim();
    if (!query) {
      const timer = window.setTimeout(() => { setPriceProductResults([]); setPriceProductSearchLoading(false); }, 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setPriceProductSearchLoading(true);
      void getStudioAvailableProducts(designId, query)
        .then((results) => { if (active) setPriceProductResults(results.slice(0, 12)); })
        .catch(() => { if (active) setPriceProductResults([]); })
        .finally(() => { if (active) setPriceProductSearchLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [designId, leftTab, priceProductSearch]);

  useEffect(() => {
    if (leftTab !== "prices" || !priceTabProductId) {
      const timer = window.setTimeout(() => {
        setPriceTabProduct(null);
        setPriceTabOptions(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    setPriceTabLoading(true);
    setPriceTabError("");
    void Promise.all([
      getStudioProduct(designId, priceTabProductId),
      getStudioProductPriceOptions(designId, priceTabProductId),
    ])
      .then(([product, options]) => {
        if (!active) return;
        setPriceTabProduct(product);
        setPriceTabOptions(options);
      })
      .catch((caught) => {
        if (!active) return;
        setPriceTabProduct(null);
        setPriceTabOptions(null);
        setPriceTabError(caught instanceof ApiError ? caught.message : "Could not load this product's synchronized ERP prices.");
      })
      .finally(() => { if (active) setPriceTabLoading(false); });
    return () => { active = false; };
  }, [designId, leftTab, priceTabProductId]);

  useEffect(() => {
    if (!pendingBarcodeElement || !barcodeProductId) {
      const timer = window.setTimeout(() => {
        setBarcodeProduct(null);
        setBarcodeError("");
        setBarcodeLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    void getStudioProduct(designId, barcodeProductId)
      .then((product) => {
        if (!active) return;
        setBarcodeProduct(product);
        setBarcodeError(product.barcode ? "" : "This product does not have a barcode in ERP.");
      })
      .catch((caught) => {
        if (!active) return;
        setBarcodeProduct(null);
        setBarcodeError(caught instanceof ApiError ? caught.message : "Could not load this product's ERP barcode.");
      })
      .finally(() => { if (active) setBarcodeLoading(false); });
    return () => { active = false; };
  }, [barcodeProductId, designId, pendingBarcodeElement]);

  useEffect(() => {
    if (!pendingErpImageElement || !erpImageProductId) {
      const timer = window.setTimeout(() => {
        setErpImageProduct(null);
        setErpImageId("");
        setErpImageError("");
        setErpImageLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    void getStudioProduct(designId, erpImageProductId)
      .then((product) => {
        if (!active) return;
        setErpImageProduct(product);
        setErpImageId(product.images[0]?.id || "");
        setErpImageError(product.images.length ? "" : "This product does not have a synchronized ERP image.");
      })
      .catch((caught) => {
        if (!active) return;
        setErpImageProduct(null);
        setErpImageId("");
        setErpImageError(caught instanceof ApiError ? caught.message : "Could not load this product's ERP images.");
      })
      .finally(() => { if (active) setErpImageLoading(false); });
    return () => { active = false; };
  }, [designId, erpImageProductId, pendingErpImageElement]);

  useEffect(() => {
    if (!pendingErpTableElement || !erpTableProductId) {
      const timer = window.setTimeout(() => {
        setErpTableProduct(null);
        setErpTablePriceOptions(null);
        setErpTableError("");
        setErpTableLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    void Promise.allSettled([
      getStudioProduct(designId, erpTableProductId),
      getStudioProductPriceOptions(designId, erpTableProductId),
    ]).then(([productResult, pricesResult]) => {
      if (!active) return;
      if (productResult.status === "rejected") {
        setErpTableProduct(null);
        setErpTablePriceOptions(null);
        setErpTableError(productResult.reason instanceof ApiError ? productResult.reason.message : "Could not load this product's ERP information.");
        return;
      }
      setErpTableProduct(productResult.value);
      setErpTablePriceOptions(pricesResult.status === "fulfilled" ? pricesResult.value : null);
      setErpTableError("");
    }).finally(() => { if (active) setErpTableLoading(false); });
    return () => { active = false; };
  }, [designId, erpTableProductId, pendingErpTableElement]);

  useEffect(() => {
    if (!imagePreviewElement) return;
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setImagePreviewElement(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [imagePreviewElement]);

  useEffect(() => {
    if (!selectedProduct || !selected || selected.productId !== selectedProduct.id) return;
    if (selected.type === "image_carousel") {
      if (!selected.carousel?.autoIncludeNewImages) return;
      const existing = selected.carousel.images.filter((image) => image.sourceType !== "product_image" || image.productId !== selectedProduct.id);
      const productImages: StudioCarouselImage[] = selectedProduct.images.map((image, index) => ({ id: `product-${selectedProduct.id}-${image.id}`, productId: selectedProduct.id, productImageId: image.id, fileName: image.file_name, altText: image.alt_text || selectedProduct.display_name || selectedProduct.erp_name, sourceType: "product_image", displayOrder: index + 1, isActive: true, fit: "contain", positionX: 50, positionY: 50, zoom: 1 }));
      const images = normalizedCarouselImages([...existing, ...productImages]);
      if (images.map((image) => image.id).join(",") === selected.carousel.images.map((image) => image.id).join(",")) return;
      patchSelected({ carousel: { ...selected.carousel, selectedImageIds: images.map((image) => image.productImageId).filter((id): id is string => Boolean(id)), images } });
      return;
    }
    const productImages = selectedProduct.images || [];
    const ids = productImages.map((image) => image.id).join(",");
    const selectedImageId = String(selected.style.productImageId || "");
    const selectedImageIndex = productImages.findIndex((image) => image.id === selectedImageId);
    const savedIndex = Number(selected.style.productImageIndex || 0);
    const safeIndex = productImages.length ? selectedImageIndex >= 0 ? selectedImageIndex : Math.max(0, Math.min(productImages.length - 1, savedIndex)) : 0;
    const currentImage = productImages[safeIndex];
    const nextImageId = currentImage?.id || "";
    const nextImageUrl = currentImage?.url || selectedProduct.primary_image_url || NO_PRODUCT_IMAGE_URL;
    if (String(selected.style.productImageIds || "") === ids
      && Number(selected.style.productImageCount || 0) === productImages.length
      && selectedImageId === nextImageId
      && savedIndex === safeIndex
      && String(selected.style.productImageUrl || "") === nextImageUrl) return;
    patchSelected({}, { productImageIds: ids, productImageCount: productImages.length, productImageId: nextImageId, productImageIndex: safeIndex, productImageUrl: nextImageUrl });
  // The selected card receives current Product Master image IDs for its on-canvas arrows.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct]);

  useEffect(() => {
    const selectedUsesMedia = Boolean(selected && ["image", "image_carousel", "logo", "video", "background"].includes(selected.type));
    if ((leftTab !== "media" && !selectedUsesMedia) || assets.length) return;
    void getStudioAssets().then(setAssets).catch(() => setError("Could not load the Media Library."));
  }, [assets.length, leftTab, selected]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saveStatus === "unsaved" || saveStatus === "saving") event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveStatus]);

  const saveNow = useCallback((): Promise<boolean> => {
    if (!canManageElements) return Promise.resolve(true);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (savePromise.current) return savePromise.current;

    setSaveStatus("saving");
    setError("");
    const run: Promise<boolean> = Promise.resolve().then(async () => {
      try {
        let revisionRecoveryCount = 0;
        while (true) {
          const currentDocument = documentRef.current;
          const pageId = activePageIdRef.current;
          const savingVersion = editVersion.current;
          if (!currentDocument || !pageId) break;
          const pageDocument = normalizeStudioLayerValues(currentDocument);
          if (pageDocument !== currentDocument) {
            documentRef.current = pageDocument;
            setDocument(pageDocument);
          }
          let updated: StudioDesign;
          try {
            updated = await updateStudioPage(designId, pageId, {
              page_data: cloneDocument(pageDocument),
              background_color: pageDocument.canvas.backgroundColor,
              expected_revision: latestRevision.current,
            });
          } catch (caught) {
            if (!(caught instanceof ApiError) || caught.status !== 409 || revisionRecoveryCount >= 2) throw caught;
            const latest = await getStudioDesign(designId);
            latestRevision.current = latest.revision;
            setDesign(latest);
            const remotePage = latest.pages.find((page) => page.id === pageId);
            if (!remotePage) throw new Error("The active Studio page no longer exists.");
            const remoteDocument = normalizeStudioLayerValues(cloneDocument(remotePage.page_data_json));
            const baseDocument = baseDocumentRef.current || remoteDocument;
            const mergedDocument = normalizeStudioLayerValues(mergeStudioDocuments(baseDocument, currentDocument, remoteDocument));
            baseDocumentRef.current = cloneDocument(remoteDocument);
            documentRef.current = mergedDocument;
            setDocument(mergedDocument);
            revisionRecoveryCount += 1;
            setNotice("Autosave merged a newer design revision. New elements and your current canvas changes were both preserved.");
            continue;
          }
          latestRevision.current = updated.revision;
          setDesign(updated);
          window.localStorage.setItem(`catalogue-studio-preview-refresh:${designId}`, String(Date.now()));
          const savedPage = updated.pages.find((page) => page.id === pageId);
          if (savedPage) baseDocumentRef.current = normalizeStudioLayerValues(cloneDocument(savedPage.page_data_json));
          revisionRecoveryCount = 0;
          if (editVersion.current === savingVersion) break;
        }
        autosaveRetryCount.current = 0;
        setSaveStatus("saved");
        return true;
      } catch (caught) {
        autosaveRetryCount.current += 1;
        setSaveStatus("failed");
        setError(caught instanceof ApiError ? caught.message : "Autosave failed. Your changes remain in this browser; try Save now after checking the connection.");
        return false;
      }
    }).finally(() => {
      if (savePromise.current === run) savePromise.current = null;
    });
    savePromise.current = run;
    return run;
  }, [canManageElements, designId]);

  async function openPreview() {
    const previewUrl = `/catalogue-studio/${designId}/preview`;
    const previewWindow = window.open("about:blank", "_blank");
    if (previewWindow) previewWindow.opener = null;
    const saved = await saveNow();
    if (!saved) {
      previewWindow?.close();
      setError("Preview was not opened because the latest editor changes could not be saved.");
      return;
    }
    if (previewWindow) previewWindow.location.href = previewUrl;
    else window.open(previewUrl, "_blank", "noopener,noreferrer");
  }

  const scheduleAutosave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const timer = setTimeout(() => {
      if (saveTimer.current === timer) saveTimer.current = null;
      void saveNow();
    }, 1200);
    saveTimer.current = timer;
  }, [saveNow]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => {
    if (saveStatus !== "failed") return;

    const retry = () => { void saveNow(); };
    const retryOnResume = () => {
      autosaveRetryCount.current = 0;
      retry();
    };
    const retryNumber = autosaveRetryCount.current;
    const timer = retryNumber <= 3
      ? window.setTimeout(retry, Math.max(2000, retryNumber * 2000))
      : null;

    window.addEventListener("online", retryOnResume);
    window.addEventListener("focus", retryOnResume);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener("online", retryOnResume);
      window.removeEventListener("focus", retryOnResume);
    };
  }, [saveNow, saveStatus]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const refreshLiveStock = async () => {
      if (savePromise.current || saveStatus !== "saved") return;
      try {
        const refreshed = await getStudioDesign(designId);
        const refreshedPage = refreshed.pages.find((page) => page.id === activePageIdRef.current);
        if (!refreshedPage || savePromise.current) return;
        const refreshedDocument = normalizeStudioLayerValues(cloneDocument(refreshedPage.page_data_json));
        latestRevision.current = refreshed.revision;
        setDesign(refreshed);
        documentRef.current = refreshedDocument;
        baseDocumentRef.current = cloneDocument(refreshedDocument);
        setDocument(refreshedDocument);
      } catch {
        // Keep the last valid on-canvas stock when a background refresh fails.
      }
    };
    const timer = window.setInterval(() => void refreshLiveStock(), 180_000);
    return () => window.clearInterval(timer);
  }, [designId, saveStatus]);

  const commit = useCallback((next: StudioPageDocument, remember = true) => {
    const currentDocument = documentRef.current;
    if (!currentDocument) return;
    if (remember) setHistory((items) => [...items.slice(-49), cloneDocument(currentDocument)]);
    const normalizedNext = normalizeStudioLayerValues(next);
    autosaveRetryCount.current = 0;
    editVersion.current+=1; documentRef.current=normalizedNext;
    setFuture([]); setDocument(normalizedNext); setSaveStatus("unsaved");
    scheduleAutosave();
  }, [scheduleAutosave]);

  const undo = useCallback(() => {
    if (!document || !history.length) return;
    const previous = normalizeStudioLayerValues(history.at(-1)!); setFuture((items) => [cloneDocument(document), ...items]);
    editVersion.current+=1; documentRef.current=previous;
    setHistory((items) => items.slice(0, -1)); setDocument(previous); setSaveStatus("unsaved");
    scheduleAutosave();
  }, [document, history, scheduleAutosave]);
  const redo = useCallback(() => {
    if (!document || !future.length) return;
    const next = normalizeStudioLayerValues(future[0]); setHistory((items) => [...items, cloneDocument(document)]);
    editVersion.current+=1; documentRef.current=next;
    setFuture((items) => items.slice(1)); setDocument(next); setSaveStatus("unsaved");
    scheduleAutosave();
  }, [document, future, scheduleAutosave]);

  const updateElement = useCallback((element: StudioElement, remember = true) => {
    const currentDocument = documentRef.current;
    if (!currentDocument) return;
    commit({ ...currentDocument, elements: currentDocument.elements.map((item) => item.id === element.id ? element : item) }, remember);
  }, [commit]);

  const reorderLayer = useCallback((draggedId: string, targetId: string, position: "before" | "after") => {
    if (!document || draggedId === targetId) return;
    const ordered = document.elements.slice().sort((a, b) => b.zIndex - a.zIndex);
    const draggedIndex = ordered.findIndex((item) => item.id === draggedId);
    if (draggedIndex < 0 || ordered[draggedIndex].locked) return;
    const [dragged] = ordered.splice(draggedIndex, 1);
    const targetIndex = ordered.findIndex((item) => item.id === targetId);
    if (targetIndex < 0) return;
    ordered.splice(targetIndex + (position === "after" ? 1 : 0), 0, dragged);
    const nextZIndex = new Map(ordered.map((item, index) => [item.id, ordered.length - index]));
    commit({
      ...document,
      elements: document.elements.map((item) => ({ ...item, zIndex: nextZIndex.get(item.id) ?? item.zIndex })),
    });
    setSelectedIds([draggedId]);
  }, [commit, document]);

  const moveLayer = useCallback((elementId: string, offset: -1 | 1) => {
    if (!document) return;
    const ordered = document.elements.slice().sort((a, b) => b.zIndex - a.zIndex);
    const index = ordered.findIndex((item) => item.id === elementId);
    const destination = index + offset;
    if (index < 0 || ordered[index].locked || destination < 0 || destination >= ordered.length) return;
    const target = ordered[destination];
    reorderLayer(elementId, target.id, offset < 0 ? "before" : "after");
  }, [document, reorderLayer]);

  const toggleLayerLocked = useCallback((elementId: string) => {
    if (!document) return;
    const element = document.elements.find((item) => item.id === elementId);
    if (!element) return;
    const locked = !element.locked;
    commit({
      ...document,
      elements: document.elements.map((item) => item.id === elementId ? { ...item, locked } : item),
    });
    setSelectedIds([elementId]);
    setNotice(`${element.name || "Layer"} ${locked ? "locked" : "unlocked"}.`);
  }, [commit, document]);

  const addElement = useCallback((type: StudioElementType, x?: number, y?: number) => {
    if (!document) return;
    if (type === "product_card") {
      setProductCardQuickStyle("showcase");
      setPendingProductCardElement({ x: x ?? 10, y: y ?? 10 });
      return;
    }
    const element = newElement(type, x ?? (type === "image_carousel" ? 33 : type === "page_number" ? 84 : 10), y ?? (type === "image_carousel" ? 36 : type === "page_number" ? 88 : 10));
    if (type === "button") {
      const buttonX = x ?? 10;
      const buttonY = y ?? 10;
      const target = document.elements
        .filter((item) => ["product_card", "image", "image_carousel"].includes(item.type)
          && buttonX >= item.xPercent && buttonX <= item.xPercent + item.widthPercent
          && buttonY >= item.yPercent && buttonY <= item.yPercent + item.heightPercent)
        .sort((left, right) => right.zIndex - left.zIndex)[0];
      if (target) {
        element.productId = target.productId || target.carousel?.productId || target.carousel?.productIds?.[0] || null;
        element.groupId = target.groupId || null;
        element.style = {
          ...element.style,
          downloadTargetElementId: target.id,
          productName: target.style.productName || target.name,
          productSku: target.style.productSku || "",
          productImageIds: target.style.productImageIds || "",
          publicProductImageUrls: target.style.publicProductImageUrls || "",
        };
      }
    }
    if (type === "page_number") element.text = String(activePage?.display_order || 1);
    commit({ ...document, elements: [...document.elements, element] }); setSelectedIds([element.id]);
  }, [activePage?.display_order, commit, document]);

  const openTextPicker = useCallback((x = 10, y = 10) => {
    setPendingTextElement({ x, y });
  }, []);

  const addTextElement = useCallback((withBackground: boolean) => {
    if (!document || !pendingTextElement) return;
    const element = newElement("text", pendingTextElement.x, pendingTextElement.y);
    element.name = withBackground ? "Text with background" : "Text without background";
    element.style = {
      ...element.style,
      backgroundColor: withBackground ? "#FFFFFF" : null,
      borderColor: withBackground ? "#D2E0D7" : "transparent",
      borderWidth: withBackground ? 1 : 0,
      borderRadius: withBackground ? 12 : 0,
      textAlign: withBackground ? "center" : "left",
    };
    commit({ ...document, elements: [...document.elements, element] });
    setSelectedIds([element.id]);
    setPendingTextElement(null);
  }, [commit, document, pendingTextElement]);

  const openShapePicker = useCallback((x = 10, y = 10) => {
    setPendingShapeElement({ x, y });
  }, []);

  const addShapeElement = useCallback((preset: "rectangle" | "rounded" | "square" | "circle" | "oval" | "pill" | "divider" | "panel") => {
    if (!document || !pendingShapeElement) return;
    const definitions = {
      rectangle: { name: "Rectangle", width: 300, height: 150, radius: 0, borderWidth: 0, backgroundColor: "#DDF3E5" },
      rounded: { name: "Rounded rectangle", width: 300, height: 150, radius: 24, borderWidth: 0, backgroundColor: "#DDF3E5" },
      square: { name: "Square", width: 180, height: 180, radius: 0, borderWidth: 0, backgroundColor: "#DDF3E5" },
      circle: { name: "Circle", width: 180, height: 180, radius: 90, borderWidth: 0, backgroundColor: "#DDF3E5" },
      oval: { name: "Oval", width: 280, height: 150, radius: 75, borderWidth: 0, backgroundColor: "#DDF3E5" },
      pill: { name: "Pill", width: 320, height: 90, radius: 45, borderWidth: 0, backgroundColor: "#DDF3E5" },
      divider: { name: "Divider", width: 360, height: 12, radius: 6, borderWidth: 0, backgroundColor: "#126B3A" },
      panel: { name: "Bordered panel", width: 320, height: 200, radius: 18, borderWidth: 3, backgroundColor: "#FFFFFF" },
    } as const;
    const definition = definitions[preset];
    const element = newElement("shape", pendingShapeElement.x, pendingShapeElement.y);
    element.name = definition.name;
    element.widthPercent = Math.min(90, definition.width * 100 / document.canvas.width);
    element.heightPercent = Math.min(90, definition.height * 100 / document.canvas.height);
    element.style = {
      ...element.style,
      shapePreset: preset,
      backgroundColor: definition.backgroundColor,
      borderRadius: definition.radius,
      borderWidth: definition.borderWidth,
      borderColor: "#126B3A",
    };
    commit({ ...document, elements: [...document.elements, element] });
    setSelectedIds([element.id]);
    setPendingShapeElement(null);
    setNotice(`${definition.name} added. Resize and style it in Properties.`);
  }, [commit, document, pendingShapeElement]);

  const addImageGrid = useCallback((presetId: (typeof IMAGE_GRID_PRESETS)[number]["id"]) => {
    if (!document) return;
    const preset = IMAGE_GRID_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const groupId = crypto.randomUUID();
    const margin = 4;
    const availableWidth = 100 - margin * 2;
    const availableHeight = 100 - margin * 2;
    const gap = 1;
    const cells = preset.cells.map(([x, y, width, height], index) => {
      const element = newElement("image");
      element.name = `${preset.name} · image ${index + 1}`;
      element.groupId = groupId;
      element.xPercent = margin + x * availableWidth / 100 + gap / 2;
      element.yPercent = margin + y * availableHeight / 100 + gap / 2;
      element.widthPercent = Math.max(2, width * availableWidth / 100 - gap);
      element.heightPercent = Math.max(2, height * availableHeight / 100 - gap);
      element.style = { ...element.style, imageGridCell: true, imageGridPreset: preset.id, imageGridIndex: index, objectFit: "contain", backgroundColor: "#EDF4EF", borderColor: "#8CAF98", borderWidth: 2, borderRadius: 0 };
      return element;
    });
    commit({ ...document, elements: [...document.elements, ...cells] });
    setSelectedIds(cells.map((cell) => cell.id));
    setImageGridPickerOpen(false);
    setNotice(`${preset.name} image grid added. Select a cell and choose an image, or drag an upload into it.`);
  }, [commit, document]);

  const addCustomImageGrid = useCallback(() => {
    if (!document) return;
    const rows = Math.max(1, Math.min(8, customGridRows));
    const columns = Math.max(1, Math.min(8, customGridColumns));
    const groupId = crypto.randomUUID();
    const margin = 4;
    const availableWidth = 100 - margin * 2;
    const availableHeight = 100 - margin * 2;
    const gap = 1;
    const cells: StudioElement[] = [];
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const element = newElement("image");
      const index = row * columns + column;
      element.name = `${rows} × ${columns} grid · image ${index + 1}`;
      element.groupId = groupId;
      element.xPercent = margin + column * availableWidth / columns + gap / 2;
      element.yPercent = margin + row * availableHeight / rows + gap / 2;
      element.widthPercent = Math.max(2, availableWidth / columns - gap);
      element.heightPercent = Math.max(2, availableHeight / rows - gap);
      element.style = { ...element.style, imageGridCell: true, imageGridPreset: "custom", imageGridIndex: index, imageGridRows: rows, imageGridColumns: columns, objectFit: "contain", backgroundColor: "#EDF4EF", borderColor: "#8CAF98", borderWidth: 2, borderRadius: 0 };
      cells.push(element);
    }
    commit({ ...document, elements: [...document.elements, ...cells] });
    setSelectedIds(cells.map((cell) => cell.id));
    setImageGridPickerOpen(false);
    setNotice(`${rows} × ${columns} custom image grid added. Select a cell and choose an image, or drag an upload into it.`);
  }, [commit, customGridColumns, customGridRows, document]);

  const addBoundField = useCallback((name:string,binding:string) => {
    if (!document) return; const element=boundField(name,binding); commit({...document,elements:[...document.elements,element]}); setSelectedIds([element.id]);
  },[commit,document]);

  const openPricePicker = useCallback((x = 10, y = 10) => {
    const candidates = Array.from((document?.elements || []).reduce((items, element) => {
      if (element.productId) items.add(element.productId);
      return items;
    }, new Set<string>()));
    const initialProductId = selected?.productId || (candidates.length === 1 ? candidates[0] : "");
    setPriceProductId(initialProductId);
    setPricePickerSearch("");
    setPriceOptions(null);
    setPriceOptionsError("");
    setPriceOptionsLoading(Boolean(initialProductId));
    setPendingPriceElement({ x, y });
  }, [document?.elements, selected?.productId]);

  const selectPriceProduct = useCallback((productId: string) => {
    setPriceProductId(productId);
    setPricePickerSearch("");
    setPriceOptions(null);
    setPriceOptionsError("");
    setPriceOptionsLoading(Boolean(productId));
  }, []);

  const addPriceElement = useCallback((option: StudioProductPriceOption, productId: string, x = 10, y = 10) => {
    if (!document || !option.amount) return;
    const element = boundField(`${option.customer_level_name} price`, `{{product.price_list_${option.price_list_id}}}`);
    element.xPercent = x;
    element.yPercent = y;
    element.widthPercent = 30;
    element.heightPercent = 8;
    element.productId = productId;
    element.text = `${option.currency || "THB"} ${Number(option.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    element.style = {
      ...element.style,
      backgroundColor: "transparent",
      borderWidth: 0,
      color: "#0E7A43",
      fontSize: 32,
      fontWeight: "bold",
      priceSource: "erp",
      priceListId: option.price_list_id,
      priceListCode: option.price_list_code,
      priceCustomerLevelId: option.customer_level_id,
      priceCustomerLevelCode: option.customer_level_code,
      priceCustomerLevel: option.customer_level_name,
    };
    commit({ ...document, elements: [...document.elements, element] });
    setSelectedIds([element.id]);
  }, [commit, document]);

  const chooseProductPrice = useCallback((option: StudioProductPriceOption) => {
    if (!pendingPriceElement || !priceProductId || option.amount === null) return;
    addPriceElement(option, priceProductId, pendingPriceElement.x, pendingPriceElement.y);
    setPendingPriceElement(null);
  }, [addPriceElement, pendingPriceElement, priceProductId]);

  const applyPriceToProductCard = useCallback((option: StudioProductPriceOption, secondary = false) => {
    if (!document || !priceTabProductId || option.amount === null) return;
    const selectedCard = selected?.type === "product_card" && selected.productId === priceTabProductId ? selected : null;
    const target = selectedCard || document.elements.find((element) => element.type === "product_card" && element.productId === priceTabProductId);
    if (!target) {
      setError("Add a Product card for this product before assigning its ERP price.");
      return;
    }
    const formatted = `${option.currency || "THB"} ${Number(option.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const style = secondary ? {
      ...target.style,
      productSecondaryPrice: formatted,
      secondaryPriceListId: option.price_list_id,
      secondaryPriceListCode: option.price_list_code,
      secondaryPriceCustomerLevelId: option.customer_level_id,
      secondaryPriceCustomerLevelCode: option.customer_level_code,
      secondaryPriceCustomerLevel: option.customer_level_name,
      showSecondaryPrice: true,
      showProductPrice: true,
      priceMode: "two_prices",
      useErpPrice: true,
    } : {
      ...target.style,
      productPrice: formatted,
      primaryPriceListId: option.price_list_id,
      primaryPriceListCode: option.price_list_code,
      primaryPriceCustomerLevelId: option.customer_level_id,
      primaryPriceCustomerLevelCode: option.customer_level_code,
      primaryPriceCustomerLevel: option.customer_level_name,
      showProductPrice: true,
      priceMode: target.style.priceMode === "two_prices" ? "two_prices" : "one_price",
      useErpPrice: true,
    };
    commit({ ...document, elements: document.elements.map((element) => element.id === target.id ? { ...element, style } : element) });
    setSelectedIds([target.id]);
    setNotice(`${option.customer_level_name} (${option.price_list_code}) is now the ${secondary ? "second" : "primary"} ERP price for this product card.`);
  }, [commit, document, priceTabProductId, selected]);

  const openBarcodePicker = useCallback((x = 10, y = 10) => {
    const candidates = Array.from((document?.elements || []).reduce((items, element) => {
      if (element.productId) items.add(element.productId);
      return items;
    }, new Set<string>()));
    const initialProductId = selected?.productId || (candidates.length === 1 ? candidates[0] : "");
    setBarcodeProductId(initialProductId);
    setBarcodeProduct(null);
    setBarcodeError("");
    setGeneratedBarcodeValue("");
    setGeneratedBarcodeError("");
    setBarcodeLoading(Boolean(initialProductId));
    setPendingBarcodeElement({ x, y });
  }, [document?.elements, selected?.productId]);

  const selectBarcodeProduct = useCallback((productId: string) => {
    setBarcodeProductId(productId);
    setBarcodeProduct(null);
    setBarcodeError("");
    setBarcodeLoading(Boolean(productId));
  }, []);

  const addBarcodeElement = useCallback((product: StudioAvailableProduct, x = 10, y = 10) => {
    if (!document || !product.barcode) return;
    const productName = product.display_name || product.erp_name;
    const element = newElement("barcode", x, y);
    element.name = `${productName} barcode`;
    element.productId = product.id;
    element.binding = "{{product.barcode}}";
    element.target = product.barcode;
    element.text = product.barcode;
    element.widthPercent = 36;
    element.heightPercent = 12;
    element.style = {
      ...element.style,
      backgroundColor: "#FFFFFF",
      borderColor: "#D6E2DA",
      borderWidth: 1,
      borderRadius: 4,
      color: "#111111",
      fontSize: 16,
      textAlign: "center",
      barcodeSource: "erp",
      barcodeValue: product.barcode,
      productName,
      productSku: product.sku,
    };
    commit({ ...document, elements: [...document.elements, element] });
    setSelectedIds([element.id]);
    setPendingBarcodeElement(null);
  }, [commit, document]);

  const addGeneratedBarcodeElement = useCallback((x = 10, y = 10) => {
    if (!document) return;
    const value = generatedBarcodeValue.trim();
    if (!value) {
      setGeneratedBarcodeError("Enter a value to generate the barcode.");
      return;
    }
    if (!/^[\x20-\x7E]+$/.test(value)) {
      setGeneratedBarcodeError("Use letters, numbers, spaces, or standard punctuation only.");
      return;
    }
    const element = newElement("barcode", x, y);
    element.name = "Generated barcode";
    element.target = value;
    element.text = value;
    element.widthPercent = 36;
    element.heightPercent = 12;
    element.style = {
      ...element.style,
      backgroundColor: "#FFFFFF",
      borderColor: "#D6E2DA",
      borderWidth: 1,
      borderRadius: 4,
      color: "#111111",
      fontSize: 16,
      textAlign: "center",
      barcodeSource: "manual",
      barcodeValue: value,
    };
    commit({ ...document, elements: [...document.elements, element] });
    setSelectedIds([element.id]);
    setGeneratedBarcodeError("");
    setPendingBarcodeElement(null);
  }, [commit, document, generatedBarcodeValue]);

  const openErpTablePicker = useCallback((x = 10, y = 10) => {
    const candidates = Array.from((document?.elements || []).reduce((items, element) => {
      if (element.productId) items.add(element.productId);
      return items;
    }, new Set<string>()));
    const initialProductId = selected?.productId || (candidates.length === 1 ? candidates[0] : "");
    setErpTableProductId(initialProductId);
    setErpTableProduct(null);
    setErpTablePriceOptions(null);
    setErpTablePreset("details");
    setErpTableSelectionMode("single");
    setErpTableSelectedProductIds([]);
    setErpTableProductSearch("");
    setErpTableSearchResults([]);
    setErpTableKnownProducts([]);
    setErpTableError("");
    setErpTableLoading(Boolean(initialProductId));
    setPendingErpTableElement({ x, y });
  }, [document?.elements, selected?.productId]);

  const editErpTableProducts = useCallback(async () => {
    if (!selected || selected.type !== "table") return;
    const savedIds = String(selected.style.tableProductIds || selected.productId || "").split(",").map((id) => id.trim()).filter(Boolean);
    const loaded = await Promise.all(savedIds.map(async (id) => {
      const existing = products.find((product) => product.id === id);
      if (existing) return existing;
      try { return await getStudioProduct(designId, id); } catch { return null; }
    }));
    setQuickSelectedProducts(loaded.filter((product): product is StudioAvailableProduct => Boolean(product)));
    setQuickGeneratedProductIds([]);
    setQuickEditingTableId(selected.id);
    setProductSearch("");
    setLeftTab("products");
    setNotice("Editing the selected table. Tick products to add or remove, then click Update selected table.");
  }, [designId, products, selected]);

  const updateQuickEditingTable = useCallback(async () => {
    const currentDocument = documentRef.current;
    if (!currentDocument || !quickEditingTableId || !quickSelectedProducts.length) return;
    setQuickProductGenerating(true);
    setError("");
    try {
      const detailedProducts = await Promise.all(quickSelectedProducts.map(async (product) => {
        try { return await getStudioProduct(designId, product.id); } catch { return product; }
      }));
      const table = currentDocument.elements.find((element) => element.id === quickEditingTableId && element.type === "table");
      if (!table) { setError("The selected table is no longer available on this page."); return; }
      const tableText = buildMultiProductTableText("inventory", detailedProducts);
      const updated: StudioElement = {
        ...table,
        productId: detailedProducts.length === 1 ? detailedProducts[0].id : null,
        binding: "{{product.erp_table_inventory}}",
        text: tableText,
        heightPercent: Math.max(table.heightPercent, Math.min(62, tableText.split("\n").length * 4.5)),
        style: { ...table.style, tableSource: "erp_products", tablePreset: "inventory", tableProductIds: detailedProducts.map((product) => product.id).join(","), tableStockColor: "#16884C" },
      };
      commit({ ...currentDocument, elements: currentDocument.elements.map((element) => element.id === table.id ? updated : element) });
      setSelectedIds([table.id]);
      setQuickEditingTableId(null);
      setQuickSelectedProducts([]);
      setNotice(`Selected table updated with ${detailedProducts.length} product${detailedProducts.length === 1 ? "" : "s"}.`);
    } finally { setQuickProductGenerating(false); }
  }, [commit, designId, quickEditingTableId, quickSelectedProducts]);

  const selectErpTableProduct = useCallback((productId: string) => {
    setErpTableProductId(productId);
    setErpTableProduct(null);
    setErpTablePriceOptions(null);
    setErpTableError("");
    setErpTableLoading(Boolean(productId));
  }, []);

  const chooseErpTable = useCallback(() => {
    const currentDocument = documentRef.current;
    if (!currentDocument || !pendingErpTableElement) return;
    const availableTableProducts = [...products, ...erpTableKnownProducts];
    const selectedProducts = erpTableSelectedProductIds.map((id) => availableTableProducts.find((product) => product.id === id)).filter((product): product is StudioAvailableProduct => Boolean(product));
    const multipleProducts = erpTableSelectionMode === "multiple";
    if (multipleProducts && selectedProducts.length === 0) { setErpTableError("Select at least one product for the table."); return; }
    const sourceProduct = multipleProducts ? selectedProducts[0] : erpTableProduct;
    if (!sourceProduct) return;
    if (!multipleProducts && erpTablePreset === "prices" && !erpTablePriceOptions?.options.length) {
      setErpTableError("This product does not have any authorized customer-level ERP prices.");
      return;
    }
    const productName = sourceProduct.display_name || sourceProduct.erp_name;
    const linkedCarousel = currentDocument.elements.find((item) => item.type === "image_carousel" && (
      item.productId === sourceProduct.id || item.carousel?.productIds?.includes(sourceProduct.id)
    ));
    const carouselProductIds = linkedCarousel ? Array.from(new Set([
      ...(linkedCarousel.carousel?.images || []).filter((image) => image.isActive !== false).map((image) => image.productId).filter((value): value is string => Boolean(value)),
      ...(linkedCarousel.carousel?.productIds || []),
    ])) : [];
    const carouselProducts = carouselProductIds.map((id) => products.find((product) => product.id === id)).filter((product): product is StudioAvailableProduct => Boolean(product));
    const carouselInventory = erpTablePreset === "inventory" && linkedCarousel && carouselProducts.length > 0;
    const tableText = multipleProducts ? buildMultiProductTableText(erpTablePreset, selectedProducts) : carouselInventory ? buildCarouselInventoryTable(carouselProducts) : buildErpTableText(erpTablePreset, sourceProduct, erpTablePriceOptions);
    const rowCount = tableText.split("\n").length;
    const element = newElement("table", pendingErpTableElement.x, pendingErpTableElement.y);
    element.productId = multipleProducts ? null : sourceProduct.id;
    element.name = `${productName} · ERP ${ERP_TABLE_PRESETS.find((preset) => preset.id === erpTablePreset)?.name || "table"}`;
    element.binding = `{{product.erp_table_${erpTablePreset}}}`;
    element.text = tableText;
    element.widthPercent = erpTablePreset === "inventory" ? 72 : erpTablePreset === "prices" ? 68 : 62;
    element.heightPercent = Math.max(14, Math.min(62, rowCount * 4.5));
    element.style = {
      ...element.style,
      tableSource: multipleProducts ? "erp_products" : carouselInventory ? "erp_carousel" : "erp",
      tablePreset: erpTablePreset,
      tableHeaderColor: "transparent",
      tableHeaderTextColor: "#000000",
      tableCellColor: "transparent",
      tableAlternateColor: "transparent",
      backgroundColor: null,
      borderColor: "transparent",
      borderWidth: 0,
      tableStriped: false,
      ...(multipleProducts ? { tableProductIds: erpTableSelectedProductIds.join(","), tableStockColor: "#16884C" } : {}),
      ...(carouselInventory ? { tableCarouselId: linkedCarousel.id, tableProductIds: carouselProductIds.join(","), tableStockColor: "#16884C" } : {}),
      productName,
      productSku: sourceProduct.sku,
      erpLastSynchronizedAt: sourceProduct.last_synchronized_at || "",
    };
    // Append to the live page document. The ERP picker may stay open while
    // product requests and other editor updates complete; using its original
    // render snapshot here could otherwise replace and lose those elements.
    const editedElement = pendingErpTableElement.editElementId
      ? currentDocument.elements.find((item) => item.id === pendingErpTableElement.editElementId)
      : null;
    const nextElement = editedElement ? {
      ...editedElement,
      productId: element.productId,
      name: element.name,
      binding: element.binding,
      text: element.text,
      heightPercent: Math.max(editedElement.heightPercent, Math.min(62, rowCount * 4.5)),
      style: { ...editedElement.style, ...element.style },
    } : element;
    commit({ ...currentDocument, elements: editedElement
      ? currentDocument.elements.map((item) => item.id === editedElement.id ? nextElement : item)
      : [...currentDocument.elements, element] });
    setSelectedIds([nextElement.id]);
    setPendingErpTableElement(null);
    setNotice(`ERP ${ERP_TABLE_PRESETS.find((preset) => preset.id === erpTablePreset)?.name.toLowerCase() || "table"} ${editedElement ? "updated" : "added"} for ${productName}.`);
  }, [commit, erpTableKnownProducts, erpTablePreset, erpTablePriceOptions, erpTableProduct, erpTableSelectedProductIds, erpTableSelectionMode, pendingErpTableElement, products]);

  const chooseBlankTable = useCallback(() => {
    const currentDocument = documentRef.current;
    if (!currentDocument || !pendingErpTableElement) return;
    const element = newElement("table", pendingErpTableElement.x, pendingErpTableElement.y);
    element.name = "Blank table";
    element.binding = null;
    element.text = STUDIO_TABLE_PRESETS.blank;
    element.widthPercent = 60;
    element.heightPercent = 24;
    element.style = {
      ...element.style,
      tableSource: "blank",
      tablePreset: "blank",
    };
    commit({ ...currentDocument, elements: [...currentDocument.elements, element] });
    setSelectedIds([element.id]);
    setPendingErpTableElement(null);
    setNotice("Blank 3 × 3 table added. Edit its cells, rows and columns in Properties.");
  }, [commit, pendingErpTableElement]);

  const openProductImagePreview = useCallback((element: StudioElement) => {
    const previewProductId = element.productId || element.carousel?.productId;
    const requestId = imagePreviewRequest.current + 1;
    imagePreviewRequest.current = requestId;
    setImagePreviewElement(element);
    setImagePreviewProduct(null);
    setImagePreviewImages([]);
    setImagePreviewError("");

    if (element.type === "image_carousel") {
      const images = (element.carousel?.images || [])
        .filter((image) => image.isActive)
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((image): StudioProductImage | null => {
          const url = image.assetId
            ? `/api/v1/catalogue-studio/assets/${image.assetId}/content`
            : (image.productId || element.carousel?.productIds?.[0] || previewProductId) && image.productImageId
              ? `/api/v1/catalogue-studio/designs/${designId}/products/${image.productId || element.carousel?.productIds?.[0] || previewProductId}/images/${image.productImageId}`
              : image.url || "";
          if (!url) return null;
          return {
            id: image.id,
            url,
            file_name: image.fileName || `carousel-image-${image.displayOrder}`,
            alt_text: image.altText || element.name || "Carousel image",
            is_primary: image.displayOrder === 1,
            sort_order: image.displayOrder,
          };
        })
        .filter((image): image is StudioProductImage => Boolean(image));
      const index = Math.max(0, Math.min(Math.max(0, images.length - 1), Number(element.carousel?.currentIndex || 0)));
      setImagePreviewImages(images);
      setImagePreviewIndex(index);
      setImagePreviewLoading(false);
      setImagePreviewError(images.length ? "" : "This carousel does not have an image to preview.");
      return;
    }

    if (!previewProductId) {
      setImagePreviewLoading(false);
      setImagePreviewError("This element does not have a product image to preview.");
      return;
    }
    setImagePreviewIndex(Math.max(0, Number(element.style.productImageIndex || 0)));
    setImagePreviewLoading(true);
    void getStudioProduct(designId, previewProductId)
      .then((product) => {
        if (imagePreviewRequest.current !== requestId) return;
        const selectedImageId = String(element.style.productImageId || "");
        const selectedIndex = product.images.findIndex((image) => image.id === selectedImageId);
        setImagePreviewProduct(product);
        setImagePreviewImages(product.images);
        const fallbackIndex = Number(element.style.productImageIndex || 0);
        setImagePreviewIndex(selectedIndex >= 0 ? selectedIndex : Math.max(0, Math.min(product.images.length - 1, fallbackIndex)));
        setImagePreviewError(product.images.length ? "" : "This product does not have a synchronized image to preview.");
      })
      .catch((caught) => {
        if (imagePreviewRequest.current !== requestId) return;
        setImagePreviewError(caught instanceof ApiError ? caught.message : "Could not load this product's ERP images.");
      })
      .finally(() => { if (imagePreviewRequest.current === requestId) setImagePreviewLoading(false); });
  }, [designId]);

  const closeProductImagePreview = useCallback(() => {
    imagePreviewRequest.current += 1;
    setImagePreviewElement(null);
    setImagePreviewProduct(null);
    setImagePreviewImages([]);
    setImagePreviewError("");
    setImagePreviewLoading(false);
  }, []);

  async function downloadPreviewImage() {
    if (!imagePreviewImage || imagePreviewDownloading) return;
    setImagePreviewDownloading(true);
    setImagePreviewError("");
    try {
      startStudioImageDownload(
        imagePreviewImage.url,
        imagePreviewImage.file_name || `${imagePreviewProduct?.sku || "product"}-image-${imagePreviewIndex + 1}.jpg`,
      );
    } catch (caught) {
      setImagePreviewError(caught instanceof Error ? caught.message : "Could not download this image.");
    } finally {
      setImagePreviewDownloading(false);
    }
  }

  const addProductCard = useCallback((product: StudioAvailableProduct, x = 10, y = 10, quickStyle: ProductCardQuickStyle = "showcase") => {
    if (!document) return;
    const element = newElement("product_card", x, y);
    const presentation = PRODUCT_CARD_QUICK_STYLES[quickStyle];
    element.widthPercent = presentation.widthPercent;
    element.heightPercent = presentation.heightPercent;
    element.productId = product.id;
    element.name = product.display_name || product.erp_name;
    element.binding = `{{product:${product.id}}}`;
    element.style = {
      ...element.style,
      ...presentation.style,
      showProductBarcode: canViewCardBarcode, showProductStock: canViewCardStock,
      ...productCardBindingStyle(product),
    };
    commit({ ...document, elements: [...document.elements, element] });
    setSelectedIds([element.id]);
  }, [canViewCardBarcode, canViewCardStock, commit, document]);

  const addTemplateCard = useCallback((template:StudioProductCardTemplate,product?:StudioAvailableProduct,x=6,y=6) => {
    if (!document) return null;
    const element = newElement("product_card",x,y);
    element.name = template.name;
    element.templateId = template.id;
    element.widthPercent = pixelsToPercent(template.card_width, document.canvas.width);
    element.heightPercent = pixelsToPercent(template.card_height, document.canvas.height);
    element.style = {
      ...element.style, ...templateStyle(template),
      showProductName: true,
      showProductPrice: canEditCardPrices && template.price_mode !== "no_price",
      showSecondaryPrice: canEditCardPrices && template.price_mode === "two_prices",
      showProductImage: true,
      showProductStock: canViewCardStock && template.template_data_json.style?.showProductStock === true,
      showProductBarcode: canViewCardBarcode && template.template_data_json.style?.showProductBarcode === true,
    };
    element.responsive = { ...element.responsive, productCardTemplate: { id:template.id,version:template.current_version,name:template.name } };
    if (product) {
      element.productId = product.id;
      element.name = product.display_name || product.erp_name;
      element.binding = `{{product:${product.id}}}`;
      element.style = { ...element.style, ...productCardBindingStyle(product) };
    }
    const fitted = fitInsidePage(element,document);
    commit({ ...document,elements:[...document.elements,fitted] });
    setSelectedIds([fitted.id]);
    setNotice(`${template.name} added. Assign a product and customize it in Properties.`);
    return fitted;
  },[canEditCardPrices,canViewCardBarcode,canViewCardStock,commit,document]);

  function createCardFromScratch(){
    if (!document) return;
    const width = Math.max(80,Math.min(document.canvas.width,Number(window.prompt("Initial card width in canvas pixels", "320") || 320)));
    const height = Math.max(80,Math.min(document.canvas.height,Number(window.prompt("Initial card height in canvas pixels", "240") || 240)));
    const mode = window.prompt("Layout mode: responsive, fixed, or freeform", "freeform")?.toLowerCase();
    const element = newElement("product_card",6,6);
    element.name = "Custom Product Card";
    element.widthPercent = pixelsToPercent(width,document.canvas.width);
    element.heightPercent = pixelsToPercent(height,document.canvas.height);
    element.style = { ...element.style,cardLayout:"minimal",layoutMode:["responsive","fixed","freeform"].includes(mode || "")?mode!:"freeform",showProductImage:false,showProductName:false,showProductPrice:false,minWidth:80,minHeight:80,lockAspectRatio:false };
    const fitted=fitInsidePage(element,document);
    commit({...document,elements:[...document.elements,fitted]});
    setSelectedIds([fitted.id]);
  }

  function assignProductToSelectedCard(productId:string){
    if (!selected || selected.type !== "product_card" || !document) return;
    const product=products.find(item=>item.id===productId);
    if (!product) return;
    const updated:StudioElement={...selected,productId:product.id,name:product.display_name||product.erp_name,binding:`{{product:${product.id}}}`,style:{...selected.style,...productCardBindingStyle(product)}};
    updateElement(updated);
  }

  async function saveSelectedCardAsTemplate(){
    if (!selected || selected.type!=="product_card" || !activePage) return;
    const name=window.prompt("Template name",`${selected.name || "Product Card"} Template`)?.trim();
    if(!name)return;
    try{
      const created=await createStudioProductCardTemplate({
        name,description:"Saved from Catalogue Studio",template_type:String(selected.style.cardLayout||"custom"),
        template_data:{schemaVersion:2,style:{...selected.style},elements:[],includedFields:["image","name","code","price"]},
        card_width:Math.round(percentToPixels(selected.widthPercent,activePage.width)),
        card_height:Math.round(percentToPixels(selected.heightPercent,activePage.height)),
        border_radius:Number(selected.style.borderRadius||0),layout_mode:String(selected.style.layoutMode||"responsive") as "responsive"|"fixed"|"freeform",
        min_width:Number(selected.style.minWidth||80),min_height:Number(selected.style.minHeight||80),
        aspect_ratio:selected.widthPercent/selected.heightPercent,price_mode:String(selected.style.priceMode||"one_price") as "one_price"|"two_prices"|"no_price",
        visibility_scope:"only_me",change_note:"Saved from a Studio card instance",
      });
      setCardTemplates(items=>[...items,created]);setNotice("Product card template saved.");
    }catch(caught){setError(caught instanceof ApiError?caught.message:"Could not save this product card template.");}
  }

  async function duplicateCardTemplate(template:StudioProductCardTemplate){
    try{const created=await duplicateStudioProductCardTemplate(template.id);setCardTemplates(items=>[...items,created].sort((a,b)=>a.name.localeCompare(b.name)));setNotice("Personal template copy created.");}catch(caught){setError(caught instanceof ApiError?caught.message:"Could not duplicate template.");}
  }

  async function removeCardTemplate(template:StudioProductCardTemplate){
    if(!window.confirm(`Delete ${template.name}? Existing catalogue cards will not be changed.`))return;
    try{await deleteStudioProductCardTemplate(template.id);setCardTemplates(items=>items.filter(item=>item.id!==template.id));setNotice("Template deleted.");}catch(caught){setError(caught instanceof ApiError?caught.message:"Could not delete template.");}
  }

  async function renameCardTemplate(template:StudioProductCardTemplate){
    const name=window.prompt("Template name",template.name)?.trim();
    if(!name||name===template.name)return;
    try{const updated=await updateStudioProductCardTemplate(template.id,{name,change_note:"Renamed in Catalogue Studio"});setCardTemplates(items=>items.map(item=>item.id===updated.id?updated:item));setNotice("Template renamed.");}catch(caught){setError(caught instanceof ApiError?caught.message:"Could not rename template.");}
  }

  async function shareCardTemplate(template:StudioProductCardTemplate){
    if(!window.confirm(`Share ${template.name} with the company?`))return;
    try{const updated=await updateStudioProductCardTemplate(template.id,{visibility_scope:"company",change_note:"Shared with company"});setCardTemplates(items=>items.map(item=>item.id===updated.id?updated:item));setNotice("Template shared with the company.");}catch(caught){setError(caught instanceof ApiError?caught.message:"Could not share template.");}
  }

  async function viewCardTemplateVersions(template:StudioProductCardTemplate){
    try{
      const versions=await getStudioProductCardTemplateVersions(template.id);
      const lines=versions.map(version=>`v${version.version_number} · ${version.width} × ${version.height} · ${new Date(version.created_at).toLocaleString()} · ${version.change_note}`).join("\n");
      if(!canRestoreCardTemplateVersions){window.alert(`${template.name} versions:\n\n${lines}`);return;}
      const requested=window.prompt(`${template.name} versions:\n\n${lines}\n\nEnter a version number to restore, or leave blank to close.`)?.trim();
      if(!requested)return;
      const version=versions.find(item=>String(item.version_number)===requested);
      if(!version){setError("That template version was not found.");return;}
      if(!window.confirm(`Restore version ${version.version_number} as a new current version?`))return;
      const restored=await restoreStudioProductCardTemplateVersion(template.id,version.id);
      setCardTemplates(items=>items.map(item=>item.id===restored.id?restored:item));
      setNotice(`Template version ${version.version_number} restored as v${restored.current_version}.`);
    }catch(caught){setError(caught instanceof ApiError?caught.message:"Could not load template versions.");}
  }

  function applyTemplateToSelectedProducts(template:StudioProductCardTemplate){
    if(!document||!bulkProductIds.length)return;
    const chosen=bulkProductIds.map(id=>products.find(product=>product.id===id)).filter((product):product is StudioAvailableProduct=>Boolean(product));
    const width=Math.min(template.card_width,(document.canvas.width-48)/2);
    const height=Math.min(template.card_height,document.canvas.height-48);
    const additions=chosen.map((product,index)=>{
      const element=newElement("product_card");
      element.templateId=template.id;element.productId=product.id;element.name=product.display_name||product.erp_name;element.binding=`{{product:${product.id}}}`;
      element.widthPercent=pixelsToPercent(width,document.canvas.width);element.heightPercent=pixelsToPercent(height,document.canvas.height);
      element.xPercent=pixelsToPercent(24+(index%2)*(width+16),document.canvas.width);element.yPercent=pixelsToPercent(24+Math.floor(index/2)*(height+16),document.canvas.height);
      element.style={...element.style,...templateStyle(template),...productCardBindingStyle(product),showProductName:true,showProductPrice:canEditCardPrices&&template.price_mode!=="no_price",showSecondaryPrice:canEditCardPrices&&template.price_mode==="two_prices",showProductStock:canViewCardStock&&template.template_data_json.style?.showProductStock===true,showProductBarcode:canViewCardBarcode&&template.template_data_json.style?.showProductBarcode===true};
      element.responsive={...element.responsive,productCardTemplate:{id:template.id,version:template.current_version,name:template.name}};
      return fitInsidePage(element,document);
    });
    commit({...document,elements:[...document.elements,...additions]});setSelectedIds(additions.map(item=>item.id));setBulkProductIds([]);
    setNotice(`${additions.length} product cards added. Use Auto Layout to arrange them.`);
  }

  function autoLayoutSelectedCards(){
    if(!document||!activePage)return;
    const cards=document.elements.filter(element=>selectedIds.includes(element.id)&&element.type==="product_card");
    if(cards.length<2){setError("Select at least two product cards for Auto Layout.");return;}
    const columns=Math.max(1,Number(window.prompt("Columns","2")||2));
    const result=autoLayoutProductCards(document,selectedIds,{columns,cardWidth:Math.min(320,(activePage.width-48)/columns),cardHeight:260,horizontalGap:16,verticalGap:16,margin:24});
    commit({...result,elements:result.elements});
    setNotice(result.overflowCount?`${result.overflowCount} card(s) reached the page boundary; add a page for overflow.`:"Auto Layout applied.");
  }

  function resizeSelectedCardPixels(nextWidth:number,nextHeight:number,changed:"width"|"height"|"both"="both"){
    if(!selected||selected.type!=="product_card"||!document)return;
    const currentWidth=percentToPixels(selected.widthPercent,document.canvas.width);
    const currentHeight=percentToPixels(selected.heightPercent,document.canvas.height);
    const ratio=currentWidth/Math.max(1,currentHeight);
    let width=Math.max(Number(selected.style.minWidth||40),Math.min(document.canvas.width,nextWidth));
    let height=Math.max(Number(selected.style.minHeight||40),Math.min(document.canvas.height,nextHeight));
    if(selected.style.lockAspectRatio===true){if(changed==="width")height=width/ratio;else if(changed==="height")width=height*ratio;}
    updateElement(fitInsidePage({...selected,widthPercent:pixelsToPercent(width,document.canvas.width),heightPercent:pixelsToPercent(height,document.canvas.height)},document));
  }

  function applySelectedCardPreset(preset:ProductCardSizePreset){if(selected&&selected.type==="product_card"&&document)updateElement(applyCardPreset(selected,document,preset));}

  function resetSelectedCardToTemplate(){
    if(!selected?.templateId)return;
    const template=cardTemplates.find(item=>item.id===selected.templateId);
    if(!template){setError("Open Product Cards once to load the source template, then try Reset again.");return;}
    patchSelected({},templateStyle(template));
  }

  const addProductImage = useCallback((product: StudioAvailableProduct, x = 10, y = 10, selectedImageId = "") => {
    const currentDocument = documentRef.current || document;
    if (!currentDocument) return;
    const gridCell = imageGridTarget(currentDocument, selectedIds);
    const element = gridCell ? structuredClone(gridCell) : newElement("image", x, y);
    element.productId = product.id;
    element.name = `${product.display_name || product.erp_name} · ERP image`;
    element.binding = `{{product.image}}`;
    const images = product.images || [];
    const selectedIndex = Math.max(0, images.findIndex((image) => image.id === selectedImageId));
    const selectedImage = images[selectedIndex];
    element.style = {
      ...element.style,
      backgroundColor: "transparent",
      borderWidth: 0,
      objectFit: "contain",
      productImageUrl: selectedImage?.url || product.primary_image_url || NO_PRODUCT_IMAGE_URL,
      productImageId: selectedImage?.id || images[0]?.id || "",
      productImageIndex: selectedIndex,
      productImageIds: images.map((image) => image.id).join(","),
      productImageCount: images.length,
      productName: product.display_name || product.erp_name,
      productSku: product.sku,
      imageSource: "erp",
    };
    const fittedElement = gridCell
      ? productImageGridCell(element, product, images, selectedIndex)
      : element;
    commit({
      ...currentDocument,
      elements: gridCell
        ? currentDocument.elements.map((item) => item.id === gridCell.id ? fittedElement : item)
        : [...currentDocument.elements, fittedElement],
    });
    setSelectedIds([element.id]);
    if (gridCell) setNotice("Product image fitted inside the selected grid cell.");
  }, [commit, document, selectedIds]);

  const addAllProductImages = useCallback(async (product: StudioAvailableProduct, x = 10, y = 10, preferredGridCellId?: string) => {
    if (!documentRef.current && !document) return;
    let current = product;
    try {
      const refreshed = await getStudioProduct(designId, product.id);
      if ((refreshed.images?.length || 0) >= (product.images?.length || 0)) current = refreshed;
    } catch {
      // The Product Master search row still contains a usable synchronized image set.
    }
    const synchronizedImages = current.images?.length
      ? current.images
      : current.primary_image_url
        ? [{ id: "", url: current.primary_image_url, file_name: "ERP primary image", alt_text: "", is_primary: true, sort_order: 0 }]
        : [{ id: "", url: NO_PRODUCT_IMAGE_URL, file_name: "No image available.png", alt_text: "No image available", is_primary: true, sort_order: 0 }];
    const currentDocument = documentRef.current || document;
    if (!currentDocument) return;
    const gridCell = imageGridTarget(currentDocument, selectedIds, preferredGridCellId);
    const width = 24;
    const height = 18;
    const startX = Math.max(0, Math.min(100 - width, x));
    const startY = Math.max(0, Math.min(100 - height, y));
    const productName = current.display_name || current.erp_name;
    const firstImage = synchronizedImages[0];
    const element = gridCell ? structuredClone(gridCell) : newElement("image", startX, startY);
    element.productId = current.id;
    element.name = synchronizedImages.length > 1 ? `${productName} · image carousel` : `${productName} · ERP image`;
    element.binding = "{{product.image}}";
    element.style = {
      ...element.style,
      backgroundColor: "transparent",
      borderWidth: 0,
      objectFit: "contain",
      productImageUrl: firstImage.url || current.primary_image_url || "",
      productImageId: firstImage.id,
      productImageIndex: 0,
      productImageIds: synchronizedImages.map((image) => image.id).filter(Boolean).join(","),
      productImageCount: synchronizedImages.length,
      productImageMode: synchronizedImages.length > 1 ? "carousel" : "single",
      productName,
      productSku: current.sku,
      imageSource: "erp",
    };
    const fittedElement = gridCell
      ? productImageGridCell(element, current, synchronizedImages, 0)
      : element;
    commit({
      ...currentDocument,
      elements: gridCell
        ? currentDocument.elements.map((item) => item.id === gridCell.id ? fittedElement : item)
        : [...currentDocument.elements, fittedElement],
    });
    setSelectedIds([fittedElement.id]);
    setNotice(gridCell
      ? synchronizedImages.length > 1
        ? `Fitted ${synchronizedImages.length} product images inside the grid cell. Use the arrows to move between images.`
        : "Product image fitted inside the grid cell."
      : synchronizedImages.length > 1
        ? `Added one image carousel with ${synchronizedImages.length} ERP images. Use the arrows to move between images.`
        : "Added the ERP product image. This product currently has only one synchronized image, so transition arrows will appear after another image is uploaded or pulled from ERP.");
  }, [commit, designId, document, selectedIds]);

  const addProductImageAndLiveTable = useCallback(async (product: StudioAvailableProduct) => {
    const startingDocument = documentRef.current;
    if (!startingDocument) return;
    let current = product;
    try {
      current = await getStudioProduct(designId, product.id);
    } catch {
      // Product Master search results already contain enough synchronized data
      // to create the block when the detail request is temporarily unavailable.
    }
    const currentDocument = documentRef.current;
    if (!currentDocument) return;
    const images = current.images?.length
      ? current.images
      : current.primary_image_url
        ? [{ id: "", url: current.primary_image_url, file_name: "ERP primary image", alt_text: "", is_primary: true, sort_order: 0 }]
        : [{ id: "", url: NO_PRODUCT_IMAGE_URL, file_name: "No image available.png", alt_text: "No image available", is_primary: true, sort_order: 0 }];
    const existingBlocks = new Set(currentDocument.elements.map((element) => String(element.style.quickProductBlockId || "")).filter(Boolean)).size;
    const column = existingBlocks % 2;
    const row = Math.floor(existingBlocks / 2);
    const blockX = 5 + column * 48;
    const blockY = Math.min(76, 6 + row * 24);
    const quickProductBlockId = crypto.randomUUID();
    const productName = current.display_name || current.erp_name;
    const firstImage = images[0];

    const image = newElement("image", blockX, blockY);
    image.productId = current.id;
    image.name = `${productName} · product images`;
    image.binding = "{{product.image}}";
    image.widthPercent = 17;
    image.heightPercent = 18;
    image.style = {
      ...image.style,
      quickProductBlockId,
      independentFrames: true,
      backgroundColor: "transparent",
      borderWidth: 0,
      objectFit: "contain",
      productImageUrl: firstImage.url || current.primary_image_url || NO_PRODUCT_IMAGE_URL,
      productImageId: firstImage.id,
      productImageIndex: 0,
      productImageIds: images.map((item) => item.id).filter(Boolean).join(","),
      productImageCount: images.length,
      productImageMode: images.length > 1 ? "carousel" : "single",
      productName,
      productSku: current.sku,
      imageSource: "erp",
    };

    const table = newElement("table", blockX + 18, blockY + 2);
    table.productId = current.id;
    table.name = `${productName} · live inventory`;
    table.binding = "{{product.erp_table_inventory}}";
    table.text = buildErpTableText("inventory", current, null);
    table.widthPercent = 27;
    table.heightPercent = 12;
    table.style = {
      ...table.style,
      quickProductBlockId,
      independentFrames: true,
      tableSource: "erp",
      tablePreset: "inventory",
      tableHeaderColor: "transparent",
      tableHeaderTextColor: "#000000",
      tableCellColor: "transparent",
      tableAlternateColor: "transparent",
      tableStockColor: "#16884C",
      backgroundColor: null,
      borderColor: "#C8D5CD",
      borderWidth: 1,
      tableStriped: false,
      productName,
      productSku: current.sku,
      erpLastSynchronizedAt: current.last_synchronized_at || "",
    };

    commit({ ...currentDocument, elements: [...currentDocument.elements, image, table] });
    setSelectedIds([image.id]);
    setNotice(`${productName} added in two separate frames: product image and live code, barcode and stock table.`);
  }, [commit, designId]);

  const toggleQuickProduct = useCallback((product: StudioAvailableProduct, checked: boolean) => {
    setQuickGeneratedProductIds([]);
    setQuickSelectedProducts((current) => checked
      ? current.some((item) => item.id === product.id) ? current : [...current, product]
      : current.filter((item) => item.id !== product.id));
  }, []);

  const generateSelectedProductFrames = useCallback(async () => {
    const currentDocument = documentRef.current;
    if (!currentDocument || !quickSelectedProducts.length) return;
    setQuickProductGenerating(true);
    setError("");
    try {
      const detailedProducts = await Promise.all(quickSelectedProducts.map(async (product) => {
        try { return await getStudioProduct(designId, product.id); } catch { return product; }
      }));
      const additions: StudioElement[] = [];

      if (detailedProducts.length > 1) {
        const quickProductBlockId = crypto.randomUUID();
        const productIds = detailedProducts.map((product) => product.id);
        const carouselImages = detailedProducts.flatMap((product) => {
          const productName = product.display_name || product.erp_name;
          const images = product.images?.length
            ? product.images
            : [{ id: "", url: product.primary_image_url || NO_PRODUCT_IMAGE_URL, file_name: product.primary_image_url ? "ERP primary image" : "No image available.png", alt_text: productName, is_primary: true, sort_order: 0 }];
          return images.map((image, imageIndex): StudioCarouselImage => ({
            id: image.id ? `product-${product.id}-${image.id}` : `product-${product.id}-fallback-${imageIndex}`,
            productId: product.id,
            productImageId: image.id || null,
            url: image.url || NO_PRODUCT_IMAGE_URL,
            fileName: image.file_name,
            altText: image.alt_text || productName,
            sourceType: "product_image",
            displayOrder: 0,
            isActive: true,
            fit: "contain",
            positionX: 50,
            positionY: 50,
            zoom: 1,
          }));
        }).map((image, index) => ({ ...image, displayOrder: index + 1 }));

        const carousel = newElement("image_carousel", 5, 6);
        carousel.name = `${detailedProducts.length} selected products · image carousel`;
        carousel.widthPercent = 34;
        carousel.heightPercent = 28;
        carousel.carousel = {
          ...defaultCarouselConfig(),
          sourceType: "selected_product_images",
          productId: null,
          productIds,
          selectedImageIds: carouselImages.map((image) => image.productImageId).filter((id): id is string => Boolean(id)),
          images: carouselImages,
          autoIncludeNewImages: true,
        };
        carousel.style = { ...carousel.style, quickProductBlockId, independentFrames: true };

        const tableText = buildMultiProductTableText("inventory", detailedProducts);
        const table = newElement("table", 42, 6);
        table.name = `${detailedProducts.length} selected products · live inventory`;
        table.binding = "{{product.erp_table_inventory}}";
        table.text = tableText;
        table.widthPercent = 52;
        table.heightPercent = Math.max(14, Math.min(48, tableText.split("\n").length * 5));
        table.style = { ...table.style, quickProductBlockId, independentFrames: true, tableSource: "erp_products", tablePreset: "inventory", tableProductIds: productIds.join(","), tableHeaderColor: "transparent", tableHeaderTextColor: "#000000", tableCellColor: "transparent", tableAlternateColor: "transparent", tableStockColor: "#16884C", backgroundColor: null, borderColor: "#C8D5CD", borderWidth: 1, tableStriped: false };
        additions.push(carousel, table);

        const uniquePriceProducts = detailedProducts.filter((product, index, products) => {
          const priceKey = `${product.price_currency || "THB"}:${product.price === null || product.price === undefined ? "unavailable" : Number(product.price)}`;
          return products.findIndex((candidate) => `${candidate.price_currency || "THB"}:${candidate.price === null || candidate.price === undefined ? "unavailable" : Number(candidate.price)}` === priceKey) === index;
        });
        uniquePriceProducts.forEach((product, index) => {
          const productName = product.display_name || product.erp_name;
          const price = boundField(`${productName} · price`, "{{product.price}}");
          price.productId = product.id;
          price.xPercent = 5 + (index % 3) * 30;
          price.yPercent = 38 + Math.floor(index / 3) * 9;
          price.widthPercent = 26;
          price.heightPercent = 7;
          price.text = product.price ? `${product.price_currency || "THB"} ${Number(product.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Price unavailable";
          price.style = { ...price.style, quickProductBlockId, independentFrames: true, backgroundColor: "transparent", borderWidth: 0, color: "#0E7A43", fontSize: 22, fontWeight: "bold", priceSource: "erp", productName, productSku: product.sku };
          additions.push(price);
        });
      } else {
        const product = detailedProducts[0];
        const blockId = crypto.randomUUID();
        const productName = product.display_name || product.erp_name;
        const images = product.images?.length ? product.images : product.primary_image_url ? [{ id: "", url: product.primary_image_url, file_name: "ERP primary image", alt_text: productName, is_primary: true, sort_order: 0 }] : [{ id: "", url: NO_PRODUCT_IMAGE_URL, file_name: "No image available.png", alt_text: "No image available", is_primary: true, sort_order: 0 }];
        const firstImage = images[0];
        const image = newElement("image", 5, 6);
        image.productId = product.id; image.name = `${productName} · product image`; image.binding = "{{product.image}}"; image.widthPercent = 24; image.heightPercent = 24;
        image.style = { ...image.style, quickProductBlockId: blockId, independentFrames: true, backgroundColor: "transparent", borderWidth: 0, objectFit: "contain", productImageUrl: firstImage.url || NO_PRODUCT_IMAGE_URL, productImageId: firstImage.id, productImageIndex: 0, productImageIds: images.map((item) => item.id).filter(Boolean).join(","), productImageCount: images.length, productImageMode: images.length > 1 ? "carousel" : "single", productName, productSku: product.sku, imageSource: "erp" };
        const table = newElement("table", 32, 6);
        table.productId = product.id; table.name = `${productName} · live inventory`; table.binding = "{{product.erp_table_inventory}}"; table.text = buildErpTableText("inventory", product, null); table.widthPercent = 42; table.heightPercent = 18;
        table.style = { ...table.style, quickProductBlockId: blockId, independentFrames: true, tableSource: "erp", tablePreset: "inventory", tableHeaderColor: "transparent", tableHeaderTextColor: "#000000", tableCellColor: "transparent", tableAlternateColor: "transparent", tableStockColor: "#16884C", backgroundColor: null, borderColor: "#C8D5CD", borderWidth: 1, tableStriped: false, productName, productSku: product.sku, erpLastSynchronizedAt: product.last_synchronized_at || "" };
        const price = boundField(`${productName} · price`, "{{product.price}}");
        price.productId = product.id; price.xPercent = 77; price.yPercent = 10; price.widthPercent = 18; price.heightPercent = 7; price.text = product.price ? `${product.price_currency || "THB"} ${Number(product.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Price unavailable";
        price.style = { ...price.style, quickProductBlockId: blockId, independentFrames: true, backgroundColor: "transparent", borderWidth: 0, color: "#0E7A43", fontSize: 22, fontWeight: "bold", priceSource: "erp", productName, productSku: product.sku };
        additions.push(image, table, price);
      }
      commit({ ...currentDocument, elements: [...currentDocument.elements, ...additions] });
      setSelectedIds(additions.length ? [additions[0].id] : []);
      setQuickGeneratedProductIds(detailedProducts.map((product) => product.id));
      setNotice(detailedProducts.length > 1 ? `${detailedProducts.length} products added in one image carousel and one live code, barcode and stock table. Matching prices were combined into one editable frame.` : "Product added with separate image, live inventory table and price frames.");
    } finally { setQuickProductGenerating(false); }
  }, [commit, designId, quickSelectedProducts]);

  const sequenceBlocksForDocument = (pageDocument: StudioPageDocument) => {
    const keyedElements = new Map<string, StudioElement[]>();
    pageDocument.elements.forEach((element) => {
      const blockId = productSequenceBlockKey(element);
      if (!blockId) return;
      const existing = keyedElements.get(blockId) || [];
      existing.push(element);
      keyedElements.set(blockId, existing);
    });

    // Older catalogue cards were assembled from independent frames. Only the
    // ERP image/table/price received product metadata, while the card shell,
    // title, description and download control remained ordinary elements.
    // Treat the smallest enclosing card shell as the visual boundary and add
    // every unbound frame inside it to the same sequence block. This keeps
    // existing catalogues compatible without accidentally absorbing another
    // product's explicitly-linked elements.
    const claimedElementIds = new Set<string>();
    const expandedBlocks = Array.from(keyedElements.entries()).map(([id, linkedElements]) => {
      const centres = linkedElements.map((element) => ({
        x: element.xPercent + element.widthPercent / 2,
        y: element.yPercent + element.heightPercent / 2,
      }));
      const shells = pageDocument.elements.filter((candidate) => {
        if (!candidate.visible || !["shape", "rectangle", "product_card"].includes(candidate.type)) return false;
        if (productSequenceBlockKey(candidate) && !linkedElements.some((element) => element.id === candidate.id)) return false;
        const area = candidate.widthPercent * candidate.heightPercent;
        if (area < 4 || area > 65 * 65) return false;
        return centres.every((centre) => centre.x >= candidate.xPercent - 0.5
          && centre.x <= candidate.xPercent + candidate.widthPercent + 0.5
          && centre.y >= candidate.yPercent - 0.5
          && centre.y <= candidate.yPercent + candidate.heightPercent + 0.5);
      }).sort((a, b) => a.widthPercent * a.heightPercent - b.widthPercent * b.heightPercent);
      const shell = shells[0];
      const elements = shell
        ? pageDocument.elements.filter((element) => {
            const explicitKey = productSequenceBlockKey(element);
            if (explicitKey && explicitKey !== id) return false;
            const centreX = element.xPercent + element.widthPercent / 2;
            const centreY = element.yPercent + element.heightPercent / 2;
            const insideShell = centreX >= shell.xPercent - 0.5
              && centreX <= shell.xPercent + shell.widthPercent + 0.5
              && centreY >= shell.yPercent - 0.5
              && centreY <= shell.yPercent + shell.heightPercent + 0.5;
            // Some legacy card templates place the small price-pill background
            // directly on the card's lower edge. Include that decoration even
            // when rounding leaves its centre a few percent below the shell.
            const lowerEdgeDecoration = element.type === "shape"
              && /^pill(?:\s|$)/i.test(element.name.trim())
              && element.heightPercent <= 8
              && centreX >= shell.xPercent
              && centreX <= shell.xPercent + shell.widthPercent
              && centreY > shell.yPercent + shell.heightPercent
              && centreY <= shell.yPercent + shell.heightPercent + 10;
            return insideShell || lowerEdgeDecoration;
          })
        : linkedElements;
      const uniqueElements = elements.filter((element) => {
        if (claimedElementIds.has(element.id) && !linkedElements.some((linked) => linked.id === element.id)) return false;
        claimedElementIds.add(element.id);
        return true;
      });
      return [id, uniqueElements] as const;
    });

    return expandedBlocks.map(([id, elements]) => {
    const productCodes = Array.from(new Set(elements.flatMap((element) => {
      const sku = String(element.style.productSku || "").trim();
      if (sku) return [sku];
      if (element.type === "table" && element.text) return element.text.split(/\r?\n/).slice(1).map((row) => row.split("|")[0]?.trim() || "").filter(Boolean);
      const productIds = element.carousel?.productIds?.length ? element.carousel.productIds : String(element.style.tableProductIds || "").split(",").filter(Boolean);
      return productIds.map((productId) => products.find((product) => product.id === productId)?.sku || "").filter(Boolean);
    })));
      return { id, elements, x: Math.min(...elements.map((element) => element.xPercent)), y: Math.min(...elements.map((element) => element.yPercent)), label: productCodes.length ? productCodes.join(", ") : String(elements[0]?.style.productName || elements[0]?.name || "Product card") };
    }).sort((a, b) => a.y - b.y || a.x - b.x);
  };

  const productSequenceBlocks = (design?.pages || []).flatMap((page, pageIndex) => {
    const pageDocument = page.id === activePageId && document ? document : page.page_data_json;
    return sequenceBlocksForDocument(pageDocument).map((block) => ({ ...block, pageId: page.id, pageName: page.page_name, pageIndex }));
  }).sort((a, b) => a.pageIndex - b.pageIndex || a.y - b.y || a.x - b.x);

  async function moveProductSequenceBlock(pageId: string, blockId: string, direction: -1 | 1) {
    if (!design || productSequenceBusy) return;
    const fromIndex = productSequenceBlocks.findIndex((block) => block.pageId === pageId && block.id === blockId);
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= productSequenceBlocks.length) return;
    setProductSequenceBusy(true);
    setError("");
    try {
      if (!await saveNow()) return;
      let latest = await getStudioDesign(design.id);
      latestRevision.current = latest.revision;
      const requestedSource = productSequenceBlocks[fromIndex];
      const requestedTarget = productSequenceBlocks[toIndex];
      const sourcePage = latest.pages.find((page) => page.id === requestedSource.pageId);
      const targetPage = latest.pages.find((page) => page.id === requestedTarget.pageId);
      if (!sourcePage || !targetPage) throw new Error("A catalogue page is no longer available.");
      const sourceDocument = normalizeStudioLayerValues(cloneDocument(sourcePage.page_data_json));
      const targetDocument = sourcePage.id === targetPage.id ? sourceDocument : normalizeStudioLayerValues(cloneDocument(targetPage.page_data_json));
      const source = sequenceBlocksForDocument(sourceDocument).find((block) => block.id === requestedSource.id);
      const target = sequenceBlocksForDocument(targetDocument).find((block) => block.id === requestedTarget.id);
      if (!source || !target) throw new Error("A product card changed while its sequence was being updated.");
      const sourceIds = new Set(source.elements.map((element) => element.id));
      const targetIds = new Set(target.elements.map((element) => element.id));
      const moveToTarget = source.elements.map((element) => ({ ...structuredClone(element), xPercent: element.xPercent + target.x - source.x, yPercent: element.yPercent + target.y - source.y }));
      const moveToSource = target.elements.map((element) => ({ ...structuredClone(element), xPercent: element.xPercent + source.x - target.x, yPercent: element.yPercent + source.y - target.y }));
      if (sourcePage.id === targetPage.id) {
        sourceDocument.elements = sourceDocument.elements.map((element) => sourceIds.has(element.id) ? moveToTarget.find((item) => item.id === element.id)! : targetIds.has(element.id) ? moveToSource.find((item) => item.id === element.id)! : element);
        latest = await updateStudioPage(latest.id, sourcePage.id, { page_data: sourceDocument, background_color: sourceDocument.canvas.backgroundColor, expected_revision: latestRevision.current });
      } else {
        targetDocument.elements = [...targetDocument.elements.filter((element) => !targetIds.has(element.id)), ...moveToTarget];
        sourceDocument.elements = [...sourceDocument.elements.filter((element) => !sourceIds.has(element.id)), ...moveToSource];
        latest = await updateStudioPage(latest.id, targetPage.id, { page_data: targetDocument, background_color: targetDocument.canvas.backgroundColor, expected_revision: latestRevision.current });
        latestRevision.current = latest.revision;
        latest = await updateStudioPage(latest.id, sourcePage.id, { page_data: sourceDocument, background_color: sourceDocument.canvas.backgroundColor, expected_revision: latestRevision.current });
      }
      latestRevision.current = latest.revision;
      setDesign(latest);
      const refreshedActivePage = latest.pages.find((page) => page.id === activePageIdRef.current);
      if (refreshedActivePage) {
        const refreshedDocument = normalizeStudioLayerValues(cloneDocument(refreshedActivePage.page_data_json));
        documentRef.current = refreshedDocument;
        baseDocumentRef.current = cloneDocument(refreshedDocument);
        setDocument(refreshedDocument);
        setSaveStatus("saved");
      }
      setSelectedIds([]);
      setNotice(sourcePage.id === targetPage.id ? "Product sequence updated. The complete product cards moved together." : `Product cards moved between ${sourcePage.page_name} and ${targetPage.page_name}.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : caught instanceof Error ? caught.message : "Could not update the multi-page product sequence.");
    } finally {
      setProductSequenceBusy(false);
    }
  }

  const completeQuickProductBatch = useCallback(() => {
    if (!quickSelectedProducts.length) return;
    const selectedIds = quickSelectedProducts.map((product) => product.id).sort();
    const generatedIds = [...quickGeneratedProductIds].sort();
    if (selectedIds.join(",") !== generatedIds.join(",")) {
      setError("Generate the carousel and live table for these selected products before marking the product card completed.");
      return;
    }
    setQuickCompletedBatches((batches) => [...batches, quickSelectedProducts]);
    setQuickSelectedProducts([]);
    setQuickGeneratedProductIds([]);
    setProductSearch("");
    setNotice("Product card completed. Select the next products to generate a new carousel and table.");
  }, [quickGeneratedProductIds, quickSelectedProducts]);

  const removeSelectedProductsFromPage = useCallback(() => {
    const currentDocument = documentRef.current;
    if (!currentDocument || !quickSelectedProducts.length) return;
    const ids = new Set(quickSelectedProducts.map((product) => product.id));
    const removed = currentDocument.elements.filter((element) => element.productId && ids.has(element.productId)).length;
    if (!removed || !window.confirm(`Remove ${removed} frame${removed === 1 ? "" : "s"} belonging to the selected products from this page?`)) return;
    commit({ ...currentDocument, elements: currentDocument.elements.filter((element) => !element.productId || !ids.has(element.productId)) });
    setSelectedIds([]);
    setNotice(`${removed} product frame${removed === 1 ? "" : "s"} removed. Add the products again at any time.`);
  }, [commit, quickSelectedProducts]);

  const openErpImagePicker = useCallback((x = 10, y = 10) => {
    const candidates = Array.from((document?.elements || []).reduce((items, element) => {
      if (element.productId) items.add(element.productId);
      return items;
    }, new Set<string>()));
    const initialProductId = selected?.productId || (candidates.length === 1 ? candidates[0] : "");
    setErpImageProductId(initialProductId);
    setErpImageProduct(null);
    setErpImageId("");
    setErpImageError("");
    setErpImageLoading(Boolean(initialProductId));
    setPendingErpImageElement({ x, y });
  }, [document?.elements, selected?.productId]);

  const selectErpImageProduct = useCallback((productId: string) => {
    setErpImageProductId(productId);
    setErpImageProduct(null);
    setErpImageId("");
    setErpImageError("");
    setErpImageLoading(Boolean(productId));
  }, []);

  const chooseErpProductImage = useCallback(() => {
    if (!pendingErpImageElement || !erpImageProduct || !erpImageId) return;
    addProductImage(erpImageProduct, pendingErpImageElement.x, pendingErpImageElement.y, erpImageId);
    setPendingErpImageElement(null);
  }, [addProductImage, erpImageId, erpImageProduct, pendingErpImageElement]);

  const duplicateSelected = useCallback(() => {
    if (!document || !selectedIds.length) return;
    const copiedGroupIds = new Map<string, string>();
    const copies = document.elements.filter((item) => selectedIds.includes(item.id)).map((item) => {
      const groupId = item.groupId ? copiedGroupIds.get(item.groupId) || crypto.randomUUID() : null;
      if (item.groupId && groupId) copiedGroupIds.set(item.groupId, groupId);
      return { ...structuredClone(item), id: crypto.randomUUID(), groupId, name: `${item.name} copy`, xPercent: item.xPercent + 2, yPercent: item.yPercent + 2, zIndex: item.zIndex + 1 };
    });
    commit({ ...document, elements: [...document.elements, ...copies] }); setSelectedIds(copies.map((item) => item.id));
  }, [commit, document, selectedIds]);

  const deleteSelected = useCallback(() => {
    if (!document || !selectedIds.length) return;
    if (!canDeleteCarousels && document.elements.some((item) => selectedIds.includes(item.id) && item.type === "image_carousel")) {
      setError("You do not have permission to delete Image Carousel elements.");
      return;
    }
    commit({ ...document, elements: document.elements.filter((item) => !selectedIds.includes(item.id) || item.locked) }); setSelectedIds([]);
  }, [canDeleteCarousels, commit, document, selectedIds]);

  const copySelected = useCallback(() => {
    if (!document || !selectedIds.length) return;
    clipboard.current = document.elements.filter((item) => selectedIds.includes(item.id)).map((item) => structuredClone(item));
  }, [document, selectedIds]);

  const pasteClipboard = useCallback(() => {
    if (!document || !clipboard.current.length) return;
    const copiedGroupIds = new Map<string, string>();
    const copies = clipboard.current.map((item) => {
      const groupId = item.groupId ? copiedGroupIds.get(item.groupId) || crypto.randomUUID() : null;
      if (item.groupId && groupId) copiedGroupIds.set(item.groupId, groupId);
      return { ...structuredClone(item), id: crypto.randomUUID(), groupId, xPercent: item.xPercent + 2, yPercent: item.yPercent + 2, zIndex: item.zIndex + 1 };
    });
    commit({ ...document, elements: [...document.elements, ...copies] });
    setSelectedIds(copies.map((item) => item.id));
  }, [commit, document]);

  const expandGroupedIds = useCallback((ids: string[]) => {
    if (!document) return ids;
    const requested = new Set(ids);
    const groupIds = new Set(document.elements.filter((item) => requested.has(item.id) && item.groupId).map((item) => item.groupId));
    for (const item of document.elements) if (item.groupId && groupIds.has(item.groupId)) requested.add(item.id);
    return document.elements.filter((item) => requested.has(item.id)).map((item) => item.id);
  }, [document]);

  const selectCanvasElement = useCallback((id: string, additive: boolean) => {
    setCropModeElementId((current) => current === id && !additive ? current : null);
    if (!id) { if (!additive) setSelectedIds([]); return; }
    const clicked = document?.elements.find((element) => element.id === id);
    // Image-grid cells share a group for whole-layout transforms, but a normal
    // click must target one frame so its image can be assigned independently.
    // Ctrl/Shift click retains grouped selection for moving the full grid.
    const ids = !additive && clicked?.style.imageGridCell === true ? [id] : expandGroupedIds([id]);
    setSelectedIds((current) => {
      if (!additive) return ids;
      const next = new Set(current);
      const remove = ids.every((item) => next.has(item));
      for (const item of ids) {
        if (remove) next.delete(item);
        else next.add(item);
      }
      return Array.from(next);
    });
  }, [document?.elements, expandGroupedIds]);

  const openElementContextMenu = useCallback((elementId: string, clientX: number, clientY: number) => {
    if (!canManageElements) return;
    if (!selectedIds.includes(elementId)) selectCanvasElement(elementId, false);
    setElementContextMenu({
      x: Math.max(8, Math.min(clientX, window.innerWidth - 206)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - 292)),
    });
  }, [canManageElements, selectCanvasElement, selectedIds]);

  const selectCanvasElements = useCallback((ids: string[], additive: boolean) => {
    setCropModeElementId(null);
    const expanded = expandGroupedIds(ids);
    setSelectedIds((current) => additive ? Array.from(new Set([...current, ...expanded])) : expanded);
    setSelectionMode(false);
  }, [expandGroupedIds]);

  const moveCanvasSelection = useCallback((sourceId: string, deltaXPercent: number, deltaYPercent: number) => {
    if (!document || (!deltaXPercent && !deltaYPercent)) return;
    const movingIds = selectedIds.includes(sourceId) ? selectedIds : expandGroupedIds([sourceId]);
    const moving = document.elements.filter((item) => movingIds.includes(item.id) && !item.locked);
    if (!moving.length) return;
    const minX = Math.min(...moving.map((item) => item.xPercent));
    const minY = Math.min(...moving.map((item) => item.yPercent));
    const maxRight = Math.max(...moving.map((item) => item.xPercent + item.widthPercent));
    const maxBottom = Math.max(...moving.map((item) => item.yPercent + item.heightPercent));
    const deltaX = Math.max(-minX, Math.min(100 - maxRight, deltaXPercent));
    const deltaY = Math.max(-minY, Math.min(100 - maxBottom, deltaYPercent));
    if (!deltaX && !deltaY) return;
    commit({ ...document, elements: document.elements.map((item) => movingIds.includes(item.id) && !item.locked ? { ...item, xPercent: item.xPercent + deltaX, yPercent: item.yPercent + deltaY } : item) });
    setSelectedIds(expandGroupedIds(movingIds));
  }, [commit, document, expandGroupedIds, selectedIds]);

  const transformCanvasSelection = useCallback((transformed: StudioElement[]) => {
    if (!document || !transformed.length) return;
    const replacements = new Map(transformed.filter((item) => !item.locked).map((item) => [item.id, item]));
    if (!replacements.size) return;
    commit({ ...document, elements: document.elements.map((item) => replacements.get(item.id) || item) });
  }, [commit, document]);

  const groupSelected = useCallback(() => {
    if (!document || selectedIds.length < 2) return;
    const groupId = crypto.randomUUID();
    commit({ ...document, elements: document.elements.map((item) => selectedIds.includes(item.id) ? { ...item, groupId } : item) });
    setSelectionMode(false);
  }, [commit, document, selectedIds]);

  const ungroupSelected = useCallback(() => {
    if (!document || !selectedIds.length) return;
    const groupIds = new Set(document.elements.filter((item) => selectedIds.includes(item.id) && item.groupId).map((item) => item.groupId));
    commit({ ...document, elements: document.elements.map((item) => item.groupId && groupIds.has(item.groupId) ? { ...item, groupId: null } : item) });
  }, [commit, document, selectedIds]);

  const alignSelected = useCallback((position: "left" | "center" | "right" | "top" | "middle" | "bottom") => {
    if (!document || !selectedIds.length) return;
    commit({ ...document, elements: document.elements.map((item) => {
      if (!selectedIds.includes(item.id) || item.locked) return item;
      if (position === "left") return { ...item, xPercent: 0 };
      if (position === "center") return { ...item, xPercent: (100 - item.widthPercent) / 2 };
      if (position === "right") return { ...item, xPercent: 100 - item.widthPercent };
      if (position === "top") return { ...item, yPercent: 0 };
      if (position === "middle") return { ...item, yPercent: (100 - item.heightPercent) / 2 };
      return { ...item, yPercent: 100 - item.heightPercent };
    }) });
  }, [commit, document, selectedIds]);

  const distributeSelected = useCallback((axis: "horizontal" | "vertical") => {
    if (!document || selectedIds.length < 3) return;
    const selectedElements = document.elements.filter((item) => selectedIds.includes(item.id) && !item.locked)
      .sort((a, b) => axis === "horizontal" ? a.xPercent - b.xPercent : a.yPercent - b.yPercent);
    if (selectedElements.length < 3) return;
    const first = selectedElements[0], last = selectedElements.at(-1)!;
    const distance = axis === "horizontal"
      ? (last.xPercent - first.xPercent) / (selectedElements.length - 1)
      : (last.yPercent - first.yPercent) / (selectedElements.length - 1);
    const positions = new Map(selectedElements.map((item, index) => [item.id, (axis === "horizontal" ? first.xPercent : first.yPercent) + distance * index]));
    commit({ ...document, elements: document.elements.map((item) => positions.has(item.id) ? axis === "horizontal" ? { ...item, xPercent: positions.get(item.id)! } : { ...item, yPercent: positions.get(item.id)! } : item) });
  }, [commit, document, selectedIds]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === "s") { event.preventDefault(); void saveNow(); return; }
      if (command && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); return; }
      if (command && event.key.toLowerCase() === "c") { event.preventDefault(); copySelected(); return; }
      if (command && event.key.toLowerCase() === "x") { event.preventDefault(); copySelected(); deleteSelected(); return; }
      if (command && event.key.toLowerCase() === "v") { event.preventDefault(); pasteClipboard(); return; }
      if (command && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateSelected(); return; }
      if (command && event.key.toLowerCase() === "g") { event.preventDefault(); if (event.shiftKey) ungroupSelected(); else groupSelected(); return; }
      if (event.key === "Escape") { if (cropModeElementId) { setCropModeElementId(null); return; } setSelectionMode(false); setSelectedIds([]); return; }
      if (["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); deleteSelected(); return; }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && selected) {
        event.preventDefault(); const amount = event.shiftKey ? 2 : .25;
        moveCanvasSelection(selected.id, event.key === "ArrowRight" ? amount : event.key === "ArrowLeft" ? -amount : 0, event.key === "ArrowDown" ? amount : event.key === "ArrowUp" ? -amount : 0);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [copySelected, cropModeElementId, deleteSelected, duplicateSelected, groupSelected, moveCanvasSelection, pasteClipboard, redo, saveNow, selected, undo, ungroupSelected]);

  useEffect(() => {
    if (!elementContextMenu) return;
    const close = () => setElementContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", close);
    };
  }, [elementContextMenu]);

  async function selectPage(page: StudioPage, skipSave = false): Promise<boolean> {
    if (page.id === activePageId) return true;
    if (!skipSave && ["unsaved", "saving", "failed"].includes(saveStatus) && !await saveNow()) return false;
    const nextDocument = cloneDocument(page.page_data_json);
    activePageIdRef.current = page.id;
    documentRef.current = nextDocument;
    baseDocumentRef.current = cloneDocument(nextDocument);
    setActivePageId(page.id); setDocument(nextDocument); setSelectedIds([]); setSelectionMode(false); setCropModeElementId(null); setHistory([]); setFuture([]); setSaveStatus("saved");
    return true;
  }

  async function moveSelectionToAdjacentPage(sourceId: string, direction: -1 | 1, deltaXPercent: number) {
    if (!design || !documentRef.current || crossPageMoveLockRef.current || !canManageElements) return;
    crossPageMoveLockRef.current = true;
    setError("");
    try {
      if (!await saveNow()) return;
      const latest = await getStudioDesign(design.id);
      latestRevision.current = latest.revision;
      const sourceIndex = latest.pages.findIndex((page) => page.id === activePageIdRef.current);
      const destinationIndex = sourceIndex + direction;
      if (sourceIndex < 0 || destinationIndex < 0 || destinationIndex >= latest.pages.length) return;

      const sourcePage = latest.pages[sourceIndex];
      const destinationPage = latest.pages[destinationIndex];
      if (destinationPage.is_locked) {
        setNotice(`${destinationPage.page_name} is locked. Unlock it before moving elements onto it.`);
        return;
      }
      const sourceDocument = normalizeStudioLayerValues(cloneDocument(sourcePage.page_data_json));
      const sourceElement = sourceDocument.elements.find((element) => element.id === sourceId);
      if (!sourceElement || sourceElement.locked) return;

      const requestedIds = selectedIds.includes(sourceId)
        ? new Set(selectedIds)
        : new Set(sourceElement.groupId
          ? sourceDocument.elements.filter((element) => element.groupId === sourceElement.groupId).map((element) => element.id)
          : [sourceId]);
      const movingElements = sourceDocument.elements
        .filter((element) => requestedIds.has(element.id) && !element.locked)
        .sort((left, right) => left.zIndex - right.zIndex);
      if (!movingElements.length) return;

      const minY = Math.min(...movingElements.map((element) => element.yPercent));
      const maxY = Math.max(...movingElements.map((element) => element.yPercent + element.heightPercent));
      const yOffset = direction > 0 ? 2 - minY : 98 - maxY;
      const destinationDocument = normalizeStudioLayerValues(cloneDocument(destinationPage.page_data_json));
      const existingIds = new Set(movingElements.map((element) => element.id));
      const highestZIndex = destinationDocument.elements.reduce((highest, element) => Math.max(highest, element.zIndex), 0);
      const movedElements = movingElements.map((element, index) => ({
        ...structuredClone(element),
        xPercent: Math.max(0, Math.min(100 - element.widthPercent, element.xPercent + deltaXPercent)),
        yPercent: Math.max(0, Math.min(100 - element.heightPercent, element.yPercent + yOffset)),
        zIndex: highestZIndex + index + 1,
      }));
      destinationDocument.elements = [
        ...destinationDocument.elements.filter((element) => !existingIds.has(element.id)),
        ...movedElements,
      ];

      // Write the destination first so an interrupted request can never lose an element.
      let updated = await updateStudioPage(latest.id, destinationPage.id, {
        page_data: destinationDocument,
        background_color: destinationDocument.canvas.backgroundColor,
        expected_revision: latestRevision.current,
      });
      latestRevision.current = updated.revision;
      const savedSourcePage = updated.pages.find((page) => page.id === sourcePage.id);
      if (!savedSourcePage) throw new Error("The source page is no longer available.");
      const savedSourceDocument = normalizeStudioLayerValues(cloneDocument(savedSourcePage.page_data_json));
      savedSourceDocument.elements = savedSourceDocument.elements.filter((element) => !existingIds.has(element.id));
      updated = await updateStudioPage(updated.id, sourcePage.id, {
        page_data: savedSourceDocument,
        background_color: savedSourceDocument.canvas.backgroundColor,
        expected_revision: latestRevision.current,
      });
      latestRevision.current = updated.revision;
      setDesign(updated);
      const savedDestinationPage = updated.pages.find((page) => page.id === destinationPage.id);
      if (!savedDestinationPage) throw new Error("The destination page is no longer available.");
      await selectPage(savedDestinationPage, true);
      setSelectedIds(movedElements.map((element) => element.id));
      setNotice(`${movedElements.length === 1 ? "Element" : `${movedElements.length} elements`} moved to ${savedDestinationPage.page_name}.`);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const workspace = canvasWorkspaceRef.current;
          const destination = workspace?.querySelector<HTMLElement>(`[data-studio-page-id="${savedDestinationPage.id}"]`);
          if (!workspace || !destination) return;
          const workspaceBounds = workspace.getBoundingClientRect();
          const destinationBounds = destination.getBoundingClientRect();
          workspace.scrollTo({
            top: workspace.scrollTop + destinationBounds.top - workspaceBounds.top - 18,
            behavior: "smooth",
          });
        });
      });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not move the element to the adjacent page. Its original page has been preserved.");
      try {
        const refreshed = await getStudioDesign(design.id);
        latestRevision.current = refreshed.revision;
        setDesign(refreshed);
      } catch {
        // Keep the current browser document intact when the server cannot be reloaded.
      }
    } finally {
      crossPageMoveLockRef.current = false;
    }
  }

  async function loadPromotionChoices() {
    if (!canViewPromotions || promotionsLoading) return;
    setPromotionsLoading(true);
    setError("");
    try {
      const result = await getPromotions({ page_size: 100, sort: "start_asc" });
      setPromotionChoices(result.items.filter((promotion) => !["cancelled", "expired"].includes(promotion.status)));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load promotions.");
    } finally {
      setPromotionsLoading(false);
    }
  }

  async function togglePromotionPicker() {
    const nextOpen = !promotionPickerOpen;
    setPromotionPickerOpen(nextOpen);
    if (nextOpen && promotionChoices.length === 0) await loadPromotionChoices();
  }

  async function addPromotionPage(promotion: Promotion) {
    if (!design || addingPage || addingPromotionId || attachedPromotionIds.has(promotion.id)) return;
    setAddingPage(true);
    setAddingPromotionId(promotion.id);
    setError("");
    try {
      if (["unsaved", "saving", "failed"].includes(saveStatus) && !await saveNow()) return;
      const pageId = crypto.randomUUID();
      const pageDocument = buildStudioPromotionPage(promotion, design, pageId);
      const createdPage = await createStudioPage(design.id, {
        page_type: "promotion",
        page_name: pageDocument.name,
        width: design.page_width,
        height: design.page_height,
        orientation: design.page_width >= design.page_height ? "landscape" : "portrait",
        background_color: pageDocument.canvas.backgroundColor,
        page_data: pageDocument,
        is_visible: true,
      });
      let refreshed = await getStudioDesign(design.id);
      const orderedIds = structuredStudioPageIds(refreshed.pages);
      if (orderedIds.some((id, index) => id !== refreshed.pages[index]?.id)) {
        refreshed = await reorderStudioPages(design.id, orderedIds, refreshed.revision);
      }
      if (design.catalogue_id && !promotion.catalogue_ids.includes(design.catalogue_id)) {
        const attached = await attachPromotionToCatalogue(promotion.id, design.catalogue_id);
        setPromotionChoices((current) => current.map((item) => item.id === attached.id ? attached : item));
      }
      latestRevision.current = refreshed.revision;
      setDesign(refreshed);
      const savedPage = refreshed.pages.find((page) => page.id === createdPage.id) || createdPage;
      await selectPage(savedPage, true);
      setPromotionPickerOpen(false);
      setNotice(`${promotion.name_en} promotion page added after the cover.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add the promotion page.");
      try {
        const refreshed = await getStudioDesign(design.id);
        latestRevision.current = refreshed.revision;
        setDesign(refreshed);
      } catch {
        // Preserve the current editor when recovery cannot reach the server.
      }
    } finally {
      setAddingPromotionId(null);
      setAddingPage(false);
    }
  }

  async function addPage(pageType: StudioPageType = "free_layout", source?: StudioPageDocument) {
    if (!design || addingPage) return;
    setAddingPage(true);
    setError("");
    try {
      if (["unsaved", "saving", "failed"].includes(saveStatus) && !await saveNow()) return;
      const duplicateSource = source ? cloneDocument(documentRef.current || source) : null;
      const label = PAGE_TYPES.find(([type]) => type === pageType)?.[1] || "Page";
      const pageDocument: StudioPageDocument = duplicateSource ? { ...duplicateSource, pageId: crypto.randomUUID(), name: `${duplicateSource.name} copy` } : {
        pageId: crypto.randomUUID(), pageType, name: label,
        canvas: { width: design.page_width, height: design.page_height, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: true, bleed: 0 }, elements: [], dataMode: design.data_mode,
      };
      const pageWidth = duplicateSource?.canvas.width || design.page_width;
      const pageHeight = duplicateSource?.canvas.height || design.page_height;
      const page = await createStudioPage(design.id, { page_type: pageType, page_name: pageDocument.name, width: pageWidth, height: pageHeight, orientation: pageWidth >= pageHeight ? "landscape" : "portrait", background_color: pageDocument.canvas.backgroundColor, page_data: pageDocument, is_visible: true });
      let refreshed = await getStudioDesign(design.id);
      const orderedIds = structuredStudioPageIds(refreshed.pages);
      if (orderedIds.some((id, index) => id !== refreshed.pages[index]?.id)) {
        refreshed = await reorderStudioPages(design.id, orderedIds, refreshed.revision);
      }
      const savedPage = refreshed.pages.find((item) => item.id === page.id) || page;
      setDesign(refreshed);
      latestRevision.current = refreshed.revision;
      await selectPage(savedPage, true);
      setNotice(`${savedPage.page_name} added.`);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
        const workspace = canvasWorkspaceRef.current;
        const addedPage = workspace?.querySelector<HTMLElement>(`[data-studio-page-id="${savedPage.id}"]`);
        if (!workspace || !addedPage) return;
        const workspaceBounds = workspace.getBoundingClientRect();
        const addedPageBounds = addedPage.getBoundingClientRect();
        workspace.scrollTo({ top: workspace.scrollTop + addedPageBounds.top - workspaceBounds.top - 18, behavior: "smooth" });
      }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add the page.");
    } finally {
      setAddingPage(false);
    }
  }

  async function removePage() {
    if (!design || !activePage || deletingPageId || !confirm(`Delete ${activePage.page_name}?`)) return;
    if (design.pages.length <= 1) {
      setError("A catalogue must contain at least one page.");
      return;
    }

    const pageToDelete = activePage;
    const originalDesign = design;
    const deletedPageIndex = design.pages.findIndex((page) => page.id === pageToDelete.id);
    const remainingPages = design.pages.filter((page) => page.id !== pageToDelete.id);
    const fallbackPage = remainingPages[Math.min(deletedPageIndex, remainingPages.length - 1)];

    // Edits on a page being deleted do not need an extra autosave round trip. Only
    // wait when a request is already in flight so its revision cannot race deletion.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (savePromise.current && !await savePromise.current) return;

    setDeletingPageId(pageToDelete.id);
    setError("");
    setDesign({ ...design, pages: remainingPages });
    activePageIdRef.current = fallbackPage.id;
    const fallbackDocument = normalizeStudioLayerValues(cloneDocument(fallbackPage.page_data_json));
    documentRef.current = fallbackDocument;
    baseDocumentRef.current = cloneDocument(fallbackDocument);
    setActivePageId(fallbackPage.id);
    setDocument(fallbackDocument);
    setSelectedIds([]);
    setSelectionMode(false);
    setCropModeElementId(null);
    setHistory([]);
    setFuture([]);
    setSaveStatus("saved");

    try {
      const updated = await deleteStudioPage(design.id, pageToDelete.id, latestRevision.current);
      latestRevision.current = updated.revision;
      setDesign(updated);
      const savedFallback = updated.pages.find((page) => page.id === fallbackPage.id);
      if (savedFallback) {
        const savedDocument = normalizeStudioLayerValues(cloneDocument(savedFallback.page_data_json));
        documentRef.current = savedDocument;
        baseDocumentRef.current = cloneDocument(savedDocument);
        setDocument(savedDocument);
      }
      const promotionId = pageToDelete.page_data_json.promotionId;
      const hasAnotherPlacement = updated.pages.some((page) => page.page_data_json.promotionId === promotionId);
      if (promotionId && design.catalogue_id && canEditPromotions && !hasAnotherPlacement) {
        try {
          await detachPromotionFromCatalogue(promotionId, design.catalogue_id);
          setPromotionChoices((current) => current.map((promotion) => promotion.id === promotionId
            ? { ...promotion, catalogue_ids: promotion.catalogue_ids.filter((id) => id !== design.catalogue_id) }
            : promotion));
        } catch {
          setError("The page was deleted, but its catalogue placement could not be removed from Promotion Management.");
        }
      }
      setNotice(`${pageToDelete.page_name} was deleted.`);
    } catch (caught) {
      setDesign(originalDesign);
      activePageIdRef.current = pageToDelete.id;
      const restoredDocument = normalizeStudioLayerValues(cloneDocument(pageToDelete.page_data_json));
      documentRef.current = restoredDocument;
      baseDocumentRef.current = cloneDocument(restoredDocument);
      setActivePageId(pageToDelete.id);
      setDocument(restoredDocument);
      setError(caught instanceof ApiError ? caught.message : "Could not delete the page.");
    } finally {
      setDeletingPageId(null);
    }
  }

  async function movePage(direction: -1 | 1) {
    if (!design || !activePage || pageOrderBusyRef.current) return;
    const current = design.pages.findIndex((item) => item.id === activePage.id); const destination = current + direction;
    if (destination < 0 || destination >= design.pages.length) return;
    const ids = design.pages.map((item) => item.id); [ids[current], ids[destination]] = [ids[destination], ids[current]];
    const byId = new Map(design.pages.map((page) => [page.id, page]));
    const structuredIds = structuredStudioPageIds(ids.map((id) => byId.get(id)!).filter(Boolean));
    if (structuredIds.every((id, index) => id === design.pages[index]?.id)) return;
    pageOrderBusyRef.current = true;
    setReorderingPages(true);
    try {
      if (["unsaved", "saving", "failed"].includes(saveStatus) && !await saveNow()) return;
      const updated = await reorderStudioPages(design.id, structuredIds, latestRevision.current);
      latestRevision.current = updated.revision;
      updateDesignWithoutPageViewportJump(updated, activePage.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reorder pages.");
    } finally {
      pageOrderBusyRef.current = false;
      setReorderingPages(false);
    }
  }

  async function dropPage(draggedId: string, targetId: string, position: StudioPageDropPosition) {
    if (!design || !canManagePages || pageOrderBusyRef.current) return;
    const originalIds = design.pages.map((page) => page.id);
    const ids = reorderStructuredStudioPageIds(design.pages, draggedId, targetId, position);
    if (ids.every((id, index) => id === originalIds[index])) return;
    pageOrderBusyRef.current = true;
    setReorderingPages(true);
    try {
      if (["unsaved", "saving", "failed"].includes(saveStatus) && !await saveNow()) return;
      const updated = await reorderStudioPages(design.id, ids, latestRevision.current);
      latestRevision.current = updated.revision;
      updateDesignWithoutPageViewportJump(updated, activePageIdRef.current);
      setNotice("Page order saved.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reorder pages.");
    } finally {
      pageOrderBusyRef.current = false;
      setReorderingPages(false);
    }
  }

  async function patchPage(changes: { page_name?: string; is_visible?: boolean; is_locked?: boolean; width?: number; height?: number; orientation?: "portrait" | "landscape" | "square"; navigationCategory?: string }) {
    if (!design || !activePage || !document) return;
    const { navigationCategory, ...pageChanges } = changes;
    const nextCanvasWidth = changes.width ?? document.canvas.width;
    const nextCanvasHeight = changes.height ?? document.canvas.height;
    const resizedDocument = normalizeStudioLayerValues(resizePageDocument(document, nextCanvasWidth, nextCanvasHeight));
    const renamedDocument = changes.page_name ? { ...resizedDocument, name: changes.page_name } : resizedDocument;
    const nextDocument = navigationCategory === undefined
      ? renamedDocument
      : { ...renamedDocument, navigationCategory: navigationCategory.trim() };
    try {
      const updated = await updateStudioPage(design.id, activePage.id, { ...pageChanges, page_data: nextDocument, expected_revision: latestRevision.current });
      latestRevision.current = updated.revision; setDesign(updated);
      const next = updated.pages.find((page) => page.id === activePage.id)!;
      const savedDocument = cloneDocument(next.page_data_json);
      documentRef.current = savedDocument; baseDocumentRef.current = cloneDocument(savedDocument);
      setDocument(savedDocument); setSaveStatus("saved");
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not update the page."); }
  }

  function beginPageResize(axis: "width" | "height" | "both", event: ReactPointerEvent<HTMLButtonElement>) {
    if (!document || !activePage || activePage.is_locked || !canManagePages) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = document.canvas.width;
    const startHeight = document.canvas.height;
    let latest = { width: startWidth, height: startHeight };
    const previousCursor = globalThis.document.body.style.cursor;
    const previousSelection = globalThis.document.body.style.userSelect;
    globalThis.document.body.style.cursor = axis === "width" ? "ew-resize" : axis === "height" ? "ns-resize" : "nwse-resize";
    globalThis.document.body.style.userSelect = "none";
    const move = (pointerEvent: PointerEvent) => {
      latest = {
        width: axis === "height" ? startWidth : Math.max(200, Math.min(10000, Math.round(startWidth + (pointerEvent.clientX - startX) / zoom))),
        height: axis === "width" ? startHeight : Math.max(200, Math.min(10000, Math.round(startHeight + (pointerEvent.clientY - startY) / zoom))),
      };
      setPageResizeDraft(latest);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      globalThis.document.body.style.cursor = previousCursor;
      globalThis.document.body.style.userSelect = previousSelection;
      setPageResizeDraft(null);
      if (latest.width !== startWidth || latest.height !== startHeight) {
        void patchPage({ ...latest, orientation: latest.width > latest.height ? "landscape" : latest.height > latest.width ? "portrait" : "square" });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function addAssetToCanvas(asset: StudioAsset) {
    const currentDocument = documentRef.current || document;
    if (!currentDocument) return;
    const gridCell = asset.mime_type.startsWith("image/")
      ? imageGridTarget(currentDocument, selectedIds)
      : null;
    if (gridCell) {
      const fittedElement = mediaImageGridCell(gridCell, asset);
      commit({
        ...currentDocument,
        elements: currentDocument.elements.map((element) => element.id === gridCell.id ? fittedElement : element),
      });
      setSelectedIds([gridCell.id]);
      setNotice("Image fitted inside the grid cell.");
      return;
    }
    const element = newElement(asset.mime_type.startsWith("video/") ? "video" : asset.asset_type.includes("logo") ? "logo" : "image");
    element.assetId = asset.id;
    element.name = asset.alt_text || asset.original_filename;
    element.style = { ...element.style, objectFit: "contain", sourceMimeType: asset.mime_type, sourceFileName: asset.original_filename };
    commit({ ...currentDocument, elements: [...currentDocument.elements, element] });
    setSelectedIds([element.id]);
  }

  function canvasDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); const type = event.dataTransfer.getData("studio-element") as StudioElementType;
    const productPayload = event.dataTransfer.getData("studio-product");
    const productImagePayload = event.dataTransfer.getData("studio-product-image");
    const assetPayload = event.dataTransfer.getData("studio-asset");
    const fieldPayload = event.dataTransfer.getData("studio-field");
    const pricePayload = event.dataTransfer.getData("studio-price");
    const barcodePayload = event.dataTransfer.getData("studio-barcode");
    const erpImagePayload = event.dataTransfer.getData("studio-erp-image");
    const erpTablePayload = event.dataTransfer.getData("studio-erp-table");
    const shapePayload = event.dataTransfer.getData("studio-shape");
    if (!document) return;
    const rect = stage?.container().getBoundingClientRect() || event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(90, (event.clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(90, (event.clientY - rect.top) / rect.height * 100));
    const gridCellAtDrop = document.elements
      .filter((element) => element.type === "image" && element.style.imageGridCell === true)
      .sort((left, right) => right.zIndex - left.zIndex)
      .find((element) => x >= element.xPercent && x <= element.xPercent + element.widthPercent && y >= element.yPercent && y <= element.yPercent + element.heightPercent);
    const droppedFiles = Array.from(event.dataTransfer.files || []);
    const droppedFile = droppedFiles.find(isStudioVideoFile);
    if (droppedFile) { void addDroppedVideo(droppedFile, x, y); return; }
    const droppedImage = droppedFiles.find((file) => file.type.startsWith("image/"));
    if (droppedImage && gridCellAtDrop) {
      void uploadStudioAsset(droppedImage, "user_upload", droppedImage.name.replace(/\.[^.]+$/, "")).then((asset) => {
        updateElement(mediaImageGridCell(gridCellAtDrop, asset));
        setSelectedIds([gridCellAtDrop.id]);
        setAssets((items) => items.some((item) => item.id === asset.id) ? items : [...items, asset]);
        setNotice("Uploaded image fitted inside the grid cell.");
      }).catch((caught) => setError(caught instanceof Error ? caught.message : "The grid image could not be uploaded."));
      return;
    }
    if (droppedFiles.length) { setError("Choose an MP4 or WebM video file to drop onto the page."); return; }
    if (!type && !productPayload && !productImagePayload && !assetPayload && !fieldPayload && !pricePayload && !barcodePayload && !erpImagePayload && !erpTablePayload && !shapePayload) return;
    if (pricePayload) { openPricePicker(x, y); return; }
    if (barcodePayload) { openBarcodePicker(x, y); return; }
    if (erpImagePayload) { openErpImagePicker(x, y); return; }
    if (erpTablePayload) { openErpTablePicker(x, y); return; }
    if (shapePayload) { openShapePicker(x, y); return; }
    if (productImagePayload) {
      try { void addAllProductImages(JSON.parse(productImagePayload) as StudioAvailableProduct, x, y, gridCellAtDrop?.id); }
      catch { setError("This synchronized ERP product image could not be added to the canvas."); }
      return;
    }
    if (productPayload) {
      try {
        const product = JSON.parse(productPayload) as StudioAvailableProduct;
        addProductCard(product, x, y);
      } catch { setError("This product could not be added to the canvas."); }
      return;
    }
    if (assetPayload) {
      try {
        const asset = JSON.parse(assetPayload) as StudioAsset;
        const gridCell = gridCellAtDrop;
        if (gridCell && asset.mime_type.startsWith("image/")) {
          updateElement(mediaImageGridCell(gridCell, asset));
          setSelectedIds([gridCell.id]);
          setNotice("Image fitted inside the grid cell.");
          return;
        }
        const assetElement = newElement(asset.mime_type.startsWith("video/") ? "video" : asset.asset_type.includes("logo") ? "logo" : "image", x, y);
        assetElement.assetId = asset.id; assetElement.name = asset.alt_text || asset.original_filename;
        assetElement.style = { ...assetElement.style, objectFit: "contain", sourceMimeType: asset.mime_type, sourceFileName: asset.original_filename };
        commit({ ...document, elements: [...document.elements, assetElement] }); setSelectedIds([assetElement.id]);
      } catch { setError("This media asset could not be added to the canvas."); }
      return;
    }
    if(fieldPayload){try{const field=JSON.parse(fieldPayload) as {name:string;binding:string};const element=boundField(field.name,field.binding);element.xPercent=x;element.yPercent=y;commit({...document,elements:[...document.elements,element]});setSelectedIds([element.id]);}catch{setError("This product field could not be added.");}return;}
    addElement(type, x, y);
  }

  function patchSelected(changes: Partial<StudioElement>, style?: Record<string, string | number | boolean | null>) {
    if (!selected) return;
    const lockedKeys = governedStyleKeys(selected);
    // Brand marks and explicitly locked elements keep their governed colour.
    // Normal catalogue copy must remain editable, including designs created
    // before the governance rule was narrowed.
    if (!selected.locked && selected.type === "text") lockedKeys.delete("color");
    const requiredKeys = governedRequiredStyleKeys(selected);
    const requestedStyle = style || {};
    const allowedStyle = Object.fromEntries(Object.entries(requestedStyle).filter(([key, value]) => !lockedKeys.has(key) && !(requiredKeys.has(key) && value === false)));
    if (Object.keys(allowedStyle).length !== Object.keys(requestedStyle).length) {
      setNotice("This company template protects its brand styling and required ERP fields.");
    }
    updateElement({ ...selected, ...changes, style: { ...selected.style, ...allowedStyle } });
  }

  function clearSelectedImageKeepFrame() {
    if (!selected || !selectedIsImageFrame || !selectedImageFrameHasMedia) return;
    updateElement({
      ...selected,
      assetId: null,
      productId: null,
      carousel: null,
      style: {
        ...selected.style,
        productImageId: "",
        productImageIds: "",
        productImageUrl: "",
        productImageIndex: 0,
        productImageCount: 0,
        productImageMode: "single",
        imageSource: "",
        sourceMimeType: "",
        sourceFileName: "",
      },
    });
    setCropModeElementId(null);
    setNotice("Image removed. The frame, position, size and styling were kept.");
  }

  function normalizedCarouselImages(images: StudioCarouselImage[]) {
    const seenIds = new Set<string>();
    const seenProductImages = new Set<string>();
    return images.filter((image) => {
      const productImageKey = image.productImageId ? `${image.productId || "legacy"}:${image.productImageId}` : "";
      if (seenIds.has(image.id) || (productImageKey && seenProductImages.has(productImageKey))) return false;
      seenIds.add(image.id);
      if (productImageKey) seenProductImages.add(productImageKey);
      return true;
    }).map((image, index) => ({ ...image, displayOrder: index + 1 }));
  }

  function patchCarousel(changes: Partial<StudioCarouselConfig>) {
    if (!selected || selected.type !== "image_carousel") return;
    const carousel = selected.carousel || defaultCarouselConfig();
    patchSelected({ carousel: { ...carousel, ...changes } });
  }

  function patchCarouselSection<Key extends "transition" | "navigation" | "display" | "pdf">(section: Key, changes: Partial<StudioCarouselConfig[Key]>) {
    if (!selected || selected.type !== "image_carousel") return;
    const carousel = selected.carousel || defaultCarouselConfig();
    patchCarousel({ [section]: { ...carousel[section], ...changes } } as Partial<StudioCarouselConfig>);
  }

  function carouselProductImages(product: StudioAvailableProduct, selectedIds?: string[]) {
    const wanted = selectedIds ? new Set(selectedIds) : null;
    return product.images.filter((image) => !wanted || wanted.has(image.id)).map((image, index): StudioCarouselImage => ({
      id: `product-${product.id}-${image.id}`, productId: product.id, productImageId: image.id, fileName: image.file_name,
      altText: image.alt_text || product.display_name || product.erp_name, sourceType: "product_image",
      displayOrder: index + 1, isActive: true, fit: "contain", positionX: 50, positionY: 50, zoom: 1,
    }));
  }

  function bindCarouselProduct(productId: string) {
    if (!selected || selected.type !== "image_carousel") return;
    const product = products.find((item) => item.id === productId);
    const carousel = selected.carousel || defaultCarouselConfig();
    if (!product || (carousel.productIds || []).includes(productId)) return;
    const legacyProductId = carousel.productIds?.[0] || carousel.productId || selected.productId;
    const existingImages = carousel.images.map((image) => image.sourceType === "product_image" && !image.productId && legacyProductId ? { ...image, productId: legacyProductId } : image);
    const productImages = carouselProductImages(product);
    const images = normalizedCarouselImages([...existingImages, ...productImages]);
    const productIds = [...(carousel.productIds || (legacyProductId ? [legacyProductId] : [])), productId];
    patchSelected({
      productId: productId || null,
      carousel: { ...carousel, productId: productId || null, productIds, sourceType: carousel.images.some((image) => image.sourceType !== "product_image") ? "mixed" : "selected_product_images", selectedImageIds: [...carousel.selectedImageIds, ...productImages.map((image) => image.productImageId!).filter(Boolean)], currentIndex: 0, images },
    });
  }

  function removeCarouselProduct(productId: string) {
    if (!selected || selected.type !== "image_carousel") return;
    const carousel = selected.carousel || defaultCarouselConfig();
    const productIds = (carousel.productIds || []).filter((id) => id !== productId);
    const images = normalizedCarouselImages(carousel.images.filter((image) => image.productId !== productId));
    const selectedImageIds = images.map((image) => image.productImageId).filter((id): id is string => Boolean(id));
    const nextProductId = productIds.at(-1) || null;
    patchSelected({ productId: nextProductId, carousel: { ...carousel, productId: nextProductId, productIds, selectedImageIds, images, currentIndex: 0 } });
  }

  function toggleCarouselProductImage(imageId: string, checked: boolean) {
    if (!selected || selected.type !== "image_carousel" || !selectedProduct) return;
    const carousel = selected.carousel || defaultCarouselConfig();
    const ids = new Set(carousel.selectedImageIds);
    if (checked) ids.add(imageId); else ids.delete(imageId);
    const productImages = carouselProductImages(selectedProduct, Array.from(ids));
    const otherImages = carousel.images.filter((image) => image.sourceType !== "product_image" || image.productId !== selectedProduct.id);
    patchCarousel({ sourceType: otherImages.some((image) => image.sourceType !== "product_image") ? "mixed" : "selected_product_images", selectedImageIds: Array.from(ids), autoIncludeNewImages: false, currentIndex: 0, images: normalizedCarouselImages([...otherImages, ...productImages]) });
  }

  async function uploadCarouselFiles(files: FileList | File[]) {
    if (!selected || selected.type !== "image_carousel" || !canUploadCarouselImages) return;
    const accepted = Array.from(files).filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
    if (!accepted.length) { setError("Choose JPG, PNG, or WebP images."); return; }
    const targetId = selected.id;
    const pending = accepted.map((file) => ({ id: crypto.randomUUID(), name: file.name, status: "uploading" as const, controller: new AbortController() }));
    setCarouselUploads(pending);
    const results = await Promise.all(accepted.map(async (file, index) => {
      const item = pending[index];
      try {
        const asset = await uploadStudioAsset(file, "user_upload", file.name.replace(/\.[^.]+$/, ""), item.controller.signal);
        setCarouselUploads((rows) => rows.map((row) => row.id === item.id ? { ...row, status: "success" } : row));
        return { asset, item };
      } catch (caught) {
        const cancelled = item.controller.signal.aborted;
        setCarouselUploads((rows) => rows.map((row) => row.id === item.id ? { ...row, status: cancelled ? "cancelled" : "failed", error: cancelled ? "Cancelled" : caught instanceof ApiError ? caught.message : "The image could not be uploaded." } : row));
        return null;
      }
    }));
    const uploaded = results.filter((item): item is NonNullable<typeof item> => Boolean(item)).map(({ asset }, index): StudioCarouselImage => ({ id: crypto.randomUUID(), assetId: asset.id, fileName: asset.original_filename, altText: asset.alt_text || asset.original_filename.replace(/\.[^.]+$/, ""), sourceType: "user_upload", displayOrder: index + 1, isActive: true, fit: "contain", positionX: 50, positionY: 50, zoom: 1 }));
    if (!uploaded.length) return;
    const current = documentRef.current?.elements.find((element) => element.id === targetId);
    if (!current?.carousel) return;
    const images = normalizedCarouselImages([...current.carousel.images, ...uploaded]);
    updateElement({ ...current, carousel: { ...current.carousel, sourceType: current.carousel.images.some((image) => image.sourceType === "product_image") ? "mixed" : "uploaded_images", images } });
    void getStudioAssets().then(setAssets).catch(() => undefined);
  }

  function cancelCarouselUpload(id: string) {
    setCarouselUploads((items) => {
      items.find((item) => item.id === id)?.controller.abort();
      return items;
    });
  }

  function addAssetToCarousel(assetId: string) {
    if (!selected || selected.type !== "image_carousel" || !assetId) return;
    const asset = assets.find((item) => item.id === assetId);
    if (!asset || !asset.mime_type.startsWith("image/")) return;
    const carousel = selected.carousel || defaultCarouselConfig();
    const image: StudioCarouselImage = { id: crypto.randomUUID(), assetId: asset.id, fileName: asset.original_filename, altText: asset.alt_text || asset.original_filename.replace(/\.[^.]+$/, ""), sourceType: asset.asset_type === "brand_media" ? "brand_media" : asset.asset_type === "catalogue_media" ? "catalogue_media" : "user_upload", displayOrder: carousel.images.length + 1, isActive: true, fit: "contain", positionX: 50, positionY: 50, zoom: 1 };
    patchCarousel({ sourceType: carousel.images.some((item) => item.sourceType === "product_image") ? "mixed" : "uploaded_images", images: [...carousel.images, image] });
  }

  function updateCarouselImage(imageId: string, changes: Partial<StudioCarouselImage>) {
    if (!selected?.carousel) return;
    patchCarousel({ images: selected.carousel.images.map((image) => image.id === imageId ? { ...image, ...changes } : image) });
  }

  function moveCarouselImage(imageId: string, destination: number) {
    if (!selected?.carousel || !canReorderCarouselImages) return;
    const images = selected.carousel.images.slice().sort((a, b) => a.displayOrder - b.displayOrder);
    const index = images.findIndex((image) => image.id === imageId);
    if (index < 0) return;
    const [image] = images.splice(index, 1);
    images.splice(Math.max(0, Math.min(images.length, destination)), 0, image);
    patchCarousel({ currentIndex: 0, images: normalizedCarouselImages(images) });
  }

  function removeCarouselImage(imageId: string) {
    if (!selected?.carousel) return;
    const images = normalizedCarouselImages(selected.carousel.images.filter((image) => image.id !== imageId));
    patchCarousel({ currentIndex: Math.min(selected.carousel.currentIndex, Math.max(0, images.length - 1)), selectedImageIds: images.map((image) => image.productImageId).filter((id): id is string => Boolean(id)), images });
  }

  async function replaceCarouselImage(imageId: string, file?: File) {
    if (!file || !selected?.carousel || !canUploadCarouselImages) return;
    try {
      const asset = await uploadStudioAsset(file, "user_upload", file.name.replace(/\.[^.]+$/, ""));
      updateCarouselImage(imageId, { assetId: asset.id, productImageId: null, url: null, fileName: asset.original_filename, altText: asset.alt_text || asset.original_filename.replace(/\.[^.]+$/, ""), sourceType: "user_upload" });
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : "The image could not be uploaded."); }
  }

  function selectProductImage(index: number) {
    if (!selectedProduct?.images.length) return;
    const safeIndex = (index + selectedProduct.images.length) % selectedProduct.images.length;
    const image = selectedProduct.images[safeIndex];
    patchSelected({}, { productImageId: image.id, productImageIndex: safeIndex, productImageUrl: image.url });
  }

  function stepProductCardImage(element: StudioElement, direction: -1 | 1) {
    if (element.type === "image_carousel" && element.carousel) {
      const count = element.carousel.images.filter((image) => image.isActive).length;
      if (count < 2) return;
      const current = Math.max(0, Math.min(count - 1, element.carousel.currentIndex));
      const next = element.carousel.transition.loop ? (current + direction + count) % count : Math.max(0, Math.min(count - 1, current + direction));
      updateElement({ ...element, carousel: { ...element.carousel, currentIndex: next } });
      return;
    }
    const ids = String(element.style.productImageIds || "").split(",").filter(Boolean);
    if (ids.length < 2) return;
    const current = Math.max(0, Math.min(ids.length - 1, Number(element.style.productImageIndex || 0)));
    const next = (current + direction + ids.length) % ids.length;
    updateElement({ ...element, style: { ...element.style, productImageIndex: next, productImageId: ids[next], productImageCount: ids.length } });
  }

  async function uploadCardProductImage(file: File | undefined) {
    if (!file || !selected?.productId) return;
    setProductImageUploading(true); setError("");
    try {
      const product = await uploadStudioProductImage(designId, selected.productId, file, selected.name);
      setSelectedProduct(product);
      setProducts((current) => current.map((item) => item.id === product.id ? product : item));
      const index = Math.max(0, product.images.length - 1);
      const image = product.images[index];
      patchSelected({}, { productImageId: image.id, productImageIndex: index, productImageUrl: image.url, productImageIds: product.images.map((item) => item.id).join(","), productImageCount: product.images.length, showProductImage: true });
      setNotice(`Added ${file.name} to ${product.display_name || product.erp_name}.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not upload this product image.");
    } finally { setProductImageUploading(false); }
  }

  async function pullCardProductImagesFromErp() {
    if (!selected?.productId || erpImagePulling) return;
    setErpImagePulling(true); setError("");
    try {
      const currentProduct = selectedProduct ?? await getStudioProduct(designId, selected.productId);
      const candidates = await getErpProductImages(selected.productId);
      const supported = candidates.filter((candidate) => candidate.supported);
      if (!supported.length) {
        setNotice(candidates.length
          ? "ERP images were found, but none are in a supported format or size."
          : "No product image is currently stored in ERP for this product.");
        return;
      }
      const existingSlots = new Set(currentProduct.images.flatMap((image) => {
        const match = image.file_name.match(/-erp-image-([1-6])\.webp$/i);
        return match ? [Number(match[1])] : [];
      }));
      const missing = supported.filter((candidate) => !existingSlots.has(candidate.slot));
      let imported = 0;
      for (const candidate of missing) {
        await importErpProductImage(selected.productId, candidate.slot, {
          alt_text: candidate.description || `${selected.name} product image from ERP`,
          make_primary: currentProduct.images.length + imported === 0,
        });
        imported += 1;
      }
      const product = await getStudioProduct(designId, selected.productId);
      setSelectedProduct(product);
      setProducts((current) => current.map((item) => item.id === product.id ? product : item));
      const imageIds = product.images.map((image) => image.id);
      const currentId = String(selected.style.productImageId || "");
      const currentIndex = imageIds.indexOf(currentId);
      const primaryIndex = product.images.findIndex((image) => image.is_primary);
      const index = currentIndex >= 0 ? currentIndex : Math.max(0, primaryIndex);
      const image = product.images[index];
      patchSelected({}, {
        productImageId: image?.id || "",
        productImageIndex: index,
        productImageUrl: image?.url || product.primary_image_url || "",
        productImageIds: imageIds.join(","),
        productImageCount: imageIds.length,
        showProductImage: true,
      });
      setNotice(imported
        ? `Pulled ${imported} ERP image${imported === 1 ? "" : "s"} into this product card.`
        : "All available ERP images are already present. The product card was refreshed.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not pull product images from ERP.");
    } finally { setErpImagePulling(false); }
  }

  async function deleteSelectedCardProductImage() {
    if (!selected?.productId || !selectedProductImage || productImageDeleting) return;
    if (!window.confirm(`Delete ${selectedProductImage.file_name} from Product Master? This can affect other catalogues using the same product image.`)) return;
    setProductImageDeleting(true); setError("");
    try {
      const previousIndex = Math.max(0, selectedProduct?.images.findIndex((image) => image.id === selectedProductImage.id) ?? 0);
      await deleteProductImage(selected.productId, selectedProductImage.id);
      const product = await getStudioProduct(designId, selected.productId);
      setSelectedProduct(product);
      setProducts((current) => current.map((item) => item.id === product.id ? product : item));
      const imageIds = product.images.map((image) => image.id);
      const index = product.images.length ? Math.min(previousIndex, product.images.length - 1) : 0;
      const image = product.images[index];
      patchSelected({}, {
        productImageId: image?.id || "",
        productImageIndex: index,
        productImageUrl: image?.url || product.primary_image_url || "",
        productImageIds: imageIds.join(","),
        productImageCount: imageIds.length,
        showProductImage: Boolean(image),
      });
      setNotice(`${selectedProductImage.file_name} was deleted from Product Master.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not delete this product image.");
    } finally { setProductImageDeleting(false); }
  }

  async function uploadSelectedElementAsset(file: File | undefined, targetId = selected?.id) {
    if (!file || !targetId) return;
    const target = documentRef.current?.elements.find((element) => element.id === targetId);
    if (!target || !["image", "logo", "video", "background"].includes(target.type)) return;
    if (target.type === "video" && !isStudioVideoFile(file)) {
      setError("Choose an MP4 or WebM video file.");
      return;
    }
    if (target.type === "video" && file.size > STUDIO_VIDEO_MAX_BYTES) {
      setError("The video is larger than the 100 MB Studio upload limit.");
      return;
    }
    setElementAssetUploading(true); setError("");
    try {
      const assetType = target.type === "logo" ? "brand_logo" : isStudioVideoFile(file) ? "product_video" : target.type === "background" ? "background" : "user_upload";
      const asset = await uploadStudioAsset(file, assetType, file.name);
      setAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      const current = documentRef.current?.elements.find((element) => element.id === targetId);
      if (!current) return;
      updateElement({
        ...current,
        assetId: asset.id,
        name: asset.alt_text || asset.original_filename,
        style: { ...current.style, sourceMimeType: asset.mime_type, sourceFileName: asset.original_filename },
      });
      setSelectedIds([targetId]);
      setNotice(`${asset.original_filename} is now assigned to this ${current.type}.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not upload this media file.");
    } finally { setElementAssetUploading(false); }
  }

  async function addDroppedVideo(file: File, x: number, y: number) {
    if (!isStudioVideoFile(file)) { setError("Choose an MP4 or WebM video file."); return; }
    const currentDocument = documentRef.current;
    if (!currentDocument) return;
    const selectedVideo = currentDocument.elements.find((element) => selectedIds.includes(element.id) && element.type === "video");
    if (selectedVideo) {
      await uploadSelectedElementAsset(file, selectedVideo.id);
      return;
    }
    const videoElement = newElement("video", x, y);
    videoElement.name = file.name;
    commit({ ...currentDocument, elements: [...currentDocument.elements, videoElement] });
    setSelectedIds([videoElement.id]);
    await uploadSelectedElementAsset(file, videoElement.id);
  }

  function patchResponsive(mode: "mobile" | "pdf" | "print", hidden: boolean) {
    if (!selected) return;
    const current = selected.responsive[mode];
    const modeSettings = current && typeof current === "object" ? current as Record<string, unknown> : {};
    patchSelected({ responsive: { ...selected.responsive, [mode]: { ...modeSettings, hidden } } });
  }

  function isResponsiveHidden(mode: "mobile" | "pdf" | "print") {
    const current = selected?.responsive[mode];
    return Boolean(current && typeof current === "object" && (current as Record<string, unknown>).hidden);
  }

  function applyRgb565(value: string) {
    setRgb565Input(value);
    try { const hex = rgbToHex(rgb565ToRgb(parseRgb565(value))); patchSelected({}, { backgroundColor: hex }); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Invalid RGB565 color."); }
  }

  function applyRgb(value: string) {
    setRgbInput(value);
    const parts = value.split(",").map((item) => Number(item.trim()));
    if (parts.length !== 3) { setError("RGB must contain red, green and blue values."); return; }
    try { const hex = rgbToHex({ r: parts[0], g: parts[1], b: parts[2] }); patchSelected({}, { backgroundColor: hex }); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Invalid RGB color."); }
  }

  function applyHsl(value: string) {
    setHslInput(value);
    const parts = value.split(",").map((item) => Number(item.trim()));
    if (parts.length !== 3) { setError("HSL must contain hue, saturation and lightness."); return; }
    try { const hex = rgbToHex(hslToRgb({ h: parts[0], s: parts[1], l: parts[2] })); patchSelected({}, { backgroundColor: hex }); setError(""); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Invalid HSL color."); }
  }

  async function saveOnlineCover(file: File) {
    if (!design || !canEdit || publicationAction) throw new Error("Cover editing is unavailable right now.");
    if ((saveTimer.current || savePromise.current || saveStatus !== "saved") && !await saveNow()) throw new Error("Save your page changes before saving the cover. Try Save now.");
    const updated = await saveStudioOnlineCover(design.id, file, latestRevision.current);
    latestRevision.current = updated.revision;
    setDesign(updated);
  }

  async function removeOnlineCover() {
    if (!design || !canEdit || publicationAction) throw new Error("Cover editing is unavailable right now.");
    if ((saveTimer.current || savePromise.current || saveStatus !== "saved") && !await saveNow()) throw new Error("Save your page changes before removing the cover. Try Save now.");
    const updated = await removeStudioOnlineCover(design.id, latestRevision.current);
    latestRevision.current = updated.revision;
    setDesign(updated);
  }

  async function publish() {
    if (!design || (design.status === "published" && !hasOnlineCoverChanges) || publicationAction) return;
    setPublicationAction("publish");
    setError("");
    try {
      const onlyCoverChanges = hasOnlineCoverChanges && saveStatus === "saved" && !saveTimer.current && !savePromise.current;
      if (!onlyCoverChanges && !await saveNow()) return;
      const validation = await validateStudioDesign(design.id);
      if (!validation.valid) {
        setError(`Cannot publish: ${validation.errors.join(" ")}`);
        return;
      }
      const updated = await publishStudioDesign(design.id, latestRevision.current);
      latestRevision.current = updated.revision;
      setDesign(updated);
      setNotice("Published as a new immutable catalogue version.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not publish the design.");
    } finally {
      setPublicationAction(null);
    }
  }

  async function unpublish() {
    if (!design || design.status !== "published" || publicationAction) return;
    const confirmed = window.confirm(
      "Unpublish this catalogue? It will return to draft and all customer catalogue links will be disabled.",
    );
    if (!confirmed) return;
    setPublicationAction("unpublish");
    setError("");
    try {
      const updated = await unpublishStudioDesign(design.id, latestRevision.current);
      latestRevision.current = updated.revision;
      setDesign(updated);
      setNotice("Catalogue unpublished. It is now a draft and its customer links are disabled.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not unpublish the design.");
    } finally {
      setPublicationAction(null);
    }
  }

  async function saveVersion() {
    if (!design || !await saveNow()) return;
    try { await createStudioVersion(design.id, latestRevision.current, "Manual Studio checkpoint"); const updated = await getStudioDesign(design.id); latestRevision.current = updated.revision; setDesign(updated); }
    catch (caught) { setError(caught instanceof ApiError ? caught.message : "Could not save a version."); }
  }

  function downloadPng() {
    if (!stage || !design) return; const link = window.document.createElement("a"); link.download = `${design.name}-${activePage?.display_order || 1}.png`; link.href = stage.toDataURL({ pixelRatio: 2 }); link.click(); void createStudioExport(design.id, "png", { page_id: activePageId, resolution: "2x" }); setDownloadOpen(false);
  }

  async function queueExport(exportType: "print_pdf" | "web_pdf" | "jpeg") {
    if (!design || !await saveNow()) return;
    try {
      const version = await createStudioVersion(design.id, latestRevision.current, "Automatic export snapshot");
      const job = await createStudioExport(design.id, exportType, {
        page_id: exportType === "jpeg" ? activePageId : undefined,
        include_cover: true,
        include_category_pages: true,
        quality: exportType === "web_pdf" ? 78 : 92,
      }, version.id);
      setNotice(`${job.export_type.replaceAll("_", " ")} export queued. Open Export History to download it when complete.`);
      setDownloadOpen(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the export job.");
    }
  }

  async function saveAsTemplate(complete:boolean) {
    if (!design || !activePage) return;
    const templateName=prompt(complete?"Complete catalogue template name":"Page template name",`${design.name} ${complete?"template":activePage.page_name}`)?.trim();
    if(!templateName)return;
    const pages=(complete?design.pages:[activePage]).map(page=>({pageName:page.page_name,pageType:page.page_type,width:page.width,height:page.height,orientation:page.orientation,isVisible:page.is_visible,isLocked:page.is_locked,pageData:page.id===activePage.id?document:page.page_data_json}));
    try{await createStudioTemplate({template_type:complete?"catalogue":activePage.page_type==="cover"?"cover":activePage.page_type==="promotion"?"promotion":activePage.page_type==="category"?"category":activePage.page_type==="final"?"final":activePage.page_type==="blank"?"blank_layout":"product_page",name:templateName,description:`Created from ${design.name}`,template_data:{pages,priceSlots:design.price_slots.map(slot=>({slotNumber:slot.slot_number,displayLabel:slot.display_label,currencyDisplay:slot.currency_display}))},visibility_scope:"private",tags:[]});setNotice(`${templateName} was saved to My Templates.`);}catch(caught){setError(caught instanceof ApiError?caught.message:"Could not save the template.");}
  }

  async function toggleProductVisibility(product:StudioAvailableProduct) {
    if (!design || !product.already_used) return;
    try {
      const updated=await updateStudioProductVisibility(design.id,product.id,{expected_revision:latestRevision.current,is_visible:!product.catalogue_visible});
      latestRevision.current=updated.revision;setDesign(updated);
      setProducts(current=>current.map(item=>item.id===product.id?{...item,catalogue_visible:!item.catalogue_visible}:item));
      setNotice(`${product.display_name || product.erp_name} is now ${product.catalogue_visible?"hidden from":"visible in"} this catalogue.`);
    } catch(caught){setError(caught instanceof ApiError?caught.message:"Could not change catalogue visibility.");}
  }

  async function reloadProductsFromMaster(runErpSync: boolean) {
    if (erpSyncing || !design || !document) return;
    setErpSyncing(true); setError("");
    try {
      let syncMessage = "Product Master reloaded.";
      if (runErpSync) {
        const run = await runProductSync();
        if (run.status === "failed") throw new Error(run.error_summary || run.message || "ERP product synchronization failed.");
        if (run.status === "running") {
          setNotice("ERP synchronization is already running. Reload Product Master again when it finishes.");
          return;
        }
        const details = run.details || {};
        syncMessage = `ERP synchronized: ${run.rows_created} new, ${run.rows_updated} updated, ${Number(details.images_imported || 0)} images added and ${Number(details.images_updated || 0)} images refreshed.`;
      }
      const library = await getStudioAvailableProducts(design.id, productSearch);
      setProducts(library);
      const boundIds = [...new Set(document.elements.map((element) => element.productId).filter((value): value is string => Boolean(value)))];
      const [boundProducts, boundPriceOptions] = await Promise.all([
        Promise.all(boundIds.map((productId) => getStudioProduct(design.id, productId).catch(() => null))),
        Promise.all(boundIds.map((productId) => getStudioProductPriceOptions(design.id, productId).catch(() => null))),
      ]);
      const byId = new Map(boundProducts.filter((product): product is StudioAvailableProduct => Boolean(product)).map((product) => [product.id, product]));
      const pricesByProductId = new Map(boundPriceOptions.filter((options): options is StudioProductPriceOptions => Boolean(options)).map((options) => [options.product.id, options.options]));
      const priceOptionsByProductId = new Map(boundPriceOptions.filter((options): options is StudioProductPriceOptions => Boolean(options)).map((options) => [options.product.id, options]));
      const nextElements = document.elements.map((element) => {
        if (!element.productId) return element;
        const product = byId.get(element.productId);
        if (!product) return element;
        const imageIds = product.images.map((image) => image.id);
        const selectedImageId = String(element.style.productImageId || "");
        const selectedIndex = imageIds.indexOf(selectedImageId);
        const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
        const nextImage = product.images[nextIndex];
        const style: Record<string, string | number | boolean | null> = {
          ...element.style,
          productImageIds: imageIds.join(","), productImageCount: imageIds.length,
          productImageIndex: nextIndex, productImageId: nextImage?.id || "",
          productImageUrl: nextImage?.url || product.primary_image_url || "",
        };
        if (element.type === "product_card") {
          if (style.useErpName === true) style.productName = product.display_name || product.erp_name;
          if (style.useErpPrice === true) {
            const availablePrices = pricesByProductId.get(product.id) || [];
            const hasPrimaryCustomerLevel = Boolean(
              style.primaryPriceCustomerLevelId || style.primaryPriceCustomerLevelCode || style.primaryPriceCustomerLevel,
            );
            const hasSecondaryCustomerLevel = Boolean(
              style.secondaryPriceCustomerLevelId || style.secondaryPriceCustomerLevelCode || style.secondaryPriceCustomerLevel,
            );
            const primary = availablePrices.find((option) =>
              option.customer_level_id === Number(style.primaryPriceCustomerLevelId || 0) ||
              option.customer_level_code === String(style.primaryPriceCustomerLevelCode || "") ||
              option.customer_level_name === String(style.primaryPriceCustomerLevel || "") ||
              option.price_list_id === Number(style.primaryPriceListId || 0),
            );
            const secondary = availablePrices.find((option) =>
              option.customer_level_id === Number(style.secondaryPriceCustomerLevelId || 0) ||
              option.customer_level_code === String(style.secondaryPriceCustomerLevelCode || "") ||
              option.customer_level_name === String(style.secondaryPriceCustomerLevel || "") ||
              option.price_list_id === Number(style.secondaryPriceListId || 0),
            );
            if (primary) {
              style.primaryPriceListId = primary.price_list_id;
              style.primaryPriceListCode = primary.price_list_code;
            }
            if (secondary) {
              style.secondaryPriceListId = secondary.price_list_id;
              style.secondaryPriceListCode = secondary.price_list_code;
            }
            style.productPrice = primary?.amount !== null && primary?.amount !== undefined
              ? `${primary.currency || "THB"} ${Number(primary.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : !hasPrimaryCustomerLevel && product.price ? `${product.price_currency} ${product.price}` : "";
            style.showProductPrice = Boolean(style.productPrice) && style.priceMode !== "no_price";
            if (secondary || hasSecondaryCustomerLevel) style.productSecondaryPrice = secondary?.amount !== null && secondary?.amount !== undefined
              ? `${secondary.currency || "THB"} ${Number(secondary.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "";
            if (!style.productSecondaryPrice) style.showSecondaryPrice = false;
          }
          if (style.useErpBrand === true) style.productBrand = product.brand || "";
          if (style.useErpSku === true) style.productSku = product.sku;
          if (style.useErpCategory !== false) { style.useErpCategory = true; style.productCategory = product.category || product.category_names[0] || ""; }
          if (style.useErpDescription !== false) { style.useErpDescription = true; style.productDescription = product.description_en || product.description_th || ""; }
          if (style.useErpBarcode !== false) {
            style.useErpBarcode = true;
            style.productBarcode = productBarcodes(product).join("\n");
          }
          if (style.useErpStock !== false) { style.useErpStock = true; style.productStock = product.stock_quantity ?? ""; }
          style.productUnit = product.unit || "";
          style.productPackSize = product.pack_size ?? "";
          style.productWarranty = product.warranty || "";
          style.productRemark = product.remark || product.how_to_use || "";
        }
        if (element.type !== "product_card" && style.priceSource === "erp") {
          const availablePrices = pricesByProductId.get(product.id) || [];
          const hasCustomerLevel = Boolean(
            style.priceCustomerLevelId || style.priceCustomerLevelCode || style.priceCustomerLevel,
          );
          const mappedPrice = availablePrices.find((option) =>
            option.customer_level_id === Number(style.priceCustomerLevelId || 0) ||
            option.customer_level_code === String(style.priceCustomerLevelCode || "") ||
            option.customer_level_name === String(style.priceCustomerLevel || "") ||
            option.price_list_id === Number(style.priceListId || 0),
          );
          const amount = mappedPrice?.amount ?? (!hasCustomerLevel ? product.price : null);
          const currency = mappedPrice?.currency || product.price_currency || "THB";
          if (mappedPrice) {
            style.priceListId = mappedPrice.price_list_id;
            style.priceListCode = mappedPrice.price_list_code;
            element = { ...element, binding: `{{product.price_list_${mappedPrice.price_list_id}}}` };
          }
          element = {
            ...element,
            text: amount !== null && amount !== undefined
              ? `${currency} ${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : "",
          };
        }
        if (element.type === "barcode") {
          style.barcodeSource = "erp";
          style.barcodeValue = product.barcode || "";
          style.productName = product.display_name || product.erp_name;
          style.productSku = product.sku;
          return { ...element, text: product.barcode || "", target: product.barcode || "", binding: "{{product.barcode}}", style };
        }
        if (element.type === "table" && style.tableSource === "erp") {
          const preset = String(style.tablePreset || "details") as ErpTablePreset;
          if (ERP_TABLE_PRESETS.some((option) => option.id === preset)) {
            const text = buildErpTableText(preset, product, priceOptionsByProductId.get(product.id) || null);
            return {
              ...element,
              text,
              heightPercent: Math.max(14, Math.min(62, text.split("\n").length * 4.5)),
              style: {
                ...style,
                productName: product.display_name || product.erp_name,
                productSku: product.sku,
                erpLastSynchronizedAt: product.last_synchronized_at || "",
              },
            };
          }
        }
        return { ...element, style };
      });
      if (JSON.stringify(nextElements) !== JSON.stringify(document.elements)) commit({ ...document, elements: nextElements });
      if (selected?.productId) {
        const refreshed = byId.get(selected.productId) || await getStudioProduct(design.id, selected.productId).catch(() => null);
        setSelectedProduct(refreshed);
      }
      setNotice(`${syncMessage} Studio products and placed cards are current.`);
    } catch (caught) {
      setError(caught instanceof ApiError || caught instanceof Error ? caught.message : "Could not synchronize ERP products.");
    } finally { setErpSyncing(false); }
  }

  async function refreshStudioPrices(runErpSync: boolean) {
    if (erpSyncing) return;
    setErpSyncing(true);
    setPriceTabLoading(true);
    setPriceTabError("");
    setError("");
    try {
      let syncMessage = "ERP prices refreshed from Product Master.";
      if (runErpSync) {
        const run = await runProductSync();
        if (run.status === "failed") throw new Error(run.error_summary || run.message || "ERP price synchronization failed.");
        if (run.status === "running") {
          setNotice("ERP synchronization is already running. Use Refresh ERP prices again when it finishes.");
          return;
        }
        const updatedPrices = Number(run.details?.erp_price_matrix_values_updated || 0);
        syncMessage = `ERP synchronization completed${updatedPrices ? `: ${updatedPrices.toLocaleString("en-US")} price values refreshed` : ""}.`;
      }
      const [levels, product, options] = await Promise.all([
        getErpCustomerPriceLevels(),
        priceTabProductId ? getStudioProduct(designId, priceTabProductId) : Promise.resolve(null),
        priceTabProductId ? getStudioProductPriceOptions(designId, priceTabProductId) : Promise.resolve(null),
      ]);
      setErpPriceLevels(levels.filter((level) => level.is_active));
      setPriceTabProduct(product);
      setPriceTabOptions(options);
      setNotice(syncMessage);
    } catch (caught) {
      const message = caught instanceof ApiError || caught instanceof Error ? caught.message : "Could not synchronize ERP prices.";
      setPriceTabError(message);
      setError(message);
    } finally {
      setPriceTabLoading(false);
      setErpSyncing(false);
    }
  }

  async function applyPricingAudienceToCatalogue() {
    if (!design || !selectedPricingAudience || pricingApplying) return;
    setPricingApplying(true);
    setError("");
    try {
      if (!await saveNow()) return;
      let latest = await getStudioDesign(design.id);
      latestRevision.current = latest.revision;
      const overview = await getStudioPricingOverview(design.id);
      const prices = new Map(
        overview.products.map((product) => [
          product.id,
          product.options.find((option) => option.customer_level_id === selectedPricingAudience.id) ?? null,
        ]),
      );
      const blocking = Array.from(prices.values()).filter((option) => !option || ["missing_price", "mapping_required", "unavailable"].includes(option.status));
      if (blocking.length) {
        setPricingOverview(overview);
        setError(`${blocking.length} product${blocking.length === 1 ? "" : "s"} cannot use ${selectedPricingAudience.name} pricing yet. Fix the mapping or missing ERP price first.`);
        return;
      }

      let updatedElements = 0;
      for (const page of [...latest.pages].sort((left, right) => left.display_order - right.display_order)) {
        const pageDocument = normalizeStudioLayerValues(cloneDocument(page.page_data_json));
        const nextElements = pageDocument.elements.map((element) => {
          if (!element.productId) return element;
          const option = prices.get(element.productId);
          if (!option) return element;
          const priceText = option.status === "ready" ? formatMappedPrice(option) : "";
          if (element.type === "product_card") {
            updatedElements += 1;
            return {
              ...element,
              style: {
                ...element.style,
                useErpPrice: true,
                productPrice: priceText,
                showProductPrice: option.status === "ready" && element.style.priceMode !== "no_price",
                primaryPriceListId: option.price_list_id,
                primaryPriceListCode: option.price_list_code || "",
                primaryPriceCustomerLevelId: option.customer_level_id,
                primaryPriceCustomerLevelCode: option.customer_level_code,
                primaryPriceCustomerLevel: option.customer_level_name,
                pricingMappingSource: option.mapping_source,
                pricingErpSourceCode: option.erp_source_code || "",
              },
            };
          }
          if (element.style.priceSource === "erp") {
            updatedElements += 1;
            return {
              ...element,
              text: priceText,
              binding: option.price_list_id ? `{{product.price_list_${option.price_list_id}}}` : null,
              style: {
                ...element.style,
                priceListId: option.price_list_id,
                priceListCode: option.price_list_code || "",
                priceCustomerLevelId: option.customer_level_id,
                priceCustomerLevelCode: option.customer_level_code,
                priceCustomerLevel: option.customer_level_name,
                pricingMappingSource: option.mapping_source,
                pricingErpSourceCode: option.erp_source_code || "",
              },
            };
          }
          return element;
        });
        if (JSON.stringify(nextElements) === JSON.stringify(pageDocument.elements)) continue;
        latest = await updateStudioPage(latest.id, page.id, {
          page_data: { ...pageDocument, elements: nextElements },
          background_color: pageDocument.canvas.backgroundColor,
          expected_revision: latestRevision.current,
        });
        latestRevision.current = latest.revision;
      }

      setDesign(latest);
      const savedPage = latest.pages.find((page) => page.id === activePageIdRef.current);
      if (savedPage) {
        const savedDocument = normalizeStudioLayerValues(cloneDocument(savedPage.page_data_json));
        documentRef.current = savedDocument;
        baseDocumentRef.current = cloneDocument(savedDocument);
        setDocument(savedDocument);
        setSaveStatus("saved");
      }
      setPricingOverview(overview);
      setNotice(`${selectedPricingAudience.name} pricing applied to ${updatedElements} price element${updatedElements === 1 ? "" : "s"}. Each product used its own brand mapping.`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not apply mapped pricing to this catalogue.");
    } finally {
      setPricingApplying(false);
    }
  }

  async function promotionAction(action:"submit"|"approve"|"schedule"|"pause"|"cancel") {
    if(!design)return;
    try{const updated=await transitionStudioPromotion(design.id,action,latestRevision.current);latestRevision.current=updated.revision;setDesign(updated);setNotice(`Promotion status changed to ${updated.promotion_status?.replaceAll("_"," ")}.`);}catch(caught){setError(caught instanceof ApiError?caught.message:"Could not update the promotion workflow.");}
  }

  if (error && !design) return <main className={styles.studioLoading}><h1>Catalogue Studio</h1><p>{error}</p><Link href="/dashboard">Back to dashboard</Link></main>;
  if (!design || !document) return <main className={styles.studioLoading}>Preparing Catalogue Design Studio…</main>;

  return (
    <main className={styles.editor} data-cover-mode={leftTab === "cover"}>
      {elementContextMenu && <div
        className={styles.elementContextMenu}
        role="menu"
        aria-label="Element actions"
        style={{ left: elementContextMenu.x, top: elementContextMenu.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        <button type="button" role="menuitem" onClick={() => { copySelected(); setElementContextMenu(null); }}><span>Copy</span><kbd>Ctrl+C</kbd></button>
        <button type="button" role="menuitem" disabled={!clipboard.current.length} onClick={() => { pasteClipboard(); setElementContextMenu(null); }}><span>Paste</span><kbd>Ctrl+V</kbd></button>
        <button type="button" role="menuitem" onClick={() => { duplicateSelected(); setElementContextMenu(null); }}><span>Duplicate</span><kbd>Ctrl+D</kbd></button>
        {selectedIsImageFrame && <button type="button" role="menuitem" disabled={!selectedImageFrameHasMedia || selected?.locked} onClick={() => { if (!selected) return; const enteringCropMode = cropModeElementId !== selected.id; setSelectionMode(false); if (enteringCropMode && selected.style.objectFit !== "cover") updateElement({ ...selected, style: { ...selected.style, objectFit: "cover" } }); setCropModeElementId(enteringCropMode ? selected.id : null); setNotice(enteringCropMode ? "Crop mode is active. Drag the image with your mouse to choose the visible area." : "Image crop finished."); setElementContextMenu(null); }}><span>{cropModeElementId === selected?.id ? "Finish cropping" : "Crop image"}</span><kbd>{selected?.locked ? "Locked" : selectedImageFrameHasMedia ? "Drag image" : "No image"}</kbd></button>}
        {selectedIsImageFrame && <button type="button" role="menuitem" className={styles.elementContextClearImage} disabled={!selectedImageFrameHasMedia} onClick={() => { clearSelectedImageKeepFrame(); setElementContextMenu(null); }}><span>Remove image</span><kbd>Keep frame</kbd></button>}
        <hr />
        <button type="button" role="menuitem" onClick={() => { setLeftTab("layers"); setElementContextMenu(null); }}><span>Layers</span><kbd>›</kbd></button>
        <button type="button" role="menuitem" className={styles.elementContextDelete} onClick={() => { deleteSelected(); setElementContextMenu(null); }}><span>Delete</span><kbd>Del</kbd></button>
      </div>}
      <header className={styles.editorToolbar}>
        <div className={styles.toolbarDocumentGroup}>
          <Link className={styles.toolbarBackButton} href="/catalogue-studio" aria-label="Back to designs" title="Back to My Designs">←</Link>
          <div className={styles.designIdentity}>
            <strong title={design.name}>{design.name}</strong>
            <span data-status={saveStatus}>{saveStatus === "saving" ? "Autosaving…" : saveStatus === "failed" ? "Autosave failed" : saveStatus === "unsaved" ? "Changes pending" : "Saved automatically"}</span>
          </div>
        </div>
        <div className={`${styles.toolbarGroup} ${styles.toolbarHistoryGroup}`} role="group" aria-label="Edit history">
          <button className={styles.toolbarIconButton} type="button" onClick={undo} disabled={!history.length} aria-label="Undo" title="Undo">↶</button>
          <button className={styles.toolbarIconButton} type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo">↷</button>
        </div>
        <div className={`${styles.toolbarGroup} ${styles.toolbarZoomGroup}`} role="group" aria-label="Canvas zoom">
          <button className={styles.toolbarIconButton} type="button" onClick={() => setZoom((value) => Math.max(.25, value - .1))} aria-label="Zoom out" title="Zoom out">−</button>
          <output aria-label="Current zoom">{Math.round(zoom * 100)}%</output>
          <button className={styles.toolbarIconButton} type="button" onClick={() => setZoom((value) => Math.min(1.5, value + .1))} aria-label="Zoom in" title="Zoom in">+</button>
          <button className={styles.fitButton} type="button" onClick={() => setZoom(.68)} title="Fit page to workspace">Fit</button>
        </div>
        <div className={styles.toolbarActions}>
          {canManageElements && <button type="button" className={styles.saveButton} data-save-status={saveStatus} onClick={() => void saveNow()}><span aria-hidden="true">{saveStatus === "saving" ? "…" : saveStatus === "failed" ? "!" : "✓"}</span>Save now</button>}
          <button type="button" className={styles.previewButton} onClick={() => void openPreview()}><span aria-hidden="true">▷</span>Preview</button>
          {design.catalogue_type==="promotion"&&design.promotion_status==="draft"&&currentUser&&canAccess(currentUser,"promotion_catalogues.edit")&&<button onClick={()=>void promotionAction("submit")}>Submit review</button>}
          {design.catalogue_type==="promotion"&&design.promotion_status==="pending_review"&&currentUser&&canAccess(currentUser,"promotion_catalogues.approve")&&<button onClick={()=>void promotionAction("approve")}>Approve</button>}
          {design.catalogue_type==="promotion"&&design.promotion_status==="approved"&&currentUser&&canAccess(currentUser,"promotion_catalogues.schedule")&&<button onClick={()=>void promotionAction("schedule")}>Schedule</button>}
          {design.catalogue_type==="promotion"&&["scheduled","active"].includes(design.promotion_status||"")&&currentUser&&canAccess(currentUser,"promotion_catalogues.pause")&&<button onClick={()=>void promotionAction("pause")}>Pause</button>}
          {canPublish && <div className={styles.publicationActions} role="group" aria-label="Catalogue publication controls">
            {design.status === "published" && hasOnlineCoverChanges && <button type="button" className={styles.publishButton} disabled={publicationAction !== null} onClick={() => void publish()}>{publicationAction === "publish" ? "Publishing…" : "Publish cover changes"}</button>}
            {design.status !== "published" ? <button
              className={styles.publishButton}
              onClick={() => void publish()}
              disabled={publicationAction !== null}
              title="Publish this catalogue"
            ><span aria-hidden="true">↑</span>{publicationAction === "publish" ? "Publishing…" : "Publish"}</button> : <button
              className={styles.unpublishButton}
              onClick={() => void unpublish()}
              disabled={publicationAction !== null}
              title="Unpublish this catalogue"
            ><span aria-hidden="true">↶</span>{publicationAction === "unpublish" ? "Unpublishing…" : "Unpublish"}</button>
            }
          </div>}
          {(canExportPdf || canExportImages || canExportTemplates) && <div className={styles.downloadControl}><button className={styles.downloadButton} type="button" aria-label="Download" aria-expanded={downloadOpen} onClick={() => setDownloadOpen((open) => !open)}><span aria-hidden="true">↓</span>Download<span className={styles.menuChevron} aria-hidden="true">⌄</span></button>{downloadOpen && <div className={styles.downloadMenu}>{canExportImages && <><button onClick={downloadPng}>Current page · PNG · 2×</button><button onClick={() => void queueExport("jpeg")}>Current page · JPEG · High quality</button></>}{canExportPdf && <><button onClick={() => void queueExport("print_pdf")}>Complete catalogue · Print PDF</button><button onClick={() => void queueExport("web_pdf")}>Complete catalogue · Web PDF</button></>}{canExportTemplates && <button onClick={() => { void createStudioExport(design.id, "template", { include_cover: true }); setDownloadOpen(false); }}>Catalogue template file</button>}<Link href="/catalogue-studio/exports">Open Export History</Link></div>}</div>}
          <details className={styles.editorMoreActions}>
            <summary>More</summary>
            <div>
              <button type="button" onClick={() => void window.document.documentElement.requestFullscreen?.()}>Full screen</button>
              {canEdit && <button type="button" onClick={() => void saveVersion()}>Save version</button>}
              {canCreateTemplates && <button type="button" onClick={() => void saveAsTemplate(false)}>Save page template</button>}
              {canCreateTemplates && <button type="button" onClick={() => void saveAsTemplate(true)}>Save catalogue template</button>}
            </div>
          </details>
        </div>
      </header>
      {canViewMappedPrices && <section className={styles.studioPricingBar} aria-label="Catalogue pricing">
        <div className={styles.studioPricingIdentity}>
          <span>MAPPED PRICING</span>
          <strong>One customer link, each product&apos;s brand price</strong>
        </div>
        <label className={styles.studioPricingAudience}>
          <span>Customer link</span>
          <select
            aria-label="Customer link price mapping"
            value={selectedPricingAudience ? String(selectedPricingAudience.id) : ""}
            disabled={pricingOverviewLoading || !pricingOverview?.audiences.length}
            onChange={(event) => setPricingAudienceId(event.target.value)}
          >
            {!pricingOverview?.audiences.length && <option value="">No customer links</option>}
            {pricingOverview?.audiences.map((audience) => <option key={audience.id} value={audience.id}>{audience.name}</option>)}
          </select>
        </label>
        <div className={styles.studioPricingStatus} data-state={pricingOverviewError || pricingBlockingCount ? "warning" : "ready"}>
          <strong>{pricingOverviewLoading
            ? "Checking catalogue prices…"
            : pricingOverviewError
              ? "Pricing check unavailable"
              : selectedPricingRows.length === 0
                ? "Add products to begin"
                : pricingBlockingCount
                  ? `${pricingBlockingCount} product${pricingBlockingCount === 1 ? "" : "s"} need pricing`
                  : `${pricingBrandCount} brand${pricingBrandCount === 1 ? "" : "s"} ready`}</strong>
          <small>{pricingOverviewError || (selectedPricingRows.length
            ? `${pricingCustomBrandCount} brand${pricingCustomBrandCount === 1 ? "" : "s"} use custom mappings; the rest use the all-brand default.`
            : "Prices are resolved automatically after products are added.")}</small>
        </div>
        <div className={styles.studioPricingActions}>
          <button type="button" onClick={() => void loadStudioPricing()} disabled={pricingOverviewLoading || pricingApplying}>Refresh</button>
          {(pricingOverviewError || pricingBlockingCount > 0) && <Link href="/dashboard?view=pricing" target="_blank">Fix mappings</Link>}
          <button
            type="button"
            className={styles.studioPricingApply}
            disabled={pricingOverviewLoading || pricingApplying || !selectedPricingAudience || selectedPricingRows.length === 0 || pricingBlockingCount > 0}
            onClick={() => void applyPricingAudienceToCatalogue()}
          >{pricingApplying ? "Applying…" : "Apply to catalogue"}</button>
        </div>
      </section>}
      {notice && <div className={styles.studioNotice}>{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
      {error && <div className={styles.studioError} role="alert">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      {imagePreviewElement && <div className={styles.productImageLightboxBackdrop} onMouseDown={closeProductImagePreview}>
        <section className={styles.productImageLightbox} role="dialog" aria-modal="true" aria-labelledby="studio-product-image-preview-title" onMouseDown={(event) => event.stopPropagation()}>
          <header><div><span>PRODUCT IMAGE</span><h2 id="studio-product-image-preview-title">{imagePreviewProduct?.display_name || imagePreviewProduct?.erp_name || imagePreviewElement.name || "Image preview"}</h2>{imagePreviewProduct && <small>{imagePreviewProduct.sku}{imagePreviewProduct.brand ? ` · ${imagePreviewProduct.brand}` : ""}</small>}</div><div className={styles.productImageLightboxHeaderActions}>{imagePreviewImage && <button type="button" className={styles.productImageLightboxDownload} aria-label="Download this image" onClick={() => void downloadPreviewImage()} disabled={imagePreviewDownloading}>{imagePreviewDownloading ? "Downloading…" : "↓ Download image"}</button>}<button type="button" className={styles.productImageLightboxClose} aria-label="Close image preview" onClick={closeProductImagePreview}>×</button></div></header>
          {imagePreviewLoading && <div className={styles.productImageLightboxLoading}>Loading full-size ERP image…</div>}
          {imagePreviewError && <div className={styles.productImageLightboxError} role="alert">{imagePreviewError}</div>}
          {!imagePreviewLoading && imagePreviewImage && <>
            <div className={styles.productImageLightboxStage}>
              <button type="button" aria-label="Previous full-size product image" disabled={imagePreviewImages.length < 2} onClick={() => setImagePreviewIndex((index) => (index - 1 + Math.max(1, imagePreviewImages.length)) % Math.max(1, imagePreviewImages.length))}>{"<"}</button>
              <Image unoptimized width={1400} height={1000} src={imagePreviewImage.url.startsWith("http") ? imagePreviewImage.url : `${API_ORIGIN}${imagePreviewImage.url}`} alt={imagePreviewImage.alt_text || imagePreviewImage.file_name} priority />
              <button type="button" aria-label="Next full-size product image" disabled={imagePreviewImages.length < 2} onClick={() => setImagePreviewIndex((index) => (index + 1) % Math.max(1, imagePreviewImages.length))}>{">"}</button>
            </div>
            <div className={styles.productImageLightboxMeta}><div><strong>{imagePreviewImage.file_name}</strong><span>Image {imagePreviewIndex + 1} of {imagePreviewImages.length || 1}</span></div></div>
            {imagePreviewImages.length > 1 && <div className={styles.productImageLightboxThumbs}>{imagePreviewImages.map((image, index) => <button type="button" key={image.id} data-active={index === imagePreviewIndex} aria-label={`View full-size image ${index + 1}: ${image.file_name}`} onClick={() => setImagePreviewIndex(index)}><Image unoptimized width={90} height={70} src={image.url.startsWith("http") ? image.url : `${API_ORIGIN}${image.url}`} alt={image.alt_text || image.file_name} /><span>{index + 1}</span></button>)}</div>}
          </>}
        </section>
      </div>}
      {pendingTextElement && <div className={styles.pricePickerBackdrop} onMouseDown={() => setPendingTextElement(null)}>
        <section className={`${styles.pricePickerDialog} ${styles.textPickerDialog}`} role="dialog" aria-modal="true" aria-labelledby="studio-text-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.pricePickerHeader}><div><span>TEXT ELEMENT</span><h2 id="studio-text-picker-title">Choose a text style</h2></div><button type="button" aria-label="Close text style picker" onClick={() => setPendingTextElement(null)}>×</button></div>
          <p>Select whether the new text starts with a visible background. You can still change its text, colours, border and alignment in Properties.</p>
          <div className={styles.textPickerOptions}>
            <button type="button" aria-label="Text with background" onClick={() => addTextElement(true)}>
              <span className={`${styles.textPickerPreview} ${styles.textPickerPreviewBackground}`}>Your text</span>
              <strong>TEXT WITH BACKGROUND</strong>
              <small>Adds an editable white text box with a subtle border.</small>
            </button>
            <button type="button" aria-label="Text without background" onClick={() => addTextElement(false)}>
              <span className={`${styles.textPickerPreview} ${styles.textPickerPreviewPlain}`}>Your text</span>
              <strong>TEXT WITHOUT BACKGROUND</strong>
              <small>Adds plain editable text directly over the page.</small>
            </button>
          </div>
          <button type="button" className={styles.pricePickerCancel} onClick={() => setPendingTextElement(null)}>Cancel</button>
        </section>
      </div>}
      {imageGridPickerOpen && <div className={styles.pricePickerBackdrop} onMouseDown={() => setImageGridPickerOpen(false)}>
        <section className={`${styles.pricePickerDialog} ${styles.imageGridPickerDialog}`} role="dialog" aria-modal="true" aria-labelledby="studio-image-grid-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.pricePickerHeader}><div><span>IMAGE GRIDS</span><h2 id="studio-image-grid-picker-title">Choose an image layout</h2></div><button type="button" aria-label="Close image grids" onClick={() => setImageGridPickerOpen(false)}>×</button></div>
          <p>Add grouped image frames to this page. Open Uploads, then drag an image directly onto any frame.</p>
          <div className={styles.imageGridPresetOptions}>
            {IMAGE_GRID_PRESETS.map((preset) => <button type="button" key={preset.id} onClick={() => addImageGrid(preset.id)} aria-label={`Add ${preset.name} image grid`}>
              <span className={styles.imageGridPresetPreview} aria-hidden="true">{preset.cells.map(([x, y, width, height], index) => <i key={index} style={{ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }} />)}</span>
              <strong>{preset.name}</strong>
            </button>)}
          </div>
          <div className={styles.customImageGridControls}>
            <div><strong>Custom grid</strong><small>Create evenly sized image cells.</small></div>
            <label>Rows<input aria-label="Custom grid rows" type="number" min="1" max="8" value={customGridRows} onChange={(event) => setCustomGridRows(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></label>
            <label>Columns<input aria-label="Custom grid columns" type="number" min="1" max="8" value={customGridColumns} onChange={(event) => setCustomGridColumns(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} /></label>
            <button type="button" onClick={addCustomImageGrid}>Add {customGridRows} × {customGridColumns} grid</button>
          </div>
          <button type="button" className={styles.pricePickerCancel} onClick={() => setImageGridPickerOpen(false)}>Cancel</button>
        </section>
      </div>}
      {pendingShapeElement && <div className={styles.pricePickerBackdrop} onMouseDown={() => setPendingShapeElement(null)}>
        <section className={`${styles.pricePickerDialog} ${styles.shapePickerDialog}`} role="dialog" aria-modal="true" aria-labelledby="studio-shape-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.pricePickerHeader}><div><span>SHAPE LIBRARY</span><h2 id="studio-shape-picker-title">Choose a shape</h2></div><button type="button" aria-label="Close shape picker" onClick={() => setPendingShapeElement(null)}>×</button></div>
          <p>Add a ready-made shape, then resize, rotate, recolour, add borders or apply a shadow from Properties.</p>
          <div className={styles.shapePickerOptions}>
            {([
              ["rectangle", "Rectangle", "A simple four-corner shape."],
              ["rounded", "Rounded rectangle", "A softer panel or content block."],
              ["square", "Square", "A balanced square for labels and artwork."],
              ["circle", "Circle", "A circular badge or decorative shape."],
              ["oval", "Oval", "An oval highlight or background."],
              ["pill", "Pill", "A compact badge, label or price background."],
              ["divider", "Divider", "A thin horizontal section divider."],
              ["panel", "Bordered panel", "A ready-made outlined content panel."],
            ] as const).map(([id, name, description]) => <button type="button" key={id} aria-label={`Add ${name}`} onClick={() => addShapeElement(id)}>
              <span className={styles.shapePickerPreview} data-shape={id} aria-hidden="true" />
              <strong>{name}</strong>
              <small>{description}</small>
            </button>)}
          </div>
          <button type="button" className={styles.pricePickerCancel} onClick={() => setPendingShapeElement(null)}>Cancel</button>
        </section>
      </div>}
      {pendingProductCardElement && <div className={styles.pricePickerBackdrop} onMouseDown={() => setPendingProductCardElement(null)}>
        <section className={`${styles.pricePickerDialog} ${styles.productCardPickerDialog}`} role="dialog" aria-modal="true" aria-labelledby="studio-product-card-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.pricePickerHeader}><div><span>ERP PRODUCT MASTER</span><h2 id="studio-product-card-picker-title">Add ERP product card</h2></div><button type="button" aria-label="Close product card picker" onClick={() => setPendingProductCardElement(null)}>×</button></div>
          <p>Choose a polished layout, then select a product. Its latest ERP image, name, price, code, barcode, stock, category and description will be linked automatically.</p>
          <div className={styles.productCardLayoutChoices} role="group" aria-label="Product card layout">
            {(Object.entries(PRODUCT_CARD_QUICK_STYLES) as Array<[ProductCardQuickStyle, (typeof PRODUCT_CARD_QUICK_STYLES)[ProductCardQuickStyle]]>).map(([id, option]) => <button key={id} type="button" data-active={productCardQuickStyle === id} onClick={() => setProductCardQuickStyle(id)}>
              <span className={styles.productCardLayoutPreview} data-layout={id} aria-hidden="true"><i /><i /><i /></span>
              <strong>{option.name}</strong><small>{option.description}</small>
            </button>)}
          </div>
          <label className={styles.pricePickerProduct}>Find ERP product<input aria-label="Find ERP product for card" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search name, SKU, barcode or brand" /></label>
          {productsLoading && <div className={styles.pricePickerLoading}>Loading synchronized ERP products…</div>}
          {!productsLoading && <div className={styles.productCardProductList}>
            {products.slice(0, 30).map((product) => <button type="button" key={product.id} aria-label={`Add ${product.display_name || product.erp_name} product card`} onClick={() => {
              addProductCard(product, pendingProductCardElement.x, pendingProductCardElement.y, productCardQuickStyle);
              setPendingProductCardElement(null);
            }}>
              <span className={styles.productCardProductThumbnail} style={{ backgroundImage: `url(${product.primary_image_url ? `${API_ORIGIN}${product.primary_image_url}` : NO_PRODUCT_IMAGE_URL})` }} role="img" aria-label={`${product.display_name || product.erp_name} ERP image`} />
              <span><strong>{product.display_name || product.erp_name}</strong><small>{product.sku}{product.brand ? ` · ${product.brand}` : ""}</small><small>{product.images.length} image{product.images.length === 1 ? "" : "s"}{product.stock_quantity === null ? "" : ` · stock ${product.stock_quantity}`}{product.barcode ? ` · barcode ${product.barcode}` : ""}</small></span>
              <b>{product.price ? `${product.price_currency || "THB"} ${Number(product.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "ERP linked"}</b>
            </button>)}
          </div>}
          {!productsLoading && !products.length && <div className={styles.pricePickerEmpty}><strong>No ERP products found.</strong><span>Try another name, SKU, barcode or brand, or synchronize Product Master first.</span><button type="button" onClick={() => { setPendingProductCardElement(null); setLeftTab("products"); }}>Open Product Master</button></div>}
          <button type="button" className={styles.pricePickerCancel} onClick={() => setPendingProductCardElement(null)}>Cancel</button>
        </section>
      </div>}
      {pendingPriceElement && <div className={styles.pricePickerBackdrop} onMouseDown={() => setPendingPriceElement(null)}>
        <section className={styles.pricePickerDialog} role="dialog" aria-modal="true" aria-labelledby="studio-price-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.pricePickerHeader}><div><span>ERP PRICE</span><h2 id="studio-price-picker-title">Select customer level</h2></div><button type="button" aria-label="Close customer level picker" onClick={() => setPendingPriceElement(null)}>×</button></div>
          <p>Choose the product, then select the exact ERP price mapped to one of your customer levels.</p>
          {boundProductCandidates.length > 0 ? <label className={styles.pricePickerProduct}>Product<select aria-label="Product for price" value={priceProductId} onChange={(event) => selectPriceProduct(event.target.value)}><option value="">Select a product</option>{boundProductCandidates.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label> : <div className={styles.pricePickerEmpty}><strong>Add a product first.</strong><span>Place a Product card or product image on this page, then add its price.</span><button type="button" onClick={() => { setPendingPriceElement(null); setLeftTab("products"); }}>Open Product Master</button></div>}
          {priceProductId && <div className={styles.pricePickerSelectedProduct}><span>Chosen product</span><strong>{priceOptions?.product.name || boundProductCandidates.find((item) => item.id === priceProductId)?.name || "Loading product…"}</strong>{priceOptions?.product.sku && <small>{priceOptions.product.sku}{priceOptions.product.brand ? ` · ${priceOptions.product.brand}` : ""}</small>}</div>}
          {priceOptionsLoading && <div className={styles.pricePickerLoading}>Loading current ERP prices…</div>}
          {priceProductId && priceOptions?.options.length ? <label className={styles.pricePickerSearch}>Search prices<input type="search" value={pricePickerSearch} onChange={(event) => setPricePickerSearch(event.target.value)} placeholder="Customer level, code or amount" aria-label="Search customer-level prices" /></label> : null}
          {priceOptionsError && <div className={styles.pricePickerEmpty}><strong>Prices could not be loaded.</strong><span>{priceOptionsError}</span></div>}
          {!priceOptionsLoading && priceOptions && <div className={styles.pricePickerOptions}>
            {filteredPickerPriceOptions.map((option) => <button type="button" key={option.customer_level_id} disabled={option.amount === null} aria-label={`Select ${option.customer_level_name} price`} onClick={() => chooseProductPrice(option)}><span className={styles.pricePickerOptionName}><strong>{option.customer_level_name}</strong><small>{option.price_list_code} · {option.mapping_source === "brand" ? "Brand mapping" : option.mapping_source === "default" ? "All-brand default" : "System default"}</small></span><span className={styles.pricePickerAmount}>{option.amount === null ? "No current ERP price" : `${option.currency || "THB"} ${Number(option.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span></button>)}
            {filteredPickerPriceOptions.length === 0 && <div className={styles.pricePickerEmpty}><strong>No matching prices.</strong><span>Try a customer level, price code, mapping, currency, or amount.</span></div>}
          </div>}
          {!priceOptionsLoading && priceOptions && !priceOptions.options.length && <div className={styles.pricePickerEmpty}><strong>No authorized customer-level prices.</strong><span>Configure your ERP price mapping in Price management, or ask an administrator for price-list access.</span></div>}
          <button type="button" className={styles.pricePickerCancel} onClick={() => setPendingPriceElement(null)}>Cancel</button>
        </section>
      </div>}
      {pendingBarcodeElement && <div className={styles.pricePickerBackdrop} onMouseDown={() => setPendingBarcodeElement(null)}>
        <section className={styles.pricePickerDialog} role="dialog" aria-modal="true" aria-labelledby="studio-barcode-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.pricePickerHeader}><div><span>BARCODE</span><h2 id="studio-barcode-picker-title">Add product barcode</h2></div><button type="button" aria-label="Close barcode picker" onClick={() => setPendingBarcodeElement(null)}>×</button></div>
          <div className={styles.barcodePickerResult}>
            <span>BARCODE GENERATOR</span>
            <label>Barcode value<input aria-label="Barcode value to generate" value={generatedBarcodeValue} maxLength={80} placeholder="Enter code, SKU, URL, or text" onChange={(event) => { setGeneratedBarcodeValue(event.target.value); setGeneratedBarcodeError(""); }} onKeyDown={(event) => { if (event.key === "Enter") addGeneratedBarcodeElement(pendingBarcodeElement.x, pendingBarcodeElement.y); }} /></label>
            <small>Creates a Code 128 barcode that remains editable in Properties.</small>
            {generatedBarcodeError && <small role="alert">{generatedBarcodeError}</small>}
            <button type="button" disabled={!generatedBarcodeValue.trim()} onClick={() => addGeneratedBarcodeElement(pendingBarcodeElement.x, pendingBarcodeElement.y)}>Generate barcode</button>
          </div>
          <p>Or choose a product already placed on this page. Its barcode will remain bound to the synchronized ERP record.</p>
          {boundProductCandidates.length > 0 ? <label className={styles.pricePickerProduct}>Product<select aria-label="Product for barcode" value={barcodeProductId} onChange={(event) => selectBarcodeProduct(event.target.value)}><option value="">Select a product</option>{boundProductCandidates.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label> : <div className={styles.pricePickerEmpty}><strong>Add a product first.</strong><span>Place a Product card or product image on this page, then add its ERP barcode.</span><button type="button" onClick={() => { setPendingBarcodeElement(null); setLeftTab("products"); }}>Open Product Master</button></div>}
          {barcodeLoading && <div className={styles.pricePickerLoading}>Loading current ERP barcode…</div>}
          {barcodeError && <div className={styles.pricePickerEmpty}><strong>Barcode unavailable.</strong><span>{barcodeError}</span></div>}
          {!barcodeLoading && barcodeProduct?.barcode && <div className={styles.barcodePickerResult}><span>Current ERP barcode</span><strong>{barcodeProduct.barcode}</strong><small>{barcodeProduct.display_name || barcodeProduct.erp_name} · {barcodeProduct.sku}</small><button type="button" onClick={() => addBarcodeElement(barcodeProduct, pendingBarcodeElement.x, pendingBarcodeElement.y)}>Add ERP barcode</button></div>}
          <button type="button" className={styles.pricePickerCancel} onClick={() => setPendingBarcodeElement(null)}>Cancel</button>
        </section>
      </div>}
      {pendingErpImageElement && <div className={styles.pricePickerBackdrop} onMouseDown={() => setPendingErpImageElement(null)}>
        <section className={styles.pricePickerDialog} role="dialog" aria-modal="true" aria-labelledby="studio-image-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.pricePickerHeader}><div><span>ERP PRODUCT IMAGE</span><h2 id="studio-image-picker-title">Add product image</h2></div><button type="button" aria-label="Close product image picker" onClick={() => setPendingErpImageElement(null)}>×</button></div>
          <p>Choose a product already placed on this page, then select one of its synchronized ERP images. All available images remain attached for the next and previous arrows.</p>
          {boundProductCandidates.length > 0 ? <label className={styles.pricePickerProduct}>Product<select aria-label="Product for image" value={erpImageProductId} onChange={(event) => selectErpImageProduct(event.target.value)}><option value="">Select a product</option>{boundProductCandidates.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label> : <div className={styles.pricePickerEmpty}><strong>Add a product first.</strong><span>Place a Product card on this page, then add its synchronized ERP image.</span><button type="button" onClick={() => { setPendingErpImageElement(null); setLeftTab("products"); }}>Open Product Master</button></div>}
          {erpImageLoading && <div className={styles.pricePickerLoading}>Loading synchronized ERP images…</div>}
          {erpImageError && <div className={styles.pricePickerEmpty}><strong>Image unavailable.</strong><span>{erpImageError}</span></div>}
          {!erpImageLoading && erpImageProduct?.images.length ? <div className={styles.erpImagePickerGrid}>{erpImageProduct.images.map((image) => <button type="button" key={image.id} data-active={erpImageId === image.id} aria-label={`Select ERP image ${image.file_name}`} onClick={() => setErpImageId(image.id)}><Image unoptimized width={120} height={90} src={`${API_ORIGIN}${image.url}`} alt={image.alt_text || image.file_name} /><span>{image.is_primary ? "Primary ERP image" : image.file_name}</span></button>)}</div> : null}
          {!erpImageLoading && erpImageProduct?.images.length ? <div className={styles.erpImagePickerFooter}><span>{erpImageProduct.display_name || erpImageProduct.erp_name} · {erpImageProduct.images.length} image{erpImageProduct.images.length === 1 ? "" : "s"}</span><button type="button" disabled={!erpImageId} onClick={chooseErpProductImage}>Add selected ERP image</button></div> : null}
          <button type="button" className={styles.pricePickerCancel} onClick={() => setPendingErpImageElement(null)}>Cancel</button>
        </section>
      </div>}
      {pendingErpTableElement && <div className={styles.pricePickerBackdrop} onMouseDown={() => setPendingErpTableElement(null)}>
        <section className={`${styles.pricePickerDialog} ${styles.erpTablePickerDialog}`} role="dialog" aria-modal="true" aria-labelledby="studio-table-picker-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.pricePickerHeader}><div><span>TABLE</span><h2 id="studio-table-picker-title">{pendingErpTableElement.editElementId ? "Edit table products" : "Add a table"}</h2></div><button type="button" aria-label="Close table picker" onClick={() => setPendingErpTableElement(null)}>×</button></div>
          <p>Start with a blank editable table, or build one from synchronized ERP product information.</p>
          <div className={styles.erpTablePresetGrid} aria-label="Table source">
            <button type="button" onClick={chooseBlankTable}><strong>Blank table</strong><span>Start with an empty 3 × 3 grid. Add or remove rows and columns in Properties.</span></button>
          </div>
          <div className={styles.pricePickerSelectedProduct}><span>ERP table</span><strong>Use synchronized product data</strong><small>Choose one product or independently select several products.</small></div>
          <div className={styles.erpTablePresetGrid} aria-label="ERP product selection mode">
            <button type="button" data-active={erpTableSelectionMode === "single"} onClick={() => { setErpTableSelectionMode("single"); setErpTableError(""); }}><strong>One product</strong><span>Build the table for one placed product or image carousel.</span></button>
            <button type="button" data-active={erpTableSelectionMode === "multiple"} onClick={() => { setErpTableSelectionMode("multiple"); setErpTableProductId(""); setErpTableError(""); }}><strong>Select multiple products</strong><span>Choose any catalogue products and combine them in one table.</span></button>
          </div>
          {erpTableSelectionMode === "single" && (boundProductCandidates.length > 0 ? <label className={styles.pricePickerProduct}>Product<select aria-label="Product for ERP table" value={erpTableProductId} onChange={(event) => selectErpTableProduct(event.target.value)}><option value="">Select a product</option>{boundProductCandidates.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></label> : <div className={styles.pricePickerEmpty}><strong>Add a product first.</strong><span>Place a Product card or product image on this page, then build a table from its synchronized ERP data.</span><button type="button" onClick={() => { setPendingErpTableElement(null); setLeftTab("products"); }}>Open Product Master</button></div>)}
          {erpTableSelectionMode === "multiple" && <div className={styles.cardBulkProducts} aria-label="Products for ERP table">
            <h3>Select products from Product Master</h3><p>{erpTableSelectedProductIds.length} selected. Search again to add more; existing selections remain selected.</p>
            <input aria-label="Search Product Master for table" value={erpTableProductSearch} placeholder="Search name, code, barcode, brand or category" onChange={(event) => setErpTableProductSearch(event.target.value)} />
            {productsLoading && <small>Searching Product Master…</small>}
            {erpTableSearchResults.map((product) => <label key={product.id}><input type="checkbox" checked={erpTableSelectedProductIds.includes(product.id)} onChange={() => setErpTableSelectedProductIds((current) => current.includes(product.id) ? current.filter((id) => id !== product.id) : [...current, product.id])} /><span>{product.display_name || product.erp_name}</span><small>{product.sku} · {product.barcode || "No barcode"} · Stock {product.stock_quantity ?? "—"}</small></label>)}
            {!productsLoading && erpTableSearchResults.length === 0 && <small>No Product Master results.</small>}
          </div>}
          {erpTableLoading && <div className={styles.pricePickerLoading}>Loading current ERP product details and prices…</div>}
          {erpTableError && <div className={styles.pricePickerEmpty}><strong>ERP information could not be loaded.</strong><span>{erpTableError}</span></div>}
          {erpTableSelectionMode === "single" && !erpTableLoading && erpTableProduct && <>
            <div className={styles.pricePickerSelectedProduct}><span>Chosen ERP product</span><strong>{erpTableProduct.display_name || erpTableProduct.erp_name}</strong><small>{erpTableProduct.sku}{erpTableProduct.brand ? ` · ${erpTableProduct.brand}` : ""} · Stock {erpTableProduct.stock_quantity ?? "—"}</small></div>
            <div className={styles.erpTablePresetGrid} aria-label="ERP table type">
              {ERP_TABLE_PRESETS.map((preset) => <button type="button" key={preset.id} data-active={erpTablePreset === preset.id} disabled={preset.id === "prices" && !erpTablePriceOptions?.options.length} onClick={() => { setErpTablePreset(preset.id); setErpTableError(""); }}><strong>{preset.name}</strong><span>{preset.description}</span></button>)}
            </div>
            <div className={styles.erpTablePreview}><span>Table preview</span><pre>{buildErpTableText(erpTablePreset, erpTableProduct, erpTablePriceOptions)}</pre></div>
            <div className={styles.erpImagePickerFooter}><span>Values are from the latest synchronized ERP record.</span><button type="button" onClick={chooseErpTable}>Add ERP table</button></div>
          </>}
          {erpTableSelectionMode === "multiple" && erpTableSelectedProductIds.length > 0 && <>
            <div className={styles.erpTablePresetGrid} aria-label="ERP table type">
              {ERP_TABLE_PRESETS.map((preset) => <button type="button" key={preset.id} data-active={erpTablePreset === preset.id} onClick={() => { setErpTablePreset(preset.id); setErpTableError(""); }}><strong>{preset.name}</strong><span>{preset.description}</span></button>)}
            </div>
            <div className={styles.erpTablePreview}><span>Table preview</span><pre>{buildMultiProductTableText(erpTablePreset, erpTableSelectedProductIds.map((id) => [...products, ...erpTableKnownProducts].find((product) => product.id === id)).filter((product): product is StudioAvailableProduct => Boolean(product)))}</pre></div>
            <div className={styles.erpImagePickerFooter}><span>Selected product IDs are saved and stock remains synchronized.</span><button type="button" onClick={chooseErpTable}>{pendingErpTableElement.editElementId ? "Update selected table" : "Add multi-product ERP table"}</button></div>
          </>}
          <button type="button" className={styles.pricePickerCancel} onClick={() => setPendingErpTableElement(null)}>Cancel</button>
        </section>
      </div>}
      {cardTemplatePreview && <div className={styles.pricePickerBackdrop} onMouseDown={()=>setCardTemplatePreview(null)}><section className={styles.pricePickerDialog} role="dialog" aria-modal="true" aria-labelledby="card-template-preview-title" onMouseDown={event=>event.stopPropagation()}><div className={styles.pricePickerHeader}><div><span>PRODUCT CARD TEMPLATE</span><h2 id="card-template-preview-title">{cardTemplatePreview.name}</h2></div><button type="button" aria-label="Close template preview" onClick={()=>setCardTemplatePreview(null)}>×</button></div><div className={styles.largeCardTemplatePreview} style={{aspectRatio:`${cardTemplatePreview.card_width}/${cardTemplatePreview.card_height}`}}><ProductCardTemplateSample template={cardTemplatePreview}/></div><p>{cardTemplatePreview.description}</p><div className={styles.pricePickerFooter}><span>{cardTemplatePreview.card_width} × {cardTemplatePreview.card_height} {cardTemplatePreview.dimension_unit} · {cardTemplatePreview.layout_mode}</span><button type="button" onClick={()=>{addTemplateCard(cardTemplatePreview);setCardTemplatePreview(null);}}>Use Template</button></div></section></div>}
      {productSequenceOpen && <div className={styles.pricePickerBackdrop} onMouseDown={() => setProductSequenceOpen(false)}><section className={`${styles.pricePickerDialog} ${styles.productSequenceDialog}`} role="dialog" aria-modal="true" aria-labelledby="product-sequence-title" onMouseDown={(event) => event.stopPropagation()}><div className={styles.pricePickerHeader}><div><span>PRODUCT CARDS · ALL PAGES</span><h2 id="product-sequence-title">Manage product sequence</h2></div><button type="button" aria-label="Close product sequence" onClick={() => setProductSequenceOpen(false)}>×</button></div><p>Add the new product from the Products tab, then move its complete card earlier or later. Moving past a page boundary exchanges the whole card with the adjacent card on the previous or next page.</p>{productSequenceBlocks.length ? <div className={styles.productSequenceList}>{productSequenceBlocks.map((block, index) => <article key={`${block.pageId}:${block.id}`}><span>{index + 1}</span><div><strong>{block.label}</strong><small>{block.pageName} · {block.elements.length} linked frame{block.elements.length === 1 ? "" : "s"}</small></div><button type="button" disabled={productSequenceBusy || index === 0} onClick={() => void moveProductSequenceBlock(block.pageId, block.id, -1)}>↑ Earlier</button><button type="button" disabled={productSequenceBusy || index === productSequenceBlocks.length - 1} onClick={() => void moveProductSequenceBlock(block.pageId, block.id, 1)}>↓ Later</button></article>)}</div> : <div className={styles.productSequenceEmpty}>No linked product-card frames are in this catalogue yet. Add a product from the Products tab first.</div>}<div className={styles.pricePickerFooter}><span>{productSequenceBusy ? "Updating pages…" : "All catalogue pages are included. Changes save automatically."}</span><button type="button" disabled={productSequenceBusy} onClick={() => { setProductSequenceOpen(false); setLeftTab("products"); }}>Add another product</button></div></section></div>}
      <nav className={styles.mobileEditorSections} aria-label="Mobile editor sections">
        <button type="button" data-active={leftTab === "pages"} onClick={() => setLeftTab("pages")}><span aria-hidden="true">▤</span>Pages</button>
        <button type="button" data-active={leftTab === "layers" || leftTab === "elements" || leftTab === "products" || leftTab === "media"} onClick={() => setLeftTab("layers")}><span aria-hidden="true">✎</span>Content</button>
        <button type="button" onClick={() => void openPreview()}><span aria-hidden="true">▷</span>Preview</button>
      </nav>
      <section className={styles.editorPrintPages} aria-hidden="true">
        {design.pages.filter((page) => page.is_visible).map((page, pageIndex) => <CataloguePageRenderer key={page.id} designId={design.id} page={page.id === activePageId ? { ...page, page_data_json: document } : page} pageNumber={pageIndex + 1} mode="print" scale={1} renderOnly />)}
      </section>
      <section
        className={`${styles.editorBody} ${sidebarStyles.workspace}`}
        data-properties-visible={propertiesPanelVisible}
        data-has-selection={Boolean(selected)}
        data-cover-mode={leftTab === "cover"}
        style={{
          "--studio-left-panel-width": `${sidebarCollapsed ? 72 : leftPanelWidth}px`,
          "--studio-left-handle-width": sidebarCollapsed ? "0px" : "8px",
          "--studio-right-panel-width": propertiesPanelVisible ? `${rightPanelWidth}px` : "0px",
          "--studio-right-handle-width": propertiesPanelVisible ? "8px" : "0px",
        } as CSSProperties}
      >
        <StudioToolSidebar activeTab={leftTab} onSelectTab={(tab) => { setLeftTab(tab); if (tab === "cover") setSelectedIds([]); }}
          collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed}
          mainTabs={PRIMARY_EDITOR_TABS.filter((tab) => canManageElements || tab === "pages" || tab === "cover")}
          secondaryTabs={ADVANCED_EDITOR_TABS.filter((tab) => canManageElements || tab === "layers")}>
          {leftTab === "cover" && <p className={styles.libraryHint}>Use the cover preview on the right to upload, replace or remove your finished image. Save cover, then Publish. Printable pages are not changed.</p>}
          {canManageElements && leftTab === "elements" && <div className={styles.elementLibrary}><button aria-label="Price" draggable onDragStart={(event) => event.dataTransfer.setData("studio-price", "price")} onClick={() => openPricePicker()}><span>฿</span><strong>Price</strong></button>{ELEMENTS.filter(([type]) => type !== "image_carousel" || canViewCarousels).map(([type, icon, name]) => <button key={type} aria-label={`${icon} ${name}`} draggable={type !== "image_carousel" || canAddCarousels} disabled={type === "image_carousel" && !canAddCarousels} title={type === "image_carousel" ? "Add a multi-image carousel with ERP and uploaded images" : name} onDragStart={(event) => event.dataTransfer.setData(type === "barcode" ? "studio-barcode" : type === "image" ? "studio-erp-image" : type === "table" ? "studio-erp-table" : type === "shape" ? "studio-shape" : "studio-element", type)} onClick={() => type === "text" ? openTextPicker() : type === "barcode" ? openBarcodePicker() : type === "image" ? openErpImagePicker() : type === "table" ? openErpTablePicker() : type === "shape" ? openShapePicker() : addElement(type)}><span>{icon}</span><strong>{name}</strong>{type === "image_carousel" && <small>Multiple images</small>}</button>)}<button type="button" aria-label="Open image grids" title="Create drag-and-drop image frames" onClick={() => setImageGridPickerOpen(true)}><span>▦</span><strong>Grids</strong></button><button type="button" className={styles.productSequenceButton} aria-label="Manage product sequence" onClick={() => setProductSequenceOpen(true)}><span>≡</span><strong>Product sequence</strong><small>Insert & shift cards</small></button></div>}
          {canManageElements && leftTab === "cards" && <>
            <ProductCardTemplateGallery compact templates={cardTemplates} loading={cardTemplatesLoading} canUse={canAddProductCards} onUse={(template)=>bulkProductIds.length?applyTemplateToSelectedProducts(template):addTemplateCard(template)} onPreview={setCardTemplatePreview} onCreateScratch={createCardFromScratch} onDuplicate={canDuplicateCardTemplates?duplicateCardTemplate:undefined} onRename={canEditCardTemplates?renameCardTemplate:undefined} onShare={canShareCardTemplates?shareCardTemplate:undefined} onVersions={canViewCardTemplateVersions?viewCardTemplateVersions:undefined} onDelete={canDeleteOwnCardTemplates?removeCardTemplate:undefined}/>
            <div className={styles.cardBulkProducts}><h3>Apply to multiple products</h3><p>Select active ERP products, then choose <strong>Use Template</strong> above.</p>{products.slice(0,30).map(product=><label key={product.id}><input type="checkbox" checked={bulkProductIds.includes(product.id)} onChange={event=>setBulkProductIds(ids=>event.target.checked?[...ids,product.id]:ids.filter(id=>id!==product.id))}/><span>{product.display_name||product.erp_name}</span><small>{product.sku}</small></label>)}</div>
          </>}
          {canManageElements && leftTab === "fields" && <div className={styles.elementLibrary}>{PRODUCT_FIELDS.map(([name,binding])=><button key={`${name}:${binding}`} draggable onDragStart={event=>event.dataTransfer.setData("studio-field",JSON.stringify({name,binding}))} onClick={()=>addBoundField(name,binding)}><span>F</span><strong>{name}</strong></button>)}</div>}
          {canManageElements && leftTab === "prices" && <div className={`${styles.productLibrary} ${styles.studioPriceLibrary}`}>
            <h3>Catalogue mapped prices</h3>
            <p className={styles.libraryHint}>Choose the customer link in the pricing bar above, then apply it once. Every product automatically uses the mapping for its own brand. Use the options below only to add a second or standalone price.</p>
            <section className={styles.erpSyncPanel} aria-label="ERP price synchronization">
              <div><strong>Live ERP price data</strong><small>Each slot uses its synchronized ERP price level. Choose a product to confirm the current amount before placing it.</small></div>
              <div className={styles.erpSyncActions}>
                <button type="button" disabled={erpSyncing || priceTabLoading} onClick={() => void refreshStudioPrices(false)}>{priceTabLoading && !erpSyncing ? "Refreshing…" : "Refresh ERP prices"}</button>
                {canRunDataSync && <button type="button" className={styles.erpSyncButton} disabled={erpSyncing} onClick={() => void refreshStudioPrices(true)}>{erpSyncing ? "Synchronizing ERP…" : "Sync prices from ERP"}</button>}
              </div>
            </section>
            <label>Find product for price
              <input type="search" value={priceProductSearch} onChange={(event) => setPriceProductSearch(event.target.value)} onKeyDown={(event) => { if (event.key !== "Enter") return; const needle = priceProductSearch.trim().toLocaleLowerCase(); const match = priceProductResults.find((product) => product.sku.toLocaleLowerCase() === needle) || priceProductResults[0]; if (match) { event.preventDefault(); setPriceTabProductId(match.id); setPriceProductSearch(""); setPriceSearch(""); } }} placeholder="Enter product code or name" aria-label="Search product for catalogue price" />
            </label>
            {priceProductSearchLoading && <p className={styles.libraryHint}>Searching products…</p>}
            {priceProductSearch.trim() && !priceProductSearchLoading && priceProductResults.length > 0 && <div className={styles.priceProductSearchResults} aria-label="Matching products for price">{priceProductResults.map((product) => <button type="button" key={product.id} onClick={() => { setPriceTabProductId(product.id); setPriceProductSearch(""); setPriceSearch(""); }}><strong>{product.sku}</strong><span>{product.display_name || product.erp_name}</span><small>{product.brand || "No brand"}</small></button>)}</div>}
            {priceProductSearch.trim() && !priceProductSearchLoading && priceProductResults.length === 0 && <p className={styles.libraryHint}>No product matches “{priceProductSearch.trim()}”. Check the complete ERP product code.</p>}
            {!priceTabProductId && <p className={styles.libraryHint}>Select a product on the canvas or search its product code above. Price levels appear only after a product is selected.</p>}
            {priceTabLoading && <p className={styles.libraryHint}>Loading synchronized ERP prices…</p>}
            {priceTabError && <p className={styles.studioPriceError} role="alert">{priceTabError}</p>}
            {priceTabProduct && <div className={styles.priceTabSelectedProduct}><span>Showing prices for</span><strong>{priceTabProduct.display_name || priceTabProduct.erp_name}</strong><small>{priceTabProduct.sku}{priceTabProduct.brand ? ` · ${priceTabProduct.brand}` : ""}</small></div>}
            {priceTabProductId && priceTabOptions?.options.length ? <label className={styles.priceSearchLabel}>Search prices
              <input type="search" value={priceSearch} onChange={(event) => setPriceSearch(event.target.value)} placeholder="Price name, code, level or amount" aria-label="Search ERP prices" />
            </label> : null}
            {!priceTabLoading && priceTabOptions?.options.length ? <div className={styles.studioPriceOptionList}>
              {filteredPriceOptions.map((option) => {
                const level = erpPriceLevels.find((item) => item.price_list_id === option.price_list_id);
                const amount = option.amount === null ? null : `${option.currency || "THB"} ${Number(option.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const hasProductCard = document.elements.some((element) => element.type === "product_card" && element.productId === priceTabProductId);
                return <article key={`${option.customer_level_id}:${option.price_list_id}`} className={styles.studioPriceOption} draggable={amount !== null} onDragStart={(event) => amount !== null && event.dataTransfer.setData("studio-field", JSON.stringify({ name: `${option.customer_level_name} price`, binding: `{{product.price_list_${option.price_list_id}}}`, productId: priceTabProductId }))}>
                  <header><span><strong>{option.customer_level_name}</strong><small>{option.customer_level_code}</small></span><b>{amount || "No ERP price"}</b></header>
                  <div className={styles.studioPriceSource}><span>{option.price_list_code}</span><strong>{option.price_list_name}</strong><em>{option.mapping_source === "brand" ? "Brand mapping" : option.mapping_source === "default" ? "All-brand default" : "System default"}</em></div>
                  <small>{level ? `${level.product_count.toLocaleString("en-US")} ERP products` : "Authorized ERP price list"}</small>
                  <div className={styles.studioPriceActions}>
                    <button type="button" disabled={!amount || !hasProductCard} title={!hasProductCard ? "Add this product as a Product card first" : undefined} onClick={() => applyPriceToProductCard(option)}>Use in card</button>
                    <button type="button" disabled={!amount || !hasProductCard} title={!hasProductCard ? "Add this product as a Product card first" : undefined} onClick={() => applyPriceToProductCard(option, true)}>Use as second</button>
                    <button type="button" disabled={!amount} onClick={() => amount && addPriceElement(option, priceTabProductId, 10, 10)}>Add to page</button>
                  </div>
                </article>;
              })}
              {filteredPriceOptions.length === 0 && <p className={styles.libraryHint}>No prices match “{priceSearch.trim()}”. Try a price-list name, code, customer level, or amount.</p>}
            </div> : null}
            {!priceTabLoading && priceTabOptions && !priceTabOptions.options.length && <p className={styles.libraryHint}>No authorized ERP prices are available for this product. Check the user&apos;s price mapping and price-list permissions.</p>}
          </div>}
          {canManageElements && leftTab === "products" && <div className={styles.productLibrary}>
            <h3>Catalogue products</h3>
            <section className={styles.erpSyncPanel} aria-label="ERP Product Master synchronization">
              <div><strong>ERP Product Master</strong><small>Refresh product information, stock, barcode, prices and every available ERP image.</small></div>
              <div className={styles.erpSyncActions}>
                <button type="button" disabled={erpSyncing || productsLoading} onClick={() => void reloadProductsFromMaster(false)}>{erpSyncing ? "Refreshing…" : "Reload Product Master"}</button>
                {canRunDataSync && <button type="button" className={styles.erpSyncButton} disabled={erpSyncing} onClick={() => void reloadProductsFromMaster(true)}>{erpSyncing ? "Synchronizing ERP…" : "Sync products & images from ERP"}</button>}
              </div>
            </section>
            <p className={styles.libraryHint}>Enter a product code and add a ready-made image plus live inventory table in one step.</p>
            <label>Find product<input type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter"&&products.length===1){event.preventDefault();void addProductImageAndLiveTable(products[0]);}}} placeholder="Enter product code, name, barcode or brand" /></label>
            <section className={styles.quickProductSelection} aria-label="Selected catalogue products">
              <header><strong>{quickEditingTableId ? "Edit table products" : "Selected products"}</strong><span>{quickSelectedProducts.length}</span></header>
              {quickSelectedProducts.length ? <div className={styles.quickProductChips}>{quickSelectedProducts.map((product) => <button type="button" key={product.id} title="Remove from selection" onClick={() => toggleQuickProduct(product, false)}><i style={{ backgroundImage: `url(${product.primary_image_url ? `${API_ORIGIN}${product.primary_image_url}` : NO_PRODUCT_IMAGE_URL})` }} aria-hidden="true" /><span>{product.display_name || product.erp_name}</span><small>{product.sku}</small><b aria-hidden="true">×</b></button>)}</div> : <p>Search below and tick one or more products. Your selection stays here while you search again.</p>}
              <div className={styles.quickProductActions}><button type="button" className={styles.primaryAction} disabled={!quickSelectedProducts.length || quickProductGenerating} onClick={() => void (quickEditingTableId ? updateQuickEditingTable() : generateSelectedProductFrames())}>{quickProductGenerating ? "Working…" : quickEditingTableId ? "Update selected table" : quickSelectedProducts.length > 1 ? "Generate carousel + live table + prices" : "Generate image + live table + price"}</button>{!quickEditingTableId && <button type="button" className={styles.completeProductBatch} disabled={!quickSelectedProducts.length || quickGeneratedProductIds.length === 0} onClick={completeQuickProductBatch}>PRODUCT CARD COMPLETED</button>}{!quickEditingTableId && <button type="button" disabled={!quickSelectedProducts.length} onClick={removeSelectedProductsFromPage}>Remove selected from page</button>}<button type="button" onClick={() => { setQuickSelectedProducts([]); setQuickGeneratedProductIds([]); setQuickEditingTableId(null); }}>{quickEditingTableId ? "Cancel table edit" : "Clear selection"}</button></div>
            </section>
            {quickCompletedBatches.length > 0 && <section className={styles.completedProductBatches} aria-label="Completed product card groups"><header><strong>Completed product cards</strong><span>{quickCompletedBatches.length}</span></header>{quickCompletedBatches.map((batch, batchIndex) => <article key={`${batchIndex}-${batch.map((product) => product.id).join("-")}`}><b>Table {batchIndex + 1}</b><div>{batch.map((product) => <span key={product.id} title={product.display_name || product.erp_name}><i style={{ backgroundImage: `url(${product.primary_image_url ? `${API_ORIGIN}${product.primary_image_url}` : NO_PRODUCT_IMAGE_URL})` }} aria-hidden="true" /><small>{product.sku}</small></span>)}</div></article>)}</section>}
            {productsLoading && <p>Loading products…</p>}
            {products.map((product) => <div className={styles.productLibraryItem} key={product.id}>
              <label className={styles.quickProductCheck}><input type="checkbox" checked={quickSelectedProducts.some((item) => item.id === product.id)} onChange={(event) => toggleQuickProduct(product, event.target.checked)} /><span>Select product</span></label>
              <div className={styles.productLibrarySummary}>
                <span className={styles.productThumbnail} style={{ backgroundImage: `url(${product.primary_image_url ? `${API_ORIGIN}${product.primary_image_url}` : NO_PRODUCT_IMAGE_URL})` }} role="img" aria-label={`${product.display_name || product.erp_name} ERP image`} />
                <div><strong>{product.display_name || product.erp_name}</strong><span>{product.sku} · {product.brand || "No brand"}</span><small>{product.price ? `${product.price_currency} ${product.price}` : "Price hidden"}{product.stock_quantity===null?"":" · stock "+product.stock_quantity} · {product.images.length} image{product.images.length===1?"":"s"}</small>{product.barcode && <small>Barcode {product.barcode}</small>}{(product.description_en || product.description_th) && <small title={product.description_en || product.description_th || ""}>{product.description_en || product.description_th}</small>}</div>
              </div>
              <div className={styles.productAddActions}><button type="button" className={styles.primaryAction} onClick={() => void addProductImageAndLiveTable(product)}>Add image + live table</button>{canAddProductCards&&<button draggable onDragStart={(event) => event.dataTransfer.setData("studio-product", JSON.stringify(product))} onClick={() => addProductCard(product)}>Add product card</button>}<button aria-label="Add image only" draggable title={product.images?.length > 1 ? `Adds one carousel containing all ${product.images.length} ERP images` : product.primary_image_url || product.images?.length ? "Add the synchronized ERP image" : "Add the no-image placeholder"} onDragStart={(event) => event.dataTransfer.setData("studio-product-image", JSON.stringify(product))} onClick={() => void addAllProductImages(product)}>Image only</button></div>
              {product.already_used&&<button className={styles.visibilityButton} data-visible={product.catalogue_visible} aria-pressed={product.catalogue_visible} title={product.catalogue_visible?"This product will appear in preview and export":"This product is retained in the design but omitted from preview and export"} onClick={()=>void toggleProductVisibility(product)}>{product.catalogue_visible?"Active in catalogue":"Inactive in catalogue"}</button>}
            </div>)}
          </div>}
          {canManageElements && leftTab === "media" && <StudioMediaLibrary assets={assets} onAdd={addAssetToCanvas} />}
          {leftTab === "pages" && <div className={styles.pageList} aria-busy={addingPage || reorderingPages}>
            {canManagePages && <p className={styles.libraryHint}>Pages stay in a simple order: cover, optional promotions, then catalogue content. Drag within a section to reorder it.</p>}
            <section className={styles.pageStructureSummary} aria-label="Catalogue page structure">
              <div><span>1</span><strong>Cover</strong><small>{coverPages.length || 0} page</small></div>
              <div data-optional="true"><span>2</span><strong>Promotions</strong><small>{promotionPages.length ? `${promotionPages.length} page${promotionPages.length === 1 ? "" : "s"}` : "Optional"}</small></div>
              <div><span>3</span><strong>Catalogue</strong><small>{catalogueContentPages.length} page{catalogueContentPages.length === 1 ? "" : "s"}</small></div>
            </section>
            {canManagePages && canViewPromotions && <section className={styles.promotionPageManager}>
              <div className={styles.promotionManagerHeading}>
                <div><strong>Promotion pages</strong><small>Shown after the cover only while each promotion is active.</small></div>
                <button type="button" aria-expanded={promotionPickerOpen} onClick={() => void togglePromotionPicker()}>{promotionPickerOpen ? "Close" : "+ Add"}</button>
              </div>
              {promotionPages.length === 0 && !promotionPickerOpen && <p>No promotion is attached. Products will follow the cover with no blank page.</p>}
              {promotionPages.length > 0 && <div className={styles.attachedPromotionPages}>{promotionPages.map((page) => <button type="button" key={page.id} data-active={page.id === activePageId} onClick={() => void selectPage(page)}><strong>{page.page_name}</strong><small>{page.page_data_json.promotionStatus?.replaceAll("_", " ") || "Promotion"}{page.page_data_json.promotionEndAt ? ` · ends ${new Date(page.page_data_json.promotionEndAt).toLocaleDateString("en-GB")}` : ""}</small></button>)}</div>}
              {promotionPickerOpen && <div className={styles.promotionPicker}>
                <header><div><strong>Use an existing promotion</strong><small>Dates, products and mapped prices stay connected.</small></div><button type="button" disabled={promotionsLoading} onClick={() => void loadPromotionChoices()}>{promotionsLoading ? "Refreshing…" : "Refresh"}</button></header>
                {promotionsLoading && <p>Loading promotions…</p>}
                {!promotionsLoading && promotionChoices.filter((promotion) => !attachedPromotionIds.has(promotion.id)).map((promotion) => <article key={promotion.id}>
                  <div><strong>{promotion.short_title || promotion.name_en}</strong><small>{promotion.status.replaceAll("_", " ")} · {new Date(promotion.start_at).toLocaleDateString("en-GB")} – {new Date(promotion.end_at).toLocaleDateString("en-GB")}</small><span>{new Set(promotion.products.map((product) => product.product_id)).size} products</span></div>
                  <button type="button" disabled={Boolean(addingPromotionId)} onClick={() => void addPromotionPage(promotion)}>{addingPromotionId === promotion.id ? "Adding…" : "Use"}</button>
                </article>)}
                {!promotionsLoading && promotionChoices.filter((promotion) => !attachedPromotionIds.has(promotion.id)).length === 0 && <p>No reusable promotions are available.</p>}
                {canCreatePromotions && <Link className={styles.createPromotionLink} target="_blank" rel="noopener noreferrer" href={`/promotions/new${design.catalogue_id ? `?catalogueId=${encodeURIComponent(design.catalogue_id)}` : ""}`}>Create promotion in a new tab</Link>}
                <small>Draft and scheduled promotions remain editable in Studio. Published links show only active promotions.</small>
              </div>}
            </section>}
            {design.pages.filter((page) => page.page_type !== "promotion").map((page) => <button
              key={page.id}
              type="button"
              className={styles.pageRow}
              data-active={page.id === activePageId}
              data-dragging={draggingPageId === page.id}
              data-drop-position={pageDropTarget?.id === page.id ? pageDropTarget.position : undefined}
              draggable={canManagePages && !addingPage && !reorderingPages}
              aria-grabbed={canManagePages && !addingPage && !reorderingPages ? draggingPageId === page.id : undefined}
              title={canManagePages ? reorderingPages ? "Saving page order" : "Drag to reorder this page" : undefined}
              onClick={() => void selectPage(page)}
              onDragStart={(event) => {
                if (!canManagePages || addingPage || reorderingPages) return;
                setDraggingPageId(page.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("studio-page", page.id);
                event.dataTransfer.setData("text/plain", page.id);
              }}
              onDragOver={(event) => {
                const draggedId = draggingPageId || event.dataTransfer.getData("studio-page");
                if (!canManagePages || !draggedId || draggedId === page.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const bounds = event.currentTarget.getBoundingClientRect();
                const nextTarget = { id: page.id, position: event.clientY < bounds.top + bounds.height / 2 ? "before" as const : "after" as const };
                setPageDropTarget((current) => current?.id === nextTarget.id && current.position === nextTarget.position ? current : nextTarget);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const draggedId = draggingPageId || event.dataTransfer.getData("studio-page") || event.dataTransfer.getData("text/plain");
                const bounds = event.currentTarget.getBoundingClientRect();
                const position: StudioPageDropPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
                setDraggingPageId(null);
                setPageDropTarget(null);
                if (draggedId) void dropPage(draggedId, page.id, position);
              }}
              onDragEnd={() => { setDraggingPageId(null); setPageDropTarget(null); }}
            ><span><b aria-hidden="true">⋮⋮</b>{page.display_order}</span><div><strong>{page.page_name}</strong><small>{page.page_data_json.navigationCategory?.trim() ? `Category: ${page.page_data_json.navigationCategory}` : page.page_type.replaceAll("_", " ")}</small></div>{!page.is_visible && <i>Hidden</i>}{page.is_locked&&<i>Locked</i>}</button>)}
            {canManagePages && <><select aria-label="New page type" disabled={addingPage || reorderingPages} onChange={(event) => { if (event.target.value) void addPage(event.target.value as StudioPageType); event.target.value = ""; }} defaultValue=""><option value="" disabled>{addingPage ? "Adding page…" : "+ Add page"}</option>{PAGE_TYPES.map(([type, name]) => <option value={type} key={type}>{name}</option>)}</select><div className={styles.pageActions}><button disabled={addingPage || reorderingPages} onClick={() => void addPage("blank")}>{addingPage ? "Adding…" : "Add blank"}</button><button disabled={addingPage || reorderingPages} onClick={() => void addPage(activePage?.page_type, document)}>Duplicate</button><button disabled={addingPage || reorderingPages} onClick={() => void movePage(-1)}>↑</button><button disabled={addingPage || reorderingPages} onClick={() => void movePage(1)}>↓</button><button onClick={() => void removePage()} disabled={addingPage || reorderingPages || Boolean(deletingPageId) || (design?.pages.length ?? 0) <= 1}>{deletingPageId ? "Deleting…" : "Delete"}</button></div></>}
          </div>}
          {leftTab === "layers" && <div className={styles.layerList}><p className={styles.libraryHint}>Drag layers up to bring them forward or down to place them behind other elements. Click the lock beside a layer to lock or unlock it. Hold Ctrl (Cmd on Mac) and click to select or deselect several layers.</p>{document.elements.slice().sort((a, b) => b.zIndex - a.zIndex).map((element, index, ordered) => <div key={element.id} className={styles.layerRow} data-active={selectedIds.includes(element.id)} data-dragging={draggingLayerId === element.id} data-drop-position={layerDropTarget?.id === element.id ? layerDropTarget.position : undefined} draggable={!element.locked} onDragStart={(event) => { setDraggingLayerId(element.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", element.id); }} onDragOver={(event) => { if (!draggingLayerId || draggingLayerId === element.id) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; const bounds = event.currentTarget.getBoundingClientRect(); setLayerDropTarget({ id: element.id, position: event.clientY < bounds.top + bounds.height / 2 ? "before" : "after" }); }} onDrop={(event) => { event.preventDefault(); const draggedId = draggingLayerId || event.dataTransfer.getData("text/plain"); const position = layerDropTarget?.id === element.id ? layerDropTarget.position : "before"; if (draggedId) reorderLayer(draggedId, element.id, position); setDraggingLayerId(null); setLayerDropTarget(null); }} onDragEnd={() => { setDraggingLayerId(null); setLayerDropTarget(null); }}><button className={styles.layerSelect} data-active={selectedIds.includes(element.id)} onClick={(event) => selectCanvasElement(element.id, event.shiftKey || event.ctrlKey || event.metaKey)} aria-label={`Select layer ${element.name}`}><span className={styles.dragHandle} aria-hidden="true">⋮⋮</span><span>{element.visible ? "◉" : "○"}</span><strong>{element.name}</strong></button><button type="button" className={styles.layerLockButton} data-locked={element.locked} aria-label={`${element.locked ? "Unlock" : "Lock"} ${element.name}`} title={`${element.locked ? "Unlock" : "Lock"} layer`} onClick={(event) => { event.stopPropagation(); toggleLayerLocked(element.id); }}><span aria-hidden="true">{element.locked ? "🔒" : "🔓"}</span></button><div className={styles.layerMoveButtons}><button aria-label={`Move ${element.name} forward`} title="Move forward" disabled={element.locked || index === 0} onClick={() => moveLayer(element.id, -1)}>↑</button><button aria-label={`Move ${element.name} backward`} title="Move backward" disabled={element.locked || index === ordered.length - 1} onClick={() => moveLayer(element.id, 1)}>↓</button></div></div>)}</div>}
        </StudioToolSidebar>
        <div hidden={sidebarCollapsed} data-sidebar-resize="left" className={`${styles.panelResizeHandle} ${styles.panelResizeHandleLeft}`} role="separator" aria-label="Resize Elements panel" aria-orientation="vertical" aria-valuemin={LEFT_PANEL_MIN} aria-valuemax={LEFT_PANEL_MAX} aria-valuenow={leftPanelWidth} tabIndex={0} title="Drag to resize · Double-click to reset" onPointerDown={(event) => beginPanelResize("left", event)} onKeyDown={(event) => resizePanelWithKeyboard("left", event)} onDoubleClick={() => updatePanelWidth("left", LEFT_PANEL_DEFAULT)}><span /></div>
        <section ref={canvasWorkspaceRef} data-testid="studio-canvas-workspace" className={styles.canvasWorkspace} onDragOver={(event) => event.preventDefault()} onDrop={canvasDrop}>
          {leftTab === "cover" ? <StudioOnlineCover cover={design.online_cover_json || null} canEdit={canEdit} disabled={publicationAction !== null} onSave={saveOnlineCover} onRemove={removeOnlineCover} /> : <>
          <div className={styles.canvasMeta}><span>{activePage?.display_order} / {design.pages.length}</span><strong>{activePage?.page_name}</strong><small>{document.canvas.width} × {document.canvas.height}</small><div className={styles.interactionModeToggle} role="group" aria-label="Canvas interaction mode"><button type="button" data-active={interactionMode === "edit"} onClick={() => setInteractionMode("edit")}>Edit</button><button type="button" data-active={interactionMode === "preview"} onClick={() => { setInteractionMode("preview"); setSelectionMode(false); setSelectedIds([]); }}>Preview interaction</button></div>{canManagePages && <button type="button" className={styles.duplicateCurrentPageButton} disabled={addingPage || reorderingPages} onClick={() => void addPage(activePage?.page_type, document)} title="Duplicate this page with all current elements and settings">{addingPage ? "Adding page…" : "Duplicate page"}</button>}{canManageElements && interactionMode === "edit" && <button type="button" className={styles.selectionModeButton} data-active={selectionMode} onClick={() => setSelectionMode((active) => !active)} title="Select several parts by drawing a box around them">{selectionMode ? "Cancel selection" : "Select parts"}</button>}{selectedIds.length > 1 && <div className={styles.multiSelectionActions}><b>{selectedIds.length} selected</b><button type="button" onClick={groupSelected}>Group</button><button type="button" onClick={ungroupSelected} disabled={!document.elements.some((item) => selectedIds.includes(item.id) && item.groupId)}>Ungroup</button></div>}</div>
          <div className={styles.canvasPageStack}>
            {design.pages.map((page) => page.id === activePageId ? (
              <section key={page.id} className={styles.catalogueCanvasPage} data-studio-page-id={page.id} data-active="true" aria-label={`Page ${page.display_order}: ${page.page_name}`}>
                <div className={styles.canvasFrame}><EditorCanvas designId={design.id} document={document} pageNumber={page.display_order} selectedIds={selectedIds} selectionMode={selectionMode} interactionMode={interactionMode} cropModeElementId={cropModeElementId} zoom={zoom} onStageReady={setStage} onSelect={selectCanvasElement} onSelectMany={selectCanvasElements} onChange={(element) => { if (canManageElements) updateElement(element); }} onMoveSelection={(sourceId, deltaX, deltaY) => { if (canManageElements) moveCanvasSelection(sourceId, deltaX, deltaY); }} onTransformSelection={(elements) => { if (canManageElements) transformCanvasSelection(elements); }} onMoveAcrossPage={(sourceId, direction, deltaX) => { if (canManageElements) void moveSelectionToAdjacentPage(sourceId, direction, deltaX); }} canMoveToPreviousPage={Boolean(previousPage && !previousPage.is_locked)} canMoveToNextPage={Boolean(nextPage && !nextPage.is_locked)} onProductImageStep={stepProductCardImage} onProductImagePreview={openProductImagePreview} onElementContextMenu={openElementContextMenu} /></div>
                {canManagePages && interactionMode === "edit" && !page.is_locked && <div className={styles.pageResizeOverlay} data-resizing={Boolean(pageResizeDraft)} style={{ width: (pageResizeDraft?.width ?? document.canvas.width) * zoom, height: (pageResizeDraft?.height ?? document.canvas.height) * zoom }}><button type="button" className={styles.pageResizeWidth} aria-label="Drag to resize page width" onPointerDown={(event) => beginPageResize("width", event)} /><button type="button" className={styles.pageResizeHeight} aria-label="Drag to resize page height" onPointerDown={(event) => beginPageResize("height", event)} /><button type="button" className={styles.pageResizeCorner} aria-label="Drag to resize page width and height" onPointerDown={(event) => beginPageResize("both", event)} />{pageResizeDraft && <output>{pageResizeDraft.width} × {pageResizeDraft.height} px · prints as A4 {pageResizeDraft.width > pageResizeDraft.height ? "landscape" : "portrait"}</output>}</div>}
              </section>
            ) : (
              <section key={page.id} className={styles.catalogueCanvasPage} data-studio-page-id={page.id} data-active="false" aria-label={`Page ${page.display_order}: ${page.page_name}`}>
                <div className={styles.canvasFrame} onClick={() => void selectPage(page)}><CataloguePageRenderer designId={design.id} page={page} pageNumber={page.display_order} mode="pdf" scale={zoom} instanceId="studio-editor-static-page" /></div>
              </section>
            ))}
          </div>
          </>}
        </section>
        <div data-sidebar-resize="right" className={`${styles.panelResizeHandle} ${styles.panelResizeHandleRight}`} role="separator" aria-label="Resize Properties panel" aria-orientation="vertical" aria-valuemin={RIGHT_PANEL_MIN} aria-valuemax={RIGHT_PANEL_MAX} aria-valuenow={rightPanelWidth} tabIndex={0} title="Drag to resize · Double-click to reset" onPointerDown={(event) => beginPanelResize("right", event)} onKeyDown={(event) => resizePanelWithKeyboard("right", event)} onDoubleClick={() => updatePanelWidth("right", RIGHT_PANEL_DEFAULT)}><span /></div>
        <aside data-studio-panel="properties" className={styles.propertiesPanel}>
          <div className={styles.propertiesHeading}>
            <span>{selected ? "EDIT SELECTION" : leftTab === "pages" ? "PAGE SETTINGS" : "QUICK START"}</span>
            <h2>{selected ? selected.name : leftTab === "pages" ? activePage?.page_name || "Page" : "What would you like to do?"}</h2>
            <p>{selected ? `Editing ${selected.type.replaceAll("_", " ")}. Changes save automatically.` : leftTab === "pages" ? "Manage the selected page and its preview navigation section." : "Choose a common action below, or select something on the page to edit it."}</p>
          </div>
          {leftTab === "pages" && activePage && canManagePages && <div className={styles.propertyForm}>
            <label>Category / Section<input aria-label="Page category or section" list="studio-page-categories" placeholder="Example: Chair" value={document.navigationCategory || ""} onChange={(event) => setDocument({ ...document, navigationCategory: event.target.value })} onBlur={(event) => void patchPage({ navigationCategory: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
            <datalist id="studio-page-categories">{Array.from(new Set(design.pages.map((page) => page.page_data_json.navigationCategory?.trim()).filter((category): category is string => Boolean(category)))).map((category) => <option value={category} key={category} />)}</datalist>
            {activePage.display_order > 1 && <button type="button" onClick={() => { const previous = design.pages[activePage.display_order - 2]; if (previous) void patchPage({ navigationCategory: previous.page_data_json.navigationCategory || previous.page_name }); }}>Same category as previous page</button>}
            <small>Pages with the same category appear under one button in Preview. Their individual page names remain available in the editor.</small>
          </div>}
          {selected && canManageElements && <div className={styles.propertyForm}>
            {selectedIds.length < 2 && <div className={styles.selectionHint}>To group parts, hold <strong>Ctrl</strong> (Cmd on Mac) and click at least two elements or layers. You can also use <strong>Select parts</strong> and drag a box around them.</div>}
            <label>Name<input value={selected.name} onChange={(event) => patchSelected({ name: event.target.value })} /></label>
            {selectedSupportsProductImageDownload && <section className={styles.cardProperties}>
              <div><strong>Image download button</strong><small>Drag the arrow directly on the canvas to place it anywhere inside this product image or card. Its position and design save automatically.</small></div>
              <div className={styles.downloadButtonDesignGrid} role="group" aria-label="Download arrow design">
                {DOWNLOAD_BUTTON_DESIGNS.map((designOption) => <button type="button" key={designOption.id} data-design={designOption.id} data-active={String(selected.style.downloadButtonDesign || "classic") === designOption.id} aria-pressed={String(selected.style.downloadButtonDesign || "classic") === designOption.id} onClick={() => patchSelected({}, { downloadButtonDesign: designOption.id })}><span aria-hidden="true">{designOption.glyph}</span><strong>{designOption.label}</strong></button>)}
              </div>
              <label>Button size<input type="range" min="24" max="64" step="2" value={Number(selected.style.downloadButtonSize || 32)} onChange={(event) => patchSelected({}, { downloadButtonSize: Number(event.target.value) })} /><span>{Number(selected.style.downloadButtonSize || 32)} px</span></label>
              <div className={styles.propertyGrid}><label>Horizontal position<input type="number" min="0" max="92" step="0.1" value={Number(selected.style.downloadButtonXPercent ?? 3).toFixed(1)} onChange={(event) => patchSelected({}, { downloadButtonXPercent: Number(event.target.value) })} /></label><label>Vertical position<input type="number" min="0" max="92" step="0.1" value={Number(selected.style.downloadButtonYPercent ?? 3).toFixed(1)} onChange={(event) => patchSelected({}, { downloadButtonYPercent: Number(event.target.value) })} /></label></div>
              <button type="button" onClick={() => patchSelected({}, { downloadButtonXPercent: 3, downloadButtonYPercent: 3 })}>Reset arrow to top left</button>
            </section>}
            {selected.type === "image_carousel" && canViewCarousels && <StudioCarouselProperties designId={design.id} element={selected} products={products} productSearch={productSearch} selectedProduct={selectedProduct} assets={assets} uploads={carouselUploads} draggingImageId={carouselDraggingImageId} canEdit={canEditCarousels} canUpload={canUploadCarouselImages} canSelectProductImages={canSelectCarouselProductImages} canReorder={canReorderCarouselImages} canConfigureTransition={canConfigureCarouselTransition} canConfigurePdf={canConfigureCarouselPdf} onBindProduct={bindCarouselProduct} onRemoveProduct={removeCarouselProduct} onProductSearch={setProductSearch} onToggleProductImage={toggleCarouselProductImage} onUpload={(files) => void uploadCarouselFiles(files)} onCancelUpload={cancelCarouselUpload} onAddAsset={addAssetToCarousel} onPatch={patchCarousel} onPatchSection={patchCarouselSection} onUpdateImage={updateCarouselImage} onMoveImage={moveCarouselImage} onRemoveImage={removeCarouselImage} onReplaceImage={(imageId, file) => void replaceCarouselImage(imageId, file)} onDraggingImageId={setCarouselDraggingImageId} />}
            {selected.type === "barcode" && <section className={styles.cardProperties}>
              {selected.style.barcodeSource === "erp" ? <>
                <div><strong>ERP barcode binding</strong><small>This barcode follows the selected product&apos;s ERP record and is refreshed with Product Master.</small></div>
                <label>Product<input value={String(selected.style.productName || selected.name)} readOnly /></label>
                <label>ERP barcode<input value={selected.text || selected.target || ""} readOnly /></label>
              </> : <>
                <div><strong>Generated barcode</strong><small>Edit the Code 128 value below. Preview and exports update automatically.</small></div>
                <label>Barcode value<input aria-label="Generated barcode value" value={selected.text || selected.target || ""} maxLength={80} onChange={(event) => patchSelected({ text: event.target.value, target: event.target.value }, { barcodeSource: "manual", barcodeValue: event.target.value })} /></label>
              </>}
            </section>}
            {selected.type === "qr_code" && <StudioQrProperties element={selected} onChange={(changes, styleChanges) => patchSelected(changes, styleChanges)} />}
            {selected.type === "line" && <section className={styles.cardProperties}>
              <div><strong>Line</strong><small>Adjust the thickness, colour, and appearance of this line. Resize or rotate it directly on the page.</small></div>
              <label>Line thickness<input aria-label="Line thickness" type="range" min="1" max="40" step="1" value={Number(selected.style.lineThickness || 4)} onChange={(event) => patchSelected({}, { lineThickness: Number(event.target.value) })} /><span>{Number(selected.style.lineThickness || 4)} px</span></label>
              <div className={styles.propertyGrid}>
                <label>Line colour<input aria-label="Line colour" type="color" value={String(selected.style.lineColor || selected.style.color || "#126B3A").slice(0, 7)} onChange={(event) => patchSelected({}, { lineColor: event.target.value.toUpperCase(), color: event.target.value.toUpperCase() })} /></label>
                <label>Line style<select aria-label="Line style" value={String(selected.style.lineStyle || "solid")} onChange={(event) => patchSelected({}, { lineStyle: event.target.value })}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
              </div>
            </section>}
            {selected.type === "text" || selected.type === "button" ? <label>Text<textarea rows={3} value={selected.text || ""} onChange={(event) => patchSelected({ text: event.target.value })} /></label> : null}
            {selected.type === "table" && <><button type="button" className={styles.editTableProductsButton} onClick={() => void editErpTableProducts()}>Edit products</button><StudioTableProperties element={selected} onElementChange={(changes) => patchSelected(changes)} onStyleChange={(changes) => patchSelected({}, changes)} /></>}
            {["image", "logo", "video", "background"].includes(selected.type) && <section className={styles.cardProperties}>
              <div><strong>{selected.type === "logo" ? "Logo media" : selected.type === "video" ? "Video media" : "Element media"}</strong><small>{selected.type === "video" ? "Drop a video here, browse for one, or choose an existing Studio video. It is saved and autosaved with this element." : "Choose an existing upload or add a new file. The selected media is saved with this element."}</small></div>
              <label>Media Library<select value={selected.assetId || ""} onChange={(event) => { const asset = assets.find((item) => item.id === event.target.value); if (asset && asset.mime_type.startsWith("image/")) updateElement(mediaImageGridCell(selected, asset)); else patchSelected({ assetId: asset?.id || null, ...(asset ? { name: asset.alt_text || asset.original_filename } : {}) }, asset ? { objectFit: "contain", sourceMimeType: asset.mime_type, sourceFileName: asset.original_filename, cropZoom: 100, cropX: 50, cropY: 50 } : {}); }}><option value="">No media selected</option>{assets.filter((asset) => selected.type === "video" ? asset.mime_type.startsWith("video/") : asset.mime_type.startsWith("image/")).map((asset) => <option key={asset.id} value={asset.id}>{asset.original_filename}</option>)}</select></label>
              <label
                className={`${styles.uploadProductImage} ${selected.type === "video" ? styles.elementVideoDropZone : ""}`}
                data-dragging={elementAssetDragActive}
                aria-label={selected.type === "video" ? "Drop or upload video" : `Upload ${selected.type === "logo" ? "logo" : "media"}`}
                onDragEnter={(event) => { event.preventDefault(); if (selected.type === "video") setElementAssetDragActive(true); }}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setElementAssetDragActive(false); }}
                onDrop={(event) => { event.preventDefault(); event.stopPropagation(); setElementAssetDragActive(false); const file = Array.from(event.dataTransfer.files || [])[0]; void uploadSelectedElementAsset(file, selected.id); }}
              >
                {elementAssetUploading ? <strong>Uploading video…</strong> : selected.type === "video" ? <><strong>Drop MP4 or WebM here</strong><span>or click to browse · maximum 100 MB</span>{selected.assetId && <small>Attached: {String(selected.style.sourceFileName || selected.name)}</small>}</> : `+ Upload ${selected.type === "logo" ? "logo" : "media"}`}
                <input aria-label={selected.type === "video" ? "Choose video file" : undefined} type="file" accept={selected.type === "video" ? "video/mp4,video/webm,.mp4,.webm" : "image/png,image/jpeg,image/webp"} disabled={elementAssetUploading} onChange={(event) => { const file=event.target.files?.[0]; event.target.value=""; void uploadSelectedElementAsset(file, selected.id); }} />
              </label>
            </section>}
            {["image", "logo", "background"].includes(selected.type) && <section className={styles.cardProperties}>
              <div><strong>Crop and image tools</strong><small>Adjust the image inside its frame without changing the original ERP or uploaded file.</small></div>
              <label>Crop zoom<input aria-label="Crop zoom" type="range" min="100" max="400" step="5" value={Number(selected.style.cropZoom ?? 100)} onChange={(event) => patchSelected({}, { cropZoom: Number(event.target.value) })} /><span>{Math.round(Number(selected.style.cropZoom ?? 100))}%</span></label>
              <div className={styles.propertyGrid}><label>Horizontal crop<input aria-label="Horizontal crop" type="range" min="0" max="100" value={Number(selected.style.cropX ?? 50)} onChange={(event) => patchSelected({}, { cropX: Number(event.target.value) })} /><span>{Math.round(Number(selected.style.cropX ?? 50))}%</span></label><label>Vertical crop<input aria-label="Vertical crop" type="range" min="0" max="100" value={Number(selected.style.cropY ?? 50)} onChange={(event) => patchSelected({}, { cropY: Number(event.target.value) })} /><span>{Math.round(Number(selected.style.cropY ?? 50))}%</span></label></div>
              <div className={styles.imageToolActions}>
                <button type="button" aria-pressed={cropModeElementId === selected.id} onClick={() => { setSelectionMode(false); setCropModeElementId((current) => current === selected.id ? null : selected.id); }}>{cropModeElementId === selected.id ? "Finish cropping" : "Drag to crop"}</button>
                <button type="button" onClick={() => patchSelected({}, { imageRotation: (Number(selected.style.imageRotation || 0) + 270) % 360 })} aria-label="Rotate image left">↶ Rotate left</button>
                <button type="button" onClick={() => patchSelected({}, { imageRotation: (Number(selected.style.imageRotation || 0) + 90) % 360 })} aria-label="Rotate image right">↷ Rotate right</button>
                <button type="button" aria-pressed={selected.style.flipX === true} onClick={() => patchSelected({}, { flipX: selected.style.flipX !== true })}>↔ Flip horizontal</button>
                <button type="button" aria-pressed={selected.style.flipY === true} onClick={() => patchSelected({}, { flipY: selected.style.flipY !== true })}>↕ Flip vertical</button>
                <button type="button" onClick={() => patchSelected({}, { objectFit: "cover", cropZoom: 100, cropX: 50, cropY: 50 })}>Fill frame</button>
                <button type="button" onClick={() => patchSelected({}, { objectFit: "contain", cropZoom: 100, cropX: 50, cropY: 50, imageRotation: 0, flipX: false, flipY: false })}>Reset image</button>
              </div>
            </section>}
            {selected.type === "product_card" && <section className={styles.cardProperties}>
              <div><strong>Product card design</strong><small>Every setting is saved with this card and used in preview and export.</small></div>
              {selected.templateId&&<div className={styles.templateInstanceNotice}><span>Template v{String(selected.style.templateVersion||1)}</span><strong>{String((selected.responsive.productCardTemplate as {name?:string}|undefined)?.name||"Reusable Product Card")}</strong><small>This is an independent card instance; later template changes will not overwrite it.</small></div>}
              <label>Assigned product<select value={selected.productId||""} onChange={event=>assignProductToSelectedCard(event.target.value)}><option value="">Select an active ERP product</option>{products.map(product=><option key={product.id} value={product.id}>{product.display_name||product.erp_name} · {product.sku}</option>)}</select></label>
              <fieldset className={styles.cardPropertyGroup}><legend>Size and Position</legend><div className={styles.propertyGrid}><label>Width (px)<input type="number" min={Number(selected.style.minWidth||40)} max={document.canvas.width} value={Math.round(percentToPixels(selected.widthPercent,document.canvas.width))} onChange={event=>resizeSelectedCardPixels(Number(event.target.value),percentToPixels(selected.heightPercent,document.canvas.height),"width")}/></label><label>Height (px)<input type="number" min={Number(selected.style.minHeight||40)} max={document.canvas.height} value={Math.round(percentToPixels(selected.heightPercent,document.canvas.height))} onChange={event=>resizeSelectedCardPixels(percentToPixels(selected.widthPercent,document.canvas.width),Number(event.target.value),"height")}/></label></div><div className={styles.propertyGrid}><label>Width (mm)<input type="number" step="0.1" value={pixelsToMillimeters(percentToPixels(selected.widthPercent,document.canvas.width)).toFixed(1)} onChange={event=>resizeSelectedCardPixels(Number(event.target.value)*96/25.4,percentToPixels(selected.heightPercent,document.canvas.height),"width")}/></label><label>Height (mm)<input type="number" step="0.1" value={pixelsToMillimeters(percentToPixels(selected.heightPercent,document.canvas.height)).toFixed(1)} onChange={event=>resizeSelectedCardPixels(percentToPixels(selected.widthPercent,document.canvas.width),Number(event.target.value)*96/25.4,"height")}/></label></div><div className={styles.propertyGrid}><label>Minimum width<input type="number" min="40" max="3000" value={Number(selected.style.minWidth||80)} onChange={event=>patchSelected({}, {minWidth:Number(event.target.value)})}/></label><label>Minimum height<input type="number" min="40" max="3000" value={Number(selected.style.minHeight||80)} onChange={event=>patchSelected({}, {minHeight:Number(event.target.value)})}/></label></div><label className={styles.inlineCheck}><input type="checkbox" checked={selected.style.lockAspectRatio===true} onChange={event=>patchSelected({}, {lockAspectRatio:event.target.checked})}/> Lock aspect ratio</label><label>Size preset<select defaultValue="" onChange={event=>{if(event.target.value)applySelectedCardPreset(event.target.value as ProductCardSizePreset);event.target.value="";}}><option value="" disabled>Choose preset…</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option><option value="full">Full Width / 1 per page</option><option value="half">Half Page / 2 per page</option><option value="third">One Third Page</option><option value="quarter">One Quarter / 4 per page</option><option value="a4-6">6 per A4 page</option><option value="a4-8">8 per A4 page</option></select></label></fieldset>
              <fieldset className={styles.cardPropertyGroup}><legend>Card Design</legend><label>Layout behavior<select value={String(selected.style.layoutMode||"responsive")} onChange={event=>patchSelected({}, {layoutMode:event.target.value})}><option value="responsive">Responsive — reflow when narrow</option><option value="fixed">Fixed — retain proportions</option><option value="freeform">Freeform — compose with grouped elements</option></select></label><div className={styles.propertyGrid}><label>Internal gap<input type="number" min="0" max="100" value={Number(selected.style.internalGap||8)} onChange={event=>patchSelected({}, {internalGap:Number(event.target.value)})}/></label><label>Image area %<input type="number" min="10" max="90" value={Number(selected.style.imageAreaRatio||48)} onChange={event=>patchSelected({}, {imageAreaRatio:Number(event.target.value),productImageHeight:Number(event.target.value)})}/></label></div><label>Border style<select value={String(selected.style.borderStyle||"solid")} onChange={event=>patchSelected({}, {borderStyle:event.target.value})}><option>solid</option><option>dashed</option><option>dotted</option><option>double</option><option>none</option></select></label><label>Overflow<select value={String(selected.style.overflowBehavior||"hidden")} onChange={event=>patchSelected({}, {overflowBehavior:event.target.value})}><option value="hidden">Clip inside card</option><option value="visible">Allow overflow</option></select></label>{selected.templateId&&<button type="button" onClick={resetSelectedCardToTemplate}>Reset to Template Default</button>}</fieldset>
              <label>Layout<select value={String(selected.style.cardLayout || "classic")} onChange={(event) => {
                const layout = event.target.value;
                if (layout === "erp_detail") {
                  patchSelected(
                    { widthPercent: Math.max(selected.widthPercent, 62), heightPercent: Math.max(selected.heightPercent, 38) },
                    { cardLayout: layout, backgroundColor: "#FFFFFF", borderRadius: 40, borderWidth: 0, shadowBlur: 16, cardPadding: 12, detailAccentColor: selected.style.detailAccentColor || "#F9A83B", showProductSku: true, showProductBarcode: true, showProductStock: true },
                  );
                  return;
                }
                patchSelected({}, { cardLayout: layout });
              }}><option value="classic">Image above</option><option value="image_left">Image left</option><option value="erp_detail">ERP detail table</option><option value="minimal">Minimal</option><option value="image_only">Image only</option></select></label>
              <div className={styles.cardTemplatePropertyActions}>{canCreateCardTemplates&&<button type="button" onClick={()=>void saveSelectedCardAsTemplate()}>Save as Product Card Template</button>}{selectedIds.filter(id=>document.elements.find(item=>item.id===id)?.type==="product_card").length>1&&<button type="button" onClick={autoLayoutSelectedCards}>Auto Layout selected cards</button>}</div>
              <label>Product name<textarea rows={2} value={String(selected.style.productName || "")} onChange={(event) => patchSelected({}, { productName: event.target.value, useErpName: false })} /></label>
              {canEditCardPrices&&<><label>Price display<select value={String(selected.style.priceMode || (selected.style.showProductPrice===false?"no_price":selected.style.showSecondaryPrice===true?"two_prices":"one_price"))} onChange={event=>{const mode=event.target.value;patchSelected({}, {priceMode:mode,showProductPrice:mode!=="no_price",showSecondaryPrice:mode==="two_prices"});}}><option value="one_price">One Price</option><option value="two_prices">Two Prices</option><option value="no_price">No Price</option></select></label>
              {selected.productId&&<div className={styles.productCardPriceSource}><span><strong>ERP price selection</strong><small>{selected.style.primaryPriceListCode ? `Primary: ${String(selected.style.primaryPriceCustomerLevel || "ERP price")} · ${String(selected.style.primaryPriceListCode)}` : "Choose the customer level and ERP price list used by this card."}{selected.style.secondaryPriceListCode ? ` · Second: ${String(selected.style.secondaryPriceCustomerLevel || "ERP price")} · ${String(selected.style.secondaryPriceListCode)}` : ""}</small></span><button type="button" onClick={()=>{setPriceTabProductId(selected.productId||"");setLeftTab("prices");}}>Choose from price list</button></div>}
              {selected.style.priceMode!=="no_price"&&<label>Primary price<input value={String(selected.style.productPrice || "")} onChange={(event) => patchSelected({}, { productPrice: event.target.value, useErpPrice: false })} /></label>}
              {selected.style.showSecondaryPrice===true&&<label>Secondary price<input value={String(selected.style.productSecondaryPrice || "")} onChange={(event) => patchSelected({}, { productSecondaryPrice: event.target.value, useErpPrice: false })} /></label>}</>}
              <div className={styles.propertyGrid}><label>Brand<input value={String(selected.style.productBrand || "")} onChange={(event) => patchSelected({}, { productBrand: event.target.value, useErpBrand: false })} /></label><label>SKU<input value={String(selected.style.productSku || "")} onChange={(event) => patchSelected({}, { productSku: event.target.value, useErpSku: false })} /></label></div>
              <div className={styles.propertyGrid}><label>Category<input value={String(selected.style.productCategory || "")} onChange={(event) => patchSelected({}, { productCategory: event.target.value, useErpCategory: false })} /></label>{canViewCardBarcode&&<label>Barcode<input value={String(selected.style.productBarcode || "")} onChange={(event) => patchSelected({}, { productBarcode: event.target.value, useErpBarcode: false })} /></label>}</div>
              {canViewCardStock&&<div className={styles.propertyGrid}><label>Stock<input type="number" value={String(selected.style.productStock ?? "")} onChange={(event) => patchSelected({}, { productStock: event.target.value, useErpStock: false })} /></label></div>}
              <label>Description<textarea rows={3} value={String(selected.style.productDescription || "")} onChange={(event) => patchSelected({}, { productDescription: event.target.value, useErpDescription: false })} /></label>
              {selected.style.cardLayout === "erp_detail" && <><div className={styles.propertyGrid}><label>Pack size<input value={String(selected.style.productPackSize ?? "")} onChange={(event) => patchSelected({}, { productPackSize: event.target.value })} /></label><label>Unit<input value={String(selected.style.productUnit || "")} onChange={(event) => patchSelected({}, { productUnit: event.target.value })} /></label></div><label>Additional note<input value={String(selected.style.productRemark || "")} onChange={(event) => patchSelected({}, { productRemark: event.target.value })} /></label><label>Title band color<input type="color" value={String(selected.style.detailAccentColor || "#F9A83B").slice(0, 7)} onChange={(event) => patchSelected({}, { detailAccentColor: event.target.value.toUpperCase() })} /></label></>}
              <label className={styles.erpBindingToggle}><input type="checkbox" checked={["useErpName","useErpPrice","useErpBrand","useErpSku","useErpCategory","useErpDescription","useErpBarcode","useErpStock"].every((key) => selected.style[key] === true)} onChange={(event) => {
                const enabled=event.target.checked; const next:Record<string,string|number|boolean>={useErpName:enabled,useErpPrice:enabled,useErpBrand:enabled,useErpSku:enabled,useErpCategory:enabled,useErpDescription:enabled,useErpBarcode:enabled,useErpStock:enabled};
                if(enabled&&selectedProduct){next.productName=selectedProduct.display_name||selectedProduct.erp_name;next.productPrice=selectedProduct.price?`${selectedProduct.price_currency} ${selectedProduct.price}`:"";next.productBrand=selectedProduct.brand||"";next.productSku=selectedProduct.sku;next.productCategory=selectedProduct.category||selectedProduct.category_names[0]||"";next.productDescription=selectedProduct.description_en||selectedProduct.description_th||"";next.productBarcode=productBarcodes(selectedProduct).join("\n");next.productStock=selectedProduct.stock_quantity??"";}
                patchSelected({},next);
              }} /> Keep all product details synchronized with ERP</label>
              <div className={styles.toggleGrid}><label><input type="checkbox" checked={selected.style.showProductImage !== false} onChange={(event) => patchSelected({}, { showProductImage: event.target.checked })} /> Image</label><label><input type="checkbox" checked={selected.style.showProductName !== false} onChange={(event) => patchSelected({}, { showProductName: event.target.checked })} /> Name</label>{canEditCardPrices&&<label><input type="checkbox" checked={selected.style.showProductPrice !== false} onChange={(event) => patchSelected({}, { showProductPrice: event.target.checked })} /> Price</label>}<label><input type="checkbox" checked={selected.style.showProductBrand === true} onChange={(event) => patchSelected({}, { showProductBrand: event.target.checked })} /> Brand</label><label><input type="checkbox" checked={selected.style.showProductSku !== false} onChange={(event) => patchSelected({}, { showProductSku: event.target.checked })} /> SKU</label><label><input type="checkbox" checked={selected.style.showProductCategory === true} onChange={(event) => patchSelected({}, { showProductCategory: event.target.checked })} /> Category</label><label><input type="checkbox" checked={selected.style.showProductDescription === true} onChange={(event) => patchSelected({}, { showProductDescription: event.target.checked })} /> Description</label>{canViewCardBarcode&&<label><input type="checkbox" checked={selected.style.showProductBarcode !== false} onChange={(event) => patchSelected({}, { showProductBarcode: event.target.checked })} /> Barcode</label>}{canViewCardStock&&<label><input type="checkbox" checked={selected.style.showProductStock !== false} onChange={(event) => patchSelected({}, { showProductStock: event.target.checked })} /> Stock</label>}</div>
              <div className={styles.productImagePicker}>
                <div><strong>Product images</strong><small>{selectedProduct?.images.length || 0} available from ERP and uploads</small></div>
                <div className={styles.imageNavigation}><button type="button" disabled={!selectedProduct?.images.length} onClick={() => selectProductImage(Number(selected.style.productImageIndex || 0) - 1)} aria-label="Previous product image">{"<"}</button><span>{selectedProduct?.images.length ? `${Number(selected.style.productImageIndex || 0) + 1} / ${selectedProduct.images.length}` : "No image"}</span><button type="button" disabled={!selectedProduct?.images.length} onClick={() => selectProductImage(Number(selected.style.productImageIndex || 0) + 1)} aria-label="Next product image">{">"}</button></div>
                {selectedProduct?.images.length ? <div className={styles.imageThumbnailStrip}>{selectedProduct.images.map((image, index) => <button type="button" key={image.id} data-active={String(selected.style.productImageId || selectedProduct.images[0]?.id) === image.id} onClick={() => selectProductImage(index)} title={image.file_name}><Image unoptimized width={48} height={48} src={`${API_ORIGIN}${image.url}`} alt={image.alt_text || image.file_name} /></button>)}</div> : null}
                <div className={styles.productImageActions}><label className={styles.uploadProductImage}>+ Upload another image<input type="file" accept="image/jpeg,image/png,image/webp" disabled={productImageUploading || erpImagePulling || productImageDeleting} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void uploadCardProductImage(file); }} /></label><button type="button" className={styles.pullErpProductImage} disabled={productImageUploading || erpImagePulling || productImageDeleting || !selected.productId} onClick={() => void pullCardProductImagesFromErp()}>{erpImagePulling ? "Pulling…" : "Pull images from ERP"}</button><button type="button" className={styles.deleteProductImage} disabled={productImageUploading || erpImagePulling || productImageDeleting || !selectedProductImage} onClick={() => void deleteSelectedCardProductImage()}>{productImageDeleting ? "Deleting…" : "Delete selected image"}</button></div>
                {productImageUploading && <small>Uploading and saving to Product Master…</small>}
              </div>
              <div className={styles.propertyGrid}><label>Card padding<input type="number" min="0" max="80" value={Number(selected.style.cardPadding ?? 8)} onChange={(event) => patchSelected({}, { cardPadding: Number(event.target.value) })} /></label><label>Image height %<input type="number" min="10" max="90" value={Number(selected.style.productImageHeight ?? 52)} onChange={(event) => patchSelected({}, { productImageHeight: Number(event.target.value) })} /></label><label>Product image zoom %<input type="number" min="100" max="200" value={Number(selected.style.productImageZoom ?? 120)} onChange={(event) => patchSelected({}, { productImageZoom: Number(event.target.value) })} /></label><label>Product text scale %<input type="number" min="50" max="150" value={Number(selected.style.productTextScale ?? 85)} onChange={(event) => patchSelected({}, { productTextScale: Number(event.target.value) })} /></label></div>
              <div className={styles.propertyGrid}><label>Name size<input type="number" min="8" max="100" value={Number(selected.style.productNameSize ?? 28)} onChange={(event) => patchSelected({}, { productNameSize: Number(event.target.value) })} /></label><label>Name color<input type="color" value={String(selected.style.productNameColor || "#173C29").slice(0, 7)} onChange={(event) => patchSelected({}, { productNameColor: event.target.value.toUpperCase() })} /></label></div>
              <div className={styles.propertyGrid}><label>Price size<input type="number" min="8" max="100" value={Number(selected.style.productPriceSize ?? 24)} onChange={(event) => patchSelected({}, { productPriceSize: Number(event.target.value) })} /></label><label>Price color<input type="color" value={String(selected.style.productPriceColor || "#0E7A43").slice(0, 7)} onChange={(event) => patchSelected({}, { productPriceColor: event.target.value.toUpperCase() })} /></label></div>
            </section>}
            <div className={styles.propertyGrid}><label>X %<input type="number" value={selected.xPercent.toFixed(2)} onChange={(event) => patchSelected({ xPercent: Number(event.target.value) })} /></label><label>Y %<input type="number" value={selected.yPercent.toFixed(2)} onChange={(event) => patchSelected({ yPercent: Number(event.target.value) })} /></label><label>Width %<input type="number" min="1" value={selected.widthPercent.toFixed(2)} onChange={(event) => patchSelected({ widthPercent: Number(event.target.value) })} /></label><label>Height %<input type="number" min="1" value={selected.heightPercent.toFixed(2)} onChange={(event) => patchSelected({ heightPercent: Number(event.target.value) })} /></label></div>
            <label>Rotation<input type="range" min="-180" max="180" value={selected.rotation} onChange={(event) => patchSelected({ rotation: Number(event.target.value) })} /><span>{Math.round(selected.rotation)}°</span></label>
            <label>Opacity<input type="range" min="0" max="1" step=".05" value={selected.opacity} onChange={(event) => patchSelected({ opacity: Number(event.target.value) })} /></label>
            <div className={styles.propertyGrid}><label>Font<select value={String(selected.style.fontFamily || "Arial")} onChange={(event) => patchSelected({}, { fontFamily: event.target.value })}><option>Arial</option><option>Tahoma</option><option>Georgia</option><option>Verdana</option></select></label><label>Font size<input type="number" min="6" max="500" value={Number(selected.style.fontSize || 24)} onChange={(event) => patchSelected({}, { fontSize: Number(event.target.value) })} /></label></div>
            <div className={styles.textStyleActions} role="group" aria-label="Text style"><button type="button" aria-pressed={selected.style.fontWeight === "bold"} onClick={() => patchSelected({}, { fontWeight: selected.style.fontWeight === "bold" ? "normal" : "bold" })}><strong>B</strong> Bold</button><button type="button" aria-pressed={selected.style.fontStyle === "italic"} onClick={() => patchSelected({}, { fontStyle: selected.style.fontStyle === "italic" ? "normal" : "italic" })}><em>I</em> Italic</button></div>
            <label>Text color<div className={styles.colorRow}><input aria-label="Text color" type="color" value={String(selected.style.color || "#17251F").slice(0, 7)} onChange={(event) => { const color = event.target.value.toUpperCase(); patchSelected({}, selected.type === "table" ? { color, tableHeaderTextColor: color } : { color }); }} /><select value={String(selected.style.textAlign || "left")} onChange={(event) => patchSelected({}, { textAlign: event.target.value })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justify</option></select></div></label>
            <label>Background / HEX<div className={styles.colorRow}><input type="color" value={String(selected.style.backgroundColor || "#FFFFFF").slice(0, 7)} onChange={(event) => { patchSelected({}, { backgroundColor: event.target.value.toUpperCase() }); setRgb565Input(formatRgb565(rgbToRgb565(hexToRgb(event.target.value)))); }} /><input value={String(selected.style.backgroundColor || "#FFFFFF")} onChange={(event) => patchSelected({}, { backgroundColor: event.target.value })} /></div></label>
            <label>RGB565<input value={rgb565Input} onChange={(event) => applyRgb565(event.target.value)} /><small>{String(selected.style.backgroundColor || "#FFFFFF")} · {rgb565Input}</small></label>
            <label>RGB (0-255)<input value={rgbInput} onChange={(event) => applyRgb(event.target.value)} placeholder="255, 255, 255" /></label>
            <label>HSL (H, S%, L%)<input value={hslInput} onChange={(event) => applyHsl(event.target.value)} placeholder="120, 50, 40" /></label>
            <label>Corner radius<input type="range" min="0" max="100" value={Number(selected.style.borderRadius || 0)} onChange={(event) => patchSelected({}, { borderRadius: Number(event.target.value) })} /><span>{Number(selected.style.borderRadius || 0)} px</span></label>
            <div className={styles.propertyGrid}><label>Border width<input type="number" min="0" max="100" value={Number(selected.style.borderWidth || 0)} onChange={(event) => patchSelected({}, { borderWidth: Number(event.target.value) })} /></label><label>Border color<input type="color" value={String(selected.style.borderColor || "#BDD0C4").slice(0, 7)} onChange={(event) => patchSelected({}, { borderColor: event.target.value.toUpperCase() })} /></label></div>
            <div className={styles.shadowControls}>
              <label>Shadow<input aria-label="Shadow blur" type="range" min="0" max="60" value={Number(selected.style.shadowBlur || 0)} onChange={(event) => patchSelected({}, { shadowBlur: Number(event.target.value) })} /><span>{Number(selected.style.shadowBlur || 0)} px</span></label>
              {Number(selected.style.shadowBlur || 0) > 0 && <>
                <div className={styles.propertyGrid}><label>Horizontal offset<input type="number" min="-100" max="100" value={Number(selected.style.shadowOffsetX || 0)} onChange={(event) => patchSelected({}, { shadowOffsetX: Number(event.target.value) })} /></label><label>Vertical offset<input type="number" min="-100" max="100" value={Number(selected.style.shadowOffsetY ?? 3)} onChange={(event) => patchSelected({}, { shadowOffsetY: Number(event.target.value) })} /></label></div>
                <div className={styles.propertyGrid}><label>Shadow color<input aria-label="Shadow color" type="color" value={String(selected.style.shadowColor || "#0B3E25").slice(0, 7)} onChange={(event) => patchSelected({}, { shadowColor: event.target.value.toUpperCase() })} /></label><label>Shadow opacity<input aria-label="Shadow opacity" type="range" min="0" max="100" value={Number(selected.style.shadowOpacity ?? 22)} onChange={(event) => patchSelected({}, { shadowOpacity: Number(event.target.value) })} /><span>{Number(selected.style.shadowOpacity ?? 22)}%</span></label></div>
                <button type="button" onClick={() => patchSelected({}, { shadowBlur: 0 })}>Remove shadow</button>
              </>}
            </div>
            <label>Image fit<select value={String(selected.style.objectFit || "contain")} onChange={(event) => patchSelected({}, { objectFit: event.target.value })}><option>contain</option><option>cover</option><option>fill</option><option>original</option></select></label>
            <label>Data binding<input value={selected.binding || ""} placeholder="{{product.name_en}}" onChange={(event) => patchSelected({ binding: event.target.value })} /></label>
            <div className={styles.toggleGrid}><label><input type="checkbox" checked={selected.locked} onChange={(event) => patchSelected({ locked: event.target.checked })} /> Locked</label><label><input type="checkbox" checked={selected.visible} onChange={(event) => patchSelected({ visible: event.target.checked })} /> Visible</label></div>
            <div className={styles.toggleGrid}><label><input type="checkbox" checked={isResponsiveHidden("mobile")} onChange={(event) => patchResponsive("mobile", event.target.checked)} /> Hide mobile</label><label><input type="checkbox" checked={isResponsiveHidden("pdf")} onChange={(event) => patchResponsive("pdf", event.target.checked)} /> Hide PDF</label><label><input type="checkbox" checked={isResponsiveHidden("print")} onChange={(event) => patchResponsive("print", event.target.checked)} /> Hide print</label></div>
            <div className={styles.layerActions}><button onClick={() => patchSelected({ zIndex: Math.max(...document.elements.map((item) => item.zIndex), 0) + 1 })}>To front</button><button onClick={() => patchSelected({ zIndex: Math.min(...document.elements.map((item) => item.zIndex), 0) - 1 })}>To back</button><button onClick={() => alignSelected("left")}>Left</button><button onClick={() => alignSelected("center")}>Center</button><button onClick={() => alignSelected("right")}>Right</button><button onClick={() => alignSelected("top")}>Top</button><button onClick={() => alignSelected("middle")}>Middle</button><button onClick={() => alignSelected("bottom")}>Bottom</button><button onClick={() => distributeSelected("horizontal")} disabled={selectedIds.length < 3}>Distribute H</button><button onClick={() => distributeSelected("vertical")} disabled={selectedIds.length < 3}>Distribute V</button><button onClick={groupSelected} disabled={selectedIds.length < 2} title={selectedIds.length < 2 ? "Select at least two parts before grouping" : "Group selected parts"}>Group</button><button onClick={ungroupSelected} disabled={!document.elements.some((item) => selectedIds.includes(item.id) && item.groupId)}>Ungroup</button><button onClick={duplicateSelected}>Duplicate</button><button onClick={deleteSelected} disabled={selected.type === "image_carousel" && !canDeleteCarousels}>Delete</button></div>
          </div>}
          <details className={styles.pageProperties} key={`${selected?.id || "page"}:${leftTab}`} {...(!selected || leftTab === "pages" ? { open: true } : {})}>
            <summary><span>Page settings</span><small>{activePage?.page_name}</small></summary>
            <div>
              {activePage && canManagePages && <div className={styles.propertyForm}>
                <label>Page name<input aria-label="Rename selected page" defaultValue={activePage.page_name} key={`${activePage.id}-name`} onBlur={(event) => { const value = event.target.value.trim(); if (value && value !== activePage.page_name) void patchPage({ page_name: value }); }} /></label>
                <div className={styles.toggleGrid}><label><input type="checkbox" checked={activePage.is_visible} onChange={(event) => void patchPage({ is_visible: event.target.checked })} /> Visible</label><label><input type="checkbox" checked={activePage.is_locked} onChange={(event) => void patchPage({ is_locked: event.target.checked })} /> Locked</label></div>
                <div className={styles.propertyGrid}>
                  <label>Canvas width<input aria-label="Canvas width" type="number" min="200" max="10000" defaultValue={activePage.width} key={`${activePage.id}-${activePage.width}-width`} onBlur={(event) => { const width = Math.max(200, Math.min(10000, Number(event.target.value) || activePage.width)); if (width !== activePage.width) void patchPage({ width, orientation: width > activePage.height ? "landscape" : width < activePage.height ? "portrait" : "square" }); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
                  <label>Canvas height<input aria-label="Canvas height" type="number" min="200" max="10000" defaultValue={activePage.height} key={`${activePage.id}-${activePage.height}-height`} onBlur={(event) => { const height = Math.max(200, Math.min(10000, Number(event.target.value) || activePage.height)); if (height !== activePage.height) void patchPage({ height, orientation: activePage.width > height ? "landscape" : activePage.width < height ? "portrait" : "square" }); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>
                </div>
                <small>The canvas can be any size. Print and PDF output scale the complete design to exact A4 portrait or landscape.</small>
                <button type="button" onClick={() => void patchPage({ width: activePage.height, height: activePage.width, orientation: activePage.width > activePage.height ? "portrait" : "landscape" })}>Rotate canvas orientation</button>
              </div>}
              <label className={styles.pageColor}>Background<input type="color" value={document.canvas.backgroundColor.slice(0, 7)} onChange={(event: ChangeEvent<HTMLInputElement>) => commit({ ...document, canvas: { ...document.canvas, backgroundColor: event.target.value.toUpperCase() } })} /></label>
              <label className={styles.inlineCheck}><input type="checkbox" checked={document.canvas.showGrid} onChange={(event) => commit({ ...document, canvas: { ...document.canvas, showGrid: event.target.checked } })} /> Show measurement grid</label>
              {document.canvas.showGrid && <label>Grid spacing (px)<input aria-label="Grid spacing in pixels" type="number" min="5" max="500" step="5" value={document.canvas.gridSize} onChange={(event) => commit({ ...document, canvas: { ...document.canvas, gridSize: Math.max(5, Math.min(500, Number(event.target.value) || 10)) } })} /><small>Select two separated elements to display their exact gap.</small></label>}
              <label className={styles.inlineCheck}><input type="checkbox" checked={document.canvas.showSafeArea} onChange={(event) => commit({ ...document, canvas: { ...document.canvas, showSafeArea: event.target.checked } })} /> Safe print area</label>
            </div>
          </details>
        </aside>
      </section>
    </main>
  );
}
