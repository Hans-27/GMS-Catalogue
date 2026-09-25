# Product Image Popup and Download Design

## Goal

Add a download control to the top-left of each real product image in every catalogue product card. Selecting the control opens a large image popup, where the user can browse the product's images and download the displayed image in its original file format and quality.

## Scope

The complete image-control set applies to every interactive catalogue surface that renders product cards, including all current consumers of the shared `CatalogueProductCard` component:

- Published catalogue links at `/c/[token]`
- Catalogue previews at `/catalogues/[id]/preview`
- Auto-generated and manually created catalogues rendered through either of those surfaces
- Customer and staff accounts opening those catalogues

It does not download or render the complete product card. It does not convert, resize, recompress, crop, or otherwise alter the source product image. It does not change catalogue pricing, stock synchronization, PDF generation, or Catalogue Studio canvas elements.

## Product Card Control

- A circular button is positioned inside the upper-left corner of the product image well, following the supplied reference.
- The button uses a downward-arrow glyph and the accessible name `View and download images for <product name>`.
- The button appears only when the product has at least one real downloadable image. It is omitted when the card contains only the local no-image placeholder.
- The button opens the currently selected carousel image, not always the first image.
- Existing previous/next carousel buttons and image-count behavior remain unchanged.
- The new button is hidden in print and PDF output.

## Popup

- The popup is rendered as one shared modal layer above the catalogue, not as a permanent dialog inside every card.
- It displays the current image at the largest size that fits within the viewport without cropping or distortion.
- The popup contains:
  - A product name heading
  - A close button
  - Previous and Next controls, disabled when only one image exists
  - A primary `Download image` button
  - An image position indicator such as `2 of 5`
- The popup footer always keeps Previous, Download image, and Next in the same positions. Previous and Next are disabled when the product has only one image rather than being removed.
- Previous and Next wrap around the image list, matching the existing card carousel behavior.
- Selecting the backdrop, pressing Escape, or selecting Close dismisses the popup.
- Closing returns keyboard focus to the product-card button that opened it.
- Page scrolling is locked only while the popup is open and restored when it closes.

## Download Behavior

- `Download image` downloads the image currently displayed in the popup.
- The response bytes and MIME type are preserved. There is no format conversion or recompression.
- The filename uses source metadata when available. Otherwise it uses `<sanitized-product-code>-image-<position>.<source-extension>`.
- During download, the button is disabled and reads `Downloading...`.
- A repeated click while downloading does not start a second request.
- On success, the browser download starts immediately and the popup remains open so another product image can be downloaded.
- On failure, the popup shows `Image download failed. Try again.` and leaves the button available for retry.

## Architecture

### Shared image-dialog component

Create a reusable catalogue image-dialog component that owns modal rendering, carousel navigation, focus restoration, Escape handling, scroll locking, download state, and error presentation.

Its public contract contains the product name, product code, normalized image list, active image index, a close callback, and the request headers required by protected published catalogues.

### Shared product card

`CatalogueProductCard` owns the upper-left control because it already owns the active carousel index. When selected, it supplies the complete normalized image list and current index to its parent through an `onOpenImages` callback.

The card does not own network or modal behavior. This keeps one modal instance per catalogue view instead of one modal implementation per card.

### Catalogue consumers

- The published catalogue viewer uses the shared dialog and supplies the catalogue password header when the selected image endpoint requires it.
- The catalogue preview uses the same dialog with the authenticated preview context.
- Existing Studio image-preview behavior remains separate unless it can consume the new component without changing its established contract.

### Download transport

The browser fetches the selected image with the same request context required by its catalogue view, verifies that the response is an image, creates an object URL from the untouched response blob, starts a download through a temporary anchor, and then revokes the object URL. This extends the direct-fetch pattern already used by the published catalogue image popup; no image conversion or proxy route is introduced.

## Security and Data Boundaries

- Image URLs must use HTTP or HTTPS and originate from the catalogue's normalized image list.
- Redirects to unsupported protocols, non-image content types, and invalid URLs are rejected.
- Authentication or catalogue-password headers are forwarded only to the configured backend origin.
- Download filenames are stripped of control characters and unsafe path characters.
- The feature reads image bytes only and does not query or modify products, catalogues, stock, or prices.

## Accessibility

- The card control and all popup actions use native buttons.
- The modal uses `role="dialog"`, `aria-modal="true"`, and a product-specific labelled heading.
- Focus moves into the popup when it opens and is trapped within the popup while open.
- Escape closes the popup, and focus returns to the opening control.
- The current image has product-specific alternative text and the image position is announced.
- Download progress uses `aria-busy`; failure text uses `role="alert"`.
- The arrow glyph is hidden from assistive technology.
- Focus, disabled, and error states do not rely on color alone.

## Responsive and Visual Behavior

- The product-card button is at least 40 by 40 CSS pixels.
- Its surface, border, text color, radius, and shadow use the existing card theme and focus tokens.
- It must not cover the product itself or interfere with the current carousel controls.
- Desktop and tablet popups cap their content width and height to the viewport.
- Mobile popups use the available viewport with at least a 16-pixel outer gutter, stack footer actions safely, and never create horizontal overflow.
- The image uses `object-fit: contain` so the entire source image remains visible.
- Reduced-motion preferences disable nonessential popup transitions.

## Error Handling

- Missing or placeholder-only image list: the card control is omitted.
- Image display failure: show the existing no-image placeholder and keep navigation available for other images.
- Download network or authorization failure: show `Image download failed. Try again.` in the popup.
- Non-image response: reject the download and show the same retry message.
- Object URLs are revoked after use, including when the component unmounts.

## Testing

### Shared product card

- Shows the image-popup control for a product with at least one real image.
- Omits the control for a placeholder-only product.
- Uses a product-specific accessible name.
- Opens the currently selected carousel image.

### Shared popup

- Renders the product heading, selected image, position, and required controls.
- Previous and Next wrap correctly.
- Escape, backdrop, and Close dismiss the popup.
- Focus enters the popup and returns to the opener.
- Download fetches the selected source using the supplied request context.
- Download preserves the response blob and source filename.
- Loading prevents duplicate requests.
- Failure displays the retry message and permits another attempt.

### Catalogue integration

- Published catalogue cards open the shared popup and retain protected-link headers.
- Catalogue preview cards open the same popup.
- Auto-generated and manually created catalogue cards expose the same upper-left control.
- Customer and staff accounts see the same controls when they open the same catalogue.
- Existing carousel, stock, pricing, language, print, and PDF behaviors remain green.

## Acceptance Criteria

- Every published or preview catalogue card with a real product image exposes the upper-left image-popup control.
- The same card and popup buttons appear for auto-generated and manually created catalogues and do not depend on account type.
- The control opens the currently selected product image in the shared popup.
- The popup can navigate all product images and download the displayed image.
- The downloaded file is byte-for-byte the fetched source response and retains its original MIME type and extension.
- The feature is keyboard accessible, responsive, excluded from print/PDF output, and covered by focused regression tests.
