# Studio Tool Sidebar Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved Canva-style Studio sidebar without changing catalogue business behavior.

**Architecture:** A bounded `StudioToolSidebar` owns rail presentation, secondary navigation and responsive focus handling. The existing editor retains panel state, data and insertion callbacks. One sidebar stylesheet owns rail/library/workspace layout; a centralized EN/TH copy module owns new labels.

**Tech Stack:** React 19, Next.js 16, TypeScript, CSS Modules, Vitest/Testing Library, existing Playwright/Chrome.

## Global Constraints

- Follow `docs/specs/2026-09-15-studio-tool-sidebar-design.md`, confirmed in chat.
- Preserve existing APIs, permission gates, save/undo/publish/export, online-cover flow and 180-second ERP scheduling.
- Do not delete user data or unrelated files, install dependencies, start services or initialize/commit Git.
- Work in place: no Git repository exists and no native isolation is available. Root `progress.md` belongs to unrelated work; track this plan here instead.
- No unresolved product decisions. Browser evidence must disclose any fixture-only or unauthenticated scope.

---

### Task 1: Navigation and responsive library

**Files:** Proposed `studio-tool-sidebar.tsx`, `studio-tool-sidebar.module.css`, `studio-tool-sidebar.test.tsx` under `frontend/src/app/catalogue-studio/`; proposed `frontend/src/lib/studio-sidebar-copy.ts`.

**Interfaces:** Controlled `activeTab`, `onSelectTab`, `collapsed`, `onCollapsedChange`, permitted main/secondary tabs and React children. Produce an icon/label rail with persistent library contents and a focus-managed narrow-screen sheet.

- [x] Add tests for selecting a permitted tool, retaining uncontrolled input state after collapse, reopening from the rail, secondary tool selection, restricted tabs and Thai labels; record expected red before implementation.
- [x] Implement six primary tools plus More tools, SVG icons, localized headings/collapse/search labels, sheet dismissal/Escape/focus return and keyboard focus containment.
- [x] Run `npm.cmd test -- src/app/catalogue-studio/studio-tool-sidebar.test.tsx --maxWorkers=2`; require zero failures.

### Task 2: Searchable real libraries

**Files:** Proposed `studio-media-library.tsx` and its test beside the sidebar; modify existing `product-card-template-gallery.tsx`, add its focused test.

**Interfaces:** Media consumes authorized `StudioAsset[]` and existing `onAdd(asset)` callback; gallery consumes its existing authorized template props/callbacks. Produce local contextual search, actual image/template previews, explicit empty/no-results states and clear-search restoration.

- [x] Add and observe failing tests for case-insensitive media/template filtering, clearing a search, selecting the correct original asset/template and image failure fallback.
- [x] Implement local search without catalogue writes or new API/dependency; preserve gallery permissions and all existing callbacks.
- [x] Run the identical focused files and require green.

### Task 3: Editor integration and layout ownership

**Files:** Modify `studio-editor.tsx`, `studio.module.css`, `studio-editor.test.tsx`; reuse sidebar CSS workspace rules.

**Interfaces:** Map the existing nine `EditorPanelTab` values, keep existing panel contents and permission-filtered tools. Total desktop sidebar width defaults to 348px and clamps to 292-460px; collapse uses a 72px rail and removes its resize gutter. Below 1280px use a dismissible library sheet.

- [x] Update navigation expectations for approved label changes; add a failing collapse/reopen assertion preserving product search and no page writes. Existing selection regression tests remain in the editor suite.
- [x] Replace the old launcher with the controlled sidebar, retain existing insertion handlers, add the media library, remove unused launcher metadata/styles and replace old sidebar grid ownership.
- [x] Verify targeted editor/sidebar/media/gallery tests, pointer/keyboard resize contracts and permitted-tab tests.

### Task 4: Verification and handoff

**Files:** Proposed `frontend/e2e/overlap/studio-sidebar-render.spec.ts`; update this plan, approved spec status and `docs/stabilization/BUG_REGISTER.md`.

- [x] Freeze render checks: reference fidelity, rail/library separation, heading/search readability, real-data integrity, desktop/mobile containment, keyboard focus, correct active tool, collapse/dismiss and reduced motion.
- [x] Run full frontend tests with two workers, `npx.cmd tsc --noEmit --incremental false`, `npm.cmd run lint`; record exact results.
- [x] Exercise existing configured Playwright/Chrome without server start or catalogue mutations; keep reports/screenshots outside the repository. Actual Next editor behavior was exercised with illustrative GET fixtures, not live authenticated ERP data.
- [x] Perform bounded structural review of component state, callback flow and CSS ownership. Disclose untested authenticated flows and any production-build limitation caused by the active `.next` session.
- [x] Record evidence and task completion here; no Git commit or branch-integration action is authorized.

## Evidence ledger

- Task 1: complete. Navigation test red: 6 expected missing-control failures; identical command green: 6/6.
- Task 2: complete. Library test red: 5 expected missing-search/render failures; identical command green: 5/5.
- Task 3: complete. Product-search collapse test red: missing collapse control; identical command green: 1/1. Combined editor/sidebar/library tests: 4 files, 63/63 passing, 70.25s. Existing 51-test editor baseline passed before changes.
- Task 4: complete within the recorded UI verification scope. External/backend/production-build limitations remain explicitly disclosed below.
- Fresh full frontend suite: 48 files, 290/290 passing, 121.44s. Typecheck/lint exit 0. Initial browser fixture checks passed 7/7 after correcting ambiguous status queries and testing the cover's existing disabled (not hidden) permission control.
- Visual review exposed a stronger canvas regression: hidden left gutter removed an auto-placed grid child. At 375px the grid columns were `72px 0px 303px 0px 0px`, canvas column `auto`, rendered width 60px (padding overflow). Added symptom-specific browser width/visible-canvas assertions: red exit 1, received 60 vs >295. Single-variable runtime probe assigning canvas column 3 restored width 303; restoring auto reproduced red. This rules out missing data/Konva loading as the cause. Permanent fix explicitly places the rail, gutters, canvas and properties in their columns/row; temporary probe removed. Identical regression and full checks pending.
- Canvas regression green: identical 375px command passed 1/1, 6.2s. Final expanded browser run passed 7/7, 28.5s, including actual visible canvas/full-width collapse and desktop keyboard resize/reset. Zero catalogue writes and zero console/page errors in these isolated fixtures. Final TypeScript/lint commands exited 0. Post-fix full frontend suite is still running.
- Final post-fix full frontend suite: `npm.cmd test -- --maxWorkers=2`, exit 0, 48 files and 290/290 tests, 127.90s. Final `npx.cmd tsc --noEmit --incremental false` and `npm.cmd run lint` each exit 0. All plan items are complete; changes remain in place without a Git or service-management action.

## Render direction and frozen critique gate

- Keep the reference's 72px icon/label rail, separate white library, contextual search and square two-column media previews. Do not imitate unsupported stock-photo tabs, premium badges or decorative content.
- Inherit the existing editor type family. Titles 17px/1.3; help/search text 12-13px/1.5; rail labels 11px/1.3. Spacing uses 4/8/12/16px; library controls 8px corners; close control 44px square.
- Surface #FFFFFF, rail #F7F9F8, text #19382A, muted #52685B, active #126B3A on #E8F5EC, input border #81988A. Calculate contrast and verify focus/labels in the rendered browser, not only screenshots.
- Gates: no unintended document overflow at 375/768/1024/1280/1440px; 72px rail persists; sheet header/dismiss controls stay in view; desktop library and canvas are separate; selecting/navigation/search/collapse never writes catalogue pages; modal Tab loop and Escape work; English/Thai labels remain readable; no new console errors; reduced motion is respected.
- Fixture-only browser renders must visibly name the catalogue as illustrative, intercept GET data only and reject/count writes. They verify the actual Next editor component behavior and CSS, not authenticated ERP data or upload/publish/export delivery.

## Bounded structural review and limitations

- New `studio-tool-sidebar.tsx`, `studio-media-library.tsx`, `studio-sidebar-copy.ts`, sidebar CSS and the modified template gallery were read in full. Rail/modal state belongs to navigation; the editor still owns active tool, ERP product query/selection, widths and catalogue mutation callbacks. Collapse hides rather than remounts the content; secondary navigation only changes tabs. Media filtering dispatches the original authorized asset, not a reconstructed/filtered payload. Gallery filtering keeps existing permission-gated actions and adds an optional compact heading for the editor.
- Reviewed the affected editor state, width clamp/resize code, data-loading seams, complete sidebar integration and affected editor grid/launcher CSS sections. This is not a full structural/code audit of the large pre-existing editor or platform. No unrelated cleanup was attempted.
- One sidebar CSS module owns workspace columns and explicit child placement; obsolete launcher selectors/metadata and competing narrow editor grids were removed. Existing canvas/toolbar/properties styling remains in the original module. No new pass-through component or API was added.
- Computed contrast: primary text/white 12.80:1, muted text/rail 5.69:1, active green/selected fill 5.86:1, input border/white 3.09:1. English/Thai screenshots were inspected; icon labels wrap and a visible focus outline appears. Narrow canvas remains horizontally scrollable at existing zoom by design; the modal library intentionally layers over it until dismissed. Top-toolbar/mobile pricing-bar redesign is out of scope.
- Artifacts are outside the repository: `C:/Users/GMS/AppData/Local/Temp/gms-studio-sidebar-uploads-{375,768,1024,1280,1440}.png`, `gms-studio-sidebar-collapsed-{375,768,1024,1280,1440}.png`, `gms-studio-sidebar-thai-1280.png`; browser output directory `gms-studio-sidebar-playwright-verified-final`. All PNG captures are viewport width x 900px and explicitly illustrative. No static-only screenshot is represented as authenticated/live ERP evidence.
- No production build was run because the active Next development session shares `.next`; no service was restarted. Live sign-in, ERP freshness, real media authorization, upload, publish/export delivery and backend tests were not exercised by this UI segment. Existing frontend unit regressions cover their retained callback behavior, not external delivery.
- Fresh Git check still reports no repository. Worktree/merge/PR menus do not apply; no Git initialization, commit or external publication is authorized.
