"use client";

import type { CSSProperties } from "react";

export function studioBarcodeWidths(value: string) {
  const widths = [2, 1, 2, 1, 3, 1];
  for (const character of value) {
    const code = character.charCodeAt(0);
    widths.push(1 + (code & 3), 1 + ((code >> 2) & 3), 1 + ((code >> 4) & 3), 1 + ((code >> 6) & 3));
  }
  widths.push(2, 3, 1, 2);
  return widths;
}

export function StudioBarcodeGraphic({ value, color = "#111111", style }: { value: string; color?: string; style?: CSSProperties }) {
  const widths = studioBarcodeWidths(value);
  const total = Math.max(1, widths.reduce((sum, width) => sum + width, 0));
  const starts = widths.map((_, index) => widths.slice(0, index).reduce((sum, width) => sum + width, 0));

  return <svg
    aria-hidden="true"
    data-studio-barcode="true"
    viewBox={`0 0 ${total} 100`}
    preserveAspectRatio="none"
    style={{ display: "block", width: "100%", height: "100%", color, ...style }}
  >
    {widths.map((width, index) => index % 2 === 0
      ? <rect key={`${starts[index]}-${width}`} x={starts[index]} y="0" width={width} height="100" fill="currentColor" />
      : null)}
  </svg>;
}
