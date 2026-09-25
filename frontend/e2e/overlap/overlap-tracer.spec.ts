import { expect, test, type Page } from "@playwright/test";
import type { AuditCase, AuditViewport, LayoutFinding } from "./audit-types";
import { openSuperadminSession } from "./auth.setup";
import { collectLayoutFindings, waitForStableLayout } from "./geometry";

const VIEWPORTS: readonly AuditViewport[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
  { name: "mobile-small", width: 360, height: 800 },
];

const loginCase: AuditCase = {
  id: "public-login",
  path: "/login",
  role: "public",
  root: "main",
  exceptions: [
    {
      id: "login-password-toggle",
      first: "#login-password",
      second: "button[aria-pressed]",
      reason: "The show-password control is intentionally embedded in the password field.",
    },
  ],
};

const dashboardCase: AuditCase = {
  id: "superadmin-dashboard",
  path: "/dashboard",
  role: "superadmin",
  root: "main",
};

function errorFindings(findings: readonly LayoutFinding[]) {
  return findings.filter((finding) => finding.severity === "error");
}

async function assertCase(page: Page, auditCase: AuditCase, viewport: AuditViewport) {
  await page.setViewportSize(viewport);
  await page.goto(auditCase.path);
  await waitForStableLayout(page, auditCase.root);
  const findings = await collectLayoutFindings(page, auditCase, viewport);
  expect(
    errorFindings(findings),
    JSON.stringify(findings, null, 2),
  ).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test(`@tracer public login is bounded at ${viewport.name}`, async ({ page }) => {
    await assertCase(page, loginCase, viewport);
  });

  test(`@tracer SuperAdmin dashboard is bounded at ${viewport.name}`, async ({
    browser,
    baseURL,
  }) => {
    test.skip(
      !process.env.GMS_E2E_SUPERADMIN_IDENTIFIER || !process.env.GMS_E2E_SUPERADMIN_PASSWORD,
      "Authenticated overlap fixtures are not configured.",
    );
    if (!baseURL) throw new Error("Not configured: GMS_E2E_BASE_URL");
    const { context, page } = await openSuperadminSession(browser, baseURL);
    try {
      await assertCase(page, dashboardCase, viewport);
    } finally {
      await context.close();
    }
  });
}
