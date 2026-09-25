import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const localEnvironmentPath = resolve(process.cwd(), ".env.e2e.local");
if (existsSync(localEnvironmentPath)) loadEnvFile(localEnvironmentPath);

const baseURL = process.env.GMS_E2E_BASE_URL ?? "http://127.0.0.1:3000";
const browserChannel = process.env.GMS_E2E_BROWSER_CHANNEL ?? "chrome";
const manageServer = process.env.GMS_E2E_MANAGE_SERVER === "1";
const devCommand =
  process.platform === "win32"
    ? "npm.cmd run dev -- --hostname 127.0.0.1"
    : "npm run dev -- --hostname 127.0.0.1";

export default defineConfig({
  testDir: "./e2e/overlap",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  outputDir: "test-results/overlap",
  reporter: [
    ["line"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL,
    browserName: "chromium",
    channel: browserChannel,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  ...(manageServer
    ? {
        webServer: {
          command: devCommand,
          url: `${baseURL}/login`,
          reuseExistingServer: true,
          timeout: 120_000,
          stdout: "pipe" as const,
          stderr: "pipe" as const,
        },
      }
    : {}),
});
