# GMS Catalogue Platform Bug Audit

Audit date: 2026-09-04. Status reflects verified evidence, not assumptions.

| ID | Module | Severity | Reproduction | Expected | Actual / root cause | Fix | Test | Status |
|---|---|---|---|---|---|---|---|---|
| BUG-001 | Studio ERP table | High | Export a legacy page with one carousel and an ERP table lacking an explicit link | Table uses carousel product stock | Strict linkage rejected legacy documents | Use the sole carousel only when unambiguous | `test_design_studio_live_table.py` | Fixed |
| BUG-002 | Studio preview | Medium | Rerender an element with an image background | No React style warning | `background` shorthand conflicted with background subproperties | Use `backgroundColor` | Studio preview/editor tests | Fixed |
| BUG-003 | User catalogue links | Medium | Sign in as Sales User and open All Catalogues | Link UI follows explicit permission | Sales User lacked share-link permissions; UI correctly hid section | Documented required `view/copy/create` grants; no bypass added | Permission behavior inspection | Open: configuration |
| BUG-004 | Design media | Medium | Sign in as Test sale and load design media | Authorized role can view media | Sales User lacked `design_media.view` | Added permission to Sales User reference role and synchronized DB | Effective permission check | Fixed |
| BUG-005 | Permission UI | Medium | Manage a role with many permission modules | Fast search and bulk operation | Required scanning modules one by one | Added search, expand/collapse, select/clear shown | Lint/build | Fixed |
| BUG-006 | Frontend image delivery | Low | Run ESLint | No performance warnings | Six intentional raw image elements bypass Next image optimization | Design authenticated image loader before conversion | ESLint | Deferred |
| BUG-007 | Backend warning debt | Low | Run backend tests | Clean test output | FastAPI dependency emits Python 3.16 deprecation warnings | Upgrade dependency after compatibility validation | Backend suite | Deferred |
| BUG-008 | Test cache | Low | Run pytest on Windows | Cache writes normally | `.pytest_cache` can be a file/collision and emits WinError 183 | Repair cache path without deleting user data | Pytest output | Open |
| BUG-009 | Service smoke automation | Medium | Probe four local URLs in one PowerShell process | Bounded checks return quickly | current probe can hang despite request timeout | Add dedicated process-bounded service checker | Script test | Open |
| BUG-010 | Text encoding | Medium | Inspect permission/seed source strings | UTF-8 punctuation displays normally | Several mojibake sequences are stored in source | Inventory and replace with tests/snapshots | UI review | Open |

## Baseline results

- Frontend lint: 0 errors, 6 image warnings.
- Frontend tests: 37 files, 211 tests passed.
- Frontend production build: passed; 33 routes generated.
- Backend tests: 7 passed, 1 skipped.
- Alembic: current and head are both `0028_product_barcodes`.

## Required next audit work

- Authenticated API tests for every mutation and public-data exclusion rule.
- PostgreSQL migration test on a clean disposable database.
- Browser console/network audit with role fixtures.
- Preview-to-PDF visual regression fixtures.
- Backup archive content and path-traversal tests.
