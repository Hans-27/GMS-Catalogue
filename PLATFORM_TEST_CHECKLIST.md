# GMS Catalogue Platform — Test Checklist

Use this checklist for release acceptance and regression testing. Test with at least a Super Administrator, catalogue editor, approver, and read-only user. Record evidence (screenshot, request ID, or export filename) for every failure.

## Test run

- Date:
- Build/version:
- Tester:
- Environment and URL:
- Browser/device:
- API/database:
- Result: [ ] Pass  [ ] Pass with issues  [ ] Fail

## 1. Production readiness

- [ ] `http://localhost:8000/api/health` returns a healthy response.
- [ ] `http://localhost/login` loads without a server or hydration error.
- [ ] Frontend is running with `next start`, not `next dev`.
- [ ] Browser console has no unexpected errors during the main workflows.
- [ ] API requests contain no unexpected 401, 403, 422, or 500 responses.
- [ ] Refreshing a protected page preserves the signed-in session.
- [ ] Logout clears the session and protected URLs redirect to login.

## 2. Authentication and permissions

- [ ] A valid user can sign in with username and email.
- [ ] Invalid credentials show a clear error without exposing technical details.
- [ ] Inactive and locked users cannot sign in.
- [ ] Each role sees only its permitted navigation and actions.
- [ ] A read-only user cannot create, edit, publish, delete, upload, or export through the UI.
- [ ] Direct API requests cannot bypass UI permissions.
- [ ] Session-expired messages render as plain text; strings such as `&#x20;` are not displayed.

## 3. ERP data synchronization

- [ ] Data Sync shows the configured source, schedule, and last successful run.
- [ ] Automatic synchronization runs at the configured interval.
- [ ] The worker remains active after restarting the platform.
- [ ] Manual synchronization starts and reports progress accurately.
- [ ] New ERP products are created without duplicating existing products.
- [ ] Changed price, stock, product name, brand, barcode, and category values update correctly.
- [ ] ERP-removed or inactive products follow the configured lifecycle rule.
- [ ] A failed sync records a useful error and the next scheduled run still occurs.
- [ ] The synchronization timestamp and product totals update after success.

## 4. Product management

- [ ] Product search, brand/category filters, sorting, and pagination work together.
- [ ] Opening a product shows the correct ERP source data and catalogue content.
- [ ] Saving editable product fields persists after refresh.
- [ ] Product image upload accepts JPEG, PNG, and WebP and rejects unsupported/oversized files.
- [ ] Primary image selection, reordering, replacement, and removal work.
- [ ] Product video upload and external-link workflows work.
- [ ] The obsolete **Delete product** action is not displayed.
- [ ] Publish, unpublish, activate, and deactivate actions follow permissions and show confirmation.

## 5. Catalogue management dashboard

- [ ] Catalogue totals (all, published, in progress) match the displayed records.
- [ ] Search, status filter, sorting, and clearing filters work.
- [ ] Catalogue cards show title, status, updated date, product count, version, and pricing correctly.
- [ ] Booklets without prices show only one **Catalog** link.
- [ ] Priced catalogues show the correct audience links without the word **Copy**.
- [ ] Clicking a catalogue link copies it and briefly shows **Copied**.
- [ ] **View all links** expands and collapses the remaining links.
- [ ] **Open Studio**, **Preview**, and the three-dot menu actions work.
- [ ] **Add logo** uploads a brand logo to the selected catalogue card.
- [ ] **Change logo** replaces the logo and the new image persists after refresh.
- [ ] Catalogue card logos retain aspect ratio and do not overflow the cover area.

## 6. Catalogue Studio home

- [ ] Header links for My Designs, Templates, Product Cards, Media Library, and Exports open correctly.
- [ ] **New catalogue**, **Create a catalogue**, and **Browse templates** open the correct pages.
- [ ] Summary cards are clickable and produce the expected results:
  - [ ] Designs shows all designs.
  - [ ] Published shows only published designs.
  - [ ] Total pages shows designs containing pages.
  - [ ] Products placed shows designs containing products.
- [ ] Summary-card selection scrolls to the design results.
- [ ] Design search, status filter, sorting, and Clear filters work.
- [ ] Every design card opens its correct editor.

## 7. Create catalogue

- [ ] Start from Blank Page supports ERP catalogue settings.
- [ ] A4 Blank Image Page excludes ERP products.
- [ ] System Template, My Template, and Upload Template workflows work.
- [ ] Catalogue name is required and validation messages are readable.
- [ ] A4 Portrait and A4 Landscape can be selected where applicable.
- [ ] Standard, booklet, and promotion catalogue types save correctly.
- [ ] No Price and authorized price slots behave correctly.
- [ ] Create and open Studio creates one design and opens its editor.

## 8. Studio editor — pages

- [ ] Add blank, duplicate, move up, move down, and delete page work smoothly.
- [ ] Deleting a page removes only the selected page and selects a valid neighboring page.
- [ ] Page deletion errors show the actual reason instead of a generic failure when available.
- [ ] Moving pages does not change the editor zoom.
- [ ] Page order persists after refresh and appears identically in Preview.
- [ ] Page name, category, visibility, lock, size, orientation, background, grid, and safe area persist.
- [ ] Canvas dimensions reject values over 10,000 with a readable validation message.

## 9. Studio editor — elements and grids

- [ ] Price, Text, Image, Carousel, Logo, Video, Shape, QR, Product card, Table, Barcode, Line, Rectangle, Page number, Download, Grid, and Product sequence can be added.
- [ ] Elements can be selected, moved, resized, duplicated, layered, grouped, ungrouped, and deleted.
- [ ] Undo and redo restore element operations correctly.
- [ ] A custom image grid can be created with selectable rows and columns.
- [ ] Every grid cell accepts an uploaded or library image.
- [ ] Images can be dragged and dropped into each grid cell.
- [ ] Replacing one cell image does not change the other cells.
- [ ] **Remove image** clears only the uploaded image and keeps its grid frame.
- [ ] Crop, zoom, position, rotate, flip, fill frame, and reset image work.
- [ ] Editor, Preview, public catalogue, print, and PDF preserve the same element positions.

## 10. Saving, templates, and publishing

- [ ] Autosave indicates success and changes survive a hard refresh.
- [ ] Save now completes without losing the current selection or zoom.
- [ ] Save version creates an immutable version with the correct number.
- [ ] Save page template and Save catalogue template appear in the correct libraries.
- [ ] Publishing creates/updates public links as intended.
- [ ] Unpublishing removes public access without deleting the design.
- [ ] Published content does not silently change until a new version is published.

## 11. Preview and booklet

- [ ] Desktop, Tablet, Mobile, Booklet, and PDF preview modes open and render.
- [ ] Preview matches the editor for position, size, crop, visibility, fonts, and background.
- [ ] Booklet pages are large enough in regular and fullscreen modes.
- [ ] Previous/next controls turn the correct page.
- [ ] Dragging a page left/right turns pages smoothly without accidental navigation from the middle.
- [ ] Thumbnail selection opens the selected page/spread.
- [ ] Fullscreen preserves page-turn, drag, keyboard, zoom, and thumbnail behavior.
- [ ] Attempting to go beyond the final page shows **LAST PAGE**.
- [ ] Mobile shows one page at a time and supports left/right swipe.
- [ ] Mobile content fits the viewport without horizontal page clipping.

## 12. Public catalogue links

- [ ] Every active public URL opens without an administrator session.
- [ ] The public catalogue matches the Studio preview and published version.
- [ ] Booklet links use the same page-turning, thumbnail, zoom, and fullscreen features as Preview.
- [ ] Mobile public links show one page and swipe left/right.
- [ ] English/Thai switching updates supported content.
- [ ] Download PDF and Print obey catalogue permissions and pricing visibility.
- [ ] Revoked, expired, draft, and unpublished links are inaccessible.
- [ ] Normal, VIP, VVIP, Retail, Dealer, Wholesale, Big Customer, and No Price links show correct prices.

## 13. PDF and exports

- [ ] Create PDF creates exactly one queued export.
- [ ] The export worker changes status from queued to processing to completed.
- [ ] A completed export reports a non-zero file size and downloads successfully.
- [ ] PDF page dimensions and orientation match the design.
- [ ] Images, Thai/English text, grids, crop settings, and page numbers render correctly.
- [ ] Hidden elements and hidden prices do not appear.
- [ ] Failed exports show a useful reason and can be retried.
- [ ] Removing a failed/completed export removes only the selected export.
- [ ] PNG/JPEG page exports and template exports work where permitted.

## 14. Responsive, accessibility, and performance

- [ ] Test at 360 px, 768 px, 1366 px, 1920 px, and browser zoom 80–200%.
- [ ] No important control is hidden, clipped, or overlapped at supported sizes.
- [ ] Keyboard users can reach and activate all controls with a visible focus indicator.
- [ ] Dialogs trap focus, have accessible names, and close with Escape where appropriate.
- [ ] Form fields have labels and errors are associated with the correct fields.
- [ ] Meaningful images have alt text; decorative images are ignored by assistive technology.
- [ ] Main pages become usable promptly with the expected production data volume.
- [ ] Catalogue lists do not trigger one network/database request per card asset.
- [ ] Large images do not cause layout shifts or excessive memory use.

## 15. Automated release checks

Run before release:

```powershell
cd frontend
npm.cmd test
npm.cmd run lint
npm.cmd run build

cd ..\backend
.\.venv\Scripts\python.exe -m compileall -q app
.\.venv\Scripts\python.exe -m pytest
```

- [ ] Frontend tests pass.
- [ ] ESLint reports no errors.
- [ ] Production build completes.
- [ ] Backend compilation succeeds.
- [ ] Backend tests pass.
- [ ] Database migrations are current and tested against a backup copy.
- [ ] A rollback procedure and database backup are available.

## Defect record

For every failed item, record:

- Checklist section/item:
- Severity: [ ] Blocker  [ ] Critical  [ ] Major  [ ] Minor
- Steps to reproduce:
- Expected result:
- Actual result:
- Browser/device and account role:
- Screenshot/video/request ID:
- Owner:
- Status: [ ] Open  [ ] Fixed  [ ] Retested  [ ] Closed
