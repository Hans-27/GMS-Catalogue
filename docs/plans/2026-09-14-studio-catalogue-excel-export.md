# Catalogue Studio Excel Export Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Download the current saved Catalogue Studio design as an Excel workbook with embedded product images, details, and prices for the customer link selected in preview.

**Architecture:** A Studio-specific authenticated GET endpoint resolves visible active products and the selected audience's actor-specific brand prices, then delegates workbook formatting to a small builder module. The editor carries its selected audience into preview; preview also offers an explicit selector and invokes a binary-download API helper. The existing published-catalogue Excel and Studio PDF flows remain untouched.

**Tech Stack:** FastAPI, SQLAlchemy, openpyxl, Pillow, Next.js/React, TypeScript, Vitest, pytest and the existing backend Studio smoke test.

## Global Constraints

- Source is the current **saved Studio design**, including unpublished changes, not the last published catalogue snapshot. Exclude hidden or inactive products and deduplicate repeated product references in catalogue order.
- Export exactly one selected customer link. Resolve each product using its own brand override, then the actor's all-brand default, then the system audience mapping. Never reuse a different audience's price or trust canvas text/client-supplied prices.
- Embed a local product thumbnail in each row, favoring a Studio-selected image that belongs to the product, then its ERP primary image. Missing, invalid, or over-10-MB images become `Image unavailable` without aborting other rows. Thumbnails fit within 160 by 160 pixels.
- Workbook fields: image, SKU, product name, brand, category, model when available and authorized, barcode only with existing barcode-view permission, description, and numeric price. THB-only output labels the column `Price (THB)`; mixed currencies use numeric `Price` plus `Currency`. Add `Price status` only if a row has no available price. No-price, missing, unmapped, or restricted amounts stay blank.
- Workbook values are an export-time snapshot, not a live connection. Keep existing PDF and published-catalogue Excel behavior unchanged. Server-side checks remain authoritative for Studio view, Excel export, price view, and price-list scope.
- This workspace is not a Git repository (`git status` reports no `.git`); replace commit steps with a review checkpoint and do not initialize or alter source control as part of this feature.

---

### Task 1: Build the isolated Excel workbook formatter

**Files:**
- Create (proposed): `backend/app/design_studio_excel.py`
- Create (proposed): `backend/tests/test_design_studio_excel.py`

**Interfaces:**
- Produces (proposed): `StudioExcelRow` dataclass with `sku`, `name`, `brand`, `category`, `model`, `barcode`, `description`, `price: Decimal | None`, `currency`, `price_status`, and `image_path: Path | None`.
- Produces (proposed): `build_studio_excel(design_name: str, audience_label: str, rows: Sequence[StudioExcelRow]) -> bytes`.
- Consumes: local image paths already validated to belong to a product; no database or URL fetching in the formatter.

- [ ] **Step 1: Add the focused failing test.** Assert an openpyxl-readable workbook with title/customer-link rows, header/freeze/filter layout, ordered rows, numeric THB prices, a real embedded thumbnail, a blank price plus `Price status` only when needed, mixed-currency columns, and `Image unavailable` for corrupt/oversized images. Assert thumbnail dimensions do not exceed 160 by 160 pixels.
- [ ] **Step 2: Verify the relevant failure.** Run from `backend`: `python -m pytest tests/test_design_studio_excel.py -q`. Expected: import failure for the new formatter module or missing workbook interface.
- [ ] **Step 3: Implement the minimum behavior.** Use openpyxl to create one `Catalogue products` sheet; write the supplied rows without reordering; use `Decimal`/numeric cell values and Excel currency number formats; preserve Unicode; create a conditional status column. Use Pillow to decode local files, flatten transparency onto white, resize to at most 160 by 160 pixels, and embed bytes; treat unreadable or over-10-MB sources as a row-level image fallback. Freeze at the product header and enable autofilter over all product columns.
- [ ] **Step 4: Verify the focused pass.** Run the same pytest command. Expected: all formatter tests pass and the workbook can be loaded from bytes.
- [ ] **Step 5: Run the affected integration check.** Run from `backend`: `python -m pytest tests/test_design_studio_live_table.py -q`. Expected: existing Studio table tests pass, showing the formatter did not affect preview rendering.
- [ ] **Step 6: Review checkpoint.** Inspect only this task's new module/test and capture test output; no commit is possible in this workspace.

### Task 2: Expose an authenticated Studio Excel download

**Files:**
- Modify (observed): `backend/app/design_studio.py` near `_studio_design_pricing_overview` and the Studio export routes.
- Modify (observed): `backend/tests/smoke_design_studio.py`.
- Consume (proposed): `backend/app/design_studio_excel.py`.

**Interfaces:**
- Produces (proposed): `GET /api/v1/catalogue-studio/designs/{design_id}/export/excel?audience_type_id={id}` returning the `.xlsx` attachment; missing/inactive audience is 422, missing design is 404, insufficient permission is 403.
- Consumes (observed): `_design`, `_published_design_product_ids`, `_studio_design_pricing_overview`, `allowed_price_list_ids`, `has_permission`, `ProductImage.storage_name`, and `settings.upload_dir`.

- [ ] **Step 1: Add the focused failing test.** Extend the Studio smoke test with a saved draft containing visible, hidden, duplicated, and inactive products across two brands; two audience mappings; a product image; and a restricted actor. Assert 200 with a readable workbook, catalogue order and one row per visible active product, selected-audience brand prices, image presence, blank restricted/no-price amounts, barcode masking, sanitized filename, and an audit record. Assert 422 for absent/invalid audience and 403 for denied export/price permissions.
- [ ] **Step 2: Verify the relevant failure.** Run from `backend`: `python -m tests.smoke_design_studio`. Expected: a 404 for the new route or an assertion failure proving the export is not present.
- [ ] **Step 3: Implement the minimum behavior.** Add a GET endpoint guarded by `catalogue_studio.view`, `catalogues.export_excel`, and `prices.view` using existing role/permission helpers. Validate the selected active audience, use `_published_design_product_ids` for stable visible-product IDs, fetch active Product records and ordered images, and select exactly the matching audience option from `_studio_design_pricing_overview`. Convert `ready` amounts to Decimal; map `hidden`, `missing_price`, `mapping_required`, and `unavailable` to blank numeric cells plus safe status labels. Build a `StudioExcelRow` per product; read `style.productModel` from the first visible saved product card only when the actor has the existing additional-fields permission, otherwise leave Model blank; mask barcode without its existing view permission. Select a Studio-configured image only if its ID belongs to that product and its resolved storage path remains under the upload root; otherwise use the ERP primary image. Call `build_studio_excel`, stream bytes with the XLSX media type and a safe design/audience filename, and write an audit event. A design with zero eligible products returns a header-only workbook.
- [ ] **Step 4: Verify the focused pass.** Run `python -m tests.smoke_design_studio` from `backend`. Expected: all smoke assertions pass, including new price and image checks.
- [ ] **Step 5: Run the affected integration check.** Run from `backend`: `python -m pytest tests/test_design_studio_excel.py tests/test_design_studio_pdf_export.py -q`. Expected: workbook and existing PDF export tests pass.
- [ ] **Step 6: Review checkpoint.** Check route permissions, protected image path resolution, workbook output, and test evidence; no commit is possible in this workspace.

### Task 3: Add the preview selector and download control

**Files:**
- Modify (observed): `frontend/src/app/catalogue-studio/studio-editor.tsx` near `openPreview()`.
- Modify (observed): `frontend/src/app/catalogue-studio/studio-preview.tsx` near the preview toolbar.
- Modify (observed): `frontend/src/app/catalogue-studio/studio.module.css` for compact toolbar layout.
- Modify (observed): `frontend/src/lib/studio-api.ts` for the binary download helper.
- Modify (observed): `frontend/src/app/catalogue-studio/studio-editor.test.tsx` and `frontend/src/app/catalogue-studio/studio-preview.test.tsx`.

**Interfaces:**
- Produces (proposed): `downloadStudioCatalogueExcel(designId: string, audienceTypeId: number): Promise<{ blob: Blob; fileName: string }>` using a credentialed fetch and existing API error parser.
- Consumes (observed): `getStudioPricingOverview(designId)`, `getCurrentUser()`, `API_URL`, `openPreview()`, `StudioPreview`, and `pricingAudienceId`.

- [ ] **Step 1: Add the focused failing tests.** Assert editor preview URL carries a selected `audience_type_id` after save; preview validates that query value against active audiences, displays the chosen link, requires a selection when opened directly, and places `Download Excel` beside it. Assert the download helper passes credentials and selected audience ID, uses the server filename, triggers one browser download, disables duplicate clicks, and reports an API failure without losing the preview. Assert the control is unavailable without the effective export/price permissions.
- [ ] **Step 2: Verify the relevant failure.** Run from `frontend`: `npm test -- src/app/catalogue-studio/studio-editor.test.tsx src/app/catalogue-studio/studio-preview.test.tsx`. Expected: tests fail on absent selected-link URL and Excel controls/helper.
- [ ] **Step 3: Implement the minimum behavior.** Append `audience_type_id` to the editor preview URL only when the selected ID is valid. In preview, load active audiences and current user, retain the valid URL selection or require explicit choice, and render an accessible labelled selector plus the Excel button adjacent to the PDF actions. Keep the selector's value stable across preview reloads; never auto-switch pricing levels. Implement credentialed blob fetch in `studio-api.ts`, parse `Content-Disposition`, create/revoke an object URL for download, and expose busy/success/error text. Use the existing effective-permission list and SuperAdmin flag for client visibility, while the backend remains authoritative.
- [ ] **Step 4: Verify the focused pass.** Run the same two Vitest files. Expected: all new and existing assertions pass.
- [ ] **Step 5: Run the affected integration check.** Run from `frontend`: `npx eslint src/app/catalogue-studio/studio-editor.tsx src/app/catalogue-studio/studio-preview.tsx src/lib/studio-api.ts`; then `npm run build`. Expected: lint has no new errors and Next.js builds successfully. Manually check narrow-screen toolbar access and confirm a draft preview downloads an Excel file that opens with embedded images and selected-link prices.
- [ ] **Step 6: Review checkpoint.** Inspect only the touched UI/API helper files and test evidence; no commit is possible in this workspace.

## Unresolved product decisions

None. The user approved a workbook with embedded images and details, using only the currently selected customer link's price; the design spec defines direct-URL selection, missing-price behavior, and export-time snapshot semantics.
