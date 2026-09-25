# Next task

## Turn State

- State: `handed-off`
- Last move: `baton-pass`
- Last agent: `/root`
- Next agent: next Codex session or engineer
- Updated: 2026-09-21 20:02:56 +07:00

## Next

1. Run a minimal foresight check: compare this note with `git status`, the named source files, and the latest commit.
2. Confirm whether the next priority is ERP `Intransit / Order` integration or preparing the accumulated catalogue changes for commit/release.
3. For ERP purchase orders, implement separate `in_transit` and `ordered` quantities, where in-transit means shipped/container-dispatched and ordered means placed but not shipped; expose the display as `in_transit / ordered`.
4. Run the relevant backend smoke tests, frontend component tests, Playwright grid/mobile tests, and a production build.
5. Review generated cache/upload changes separately; do not bundle them into a source commit without approval.

## Immediate UI continuation

The last requested mobile-search-size change is complete. If revisiting it, start at `frontend/src/components/catalogue-sidebar.module.css` and the test beginning near line 67 of `frontend/e2e/overlap/catalogue-sidebar-render.spec.ts`.
