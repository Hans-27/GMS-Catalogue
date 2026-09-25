# Permission Matrix

Reconciled from `docs/PERMISSION_MATRIX.md` (2026-09-04) and confirmed against `backend/app/access.py` source in this pass (not just documentation — the precedence chain below was read directly out of the evaluator functions).

## Evaluation model (confirmed in code, `access.py`)

| Priority | Source | Behavior | Code reference |
|---:|---|---|---|
| 1 | Protected SuperAdmin | Full access; sensitive changes require reauthentication | `is_superadmin()`, checked first in `effective_permission_access()` and `has_permission()` |
| 2 | Direct user deny | Overrides inherited allow | `effective_permission_names()` — "explicit-deny-wins rule"; `effective_permission_access()` returns `PermissionAccess(False, {"none"}, ["direct_deny"])` |
| 3 | Direct user allow | Grants the requested action/scope | override table, evaluated after deny check |
| 4 | Department/team/position/direct roles | Combined inherited grants | role/position/department join evaluated in `effective_permission_names()` |
| 5 | Default | Deny | fallback when nothing above matches |

Record scopes confirmed present: `all`, `department`, `team`, `own`, `assigned_brands`, `assigned_categories`, `assigned_catalogues`, `assigned_products`, `none`. `"all" in access.scopes or is_superadmin(user)` is the scope-bypass condition (line ~387 of `access.py`).

**This pass's verification:** the precedence order was read directly from the function bodies (not re-derived from docs), and `require_superadmin()` raises `403` when `is_superadmin()` is false — confirmed present, unchanged from the Sept 4 description. A live end-to-end test (log in as each role, hit each endpoint) was not run this pass — see Release Checklist.

## Standard role intent (unchanged from Sept 4, carried forward)

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

## Critical permission groups (unchanged)

| Area | Representative keys |
|---|---|
| Products | `products.view`, `products.edit`, status/image/video permissions |
| Catalogues | `catalogues.view`, `catalogues.edit`, `catalogues.preview`, `catalogues.publish`, exports |
| Share links | `catalogue_share_links.view`, `.create`, `.copy`, `.edit`, `.regenerate`, `.revoke`, `.delete` |
| Studio | `catalogue_designs.*`, `catalogue_studio.*`, `design_media.*`, `templates.*` |
| Prices | `prices.view`, `.edit`, `.propose`, `.approve`, `.reject`, `.view_history` |
| Users/access | `users.*`, `roles.*`, organization assignment permissions |
| Operations | `data_sync.*`, `backups.*`, `system_metrics.view`, `audit_logs.*` |

## Known open items (from Bug Register)

- BUG-003: Sales User's default share-link grants are a configuration question, not a code defect — the deny-by-default behavior itself is correct and was not bypassed.
- BUG-004: `design_media.view` grant fix is carried forward as resolved but not re-confirmed live this pass (requires seeded role state).
- No automated endpoint-level access-matrix test suite (every permission × every endpoint) exists yet — `REFACTOR_PLAN.md` Phase 3 already calls for this; still not done as of this pass.

## Administration procedure (unchanged, for reference)

1. Assign department, position, and team.
2. Prefer reusable role grants over direct user overrides.
3. Select the narrowest record scope.
4. Assign only required price lists.
5. Use explicit direct deny for exceptions.
6. Record a reason, save, and verify through the effective-access simulator.
7. Test the account against both UI and direct API access.
