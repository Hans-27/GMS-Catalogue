# Catalogue Design Studio

The Catalogue Design Studio is an authenticated visual catalogue editor built on the existing Next.js, FastAPI, SQLAlchemy, storage, audit, and RBAC layers.

## Runtime architecture

- Next.js routes under `/catalogue-studio` provide design management, the Konva editor, product-card designer, preview, templates, media, and export history.
- FastAPI routes under `/api/v1/catalogue-studio` validate percentage-based page JSON with Pydantic and enforce a permission on every operation.
- PostgreSQL stores design metadata and JSON documents. Binary media and generated exports use the existing private storage abstraction.
- Permanent version snapshots are immutable. Normal canvas movements use a debounced save and optimistic `revision` checks.
- The export worker reads the same saved JSON document as the editor and produces PDF, PNG, or JPEG files; it does not switch to a separate hard-coded catalogue layout.

## Commands

```powershell
cd "C:\Project GMS\catalogue-main\backend"
.\.venv\Scripts\alembic.exe upgrade head
.\.venv\Scripts\python.exe -m app.workers.design_export_worker --poll-seconds 2
$env:PYTHONPATH=(Get-Location).Path
.\.venv\Scripts\python.exe tests\smoke_design_studio.py

cd "C:\Project GMS\catalogue-main\frontend"
npm.cmd install
npm.cmd test -- --run
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

## Required configuration

The Studio reuses `DATABASE_URL`, `SECRET_KEY`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `MAX_COVER_UPLOAD_MB`, `CORS_ORIGINS`, and the existing authentication/session settings. `NEXT_PUBLIC_API_URL` must point to the backend API prefix, for example `http://127.0.0.1:8000/api`.

## Design document

Each page stores its logical size, type, visibility, background, and ordered elements. Elements use percentage coordinates (`xPercent`, `yPercent`, `widthPercent`, `heightPercent`) plus rotation, opacity, z-index, lock, visibility, data binding, responsive overrides, and validated style values. Arbitrary HTML, scripts, and JavaScript URLs are rejected.

Product cards store a Product Master UUID. The Studio product library returns only active products inside the catalogue's selected brand scope, with stock, barcode, and the configured price slot removed unless the actor is authorized. Saving a canvas registers its product bindings as catalogue items; catalogue-level visibility remains independent from the ERP master status. Published versions contain immutable, active-product data and authorized price snapshots. Customer-level labels are not rendered in Studio preview/PDF output.

After placing and saving a product, an editor can mark it **Active in catalogue** or **Inactive in catalogue** from the Studio product library. Inactive catalogue items remain in the editable design so they can be restored later, but are omitted consistently from live preview, published snapshots, PDF, PNG, and JPEG output. ERP-inactive products cannot be selected or made visible.

## Catalogue and promotion workflow

- New designs can start blank, from an approved company template, from a private template, from an image background, or from validated platform JSON.
- PNG, JPEG, and WebP uploads become locked page backgrounds. Platform JSON is schema/version checked and strips unsupported properties.
- PDF backgrounds need an optional PDF rasterizer and are rejected with a clear message on this installation; the platform does not claim that text inside an uploaded image/PDF is editable.
- Promotion actions follow `draft -> pending_review -> approved -> scheduled -> active -> expired`. Pause and cancel are explicit permission-protected actions. One dedicated export worker performs schedule transitions; web workers do not run schedulers.
- Autosave runs after 20 seconds of unsaved work and uses the design revision for optimistic conflict detection.

## API compatibility surface

The normalized `/api/v1/catalogue-studio/...` API is the primary implementation. Compatibility routes are also exposed for `/api/v1/catalogues/{catalogue_id}/studio`, pages, elements, product fields, authorized price lists, validation, preview, and publishing. Template aliases are exposed under `/api/v1/catalogue-templates`.

## Migrations

- `0022_catalogue_studio_commerce.py` adds multi-brand selections, two price slots, catalogue product visibility, page locks, and promotion configuration.
- `0023_catalogue_template_governance.py` adds template ownership scope, department/team scope, company approval, and approval audit fields.

## Packages

The editor uses `konva@10.0.12` and `react-konva@19.0.10`. One canvas framework was selected to avoid competing scene graphs; Konva provides maintained React bindings, transforms, rotation, drag events, and high-resolution client image export.
