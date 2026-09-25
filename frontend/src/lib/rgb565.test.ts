import { describe, expect, it } from "vitest";
import { formatRgb565, hexToRgb, hslToRgb, parseRgb565, rgb565ToRgb, rgbToHex, rgbToHsl, rgbToRgb565 } from "./rgb565";

describe("RGB565", () => {
  it("converts primary colors in both directions", () => {
    expect(formatRgb565(rgbToRgb565({ r: 255, g: 0, b: 0 }))).toBe("0xF800");
    expect(rgb565ToRgb(0xf800)).toEqual({ r: 255, g: 0, b: 0 });
    expect(rgbToHex(rgb565ToRgb(0x07e0))).toBe("#00FF00");
    expect(hexToRgb("#0000FF")).toEqual({ r: 0, g: 0, b: 255 });
  });

  it("accepts hexadecimal and explicitly selected decimal formats", () => {
    expect(parseRgb565("F800")).toBe(0xf800);
    expect(parseRgb565("0xF800")).toBe(0xf800);
    expect(parseRgb565("63488", "decimal")).toBe(0xf800);
  });

  it("rejects values outside 16-bit range", () => {
    expect(() => parseRgb565("10000")).toThrow();
    expect(() => parseRgb565("65536", "decimal")).toThrow();
  });

  it("converts browser RGB and HSL representations", () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
    expect(hslToRgb({ h: 120, s: 100, l: 50 })).toEqual({ r: 0, g: 255, b: 0 });
    expect(() => hslToRgb({ h: 0, s: 101, l: 50 })).toThrow();
  });
});
