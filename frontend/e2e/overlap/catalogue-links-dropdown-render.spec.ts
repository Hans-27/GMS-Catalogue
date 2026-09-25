import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const catalogue = {
  id: "catalogue-1",
  title: "Nubwo Catalogue 2026",
  slug: "nubwo-catalogue-2026",
  description: "Current Nubwo product catalogue.",
  brand: "Nubwo",
  audience: "All ERP customer levels",
  catalogue_type: "standard",
  price_list_id: 1,
  price_list_name: "Normal",
  show_prices: true,
  currency: "THB",
  language: "en",
  status: "published",
  version: 1,
  revision: 1,
  valid_from: null,
  valid_until: null,
  is_public: true,
  owner_id: null,
  product_count: 2038,
  products: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-22T00:00:00Z",
  published_at: "2026-09-22T00:00:00Z",
};

const catalogueLinks = Array.from({ length: 5 }, (_, index) => ({
  id: `link-${index + 1}`,
  catalogue_id: catalogue.id,
  audience_type_id: index + 1,
  audience_code: ["normal", "vip", "big_customer", "retail", "no_price"][index],
  audience_name: ["Normal", "VIP BKK", "Big Customer", "Retail", "No Price"][index],
  price_list_id: index + 1,
  price_list_name: ["SP1", "SP2", "SP3", "SRP", "No Price"][index],
  show_prices: index !== 4,
  button_style_key: ["normal", "vip", "big_customer", "retail", "no_price"][index],
  status: "active",
  version_mode: "latest_published",
  fixed_version_number: null,
  expires_at: null,
  has_password: false,
  allow_pdf_download: true,
  allow_print: true,
  created_at: catalogue.created_at,
  updated_at: catalogue.updated_at,
  last_accessed_at: null,
  view_count: 0,
  public_url: `http://example.test/c/link-${index + 1}`,
}));

async function openFixture(page: Page, width: number) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width, height: 900 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("gms-catalogue-language", "en");
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
    };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (request.method() !== "GET") {
      await route.abort();
      return;
    }

    let body: unknown = [];
    if (path.endsWith("/auth/me")) {
      body = {
        id: "catalogue-admin",
        username: "catalogue-admin",
        full_name: "Catalogue Administrator",
        email: "catalogue@example.invalid",
        roles: ["superadmin"],
        permissions: [
          "dashboard.view",
          "catalogues.view",
          "catalogues.edit",
          "catalogues.preview",
          "catalogue_share_links.view",
          "catalogue_share_links.copy",
        ],
        is_superadmin: true,
      };
    } else if (path.endsWith("/v1/catalogues/brand-options")) {
      body = [];
    } else if (path.endsWith("/v1/catalogues")) {
      body = [catalogue];
    } else if (path.endsWith("/v1/catalogue-share-links/cards")) {
      body = { [catalogue.id]: catalogueLinks };
    } else if (path.endsWith("/v1/catalogue-audience-types")) {
      body = [];
    } else if (path.endsWith("/v1/price-lists")) {
      body = [];
    } else if (path.endsWith("/catalogue/products")) {
      body = { items: [], total: 0, page: 1, page_size: 20, pages: 1 };
    } else if (path.endsWith("/dashboard/sync-status")) {
      body = null;
    }
    await route.fulfill({ json: body, headers });
  });

  await page.goto("/dashboard?view=catalogues");
  const loadFailure = page.getByRole("heading", { name: /couldn.t load/i });
  if (await loadFailure.isVisible()) {
    throw new Error(`Catalogue fixture failed to load: ${errors.join(" | ")}`);
  }
  await expect(page.getByRole("heading", { name: "Catalogues", exact: true })).toBeVisible();
  return errors;
}

for (const width of [390, 1440]) {
  test(`catalogue links use a contained dropdown at ${width}px`, async ({ page }) => {
    const errors = await openFixture(page, width);
    const dropdown = page.getByRole("button", {
      name: "Catalogue links for Nubwo Catalogue 2026",
    });
    const priceLink = page.locator(
      '#catalogue-links-catalogue-1 button[data-style="normal"]',
    );

    await expect(dropdown).toHaveAttribute("aria-expanded", "false");
    await expect(priceLink).toHaveCount(0);
    await dropdown.click();
    await expect(dropdown).toHaveAttribute("aria-expanded", "true");
    await expect(priceLink).toBeVisible();
    await expect(priceLink).toContainText("Price");
    await expect(priceLink).not.toContainText("Normal");
    await expect(priceLink).toHaveAttribute("title", "Copy Price link using SP1");
    await expect(page.getByRole("button", { name: /No Price/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /VIP BKK/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Big Customer/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Retail$/ })).toHaveCount(0);

    const card = dropdown.locator("xpath=ancestor::article[1]");
    const dimensions = await card.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: join(tmpdir(), `gms-catalogue-links-dropdown-${width}.png`),
      fullPage: true,
    });
  });
}

test("catalogue links dropdown respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, 390);
  await page
    .getByRole("button", { name: "Catalogue links for Nubwo Catalogue 2026" })
    .click();
  await expect(page.locator("#catalogue-links-catalogue-1")).toHaveCSS(
    "animation-name",
    "none",
  );
});
