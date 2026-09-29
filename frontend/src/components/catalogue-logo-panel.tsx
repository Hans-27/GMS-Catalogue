"use client";

/* eslint-disable @next/next/no-img-element -- Catalogue logos can require the signed-in browser session and must not be proxied by Next Image. */

import { useState, type ReactNode, type SyntheticEvent } from "react";

import styles from "./catalogue-logo-panel.module.css";

type ColorBucket = {
  count: number;
  red: number;
  green: number;
  blue: number;
};

function channelHex(value: number) {
  return Math.round(value).toString(16).padStart(2, "0");
}

function strongestBucket(buckets: Map<string, ColorBucket>) {
  return [...buckets.values()].sort((left, right) => right.count - left.count)[0];
}

export function dominantLogoColor(pixels: Uint8ClampedArray): string | null {
  const saturated = new Map<string, ColorBucket>();
  const opaque = new Map<string, ColorBucket>();

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const alpha = pixels[index + 3];
    if (alpha < 128) continue;

    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const key = `${red >> 4}:${green >> 4}:${blue >> 4}`;
    const collection = maximum - minimum >= 32 && maximum >= 72 ? saturated : opaque;
    const bucket = collection.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count += 1;
    bucket.red += red;
    bucket.green += green;
    bucket.blue += blue;
    collection.set(key, bucket);
  }

  const selected = strongestBucket(saturated) ?? strongestBucket(opaque);
  if (!selected) return null;
  return `#${channelHex(selected.red / selected.count)}${channelHex(selected.green / selected.count)}${channelHex(selected.blue / selected.count)}`;
}

export function CatalogueLogoPanel({
  logoUrl,
  alt,
  children,
  className,
}: {
  logoUrl: string;
  alt: string;
  children?: ReactNode;
  className?: string;
}) {
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null);

  function readLogoColor(event: SyntheticEvent<HTMLImageElement>) {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(event.currentTarget, 0, 0, canvas.width, canvas.height);
      const color = dominantLogoColor(
        context.getImageData(0, 0, canvas.width, canvas.height).data,
      );
      if (color) setBackgroundColor(color);
    } catch {
      // Cross-origin or malformed images retain the blurred image fallback.
    }
  }

  return (
    <div
      className={`${styles.panel} ${className ?? ""}`}
      data-testid="catalogue-logo-panel"
      data-color-extracted={backgroundColor ? "true" : "false"}
      style={{ backgroundColor: backgroundColor ?? "#17231d" }}
    >
      <span
        className={styles.backdrop}
        style={{ backgroundImage: `url("${logoUrl}")` }}
        aria-hidden="true"
      />
      <img
        className={styles.logo}
        src={logoUrl}
        alt={alt}
        crossOrigin="anonymous"
        onLoad={readLogoColor}
      />
      {children}
    </div>
  );
}
