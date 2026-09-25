"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useId, useRef, useState } from "react";
import { API_ORIGIN } from "@/lib/api";
import styles from "./catalogue-image-dialog.module.css";

export type CatalogueImageItem = {
  url: string;
  altText: string;
  fileName?: string;
};

export type CatalogueImageSelection = {
  productName: string;
  productCode: string;
  images: CatalogueImageItem[];
  index: number;
  returnFocus?: HTMLButtonElement | null;
};

function safeIndex(index: number, length: number) {
  return Math.max(0, Math.min(length - 1, index));
}

function mimeExtension(contentType: string) {
  const extensions: Record<string, string> = {
    "image/avif": "avif",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
  };
  return extensions[contentType.toLocaleLowerCase().split(";")[0]] || "img";
}

function contentDispositionFileName(value: string | null) {
  if (!value) return "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(value)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  return /filename\s*=\s*"?([^";]+)"?/i.exec(value)?.[1]?.trim() || "";
}

function sanitizeFileName(value: string) {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim();
}

function downloadFileName(
  item: CatalogueImageItem,
  productCode: string,
  position: number,
  response: Response,
) {
  let urlName = "";
  try {
    urlName = decodeURIComponent(new URL(item.url).pathname.split("/").pop() || "");
  } catch {
    urlName = "";
  }
  const namedSource =
    item.fileName ||
    contentDispositionFileName(response.headers.get("Content-Disposition")) ||
    urlName;
  const fallbackCode = sanitizeFileName(productCode) || "product";
  let fileName = sanitizeFileName(namedSource) || `${fallbackCode}-image-${position}`;
  if (!/\.[a-z0-9]{2,8}$/i.test(fileName)) {
    fileName = `${fileName}.${mimeExtension(response.headers.get("Content-Type") || "")}`;
  }
  return fileName;
}

export function CatalogueImageDialog({
  selection,
  requestHeaders,
  onClose,
}: {
  selection: CatalogueImageSelection;
  requestHeaders?: Record<string, string>;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(() => safeIndex(selection.index, selection.images.length));
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const image = selection.images[index];
  const hasMultipleImages = selection.images.length > 1;

  useEffect(() => {
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [],
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = priorOverflow;
      selection.returnFocus?.focus();
    };
  }, [onClose, selection.returnFocus]);

  if (!image) return null;

  const previous = () => {
    if (!hasMultipleImages) return;
    setIndex((current) => (current - 1 + selection.images.length) % selection.images.length);
    setDownloadError("");
  };
  const next = () => {
    if (!hasMultipleImages) return;
    setIndex((current) => (current + 1) % selection.images.length);
    setDownloadError("");
  };

  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      const imageUrl = new URL(image.url, window.location.href);
      if (imageUrl.protocol !== "http:" && imageUrl.protocol !== "https:") {
        throw new Error("Unsupported image protocol");
      }
      const backendOrigin = new URL(API_ORIGIN, window.location.href).origin;
      const isBackendUpload = imageUrl.origin === backendOrigin
        && /^\/uploads\/[a-z0-9][a-z0-9._-]*$/i.test(imageUrl.pathname);
      const downloadUrl = isBackendUpload
        ? `/api/catalogue-card-image?path=${encodeURIComponent(imageUrl.pathname)}`
        : imageUrl.href;
      const response = await fetch(downloadUrl, {
        credentials: isBackendUpload ? "same-origin" : imageUrl.origin === backendOrigin ? "include" : "omit",
        headers: !isBackendUpload && imageUrl.origin === backendOrigin ? requestHeaders || {} : {},
      });
      const contentType = response.headers.get("Content-Type") || "";
      if (!response.ok || !contentType.toLocaleLowerCase().startsWith("image/")) {
        throw new Error("Invalid image response");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = downloadFileName(image, selection.productCode, index + 1, response);
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      setDownloadError("Image download failed. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>PRODUCT IMAGES</small>
            <h2 id={titleId}>{selection.productName}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            aria-label="Close image preview"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className={styles.imageStage}>
          <img src={image.url} alt={image.altText} />
        </div>

        <p className={styles.position} aria-live="polite">
          {index + 1} of {selection.images.length}
        </p>
        {downloadError && <p className={styles.error} role="alert">{downloadError}</p>}

        <footer>
          <button type="button" disabled={!hasMultipleImages} onClick={previous} aria-label="Previous image">
            <span aria-hidden="true">‹</span> Previous
          </button>
          <button
            type="button"
            className={styles.download}
            disabled={downloading}
            aria-busy={downloading}
            onClick={() => void download()}
          >
            <span aria-hidden="true">↓</span> {downloading ? "Downloading..." : "Download image"}
          </button>
          <button type="button" disabled={!hasMultipleImages} onClick={next} aria-label="Next image">
            Next <span aria-hidden="true">›</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
