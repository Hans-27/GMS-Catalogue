# Product videos

Product videos are private application assets linked to ERP product records. Catalogue editors can upload MP4/WebM files or add normalized YouTube/Vimeo HTTPS links. Uploaded binaries are never stored in PostgreSQL or mounted as public files.

## Configuration

- `PRODUCT_VIDEO_UPLOAD_DIR=./private_uploads/product-videos`
- `PRODUCT_VIDEO_MAX_SIZE_MB=100`
- `PRODUCT_VIDEO_MAX_DURATION_SECONDS=600`
- `PRODUCT_VIDEO_ALLOWED_TYPES=video/mp4,video/webm`
- `PRODUCT_VIDEO_YOUTUBE_ENABLED=true`
- `PRODUCT_VIDEO_VIMEO_ENABLED=true`
- `PRODUCT_VIDEO_DIRECT_URL_ENABLED=false`

Uploaded files are written in 1 MB chunks with generated storage names. MP4 and WebM signatures are checked. When `ffprobe` is installed, duration and resolution are read and the configured duration limit is enforced. Without FFmpeg/ffprobe, compatible MP4/WebM files are accepted as-is; no transcoding or generated thumbnail is falsely reported.

## Access and delivery

Management playback uses authenticated `/api/v1/products/{product_id}/videos/{video_id}/...` routes. Public playback is allowed only from a valid published catalogue share link and uses five-minute HMAC-signed asset URLs. Inactive/deleted videos and inactive products are rejected even when an old URL is known.

Permissions are `product_videos.view`, `upload`, `create_link`, `edit`, `delete`, `set_featured`, `publish`, and `view_inactive`. SuperAdmin bypasses permission grants. Catalogue Manager receives full video management; Catalogue Editor can view/upload/link/edit/feature; Sales User can view only customer-visible published video.

## Catalogue versions and PDF

Publishing stores the selected video, catalogue overrides, thumbnail mode, visibility and playback metadata in the immutable catalogue-version snapshot. Fixed-version share links keep that selection. Live active/public security flags may still hide a snapshot video.

Interactive players are not embedded in PDF output. Product cards show “Product video available online”; browser print layouts show the equivalent video indicator.

## Verification

From `backend`:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m tests.smoke_product_videos
```

From `frontend`:

```powershell
npx.cmd tsc --noEmit
npm.cmd run lint
npm.cmd test
npm.cmd run build
```
