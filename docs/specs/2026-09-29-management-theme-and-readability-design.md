# Management Theme and Readability Design

## Objective

Make the authenticated management platform clearer and easier to scan by using regular/medium typography, improved spacing, calmer hierarchy, and a persistent Light/Dark/System theme setting. Public customer catalogue pages retain their catalogue-specific presentation and are not affected by the management theme.

## Scope

Included:

- Dashboard and all authenticated management routes.
- General Settings theme selector.
- Shared internal navigation, cards, forms, tables, filters, dialogs, status surfaces, and page backgrounds.
- Simplification of catalogue cards on the Catalogue Management dashboard.
- A compact authenticated-user dropdown in the management header.
- Removal of the public catalogue footer version label.
- Responsive behavior from 375px through desktop layouts.

Excluded:

- Public catalogue brand colours and product-card presentation.
- Per-user server-side theme synchronization.
- Rebuilding existing page layouts or navigation architecture.
- New animations or decorative visual effects.

## Design Direction

### Direction Record

- Page kind: preserve the authenticated management application and refresh its visual system; do not rebuild navigation, routes, or workflows.
- Audience: staff who scan dense catalogue and ERP information throughout the workday.
- Layout family: persistent operational sidebar, compact utility header, and content-led card/table workspace. Desktop retains the existing sidebar/content relationship; mobile keeps the existing navigation behavior and changes content grids to one column.
- Widths: 375px mobile verification, 768px intermediate verification, 1280px desktop verification; existing application max-width rules remain authoritative.
- Spacing scale: 4, 8, 12, 16, 20, 24, and 32px. Components own their internal 4–16px spacing; page shells own 20–32px section spacing.
- Shape/elevation: 8px controls, 10–14px cards, one-pixel semantic borders, and restrained shadows only on raised cards and menus.
- Signature element: GMS green sidebar plus green active/focus treatment. Removing it should remove the platform identity; other decoration remains subordinate.
- Motion: existing functional disclosure and menu motion only, disabled by the existing reduced-motion rule. Theme changes add no transition.

Desktop order: sidebar | utility header | notice | page heading | status summary | view tabs | filters | four-column catalogue grid. At 768px the grid becomes two columns and summary becomes three columns. At 375px the content becomes one column, summary/tabs may scroll horizontally, and every interactive target remains at least 44px.

Critique result:

- Subject substitution: a generic admin dashboard could reuse the card geometry, but the persistent GMS green navigation, catalogue-link disclosure, brand identity, and catalogue-specific overflow actions anchor it to this product. No additional decorative signature is needed.
- Default clusters: equal cards are retained because staff compare catalogues by the same fields; gradients, bento layouts, oversized hero copy, and decorative numbering are rejected because they reduce scanning efficiency.
- Free axes: green palette is brand-pinned; regular/medium type is user-pinned; spacing and responsive grids follow the dense operational content; restrained radius and elevation follow the existing component system.
- Concentration: the sidebar/active green system is the only identity-bearing device. Status colours remain semantic and do not compete with it.
- Consistency: every visible management surface maps to the semantic theme tokens below, typography never exceeds weight 500 in refreshed management surfaces, and catalogue card metadata has one product-count block.

### Typography

- Retain the existing `Inter, Aptos, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` stack to avoid a new font download or layout shift.
- Body copy uses weight `400` with a minimum practical size of `13px` in dense management tables and `14px` for normal interface copy.
- Labels, buttons, navigation, and headings use weight `500` rather than bold or extra-bold.
- Page titles use responsive sizing from `24px` to `30px`, weight `500`, line-height `1.15`.
- Section headings use `18px` to `22px`, weight `500`, line-height `1.25`.
- Utility text uses sentence case where changing casing does not alter a product or status identifier.
- Totals communicate hierarchy through size and colour, not heavy font weight.

### Light Theme

- Canvas: `#f5f7f6`.
- Surface: `#ffffff`.
- Raised/soft surface: `#eef4f0`.
- Primary text: `#17251f`.
- Secondary text: `#5f6f67`.
- Border: `#d8e2dc`.
- Brand: `#146c3a`.
- Brand strong: `#0d542d`.
- Focus: `#16864b`, using a visible three-pixel ring.

### Dark Theme

- Canvas: `#101713`.
- Surface: `#18211c`.
- Raised/soft surface: `#202c25`.
- Primary text: `#edf5f0`.
- Secondary text: `#afbeb5`.
- Border: `#34443a`.
- Brand: `#4fb978`.
- Brand strong: `#75cf96`.
- Focus: `#73d69a`, using a visible three-pixel ring.

Both themes must maintain readable text contrast and perceptible boundaries. Status colours retain their semantic meaning and receive theme-specific background/border tokens.

## Theme Architecture

Create a small client-side theme provider at the root application layout. It owns:

- Theme preference: `light`, `dark`, or `system`.
- Resolved theme: `light` or `dark`.
- Browser persistence under a versioned local-storage key.
- Listening to `prefers-color-scheme` only when preference is `system`.
- Applying `data-theme="light|dark"` and `color-scheme` on the document root.

The first render must use a small inline initialization script in the document head to read the stored preference and resolve the theme before the application paints. If storage access is unavailable or malformed, preference falls back to `system` without blocking the page.

The theme selector belongs in General Settings alongside Languages. It is a labelled three-option segmented control:

- Light
- Dark
- System

The selected option uses `aria-pressed="true"`. Keyboard focus remains visible. Selecting an option applies the theme immediately and persists the preference locally.

## Styling Strategy

- Extend the shared global theme variables rather than adding independent per-page dark palettes.
- Map existing TailAdmin/shared variables to the new semantic tokens.
- Update the primary management CSS owners so hard-coded light surfaces inherit semantic variables.
- Prefer targeted shared selectors and module-level token substitutions; do not use broad filters, colour inversion, or duplicate entire stylesheets.
- Public catalogue routes must explicitly retain their existing catalogue variables and presentation.

## General Settings Layout

The existing Platform Defaults panel keeps its structure. Add an Appearance row directly after Languages:

```text
Languages     [EN] [ไทย]
Appearance    [Light] [Dark] [System]
```

Helper copy: “Choose how the management platform appears on this device.”

No save button is needed because the choice is immediate and local to the browser.

## Catalogue Card Simplification

The Catalogue Management grid keeps the catalogue identity, title, status, product count, catalogue-links disclosure, updated date, logo control, and three-dot overflow menu.

Remove these persistent card elements:

- `View online`
- `Open Studio`
- `Preview`
- Version metadata
- Pricing visibility metadata

The overflow menu remains the single location for catalogue operations. It must provide the actions a user is authorized to perform, including viewing online, opening Studio, previewing, and opening catalogue details. An action is omitted when the user lacks its permission or its destination is unavailable. The product count becomes the only card statistic and must reflow without empty placeholder columns.

## Account Dropdown

Replace the header's direct Sign out button with a profile trigger showing the user's initial, full name, account role, and a chevron. The anchored menu contains:

- Identity block: full name, email, and the signed-in user's `department` value.
- Department fallback: `Not assigned` when the API returns no department.
- `Settings` linking to General Settings when the user can view settings.
- A separated `Sign out` action using the existing logout flow.

No Profile action is shown until a real profile route exists, avoiding a dead navigation item.

The trigger exposes expanded state, the menu uses appropriate menu semantics, Escape closes it, clicking outside closes it, and focus returns to the trigger after Escape. The menu aligns to the viewport edge on narrow screens.

## Public Catalogue Footer

Remove the visible catalogue version label from the standard public catalogue footer. Keep the catalogue title and footer structure intact. Studio-authored content is unchanged.

## Data Flow and Failure Handling

1. Inline initializer reads the stored preference.
2. It resolves `system` through `matchMedia` and applies the root attribute.
3. The React provider hydrates from the same preference.
4. General Settings reads and changes the provider state.
5. Storage failures are caught; the current in-memory selection still applies.
6. System-theme listener is attached only for `system` and removed when the preference changes or the provider unmounts.

There is no backend API or database migration because the setting is device-local and does not affect catalogue/customer output.

## Accessibility

- Do not communicate state by colour alone.
- Theme options expose pressed state and descriptive group labels.
- Maintain visible keyboard focus in both themes.
- Respect the existing reduced-motion behavior; theme switching adds no animation.
- Ensure form fields, menus, cards, and status messages meet contrast requirements in both themes.
- Avoid weights above `500` for the refreshed management typography.

## Responsive Behavior

- At desktop widths, the theme options remain inline in the Appearance row.
- Below 700px, the label/helper copy and segmented control stack without horizontal overflow.
- Existing sidebar collapse and mobile navigation behavior remain unchanged.
- No control may fall below a 44px touch target on mobile.

## Testing and Verification

Automated behavior tests must cover:

- Default `system` preference.
- Selecting Light and Dark updates the document theme.
- Preference persists and restores after remount.
- `system` follows a simulated operating-system theme change.
- Invalid or unavailable local storage falls back safely.
- General Settings displays all three options with correct pressed state.
- Catalogue cards show only product count metadata and no persistent View online, Open Studio, Preview, version, or pricing controls.
- The catalogue-card overflow menu exposes each available action with the same permission and destination behavior as the removed persistent control.
- Account dropdown shows the current user's email and department, falls back to `Not assigned`, and provides keyboard-accessible permitted Settings and Sign out actions.
- Public catalogue footer does not show the version label.

Rendered verification must cover authenticated management pages at 375x812, 768x900, and 1280x800 in both light and dark themes. Verify General Settings and the Catalogue Management dashboard, including navigation, cards, filters, buttons, fields, status surfaces, focus, contrast, and horizontal overflow.

## Implementation Boundaries

- Introduce one theme provider and one theme selector component.
- Do not put theme state inside SettingsShell; Settings consumes the shared provider.
- Keep token ownership in global theme CSS and use module CSS only for layout-specific presentation.
- Avoid unrelated refactors in the large Dashboard and Settings components.

## Acceptance Criteria

- Internal platform supports Light, Dark, and System themes from General Settings.
- Preference applies immediately and persists on the current browser.
- Internal pages are readable in both themes without heavy bold typography.
- Public catalogue branding remains unchanged by the internal theme preference.
- Standard public catalogue footer no longer shows its version label.
- Catalogue cards use a single overflow menu for available actions and omit version and pricing metadata.
- No tested viewport has horizontal overflow or clipped controls.
- Relevant tests, lint, type checking, and production build pass.
