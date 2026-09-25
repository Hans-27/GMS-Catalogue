# GMS Catalogue Management System

## Production deployment

The supported production path uses Docker Compose with PostgreSQL, a private FastAPI service, a standalone Next.js server, and a dedicated ERP synchronization worker. Follow [RELEASE.md](RELEASE.md); its preflight script rejects placeholder secrets, insecure origins, and unsafe production settings before containers start.

```powershell
Copy-Item .env.production.example .env.production
# Replace every placeholder in .env.production, then:
.\scripts\deploy-production.ps1 -ValidateOnly
.\scripts\deploy-production.ps1
```

## Windows development startup

Start both services from the repository root. The process-scoped bypass is required on machines that block local `.ps1` files; it does not modify the machine execution policy:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-all.ps1"
```

Or start either service in the foreground:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-frontend.ps1" -Foreground
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\start-backend.ps1" -Foreground
```

Check or stop workspace-owned services:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\check-services.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\scripts\stop-all.ps1"
```

The frontend uses `npm.cmd run dev` on port 3000. The backend uses its local virtual environment and starts `app.main:app` on internal port 8001. Synchronization and PDF workers are controlled by backend environment settings and start through the FastAPI lifespan. PostgreSQL is configured with `DATABASE_URL`; see `PLATFORM_OPERATIONS.md` for production operations.

For devices on the same local network, open `http://172.16.1.94:3000`. Public catalogue links use this configured LAN origin; ngrok is not required. The frontend proxies `/api` requests to the backend, and the backend also listens on port 8001 for direct LAN diagnostics. If this computer receives a different IP address, update `PUBLIC_APP_URL`, `allowedDevOrigins`, and the matching LAN origin in `CORS_ORIGINS`.

The configurable cover editor, catalogue presentation, category navigation, PostgreSQL/application backups, and System Health setup are documented in [PLATFORM_OPERATIONS.md](PLATFORM_OPERATIONS.md).
Product Active/Inactive lifecycle, the read-only MSSQL mapping, dedicated three-minute worker, monitoring, and deployment are documented in [PRODUCT_SYNC_OPERATIONS.md](PRODUCT_SYNC_OPERATIONS.md).
Release acceptance and regression testing are documented in [PLATFORM_TEST_CHECKLIST.md](PLATFORM_TEST_CHECKLIST.md).
The source-code map and rules for locating future changes are documented in [docs/CODE_STRUCTURE.md](docs/CODE_STRUCTURE.md).

This repository contains the catalogue operations platform:

- `backend/` - FastAPI, SQLAlchemy, PostgreSQL/SQLite, authentication, media and
  catalogue workflow APIs
- `frontend/` - Next.js App Router login, registration and protected catalogue
  workspace

## Quick start on Windows

Double-click `run_platform.bat`. It starts the database API and frontend without
requiring PowerShell script permissions, verifies both services, and opens:

- http://127.0.0.1/login

The local configuration uses the persistent SQLite database at
`backend/.local/catalogue_demo.db`. PostgreSQL deployments use Alembic migrations;
the numbered SQL files remain available for manual pgAdmin installations.

The current review build is **Demo v0.1.0**. Its banner, role accounts, seeded
presentation data, walkthrough and verification checklist are documented in
[DEMO_PRESENTATION.md](DEMO_PRESENTATION.md). This is a user-testing environment,
not a finished production release.

ERP-owned product fields are synchronized through a controlled API.
SuperAdmin and catalogue administrators can make audited corrections to product
name, barcode, brand, ERP category, price and stock quantity. Catalogue staff manage
customer-facing copy, categories, images, merchandising, review, approval,
visibility and publication.

## Platform capabilities

- searchable ERP product library and stock/price visibility
- guided administrator form for creating a complete product without an ERP import
- administrator-only ERP product upsert boundary
- catalogue descriptions and SEO metadata
- category taxonomy and product assignment
- JPEG, PNG and WebP product image management
- primary-image selection and accessible alt text
- draft, review, approval, publish and unpublish workflow
- role-aware editor, approver and administrator actions
- dashboard metrics, quality checks and workflow pipeline
- one-click work queues for missing descriptions, images and categories
- live database-connection status in the protected workspace
- administrator User Control for roles, activation, password reset and lockouts
- catalogue and authentication audit trails
- secure registration, login, session validation and logout
- configurable Normal, VIP, Big Customer, Dealer, Wholesale, Retail and No Price lists
- append-only price records with proposal, approval, rejection and full reasons
- real multi-product catalogues with ordered membership and description overrides
- optimistic catalogue revisions that prevent silent concurrent overwrites
- immutable published catalogue snapshots and version history
- backend-enforced No Price previews, PDF exports and Excel exports
- dedicated responsive catalogue preview routes with full-screen, print and
  version-aware immutable presentation data
- image-rich A4 PDF generation with Thai-capable font discovery, page numbers,
  safe price visibility and meaningful download filenames
- individual user permission allow/deny overrides, with deny taking precedence
- request IDs, origin-based cookie request protection and API security headers
- in-app feedback submission with optional screenshots
- permission-aware feedback triage, assignment, internal notes and CSV/XLSX export
- visible Demo Environment status, review guidance and demo version

## 1. Configure PostgreSQL

Create an empty PostgreSQL database in pgAdmin 4 (for example
`catalogue_management`), then copy the backend environment file:

```powershell
Copy-Item backend\.env.example backend\.env
```

Update `DATABASE_URL` with the PostgreSQL username, password, host, port and
database you created. Generate a strong application key:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(64))"
```

Paste that value into `SECRET_KEY` in `backend/.env`.

In pgAdmin 4, open the database Query Tool and execute these scripts in order:

1. `backend/sql/001_authentication.sql`
2. `backend/sql/002_catalogue_platform.sql`
3. `backend/sql/003_organization_access.sql`
4. `backend/sql/004_prices_and_catalogues.sql`
5. `backend/sql/005_demo_feedback.sql`

The recommended migration command is:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

The baseline migration is safe for a clean database and creates missing tables
for an existing first-release database. Back up production data before every
schema deployment.

The application can create the same tables automatically during local
development. Set `SEED_DEMO_DATA=false` when real ERP synchronization supplies
the product records.

## 2. Start the FastAPI backend

For a one-click Windows launch, double-click `run_api.bat`. To avoid Windows
reload-process issues, the stable command is:

```powershell
run_api.bat -NoReload
```

Alternatively, start it manually:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m app.scripts.create_admin
uvicorn app.main:app --port 8001
```

The development configuration creates the tables and reference catalogue on
first startup. The API and its interactive documentation are available at:

- Public application: http://localhost/
- Same-origin API health: http://localhost/api/health
- Internal API documentation: http://localhost:8001/docs
- Internal uploaded media: http://localhost:8001/uploads/

The admin script prompts for the initial Superadmin credentials without storing
a plain-text password. Accounts created from the public Create Account form
receive the `system_user` role and are signed in immediately. Existing users can
sign in with either their username or email address; both are matched
case-insensitively.

Backend verification:

```powershell
cd backend
.\.venv\Scripts\python.exe -m tests.smoke_auth
.\.venv\Scripts\python.exe -m tests.smoke_catalogue
.\.venv\Scripts\python.exe -m tests.smoke_users
.\.venv\Scripts\python.exe -m tests.smoke_organization
.\.venv\Scripts\python.exe -m tests.smoke_pricing_catalogues
.\.venv\Scripts\python.exe -m tests.smoke_feedback
.\.venv\Scripts\python.exe -m tests.smoke_product_lifecycle_sync
```

Run the read-only persistence audit against the configured live database:

```powershell
cd backend
.\.venv\Scripts\python.exe -m app.scripts.audit_database
```

The audit checks required business tables, database integrity, foreign-key/orphan relationships, record counts, and local product/cover media references without exposing credentials or changing data.

Frontend verification:

```powershell
cd frontend
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

## 3. Start the Next.js frontend

Open another PowerShell window:

```powershell
cd frontend
Copy-Item .env.local.example .env.local
npm.cmd install
npm.cmd run dev
```

Open http://localhost/login.

## Authentication flow

1. `POST /api/auth/register` validates the account, hashes the password, inserts
   the user and `system_user` role assignment, and returns an HTTP-only session
   cookie.
2. `POST /api/auth/login` accepts a username or email plus the password and
   returns the same type of session cookie.
3. `GET /api/auth/me` validates the cookie before the workspace displays user
   data.
4. `POST /api/auth/logout` records the audit event and clears the cookie.

Passwords are never returned by the API and are stored only as Argon2 hashes in
the `users.password_hash` column.

## Catalogue workflow

1. An ERP integration can send product-master records to
   `POST /api/catalogue/erp/sync`. A SuperAdmin or catalogue administrator can
   also choose **Products → New product** to create a complete record directly.
2. Users open **Products** and choose a Catalogue Builder queue to work through
   missing descriptions, images or category assignments.
   SuperAdmin and catalogue administrators can also select **New product** to
   create a record with SKU, name, brand, barcode, unit, price, quantity,
   descriptions and categories in one guided form.
3. Editors save customer-facing fields in `catalogue_entries`, assign
   an editable display name, descriptions and categories, then upload product
   images. Administrators can separately save audited product-master corrections.
4. Editors submit complete drafts for review.
5. Approvers approve reviewed content and publish it.
6. Published products become public; unpublishing returns a product to a hidden
   draft.
7. Every catalogue mutation is written to `catalogue_audit_logs`.

Editing approved or published content deliberately returns it to a hidden draft
so unreviewed changes cannot remain public.

## Price and catalogue workflow

1. SuperAdmin creates or activates configurable price lists. A **No Price** list
   is a database record, not a hard-coded frontend mode.
2. Authorized users propose a price with an effective date and mandatory reason.
   Approvers accept or reject the request. Approval inserts a new price record;
   previous records remain available as history.
3. Catalogue editors create a catalogue, choose its audience, language and price
   policy, then add and order products. Catalogue descriptions can be overridden
   without changing the product master.
4. Preview reads current draft data. Publish creates an immutable JSON snapshot
   containing the selected product text, images, ordering and approved effective
   price.
5. Later product or price changes never alter an older published version. A new
   publication creates the next version.
6. When prices are disabled or the No Price list is selected, product price and
   currency fields are omitted by the backend from preview, version, PDF and Excel
   output.

The normalized APIs are under `/api/v1`, including `/price-lists`,
`/product-prices`, `/price-change-requests`, `/catalogues`, catalogue products,
versions, preview, publish, duplicate, archive and export endpoints. Existing
first-release APIs remain under `/api` for compatibility.

Catalogue presentation endpoints include:

- `GET /api/v1/catalogues/{id}/preview?version=3`
- `GET /api/v1/catalogues/{id}/export/pdf?version=3&language=en&paper_size=A4`
- `POST /api/v1/catalogues/{id}/print?version=3`

Preview and PDF use the same safe presentation object. Published versions read
their immutable snapshot; draft previews read the current builder state. No Price
catalogues and users without price permission receive no price or currency fields.

## Organization and brand access

SuperAdmin and catalogue administrators can open **Organization** in the
dashboard to maintain the company structure:

- **Departments** support an optional parent department.
- **Positions** belong to a department and carry a seniority level.
- **Teams** belong to a department and can manage one or more brands.
- **Brands** can be shared by multiple teams.
- **Permissions** use `module.action` codes and are assigned to roles by
  SuperAdmin.
- The dedicated **Permissions** page lets SuperAdmin assign the same granular
  permissions to positions and teams. A user's effective permissions are the
  union of their role, position and every assigned team.
- **Catalogue access** is a SuperAdmin-managed department-by-brand matrix with
  Hidden, View and Manage levels.

Open **Users** to assign each account a department, position, employee code and
one or more teams. Roles determine what a user can do; team membership
determines which brands the user is responsible for. Department catalogue
rules determine which brands appear for department members. A user must have
both the relevant role permission and brand scope to change catalogue data.

For PostgreSQL, apply `backend/sql/003_organization_access.sql`. Local SQLite
development creates the new tables automatically when the API starts.

## Security

- Argon2 password hashing
- HTTP-only authentication cookies
- short or remembered session expiry
- per-account failed-login lockout
- generic login errors to avoid account discovery
- login, failed-login, logout and catalogue audit records
- disabled and locked account checks
- role-gated edit, approval, publication and administration actions
- self-lockout and final-SuperAdmin protection in User Control
- validated image content type, size and storage path
- credentialed CORS restricted to configured frontend origins
- explicit backend permission dependencies with SuperAdmin bypass
- individual allow/deny permission overrides where deny wins
- immutable publication snapshots and audited export actions
- origin validation for authenticated browser mutations
- request IDs and defensive response headers

For production, terminate HTTPS at the reverse proxy, set
`COOKIE_SECURE=true`, use a private high-entropy `SECRET_KEY`, disable automatic
table creation and demo data, and manage schema updates through reviewed
migrations.

## Docker Compose

Docker Desktop or Docker Engine with Compose is required:

```powershell
$env:SECRET_KEY = "replace-with-a-long-random-secret"
$env:POSTGRES_PASSWORD = "replace-with-a-strong-database-password"
docker compose up --build
```

Compose starts PostgreSQL, runs `alembic upgrade head`, starts FastAPI on port
8000 and starts the production Next.js server on port 3000. Docker is not bundled
with this repository.

## Required environment variables

- `DATABASE_URL`: SQLAlchemy PostgreSQL or SQLite URL.
- `SECRET_KEY`: private high-entropy JWT signing key.
- `CORS_ORIGINS`: comma-separated trusted frontend origins.
- `PUBLIC_APP_URL`: externally reachable frontend origin used to generate secure customer catalogue links (for example `https://catalogue.example.com`).
- `COOKIE_SECURE`: set `true` behind production HTTPS.
- `AUTO_CREATE_TABLES`: local convenience only; use `false` in production.
- `SEED_DEMO_DATA`: set `false` when ERP data is authoritative.
- `UPLOAD_DIR` and `MAX_UPLOAD_MB`: media storage directory and upload limit.
- `NEXT_PUBLIC_API_URL`: browser-visible API base, normally
  `https://your-host/api` in production.

## Production deployment notes

- Put the frontend and API behind an HTTPS reverse proxy such as IIS, Nginx or
  Traefik. Forward `X-Forwarded-For` and preserve `X-Request-ID`.
- Store secrets in Windows service environment variables, Docker secrets or a
  managed secret store; never commit `backend/.env`.
- Back up PostgreSQL and the upload storage together before migration or release.
- Run Alembic once per release before starting multiple API instances.
- Use shared S3-compatible object storage before scaling the API to multiple
  servers; the current local upload adapter is intended for one-server operation.
#   g m s c a t a l o g  
 #   g m s c a t a l o g  
 #   G M S - C a t a l o g u e  
 
