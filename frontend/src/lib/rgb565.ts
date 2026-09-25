export type RgbColor = { r: number; g: number; b: number };
export type HslColor = { h: number; s: number; l: number };

function channel(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new Error("RGB channels must be between 0 and 255.");
  }
  return Math.round(value);
}

export function rgbToRgb565({ r, g, b }: RgbColor): number {
  const r5 = Math.round((channel(r) * 31) / 255);
  const g6 = Math.round((channel(g) * 63) / 255);
  const b5 = Math.round((channel(b) * 31) / 255);
  return (r5 << 11) | (g6 << 5) | b5;
}

export function rgb565ToRgb(value: number): RgbColor {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error("RGB565 must be between 0x0000 and 0xFFFF.");
  }
  return {
    r: Math.round(((value >> 11) & 0x1f) * 255 / 31),
    g: Math.round(((value >> 5) & 0x3f) * 255 / 63),
    b: Math.round((value & 0x1f) * 255 / 31),
  };
}

export function parseRgb565(input: string, mode: "hex" | "decimal" = "hex") {
  const normalized = input.trim();
  if (!normalized) throw new Error("Enter an RGB565 value.");
  const value = mode === "decimal"
    ? Number(normalized)
    : Number.parseInt(normalized.replace(/^0x/i, ""), 16);
  if (!Number.isInteger(value) || value < 0 || value > 0xffff || (mode === "hex" && !/^(?:0x)?[0-9a-f]{1,4}$/i.test(normalized))) {
    throw new Error("RGB565 must be between 0x0000 and 0xFFFF.");
  }
  return value;
}

export function rgbToHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b].map((value) => channel(value).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

export function hexToRgb(hex: string): RgbColor {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error("Use a six-digit HEX color.");
  return { r: Number.parseInt(normalized.slice(0, 2), 16), g: Number.parseInt(normalized.slice(2, 4), 16), b: Number.parseInt(normalized.slice(4, 6), 16) };
}

export function formatRgb565(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new Error("Invalid RGB565 value.");
  return `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

export function rgbToHsl({ r, g, b }: RgbColor): HslColor {
  const red = channel(r) / 255; const green = channel(g) / 255; const blue = channel(b) / 255;
  const maximum = Math.max(red, green, blue); const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum; const lightness = (maximum + minimum) / 2;
  let hue = 0;
  if (delta) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60; if (hue < 0) hue += 360;
  }
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;
  return { h: Math.round(hue), s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

export function hslToRgb({ h, s, l }: HslColor): RgbColor {
  if (![h, s, l].every(Number.isFinite) || h < 0 || h > 360 || s < 0 || s > 100 || l < 0 || l > 100) {
    throw new Error("HSL must use hue 0-360 and saturation/lightness 0-100.");
  }
  const saturation = s / 100; const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const section = (h % 360) / 60; const secondary = chroma * (1 - Math.abs(section % 2 - 1));
  const [red, green, blue] = section < 1 ? [chroma, secondary, 0] : section < 2 ? [secondary, chroma, 0] : section < 3 ? [0, chroma, secondary] : section < 4 ? [0, secondary, chroma] : section < 5 ? [secondary, 0, chroma] : [chroma, 0, secondary];
  const match = lightness - chroma / 2;
  return { r: Math.round((red + match) * 255), g: Math.round((green + match) * 255), b: Math.round((blue + match) * 255) };
}
