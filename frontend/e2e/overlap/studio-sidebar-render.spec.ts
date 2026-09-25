import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StudioAsset, StudioAvailableProduct, StudioDesign, StudioProductCardTemplate } from "../../src/lib/studio-api";

// Actual Next editor/CSS with visibly illustrative GET fixtures. These tests
// never sign in, upload, publish, export or write to a real catalogue.
const designId = "sidebar-illustrative-fixture";
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#e8f5ec"/><rect x="120" y="95" width="160" height="190" rx="20" fill="#126b3a"/><text x="200" y="330" text-anchor="middle" font-family="Arial" font-size="22" fill="#19382a">Illustrative fixture</text></svg>`;
const product: StudioAvailableProduct = {
  id: "fixture-product", sku: "FIXTURE-001", erp_name: "Illustrative USB adapter", display_name: "Illustrative USB adapter",
  name_en: "Illustrative USB adapter", name_th: null, description_en: null, description_th: null,
  how_to_use: null, remark: null, brand: "Illustrative brand", category: "Accessories", category_names: ["Accessories"],
  barcode: "0000000000000", barcodes: ["0000000000000"], unit: "piece", pack_size: 1, warranty: "Fixture only",
  stock_quantity: 12, price: "100", price_currency: "THB", prices: {}, primary_image_url: "/api/sidebar-fixture-image",
  image_urls: ["/api/sidebar-fixture-image"], images: [], has_video: false, product_status: "active", already_used: false,
  catalogue_visible: true, last_synchronized_at: "2026-09-15T00:00:00Z",
};
const assets: StudioAsset[] = ["adapter", "cable", "speaker", "display"].map((name, index) => ({
  id: `fixture-asset-${index}`, asset_type: "image", original_filename: `illustrative-${name}.jpg`, mime_type: "image/jpeg",
  file_size: 4096, width: 400, height: 400, alt_text: `Illustrative ${name}`, tags: [], url: "/api/sidebar-fixture-image", created_at: "2026-09-15",
}));
const template: StudioProductCardTemplate = {
  id: "fixture-layout", name: "Illustrative layout", description: "Wide USB accessory card", template_type: "erp_detail",
  template_data_json: { includedFields: ["image", "code"], style: {} }, card_width: 400, card_height: 250, border_radius: 10,
  dimension_unit: "px", layout_mode: "responsive", min_width: 200, min_height: 150, aspect_ratio: null, price_mode: "one_price",
  visibility_scope: "company", is_company_template: true, approval_status: "approved", current_version: 1,
  brand_scope_json: [], category_scope_json: [], thumbnail_storage_key: null, owner_user_id: null, is_active: true,
  created_at: "2026-09-15", updated_at: "2026-09-15",
};
const design: StudioDesign = {
  id: designId, catalogue_id: null, name: "Illustrative sidebar verification", status: "draft", page_width: 794, page_height: 1123,
  orientation: "portrait", size_preset: "a4_portrait", data_mode: "live", current_version: 0, revision: 1,
  catalogue_type: "standard", brand_mode: "single", start_at: null, end_at: null, timezone: "Asia/Bangkok", promotion_name: "",
  promotion_status: null, promotion_occasion_id: null, promotion_priority: 50, promotion_terms: "", selected_brands: [], price_slots: [], product_items: [],
  created_at: "2026-09-15", updated_at: "2026-09-15", pages: [{
    id: "fixture-page", design_id: designId, page_type: "blank", page_name: "Illustrative page", display_order: 1,
    width: 794, height: 1123, orientation: "portrait", background_color: "#FFFFFF", is_visible: true, is_locked: false,
    created_at: "2026-09-15", updated_at: "2026-09-15", page_data_json: {
      pageId: "fixture-page", pageType: "blank", name: "Illustrative page", dataMode: "live",
      canvas: { width: 794, height: 1123, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false, showGuides: true, showSafeArea: true, bleed: 0 },
      elements: [{ id: "fixture-text", type: "text", name: "Illustrative marker", text: "Illustrative fixture only — not customer data",
        xPercent: 10, yPercent: 15, widthPercent: 80, heightPercent: 10, rotation: 0, opacity: 1, zIndex: 1,
        locked: false, visible: true, style: { fontSize: 22, fontFamily: "Arial" }, responsive: {} }],
    },
  }],
};

async function openFixture(page: Page, width: number, options: { thai?: boolean; restricted?: boolean } = {}) {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((thai) => {
    localStorage.clear();
    localStorage.setItem("gms-catalogue-language", thai ? "th" : "en");
  }, Boolean(options.thai));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { "access-control-allow-origin": new URL(page.url() === "about:blank" ? "http://127.0.0.1" : page.url()).origin, "access-control-allow-credentials": "true" };
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    if (request.method() !== "GET") { writes.push(`${request.method()} ${path}`); await route.abort(); return; }
    if (path.includes("asset-content") || path === "/api/sidebar-fixture-image") {
      await route.fulfill({ contentType: "image/svg+xml", body: artwork, headers }); return;
    }
    let body: unknown = [];
    if (path.endsWith("/auth/me")) body = {
      id: "illustrative-user", username: "illustrative", full_name: "Illustrative user", email: "fixture@example.invalid",
      roles: [], permissions: options.restricted ? ["catalogue_designs.view"] : [], is_superadmin: !options.restricted,
    };
    else if (path.endsWith(`/designs/${designId}`)) body = design;
    else if (path.endsWith("/products/available")) {
      const needle = new URL(request.url()).searchParams.get("q")?.toLowerCase() || "";
      body = product.display_name.toLowerCase().includes(needle) ? [product] : [];
    } else if (path.endsWith("/pricing-overview")) body = { audiences: [], products: [] };
    else if (path.endsWith("/assets")) body = assets;
    else if (path.endsWith("/product-card-templates")) body = [template];
    else if (path.endsWith("/promotions")) body = { items: [], total: 0, page: 1, page_size: 100, pages: 0, summary: {} };
    await route.fulfill({ json: body, headers });
  });
  await page.goto(`/catalogue-studio/${designId}/editor`);
  await expect(page.getByText(design.name, { exact: true })).toBeVisible();
  return { writes, errors };
}

async function panelFor(page: Page, tool: string) {
  const rail = page.getByRole("navigation", { name: "Studio tools" });
  const button = rail.getByRole("button", { name: tool, exact: true });
  await button.click();
  const id = await button.getAttribute("aria-controls");
  return page.locator(`[id="${id}"]`);
}

for (const width of [375, 768, 1024, 1280, 1440]) {
  test(`actual editor sidebar with illustrative data is contained at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    const { writes, errors } = await openFixture(page, width);
    const rail = page.getByRole("navigation", { name: "Studio tools" });
    await expect(rail).toBeVisible();
    const railBounds = await rail.boundingBox();
    expect(railBounds?.width).toBe(72);
    const panel = await panelFor(page, "Products");
    await page.getByLabel("Find product", { exact: true }).fill("adapter");
    await expect(page.getByText(product.display_name, { exact: true })).toBeVisible();
    const bounds = await panel.boundingBox();
    expect(bounds?.x).toBe(72);
    expect(bounds?.width).toBe(276);
    expect((bounds?.x || 0) + (bounds?.width || 0)).toBeLessThanOrEqual(width);
    await expect(panel).toHaveAttribute("role", width < 1280 ? "dialog" : "region");
    const resize = page.getByRole("separator", { name: "Resize Elements panel" });
    if (width >= 1280) {
      await resize.press("ArrowRight");
      await expect.poll(async () => (await panel.boundingBox())?.width).toBe(292);
      await resize.dblclick();
      await expect.poll(async () => (await panel.boundingBox())?.width).toBe(276);
    } else await expect(resize).toHaveCount(0);
    await page.getByRole("button", { name: "Collapse tool panel" }).click();
    await expect(panel).toBeHidden();
    const canvas = page.getByTestId("studio-canvas-workspace");
    const canvasBounds = await canvas.boundingBox();
    expect(canvasBounds?.x).toBe(72);
    expect(canvasBounds?.width).toBeGreaterThan(width - 80);
    await expect(canvas.locator("canvas").first()).toBeVisible();
    await page.screenshot({ path: join(tmpdir(), `gms-studio-sidebar-collapsed-${width}.png`), fullPage: true });
    await rail.getByRole("button", { name: "Products", exact: true }).click();
    await expect(page.getByLabel("Find product", { exact: true })).toHaveValue("adapter");
    const uploads = await panelFor(page, "Uploads");
    await expect(page.getByRole("img", { name: "Illustrative adapter", exact: true })).toBeVisible();
    await expect.poll(() => page.getByRole("img", { name: "Illustrative adapter", exact: true }).evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(400);
    await page.getByLabel("Search uploads").fill("SPEAKER");
    await expect(page.getByRole("button", { name: /illustrative-speaker.jpg/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /illustrative-adapter.jpg/ })).toHaveCount(0);
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByRole("button", { name: /illustrative-adapter.jpg/ })).toBeVisible();
    if (width < 1280) {
      const close = page.getByRole("button", { name: "Collapse tool panel" });
      await close.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("button", { name: /illustrative-display.jpg/ })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
    }
    await expect(uploads).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: join(tmpdir(), `gms-studio-sidebar-uploads-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Collapse tool panel" }).focus();
    await page.keyboard.press("Escape");
    await expect(uploads).toBeHidden();
    await expect(rail.getByRole("button", { name: "Uploads", exact: true })).toBeFocused();
    const layouts = await panelFor(page, "Card layouts");
    await page.getByLabel("Search card layouts").fill("not-present");
    await expect(layouts.getByRole("status")).toHaveText("No card layouts match your search.");
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page.getByRole("button", { name: "Preview Illustrative layout" })).toBeVisible();
    await rail.getByRole("button", { name: "More tools" }).click();
    await page.getByRole("button", { name: "Layers", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Layers", exact: true })).toBeVisible();
    await expect(rail.getByRole("button", { name: "More tools" })).toHaveAttribute("aria-pressed", "true");
    await panelFor(page, "Cover");
    await expect(page.getByRole("button", { name: "Save cover", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Collapse tool panel" }).click();
    await expect(page.getByLabel("Choose cover image")).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("actual editor permission-filtered rail retains only existing view controls", async ({ page }) => {
  const { writes, errors } = await openFixture(page, 1440, { restricted: true });
  const rail = page.getByRole("navigation", { name: "Studio tools" });
  await expect(rail.getByRole("button", { name: "Products", exact: true })).toHaveCount(0);
  await expect(rail.getByRole("button", { name: "Uploads", exact: true })).toHaveCount(0);
  await panelFor(page, "Cover");
  await expect(page.getByLabel("Choose cover image")).toBeDisabled();
  await panelFor(page, "Pages");
  await expect(page.getByLabel("New page type")).toHaveCount(0);
  await rail.getByRole("button", { name: "More tools" }).click();
  await expect(page.getByRole("button", { name: "Prices", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Layers", exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("actual editor Thai rail and search controls remain readable", async ({ page }) => {
  const { writes, errors } = await openFixture(page, 1280, { thai: true });
  const rail = page.getByRole("navigation", { name: "เครื่องมือสตูดิโอ" });
  await rail.getByRole("button", { name: "ไฟล์อัปโหลด", exact: true }).click();
  await page.getByLabel("ค้นหาไฟล์อัปโหลด").fill("speaker");
  await expect(page.getByRole("button", { name: /illustrative-speaker.jpg/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "ยุบแผงเครื่องมือ" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), "gms-studio-sidebar-thai-1280.png"), fullPage: true });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
