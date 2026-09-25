# GMS Catalogue Platform — Stabilization Baseline

Phase: 0 (audit only — no application source code was modified during this pass)
Audit date: 2026-09-05
Prior baseline referenced: `docs/ARCHITECTURE_AUDIT.md`, `docs/BUG_AUDIT.md`, `docs/GMS_Functional_Inspection_Report_2026-09-04.md`, `docs/GMS_Catalogue_Platform_Test_Report_2026-09-03.md` (all dated 1–2 days before this pass; treated as a starting baseline and re-verified, not assumed).

## How this pass was executed

This session had no shell access on the actual Windows workstation (`C:\Project GMS\catalogue-main`) — only file listing, staging, and Computer Use in click-only mode for terminals/IDEs (cannot type commands into a real terminal there). Per the user's explicit choice, the frontend and backend **source code and configuration only** were copied into an isolated, disposable cloud sandbox (no `.env` secrets, no real database, no `uploads/`, `private_uploads/`, `backups/`, or log files were copied). In that sandbox:

- A fresh PostgreSQL 16 instance was created (disposable, empty, dropped with the sandbox).
- Backend Python dependencies were installed from `requirements.txt` + `requirements-test.txt` into a clean virtualenv (Python 3.11.15; production Dockerfile targets `python:3.12-slim`, dev machine pyc files show 3.14 — version drift noted below).
- Frontend dependencies were installed from `package-lock.json` via `npm ci` (Node 22.22.2).
- All commands below ran against this disposable copy, not the live Windows dev environment and not production data.

One file could not be staged due to a device-bridge path-depth limit (8 folders below the connected root; 7 is the maximum): `frontend/src/app/admin/access/roles/[id]/edit/page.tsx` (257 bytes on disk). It was excluded from this pass's build/test run. Everything else in `frontend/src`, `backend/app`, `backend/tests`, `backend/alembic`, `backend/sql`, and root-level compose/Dockerfiles was included.

**This means:** results below are real, reproducible command output — not assumptions — but they verify the *code*, not the live Windows services, the real ERP connection, the real 23k-product database, or any browser/visual/device behavior. Those remain open per the Release Checklist.

## Commands executed and results

| # | Command | Result | Notes |
|---|---|---|---|
| 1 | `python -m alembic upgrade head` (fresh PostgreSQL 16, empty DB) | **PASS** | 0001 → 0028 (`0028_product_barcodes`, head) applied cleanly with zero manual intervention. This is the first time this migration chain has been verified against real PostgreSQL rather than SQLite — closes a gap the Sept 4 audit explicitly flagged as blocked. |
| 2 | `python -m pytest tests/ -v` (backend unit/export tests) | **PASS** | 9 passed, 1 skipped (up from 7 passed/1 skipped on Sept 4 — new tests added since). The skip (`test_saved_preview_matches_browser_generated_pdf`) is an opt-in test that requires live frontend + backend services running; still unverified by any automated pass, on Sept 4 or today. |
| 3 | `python -m tests.smoke_*` (17 backend smoke scripts, run individually) | **16 PASS / 1 FAIL** | `smoke_product_videos` fails here — see BUG-011. All other smoke suites (access control, auth, catalogue, share links, dashboard, design studio, ERP brands/categories, feedback, organization, organization admin, platform operations, pricing/catalogues, product lifecycle sync, promotions, users) pass. |
| 4 | `npx vitest run` (frontend unit/component tests) | **PASS** | 37 files, 213 tests passed (up from 211 on Sept 3/4 — 2 new tests added, both passing). No regressions from the QA-002/003/004 defects recorded in the Sept 3 test report — those areas (studio preview carousel guard, SP1 price level, Product Master naming) now pass in the current code. |
| 5 | `npx tsc --noEmit` | **PASS** | Zero errors. |
| 6 | `npx eslint .` | **PASS WITH WARNINGS** | 0 errors, 6 warnings — identical in count and location to the Sept 4 baseline (`BUG-006`, the six intentional raw `<img>` elements). No new lint debt introduced. |
| 7 | `npm run build` (Next.js production build) | **PASS** | Compiled successfully; 42 of 43 routes generated (the 43rd, `/admin/access/roles/[id]/edit`, was not in this pass's source copy — see path-depth note above, not a build failure). Route count has grown from 33 (Sept 4) to 43 — substantial route/feature growth since the last documented baseline. |
| 8 | `npm audit` | **3 high severity** | All three (`brace-expansion`, `js-yaml`, `nanoid`) are transitive dev-tooling dependencies (ESLint toolchain), not runtime/production dependencies. Fixable via `npm audit fix`. Low real-world exposure but flagged for hygiene (BUG-014). |

## Toolchain / environment facts recorded during inspection

- **No `.git` directory exists anywhere under `C:\Project GMS\catalogue-main`.** This project is not under version control. See BUG-013 — this is a material risk given the stabilization rules require preserving unrelated changes, reproducing bugs, and avoiding destructive operations, none of which can be done safely or verifiably without version history.
- Frontend: Next.js 16.2.12, React 19.1.0, TypeScript 5.8.3, Vitest 4.1.10, ESLint 9.39.5. `npm test` = `vitest run` (no `npm run typecheck` script exists; `tsc --noEmit` must be invoked directly, consistent with the prior handoff note).
- Backend: FastAPI 0.116.1, SQLAlchemy 2.0.41, Alembic 1.16.4, Pydantic-settings 2.10.1, Playwright 1.55.0 (browser binaries not installed in this sandbox — opt-in browser test stayed skipped for that reason as well as the "needs live services" reason).
- Production Dockerfile (`backend/Dockerfile`) targets `python:3.12-slim` and installs only `postgresql-client` and `libcairo2` — **no `ffmpeg`/`ffprobe`**. The Windows dev `.venv`'s pyc files show CPython 3.14. Three different Python minor versions are now in play across dev (3.14), this audit's sandbox (3.11), and production (3.12) — none pinned explicitly in a lockfile or `.python-version`. Recommend pinning one version and testing against it.
- Real data volume (per Sept 4 inspection, not re-queried here since no production data was touched): 23,071 products, 151,759 product prices, 36,888 product images, 151 catalogues, 273 permissions, 10 users. Any change to product/catalogue/permission logic should be sanity-checked against this scale (e.g., N+1 query risk, migration lock duration) before release, not just against demo-seed data.
- ERP sync interval: confirmed `180` seconds is still the default in `backend/app/config.py` (`product_sync_interval_seconds`, bounded `ge=60, le=86400`) and is explicitly set in `docker-compose.production.yml`'s `product-sync-worker` service. Rule 15 is intact.

## What this pass could NOT verify (carried into Release Checklist as open)

- Live frontend/backend/worker startup on the real Windows machine (no working terminal access via Computer Use).
- The real ERP (MSSQL) connection and a live 180-second sync cycle.
- Browser-rendered PDF visual parity (`test_saved_preview_matches_browser_generated_pdf`) — still skip-only, on both the Sept 4 and this pass's runs.
- Any visual/manual/device/browser check (see prior `GMS_Functional_Inspection_Report_2026-09-04.md`, which already enumerates these as MANUAL — nothing in this pass changes that list).
- Real PostgreSQL backup/restore drill (this pass proved *migrations* work against Postgres, not backup/restore).
- Anything involving the real 23k-product dataset (deliberately not copied off the Windows machine).
