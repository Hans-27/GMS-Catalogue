Plan: docs/plans/2026-09-15-online-catalogue-cover.md
Task 1: complete
Task 2: complete
Task 3: complete
Task 4: implementation and available verification complete; live-browser roundtrip pending service-start approval

Evidence
- Baseline frontend: 3 files, 64 tests passed.
- Baseline backend: 6 tests passed.
- Workspace has no Git metadata; worktree/branch operations are unavailable.
- Existing progress.md belongs to another task and is preserved.
- Local database backend/.local/catalogue_demo.db verified before additive upgrade; Alembic0031 is head and both cover columns exist. No existing cover data changed.
- Backend cover tests:11 passed, including PNG/JPEG/WebP exact original bytes, oversized/invalid retention, revision/permissions, immutable fixed links, password/signatures/revocation and pixel-identical PDF output.
- Browser static renders:6 passed in configured Chromium/Chrome, at375/768/1280px. Checks cover containment, navigation, overflow, focus and print fallback. Screenshots in Windows Temp, gms-online-cover-{studio,public}-{width}.png.
- Separate final source review: cover panel and public cover component own validation/preview and rendering/print fallback respectively. Parent editor owns permissions/revision/publishing. Existing printable page renderer is unchanged. No new dependency or server started.
- Final review regression: no-cover Studio catalogues retain their first product page; tested red then green. Cover-only publication does not issue an unnecessary page mutation; tested red then green.
- Render intent/checklist/review evidence: C:/Users/GMS/AppData/Local/Temp/gms-online-cover-design-review.md.
- Final verification on final production source: full Vitest45 files/278 tests passed; full pytest33 passed/1 skipped; Next production build and touched UI/test ESLint exit0. Final static browser6 passed. No commits/PR/branch operations possible or attempted (workspace has no Git metadata).
