"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Group, Image as KonvaImage, Layer, Line, Rect, Stage, Text, Transformer } from "react-konva";
import { API_ORIGIN } from "@/lib/api";
import type { StudioElement, StudioPageDocument } from "@/lib/studio-api";
import { parseStudioTable, studioTableColumnFractions } from "./studio-table";
import { downloadButtonDesign, downloadButtonPosition, downloadButtonSize } from "./studio-download-button";
import { createStudioQrDataUrl } from "./studio-qr-code";
import { NO_PRODUCT_IMAGE_URL } from "@/lib/product-image";

type Props = {
  designId: string;
  document: StudioPageDocument;
  pageNumber: number;
  selectedIds: string[];
  selectionMode: boolean;
  cropModeElementId: string | null;
  interactionMode: "edit" | "preview";
  zoom: number;
  onSelect: (id: string, additive: boolean) => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
  onChange: (element: StudioElement) => void;
  onMoveSelection: (sourceId: string, deltaXPercent: number, deltaYPercent: number) => void;
  onTransformSelection: (elements: StudioElement[]) => void;
  onMoveAcrossPage: (sourceId: string, direction: -1 | 1, deltaXPercent: number) => void;
  canMoveToPreviousPage: boolean;
  canMoveToNextPage: boolean;
  onProductImageStep: (element: StudioElement, direction: -1 | 1) => void;
  onProductImagePreview: (element: StudioElement) => void;
  onElementContextMenu: (elementId: string, clientX: number, clientY: number) => void;
  onStageReady: (stage: Konva.Stage | null) => void;
};

export type CrossPageDropDirection = -1 | 1 | null;

type ElementMeasurement = { axis: "horizontal" | "vertical"; start: number; end: number; cross: number; distance: number };
type SmartGuide = { axis: "vertical" | "horizontal"; position: number };
type DragMeasurements = { bounds: { x: number; y: number; width: number; height: number }; guides: SmartGuide[] };

export function resolveSmartGuides(moving: { x: number; y: number; width: number; height: number }, others: Array<{ x: number; y: number; width: number; height: number }>, canvas: { width: number; height: number }, threshold = 6) {
  const verticalTargets = [0, canvas.width / 2, canvas.width, ...others.flatMap((item) => [item.x, item.x + item.width / 2, item.x + item.width])];
  const horizontalTargets = [0, canvas.height / 2, canvas.height, ...others.flatMap((item) => [item.y, item.y + item.height / 2, item.y + item.height])];
  const movingVertical = [moving.x, moving.x + moving.width / 2, moving.x + moving.width];
  const movingHorizontal = [moving.y, moving.y + moving.height / 2, moving.y + moving.height];
  let snapX = 0, snapY = 0, bestX = threshold + 1, bestY = threshold + 1;
  let verticalGuide: number | null = null, horizontalGuide: number | null = null;
  verticalTargets.forEach((target) => movingVertical.forEach((edge) => { const distance = target - edge; if (Math.abs(distance) < bestX) { bestX = Math.abs(distance); snapX = distance; verticalGuide = target; } }));
  horizontalTargets.forEach((target) => movingHorizontal.forEach((edge) => { const distance = target - edge; if (Math.abs(distance) < bestY) { bestY = Math.abs(distance); snapY = distance; horizontalGuide = target; } }));
  return { x: moving.x + (bestX <= threshold ? snapX : 0), y: moving.y + (bestY <= threshold ? snapY : 0), guides: [
    ...(bestX <= threshold && verticalGuide !== null ? [{ axis: "vertical" as const, position: verticalGuide }] : []),
    ...(bestY <= threshold && horizontalGuide !== null ? [{ axis: "horizontal" as const, position: horizontalGuide }] : []),
  ] };
}

export function resolveElementMeasurements(elements: StudioElement[], canvas: { width: number; height: number }): ElementMeasurement[] {
  if (elements.length !== 2) return [];
  const bounds = elements.map((element) => ({
    left: element.xPercent * canvas.width / 100,
    top: element.yPercent * canvas.height / 100,
    right: (element.xPercent + element.widthPercent) * canvas.width / 100,
    bottom: (element.yPercent + element.heightPercent) * canvas.height / 100,
  }));
  const [first, second] = bounds;
  const measurements: ElementMeasurement[] = [];
  const left = first.right <= second.left ? first : second.right <= first.left ? second : null;
  const right = left === first ? second : left === second ? first : null;
  if (left && right) {
    const start = left.right;
    const end = right.left;
    measurements.push({ axis: "horizontal", start, end, cross: Math.max(left.top, right.top) + 18, distance: end - start });
  }
  const upper = first.bottom <= second.top ? first : second.bottom <= first.top ? second : null;
  const lower = upper === first ? second : upper === second ? first : null;
  if (upper && lower) {
    const start = upper.bottom;
    const end = lower.top;
    measurements.push({ axis: "vertical", start, end, cross: Math.max(upper.left, lower.left) + 18, distance: end - start });
  }
  return measurements;
}

export function resolveCrossPageDropDirection({
  nodeY,
  nodeHeight,
  canvasHeight,
  pointerY,
  canMoveToPreviousPage,
  canMoveToNextPage,
}: {
  nodeY: number;
  nodeHeight: number;
  canvasHeight: number;
  pointerY: number | null;
  canMoveToPreviousPage: boolean;
  canMoveToNextPage: boolean;
}): CrossPageDropDirection {
  // A pointer can stop reporting once it leaves the Konva stage. Treat the
  // inside edge as a real drop zone as well as accepting an element whose
  // bounds have crossed the page. This makes transfer work for small text,
  // large product cards, and multi-selection drags alike.
  const edgeDropZone = Math.max(18, Math.min(56, canvasHeight * .035));
  if (canMoveToPreviousPage && (nodeY < 0 || (pointerY !== null && pointerY <= edgeDropZone))) return -1;
  if (canMoveToNextPage && (nodeY + nodeHeight > canvasHeight || (pointerY !== null && pointerY >= canvasHeight - edgeDropZone))) return 1;
  return null;
}

function elementFill(element: StudioElement) {
  if (element.type === "image_carousel") return element.carousel?.display.backgroundColor || "#FFFFFF";
  const value = element.style.backgroundColor;
  if (typeof value === "string") return value;
  if (element.type === "shape") return "#DDF3E5";
  if (element.type === "product_card") return "#FFFFFF";
  if (["image", "logo", "video", "background"].includes(element.type)) return "#E8EFEA";
  return "transparent";
}

function elementFontStyle(element: StudioElement, forceBold = false) {
  const styles: string[] = [];
  if (forceBold || element.style.fontWeight === "bold") styles.push("bold");
  if (element.style.fontStyle === "italic") styles.push("italic");
  return styles.join(" ") || "normal";
}

type CanvasImageStatus = "idle" | "loading" | "loaded" | "error";

type CanvasImageCacheEntry = {
  image: HTMLImageElement;
  objectUrl?: string;
};

const CANVAS_IMAGE_CACHE_LIMIT = 160;
const canvasImageCache = new Map<string, CanvasImageCacheEntry>();
const canvasImageLoads = new Map<string, Promise<CanvasImageCacheEntry>>();

function rememberCanvasImage(source: string, entry: CanvasImageCacheEntry) {
  const previous = canvasImageCache.get(source);
  if (previous?.objectUrl && previous.objectUrl !== entry.objectUrl) URL.revokeObjectURL(previous.objectUrl);
  canvasImageCache.delete(source);
  canvasImageCache.set(source, entry);
  while (canvasImageCache.size > CANVAS_IMAGE_CACHE_LIMIT) {
    const oldest = canvasImageCache.entries().next().value as [string, CanvasImageCacheEntry] | undefined;
    if (!oldest) break;
    canvasImageCache.delete(oldest[0]);
    if (oldest[1].objectUrl) URL.revokeObjectURL(oldest[1].objectUrl);
  }
}

function decodeCanvasImage(source: string, credentialsRequired = false) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    if (credentialsRequired) image.crossOrigin = "use-credentials";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The browser could not decode this product image."));
    image.src = source;
  });
}

function loadCanvasImage(source: string) {
  const cached = canvasImageCache.get(source);
  if (cached) {
    // Refresh insertion order so frequently used canvas media stays cached.
    canvasImageCache.delete(source);
    canvasImageCache.set(source, cached);
    return Promise.resolve(cached);
  }
  const pending = canvasImageLoads.get(source);
  if (pending) return pending;

  const protectedStudioImage = source.startsWith(`${API_ORIGIN}/api/v1/catalogue-studio/`)
    || source.startsWith("/api/catalogue-studio/");
  const request = (async (): Promise<CanvasImageCacheEntry> => {
    if (!protectedStudioImage) {
      return { image: await decodeCanvasImage(source, source.startsWith("http")) };
    }

    let lastError: unknown = null;
    // Studio media endpoints already support credentialed image requests.
    // Decode the stable URL first so Konva is not dependent on a temporary
    // Blob URL that can disappear during editor autosaves and rerenders.
    try {
      return { image: await decodeCanvasImage(source, true) };
    } catch (error) {
      lastError = error;
    }

    // Blob decoding remains a compatibility fallback for browsers that do
    // not allow credentialed image elements in a canvas.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(source, {
          cache: "default",
          credentials: "include",
          headers: { Accept: "image/*" },
        });
        if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.startsWith("image/")) throw new Error("The media response is not an image.");
        const objectUrl = URL.createObjectURL(blob);
        try {
          return { image: await decodeCanvasImage(objectUrl), objectUrl };
        } catch (error) {
          URL.revokeObjectURL(objectUrl);
          throw error;
        }
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Product image loading failed.");
  })()
    .then((entry) => {
      rememberCanvasImage(source, entry);
      return entry;
    })
    .finally(() => {
      canvasImageLoads.delete(source);
    });
  canvasImageLoads.set(source, request);
  return request;
}

function useCanvasImage(source?: string | null) {
  const resolvedSource = useMemo(() => !source ? "" : /^(https?:|data:|blob:)/i.test(source) || source.startsWith("/api/catalogue-studio/")
    ? source
    : `${API_ORIGIN}${source}`, [source]);
  const [loaded, setLoaded] = useState<{ source: string; image: HTMLImageElement | null; status: CanvasImageStatus }>({ source: "", image: null, status: "idle" });
  const [retryState, setRetryState] = useState<{ source: string; count: number }>({ source: "", count: 0 });
  const retry = retryState.source === resolvedSource ? retryState.count : 0;
  useEffect(() => {
    if (!resolvedSource) {
      const timer = window.setTimeout(() => {
        setLoaded({ source: "", image: null, status: "idle" });
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let disposed = false;
    const cached = canvasImageCache.get(resolvedSource);
    const resetTimer = window.setTimeout(() => {
      if (disposed) return;
      setLoaded({ source: resolvedSource, image: cached?.image || null, status: cached ? "loaded" : "loading" });
    }, 0);
    let retryTimer: number | null = null;

    void loadCanvasImage(resolvedSource)
      .then((entry) => {
        if (disposed) return;
        setLoaded({ source: resolvedSource, image: entry.image, status: "loaded" });
      })
      .catch(() => {
        if (disposed) return;
        setLoaded({ source: resolvedSource, image: null, status: "error" });
        // A session refresh or brief API interruption should repair the image
        // without forcing the user to reload or re-add it.
        if (retry < 4) retryTimer = window.setTimeout(() => setRetryState((current) => ({ source: resolvedSource, count: current.source === resolvedSource ? current.count + 1 : 1 })), 1000 * (retry + 1));
      });

    return () => {
      disposed = true;
      window.clearTimeout(resetTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [resolvedSource, retry]);
  if (loaded.source !== resolvedSource) return { image: null, status: resolvedSource ? "loading" as const : "idle" as const };
  return { image: loaded.image, status: loaded.status };
}

function useStudioQrCanvasImage(element: StudioElement) {
  const value = element.type === "qr_code" ? String(element.target || "") : "";
  const foreground = String(element.style.qrForeground || "#111111");
  const background = String(element.style.qrBackground || "#FFFFFF");
  const errorCorrection = String(element.style.qrErrorCorrection || "M");
  const margin = Number(element.style.qrMargin ?? 4);
  const [source, setSource] = useState("");
  const [generationError, setGenerationError] = useState(false);

  useEffect(() => {
    let disposed = false;
    if (!value.trim()) {
      const timer = window.setTimeout(() => { setSource(""); setGenerationError(false); }, 0);
      return () => { disposed = true; window.clearTimeout(timer); };
    }
    void createStudioQrDataUrl(value, { qrForeground: foreground, qrBackground: background, qrErrorCorrection: errorCorrection, qrMargin: margin })
      .then((nextSource) => { if (!disposed) { setSource(nextSource); setGenerationError(false); } })
      .catch(() => { if (!disposed) { setSource(""); setGenerationError(true); } });
    return () => { disposed = true; };
  }, [background, errorCorrection, foreground, margin, value]);

  return { ...useCanvasImage(source), source, generationError };
}

function fittedImageRect(
  image: HTMLImageElement | null,
  area: { x: number; y: number; width: number; height: number },
  fit: string,
) {
  if (!image) return { ...area };
  if (fit === "fill") return { ...area };
  const scale = fit === "cover"
    ? Math.max(area.width / image.width, area.height / image.height)
    : fit === "original"
      ? 1
      : Math.min(area.width / image.width, area.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2, width, height };
}

function croppedImageRect(
  image: HTMLImageElement | null,
  area: { x: number; y: number; width: number; height: number },
  fit: string,
  style: StudioElement["style"],
) {
  const fitted = fittedImageRect(image, area, fit);
  const zoom = Math.max(1, Math.min(4, Number(style.cropZoom ?? 100) / 100));
  const cropX = Math.max(0, Math.min(100, Number(style.cropX ?? 50))) / 100;
  const cropY = Math.max(0, Math.min(100, Number(style.cropY ?? 50))) / 100;
  const imageWidth = fitted.width * zoom;
  const imageHeight = fitted.height * zoom;
  const left = area.x + (area.width - imageWidth) * cropX;
  const top = area.y + (area.height - imageHeight) * cropY;
  return {
    x: left + imageWidth / 2,
    y: top + imageHeight / 2,
    width: imageWidth,
    height: imageHeight,
    offsetX: imageWidth / 2,
    offsetY: imageHeight / 2,
    rotation: Number(style.imageRotation || 0),
    scaleX: style.flipX === true ? -1 : 1,
    scaleY: style.flipY === true ? -1 : 1,
  };
}

function ProductImageNavigation({
  area,
  currentIndex,
  imageCount,
  onStep,
}: {
  area: { x: number; y: number; width: number; height: number };
  currentIndex: number;
  imageCount: number;
  onStep: (direction: -1 | 1) => void;
}) {
  if (imageCount < 2) return null;
  const size = Math.max(24, Math.min(36, Math.min(area.width, area.height) * .18));
  const y = area.y + (area.height - size) / 2;
  const left = area.x + 6;
  const right = area.x + area.width - size - 6;
  const activate = (direction: -1 | 1) => (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    event.cancelBubble = true;
    onStep(direction);
  };
  return <Group onMouseDown={(event) => { event.cancelBubble = true; }} onTouchStart={(event) => { event.cancelBubble = true; }}>
    <Rect x={left} y={y} width={size} height={size} fill="#FFFFFF" opacity={.96} cornerRadius={size / 2} stroke="#D5E4DA" strokeWidth={1} shadowColor="#173C29" shadowBlur={6} shadowOpacity={.22} onClick={activate(-1)} onTap={activate(-1)} />
    <Text x={left} y={y + size * .04} width={size} height={size * .9} text="<" align="center" verticalAlign="middle" fontSize={size * .72} fontFamily="Arial" fontStyle="bold" fill="#126B3A" listening={false} />
    <Rect x={right} y={y} width={size} height={size} fill="#FFFFFF" opacity={.96} cornerRadius={size / 2} stroke="#D5E4DA" strokeWidth={1} shadowColor="#173C29" shadowBlur={6} shadowOpacity={.22} onClick={activate(1)} onTap={activate(1)} />
    <Text x={right} y={y + size * .04} width={size} height={size * .9} text=">" align="center" verticalAlign="middle" fontSize={size * .72} fontFamily="Arial" fontStyle="bold" fill="#126B3A" listening={false} />
    <Rect x={area.x + area.width / 2 - 18} y={area.y + area.height - 22} width={36} height={17} fill="#123C28" opacity={.82} cornerRadius={9} listening={false} />
    <Text x={area.x + area.width / 2 - 18} y={area.y + area.height - 20} width={36} height={14} text={`${currentIndex + 1}/${imageCount}`} align="center" verticalAlign="middle" fontSize={10} fill="#FFFFFF" listening={false} />
  </Group>;
}

function ProductImagePreviewControl({
  x,
  y,
  frameWidth,
  frameHeight,
  size,
  design,
  draggable,
  onOpen,
  onMove,
}: {
  x: number;
  y: number;
  frameWidth: number;
  frameHeight: number;
  size: number;
  design: ReturnType<typeof downloadButtonDesign>;
  draggable: boolean;
  onOpen: (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onMove: (x: number, y: number) => void;
}) {
  const isSolid = design.id === "double";
  const isMinimal = design.id === "line";
  const cornerRadius = design.id === "tray" ? Math.max(6, size * .24) : size / 2;
  const clampPosition = (target: Konva.Node) => {
    target.position({
      x: Math.max(0, Math.min(Math.max(0, frameWidth - size), target.x())),
      y: Math.max(0, Math.min(Math.max(0, frameHeight - size), target.y())),
    });
  };
  return <Group
    x={x}
    y={y}
    draggable={draggable}
    onMouseDown={(event) => { event.cancelBubble = true; }}
    onTouchStart={(event) => { event.cancelBubble = true; }}
    onDragMove={(event) => { event.cancelBubble = true; clampPosition(event.target); }}
    onDragEnd={(event) => { event.cancelBubble = true; clampPosition(event.target); onMove(event.target.x(), event.target.y()); }}
    onClick={onOpen}
    onTap={onOpen}
  >
    <Rect width={size} height={size} fill={isSolid ? "#126B3A" : "#FFFFFF"} opacity={isMinimal ? .82 : .97} cornerRadius={cornerRadius} stroke={isMinimal ? "transparent" : "#C6D9CC"} strokeWidth={1} shadowColor="#173C29" shadowBlur={isMinimal ? 0 : 7} shadowOpacity={.2} />
    <Text width={size} height={size - 2} text={design.glyph} align="center" verticalAlign="middle" fontSize={Math.max(17, size * .7)} fontFamily="Arial" fontStyle="bold" fill={isSolid ? "#FFFFFF" : "#126B3A"} listening={false} />
  </Group>;
}

function CanvasElement({ designId, element, page, pageNumber, selectionMode, cropMode, interactionMode, showTransformer, onSelect, onChange, onMoveSelection, onMoveAcrossPage, canMoveToPreviousPage, canMoveToNextPage, onDragStart, onDragMove, onDragFinish, onProductImageStep, onProductImagePreview, onElementContextMenu }: {
  designId: string;
  element: StudioElement;
  page: StudioPageDocument;
  pageNumber: number;
  selectionMode: boolean;
  cropMode: boolean;
  interactionMode: "edit" | "preview";
  showTransformer: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onChange: (element: StudioElement) => void;
  onMoveSelection: (sourceId: string, deltaXPercent: number, deltaYPercent: number) => void;
  onMoveAcrossPage: (sourceId: string, direction: -1 | 1, deltaXPercent: number) => void;
  canMoveToPreviousPage: boolean;
  canMoveToNextPage: boolean;
  onDragStart: (sourceId: string) => void;
  onDragMove: (sourceId: string, deltaX: number, deltaY: number) => void;
  onDragFinish: () => void;
  onProductImageStep: (element: StudioElement, direction: -1 | 1) => void;
  onProductImagePreview: (element: StudioElement) => void;
  onElementContextMenu: (elementId: string, clientX: number, clientY: number) => void;
}) {
  const node = useRef<Konva.Group>(null);
  const transformer = useRef<Konva.Transformer>(null);
  const [transformSize,setTransformSize]=useState<{width:number;height:number}|null>(null);
  const standaloneImageNode = useRef<Konva.Image>(null);
  const x = element.xPercent * page.canvas.width / 100;
  const y = element.yPercent * page.canvas.height / 100;
  const width = element.widthPercent * page.canvas.width / 100;
  const height = element.heightPercent * page.canvas.height / 100;
  const productImageUrl = typeof element.style.productImageUrl === "string" ? element.style.productImageUrl : "";
  const productImageIds = String(element.style.productImageIds || "").split(",").filter(Boolean);
  const productImageCount = Math.max(productImageIds.length, Number(element.style.productImageCount || 0));
  const productImageIndex = Math.max(0, Math.min(Math.max(0, productImageCount - 1), Number(element.style.productImageIndex || 0)));
  const configuredProductImageId = typeof element.style.productImageId === "string" ? element.style.productImageId : "";
  const productImageId = configuredProductImageId || productImageIds[productImageIndex] || "";
  const carouselImages = (element.carousel?.images || []).filter((image) => image.isActive).slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const carouselIndex = Math.max(0, Math.min(Math.max(0, carouselImages.length - 1), element.carousel?.currentIndex || 0));
  const carouselImage = carouselImages[carouselIndex];
  const configuredDownloadButton = downloadButtonPosition(element.style);
  const configuredDownloadButtonSize = downloadButtonSize(element.style);
  const configuredDownloadButtonDesign = downloadButtonDesign(element.style);
  const downloadButtonX = Math.max(0, Math.min(Math.max(0, width - configuredDownloadButtonSize), width * configuredDownloadButton.xPercent / 100));
  const downloadButtonY = Math.max(0, Math.min(Math.max(0, height - configuredDownloadButtonSize), height * configuredDownloadButton.yPercent / 100));
  const carouselProductId = carouselImage?.productId || element.carousel?.productIds?.[0] || element.productId || element.carousel?.productId;
  const carouselImageSource = carouselImage?.assetId
    ? `/api/catalogue-studio/asset-content?assetId=${encodeURIComponent(carouselImage.assetId)}`
    : carouselProductId && carouselImage?.productImageId
      ? `/api/v1/catalogue-studio/designs/${designId}/products/${carouselProductId}/images/${carouselImage.productImageId}`
      : carouselImage?.url || "";
  const currentErpImage = element.productId && ["product_card", "image"].includes(element.type)
    ? !productImageId && !productImageUrl
      ? NO_PRODUCT_IMAGE_URL
      : productImageId
      ? `/api/v1/catalogue-studio/designs/${designId}/products/${element.productId}/images/${productImageId}`
      : `/api/v1/catalogue-studio/designs/${designId}/products/${element.productId}/primary-image`
    : "";
  const imageSource = element.type === "image_carousel" ? carouselImageSource : currentErpImage || (element.assetId
    ? `/api/catalogue-studio/asset-content?assetId=${encodeURIComponent(element.assetId)}`
    : productImageUrl);
  // Video bytes are not image-decodable. Keep the editor lightweight and show
  // the attached file label here; the interactive preview renders the player.
  const { image: assetImage, status: assetImageStatus } = useCanvasImage(element.type === "video" ? "" : imageSource);
  const { image: qrImage, status: qrImageStatus, generationError: qrGenerationError } = useStudioQrCanvasImage(element);
  const configuredCardLayout = String(element.style.cardLayout || "classic");
  const cardLayout = element.style.layoutMode !== "fixed" && configuredCardLayout === "image_left" && width < 360 ? "classic" : configuredCardLayout;
  const cardPadding = Math.max(0, Number(element.style.cardPadding ?? 8));
  const showProductImage = element.style.showProductImage !== false && cardLayout !== "minimal";
  const showProductName = element.style.showProductName !== false && cardLayout !== "image_only";
  const showProductPrice = element.style.showProductPrice !== false && element.style.priceMode !== "no_price" && cardLayout !== "image_only";
  const showSecondaryPrice = showProductPrice && element.style.showSecondaryPrice === true;
  const showProductBrand = element.style.showProductBrand === true && cardLayout !== "image_only";
  const showProductSku = element.style.showProductSku === true && cardLayout !== "image_only";
  const requestedProductTextScale = Number(element.style.productTextScale ?? 85) / 100;
  const productTextScale = Number.isFinite(requestedProductTextScale)
    ? Math.max(.5, Math.min(1.5, requestedProductTextScale))
    : .85;
  const isErpDetail = cardLayout === "erp_detail";
  const erpDetailBarcodes = String(element.style.productBarcode || "—").split(/\r?\n/)
    .map((value) => String(value).trim()).filter(Boolean).slice(0, 8);
  const erpDetailRowHeight = Math.min(height * .095, height * .42 / Math.max(1, erpDetailBarcodes.length));
  const erpDetailTableTop = height * .21;
  const erpDetailHeaderHeight = height * .095;
  const erpDetailTableHeight = erpDetailHeaderHeight + erpDetailRowHeight * Math.max(1, erpDetailBarcodes.length);
  const requestedImageHeightRatio = Number(element.style.productImageHeight ?? 52) / 100;
  const safeRequestedImageHeightRatio = Number.isFinite(requestedImageHeightRatio) ? requestedImageHeightRatio : .52;
  // Match preview/PDF sizing: give product photography nearly half the card
  // while retaining a separate copy track for wrapped ERP names and prices.
  const maximumImageHeightRatio = showProductName ? .48 : cardLayout === "image_only" ? .9 : .7;
  const imageHeightRatio = Math.max(.2, Math.min(maximumImageHeightRatio, safeRequestedImageHeightRatio));
  const imageArea = isErpDetail
    ? { x: cardPadding + 4, y: height * .24, width: width * .34, height: height * .48 }
    : cardLayout === "image_left"
    ? { x: cardPadding, y: cardPadding, width: width * .46 - cardPadding * 1.5, height: height - cardPadding * 2 }
    : { x: cardPadding, y: cardPadding, width: width - cardPadding * 2, height: height * imageHeightRatio - cardPadding };
  const contentArea = cardLayout === "image_left"
    ? { x: width * .49, y: cardPadding, width: width * .47 - cardPadding, height: height - cardPadding * 2 }
    : { x: cardPadding, y: showProductImage ? height * imageHeightRatio + cardPadding : cardPadding, width: width - cardPadding * 2, height: height * (showProductImage ? 1 - imageHeightRatio : 1) - cardPadding * 2 };
  const imageFit = element.type === "image_carousel" ? String(carouselImage?.fit || element.carousel?.display.fit || "contain") : String(element.style.objectFit || "contain");
  const fittedProductImageRect = fittedImageRect(assetImage, imageArea, imageFit);
  const requestedProductImageZoom = Number(element.style.productImageZoom ?? 120) / 100;
  const productImageZoom = Number.isFinite(requestedProductImageZoom)
    ? Math.max(1, Math.min(2, requestedProductImageZoom))
    : 1.2;
  const productImageRect = {
    x: fittedProductImageRect.x + fittedProductImageRect.width * (1 - productImageZoom) / 2,
    y: fittedProductImageRect.y + fittedProductImageRect.height * (1 - productImageZoom) / 2,
    width: fittedProductImageRect.width * productImageZoom,
    height: fittedProductImageRect.height * productImageZoom,
  };
  const carouselCropStyle = element.type === "image_carousel" && carouselImage
    ? { ...element.style, cropZoom: carouselImage.zoom * 100, cropX: carouselImage.positionX, cropY: carouselImage.positionY }
    : element.style;
  const elementImageRect = croppedImageRect(assetImage, { x: 0, y: 0, width, height }, imageFit, carouselCropStyle);
  const hasDecoration = element.type !== "line" && (element.type !== "text"
    || typeof element.style.backgroundColor === "string"
    || Number(element.style.borderWidth || 0) > 0
    || Number(element.style.shadowBlur || 0) > 0);
  const shadowBlur = Math.max(0, Number(element.style.shadowBlur || 0));
  const shadowOpacity = Math.max(0, Math.min(1, Number(element.style.shadowOpacity ?? 22) / 100));
  const lineThickness = Math.max(1, Number(element.style.lineThickness || 4));
  const lineStyle = String(element.style.lineStyle || "solid");
  const lineDash = lineStyle === "dashed"
    ? [lineThickness * 3, lineThickness * 2]
    : lineStyle === "dotted" ? [lineThickness, lineThickness * 1.5] : undefined;
  const tableRows = element.type === "table" ? parseStudioTable(element.text) : [];
  const tableColumnCount = tableRows[0]?.length || 1;
  const tableRowHeight = height / Math.max(1, tableRows.length);
  const tableColumnFractions = studioTableColumnFractions(tableRows);
  const tableColumnWidths = tableColumnFractions.map((fraction) => width * fraction);
  const tableColumnOffsets = tableColumnWidths.map((_, index) => tableColumnWidths.slice(0, index).reduce((sum, columnWidth) => sum + columnWidth, 0));
  const cropFromPosition = (position: number, frameSize: number, imageSize: number, current: number) => {
    const travel = frameSize - imageSize;
    if (Math.abs(travel) < .001) return current;
    return Math.max(0, Math.min(100, ((position - imageSize / 2) / travel) * 100));
  };
  const dragCrop = (event: Konva.KonvaEventObject<DragEvent>, save: boolean) => {
    event.cancelBubble = true;
    const target = event.target;
    const cropX = cropFromPosition(target.x(), width, elementImageRect.width, Number(element.style.cropX ?? 50));
    const cropY = cropFromPosition(target.y(), height, elementImageRect.height, Number(element.style.cropY ?? 50));
    target.position({
      x: (width - elementImageRect.width) * cropX / 100 + elementImageRect.width / 2,
      y: (height - elementImageRect.height) * cropY / 100 + elementImageRect.height / 2,
    });
    if (save) onChange({ ...element, style: { ...element.style, cropX, cropY } });
  };
  const crossPageDirection = (target: Konva.Node) => {
    const stage = target.getStage();
    const stagePointer = stage?.getPointerPosition();
    const pointerY = stagePointer ? stagePointer.y / Math.max(.001, stage?.scaleY() || 1) : null;
    return resolveCrossPageDropDirection({
      nodeY: target.y(),
      nodeHeight: height,
      canvasHeight: page.canvas.height,
      pointerY,
      canMoveToPreviousPage,
      canMoveToNextPage,
    });
  };

  useEffect(() => {
    if (showTransformer && node.current && transformer.current) {
      transformer.current.nodes([node.current]);
      transformer.current.getLayer()?.batchDraw();
    }
  }, [showTransformer]);

  useEffect(() => {
    const imageNode = standaloneImageNode.current;
    if (!imageNode || !assetImage || productImageCount < 2) return;
    imageNode.opacity(0);
    const transition = new Konva.Tween({ node: imageNode, duration: .24, opacity: 1, easing: Konva.Easings.EaseOut });
    transition.play();
    return () => transition.destroy();
  }, [assetImage, carouselImages.length, productImageCount]);

  useEffect(() => {
    // Konva can retain the previous placeholder draw when a protected image
    // finishes decoding during an autosave render. Explicitly redraw the layer
    // once the decoded image is available.
    if (assetImage) node.current?.getLayer()?.batchDraw();
  }, [assetImage, imageSource]);

  useEffect(() => {
    if (!cropMode) return;
    const container = node.current?.getStage()?.container();
    if (!container) return;
    container.style.cursor = element.locked ? "not-allowed" : "grab";
    return () => { container.style.cursor = "default"; };
  }, [cropMode, element.locked]);

  if (!element.visible) return null;
  return (
    <>
      <Group
        ref={node}
        id={element.id}
        x={x}
        y={y}
        width={width}
        height={height}
        rotation={element.rotation}
        opacity={element.opacity}
        draggable={!element.locked && !selectionMode && !cropMode && interactionMode === "edit"}
        onClick={(event) => {
          event.cancelBubble = true;
          onSelect(element.id, event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey);
        }}
        onTap={(event) => { event.cancelBubble = true; onSelect(element.id, false); }}
        onContextMenu={(event) => {
          event.evt.preventDefault();
          event.cancelBubble = true;
          onElementContextMenu(element.id, event.evt.clientX, event.evt.clientY);
        }}
        onDragStart={(event) => {
          event.cancelBubble = true;
          onDragStart(element.id);
        }}
        onDragMove={(event) => {
          event.cancelBubble = true;
          onDragMove(element.id, event.target.x() - x, event.target.y() - y);
        }}
        onDragEnd={(event) => {
          event.cancelBubble = true;
          const rawX = event.target.x();
          const rawY = event.target.y();
          const snappedX = page.canvas.showGrid ? Math.round(rawX / page.canvas.gridSize) * page.canvas.gridSize : rawX;
          const snappedY = page.canvas.showGrid ? Math.round(rawY / page.canvas.gridSize) * page.canvas.gridSize : rawY;
          const nextX = Math.max(0,Math.min(page.canvas.width-width,snappedX));
          const pageDirection = crossPageDirection(event.target);
          if (pageDirection) {
            onMoveAcrossPage(element.id, pageDirection, (nextX - x) * 100 / page.canvas.width);
            onDragFinish();
            return;
          }
          const nextY = Math.max(0,Math.min(page.canvas.height-height,snappedY));
          onMoveSelection(element.id, (nextX - x) * 100 / page.canvas.width, (nextY - y) * 100 / page.canvas.height);
          onDragFinish();
        }}
        onTransform={() => {
          const target=node.current;if(!target)return;
          setTransformSize({width:Math.round(width*target.scaleX()),height:Math.round(height*target.scaleY())});
        }}
        onTransformEnd={() => {
          const target = node.current;
          if (!target) return;
          const minimumWidth=Math.max(10,Number(element.style.minWidth||10));
          const minimumHeight=Math.max(10,Number(element.style.minHeight||10));
          const nextWidth = Math.min(page.canvas.width,Math.max(minimumWidth, width * target.scaleX()));
          const nextHeight = Math.min(page.canvas.height,Math.max(minimumHeight, height * target.scaleY()));
          target.scaleX(1); target.scaleY(1);
          setTransformSize(null);
          onChange({
            ...element,
            xPercent: Math.max(0,Math.min(page.canvas.width-nextWidth,target.x())) * 100 / page.canvas.width,
            yPercent: Math.max(0,Math.min(page.canvas.height-nextHeight,target.y())) * 100 / page.canvas.height,
            widthPercent: nextWidth * 100 / page.canvas.width,
            heightPercent: nextHeight * 100 / page.canvas.height,
            rotation: target.rotation(),
          });
        }}
      >
        {hasDecoration && (
          <Rect
            width={width}
            height={height}
            fill={elementFill(element)}
            stroke={typeof element.style.borderColor === "string" ? element.style.borderColor : "#BCD0C3"}
            strokeWidth={Number(element.style.borderWidth ?? 1)}
            cornerRadius={element.type === "image_carousel" ? Number(element.carousel?.display.borderRadius ?? 8) : Number(element.style.borderRadius ?? 8)}
            shadowColor={String(element.style.shadowColor || "#0B3E25")}
            shadowBlur={shadowBlur}
            shadowOffsetX={Number(element.style.shadowOffsetX || 0)}
            shadowOffsetY={Number(element.style.shadowOffsetY ?? 3)}
            shadowOpacity={shadowOpacity}
          />
        )}
        {element.type === "line" && <>
          <Rect width={width} height={height} fill="rgba(0,0,0,0.001)" />
          <Line
            points={[0, height / 2, width, height / 2]}
            stroke={String(element.style.lineColor || element.style.color || "#126B3A")}
            strokeWidth={lineThickness}
            dash={lineDash}
            lineCap="round"
            lineJoin="round"
            shadowColor={String(element.style.shadowColor || "#0B3E25")}
            shadowBlur={shadowBlur}
            shadowOffsetX={Number(element.style.shadowOffsetX || 0)}
            shadowOffsetY={Number(element.style.shadowOffsetY ?? 3)}
            shadowOpacity={shadowOpacity}
          />
        </>}
        {element.type === "product_card" && isErpDetail && (
          <>
            <Rect x={cardPadding} y={cardPadding} width={width - cardPadding * 2} height={Math.max(26, height * .12)} fill={String(element.style.detailAccentColor || "#F9A83B")} cornerRadius={6} />
            <Text x={cardPadding + 8} y={cardPadding + 4} width={width - cardPadding * 2 - 16} height={Math.max(18, height * .1)} text={String(element.style.productName || "{{product.name_en}}") } align="center" verticalAlign="middle" fontSize={Math.max(10, Math.min(22, height * .055))} fill="#FFFFFF" fontStyle={elementFontStyle(element, true)} ellipsis />
            <Text x={imageArea.x} y={height * .17} width={imageArea.width} text={[String(element.style.productPackSize ?? ""), String(element.style.productUnit || "")].filter(Boolean).join(" ")} align="center" fontSize={Math.max(9, Math.min(18, height * .042))} fill="#17251F" />
            {showProductImage && <Rect x={imageArea.x} y={imageArea.y} width={imageArea.width} height={imageArea.height} fill="#F7FAF8" cornerRadius={8} />}
            {showProductImage && assetImage && <Group clipX={imageArea.x} clipY={imageArea.y} clipWidth={imageArea.width} clipHeight={imageArea.height}><KonvaImage image={assetImage} {...productImageRect} /></Group>}
            {showProductImage && !assetImage && <Text x={imageArea.x} y={imageArea.y + imageArea.height * .42} width={imageArea.width} text="PRODUCT IMAGE" align="center" fontSize={Math.max(9, width * .025)} fill="#789083" />}
            <Text x={imageArea.x} y={height * .74} width={imageArea.width} text={String(element.style.productSku || "")} align="center" fontSize={Math.max(9, Math.min(18, height * .042))} fill="#17251F" fontStyle="bold" />
            <Rect x={width * .41} y={erpDetailTableTop} width={width * .55} height={erpDetailTableHeight} stroke="#C9D3CD" strokeWidth={1} />
            <Line points={[width * .41, erpDetailTableTop + erpDetailHeaderHeight, width * .96, erpDetailTableTop + erpDetailHeaderHeight]} stroke="#C9D3CD" strokeWidth={1} />
            {erpDetailBarcodes.slice(1).map((_, index) => <Line key={`barcode-row-${index}`} points={[width * .41, erpDetailTableTop + erpDetailHeaderHeight + erpDetailRowHeight * (index + 1), width * .96, erpDetailTableTop + erpDetailHeaderHeight + erpDetailRowHeight * (index + 1)]} stroke="#C9D3CD" strokeWidth={1} />)}
            <Line points={[width * .59, erpDetailTableTop, width * .59, erpDetailTableTop + erpDetailTableHeight]} stroke="#C9D3CD" strokeWidth={1} />
            <Line points={[width * .80, erpDetailTableTop, width * .80, erpDetailTableTop + erpDetailTableHeight]} stroke="#C9D3CD" strokeWidth={1} />
            <Text x={width * .41} y={height * .225} width={width * .18} text="CODE" align="center" fontSize={Math.max(7, height * .027)} fill="#263B30" />
            <Text x={width * .59} y={height * .225} width={width * .21} text="BARCODE" align="center" fontSize={Math.max(7, height * .027)} fill="#263B30" />
            <Text x={width * .80} y={height * .225} width={width * .16} text="STOCK" align="center" fontSize={Math.max(7, height * .027)} fill="#16884C" />
            {erpDetailBarcodes.map((barcode, index) => {
              const rowY = erpDetailTableTop + erpDetailHeaderHeight + erpDetailRowHeight * index + erpDetailRowHeight * .24;
              return <Fragment key={`${barcode}-${index}`}>
                <Text x={width * .41} y={rowY} width={width * .18} text={String(element.style.productSku || "—")} align="center" fontSize={Math.max(7, Math.min(height * .027, erpDetailRowHeight * .42))} fill="#263B30" />
                <Text x={width * .59} y={rowY} width={width * .21} text={barcode} align="center" fontSize={Math.max(7, Math.min(height * .027, erpDetailRowHeight * .42))} fill="#263B30" />
                <Text x={width * .80} y={rowY} width={width * .16} text={String(element.style.productStock ?? "—")} align="center" fontSize={Math.max(7, Math.min(height * .027, erpDetailRowHeight * .42))} fill="#16884C" />
              </Fragment>;
            })}
            {element.style.showProductDescription === true && <Text x={cardPadding + 5} y={height * .84} width={width * .54} height={height * .11} text={String(element.style.productDescription || element.style.productRemark || "")} fontSize={Math.max(7, Math.min(13, height * .028))} fill={String(element.style.productMetaColor || "#60746A")} wrap="word" ellipsis />}
            {showProductPrice && <><Rect x={width * .65} y={height * .84} width={width * .31} height={Math.max(23, height * .1)} fill={String(element.style.detailAccentColor || "#F9A83B")} cornerRadius={Math.max(12, height * .05)} /><Text x={width * .65} y={height * .855} width={width * .31} height={Math.max(18, height * .08)} text={String(element.style.productPrice || "Price unavailable")} align="center" verticalAlign="middle" fontSize={Math.max(8, Math.min(15, height * .032))} fill="#FFFFFF" fontStyle="bold" ellipsis /></>}
          </>
        )}
        {element.type === "product_card" && !isErpDetail && (
          <>
            {showProductImage && <Rect x={imageArea.x} y={imageArea.y} width={imageArea.width} height={imageArea.height} fill="#EFF5F1" cornerRadius={Math.min(8, Number(element.style.borderRadius || 8))} />}
            {showProductImage && assetImage && <Group clipX={imageArea.x} clipY={imageArea.y} clipWidth={imageArea.width} clipHeight={imageArea.height}><KonvaImage image={assetImage} {...productImageRect} /></Group>}
            {showProductImage && !assetImage && <Text x={imageArea.x} y={imageArea.y + imageArea.height * .42} width={imageArea.width} text="PRODUCT IMAGE" align="center" fontSize={Math.max(10, width * .04)} fill="#789083" />}
            {showProductBrand && <Text x={contentArea.x} y={contentArea.y} width={contentArea.width} text={String(element.style.productBrand || "")} fontSize={Number(element.style.productMetaSize || 16) * productTextScale} fill={String(element.style.productMetaColor || "#60746A")} />}
            {showProductSku && <Text x={contentArea.x} y={contentArea.y + (showProductBrand ? Number(element.style.productMetaSize || 16) * productTextScale * 1.3 : 0)} width={contentArea.width} text={String(element.style.productSku || "")} fontSize={Number(element.style.productMetaSize || 16) * productTextScale} fill={String(element.style.productMetaColor || "#60746A")} />}
            {showProductName && <Text x={contentArea.x} y={contentArea.y + (showProductBrand ? 24 * productTextScale : 0) + (showProductSku ? 22 * productTextScale : 0)} width={contentArea.width} height={contentArea.height * .58} text={String(element.style.productName || "{{product.name_en}}") } fontSize={Number(element.style.productNameSize || Math.max(12, width * .07)) * productTextScale} fontStyle={elementFontStyle(element, true)} fill={String(element.style.productNameColor || "#173C29")} wrap="word" />}
            {showProductPrice && <Text x={contentArea.x} y={contentArea.y + contentArea.height * .76} width={contentArea.width} text={String(element.style.productPrice || "{{product.price}}") } fontSize={Number(element.style.productPriceSize || Math.max(11, width * .06)) * productTextScale} fontStyle={elementFontStyle(element)} fill={String(element.style.productPriceColor || "#0E7A43")} />}
            {showSecondaryPrice && <Text x={contentArea.x} y={contentArea.y + contentArea.height * .88} width={contentArea.width} text={String(element.style.productSecondaryPrice || "Secondary price unavailable") } fontSize={Number(element.style.secondaryPriceSize || Math.max(10, width * .05)) * productTextScale} fontStyle={elementFontStyle(element)} fill={String(element.style.secondaryPriceColor || "#B42318")} />}
          </>
        )}
        {element.type === "table" && tableRows.map((row, rowIndex) => row.map((cell, columnIndex) => {
          const header = rowIndex === 0 && element.style.tableHeader !== false;
          const bodyIndex = header ? -1 : rowIndex - (element.style.tableHeader !== false ? 1 : 0);
          const alternate = element.style.tableStriped !== false && bodyIndex % 2 === 1;
          const fill = header ? String(element.style.tableHeaderColor || "#126B3A") : alternate ? String(element.style.tableAlternateColor || "#F2F8F4") : String(element.style.tableCellColor || "#FFFFFF");
          const stockColumn = String(tableRows[0]?.[columnIndex] || "").trim().toLowerCase() === "stock";
          const color = header ? String(element.style.tableHeaderTextColor || "#FFFFFF") : stockColumn ? String(element.style.tableStockColor || "#16884C") : String(element.style.color || "#17251F");
          const padding = Math.max(2, Number(element.style.tableCellPadding || 8));
          const borderWidth = element.style.tableShowBorders === false ? 0 : Math.max(0, Number(element.style.tableBorderWidth ?? 1));
          const columnWidth = tableColumnWidths[columnIndex] || width / tableColumnCount;
          const availableWidth = Math.max(1, columnWidth - padding * 2);
          const baseFontSize = Math.max(6, Math.min(Number(element.style.fontSize || 16), tableRowHeight * .38));
          const fittedFontSize = Math.max(5, Math.min(baseFontSize, availableWidth / Math.max(1, cell.length * .58)));
          return <Group key={`${rowIndex}-${columnIndex}`} x={tableColumnOffsets[columnIndex] || 0} y={rowIndex * tableRowHeight}>
            <Rect width={columnWidth} height={tableRowHeight} fill={fill} stroke={String(element.style.tableGridColor || "#B9CCC0")} strokeWidth={borderWidth} />
            <Text x={padding} y={padding} width={availableWidth} height={Math.max(1, tableRowHeight - padding * 2)} text={cell} fill={color} fontSize={fittedFontSize} fontFamily={String(element.style.fontFamily || "Arial")} fontStyle={elementFontStyle(element, header)} align={(element.style.textAlign as "left" | "center" | "right" | "justify") || "left"} verticalAlign={(element.style.tableVerticalAlign as "top" | "middle" | "bottom") || "middle"} wrap="none" />
          </Group>;
        }))}
        {assetImage && ["image", "image_carousel", "logo", "background"].includes(element.type) && (
          <Group clipX={0} clipY={0} clipWidth={width} clipHeight={height}>
            <KonvaImage
              key={imageSource}
              ref={standaloneImageNode}
              image={assetImage}
              {...elementImageRect}
              cornerRadius={Number(element.style.borderRadius ?? 0)}
              draggable={cropMode && !element.locked}
              onMouseDown={(event) => { if (cropMode) event.cancelBubble = true; }}
              onTouchStart={(event) => { if (cropMode) event.cancelBubble = true; }}
              onDragStart={(event) => { event.cancelBubble = true; event.target.getStage()!.container().style.cursor = "grabbing"; }}
              onDragMove={(event) => dragCrop(event, false)}
              onDragEnd={(event) => { dragCrop(event, true); event.target.getStage()!.container().style.cursor = "grab"; }}
              onMouseEnter={(event) => { if (cropMode) event.target.getStage()!.container().style.cursor = "grab"; }}
              onMouseLeave={(event) => { event.target.getStage()!.container().style.cursor = "default"; }}
            />
          </Group>
        )}
        {!cropMode && assetImage && element.productId && (element.type === "image" || element.type === "product_card" && showProductImage) && (
          <Rect
            x={element.type === "product_card" ? imageArea.x : 0}
            y={element.type === "product_card" ? imageArea.y : 0}
            width={element.type === "product_card" ? imageArea.width : width}
            height={element.type === "product_card" ? imageArea.height : height}
            fill="rgba(255,255,255,0.001)"
            onClick={(event) => { event.cancelBubble = true; onSelect(element.id, false); onProductImagePreview(element); }}
            onTap={(event) => { event.cancelBubble = true; onSelect(element.id, false); onProductImagePreview(element); }}
            onMouseEnter={(event) => { event.target.getStage()!.container().style.cursor = "zoom-in"; }}
            onMouseLeave={(event) => { event.target.getStage()!.container().style.cursor = "default"; }}
          />
        )}
        {cropMode && <Rect width={width} height={height} stroke="#159957" strokeWidth={3} dash={[10, 6]} listening={false} />}
        {["image", "image_carousel", "logo", "video", "background"].includes(element.type) && (
          <Text width={width} height={height} text={element.type === "video" ? element.assetId ? `▶\n${String(element.style.sourceFileName || element.name || "Video attached")}` : "VIDEO\n\nDrop MP4 or WebM here" : assetImage ? "" : element.type === "logo" ? "LOGO" : element.type === "background" ? "BACKGROUND" : element.type === "image_carousel" ? carouselImages.length === 0 ? "No images added\n\nAdd Images" : assetImageStatus === "error" ? "Image could not be loaded\n\nReplace or retry" : "Loading image..." : "IMAGE"} align="center" verticalAlign="middle" fontSize={Math.max(12, width * .06)} fill="#47705A" padding={8} ellipsis />
        )}
        {element.type === "button" && (
          <Text width={width} height={height} text={element.text || "Download"} align={(element.style.textAlign as "left" | "center" | "right" | "justify") || "center"} verticalAlign="middle" fontFamily={String(element.style.fontFamily || "Arial")} fontStyle={elementFontStyle(element)} fontSize={Number(element.style.fontSize || Math.max(12, height * .3))} fill={String(element.style.color || "#FFFFFF")} padding={8} />
        )}
        {element.type === "qr_code" && (() => {
          const showLabel = element.style.qrShowLabel === true && Boolean(String(element.style.qrLabel || "").trim());
          const labelHeight = showLabel ? Math.max(20, height * .16) : 0;
          const padding = Math.max(4, Math.min(width, height) * .04);
          const availableHeight = Math.max(1, height - labelHeight - padding * 2);
          const qrSize = Math.max(1, Math.min(width - padding * 2, availableHeight));
          const qrX = (width - qrSize) / 2;
          const qrY = padding + (availableHeight - qrSize) / 2;
          const emptyMessage = qrGenerationError || qrImageStatus === "error"
            ? "QR code could not be generated"
            : element.target ? "Generating QR code…" : "QR CODE\n\nAdd information in Properties";
          return <Group>
            {qrImage ? <KonvaImage image={qrImage} x={qrX} y={qrY} width={qrSize} height={qrSize} /> : <Text x={padding} y={padding} width={Math.max(1, width - padding * 2)} height={availableHeight} text={emptyMessage} align="center" verticalAlign="middle" fontStyle="bold" fontSize={Math.max(10, Math.min(22, width * .08))} fill="#47705A" padding={8} />}
            {showLabel && <Text x={padding} y={height - labelHeight} width={Math.max(1, width - padding * 2)} height={labelHeight} text={String(element.style.qrLabel)} align="center" verticalAlign="middle" fontSize={Math.max(8, Math.min(Number(element.style.fontSize || 16), labelHeight * .55))} fill={String(element.style.color || "#17251F")} ellipsis />}
          </Group>;
        })()}
        {element.type === "barcode" && (() => {
          const value = String(element.text || element.target || element.style.barcodeValue || "ERP BARCODE");
          const widths = [2, 1, 2, 1, 3, 1, ...Array.from(value).flatMap((character) => {
            const code = character.charCodeAt(0);
            return [1 + (code & 3), 1 + ((code >> 2) & 3), 1 + ((code >> 4) & 3), 1 + ((code >> 6) & 3)];
          }), 2, 3, 1, 2];
          const total = widths.reduce((sum, item) => sum + item, 0);
          let cursor = width * .06;
          return <Group>
            {widths.map((moduleWidth, index) => {
              const barWidth = width * .88 * moduleWidth / total;
              const x = cursor;
              cursor += barWidth;
              return index % 2 === 0 ? <Rect key={`${element.id}-bar-${index}`} x={x} y={height * .08} width={Math.max(.7, barWidth)} height={height * .64} fill={String(element.style.color || "#111111")} listening={false} /> : null;
            })}
            <Text x={width * .03} y={height * .74} width={width * .94} height={height * .22} text={value} align="center" verticalAlign="middle" fontFamily="monospace" fontSize={Math.max(8, Math.min(Number(element.style.fontSize || 16), height * .18))} fill={String(element.style.color || "#111111")} />
          </Group>;
        })()}
        {["text", "product_field", "category_field", "catalogue_field", "promotion_field", "page_number", "button"].includes(element.type) && (
          <Text
            width={width}
            height={height}
            text={element.type === "page_number" ? String(pageNumber) : element.text || element.binding || element.name || "Text"}
            fontSize={Number(element.style.fontSize ?? 32)}
            fontFamily={String(element.style.fontFamily || "Arial")}
            fontStyle={elementFontStyle(element)}
            fill={String(element.style.color || "#17251F")}
            align={(element.style.textAlign as "left" | "center" | "right" | "justify") || "left"}
            verticalAlign="middle"
            wrap="word"
          />
        )}
      </Group>
      {element.productId && productImageCount > 1 && (element.type === "image" || element.type === "product_card" && showProductImage) && (
        <Group x={x} y={y} rotation={element.rotation} opacity={element.opacity}>
          <ProductImageNavigation area={element.type === "product_card" ? imageArea : { x: 0, y: 0, width, height }} currentIndex={productImageIndex} imageCount={productImageCount} onStep={(direction) => onProductImageStep(element, direction)} />
        </Group>
      )}
      {((element.productId && (element.type === "image" || element.type === "product_card"))
        || (element.type === "image_carousel" && carouselImages.length > 0)) && (
        <Group x={x} y={y} rotation={element.rotation} opacity={element.opacity}>
          <ProductImagePreviewControl
            x={downloadButtonX}
            y={downloadButtonY}
            frameWidth={width}
            frameHeight={height}
            size={configuredDownloadButtonSize}
            design={configuredDownloadButtonDesign}
            draggable={!element.locked && !selectionMode && !cropMode && interactionMode === "edit"}
            onOpen={(event) => {
              event.cancelBubble = true;
              onSelect(element.id, false);
              onProductImagePreview(element);
            }}
            onMove={(nextX, nextY) => {
              onSelect(element.id, false);
              onChange({
                ...element,
                style: {
                  ...element.style,
                  downloadButtonXPercent: width > 0 ? nextX * 100 / width : 0,
                  downloadButtonYPercent: height > 0 ? nextY * 100 / height : 0,
                },
              });
            }}
          />
        </Group>
      )}
      {element.type === "image_carousel" && carouselImages.length > 1 && element.carousel?.navigation.showArrows !== false && element.carousel?.navigation.arrowVisibility !== "hidden" && (
        <Group x={x} y={y} rotation={element.rotation} opacity={element.opacity}>
          <ProductImageNavigation area={{ x: 0, y: 0, width, height }} currentIndex={carouselIndex} imageCount={carouselImages.length} onStep={(direction) => onProductImageStep(element, direction)} />
        </Group>
      )}
      {showTransformer && !element.locked && (
        <>
        {transformSize&&<Group x={x} y={Math.max(0,y-28)} listening={false}><Rect width={130} height={24} fill="#123C28" opacity={.9} cornerRadius={6}/><Text width={130} height={24} text={`${transformSize.width} × ${transformSize.height} px`} fill="#FFFFFF" fontSize={12} align="center" verticalAlign="middle"/></Group>}
        <Transformer
          ref={transformer}
          rotateEnabled
          flipEnabled={false}
          keepRatio={element.style.lockAspectRatio===true}
          enabledAnchors={["top-left","top-center","top-right","middle-right","bottom-right","bottom-center","bottom-left","middle-left"]}
          boundBoxFunc={(oldBox, newBox) => {
            const minWidth=Math.max(10,Number(element.style.minWidth||10));
            const minHeight=Math.max(10,Number(element.style.minHeight||10));
            if(newBox.width<minWidth||newBox.height<minHeight||newBox.x<0||newBox.y<0||newBox.x+newBox.width>page.canvas.width||newBox.y+newBox.height>page.canvas.height)return oldBox;
            return newBox;
          }}
        />
        </>
      )}
    </>
  );
}

type CanvasSelection = { x: number; y: number; width: number; height: number; additive: boolean };

export default function StudioEditorCanvas({ designId, document, pageNumber, selectedIds, selectionMode, cropModeElementId, interactionMode, zoom, onSelect, onSelectMany, onChange, onMoveSelection, onTransformSelection, onMoveAcrossPage, canMoveToPreviousPage, canMoveToNextPage, onProductImageStep, onProductImagePreview, onElementContextMenu, onStageReady }: Props) {
  const stageRef = useRef<Konva.Stage>(null);
  const selectionTransformerRef = useRef<Konva.Transformer>(null);
  const selectionStart = useRef<{ x: number; y: number; additive: boolean } | null>(null);
  const selectionRef = useRef<CanvasSelection | null>(null);
  const dragOrigins = useRef(new Map<string, { x: number; y: number }>());
  const activeDragSourceId = useRef<string | null>(null);
  const guideFrame = useRef<number | null>(null);
  const pendingDragMeasurements = useRef<DragMeasurements | null>(null);
  const [selection, setSelection] = useState<CanvasSelection | null>(null);
  const [dragMeasurements, setDragMeasurements] = useState<DragMeasurements | null>(null);
  useEffect(() => { onStageReady(stageRef.current); return () => onStageReady(null); }, [onStageReady]);
  const gridSize = Math.max(1, document.canvas.gridSize || 10);
  const gridMajorEvery = gridSize < 20 ? 5 : gridSize < 50 ? 2 : 1;
  const verticalGrid = useMemo(() => document.canvas.showGrid ? Array.from({ length: Math.ceil(document.canvas.width / gridSize) + 1 }) : [], [document.canvas.showGrid, document.canvas.width, gridSize]);
  const horizontalGrid = useMemo(() => document.canvas.showGrid ? Array.from({ length: Math.ceil(document.canvas.height / gridSize) + 1 }) : [], [document.canvas.height, document.canvas.showGrid, gridSize]);
  const sortedElements = useMemo(() => document.elements.slice().sort((a, b) => a.zIndex - b.zIndex), [document.elements]);
  const elementBounds = useMemo(() => document.elements.filter((element) => element.visible).map((element) => ({ id: element.id, x: element.xPercent * document.canvas.width / 100, y: element.yPercent * document.canvas.height / 100, width: element.widthPercent * document.canvas.width / 100, height: element.heightPercent * document.canvas.height / 100 })), [document.canvas.height, document.canvas.width, document.elements]);
  const selectedElements = useMemo(() => document.elements.filter((element) => selectedIds.includes(element.id) && element.visible), [document.elements, selectedIds]);
  const elementMeasurements = resolveElementMeasurements(selectedElements, document.canvas);
  const selectedBounds = selectedElements.length > 1 ? {
    x: Math.min(...selectedElements.map((element) => element.xPercent * document.canvas.width / 100)),
    y: Math.min(...selectedElements.map((element) => element.yPercent * document.canvas.height / 100)),
    right: Math.max(...selectedElements.map((element) => (element.xPercent + element.widthPercent) * document.canvas.width / 100)),
    bottom: Math.max(...selectedElements.map((element) => (element.yPercent + element.heightPercent) * document.canvas.height / 100)),
  } : null;

  useEffect(() => {
    const transformer = selectionTransformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage || selectedElements.length < 2 || interactionMode !== "edit" || selectionMode || cropModeElementId) return;
    transformer.nodes(selectedElements.map((element) => stage.findOne(`#${element.id}`)).filter((node): node is Konva.Node => Boolean(node)));
    transformer.getLayer()?.batchDraw();
  }, [cropModeElementId, interactionMode, selectedElements, selectionMode]);
  useEffect(() => () => { if (guideFrame.current !== null) cancelAnimationFrame(guideFrame.current); }, []);

  const finishSelectionTransform = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const transformed = selectedElements.map((element) => {
      const node = stage.findOne(`#${element.id}`);
      if (!node) return element;
      const width = Math.max(10, node.width() * Math.abs(node.scaleX()));
      const height = Math.max(10, node.height() * Math.abs(node.scaleY()));
      const next = {
        ...element,
        xPercent: Math.max(0, Math.min(100, node.x() * 100 / document.canvas.width)),
        yPercent: Math.max(0, Math.min(100, node.y() * 100 / document.canvas.height)),
        widthPercent: Math.max(.1, Math.min(100, width * 100 / document.canvas.width)),
        heightPercent: Math.max(.1, Math.min(100, height * 100 / document.canvas.height)),
      };
      node.scale({ x: 1, y: 1 });
      node.size({ width, height });
      return next;
    });
    onTransformSelection(transformed);
  };

  const pointer = () => {
    const position = stageRef.current?.getPointerPosition();
    return position ? { x: position.x / zoom, y: position.y / zoom } : null;
  };
  const isCanvasBackground = (target: Konva.Node) => target === target.getStage() || target.name() === "studio-canvas-background";
  const startSelection = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!selectionMode && !isCanvasBackground(event.target)) return;
    const position = pointer();
    if (!position) return;
    const additive = "shiftKey" in event.evt && Boolean(
      event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey,
    );
    selectionStart.current = { ...position, additive };
    const next = { ...position, width: 0, height: 0, additive };
    selectionRef.current = next;
    setSelection(next);
  };
  const updateSelection = () => {
    if (!selectionStart.current) return;
    const position = pointer();
    if (!position) return;
    const start = selectionStart.current;
    const next = { x: Math.min(start.x, position.x), y: Math.min(start.y, position.y), width: Math.abs(position.x - start.x), height: Math.abs(position.y - start.y), additive: start.additive };
    selectionRef.current = next;
    setSelection(next);
  };
  const finishSelection = () => {
    setDragMeasurements(null);
    const box = selectionRef.current;
    selectionStart.current = null;
    selectionRef.current = null;
    setSelection(null);
    if (!box || box.width < 4 || box.height < 4) {
      if (!box?.additive) onSelect("", false);
      return;
    }
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const ids = document.elements.filter((element) => {
      if (!element.visible) return false;
      const x = element.xPercent * document.canvas.width / 100;
      const y = element.yPercent * document.canvas.height / 100;
      const elementRight = (element.xPercent + element.widthPercent) * document.canvas.width / 100;
      const elementBottom = (element.yPercent + element.heightPercent) * document.canvas.height / 100;
      return x < right && elementRight > box.x && y < bottom && elementBottom > box.y;
    }).map((element) => element.id);
    onSelectMany(ids, box.additive);
  };

  const beginElementDrag = (sourceId: string) => {
    activeDragSourceId.current = sourceId;
    const source = document.elements.find((element) => element.id === sourceId);
    const sourceGroupIds = source?.groupId ? document.elements.filter((element) => element.groupId === source.groupId).map((element) => element.id) : [sourceId];
    const movingIds = selectedIds.includes(sourceId) ? selectedIds : sourceGroupIds;
    if (!selectedIds.includes(sourceId)) onSelectMany(movingIds, false);
    const origins = new Map<string, { x: number; y: number }>();
    for (const id of movingIds) {
      const canvasElement = document.elements.find((element) => element.id === id);
      if (!canvasElement || canvasElement.locked) continue;
      origins.set(id, { x: canvasElement.xPercent * document.canvas.width / 100, y: canvasElement.yPercent * document.canvas.height / 100 });
    }
    dragOrigins.current = origins;
  };
  const previewElementDrag = (sourceId: string, deltaX: number, deltaY: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const sourceNode = stage.findOne(`#${sourceId}`);
    if (sourceNode) {
      const width = sourceNode.width() * Math.abs(sourceNode.scaleX());
      const height = sourceNode.height() * Math.abs(sourceNode.scaleY());
      const others = elementBounds.filter((element) => element.id !== sourceId && !dragOrigins.current.has(element.id));
      const resolved = resolveSmartGuides({ x: sourceNode.x(), y: sourceNode.y(), width, height }, others, document.canvas, 7 / zoom);
      sourceNode.position({ x: resolved.x, y: resolved.y });
      const origin = dragOrigins.current.get(sourceId);
      if (origin) { deltaX = resolved.x - origin.x; deltaY = resolved.y - origin.y; }
      pendingDragMeasurements.current = { bounds: { x: resolved.x, y: resolved.y, width, height }, guides: resolved.guides };
      if (guideFrame.current === null) guideFrame.current = requestAnimationFrame(() => { guideFrame.current = null; setDragMeasurements(pendingDragMeasurements.current); });
    }
    for (const [id, origin] of dragOrigins.current) {
      if (id === sourceId) continue;
      const other = stage.findOne(`#${id}`);
      other?.position({ x: origin.x + deltaX, y: origin.y + deltaY });
    }
    stage.batchDraw();
  };
  return (
    <Stage
      ref={stageRef}
      width={document.canvas.width * zoom}
      height={document.canvas.height * zoom}
      scaleX={zoom}
      scaleY={zoom}
      onMouseDown={startSelection}
      onTouchStart={startSelection}
      onMouseMove={updateSelection}
      onTouchMove={updateSelection}
      onMouseUp={finishSelection}
      onTouchEnd={finishSelection}
    >
      <Layer>
        <Rect name="studio-canvas-background" width={document.canvas.width} height={document.canvas.height} fill={document.canvas.backgroundColor} />
        {verticalGrid.map((_, index) => <Line key={`v-${index}`} points={[index * gridSize, 0, index * gridSize, document.canvas.height]} stroke={index % gridMajorEvery === 0 ? "#9CB8A7" : "#D8E4DC"} strokeWidth={(index % gridMajorEvery === 0 ? 1 : .5) / zoom} listening={false} />)}
        {horizontalGrid.map((_, index) => <Line key={`h-${index}`} points={[0, index * gridSize, document.canvas.width, index * gridSize]} stroke={index % gridMajorEvery === 0 ? "#9CB8A7" : "#D8E4DC"} strokeWidth={(index % gridMajorEvery === 0 ? 1 : .5) / zoom} listening={false} />)}
        {document.canvas.showGrid && <Group listening={false}>
          <Rect x={0} y={0} width={document.canvas.width} height={20 / zoom} fill="#FFFFFF" opacity={.86} />
          <Rect x={0} y={0} width={26 / zoom} height={document.canvas.height} fill="#FFFFFF" opacity={.86} />
          {verticalGrid.map((_, index) => index % gridMajorEvery === 0 && index > 0 ? <Text key={`vx-${index}`} x={index * gridSize + 3 / zoom} y={3 / zoom} text={String(index * gridSize)} fill="#38644C" fontSize={9 / zoom} listening={false} /> : null)}
          {horizontalGrid.map((_, index) => index % gridMajorEvery === 0 && index > 0 ? <Text key={`hy-${index}`} x={3 / zoom} y={index * gridSize + 3 / zoom} text={String(index * gridSize)} fill="#38644C" fontSize={9 / zoom} rotation={-90} listening={false} /> : null)}
        </Group>}
        {document.canvas.showSafeArea && <Rect x={24} y={24} width={document.canvas.width - 48} height={document.canvas.height - 48} stroke="#E4A72C" dash={[8, 6]} listening={false} />}
        {sortedElements.map((element) => (
          <CanvasElement key={element.id} designId={designId} element={element} page={document} pageNumber={pageNumber} selectionMode={selectionMode} cropMode={cropModeElementId === element.id} interactionMode={interactionMode} showTransformer={interactionMode === "edit" && !selectionMode && !cropModeElementId && selectedIds.length === 1 && selectedIds.includes(element.id)} onSelect={onSelect} onChange={onChange} onMoveSelection={onMoveSelection} onMoveAcrossPage={onMoveAcrossPage} canMoveToPreviousPage={canMoveToPreviousPage} canMoveToNextPage={canMoveToNextPage} onDragStart={beginElementDrag} onDragMove={previewElementDrag} onDragFinish={() => { activeDragSourceId.current = null; dragOrigins.current.clear(); }} onProductImageStep={onProductImageStep} onProductImagePreview={onProductImagePreview} onElementContextMenu={onElementContextMenu} />
        ))}
        {dragMeasurements && interactionMode === "edit" && <Group listening={false}>
          {dragMeasurements.guides.map((guide, index) => guide.axis === "vertical"
            ? <Line key={`smart-v-${index}`} points={[guide.position, 0, guide.position, document.canvas.height]} stroke="#C329C9" strokeWidth={1.5 / zoom} dash={[7 / zoom, 4 / zoom]} />
            : <Line key={`smart-h-${index}`} points={[0, guide.position, document.canvas.width, guide.position]} stroke="#C329C9" strokeWidth={1.5 / zoom} dash={[7 / zoom, 4 / zoom]} />)}
          <Line points={[0, dragMeasurements.bounds.y + dragMeasurements.bounds.height / 2, dragMeasurements.bounds.x, dragMeasurements.bounds.y + dragMeasurements.bounds.height / 2]} stroke="#C329C9" strokeWidth={1 / zoom} />
          <Text x={Math.max(2, dragMeasurements.bounds.x / 2 - 26 / zoom)} y={dragMeasurements.bounds.y + dragMeasurements.bounds.height / 2 - 18 / zoom} width={52 / zoom} align="center" text={`${Math.round(dragMeasurements.bounds.x)} px`} fill="#FFFFFF" fontStyle="bold" fontSize={10 / zoom} padding={4 / zoom} cornerRadius={5 / zoom} background="#C329C9" />
          <Line points={[dragMeasurements.bounds.x + dragMeasurements.bounds.width, dragMeasurements.bounds.y + dragMeasurements.bounds.height / 2, document.canvas.width, dragMeasurements.bounds.y + dragMeasurements.bounds.height / 2]} stroke="#C329C9" strokeWidth={1 / zoom} />
          <Text x={(dragMeasurements.bounds.x + dragMeasurements.bounds.width + document.canvas.width) / 2 - 26 / zoom} y={dragMeasurements.bounds.y + dragMeasurements.bounds.height / 2 - 18 / zoom} width={52 / zoom} align="center" text={`${Math.round(document.canvas.width - dragMeasurements.bounds.x - dragMeasurements.bounds.width)} px`} fill="#FFFFFF" fontStyle="bold" fontSize={10 / zoom} padding={4 / zoom} cornerRadius={5 / zoom} background="#C329C9" />
          <Line points={[dragMeasurements.bounds.x + dragMeasurements.bounds.width / 2, 0, dragMeasurements.bounds.x + dragMeasurements.bounds.width / 2, dragMeasurements.bounds.y]} stroke="#C329C9" strokeWidth={1 / zoom} />
          <Text x={dragMeasurements.bounds.x + dragMeasurements.bounds.width / 2 + 5 / zoom} y={Math.max(2, dragMeasurements.bounds.y / 2 - 9 / zoom)} text={`${Math.round(dragMeasurements.bounds.y)} px`} fill="#C329C9" fontStyle="bold" fontSize={10 / zoom} />
          <Line points={[dragMeasurements.bounds.x + dragMeasurements.bounds.width / 2, dragMeasurements.bounds.y + dragMeasurements.bounds.height, dragMeasurements.bounds.x + dragMeasurements.bounds.width / 2, document.canvas.height]} stroke="#C329C9" strokeWidth={1 / zoom} />
          <Text x={dragMeasurements.bounds.x + dragMeasurements.bounds.width / 2 + 5 / zoom} y={(dragMeasurements.bounds.y + dragMeasurements.bounds.height + document.canvas.height) / 2 - 9 / zoom} text={`${Math.round(document.canvas.height - dragMeasurements.bounds.y - dragMeasurements.bounds.height)} px`} fill="#C329C9" fontStyle="bold" fontSize={10 / zoom} />
        </Group>}
        {elementMeasurements.map((measurement) => measurement.axis === "horizontal" ? <Group key={`measure-h-${measurement.start}-${measurement.end}`} listening={false}>
          <Line points={[measurement.start, measurement.cross, measurement.end, measurement.cross]} stroke="#E07A16" strokeWidth={1.5 / zoom} />
          <Line points={[measurement.start, measurement.cross - 5 / zoom, measurement.start, measurement.cross + 5 / zoom, measurement.end, measurement.cross - 5 / zoom, measurement.end, measurement.cross + 5 / zoom]} stroke="#E07A16" strokeWidth={1.5 / zoom} />
          <Text x={(measurement.start + measurement.end) / 2 - 28 / zoom} y={measurement.cross - 18 / zoom} width={56 / zoom} align="center" text={`${Math.round(measurement.distance)} px`} fill="#A14D08" fontStyle="bold" fontSize={10 / zoom} />
        </Group> : <Group key={`measure-v-${measurement.start}-${measurement.end}`} listening={false}>
          <Line points={[measurement.cross, measurement.start, measurement.cross, measurement.end]} stroke="#E07A16" strokeWidth={1.5 / zoom} />
          <Line points={[measurement.cross - 5 / zoom, measurement.start, measurement.cross + 5 / zoom, measurement.start, measurement.cross - 5 / zoom, measurement.end, measurement.cross + 5 / zoom, measurement.end]} stroke="#E07A16" strokeWidth={1.5 / zoom} />
          <Text x={measurement.cross + 5 / zoom} y={(measurement.start + measurement.end) / 2 - 8 / zoom} text={`${Math.round(measurement.distance)} px`} fill="#A14D08" fontStyle="bold" fontSize={10 / zoom} />
        </Group>)}
        {selectedBounds && <>
          <Rect x={selectedBounds.x - 4} y={selectedBounds.y - 4} width={selectedBounds.right - selectedBounds.x + 8} height={selectedBounds.bottom - selectedBounds.y + 8} stroke="#149653" strokeWidth={2 / zoom} dash={[8 / zoom, 5 / zoom]} listening={false} />
          <Rect x={selectedBounds.x - 4} y={selectedBounds.y - 28 / zoom} width={Math.max(72 / zoom, 92)} height={22 / zoom} fill="#126B3A" cornerRadius={5 / zoom} listening={false} />
          <Text x={selectedBounds.x + 3 / zoom} y={selectedBounds.y - 24 / zoom} width={Math.max(66 / zoom, 86)} height={16 / zoom} text={`${selectedElements.length} items selected`} fill="#FFFFFF" fontSize={11 / zoom} listening={false} />
        </>}
        {selectedElements.length > 1 && interactionMode === "edit" && !selectionMode && !cropModeElementId && <Transformer
          ref={selectionTransformerRef}
          rotateEnabled={false}
          flipEnabled={false}
          keepRatio={false}
          enabledAnchors={["top-left", "top-center", "top-right", "middle-right", "bottom-right", "bottom-center", "bottom-left", "middle-left"]}
          borderStroke="#149653"
          borderDash={[8 / zoom, 5 / zoom]}
          anchorFill="#FFFFFF"
          anchorStroke="#149653"
          anchorSize={11 / zoom}
          boundBoxFunc={(oldBox, newBox) => newBox.width >= 30 && newBox.height >= 30 && newBox.x >= 0 && newBox.y >= 0 && newBox.x + newBox.width <= document.canvas.width && newBox.y + newBox.height <= document.canvas.height ? newBox : oldBox}
          onTransformEnd={finishSelectionTransform}
        />}
        {selection && <Rect x={selection.x} y={selection.y} width={selection.width} height={selection.height} fill="rgba(20, 150, 83, .12)" stroke="#149653" strokeWidth={1.5 / zoom} dash={[7 / zoom, 4 / zoom]} listening={false} />}
      </Layer>
    </Stage>
  );
}
