# Permission Matrix

## Evaluation model

| Priority | Source | Behavior |
|---:|---|---|
| 1 | Protected SuperAdmin | Full access; sensitive changes require confirmation |
| 2 | Direct user deny | Overrides inherited allow |
| 3 | Direct user allow | Grants the requested action/scope |
| 4 | Department/team/position/direct roles | Combined inherited grants |
| 5 | Default | Deny |

Record scopes: `all`, `department`, `team`, `own`, `assigned_brands`, `assigned_categories`, `assigned_catalogues`, `assigned_products`, `none`.

## Standard role intent

| Role | Intended access |
|---|---|
| SuperAdmin | Unrestricted administration and protected system actions |
| System User/Operator | Operational system tasks explicitly granted |
| Catalogue Manager/Admin | Full catalogue and Studio management, publish, templates, media |
| Catalogue Editor/Product Editor | Draft/edit Studio content and media without unrestricted administration |
| Catalogue Approver | Review, approve/reject, publish where granted |
| Sales Manager | View/export catalogues, permitted prices, and catalogue share links |
| Sales User | View products/catalogues/media explicitly granted by scope |
| Price Manager | Price proposals, edits, approval, and history |
| Promotion Manager/Approver/Publisher | Segregated promotion authoring, approval, and publication |
| Auditor | Read-only product/catalogue/audit/history access |
| Viewer | Minimal dashboard/catalogue preview access |

## Critical permission groups

| Area | Representative keys |
|---|---|
| Products | `products.view`, `products.edit`, status/image/video permissions |
| Catalogues | `catalogues.view`, `catalogues.edit`, `catalogues.preview`, `catalogues.publish`, exports |
| Share links | `catalogue_share_links.view`, `.create`, `.copy`, `.edit`, `.regenerate`, `.revoke`, `.delete` |
| Studio | `catalogue_designs.*`, `catalogue_studio.*`, `design_media.*`, `templates.*` |
| Prices | `prices.view`, `.edit`, `.propose`, `.approve`, `.reject`, `.view_history` |
| Users/access | `users.*`, `roles.*`, organization assignment permissions |
| Operations | `data_sync.*`, `backups.*`, `system_metrics.view`, `audit_logs.*` |

## Sensitive combinations

- `catalogue_share_links.view` displays link controls; `.copy` exposes an existing URL; `.create` creates a missing link.
- `design_media.view` allows listing/reading authorized Studio assets; upload/edit/delete remain separate.
- Price-list access and `prices.view` are both required; no-price audiences never receive numeric values.
- Menu visibility is convenience only. Every API endpoint must enforce the same permission server-side.

## Administration procedure

1. Assign department, position, and team.
2. Prefer reusable role grants over direct user overrides.
3. Select the narrowest record scope.
4. Assign only required price lists.
5. Use explicit direct deny for exceptions.
6. Record a reason, save, and verify through the effective-access simulator.
7. Test the account against both UI and direct API access.
