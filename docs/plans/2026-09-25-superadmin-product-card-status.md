# SuperAdmin Product Card Status Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure Active/Inactive controls to internal catalogue product cards so only canonical SuperAdmins can see and change inactive products while every other user and all public catalogue links continue to receive active products only.

**Architecture:** Enforce the boundary in the backend using the reserved system-role check, then make the authenticated internal preview explicitly request inactive products only for a canonical SuperAdmin. Extend the shared product card with opt-in management controls so public and non-SuperAdmin callers cannot accidentally expose the ribbon or toggle. Keep status mutations on the existing lifecycle endpoint and refresh the preview after successful changes.

**Tech Stack:** FastAPI, SQLAlchemy, Pydantic, Next.js 16, React 19, TypeScript, CSS Modules, pytest, Vitest, Testing Library.

## Global Constraints

- Preserve the current public share-token behavior: public catalogue links never include inactive products or management controls.
- Treat `is_superadmin` / the backend `SUPERADMIN` system role as the only authority; permission grants and display-role strings are insufficient.
- Preserve unrelated changes in the dirty worktree.
- Record a reason when a SuperAdmin disables a product, matching the existing lifecycle API contract.
- Keep card controls accessible by keyboard and expose state through an ARIA switch.

---

### Task 1: Lock down backend inactive-product access

**Files:**
- Modify: `backend/app/product_admin.py`
- Modify: `backend/app/catalogue.py`
- Modify: `backend/app/commerce.py`
- Modify: `backend/app/dashboard.py`
- Modify: `backend/app/search.py`
- Test: `backend/tests/test_product_status_superadmin.py`

- [x] Add failing tests proving a non-SuperAdmin with legacy inactive/status permissions still cannot mutate status, request inactive preview rows, or pass the SuperAdmin dependency.
- [x] Change the lifecycle mutation and status-history endpoints to require canonical SuperAdmin authentication.
- [x] Remove permission-based exceptions from inactive product list, detail, preview, dashboard, and search filtering.
- [x] Run the focused backend tests and confirm they pass.

### Task 2: Add opt-in status UI to the shared product card

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/catalogue-product-card.tsx`
- Modify: `frontend/src/components/catalogue-product-card.module.css`
- Modify: `frontend/src/components/catalogue-product-card.test.tsx`

- [x] Add failing component tests for the SuperAdmin switch, inactive ribbon, busy state, and absence of controls without explicit management access.
- [x] Add `product_status` to the preview product contract and introduce explicit management props on the card.
- [x] Render a top-right `INACTIVE` ribbon and accessible Active/Inactive switch only when management is enabled.
- [x] Add responsive and print-safe styles, then run the focused component tests.

### Task 3: Wire status management into authenticated internal preview

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/app/catalogues/[id]/preview/catalogue-preview.tsx`
- Modify: `frontend/src/app/catalogues/[id]/preview/catalogue-preview.test.tsx`

- [x] Add failing preview tests proving only canonical SuperAdmins request `include_inactive=true`, non-SuperAdmins defensively filter inactive rows, and a toggle invokes the lifecycle endpoint.
- [x] Load the current user before fetching the preview and request inactive products only for `isSuperAdmin(user)`.
- [x] Add SuperAdmin-only toggle handling, reason capture for disabling, pending feedback, API error handling, and local preview refresh.
- [x] Run the focused preview tests and confirm they pass.

### Task 4: Verify the complete security and UI path

**Files:**
- Verify only; update tests if a discovered regression requires a scoped correction.

- [x] Run focused backend authorization and lifecycle tests.
- [x] Run focused frontend card and preview tests.
- [x] Run TypeScript/lint checks for touched frontend files.
- [x] Confirm public viewer tests still show no inactive products or status controls.
- [x] Review the final diff for accidental permission widening or unrelated edits.
