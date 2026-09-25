# Platform Mobile Responsive Design

Date: 2026-09-16  
Status: Approved conversational design; awaiting written-spec review

## Objective

Make every active frontend surface usable from a phone without changing its
data, permissions, routes, visual identity, catalogue output, or established
desktop behavior. Public catalogues, customer-facing pages, dashboard and admin
workflows must become fully responsive. Catalogue Studio must provide a
simplified mobile editing workflow while retaining the full editor on larger
screens.

## Scope

Included surfaces:

- Authentication and registration
- Dashboard and global navigation
- Products, categories, price lists, media and catalogue management
- Organization, users, permissions, settings and synchronization
- Promotions and approvals
- Customer portal
- Published catalogues and catalogue previews
- Catalogue Studio library, creation wizard, preview and editor
- Shared dialogs, image viewers, video viewers, forms and tables

The mobile Studio scope includes previewing, page reordering, page duplication,
page visibility, supported text editing, image replacement, saving, publishing
and downloading. Freeform drag/resize, layer manipulation, advanced table
construction and precision canvas controls remain desktop/tablet features.

## Constraints

- Preserve all existing backend APIs and database models.
- Preserve permissions and authorization boundaries.
- Preserve existing desktop and print/PDF layouts.
- Preserve existing application colours, typography and component identity.
- Do not create a separate mobile application, mobile route tree or duplicate
  Studio document model.
- Support a minimum viewport width of 360 CSS pixels.
- Existing EN and Thai content must remain readable without clipping.

## Selected Architecture

Use one shared responsive system with page-owned adaptations and a dedicated
mobile presentation for Catalogue Studio.

The shared layer owns:

- safe viewport sizing and global overflow prevention;
- responsive navigation drawers;
- mobile action bars and compact action menus;
- minimum 44px touch targets;
- responsive form primitives;
- labelled table-scrolling containers;
- viewport-safe dialogs;
- focus restoration and reduced-motion behavior.

Feature modules continue to own their grids, tables, forms and domain-specific
actions. Catalogue Studio reuses the existing editor state, document mutations,
autosave behavior and APIs through a simplified mobile presentation.

## Alternatives Rejected

### CSS-only stacking

This would be faster initially, but complex data tables and Catalogue Studio
would remain difficult or impossible to use because their interaction model,
not only their width, is desktop-oriented.

### Separate mobile application

This would isolate the experience but duplicate routing, permissions, API
integration, state handling and long-term maintenance. The existing responsive
web application can support the required mobile workflow without that cost.

## Responsive Layout System

Target verification widths:

- 360px: minimum supported phone
- 375px: primary phone
- 768px: tablet and composition transition
- 1440px: desktop regression baseline

Breakpoint behavior is content-driven, with these shared expectations:

- Below the existing desktop navigation threshold, persistent sidebars become
  drawers opened from a top-bar Menu button.
- Multi-column forms become one column.
- Card grids reduce to one column on phones and two columns only when their
  content fits without truncation.
- Toolbar actions retain the primary action and move lower-priority actions
  into a labelled More menu.
- Wide tables keep their columns and data, but scroll horizontally inside a
  labelled region. Existing sticky identity columns remain sticky; this mobile
  pass does not introduce new sticky-column behavior.
- Dialogs use the available viewport, scroll internally and keep Close/Save
  controls reachable.
- No page may create document-level horizontal scrolling at 360px.

## Navigation and Focus

- Mobile navigation opens as a full-height modal drawer.
- The drawer has a visible close control, an accessible name and Escape-key
  support.
- Opening the drawer moves focus into it.
- Closing the drawer restores focus to the Menu button.
- Navigation items keep existing names, destinations, active states and
  permission filtering.
- Interactive controls in phone layouts provide a hit area of at least 44px in
  both dimensions, including compact icon controls.

## Forms, Tables and Feedback

- Form labels remain visible above controls; placeholders are not substitutes
  for labels.
- Inputs, selects and buttons fit within their container with `min-width: 0`
  and `max-width: 100%` behavior where required.
- Validation appears beside the affected control and does not disappear behind
  a sticky action area.
- Loading, empty, success and error states retain their existing meaning and
  user-facing language.
- Save, upload, publish and download failures keep the current mobile panel open
  and preserve unsaved user input.
- Table scroll regions receive an accessible label and keyboard focus when
  horizontal scrolling is necessary.

## Surface-Specific Behavior

### Dashboard and administration

- Replace persistent navigation with the shared drawer on phones.
- Stack summary panels, filters and forms in reading order.
- Keep primary actions visible; group secondary actions under More.
- Convert split-pane editors into a list/detail flow rather than squeezing both
  panes side by side.
- Preserve all permission-based visibility and account controls.

### Customer portal and promotions

- Use a single-column content flow on phones.
- Make catalogue, promotion and account cards full-width.
- Collapse filter groups into a labelled filter panel when they cannot fit.
- Keep promotional status, dates and pricing context visible without requiring
  hover.

### Published catalogues and previews

- Use the existing mobile catalogue navigation bar and drawer pattern.
- Render product cards in a single column with touch-safe carousel and download
  controls.
- Keep stock, barcode and price data legible; tables may scroll internally but
  must not overflow the page.
- Preserve catalogue covers, print behavior and PDF output.

### Catalogue Studio mobile mode

Studio opens in Preview on phone-sized viewports and provides three mobile
sections:

1. **Pages**
   - View page thumbnails and names.
   - Reorder pages using explicit Move up and Move down controls.
   - Duplicate a page.
   - Show or hide a page.
2. **Content**
   - Select a page and a supported text or image element.
   - Edit text through labelled fields.
   - Replace an image through the existing upload/media pathways.
   - Preview the resulting page using the existing renderer.
3. **Publish**
   - Display save state and publication state.
   - Save immediately, preview, publish or unpublish when permitted.
   - Download formats already permitted for the user.

Phone mode hides freeform dragging, resizing, layer ordering, advanced table
construction and precision geometry controls. It displays a concise message:
“Open on desktop for advanced layout editing.” These capabilities remain fully
available at desktop widths and no document data is removed when mobile mode is
used.

Viewports at or below 760px use simplified Studio mode. Viewports from 761px
upward retain the full editor with its existing tablet panel adaptations. The
mode is selected from viewport width, not device identification.

## Data Flow and State

- Responsive state is presentation-only and must not be persisted in catalogue
  documents.
- Mobile Studio actions invoke the same page and element mutations as the full
  editor.
- Existing autosave and explicit Save behavior remain the authority for
  persistence.
- Existing API errors and permission failures pass through unchanged to the
  responsive presentation.
- Switching between mobile and desktop widths must retain the current document,
  selected page and unsaved changes.

## Error and Edge Cases

- Long English or Thai labels wrap without covering adjacent controls.
- Empty lists and zero-result searches remain actionable and readable.
- A failed image upload or save keeps the active panel and selected element.
- A permission change that removes an action hides or disables it according to
  the existing authorization contract.
- On-screen keyboards must not permanently cover the focused field or primary
  save action.
- Orientation changes retain navigation and Studio selection state.
- Reduced-motion users receive no nonessential drawer or panel animation.
- Printing and exported documents must not include mobile navigation or action
  bars.

## Delivery Phases

1. Shared responsive foundation and regression harness
2. Dashboard and administration shells
3. Customer portal and promotion workflows
4. Published catalogue and preview audit
5. Simplified mobile Catalogue Studio
6. Full-platform responsive and desktop regression audit

Each phase must be independently testable and leave existing desktop behavior
operational.

## Testing and Evidence

Automated component tests must cover:

- opening, closing and focus restoration for navigation drawers;
- action-menu visibility and permission filtering;
- labelled table overflow regions;
- viewport-safe modal structure;
- Studio page movement, duplication and visibility controls;
- supported text edits and image replacement;
- save, publish and download flows;
- error-state preservation.

Browser verification must cover representative routes from every surface at
360px, 375px, 768px and 1440px. The frozen review checklist is:

- no document-level horizontal overflow;
- no overlapping controls or content;
- readable EN and Thai text;
- visible keyboard focus and logical focus order;
- 44px touch targets for primary mobile controls;
- usable navigation, tables, dialogs and forms;
- successful representative interactions;
- unchanged desktop navigation and workflows;
- unchanged print/PDF output;
- no unexpected console errors or failed application requests.

Full frontend unit tests, TypeScript, ESLint and production build are required
after integration. Backend tests are required only when implementation changes
shared API contracts; the selected design does not require such changes.

## Success Criteria

The work is complete when:

- every active frontend route is reachable and usable at 360px;
- representative end-to-end workflows pass at mobile and desktop widths;
- Catalogue Studio supports the approved simplified phone workflow;
- advanced Studio editing remains available and unchanged on desktop;
- there is no unintended document-level horizontal overflow;
- desktop, print and PDF regression gates pass;
- all failures and unverified surfaces are explicitly reported.
