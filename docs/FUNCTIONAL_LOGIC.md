# GMS Catalogue Platform Functional Logic

## Identity and access

1. Authenticate by email/identity and password.
2. Reject inactive or locked users.
3. Load the current user and effective permission version.
4. SuperAdmin bypasses normal grants but protected-account mutations require reauthentication.
5. For other users: explicit user deny -> explicit user allow -> inherited grants -> default deny.
6. Apply record scope in database queries, never only in browser filtering.
7. Permission or account changes invalidate existing effective-access state.

## Products

- ERP fields and editorial content remain distinct.
- Active/inactive is a master lifecycle state; catalogue visibility is catalogue-specific.
- Inactive products remain in administration/history but are excluded from every public response, print, and PDF.
- Stock zero does not deactivate a product.
- Inactivation requires a reason and audit event.

## Pricing

- Price lists are normalized and separately authorized.
- Catalogue modes are one price, two prices, or no price.
- No-price responses omit price properties server-side.
- Cost/margin data requires distinct permissions.
- Price changes create history; published historical output is not silently rewritten.

## Synchronization

- Manual and scheduled runs call the same service.
- Default schedule is 180 seconds with a single-run lock.
- A failed source read preserves the last valid stock and price.
- Runs record timestamps, counts, retries, and safe errors.
- Successful runs invalidate affected caches.

## Catalogue lifecycle

- Draft -> pending review -> approved -> published -> archived.
- Public links resolve only published snapshots.
- Published snapshots are immutable; further editing creates a new revision/version.
- Publishing validates product activity, assets, prices, layout, permission, and revision.

## Studio

- All positions use stable logical page coordinates.
- Product Card owns and renders its child elements once.
- Autosave uses optimistic revision checks and retains unsaved browser state on failure.
- Preview and PDF consume the same saved logical document and shared renderer primitives.
- Carousel is interactive in browser and resolves to a configured static fallback in PDF.

## Share links

- Each audience has an opaque, revocable, optionally expiring token.
- Audience and price list are server-bound; query parameters cannot switch pricing.
- A link never returns draft versions, inactive products, or unauthorized price fields.

## Organization

- Departments own teams, positions, and users.
- Team/position relationships must remain within valid departments.
- Circular hierarchies are rejected.
- Referenced master records are deactivated rather than deleted.

## Promotions

- Draft -> pending review -> approved -> scheduled/active -> paused/expired/cancelled.
- End is after start; scheduling and expiry use UTC persisted time.
- Paused/expired promotions are excluded publicly.
- Promotion pricing never overwrites ERP base price.

## Backups and health

- Database backup must create a verified file with size/checksum/history.
- Application backup excludes dependencies, caches, logs, prior backups, and secrets.
- Downloads require authorization and server-owned identifiers, never arbitrary paths.
- Health output exposes operational state without secrets or full server paths.
