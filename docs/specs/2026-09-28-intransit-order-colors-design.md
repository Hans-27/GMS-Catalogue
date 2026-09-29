# Intransit / Order Amount Styling Design

## Goal

Make purchase-order quantities easier to scan on every catalogue product card by displaying only the amounts and assigning a distinct, dark color to each status.

## Display rules

- Keep the existing row label: `INTRANSIT / ORDER`.
- Show In Transit quantities in dark navy (`#123A63`).
- Show Ordered quantities in dark purple (`#6B2D8F`).
- When both quantities are present, render `500 / 300`, with `500` in dark navy, the slash in the existing neutral text color, and `300` in dark purple.
- When only In Transit is greater than zero, show only its dark-navy amount, without a slash or status label.
- When only Ordered is greater than zero, show only its dark-purple amount, without a slash or status label.
- Treat numeric zero as absent. When neither quantity is greater than zero, show the existing em dash (`—`).
- Preserve quantity formatting supplied by the catalogue data, including thousands separators such as `2,300`.

## Scope

The behavior belongs in the shared `CatalogueProductCard`, so it applies consistently to public catalogue pages and authenticated catalogue previews on desktop and mobile. It does not change purchase-order API fetching, aggregation, product filtering, card layout, or any other catalogue field.

Legacy combined `intransit_order` or `in_transit_order` values remain a neutral-text fallback because they do not reliably expose separate In Transit and Ordered quantities for independent coloring.

## Accessibility

Color is supplementary. The row label establishes the value order as In Transit followed by Ordered, and the DOM retains separate status-specific elements with accessible labels so assistive technology can identify each amount. Empty data remains represented by `—`.

## Testing

Component tests will verify:

1. Both positive values render in the correct order with the slash and their status-specific classes.
2. A single positive In Transit value renders without a slash or Ordered value.
3. A single positive Ordered value renders without a slash or In Transit value.
4. Zero values are omitted and two missing/zero values render `—`.
5. A legacy combined fallback still renders without incorrectly applying either status color.

