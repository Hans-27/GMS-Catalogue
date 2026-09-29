# Pcs/Carton Product Card Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the ERP `PackSize` value as compact inline `Pcs/Carton <value>` metadata on every catalogue product card.

**Architecture:** Reuse `CataloguePreviewProduct.erp_details.pack_size`, which is already populated from ERP `Product.PackSize`. Add a small presentation helper and a second metadata line inside the shared `CatalogueProductCard`; no backend, schema, synchronization, or API changes are needed.

**Tech Stack:** React 19, TypeScript, CSS Modules, Vitest, Testing Library, Next.js 16

## Global Constraints

- Keep the first metadata row with model left-aligned and warranty right-aligned.
- Add `Pcs/Carton <value>` as a second compact row directly below it, grouped together on the left.
- Render the exact label `Pcs/Carton`.
- Render `Pcs/Carton —` when `erp_details.pack_size` is missing, empty, or numeric zero.
- Preserve any supplied non-zero ERP value without conversion or an appended unit.
- Keep the bordered stock-and-pricing table unchanged.
- Keep the overall product-card height unchanged by compacting metadata spacing rather than adding a new facts-table row.
- Apply the behavior through the shared product card across public catalogues and authenticated previews on desktop and mobile.
- Do not change ERP queries, database schema, synchronization, API response types, exports, covers, sidebars, or Catalogue Studio canvas rendering.

---

### Task 1: Add compact ERP Pcs/Carton metadata to the shared card

**Files:**
- Modify: `frontend/src/components/catalogue-product-card.tsx:37`
- Modify: `frontend/src/components/catalogue-product-card.module.css:70`
- Test: `frontend/src/components/catalogue-product-card.test.tsx:100`

**Interfaces:**
- Consumes: `CataloguePreviewProduct.erp_details.pack_size?: string` supplied by the existing catalogue presentation API.
- Produces: a second metadata row with readable `Pcs/Carton` label and normalized display value; no public TypeScript or backend interface changes.

- [ ] **Step 1: Add the focused failing tests**

Extend `catalogue-product-card.test.tsx` with these observable cases:

1. With `erp_details: { model: "UC012", warranty: "1 Yr", pack_size: "20" }`, assert the metadata contains a first row with `UC012` and `1 Yr`, followed by a second row whose visible text is `Pcs/Carton 20`.
2. With `pack_size` missing, assert the second row reads `Pcs/Carton —`.
3. With `pack_size: "0"`, assert the second row reads `Pcs/Carton —` rather than `Pcs/Carton 0`.
4. Render once with `showPrices={false}` and assert `Pcs/Carton 20` remains visible while price rows remain absent.

Name the test defect explicitly: cards currently discard an already-synchronized ERP carton quantity, leaving customers unable to see packing information.

- [ ] **Step 2: Verify the relevant failure**

Run: `cd frontend && npm.cmd test -- --run src/components/catalogue-product-card.test.tsx`

Expected: the new assertions fail because `CatalogueProductCard` currently renders only model and warranty metadata and intentionally omits `pack_size`.

- [ ] **Step 3: Implement the minimum behavior**

In `catalogue-product-card.tsx`:

1. Add a private `packSizeValue(product)` helper.
2. Read the trimmed value through the existing `detailValue(product, "pack_size")` boundary.
3. Return `—` for a missing/empty value or when removing commas and converting to `Number` yields numeric zero; otherwise return the original trimmed string unchanged.
4. Split the current metadata markup into two internal rows:
   - First row: existing model and warranty values with the current left/right alignment.
   - Second row: `<span>Pcs/Carton</span>` followed immediately by `<span>{packSize}</span>` on the left.
5. Keep the Pcs/Carton row outside all `showPrices` conditions.

In `catalogue-product-card.module.css`:

1. Change `.metadata` into a compact vertical container with two rows and a 1–2 px row gap.
2. Add `.metadataRow` using the current left/right flex alignment for model and warranty.
3. Add `.packSizeMetadata` using left alignment and a compact 4 px gap between label and value.
4. Use the existing metadata font color and size for both rows.
5. Reduce only identity/metadata bottom spacing by the small amount needed to offset the second line; do not alter the facts table, image well, retail price, or mobile card width.

- [ ] **Step 4: Verify the focused pass**

Run: `cd frontend && npm.cmd test -- --run src/components/catalogue-product-card.test.tsx`

Expected: all product-card tests pass, including value, missing, zero, price-hidden, stock-status, and purchase-order color cases.

- [ ] **Step 5: Run the affected integration checks**

Run: `cd frontend && npx.cmd eslint src/components/catalogue-product-card.tsx src/components/catalogue-product-card.test.tsx`

Expected: exit code 0 with no ESLint errors.

Run: `cd frontend && npm.cmd test`

Expected: all frontend Vitest files and tests pass. If the known Catalogue Studio timing-sensitive test fails, rerun that exact test in isolation, then retry the full suite once and report both results.

Run: `git diff --check`

Expected: exit code 0 with no whitespace errors.

- [ ] **Step 6: Commit the passing deliverable**

```bash
git add frontend/src/components/catalogue-product-card.tsx frontend/src/components/catalogue-product-card.module.css frontend/src/components/catalogue-product-card.test.tsx docs/specs/2026-09-29-pcs-per-carton-product-card-design.md docs/plans/2026-09-29-pcs-per-carton-product-card.md
git commit -m "feat: show ERP pcs per carton on catalogue cards"
```

## Unresolved product decisions

None. The approved design defines the ERP source, inline placement, missing/zero fallback, layout scope, and exclusions.

