# Current state

## Goal

Deliver the catalogue redesign requested in the current worktree while keeping the public/internal catalogue responsive and ERP-backed.

## Done

- Replaced catalogue product cards with the clean reference template and removed legacy card styling/data presentation.
- Added responsive vertical grids: five columns on desktop, three at 1024 px, two at 768 px, and one on mobile.
- Changed automatic product-image rotation from three seconds to five seconds.
- Mapped card prices from synchronized ERP price levels: `SP6` to Wholesale, `SRP` to Online, and `SP5` to Retail.
- Category selection now renders only the selected category; search is scoped to that category and includes a clear control.
- Removed the category order badge and imported-description line from catalogue section headers.
- Removed the redundant Catalogue price mapping tab while retaining access to both mapping and ERP matrix views.
- Mobile header now uses an icon-only category control, search, and EN/Thai controls on one line. PDF and Print are hidden on mobile.
- Latest change: mobile search consumes the flexible header space (about 210–230 px at a 400 px viewport) and contracts without horizontal overflow at 320 px.

## Files

- Backend ERP card prices: `backend/app/commerce.py`, `backend/app/commerce_schemas.py`, `backend/app/catalogue_share_links.py`, `backend/tests/smoke_catalogue_share_links.py`.
- Product-card template: `frontend/src/components/catalogue-product-card.tsx`, `frontend/src/components/catalogue-product-card.module.css`, and tests.
- Category/search/mobile navigation: `frontend/src/components/catalogue-sidebar.tsx`, `frontend/src/components/catalogue-sidebar.module.css`, public and internal preview viewers, and tests.
- Price-management tab: `frontend/src/app/dashboard/price-management.tsx` and its test.
- API/types/translations: `frontend/src/lib/api.ts`, `frontend/src/lib/i18n.tsx`, `frontend/src/lib/management-translations.ts`.

## Worktree

- Branch: `master`; HEAD: `74a20ca` (`tth`).
- The tree is intentionally uncommitted and contains many source changes plus generated/cache/upload changes predating the final mobile-search adjustment.
- No commit was made because the tree mixes multiple user-requested changes and runtime artifacts.

## Verified

- `npm.cmd test -- --run src/components/catalogue-sidebar.test.tsx`: passed, 11/11 tests.
- Targeted Playwright mobile-header test: passed, 1/1 at 400, 320, and 1440 px checks.
- ESLint on the sidebar component/test and targeted Playwright spec: passed.
- `git diff --check` on the latest sidebar CSS/spec change: passed (line-ending warnings only).
- Updated render: `C:\Users\GMS\AppData\Local\Temp\gms-catalogue-mobile-header-search-400.png`.
- Full frontend suite, production build, and backend suite were not rerun at this handoff.

## Deviations

- The exact reference card intentionally ignores saved legacy card themes/appearances, per user instruction.
- ERP prices are read from synchronized local ERP price tables, not queried directly from SQL Server during each catalogue request.

## Environment

- Intended development commands are `scripts\start-frontend.ps1 -Foreground` and `scripts\start-backend.ps1 -Foreground`.
- Service processes were not checked at handoff time.
- `frontend/.env.local` routes API traffic through `/api`.
- Ngrok is not used. The supported PowerShell launchers detect the active LAN IPv4 address and provide it as the process-scoped catalogue origin, while preserving configured CORS origins. Restart the backend after any network or DHCP address change; previously copied old-IP links are not rewritten.
- Do not copy credentials from chat history or `.env` files into code.

## Risks

- `Intransit / Order` currently reads optional product-detail fields and falls back to an em dash; the actual ERP purchase-order/container integration is still pending.
- A full regression/build pass is still required before release.
- Deleted and newly generated files under `backend/.cache/catalogue-pdfs/` and new files under `backend/private_uploads/catalogue-covers/` require owner confirmation before cleanup or commit.
