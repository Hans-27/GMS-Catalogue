import { describe, expect, it } from "vitest";

import { buildStudioQrValue, createStudioQrDataUrl, studioQrAppearance } from "./studio-qr-code";

describe("Catalogue Studio QR generator", () => {
  it("encodes user-entered URLs and plain text without changing the content", () => {
    expect(buildStudioQrValue({ qrContentType: "url", qrValue: " https://example.com/catalogue " })).toBe("https://example.com/catalogue");
    expect(buildStudioQrValue({ qrContentType: "text", qrValue: "Product support desk" })).toBe("Product support desk");
  });

  it("creates phone and email QR payloads", () => {
    expect(buildStudioQrValue({ qrContentType: "phone", qrPhone: "+66 81 234 5678" })).toBe("tel:+66 81 234 5678");
    expect(buildStudioQrValue({ qrContentType: "email", qrEmail: "sales@example.com", qrEmailSubject: "Catalogue request", qrEmailBody: "Please send details" }))
      .toBe("mailto:sales@example.com?subject=Catalogue+request&body=Please+send+details");
  });

  it("creates a standards-compatible Wi-Fi payload and escapes reserved characters", () => {
    expect(buildStudioQrValue({ qrContentType: "wifi", qrWifiSecurity: "WPA", qrWifiSsid: "GMS;Guest", qrWifiPassword: "pass:word", qrWifiHidden: true }))
      .toBe("WIFI:T:WPA;S:GMS\\;Guest;P:pass\\:word;H:true;;");
  });

  it("clamps appearance values used by editor, preview and export", () => {
    expect(studioQrAppearance({ qrErrorCorrection: "H", qrMargin: 99, qrForeground: "#126B3A", qrBackground: "#FFFFFF" }))
      .toEqual({ foreground: "#126B3A", background: "#FFFFFF", errorCorrection: "H", margin: 8 });
  });

  it("generates a vector QR image for the canvas and preview", async () => {
    const dataUrl = await createStudioQrDataUrl("https://example.com/catalogue", { qrErrorCorrection: "M", qrMargin: 4 });
    expect(dataUrl).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(dataUrl.split(",", 2)[1])).toContain("<svg");
  });
});
