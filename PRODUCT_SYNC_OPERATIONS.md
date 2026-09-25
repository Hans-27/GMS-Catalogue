# Product lifecycle and ERP synchronization

## Architecture

MSSQL GMS ERP is read-only source data. The application database (PostgreSQL in production, SQLite for the local launcher) stores catalogue products, normalized price history, warehouse stock, lifecycle status, images, descriptions, catalogue assignments, synchronization runs, and the synchronization lease. FastAPI never schedules jobs. One separate worker executes the same synchronization service used by **Sync Now**.

The lease in `product_sync_locks` prevents overlapping workers. A run is recorded in `erp_sync_runs` as running, completed, completed with warnings, failed, or skipped. Batches default to 500 rows. Temporary failures use 15, 30, and 60-second backoff; changes are transactional and the last valid stock and prices remain intact.

The local SQLite launcher enables WAL and a busy timeout so API reads remain available during the first large refresh. Production PostgreSQL remains the recommended multi-user database because it provides concurrent writers while a synchronization transaction is active.

## Source ownership

ERP-controlled values are product code/name, brand, ERP category, barcode when unique, unit, discontinued source flag, source timestamp, warehouse on-hand stock, total stock, and mapped selling prices. The verified price mapping is `Price01 -> NORMAL`, `Price02 -> VIP`, `Price03 -> BIG_CUSTOMER`, `Price04 -> DEALER`, and `Price05 -> WHOLESALE`.

Locally controlled values are Active/Inactive status and reason, marketing descriptions, display name, Thai/English catalogue copy, images, category merchandising, catalogue membership/order/overrides, cover settings, and publishing workflow. Synchronization never changes or deletes these fields. Zero stock and a missing source price never change lifecycle status. Missing ERP products are flagged, not deleted.

The current ERP exposes on-hand stock per warehouse. Because separate reserved and incoming values are not present in the verified source query, synchronized `available` equals `on_hand`; `reserved` and `incoming` remain zero until verified source columns are configured.

## Commands

Apply the schema before starting services:

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

Start each process separately on Windows:

```powershell
# API
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Dedicated synchronization worker
cd backend
.\.venv\Scripts\python.exe -m app.workers.product_sync_worker

# Frontend
cd frontend
npm.cmd run dev
```

`run_platform.bat` starts all three processes and writes worker logs to `.local/product-sync.log` and `.local/product-sync-error.log`.

For Windows Server, install the worker with NSSM using the backend virtual-environment Python executable, arguments `-m app.workers.product_sync_worker`, and the backend directory as Startup Directory. Configure automatic startup and service recovery. Task Scheduler is also supported: run at system startup, use the same executable/arguments/directory, and select “Do not start a new instance” if already running. The database lease still protects against overlap.

For Docker/Linux, run `python -m app.workers.product_sync_worker` as exactly one independently supervised service. `docker compose up -d` includes `product-sync-worker`. Scale the API as needed, but do not place the scheduler in Uvicorn. The database lease provides an additional safety boundary if two worker processes are accidentally started.

## Administration and monitoring

Configure and test the encrypted, read-only ERP connection at `/admin/settings/erp`. Monitor runs or choose **Sync Now** at `/admin/settings/data-sync`. The page polls every 30 seconds, disables the button while a run holds the lease, shows warning/critical stale states after 360/900 seconds, offers run details, and exposes a safe CSV error report without connection credentials.

Required permissions are `data_sync.view`, `data_sync.run`, and `data_sync.configure`. SuperAdmin bypasses permission checks. Product lifecycle uses `products.view_inactive` and `products.change_status` in addition to normal product viewing/data scopes.

Manual API endpoints:

- `GET /api/v1/admin/data-sync/status`
- `GET /api/v1/admin/data-sync/history`
- `GET /api/v1/admin/data-sync/history/{run_id}`
- `GET /api/v1/admin/data-sync/history/{run_id}/errors.csv`
- `POST /api/v1/admin/data-sync/run`

Product lifecycle endpoints:

- `GET /api/v1/products?status=active|inactive|all`
- `GET /api/v1/products/{product_id}`
- `GET /api/v1/products/{product_id}/status-history`
- `PATCH /api/v1/products/{product_id}/status`

No in-process catalogue/PDF cache currently exists. Customer previews, public endpoints, PDF, print, and Excel read current product lifecycle state on every request. Status and source-data changes also update affected catalogue timestamps, which is the platform's cache-invalidation boundary if an external cache is added later.

## Verification

```powershell
cd backend
.\.venv\Scripts\python.exe -m tests.smoke_product_lifecycle_sync

cd ..\frontend
npm.cmd test
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```
