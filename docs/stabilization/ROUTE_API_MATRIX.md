# Route ↔ API Matrix

Reconciled from `docs/ROUTE_AND_API_MAP.md` (2026-09-04) against the actual `next build` route manifest produced in this pass and a direct read of `frontend/src/lib/routes.ts` and the backend router modules. Route count has grown from 33 (Sept 4) to 43 known routes (42 built in this pass + 1 excluded only due to a staging path-depth limit, not a code issue).

## Frontend routes (from `next build` output, this pass)

| Type | Route |
|---|---|
| Static | `/`, `/login`, `/register`, `/dashboard` |
| Static | `/admin/access/permissions`, `/admin/access/roles`, `/admin/access/roles/new` |
| Not verified this pass (staging depth limit) | `/admin/access/roles/[id]/edit` |
| Static | `/admin/organization/departments`, `/positions`, `/teams` |
| Static | `/admin/settings`, `/backups`, `/data-sync`, `/erp`, `/general`, `/system-health`, `/system-information` |
| Dynamic | `/admin/users/[id]/access` |
| Dynamic (route handler) | `/api/catalogue-studio/asset-content`, `/api/catalogue-studio/image-download` |
| Dynamic | `/c/[token]` (public catalogue) |
| Static | `/catalogue-studio`, `/exports`, `/media`, `/new`, `/templates`, `/templates/categories`, `/templates/covers`, `/templates/product-cards` |
| Dynamic | `/catalogue-studio/[catalogueId]/editor`, `/pdf-render`, `/preview` |
| Dynamic | `/catalogues/[id]/preview`, `/catalogues/[id]/studio` (compatibility routes) |
| Dynamic | `/p/[token]` (public promotion) |
| Static | `/promotions`, `/approvals`, `/calendar`, `/new`, `/occasions`, `/reports` |
| Dynamic | `/promotions/[id]`, `/edit`, `/preview` |

Growth since Sept 4: `catalogue-studio/new`, all four `catalogue-studio/templates/*` routes, and the `admin/settings/*` sub-pages (previously likely one shell route) are new or newly split out. This matches source mtimes showing active development on `catalogue-studio/new/page.tsx`, `studio-preview.tsx`, `studio-editor.tsx`, and `dashboard/page.tsx` after the Sept 4 audit was written — confirms the codebase moved materially between the last audit and this one, which is why a fresh re-verification (rather than trusting the old docs) mattered.

## Backend router domains (`backend/app/*.py`, confirmed present)

| Domain | Router module | Representative endpoints | Guard |
|---|---|---|---|
| Auth | `auth.py` | `/auth/login`, `/auth/me`, `/auth/logout` | session/account state |
| Access | `access.py`, `access_admin.py` | `/auth/me/permissions`, `/access/users/*`, `/access/roles/*` | SuperAdmin/permission dependencies (`require_superadmin`, `effective_permission_access`) |
| Dashboard | `dashboard.py` | `/dashboard/overview`, `/dashboard/sync-status` | dashboard/system permissions |
| Products | `catalogue.py`, `product_admin.py`, `product_content.py`, `product_lifecycle.py`, `product_videos.py` | `/products`, `/products/{id}`, status/content/images/videos | product-specific permissions and record scope |
| Categories | `catalogue.py` | `/categories` and lifecycle routes | category permissions |
| Pricing | `commerce.py`, `commerce_schemas.py` | `/price-lists`, `/product-prices`, `/price-change-requests` | price permissions/list access |
| Catalogues | `catalogue.py`, `catalogue_lifecycle.py`, `catalogue_pdf.py`, `catalogue_auto_generation.py` | `/catalogues`, products, lifecycle, preview, PDF/Excel | catalogue permissions and scope |
| Presentation | `catalogue_presentation.py` | `/catalogues/{id}/cover`, assets, categories | cover/category permissions |
| Share links | `catalogue_share_links.py` | `/catalogue-share-links/cards`, `/catalogues/{id}/share-links`, `/public/catalogues/{token}` | management guard; public token validation |
| Studio | `design_studio.py`, `design_studio_export.py`, `design_studio_browser_export.py`, `design_studio_service.py`, `product_card_templates.py`, `system_catalogue_templates.py` | `/catalogue-studio/designs`, pages, versions, templates, assets, exports | Studio permission keys |
| Organization | `organization.py`, `organization_admin.py`, `organization_service.py` | `/organization/*`, `/admin/organization/*` | organization lifecycle permissions |
| Users | `users.py`, `user_schemas.py` | `/users`, roles, overrides, reset password, unlock | user-management permissions |
| Sync | `data_sync.py`, `product_sync_service.py`, `erp_integration.py` | `/admin/data-sync/status`, `/history`, `/run` | sync permissions |
| Backups/health | `platform_admin.py`, `platform_models.py` | `/admin/backups/*`, `/admin/system/*` | system permissions |
| Promotions | `promotions.py`, `promotion_service.py` | `/promotions/*`, `/public/promotions/{token}` | promotion permissions/token validation |
| Feedback | `feedback.py` | `/feedback`, exports, comments, attachments | feedback permissions |
| Search | `search.py` | `/search/global` | per-result permission filtering |

## Notes for Segment planning

- `lib/api.ts` (94 KB) remains the single frontend transport module for every domain above — confirmed still one file today. Splitting it is Phase 2 of the existing `REFACTOR_PLAN.md`, not a Phase 0/Segment 1 concern.
- `commerce.py` (152 KB) and `design_studio.py` (140 KB) remain the largest backend route modules — unchanged risk profile from the Sept 4 audit.
- The one route this pass could not include (`/admin/access/roles/[id]/edit`) should be spot-checked on the real machine before relying on this matrix as complete; nothing in this pass suggests it's broken, it simply wasn't in the build.
