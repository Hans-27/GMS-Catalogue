# Platform UI Overlap Audit Design

## Goal

Audit and repair unintended overlap, clipping, overflow, cramped layouts, wrapping failures, and inaccessible controls across the entire frontend at desktop, tablet, and mobile sizes. Preserve deliberate visual layering and current business behaviour.

## Approved scope

The audit covers every frontend route and each materially different account experience:

- SuperAdmin
- Sales Admin
- Sales
- Customer
- Public and shared-link visitors

The routes are grouped into seven implementation batches:

1. Shared shell and reusable UI primitives
2. Dashboard and administration views
3. Catalogue Studio editor, preview, print, and PDF views
4. Catalogue management and public catalogue links
5. Promotions
6. Customer Portal
7. Login and account forms

The audit must include dynamic states that can change geometry, including menus, dropdowns, dialogs, carousels, long text, validation messages, empty states, loading states, and populated tables.

## Viewport contract

Each in-scope route and state is checked at these baseline viewport widths:

- Desktop: 1440 px
- Tablet: 1024 px
- Mobile: 390 px

Height may vary to exercise scrolling, sticky regions, and dialogs. A route is not considered responsive merely because it avoids horizontal scrolling; its text and controls must remain readable and usable.

## Defect contract

The automated audit and manual review treat the following as defects:

- Page-level horizontal scrolling that is not an intentional horizontal workspace
- Content extending beyond its owning container or the viewport
- Sibling controls or content blocks occupying the same visual area unintentionally
- Sticky or fixed headers, footers, sidebars, and action bars covering reachable content
- Dialogs, menus, and popovers opening outside the usable viewport
- Text clipping, unreadable truncation, or wrapping that hides required information
- Controls compressed below a practical touch or click target
- Editor and preview rendering the same saved content with incompatible geometry
- Tables whose rows or columns render inconsistently because of placeholder, empty, or duplicated layout data

Table and editor canvases may scroll within a clearly bounded container when the content cannot reasonably reflow.

## Deliberate overlaps and exceptions

The following are allowed when they remain readable and operable:

- Background shapes containing or decorating foreground content
- Badges attached to cards or images
- Carousel arrows positioned over image edges
- Modal backdrops behind dialogs
- Explicit Catalogue Studio layers using the document's z-index and coordinates
- Booklet, page-stack, and print-preview effects

Allowed overlap is recorded in a central exception manifest. Exceptions must identify a stable route or component and a reason; broad selectors or blanket suppression are not accepted.

## Audit architecture

A Playwright-based audit harness will be added to the frontend. It will use a route-role manifest rather than embedding routes directly in individual tests. Each entry will describe:

- URL and required account role
- Required fixture or record identifier
- Viewports to test
- Optional setup actions needed to expose dynamic states
- Expected intentional overflow or overlap exceptions

For each page, the harness will:

1. Authenticate or open the relevant public link.
2. Wait for the page's stable-ready signal rather than an arbitrary delay.
3. Exercise the declared dynamic states.
4. Detect page overflow and suspicious element intersections.
5. capture a screenshot and structured result when a check fails.

The overlap detector will compare visible element rectangles while ignoring hidden elements, zero-size nodes, ancestor/descendant containment, and declared exceptions. It is a candidate detector, not the sole source of truth; every reported collision is classified before code is changed.

## Authentication and test data

Credentials and record identifiers are supplied through environment variables and remain outside source control. The audit must support SuperAdmin, Sales Admin, Sales, and Customer sessions, plus unauthenticated public routes.

If a required role, public token, catalogue, promotion, or Studio design is unavailable, the related audit case fails visibly as `not configured`; it must not silently pass or be skipped as healthy. The final report separates passed, failed, intentionally excepted, and not-configured cases.

Test actions are read-only wherever possible. The harness must not publish, delete, synchronize ERP data, create accounts, or overwrite catalogue content. Any route that cannot reach a representative state without mutation will use a disposable fixture or a mocked component-level state rather than changing live records.

## Repair strategy

Repairs follow a layered order:

1. Correct shared layout primitives and shell constraints when one issue affects several routes.
2. Correct route-family layout rules when the issue is shared only within that family.
3. Apply a component-local fix for isolated cases.

Changes should use intrinsic sizing, grid or flex reflow, `min-width: 0`, bounded scrolling, responsive breakpoints, and explicit sticky offsets where appropriate. Fixed pixel positioning remains valid for authored Studio canvas elements and print geometry.

A global CSS reset or broad overflow suppression is out of scope. `overflow: hidden` must not be used merely to conceal an unresolved layout defect. Business logic, permissions, prices, stock behaviour, publishing rules, catalogue content, and intentional visual styling remain unchanged unless a layout defect cannot be fixed without a separately approved behaviour change.

## Execution batches and gates

Each batch is audited and repaired before moving to the next:

1. Shared shell and primitives establish safe header, sidebar, content, form, dialog, table, and card behaviour.
2. Dashboard and administration cover dashboard, products, categories, prices, media, organization, users, synchronization, health, and settings.
3. Catalogue Studio covers editor panels, canvas, selection controls, preview modes, booklet, print, and PDF paths.
4. Catalogue surfaces cover management cards, authenticated previews, customer links, and public share links.
5. Promotions cover management, creation, detail, preview, and public presentation.
6. Customer Portal covers home, catalogues, promotions, saved items, downloads, help, and account-pricing states.
7. Authentication and account forms cover login, validation, password controls, and narrow-screen keyboard-safe layout.

At each gate, focused component tests, relevant route tests, linting, and viewport audit cases must pass. A later batch may update a shared primitive only after rerunning already completed batches that depend on it.

## Evidence and reporting

Generated screenshots, traces, and raw audit data are stored in an ignored test-artifact directory. A concise tracked report records:

- Route and role coverage
- Result at each viewport
- Defects found and files changed
- Approved intentional-overlap exceptions
- Cases blocked by missing configuration
- Verification commands and outcomes

The report must distinguish verified browser behaviour from conclusions inferred through component tests or static code inspection.

## Verification

Verification is proportional to each repair and includes:

- Regression tests for the affected component or layout rule
- Existing frontend test suite
- ESLint and TypeScript/production build
- Playwright viewport audit at 1440, 1024, and 390 px
- Focused visual review of every automated collision candidate
- Recheck of editor-to-preview geometry for Catalogue Studio changes

The browser audit initially targets the platform's supported Chromium environment. Cross-browser expansion is a separate scope unless an issue is shown to be browser-specific.

## Completion criteria

The work is complete only when:

- Every configured in-scope route and role has a recorded result at all three baseline viewports.
- No unexplained page overflow, clipping, unintended collision, covered content, or unusably compressed control remains.
- Every retained overlap is documented as intentional and visually reviewed.
- Missing credentials or fixtures are reported explicitly rather than counted as passes.
- Existing business and permission behaviour remains covered and green.
- Lint, build, relevant unit/integration tests, and configured Playwright checks pass.

## Non-goals

- Redesigning the platform's visual identity
- Changing permissions, role visibility, pricing, stock, promotion, or publishing logic
- Reauthoring catalogue or promotion content
- Normalizing intentional Catalogue Studio layers into ordinary document flow
- Hiding defects with global overflow rules
- Mutating production-like data solely to make a visual test pass
