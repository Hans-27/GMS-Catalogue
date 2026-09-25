import { expect, test } from "@playwright/test";
import { collectLayoutFindings } from "./geometry";
import type { AuditCase, AuditViewport } from "./audit-types";

const auditCase: AuditCase = {
  id: "geometry-fixture",
  path: "/geometry-fixture",
  role: "public",
  root: "main",
};
const viewport: AuditViewport = {
  name: "mobile",
  width: 390,
  height: 844,
};

test("reports page overflow and overlapping sibling controls", async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.setContent(`
    <main style="width: 430px">
      <div style="position: relative">
        <button style="position:absolute;left:0;top:0;width:40px;height:40px">A</button>
        <button style="position:absolute;left:20px;top:0;width:40px;height:40px">B</button>
      </div>
    </main>
  `);

  const findings = await collectLayoutFindings(page, auditCase, viewport);
  expect(findings.some((finding) => finding.kind === "page-overflow")).toBe(true);
  expect(findings.some((finding) => finding.kind === "control-overlap")).toBe(true);
});

test("does not report ancestor containment or declared sibling overlap", async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.setContent(`
    <main>
      <section><button style="width:40px;height:40px">Nested</button></section>
      <div style="position:relative;width:80px;height:40px">
        <button class="previous" style="position:absolute;inset:0 auto 0 0;width:40px">Previous</button>
        <button class="badge" style="position:absolute;inset:0 auto 0 20px;width:40px">Badge</button>
      </div>
    </main>
  `);

  const findings = await collectLayoutFindings(
    page,
    {
      ...auditCase,
      exceptions: [
        {
          id: "fixture-overlap",
          first: ".previous",
          second: ".badge",
          reason: "Hand-checked fixture exception.",
        },
      ],
    },
    viewport,
  );
  expect(findings.filter((finding) => finding.severity === "error")).toEqual([]);
});
