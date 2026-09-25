# Code structure

Use this map before changing the platform. It keeps route code, reusable UI,
business rules, integrations, and generated output separate.

## Repository map

```text
catalogue-main/
├─ backend/                 FastAPI application and database code
│  ├─ app/                  API routes, domain services, models and schemas
│  ├─ alembic/              Database migrations
│  ├─ tests/                Backend tests and smoke checks
│  └─ sql/                  Manual/reference SQL scripts
├─ frontend/                Next.js application
│  ├─ src/
│  │  ├─ app/               App Router pages, layouts and route-specific UI
│  │  ├─ components/        Reusable UI used by multiple routes
│  │  ├─ hooks/             Reusable React hooks
│  │  ├─ lib/               API client, access rules and shared utilities
│  │  ├─ config/            Frontend configuration
│  │  └─ test/              Shared test setup
│  ├─ e2e/                  Playwright browser tests
│  ├─ public/               Static browser assets
│  └─ scripts/              Frontend maintenance scripts
├─ scripts/                 Platform start, stop and diagnostic commands
├─ docs/                    Architecture and operations documentation
└─ artifacts/               Generated evidence; not application source
```

Generated and runtime directories such as `.next`, `node_modules`, `.venv`,
cache folders, uploads, reports and local databases are hidden in the shared
VS Code Explorer configuration. They are not source-code locations.

## Where common catalogue changes belong

| Change | Primary location |
|---|---|
| Dashboard catalogue management | `frontend/src/features/catalogues/catalogue-management.tsx` |
| Catalogue cover editor | `frontend/src/features/catalogues/cover-editor.tsx` |
| Public customer catalogue | `frontend/src/app/c/[token]/` |
| Authenticated preview | `frontend/src/app/catalogues/[id]/preview/` |
| Catalogue Studio | `frontend/src/app/catalogue-studio/` and `frontend/src/app/catalogues/[id]/studio/` |
| Product card UI | `frontend/src/components/catalogue-product-card.tsx` |
| Catalogue navigation | `frontend/src/components/catalogue-sidebar.tsx` |
| Frontend API calls and types | `frontend/src/lib/api.ts` |
| Permissions in the browser | `frontend/src/lib/access.tsx` |
| Catalogue API and exports | `backend/app/commerce.py` |
| Public tokens and online catalogue | `backend/app/catalogue_share_links.py` |
| ERP stock and price integration | `backend/app/erp_integration.py` |
| Backend permissions | `backend/app/access.py` |
| Database models | `backend/app/models.py`, `backend/app/commerce_models.py` |

Keep Next.js route folders under `frontend/src/app`; moving them changes public
URLs. Route workspaces with one business purpose belong in `frontend/src/features`.
Put a component in `frontend/src/components` only when more than one route uses
it. Keep tests beside the source they protect (`name.test.tsx` or
`test_name.py`). Add database changes through Alembic instead of editing a live
database manually.

## Safe editing rules

1. Search for callers before renaming or moving a source file.
2. Do not edit generated folders, uploads, local databases or dependency code.
3. Keep English and Thai labels in the centralized translation modules.
4. Keep ERP credentials in environment files; never hard-code them in source.
5. Run the closest unit test first, then TypeScript/backend checks appropriate
   to the changed boundary.

VS Code nests matching tests and CSS modules under their source `.tsx` file.
Use the Explorer's **Files: Exclude** setting if a hidden runtime folder must be
inspected temporarily.
