/* eslint-disable @typescript-eslint/no-require-imports */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

// Render the actual new components without starting a service or writing data
// to a customer's catalogue. These assertions prove static layout, not uploads.
const sheets: string[] = [];
const originalCssLoader = require.extensions[".css"];
const originalTsxLoader = require.extensions[".tsx"];
require.extensions[".tsx"] = (module: NodeJS.Module, filename: string) => {
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } });
  (module as NodeJS.Module & { _compile: (code: string, path: string) => void })._compile(output.outputText, filename);
};
require.extensions[".css"] = (module: NodeJS.Module, filename: string) => {
  const prefix = filename.includes("studio-online") ? "studioCover_" : "publicCover_";
  sheets.push(readFileSync(filename, "utf8").replace(/\.([a-zA-Z_][\w-]*)/g, `.${prefix}$1`));
  module.exports = { __esModule: true, default: new Proxy({}, { get: (_target, key) => typeof key === "string" ? `${prefix}${key}` : undefined }) };
};
const { StudioOnlineCover } = require("../../src/app/catalogue-studio/studio-online-cover");
const { CatalogueOnlineCover } = require("../../src/components/catalogue-online-cover");
if (originalCssLoader) require.extensions[".css"] = originalCssLoader;
else delete require.extensions[".css"];
if (originalTsxLoader) require.extensions[".tsx"] = originalTsxLoader;
else delete require.extensions[".tsx"];

const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><rect width="900" height="1200" fill="#126b3a"/><text x="450" y="580" text-anchor="middle" fill="white" font-family="Arial" font-size="64">TEST COVER</text><text x="450" y="670" text-anchor="middle" fill="white" font-family="Arial" font-size="28">Illustrative fixture only</text></svg>`;
const cover = { asset_id: "fixture-cover", file_name: "illustrative-cover.svg", width: 900, height: 1200, url: `data:image/svg+xml,${encodeURIComponent(artwork)}` };

test("catalogue Explore products link has smooth feedback and respects reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const html = renderToStaticMarkup(React.createElement(CatalogueOnlineCover, {
    cover, title: "Illustrative catalogue", productCount: 2, exploreHref: "#products", exploreLabel: "Explore products", productsLabel: "products",
    fallback: React.createElement("h1", null, "Generated print cover"),
  })).replace(/src="[^"]*data:image/g, 'src="data:image');
  await page.setContent(`<style>body{margin:0;padding:16px;background:#f3f7f4;font-family:Arial,sans-serif}main{max-width:1100px;margin:auto} ${sheets.join("\n")}</style><button id="focus-start" style="position:absolute;left:-9999px">Focus start</button><main>${html}</main>`);

  const link = page.getByRole("link", { name: "Explore products" });
  await expect(link).toHaveAttribute("data-catalogue-explore", "true");
  await expect(link).toHaveCSS("transition-duration", "0.2s, 0.2s, 0.2s");
  await link.hover();
  await expect(link).not.toHaveCSS("transform", "none");
  await expect(link).not.toHaveCSS("box-shadow", "none");
  await page.screenshot({ path: join(tmpdir(), "gms-catalogue-explore-transition-1280.png"), fullPage: true });
  await page.mouse.down();
  await expect(link).toHaveCSS("filter", "brightness(0.98)");
  await page.mouse.up();
  await page.locator("#focus-start").focus();
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await expect(link).toHaveCSS("outline-style", "solid");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(link).toHaveCSS("transition-duration", "0s");
  await expect(link).toHaveCSS("transform", "none");
});

for (const width of [375, 768, 1280]) {
  test(`online cover static render stays contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const html = renderToStaticMarkup(React.createElement(CatalogueOnlineCover, {
      cover, title: "Illustrative catalogue", productCount: 2, exploreHref: "#products", exploreLabel: "Explore products", productsLabel: "products",
      fallback: React.createElement("h1", { "data-testid": "generated-cover" }, "Generated print cover"),
    })).replace(/src="[^"]*data:image/g, 'src="data:image');
    await page.setContent(`<style>body{margin:0;padding:16px;background:#f3f7f4;font-family:Arial,sans-serif}main{max-width:1100px;margin:auto} ${sheets.join("\n")}</style><main>${html}</main>`);
    const image = page.getByRole("img", { name: "Illustrative catalogue online cover" });
    await expect(image).toBeVisible();
    await expect(image).toHaveCSS("object-fit", "contain");
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(900);
    await expect(page.getByRole("link", { name: "Explore products" })).toBeVisible();
    await expect(page.getByTestId("generated-cover")).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Explore products" }).focus();
    await expect(page.getByRole("link", { name: "Explore products" })).toHaveCSS("outline-style", "solid");
    await page.screenshot({ path: join(tmpdir(), `gms-online-cover-public-${width}.png`), fullPage: true });
    await page.emulateMedia({ media: "print" });
    await expect(image).toBeHidden();
    await expect(page.getByTestId("generated-cover")).toBeVisible();
  });

  test(`Studio cover upload static render stays contained at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const html = renderToStaticMarkup(React.createElement(StudioOnlineCover, { cover: null, canEdit: true, onSave: async () => {}, onRemove: async () => {} }));
    await page.setContent(`<style>body{margin:0;padding:16px;background:#e9eeeb;font-family:Arial,sans-serif}${sheets.join("\n")}</style>${html}`);
    await expect(page.getByRole("heading", { name: "Cover page" })).toBeVisible();
    await expect(page.getByLabel("Choose cover image")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save cover" })).toBeDisabled();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByLabel("Choose cover image").focus();
    await expect(page.getByLabel("Choose cover image")).toHaveCSS("outline-style", "solid");
    await page.screenshot({ path: join(tmpdir(), `gms-online-cover-studio-${width}.png`), fullPage: true });
  });
}
