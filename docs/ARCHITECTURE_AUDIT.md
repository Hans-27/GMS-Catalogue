# GMS Catalogue Platform Architecture Audit

Audit date: 2026-09-04

## Executive summary

The platform is a functioning Next.js 16 / React 19 frontend with a FastAPI / SQLAlchemy backend. It has real catalogue, Studio, sharing, promotion, organization, synchronization, backup, and audit capabilities. The current SQLite development database is at Alembic head `0028_product_barcodes`; production configuration targets PostgreSQL.

The main risk is concentration rather than missing foundations. Several route modules contain transport, queries, business rules, and serialization in one file. The frontend has the same issue in the Dashboard and Studio editor. Refactoring must therefore be incremental and test-backed.

## Current frontend

- Routes use the Next.js App Router under `frontend/src/app`.
- Authentication starts at `/login`; the main authenticated shell is currently `/dashboard?view=...`.
- Administration also has dedicated thin routes under `/admin`.
- Studio routes are separated into editor, preview, PDF render, templates, media, and exports.
- Public token routes are `/c/[token]` for catalogues and `/p/[token]` for promotions.
- API transport is centralized in `src/lib/api.ts`, but this file is too large and spans every domain.
- Route/menu configuration and access checks are centralized in `src/lib/routes.ts` and `src/lib/access.ts`.
- Large feature workspaces are dynamically imported from the Dashboard.

Largest frontend files observed:

| File | Approximate size | Risk |
|---|---:|---|
| `catalogue-studio/studio-editor.tsx` | 322 KB | State, commands, API orchestration, and UI tightly coupled |
| `dashboard/page.tsx` | 170 KB | Product workspace and dashboard shell share one route |
| `dashboard/dashboard.module.css` | 156 KB | Multiple domains share one stylesheet |
| `catalogue-studio/studio.module.css` | 138 KB | Studio subfeatures are difficult to isolate |
| `dashboard/catalogue-management.tsx` | 113 KB | Card listing and full editor logic are coupled |
| `lib/api.ts` | 94 KB | Domain APIs and types share one module |

## Current backend

- `app/main.py` owns middleware, router registration, static uploads, lifespan startup, and workers.
- Authentication and effective access are centralized in `auth.py`, `access.py`, and `security.py`.
- SQLAlchemy sessions are centralized in `database.py`.
- Alembic is present with 28 ordered migrations.
- Product and PDF background workers run from the application lifespan.
- Domain service extraction has begun (`product_sync_service.py`, `promotion_service.py`, `organization_service.py`, `design_studio_service.py`) but routers still contain substantial business logic.

Largest backend files observed:

| File | Approximate size | Refactor boundary |
|---|---:|---|
| `commerce.py` | 152 KB | catalogue repository/service/export modules |
| `design_studio.py` | 140 KB | design, pages, templates, media, products, exports |
| `design_studio_export.py` | 70 KB | renderer, asset readiness, Chromium adapter |
| `catalogue.py` | 66 KB | product query, workflow, category and image services |
| `product_sync_service.py` | 51 KB | connectors, mapping, run orchestration, persistence |
| `models.py` | 45 KB | split models by domain after dependency mapping |

## Data and main flows

- Authentication: login -> password verification -> session/token issue -> `/auth/me` -> effective permission profile.
- Permissions: SuperAdmin bypass; otherwise role/position/team grants plus user overrides and record scopes. Backend dependencies enforce API actions.
- Catalogue: ERP/product mirror -> catalogue selection -> versioned publication -> secure audience share links.
- Studio: logical JSON page model -> autosave with revision checking -> validation -> published snapshot -> preview/PDF renderer.
- PDF: saved revision -> export job -> worker/browser renderer -> stored file -> authorized download.
- Sync: scheduler/manual trigger -> shared synchronization service -> transactionally preserve last valid data -> history/status endpoints.
- Uploads: authenticated validation -> storage abstraction -> database metadata -> guarded content endpoints.

## Confirmed strengths

- Default-deny permission model and protected SuperAdmin rules exist.
- Public catalogues use opaque share tokens rather than editable price parameters.
- No-price response exclusion is implemented server-side.
- Product sync and PDF export have dedicated workers.
- Dashboard has an aggregated overview endpoint.
- Heavy Dashboard workspaces are lazy loaded.

## Risks and debt

- Route/service/repository separation is incomplete in the largest modules.
- Frontend business components remain under route directories.
- Six raw `<img>` warnings remain in carousel/catalogue UI; conversion requires an authenticated image-loader design.
- Broad `except Exception` blocks need case-by-case normalization and structured logging.
- Automated backend coverage is currently small relative to API surface.
- Playwright and visual preview/PDF regression coverage were not found.
- Development uses SQLite, so PostgreSQL-specific integration behavior is not exercised by the local baseline.
- Some source strings show encoding corruption and require a controlled UTF-8 cleanup.

## Refactor rule

Do not move files merely to match a directory diagram. Extract one tested domain seam at a time, retain compatibility imports/routes, and avoid simultaneous schema and behavior changes.
