# Catalogue-Brand Product Card Design

## Goal

Provide one shared product-card design for each brand inside each catalogue. Editing that assignment updates every product from the brand in the selected catalogue, while other catalogues and ERP-owned product data remain unchanged.

## Scope and ownership

- A card-design assignment belongs to one unique `catalogue + brand` combination.
- The same brand may use different designs in different catalogues.
- Every product from the assigned brand in that catalogue must use the same design.
- Individual product design overrides are not allowed once the catalogue-brand assignment exists.
- Sales Admins and Super Admins can create, convert and edit catalogue-brand assignments.
- Other roles retain their existing read-only or denied access according to permissions.
- This feature changes presentation only. ERP product code, barcode, images, model, warranty, present stock and synchronized/customer-linked prices remain product-specific and read-only.

## User workflow

1. The user opens **Content → Product Cards**.
2. The user selects or searches for a catalogue.
3. The page displays the brands currently represented in that catalogue.
4. Each brand tile displays its name/logo, product count, assigned-card preview and one status:
   - **Assigned** — every product resolves to the same catalogue-brand design.
   - **Mixed designs** — existing products currently resolve to multiple designs and require conversion.
   - **Needs assignment** — the brand has no shared assignment.
5. The user selects a brand.
6. If the current product cards are visually consistent, their present design initializes the brand assignment so the catalogue does not visually change.
7. If products use different designs, the system stops and shows the existing design choices with previews and the number of products using each design.
8. The user explicitly chooses one design and confirms **Use as brand design**. No design is selected automatically for a mixed brand.
9. The brand editor opens with the selected/current shared design.
10. The user may switch among products in the brand to preview real product data without changing the shared design.
11. The user edits the shared template, layout, colours and visible optional fields.
12. The user selects **Save and update brand products**.
13. A successful save updates the catalogue-brand assignment and reports the affected product count, for example: `Brand card updated for 58 products in EGA Catalogue.`

## Design resolution

For a product rendered inside a catalogue, presentation is resolved in this order:

1. The active catalogue-brand assignment for the product's synchronized ERP brand.
2. The catalogue's current default card design when no assignment exists.

Global or legacy per-product design records may be consulted only during migration analysis. They do not override an active catalogue-brand assignment.

Product content is resolved separately from the design assignment. Each product continues to supply its own:

- synchronized image collection;
- localized name and description;
- model and warranty;
- product code and barcode;
- present warehouse stock;
- customer-linked price and currency.

## Brand identity

- Use the synchronized ERP brand identifier as the assignment key whenever it is available.
- Normalized brand text is permitted only as a legacy fallback during conversion.
- Products without a reliable brand appear under **Unassigned brand**.
- **Unassigned brand** products can be viewed but cannot receive a shared assignment until the ERP brand is corrected.
- Brand renames must preserve assignments when the ERP identifier remains the same.

## Existing-card conversion

The conversion process must preserve the present appearance wherever one unambiguous design already exists:

- If all products in a catalogue-brand group resolve to an equivalent design contract, copy that contract into the new assignment.
- If no customized design exists, assign the catalogue's present default card.
- If multiple design contracts exist, do not mutate data. Show a conversion screen containing each distinct design preview, its source description and its affected product count.
- The user must explicitly choose and confirm one design before an assignment is created.
- Confirmation states the catalogue, brand and number of product cards that will adopt the selected design.
- Conversion creates the first immutable assignment version and an audit event.

After conversion, the chosen design becomes authoritative for every current and future product in that brand within the selected catalogue.

## Editor interface

The editor always displays the selected catalogue and brand in its header. It uses the shared live catalogue product-card renderer rather than a separately maintained approximation.

The editor contains:

- an approved card-template selector;
- shared appearance controls;
- shared layout and optional-field visibility controls;
- a product selector for previewing representative products;
- a read-only panel explaining that ERP fields and product content vary by product;
- a product count and affected-catalogue statement;
- version history and restore controls;
- one primary action, **Save and update brand products**.

There is no individual product design editor in this workflow. Product-specific text, media or ERP correction workflows remain outside this feature and cannot change the catalogue-brand design assignment.

## Save model

Saving is one transactional operation:

1. Lock the catalogue-brand assignment row.
2. Validate that the catalogue exists and the brand currently has at least one matching product.
3. Compare the submitted revision with the stored revision.
4. Validate the selected active approved template and the presentation allowlist.
5. Increment the assignment revision and active version.
6. Store the submitted presentation as the active assignment.
7. Create one immutable version record.
8. Create one audit event containing actor, catalogue, brand, version and affected product count.
9. Commit once and return the updated assignment and affected-product summary.

The save operation does not copy presentation JSON into every catalogue product row. Catalogue rendering resolves the assignment dynamically, preventing duplicated settings and design drift.

## Automatic inheritance

- A product added later to the selected catalogue automatically uses the assignment when its ERP brand matches.
- A product removed from the catalogue stops using the assignment in that catalogue.
- A product moved to another ERP brand resolves the new brand's assignment on the next catalogue request.
- Changing an assignment never affects the same brand in another catalogue.
- Existing public share links use the new assignment on their next request without republishing the catalogue.

## Error and conflict behavior

- A stale revision returns HTTP `409` with: `This brand card changed elsewhere. Reload the latest version before saving.`
- A conflict or failed save leaves the active assignment unchanged and preserves unsaved form values.
- Saving when no matching products remain is rejected with a message explaining that the catalogue no longer contains products from the selected brand.
- An inactive, deleted or unapproved template is rejected without changing the assignment.
- Attempts to submit product-specific or ERP-owned values are rejected.
- Mixed-design conversion cannot continue until the user selects and confirms a design.
- A failed conversion creates no assignment, version or audit record.

## Responsive behavior

- Desktop navigation follows catalogue → brand → editor.
- Mobile uses the same sequence with stacked panels and no horizontal page scrolling.
- The primary save action remains visible and usable on small screens.
- Product-card previews scale inside their container without changing the actual saved proportions.

## Exports and catalogue surfaces

The same catalogue-brand assignment must be respected by:

- authenticated catalogue preview;
- public catalogue links;
- PDF generation;
- Excel generation where product-card styling is represented;
- whole-card image downloads;
- print views.

All surfaces continue resolving current ERP stock and customer-linked prices independently from the saved design.

## Versioning and audit

- Every successful conversion, save or restore creates a new immutable version.
- Restoring a version activates it as a new version rather than modifying history.
- Audit entries identify the actor, catalogue, ERP brand, version, affected product count and action type.
- Updating an approved template definition later does not silently rewrite an existing catalogue-brand assignment. A user must select and save the newer template version.

## Testing requirements

Backend tests cover:

- uniqueness of catalogue + ERP brand assignments;
- catalogue isolation for the same brand;
- consistent-design migration;
- mixed-design detection and explicit conversion;
- automatic inheritance for newly added products;
- brand rename stability through ERP identifiers;
- unassigned-brand restrictions;
- single-transaction save, immutable versions and audit records;
- optimistic conflicts and zero-product rejection;
- template validation and ERP-field rejection;
- Sales Admin, Super Admin and unauthorized-role permissions;
- restore as a new active version.

Frontend tests cover:

- catalogue selection and search;
- brand grouping, counts and statuses;
- mixed-design choice and confirmation;
- shared live-card preview with selectable products;
- one save action and affected-product success copy;
- retained form state after conflicts and failures;
- absence of individual product design actions;
- mobile stacking and overflow prevention.

Integration tests verify that authenticated preview, public catalogue, PDF, Excel, image download and print surfaces resolve the same assignment while retaining product-specific live stock and catalogue-specific prices.

## Scope boundaries

- This feature does not edit ERP product data.
- This feature does not create a global brand design across all catalogues.
- This feature does not allow individual product design overrides inside an assigned catalogue-brand group.
- This feature does not require users to edit cards through Catalogue Studio.
- This feature does not automatically choose among conflicting existing designs.
- This specification does not restart or deploy the running platform.

## Resolved product decisions

- Assignment scope: selected catalogue + brand.
- Inheritance: mandatory for every product in that brand within the selected catalogue.
- Existing consistent design: copied so appearance remains unchanged.
- Existing mixed designs: stop and require explicit user selection.
- Future matching products: inherit automatically.
- Other catalogues: unaffected.
- Individual design overrides: not permitted.
