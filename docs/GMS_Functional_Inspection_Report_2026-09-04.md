# GMS Catalogue Platform — Functional Inspection Report

**Inspection date:** 04 September 2026  
**Source checklist:** `C:\Users\GMS\Downloads\GMS Catalogue Platform Functional Inspection Checklist.pdf` (50 pages)  
**Environment:** Local development, Windows, Asia/Bangkok  
**Result:** PARTIAL PASS — automated gates pass; production PostgreSQL and manual browser/device checks remain open

## Result definitions

- **PASS:** Verified during this inspection with an automated test, HTTP probe, build, migration check, or database audit.
- **PARTIAL:** Core behavior is verified, but one or more visual, browser, device, or external-integration checks remain.
- **BLOCKED:** The required environment or safe test condition is not available.
- **MANUAL:** Requires direct human visual judgment, physical input, printing, clipboard, browser persistence, or an intentional outage.

## Automated gate summary

| Gate | Result | Evidence |
|---|---:|---|
| Frontend `/login` | PASS | HTTP 200 |
| Backend `/docs` | PASS | HTTP 200 |
| Frontend unit/component tests | PASS | 37 files, 211 tests |
| Backend unit/export tests | PASS | 9 passed, 1 browser-dependent skip |
| Backend isolated smoke workflows | PASS | 17 of 17 workflows |
| Alembic migration | PASS | `0028_product_barcodes (head)` |
| Database/media audit | PASS | No missing local media; audit result OK |
| TypeScript and production build | PASS | Next.js compiled; 33 static pages generated |
| ESLint | PASS WITH WARNINGS | 0 errors; 6 existing `<img>` optimization warnings |
| PostgreSQL requirement | BLOCKED | Current resolved database is SQLite, not PostgreSQL |

## Step-by-step checklist execution

### 1. Start frontend, backend, and database — PARTIAL

- PASS: Frontend login route responds.
- PASS: Backend documentation and health service respond.
- PASS: Database is connected and loads real local data.
- PASS: Migration is at head.
- BLOCKED: PostgreSQL-specific startup and backup validation; this environment resolves to SQLite.

### 2. Login and session — PASS / MANUAL

- PASS: Correct login, invalid login, cookie session, logout, and protected API behavior are covered by `smoke_auth` and `smoke_access_control`.
- PASS: Restricted requests return safe 401/403 responses.
- MANUAL: Eye-button behavior, Remember Me across browser restart, and backend-outage wording.

### 3. Header and sidebar — PARTIAL

- PASS: Component tests cover sidebar access filtering, active navigation, and dashboard rendering.
- PASS: Production route generation completed without missing-route build errors.
- MANUAL: Tooltips, drawer interaction, browser Back/Forward, and visual overflow at every target width.

### 4. SuperAdmin permissions — PASS

- PASS: Effective permissions, protected final SuperAdmin, direct restrictions, and unauthorized access are covered by access-control, organization-admin, and user smoke workflows.

### 5. Dashboard — PASS / MANUAL

- PASS: Permission-aware counts, global search, synchronization status, and unauthorized access are verified by `smoke_dashboard_overview`.
- MANUAL: Visual card counts and every quick-action click in a live browser.

### 6. Brands and categories — PASS

- PASS: ERP brand synchronization and brand/category normalization smoke workflows pass.
- PASS: Category creation and catalogue relationships are exercised by catalogue workflows.

### 7. Products — PASS

- PASS: Product creation, uniqueness validation, search, editing, workflow submit/approve/publish, filtering, and permission restrictions pass in `smoke_catalogue`.

### 8. Product images and videos — PASS / MANUAL

- PASS: Image upload/import/removal and missing-media audit pass.
- PASS: Video upload size/type validation, external records, featured video, update, public delivery, inactive visibility, and deletion pass.
- MANUAL: Visual aspect ratio and playback controls in physical browsers.

### 9. Active/inactive products — PASS

- PASS: Inactive products are excluded from public pages and exports, remain administratively available, and can be reactivated. Synchronization does not incorrectly reactivate them.

### 10. Prices and price lists — PASS

- PASS: Price-list creation and uniqueness, price creation, validation, approval conflicts, scoped access, history, effective prices, catalogue pricing, and PDF pricing pass.
- PASS: Generic Studio PDF price binding now resolves and formats the primary slot.

### 11. Catalogue creation wizard — PASS / MANUAL

- PASS: Creation component tests and catalogue API creation workflows pass.
- MANUAL: Full visual completion of every wizard branch.

### 12. Catalogue Studio — PASS / MANUAL

- PASS: Design creation, pages, autosave/revisions, ordering, restore, duplicate, delete, assets, templates, and export workflow pass.
- PASS: The preview nested-button hydration regression is fixed and covered by tests.
- MANUAL: Pixel-level drag, resize, guides, grouping, and keyboard behavior on the live canvas.

### 13. Product-card templates — PASS / MANUAL

- PASS: Product-card designer, layout, library, and template tests pass.
- MANUAL: Visual parity for every named starting template.

### 14. Image carousel — PASS / MANUAL

- PASS: Carousel component, ordering, transition configuration, keyboard behavior, fallback, and missing-configuration tests pass.
- MANUAL: Touch behavior and animation quality on physical devices.

### 15. Catalogue preview — PASS / MANUAL

- PASS: Preview component tests pass, including booklet navigation, page dragging, mobile booklet selection, product visibility, protected images, tables, barcode, and image controls.
- MANUAL: Pixel comparison against Studio at all viewport sizes.

### 16. PDF generation — PASS WITH RISK

- PASS: Native Studio PDF export, catalogue PDF export, public PDF, barcode, page size, pricing, inactive-product exclusion, and downloadable output pass.
- RISK: The isolated Studio workflow logs that browser PDF rendering loses its internal session; the authenticated native renderer successfully falls back and completes the PDF. Browser-renderer parity should remain a release follow-up.
- MANUAL: Visual comparison of every page, physical print, font fidelity, and crop judgment.

### 17. Catalogue share links — PASS / MANUAL

- PASS: Audience-specific links, secure pricing, no-price behavior, query-tampering resistance, revoke, regenerate, expiry, public PDF, and unauthenticated access pass.
- MANUAL: Clipboard feedback and incognito browser display.

### 18. Promotions — PASS / MANUAL

- PASS: Creation, validation, approval/publish flow, audience pricing, public access, PDF, pause/resume, revoke, duplicate, scheduling rules, and unauthorized access pass.
- MANUAL: Calendar visual layout and timezone labels.

### 19. Users — PASS / MANUAL

- PASS: List, create, edit, role assignment, password reset, login with reset password, lockout clearing, permission overrides, unauthorized denial, and final-SuperAdmin protection pass.
- MANUAL: Browser password-eye and form usability.

### 20. Departments, teams, and positions — PASS

- PASS: Creation, relationships, permissions, circular relationship rejection, role duplication, and protected deletion behavior pass.

### 21. Roles and permission matrix — PASS / MANUAL

- PASS: Role creation/uniqueness, duplication, module permissions, restrictions, effective access, and protected-role behavior pass.
- PASS: Frontend permission-management component tests pass.
- MANUAL: Large-matrix usability and unsaved-change prompts in a browser.

### 22. Restricted user accounts — PASS

- PASS: Catalogue, product, price, role, user, synchronization, and export APIs enforce safe 401/403/404 behavior for restricted accounts.

### 23. Data synchronization — PASS / BLOCKED

- PASS: Stock/price update rules, unchanged-price history, missing-source handling, inactive-product protection, status, and history pass in the lifecycle workflow.
- BLOCKED: Observation of the live ERP job over an extended real three-minute interval.

### 24. Database and application backup — PARTIAL

- PASS: Application archive creation/download, component exclusions, database backup job state, and permission controls pass in isolated workflows.
- BLOCKED: A real PostgreSQL `pg_dump`, off-host copy, and restore drill because the current database is SQLite.

### 25. System health — PASS / MANUAL

- PASS: Authorized system metrics endpoint and restricted access pass.
- MANUAL: Repeated 5–10 second polling, tab-hidden pause behavior, and warning threshold visuals.

### 26. Activity and audit logs — PASS

- PASS: Product, catalogue, price, permission, synchronization, user, feedback, and administrative workflows create audited actions without exposing passwords in tested responses.

### 27. Feedback — PASS

- PASS: Submit, screenshot validation/upload, scoped list access, detail, assignment/update, CSV/XLSX export, and unauthorized denial pass.

### 28. Responsive design — PARTIAL

- PASS: Responsive component behavior is covered in the frontend suite and the production build succeeds.
- MANUAL: Physical checks at 1920×1080, 1366×768, 768×1024, and 390×844, including touch swipe and unexpected horizontal scrolling.

### 29. Error recovery — PARTIAL

- PASS: Invalid input, conflicts, missing records, unavailable media, export fallback, unauthorized requests, and retry-safe component paths are tested.
- MANUAL: Intentional frontend/backend/network outages and two-window concurrent editing.
- BLOCKED: PostgreSQL outage/recovery because PostgreSQL is not the active database.

### 30. Final regression — PARTIAL PASS

- PASS: Automated tests, backend workflows, migration, database audit, TypeScript, lint, and production build.
- OPEN: PostgreSQL validation, browser-rendered PDF authentication warning, physical responsive/device testing, print inspection, and destructive recovery/restore drill.

## Data audit evidence

| Record | Count |
|---|---:|
| Users | 10 |
| Roles | 17 |
| Permissions | 273 |
| Departments | 5 |
| Positions | 8 |
| Teams | 5 |
| Brands | 145 |
| Products | 23,071 |
| Categories | 523 |
| Product images | 36,888 |
| Product prices | 151,759 |
| Catalogues | 151 |
| Catalogue products | 21,172 |
| Catalogue versions | 232 |
| Missing local media | 0 |

## Release decision

Do not mark the complete 50-page checklist fully accepted yet. The automated application gates are green, but production acceptance still requires:

1. Run the same migration/audit/backup tests against PostgreSQL.
2. Complete and restore a real PostgreSQL backup plus persistent uploads.
3. Retest Studio browser PDF authentication or formally accept native-renderer fallback.
4. Compare Studio, Preview, and downloaded PDFs visually using one-price, two-price, and no-price catalogues.
5. Complete Chrome/Edge and physical tablet/mobile checks at the checklist dimensions.
6. Test intentional service/network failures and a two-browser revision conflict.

