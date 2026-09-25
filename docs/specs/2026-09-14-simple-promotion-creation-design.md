# Simple promotion creation and explicit catalogue placement

Date: 2026-09-14

## Outcome

Sales Admin can create an occasional promotion with a short guided flow. A promotion never affects a catalogue merely because its products or brands match: Sales Admin must select each target catalogue, add and edit its promotion page in Catalogue Studio, and publish that catalogue page before the promotion can be published. Catalogue page order remains cover, optional promotion pages, then product content. Catalogues without a selected, ready promotion remain unchanged.

## Current state and change boundary

The existing builder has four steps, but each step contains many controls. Selecting a brand currently opts all of its active products in, new promotions preselect all audiences, and an empty catalogue list currently means every matching catalogue in the pricing service. Studio already has a manual Add promotion page action and orders promotion pages after the cover. The change is focused on the promotion builder, server-side placement/readiness rules, Studio hand-off, and their tests. Existing ERP base prices, stock synchronization, permissions, and manual Studio page editing remain intact.

## Creation experience

The builder uses three progressive steps, with a persistent summary of name, product count, offer, dates, audience count, and catalogue count:

1. **Offer.** Enter an English name, pick one or more brands, select specific products from a searchable list, and choose one offer type and value (percentage, fixed discount, or special price). Selecting a brand only filters products. An explicit, unchecked **All active products in this brand** control is available per brand and clearly states its product count. The brand-wide option and individual product selection can coexist without duplicate product application. The pricing preview shows representative calculated prices and the ERP base-price source. The existing reapproval-on-ERP-price-change policy stays the default.
2. **When and where.** Choose start and end dates, customer groups, and one or more target catalogues. Customer groups start unselected. Catalogues start unselected when the builder is opened directly; a catalogue passed by Studio's explicit **Create promotion** link is preselected. A user may deliberately select all customer groups. The catalogue list is searchable, shows publication state, and explains that a selection only permits placement; Sales Admin still creates the page in Studio. Occasion, translations, media, terms, stock policy, priority, and other less-used fields stay available under clearly labelled optional sections without changing their existing semantics.
3. **Review and save draft.** Show scope, offer, audience-specific prices, dates, catalogue placement, missing information, and conflicts. Validation links directly to the field needing correction. Save creates or updates a draft and opens the server-calculated preview. Creating a draft does not publish it, generate a Studio page, or change any customer-facing price.

For existing promotions, the same guided form loads persisted values. Material edits to a published/approved promotion retain the current reapproval behavior. The builder must not erase optional values merely because their sections are collapsed.

## Catalogue and publication logic

- An empty `catalogue_ids` list means **no catalogue**. It never means all matching catalogues. Drafts may have no target catalogue, but publishing requires at least one.
- Before publishing, every selected catalogue must be published and its customer-visible, published Studio document must include a visible `promotion` page whose `promotionId` matches this promotion. A page present only in a mutable Studio draft does not qualify. If the existing version model cannot identify the published Studio document reliably, record an explicit published-version reference as part of implementation rather than inferring it from timestamps or a change-summary string.
- The promotion preview shows each selected catalogue as **Page needed**, **Republish catalogue**, or **Ready**, with a direct **Open in Catalogue Studio** action. Studio's existing manual Add promotion page action remains the only way to create the page. The page is editable by Sales Admin, ordered after the cover, and must be republished with the catalogue before promotion publication.
- Material edits to an existing promotion make previously published pages stale. The readiness check compares a stable promotion content revision stored with the published page. Studio shows **Promotion changed—review this page** and offers **Mark page current** after Sales Admin reviews or edits it; that action updates the page's revision marker without overwriting manual design work. Sales Admin then republishes the catalogue. A stale page cannot pass the promotion publish gate or runtime eligibility check.
- Publishing remains a separate permission-controlled action. The server rejects publication with precise per-catalogue readiness errors if any selected page is missing, hidden, or unpublished. Product/price conflict checks and existing permission checks remain mandatory. The promotion becomes scheduled or active according to its start date only after those checks pass.
- Customer-facing catalogue pricing and promotion media are eligible only when the promotion is active, within its date range, the catalogue is explicitly linked and still has a matching visible published promotion page for its current revision, and the product and customer group match. The existing winner/priority rule prevents stacking. A page removed from a later published version, or a catalogue unpublish, must stop the promotion's effect in that catalogue; removing a page only from an unpublished draft does not change the currently published customer view. The admin view must show why a catalogue is no longer ready. Other selected catalogues remain eligible if ready.
- No Price audiences never receive numeric base, discounted, or final prices. ERP prices are not overwritten; effective promotion prices are calculated from the audience's mapped ERP base price. Existing ERP price-change behavior and stock rules continue to apply.

## Component and data boundaries

The builder owns form state and field-level validation; the promotion API remains authoritative for draft persistence, audience-specific calculations, conflicts, publish permission, and scheduling. A shared server-side catalogue-placement/readiness function is used by publish validation and customer-facing eligibility so preview and runtime cannot disagree. Studio owns creating, editing, ordering, and publishing pages; the promotion module only links to Studio and reads page readiness. The existing explicit promotion-to-catalogue association is retained; no automatic page creation or implicit catalogue matching is introduced.

## Failures and recovery

Invalid schedules, zero or excessive discounts, empty required scope, unavailable products, conflicting offers, missing catalogue pages, and missing permissions show actionable messages without losing the draft. Optional media upload failure leaves the saved draft intact and offers retry. A selected product removed from ERP or an ERP base-price change must be surfaced in review and handled by the existing reapproval policy. When a promotion page is removed from a later published catalogue version, customer-facing pricing fails closed for that catalogue.

## Verification

Automated tests cover: brand selection without implicit all-products scope; explicit brand-wide opt-in; product deduplication; no preselected audience or direct-entry catalogue; Studio deep-link preselection; empty catalogue list causing no customer-facing promotion; draft creation; publish blocked for missing/unpublished/hidden/wrong-promotion/stale-revision pages; publish allowed after a matching visible page is in the published Studio document; correct page order; audience and brand price mapping; no-price privacy; date activation/expiration; conflict handling; and catalogue page removal after republication. UI checks cover desktop and narrow screens, keyboard progression, step error focus, and the Studio deep link. Existing promotion and Studio test suites must remain green.

## Out of scope

No automatic Studio page generation, promotion templates, new promotion types, changes to ERP synchronization, or redesign of unrelated platform pages.
