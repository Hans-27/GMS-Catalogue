# Platform UI Overlap Audit Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove unintended UI overlap and responsive-layout failures across the full frontend, delete only authorized generated waste, and leave every configured route working at desktop, tablet, and mobile widths.

**Architecture:** Add a frontend-local Playwright route/role audit harness that classifies overflow, clipping, collision, and undersized-control findings against a narrow intentional-overlap manifest. Repair shared layout owners before route-specific CSS, preserve Catalogue Studio's authored coordinate system, and record browser evidence separately from unit-test or static-analysis evidence.

**Tech Stack:** Next.js 16.2.12, React 19.1.0, TypeScript 5.8.3, CSS Modules, Vitest 4.1.10, ESLint 9.39.5, Playwright with the installed Chromium-based Chrome channel, PowerShell for exact-path generated-artifact cleanup.

## Global Constraints

- Cover SuperAdmin, Sales Admin, Sales, Customer, and unauthenticated public/shared-link experiences.
- Test baseline widths of 1440 px, 1024 px, and 390 px; use enough height to exercise scroll, sticky, menu, and dialog states.
- Treat page-level horizontal overflow, content outside its owner, unintended sibling collision, covered content, off-viewport dialogs or menus, unreadable clipping, unusably compressed controls, and Studio editor/preview geometry divergence as defects.
- Preserve intentional background containment, badges, carousel arrows, modal backdrops, authored Studio z-index layers, and booklet/page-stack effects through narrow documented exceptions.
- Preserve permissions, pricing, stock, promotions, publishing rules, catalogue content, source files, databases, `.local`, `uploads`, `node_modules`, `.venv`, and image/media assets.
- Delete only the authorized exact generated paths inventoried in Task 1. Never delete a glob, unresolved variable target, repository root, or workspace root.
- Do not conceal layout defects with global `overflow: hidden`; use intrinsic sizing, `min-width: 0`, responsive grid/flex reflow, bounded component scrolling, and explicit sticky offsets.
- Browser audit cases that lack credentials or stable fixture identifiers report `not configured` and make the full audit fail; they never count as passes.
- The current workspace is not Git-backed (`git rev-parse` exits 1), so this plan intentionally omits commit and branch steps.
- On this Windows host, every `npm` command shown below is executed through `npm.cmd` because PowerShell execution policy blocks `npm.ps1`; the script name and arguments remain otherwise identical.

---

### Task 1: Remove only authorized generated waste and record the deletion manifest

**Files:**
- Delete generated directory: `.codex_tmp`
- Delete stale generated directory before rebuilding: `frontend/.next`
- Delete generated file: `frontend/tsconfig.tsbuildinfo`
- Delete generated runtime logs: `frontend/.codex-dev.err.log`, `frontend/.codex-dev.out.log`, `frontend/.next-dev.parity.err.log`, `frontend/.next-dev.parity.out.log`, `frontend/.next-start.err.log`, `frontend/.next-start.out.log`, `frontend/frontend-dev-webpack.err.log`, `frontend/frontend-dev-webpack.out.log`, `frontend/frontend-dev.err.log`, `frontend/frontend-dev.out.log`, `frontend/studio-web.err.log`, `frontend/studio-web.out.log`
- Create: `docs/stabilization/ui-overlap-cleanup-2026-09-11.md`

**Interfaces:**
- Consumes: the explicit allowlist above and resolved workspace root `C:\Project GMS\catalogue-main`
- Produces: a tracked before/after manifest with absolute path, file count, byte count, deletion result, and protected-path exclusions

- [ ] **Step 1: Build and validate the exact deletion set without deleting**

Resolve every listed target with `GetFullPath`. Assert each target begins with `C:\Project GMS\catalogue-main\` and that its final path exactly equals an allowlisted path. Record `.local`, `uploads`, `node_modules`, `.venv`, `backend`, `frontend/src`, `frontend/public`, and all database extensions as explicit exclusions. If any target cannot be resolved or falls outside the workspace, stop before deletion and record the target as rejected.

- [ ] **Step 2: Detect active writers**

Inspect processes listening on port 3000 and any process whose command line references this workspace. If an exact workspace-owned Next.js process is writing `frontend/.next` or one of the allowlisted logs, stop only that confirmed process and record its command for restart. Do not terminate unrelated Node, Python, browser, or database processes.

- [ ] **Step 3: Delete the validated targets**

Use PowerShell `Remove-Item -LiteralPath <validated-absolute-path> -Recurse -Force` for directories and `Remove-Item -LiteralPath <validated-absolute-path> -Force` for files. Missing allowlisted targets are recorded as `already absent`; access-denied targets are recorded as failed and are not bypassed with a broader command.

- [ ] **Step 4: Verify protected paths and document the result**

Run exact `Test-Path -LiteralPath` checks for `.local`, `uploads`, `node_modules`, `.venv`, `backend`, `frontend/src`, and `frontend/public`; each must remain present when it existed before cleanup. The deletion manifest must list the total reclaimed bytes and state that the later build will recreate a current `.next` output.

- [ ] **Step 5: Restart only a workspace process stopped in Step 2**

Restart it with its recorded working directory and command, with `-WindowStyle Hidden`, then verify `http://127.0.0.1:3000/login` returns an HTTP response. If no process was stopped, do not launch an extra server in this task.

- [ ] **Step 6: Record the task gate**

Append the exact cleanup checks, exit codes, and decisive output to the durable evidence log. Task 1 passes only if every deleted path was allowlisted and every protected path retained its pre-cleanup existence state.

---

### Task 2: Add the Playwright audit tracer and deterministic geometry classifier

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `.gitignore`
- Create: `frontend/playwright.overlap.config.ts`
- Create: `frontend/e2e/overlap/audit-types.ts`
- Create: `frontend/e2e/overlap/geometry.ts`
- Create: `frontend/e2e/overlap/geometry.spec.ts`
- Create: `frontend/e2e/overlap/auth.setup.ts`
- Create: `frontend/e2e/overlap/overlap-tracer.spec.ts`
- Create: `frontend/.env.e2e.example`

**Interfaces:**
- Consumes: `GMS_E2E_BASE_URL`, `GMS_E2E_BROWSER_CHANNEL`, `GMS_E2E_SUPERADMIN_IDENTIFIER`, `GMS_E2E_SUPERADMIN_PASSWORD`, and the `/login` labels `Username or email` and `Password`
- Produces: `collectLayoutFindings(page, auditCase): Promise<LayoutFinding[]>`, reusable `AuditCase`, `AuditException`, and `LayoutFinding` types, authenticated storage state under ignored `frontend/test-results/auth/`

- [ ] **Step 1: Add the focused failing tracer test**

Create a public `/login` case and an authenticated `/dashboard` case, each at 1440×900, 1024×900, and 390×844. Assert: `document.documentElement.scrollWidth <= clientWidth + 1`; fixed/sticky elements remain within the viewport; visible sibling candidates do not intersect by more than 4 square pixels unless excepted; interactive controls do not overlap adjacent controls; controls below 24×24 pixels fail and controls below 40×40 pixels are reported as warnings. Ignore hidden or zero-size nodes, ancestor/descendant containment, SVG internals, and declared exceptions.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test -- --runInBand` is not valid for this Vitest project; instead install no package yet and run `npm run test:ui-overlap:tracer` from `frontend`.

Expected: nonzero exit because `test:ui-overlap:tracer` and the Playwright configuration do not exist. This proves the audit capability is missing rather than exposing an unrelated TypeScript failure.

- [ ] **Step 3: Install and configure the minimum browser tooling**

Run `npm install --save-dev @playwright/test` from `frontend`, updating the existing lockfile. Add scripts:

- `test:ui-overlap`: `playwright test --config playwright.overlap.config.ts`
- `test:ui-overlap:tracer`: `playwright test --config playwright.overlap.config.ts --grep @tracer`

Configure `baseURL` from `GMS_E2E_BASE_URL` with `http://127.0.0.1:3000` as the local default, Chromium using `GMS_E2E_BROWSER_CHANNEL` with `chrome` as the local default, one worker, retries disabled locally, traces/screenshots only on failure, and output under ignored `test-results`/`playwright-report`. By default, require a separately owned running server. Enable Playwright's `webServer` only with `GMS_E2E_MANAGE_SERVER=1` in an isolated environment; on this Windows host a managed Next.js server can hang during shutdown when external browser tabs hold connections.

- [ ] **Step 4: Implement deterministic readiness and classification**

After `domcontentloaded`, wait for the route's declared root locator, then sample document and landmark rectangles until three consecutive animation-frame samples are equal within one pixel. Fail after the configured test timeout rather than sleeping for an arbitrary fixed interval. Return findings with `kind`, route, viewport, selectors, rectangles, overlap area, severity, and exception identifier. A missing credential throws `Not configured: <ENV_NAME>` and fails the test visibly.

- [ ] **Step 5: Verify the focused pass**

Run: `npm run test:ui-overlap:tracer` from `frontend` with SuperAdmin credentials configured.

Expected: six cases pass—two routes at three widths—with no unexplained findings. Failure artifacts identify the exact route, viewport, selectors, and rectangles.

- [ ] **Step 6: Run the affected integration check and record the gate**

Run: `npm test -- src/app/login/login-form.test.tsx` and `npm run lint -- e2e playwright.overlap.config.ts` from `frontend`.

Expected: existing login behaviour remains green and new audit files lint cleanly. Append exact command output to durable evidence.

---

### Task 3: Cover the full route/role matrix and intentional-overlap contract

**Files:**
- Create: `frontend/e2e/overlap/route-manifest.ts`
- Create: `frontend/e2e/overlap/intentional-overlaps.ts`
- Create: `frontend/e2e/overlap/platform-overlap.spec.ts`
- Modify: `frontend/.env.e2e.example`
- Create: `docs/stabilization/ui-overlap-route-matrix-2026-09-11.md`

**Interfaces:**
- Consumes: `AuditCase` and `AuditException` from Task 2; the 39 observed App Router pages; dashboard views from `frontend/src/lib/routes.ts`; environment-provided catalogue, design, promotion, role, and public-link identifiers
- Produces: `PLATFORM_AUDIT_CASES: readonly AuditCase[]`, `INTENTIONAL_OVERLAPS: readonly AuditException[]`, and a route/role/viewport coverage table

- [ ] **Step 1: Add a manifest-completeness failure**

Create an audit test that compares the declared page-pattern set against the 39 observed `frontend/src/app/**/page.tsx` patterns and separately requires dashboard cases for `overview`, `products`, `categories`, `catalogues`, `pricing`, `organization`, and `users`. Assert every case declares role, root locator, all three viewports, and any dynamic identifier environment variable.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm run test:ui-overlap -- --grep "manifest completeness"` from `frontend`.

Expected: nonzero exit listing undeclared route patterns and dashboard views.

- [ ] **Step 3: Populate the route and role manifest**

Declare all static pages directly. Build dynamic URLs only from named environment values: `GMS_E2E_CATALOGUE_ID`, `GMS_E2E_STUDIO_DESIGN_ID`, `GMS_E2E_PROMOTION_ID`, `GMS_E2E_PUBLIC_CATALOGUE_TOKEN`, `GMS_E2E_PUBLIC_PROMOTION_TOKEN`, and `GMS_E2E_ROLE_ID`. Add role credentials for Sales Admin, Sales, and Customer alongside SuperAdmin. Customer Portal access uses `GMS_E2E_CUSTOMER_ACCESS_CODE` and must not expose the code in logs or screenshots.

Each case declares read-only interactions needed to expose menus, dropdowns, sidebar states, validation, carousels, dialogs, tables, Studio panels, preview modes, and populated cards. Do not invoke publish, delete, save, synchronize, create-account, create-catalogue, create-promotion, or data-mutation controls.

- [ ] **Step 4: Encode only approved overlap exceptions**

Add narrow component-pair exceptions for card/background containment, badges, carousel arrows, modal backdrop/dialog, Studio canvas parent/layer, and booklet page-stack effects. Every exception includes a stable selector pair, route-family restriction, and reason. Reject wildcard route exceptions and selector patterns that suppress all siblings.

- [ ] **Step 5: Verify manifest completeness**

Run: `npm run test:ui-overlap -- --grep "manifest completeness"`.

Expected: the manifest completeness test passes. Missing runtime identifiers may fail route execution later but cannot remove cases from the matrix.

- [ ] **Step 6: Record the task gate**

Generate `docs/stabilization/ui-overlap-route-matrix-2026-09-11.md` with each page pattern, dashboard variant, required role, dynamic configuration, and the three viewports. Append focused command output to durable evidence.

---

### Task 4: Repair shared shell, dashboard, and administration layouts

**Files:**
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/dashboard/dashboard.module.css`
- Modify when markup needs a stable audit landmark: `frontend/src/app/dashboard/page.tsx`, `frontend/src/app/dashboard/dashboard-sidebar.tsx`, `frontend/src/app/dashboard/dashboard-overview.tsx`
- Modify: `frontend/src/app/admin/management/admin-management.module.css`
- Modify: `frontend/src/app/admin/settings/settings.module.css`
- Modify only when its component owns the failing geometry: `frontend/src/app/admin/management/admin-page-frame.tsx`, `frontend/src/app/admin/management/organization-entity-management.tsx`, `frontend/src/app/admin/settings/settings-shell.tsx`
- Modify focused existing tests beside the affected components
- Create: `frontend/e2e/overlap/dashboard-admin-overlap.spec.ts`

**Interfaces:**
- Consumes: dashboard shell landmarks `.app`, `.sidebar`, `.workspace`, `.topbar`, `.mainContent`; dashboard view routes from `APP_ROUTES`; shared `LayoutFinding` classifier
- Produces: responsive shell geometry in which sidebars, sticky headers, quick actions, cards, forms, menus, tables, and dialogs stay bounded at all three widths

- [ ] **Step 1: Capture the failing dashboard/admin browser cases before source edits**

Run the dashboard and admin manifest subset at 1440, 1024, and 390 widths. Save the nonzero output and screenshots for every actual overflow/collision candidate. Add one focused regression assertion per confirmed defect—for example, a Quick Actions hover target remains inside its card container, mobile sidebar/backdrop does not cover the focused main control after closing, and scrollable admin tables remain inside `.tableWrap` rather than widening the page.

- [ ] **Step 2: Verify each regression is genuinely red**

Run the exact focused Vitest or Playwright command before changing production source. Expected: nonzero exit showing the confirmed geometry assertion, not a missing fixture or selector.

- [ ] **Step 3: Repair shared ownership first**

Apply `min-width: 0` to grid/flex children that own shrinking, allow toolbar/action groups to wrap or component-scroll at 1024/390 widths, keep fixed mobile sidebar and backdrop in separate z-index layers, and use `max-width: 100%` plus bounded scrolling for tables and dialogs. Keep hover transforms inside card padding or replace geometry-changing hover movement with shadow/border feedback when it crosses the container edge. Preserve deliberate truncation only where the full value remains available through accessible text or title.

Consolidate duplicate declarations only within the selector being repaired; do not delete CSS solely because a text search does not find a direct `styles.*` reference.

- [ ] **Step 4: Verify focused passes**

Rerun each identical red command. Expected: exit 0 and the affected route has no unexplained findings at all three widths.

- [ ] **Step 5: Run the family integration gate**

Run: `npm test -- src/app/dashboard src/app/admin` followed by `npm run test:ui-overlap -- --grep "dashboard|admin"` and `npm run lint -- src/app/dashboard src/app/admin`.

Expected: existing behaviour, permission-dependent navigation, and responsive audit cases pass. Record all commands and decisive output.

- [ ] **Step 6: Recheck the tracer**

Run `npm run test:ui-overlap:tracer`. Expected: six tracer cases remain green after shared-style changes.

---

### Task 5: Repair Catalogue Studio editor, preview, booklet, print, and PDF geometry

**Files:**
- Modify: `frontend/src/app/catalogue-studio/studio.module.css`
- Modify only for a demonstrated renderer defect: `frontend/src/app/catalogue-studio/studio-editor.tsx`, `frontend/src/app/catalogue-studio/studio-editor-canvas.tsx`, `frontend/src/app/catalogue-studio/studio-preview.tsx`, `frontend/src/app/catalogue-studio/pdf-render-document.tsx`
- Modify focused tests: `frontend/src/app/catalogue-studio/studio-editor.test.tsx`, `frontend/src/app/catalogue-studio/studio-editor-canvas.test.tsx`, `frontend/src/app/catalogue-studio/studio-preview.test.tsx`
- Create: `frontend/e2e/overlap/studio-overlap.spec.ts`

**Interfaces:**
- Consumes: saved Studio page/layer geometry, resizable panel widths, `.editorToolbar`, `.editorBody`, `.leftPanel`, `.propertiesPanel`, `.canvasWorkspace`, `.previewToolbar`, `.previewPage`, and booklet exception pairs
- Produces: bounded Studio chrome at three widths while leaving authored canvas coordinates and print millimetre dimensions unchanged

- [ ] **Step 1: Capture confirmed Studio failures before source edits**

Audit editor with both property-panel states, preview in Mobile/Tablet/Desktop/Booklet modes, and PDF-render route using `GMS_E2E_STUDIO_DESIGN_ID`. Confirm candidates visually so canvas layer intersection, page clipping, booklet shadows, and carousel arrows are not misclassified as UI defects.

- [ ] **Step 2: Add and run focused red regressions**

For each confirmed defect, add the narrowest existing Vitest or Playwright assertion. Required coverage includes: toolbar controls remain reachable at 390 px; panel widths cannot force page-level overflow; off-canvas editor scrolling remains confined to `.canvasWorkspace`; preview toolbar does not cover the first page; table rows in preview retain equal computed heights after empty-row filtering; print/PDF page dimensions remain A4 portrait or landscape as authored.

Run the exact focused command and expect a nonzero geometry assertion before source changes.

- [ ] **Step 3: Repair Studio chrome without normalizing authored layers**

Use toolbar component scrolling or compact groups at 1024/390, constrain persisted panel widths to available shell width, and keep property panels within the viewport. Preserve the existing absolute positioning and z-index of authored canvas elements. Do not add overlap exceptions for ordinary Studio toolbar, sidebar, properties, table, or dialog collisions.

- [ ] **Step 4: Verify focused green cycles**

Rerun every identical red command. Expected: exit 0, equal preview table rows, no toolbar/panel/page collision, and unchanged authored layer placement.

- [ ] **Step 5: Run Studio integration and print gates**

Run: `npm test -- src/app/catalogue-studio`, `npm run test:ui-overlap -- --grep "studio"`, and `npm run lint -- src/app/catalogue-studio`.

Expected: all Studio unit/integration tests and configured visual cases pass. Capture one screenshot per preview mode and record which intersections are intentional.

- [ ] **Step 6: Rerun dependent earlier gates**

Run the tracer plus any shared-shell cases touched by Studio CSS changes. Record current-source evidence; mark earlier evidence stale before rerunning if a shared file changed.

---

### Task 6: Repair catalogue management, authenticated previews, and public catalogue links

**Files:**
- Modify: `frontend/src/app/dashboard/dashboard.module.css`
- Modify: `frontend/src/app/catalogues/[id]/preview/preview.module.css`
- Modify: `frontend/src/app/c/[token]/public-catalogue.module.css`
- Modify only for demonstrated markup defects: `frontend/src/app/dashboard/catalogue-management.tsx`, `frontend/src/app/catalogues/[id]/preview/catalogue-preview.tsx`, `frontend/src/app/c/[token]/public-catalogue-viewer.tsx`, `frontend/src/components/catalogue-product-card.tsx`, `frontend/src/components/catalogue-image-dialog.tsx`
- Modify focused tests beside the affected components
- Create: `frontend/e2e/overlap/catalogue-overlap.spec.ts`

**Interfaces:**
- Consumes: authenticated catalogue ID and public catalogue token; card, toolbar, category navigation, product image dialog, carousel, download, print, and booklet states
- Produces: bounded management cards and viewers with intentional product-image controls and catalogue layers preserved

- [ ] **Step 1: Capture actual catalogue defects at all widths**

Audit catalogue management cards, authenticated preview, public catalogue cover/category/product sections, image popup, image download controls, language controls, PDF/print controls, and booklet mode. Classify carousel arrows, image badges, product-card background containment, and booklet layers through the approved exception manifest.

- [ ] **Step 2: Add and prove focused red regressions**

Add one assertion per confirmed issue. Required invariants: no page-level horizontal overflow; product cards reflow without overlapping image, facts, stock, or price regions; sticky toolbar does not cover anchored category headings; image dialog stays within viewport and keeps close/download/previous/next controls reachable; management-card hover states stay inside their grid.

Run the exact focused command before source edits and record its nonzero, defect-specific failure.

- [ ] **Step 3: Apply local responsive repairs**

Repair only the layout owner: responsive grid columns, `min-width: 0`, bounded toolbar wrapping, scroll margins for anchors, modal max-height/overflow, and non-geometry-changing hover states. Preserve 3-second image auto-advance, original-format image downloads, stock refresh, price mapping, role visibility, and PDF/print behaviour.

- [ ] **Step 4: Verify focused passes and family integration**

Rerun identical red commands, then run: `npm test -- src/app/dashboard/catalogue-management.test.tsx src/app/catalogues/[id]/preview/catalogue-preview.test.tsx src/app/c/[token]/public-catalogue-viewer.test.tsx src/components/catalogue-product-card.test.tsx src/components/catalogue-image-dialog.test.tsx`.

Expected: exit 0 with existing behaviour preserved.

- [ ] **Step 5: Run catalogue browser audit and lint**

Run: `npm run test:ui-overlap -- --grep "catalogue"` and `npm run lint -- src/app/dashboard/catalogue-management.tsx src/app/catalogues src/app/c src/components/catalogue-product-card.tsx src/components/catalogue-image-dialog.tsx`.

Expected: all configured catalogue cases pass at three widths with only documented exceptions.

- [ ] **Step 6: Recheck prior shared gates**

Rerun tracer, dashboard/admin, and Studio cases if `dashboard.module.css` or shared components changed. Append fresh evidence.

---

### Task 7: Repair promotions, Customer Portal, login, registration, and account forms

**Files:**
- Modify: `frontend/src/app/promotions/promotions.module.css`
- Modify only for demonstrated markup defects: `frontend/src/app/promotions/promotion-workspace.tsx`, `frontend/src/app/p/[token]/public-promotion.tsx`
- Modify: `frontend/src/app/customer/customer-portal.module.css`
- Modify only for demonstrated markup defects: `frontend/src/app/customer/customer-portal.tsx`
- Modify: `frontend/src/app/login/login.module.css`
- Modify only for demonstrated form defects: `frontend/src/app/login/login-form.tsx`, `frontend/src/app/register/register-form.tsx`
- Modify focused tests: `frontend/src/app/promotions/promotion-workspace.test.tsx`, `frontend/src/app/customer/customer-portal.test.tsx`, `frontend/src/app/login/login-form.test.tsx`
- Create: `frontend/e2e/overlap/promotion-customer-auth-overlap.spec.ts`

**Interfaces:**
- Consumes: promotion ID/token, Customer credentials/access code, promotion shell, customer sidebar/topbar/account menu, form validation and password-toggle states
- Produces: responsive campaign, customer, and account experiences with menus/dialogs/actions inside the viewport and no loss of role-specific content

- [ ] **Step 1: Capture confirmed failures before production edits**

Audit promotions list/create/edit/detail/preview/calendar/occasions/reports/public page, Customer Portal views and account menu, login validation/show-password state, and registration validation at all widths. Exercise sidebar open/close and long Thai/English labels. Do not submit mutating forms.

- [ ] **Step 2: Add and verify focused red regressions**

For each confirmed issue, assert the exact owner remains bounded. Required invariants: promotion sidebar/topbar/content do not double-offset; menus remain in viewport; sticky builder footer does not cover the last focusable field; customer mobile backdrop and sidebar do not cover main content after closing; profile menu remains visible; form error text wraps without covering fields; password controls remain reachable with long localized labels.

Run identical focused commands before edits and require nonzero defect-specific output.

- [ ] **Step 3: Apply route-family responsive repairs**

Use one authoritative sidebar width per shell, `min-width: 0` on content columns, bounded scroll for wide tables/calendars, viewport-constrained menus/dialogs, responsive action wrapping, and mobile safe-area padding for sticky footers. Preserve promotion eligibility, catalogue attachment, Customer pricing, saved/download state, authentication, and permissions.

- [ ] **Step 4: Verify focused green cycles**

Rerun each identical red command. Expected: exit 0 with no source-behaviour assertion changes.

- [ ] **Step 5: Run the family integration gate**

Run: `npm test -- src/app/promotions src/app/customer src/app/login`, `npm run test:ui-overlap -- --grep "promotion|customer|login|register"`, and `npm run lint -- src/app/promotions src/app/customer src/app/login src/app/register`.

Expected: all configured cases pass at three widths and role/public differences remain intact.

- [ ] **Step 6: Rerun every earlier browser gate affected by shared files**

If globals or shared components changed, mark previous browser evidence stale and rerun tracer, dashboard/admin, Studio, and catalogue subsets before recording this task gate.

---

### Task 8: Consolidate verified CSS duplication and run the full platform gate

**Files:**
- Modify only CSS modules already changed in Tasks 4–7
- Modify: `docs/stabilization/ui-overlap-route-matrix-2026-09-11.md`
- Create: `docs/stabilization/ui-overlap-final-report-2026-09-11.md`

**Interfaces:**
- Consumes: final route manifest, browser findings, exception manifest, all focused test results, and changed CSS selectors
- Produces: final route/role/viewport results, defect-to-file mapping, exception list, cleanup record, command evidence, and explicit not-configured cases

- [ ] **Step 1: Remove only proven duplicate declarations in touched selectors**

Within each changed CSS module, consolidate repeated declarations only when cascade analysis shows identical selector, property, breakpoint, specificity, and observable result. Keep later overrides that intentionally differ by breakpoint or source order. Do not remove an unused-looking class without a passing build plus a direct repository search proving no static or computed reference.

- [ ] **Step 2: Run focused tests after consolidation**

Run the affected family tests from Tasks 4–7. Expected: exit 0. Any failure restores the last behaviour-preserving declaration and records the attempted optimization as rejected.

- [ ] **Step 3: Run all frontend unit/integration tests**

Run: `npm test` from `frontend`.

Expected: exit 0 with every Vitest suite passing.

- [ ] **Step 4: Run lint and production build**

Run: `npm run lint` and then `npm run build` from `frontend`.

Expected: both exit 0. The build recreates a current `frontend/.next`; this is required runtime output, not stale waste.

- [ ] **Step 5: Run the complete browser audit**

Run: `npm run test:ui-overlap` with all role credentials and dynamic identifiers configured.

Expected: exit 0; every manifest case records pass results at 1440, 1024, and 390 px. Any `not configured`, failed, unexplained collision, or stale case blocks completion.

- [ ] **Step 6: Complete the tracked report and durable gate**

Record every route/role/viewport result, confirmed defect, changed file, intentional exception, cleanup target, and exact verification command. Append executable output verbatim to the durable state. Mark criteria `claimed` only after current-source checks pass; independent verification is still required before any criterion becomes `verified`.

## Unresolved product decisions

None. Required credentials and stable fixture identifiers are execution configuration, not product decisions; missing values visibly block the affected audit cases as approved.
