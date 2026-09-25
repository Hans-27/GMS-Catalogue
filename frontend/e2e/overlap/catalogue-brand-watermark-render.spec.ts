import { expect, test } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

const catalogue = {
  catalogue_id: "brand-watermark-fixture",
  version: 1,
  title: "Illustrative Brand Catalogue",
  description: "Illustrative fixture only.",
  audience: "Normal",
  audience_type: "Normal",
  audience_code: "normal",
  language: "en",
  status: "published",
  is_draft: false,
  price_list: { id: 1, name: "Normal", show_price: true },
  show_prices: true,
  currency: "THB",
  product_count: 1,
  generated_at: "2026-09-22T00:00:00+07:00",
  cover: {
    assets: [
      {
        asset_type: "full_cover",
        file_url: "/api/fixture-cover-logo.webp",
        preview_url: "",
      },
      {
        asset_type: "brand_logo",
        file_url: "/api/fixture-brand-logo.svg",
        preview_url: "",
      },
    ],
  },
  categories: [
    {
      slug: "products",
      name: "Products",
      description: "",
      display_order: 1,
      product_count: 1,
      show_product_count: true,
      default_expanded: true,
    },
  ],
  products: [
    {
      id: "fixture-product",
      code: "FIXTURE-001",
      name: "Illustrative product",
      name_en: "Illustrative product",
      brand: "Illustrative Brand",
      category_name: "Products",
      categories: ["Products"],
      description: "Illustrative only.",
      long_description: "",
      main_image_url: null,
      image_urls: [],
      section_title: "Products",
      display_order: 1,
      featured: false,
      price: "100.00",
      currency: "THB",
    },
  ],
  allow_pdf_download: false,
  allow_print: false,
  password_protected: false,
};

const logo = `
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="420" viewBox="0 0 900 420">
    <rect width="900" height="420" fill="black"/>
    <circle cx="210" cy="210" r="145" fill="none" stroke="white" stroke-width="24"/>
    <path d="M145 215 205 275 315 135" fill="none" stroke="white" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="390" y="245" font-family="Arial, sans-serif" font-size="112" font-weight="800" fill="white">BRAND</text>
  </svg>`;

for (const width of [375, 1440]) {
  test(`brand logo fills the generated green cover as a watermark at ${width}px`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/fixture-brand-logo.svg") {
        await route.fulfill({ contentType: "image/svg+xml", body: logo });
        return;
      }
      if (path === "/api/fixture-cover-logo.webp") {
        await route.fulfill({
          contentType: "image/webp",
          body: await sharp(Buffer.from(logo)).webp().toBuffer(),
        });
        return;
      }
      await route.fulfill({ json: catalogue });
    });

    await page.goto("/c/brand-watermark-fixture-token");
    const cover = page.locator("#cover section");
    const watermark = cover.locator('[data-catalogue-brand-watermark="true"]');
    const coverLogo = cover.locator('[data-catalogue-cover-artwork="true"]');

    await expect(page.getByRole("heading", { name: catalogue.title })).toBeVisible();
    await expect(page.getByRole("link", { name: /Explore products/ })).toBeVisible();
    await expect(watermark).toBeVisible();
    await expect(watermark).toHaveAttribute("aria-hidden", "true");
    await expect(watermark).toHaveCSS("mix-blend-mode", "screen");
    await expect(watermark).toHaveCSS("pointer-events", "none");
    await expect(watermark).toHaveCSS("opacity", width === 375 ? "0.16" : "0.28");
    await expect(cover).toHaveAttribute("data-logo-layout", "background-watermark");
    await expect(coverLogo).toHaveCount(0);
    await expect(cover).toHaveCSS("overflow", "hidden");
    const [coverBox, watermarkBox] = await Promise.all([
      cover.boundingBox(),
      watermark.boundingBox(),
    ]);
    const renderedPage = await page.screenshot();
    const logoBackgroundPixel = await sharp(renderedPage)
      .extract({
        left: Math.round(Math.max(coverBox!.x, watermarkBox!.x) + 8),
        top: Math.round(Math.max(coverBox!.y, watermarkBox!.y) + 8),
        width: 1,
        height: 1,
      })
      .removeAlpha()
      .raw()
      .toBuffer();
    expect(logoBackgroundPixel[1]).toBeGreaterThan(40);
    await expect.poll(() => watermark.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

    expect(watermarkBox!.x + watermarkBox!.width).toBeGreaterThan(coverBox!.x + coverBox!.width / 2);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: join(tmpdir(), `gms-catalogue-brand-watermark-${width}.png`),
      fullPage: true,
    });
  });
}
