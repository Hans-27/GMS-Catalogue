# Platform Mobile-Responsive UI Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every active frontend surface usable at a 360 px viewport while preserving the current desktop experience, and provide a deliberately simplified mobile Catalogue Studio for previewing, reordering pages, changing text/images, publishing, and downloading.

**Architecture:** Keep one Next.js application, one route set, and the existing APIs/state model. Add shared viewport and accessibility primitives, adapt each existing shell at its owning component/CSS module, and branch only the Catalogue Studio presentation at 760/761 px so mobile reuses the desktop editor's existing actions without mounting its dense canvas editing UI.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.8, CSS Modules, Vitest + Testing Library, Playwright overlap/a11y-oriented geometry tests.

## Global Constraints

- The approved behavior is defined in `docs/specs/2026-09-16-platform-mobile-responsive-design.md`; implementation must not silently expand or reduce it.
- Mobile means `max-width: 760px`; the full desktop Studio starts at `min-width: 761px`.
- Support 360 px minimum width, verify representative widths at 375 px, 768 px, and 1440 px.
- No document-level horizontal overflow at 360 px. Wide data tables may scroll inside a labelled table region.
- All interactive phone controls must have at least a 44 × 44 px target.
- Drawers and dialogs must trap focus, close on Escape and backdrop activation, lock background scrolling, and restore focus to their opener.
- Preserve API error messages, autosave state, permissions, publication rules, customer-link pricing, and ERP-backed data behavior.
- Do not create separate mobile routes, APIs, models, or duplicated business logic.
- Keep desktop behavior and public catalogue print/PDF layouts unchanged.
- The workspace has no `.git` directory. Replace each commit checkpoint below with a recorded passing verification checkpoint; do not initialize or fabricate a repository.

---

## Task 1: Establish Mobile Foundations and Expand the Regression Harness

**Files:**

- Create: `frontend/src/hooks/use-mobile-viewport.ts`
- Create: `frontend/src/hooks/use-mobile-viewport.test.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/e2e/overlap/overlap-tracer.spec.ts`
- Modify: `frontend/e2e/overlap/audit-types.ts`
- Modify: `frontend/e2e/overlap/geometry.ts`

- [ ] Write a failing hook test proving `useMobileViewport()` returns mobile at 760 px, desktop at 761 px, and updates when the media query changes.
- [ ] Implement `useMobileViewport()` with `window.matchMedia('(max-width: 760px)')`, an SSR-safe default, listener cleanup, and a single exported breakpoint constant.
- [ ] Add shared global mobile safeguards: `min-width: 0` for application layout children, responsive media defaults, safe-area padding variables, consistent 44 px touch-target custom properties, and reduced-motion handling. Do not globally hide overflow because that would conceal real layout defects.
- [ ] Extend the overlap tracer viewports to include 360 × 800, 375 × 812, 768 × 1024, and 1440 × 900.
- [ ] Add audit support for detecting document horizontal overflow and undersized visible interactive controls on mobile, with explicit allow-list entries only for intentional compact canvas controls or table-internal controls.
- [ ] Add route cases for `/login`, `/dashboard`, `/promotions`, one authenticated customer route, one public catalogue route, one catalogue preview route, and one Studio editor route. Read IDs/tokens from `.env.e2e.local`; skip with an explicit reason if fixture data is unavailable.
- [ ] Run `npm test -- --run src/hooks/use-mobile-viewport.test.tsx` from `frontend` and confirm green.
- [ ] Run `npm run test:ui-overlap:tracer` against the current UI and preserve the failing mobile findings as the red baseline for later tasks.
- [ ] Checkpoint: record hook test output and the baseline overlap report path.

## Task 2: Make Dashboard and Administrative Management Responsive

**Files:**

- Modify: `frontend/src/app/dashboard/dashboard-sidebar.tsx`
- Modify: `frontend/src/app/dashboard/dashboard-sidebar.test.tsx`
- Modify: `frontend/src/app/dashboard/page.tsx`
- Modify: `frontend/src/app/dashboard/dashboard.module.css`
- Modify: `frontend/src/app/admin/management/admin-page-frame.tsx`
- Create: `frontend/src/app/admin/management/admin-page-frame.test.tsx`
- Modify: `frontend/src/app/admin/management/admin-management.module.css`
- Modify: `frontend/src/app/admin/settings/settings-shell.tsx`
- Modify: `frontend/src/app/admin/settings/settings.module.css`

- [ ] Add failing tests for the dashboard/admin mobile navigation: menu button labelling, drawer open/close, Escape close, backdrop close, body-scroll lock, focus trap, and focus restoration.
- [ ] Reuse the current dashboard sidebar state and behavior instead of creating a second navigation tree. At mobile widths render it as a fixed overlay drawer; at desktop widths retain the existing persistent sidebar.
- [ ] Make the top bar wrap into a compact mobile header: page identity first, menu and primary status/action controls visible, secondary controls moved into an accessible `More` menu.
- [ ] Convert summary grids and admin forms to one column at 760 px, then progressively restore columns at tablet/desktop widths.
- [ ] Wrap each wide management table in a focusable region with `role="region"`, an accessible label, and a visible “Swipe to see more” hint on mobile. Keep headers and cell relationships intact.
- [ ] Ensure dialogs and flyouts use `max-height: calc(100dvh - 32px)`, internal scrolling, safe-area padding, and bounded widths.
- [ ] Ensure navigation/current-page state, permissions, search, filters, and existing mutations are unchanged.
- [ ] Run the dashboard/sidebar and admin frame unit tests.
- [ ] Run the overlap tracer for `/dashboard` at 360, 375, 768, and 1440 px; confirm no document overflow and no unintended overlap.
- [ ] Checkpoint: record passing unit and dashboard overlap tests.

## Task 3: Make Customer, Promotions, and Authentication Flows Responsive

**Files:**

- Modify: `frontend/src/app/customer/customer-portal.tsx`
- Modify: `frontend/src/app/customer/customer-portal.module.css`
- Modify: `frontend/src/app/customer/customer-portal.test.tsx`
- Modify: `frontend/src/app/promotions/promotion-workspace.tsx`
- Modify: `frontend/src/app/promotions/promotions.module.css`
- Modify: `frontend/src/app/promotions/promotion-workspace.test.tsx`
- Modify: `frontend/src/app/login/login.module.css`
- Modify: `frontend/src/app/login/login-form.test.tsx`
- Modify: `frontend/src/app/register/register-form.tsx`

- [ ] Add failing tests proving the existing customer drawer retains focus correctly and the Promotions shell gains equivalent mobile drawer behavior without hiding navigation entirely.
- [ ] Preserve the customer portal's current drawer implementation, fixing only missing 44 px targets, viewport-safe spacing, top-bar wrapping, single-column catalogue cards, and modal bounds.
- [ ] Replace Promotions' current mobile `display:none` sidebar behavior with an accessible menu button, overlay drawer, backdrop, close button, Escape handling, focus trap/restoration, and body-scroll lock.
- [ ] Stack promotion filters, summaries, builder steps, calendars, product selectors, and preview controls at mobile widths. Preserve the four-step promotion logic and all existing permission/status rules.
- [ ] Make login and registration cards fit 360 px with keyboard-safe vertical scrolling, visible validation, and 44 px controls; keep password toggles embedded and correctly labelled.
- [ ] Run targeted customer, promotion, login, and registration tests.
- [ ] Run overlap checks for login, customer, and promotion routes at all four target widths.
- [ ] Checkpoint: record passing tests and screenshots for a customer page and Promotions builder at 375 px.

## Task 4: Harden Public Catalogue and Published Preview Mobile Layouts

**Files:**

- Modify: `frontend/src/components/catalogue-sidebar.tsx`
- Modify: `frontend/src/components/catalogue-sidebar.module.css`
- Modify: `frontend/src/components/catalogue-sidebar.test.tsx`
- Modify: `frontend/src/components/catalogue-product-card.module.css`
- Modify: `frontend/src/components/catalogue-product-card.test.tsx`
- Modify: `frontend/src/components/catalogue-image-dialog.module.css`
- Modify: `frontend/src/app/c/[token]/public-catalogue-viewer.tsx`
- Modify: `frontend/src/app/c/[token]/public-catalogue-viewer.test.tsx`
- Modify: `frontend/src/app/catalogues/[id]/preview/catalogue-preview.tsx`
- Modify: `frontend/src/app/catalogues/[id]/preview/catalogue-preview.test.tsx`
- Modify: `frontend/e2e/overlap/catalogue-sidebar-render.spec.ts`
- Modify: `frontend/e2e/overlap/online-cover-render.spec.ts`

- [ ] Add failing tests for 360 px product-card geometry, catalogue drawer focus behavior, image dialog bounds, long product names, large stock/price strings, missing images, and bilingual labels.
- [ ] Keep the existing full-height dark-green desktop sidebar. On mobile, retain its current menu-bar/drawer architecture and ensure the drawer exposes logo, search, counts, active category, Back to Cover, PDF, and Print without obscuring content.
- [ ] Render product cards as one column on phones, with title/model/warranty/table/retail price arranged without clipping. Keep the requested catalogue-specific colors and current download/image carousel behavior.
- [ ] Keep tables semantically intact; allow local horizontal scrolling only when three columns cannot fit legibly.
- [ ] Bound the product-image lightbox to `100dvh`, make the image area shrink safely, keep close/download/navigation reachable, and preserve original-format downloads.
- [ ] Ensure public and Studio preview routes share responsive catalogue components instead of diverging into duplicated CSS.
- [ ] Verify print/PDF media styles are unaffected.
- [ ] Run the catalogue sidebar, product card, public viewer, and catalogue preview unit tests.
- [ ] Run the catalogue-specific Playwright render specs at 360, 375, 768, and 1440 px.
- [ ] Checkpoint: record passing catalogue tests and mobile render captures.

## Task 5: Introduce the Simplified Mobile Catalogue Studio Shell

**Files:**

- Create: `frontend/src/app/catalogue-studio/studio-mobile-editor.tsx`
- Create: `frontend/src/app/catalogue-studio/studio-mobile-editor.test.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-editor.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-editor.test.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio.module.css`

- [ ] Extract a typed `StudioMobileEditorProps` contract that receives the loaded design, active page/document, permissions, save/publication/export state, and callback functions. Do not duplicate API calls inside the mobile component.
- [ ] Add failing tests proving the simplified editor mounts at 760 px and the full editor mounts at 761 px without mounting both interactive trees simultaneously.
- [ ] Add failing tests for the mobile header: Back, design name, saved/saving/failed state, Preview, Publish/Unpublish when permitted, Download, and overflow actions.
- [ ] Implement a compact sticky mobile header and three clear sections: `Pages`, `Content`, and `Publish`.
- [ ] Reuse the existing `saveNow`, `openPreview`, `publish`, `unpublish`, and `queueExport` callbacks from `studio-editor.tsx`; preserve permission gates, confirmation behavior, API errors, and autosave notices.
- [ ] Keep the desktop canvas, side panels, resize handles, selection tools, and technical element controls unmounted on mobile. Keep the current desktop DOM and behavior unchanged at 761 px and above.
- [ ] Show the active page as a scaled read-only preview using the existing preview renderer rather than a second canvas implementation.
- [ ] Add mobile-safe loading, empty, error, and stale-revision recovery states.
- [ ] Run the new mobile editor tests plus the complete existing `studio-editor.test.tsx` suite.
- [ ] Checkpoint: record passing boundary tests at 760/761 px.

## Task 6: Add Mobile Page Reordering

**Files:**

- Modify: `frontend/src/app/catalogue-studio/studio-mobile-editor.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-mobile-editor.test.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-editor.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio.module.css`

- [ ] Add failing tests for page selection, move up/down, disabled boundary buttons, immediate order feedback, autosave success, API failure rollback/message, and active-page preservation.
- [ ] Present pages as compact thumbnail rows with page name/type, position, active state, and 44 px Move up/Move down buttons. Do not require drag-and-drop on touch.
- [ ] Adapt the existing `movePage(direction)` behavior into a callback that can target the selected page and still use the current revision/save conflict handling.
- [ ] Keep locked-page and permission restrictions identical to desktop behavior.
- [ ] Announce successful reordering and errors through an `aria-live` status region.
- [ ] Run the mobile Studio tests and existing page rename/delete/reorder tests to prevent desktop regressions.
- [ ] Checkpoint: record passing page-order tests.

## Task 7: Add Mobile Text and Image Editing

**Files:**

- Modify: `frontend/src/app/catalogue-studio/studio-mobile-editor.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-mobile-editor.test.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-editor.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio.module.css`

- [ ] Add failing tests that list only editable text/image elements from the active page, select an element, change text, replace an image, step through ERP images, save, recover from failure, and preserve unchanged element geometry/style.
- [ ] In `Content`, group editable items into `Text` and `Images` with recognizable thumbnails/labels; omit technical layout controls from mobile.
- [ ] For text, expose content only plus the existing background/no-background choice when applicable. Use the current element update/autosave path.
- [ ] For images, reuse current ERP image selection, upload, preview, carousel stepping, and removal callbacks where permissions allow. Never down-convert or alter the original uploaded/ERP file.
- [ ] Keep form actions sticky above the mobile safe area when the virtual keyboard is open; ensure validation and server errors remain visible.
- [ ] Confirm mobile edits appear in the desktop editor after reload and desktop edits appear in mobile, proving both presentations use the same saved document.
- [ ] Run mobile content tests and existing text/image/carousel/download Studio tests.
- [ ] Checkpoint: record cross-presentation persistence evidence.

## Task 8: Complete Mobile Publish, Download, and Preview Workflows

**Files:**

- Modify: `frontend/src/app/catalogue-studio/studio-mobile-editor.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-mobile-editor.test.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-preview.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio-preview.test.tsx`
- Modify: `frontend/src/app/catalogue-studio/studio.module.css`

- [ ] Add failing tests for save-before-preview, blocked preview after save failure, publish confirmation, unpublish confirmation, permission-hidden actions, cover-change publication, PNG/JPEG/PDF/template downloads, and export-history navigation.
- [ ] Build the `Publish` section from existing status and callbacks: current publication state, latest save state, validation/error message, permitted primary action, and export choices.
- [ ] Keep Preview as a full-screen mobile route with a clear Editor return control, device-safe toolbar, and no canvas overflow.
- [ ] Render export choices in a bottom sheet or full-width menu that fits within `100dvh`, traps focus, closes predictably, and retains server errors.
- [ ] Verify downloads start from a user gesture and keep current file types/quality; do not implement a parallel export pipeline.
- [ ] Run mobile Studio and Studio preview tests.
- [ ] Checkpoint: record publish/download workflow results for authorized and read-only users.

## Task 9: Run the Full Mobile/Tablet/Desktop Release Gate

**Files:**

- Modify: `frontend/e2e/overlap/overlap-tracer.spec.ts`
- Modify: `frontend/e2e/overlap/studio-sidebar-render.spec.ts`
- Create: `frontend/e2e/overlap/mobile-workflows.spec.ts`
- Modify: `docs/specs/2026-09-16-platform-mobile-responsive-design.md` only if implementation evidence requires a documented, user-approved correction.

- [ ] Add end-to-end workflows for: opening/closing each drawer, navigating a public catalogue, using a product image dialog, creating/editing a promotion, reordering a Studio page, changing text/image content, previewing, publishing, and opening downloads.
- [ ] Assert no document horizontal overflow, no obscured primary action, no unintended overlapping controls, and no clipped dialog at 360, 375, 768, and 1440 px.
- [ ] Exercise keyboard navigation at desktop/tablet and touch-sized controls at mobile; include Escape/focus-restoration assertions for drawers and dialogs.
- [ ] Run `npm test` from `frontend`.
- [ ] Run `npm run lint` from `frontend`.
- [ ] Run `npm run build` from `frontend`.
- [ ] Run `npm run test:ui-overlap` from `frontend` with authenticated fixture variables configured.
- [ ] Manually inspect screenshots for dashboard, customer portal, Promotions, public catalogue, catalogue preview, and both Studio modes at all target widths.
- [ ] Confirm desktop screenshots and print/PDF output have no visual regression.
- [ ] Record any unavailable external dependency (ERP, PostgreSQL, export worker, or fixture token) as an explicit unverified item; never report it as passing without evidence.
- [ ] Final checkpoint: attach the test commands/results, screenshot/report locations, and any remaining verified limitations.

## Definition of Done

- Every active frontend route is usable at 360 px without document-level horizontal scrolling.
- Navigation, primary actions, forms, tables, dialogs, and error messages remain reachable and understandable on mobile.
- Catalogue Studio provides exactly the approved simplified mobile capabilities and retains the full desktop editor from 761 px upward.
- Existing business logic, permissions, ERP data, pricing, publication, and export behavior are preserved.
- Unit, lint, build, and Playwright release gates pass, or external blockers are named with reproducible evidence.
