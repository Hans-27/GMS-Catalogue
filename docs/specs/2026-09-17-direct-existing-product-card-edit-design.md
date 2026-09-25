# Direct Existing Product Card Editing

## Goal

Sales Admins and Super Admins edit the product card that already appears in catalogues. The editor must show that same card structure and a successful save must immediately update every current and future catalogue containing the product.

## User flow

1. The user opens **Content → Product Cards**.
2. The user searches for a product and opens its existing card.
3. The editor renders the same product-card component used by online catalogues.
4. The user changes allowed presentation fields: English/Thai display text, description, badge, synchronized-image selection/order, approved design, colours, and optional-field visibility.
5. The user clicks **Save and update catalogues**.
6. The server validates the expected revision, creates an immutable version, makes the submitted presentation active, and returns the number and names of affected catalogues.
7. Existing catalogue links read the new active presentation on their next request. New catalogues containing the product automatically use it.

There is no separate draft or publish action in this workflow. Changes remain local in the browser until the save succeeds.

## Permissions and locked data

- `sales_manager` and `superadmin` can view, edit, and save global product cards.
- Other Sales users cannot access the workspace or mutation endpoint.
- ERP product code, barcode, present stock, warehouse-derived availability, and synchronized/customer-linked prices are displayed as read-only values.
- The payload allowlist rejects attempts to overwrite ERP-owned fields.

## Existing-card fidelity

- The editor preview uses the shared `CatalogueProductCard`, not a separately maintained approximation.
- It receives the current product, active presentation, selected synchronized images, existing catalogue theme fallback, and live ERP facts.
- Add an approved company template named **Current Catalogue Card** to `/catalogue-studio/templates/product-cards`.
- **Current Catalogue Card** reproduces the existing live layout shown in product catalogues: rounded green outline, white rounded title capsule with download control, left image carousel, model/warranty metadata, barcode-stock-price table, and green retail-price capsule.
- The template is selected by default when a product has no explicit global card template.
- Its library thumbnail/preview and the direct editor both render through the shared catalogue-card component or the same presentation contract, preventing a separate template mockup from drifting away from the live catalogue result.
- Other approved company card templates can initialize appearance, layout, and field visibility, but the saved result remains a presentation for the existing product card.
- Image navigation and whole-card download behavior remain unchanged.

## Template-library behavior

- **Current Catalogue Card** appears with the approved company templates on `/catalogue-studio/templates/product-cards`.
- It is a governed system template: Sales Admins can select it but cannot delete or unapprove it; Super Admin retains the existing governed-template administration rules.
- The template records the `erp_detail` layout, existing green palette, visible model/warranty/barcode/stock/price fields, image-carousel behavior, and one synchronized price slot.
- Selecting the template in the direct editor immediately changes the local existing-card preview. The catalogue changes only after **Save and update catalogues** succeeds.
- Updating the governed template definition in a future deployment does not silently rewrite already saved product presentations. A user must select and save the newer template version.

## Save and propagation model

- Replace the management UI's `Save draft` and `Publish globally` controls with one `Save and update catalogues` action.
- Add a transactional save-and-activate endpoint, or adapt the current publish service behind one API call.
- Lock the global-card row, compare the submitted revision, increment the active version, store an immutable version record, copy the submitted presentation into the active published presentation, and write an audit event.
- A revision mismatch returns `409` and keeps the user's unsaved form data visible with a reload warning.
- A failed save does not change the active catalogue presentation.
- The response includes affected catalogue summaries so the success message can state the scope of the update.

## Interface states

- Loading: the existing card area shows a clear loading message.
- Editing: controls and the shared live card update locally.
- Saving: the single primary action reads `Updating catalogues…` and is disabled.
- Success: `Product card updated in N catalogues.`
- Conflict: `This card changed elsewhere. Reload the latest version before saving.`
- Error: explain that catalogues were not changed and allow retry without losing form values.
- No affected catalogues: saving still activates the card for future catalogues and reports that no current catalogue contains the product.

## Responsive layout

- Desktop: a fixed-width control column and the shared existing-card preview beside it.
- Mobile: actions remain at the top, controls and the existing card stack vertically, and no horizontal page scrolling is introduced.

## Version history

- Every successful save creates a new immutable active version.
- Restore remains available and restoring a version immediately activates it everywhere as a new version.
- Audit events record the actor, product, version, and affected catalogue count.

## Testing

- Backend tests cover immediate activation, one-version-per-save, optimistic conflicts, ERP-field rejection, affected catalogue reporting, audit records, and restore-as-new-version.
- Frontend tests verify that the editor uses the shared catalogue card, exposes one save action, removes draft/publish controls, preserves ERP fields, retains unsaved input after failures, and shows the affected-catalogue success message.
- Template tests verify that **Current Catalogue Card** is seeded as an approved active company template, appears in the product-card template library, is the editor default, and produces the same structural presentation contract used by live catalogues.
- Existing catalogue-card, public-catalogue, image navigation, download, role-matrix, migration, lint, build, and responsive tests remain passing.

## Scope boundaries

- This change does not add editing controls to public customer catalogue pages.
- This change does not modify ERP values or catalogue-specific customer pricing.
- This change does not require Catalogue Studio.
- This change does not restart or redeploy the running production service.
