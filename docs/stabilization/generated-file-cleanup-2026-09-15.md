# Generated-file cleanup — 2026-09-15

Request: permanently remove confirmed junk and useless files without damaging the working platform.

## Result

Permanently deleted **201 existing files**, totaling **30,168,791 bytes (28.77 MiB)**,
after the user clarified that moving junk into recovery was not sufficient.
The initial recovery folder
`C:\Users\GMS\AppData\Local\Temp\gms-cleanup-20260915-78d342b1`
was inventoried, constrained to the original allowlist, and permanently deleted.
No recovery copy remains. These deletions cannot be undone from the project.

The previously quarantined 181 files (5,550,153 bytes) were:

| Category | Original project-relative paths | Files | Bytes |
| --- | --- | ---: | ---: |
| Compiled Python | `backend/app/__pycache__`, `backend/app/scripts/__pycache__`, `backend/app/workers/__pycache__`, `backend/tests/__pycache__`, `backend/alembic/__pycache__`, `backend/alembic/versions/__pycache__` | 158 | 3,454,325 |
| Root pytest metadata | `.pytest_cache` | 5 | 708 |
| Previous Playwright results | `frontend/test-results`, `frontend/playwright-report` | 2 | 520,476 |
| TypeScript incremental metadata | `frontend/tsconfig.tsbuildinfo` | 1 | 177,758 |
| Unreferenced diagnostic screenshot | `debug-studio.png` | 1 | 128,873 |
| Old development logs | Fourteen `.out.log`/`.err.log` files listed below | 14 | 1,268,013 |

The log pairs under `backend/` were `backend-card-design`, `backend-card-templates`,
`backend-card-theme`, `backend-current`, `backend-dev`, `backend-download-fix`,
and `uvicorn`. All were last written in August 2026 and no references were found
in the inspected application, scripts, or documentation.

Additional permanently deleted files:

| Category | Original project-relative paths | Files | Bytes |
| --- | --- | ---: | ---: |
| Obsolete sample/test exports | The ten August PDF/PNG diagnostics in `backend/test_outputs` | 10 | 24,411,021 |
| Unused documentation previews | `docs/checklist-page-14.png`, `docs/checklist-page-2.png`, `docs/checklist-page-7.png`, `docs/GMS_Catalogue_Platform_Function_Checklist_preview.png` | 4 | 206,530 |
| Inspected backend pytest metadata | `backend/.pytest_cache` | 5 | 1,086 |
| Unnecessary populated-directory placeholder | `frontend/public/.gitkeep` | 1 | 1 |

The exports were `draft-a4-landscape.pdf`, `draft-no-price-a4-landscape.pdf`,
`gms-complete-sample-catalogue-2026.pdf`, `historical-a4-landscape-v1.pdf`,
`pdf-parity-ceflar.pdf`, `preview-pdf-parity-check.pdf`, `preview-pdf-parity-check.png`,
`published-no-price-a4-landscape-v5.pdf`, `studio-5395550-v10-fresh-page1.png`,
and `studio-5395550-v10-fresh.pdf`. No application, test, script or inspected
documentation reference to these diagnostic input paths was found.

The empty `frontend/scripts` and `backend/test_outputs` directories were also
removed, only after confirming that they contained no remaining entries.

Native PowerShell deletion used validated exact absolute targets; reparse points,
unrecognized recovery items, changed recovery inventory and current diagnostic
files were rejected. The backend pytest cache needed a narrowly scoped sandbox
escalation; its five files and 1,086-byte inventory were checked before deletion.
No broad directory cleanup, ACL change or ownership change was performed.

## Source audit and preserved state

The import audit inspected 175 frontend TS/TSX/CSS files and 88 backend Python
files. It accounted for Next.js routes, tests, styles, workers and maintenance
commands. No unreachable candidate or byte-identical nonempty source file was
found. This is not proof that every function is needed; no application source
file was sufficiently established as disposable to delete it.

Before/after content digest for 328 application, test and migration source files:
`d9eee440b379d2de0765f7915f68a571a24334f257daa17cd48a3f00e21a03e0`.
The digest was identical before and after both cleanup passes, including after
verification. Temporary audit/deletion scripts and the scratch investigation log
were subsequently removed.

Both services were already running. Their processes were not stopped; `.next`
and its runtime caches were retained. Dependencies, uploads, public assets,
databases, backups, local runtime state, migrations, tests and authored documentation were
excluded from removal. All eleven checked protected directories remained present.
Backend PDF image caches were retained because they support existing catalogue rendering.
Authored manuals, presentations and their original deliverables were retained.

`backend/.pytest_cache` was initially access-denied, then safely inspected and
deleted with narrowly scoped escalation. This does not establish a general fix
for the historical Windows pytest-cache issue; no ACL or ownership was changed.

`.gitignore` now also excludes generated `*.tsbuildinfo` files, backend development
logs, regenerated `backend/test_outputs` files and the named documentation previews.
No dependencies or configuration contracts were changed.

## Fresh verification after cleanup

| Check | Result |
| --- | --- |
| `npm.cmd test -- --maxWorkers=2` in `frontend` | Exit 0; 45 files, 278 tests passed |
| `.venv\Scripts\python.exe -B -m pytest -q -p no:cacheprovider --disable-warnings --tb=short` in `backend` | Exit 0; 33 passed, 1 skipped, 982 warnings |
| `npx.cmd tsc --noEmit --incremental false` in `frontend` | Exit 0 |
| `npm.cmd run lint` in `frontend` | Exit 0; no diagnostics |
| HTTP GET `http://127.0.0.1:3000/login` | HTTP 200 before and after cleanup |
| HTTP GET `http://127.0.0.1:8000/api/health` | HTTP 200 before and after cleanup |

The skipped backend test requires explicit Studio design/version environment
variables for browser/PDF visual comparison. No such live comparison was run.
The test invocation disabled bytecode/cache writes to avoid recreating the cleaned
test artifacts. A running service may regenerate legitimate caches normally.

The initial default-parallelism frontend run after permanent cleanup exited 1:
277 tests passed, 1 failed. The first promotion test timed out at
`promotion-workspace.test.tsx:33`, waiting for the initial "New Year Savings"
list item while the DOM still showed "Loading promotions…". Deletion was not reached.
The unchanged focused test file then passed three consecutive times (7/7 tests),
and the full suite passed with `--maxWorkers=2` (278/278). Removed artifacts stayed
absent and source checksums stayed identical. This supports a timing/resource-load
explanation, but does not conclusively establish its root cause or fix the
intermittent default-parallelism failure. No assertion, timeout, or source was edited.

No production build or authenticated browser workflow was run during this
cleanup-only segment; application source was unchanged and the running build was
preserved. The checks above do not constitute a platform-wide release-readiness audit.

## Frontend/backend source-only follow-up

The user's subsequent request specifically targeted unwanted or unused frontend
and backend files. A fresh dependency audit separated production entry points
from tests and standalone CLI tools, rather than counting test imports as runtime use.

- Frontend: 48 framework entry points; all 129 non-test TS/TSX/CSS files were
  reachable through imports, exports, dynamic literal imports or stylesheet imports.
  No unreachable runtime candidate was found. The local TypeScript resolver was
  used for aliases and imports. The audit command exited 0.
- Backend: Python AST import analysis found all 71 non-package, non-CLI application
  modules reachable from `app.main` or workers. No unreachable module was found
  when maintenance entry points were included either. The corrected audit command
  exited 0; its initial scratch-script parenthesis typo did not affect application files.
- SQL bootstrap files remain documented in README; migrations remain required
  for existing installations. Standalone CLI helpers were distinguished from dead
  modules: lack of an API import is not evidence that a manual command is useless.
- The fourteen standalone CLI commands, authored tests, configuration, dependencies
  and application assets were retained. Optional demo-generation and legacy-import
  command removal needs a specific scope decision because it removes those capabilities.
- Fresh frontend login and backend health GET checks both returned HTTP 200.

No additional application source file was deleted or edited in this follow-up.
The temporary audit scripts were removed. Full test/build commands were not rerun
in this source-inspection-only follow-up; the earlier verification is historical.
Static reachability is not proof that every function or feature is used by people.

## Active-file-only clarification

The user requested keeping only presently used files after asking why the old
frontend remained visible. A fresh bounded inventory found no separate frontend
source tree or unused public asset: the dashboard imports its existing stylesheet,
the root stylesheet imports `tailadmin-theme.css`, and the branding/image helpers
reference both remaining public images. The ERP worker still imports
`legacy_product_sync`; its name does not establish that it is obsolete.

The remaining standalone legacy/demo commands were distinguished from unreachable
application modules. Some are documented manual tools, and deleting them removes
those capabilities. No additional source, data, asset or build files were deleted
in this clarification segment. Further tool removal needs an explicit scope choice.
Fresh GET checks of `/login` on port 3000 and `/api/health` on port 8000 both returned
200. Full test/build and authenticated UI checks were not rerun; no application
source was changed. The earlier dependency-audit counts and test results above
remain historical rather than newly executed evidence.
