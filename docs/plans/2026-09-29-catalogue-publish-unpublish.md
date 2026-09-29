# Catalogue Publish and Unpublish Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct, permission-controlled catalogue publish and unpublish actions that suspend public access without destroying immutable versions or customer link URLs.

**Architecture:** Store public delivery as `Catalogue.public_access_enabled`, independent from the editorial `status`. Publishing creates the next immutable version and enables delivery; unpublishing returns the catalogue to Draft and disables delivery while leaving versions and share-link rows unchanged. Dashboard card actions call the lifecycle endpoints and refresh catalogue/link state.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, PostgreSQL/SQLite tests, Next.js/React, TypeScript, Vitest, Playwright.

## Global Constraints

- Unpublishing must immediately stop every public customer link.
- Unpublishing must preserve immutable version history and existing link URLs.
- Republishing must reactivate active, unexpired links; explicitly revoked or expired links stay unavailable.
- Draft edits to a previously published catalogue must not suspend its last published version.
- Super Administrator and Sales Admin access is driven by `catalogues.publish`, not role-name checks.
- Both lifecycle actions must be audited.

---

### Task 1: Persist and expose public catalogue availability

**Files:**
- Create: `backend/alembic/versions/0034_catalogue_public_access.py`
- Modify: `backend/app/commerce_models.py`
- Modify: `backend/app/commerce_schemas.py`
- Modify: `backend/app/commerce.py`
- Test: `backend/tests/test_alembic_clean_bootstrap.py`

**Interfaces:**
- Consumes: existing `Catalogue.status`, `Catalogue.version`, and Alembic revision `0033_master_status_reasons`.
- Produces: `Catalogue.public_access_enabled: bool` and `CatalogueResponse.public_access_enabled: bool`.

- [ ] Add a migration test proving a clean upgrade creates the non-null column and backfills existing versioned draft/published catalogues as enabled.
- [ ] Run the migration test and observe the missing-column failure.
- [ ] Add the model/schema field and migration with `false` as the default plus data backfill for eligible existing catalogues.
- [ ] Return the field from `_catalogue_response`.
- [ ] Run the focused migration test and the commerce schema tests.

### Task 2: Implement standard and Studio lifecycle semantics

**Files:**
- Modify: `backend/app/commerce.py`
- Modify: `backend/app/catalogue_share_links.py`
- Modify: `backend/app/design_studio.py`
- Test: `backend/tests/smoke_catalogue_share_links.py`
- Test: `backend/tests/smoke_design_studio.py`

**Interfaces:**
- Consumes: `POST /api/v1/catalogues/{catalogue_id}/publish`, active share-link tokens, and `catalogues.publish`.
- Produces: `POST /api/v1/catalogues/{catalogue_id}/unpublish -> CatalogueResponse`; public links return HTTP 410 with `This catalogue is currently unpublished.` while disabled.

- [ ] Add a failing smoke test that publishes, opens a token, unpublishes, observes Draft plus HTTP 410, verifies unchanged token/version rows and `catalogue_unpublished`, republishes, and opens the same token again.
- [ ] Add a failing Studio lifecycle assertion that publish enables and unpublish disables public delivery without revoking share-link rows.
- [ ] Implement standard unpublish with 409 for never-published or already-unpublished catalogues, preserve `published_at`/versions/link status, increment revision, and audit the action.
- [ ] Make both standard and Studio publishing enable delivery; make Studio unpublish use the same suspension semantics.
- [ ] Gate public link resolution and new link creation on `public_access_enabled`.
- [ ] Run both focused smoke suites.

### Task 3: Add dashboard card actions and API client support

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/features/catalogues/catalogue-management.tsx`
- Modify: `frontend/src/lib/management-translations.ts`
- Test: `frontend/src/features/catalogues/catalogue-management.test.tsx`

**Interfaces:**
- Consumes: `ManagedCatalogue.public_access_enabled`, `publishCatalogue(id)`, `unpublishCatalogue(id)`, `catalogues.publish`.
- Produces: permission-controlled menu actions `Publish`, `Publish changes`, and `Unpublish catalogue`.

- [ ] Add failing component tests for never-published Publish, live Draft Publish changes plus Unpublish, published Unpublish, permission hiding, confirmation cancellation, successful state refresh, and API failure messaging.
- [ ] Add `unpublishCatalogue(id)` and the response field to the API types.
- [ ] Implement card-level lifecycle state and actions: no live version shows Publish; live version with draft changes shows Publish changes and Unpublish; current published live version shows Unpublish; disabled public access with retained history shows Publish.
- [ ] Confirm unpublish with text stating every customer link stops immediately and history is retained; close the menu during the request and prevent duplicate actions.
- [ ] Refresh catalogue cards and card links after success and show translated success/error feedback.
- [ ] Run the focused component suite.

### Task 4: Verify integration and rendered controls

**Files:**
- Modify: `frontend/e2e/overlap/catalogue-links-dropdown-render.spec.ts` only if its fixture needs the new response field.
- Test: backend lifecycle smoke suites and frontend production build.

**Interfaces:**
- Consumes: completed backend lifecycle contract and dashboard controls.
- Produces: release evidence for API behavior, role visibility, responsive menu rendering, lint, and build.

- [ ] Run targeted backend tests and confirm zero failures.
- [ ] Run the catalogue-management Vitest suite and the relevant Playwright render spec.
- [ ] Run ESLint on touched frontend files and `npm.cmd run build`.
- [ ] Inspect the final diff for preservation of unrelated user changes.

## Unresolved externally observable decisions

None. The approved design fixes immediate suspension, retained URLs/history, same-link reactivation, permission handling, confirmation, and audit behavior.
