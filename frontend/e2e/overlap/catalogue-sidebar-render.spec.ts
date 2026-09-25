import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Actual Next routes with explicitly illustrative read-only responses. No login,
// publish, upload, export, ERP request or persistent catalogue write is performed.
const names = Array.from({ length: 26 }, (_, i) => i === 2 ? "Cleaning" : i === 4 ? "A very long illustrative category name that wraps without covering the product count or icon badge" : `Category ${i + 1}`);
const catalogue = {
  id: "viewer-sidebar-fixture", version: 5, title: "Illustrative catalogue — test data", description: "Illustrative fixture only, not customer or ERP data.",
  audience: "Normal", audience_type: "Normal", audience_code: "normal", language: "en", status: "published", is_draft: false,
  price_list: { id: 1, name: "Normal", show_price: true }, show_prices: true, currency: "THB", product_count: names.length,
  cover: null, allow_pdf_download: true, allow_print: true, password_protected: false,
  categories: names.map((name, i) => ({ slug: `fixture-${i}`, name, description: "Illustrative category", display_order: i + 1, product_count: 1, show_product_count: true, default_expanded: true })),
  products: names.map((name, i) => ({ id: `product-${i}`, code: `FIXTURE-${i}`, name: `${name} illustrative product`, name_en: `${name} illustrative product`,
    brand: "Illustrative brand", category_name: name, categories: [name], description: "Illustrative only", long_description: "", main_image_url: null,
    image_urls: [], barcode: `0000000000${String(i).padStart(3, "0")}`, stock_quantity: i, section_title: name, display_order: i, featured: false, price: "100.00", currency: "THB" })),
};
const pages = names.map((name, i) => ({ id: `page-${i}`, design_id: "viewer-sidebar-fixture", page_type: "free_layout", page_name: name, display_order: i,
  width: 794, height: 1123, orientation: "portrait", background_color: "#FFFFFF", is_visible: true, is_locked: false,
  page_data_json: { navigationCategory: name, canvas: { width: 794, height: 1123, backgroundColor: "#FFFFFF", gridSize: 10, showGrid: false }, elements: [
    { id: `text-${i}`, type: "text", name: "Illustrative section", text: `${name}: illustrative fixture only`, xPercent: 10, yPercent: 10, widthPercent: 80, heightPercent: 15,
      rotation: 0, opacity: 1, zIndex: 1, visible: true, locked: false, style: { fontSize: 24, color: "#103f2a" }, responsive: {} },
  ] },
}));
type Viewer = "internal" | "public" | "studio" | "public-studio";

async function openFixture(page: Page, viewer: Viewer, width: number, options: { thai?: boolean; restricted?: boolean; booklet?: boolean; denseProducts?: boolean } = {}) {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((thai) => { localStorage.clear(); localStorage.setItem("gms-catalogue-language", thai ? "th" : "en"); }, Boolean(options.thai));
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { "access-control-allow-origin": "http://127.0.0.1", "access-control-allow-credentials": "true" };
    if (request.method() === "OPTIONS") { await route.fulfill({ status: 204, headers }); return; }
    if (request.method() !== "GET") { writes.push(`${request.method()} ${path}`); await route.abort(); return; }
    if (path.includes("/pdf")) { await route.fulfill({ contentType: "application/pdf", body: "%PDF-1.4\n%%EOF", headers }); return; }
    let body: unknown = [];
    if (path.endsWith("/auth/me")) body = { id: "illustrative-user", username: "illustrative", full_name: "Illustrative user", email: "fixture@example.invalid",
      roles: [], permissions: options.restricted ? ["catalogues.view"] : [], is_superadmin: !options.restricted };
    else if (path.endsWith("/studio") || path.includes("/catalogue-studio/designs/")) body = {
      id: "viewer-sidebar-fixture", name: catalogue.title, revision: 1, product_items: [], pages, catalogue_type: options.booklet ? "booklet" : "standard",
    };
    else if (path.includes("/catalogues/")) body = { ...catalogue,
      ...(options.denseProducts ? {
        product_count: 10,
        categories: catalogue.categories.map((category, index) => index === 0 ? { ...category, product_count: 10 } : category),
        products: Array.from({ length: 10 }, (_, index) => ({
          ...catalogue.products[0], id: `dense-product-${index + 1}`, code: `DENSE-${index + 1}`,
          name: `Illustrative grid product ${index + 1}`, name_en: `Illustrative grid product ${index + 1}`, display_order: index + 1,
        })),
      } : {}),
      allow_pdf_download: !options.restricted, allow_print: !options.restricted,
      ...(viewer === "public-studio" ? { studio_design_id: "viewer-sidebar-fixture" } : {}) };
    await route.fulfill({ json: body, headers });
  });
  const url = viewer === "internal" ? "/catalogues/viewer-sidebar-fixture/preview" : viewer === "studio" ? "/catalogue-studio/viewer-sidebar-fixture/preview" : "/c/viewer-sidebar-fixture-token";
  await page.goto(url);
  const label = options.thai ? viewer === "studio" ? "ส่วนต่าง ๆ ของแคตตาล็อก" : "หมวดหมู่แคตตาล็อก" : viewer === "studio" ? "Catalogue sections" : "Catalogue categories";
  await expect(page.locator(`aside[aria-label="${label}"]`)).toHaveCount(1);
  return { writes, errors, label };
}

test("public catalogue mobile header swaps the GMS logo and Categories positions", async ({ page }) => {
  const { writes, errors } = await openFixture(page, "public", 400);
  const trigger = page.getByRole("button", { name: "Categories", exact: true });
  const mobileBrand = page.getByRole("link", { name: "Back to Dashboard", exact: true });
  const mobileHeader = mobileBrand.locator("..");
  const mobileMenuRow = trigger.locator("..");
  const search = mobileHeader.getByRole("searchbox", { name: "Search products" });

  await expect(trigger).not.toContainText("Categories");
  await expect(trigger.locator('[aria-hidden="true"]')).toHaveText("☰");
  await expect(mobileBrand.getByRole("img", { name: "G.M.S. Corporation Co., Ltd." })).toBeVisible();
  await expect(search).toBeVisible();
  await expect(search).toHaveAttribute("placeholder", "Search products");
  await expect(mobileHeader.getByText(catalogue.title, { exact: true })).toHaveCount(0);
  await expect(mobileHeader.getByRole("button", { name: "EN", exact: true })).toBeVisible();
  await expect(mobileHeader.getByRole("button", { name: "ไทย", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeHidden();

  const triggerBounds = await trigger.boundingBox();
  const brandBounds = await mobileBrand.boundingBox();
  const searchBounds = await search.boundingBox();
  const searchShellBounds = await search.locator("..").boundingBox();
  const mobileHeaderBounds = await mobileHeader.boundingBox();
  const mobileMenuRowBounds = await mobileMenuRow.boundingBox();
  const thaiBounds = await mobileHeader.getByRole("button", { name: "ไทย", exact: true }).boundingBox();
  // Regression guard: the compact category trigger must remain fully inset in
  // its white mobile row instead of touching or overlapping either header edge.
  expect(triggerBounds!.height).toBeLessThanOrEqual(40);
  expect(triggerBounds!.y).toBeGreaterThanOrEqual(mobileMenuRowBounds!.y + 6);
  expect(triggerBounds!.y + triggerBounds!.height).toBeLessThanOrEqual(mobileMenuRowBounds!.y + mobileMenuRowBounds!.height - 6);
  expect(triggerBounds!.width).toBeLessThanOrEqual(48);
  expect(Math.abs(triggerBounds!.x - brandBounds!.x)).toBeLessThanOrEqual(2);
  expect(mobileMenuRowBounds!.y).toBeGreaterThanOrEqual(mobileHeaderBounds!.y + mobileHeaderBounds!.height);
  expect(searchBounds!.x).toBeGreaterThan(brandBounds!.x + brandBounds!.width);
  expect(Math.abs(searchBounds!.y - brandBounds!.y)).toBeLessThanOrEqual(4);
  expect(searchShellBounds!.width).toBeGreaterThanOrEqual(210);
  expect(searchShellBounds!.width).toBeLessThanOrEqual(230);
  expect(mobileHeaderBounds!.x + mobileHeaderBounds!.width - (thaiBounds!.x + thaiBounds!.width)).toBeLessThanOrEqual(14);

  await search.fill("Category 1");
  await expect(search).toHaveValue("Category 1");
  await expect(page.getByRole("heading", { name: "Category 1 illustrative product" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), "gms-catalogue-mobile-header-search-400.png") });

  await page.setViewportSize({ width: 320, height: 812 });
  await expect(search).toBeVisible();
  await expect(mobileHeader.getByRole("button", { name: "EN", exact: true })).toBeVisible();
  await expect(mobileHeader.getByRole("button", { name: "ไทย", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(trigger).toBeHidden();
  const desktopSidebar = page.getByRole("complementary", { name: "Catalogue categories" });
  await expect(desktopSidebar.getByRole("searchbox", { name: "Search products" })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "EN", exact: true })).toBeVisible();
  await expect(page.getByRole("banner").getByRole("button", { name: "ไทย", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(tmpdir(), "gms-catalogue-sidebar-search-1440.png") });
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("public catalogue mobile view shows a native right-edge scrollbar", async ({ page }) => {
  const { errors } = await openFixture(page, "public", 400, { denseProducts: true });
  const scrollbar = await page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const catalogueLayout = document.querySelector<HTMLElement>("[data-catalogue-navigation]")?.parentElement;
    return {
      overflowY: style.overflowY,
      scrollbarColor: style.scrollbarColor,
      scrollbarGutter: style.scrollbarGutter,
      reservedRightEdge: catalogueLayout ? innerWidth - catalogueLayout.getBoundingClientRect().right : 0,
      canScroll: root.scrollHeight > root.clientHeight,
    };
  });

  expect(scrollbar.canScroll).toBe(true);
  expect(scrollbar.overflowY).toBe("scroll");
  expect(scrollbar.scrollbarGutter).toBe("stable");
  expect(scrollbar.scrollbarColor).toBe("rgb(82, 118, 95) rgb(238, 243, 239)");
  expect(scrollbar.reservedRightEdge).toBeGreaterThanOrEqual(8);
  await page.mouse.wheel(0, 420);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await page.screenshot({ path: join(tmpdir(), "gms-catalogue-mobile-scrollbar-400.png") });

  await page.setViewportSize({ width: 320, height: 812 });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe("scroll");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflowY)).toBe("visible");
  expect(errors).toEqual([]);
});

for (const viewer of ["internal", "public"] as const) {
  test(`${viewer} catalogue uses a five-column vertical product grid`, async ({ page }) => {
    const { errors } = await openFixture(page, viewer, 1440, { denseProducts: true });
    const cards = page.locator("[data-catalogue-product-card]");
    await expect(cards).toHaveCount(10);
    const firstCard = cards.first();
    await expect(firstCard).toHaveAttribute("data-card-template", "catalogue-reference");
    await expect(firstCard).not.toHaveAttribute("data-card-style");
    await expect(firstCard).not.toHaveAttribute("style");
    await expect(firstCard.getByText("Stock", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Barcode", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Wholesale price", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Online price", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Intransit / Order", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Retail price", { exact: true })).toBeVisible();
    await expect(firstCard.getByRole("table")).toHaveCount(0);
    await expect(firstCard.getByRole("button", { name: /Download product card|Previous image|Next image/ })).toHaveCount(0);
    const grid = cards.first().locator("..");
    const desktop = await grid.evaluate((element) => ({
      columns: getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length,
      overflowX: getComputedStyle(element).overflowX,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(desktop.columns).toBe(5);
    expect(desktop.overflowX).not.toBe("auto");
    expect(desktop.scrollWidth).toBeLessThanOrEqual(desktop.clientWidth);

    const desktopCards = await cards.evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top) };
    }));
    expect(new Set(desktopCards.slice(0, 5).map(({ top }) => top)).size).toBe(1);
    expect(desktopCards[5].top).toBeGreaterThan(desktopCards[0].top);
    expect(Math.abs(desktopCards[5].left - desktopCards[0].left)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: join(tmpdir(), `gms-catalogue-reference-${viewer}-1440.png`), fullPage: true });

    for (const [width, columns] of [[1024, 3], [768, 2], [375, 1]] as const) {
      await page.setViewportSize({ width, height: 812 });
      await expect.poll(() => grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").filter(Boolean).length)).toBe(columns);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const mobileCards = await cards.evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: Math.round(box.left), top: Math.round(box.top) };
    }));
    expect(new Set(mobileCards.map(({ left }) => left)).size).toBe(1);
    expect(mobileCards.every((card, index) => index === 0 || card.top > mobileCards[index - 1].top)).toBe(true);
    await page.screenshot({ path: join(tmpdir(), `gms-catalogue-reference-${viewer}-375.png`), fullPage: true });
    expect(errors).toEqual([]);
  });
}

for (const viewer of ["internal", "public", "studio", "public-studio"] as const) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`${viewer} shared catalogue sidebar at ${width}px`, async ({ page }) => {
      test.setTimeout(90_000);
      const { writes, errors, label } = await openFixture(page, viewer, width);
      const sidebar = page.locator(`aside[aria-label="${label}"]`);
      let navigation = sidebar;
      if (width <= 900) {
        await expect(sidebar).toBeHidden();
        const trigger = page.getByRole("button", { name: "Categories", exact: true });
        await trigger.click();
        navigation = page.getByRole("dialog", { name: label });
        await expect(navigation.getByRole("searchbox")).toBeFocused();
        await expect(navigation).toHaveCSS("height", "900px");
        await page.screenshot({ path: join(tmpdir(), `gms-catalogue-sidebar-${viewer}-drawer-${width}.png`) });
        await page.keyboard.press("Escape");
        await expect(navigation).toBeHidden();
        await expect(trigger).toBeFocused();
        await trigger.click();
      } else {
        await expect(sidebar).toBeVisible();
        await expect(sidebar).toHaveCSS("background-color", "rgb(16, 63, 42)");
        const bounds = await sidebar.boundingBox();
        expect(bounds?.x).toBe(0);
        expect(bounds?.y).toBe(0);
        expect(bounds?.width).toBe(280);
        expect(bounds?.height).toBe(900);
      }
      const scroll = navigation.getByRole("region", { name: "PRODUCT CATEGORIES" });
      await expect.poll(() => scroll.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
      await expect.poll(() => scroll.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await navigation.getByRole("searchbox").fill("Cleaning");
      const category = navigation.getByRole(viewer === "internal" || viewer === "studio" ? "button" : "link", { name: /^Cleaning,/ });
      await expect(category).toHaveText(viewer === "public-studio" ? /1 page$/ : /1$/);
      if (viewer === "studio") await expect(category).toHaveAttribute("aria-label", "Cleaning, 1 page");
      await category.click();
      if (width <= 900) await expect(navigation).toBeHidden();
      else await expect(category).toHaveAttribute("aria-current", "page");
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Wait for smooth document navigation to settle before capturing sticky layers.
      await page.waitForFunction(() => {
        const state = window as unknown as { sidebarScroll?: { y: number; stable: number } };
        const previous = state.sidebarScroll;
        state.sidebarScroll = { y: scrollY, stable: previous?.y === scrollY ? previous.stable + 1 : 0 };
        return state.sidebarScroll.stable >= 12;
      });
      if (width > 900) {
        expect((await sidebar.boundingBox())?.y).toBe(0);
        await expect(category).toHaveAttribute("aria-current", "page");
      }
      if (viewer === "internal" && width <= 900) await expect(page.getByRole("button", { name: "EN", exact: true })).toBeVisible();
      await page.screenshot({ path: join(tmpdir(), `gms-catalogue-sidebar-${viewer}-${width}.png`) });
      await page.emulateMedia({ media: "print" });
      await expect(sidebar).toBeHidden();
      await expect(page.getByRole("button", { name: "Categories", exact: true })).toBeHidden();
      expect(writes).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

for (const viewer of ["internal", "public", "studio", "public-studio"] as const) {
  test(`${viewer} Thai sidebar and guarded catalogue actions`, async ({ page }) => {
    const { writes, errors, label } = await openFixture(page, viewer, 1440, { thai: true, restricted: true });
    const sidebar = page.getByRole("complementary", { name: label });
    await expect(sidebar.getByRole("searchbox")).toHaveAttribute("aria-label", viewer === "studio" || viewer === "public-studio" ? "ค้นหาหมวดหมู่" : "ค้นหาสินค้า");
    await sidebar.getByRole("searchbox").fill("unmatched-category");
    await expect(sidebar.getByText("ไม่พบหมวดหมู่ที่ตรงกัน")).toBeVisible();
    if (viewer !== "studio") {
      await expect(page.getByRole("button", { name: "ดาวน์โหลด PDF", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "พิมพ์", exact: true })).toHaveCount(0);
    }
    await page.screenshot({ path: join(tmpdir(), `gms-catalogue-sidebar-${viewer}-thai.png`) });
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("internal catalogue collapse keeps badge navigation and restores search", async ({ page }) => {
  const { errors } = await openFixture(page, "internal", 1440);
  const sidebar = page.getByRole("complementary", { name: "Catalogue categories" });
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "72px");
  await expect(sidebar.getByRole("searchbox")).toBeHidden();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "280px");
  await expect(sidebar.getByRole("searchbox")).toBeVisible();
  expect(errors).toEqual([]);
});

for (const viewer of ["studio", "public-studio"] as const) {
  test(`${viewer} booklet navigation remains available outside fullscreen`, async ({ page }) => {
    const { errors, label } = await openFixture(page, viewer, 375, { booklet: true });
    await page.getByRole("button", { name: "Categories", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: label });
    await drawer.getByRole("searchbox").fill("Cleaning");
    await drawer.getByRole(viewer === "studio" ? "button" : "link", { name: /^Cleaning,/ }).click();
    await expect(drawer).toBeHidden();
    const marker = viewer === "studio" ? page.getByRole("region", { name: "Booklet catalogue viewer" }) : page.locator("#studio-catalogue");
    await expect(marker.getByText("Cleaning: illustrative fixture only", { exact: true }).first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

for (const viewer of ["internal", "public", "studio", "public-studio"] as const) {
  test(`${viewer} active category follows document scrolling without a navigation click`, async ({ page }) => {
    const { label } = await openFixture(page, viewer, 1440);
    const id = viewer === "studio" ? "studio-preview-page-page-2" : viewer === "public-studio" ? "studio-page-3" : "category-fixture-2";
    await page.locator(`[id="${id}"]`).evaluate((element) => element.scrollIntoView({ behavior: "instant", block: "start" }));
    const category = page.getByRole("complementary", { name: label }).getByRole(viewer === "studio" || viewer === "internal" ? "button" : "link", { name: /^Cleaning,/ });
    await expect(category).toHaveAttribute("aria-current", "page");
  });
}

test("shared sidebar rendered contrast and long-label/large-count sizing", async ({ page }) => {
  await openFixture(page, "public", 1440);
  const sidebar = page.getByRole("complementary", { name: "Catalogue categories" });
  const row = sidebar.getByRole("link", { name: /^A very long illustrative category/ });
  await row.scrollIntoViewIfNeeded();
  // Sizing-only DOM stress in this illustrative page; no source/API count changes.
  await row.locator("small").evaluate((element) => { element.textContent = "100000"; });
  const boxes = await row.evaluate((element) => {
    const label = element.querySelector("span")!.getBoundingClientRect();
    const count = element.querySelector("small")!.getBoundingClientRect();
    return { labelRight: label.right, countLeft: count.left, countRight: count.right, rowRight: element.getBoundingClientRect().right };
  });
  expect(boxes.labelRight).toBeLessThan(boxes.countLeft);
  expect(boxes.countRight).toBeLessThanOrEqual(boxes.rowRight);
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "page");
  const colors = await row.evaluate((element) => {
    const current = getComputedStyle(element);
    const count = getComputedStyle(element.querySelector("small")!);
    return { text: current.color, muted: count.color, background: current.backgroundColor, border: current.borderColor };
  });
  const search = await sidebar.getByRole("searchbox").evaluate((element) => {
    const parent = getComputedStyle(element.parentElement!);
    const placeholder = getComputedStyle(element, "::placeholder");
    return { text: getComputedStyle(element).color, background: parent.backgroundColor, border: parent.borderColor, placeholder: placeholder.color };
  });
  function contrast(a: string, b: string) {
    const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((value) => value / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const first = luminance(a); const second = luminance(b);
    return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
  }
  expect(contrast(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.muted, colors.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(colors.border, colors.background)).toBeGreaterThanOrEqual(3);
  expect(contrast(search.text, search.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(search.placeholder, search.background)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(search.border, search.background)).toBeGreaterThanOrEqual(3);
  await sidebar.getByRole("searchbox").focus();
  await expect(sidebar.getByRole("searchbox").locator("..")).toHaveCSS("outline-style", "solid");
});

for (const width of [375, 1440]) {
  test(`public booklet category scrolling does not turn pages at ${width}px`, async ({ page }) => {
    const { label } = await openFixture(page, "public-studio", width, { booklet: true });
    let navigation = page.getByRole("complementary", { name: label });
    if (width <= 900) {
      await page.getByRole("button", { name: "Categories", exact: true }).click();
      navigation = page.getByRole("dialog", { name: label });
    }
    const spreadPages = page.locator('#studio-catalogue [role="group"] [data-studio-page-id]');
    await expect(spreadPages).toHaveCount(1);
    await expect(spreadPages).toHaveAttribute("data-studio-page-id", "page-0");
    const scroll = navigation.getByRole("region", { name: "PRODUCT CATEGORIES" });
    await scroll.hover();
    await page.mouse.wheel(0, 240);
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(spreadPages).toHaveCount(1);
    await expect(spreadPages).toHaveAttribute("data-studio-page-id", "page-0");
  });
}
