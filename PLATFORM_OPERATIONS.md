# Catalogue Platform — Presentation and Operations

## Architecture

Next.js calls protected FastAPI endpoints using the existing secure session cookie. FastAPI enforces backend permissions, builds version-aware presentation data, and writes audit events. SQLAlchemy/Alembic store cover metadata, catalogue-specific categories, backup jobs/schedules, and summarized metric snapshots. Media and archives remain on server storage rather than inside PostgreSQL.

Catalogue versions snapshot the complete cover settings, exact asset references, category settings, product order, and permitted prices. Preview and PDF use the same version; later draft edits never change an already-published version.

## Routes and endpoints

Frontend routes:

- `/catalogues/[id]/preview`
- `/admin/settings/general`
- `/admin/settings/backups`
- `/admin/settings/system-health`
- `/admin/settings/system-information`

Catalogue APIs:

- `GET|PUT /api/v1/catalogues/{catalogue_id}/cover`
- `POST /api/v1/catalogues/{catalogue_id}/cover/assets`
- `PATCH|DELETE /api/v1/catalogues/{catalogue_id}/cover/assets/{asset_id}`
- `GET /api/v1/catalogues/{catalogue_id}/cover/assets/{asset_id}/content`
- `GET /api/v1/catalogues/{catalogue_id}/cover/preview`
- `POST /api/v1/catalogues/{catalogue_id}/cover/reset`
- `POST /api/v1/catalogues/{catalogue_id}/cover/publish`
- `GET|PUT /api/v1/catalogues/{catalogue_id}/categories`
- `POST|DELETE /api/v1/catalogues/{catalogue_id}/categories/{category_id}/banner`
- `GET /api/v1/catalogues/{catalogue_id}/preview`
- `GET /api/v1/catalogues/{catalogue_id}/export/pdf`

Administration APIs:

- `GET|POST /api/v1/admin/backups/{database|application}`
- `GET|DELETE /api/v1/admin/backups/{database|application}/{backup_id}`
- `GET /api/v1/admin/backups/{database|application}/{backup_id}/download`
- `GET|PUT /api/v1/admin/backup-schedules/{database|application}`
- `GET /api/v1/admin/system/metrics`
- `GET /api/v1/admin/system/information`

## Permissions

All are enforced in FastAPI. SuperAdmin inherits all permissions.

- `catalogues.view`, `catalogues.preview`, `catalogues.edit`, `catalogues.export_pdf`, `catalogues.print`
- `catalogues.cover.view`, `catalogues.cover.upload`, `catalogues.cover.edit`, `catalogues.cover.delete`, `catalogues.cover.publish`
- `catalogue_categories.view`, `catalogue_categories.manage`
- `settings.view`, `settings.manage`
- `backups.view`, `backups.create`, `backups.download`, `backups.delete`, `backups.schedule`, `backups.restore`
- `system_metrics.view`, `system_information.view`

## Migration

Alembic revision `0003_catalogue_operations` adds the operational tables. Revision `0004_cover_page_editor` adds `catalogue_cover_settings` and `catalogue_cover_assets`, including soft-deleted asset history for restore and immutable version references.

```powershell
cd backend
.\.venv\Scripts\python.exe -m alembic upgrade head
```

## Packages, tools, and environment

Python additions are `Pillow`, `pypdf`, `psutil`, and `CairoSVG`. `reportlab` remains the PDF engine. Database backup requires `pg_dump` at least as new as the PostgreSQL server.

```text
DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:5432/catalogue_management
UPLOAD_DIR=./uploads
COVER_UPLOAD_DIR=./private_uploads/catalogue-covers
MAX_COVER_UPLOAD_MB=20
MAX_COVER_DIMENSION=12000
BACKUP_DIR=./backups
APPLICATION_ROOT=..
PG_DUMP_PATH=pg_dump
ENABLE_BACKUP_RESTORE=false
BACKUP_RETENTION_DAYS=30
BACKUP_RETENTION_COUNT=10
HEALTH_CPU_WARNING=85
HEALTH_MEMORY_WARNING=85
HEALTH_DISK_WARNING=85
HEALTH_DATABASE_MS_WARNING=500
```

Windows: `PG_DUMP_PATH=C:\Program Files\PostgreSQL\17\bin\pg_dump.exe`. Linux: `PG_DUMP_PATH=/usr/bin/pg_dump`. The backend Docker image installs `postgresql-client`; production Compose uses named database, upload, private-media, PDF-cache, and backup volumes.

## Backups

Database backup creates a job, prevents a concurrent same-type job, and invokes `pg_dump --format=custom` with a fixed executable and validated arguments. The password exists only in the child environment and is never returned or logged. Completed files receive a SHA-256 checksum and are downloaded only through the protected endpoint.

This workstation's current `.env` uses SQLite, so Database Backup correctly reports `Failed` rather than making a fake dump. Change `DATABASE_URL` to reachable PostgreSQL, migrate, and restart. Docker Compose is already wired for PostgreSQL and `/usr/bin/pg_dump`.

Application backup creates a real sanitized ZIP from named trusted components. It excludes `.env`, secret files, `.git`, `node_modules`, virtual environments, caches, logs, temporary files, and previous backups. Restore stays unavailable while `ENABLE_BACKUP_RESTORE=false`.

## System Health

The protected `psutil` metrics work on Windows, Linux, and containers: CPU/cores, memory, disk, system/application uptime, safe version/environment, PostgreSQL health/details when available, storage usage, and backup status. Credentials, connection strings, environment values, tokens, private keys, and sensitive paths are never returned. The UI refreshes every seven seconds, pauses in hidden tabs, stops on unmount, and stops automatic retries after repeated failures.

## Using the Cover Page Editor

Sign in with catalogue cover permissions, open **Catalogues**, edit a catalogue, and use **Cover Page Editor**.

1. Choose **Custom cover builder** to upload a background plus independent logos, or **Full finished cover image** to upload one completed cover. Full-image mode turns overlays off initially to avoid duplicate title text.
2. Upload PNG, JPG/JPEG, WebP, or sanitized SVG assets. The maximum file size is 20 MB and the maximum dimension is 12,000 pixels. Transparent PNG or WebP is recommended for logos.
3. Edit the catalogue name, year, subtitle, colors, display flags, and image fit. The saved name also updates the catalogue card, preview header, browser title, print output, PDF cover, and PDF filename.
4. Drag title, subtitle, logos, and decorative artwork on the live preview. Drag a selected image's lower-right handle to resize it. Use the crop-focus sliders for cover/background positioning. All positions and sizes are saved as percentages.
5. Check Desktop, Tablet, Mobile, A4 PDF, or Full screen; then choose **Save Draft**. **Publish Cover** saves the cover and publishes a new immutable catalogue version.
6. Open **Preview catalogue**, confirm **Back to Cover** and sidebar branding, then download PDF. Page 1 uses the same saved configuration and contains no editor controls.

Cover files are kept under `COVER_UPLOAD_DIR`, outside the public upload mount. Authenticated asset delivery checks `catalogues.cover.view` or `catalogues.preview`; direct unpublished asset access is not public. Replaced and removed files remain soft-retained for version history and **Restore**.

Categories are derived only from products included in this catalogue and follow builder order. Catalogue-only names/descriptions/banners do not alter master categories. Clicking a category updates the URL hash and smooth-scrolls to the section; mobile uses a closeable drawer.

## Startup and tests

Windows combined startup (automatically detects the current office LAN address):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run_platform.ps1
```

Use an explicit address only when automatic detection is not suitable:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run_platform.ps1 -PublicAppUrl http://10.20.30.40:3000
```

Separate backend and frontend terminals:

```powershell
# Backend terminal: detects the LAN address and supplies it to FastAPI.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\run_api.ps1 -Port 8001 -ListenAddress 0.0.0.0

# Frontend terminal:
Set-Location .\frontend
npm.cmd run dev
```

The API must be restarted after the computer changes networks or receives a different DHCP address. Previously copied IP-based links are not updated, but every link returned and copied by the restarted platform uses the newly detected origin. The frontend continues proxying `/api` and `/uploads` to the loopback backend address.

Linux/Docker: `docker compose up --build`.

Verification:

```powershell
cd backend
.\.venv\Scripts\python.exe -m tests.smoke_platform_operations
.\.venv\Scripts\python.exe -m tests.smoke_pricing_catalogues
cd ..\frontend
npm.cmd run test -- --run
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

## Genuine limitations

- Schedule/retention configuration is persisted, but automated execution needs an external scheduler or worker.
- Restore is intentionally unavailable in the demo.
- Master categories currently have no parent relationship, so taxonomy is flat until that master-data field is added.
- Replaced media referenced by immutable versions is retained; future cleanup must delete only proven-unreferenced files.
