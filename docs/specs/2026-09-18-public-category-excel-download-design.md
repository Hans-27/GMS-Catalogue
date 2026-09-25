# Public catalogue category Excel download

Date: 2026-09-18

## Outcome

Each category row in the public catalogue sidebar has a small download button between the category name and product count. Selecting it downloads an `.xlsx` workbook containing only the products displayed in that category for the current catalogue link.

## User experience

- Keep the category name as the navigation target.
- Render each category row as four stable columns: category badge, flexible category name, fixed download-button column, and fixed right-aligned product-count column. Every row stays on one horizontal line.
- Add a compact circular down-arrow button immediately before the product count, matching the requested sidebar placement. All button centers form one straight vertical line, and all counts form a separate straight vertical line.
- Give the button an accessible name such as **Download Adapter Excel** and a tooltip such as **Download category Excel**.
- Clicking the icon must not navigate to or select the category.
- While a workbook is being generated, disable only that category's button and show a small progress treatment. Other category links remain usable.
- On failure, keep the viewer in place and show a concise retryable error.
- Make the visible circle 21–22 CSS pixels with a proportionate icon. Preserve at least a 32 by 32 CSS pixel invisible clickable area on touch screens without widening or overlapping the sidebar row.
- Long category names may truncate with an ellipsis; they must never move the fixed icon or count columns.
- Show the category download action only when the public link permits catalogue downloads through the existing download permission. This avoids introducing a second public-link permission setting for the same downloadable product data.

## Workbook

- Use one worksheet named after the category, sanitized to Excel's worksheet-name rules.
- Include only active, visible products that the current public catalogue token exposes in the selected category.
- Preserve catalogue product order and include each product once.
- Columns are **Image**, **Product code**, **Product name**, **Brand**, **Category**, **Model**, **Barcode**, **Description**, **Stock**, **Price**, and **Currency**.
- Stock and price use the values already resolved for the current catalogue/customer link. The export must not query or reveal another customer price level.
- Store stock and price as numeric cells. If the link hides prices, price and currency remain blank.
- Embed an aspect-ratio-preserving thumbnail in the Image cell. If no usable image is available, write **Image unavailable** and continue.
- Freeze the header row, enable filtering, use readable column widths and row heights, and style the header consistently with the catalogue.
- Filename format: `<catalogue-slug>-<category-slug>.xlsx`.

## Architecture and data flow

1. The sidebar category action calls a public category-export endpoint with the current share token and category slug.
2. The backend resolves the share token through the same active/revoked/expired-link checks as the public catalogue viewer.
3. The backend builds the current public catalogue payload, then filters its already-authorized products to the requested visible category. The client cannot supply product IDs, prices, stock, or filenames.
4. A focused workbook builder writes product values and bounded image thumbnails, then streams the workbook with the Excel media type and attachment filename.
5. The client reads the response filename, downloads the blob, and releases the temporary object URL.

## Failure and security behavior

- Unknown, hidden, or empty categories return a clear 404 response and no workbook.
- Expired, revoked, or invalid share tokens retain their existing public-link response behavior.
- Category export follows the same public download permission as the catalogue download action.
- Images are loaded only from the platform's managed product-media sources; the exporter does not fetch arbitrary external URLs.
- A missing or undecodable image affects only its product row.
- Spreadsheet text is protected against formula injection before values are written.
- Image dimensions and bytes are bounded so a single asset cannot make workbook generation unbounded.

## Verification

- Backend tests verify category filtering, catalogue order, deduplication, embedded-image and missing-image behavior, numeric stock and selected-link pricing, hidden prices, invalid categories, invalid tokens, download permission, safe filenames, and spreadsheet formula protection.
- Frontend tests verify icon placement before the count, accessible naming, no category navigation on download, per-category loading, successful blob download, and error feedback.
- Responsive verification confirms that category names, download buttons, and counts do not overlap on desktop or mobile.

## Out of scope

- No PDF-per-category export.
- No ZIP of individual product-card images.
- No export of products outside the selected category.
- No new public-link permission or catalogue-editor workflow.
