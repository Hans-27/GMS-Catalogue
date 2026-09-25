import { describe, expect, it } from "vitest";
import { studioImageDownloadUrl } from "./studio-image-download";

describe("studio image downloads", () => {
  it("requests authenticated Studio media as an attachment", () => {
    const url = new URL(studioImageDownloadUrl(
      "/api/v1/catalogue-studio/designs/design-1/products/product-1/images/image-1",
      "ERP-product.webp",
    ));
    expect(url.pathname).toBe("/api/catalogue-studio/image-download");
    expect(url.searchParams.get("source")).toBe("/api/v1/catalogue-studio/designs/design-1/products/product-1/images/image-1");
    expect(url.searchParams.get("filename")).toBe("ERP-product.webp");
  });

  it("does not rewrite external image providers", () => {
    expect(studioImageDownloadUrl("https://images.example.com/product.webp"))
      .toBe("https://images.example.com/product.webp");
  });
});
