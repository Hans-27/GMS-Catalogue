# Incremental Refactor Plan

## Guardrails

- Preserve routes and response contracts until compatibility tests exist.
- No production-data reset.
- Every schema change receives an Alembic migration and clean-database test.
- Extract behavior before renaming routes.
- Each phase ends with lint, TypeScript, frontend tests, backend tests, migration check, and build.

## Phase 1 — Audit and stabilization (in progress)

- Baseline tests/build/migrations.
- Architecture, bug, logic, route/API, and permission documentation.
- Windows service scripts and bounded health checks.
- Fix verified startup, encoding, and cache issues.

## Phase 2 — Architecture seams

1. Split `lib/api.ts` into domain clients while retaining a compatibility barrel.
2. Move Dashboard feature workspaces to `features/*` with route adapters.
3. Extract catalogue queries/services from `commerce.py`.
4. Extract Studio designs, pages, templates, assets, and exports behind compatibility routers.
5. Add normalized error helpers without wrapping all success payloads in one breaking change.

## Phase 3 — Auth/access

- Add endpoint-level access matrix tests.
- Verify disabled-session revocation, refresh behavior, lockout, and reset.
- Verify deny precedence and every record scope.
- Add final-SuperAdmin and reauthentication integration tests.

## Phases 4–8 — Business features

- Role-aware dashboard and centralized navigation.
- Product lifecycle and public exclusion tests.
- Pricing/no-price leakage tests.
- Single synchronization orchestration service.
- Catalogue wizard/lifecycle/share-link tests.
- Split Studio command/state/rendering layers.

## Phases 9–12 — Output and operations

- Shared preview/PDF fixture renderer and visual tests.
- Promotion scheduler/state tests.
- Organization graph validation.
- Real PostgreSQL/application backup verification.
- Safe system metrics, audit completeness, and final runbook.

## Completion evidence

Each item is complete only with a linked test or reproducible command. Deferred work remains in `BUG_AUDIT.md` with reason and risk.
