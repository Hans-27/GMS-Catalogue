# Online Catalogue Cover Implementation Plan

> **For agentic workers:** Execute inline task by task. Track steps with checkboxes. Do not commit without user approval.

**Goal:** Upload a finished online cover from Studio and publish it without changing printable pages.

**Architecture:** Dedicated `online_cover` DesignAssets supply draft metadata on CatalogueDesign. Publication copies the reference into the immutable commerce version. Public token-protected media delivery exposes that version's asset, never the draft.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, Pillow, Next.js/React, Vitest, pytest, Playwright.

## Global Constraints

- PNG/JPG/JPEG/WebP only; maximum 20 MB; preserve image aspect ratio.
- Upload/replace/remove require catalogue edit permission; publication requires existing publish permission.
- Save updates draft only. Publish applies upload or removal. Existing online catalogue remains available while editing.
- No cover means generated green fallback. PDF/print pages remain unchanged.
- Failed validation/save preserves the last valid cover.

### Task 1: Draft cover API and version references

**Files:** `backend/app/design_studio_models.py`, `backend/app/design_studio_schemas.py`, `backend/app/design_studio.py`, proposed `backend/alembic/versions/0031_online_catalogue_cover.py`, proposed `backend/tests/test_online_catalogue_cover.py`.

**Interfaces:** POST/DELETE `/v1/catalogue-studio/designs/{id}/online-cover` with expected_revision; authenticated GET `/online-cover/content`; design response `online_cover_json` and `published_online_cover_json` metadata (`asset_id`, `file_name`, `width`, `height`, `url`).

- [x] Add API tests for upload, replace, remove, revision conflict, unsupported/oversized files, permission denial and unchanged published reference.
- [x] Run `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_online_catalogue_cover.py -q` and observe missing endpoint failure.
- [x] Add nullable JSON draft/published columns, strict upload endpoint using existing storage, and asset metadata. Publishing records metadata in commerce version snapshot `online_cover`; exports ignore this independent metadata.
- [x] Re-run identical test and affected Studio/PDF tests.

### Task 2: Published cover access

**Files:** `backend/app/catalogue_share_links.py`, `backend/app/commerce_schemas.py`, `backend/tests/test_online_catalogue_cover.py`.

**Interfaces:** Public catalogue `online_cover` metadata with a short-lived signed image URL; GET `/v1/public/catalogues/{token}/online-cover/content` resolves only the chosen immutable catalogue version.

- [x] Test published upload/removal, draft replacement isolation, fixed-version isolation, protected-link access, and unchanged PDF page snapshot.
- [x] Observe failures, implement minimal version-specific delivery and response, re-run identical tests.
- [x] Ensure public Studio response cannot leak draft cover metadata.

### Task 3: Studio upload panel

**Files:** `frontend/src/lib/studio-api.ts`, proposed `frontend/src/app/catalogue-studio/studio-online-cover.tsx` and `.module.css` and `.test.tsx`, `frontend/src/app/catalogue-studio/studio-editor.tsx`, `.test.tsx`.

**Interfaces:** `saveStudioOnlineCover(id,file,revision)` and `removeStudioOnlineCover(id,revision)` return StudioDesign; panel flushes canvas saves before cover mutation and updates latest revision afterwards.

- [x] Test Cover page sidebar, file selection/preview/save, validation, replace/remove, failed save retention, and Publish changes on an already-published design.
- [x] Observe red then implement panel using existing editor permissions and save/publish workflow.
- [x] Re-run focused panel/editor tests. Preserve other page editing and PDF controls.

### Task 4: Responsive public rendering and end-to-end checks

**Files:** `frontend/src/lib/api.ts`, proposed `frontend/src/components/catalogue-online-cover.tsx` and `.module.css`, `frontend/src/app/c/[token]/public-catalogue-viewer.tsx` and `.test.tsx`.

**Interfaces:** Shared contained cover image section with Explore products/count and generated-green fallback; standard/Studio viewers use published `online_cover`.

- [x] Test finished cover replaces online hero, safe image failure fallback, and Studio cover replacement without modifying product-page numbering or print output.
- [x] Observe red and implement responsive contained image plus print fallback.
- [x] Run affected/full Vitest, TypeScript, ESLint, backend regression tests and static browser checks at 375/768/1280px.
- [ ] Run live-browser upload/publish/replace/remove checks with an isolated test catalogue. Neither local service is running; approval to start services was requested but not yet received. API persistence/publication is independently verified with TestClient and isolated SQLite storage.
- [x] Apply the additive database migration for the local platform after verifying the exact database and schema; do not alter existing catalogue cover values.

## Unresolved Product Decisions

None. Engineering recommendations: retain referenced assets for immutable version history, and use signed media URLs for password-protected catalogues so the image tag does not need custom headers.
