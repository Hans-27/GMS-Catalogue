import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export const SUPERADMIN_STATE_PATH = resolve(
  process.cwd(),
  "test-results/auth/superadmin.json",
);

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Not configured: ${name}`);
  return value;
}

export async function openSuperadminSession(
  browser: Browser,
  baseURL: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const identifier = requiredEnvironment("GMS_E2E_SUPERADMIN_IDENTIFIER");
  const password = requiredEnvironment("GMS_E2E_SUPERADMIN_PASSWORD");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto("/login");
  await page.locator("#login-identifier").fill(identifier);
  await page.locator("#login-password").fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard(?:\?|$)/);

  await mkdir(dirname(SUPERADMIN_STATE_PATH), { recursive: true });
  await context.storageState({ path: SUPERADMIN_STATE_PATH });
  return { context, page };
}
