"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { API_ORIGIN } from "@/lib/api";
import { createStudioExport, createStudioVersion, getStudioDesign, type StudioDesign, type StudioElement, type StudioPage } from "@/lib/studio-api";
import { parseStudioTable, studioTableColumnFractions } from "./studio-table";
import { downloadButtonDesign, downloadButtonPosition, downloadButtonSize } from "./studio-download-button";
import { activeCarouselImages, carouselImageUrl, StudioImageCarousel } from "./studio-image-carousel";
import { startStudioImageDownload } from "./studio-image-download";
import { createStudioQrDataUrl } from "./studio-qr-code";
import { StudioBarcodeGraphic } from "./studio-barcode";
import { NO_PRODUCT_IMAGE_URL } from "@/lib/product-image";
import { CatalogueSidebar, useCatalogueCurrentSection } from "@/components/catalogue-sidebar";
import { useLanguage } from "@/lib/i18n";
import sidebarStyles from "@/components/catalogue-sidebar.module.css";
import styles from "./studio.module.css";

export type CatalogueRenderMode = "desktop" | "tablet" | "mobile" | "booklet" | "pdf" | "print";
export type PreviewImageItem = { id: string; url: string; fileName: string; altText: string };
export type PreviewImageSelection = { title: string; subtitle: string; images: PreviewImageItem[]; index: number };

const getBookletPreviewScale = () => {
  if (typeof window === "undefined") return .66;
  if (window.innerWidth <= 900) return .42;
  if (window.innerWidth <= 1280) return .54;
  return .66;
};

const getBookletFullscreenScale = () =>
  typeof window !== "undefined" && window.innerWidth <= 900 ? .46 : .76;

function previewBackgroundSize(objectFit: unknown) {
  const fit = String(objectFit || "contain");
  if (fit === "fill") return "100% 100%";
  if (fit === "original") return "auto";
  return fit === "cover" ? "cover" : "contain";
}

function previewObjectFit(objectFit: unknown): CSSProperties["objectFit"] {
  const fit = String(objectFit || "contain");
  if (fit === "fill") return "fill";
  if (fit === "cover") return "cover";
  if (fit === "original") return "none";
  return "contain";
}

function productSearchText(element: StudioElement) {
  return [element.name, element.text, element.style.productName, element.style.productSku, element.style.productBrand,
    element.style.productCategory, element.style.productDescription, element.style.productBarcode]
    .map((value) => String(value || "").toLocaleLowerCase()).join(" ");
}

function shadowCss(style: StudioElement["style"]) {
  const blur = Math.max(0, Number(style.shadowBlur || 0));
  if (!blur) return undefined;
  const offsetX = Number(style.shadowOffsetX || 0);
  const offsetY = Number(style.shadowOffsetY ?? 3);
  const opacity = Math.max(0, Math.min(1, Number(style.shadowOpacity ?? 22) / 100));
  const color = String(style.shadowColor || "#0B3E25");
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  const shadowColor = match
    ? `rgba(${parseInt(match[1].slice(0, 2), 16)}, ${parseInt(match[1].slice(2, 4), 16)}, ${parseInt(match[1].slice(4, 6), 16)}, ${opacity})`
    : color;
  return `${offsetX}px ${offsetY}px ${blur}px ${shadowColor}`;
}

function useStudioQrPreviewSource(element: StudioElement) {
  const value = element.type === "qr_code" ? String(element.target || "") : "";
  const foreground = String(element.style.qrForeground || "#111111");
  const background = String(element.style.qrBackground || "#FFFFFF");
  const errorCorrection = String(element.style.qrErrorCorrection || "M");
  const margin = Number(element.style.qrMargin ?? 4);
  const [source, setSource] = useState("");

  useEffect(() => {
    let disposed = false;
    if (!value.trim()) {
      const timer = window.setTimeout(() => setSource(""), 0);
      return () => { disposed = true; window.clearTimeout(timer); };
    }
    void createStudioQrDataUrl(value, { qrForeground: foreground, qrBackground: background, qrErrorCorrection: errorCorrection, qrMargin: margin })
      .then((nextSource) => { if (!disposed) setSource(nextSource); })
      .catch(() => { if (!disposed) setSource(""); });
    return () => { disposed = true; };
  }, [background, errorCorrection, foreground, margin, value]);

  return source;
}

/**
 * Studio product images are protected API resources. A CSS background request
 * does not give the preview a useful error/retry path when the browser has not
 * yet attached the session cookie. Load the image explicitly with credentials
 * and render a local object URL, matching the reliable path used by the editor.
 */
function useProtectedPreviewImage(source: string) {
  const initialStatus = source.startsWith(`${API_ORIGIN}/api/v1/catalogue-studio/`) ? "pending" : "ready";
  const [loadedSource, setLoadedSource] = useState({
    requested: source,
    resolved: source,
    status: initialStatus as "pending" | "ready" | "error",
  });

  useEffect(() => {
    let disposed = false;
    let objectUrl = "";
    const protectedStudioImage = source.startsWith(`${API_ORIGIN}/api/v1/catalogue-studio/`);

    if (!source || !protectedStudioImage || typeof URL.createObjectURL !== "function") {
      return () => { disposed = true; };
    }

    void fetch(source, {
      credentials: "include",
      cache: "force-cache",
      headers: { Accept: "image/*" },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Image request failed (${response.status})`);
        return response.blob();
      })
      .then((blob) => {
        if (disposed || !blob.size || blob.type && !blob.type.startsWith("image/")) return;
        objectUrl = URL.createObjectURL(blob);
        if (!disposed) setLoadedSource({ requested: source, resolved: objectUrl, status: "ready" });
      })
      .catch(() => {
        if (!disposed) setLoadedSource({ requested: source, resolved: source, status: "error" });
      });

    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  // When the requested image changes (for example via carousel arrows), use
  // the new direct URL immediately instead of briefly showing the old image.
  return loadedSource.requested === source
    ? { source: loadedSource.resolved, status: loadedSource.status }
    : { source, status: source.startsWith(`${API_ORIGIN}/api/v1/catalogue-studio/`) ? "pending" as const : "ready" as const };
}

function PreviewElement({ designId, element, pageNumber, mode, onOpenProductImage, previewProductImageSize }: { designId: string; element: StudioElement; pageNumber: number; mode: CatalogueRenderMode; onOpenProductImage: (selection: PreviewImageSelection) => void; previewProductImageSize?: number }) {
  const publicImageUrls = useMemo(() => {
    try {
      const decoded = JSON.parse(String(element.style.publicProductImageUrls || "[]"));
      return Array.isArray(decoded) ? decoded.map(String).filter(Boolean) : [];
    } catch { return []; }
  }, [element.style.publicProductImageUrls]);
  const imageIds = useMemo(() => String(element.style.productImageIds || "").split(",").filter(Boolean), [element.style.productImageIds]);
  const imageCount = publicImageUrls.length || imageIds.length;
  const initialImageIndex = Math.max(0, Math.min(imageCount - 1, Number(element.style.productImageIndex || 0)));
  const [imageIndex, setImageIndex] = useState(initialImageIndex);
  const initialCarouselIndex = Math.max(0, Number(element.carousel?.currentIndex || 0));
  const [carouselIndex, setCarouselIndex] = useState(initialCarouselIndex);
  const qrSource = useStudioQrPreviewSource(element);
  const safeImageIndex = imageIndex >= 0 && imageIndex < imageCount ? imageIndex : initialImageIndex;
  const configuredDownloadButton = downloadButtonPosition(element.style);
  const configuredDownloadButtonSize = downloadButtonSize(element.style);
  const configuredDownloadButtonDesign = downloadButtonDesign(element.style);
  const downloadButtonStyle: CSSProperties = {
    left: `${configuredDownloadButton.xPercent}%`,
    top: `${configuredDownloadButton.yPercent}%`,
    width: `${configuredDownloadButtonSize}px`,
    height: `${configuredDownloadButtonSize}px`,
    fontSize: `${Math.max(17, configuredDownloadButtonSize * .7)}px`,
  };
  const responsive = element.responsive?.[mode];
  // Uploaded Studio assets are protected. Keep their browser request same-origin
  // and let the server route forward the authenticated session to the API. This
  // also avoids cross-origin response handling differences in headless Chrome
  // while producing PDFs.
  // The immutable asset ID is authoritative for files uploaded from the PC.
  // Older saved elements may also contain a direct API URL; preferring that
  // stale URL would bypass the authenticated same-origin proxy during export.
  const assetUrl = typeof element.style.publicAssetUrl === "string"
    ? element.style.publicAssetUrl
    : element.assetId
      ? `/api/catalogue-studio/asset-content?assetId=${encodeURIComponent(element.assetId)}`
      : "";
  const rendersProductImage = ["product_card", "image"].includes(element.type);
  const productImageUrl = typeof element.style.productImageUrl === "string" ? element.style.productImageUrl : "";
  const productImageId = imageIds[safeImageIndex] || (typeof element.style.productImageId === "string" ? element.style.productImageId : "");
  const currentProductImage = rendersProductImage
    ? publicImageUrls[safeImageIndex] || (element.productId
      ? productImageId
        ? `${API_ORIGIN}/api/v1/catalogue-studio/designs/${designId}/products/${element.productId}/images/${productImageId}`
        : `${API_ORIGIN}/api/v1/catalogue-studio/designs/${designId}/products/${element.productId}/primary-image`
      : "")
    : "";
  const configuredProductImage = productImageUrl === NO_PRODUCT_IMAGE_URL ? productImageUrl : productImageUrl.startsWith("http") ? productImageUrl : productImageUrl ? `${API_ORIGIN}${productImageUrl}` : "";
  const resolvedProductImage = rendersProductImage
    ? !productImageId && !productImageUrl && element.productId
      ? NO_PRODUCT_IMAGE_URL
      : currentProductImage || configuredProductImage
    : "";
  // Studio product media is protected by the API bearer token. Load every
  // product image through the authenticated fetch helper and render its local
  // blob URL with a native image element. A direct <img> request cannot attach
  // the authorization header, while next/image `fill` collapses inside some
  // scaled preview cards.
  const productImage = useProtectedPreviewImage(resolvedProductImage);
  const assetImage = useProtectedPreviewImage(element.type === "video" ? "" : assetUrl);
  const renderedProductImage = productImage.source;
  const renderedAssetImage = assetImage.source;
  const mediaState = productImage.status === "error" || assetImage.status === "error"
    ? "error"
    : productImage.status === "pending" || assetImage.status === "pending" ? "pending" : "ready";
  if (!element.visible || responsive && (responsive as { hidden?: boolean }).hidden) return null;
  const productTitle = String(element.style.productName || element.name || "Product image");
  const productSubtitle = [element.style.productSku, element.style.productBrand].filter(Boolean).join(" · ");
  const previewImages: PreviewImageItem[] = publicImageUrls.length
    ? publicImageUrls.map((url, index) => ({ id: `public-${index}`, url, fileName: `${String(element.style.productSku || element.productId || "product")}-image-${index + 1}`, altText: `${productTitle} image ${index + 1}` }))
    : imageIds.length ? imageIds.map((id, index) => ({
      id,
      url: `${API_ORIGIN}/api/v1/catalogue-studio/designs/${designId}/products/${element.productId}/images/${id}`,
      fileName: `${String(element.style.productSku || element.productId || "product")}-image-${index + 1}`,
      altText: `${productTitle} image ${index + 1}`,
    }))
    : resolvedProductImage ? [{ id: "primary", url: resolvedProductImage, fileName: `${String(element.style.productSku || element.productId || "product")}-image-1`, altText: productTitle }] : [];
  const canPreviewProductImage = !["pdf", "print"].includes(mode) && Boolean(element.productId) && ["product_card", "image"].includes(element.type) && previewImages.length > 0;
  const openProductImage = () => {
    if (!canPreviewProductImage) return;
    onOpenProductImage({ title: productTitle, subtitle: productSubtitle, images: previewImages, index: Math.min(safeImageIndex, previewImages.length - 1) });
  };
  const interactiveProductImages = !["pdf", "print"].includes(mode)
    && Boolean(element.productId)
    && ["product_card", "image"].includes(element.type)
    && imageCount > 1;
  const alignment = String(element.style.textAlign || "left");
  const fontWeight = element.style.fontWeight === "bold" ? "bold" : "normal";
  const fontStyle = element.style.fontStyle === "italic" ? "italic" : "normal";
  const standaloneImage = ["image", "logo", "background"].includes(element.type);
  const mediaSource = renderedAssetImage || renderedProductImage;
  const style: CSSProperties = {
    left: `${element.xPercent}%`, top: `${element.yPercent}%`, width: `${element.widthPercent}%`, height: `${element.heightPercent}%`,
    transform: `rotate(${element.rotation}deg)`, opacity: element.opacity, zIndex: element.zIndex,
    backgroundColor: String(element.style.backgroundColor || "transparent"), color: String(element.style.color || "#17251F"),
    borderRadius: `${Number(element.style.borderRadius || 0)}px`, border: `${Number(element.style.borderWidth || 0)}px ${String(element.style.borderStyle || "solid")} ${String(element.style.borderColor || "transparent")}`,
    fontSize: `${Number(element.style.fontSize || 24)}px`, fontFamily: String(element.style.fontFamily || "Arial"), fontWeight, fontStyle,
    // Konva uses a 1× font line box and vertically centers text inside the
    // saved element bounds. Browser `normal` line-height varies by font and
    // shifted bound price labels upward in Chromium PDF exports.
    lineHeight: 1,
    textAlign: alignment as CSSProperties["textAlign"], justifyContent: alignment === "center" ? "center" : alignment === "right" ? "flex-end" : "flex-start",
    boxShadow: shadowCss(element.style), overflow: String(element.style.overflowBehavior || "hidden") as CSSProperties["overflow"],
    // Media is painted only by the dedicated image, carousel, card and video
    // branches below. Product-bound text (especially price fields) may carry
    // image metadata for downloads, but must never display it as a background.
    whiteSpace: "pre-wrap",
  };
  if (element.type === "button") {
    const downloadableImages = publicImageUrls.length
      ? publicImageUrls.map((url, index) => ({ id: `public-${index}`, url, fileName: `${String(element.style.productSku || element.productId || "product")}-image-${index + 1}`, altText: `${productTitle} image ${index + 1}` }))
      : imageIds.map((id, index) => ({
        id,
        url: `${API_ORIGIN}/api/v1/catalogue-studio/designs/${designId}/products/${element.productId}/images/${id}`,
        fileName: `${String(element.style.productSku || element.productId || "product")}-image-${index + 1}`,
        altText: `${productTitle} image ${index + 1}`,
      }));
    if (downloadableImages.length === 0 && element.productId) downloadableImages.push({
      id: "primary",
      url: `${API_ORIGIN}/api/v1/catalogue-studio/designs/${designId}/products/${element.productId}/primary-image`,
      fileName: `${String(element.style.productSku || element.productId)}-image-1`,
      altText: productTitle,
    });
    return <button
      type="button"
      data-studio-element-id={element.id}
      className={`${styles.previewElement} ${styles.standaloneDownloadButton}`}
      style={style}
      aria-label={`Download ${productTitle}`}
      title={downloadableImages.length ? `Download ${productTitle}` : "Bind this download icon to a product image or carousel"}
      disabled={downloadableImages.length === 0}
      onClick={() => downloadableImages.length && onOpenProductImage({ title: productTitle, subtitle: productSubtitle, images: downloadableImages, index: 0 })}
    >{downloadButtonDesign(element.style).glyph}</button>;
  }
  if (element.type === "image_carousel") {
    const carouselImages = activeCarouselImages(element);
    const safeCarouselIndex = Math.max(0, Math.min(Math.max(0, carouselImages.length - 1), carouselIndex));
    const carouselPreviewImages: PreviewImageItem[] = carouselImages.map((image, index) => ({
      id: image.id,
      url: carouselImageUrl(designId, element, image),
      fileName: image.fileName || `${String(element.style.productSku || element.productId || "product")}-image-${index + 1}`,
      altText: image.altText || `${productTitle} image ${index + 1}`,
    }));
    const canPreviewCarouselImage = !["pdf", "print"].includes(mode) && carouselPreviewImages.length > 0;
    return <div className={styles.previewElement} data-studio-carousel="true" style={{ ...style, overflow: element.carousel?.navigation?.arrowPosition === "outside" ? "visible" : "hidden" }}>
      <StudioImageCarousel designId={designId} element={element} mode={mode === "pdf" || mode === "print" ? mode : "preview"} onIndexChange={setCarouselIndex} />
      {canPreviewCarouselImage && <button type="button" className={styles.productImageExpandButton} data-design={configuredDownloadButtonDesign.id} style={downloadButtonStyle} aria-label={`Expand and download ${productTitle}`} title="Expand product image" onClick={() => onOpenProductImage({ title: productTitle, subtitle: productSubtitle, images: carouselPreviewImages, index: safeCarouselIndex })}>{configuredDownloadButtonDesign.glyph}</button>}
    </div>;
  }
  if (standaloneImage && mediaSource) {
    const cropZoom = Math.max(100, Math.min(400, Number(element.style.cropZoom ?? 100)));
    const cropX = Math.max(0, Math.min(100, Number(element.style.cropX ?? 50)));
    const cropY = Math.max(0, Math.min(100, Number(element.style.cropY ?? 50)));
    const imageRotation = Number(element.style.imageRotation || 0);
    return <div data-studio-media-state={mediaState} className={`${styles.previewElement} ${interactiveProductImages ? styles.previewImageElement : ""}`} style={{ ...style, overflow: "hidden" }}>
      <span key={productImageId || mediaSource} aria-hidden="true" className={interactiveProductImages ? styles.productImageTransition : undefined} style={{ position: "absolute", width: `${cropZoom}%`, height: `${cropZoom}%`, left: `${(100 - cropZoom) * cropX / 100}%`, top: `${(100 - cropZoom) * cropY / 100}%`, backgroundImage: `url(${mediaSource})`, backgroundSize: previewBackgroundSize(element.style.objectFit), backgroundPosition: `${cropX}% ${cropY}%`, backgroundRepeat: "no-repeat", transform: `rotate(${imageRotation}deg) scaleX(${element.style.flipX === true ? -1 : 1}) scaleY(${element.style.flipY === true ? -1 : 1})`, transformOrigin: "center" }} />
      {canPreviewProductImage && <button type="button" className={styles.productImageExpandButton} data-design={configuredDownloadButtonDesign.id} style={downloadButtonStyle} aria-label={`Expand and download ${productTitle}`} title="Expand product image" onClick={openProductImage}>{configuredDownloadButtonDesign.glyph}</button>}
      {interactiveProductImages && <><button type="button" className={styles.productImagePrevious} aria-label={`Previous image for ${element.name}`} onClick={() => setImageIndex((safeImageIndex - 1 + imageCount) % imageCount)}>{"<"}</button><button type="button" className={styles.productImageNext} aria-label={`Next image for ${element.name}`} onClick={() => setImageIndex((safeImageIndex + 1) % imageCount)}>{">"}</button><span className={styles.productImageCount}>{safeImageIndex + 1}/{imageCount}</span></>}
    </div>;
  }
  if (element.type === "video") {
    return <div className={styles.previewElement} style={{ ...style, overflow: "hidden", display: "block" }}>
      {assetUrl ? <video src={assetUrl} controls preload="metadata" playsInline crossOrigin="use-credentials" style={{ width: "100%", height: "100%", objectFit: String(element.style.objectFit || "contain") as CSSProperties["objectFit"], background: "#0B1510" }} /> : <span style={{ display: "grid", width: "100%", height: "100%", placeItems: "center" }}>Add a video</span>}
    </div>;
  }
  if (element.type === "line") {
    const thickness = Math.max(1, Number(element.style.lineThickness || 4));
    const lineStyle = ["dashed", "dotted"].includes(String(element.style.lineStyle)) ? String(element.style.lineStyle) : "solid";
    const lineColor = String(element.style.lineColor || element.style.color || "#126B3A");
    return <div
      data-studio-element-id={element.id}
      className={styles.previewElement}
      style={{ ...style, backgroundColor: "transparent", border: 0, boxShadow: "none", overflow: "visible", display: "flex", alignItems: "center" }}
    ><span aria-hidden="true" style={{ width: "100%", borderTop: `${thickness}px ${lineStyle} ${lineColor}` }} /></div>;
  }
  if (element.type === "table") {
    const rows = parseStudioTable(element.text);
    const columnFractions = studioTableColumnFractions(rows);
    const useHeader = element.style.tableHeader !== false;
    const bodyRows = (useHeader ? rows.slice(1) : rows)
      .filter((row) => row.some((cell) => cell.trim().length > 0));
    const visibleRowCount = bodyRows.length + (useHeader ? 1 : 0);
    const rowHeight = `${100 / Math.max(1, visibleRowCount)}%`;
    const gridColor = String(element.style.tableGridColor || "#B9CCC0");
    const cellPadding = `${Number(element.style.tableCellPadding || 8)}px`;
    const borderWidth = element.style.tableShowBorders === false ? 0 : Number(element.style.tableBorderWidth ?? 1);
    const verticalAlign = String(element.style.tableVerticalAlign || "middle") as CSSProperties["verticalAlign"];
    const cellFrame = { borderColor: gridColor, borderWidth: `${borderWidth}px`, padding: cellPadding, verticalAlign };
    const cellFontSize = (cell: string, fraction: number) => {
      const base = Number(element.style.fontSize || 16);
      const relativeCapacity = Math.max(4, fraction * 31);
      return `${Math.max(5, Math.min(base, base * relativeCapacity / Math.max(relativeCapacity, String(cell).length)))}px`;
    };
    return <div className={`${styles.previewElement} ${styles.studioDataTable}`} style={{ ...style, padding: 0, overflow: "visible", border: 0 }}>
      <table aria-label={element.name}>
        <colgroup>{columnFractions.map((fraction, index) => <col key={index} style={{ width: `${fraction * 100}%` }} />)}</colgroup>
        {useHeader && <thead><tr style={{ height: rowHeight }}>{rows[0].map((cell, index) => <th key={index} style={{ ...cellFrame, fontSize: cellFontSize(cell, columnFractions[index]), background: String(element.style.tableHeaderColor || "#126B3A"), color: String(element.style.tableHeaderTextColor || "#FFFFFF") }}>{cell}</th>)}</tr></thead>}
        <tbody>{bodyRows.map((row, rowIndex) => <tr key={rowIndex} style={{ height: rowHeight }}>{row.map((cell, columnIndex) => <td key={columnIndex} style={{ ...cellFrame, fontSize: cellFontSize(cell, columnFractions[columnIndex]), color: String(rows[0]?.[columnIndex] || "").trim().toLowerCase() === "stock" ? String(element.style.tableStockColor || "#16884C") : String(element.style.color || "#17251F"), background: element.style.tableStriped !== false && rowIndex % 2 === 1 ? String(element.style.tableAlternateColor || "#F2F8F4") : String(element.style.tableCellColor || "#FFFFFF") }}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>;
  }
  if (element.type === "qr_code") {
    const showLabel = element.style.qrShowLabel === true && Boolean(String(element.style.qrLabel || "").trim());
    return <div data-studio-media-state={element.target && !qrSource ? "pending" : "ready"} className={styles.previewElement} style={{ ...style, display: "grid", gridTemplateRows: showLabel ? "1fr auto" : "1fr", gap: "4px", padding: "6px", overflow: "hidden" }}>
      {qrSource ? <span aria-label="Generated QR code" role="img" style={{ minHeight: 0, backgroundImage: `url(${qrSource})`, backgroundPosition: "center", backgroundRepeat: "no-repeat", backgroundSize: "contain" }} /> : <span style={{ display: "grid", placeItems: "center", padding: "8px", color: "#60746A", textAlign: "center" }}>{element.target ? "Generating QR code…" : "QR code needs information"}</span>}
      {showLabel && <strong style={{ color: String(element.style.color || "#17251F"), textAlign: "center", fontSize: `${Math.max(9, Number(element.style.fontSize || 16))}px` }}>{String(element.style.qrLabel)}</strong>}
    </div>;
  }
  if (element.type === "product_card") {
    const configuredLayout = String(element.style.cardLayout || "classic");
    const layout = element.style.layoutMode !== "fixed" && configuredLayout === "image_left" && element.widthPercent < 40 ? "classic" : configuredLayout;
    const showImage = element.style.showProductImage !== false && layout !== "minimal";
    const showName = element.style.showProductName !== false && layout !== "image_only";
    const showPrice = element.style.showProductPrice !== false && element.style.priceMode !== "no_price" && layout !== "image_only";
    const showSecondaryPrice = showPrice && element.style.showSecondaryPrice === true;
    const interactiveImages = interactiveProductImages;
    const metaColor = String(element.style.productMetaColor || "#60746A");
    const requestedImageHeight = Number(element.style.productImageHeight ?? 52);
    const safeRequestedImageHeight = Number.isFinite(requestedImageHeight) ? requestedImageHeight : 52;
    // Product cards give photography nearly half the card while retaining a
    // separate copy track for wrapped ERP names, metadata and prices.
    const maximumImageHeight = showName ? 48 : layout === "image_only" ? 90 : 70;
    const productImageHeight = Math.max(20, Math.min(maximumImageHeight, safeRequestedImageHeight));
    const requestedProductImageZoom = Number(element.style.productImageZoom ?? 120);
    const productImageZoom = Number.isFinite(requestedProductImageZoom)
      ? Math.max(100, Math.min(200, requestedProductImageZoom))
      : 120;
    const requestedProductTextScale = Number(element.style.productTextScale ?? 85);
    const productTextScale = Number.isFinite(requestedProductTextScale)
      ? Math.max(50, Math.min(150, requestedProductTextScale))
      : 85;
    // The interactive browser preview can cap product media without mutating
    // the saved editor layout or the dimensions used by PDF rendering.
    const previewProductImageFrameStyle: CSSProperties = previewProductImageSize && layout === "erp_detail" ? {
      width: `min(100%, ${previewProductImageSize}px)`,
      height: `min(100%, ${previewProductImageSize}px)`,
      maxWidth: `${previewProductImageSize}px`,
      maxHeight: `${previewProductImageSize}px`,
      justifySelf: "center",
      alignSelf: "start",
    } : {};
    if (layout === "erp_detail") {
      const accent = String(element.style.detailAccentColor || "#F9A83B");
      const packSize = String(element.style.productPackSize ?? "");
      const unit = String(element.style.productUnit || "");
      const size = [packSize, unit].filter(Boolean).join(" ");
      return <div className={`${styles.previewElement} ${styles.erpDetailCard}`} data-product-card="true" data-studio-media-state={mediaState} style={{ ...style, display: "grid", padding: `${Number(element.style.cardPadding ?? 8)}px` }}>
        <header style={{ backgroundColor: accent }}><strong style={{ fontWeight: element.style.fontWeight ? fontWeight : undefined, fontStyle }}>{String(element.style.productName || "Product")}</strong></header>
        <div className={styles.erpDetailBody}>
          <div className={styles.erpDetailMedia}>
            {size && <b>{size}</b>}
            <div data-preview-product-image="true" className={styles.previewProductImage} style={{ ...previewProductImageFrameStyle, display: showImage ? "block" : "none" }}>
              {/* Native img preserves the card box while displaying the authenticated blob URL. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {renderedProductImage && <img key={renderedProductImage} src={renderedProductImage} alt={productTitle} draggable={false} loading="eager" style={{ objectFit: previewObjectFit(element.style.objectFit) }} />}
              {interactiveImages && <><button type="button" className={styles.productImagePrevious} aria-label={`Previous image for ${String(element.style.productName || element.name)}`} onClick={() => setImageIndex((safeImageIndex - 1 + imageCount) % imageCount)}>{"<"}</button><button type="button" className={styles.productImageNext} aria-label={`Next image for ${String(element.style.productName || element.name)}`} onClick={() => setImageIndex((safeImageIndex + 1) % imageCount)}>{">"}</button><span className={styles.productImageCount}>{safeImageIndex + 1}/{imageCount}</span></>}
            </div>
            <strong>{String(element.style.productSku || "")}</strong>
          </div>
          <table aria-label="ERP product details"><thead><tr><th>Code</th><th>Barcode</th><th>Stock</th></tr></thead><tbody>{String(element.style.productBarcode || "—").split(/\r?\n/).map((barcode, index) => <tr key={`${barcode}-${index}`}><td>{String(element.style.productSku || "—")}</td><td>{barcode}</td><td>{String(element.style.productStock ?? "—")}</td></tr>)}</tbody></table>
        </div>
        <footer><div>{element.style.showProductDescription === true && <span>{String(element.style.productDescription || "")}</span>}{element.style.productRemark && <span>{String(element.style.productRemark)}</span>}</div>{showPrice && <div className={styles.productPriceStack}><strong style={{ backgroundColor: accent }}>{String(element.style.productPrice || "Price unavailable")}</strong>{showSecondaryPrice&&<strong style={{backgroundColor:String(element.style.secondaryPriceColor||"#B42318")}}>{String(element.style.productSecondaryPrice||"")}</strong>}</div>}</footer>
        {canPreviewProductImage && <button type="button" className={styles.productImageExpandButton} data-design={configuredDownloadButtonDesign.id} style={downloadButtonStyle} aria-label={`Expand and download ${productTitle}`} title="Expand product image" onClick={openProductImage}>{configuredDownloadButtonDesign.glyph}</button>}
      </div>;
    }
    return <div className={`${styles.previewElement} ${styles.richProductCard} ${layout === "image_left" ? styles.richProductCardImageLeft : styles.richProductCardImageTop}`} data-product-card="true" data-product-card-layout={layout} data-studio-media-state={mediaState} style={{ ...style, "--product-image-track": showImage ? `${productImageHeight}%` : "0%", padding: `${Number(element.style.cardPadding ?? 8)}px`, display: "grid", gridTemplateColumns: layout === "image_left" ? "46% minmax(0, 1fr)" : "minmax(0, 1fr)", gridTemplateRows: layout === "image_left" ? "minmax(0, 1fr)" : showImage ? `${productImageHeight}% minmax(0, 1fr)` : "minmax(0, 1fr)", gap: "8px" } as CSSProperties}>
      <div data-preview-product-image="true" className={styles.previewProductImage} style={{ ...previewProductImageFrameStyle, display: showImage ? "block" : "none" }}>
        {/* Native img preserves the card box while displaying the authenticated blob URL. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {renderedProductImage && <img key={renderedProductImage} src={renderedProductImage} alt={productTitle} draggable={false} loading="eager" style={{ objectFit: previewObjectFit(element.style.objectFit), transform: `scale(${productImageZoom / 100})`, transformOrigin: "center" }} />}
        {interactiveImages && <><button type="button" className={styles.productImagePrevious} aria-label={`Previous image for ${String(element.style.productName || element.name)}`} onClick={() => setImageIndex((safeImageIndex - 1 + imageCount) % imageCount)}>{"<"}</button><button type="button" className={styles.productImageNext} aria-label={`Next image for ${String(element.style.productName || element.name)}`} onClick={() => setImageIndex((safeImageIndex + 1) % imageCount)}>{">"}</button><span className={styles.productImageCount}>{safeImageIndex + 1}/{imageCount}</span></>}
      </div>
      <div className={styles.previewProductDetails} style={{ display: layout === "image_only" ? "none" : "flex", fontSize: `${productTextScale}%` }}>
        {element.style.showProductCategory === true && element.style.productCategory && <small className={styles.productCategory}>{String(element.style.productCategory)}</small>}
        {element.style.showProductBrand === true && <small style={{ color: metaColor }}>{String(element.style.productBrand || "")}</small>}
        {showName && <strong style={{ color: String(element.style.productNameColor || "#173C29"), fontSize: `${Number(element.style.productNameSize || 28) * productTextScale / 100}px`, whiteSpace: "pre-wrap", fontWeight: element.style.fontWeight ? fontWeight : undefined, fontStyle }}>{String(element.style.productName || "Sample product")}</strong>}
        {element.style.showProductDescription === true && element.style.productDescription && <p>{String(element.style.productDescription)}</p>}
        <div className={styles.productFacts} style={{ color: metaColor }}>
          {element.style.showProductSku !== false && element.style.productSku && <span><b>Code</b>{String(element.style.productSku)}</span>}
          {element.style.showProductBarcode !== false && element.style.productBarcode && <span><b>Barcode</b>{String(element.style.productBarcode)}</span>}
          {element.style.showProductStock !== false && element.style.productStock !== "" && element.style.productStock !== null && element.style.productStock !== undefined && <span><b>Stock</b>{String(element.style.productStock)}</span>}
        </div>
        {showPrice && <span className={styles.productPrice} style={{ color: String(element.style.productPriceColor || "#0E7A43"), fontSize: `${Number(element.style.productPriceSize || 24) * productTextScale / 100}px` }}>{String(element.style.productPrice || "")}</span>}
        {showSecondaryPrice && <span className={styles.productPrice} style={{ color: String(element.style.secondaryPriceColor || "#B42318"), fontSize: `${Number(element.style.secondaryPriceSize || 20)}px` }}>{String(element.style.productSecondaryPrice || "")}</span>}
      </div>
      {canPreviewProductImage && <button type="button" className={styles.productImageExpandButton} data-design={configuredDownloadButtonDesign.id} style={downloadButtonStyle} aria-label={`Expand and download ${productTitle}`} title="Expand product image" onClick={openProductImage}>{configuredDownloadButtonDesign.glyph}</button>}
    </div>;
  }
  if (element.type === "barcode") {
    const value = String(element.text || element.target || element.style.barcodeValue || element.style.productBarcode || "").split(/\r?\n/)[0].trim();
    return <div className={styles.previewElement} style={{ ...style, display: "grid", gridTemplateRows: "1fr auto", gap: "4px", padding: "6px", backgroundColor: String(element.style.backgroundColor || "#FFFFFF") }}>
      {value ? <StudioBarcodeGraphic value={value} color={String(element.style.color || "#111111")} style={{ minHeight: 0 }} /> : <span />}
      <strong style={{ color: String(element.style.color || "#111111"), fontFamily: "Consolas, 'Courier New', monospace", fontSize: `${Math.max(9, Number(element.style.fontSize || 16))}px`, letterSpacing: ".08em", textAlign: "center" }}>{value}</strong>
    </div>;
  }
  // `name` identifies the layer inside the editor. It is not catalogue content,
  // so an empty element must stay empty in previews instead of exposing its
  // internal layer name to customers or exported catalogue viewers.
  const text = element.type === "page_number" ? String(pageNumber) : ["image", "logo"].includes(element.type) && (assetUrl || resolvedProductImage) ? "" : element.text || element.binding || "";
  return <div data-studio-element-id={element.id} className={`${styles.previewElement} ${interactiveProductImages ? styles.previewImageElement : ""}`} style={style}>
    {text}
    {interactiveProductImages && <><button type="button" className={styles.productImagePrevious} aria-label={`Previous image for ${element.name}`} onClick={() => setImageIndex((safeImageIndex - 1 + imageCount) % imageCount)}>{"<"}</button><button type="button" className={styles.productImageNext} aria-label={`Next image for ${element.name}`} onClick={() => setImageIndex((safeImageIndex + 1) % imageCount)}>{">"}</button><span className={styles.productImageCount}>{safeImageIndex + 1}/{imageCount}</span></>}
  </div>;
}

export function CataloguePageRenderer({ designId, page, pageNumber, mode, scale = 1, hiddenProductIds = new Set<string>(), query = "", onOpenProductImage = () => undefined, renderOnly = false, previewProductImageSize, instanceId = "studio-preview-page" }: {
  designId: string;
  page: StudioPage;
  pageNumber: number;
  mode: CatalogueRenderMode;
  scale?: number;
  hiddenProductIds?: Set<string>;
  query?: string;
  onOpenProductImage?: (selection: PreviewImageSelection) => void;
  renderOnly?: boolean;
  previewProductImageSize?: number;
  instanceId?: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const elementHasVisibleProducts = (element: StudioElement) => {
    if (element.type !== "table") return !element.productId || !hiddenProductIds.has(element.productId);

    const tableProductIds = String(element.style.tableProductIds || "")
      .split(",")
      .map((productId) => productId.trim())
      .filter(Boolean);
    const representedProductIds = Array.from(new Set([
      ...tableProductIds,
      ...(element.productId ? [element.productId] : []),
    ]));

    // Multi-product and carousel inventory tables are catalogue content in
    // their own right. Do not remove the whole table just because its original
    // (primary) binding was subsequently hidden; keep it while at least one of
    // the represented products is still active.
    return representedProductIds.length === 0
      || representedProductIds.some((productId) => !hiddenProductIds.has(productId));
  };
  const visibleElements = page.page_data_json.elements.filter((element) =>
    elementHasVisibleProducts(element)
    && (element.type !== "product_card" || !normalizedQuery || productSearchText(element).includes(normalizedQuery))
  );
  const printLandscape = page.width > page.height;
  const printWidthPixels = (printLandscape ? 297 : 210) * 96 / 25.4;
  const printHeightPixels = (printLandscape ? 210 : 297) * 96 / 25.4;
  return <article
    id={`${instanceId}-${page.id}`}
    className={`${styles.previewPage} ${renderOnly ? styles.pdfRenderPage : ""}`}
    data-studio-page-id={page.id}
    data-page-orientation={page.width > page.height ? "landscape" : "portrait"}
    style={{ width: page.width * scale, height: page.height * scale, background: page.page_data_json.canvas.backgroundColor, "--studio-print-scale-x": printWidthPixels / page.width, "--studio-print-scale-y": printHeightPixels / page.height } as CSSProperties}
  ><div className={styles.catalogueLogicalPage} style={{ width: page.width, height: page.height, transform: `scale(${scale})` }}>
    {visibleElements.map((element) => <PreviewElement key={element.id} designId={designId} element={element} pageNumber={pageNumber} mode={mode} onOpenProductImage={onOpenProductImage} previewProductImageSize={previewProductImageSize} />)}
  </div></article>;
}

export function StudioPreview({ designId }: { designId: string }) {
  const { t } = useLanguage();
  const [design, setDesign] = useState<StudioDesign | null>(null);
  const [scale, setScale] = useState(.72);
  const [mode, setMode] = useState<CatalogueRenderMode>("desktop");
  const [loadError, setLoadError] = useState("");
  const [exportState, setExportState] = useState<"idle" | "creating" | "ready" | "failed">("idle");
  const [imagePreview, setImagePreview] = useState<PreviewImageSelection | null>(null);
  const [imagePreviewDownloading, setImagePreviewDownloading] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [bookletPage, setBookletPage] = useState(0);
  const [bookletDragX, setBookletDragX] = useState(0);
  const [bookletDragY, setBookletDragY] = useState(0);
  const [bookletDragAnchorY, setBookletDragAnchorY] = useState(50);
  const [bookletFullscreen, setBookletFullscreen] = useState(false);
  const [bookletMobile, setBookletMobile] = useState(false);
  const latestLoadRequest = useRef(0);
  const activeLoad = useRef<Promise<void> | null>(null);
  const lastLoadedAt = useRef(0);
  const bookletViewer = useRef<HTMLElement | null>(null);
  const bookletDragStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressBookletClick = useRef(false);
  const initialPresentationApplied = useRef(false);

  const loadDesign = useCallback((force = false): Promise<void> => {
    // Focus and visibilitychange commonly fire together. Reuse an active
    // request and briefly suppress duplicate refreshes so large catalogues are
    // not downloaded and rendered twice for one user action.
    if (activeLoad.current) return activeLoad.current;
    if (!force && Date.now() - lastLoadedAt.current < 1_000) return Promise.resolve();
    const requestNumber = ++latestLoadRequest.current;
    const request = getStudioDesign(designId).then((loadedDesign) => {
      if (requestNumber !== latestLoadRequest.current) return;
      setDesign(loadedDesign);
      if (!initialPresentationApplied.current) {
        initialPresentationApplied.current = true;
        if (loadedDesign.catalogue_type === "booklet") {
          setMode("booklet");
          setScale(getBookletPreviewScale());
          setBookletPage(0);
        }
      }
      setLoadError("");
      lastLoadedAt.current = Date.now();
    }).catch((error: unknown) => {
      if (requestNumber !== latestLoadRequest.current) return;
      setLoadError(error instanceof Error && error.message ? error.message : "The catalogue preview could not be loaded.");
    }).finally(() => {
      if (activeLoad.current === request) activeLoad.current = null;
    });
    activeLoad.current = request;
    return request;
  }, [designId]);

  function retryLoad() {
    setLoadError("");
    void loadDesign();
  }

  useEffect(() => { void loadDesign(true); }, [loadDesign]);
  useEffect(() => {
    const update = () => setBookletMobile(window.innerWidth <= 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadDesign(true);
    }, 180_000);
    return () => window.clearInterval(timer);
  }, [loadDesign]);
  useEffect(() => {
    const refreshKey = `catalogue-studio-preview-refresh:${designId}`;
    const refreshFromEditor = (event: StorageEvent) => {
      if (event.key === refreshKey) void loadDesign(true);
    };
    const refreshOnFocus = () => { void loadDesign(); };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadDesign();
    };
    window.addEventListener("storage", refreshFromEditor);
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("storage", refreshFromEditor);
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [designId, loadDesign]);
  useEffect(() => {
    if (!imagePreview) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [imagePreview]);
  useEffect(() => {
    if (mode !== "booklet") return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return;
      const pageCount = design?.pages.filter((page) => page.is_visible).length || 0;
      const lastSpread = bookletMobile ? Math.max(0, pageCount - 1) : pageCount <= 1 ? 0 : pageCount % 2 === 0 ? pageCount - 1 : pageCount - 2;
      if (event.key === "ArrowLeft") setBookletPage((current) => bookletMobile ? Math.max(0, current - 1) : current <= 1 ? 0 : Math.max(1, current - 2));
      if (event.key === "ArrowRight") setBookletPage((current) => bookletMobile ? Math.min(lastSpread, current + 1) : Math.min(lastSpread, current === 0 ? 1 : current + 2));
      if (event.key === "Home") setBookletPage(0);
      if (event.key === "End") setBookletPage(lastSpread);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bookletMobile, design, mode]);
  useEffect(() => {
    const updateBookletFullscreen = () => {
      const isFullscreen = document.fullscreenElement === bookletViewer.current;
      setBookletFullscreen(isFullscreen);
      if (mode === "booklet") setScale(isFullscreen ? getBookletFullscreenScale() : getBookletPreviewScale());
    };
    document.addEventListener("fullscreenchange", updateBookletFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateBookletFullscreen);
  }, [mode]);

  const navigationSectionIds = useMemo(() => mode === "booklet" ? [] : (design?.pages.filter((page) => page.is_visible) || []).map((page) => `studio-preview-page-${page.id}`), [design, mode]);
  const [currentSection, setCurrentSection] = useCatalogueCurrentSection(navigationSectionIds);

  async function downloadSelectedProductImage() {
    const selected = imagePreview?.images[imagePreview.index];
    if (!selected || imagePreviewDownloading) return;
    setImagePreviewDownloading(true);
    setImagePreviewError("");
    try {
      startStudioImageDownload(selected.url, selected.fileName);
    } catch (error) {
      setImagePreviewError(error instanceof Error ? error.message : "Could not download this product image.");
    } finally {
      setImagePreviewDownloading(false);
    }
  }

  async function createPdf() {
    if (!design || exportState === "creating") return;
    setExportState("creating");
    try {
      const version = await createStudioVersion(design.id, design.revision, "Automatic PDF export snapshot");
      await createStudioExport(design.id, "print_pdf", { include_cover: true }, version.id);
      setExportState("ready");
    } catch {
      setExportState("failed");
    }
  }

  if (loadError) return <main className={styles.studioLoading} role="alert"><h1>Preview unavailable</h1><p>{loadError}</p><button className={styles.primaryAction} type="button" onClick={retryLoad}>Try again</button><Link href="/catalogue-studio">Back to designs</Link></main>;
  if (!design) return <main className={styles.studioLoading} role="status">Preparing accurate preview…</main>;
  const hiddenProductIds = new Set((design.product_items || []).filter((product) => !product.is_visible).map((product) => product.product_id));
  const pages = design.pages.filter((page) => page.is_visible);
  const categories = Array.from(pages.reduce((groups, page, pageIndex) => {
    const name = page.page_data_json.navigationCategory?.trim() || page.page_name || page.page_data_json.name || `Page ${pageIndex + 1}`;
    const existing = groups.get(name) || [];
    existing.push(page);
    groups.set(name, existing);
    return groups;
  }, new Map<string, StudioPage[]>()).entries()).map(([name, categoryPages]) => ({ name, pages: categoryPages }));
  const visibleCategories = categories.filter((category) => category.name.toLocaleLowerCase().includes(categorySearch.trim().toLocaleLowerCase()));
  const bookletLastSpread = bookletMobile ? Math.max(0, pages.length - 1) : pages.length <= 1 ? 0 : pages.length % 2 === 0 ? pages.length - 1 : pages.length - 2;
  const bookletVisiblePages = bookletMobile ? pages.slice(bookletPage, bookletPage + 1) : bookletPage === 0 ? [pages[0]].filter(Boolean) : pages.slice(bookletPage, bookletPage + 2);
  const bookletRenderScale = bookletMobile && typeof window !== "undefined" && bookletVisiblePages[0]
    ? Math.max(.18, Math.min(.9, (window.innerWidth - 8) / bookletVisiblePages[0].width))
    : scale;
  const bookletPageLabel = bookletVisiblePages.length > 1 ? `${bookletPage + 1}–${bookletPage + 2} / ${pages.length}` : `${bookletPage + 1} / ${pages.length}`;
  const bookletDragProgress = Math.min(1, Math.abs(bookletDragX) / 320);
  const previousBookletSpread = () => setBookletPage((current) => bookletMobile ? Math.max(0, current - 1) : current <= 1 ? 0 : Math.max(1, current - 2));
  const nextBookletSpread = () => setBookletPage((current) => bookletMobile ? Math.min(bookletLastSpread, current + 1) : Math.min(bookletLastSpread, current === 0 ? 1 : current + 2));
  const openBookletPage = (pageIndex: number) => setBookletPage(bookletMobile ? pageIndex : pageIndex === 0 ? 0 : pageIndex % 2 === 1 ? pageIndex : pageIndex - 1);
  const toggleBookletFullscreen = () => {
    if (document.fullscreenElement === bookletViewer.current) {
      void document.exitFullscreen?.();
      return;
    }
    void bookletViewer.current?.requestFullscreen?.();
  };
  const startBookletDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const anchorY = bounds.height > 0 ? ((event.clientY - bounds.top) / bounds.height) * 100 : 50;
    bookletDragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setBookletDragAnchorY(Math.max(8, Math.min(92, anchorY)));
    suppressBookletClick.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const moveBookletDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = bookletDragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const horizontalDistance = event.clientX - start.x;
    const verticalDistance = event.clientY - start.y;
    if (Math.abs(horizontalDistance) <= Math.abs(verticalDistance) && Math.abs(horizontalDistance) < 12) return;
    event.preventDefault();
    const limitedDistance = Math.max(-340, Math.min(340, horizontalDistance));
    setBookletDragX(limitedDistance);
    setBookletDragY(Math.max(-90, Math.min(90, verticalDistance)));
    if (Math.abs(limitedDistance) >= 8) suppressBookletClick.current = true;
  };
  const finishBookletDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = bookletDragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const dragDistance = event.clientX - start.x;
    bookletDragStart.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (dragDistance <= -52 && bookletPage < bookletLastSpread) nextBookletSpread();
    else if (dragDistance >= 52 && bookletPage > 0) previousBookletSpread();
    setBookletDragX(0);
    setBookletDragY(0);
  };
  const cancelBookletDrag = () => {
    bookletDragStart.current = null;
    setBookletDragX(0);
    setBookletDragY(0);
  };
  function jumpToPage(pageId: string) {
    setCurrentSection(`studio-preview-page-${pageId}`);
    if (mode === "booklet") {
      const pageIndex = pages.findIndex((page) => page.id === pageId);
      if (pageIndex >= 0) openBookletPage(pageIndex);
      return;
    }
    document.getElementById(`studio-preview-page-${pageId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return <main className={`${styles.preview} ${sidebarStyles.layout}`}>
    <CatalogueSidebar title={design.name} searchLabel={t("Search categories")} searchValue={categorySearch} onSearchChange={setCategorySearch}
      subtitle={t(pages.length === 1 ? "{{count}} page" : "{{count}} pages", { count: pages.length })} navigationLabel={t("Catalogue sections")}
      categories={visibleCategories.map((category) => ({
        id: category.pages[0].id, label: category.name, count: category.pages.length,
        countLabel: t(category.pages.length === 1 ? "{{count}} page" : "{{count}} pages", { count: category.pages.length }),
        active: mode === "booklet" ? category.pages.some((page) => bookletVisiblePages.some((visible) => visible.id === page.id)) : category.pages.some((page) => currentSection === `studio-preview-page-${page.id}`),
        onSelect: () => jumpToPage(category.pages[0].id),
      }))} />
    <div className={sidebarStyles.content}>
    <header className={`${styles.previewToolbar} ${sidebarStyles.scrollToolbar}`}><Link href={`/catalogue-studio/${design.id}/editor`}>← Editor</Link><strong>{design.name}</strong><button type="button" aria-pressed={mode === "mobile"} data-active={mode === "mobile"} onClick={() => { setMode("mobile"); setScale(.42); }}>Mobile</button><button type="button" aria-pressed={mode === "tablet"} data-active={mode === "tablet"} onClick={() => { setMode("tablet"); setScale(.58); }}>Tablet</button><button type="button" aria-pressed={mode === "desktop"} data-active={mode === "desktop"} onClick={() => { setMode("desktop"); setScale(.72); }}>Desktop</button><button type="button" aria-pressed={mode === "booklet"} data-active={mode === "booklet"} onClick={() => { setMode("booklet"); setScale(getBookletPreviewScale()); setBookletPage(0); }}>Booklet</button><button type="button" aria-pressed={mode === "pdf"} data-active={mode === "pdf"} onClick={() => { setMode("pdf"); setScale(.58); }}>PDF preview</button><button type="button" disabled={exportState === "creating"} onClick={() => void createPdf()}>{exportState === "creating" ? "Creating PDF…" : exportState === "failed" ? "Retry PDF" : "Create PDF"}</button><Link href="/catalogue-studio/exports">{exportState === "ready" ? "PDF queued · Downloads" : "Downloads"}</Link></header>
    <div className={`${sidebarStyles.body} ${sidebarStyles.pagedBody}`} data-booklet-mobile={mode === "booklet" && bookletMobile}>

      {mode === "booklet" ? <section ref={bookletViewer} className={styles.bookletViewer} data-mobile-page={bookletMobile} aria-label="Booklet catalogue viewer">
        <div className={styles.bookletStage}>
          <button type="button" className={styles.bookletPrevious} aria-label="Previous booklet page" disabled={bookletPage === 0} onClick={previousBookletSpread}>‹</button>
          <div className={styles.bookletPageTurn} data-cover={bookletPage === 0} data-dragging={bookletDragX !== 0} key={bookletVisiblePages.map((page) => page.id).join("-")} role="group" aria-label="Drag booklet pages left or right to turn" onPointerDown={startBookletDrag} onPointerMove={moveBookletDrag} onPointerUp={finishBookletDrag} onPointerCancel={cancelBookletDrag} onClickCapture={(event) => { if (suppressBookletClick.current) { event.preventDefault(); event.stopPropagation(); suppressBookletClick.current = false; } }} style={{ transform: `translate(${bookletDragX * .035}px, ${bookletDragY * .05}px)` }}>
            {bookletVisiblePages.map((page, spreadIndex) => {
              const turningForward = bookletDragX < 0 && (bookletPage === 0 || spreadIndex === bookletVisiblePages.length - 1);
              const turningBackward = bookletDragX > 0 && bookletPage > 0 && spreadIndex === 0;
              const turning = turningForward || turningBackward;
              const turnAngle = bookletDragProgress * 62 * (turningForward ? -1 : 1);
              const verticalFlex = bookletDragY * -.065;
              const paperCompression = 1 - bookletDragProgress * .16;
              const peelDepth = `${Math.round(10 + bookletDragProgress * 76)}%`;
              const peelShoulder = `${Math.round(2 + bookletDragProgress * 32)}%`;
              const outerCorners = `${Math.round(8 + bookletDragProgress * 34)}px`;
              const behindPageIndex = turningForward
                ? bookletMobile || bookletPage === 0
                  ? bookletPage + 1
                  : bookletPage + spreadIndex + 2
                : bookletMobile
                  ? bookletPage - 1
                  : Math.max(0, bookletPage - 2);
              const behindPage = turning ? pages[behindPageIndex] : undefined;
              return <div className={styles.bookletLeaf} data-side={bookletPage === 0 ? "cover" : spreadIndex === 0 ? "left" : "right"} data-turning={turning} data-turn-direction={turningForward ? "forward" : turningBackward ? "backward" : undefined} key={page.id} style={turning ? { transformOrigin: `${turningForward ? "left" : "right"} ${bookletDragAnchorY}%`, transform: `perspective(1250px) rotateY(${turnAngle}deg) rotateX(${verticalFlex}deg) skewY(${turnAngle * -.04}deg) scaleX(${paperCompression})`, borderRadius: turningForward ? `2px ${outerCorners} ${outerCorners} 2px` : `${outerCorners} 2px 2px ${outerCorners}`, "--booklet-turn-progress": bookletDragProgress * .92, "--booklet-turn-shadow": `${bookletDragProgress * 42}px`, "--booklet-turn-brightness": 1 - bookletDragProgress * .12, "--booklet-curl-y": `${bookletDragAnchorY}%`, "--booklet-peel-depth": peelDepth, "--booklet-peel-shoulder": peelShoulder } as CSSProperties : undefined}>
                {behindPage && <div className={styles.bookletUnderlay} aria-hidden="true"><CataloguePageRenderer designId={design.id} page={behindPage} pageNumber={behindPageIndex + 1} mode="booklet" scale={bookletRenderScale} hiddenProductIds={hiddenProductIds} renderOnly /></div>}
                <div className={styles.bookletSurface}><CataloguePageRenderer designId={design.id} page={page} pageNumber={bookletPage + spreadIndex + 1} mode="booklet" scale={bookletRenderScale} hiddenProductIds={hiddenProductIds} previewProductImageSize={300} onOpenProductImage={(selection) => { setImagePreviewError(""); setImagePreview(selection); }} /></div>
              </div>;
            })}
          </div>
          <button type="button" className={styles.bookletNext} aria-label="Next booklet page" disabled={bookletPage >= bookletLastSpread} onClick={nextBookletSpread}>›</button>
        </div>
        <div className={styles.bookletStatus}><strong>{bookletVisiblePages.map((page) => page.page_name).join(" · ") || `Page ${bookletPage + 1}`}</strong><div><span>{bookletPageLabel}</span><button type="button" onClick={toggleBookletFullscreen}>{bookletFullscreen ? "Exit full screen" : "⛶ Full screen"}</button></div></div>
        <div className={styles.bookletThumbnails} aria-label="Booklet page thumbnails">{pages.map((page, pageIndex) => <div className={styles.bookletThumbnail} role="button" tabIndex={0} key={page.id} data-active={pageIndex === bookletPage || (bookletPage > 0 && pageIndex === bookletPage + 1)} aria-label={`Open page ${pageIndex + 1}: ${page.page_name}`} onClick={() => openBookletPage(pageIndex)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openBookletPage(pageIndex); } }}><CataloguePageRenderer designId={design.id} page={page} pageNumber={pageIndex + 1} mode="booklet" scale={.055} hiddenProductIds={hiddenProductIds} renderOnly /><span>{pageIndex + 1}</span></div>)}</div>
      </section> : <section className={styles.previewPages}>{pages.map((page, pageIndex) => <CataloguePageRenderer key={page.id} designId={design.id} page={page} pageNumber={pageIndex + 1} mode={mode} scale={scale} hiddenProductIds={hiddenProductIds} previewProductImageSize={300} onOpenProductImage={(selection) => { setImagePreviewError(""); setImagePreview(selection); }} />)}</section>}
    </div>
    {imagePreview && <div className={styles.productImageLightboxBackdrop} onMouseDown={() => setImagePreview(null)}>
      <section className={styles.productImageLightbox} role="dialog" aria-modal="true" aria-labelledby="studio-preview-product-image-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>PRODUCT IMAGE</span><h2 id="studio-preview-product-image-title">{imagePreview.title}</h2>{imagePreview.subtitle && <small>{imagePreview.subtitle}</small>}</div><div className={styles.productImageLightboxHeaderActions}><button type="button" className={styles.productImageLightboxDownload} onClick={() => void downloadSelectedProductImage()} disabled={imagePreviewDownloading}>{imagePreviewDownloading ? "Downloading…" : "↓ Download image"}</button><button type="button" className={styles.productImageLightboxClose} aria-label="Close image preview" onClick={() => setImagePreview(null)}>×</button></div></header>
        {imagePreviewError && <div className={styles.productImageLightboxError} role="alert">{imagePreviewError}</div>}
        <div className={styles.productImageLightboxStage}>
          <button type="button" aria-label="Previous full-size product image" disabled={imagePreview.images.length < 2} onClick={() => setImagePreview((current) => current ? { ...current, index: (current.index - 1 + current.images.length) % current.images.length } : current)}>{"<"}</button>
          <Image unoptimized width={1400} height={1000} src={imagePreview.images[imagePreview.index].url} alt={imagePreview.images[imagePreview.index].altText} priority />
          <button type="button" aria-label="Next full-size product image" disabled={imagePreview.images.length < 2} onClick={() => setImagePreview((current) => current ? { ...current, index: (current.index + 1) % current.images.length } : current)}>{">"}</button>
        </div>
        <div className={styles.productImageLightboxMeta}><div><strong>{imagePreview.images[imagePreview.index].fileName}</strong><span>Image {imagePreview.index + 1} of {imagePreview.images.length}</span></div></div>
      </section>
    </div>}
    </div>
  </main>;
}
