# Public Catalogue Category Excel Download Implementation Plan

> Design source: `docs/specs/2026-09-18-public-category-excel-download-design.md`

**Goal:** Add a small, aligned Excel-download control to every category row in a public catalogue sidebar and export only the products in that category.

**Architecture:** The public viewer passes an independent action into the shared sidebar row component. The backend resolves the same public token, password, permissions, live stock, and customer-specific price presentation used by the catalogue before creating an XLSX workbook in memory. Navigation remains a link; download remains a separate button, avoiding nested interactive controls.

**Tech stack:** Next.js/React/TypeScript, CSS Modules, FastAPI, SQLAlchemy, openpyxl, Vitest, pytest/smoke tests.

---

## Task 1: Backend category workbook endpoint

**Files:**
- Modify: `backend/app/catalogue_share_links.py`
- Modify: `backend/tests/smoke_catalogue_share_links.py`

1. Add a failing public-route test proving that a category export:
   - returns an XLSX attachment;
   - contains only matching category products;
   - uses the public presentation's live stock and resolved price;
   - preserves numeric stock/price cells;
   - rejects downloads when the public link download permission is disabled;
   - returns 404 for a missing or empty category.
2. Run the focused backend test and record the expected failure.
3. Add a small workbook builder and `GET /public/catalogues/{token}/categories/{category_slug}/excel` route.
4. Reuse `_public_link` for token/password/permission, catalogue visibility, current product data, and customer pricing.
5. Add safe worksheet values, basic formatting, useful column widths, and bounded embedded primary images when a managed local image is available.
6. Run the focused backend test until green.

## Task 2: Sidebar action and viewer download behavior

**Files:**
- Modify: `frontend/src/components/catalogue-sidebar.tsx`
- Modify: `frontend/src/components/catalogue-sidebar.module.css`
- Modify: `frontend/src/components/catalogue-sidebar.test.tsx`
- Modify: `frontend/src/app/c/[token]/public-catalogue-viewer.tsx`
- Modify: `frontend/src/app/c/[token]/public-catalogue-viewer.test.tsx`

1. Add failing component tests proving a row can expose an independent accessible action without triggering navigation, and that action/count columns align.
2. Add a failing viewer test proving category Excel fetch URL, password header, filename, busy-state protection, and permission hiding.
3. Run focused frontend tests and record expected failures.
4. Extend `CatalogueSidebarItem` with an optional action and render a separate action button beside the navigation link/button.
5. Use fixed grid columns for badge, one-line label, 32px action target with a 21px visible circle, and count. Preserve collapsed and mobile drawer behavior.
6. Add viewer category download state and Blob download handling; expose actions only when `allow_pdf_download` is true and only in the regular category catalogue view.
7. Run focused frontend tests until green.

## Task 3: Regression verification

1. Run the complete relevant backend share-link smoke test.
2. Run the complete shared-sidebar and public-viewer frontend test files.
3. Run TypeScript/lint checks for changed frontend files.
4. Review the final diff and verify no Studio/editor or global PDF behavior changed.

