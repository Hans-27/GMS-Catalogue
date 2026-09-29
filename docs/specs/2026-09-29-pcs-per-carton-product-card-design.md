# Pcs/Carton Product Card Design

## Goal

Show the ERP pieces-per-carton value on every catalogue product card without increasing the card height or changing the bordered facts table.

## ERP data source

- Use the existing ERP `Product.PackSize` mapping.
- The backend already synchronizes this value to `Product.pack_size` and exposes non-zero values in `CataloguePreviewProduct.erp_details.pack_size`.
- No ERP query, database schema, API contract, or synchronization behavior changes are required.

## Product-card layout

- Keep the first metadata row unchanged: model on the left and warranty on the right.
- Add a second compact, left-aligned metadata row immediately below it.
- Render the exact label `Pcs/Carton`, followed by one compact text gap and the ERP pack-size value, for example `Pcs/Carton 20`.
- Keep the label and value grouped together on the left; do not right-align the value.
- When `erp_details.pack_size` is missing, empty, or represents numeric zero, render `Pcs/Carton —`.
- Preserve the ERP value as supplied for non-zero values; do not calculate, convert, or append a unit.
- Tighten vertical padding and spacing inside the identity/metadata area only as needed so the bordered stock-and-pricing facts remain at the same vertical position and the overall card height does not increase.
- Keep existing responsive behavior on desktop and mobile.

## Scope

Implement the presentation in the shared `CatalogueProductCard`, so it appears in public catalogue pages and authenticated catalogue previews for every brand. Do not add the field to the bordered facts table, catalogue cover, sidebar, PDF/Excel export, or Catalogue Studio canvas in this change.

## Accessibility

Keep `Pcs/Carton` and its value as readable text in normal document order. The fallback em dash communicates that ERP has no usable value without inventing a carton quantity.

## Testing

Component tests will verify:

1. A non-zero `erp_details.pack_size` renders as `Pcs/Carton` with the supplied value.
2. A missing pack size renders `Pcs/Carton —`.
3. A numeric zero string renders `Pcs/Carton —`.
4. Model and warranty remain visible in the first metadata row.
5. The field appears whether catalogue prices are shown or hidden because it is ERP product metadata, not pricing data.

