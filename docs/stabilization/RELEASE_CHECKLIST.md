# Release Checklist

> Historical stabilization snapshot. The results below describe the September 2026 audit at the time it was run and are not the current deployment instructions. Use [`RELEASE.md`](../../RELEASE.md) for the current production preflight, deployment, health check, and rollback process.

Consolidated from `docs/GMS_Functional_Inspection_Report_2026-09-04.md` (the most complete prior checklist run) plus this pass's fresh automated evidence. Status definitions kept consistent with that report:

- **PASS:** verified with an automated test, build, or migration check (this pass or reconfirmed from Sept 4).
- **PARTIAL:** core behavior verified; visual/browser/device/external-integration checks remain.
- **BLOCKED:** required environment not available to test safely.
- **MANUAL:** requires human visual judgment, physical input, or an intentional outage — cannot be automated as currently designed.
- **UNVERIFIED (new label for this pass):** an automated test exists but has never actually run to completion (distinct from PASS — see QA-001).

## Automated gate summary (this pass, disposable sandbox)

| Gate | Result | Evidence |
|---|---:|---|
| Alembic migration, PostgreSQL 16 (fresh DB) | **PASS** | 0001→0028 applied cleanly. First real Postgres verification — previously BLOCKED. |
| Backend pytest (`tests/test_*.py`) | **PASS** | 9 passed, 1 skipped |
| Backend smoke suites (17 scripts) | **PARTIAL** | 16 passed, 1 failed (`smoke_product_videos` — BUG-011) |
| Frontend vitest | **PASS** | 213/213, 37 files |
| TypeScript (`tsc --noEmit`) | **PASS** | 0 errors |
| ESLint | **PASS WITH WARNINGS** | 0 errors, 6 known `<img>` warnings (BUG-006, unchanged) |
| Next.js production build | **PASS** | 42/43 routes generated (1 excluded by this pass's staging limits, not a build error) |
| npm audit | **PARTIAL** | 3 high (dev-tooling only, BUG-014) |
| Browser-rendered PDF parity (QA-001) | **UNVERIFIED** | Test exists, requires live services, has never run to completion in any documented pass |
| Live Windows service startup | **BLOCKED** (this pass) | No terminal/shell access to the real machine this session |
| Real ERP (MSSQL) connection + live 180s cycle | **BLOCKED** (this pass) | Not reachable from the disposable sandbox by design (no production credentials copied) |
| Real 23k-product / 152k-price scale behavior | **BLOCKED** (this pass) | Deliberately did not copy production data off the Windows machine |
| PostgreSQL backup/restore drill | **BLOCKED** (this pass) | This pass proved migrations, not `pg_dump`/restore |
| Version control | **FAIL (new)** | No `.git` repository exists at all (BUG-013) |

## Carried-forward MANUAL items (unchanged from Sept 4 — nothing in this pass supersedes these)

Login/session eye-button and Remember-Me persistence; header/sidebar tooltips, drawer, and Back/Forward behavior; dashboard visual card counts and quick-action clicks; video aspect ratio/playback controls; full visual completion of the catalogue wizard; pixel-level Studio canvas interactions (drag/resize/guides/grouping/keyboard); visual parity across Studio/Preview/PDF for one-price/two-price/no-price catalogues; physical print/font/crop judgment; clipboard feedback and incognito display for share links; calendar visual layout and timezone labels; browser password-eye and form usability; large permission-matrix usability and unsaved-change prompts; repeated system-health polling and tab-hidden pause behavior; physical responsive checks at 1920×1080, 1366×768, 768×1024, 390×844 including touch swipe; intentional frontend/backend/network outage recovery and two-window concurrent-edit conflict handling.

## Release decision

**Not ready for production release.** Reasons, in priority order:

1. **QA-001 (browser PDF authentication) has never been automatically verified**, only inferred from a fallback path. This was Critical in the Sept 3 report and remains formally unverified — it should be run for real (live services) before anyone treats it as fixed.
2. **BUG-013 — no version control exists.** Stabilization work (this task's own ground rules: reproduce bugs, preserve unrelated changes, avoid destructive operations) cannot be done safely without diffable history. Recommend fixing this before Segment 1 starts, not as part of it.
3. **BUG-012 — the production compose file runs a redundant sync scheduler** in the API service, violating an explicitly named mandatory rule (masked by a DB lock, not actually satisfied).
4. Everything the Sept 4 report already marked BLOCKED for PostgreSQL is now PARTIALLY resolved (migrations proven) but backup/restore, real ERP connectivity, and real-scale behavior remain unverified.
5. The full MANUAL list above is unchanged and still gates a genuine release decision — automated gates being green is necessary, not sufficient (per this task's own instruction: do not describe the application as deployable merely because focused/automated tests pass).

**What is newly reassuring:** the automated regression surface (frontend 213 tests, backend 9+16 tests, TypeScript, ESLint, production build, and now Postgres migrations) is fully green with zero net-new regressions since Sept 4, despite substantial code growth (33→43 routes) in the interim. The codebase is being actively developed and is not visibly rotting.
