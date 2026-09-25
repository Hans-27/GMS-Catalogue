# Online Catalogue Cover Upload

## Goal

Allow an authorized Sales Admin to upload a finished cover image in Catalogue Studio. After the catalogue is published, the uploaded image replaces the generated green cover in the online customer catalogue. PDF output is unchanged.

## Scope

### Included

- A dedicated **Cover page** entry in Catalogue Studio.
- Upload of one finished PNG, JPG/JPEG, or WebP cover image, up to 20 MB.
- Immediate Studio preview of the selected image.
- Replace and remove actions.
- Draft-safe changes that become customer-visible only when the catalogue is published.
- Responsive online rendering without stretching or UI overlap.
- The existing generated green cover as the fallback when no published online cover exists.

### Excluded

- Cover composition tools, text editing, logos, colours, or element positioning.
- Changes to the PDF or print cover.
- Multiple cover variants, scheduled covers, or audience-specific covers.
- Customer-side cover editing.

## User Flow

1. The Sales Admin opens a catalogue in Catalogue Studio.
2. They select **Cover page** in the Studio sidebar.
3. They drag and drop a finished image or choose it from their device.
4. Studio validates the file and displays an immediate preview.
5. The Sales Admin selects **Save cover**.
6. The image remains a catalogue draft until the catalogue is published.
7. Publishing makes the image the online catalogue cover.

When a cover already exists, the panel displays **Replace image** and **Remove cover**. Removing it creates a draft removal; after publication, the online catalogue returns to the generated green fallback.

## Studio UI

The **Cover page** panel contains:

- A short label explaining that the image affects the online catalogue only.
- A drop zone and file picker before upload.
- A large responsive preview after selection.
- **Save cover**, **Replace image**, and **Remove cover** controls as appropriate.
- PNG, JPG/JPEG, WebP, and 20 MB guidance.
- Clear validation, upload, and save errors that do not discard the last valid cover.

The feature uses the existing Studio save and publish conventions. It does not add a general-purpose cover designer.

## Data Model and API

- Store the image as a dedicated `online_cover` catalogue presentation asset, separate from the existing printable/full-cover asset.
- Maintain draft and published references so an upload, replacement, or removal cannot change a live customer catalogue before publication.
- Reuse the platform's catalogue media storage, file validation, authorization, and asset-deletion conventions.
- Catalogue preview/editor responses expose the draft online cover to authorized users.
- Public catalogue responses expose only the published online cover.
- PDF generation ignores `online_cover`.

## Rendering

- When `online_cover` exists in the published presentation, the public viewer replaces the generated green hero with the finished image.
- Preserve the image's aspect ratio; never stretch it.
- Use a contained presentation so the whole finished cover remains visible. Any spare area uses the catalogue's existing cover background colour.
- Keep the catalogue's product count/navigation and an accessible **Explore products** action outside or layered safely over the image without covering essential content.
- Desktop, tablet, and mobile layouts must not overflow or overlap.
- If the asset is absent or cannot be loaded, show the generated green cover.

## Permissions

- Only users who can edit the selected catalogue cover/presentation may upload, replace, save, or remove its online cover.
- Public customers can view only the published image and cannot change it.
- Existing catalogue publication permission remains required to make a draft cover visible publicly.

## Failure Handling

- Reject unsupported formats and files larger than 20 MB before upload where possible and validate again on the server.
- A failed upload or save leaves the existing draft and published covers intact.
- Show a retryable error in Studio.
- A missing or unavailable published image falls back to the generated green cover rather than leaving an empty cover area.

## Verification

- Upload PNG, JPG/JPEG, and WebP covers successfully.
- Reject unsupported and oversized files.
- Preview, save, replace, and remove a cover in Studio.
- Verify draft changes do not affect the public catalogue.
- Verify publication replaces the generated green online cover.
- Verify published removal restores the generated green fallback.
- Verify PDF output does not use `online_cover`.
- Verify permission enforcement for upload, removal, and publication.
- Verify responsive scaling on desktop, tablet, and mobile without distortion, overflow, or overlap.
