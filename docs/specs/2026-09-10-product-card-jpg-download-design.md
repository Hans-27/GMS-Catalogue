# Product Card JPG Download Design

> Superseded by `2026-09-10-product-image-popup-download-design.md`. The approved feature downloads only the original product image, not a rendered product card.

## Goal

Add a download control to every shared catalogue product card. The control downloads one high-resolution JPG containing the complete customer-visible card for that product.

## Scope

This feature applies to both current consumers of the shared `CatalogueProductCard` component:

- Published catalogue links at `/c/[token]`
- Catalogue previews at `/catalogues/[id]/preview`

It does not change catalogue pricing, stock synchronization, product selection, PDF generation, or Catalogue Studio canvas elements.

## User Experience

- A circular download button is placed at the upper-left edge of each product card, matching the supplied reference.
- The button uses a downward-arrow icon and has the accessible name `Download <product name> card as JPG`.
- Selecting the button starts the download immediately; no format menu or confirmation dialog is added.
- While the JPG is being generated, the button is disabled and exposes the label `Preparing <product name> card JPG`.
- If generation fails, a visible compact message says `Card download failed. Try again.` and the button remains available for retry.
- The download control is hidden from print output and is not drawn into the downloaded JPG.
- Keyboard focus uses the existing catalogue focus treatment. The button remains at least 40 by 40 CSS pixels.

## JPG Contents

The downloaded JPG represents the same product and current card state visible when the user selects download:

- Current product name and selected language
- Currently selected carousel image
- Model, pack size, warranty, brand, or category when present
- Barcode
- Current stock value
- Current mapped wholesale-price value when prices are enabled
- Current retail-price value, original price, and discount when present
- Current catalogue card theme and brand colors
- Current customer-visible labels, including `Stock`, `Wholesale price`, and `Retail price`

The static JPG includes the selected image and its image-count indicator when the product has multiple images. Carousel navigation buttons and the download button are omitted because they are interactive controls.

If catalogue prices are hidden, the JPG follows the visible card: the retail-price capsule is omitted and the third table column contains the product code instead of a wholesale price.

## Output Contract

- Format: JPEG (`image/jpeg`)
- Dimensions: 1600 by 1000 pixels
- Quality: 92
- Background: opaque card surface; JPEG transparency is not required
- Filename: `<sanitized-product-code>-<sanitized-product-name>.jpg`
- Empty code or name segments are omitted; the fallback filename is `product-card.jpg`

## Architecture

### Shared card control

`CatalogueProductCard` owns the button because it is the shared renderer for published and preview catalogues. It owns only download state and delegates image generation to a small client helper.

### Client helper

The helper sends a JSON snapshot of the currently visible card to `POST /api/catalogue-product-card/download`. The snapshot contains only fields already rendered to the user, the selected image URL, locale, language, price visibility, and the resolved card-theme tokens.

On success, the helper creates a temporary object URL from the JPEG response, invokes a browser download using the response filename, and revokes the object URL.

### Server renderer

The Next.js route validates the request, builds an SVG representation of the established card structure, embeds the approved product image, and uses the existing `sharp` dependency to rasterize the SVG as a 1600 by 1000 JPEG at quality 92.

The SVG renderer mirrors the shared card's title capsule, image well, metadata, table, and retail-price capsule. It consumes the resolved theme sent by the component so brand-specific card colors remain consistent.

## Security and Data Boundaries

- Product image URLs must resolve to the configured backend origin or the frontend origin.
- Backend image paths are limited to existing product-media and catalogue-media paths.
- The route does not forward browser cookies or authorization headers when fetching an image.
- External arbitrary hosts, redirects to a different origin, non-image responses, oversized images, and invalid payloads are rejected.
- Image fetching uses a bounded timeout and byte-size limit.
- All text inserted into SVG is XML-escaped.
- The renderer does not query or modify product, stock, price, or catalogue records.

If the selected image cannot be safely loaded, the request still returns a card JPG containing the existing no-image placeholder rather than silently omitting the image area.

## Error Handling

- Invalid payload: `400` JSON response with a safe message.
- Unsupported or unsafe image source: use the local no-image placeholder.
- Rendering failure: `500` JSON response with `Product card JPG could not be generated.`
- Client network or server failure: display `Card download failed. Try again.` within the affected card.
- Repeated selection while a request is active is ignored by the disabled button.

## Accessibility

- The control is a native `button` with an explicit product-specific accessible name.
- Loading state uses `aria-busy` and a disabled state.
- The compact failure message uses `role="alert"`.
- The arrow glyph is hidden from assistive technology.
- Button focus, hover, disabled, and error states do not rely on color alone.

## Responsive and Print Behavior

- Desktop and tablet: the button sits at the upper-left card edge without changing the card grid.
- Mobile: the button remains inside the card boundary with a 40-pixel target and cannot create horizontal overflow.
- Print and PDF CSS hide the download control and failure message.
- The downloaded JPG always uses the fixed 1600-by-1000 export canvas, independent of viewport width.

## Testing

### Component behavior

- Published catalogue cards expose one download button per product.
- Preview catalogue cards expose the same control.
- The accessible name contains the product name and JPG format.
- Selecting the button sends the current selected image and current visible product values.
- A request in progress disables the button.
- A failed request displays the retry message and permits another attempt.
- The control is excluded from print through its owned CSS selector.

### Route behavior

- A valid request returns JPEG bytes, `Content-Type: image/jpeg`, and a safe attachment filename.
- The response begins with the JPEG file signature.
- Card labels, supplied text, and resolved colors reach the renderer.
- Unsafe image origins and non-image responses fall back to the placeholder.
- Malformed payloads return `400` without invoking the renderer.

### Regression verification

- Existing published-catalogue and preview tests remain green.
- TypeScript, ESLint, and the production Next.js build pass.

## Acceptance Criteria

1. Every shared catalogue product card has one upper-left JPG download button.
2. Activating it downloads one complete 1600-by-1000 product-card JPG.
3. The JPG contains the product data, selected image, current stock, and prices visible on that card.
4. The download button and carousel navigation controls are absent from the JPG.
5. Brand theme colors and English or Thai labels match the active catalogue view.
6. Download failure is visible, accessible, and retryable.
7. No stock, price, permission, catalogue, or product record is changed by downloading.

## Self-Review

- Placeholder scan: no TBD, TODO, or unresolved placeholder remains.
- Consistency: the fixed JPG contract, client snapshot, server renderer, and acceptance criteria agree.
- Scope: one bounded shared-card download feature; no PDF or Studio behavior is added.
- Ambiguity: JPG dimensions, quality, filename, image selection, hidden-price behavior, failure behavior, and excluded controls are explicit.
