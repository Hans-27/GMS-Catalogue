# SuperAdmin Disabled Products in Internal Catalogue Preview

Date: 2026-09-22

## Objective

Allow authenticated SuperAdministrators to see and manage disabled products while reviewing an internal catalogue preview. Disabled products must remain hidden from public customer catalogue links and from every non-SuperAdmin preview user.

## Authorization Boundary

- The feature applies only to the authenticated internal catalogue preview route.
- A user qualifies only when the authenticated user record has `is_superadmin === true`.
- A SuperAdmin preview requests catalogue data with `include_inactive=true`.
- The backend preview endpoint permits `include_inactive=true` only for a SuperAdmin. Possession of `products.view_inactive` alone is not sufficient for this catalogue-preview feature.
- Public catalogue and share-token endpoints remain unauthenticated customer surfaces and continue excluding inactive products.
- Existing product-management permissions outside the catalogue preview are unchanged.

## User Interface

The existing catalogue product-card template remains the source of truth for the card layout.

For a disabled product in a SuperAdmin internal preview:

- Render the product in its normal category and ordering position.
- Add a visible `Disabled` ribbon to the product card without replacing any existing product information.
- Add a compact status switch labelled with the product name and current state.
- Keep the ribbon and switch out of public catalogue rendering and out of non-SuperAdmin internal previews.

For an active product in a SuperAdmin internal preview:

- Show the same compact status switch in its active state.
- Do not show the `Disabled` ribbon.

The switch must be keyboard operable, expose `role="switch"` and `aria-checked`, and retain the existing product-card reading order.

## Status Change Flow

### Disable

1. SuperAdmin activates the status switch on an active product.
2. Open the existing product-disable dialog.
3. Require a valid inactive reason. When `other` is selected, require an explanatory note in accordance with the existing product-status API contract.
4. Submit the status change through the existing authenticated product-status endpoint.
5. On success, keep the card visible, update it to inactive, show the `Disabled` ribbon, and announce the successful change.

### Enable

1. SuperAdmin activates the status switch on a disabled product.
2. Submit the active status through the existing authenticated product-status endpoint.
3. On success, keep the card visible, remove the ribbon, update the switch state, and announce the successful change.

The preview refresh must preserve the currently selected category and search query.

## Components and Data Flow

### Catalogue preview API client

Extend the existing preview request helper with an `includeInactive` option. It serializes to `include_inactive=true` only when explicitly requested.

### Internal catalogue preview

Load the current user first, derive strict SuperAdmin status, and request the preview with inactive products only for that user. Pass an optional administrative status-control contract to product cards. After a successful mutation, update the affected product state or refresh the preview without changing the selected category or query.

### Catalogue product card

Add optional administrative status props. Their absence produces the existing customer-facing card exactly as before. When present, render the switch and conditionally render the disabled ribbon from `product.product_status`.

### Backend preview endpoint

Retain the existing `include_inactive` query parameter but authorize it strictly with `is_superadmin(actor)`. The presentation builder continues attaching the live `product_status` to each returned product.

### Public catalogue

No public response or component receives the administrative status-control props. Existing public filtering remains unchanged.

## Error Handling

- If inactive preview access is requested by a non-SuperAdmin, return HTTP 403.
- If the status update fails, keep the previous card state, keep the preview usable, and display an actionable error message.
- Disable repeated switch actions while the affected product update is pending.
- If the preview refresh fails after a successful status change, show a refresh error while retaining the last confirmed card state.
- Server authorization is authoritative; hidden frontend controls are not treated as a security boundary.

## Testing

### Backend

- SuperAdmin can request an internal preview with inactive products included.
- A non-SuperAdmin, including a user with `products.view_inactive`, receives HTTP 403 for `include_inactive=true`.
- Internal preview without the flag excludes inactive products.
- Public share-token catalogue responses always exclude inactive products.
- Product status changes retain existing reason and note validation.

### Frontend unit tests

- SuperAdmin internal preview requests inactive products and renders disabled cards.
- Non-SuperAdmin internal preview does not request inactive products.
- Disabled SuperAdmin card renders the ribbon and inactive switch state.
- Active SuperAdmin card renders the switch without the ribbon.
- Public cards and non-SuperAdmin preview cards render no administrative control.
- Successful status changes update the card state; failed changes preserve it and surface an error.

### Browser verification

- Verify the ribbon and switch at desktop and mobile preview widths.
- Verify keyboard operation and switch semantics.
- Verify category selection and search remain intact after a status change.
- Verify a public catalogue link contains neither disabled products nor administrative controls.

## Non-Goals

- No administrative controls on public share-token pages.
- No change to existing product-management permissions elsewhere in the dashboard.
- No change to brand or category status controls.
- No automatic publication or catalogue-version creation after a status change.
