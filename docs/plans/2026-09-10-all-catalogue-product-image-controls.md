# All Catalogue Product Image Controls Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the product-image popup and original-image download controls on every interactive catalogue product card, including the generated public catalogue route reported by the user.

**Architecture:** Extend the shared `CatalogueProductCard` with an opener callback carrying its normalized images and current carousel index. Add one reusable `CatalogueImageDialog` per catalogue view, then connect it to both generated public catalogues and authenticated catalogue previews; Studio-designed catalogues retain their existing image control and use the same user-visible behavior.

**Tech Stack:** TypeScript 5.8, React 19, Next.js 16, CSS Modules, Vitest 4, Testing Library.

## Global Constraints

- Show the upper-left product-image control in every interactive generated catalogue card with at least one real product image.
- Cover published `/c/[token]` catalogue links, authenticated `/catalogues/[id]/preview` views, customer accounts, staff accounts, and both generated and manually designed catalogue presentations.
- Keep Previous, Download image, Next, and Close available in the popup; disable Previous and Next for a one-image product.
- Open the card's currently selected image and wrap navigation across all real product images.
- Download only the displayed source image, preserving its fetched bytes, MIME type, extension, and quality; do not convert or recompress it.
- Preserve catalogue-password headers for protected public catalogues and do not forward credentials to unrelated origins.
- Omit the control for placeholder-only cards and hide all interactive image controls in print and PDF output.
- Preserve existing carousel, product card design, prices, live stock, language, video, PDF, and print behavior.

---

### Task 1: Reusable catalogue image dialog

**Files:**
- Create: `frontend/src/components/catalogue-image-dialog.tsx`
- Create: `frontend/src/components/catalogue-image-dialog.module.css`
- Create: `frontend/src/components/catalogue-image-dialog.test.tsx`

**Interfaces:**
- Consumes: `CatalogueImageItem = { url: string; altText: string; fileName?: string }`, product name/code, initial index, optional `requestHeaders`, `returnFocus`, and `onClose`.
- Produces: `CatalogueImageSelection = { productName: string; productCode: string; images: CatalogueImageItem[]; index: number; returnFocus: HTMLButtonElement }` and `CatalogueImageDialog(props)` for both catalogue consumers.

- [ ] **Step 1: Add the focused failing test**

  Add exact assertions that the dialog renders the product heading, selected image, `1 of 2`, Close, Previous, Download image, and Next; Previous/Next wrap; one-image navigation remains visible and disabled; Escape and backdrop close and restore opener focus; opening locks document scrolling; download fetches the selected URL and supplied same-origin headers, creates an anchor from the untouched response blob, uses a sanitized source filename/extension, disables duplicate requests while pending, and exposes the retry message after an invalid or failed image response.

- [ ] **Step 2: Verify the relevant failure**

  Run: `npm test -- --run src/components/catalogue-image-dialog.test.tsx`
  Expected: Vitest fails because `catalogue-image-dialog.tsx` does not exist.

- [ ] **Step 3: Implement the minimum behavior**

  Implement a client component with internal active-index, downloading, and error state. Clamp the initial index; wrap navigation; render the image with `object-fit: contain`; trap Tab focus within the dialog; close on Escape/backdrop/Close; set `document.body.style.overflow = "hidden"` while mounted and restore the prior value on cleanup; return focus on close. For download, accept only HTTP(S) URLs from the supplied normalized list, attach `requestHeaders` only when the selected URL has the same origin as `API_ORIGIN`, require an `image/*` response, preserve the response Blob, derive the filename from `Content-Disposition` or the URL and fall back to `<sanitized-code>-image-<position>.<mime-extension>`, click a temporary object-URL anchor, revoke the URL, and present `Image download failed. Try again.` on failure.

- [ ] **Step 4: Verify the focused pass**

  Run: `npm test -- --run src/components/catalogue-image-dialog.test.tsx`
  Expected: All dialog navigation, accessibility, download, and failure tests pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `npm run lint -- src/components/catalogue-image-dialog.tsx src/components/catalogue-image-dialog.test.tsx`
  Expected: ESLint reports no errors in the new component and tests.

- [ ] **Step 6: Commit the passing deliverable**

  ```bash
  git add frontend/src/components/catalogue-image-dialog.tsx frontend/src/components/catalogue-image-dialog.module.css frontend/src/components/catalogue-image-dialog.test.tsx
  git commit -m "feat: add catalogue image download dialog"
  ```

### Task 2: Product-card image opener

**Files:**
- Modify: `frontend/src/components/catalogue-product-card.tsx:60`
- Modify: `frontend/src/components/catalogue-product-card.module.css:65`
- Create: `frontend/src/components/catalogue-product-card.test.tsx`

**Interfaces:**
- Consumes: existing `CataloguePreviewProduct`, `productImageUrls`, card carousel state, and optional `onOpenImages(selection: CatalogueImageSelection): void`.
- Produces: a 40-by-40 upper-left `View and download images for <product name>` button that sends the normalized real-image list and current index to its parent.

- [ ] **Step 1: Add the focused failing test**

  Render a card with two source images and assert the accessible opener exists; select Next and then the opener and assert the callback receives both normalized media URLs and index `1`; render a product with no source images and assert the opener is absent; verify the existing carousel and product data still render.

- [ ] **Step 2: Verify the relevant failure**

  Run: `npm test -- --run src/components/catalogue-product-card.test.tsx`
  Expected: Tests fail because `CatalogueProductCard` has no `onOpenImages` property or opener button.

- [ ] **Step 3: Implement the minimum behavior**

  Add the optional callback without changing existing callers. Separate real source images from the local `/no-image.png` fallback, normalize them through `mediaUrl`, and render the upper-left button only when a real image and callback exist. On click, send `{ productName: name, productCode: product.code, images: realImages.map((url, imagePosition) => ({ url, altText: `${name} image ${imagePosition + 1}` })), index: safeImageIndex, returnFocus: event.currentTarget }`. Style the control with existing theme variables, keep it clear of carousel arrows, include it in focus styling, and add it to the print-hidden selector.

- [ ] **Step 4: Verify the focused pass**

  Run: `npm test -- --run src/components/catalogue-product-card.test.tsx`
  Expected: Opener, selected-index, placeholder, and existing-content assertions pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `npm test -- --run src/components/catalogue-product-card.test.tsx src/components/product-video-player.test.tsx`
  Expected: New card tests and existing video-control tests pass.

- [ ] **Step 6: Commit the passing deliverable**

  ```bash
  git add frontend/src/components/catalogue-product-card.tsx frontend/src/components/catalogue-product-card.module.css frontend/src/components/catalogue-product-card.test.tsx
  git commit -m "feat: expose image controls on catalogue cards"
  ```

### Task 3: Connect every generated catalogue surface

**Files:**
- Modify: `frontend/src/app/c/[token]/public-catalogue-viewer.tsx:91`
- Modify: `frontend/src/app/c/[token]/public-catalogue-viewer.test.tsx`
- Modify: `frontend/src/app/c/[token]/public-catalogue.module.css:166`
- Modify: `frontend/src/app/catalogues/[id]/preview/catalogue-preview.tsx:23`
- Modify: `frontend/src/app/catalogues/[id]/preview/preview.module.css`
- Create: `frontend/src/app/catalogues/[id]/preview/catalogue-preview.test.tsx`

**Interfaces:**
- Consumes: `CatalogueImageSelection`, `CatalogueImageDialog`, `CatalogueProductCard.onOpenImages`, public catalogue password, and authenticated preview context.
- Produces: one shared dialog instance in each catalogue view and visible openers on every shared product card.

- [ ] **Step 1: Add the focused failing tests**

  In the public-viewer test, load a generated catalogue with a product image, assert `View and download images for <product>` exists, open it, assert all four popup controls, navigate, and verify the public password header reaches the image request only for the backend origin. In the preview test, load an authenticated generated catalogue, assert the same opener and popup controls, and verify closing restores focus. Add DOM assertions that the controls are not rendered into print/PDF-only Studio render modes, while the existing Studio-designed catalogue popup remains available.

- [ ] **Step 2: Verify the relevant failure**

  Run: `npm test -- --run 'src/app/c/[token]/public-catalogue-viewer.test.tsx' 'src/app/catalogues/[id]/preview/catalogue-preview.test.tsx'`
  Expected: Tests fail because generated public and preview cards do not pass `onOpenImages` and the preview has no shared dialog.

- [ ] **Step 3: Implement the minimum behavior**

  Add `CatalogueImageSelection | null` state to both views, pass `onOpenImages={setImageSelection}` to every shared `CatalogueProductCard`, and render one `CatalogueImageDialog` near each view root. Supply `{ "X-Catalogue-Password": password }` to the public dialog only when a password exists; preview uses its normal authenticated fetch context. Replace the public Studio-only dialog markup and `downloadStudioImage` state handling with the reusable dialog through an adapter from `PreviewImageSelection` to `CatalogueImageSelection`, preserving Studio titles, file names, selected index, and source URLs. Remove obsolete public dialog CSS after the shared component owns that presentation. Do not alter print/PDF rendering or product data.

- [ ] **Step 4: Verify the focused pass**

  Run: `npm test -- --run 'src/app/c/[token]/public-catalogue-viewer.test.tsx' 'src/app/catalogues/[id]/preview/catalogue-preview.test.tsx'`
  Expected: Both generated catalogue surfaces expose the opener and the full popup button set; protected download and focus assertions pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `npm test -- --run src/components/catalogue-image-dialog.test.tsx src/components/catalogue-product-card.test.tsx 'src/app/c/[token]/public-catalogue-viewer.test.tsx' 'src/app/catalogues/[id]/preview/catalogue-preview.test.tsx' src/app/catalogue-studio/studio-preview.test.tsx`
  Expected: All focused and Studio-regression tests pass.

  Run: `npm run lint`
  Expected: ESLint exits successfully.

  Run: `npm run build`
  Expected: Next.js production build completes with no TypeScript or route errors.

- [ ] **Step 6: Commit the passing deliverable**

  ```bash
  git add frontend/src/components frontend/src/app/c/[token] frontend/src/app/catalogues/[id]/preview
  git commit -m "feat: show image controls in every catalogue"
  ```

## Unresolved Product Decisions

None. The approved design defines scope, placement, popup controls, navigation, download fidelity, authentication boundary, placeholder behavior, and print/PDF exclusion.
