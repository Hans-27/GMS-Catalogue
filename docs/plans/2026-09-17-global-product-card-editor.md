# Global Product Card Editor Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone global product-card editor for Sales Admins and Super Admins, accessible from the main Content sidebar, whose published presentation is used by every catalogue containing the product.

**Architecture:** Store ERP-independent card presentation drafts and immutable published versions in dedicated tables keyed by product. Expose permission-protected management APIs, merge the active presentation into every public catalogue response at request time, and provide focused Next.js list/editor pages that reuse the existing product-card preview and approved product-card templates without entering Catalogue Studio.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL, Pydantic, Next.js 16, React 19, TypeScript, CSS Modules, Vitest, Testing Library, pytest.

## Global Constraints

- Add **Product Cards** below **Product Media** in the main sidebar's **Content** group.
- Only Sales Admins (`sales_manager`) and Super Admins may edit and publish global product cards.
- The feature must not require users to enter Catalogue Studio.
- Card design and presentation content are global per product and apply to every current and future catalogue containing that product.
- ERP stock, warehouse quantities, barcode, product code, and synchronized prices remain read-only and resolve live through existing mechanisms.
- Draft edits do not affect public catalogues until **Publish globally** succeeds.
- Publishing and restoring create immutable history entries and audit-log events.
- Approved existing company product-card templates supply the default designs.
- Public catalogue cards remain responsive and continue supporting image navigation and card downloads.
- Do not commit repository changes unless the user explicitly authorizes a commit.

---

### Task 1: Global product-card persistence, permissions, and migration

**Files:**
- Create: `backend/app/product_card_models.py`
- Create: `backend/alembic/versions/0032_global_product_card_presentations.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/seed.py`
- Modify: `backend/tests/test_sales_catalogue_role_matrix.py`
- Test: `backend/tests/test_global_product_cards.py`

**Interfaces:**
- Consumes: existing `Product`, `ProductCardTemplate`, `User`, `AuditLog`, role permissions, and Alembic metadata conventions.
- Produces: `GlobalProductCard`, `GlobalProductCardVersion`, and permissions `product_cards.view`, `product_cards.edit`, and `product_cards.publish`.

- [ ] **Step 1: Add the focused failing tests**

  Assert that `sales_manager` receives all three product-card permissions, ordinary sales users do not, and the SQLAlchemy metadata contains global card and version tables with one card per product and unique version numbers per card.

- [ ] **Step 2: Verify the relevant failure**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_sales_catalogue_role_matrix.py backend/tests/test_global_product_cards.py -q`

  Expected: failures report missing product-card permissions/models.

- [ ] **Step 3: Implement the minimum behavior**

  Define `GlobalProductCard` with product ID, optional template ID, draft JSON, published JSON, draft revision, active version number, draft/published actor IDs, timestamps, and optimistic-update timestamp. Define `GlobalProductCardVersion` with immutable presentation JSON, template ID, version number, change note, actor, and publication timestamp. Register the model module in `main.py`, create migration `0032`, define the three permissions in `seed.py`, and grant them to `sales_manager`; Super Admin continues to bypass permission rows through `is_superadmin`.

- [ ] **Step 4: Verify the focused pass**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_sales_catalogue_role_matrix.py backend/tests/test_global_product_cards.py -q`

  Expected: permission and metadata assertions pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_alembic_clean_bootstrap.py -q`

  Expected: a clean PostgreSQL schema upgrades through revision `0032` without errors.

### Task 2: Permission-protected global product-card API

**Files:**
- Create: `backend/app/product_card_schemas.py`
- Create: `backend/app/product_cards.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_global_product_cards.py`

**Interfaces:**
- Consumes: `GlobalProductCard`, `GlobalProductCardVersion`, catalogue/product relationships, approved `ProductCardTemplate` records, `require_permission`, and `_require_product_access`.
- Produces:
  - `GET /api/v1/product-cards`
  - `GET /api/v1/product-cards/{product_id}`
  - `PUT /api/v1/product-cards/{product_id}/draft`
  - `POST /api/v1/product-cards/{product_id}/publish`
  - `GET /api/v1/product-cards/{product_id}/versions`
  - `POST /api/v1/product-cards/{product_id}/restore/{version_id}`

- [ ] **Step 1: Add the focused failing tests**

  Cover list/search, card detail with affected catalogues, creation/update of a draft, optimistic revision conflict (`409`), rejection of ERP-owned keys (`422`), global publish, immutable version creation, restore-as-new-version, audit records, missing product/template (`404`), unapproved template (`422`), and unauthorized role (`403`).

- [ ] **Step 2: Verify the relevant failure**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_global_product_cards.py -q`

  Expected: endpoint tests fail because the router and schemas do not exist.

- [ ] **Step 3: Implement the minimum behavior**

  Accept presentation keys only for display names/descriptions, badge text, ordered visible image URLs, template selection, approved colors/font/spacing/border fields, and optional-field visibility. Return current ERP fields separately as read-only preview data. Publish in one transaction: lock the card row, validate the submitted draft revision, increment version, append history, copy draft to published JSON, record actor/timestamp, and add an audit event. Restore copies a historical payload into a new published version without deleting history. List responses support `q`, `brand`, `category`, `template_id`, and pagination and calculate affected catalogue counts with an aggregate query.

- [ ] **Step 4: Verify the focused pass**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_global_product_cards.py -q`

  Expected: API, validation, authorization, transaction, and history tests pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/smoke_access_control.py backend/tests/smoke_catalogue.py -q`

  Expected: existing product/catalogue permissions and catalogue operations remain passing.

### Task 3: Merge the active global presentation into all catalogue responses

**Files:**
- Modify: `backend/app/commerce.py`
- Modify: `backend/app/commerce_schemas.py`
- Test: `backend/tests/test_global_product_cards.py`
- Test: `backend/tests/test_erp_product_card_theme.py`

**Interfaces:**
- Consumes: `GlobalProductCard.published_json`, `GlobalProductCardVersion`, current live `Product.stock_quantity`, catalogue-specific price resolution, and existing public `CataloguePreviewProduct` assembly.
- Produces: optional per-product `card_presentation` in authenticated preview and public share-link payloads.

- [ ] **Step 1: Add the focused failing tests**

  Publish one global presentation for a product used in two catalogues with different customer-linked prices. Assert both payloads receive the same presentation/content/image ordering while keeping their own resolved price and the current product stock/barcode/code. Assert draft-only changes are absent and a new catalogue automatically receives the active presentation.

- [ ] **Step 2: Verify the relevant failure**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_global_product_cards.py backend/tests/test_erp_product_card_theme.py -q`

  Expected: catalogue payload lacks `card_presentation` or still uses snapshot content.

- [ ] **Step 3: Implement the minimum behavior**

  Batch-load published global card records for products in the response. Explicitly overlay allowed display content and selected images, attach validated appearance/template metadata as `card_presentation`, and then overlay current ERP stock/barcode/code and catalogue-resolved price so presentation data cannot replace operational fields. Keep the current catalogue-level theme as fallback when no global presentation is published.

- [ ] **Step 4: Verify the focused pass**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_global_product_cards.py backend/tests/test_erp_product_card_theme.py -q`

  Expected: both catalogues share presentation while stock and prices remain live and scoped.

- [ ] **Step 5: Run the affected integration check**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/smoke_catalogue_share_links.py backend/tests/test_public_promotion_pages.py -q`

  Expected: public catalogue/share-link and promotion overlays remain passing.

### Task 4: Sidebar route and typed frontend client

**Files:**
- Modify: `frontend/src/lib/routes.ts`
- Modify: `frontend/src/app/dashboard/dashboard-sidebar.tsx`
- Modify: `frontend/src/app/dashboard/dashboard-sidebar.test.tsx`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/api-routing.test.ts`

**Interfaces:**
- Consumes: sidebar route groups, `AuthenticatedUser.permissions`, and `catalogueRequest<T>`.
- Produces: `APP_ROUTES.productCards = "/product-cards"`, a Content sidebar item gated by `product_cards.view`, a product-card icon, TypeScript DTOs, and API client functions matching Task 2.

- [ ] **Step 1: Add the focused failing tests**

  Assert Product Cards appears immediately below Product Media for a Sales Admin/Super Admin with `product_cards.view`, is absent without permission, links to `/product-cards`, closes the mobile drawer, and uses the shared API prefix for management requests.

- [ ] **Step 2: Verify the relevant failure**

  Run: `npm test -- --run src/app/dashboard/dashboard-sidebar.test.tsx src/lib/api-routing.test.ts`

  Working directory: `frontend`

  Expected: tests fail because the route, item, icon, DTOs, and client functions are absent.

- [ ] **Step 3: Implement the minimum behavior**

  Add the route and permission-gated sidebar entry, add a distinct card icon, and define list/detail/draft/version DTOs plus list/get/save/publish/restore client calls. Treat `409` as a revision conflict surfaced through the existing `ApiError` path.

- [ ] **Step 4: Verify the focused pass**

  Run: `npm test -- --run src/app/dashboard/dashboard-sidebar.test.tsx src/lib/api-routing.test.ts`

  Working directory: `frontend`

  Expected: sidebar visibility/order and API routing tests pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `npm run lint -- src/lib/routes.ts src/lib/api.ts src/app/dashboard/dashboard-sidebar.tsx`

  Working directory: `frontend`

  Expected: no lint errors in the modified navigation/client files.

### Task 5: Standalone product-card list and editor

**Files:**
- Create: `frontend/src/app/product-cards/page.tsx`
- Create: `frontend/src/app/product-cards/product-card-manager.tsx`
- Create: `frontend/src/app/product-cards/[productId]/edit/page.tsx`
- Create: `frontend/src/app/product-cards/product-card-editor.tsx`
- Create: `frontend/src/app/product-cards/product-cards.module.css`
- Create: `frontend/src/app/product-cards/product-card-manager.test.tsx`
- Create: `frontend/src/app/product-cards/product-card-editor.test.tsx`
- Modify: `frontend/src/components/catalogue-product-card.tsx`
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: Task 4 API client, approved company templates, current ERP preview fields, existing `CatalogueProductCard`, `LanguageProvider`, and permission-aware authenticated session.
- Produces: searchable `/product-cards`, focused `/product-cards/{productId}/edit`, draft saving, responsive preview, affected-catalogue impact confirmation, publish globally, and version restore.

- [ ] **Step 1: Add the focused failing tests**

  Manager tests cover initial loading, search, empty/error states, template/status filters, affected catalogue count, and Edit Card navigation. Editor tests cover loading current draft, selecting an approved design, editing allowed content/images/appearance, locked ERP controls, desktop/mobile preview, save without public change, publish confirmation listing affected catalogues, successful publish, revision conflict reload prompt, failed-save retention, and restore confirmation.

- [ ] **Step 2: Verify the relevant failure**

  Run: `npm test -- --run src/app/product-cards/product-card-manager.test.tsx src/app/product-cards/product-card-editor.test.tsx`

  Working directory: `frontend`

  Expected: tests fail because standalone pages/components do not exist.

- [ ] **Step 3: Implement the minimum behavior**

  Build an accessible manager with debounced search and filters. Build a two-column editor with Design, Content, Images, and Appearance sections; a sticky desktop/mobile live preview; a read-only ERP panel; explicit unsaved/saving/saved states; and a publication dialog showing affected catalogue names/count. Reuse `CatalogueProductCard` by allowing an optional per-product presentation/theme override rather than cloning its markup. Preserve draft state on API failure and disable publish when impact loading fails.

- [ ] **Step 4: Verify the focused pass**

  Run: `npm test -- --run src/app/product-cards/product-card-manager.test.tsx src/app/product-cards/product-card-editor.test.tsx src/components/catalogue-product-card.test.tsx`

  Working directory: `frontend`

  Expected: manager, editor, and shared-card regression tests pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `npm run lint -- src/app/product-cards src/components/catalogue-product-card.tsx`

  Working directory: `frontend`

  Expected: no lint errors in the new feature and shared card.

### Task 6: End-to-end integration and release verification

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx` only if the existing Products page needs an **Edit card** shortcut.
- Modify: `frontend/src/app/dashboard/dashboard.module.css` only for that shortcut.
- Create: `frontend/e2e/product-card-editor.spec.ts`
- Modify: `docs/specs/2026-09-17-global-product-card-editor-design.md` only if implementation evidence exposes a contradiction.

**Interfaces:**
- Consumes: completed backend API, public catalogue merge, sidebar route, manager/editor UI, and configured Playwright project.
- Produces: verified Sales Admin journey from navigation through global publication and public catalogue rendering.

- [ ] **Step 1: Add the focused failing end-to-end test**

  Authenticate as Sales Admin, open Content → Product Cards, search a known product, open its editor, choose an approved default design, edit the display name/accent, save the draft, verify a public catalogue is unchanged, publish globally after reviewing impact, and verify two catalogues show the new presentation while retaining distinct customer-linked prices and current stock.

- [ ] **Step 2: Verify the relevant failure**

  Run: `npx playwright test --config playwright.overlap.config.ts e2e/product-card-editor.spec.ts --project=chromium`

  Working directory: `frontend`

  Expected: the scenario fails at the first incomplete integration boundary.

- [ ] **Step 3: Complete integration behavior**

  Add the Products-page **Edit card** shortcut if the page's current action surface can accommodate it without crowding. Correct only integration defects exposed by the end-to-end test; do not add free-form Studio capabilities. Ensure mobile navigation and editor layout remain usable at the project's mobile viewport.

- [ ] **Step 4: Verify the focused pass**

  Run: `npx playwright test --config playwright.overlap.config.ts e2e/product-card-editor.spec.ts --project=chromium`

  Working directory: `frontend`

  Expected: one complete Sales Admin workflow passes with assertions on both public catalogues.

- [ ] **Step 5: Run release checks**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend/tests/test_global_product_cards.py backend/tests/test_sales_catalogue_role_matrix.py backend/tests/test_erp_product_card_theme.py backend/tests/test_alembic_clean_bootstrap.py -q`

  Expected: all focused backend tests pass.

  Run: `npm test -- --run src/app/dashboard/dashboard-sidebar.test.tsx src/app/product-cards/product-card-manager.test.tsx src/app/product-cards/product-card-editor.test.tsx src/components/catalogue-product-card.test.tsx`

  Working directory: `frontend`

  Expected: all focused frontend tests pass.

  Run: `npm run build`

  Working directory: `frontend`

  Expected: the production Next.js build completes successfully.

## Externally Observable Decisions

All externally observable product decisions are resolved by the approved design: editing is global per product; only Sales Admin and Super Admin can mutate cards; ERP operational fields are locked; drafts require explicit global publication; existing approved company templates are the default designs; and restore creates a new immutable version. No additional product decision is required before implementation.
