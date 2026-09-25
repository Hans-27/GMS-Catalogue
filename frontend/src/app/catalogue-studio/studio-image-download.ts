import { API_ORIGIN } from "@/lib/api";

function absoluteImageUrl(source: string) {
  return source.startsWith("http") ? source : `${API_ORIGIN}${source}`;
}

export function studioImageDownloadUrl(source: string, fileName = "product-image") {
  const url = new URL(absoluteImageUrl(source), window.location.href);
  const apiOrigin = new URL(API_ORIGIN, window.location.href).origin;
  if (url.origin === apiOrigin && url.pathname.startsWith("/api/v1/catalogue-studio/")) {
    const proxyUrl = new URL("/api/catalogue-studio/image-download", window.location.origin);
    proxyUrl.searchParams.set("source", `${url.pathname}${url.search}`);
    proxyUrl.searchParams.set("filename", fileName);
    return proxyUrl.toString();
  }
  return url.toString();
}

export function startStudioImageDownload(source: string, fileName: string) {
  const link = window.document.createElement("a");
  link.href = studioImageDownloadUrl(source, fileName);
  link.download = fileName;
  link.rel = "noopener";
  window.document.body.appendChild(link);
  link.click();
  link.remove();
}
