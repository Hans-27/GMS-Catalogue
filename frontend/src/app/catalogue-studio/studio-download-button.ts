import type { StudioElement } from "@/lib/studio-api";

export const DOWNLOAD_BUTTON_DESIGNS = [
  { id: "classic", label: "Classic arrow", glyph: "↓" },
  { id: "tray", label: "Arrow to tray", glyph: "⇩" },
  { id: "line", label: "Download line", glyph: "⤓" },
  { id: "double", label: "Double arrow", glyph: "⇓" },
] as const;

export type DownloadButtonDesign = (typeof DOWNLOAD_BUTTON_DESIGNS)[number]["id"];

export function downloadButtonDesign(style: StudioElement["style"]) {
  const requested = String(style.downloadButtonDesign || "classic");
  return DOWNLOAD_BUTTON_DESIGNS.find((design) => design.id === requested) || DOWNLOAD_BUTTON_DESIGNS[0];
}

export function downloadButtonSize(style: StudioElement["style"]) {
  return Math.max(24, Math.min(64, Number(style.downloadButtonSize || 32)));
}

export function downloadButtonPosition(style: StudioElement["style"]) {
  return {
    xPercent: Math.max(0, Math.min(92, Number(style.downloadButtonXPercent ?? 3))),
    yPercent: Math.max(0, Math.min(92, Number(style.downloadButtonYPercent ?? 3))),
  };
}

export function supportsProductImageDownload(element: StudioElement | null | undefined) {
  if (!element) return false;
  if (["image", "product_card"].includes(element.type)) return Boolean(element.productId);
  return element.type === "image_carousel"
    && Boolean(element.carousel?.images.some((image) => image.isActive));
}
