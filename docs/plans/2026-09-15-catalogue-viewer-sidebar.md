# Catalogue Viewer Sidebar Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved full-height green navigation to every online catalogue viewer.
**Architecture:** One shared sidebar and shell stylesheet; each viewer retains its data, search and navigation callbacks.
**Tech Stack:** React, Next.js, CSS Modules, Vitest, existing Playwright/Chrome.

## Global Constraints

No product-card, pricing, stock scheduler, catalogue-content or permission changes. Preserve action placement and booklet/fullscreen controls. No dependencies, server restarts, Git initialization or commits. Work in place because this workspace has no Git repository; isolated build and recovery copies live outside the project. Existing root progress.md remains untouched.

## Tasks and Evidence

- [x] Task 1: Record failing public-viewer search/current-category assertion; implement `frontend/src/components/catalogue-sidebar.tsx` and its CSS. Props carry title/logo, controlled search, utilities/categories with source counts, current-state and existing footer actions. Test zero counts, drawer navigation, Escape/focus and collapse in the component test.
- [x] Task 2: Integrate internal `catalogues/[id]/preview/catalogue-preview.tsx` and public `c/[token]/public-catalogue-viewer.tsx` (standard, Studio and booklet). Preserve PDF/print guards and real counts. Verify existing tests plus focused search/navigation tests.
- [x] Task 3: Integrate `catalogue-studio/studio-preview.tsx`; preserve paged category search and labelled page counts. Test selected category, scroll tracking, and booklet keyboard protection while searching.
- [x] Task 4: Exercise all viewer families with read-only illustrative browser fixtures at desktop/mobile widths; inspect screenshots, long labels, category overflow, EN/Thai, drawer keyboard/focus, print omission and guarded actions. Run all frontend tests, TypeScript, lint and isolated webpack build. Independently review shared UI before claiming completion. Update spec and bug register with evidence and limitations.

Baseline: 2026-09-15, existing three viewer test files: 30/30 tests pass (`npm.cmd test -- --maxWorkers=2` with those exact file paths).

## Final evidence, 2026-09-15

All approved viewer integrations complete: internal previews, public standard/Studio/booklet links and Studio previews use the same sidebar. Product cards, pricing, permission guards, export handlers and180-second stock polling preserved. No dashboard/editor redesign or persisted catalogue-data changes.

Final frozen-source gates:

- `npm.cmd test -- --maxWorkers=2`: exit0,49files/303tests pass,118.79s. Run without concurrent build/browser; earlier concurrent302-test run failed two unchanged editor timing checks, exact solo retry passed. No test timeout changes.
- `tsc.cmd --noEmit --incremental false`: exit0, no diagnostics.
- `npm.cmd run lint`: exit0, no diagnostics.
- `playwright.cmd test --config playwright.overlap.config.ts catalogue-sidebar-render.spec.ts --output [scratch]/browser-final-geometry-results --reporter=line`: exit0,30/30 pass,1.4m. Four variants at375/768/1024/1440, Thai guards, mobile drawers, collapse, current-state after settled/manual scroll, contrast/containment and actual wheel scrolling without booklet page turns.
- Isolated current-source Next16.2.12 webpack build: exit0, compiled4.5s, type19.1s,34static pages and dynamic routes generated. Existing environment/dependencies reused; running frontend `.next` untouched and no service restart.
- Fresh independent read-only review:43/43 focused tests,exit0,8.07s; final browser artifact verified passed; no new concrete finding. Viewer business paths preserved. Final source SHA256 comparison unchanged after build.

Additional red/green regressions cover missing/failed logo fallback, explicit page units for unbound Studio sections, partial visibility batches, stale observer ratios within unchanged threshold buckets and booklet keyboard/wheel conflicts. The shared hook now measures current section geometry once per scroll frame, cleans listeners/observer/RAF and does not read/update business data. Representative desktop/mobile screenshots inspected separately from behavior assertions.

Scratch evidence and recovery: `C:/Users/GMS/AppData/Local/Temp/gms-catalogue-sidebar-20260915/` (`evidence.md`, final-geometry source manifest, baseline viewer copies, isolated build). Screenshots in OS Temp named `gms-catalogue-sidebar-*`. Temporary diagnostic instrumentation removed.

Limits: browser fixtures are clearly illustrative GET-only data, not live customer login/ERP or export-generation proof. No backend/migration, cross-browser/device, measured performance or default Turbopack build checks; no platform-wide release-ready or ERP real-time claim. Fixed-size paged Studio canvases retain their own horizontal scroll on narrow views. Existing root progress.md and unrelated files preserved. No Git repository, initialization, commit or PR.
