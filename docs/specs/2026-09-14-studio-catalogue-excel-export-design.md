# Catalogue Studio Excel export with customer-link pricing

Date: 2026-09-14

## Outcome

From a Catalogue Studio preview, an authorized user can download an `.xlsx` workbook for the current saved design, including unpublished changes. The workbook contains one row per visible, active catalogue product, an embedded product thumbnail, product details, and the ERP price resolved for the customer link selected in the preview. A product's own brand mapping determines its price; the export does not apply one brand's mapping to every product.

## Existing system and boundary

The Studio preview currently offers PDF actions but no Excel export or customer-link selector. The editor has a customer-link pricing selector, but its selected value is local UI state and is not passed to preview. An existing Excel endpoint exports a published catalogue version without embedded images, so it cannot represent an unpublished Studio preview. The new export is a Studio-specific path. It reuses existing visible-product ordering and audience/brand ERP price-resolution rules instead of parsing price text drawn on pages. Existing PDF and published-catalogue Excel exports remain unchanged.

## User experience

- Add a compact **Customer link** selector and **Download Excel** button to the Studio preview toolbar. The button is available only to users authorized to export catalogue Excel and view the selected pricing data; the server applies the same checks.
- Opening preview from the editor passes the editor's currently selected customer link. Opening a preview URL directly leaves the selection empty and asks the user to choose a link before downloading, avoiding a silent default price level.
- The selector identifies the chosen link by its customer-level name/code. The export filename identifies the design and selected link. While generating, the button shows progress and prevents duplicate requests; failure leaves the preview open with a retryable error.
- The downloaded workbook's first sheet is **Catalogue products**. A title row gives the catalogue/design name and selected customer link. Each visible, active product appears once in catalogue order. Columns are **Image**, **SKU**, **Product**, **Brand**, **Category**, **Model**, **Barcode**, **Description**, and **Price (THB)** for THB-only results. **Model** is filled only when an authorized model value exists in the saved Studio product content; it is otherwise blank. **Barcode** follows the existing Studio barcode-view permission and is blank when access is denied. If another currency occurs, use separate numeric **Price** and **Currency** columns rather than converting or mixing currencies. Header and data rows are readable, filterable, and frozen at the header.
- The image cell embeds a small, aspect-ratio-preserving thumbnail: first use the product image configured on its visible Studio card, otherwise the ERP primary image. If no usable image exists, show **Image unavailable** in that row and continue exporting other products. No image URL is required for the recipient to see the thumbnail offline.
- A price is an Excel numeric value, not a formatted text string. A hidden, missing, unmapped, or unauthorized price remains blank; when any row lacks a price, add a **Price status** column with a concise reason for affected rows. The export never substitutes a different customer level or brand mapping. The price and image values are a snapshot at download time, not a live workbook feed.

## Data and component flow

1. The editor includes its selected audience ID when opening preview. Preview validates that ID against the active customer-link options returned by the server and displays it; a direct visit requires explicit selection.
2. Download sends the saved design ID and selected audience ID to a Studio Excel endpoint. The server checks design access, Excel-export permission, price-view permission, and price-list scope; client-provided labels or prices are never trusted.
3. The server resolves visible product IDs in stable order, deduplicates them, and loads current active ERP product details. It resolves one audience price per product using the existing actor-specific brand override, all-brand default, and system fallback order, subject to no-price and permission rules.
4. A focused workbook builder writes metadata, product rows, numeric prices, and bounded image thumbnails. It reads only authorized, locally managed product media; it does not fetch arbitrary external URLs from Studio element styles. The endpoint streams the workbook and records an export audit event.

## Failure and security behavior

Invalid or inactive customer link, inaccessible design, or missing permission returns a clear error and no file. An image failure affects only its row. Missing or hidden prices are blank and identified, never leaked through workbook metadata or fallback values. A product removed from active ERP data is omitted; the workbook reflects the saved Studio design plus current authorized ERP data at generation time. Images are resized to at most 160 by 160 pixels before embedding; a source image over 10 MB or one that cannot be decoded uses the per-row unavailable fallback rather than making the workbook unbounded.

## Verification

Automated tests cover editor-to-preview selection, direct-preview selection requirement, toolbar loading/error states, saved-draft inclusion, stable visible-product order and deduplication, image embedding and missing-image fallback, product-detail fields, per-brand audience price mapping, numeric price cells, mixed-currency handling, hidden/missing/unauthorized price privacy, permission failures, and Excel file readability. A manual check opens the downloaded workbook in Excel or LibreOffice and confirms embedded images, readable Thai/English details, and the selected link's prices.

## Out of scope

No changes to PDF rendering, no export of every customer price level, no live-refreshing values inside an already-downloaded workbook, no new customer-link creation flow, and no redesign of the published-catalogue Excel endpoint.
