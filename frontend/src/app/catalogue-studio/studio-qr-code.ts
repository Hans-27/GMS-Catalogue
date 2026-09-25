import QRCode from "qrcode";

import type { StudioElement } from "@/lib/studio-api";

export type StudioQrContentType = "url" | "text" | "phone" | "email" | "wifi";
export type StudioQrErrorCorrection = "L" | "M" | "Q" | "H";

export const STUDIO_QR_CONTENT_TYPES: Array<{ value: StudioQrContentType; label: string }> = [
  { value: "url", label: "Website / URL" },
  { value: "text", label: "Plain text" },
  { value: "phone", label: "Phone number" },
  { value: "email", label: "Email" },
  { value: "wifi", label: "Wi-Fi network" },
];

function styleText(style: StudioElement["style"], key: string, fallback = "") {
  const value = style[key];
  return typeof value === "string" ? value : fallback;
}

export function studioQrContentType(value: unknown): StudioQrContentType {
  return value === "text" || value === "phone" || value === "email" || value === "wifi" ? value : "url";
}

function escapeWifiValue(value: string) {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export function buildStudioQrValue(style: StudioElement["style"], fallbackTarget = "") {
  const contentType = studioQrContentType(style.qrContentType);
  const existingValue = styleText(style, "qrValue", fallbackTarget).trim();

  if (contentType === "phone") {
    const phone = styleText(style, "qrPhone", existingValue.replace(/^tel:/i, "")).trim();
    return phone ? `tel:${phone}` : "";
  }

  if (contentType === "email") {
    const email = styleText(style, "qrEmail", existingValue.replace(/^mailto:/i, "").split("?")[0]).trim();
    if (!email) return "";
    const parameters = new URLSearchParams();
    const subject = styleText(style, "qrEmailSubject").trim();
    const body = styleText(style, "qrEmailBody").trim();
    if (subject) parameters.set("subject", subject);
    if (body) parameters.set("body", body);
    return `mailto:${email}${parameters.size ? `?${parameters.toString()}` : ""}`;
  }

  if (contentType === "wifi") {
    const ssid = styleText(style, "qrWifiSsid").trim();
    if (!ssid) return "";
    const security = styleText(style, "qrWifiSecurity", "WPA");
    const password = styleText(style, "qrWifiPassword");
    const hidden = style.qrWifiHidden === true;
    return `WIFI:T:${security};S:${escapeWifiValue(ssid)};P:${escapeWifiValue(password)};H:${hidden ? "true" : "false"};;`;
  }

  return existingValue;
}

export function studioQrAppearance(style: StudioElement["style"]) {
  const correction = styleText(style, "qrErrorCorrection", "M");
  return {
    foreground: styleText(style, "qrForeground", "#111111"),
    background: styleText(style, "qrBackground", "#FFFFFF"),
    errorCorrection: (correction === "L" || correction === "Q" || correction === "H" ? correction : "M") as StudioQrErrorCorrection,
    margin: Math.max(0, Math.min(8, Number(style.qrMargin ?? 4))),
  };
}

const qrSvgCache = new Map<string, string>();
const QR_CACHE_LIMIT = 100;

export async function createStudioQrDataUrl(value: string, style: StudioElement["style"]) {
  const payload = value.trim();
  if (!payload) return "";
  const appearance = studioQrAppearance(style);
  const cacheKey = JSON.stringify([payload, appearance]);
  const cached = qrSvgCache.get(cacheKey);
  if (cached) return cached;

  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: appearance.errorCorrection,
    margin: appearance.margin,
    color: { dark: appearance.foreground, light: appearance.background },
  });
  const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  qrSvgCache.set(cacheKey, dataUrl);
  while (qrSvgCache.size > QR_CACHE_LIMIT) {
    const firstKey = qrSvgCache.keys().next().value as string | undefined;
    if (!firstKey) break;
    qrSvgCache.delete(firstKey);
  }
  return dataUrl;
}
