from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether,
)


OUTPUT = Path(__file__).with_name("GMS_Catalogue_Platform_Function_Checklist.pdf")

SECTIONS = [
    ("1. Access, authentication and dashboard", [
        ("Register an account", "Valid registration creates the account; duplicate or invalid data is rejected."),
        ("Log in and log out", "Valid credentials open the dashboard; logout invalidates the session."),
        ("Session and current-user profile", "Refresh preserves a valid session and /auth/me returns the correct user and roles."),
        ("Failed-login protection", "Repeated invalid attempts follow the configured lockout policy."),
        ("Dashboard overview", "Summary totals, recent activity, alerts and permitted shortcuts load correctly."),
        ("Global search", "Search returns permitted products, catalogues and relevant records without leaking restricted data."),
        ("Navigation and permission visibility", "Menus and actions reflect the signed-in user's effective permissions."),
    ]),
    ("2. ERP connection and source-data synchronization", [
        ("View encrypted ERP connection settings", "Server, database, connector and status display without exposing the password."),
        ("Save and test the ERP connection", "Connection test reports server/database/table/product totals and records the test time."),
        ("Preview ERP tables and product data", "Authorized users can inspect supported source tables and a safe data preview."),
        ("Run product synchronization manually", "A new sync run starts, holds the lease and completes without overlapping another run."),
        ("Automatic synchronization worker", "The dedicated worker starts with the platform and runs at the configured interval."),
        ("Product identity and descriptions", "SKU, English/Thai names, descriptions, usage, remarks, unit and warranty synchronize."),
        ("Brands and categories", "ERP brands/categories map consistently; locally managed merchandising data is preserved."),
        ("Multiple barcodes", "All valid ProductUnits barcodes synchronize and remain associated with the correct product."),
        ("Warehouse stock", "Per-warehouse and total stock values update and are visible to authorized users."),
        ("Seven ERP price levels", "NORMAL, VIP, BIG CUSTOMER, DEALER, WHOLESALE, RETAIL and VVIP prices map correctly."),
        ("ERP image slots 1-6", "Supported images import/update, primary-image rules remain correct and invalid images are reported."),
        ("Missing/discontinued lifecycle", "Missing records are flagged rather than deleted; ERP blocked state follows lifecycle rules."),
        ("Sync history and diagnostics", "Runs show counts, duration, warnings/errors and downloadable safe error details."),
        ("Stale-lock recovery", "An interrupted sync lease expires safely and a later run can recover without duplication."),
    ]),
    ("3. Product catalogue and media management", [
        ("Browse and filter products", "Pagination, search, brand/category/status/needs filters return the expected products."),
        ("Create and edit product content", "Authorized catalogue-owned fields save without overwriting ERP-owned fields."),
        ("Product detail view", "Names, SKU, barcodes, prices, stock, lifecycle, descriptions and media are consistent."),
        ("Product workflow", "Submit, approve, publish and unpublish transitions enforce permissions and valid states."),
        ("Activate/inactivate products", "Manual status changes record reasons and status history."),
        ("Upload/edit/delete product images", "Validation, ordering, primary image and approval behavior work correctly."),
        ("Select ERP product images", "Users can preview and import allowed ERP image slots into catalogue media."),
        ("Product videos", "Upload or link, edit, replace, reorder, feature, publish and delete video records."),
        ("Video supporting files", "Thumbnail, caption and protected video-content endpoints work."),
        ("Brand and category administration", "Create/edit/delete rules and dependent-record safeguards work."),
        ("Activity history", "Relevant product actions appear with actor, time and change information."),
    ]),
    ("4. Pricing and Catalogue Management", [
        ("Price-list management", "Configured currencies, no-price lists and audience mappings display correctly."),
        ("Product price maintenance", "Authorized edits preserve precision and the correct price-list association."),
        ("Price change requests", "Propose, approve and reject actions record workflow history."),
        ("Price history and protected cost/margin", "History is correct and sensitive values require explicit permissions."),
        ("Create and edit managed catalogues", "Metadata, audience, products, ordering, visibility and presentation settings save."),
        ("Catalogue product membership", "Add/remove/reorder products and per-product overrides behave correctly."),
        ("Catalogue workflow", "Draft, review, approval, rejection, publish and archive transitions are enforced."),
        ("Version history", "Published versions are immutable and the requested version is used for previews/exports."),
        ("Duplicate catalogue", "A safe editable copy is created without changing the source catalogue."),
        ("Catalogue preview", "Draft/published and audience-specific views show correct prices and visibility."),
        ("Print, PDF and Excel exports", "Files use current permitted data and the requested version/options."),
        ("Catalogue cover", "Upload assets, edit layout, preview, reset and publish cover configuration."),
        ("Category presentation", "Category order, visibility and banner upload/removal work."),
    ]),
    ("5. Catalogue Studio - design workspace", [
        ("Studio home and design search", "Design totals, filters, sorting, cards and open actions work."),
        ("Create a design", "Blank, system-template, personal-template and uploaded-template starts work."),
        ("Page size and orientation", "Saved portrait/landscape dimensions remain exact in editor, preview and PDF."),
        ("Editor page management", "Add, rename, duplicate, reorder, lock, show/hide and delete pages."),
        ("Canvas tools", "Zoom, pan, grid, guides, snap, selection and multi-selection behave consistently."),
        ("Element operations", "Add, move, resize, rotate, duplicate, layer, lock, hide and delete elements."),
        ("Text and bound fields", "Text, page number, catalogue, promotion, product and category fields render correctly."),
        ("Shapes and layout elements", "Lines, rectangles, circles, icons, buttons, backgrounds and tables render correctly."),
        ("Images and logos", "Upload/select assets, crop, zoom, fit, position, replace and download work."),
        ("QR codes and barcodes", "Generation, labels, color, sizing and print visibility are correct."),
        ("Image carousel", "Upload/select ERP images, reorder, transition, navigation and static PDF selection work."),
        ("Product cards", "Add single/bulk cards, resize, auto-layout and field/price visibility controls work."),
        ("Product-card geometry", "Image uses contain inside a fixed area; name/details/barcode/stock/price never overlap."),
        ("Multiple barcodes and live stock", "All configured barcodes and current ERP stock render in preview and PDF."),
        ("Product image lightbox/download", "Preview navigation and permitted original-image download work."),
        ("Autosave and revision safety", "Edits save with revision checks and conflicts do not silently overwrite work."),
        ("Undo/redo and keyboard operations", "History and supported shortcuts preserve document integrity."),
        ("Design validation", "Missing assets, invalid bindings and severe layout problems are reported before publishing."),
        ("Full-screen/browser preview", "Preview uses logical page scaling without changing element geometry."),
        ("Publish and unpublish", "Published Studio catalogues appear in Catalogue Management; unpublish removes published status."),
        ("Duplicate and restore versions", "Copies and restored revisions preserve pages, elements and bindings."),
    ]),
    ("6. Studio templates, media and exports", [
        ("Catalogue templates", "Create, edit, duplicate, import/export, submit, approve, share and delete by permission."),
        ("Cover/category templates", "Correct template type is validated and applied without stale source data."),
        ("Product-card templates", "Create, edit, duplicate, approve, view versions and restore a prior version."),
        ("Studio media library", "Upload, view, edit and delete reusable assets with permission enforcement."),
        ("Color palettes", "Create and apply reusable palette definitions."),
        ("Queue PDF/image export", "A saved immutable version is attached to every export job."),
        ("Export worker availability", "Dedicated worker starts automatically, claims queued jobs and records start/completion."),
        ("Print PDF", "Fresh PDF matches preview, uses exact dimensions, zero margins and print backgrounds."),
        ("Web PDF", "Web-oriented PDF uses the requested settings and remains visually consistent."),
        ("PNG/JPEG export", "Raster dimensions, quality and page selection follow export options."),
        ("Export history", "Queued/running/completed/failed states, file size, timestamps and safe errors display."),
        ("Download and delete exports", "Completed files download; queued jobs cannot be deleted; allowed files delete safely."),
        ("Missing-asset handling", "Export fails clearly instead of silently producing an incomplete document."),
    ]),
    ("7. Sharing and public catalogue experience", [
        ("Audience types", "Create/manage audience definitions and associated price visibility."),
        ("Create share link", "Token, access rules, version mode and audience are saved correctly."),
        ("Copy, edit and regenerate link", "Updated settings apply and regenerated tokens invalidate the previous URL."),
        ("Activate, revoke and delete link", "Public access changes immediately and audit history remains available."),
        ("Fixed versus latest-published version", "Public viewers receive the configured immutable or current published version."),
        ("Password-protected access", "Correct password grants access; incorrect attempts reveal no catalogue data."),
        ("Public catalogue viewer", "Navigation, categories, search, product cards, prices and responsive layout work."),
        ("Public media", "Permitted videos, thumbnails, captions and PDF download work through the share token."),
        ("Hidden/inactive products", "Restricted or inactive records never appear publicly."),
    ]),
    ("8. Promotions", [
        ("Promotion list and filters", "Search, status, owner, occasion and schedule filters work."),
        ("Create/edit/duplicate/delete", "Promotion metadata, products, prices, media and schedule save correctly."),
        ("Promotion workflow", "Submit, approve, reject, publish, pause, resume and cancel enforce permissions."),
        ("Scheduling", "Start/end dates and timezone activate/expire promotions correctly."),
        ("Conflict detection", "Overlapping product/audience promotions are identified."),
        ("Promotion preview and history", "Preview reflects configured data and history records every transition."),
        ("Promotion media", "Upload, retrieve and delete authorized media."),
        ("Promotion share links", "Create/list/revoke links and public token view work."),
        ("Public promotion PDF", "Published promotion PDF is available only under valid access rules."),
        ("Occasion management", "Create and edit reusable promotion occasions."),
        ("Reports and CSV export", "Promotion reporting totals and exported rows match filters."),
    ]),
    ("9. Users, roles and organization", [
        ("User management", "List, create, edit, deactivate, unlock and reset passwords."),
        ("Role assignment", "Direct roles and effective permissions update correctly."),
        ("Data scopes", "Brand, department, team and published-only restrictions apply across APIs and UI."),
        ("SuperAdmin safeguards", "High-risk and SuperAdmin changes require the appropriate authority."),
        ("Role lifecycle", "Create, edit, duplicate, activate, deactivate and delete roles safely."),
        ("Permission matrix", "Role permission changes invalidate cached/effective permissions."),
        ("Departments", "Create/edit and membership relationships work."),
        ("Positions", "Create/edit/duplicate/activate/deactivate/delete and user assignment work."),
        ("Teams", "Create/edit/duplicate/lifecycle actions, member assignment and team roles work."),
        ("Brand assignments", "User/organization brand access limits catalogue and product visibility correctly."),
    ]),
    ("10. Administration, operations and observability", [
        ("General/system settings", "Authorized configuration changes persist and sensitive values remain protected."),
        ("System health and metrics", "API/database/storage/worker indicators and resource metrics are current."),
        ("System information", "Version/runtime/build information is permission protected."),
        ("Database and media backups", "Create, list, download and delete supported backup types."),
        ("Backup schedules", "Schedule configuration persists and reports the next expected run."),
        ("Restore safeguards", "Restore requires high-risk permission, validation and explicit confirmation."),
        ("Audit logs", "Security, workflow, configuration and data actions record actor/time/details."),
        ("Audit export", "Authorized export matches filters and excludes protected secrets."),
        ("Feedback", "Create feedback with screenshot; authorized users can manage and export CSV/XLSX."),
        ("Worker startup", "Platform launcher starts ERP sync and Studio export workers independently of Uvicorn."),
        ("Worker recovery", "Production supervision restarts stopped workers and stale queues become visible."),
        ("API health", "Health endpoint responds and frontend reports backend unavailability clearly."),
        ("Security review", "Cookies, CORS, upload validation, protected media and permission checks are verified."),
    ]),
    ("11. Cross-platform acceptance and regression", [
        ("Browser coverage", "Primary workflows pass in supported Chrome/Edge desktop resolutions."),
        ("Responsive layouts", "Dashboard, public catalogues and previews remain usable at tablet/mobile widths."),
        ("Thai and English content", "Unicode text stores, searches, wraps and exports correctly."),
        ("Timezone consistency", "UI, schedules, syncs and exports use Bangkok time where specified."),
        ("Frontend automated tests", "Vitest suite passes."),
        ("Frontend lint and TypeScript", "ESLint has no errors and TypeScript completes without errors."),
        ("Production frontend build", "Next.js production build completes successfully."),
        ("Backend smoke/regression tests", "Relevant authentication, access, catalogue, Studio, promotion and operations tests pass."),
        ("Fresh PDF visual regression", "Preview screenshot and newly generated PDF remain within the accepted pixel-difference threshold."),
        ("Publish-to-management regression", "Studio publish/unpublish state stays consistent with Catalogue Management."),
        ("Dirty-worktree safety", "Testing and fixes do not overwrite unrelated local changes."),
    ]),
]


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleGMS", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=24, leading=28, textColor=colors.HexColor("#0B4A2D"), alignment=TA_CENTER, spaceAfter=5*mm))
styles.add(ParagraphStyle(name="SubGMS", parent=styles["Normal"], fontSize=9.5, leading=13, textColor=colors.HexColor("#4D6357"), alignment=TA_CENTER, spaceAfter=8*mm))
styles.add(ParagraphStyle(name="SectionGMS", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=17, textColor=colors.white, backColor=colors.HexColor("#126B3A"), borderPadding=(6,8,6,8), spaceBefore=3*mm, spaceAfter=2*mm))
styles.add(ParagraphStyle(name="BodySmall", parent=styles["BodyText"], fontSize=8.4, leading=11, textColor=colors.HexColor("#25372E")))
styles.add(ParagraphStyle(name="Note", parent=styles["BodyText"], fontSize=8.5, leading=12, textColor=colors.HexColor("#52685C")))


def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(colors.HexColor("#0B4A2D"))
    canvas.rect(0, h - 12*mm, w, 12*mm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(15*mm, h - 7.5*mm, "GMS Catalogue Platform")
    canvas.setFillColor(colors.HexColor("#607469"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(15*mm, 9*mm, "Functional and QA checklist | Generated 26 August 2026")
    canvas.drawRightString(w - 15*mm, 9*mm, f"Page {doc.page}")
    canvas.restoreState()


def checklist_table(items):
    data = [[Paragraph("<b>Status</b>", styles["BodySmall"]), Paragraph("<b>Function / test</b>", styles["BodySmall"]), Paragraph("<b>Expected result</b>", styles["BodySmall"]), Paragraph("<b>Notes</b>", styles["BodySmall"])]]
    for title, expected in items:
        data.append([
            Paragraph("[ ] Pass<br/>[ ] Fail<br/>[ ] N/A", styles["BodySmall"]),
            Paragraph(f"<b>{title}</b>", styles["BodySmall"]),
            Paragraph(expected, styles["BodySmall"]),
            "",
        ])
    table = Table(data, colWidths=[21*mm, 47*mm, 77*mm, 35*mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#DDEFE3")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.HexColor("#0B4A2D")),
        ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#B9CEC0")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#F6FAF7")]),
    ]))
    return table


doc = BaseDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=15*mm, leftMargin=15*mm, topMargin=18*mm, bottomMargin=15*mm, title="GMS Catalogue Platform Function Checklist", author="GMS Catalogue Platform")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates(PageTemplate(id="checklist", frames=frame, onPage=header_footer))

story = [
    Spacer(1, 9*mm),
    Paragraph("GMS Catalogue Platform", styles["TitleGMS"]),
    Paragraph("Complete Function & Quality-Assurance Checklist", styles["TitleGMS"]),
    Paragraph("Use this document for platform acceptance testing, regression testing, release sign-off, training coverage and operational readiness. Mark each item Pass, Fail or N/A and record evidence or defects in Notes.", styles["SubGMS"]),
]

summary = Table([
    ["Release / build:", "", "Tester:", ""],
    ["Environment:", "", "Test date:", ""],
    ["Overall result:", "[ ] PASS   [ ] PASS WITH ISSUES   [ ] FAIL", "Retest date:", ""],
], colWidths=[30*mm, 65*mm, 28*mm, 57*mm], rowHeights=[9*mm,9*mm,11*mm])
summary.setStyle(TableStyle([
    ("GRID", (0,0), (-1,-1), .5, colors.HexColor("#AFC5B6")),
    ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#EAF5ED")),
    ("BACKGROUND", (2,0), (2,-1), colors.HexColor("#EAF5ED")),
    ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
    ("FONTNAME", (0,0), (0,-1), "Helvetica-Bold"),
    ("FONTNAME", (2,0), (2,-1), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8.5),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
]))
story += [summary, Spacer(1, 6*mm), Paragraph(f"Checklist scope: {sum(len(items) for _, items in SECTIONS)} functional checks across {len(SECTIONS)} platform areas.", styles["Note"]), PageBreak()]

for index, (heading, items) in enumerate(SECTIONS):
    story.extend([Paragraph(heading, styles["SectionGMS"]), checklist_table(items), Spacer(1, 4*mm)])
    if index in {1, 3, 5, 7, 9}:
        story.append(PageBreak())

story += [
    PageBreak(),
    Paragraph("Final sign-off", styles["SectionGMS"]),
    Paragraph("Critical defects / release blockers:", styles["Note"]), Spacer(1, 28*mm),
    Paragraph("Accepted limitations / follow-up actions:", styles["Note"]), Spacer(1, 28*mm),
]
signoff = Table([
    ["Prepared by", "Signature", "Date"],
    ["", "", ""],
    ["Reviewed by", "Signature", "Date"],
    ["", "", ""],
    ["Approved by", "Signature", "Date"],
    ["", "", ""],
], colWidths=[65*mm,65*mm,50*mm], rowHeights=[8*mm,16*mm,8*mm,16*mm,8*mm,16*mm])
signoff.setStyle(TableStyle([
    ("GRID", (0,0), (-1,-1), .5, colors.HexColor("#AFC5B6")),
    ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#EAF5ED")),
    ("BACKGROUND", (0,2), (-1,2), colors.HexColor("#EAF5ED")),
    ("BACKGROUND", (0,4), (-1,4), colors.HexColor("#EAF5ED")),
    ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
    ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
    ("FONTNAME", (0,2), (-1,2), "Helvetica-Bold"),
    ("FONTNAME", (0,4), (-1,4), "Helvetica-Bold"),
    ("FONTSIZE", (0,0), (-1,-1), 8.5),
    ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
    ("LEFTPADDING", (0,0), (-1,-1), 5),
]))
story.append(signoff)

doc.build(story)
print(OUTPUT.resolve())
