# Direct Existing Product Card Editing Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Sales Admins and Super Admins edit the existing catalogue product card, save once to update every catalogue immediately, and use that exact card as the approved default **Current Catalogue Card** template.

**Architecture:** Keep `CatalogueProductCard` as the single live renderer. Add a governed system-template definition for its presentation contract, expose enough synchronized product data for the management preview, and replace the two-step draft/publish UI with one optimistic, transactional save-and-activate API call that creates an immutable version and audit event. Published and public catalogue responses continue reading `GlobalProductCard.published_json`, so successful saves propagate on the next catalogue request without rewriting catalogue snapshots.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy, PostgreSQL/SQLite tests, Next.js 16, React 19, TypeScript, Vitest, Testing Library, pytest.

## Global Constraints

- Sales Admins (`sales_manager`) and Super Admins may edit and activate global product cards; other Sales users may not access or mutate them.
- Product code, barcode, present stock, warehouse-derived availability, and synchronized/customer-linked prices remain ERP-owned and cannot be submitted in presentation payloads.
- The editor must render the shared `CatalogueProductCard`, including its image navigation and whole-card download behavior, rather than a separately maintained approximation.
- The only user-facing mutation is **Save and update catalogues**. There is no draft or separate publish action in the direct editor.
- A successful save atomically activates the presentation, increments the revision and active version, creates one immutable version row, and writes one audit event containing the affected-catalogue count.
- A revision conflict returns HTTP `409`; any failed request leaves the previously active presentation unchanged and preserves the browser's unsaved form state.
- **Current Catalogue Card** is an active, approved, governed company template and the default for products with no explicit global-card template.
- The template represents the current live layout: rounded green outline, white title capsule and download control, image carousel, model/warranty metadata, barcode-stock-price table, and green retail-price capsule.
- Future changes to the governed template definition do not rewrite already saved product presentations. A user must select and save the updated template.
- Existing catalogue-specific customer pricing and live stock resolution remain unchanged.
- Do not restart or redeploy the currently running service as part of this implementation.
- This workspace has no Git metadata, so per-task Git commits are unavailable; retain a passing verification checkpoint after every task instead.

---

### Task 1: Seed the exact current catalogue card as the governed default template

**Files:**
- Modify: `backend/app/product_card_template_service.py`
- Create: `backend/tests/test_product_card_template_service.py`

**Interfaces:**
- Consumes: `GOVERNED_SYSTEM_TEMPLATE_DEFINITIONS`, `_style(...)`, and `ensure_system_templates(db)`.
- Produces: a governed definition with `key="current-catalogue-card"`, `name="Current Catalogue Card"`, `template_type="erp_detail"`, active/approved company-template persistence, and a stable presentation contract discoverable through `template_data_json.governance.systemTemplateKey`.

- [ ] **Step 1: Add the focused failing tests**

  Add tests that locate the new definition and assert its exact public contract:

  - name is `Current Catalogue Card`;
  - type/layout is `erp_detail`;
  - included fields contain `image`, `name`, `model`, `warranty`, `barcode`, `stock`, and `price`;
  - price mode is `one_price`;
  - style contains the current green surface, border, accent, strong, and text colours plus the rounded outline/title/price-capsule settings used by the live component;
  - governance key is `current-catalogue-card`, status is seeded as approved/active/company-owned, and required ERP fields cannot be removed;
  - calling `ensure_system_templates` twice is idempotent and does not overwrite a user-created/personal template.

- [ ] **Step 2: Verify the relevant failure**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_product_card_template_service.py -q`

  Expected: the tests fail because no `Current Catalogue Card` governed definition exists.

- [ ] **Step 3: Implement the minimum behavior**

  Prepend the definition so it is the first approved system card returned by the existing name-sorted/list behavior. Store renderer-relevant values in the existing schema-v4 `style`, `includedFields`, `bindings`, and `governance` objects; add no new database table or migration. Bump only this built-in template's `systemTemplateVersion` if the seeding code needs to update an older copy. Preserve the service rule that governed templates are selectable by Sales Admins but cannot be deleted or edited directly by them.

- [ ] **Step 4: Verify the focused pass**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_product_card_template_service.py -q`

  Expected: all new template-definition and idempotency tests pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_global_product_cards.py backend\tests\test_sales_catalogue_role_matrix.py -q`

  Expected: the presentation allowlist and Sales role matrix remain passing.

- [ ] **Step 6: Record the checkpoint**

  Record the focused and integration command results in the implementation handoff; no commit command is possible because this workspace is not a Git repository.

### Task 2: Add one atomic save-and-activate API and exact preview data

**Files:**
- Modify: `backend/app/product_card_schemas.py`
- Modify: `backend/app/product_cards.py`
- Create: `backend/tests/test_global_product_card_api.py`
- Modify: `backend/tests/test_global_product_cards.py`

**Interfaces:**
- Consumes: `GlobalProductCard`, `GlobalProductCardVersion`, `_template`, `_catalogues`, `_audit`, the presentation allowlist, and `product_cards.edit` authorization.
- Produces: `PUT /api/v1/product-cards/{product_id}` with request `{ template_id: UUID, revision: int, presentation: ProductCardPresentation, change_note?: string }` and response `ProductCardDetail`; `ProductCardDetail.erp_fields` additionally exposes read-only `currency` and `erp_details` for the shared preview.

- [ ] **Step 1: Add the focused failing tests**

  Cover the endpoint through an isolated temporary test database and authenticated dependency overrides:

  - revision `0` creates a card whose `draft_json` and `published_json` both equal the submitted presentation, `draft_revision` and `active_version` both become `1`, and exactly one version row exists;
  - a second valid save creates exactly one additional immutable version and increments both counters once;
  - a stale revision returns `409` with `This card changed elsewhere. Reload the latest version before saving.` and changes no card/version/audit rows;
  - an invalid or inactive template returns `422` and changes no active presentation;
  - forbidden ERP keys still fail schema validation with `422`;
  - the audit action is `product_card_updated_globally` and records actor, product identifier, new version, and affected-catalogue count;
  - a product in zero catalogues still activates successfully and returns an empty `affected_catalogues` list;
  - Sales Admin and Super Admin are accepted, while a Sales user without `product_cards.edit` receives `403`;
  - restore continues to create and activate a new immutable version.

- [ ] **Step 2: Verify the relevant failure**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_global_product_card_api.py backend\tests\test_global_product_cards.py -q`

  Expected: endpoint tests fail because `PUT /product-cards/{product_id}` and the expanded ERP preview fields do not exist.

- [ ] **Step 3: Implement the minimum behavior**

  Add `ProductCardSavePayload`, reusing the existing presentation validator instead of duplicating its allowlist. In one transaction, lock the product's global-card row, compare `payload.revision`, validate the approved company template, calculate affected catalogues, increment revision/version, copy the submitted presentation into both draft and published JSON, set actor/timestamps, insert one `GlobalProductCardVersion`, and add one audit row before one commit. Return `_detail(...)` only after the commit succeeds. Keep the existing draft/publish endpoints temporarily for backward API compatibility, but do not call them from the new UI. Add `erp_details`, `currency`, model, and warranty source values to the read-only detail response without accepting them in mutation payloads.

- [ ] **Step 4: Verify the focused pass**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_global_product_card_api.py backend\tests\test_global_product_cards.py -q`

  Expected: all activation, conflict, authorization, atomicity, audit, and ERP-lock tests pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_sales_catalogue_role_matrix.py backend\tests\test_erp_current_stock_query.py backend\tests\test_erp_product_card_theme.py -q`

  Expected: role permissions, present-stock sourcing, and catalogue card-theme behavior remain passing.

- [ ] **Step 6: Record the checkpoint**

  Record the focused and integration command results in the implementation handoff; no commit command is possible because this workspace is not a Git repository.

### Task 3: Make the shared catalogue card usable as the editor and template preview

**Files:**
- Modify: `frontend/src/components/catalogue-product-card.tsx`
- Modify: `frontend/src/components/catalogue-product-card.module.css`
- Modify: `frontend/src/components/catalogue-product-card.test.tsx`
- Create: `frontend/src/lib/product-card-preview.ts`
- Create: `frontend/src/lib/product-card-preview.test.ts`
- Modify: `frontend/src/app/catalogue-studio/product-card-template-gallery.tsx`
- Modify: `frontend/src/app/catalogue-studio/product-card-template-gallery.test.tsx`

**Interfaces:**
- Consumes: `GlobalProductCardDetail`, `ProductCardPresentation`, `StudioProductCardTemplate`, and `CatalogueProductCard` props.
- Produces: `globalCardPreviewProduct(detail, presentation): CataloguePreviewProduct`, `presentationFromTemplate(template, current): ProductCardPresentation`, and a gallery preview path that renders `CatalogueProductCard` for governance key `current-catalogue-card`.

- [ ] **Step 1: Add the focused failing tests**

  Add tests asserting:

  - the adapter maps display names/descriptions/images from the local presentation while mapping code, barcode, present stock, price, currency, model, and warranty only from `erp_fields`;
  - selecting the current template initializes the existing green appearance, `erp_detail` layout, and model/warranty/barcode/stock/price visibility without inserting ERP values into the presentation;
  - `CatalogueProductCard` renders the exact title capsule, download control, image carousel, metadata, three-column table, and retail-price capsule for that contract;
  - the template gallery's `Current Catalogue Card` preview renders the shared catalogue-card structure instead of the generic `ProductCardTemplateSample` mockup;
  - generic/personal templates retain their current lightweight preview path.

- [ ] **Step 2: Verify the relevant failure**

  Run: `npm.cmd test -- --run src/lib/product-card-preview.test.ts src/components/catalogue-product-card.test.tsx src/app/catalogue-studio/product-card-template-gallery.test.tsx`

  Working directory: `frontend`

  Expected: tests fail because the preview adapter and governed shared-card preview path do not exist.

- [ ] **Step 3: Implement the minimum behavior**

  Move presentation-to-preview conversion into the pure adapter. If small renderer flags are needed for the title/download/image/table/price structure, derive them from the existing `erp_detail` contract rather than creating a second card component. Make download optional only for static library samples; it remains enabled in the editor and catalogues. Use a deterministic sample `CataloguePreviewProduct` in the template gallery so no ERP/network request is introduced. Preserve current image fallback, navigation, download capture, language selection, price formatting, and responsive CSS.

- [ ] **Step 4: Verify the focused pass**

  Run: `npm.cmd test -- --run src/lib/product-card-preview.test.ts src/components/catalogue-product-card.test.tsx src/app/catalogue-studio/product-card-template-gallery.test.tsx`

  Working directory: `frontend`

  Expected: adapter, shared renderer, and template-library fidelity tests pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `npm.cmd test -- --run src/app/catalogue-studio/product-card-layout.test.ts src/app/catalogue-studio/product-card-designer.test.tsx`

  Working directory: `frontend`

  Expected: existing template application and designer governance tests remain passing.

- [ ] **Step 6: Record the checkpoint**

  Record the focused and integration command results in the implementation handoff; no commit command is possible because this workspace is not a Git repository.

### Task 4: Replace draft/publish editing with one immediate global save

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/app/product-cards/[productId]/edit/product-card-editor.tsx`
- Modify: `frontend/src/app/product-cards/[productId]/edit/product-card-editor.test.tsx`
- Modify: `frontend/src/app/product-cards/product-cards.module.css`

**Interfaces:**
- Consumes: `PUT /v1/product-cards/{productId}`, `globalCardPreviewProduct`, `presentationFromTemplate`, `CatalogueProductCard`, and approved Studio templates.
- Produces: `saveAndActivateGlobalProductCard(productId, payload): Promise<GlobalProductCardDetail>` and the single-action direct editor.

- [ ] **Step 1: Add the focused failing tests**

  Update the editor tests to assert:

  - the page renders the actual shared card (mock only the component boundary to assert its `product`, `cardStyle="erp_detail"`, and presentation-derived appearance props);
  - a product with no explicit template selects the approved template whose governance key is `current-catalogue-card`;
  - only **Save and update catalogues** is present; **Save draft** and **Publish globally** are absent;
  - clicking save performs one API call with the current revision, selected template ID, local presentation, and no ERP-owned fields;
  - the saving label is `Updating catalogues…` and the action is disabled while pending;
  - success reads `Product card updated in 1 catalogue.` or the correctly pluralized count, and zero reports activation for future catalogues;
  - `409` shows the reload warning while the edited input retains its unsaved value;
  - any other failure says catalogues were not changed, retains the edited form, and permits retry;
  - restore still immediately activates a previous version as a new version;
  - the layout stacks controls, preview, and top actions without horizontal overflow at the existing mobile breakpoint.

- [ ] **Step 2: Verify the relevant failure**

  Run: `npm.cmd test -- --run "src/app/product-cards/[productId]/edit/product-card-editor.test.tsx"`

  Working directory: `frontend`

  Expected: tests fail because the editor still shows its approximation and separate draft/publish controls.

- [ ] **Step 3: Implement the minimum behavior**

  Replace `saveGlobalProductCardDraft` plus `publishGlobalProductCard` with `saveAndActivateGlobalProductCard`. Initialize the default template from `systemTemplateKey`, applying it only to the local form until save. Render the adapter output through `CatalogueProductCard`; delete the obsolete preview-card JSX and CSS once no references remain. Do not reset form state in a catch path. Special-case API status `409` for the conflict copy; for all other errors state that catalogues were not changed. Refresh version history only after a successful save or restore.

- [ ] **Step 4: Verify the focused pass**

  Run: `npm.cmd test -- --run "src/app/product-cards/[productId]/edit/product-card-editor.test.tsx"`

  Working directory: `frontend`

  Expected: all single-save, shared-preview, default-template, error-state, and ERP-lock tests pass.

- [ ] **Step 5: Run the affected integration check**

  Run: `npm.cmd test -- --run src/app/product-cards/product-card-manager.test.tsx src/components/catalogue-product-card.test.tsx src/app/catalogue-studio/product-card-template-gallery.test.tsx`

  Working directory: `frontend`

  Expected: product selection, live renderer, and template library remain passing.

- [ ] **Step 6: Record the checkpoint**

  Record the focused and integration command results in the implementation handoff; no commit command is possible because this workspace is not a Git repository.

### Task 5: Verify propagation, responsive behavior, and repository health

**Files:**
- Modify only if a failing check exposes a defect in the files listed in Tasks 1–4.
- Test: `backend/tests/test_global_product_card_api.py`
- Test: `frontend/src/app/product-cards/[productId]/edit/product-card-editor.test.tsx`
- Test: existing catalogue preview/public viewer suites discovered by `npm.cmd test`.

**Interfaces:**
- Consumes: the atomic save API, `GlobalProductCard.published_json`, catalogue preview assembly, public catalogue viewer, and shared card renderer.
- Produces: evidence that the saved card reaches every affected catalogue on its next request and that all repository checks remain healthy.

- [ ] **Step 1: Add the focused propagation test**

  In the API integration test, create two catalogues containing the same product, save a new global presentation once, request both catalogue previews, and assert that both responses expose the same new `card_presentation`, presentation name/images, live ERP stock, and their own customer-linked price. Assert that no catalogue snapshot row is rewritten by the save itself.

- [ ] **Step 2: Verify the relevant failure before final wiring is complete**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests\test_global_product_card_api.py -q`

  Expected before the Tasks 1–4 implementation is complete: the propagation case cannot call the new atomic endpoint. Expected after wiring: it passes for both catalogue responses.

- [ ] **Step 3: Repair only verified integration defects**

  If propagation fails, change the existing catalogue response assembly only where evidence shows it does not read the active `published_json`; do not copy presentations into catalogue snapshots and do not alter live stock or customer-price resolution. If mobile tests show overflow, constrain the editor preview container and card width at the existing responsive breakpoint without changing the public desktop card.

- [ ] **Step 4: Run all backend tests**

  Run: `backend\.venv\Scripts\python.exe -m pytest backend\tests -q`

  Expected: all collected backend tests pass; environment-dependent skips remain explicitly reported as skips.

- [ ] **Step 5: Run all frontend tests and static checks**

  Run from `frontend`, in order:

  - `npm.cmd test`
  - `npm.cmd run lint`
  - `npm.cmd run build`

  Expected: the complete Vitest suite, ESLint, TypeScript/Next compilation, and production build pass with no new warnings or failures.

- [ ] **Step 6: Record the final checkpoint**

  Report exact pass/fail/skip counts, any pre-existing flaky test that required an isolated rerun, and that runtime restart/deployment was intentionally not performed. No commit command is possible because this workspace is not a Git repository.

## Unresolved Product Decisions

None. The approved specification fixes the save behavior, permissions, default template, card structure, propagation scope, locked ERP data, and failure semantics.
