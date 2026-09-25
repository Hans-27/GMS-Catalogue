# Catalogue viewer sidebar design

Date: 2026-09-15
Status: implemented and verified, 2026-09-15. Approved by the user's “make it for all the catalogue”.

## Approved direction

Use the supplied Melon Catalogue preview screenshot as the sidebar reference:
a full-height dark-green sidebar, logo and search at the top, and scrollable
categories with counts and an active-category highlight. Apply to every
catalogue viewer, not just Melon or one brand.

## Scope

- Internal catalogue preview: `/catalogues/[id]/preview`.
- Public share-link catalogue: `/c/[token]`, including product catalogues and
  online Studio-backed catalogues.
- Catalogue Studio preview: `/catalogue-studio/[catalogueId]/preview`.

Dashboard navigation and the Studio editor tool rail are excluded. PDF-render
documents and exported product cards must not gain the navigation sidebar.
Keep existing booklet controls and full-screen reading behaviour.

## Layout and behaviour

Desktop sidebar: approximately 280px wide, square outer edges, solid
`#103f2a` background, full viewport-height coverage. In viewers with an existing
sticky toolbar, the sidebar's reading/navigation region occupies the available
height without overlapping that toolbar or obscuring content.

The top region contains the existing catalogue/brand logo and title. Use the
existing GMS logo when no valid saved logo is available, never a fabricated brand
asset. Put the view's labelled search control below the identity. Preserve its
existing search meaning: product search for product catalogues, category/section
search for paged previews. Studio-backed public views can filter their existing
category navigation without altering saved page contents.

Keep fixed utility links such as Back to Cover and All Products where the view
already supports them. The remaining category list owns vertical scrolling.
Category rows show their real names, existing initials or small icon badges,
right-aligned counts and a subtle lighter-green selected state. Long labels and
large counts must fit without overlapping. Use product counts where supplied;
paged Studio previews retain clearly identified page counts rather than
inventing product totals. Category selection keeps each view's existing
scroll/jump callbacks, links and URL fragments.

Active highlighting follows the current category/page when navigated or
scrolled, using an accessible current-state indication. The existing internal
preview's collapse control remains functional. Do not introduce extra footer
actions or move download/print controls solely for this change.

On narrow screens, use a labelled catalogue-navigation trigger and a full-height
dark-green drawer rather than squeezing the product/page content beside 280px.
The drawer must close after navigation, support Escape, manage focus and keep
search and category scrolling usable. Do not put a permanent sidebar inside
mobile full-screen booklet reading.

## Implementation options

Recommended: a shared sidebar presentation component/style with view-owned
data and callbacks. This makes the confirmed reference consistent across viewers
while preserving their different data sources, search meanings and permissions.

Alternative: style each current sidebar separately. It touches fewer component
boundaries initially, but retains three copies of the navigation presentation.

Avoid a new framework, route migration or a redesign of the catalogue content.

## Preservation requirements

No changes to product cards, saved design contents, catalogue revisions, pricing
profiles, promotion eligibility, live-stock data paths or the 180-second ERP
scheduler. Existing download, image popup, PDF, print, password/access-code and
permission checks remain intact. Keep EN/Thai labels in the existing centralized
translation system. No fabricated production data, new service or dependency.

## Verification and acceptance

Add focused executable checks before changing sidebar behaviour. Verify all
three viewer families with labelled test fixtures separately from live data.
Check desktop and mobile containment, long names/counts, category scrolling,
navigation/active state, search, keyboard focus/Escape, existing collapse,
EN/Thai and permission-controlled controls. Print/PDF layouts omit navigation.
Review actual rendered screenshots separately from interaction assertions.

Run frontend tests, TypeScript and lint. Run an isolated production build if
available without replacing the active development build. Report any untested
live-account, ERP or delivery workflows precisely. Do not claim real-time ERP
stock or platform-wide readiness from sidebar tests.

## Spec self-review

Complete: no placeholders; one visual reference and one bounded viewer scope.
Counts retain their source meaning, mobile/full-screen exceptions are explicit,
and business logic and action placement are protected. No application source
changed during the design-only segment. Approved implementation is complete;
final checks and boundaries are recorded in the matching plan.
