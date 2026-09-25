# GMS Catalogue Platform — Bug Register

Phase 0 audit only. No fixes were applied in this pass. IDs BUG-001 through BUG-010 and QA-001 through QA-004 are carried forward from `docs/BUG_AUDIT.md` and `docs/GMS_Catalogue_Platform_Test_Report_2026-09-03.md` (2026-09-03/04) with their status re-verified against today's fresh test run where possible. BUG-011 onward are new findings from this pass.

---

### BUG-001 — Studio ERP table strict linkage (carried forward)
- **Module/Route:** Catalogue Studio editor — ERP table element
- **Role:** Catalogue Editor/Admin
- **Language:** N/A
- **Repro:** Export a legacy page with one carousel and an ERP table lacking an explicit link.
- **Expected:** Table uses the sole carousel's product/stock when unambiguous.
- **Actual/root cause:** Was previously rejecting legacy documents under strict linkage.
- **Status today:** Fixed and still passing — `test_design_studio_live_table.py` (2 tests) passed in this pass's pytest run.
- **Severity:** P2 (resolved)
- **Test:** `test_design_studio_live_table.py`

### BUG-002 — Studio preview background style warning (carried forward)
- **Status today:** Fixed, no regression observed (frontend suite green, 213/213).
- **Severity:** P3 (resolved)

### BUG-003 — Sales User catalogue-link visibility (carried forward, open)
- **Module/Route:** Dashboard → All Catalogues, share-link UI
- **Role:** Sales User
- **Language:** EN/TH (UI text only; not a translation defect)
- **Repro:** Sign in as a Sales User without `catalogue_share_links.view/copy/create` and open All Catalogues.
- **Expected:** Documented — UI correctly hides the section when the role lacks the grant.
- **Actual:** Confirmed correct (no bypass); the "bug" is a configuration/role-assignment question, not a code defect.
- **Root cause / status:** Configuration decision pending (which roles should carry these grants by default) — not re-tested this pass since it requires a live role fixture.
- **Severity:** P3
- **Required test:** Permission fixture test asserting Sales User visibility per assigned grants (not yet added).

### BUG-004 — `design_media.view` missing from Sales User (carried forward, fixed)
- **Status today:** Not independently re-verified this pass (requires a live permission fixture / seeded role state); no code regression indicators found in `access.py` inspection.
- **Severity:** P2 (resolved, pending live re-confirmation)

### BUG-005 — Permission UI bulk operations (carried forward, fixed)
- **Status today:** `permission-management.tsx` present and covered by passing frontend suite; not manually re-verified visually.
- **Severity:** P3 (resolved)

### BUG-006 — Six raw `<img>` elements bypass Next.js image optimization (carried forward, open/deferred)
- **Module/Route:** `studio-carousel-properties.tsx` (2), `studio-image-carousel.tsx` (3), `dashboard/catalogue-management.tsx` (1)
- **Repro:** `npx eslint .`
- **Expected:** No `@next/next/no-img-element` warnings, or an accepted authenticated-image-loader design.
- **Actual:** 6 warnings, identical count and file locations to the Sept 4 baseline — confirmed unchanged today.
- **Root cause:** These images are served through authenticated/signed endpoints, which `next/image`'s default loader cannot call without a custom loader.
- **Severity:** P3 (deferred by design; needs an explicit decision, not a quick fix)
- **Required test:** N/A until a loader design is chosen.

### BUG-007 — Backend dependency deprecation warnings (carried forward, open)
- **Status today:** Confirmed still present — `pytest` run emits `DeprecationWarning: builtin type SwigPyPacked/SwigPyObject/swigvarlink has no __module__ attribute` (from PyMuPDF's SWIG/cffi bindings). Cosmetic, not a functional defect.
- **Severity:** P3

### BUG-008 — `.pytest_cache` Windows path collision (carried forward, open)
- **Status today:** Not reproducible in this pass's Linux sandbox (Windows-specific `WinError 183`). Carried forward unverified; needs testing on the actual Windows machine.
- **Severity:** P3

### BUG-009 — Service smoke automation can hang (carried forward, open)
- **Status today:** Not re-tested (requires the real Windows services and PowerShell scripts running live, which this pass could not drive).
- **Severity:** P2

### BUG-010 — Source string encoding corruption / mojibake (carried forward, open)
- **Status today:** Not re-scanned line-by-line this pass. Elevated relevance given the I18N finding below (I18N-001): because Thai lookups are keyed by the literal English string, any mojibake in an English source string used as a translation key would silently break that string's Thai lookup (falls back to showing the corrupted English text) with no build-time or test-time signal.
- **Severity:** P2

### QA-001 — Studio browser-rendered PDF export authentication (carried forward, STILL UNVERIFIED)
- **Module/Route:** Catalogue Studio exports, browser PDF renderer
- **Repro:** `backend/tests/test_design_studio_visual_regression.py::test_saved_preview_matches_browser_generated_pdf`
- **Expected:** Browser-rendered PDF completes without losing session/authentication.
- **Actual:** This test is explicitly opt-in and skipped whenever the local frontend + backend services aren't live — it was skipped on Sept 4 and it was skipped again in this pass, for the same reason. **No automated pass has ever exercised this path end-to-end.** The native-renderer fallback (which does not depend on the browser) is covered and passes (`test_design_studio_pdf_export.py`).
- **Root cause:** Unconfirmed — never actually executed.
- **Severity:** **P1** — a previously Critical defect whose fix has not been proven by any automated evidence, only inferred from a fallback path succeeding.
- **Required test:** Run this suite with live frontend+backend services (Segment 1 candidate) and record a real pass/fail.

### QA-002, QA-003, QA-004 — Studio preview crash / missing SP1 price level / carousel-name regression (carried forward, RESOLVED)
- **Status today:** All three areas are exercised by `studio-preview.test.tsx`, `studio-editor.test.tsx` and related files, all of which pass in today's 213/213 run. No regression found.
- **Severity:** P3 (resolved, confirmed by fresh automated run)

---

## New findings from this pass

### BUG-011 — Video upload hard-rejects on any `ffprobe` parse failure instead of degrading gracefully
- **Module/Route:** Backend — `POST /api/v1/products/{id}/videos` (`app/storage.py::_probe_video`)
- **Role:** Any role with `products.edit`/video-upload permission
- **Language:** N/A (backend validation)
- **Repro:** `python -m tests.smoke_product_videos` in an environment where `ffprobe` is installed and available on `PATH` (this sandbox has it; confirmed present at `/usr/bin/ffprobe`). Result: `AssertionError: {"detail":"The video file is not a valid playable MP4 or WebM file."}` on a functionally-valid upload.
- **Expected:** A file that passes the container-signature check (`ftyp`/`webm` magic bytes) should upload successfully; codec/duration metadata is a nice-to-have, not a gate, per the code's own comment ("uploads remain supported without it").
- **Actual/root cause:** `_probe_video()` treats **`ffprobe` absent** as a soft pass-through (returns `(None, None, None)`, upload proceeds) but treats **`ffprobe` present but returning a non-zero exit code** as a hard `422` rejection (`app/storage.py:198-199`). This makes upload success environment-dependent: the exact same file is accepted on a host without `ffprobe` and rejected on a host with it. Production's own `Dockerfile` does **not** install `ffmpeg`/`ffprobe`, so this specific failure mode is not currently live in production — but it is a latent defect that will silently start rejecting some currently-valid uploads the moment `ffmpeg` is added to the image (e.g., for future thumbnailing), and it is already failing this test in any Linux dev/CI environment that happens to have `ffmpeg` installed.
- **Severity:** P2
- **Required test:** `smoke_product_videos` already reproduces it; add a second case with a real-but-unusual container that `ffprobe` legitimately can't fully parse, asserting the upload still succeeds (metadata fields null) rather than 422.
- **Proposed fix scope:** In `_probe_video`, catch a non-zero `ffprobe` return the same way as `OSError`/`ValueError`/etc. — log it and return `(None, None, None)` instead of raising. Reserve the hard 422 for the earlier magic-byte signature check, which is the actual security-relevant gate.

### BUG-012 — Production `backend` service still runs its own product-sync scheduler thread alongside the dedicated `product-sync-worker` container
- **Module/Route:** `docker-compose.production.yml` (`backend` service) / `backend/app/main.py` lifespan / `backend/app/config.py`
- **Role:** N/A (infrastructure/operations)
- **Language:** N/A
- **Repro:** Inspect `docker-compose.production.yml`: the `backend` service does not set `PRODUCT_SYNC_ENABLED`, so it inherits `config.py`'s default `product_sync_enabled: bool = True`. `app/main.py`'s `lifespan()` unconditionally starts a `product-sync-worker` thread whenever `settings.product_sync_enabled` is true — with no check for whether this process is the dedicated worker or an API replica. Meanwhile the compose file *also* runs a separate, purpose-built `product-sync-worker` service with `PRODUCT_SYNC_ENABLED: "true"` set explicitly.
- **Expected:** Per CLAUDE.md rule 16 ("Do not run one scheduler in every FastAPI worker"), only the dedicated worker process should run the sync scheduler; the `backend` API service(s) should not.
- **Actual:** Every `backend` API container/replica also spins up its own sync-scheduler thread. Actual duplicate *work* is currently prevented by a database-backed advisory-style lock (`ProductSyncLock` / `acquire_sync_lock`, TTL = `PRODUCT_SYNC_LOCK_SECONDS`, default 900s) — so this is not currently causing duplicate ERP writes — but it means: (a) every API replica polls the lock table every 180 seconds for no benefit, (b) if `backend` is ever scaled to N replicas, N+1 threads compete for one lock every cycle, and (c) if the lock-holder crashes mid-sync, the lock self-expires only after 900s (5x the sync interval), during which an API-replica thread could as easily "recover" the schedule as the dedicated worker — an implicit, undocumented failover behavior nobody designed on purpose.
- **Root cause:** `PRODUCT_SYNC_ENABLED: "false"` was never added to the `backend` service block in `docker-compose.production.yml` when the dedicated `product-sync-worker` service was introduced.
- **Severity:** **P1** (explicit named rule in the project's own mandatory rules; currently masked by a lock rather than actually satisfied)
- **Required test:** A compose-config assertion/lint (or a documented manual check) that `backend`'s effective `PRODUCT_SYNC_ENABLED` is `false` in the production compose file.
- **Proposed fix scope:** Add `PRODUCT_SYNC_ENABLED: "false"` to the `backend` service environment block in `docker-compose.production.yml`. One-line, low-risk, no schema/behavior change.

### BUG-013 — No version control (`.git`) exists for the project
- **Module/Route:** Whole repository (`C:\Project GMS\catalogue-main`)
- **Repro:** `C:\Project GMS\catalogue-main\.git` does not exist (confirmed by direct directory listing).
- **Expected:** A real-data production platform undergoing stabilization work should be under version control so changes can be diffed, reviewed, reverted, and attributed.
- **Actual:** No git history anywhere. Prior "handoff" and audit docs (`.codex-request.txt`, `docs/GMS-Platform-New-Chat-Handoff.html`) imply multiple AI-assisted sessions have already made undocumented changes directly on disk with no way to diff what changed between them.
- **Root cause:** Project was apparently never initialized as a git repository.
- **Severity:** **P1** — this blocks several of the project's own mandatory rules (rule 2 "reproduce every bug" and rule 5 "preserve unrelated user changes" are much harder to guarantee without diffable history; rule 6 "never use destructive git commands" is moot but the absence itself is the risk).
- **Required action:** `git init`, commit the current working tree as a baseline (excluding `node_modules`, `.venv`, `uploads`, `private_uploads`, `backups`, logs, `.next`, `__pycache__`), then adopt normal branch/PR discipline before Segment 1 begins. This is process, not code — recommend doing it before any further stabilization work, not as part of Segment 1's code changes.

### BUG-014 — Three high-severity `npm audit` findings in frontend dev tooling
- **Module/Route:** `frontend/package-lock.json` — transitive dependencies `brace-expansion` (via ESLint tooling), `js-yaml`, `nanoid`
- **Repro:** `npm audit` in `frontend/`.
- **Expected:** No high-severity advisories, or an accepted-risk note.
- **Actual:** 3 high-severity advisories, all in dev-time tooling (ESLint config resolution, YAML parsing, ID generation used by dev tooling) — not shipped in the Next.js production bundle's runtime code paths, but still present in `node_modules` during build/CI.
- **Root cause:** Outdated transitive pins in `package-lock.json`.
- **Severity:** P3
- **Proposed fix scope:** `npm audit fix` (non-breaking per npm's own report); re-run full frontend suite afterward to confirm no breakage.

### I18N-001 — Thai translations are keyed by literal English source strings, not stable keys
- **Module/Route:** `frontend/src/lib/i18n.tsx` + `frontend/src/lib/management-translations.ts`
- **Language:** EN/TH
- **Repro:** Inspect `THAI_TRANSLATIONS: Record<string, string>` — every key is a literal English sentence/phrase (e.g. `"Welcome back": "ยินดีต้อนรับกลับ"`), and `t(key)`'s context-less default implementation (`t: (key, variables) => interpolate(key, variables)`) returns the raw key text verbatim when no `LanguageProvider` or no matching Thai entry exists.
- **Expected (per CLAUDE.md rule 13):** "English and Thai must use centralized translation keys" — i.e., a stable identifier independent of the English wording.
- **Actual:** Translations are centralized (good — there is one dictionary, not scattered inline conditionals), but the "keys" are the English copy itself. Any edit to an English string in JSX (even a punctuation fix) silently orphans its Thai translation with **no compiler error, no test failure, and no visible warning** — the UI just falls back to showing English to Thai users. This is architecturally the same failure class as BUG-010 (encoding corruption in a key would have the identical silent-fallback effect).
- **Severity:** P2 — not a broken feature today, but a standing risk that will produce silent Thai-language regressions every time an English string is edited, with nothing in the test suite (today's 213 tests included) that would catch it.
- **Required test:** A coverage check (unit test or lint rule) that extracts every `t("...")`/`<T>` literal from source and asserts it exists as a key in `THAI_TRANSLATIONS`, failing the build on any drift.
- **Proposed fix scope:** Either (a) add the coverage-check test above as a lower-risk first step (Segment 1 candidate — pure addition, no behavior change), or (b) a larger migration to stable keys (`login.welcome_back`) — larger, defer to a later segment per the incremental-refactor guardrail (no simultaneous schema+behavior changes).

---

## Severity summary (this pass)

Maintenance follow-up, 2026-09-15: [generated-file cleanup record](generated-file-cleanup-2026-09-15.md)
documents 201 permanently deleted generated/diagnostic files after the user
clarified removal rather than quarantine. The old recovery copy was also deleted.
Application source was unchanged. Fresh backend tests, TypeScript, lint and
service-health checks passed; the latest full frontend run passed with two workers.
The initial default-parallelism frontend run had a promotion-list loading timeout;
the unchanged focused file passed three repeats. Its intermittent cause is not
conclusively established or fixed. The formerly access-denied `backend/.pytest_cache`
was inspected and deleted via narrow escalation; BUG-008 is not closed because
a general Windows cache fix was not demonstrated. Other historical defect status
and severity are unchanged by this cleanup segment.

Source-only follow-up: the subsequent frontend/backend import audit found zero
unreachable candidates among 129 frontend runtime files and 71 backend application
modules. No further application source was removed. Standalone demo/import/setup
commands were preserved pending an explicit capability-removal decision. Both
service health checks returned 200. See the source-only follow-up in the cleanup record.

Active-file-only clarification: a fresh inventory found no separate old frontend
tree or unused public asset. Current dashboard/global styles and both public
images are referenced; the ERP worker still uses `legacy_product_sync`. No further
source or build files were deleted. Removing optional legacy/demo commands remains
a capability-removal scope decision. Fresh login/backend health GETs returned 200;
full test/build and authenticated visual verification were not rerun in this segment.
Historical bug status is unchanged. See the active-file-only section of the cleanup record.

Studio navigation design, 2026-09-15: the user approved a Canva-style icon-and-label
rail beside a searchable tool panel. The agreed scope and preservation rules are
recorded in [the Studio sidebar specification](../specs/2026-09-15-studio-tool-sidebar-design.md).
Written-spec review is pending under the brainstorming workflow. No application
source, catalogue data, build output or permissions changed in this design segment;
no test/build or rendered-verification pass is claimed. Historical bugs remain unchanged.

Studio navigation implementation follow-up, 2026-09-15: the user confirmed the
written spec. The editor now uses an icon-and-label rail, contextual card-layout
and upload search, real authorized media previews, a collapsible desktop library
and a keyboard-managed narrow-screen sheet. Existing catalogue callbacks,
permission checks, online-cover saving and ERP scheduling were retained. See
[the completed implementation plan and evidence](../plans/2026-09-15-studio-tool-sidebar.md).

**STUDIO-SIDEBAR-001 (resolved in this segment):** Hiding the left resize gutter
removed an auto-placed grid child and shifted the canvas into the zero-width
second column. At 375px, computed columns were `72px 0px 303px 0px 0px` but canvas
width was only 60px from padding overflow. A single-variable runtime probe
pinning the canvas to column 3 restored 303px; reverting the probe reproduced
the failure. Explicit rail/gutter/canvas/properties column and row placement
fixes the cause. The added browser regression failed before the fix and passed
afterward. Temporary probe instrumentation was removed.

Fresh final checks: frontend 48 files/290 tests pass; TypeScript and lint exit 0;
seven actual Next-editor browser tests with labelled illustrative GET fixtures
pass at 375/768/1024/1280/1440px, including visible full-width canvas after
collapse, search, keyboard resize/reset, modal focus/Escape, Thai labels and
existing restricted-account controls. Fixtures recorded zero catalogue writes
and zero console/page errors. Screenshots and browser artifacts are in the
user's Temp directory, listed in the plan. This does not verify live sign-in,
ERP freshness, real media authorization or upload/publish/export delivery.
No backend test or production build was run in this UI segment; the active
Next `.next` directory was not replaced and services were not restarted.
No unrelated source/data files were deleted. Other historical bug statuses and
severity counts below remain unchanged; no platform-wide release claim is made.

Unused-UI cleanup, 2026-09-15 (completed bounded source cleanup): the user authorized
removing unused UI code. A fresh framework-entry/import audit found all 133
runtime frontend source files reachable from 48 Next entries, with no unresolved
local imports. No whole UI component or route file was safe to delete.

Removed 274 unreachable local CSS-module selectors and two permanently false
`@media not all` blocks from seven stylesheets: admin management, public
catalogue, Studio, catalogue preview, dashboard, login and promotions. Dynamic
status/carousel class prefixes, global styles, active shared product-card styles
and all runtime TypeScript were preserved. Retained parsed CSS across all 19
stylesheets matches the pre-cleanup canonical hashes; each cleaned file also
matches its expected transformation exactly. Source size decreased by 35,583
bytes. No dependencies, build output, backend source or customer data was deleted.

Recovery copies and before/after audit evidence are outside the repository at
`C:/Users/GMS/AppData/Local/Temp/gms-ui-cleanup-c9ca1932b2094f0a82846e63cae1b0d6/`.
Original copies were checked against the current files before editing. The
baseline frontend run passed 48 files/290 tests. The fresh post-cleanup run also
passed 48 files/290 tests; TypeScript and lint exited 0. Thirteen Chrome checks
passed: seven actual Next Studio tests with illustrative read-only GET fixtures
at 375/768/1024/1280/1440px (including Thai and restricted-account controls), plus
six static cover-component tests. This is bounded UI evidence, not live account,
ERP, upload, publish or export verification, nor an audit of every rendered page.

An isolated Next.js webpack production build exited 0, compiling and generating
34 static pages; dynamic routes were also included in the build output. It used
an exact scratch copy of the current frontend source and existing dependencies,
with the current environment loaded without logging its values. The active
frontend `.next` was not replaced and neither service was restarted. Default
Turbopack build and backend/migration tests were not rerun for this CSS-only change.
The final audit reconfirmed unchanged runtime TypeScript and retained CSS across
all 19 stylesheets. Detailed command outputs and setup limitations are recorded
in `verification.json` in the recovery directory. No release-ready claim is made;
historical defect statuses are unchanged by this source cleanup.

Catalogue-viewer sidebar design, 2026-09-15: the user confirmed the supplied
Melon screenshot's full-height dark-green sidebar, logo/search at the top and
scrollable categories with counts and active highlights for all catalogues.
The bounded scope includes internal previews, public share-link viewers and
Studio previews, excluding dashboard and editor navigation. Existing action
placement, product cards, pricing, permissions and ERP scheduling are protected.
See [the viewer sidebar specification](../specs/2026-09-15-catalogue-viewer-sidebar-design.md).
The user approved implementation with “make it for all the catalogue”. Shared
navigation is implemented across the three viewer families. Baseline viewer
tests passed 30/30. A focused public-viewer test failed because sidebar search was
absent; a Studio test failed because selected sections had no current-state.
The first integrated run passed 32/32. Read-only review exposed partial-observer
highlighting and booklet wheel capture; focused red/green checks now pass42/42
and wheel2/2. A settled screenshot also reproduced a short-final-section highlight
edge; its red/green browser test passes after expanding the observer band.
The first full302-test gate failed two unchanged editor timing checks under
concurrent build load; identical retry passed302/302 without concurrent build.
Strengthened browser checks then reproduced stale observer scores at1024px:
both scores stayed above a notification threshold, so cached ratios did not
refresh. The final shared hook reads current section geometry on frame-coalesced
scroll/resize and observer callbacks. Focused red/green tests pass43/43; Chrome
checks pass30/30 on final source, with TypeScript/lint clean and independent
focused43/43/source review. Final full frontend suite passed49files/303tests,
exit0,118.79s. Refreshed isolated Next16.2.12 webpack build passed, compiled4.5s,
type19.1s,34static pages plus dynamic routes; running frontend `.next` unchanged.
Final source hashes match the tested/reviewed snapshot. See the completed
[implementation plan](../plans/2026-09-15-catalogue-viewer-sidebar.md) for exact
gates, failed intermediate checks and recovery evidence. Browser fixtures are
illustrative GET-only; live login/ERP/download generation, cross-browser,
backend/migrations and measured performance were not verified. Completion is
limited to the approved sidebar change, not platform-wide release readiness or
ERP real-time stock. No services/dependencies restarted or installed; dashboard,
editor and root progress.md preserved.
Historical defect statuses remain unchanged.

Database backup,2026-09-15: at the user's request, the configured local SQLite
platform database `backend/.local/catalogue_demo.db` was backed up using SQLite
online backup from a read-only pinned snapshot. New file:
`backend/backups/database/catalogue-db-20260915-103027-UTC-39758654.sqlite3`,
542859264bytes, SHA256
`e4b5e17ea5a12f28859a664bd2a2dc98361215ed1283d3846f12c2f7c8413afc`.
The backup command exited0; full integrity_check returnedok, all82 user-table
counts matched the same source snapshot and foreign_key_check returned0violations.
Adjacent metadata/checksum files were created, and saved-file PowerShell hashing
matched. Live rows, ERP, uploads, configuration, services and existing backups
were not changed. This is a direct local SQLite artifact, not a BackupJob/UI
integration change (the existing admin backup implementation supports PostgreSQL).
No live restore was performed; ERP server, uploaded binaries and environment
secrets are excluded. No app code changes or platform-wide readiness claim.
Independent saved-copy verification completed on2026-09-16: three read-only
checks exited0, full integrity_check returnedok, all82 table counts matched
metadata, and file size/SHA256 matched metadata and the checksum sidecar.
Verdict: confirmed for the saved2026-09-15 snapshot, not a live restore test.
The interrupted earlier verifier is not counted as evidence. Exact commands
and results are in the task's OS Temp directory
`gms-db-backup-079ed4fb934a43f887b7c8edef329cc8/research.md`.
Historical defect statuses remain unchanged.

Stock mismatch diagnosis, 2026-09-16 (read-only): user reports catalogue stock
differs from ERP; affected product, quantities, warehouse and unit not yet supplied.
Selected local SQLite reads exited0 at03:20:10UTC. Latest automatic source sync
completed03:18:39UTC, 23126 products matched, 61 stock values updated, 0 errors;
last four runs took261-268seconds. Worker then waits180seconds, so the configured
interval is not a guarantee of new stock every3minutes. Viewer refresh180seconds
is separate. Existing ERP SELECT for8 previously discussed products exited0 at
03:21:27UTC; all8 local totals matched current signed all-warehouse ERP totals.
This did not reproduce the user's browser mismatch or verify every product.
Code-derived additional risk: negative warehouse sums are discarded by the
nonnegative decimal parser and totals are converted to integers; none of the8
sample products had negative warehouse sums, so this is not the demonstrated
cause. Catalogue snapshot rendering overlays current product stock in commerce.py.
No stock values, ERP records, application code, configuration or services changed;
no forced sync or restore. Exact scripts, hypotheses, outputs and limitations are
in OS Temp `gms-stock-diagnosis-56bd52f4d2d8495f949490b16480f497/investigation.md`.
Await affected product code/ERP stock screenshot (warehouse/unit) and catalogue
quantity before cause-specific diagnosis or any requested fix. Historical defect
statuses and severity counts remain unchanged; no platform-wide correctness claim.

EGA M1 warehouse follow-up, 2026-09-16: affected image identifies product18495,
barcode8850000184956, ERP143206, card stock1907. Existing ERP read-only SELECTs
exited0 at03:26:00,03:26:43,03:27:29UTC (latest10:27Bangkok). Same stock unitPCS,
Fraction1. Confirmed stock-calculation defect: ProductOnhand records span2018-2026
and repeated annual opening balances; production warehouse query filters product
only, so all-year sum1907 includes historical carry, not currentyear stock.
BalanceYear2026,Periodno0-9 signed sums: FIX24(blockedY,DefectY),S12213=9
(blockedN,DefectN),all-warehouse total33,unblocked/nondefect subset9. Annual
closing totals799+694+232+24+26+33+33+33+33 reconcile exactly to1907. Current
local mirror1907 matches source all-year aggregate and image, with fresh sync
timestamp03:24:09UTC; stale rendering/unit conversion/negative warehouse clipping
do not explain this specific discrepancy. Shared query and manual ERP import both
lack year/period scope. Proposed correction needs authoritative ERP fiscal/as-of
and allowed-warehouse policy before implementation;9 is the observed subset,
not a verified reservation-adjusted available-to-sell balance. No code fix,
stock edits, forced sync, ERP writes, configuration/service changes or broad
product reconciliation. Exact SQL/scripts/results are in the existing stock
investigation scratch log. Prior general diagnosis is superseded for this
identified product; historical defect statuses/severity summary remain unchanged.

Current-stock correction and rollout, 2026-09-16: after explicit user approval,
both the automatic product batch and manual/import ERP queries were changed to
the ERP server's current calendar year and periods0-current month, excluding
Warehouse rows flagged blocked or Defect (Y/1/T). Signed warehouse adjustments
are now preserved by the stock-specific aggregation path; price and dimension
validation is unchanged. Query contract TDD first failed2/2 with historic1907
instead of9, then passed2/2. The stronger signed-total test first failed because
the production total helper was absent and then passed3/3. Final backend gate:
36 passed,1 skipped,exit0. Frontend source was unchanged; same-turn TypeScript,
lint,49-file/303-test and Next16.2.12 production-build gates passed.

Production automatic run ec4bcaa8-ad70-4f7d-95b3-d7e51e0e16ea completed
04:12:47UTC:23127 rows read,584 stock values updated,0 errors,lock released.
The regular worker's next run887bb3c3-50a2-46cc-9964-16fb8d172aa7 completed
04:16:01UTC:23127 rows read,8 stock values updated,0 errors,lock released.
Fresh read-only reconciliation after that run against the same ERP predicate:
23127/23127 products match,0 mismatches;13835 have current stock rows and products
without rows resolve to0. EGA product18495/barcode8850000184956 now shows9 from
unblocked/non-defect S12213. Four exact signed current totals are negative
(minimum-1354) and are preserved rather than inflated. The shared public
catalogue path overlays published snapshots with `Product.stock_quantity`; a
runtime Glink response exposed stock for all794 cards. No ERP write-back, price,
image, catalogue-content, permission or manual-stock overwrite was performed.
Two historical reload-orphaned run rows remain labelled running, but the newest
successful run is authoritative and no sync lock remains. Existing worker
cadence remains completed-run plus180seconds; this is corrected current-period
polling, not push/event real-time delivery. Full evidence is in OS Temp
`gms-stock-diagnosis-56bd52f4d2d8495f949490b16480f497/investigation.md`.

pgAdmin migration backup,2026-09-16: user requested a database backup that can
be migrated through pgAdmin. A consistent SQLite online snapshot was created at
`backend/backups/postgresql-migration/catalogue-pgadmin-20260916-043417-UTC/`
and validated: integrity_checkok,0 foreign-key violations,82 tables,1255030
rows,Alembic0031. The snapshot was migrated into disposable PostgreSQL17.10 and
exported as portable custom-format `catalogue-pgadmin.backup` with owner/ACL
omitted and compression9. Primary dump size57161342bytes,SHA256
`025940ae1bd38e46aadf740a2356742e754ed9216f775077e3d04709cee4800e`.

The exact dump was restored into a second empty PostgreSQL database with
pg_restore exit0. Verification found82/82 tables,1255030/1255030 rows,0 count
mismatches,193 validated foreign keys,0 unvalidated constraints,0 sequence
issues,Alembic0031 and product18495 stock9. pg_restore archive listing exited0
with632 entries; saved dump and source-snapshot SHA256 values were rechecked.
Manifest,checksum file,source snapshot,migration report,restore report and
pgAdmin instructions are bundled. The database backup intentionally excludes
upload/media directories and environment secrets; existing SECRET_KEY must be
preserved to decrypt stored ERP settings.

During the drill, a clean `alembic upgrade head` reproduced70 tables instead of
the registered82 because `erp_models` and `platform_models` were absent from
Alembic environment imports. Focused integration test first failed listing the
12 missing operational tables, then passed after the minimal registration fix
in `backend/alembic/env.py`. Final backend gate:37 passed,1 skipped,exit0. The
temporary PostgreSQL server was stopped and its checked workspace scratch path
removed; existing PostgreSQL services/databases and the live SQLite source were
not modified or stopped. Frontend behavior/source was not changed by this
database migration segment.

Full-platform migration backup,2026-09-16: user clarified that the backup must
cover the entire platform. Created
`backend/backups/full-platform/gms-catalogue-platform-full-20260916-065018-UTC.zip`:
2530757758bytes,SHA256
`4aa816266a937bb07439ecede129080027c2c0ed907326179bc698943bf499e6`,38112
entries,2886382440 uncompressed bytes. It contains the restore-tested PostgreSQL
and SQLite fallback package,backend/frontend source,Alembic and SQL migrations,
dependency manifests,deployment/config templates,tests,docs,37173 uploaded
product images(2070604550bytes),488 private media/cover files(208770066bytes)
and frontend static assets. Full ZIP read-back returned no bad CRC entry,0
required-file gaps,0 forbidden secret/cache/dependency entries; embedded and
external manifests match and the embedded PostgreSQL dump SHA256 matches the
independently restore-tested file. External restore instructions,manifest,
verification report and checksum sidecar are adjacent to the archive.

Live `.env` files,secrets,Git metadata,node_modules,virtual environments,Next.js
build output,caches,logs,temp files and earlier backups are excluded by design;
existing SECRET_KEY must be retained separately and dependencies rebuilt from
lock/requirements files. The live platform,ERP and uploaded media were read but
not stopped or modified. No new application behavior was introduced by this
artifact-only segment.

PostgreSQL activation,2026-09-16: the user supplied a local PostgreSQL endpoint
on port5433 and requested the application connection. Read-only discovery found
that this exact server initially contained neither the requested
`catalogue_management` database nor the `catalogue_user` login, so no existing
target data was overwritten. Both were created and the previously verified
custom-format migration backup was restored into the empty database with
owner/ACL metadata omitted. `pg_restore` exited0. Post-restore checks as the
application role returned82 public tables,Alembic
`0031_online_catalogue_cover`,23127 products,product18495 stock9,193 foreign
keys and0 invalid constraints.

`backend/.env` now uses the PostgreSQL psycopg connection on port5433 with
`AUTO_CREATE_TABLES=false` and the existing `SECRET_KEY`/`SEED_DEMO_DATA=false`
preserved. Application-level Alembic reported the PostgreSQL context and head
revision; SQLAlchemy connected as `catalogue_user` to `catalogue_management`
and counted23127 products. A temporary API boot with ERP/export workers disabled
returned HTTP200 from `/api/health` with `database=connected`; the verification
process was then stopped. The normal platform was subsequently started cleanly,
including the dedicated180-second ERP worker and export worker, and the live
port8000 health endpoint returned HTTP200/database connected. No SQLite source,
ERP source records,uploads or catalogue content were deleted. Credentials remain
only in the ignored local environment file and are not recorded in this register.

Port80 and ngrok routing correction,2026-09-16: user requested moving the
frontend from port3000 to80 after ngrok returned502. Baseline probes reproduced
the failure: port80 closed while3000/8000 returned HTTP200. Configuration trace
also found that browser code embedded `127.0.0.1:8000`, which would direct a
remote user's browser to that user's own machine even after changing only the
frontend port. A focused relative-API test first failed with `TypeError: Invalid
URL`; the public port verifier first failed because port80 was unreachable.

The launcher now defaults to port80. Browser API traffic uses same-origin
`/api`; a Next.js fallback rewrite sends non-frontend API routes to the internal
FastAPI URL while retaining the existing Next API routes. Server rendering uses
`INTERNAL_API_URL`. Local/example/Compose settings,public origin,CORS and user
docs were aligned; Docker maps host80 to internal Next3000. Ngrok diagnostics
then exposed a separate stale target of `http://localhost:3000`; after restart
they reported `http://localhost:80` on the same public domain.

Verification: focused test1/1 passed; full frontend50 files/304 tests passed;
TypeScript,ESLint and Next16.2.12 production build exited0; build generated34
static pages. The retained public-seam script returned frontend HTTP200 and
same-origin API/database healthy on port80, while port3000 was closed. A Node
HTTPS probe through the ngrok domain returned HTTP200 for `/login` and
`/api/health`, with API statusok/database connected. No backend database,
catalogue,price,stock or ERP source records were changed. Full investigation
evidence is in ignored scratch file
`.local/investigations/port80-ngrok-20260916.md`.

PostgreSQL Price Management correction,2026-09-16: the live Brand price
mapping screen showed a generic error, no brands and0 customer levels even
though PostgreSQL contained145 brands,8 price lists,7 ERP price levels,9
audience types and129425 ERP product/customer price rows. Read-only endpoint
isolation found that the initial all-or-nothing page load failed only at the ERP
product price matrix. PostgreSQL rejected `SELECT DISTINCT products.id ...
ORDER BY products.sku` because the ordered SKU was absent from the selected
columns; SQLite had accepted the same query and masked the migration defect.

A PostgreSQL-only integration regression first failed with
`InvalidColumnReference`, then passed after the matrix query selected SKU
alongside product ID while preserving ID-first `scalars()` results, stable SKU
ordering, filtering and pagination. The existing inaccessible stale API
listener on internal port8000 could not be stopped by process ID, so the local
launcher, proxy environment and diagnostics now consistently use internal
port8001; the user-facing frontend and same-origin API remain on port80.
Read-only Chrome verification at `/dashboard?view=pricing` showed brands and9
customer levels with no generic error, and all9 initial pricing requests
returned HTTP200. Backend gate:37 passed,2 skipped; frontend gate:50 files/304
tests, TypeScript, ESLint and Next production build passed. Port80 frontend/API
and internal API/docs health checks returned HTTP200. Full investigation
evidence is in OS Temp
`gms-pricing-investigation-20260916/investigation.md`.

ERP connection confirmation,2026-09-16: user requested connecting the live
platform to ERP. The saved ERP connector was already configured and enabled.
An authenticated live connection test returned HTTP200/connected in52.45ms
and discovered462 source tables with23144 products; no credentials were
printed or changed. The latest completed scheduled synchronization processed
all23144 products with0 errors. A newer180-second worker cycle was already in
progress and advanced from10500 to13000 processed rows with0 errors during
observation, so no duplicate manual synchronization was started. The
connection test updated only the platform's test status and audit record; no
ERP source data was modified.

Published catalogue image routing correction,2026-09-16: product-card images
were present in `backend/uploads` and returned HTTP200 from the internal API,
but the same `/uploads/*` paths returned404 through the public port80 frontend.
The port migration had proxied `/api/*` only, while published catalogue cards
correctly continued to use same-origin stored-media paths. Live Chrome
reproduced the first card with `naturalWidth=0` and eight sampled image
requests returning404. A focused proxy regression then failed1/1 before the
fix because no `/uploads/:path*` rewrite existed.

Next.js now forwards `/uploads/:path*` to the configured internal backend
origin alongside the existing API proxy. The identical regression passed1/1;
the identical published-catalogue browser check loaded the real first image at
800x800 and all eight sampled media requests returned HTTP200. Frontend gate:
51 files/305 tests, TypeScript, ESLint and Next production build passed. No
image records, image files, catalogue content, ERP records or pricing data were
modified. Evidence is in OS Temp
`gms-catalogue-image-investigation-20260916/investigation.md`.

EGA catalogue card theme,2026-09-16: the published EGA catalogue previously
received the generic brand-hash palette, which rendered its product cards pink.
The centralized ERP product-card theme resolver now recognizes `EGA` and
`EGA Catalogue` and returns an EGA-only bright-green framed palette: accent
`#65F58A`, strong `#087A3D`, surface `#EAFFEF`, border `#159447`, and text
`#073B22`. Card structure, images, actions, stock, prices, and every non-EGA
catalogue remain unchanged.

A focused regression first failed against the old pink palette and passed after
the scoped resolver change. Public ngrok checks at desktop 1440x1000 and mobile
375x812 confirmed the exact five CSS variables, retained framed variant, loaded
800x800 product image, and no page-level horizontal overflow. Backend gate:
38 passed,2 skipped. Evidence is in OS Temp
`gms-ega-green-theme-20260916/investigation.md`.

Published catalogue toolbar title cleanup,2026-09-16: the catalogue name was
shown twice on desktop, once in the persistent sidebar and again beside the GMS
brand in the top toolbar. Both traditional and Studio-backed public viewer
branches now omit only the toolbar copy; sidebar/mobile identity, document
title, cover title, footer, language, PDF/print actions, catalogue content and
responsive behavior remain unchanged.

The focused public-viewer regression failed first on the previous toolbar
`<strong>` and passed after the two scoped removals (14/14). Public ngrok
checks at 1440x1000 and 375x812 confirmed one sidebar title, zero toolbar-title
matches, loaded 800x800 first product image and no horizontal overflow. Visual
inspection confirmed the desktop header now contains only the GMS brand and
utility actions; the compact mobile catalogue identity remains intentional.
Frontend gate:51 files/306 tests,TypeScript,ESLint and Next production build
passed. One unrelated Studio test timed out only during the initial parallel
gate, then passed in isolation and in the subsequent standalone full-suite run.
Evidence is in OS Temp
`gms-public-header-title-removal-20260916/evidence.md`.

| Severity | Count | IDs |
|---|---:|---|
| P0 | 0 | — |
| P1 | 3 | QA-001 (unverified critical), BUG-012 (redundant scheduler), BUG-013 (no version control) |
| P2 | 6 | BUG-003, BUG-009, BUG-010, BUG-011, I18N-001, (BUG-004/005 pending live re-confirmation, listed as resolved) |
| P3 | 5 | BUG-006, BUG-007, BUG-008, BUG-014, QA-002/003/004 (resolved) |

## Workspace source organization, 2026-09-25

The shared VS Code configuration now hides generated dependencies, caches,
uploads, reports and local runtime data from Explorer and search. Component
tests and CSS modules are nested below their source files. The catalogue
management workspace and cover editor were moved together into
`frontend/src/features/catalogues`; the Next.js dashboard route remains in
`frontend/src/app/dashboard`, so public URLs are unchanged.
`docs/CODE_STRUCTURE.md` records the verified source boundaries and common
catalogue change locations. This is a behavior-preserving source organization
change.

## Generated cover logo background, 2026-09-25

Logo-style cover artwork with a black image background previously rendered as
an opaque black rectangle over the generated green catalogue cover. The cover
artwork now uses screen compositing against the existing green gradient, and
its parent no longer isolates that blend from the cover background. Black logo
pixels therefore inherit the green cover while white logo artwork remains
white. Uploaded online-cover artwork and catalogue content are unchanged.

The browser regression was observed failing first at 375px and 1440px. It now
checks the computed blend, samples the rendered black-background pixel as
green, samples a logo stroke as white, checks containment and horizontal
overflow, and passes at both viewports. The live Nubwo cover asset was also
rendered at both widths; an element capture confirmed the complete white logo
on green without the black rectangle.

## Catalogue purchase-order status labels, 2026-09-25

The catalogue purchase-order adapter was already connected to
`POListApi&id=` and correctly aggregated matching ERP item codes, but product
cards displayed only ambiguous quantities such as `2,000 / 0`. Cards now show
the active API status with its quantity, for example `In Transit 2,000` or
`Ordered 500`, and omit inactive zero buckets. Products with no matching API
row continue to show an em dash; no purchase-order state is fabricated.

The formatter regression failed first against the numeric-only presentation
and passed after the change (9/9). The backend API adapter contract passed
3/3. A live request returned 369 active rows and 26 matching Nubwo products;
the current response contained only `In Transit` statuses. Browser checks of
live Nubwo item `27224` showed `In Transit 2,000` at 1440x900 and 375x812 with
no horizontal overflow.

## Shopee online-price marker, 2026-09-25

Catalogue product cards now place the supplied Shopee mark immediately beside
the Online price label. The compact 14px asset preserves the existing neutral
card layout and identifies the marketplace without changing ERP price values.
The component regression was observed failing before implementation and now
asserts the accessible Shopee image and its shared branding asset. Live browser
checks confirmed the asset loaded at 14x14px beside Online price at 1440x900
and 375x812 without changing the 36px fact-row height.

## Generated cover background-logo format, 2026-09-25

Generated catalogue covers now treat either the uploaded brand logo or the
saved legacy cover artwork as one oversized translucent background watermark.
The previous separate foreground image block was removed. Title, Explore
action and product-count content remain above the artwork, while mobile uses a
quieter crop to preserve readability. Two focused regressions were observed
failing first and now cover both brand-logo and legacy cover-asset inputs.

Live DOM verification confirmed the current Nubwo catalogue selects the
`background-watermark` layout. A deterministic browser fixture then verified
the composited cover at 375px and 1440px: a brand logo takes precedence over a
legacy cover image, only one decorative image is rendered, the cover clips the
oversized artwork, and no horizontal overflow is introduced.

No P0 was found in this pass — every automated gate that could be run in the disposable sandbox is green or has a known, scoped, non-catastrophic issue. This is **not** the same as "ready for production": see the Release Checklist for everything this pass could not verify (live services, real ERP, real database scale, browser/visual/device checks, backup/restore drill).
