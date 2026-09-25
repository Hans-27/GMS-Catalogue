import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const categories = [
  {
    id: 1,
    name: "Mouse",
    slug: "mouse",
    description: "Pointing devices",
    is_active: true,
    product_count: 8,
    brands: [
      { id: 10, name: "EGA", product_count: 3, is_active: true, inactive_reason: "" },
      { id: 11, name: "Nubwo", product_count: 5, is_active: true, inactive_reason: "" },
    ],
  },
  {
    id: 2,
    name: "Keyboard",
    slug: "keyboard",
    description: "Input devices",
    is_active: false,
    product_count: 4,
    inactive_reason: "Seasonal range paused",
    brands: [{ id: 11, name: "Nubwo", product_count: 4, is_active: true, inactive_reason: "" }],
  },
];

async function openFixture(page: Page, width: number) {
  const writes: string[] = [];
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
    if (request.method() === "PATCH" && path.endsWith("/catalogue/categories/2")) {
      writes.push(`${request.method()} ${path}`);
      await route.fulfill({
        json: { ...categories[1], is_active: true },
        headers,
      });
      return;
    }
    if (request.method() !== "GET") {
      writes.push(`${request.method()} ${path}`);
      await route.abort();
      return;
    }

    let body: unknown = [];
    if (path.endsWith("/auth/me")) {
      body = {
        id: "category-admin",
        username: "category-admin",
        full_name: "Category Administrator",
        email: "category@example.invalid",
        roles: ["superadmin"],
        permissions: ["categories.view", "categories.edit", "dashboard.view"],
        is_superadmin: true,
      };
    } else if (path.endsWith("/catalogue/categories")) {
      body = categories;
    } else if (path.endsWith("/dashboard/sync-status")) {
      body = null;
    }
    await route.fulfill({ json: body, headers });
  });

  await page.goto("/dashboard?view=categories");
  await expect(
    page.getByRole("heading", { name: "Categories", exact: true }),
  ).toBeVisible();
  return { writes, errors };
}

for (const width of [390, 1440]) {
  test(`category status management is contained at ${width}px`, async ({ page }) => {
    const { writes, errors } = await openFixture(page, width);
    await expect(
      page.getByRole("group", { name: "Filter categories by brand" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "All brands" })).toHaveCount(0);
    const egaDropdown = page.getByRole("button", { name: "EGA categories" });
    await expect(egaDropdown).toHaveAttribute("aria-expanded", "false");

    await egaDropdown.click();
    await expect(egaDropdown).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Mouse", { exact: true })).toBeVisible();
    await expect(page.getByText("Keyboard", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Nubwo categories" }).click();
    const keyboardStatus = page.getByRole("switch", {
      name: "Keyboard (Nubwo) category status",
    });
    await expect(keyboardStatus).toHaveAttribute("aria-checked", "false");
    await keyboardStatus.click();
    await expect(keyboardStatus).toHaveAttribute("aria-checked", "true");
    expect(writes).toContain("PATCH /api/catalogue/categories/2");

    await page
      .getByRole("switch", { name: "Mouse (EGA) category status" })
      .click();
    const disableDialog = page.getByRole("dialog", {
      name: "Disable category",
    });
    await expect(disableDialog).toBeVisible();
    const confirmDisable = disableDialog.getByRole("button", {
      name: "Disable category",
    });
    await expect(confirmDisable).toBeDisabled();
    await disableDialog
      .getByLabel("Reason for disabling")
      .fill("Seasonal range paused");
    await expect(confirmDisable).toBeEnabled();
    await disableDialog.getByRole("button", { name: "Cancel" }).click();

    const panel = page
      .getByRole("heading", { name: "Categories", exact: true })
      .locator("xpath=ancestor::section[1]");
    const panelBounds = await panel.boundingBox();
    expect((panelBounds?.x || 0) + (panelBounds?.width || 0)).toBeLessThanOrEqual(
      width,
    );
    const panelWidth = await panel.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(panelWidth.scroll).toBeLessThanOrEqual(panelWidth.client);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: join(tmpdir(), `gms-category-management-${width}.png`),
      fullPage: true,
    });
  });
}

test("brand dropdown reveal respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixture(page, 390);

  await page.getByRole("button", { name: "EGA categories" }).click();
  const rows = page.locator("#brand-categories-10");
  await expect(rows).toBeVisible();
  await expect(rows).toHaveCSS("animation-name", "none");
});
