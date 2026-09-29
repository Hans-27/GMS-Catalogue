# Intransit / Order Amount Styling Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display separate In Transit and Ordered quantities as compact, status-colored amounts on every catalogue product card.

**Architecture:** Keep purchase-order retrieval and aggregation unchanged. Refine the shared `CatalogueProductCard` presentation helper so structured `in_transit` and `ordered` values render as separate accessible spans, while legacy combined values remain a neutral fallback.

**Tech Stack:** React 19, TypeScript, CSS Modules, Vitest, Testing Library, Next.js 16

## Global Constraints

- Keep the row label `INTRANSIT / ORDER` and the existing product-card layout.
- Render In Transit quantities in dark navy `#123A63`.
- Render Ordered quantities in dark purple `#6B2D8F`.
- With both positive quantities, render `500 / 300`; keep the separator neutral.
- With one positive quantity, render only that amount without a separator.
- Treat numeric zero as absent; render `—` when both quantities are absent or zero.
- Preserve supplied quantity formatting, including thousands separators.
- Keep legacy `intransit_order` and `in_transit_order` strings as neutral fallback text.
- Apply the behavior through the shared product card so public and authenticated catalogue views, desktop and mobile, stay consistent.
- Do not change purchase-order API fetching, aggregation, filters, card dimensions, or other catalogue fields.

---

### Task 1: Render and style status-specific purchase-order amounts

**Files:**
- Modify: `frontend/src/components/catalogue-product-card.tsx:41`
- Modify: `frontend/src/components/catalogue-product-card.module.css:270`
- Test: `frontend/src/components/catalogue-product-card.test.tsx:266`

**Interfaces:**
- Consumes: `CataloguePreviewProduct.erp_details` keys `in_transit`, `goods_in_transit`, `ordered`, `goods_ordered`, `intransit_order`, and `in_transit_order`.
- Produces: product-card DOM spans with CSS-module classes `inTransitQuantity`, `orderedQuantity`, and `purchaseOrderSeparator`; status spans expose localized accessible labels such as `In Transit 500` and `Ordered 300`.

- [ ] **Step 1: Add the focused failing tests**

Update the existing purchase-order component tests and add the missing cases:

1. Given `in_transit: "500"` and `ordered: "300"`, assert the row contains visible `500 / 300`, the In Transit amount has class `inTransitQuantity`, the Ordered amount has class `orderedQuantity`, and the accessible labels identify both statuses.
2. Given `in_transit: "2,300"` and `ordered: "0"`, assert only `2,300` renders, it has class `inTransitQuantity`, and no separator or Ordered status exists.
3. Given `in_transit: "0"` and `ordered: "300"`, assert only `300` renders, it has class `orderedQuantity`, and no separator or In Transit status exists.
4. Given both structured values missing or numeric zero, assert the row renders `—`.
5. Given only `intransit_order: "Expected shipment"`, assert that exact neutral fallback renders without either status-specific class.

- [ ] **Step 2: Verify the relevant failure**

Run: `cd frontend && npm.cmd test -- --run src/components/catalogue-product-card.test.tsx`

Expected: the new assertions fail because the current component renders translated status labels inside one neutral text node and exposes no status-specific color classes.

- [ ] **Step 3: Implement the minimum behavior**

In `catalogue-product-card.tsx`:

1. Replace `inTransitOrderValue` with a small structured helper that resolves the preferred aliases and returns `{ inTransit, ordered, legacy }`.
2. Retain a structured amount only when `hasPurchaseOrderQuantity` reports it as positive.
3. Use a legacy combined value only when neither structured amount is positive.
4. Render the purchase-order `<dd>` as follows:
   - `inTransit` in `<span className={styles.inTransitQuantity} aria-label={`${t("In Transit")} ${inTransit}`}>`.
   - A `/` in `<span className={styles.purchaseOrderSeparator} aria-hidden="true">` only when both structured values exist.
   - `ordered` in `<span className={styles.orderedQuantity} aria-label={`${t("Ordered")} ${ordered}`}>`.
   - Otherwise the neutral legacy value or `—`.

In `catalogue-product-card.module.css`:

1. Add a flex wrapper rule for the purchase-order value so the compact tokens remain aligned at the right edge.
2. Set `.inTransitQuantity { color: #123A63; }`.
3. Set `.orderedQuantity { color: #6B2D8F; }`.
4. Keep `.purchaseOrderSeparator` on the existing neutral fact-value color and add a small horizontal gap without changing row height.

- [ ] **Step 4: Verify the focused pass**

Run: `cd frontend && npm.cmd test -- --run src/components/catalogue-product-card.test.tsx`

Expected: all product-card tests pass, including both-value, single-value, zero/empty, and legacy fallback cases.

- [ ] **Step 5: Run the affected integration checks**

Run: `cd frontend && npx.cmd eslint src/components/catalogue-product-card.tsx src/components/catalogue-product-card.test.tsx`

Expected: exit code 0 with no ESLint errors.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add frontend/src/components/catalogue-product-card.tsx frontend/src/components/catalogue-product-card.module.css frontend/src/components/catalogue-product-card.test.tsx docs/specs/2026-09-28-intransit-order-colors-design.md docs/plans/2026-09-29-intransit-order-colors.md
git commit -m "feat: color catalogue purchase order amounts"
```

## Unresolved product decisions

None. The approved design defines colors, ordering, single-value behavior, zero handling, fallback behavior, and scope.

