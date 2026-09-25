# Catalogue Studio: Canva-style tool sidebar

Date: 2026-09-15

Status: Confirmed by the user; implemented and verified within the sidebar scope. See [implementation evidence and limitations](../plans/2026-09-15-studio-tool-sidebar.md).

## Goal and scope

Make the editor's left tool area easier to navigate using the user's reference:
a narrow icon-and-label rail beside a searchable content panel. Preserve GMS
branding and the existing editor rather than replacing the platform or its stack.

This change covers Catalogue Studio editor routes, including
`/catalogue-studio/965ca0ee-7217-473e-97a7-2e4c7596189d/editor`.
It does not redesign the dashboard, customer portal, public catalogue, top toolbar
or right-hand properties controls. No file-cleanup or business-data deletion is
part of this work.

## Approved composition

```text
Existing top toolbar and customer-pricing bar
----------------------------------------------------------
Tool rail | Active tool content | Canvas | Properties
----------------------------------------------------------
```

The rail stays available while tool content scrolls independently. Remove the
current introductory banner, two-column launcher and repeated letter badges.
Use consistent line icons with visible labels, not initials or emoji. The
reference's purple accent becomes GMS green; white surfaces and restrained
borders keep the library visually separate from the canvas.

Main tools, in order:

| Rail label | Existing editor panel | Content retained |
| --- | --- | --- |
| Products | `products` | ERP search, selection and existing insertion actions |
| Cover | `cover` | Finished-image upload, replace, remove and Save cover flow |
| Elements | `elements` | Existing text, image, shape, table and other insertion tools |
| Card layouts | `cards` | Authorized card templates, previews and template actions |
| Uploads | `media` | Existing uploaded images, videos and media-management link |
| Pages | `pages` | Add, select, rename, reorder and promotion-page management |
| More tools | Secondary chooser | Prices, Product data fields and Layers |

Secondary tools continue to use their existing `prices`, `fields` and `layers`
panels. Their active label remains visible in the content-panel heading even
after the chooser is dismissed. Do not add Brand, Apps, stock-photo libraries,
premium badges or unsupported reference tabs.

## Content panel and interaction

- Each tool opens its existing content beside the rail, with a single readable
  heading and a short description only where needed.
- Products keeps its existing ERP search behavior and API scoping. Do not add
  a second competing product-search input.
- Card layouts provides local name/description search over authorized templates;
  retain actual template previews, permissions and existing callbacks.
- Uploads provides local filename/alt-text search over the authorized media
  list. Preview real images using the existing asset-access mechanism; videos or
  unavailable previews receive a labelled file-type fallback.
- Other tools retain task-appropriate controls rather than showing a decorative
  search field with no behavior.
- Existing click and drag-to-canvas actions remain available. Choosing a tool
  changes only editor navigation, not saved catalogue content.
- A labelled collapse/expand control hides only the content panel; the rail stays
  available. Selecting a tool while collapsed opens its panel. Collapsing does
  not discard product selections, unsaved edits or search text.
- Cover continues to use the existing online-cover workspace. It does not insert
  the finished image into printable pages or bypass Save cover and Publish.

## Layout, accessibility and localization

- At viewport widths of 1280px and above use a 72px rail and a resizable content
  panel, defaulting to 276px and bounded to 220-388px. Total expanded sidebar width
  is 292-460px, defaulting to 348px. Clamp old saved total sidebar widths into this
  range; keep pointer and keyboard resizing and its reset action functional.
- Below 1280px the content panel opens as a dismissible sheet beside the 72px
  rail, with width `min(276px, viewport width minus 72px)`. Collapse removes the
  sheet without removing the rail. Retain canvas zoom/pan rather than imposing a
  minimum page width. Support Escape, a visible close control and focus return to
  the opening tool; focus stays inside an open modal sheet. This intentional sheet
  layer must not create accidental page overflow or obscure its dismissal control.
- Use visible active styling, keyboard focus, accessible button names and labelled
  search fields. Icons are decorative when a visible label supplies the name.
- Controls remain touch-friendly. Long English and Thai labels wrap or receive
  sufficient width rather than disappearing behind ellipses.
- Use centralized English/Thai translation entries for all new interface copy.
- Keep the existing type family, white surfaces, GMS-green active states and
  minimal motion; respect reduced-motion preferences.

## Architecture and preservation rules

Keep navigation presentation in a bounded sidebar component; the editor owns
its existing panel state, data loading and insertion callbacks. Avoid moving or
rewriting the editor's save, selection, page-management or publication logic.
One stylesheet owns the new sidebar layout and tokens; replace obsolete sidebar
rules deliberately rather than stacking conflicting overrides.

Reuse current APIs and permission checks. In particular, preserve separate
manage-elements, manage-pages, cover-edit, card-template and carousel permissions.
Hidden tools or disabled actions must not become accessible through new controls.

No backend endpoint, migration, dependency installation or framework replacement
is required. Preserve autosave, undo/redo, pricing-by-customer-link, the 180-second
ERP synchronization interval, publication and export behavior. UI navigation and
search must not issue catalogue-write requests.

## Loading, empty and failure states

Retain the existing loading/error behavior for API-backed tools. Add clearly
labelled no-search-results states distinct from an empty authorized library.
Clearing a search restores the permitted results. Preview failures retain the
item name and fallback rather than displaying unrelated or generated imagery.

## Acceptance and verification

1. All permitted main and secondary tools open the correct existing content.
2. ERP product selection/insertion, card-template use and page/promotion actions
   remain functional and permission-scoped.
3. Search filters only the selected library; clearing restores its contents.
4. Collapse/expand, pointer/keyboard resizing and reset preserve editor state.
5. English/Thai, long labels, keyboard focus, empty/loading/error states and
   narrow-screen panel dismissal remain usable.
6. Navigation and local search do not change the saved catalogue revision.
7. Run targeted sidebar/editor tests, the broader frontend suite, TypeScript and
   lint. Check representative desktop/intermediate/mobile renders and interactions
   with available browser access; disclose any unavailable authenticated checks.
8. Do not replace the running `.next` output for a production-build check without
   first avoiding disruption to the user's active development session.

## Review and next step

Inline review checked scope, tool mappings, data ownership, permissions and
preserved behavior. No placeholder requirements or unresolved design choices
remain. This is a specification, not evidence of implementation or passing tests.
After the user reviews it, create the implementation plan and build within this
boundary. No commit is authorized, and the project currently has no Git repository.
