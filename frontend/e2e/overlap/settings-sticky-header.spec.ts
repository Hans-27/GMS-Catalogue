import { expect, test } from "@playwright/test";

const superadmin = {
  id: "settings-admin",
  username: "SuperAdmin",
  email: "admin@example.invalid",
  full_name: "Super Administrator",
  roles: ["superadmin"],
  permissions: [],
  is_superadmin: true,
};

test("the settings header remains visible while the page scrolls", async ({ page }) => {
  // Production defect: the General Settings identity and account controls
  // scroll out of view on long settings pages.
  await page.setViewportSize({ width: 1440, height: 700 });
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
    if (path.endsWith("/auth/me")) {
      await route.fulfill({ json: superadmin, headers });
      return;
    }
    await route.fulfill({ json: {}, headers });
  });

  await page.goto("/admin/settings/general");
  const heading = page.getByRole("heading", { name: "General Settings" });
  const header = heading.locator("xpath=ancestor::header[1]");
  await expect(header).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);

  const result = await header.evaluate((element) => ({
    position: getComputedStyle(element).position,
    top: Math.round(element.getBoundingClientRect().top),
  }));
  expect(result).toEqual({ position: "sticky", top: 0 });
});
