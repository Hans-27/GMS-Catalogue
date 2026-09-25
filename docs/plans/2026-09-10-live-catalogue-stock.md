# Live Catalogue Stock Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make current ERP stock available in every catalogue experience for every account while preserving catalogue access and authored layout rules.

**Architecture:** Keep the existing 180-second ERP-to-Product synchronization as the single inventory source. Rebind stock from Product whenever Studio designs or render snapshots are read, regardless of their price/content data mode, and refresh the authenticated classic preview every 180 seconds without clearing its last valid render.

**Tech Stack:** Python, FastAPI, SQLAlchemy, pytest, TypeScript, React, Next.js, Vitest, Testing Library

## Global Constraints

- All account types receive current stock only within catalogues they are already authorized to access.
- Sales and Customer catalogue visibility remains restricted to permitted published catalogues.
- ERP synchronization remains 180 seconds and preserves the last valid data on failure.
- Stock is live even when catalogue prices/content use snapshot mode.
- Authored stock visibility is not overridden.

---

### Task 1: Rebind stock in every Studio catalogue mode

**Files:**
- Modify: `backend/app/design_studio.py`
- Test: `backend/tests/test_design_studio_live_table.py`

**Interfaces:**
- Consumes: `_design_response_with_live_stock(db, design)` and `_snapshot_with_current_live_stock(db, snapshot)`
- Produces: Studio API and render snapshots whose ERP-bound stock fields use current `Product.stock_quantity` for both `live` and `snapshot` data modes

- [ ] **Step 1: Add the focused failing test**

Add snapshot-mode tests that create a minimal design/snapshot linked to a Product with a newer stock value and assert that returned product-card/table fields contain the newer value.

- [ ] **Step 2: Verify the relevant failure**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_design_studio_live_table.py -q`
Expected: snapshot-mode assertions fail because the current mode guard returns saved stock unchanged.

- [ ] **Step 3: Implement the minimum behavior**

Remove the data-mode early return from the two stock hydration boundaries. Continue cloning snapshots before mutation, update only ERP-bound stock fields, and leave missing Product records unchanged.

- [ ] **Step 4: Verify the focused pass**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_design_studio_live_table.py -q`
Expected: all live-stock table and snapshot tests pass.

- [ ] **Step 5: Run the affected integration check**

Run: `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_design_studio_pdf_export.py backend/tests/smoke_catalogue_share_links.py -q`
Expected: Studio exports and public catalogue links preserve their existing behaviour while using current stock.

- [ ] **Step 6: Commit the passing deliverable**

No commit is created because this workspace is not a Git repository.

### Task 2: Refresh authenticated catalogue previews in the background

**Files:**
- Modify: `frontend/src/app/catalogues/[id]/preview/catalogue-preview.tsx`
- Test: `frontend/src/app/catalogues/[id]/preview/catalogue-preview.test.tsx`

**Interfaces:**
- Consumes: `previewCatalogue(catalogueId, version, undefined)`
- Produces: a preview that reloads current stock every 180,000 milliseconds and retains the last valid presentation during a failed background request

- [ ] **Step 1: Add the focused failing test**

Use fake timers to assert a second preview request at 180 seconds and that a rejected background request leaves the existing product stock visible without an error page.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test -- --run "src/app/catalogues/[id]/preview/catalogue-preview.test.tsx"` from `frontend`
Expected: the refresh-call assertion fails because the classic preview currently loads only once.

- [ ] **Step 3: Implement the minimum behavior**

Allow the existing loader to run in background mode without setting loading/error state, install a 180-second interval after the first presentation loads, and clear the interval on unmount.

- [ ] **Step 4: Verify the focused pass**

Run: `npm test -- --run "src/app/catalogues/[id]/preview/catalogue-preview.test.tsx"` from `frontend`
Expected: initial-load, timed-refresh, and last-valid-data tests pass.

- [ ] **Step 5: Run the affected integration check**

Run: `npm test -- --run "src/app/c/[token]/public-catalogue-viewer.test.tsx" "src/app/catalogue-studio/studio-preview.test.tsx" "src/app/catalogue-studio/studio-editor.test.tsx"` from `frontend`
Expected: existing public, Studio preview, and Studio editor catalogue refresh behaviour remains green.

- [ ] **Step 6: Commit the passing deliverable**

No commit is created because this workspace is not a Git repository.

### Task 3: Make the create-catalogue wording match the stock contract

**Files:**
- Modify: `frontend/src/app/catalogue-studio/new/page.tsx`
- Test: `frontend/src/app/catalogue-studio/new/page.test.tsx`

**Interfaces:**
- Consumes: existing `keepSynchronized` selection and `data_mode` payload
- Produces: UI copy explaining that the toggle controls synchronized ERP prices/content while stock always remains live

- [ ] **Step 1: Add the focused failing test**

Assert that the setup screen states stock is always live and that turning synchronization off is described as keeping fixed prices/content, not fixed stock.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test -- --run "src/app/catalogue-studio/new/page.test.tsx"` from `frontend`
Expected: copy assertion fails because the current screen says turning off synchronization freezes both prices and stock.

- [ ] **Step 3: Implement the minimum behavior**

Rename the toggle label to `Keep ERP prices synchronized`, state `Stock always stays live`, and update the review summary to distinguish live stock from the selected price/content mode. Preserve the existing API payload because backend stock hydration is now independent of `data_mode`.

- [ ] **Step 4: Verify the focused pass**

Run: `npm test -- --run "src/app/catalogue-studio/new/page.test.tsx"` from `frontend`
Expected: setup behavior and revised stock contract copy pass.

- [ ] **Step 5: Run the affected integration check**

Run: `npm run lint` from `frontend`
Expected: lint completes without new errors.

- [ ] **Step 6: Commit the passing deliverable**

No commit is created because this workspace is not a Git repository.

## Unresolved product decisions

None. The user approved all-account catalogue stock with the existing 180-second synchronization interval.

