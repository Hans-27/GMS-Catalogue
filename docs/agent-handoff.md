# Agent handoff rules

- Workspace: `C:\Project GMS\catalogue-main`; branch: `master`.
- Preserve the dirty working tree. Do not reset, restore, delete, or commit unrelated files without the user's explicit direction.
- Treat generated PDF-cache changes and uploaded catalogue-cover files as user/runtime data until their ownership is confirmed.
- Never place ERP/database credentials in source, tests, logs, screenshots, or handoff notes. Existing `.env` files are local and must remain uncommitted.
- Use `apply_patch` for source edits and run focused tests before broader verification.
- Frontend development port is `3000`; backend development port is `8001`; frontend API requests use the `/api` proxy.
- Read `docs/current-state.md` and `docs/next-task.md` before making changes.
