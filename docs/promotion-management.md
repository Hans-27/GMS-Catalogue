# Promotion Management

The Promotion Management module stores promotion rules separately from ERP product prices. ERP sync remains the source of truth for base prices and stock; promotions add an audience-scoped effective price only while an approved campaign is active.

## Administration routes

- `/promotions` — dashboard, filters, card/table list and actions
- `/promotions/new` — ten-step guided builder
- `/promotions/[id]` and `/promotions/[id]/preview` — backend-calculated audience preview, conflicts and secure links
- `/promotions/[id]/edit` — edit with material-change reapproval
- `/promotions/calendar` — month/week/list schedule view
- `/promotions/approvals` — pending approval queue
- `/promotions/occasions` — configurable English/Thai occasion master
- `/promotions/reports` — operational summaries and CSV export
- `/p/[secureToken]` — audience-safe public promotion page

## Pricing rules

- Percentage: `promotion = base × (1 - percentage / 100)`
- Fixed amount: `promotion = base - amount`
- Special price: the authorized user supplies the final promotion price
- Brand-wide rules apply the same validated calculation to every active product in each selected brand; users can still override the scope with specific product selections.
- Negative results are rejected and percentages must be between 0 and 100.
- Normal `product_prices` rows are never updated by promotion workflows.
- The base price used at approval is saved in `approved_base_price`.
- Default ERP price-change behavior is `require_reapproval`; optional modes keep, recalculate percentage/fixed rules, or pause affected products.
- No Price audiences receive the promotion message but never base, promotion, discount, or price-list values.

## Workflow and scheduler

`Draft → Pending Review → Approved/Scheduled → Active → Expired`

Rejected promotions return to their owner. Scheduled/active promotions may be paused and resumed; permitted promotions can be cancelled. Material scope, audience, pricing, schedule, priority, terms, or visibility changes reset an approved promotion to Draft.

`app.workers.product_sync_worker` runs the promotion status pass alongside the existing three-minute ERP cycle. Run a single worker service; do not start a scheduler in every FastAPI web worker. The pass activates approved schedules, expires ended schedules, and applies the selected ERP base-price change behavior.

## Security

Promotion administration is deny-by-default. SuperAdmin bypasses permission checks; other users need explicit `promotions.*` or `promotion_occasions.*` grants. Public links use 256-bit random tokens, store only a hash for lookup and an encrypted copy for authorized link recovery, enforce audience pricing server-side, and can be revoked or expired. Tokens and storage keys are not written to audit details.

## Media

Banners, mobile banners, brand/product artwork and PDF terms use the existing validated image/document storage. MP4/WebM files use private video storage and authenticated or token-validated streaming. Optional external videos are limited to the platform-approved YouTube, Vimeo, or direct HTTPS media providers. Media binaries are not stored in PostgreSQL.

## Verification

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m tests.smoke_promotions
```

From `frontend` (PowerShell execution policy safe):

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npx.cmd vitest run src/app/promotions/promotion-workspace.test.tsx
npm.cmd run build
```
