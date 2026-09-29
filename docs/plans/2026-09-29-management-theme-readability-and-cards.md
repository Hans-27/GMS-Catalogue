# Management Theme, Readability, and Catalogue Cards Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved readable management UI, device-local Light/Dark/System setting, simplified catalogue cards, and public-footer cleanup without changing public catalogue branding.

**Architecture:** A root client theme provider owns preference persistence and the resolved document theme. Shared semantic CSS variables drive authenticated management surfaces, while existing dashboard and settings modules retain layout ownership. Catalogue-card actions move into the existing overflow menu and card metadata is reduced to product count.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS Modules, Vitest, Testing Library, Playwright.

## Global Constraints

- Apply the typography and themes to authenticated management pages; do not restyle public catalogue branding.
- Use the modern system stack `Inter, "Segoe UI Variable", Aptos, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` without downloading a webfont.
- Body text uses weight 400; headings, labels, navigation, and controls use at most weight 500.
- Preserve existing routes, permissions, data loading, mobile navigation, and catalogue-link behavior.
- Catalogue cards keep product count, catalogue links, updated date, logo control, and overflow menu; remove persistent View online, Open Studio, Preview, version, and pricing elements.
- Do not commit because the shared working tree already contains unrelated user changes.

---

### Task 1: Persistent management theme

**Files:**
- Create: `frontend/src/lib/theme.tsx`
- Create: `frontend/src/lib/theme.test.tsx`
- Modify: `frontend/src/app/layout.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/app/tailadmin-theme.css`

**Interfaces:**
- Produces: `ThemeProvider`, `ThemeSelector`, `useTheme`, and `ThemePreference = "light" | "dark" | "system"`.
- Persists: `gms-management-theme-v1` in browser local storage.
- Applies: `data-theme="light|dark"` and matching `color-scheme` to `document.documentElement`.

- [ ] **Step 1: Add the focused failing test**

Test default system resolution, Light/Dark selection, persistence after remount, system media changes, and invalid/unavailable storage fallback.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test -- src/lib/theme.test.tsx`
Expected: non-zero exit because the theme module and controls do not exist.

- [ ] **Step 3: Implement the minimum behavior**

Create the provider and accessible pressed-state selector, install a pre-paint initializer in the root layout, and define light/dark semantic variables. Catch storage errors and subscribe to `prefers-color-scheme` only for the system preference.

- [ ] **Step 4: Verify the focused pass**

Run: `npm test -- src/lib/theme.test.tsx`
Expected: all theme behavior tests pass.

- [ ] **Step 5: Run the affected integration check**

Run: `npm test -- src/lib/i18n.test.tsx`
Expected: language persistence remains green.

- [ ] **Step 6: Record the passing checkpoint**

Record changed files and test output without committing the dirty shared worktree.

### Task 2: General Settings appearance control and readable management typography

**Files:**
- Modify: `frontend/src/app/admin/settings/settings-shell.tsx`
- Modify: `frontend/src/app/admin/settings/settings-shell.test.tsx`
- Modify: `frontend/src/app/admin/settings/settings.module.css`
- Modify: `frontend/src/app/dashboard/dashboard.module.css`
- Modify: `frontend/src/lib/management-translations.ts`

**Interfaces:**
- Consumes: `ThemeSelector` from `@/lib/theme`.
- Produces: labelled Appearance row with Light, Dark, and System buttons.

- [ ] **Step 1: Add the focused failing test**

Assert General Settings exposes an Appearance group, all three options, correct pressed state, and immediate document-theme change. Add dashboard CSS expectations only through rendered behavior and accessible controls, not source-text assertions.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test -- src/app/admin/settings/settings-shell.test.tsx`
Expected: non-zero exit because Appearance and theme buttons are absent.

- [ ] **Step 3: Implement the minimum behavior**

Add the settings row and helper copy. Update shared management typography to larger regular/medium roles, introduce semantic theme surfaces in dashboard/settings CSS, maintain focus visibility, and stack settings controls below 700px.

- [ ] **Step 4: Verify the focused pass**

Run: `npm test -- src/app/admin/settings/settings-shell.test.tsx`
Expected: Settings tests pass with theme selection behavior.

- [ ] **Step 5: Run the affected integration check**

Run: `npm test -- src/app/dashboard/dashboard-sidebar.test.tsx src/app/dashboard/dashboard-overview.test.tsx`
Expected: navigation and overview behavior remain green.

- [ ] **Step 6: Record the passing checkpoint**

Record changed files and test output without committing the dirty shared worktree.

### Task 3: Simplify catalogue cards and preserve actions in overflow

**Files:**
- Modify: `frontend/src/features/catalogues/catalogue-management.tsx`
- Modify: `frontend/src/features/catalogues/catalogue-management.test.tsx`
- Modify: `frontend/src/app/dashboard/dashboard.module.css`

**Interfaces:**
- Consumes: existing permission booleans, `onlineLinks`, `studio_editor_href`, `studio_preview_href`, and `router.push`.
- Produces: one product-count statistic and an overflow menu containing only available authorized actions.

- [ ] **Step 1: Add the focused failing test**

Assert no persistent View online/Open Studio/Preview/version/pricing controls render. Open the overflow menu and assert authorized destinations and Catalogue details are present; assert unavailable or unauthorized actions are omitted.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test -- src/features/catalogues/catalogue-management.test.tsx`
Expected: non-zero exit because persistent actions and extra statistics still render and overflow lacks the moved actions.

- [ ] **Step 3: Implement the minimum behavior**

Remove the two metadata spans and persistent action controls. Add View online, Open Studio, Preview, and Catalogue details to the existing menu with their existing permission, destination, target, and routing behavior. Reflow product count as one compact row.

- [ ] **Step 4: Verify the focused pass**

Run: `npm test -- src/features/catalogues/catalogue-management.test.tsx`
Expected: catalogue-management tests pass.

- [ ] **Step 5: Run the affected integration check**

Run: `npm test -- src/app/dashboard/page.categories.test.tsx`
Expected: dashboard catalogue integration remains green.

- [ ] **Step 6: Record the passing checkpoint**

Record changed files and test output without committing the dirty shared worktree.

### Task 4: Remove public footer version and verify the complete UI

**Files:**
- Modify: `frontend/src/app/c/[token]/public-catalogue-viewer.tsx`
- Modify: `frontend/src/app/c/[token]/public-catalogue-viewer.test.tsx`

**Interfaces:**
- Preserves: public catalogue title and footer structure.
- Removes: visible standard public catalogue version label only.

- [ ] **Step 1: Add the focused failing test**

Assert the standard public catalogue footer contains the catalogue title but no visible `Version <number>` text.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test -- 'src/app/c/[token]/public-catalogue-viewer.test.tsx'`
Expected: non-zero exit because the version label is still visible.

- [ ] **Step 3: Implement the minimum behavior**

Remove only the standard footer version node. Do not alter Studio-authored cover or product-card presentation.

- [ ] **Step 4: Verify the focused pass**

Run: `npm test -- 'src/app/c/[token]/public-catalogue-viewer.test.tsx'`
Expected: public catalogue tests pass.

- [ ] **Step 5: Run complete verification**

Run: `npm test`, `npm run lint`, and `npm run build` from `frontend`.
Expected: all commands exit zero. Then render General Settings and Catalogue Management at 375x812, 768x900, and 1280x800 in light and dark themes; verify hierarchy, consistency, responsive layout, content integrity, theme parity, focus, contrast, and horizontal overflow. Exercise theme selection and the catalogue overflow menu separately as behavioral evidence.

- [ ] **Step 6: Record the passing checkpoint**

Record changed files, test/build output, screenshot paths and dimensions, interaction evidence, structural review, and any remaining limitation without committing the dirty shared worktree.

### Task 5: Add the authenticated account dropdown

**Files:**
- Create: `frontend/src/components/account-menu.tsx`
- Create: `frontend/src/components/account-menu.module.css`
- Create: `frontend/src/components/account-menu.test.tsx`
- Modify: `frontend/src/app/dashboard/page.tsx`
- Modify: `frontend/src/app/dashboard/dashboard.module.css`

**Interfaces:**
- Consumes: `AuthenticatedUser`, existing `handleLogout`, and management-route permissions.
- Produces: accessible account trigger and anchored menu with dynamic email/department, optional Settings, and Sign out.

- [ ] **Step 1: Add the focused failing test**

Assert the trigger opens the menu, real department is shown, missing department becomes `Not assigned`, Settings obeys permission, Escape/outside click close the menu, and Sign out invokes the supplied callback.

- [ ] **Step 2: Verify the relevant failure**

Run: `npm test -- src/components/account-menu.test.tsx`
Expected: non-zero exit because the account-menu component does not exist.

- [ ] **Step 3: Implement the minimum behavior**

Create the component and CSS, use existing authenticated-user fields, add keyboard/outside-click handling, and replace the header's direct logout button. Settings links to `/admin/settings/general` only with settings access. Do not add a Profile action until the application has a real profile route.

- [ ] **Step 4: Verify the focused pass**

Run: `npm test -- src/components/account-menu.test.tsx`
Expected: all account-menu behavior tests pass.

- [ ] **Step 5: Run the affected integration check**

Run: `npm test -- src/app/dashboard/page.categories.test.tsx`
Expected: dashboard behavior remains green.

- [ ] **Step 6: Record the passing checkpoint**

Record changed files and test output without committing the dirty shared worktree.

## Unresolved Product Decisions

None. The approved mockups and design specification settle typography, theme scope, catalogue-card content, overflow behavior, and public-footer cleanup.
