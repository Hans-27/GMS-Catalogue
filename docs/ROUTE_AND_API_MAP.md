# Route and API Map

## Frontend routes

| Area | Routes |
|---|---|
| Auth | `/login`, `/register` |
| Dashboard | `/dashboard` with permission-filtered `view` |
| Admin access | `/admin/access/permissions`, `/admin/access/roles`, `/admin/users/[id]/access` |
| Admin organization | `/admin/organization/departments`, `/positions`, `/teams` |
| Admin system | `/admin/settings/*` for backup, sync, ERP, health, and information |
| Catalogue Studio | `/catalogue-studio`, `/new`, `/templates/*`, `/media`, `/exports`, `/[catalogueId]/editor`, `/preview`, `/pdf-render` |
| Catalogue compatibility | `/catalogues/[id]/preview`, `/catalogues/[id]/studio` |
| Promotions | `/promotions`, `/new`, `/calendar`, `/approvals`, `/occasions`, `/reports`, `/[id]/*` |
| Public | `/c/[token]`, `/p/[token]` |

## Backend router domains

All versioned routes are mounted below the configured API prefix, normally `/api/v1`.

| Domain | Main endpoints | Guard |
|---|---|---|
| Auth | `/auth/login`, `/auth/me`, `/auth/logout` | session/account state |
| Access | `/auth/me/permissions`, `/access/users/*`, `/access/roles/*` | SuperAdmin/permission dependencies |
| Dashboard | `/dashboard/overview`, `/dashboard/sync-status` | dashboard/system permissions |
| Products | `/products`, `/products/{id}`, status/content/images/videos | product-specific permissions and scope |
| Categories | `/categories` and lifecycle routes | category permissions |
| Pricing | `/price-lists`, `/product-prices`, `/price-change-requests` | price permissions/list access |
| Catalogues | `/catalogues`, products, lifecycle, preview, PDF/Excel | catalogue permissions and scope |
| Presentation | `/catalogues/{id}/cover`, assets, categories | cover/category permissions |
| Share links | `/catalogue-share-links/cards`, `/catalogues/{id}/share-links`, `/public/catalogues/{token}` | management guard; public token validation |
| Studio | `/catalogue-studio/designs`, pages, versions, templates, assets, exports | Studio permission keys |
| Organization | `/organization/*`, `/admin/organization/*` | organization lifecycle permissions |
| Users | `/users`, roles, overrides, reset password, unlock | user-management permissions |
| Sync | `/admin/data-sync/status`, `/history`, `/run` | sync permissions |
| Backups/health | `/admin/backups/*`, `/admin/system/*` | system permissions |
| Promotions | `/promotions/*`, `/public/promotions/{token}` | promotion permissions/token validation |
| Feedback | `/feedback`, exports, comments, attachments | feedback permissions |
| Search | `/search/global` | per-result permission filtering |

## Compatibility and consolidation notes

- Studio exposes both design-native and catalogue compatibility routes; keep both until callers are migrated and contract tests pass.
- Product routes exist in legacy catalogue and newer admin modules; map callers before consolidation.
- Success envelopes should be introduced with versioning because wrapping current payloads would break the existing client.
