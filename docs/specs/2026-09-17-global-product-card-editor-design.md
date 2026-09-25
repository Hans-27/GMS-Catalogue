# Global Product Card Editor Design

Date: 2026-09-17

## Objective

Provide a focused product-card editor outside Catalogue Studio. Sales Admins and Super Admins can edit a product's presentation once and publish it to every catalogue that contains that product.

## Scope

The feature includes:

- A new **Product Cards** navigation item under the dashboard's **Content** section.
- A searchable product-card management page.
- A standalone editor for one product card.
- Approved default card designs.
- Global draft, preview, publish, version-history, and restore workflows.
- Role and permission enforcement for Sales Admins and Super Admins.

The feature does not add product-card editing to Catalogue Studio and does not allow catalogue visitors or other staff roles to edit cards.

## Navigation and Routes

Add **Product Cards** below **Product Media** in the main sidebar's **Content** group.

- `/product-cards`: searchable product-card management page.
- `/product-cards/{product-id}/edit`: standalone card editor.

The existing Products page also exposes an **Edit card** action that opens the same standalone editor.

## Access Control

- Sales Admins can view products, edit global card drafts, select approved default designs, preview affected catalogues, publish globally, and restore their own or earlier published versions.
- Super Admins have all Sales Admin capabilities and can create, edit, activate, deactivate, and reorder default designs.
- Other authenticated roles receive no editing controls and cannot call the write APIs.
- Public catalogue viewers remain read-only.

Backend permission checks are authoritative. Hiding frontend controls is not treated as access control.

## Product Card Management Page

The page provides:

- Search by product name, product code, barcode, brand, or category.
- Filters for brand, category, assigned design, publication state, and modified status.
- A card or compact-table view showing the product image, name, code, assigned design, last editor, last published time, and number of affected catalogues.
- Actions for **Edit card**, **Preview**, **Publish**, **Reset to default**, and **History**.
- Clear empty, loading, error, and no-search-results states.

## Standalone Editor

The editor is deliberately narrower than Catalogue Studio. It contains:

- A top bar with Back, product identity, save status, **Save draft**, **Preview**, and **Publish globally**.
- A controls column with four sections: **Design**, **Content**, **Images**, and **Appearance**.
- A live responsive preview with desktop and mobile modes.
- An impact panel listing the number and names of catalogues that contain the product.
- A locked ERP-data panel explaining which values remain synchronized.

### Editable fields

- Approved default card design.
- Display name and localized display descriptions.
- Badge and promotional text.
- Primary image, image order, and per-card image visibility.
- Background, accent, border, and text colors within allowed design controls.
- Font choice from an approved list, spacing, border style, and optional-field visibility.

### Locked ERP fields

- Product code and ERP identity.
- Barcode.
- Live stock and warehouse quantities.
- Synchronized customer prices and price-list values.

Locked values remain visible in the preview and update through the existing ERP synchronization process. Card publishing must never copy them into an immutable presentation snapshot.

## Default Designs

The system ships with a small approved set rather than a free-form canvas:

- Standard.
- Minimal.
- Promotional.
- Premium.

Each design defines layout structure, required fields, supported optional fields, allowed style controls, and responsive behavior. Super Admins can manage availability. Deactivating a design prevents new assignments but does not visually break cards already using its saved version.

## Global Draft and Publication Model

Product-card presentation is global per product.

- Editing creates or updates a global draft without changing public catalogues.
- Preview renders the draft against representative catalogue pricing and live ERP stock.
- Before publication, the confirmation dialog states how many catalogues will change and lists them.
- **Publish globally** creates an immutable version and makes it active for every current and future catalogue containing the product.
- Catalogues resolve the active global presentation at view time while continuing to resolve stock and synchronized price independently.
- A newly created catalogue automatically uses the product's active global card version.

## Version History and Recovery

Every global publication records:

- Version number.
- Editor and publication timestamp.
- Selected default design.
- Content, image-selection, and appearance changes.
- Affected catalogue count at publication time.

Restoring creates a new version from the selected historical version; it does not erase history. Resetting to default also creates a publishable draft rather than immediately changing public catalogues.

## Data Boundaries

Keep synchronized ERP product data separate from presentation data:

- ERP-owned product, stock, barcode, and price records remain unchanged.
- Global product-card draft and published versions store presentation overrides only.
- Default designs are separately versioned template records.
- Catalogue responses combine the active global presentation with current ERP-backed operational values.

This separation prevents an ERP sync from erasing card edits and prevents card edits from corrupting ERP-owned data.

## Error Handling

- Autosave failures retain unsaved local changes and show a retry action.
- Publication uses a transaction so the active global version cannot be partially updated.
- A failed preview or affected-catalogue lookup does not permit publication until impact can be confirmed.
- Missing or inactive designs fall back to the last valid saved design version.
- Missing images use the existing product-image placeholder and identify the unavailable image in the editor.
- Concurrent edits use version checks and require the later editor to reload or explicitly overwrite a newer draft.

## Audit and Observability

Record draft saves, publishes, restores, default-design changes, and permission failures in the audit log. Operational logs should include the product ID, card version, actor ID, action, and affected catalogue count without storing image contents or sensitive credentials.

## Testing

- Permission tests for Sales Admin, Super Admin, unauthorized staff, and public users.
- API tests proving ERP-owned fields cannot be changed through card-edit endpoints.
- Versioning tests for draft, publish, global resolution, restore, and concurrent-edit conflicts.
- Catalogue response tests proving all catalogues use the active global presentation while retaining their own live stock and customer-linked price.
- UI tests for search, default-design selection, content and image editing, responsive preview, impact confirmation, publishing, error recovery, and keyboard accessibility.
- Regression tests proving Catalogue Studio remains independent and existing public catalogue cards continue to render.

## Acceptance Criteria

- The main Content sidebar contains **Product Cards** for authorized users.
- Sales Admins and Super Admins can open a product directly in the standalone editor without entering Catalogue Studio.
- Users can select an approved design and edit allowed content, images, and appearance.
- ERP stock, warehouse quantity, barcode, product code, and synchronized prices cannot be overwritten.
- Saving a draft does not change public catalogues.
- Publishing once updates the card presentation in every catalogue containing the product.
- The publish confirmation identifies the impact before the change.
- New catalogues inherit the current active global card.
- Version history supports safe restore without deleting audit history.
- Desktop and mobile catalogue cards remain usable after global publication.
