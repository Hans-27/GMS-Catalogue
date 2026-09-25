"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useState } from "react";
import { API_ORIGIN } from "@/lib/api";
import { formatApiDate } from "@/lib/date-time";
import { deleteStudioExport, getStudioAssets, getStudioExports, getStudioTemplates, importStudioTemplate, retryStudioExport, uploadStudioAsset, type StudioAsset, type StudioExportJob, type StudioPage, type StudioPageDocument, type StudioPageType, type StudioTemplate } from "@/lib/studio-api";
import { CataloguePageRenderer } from "./studio-preview";
import styles from "./studio.module.css";

const PLACEHOLDER_TEMPLATES: Record<string, Array<[string, string]>> = {
  product_card: [["ERP Detail Table", "Rounded ERP card with image, code, barcode, stock and mapped price"]],
  cover: [["Brand Focus", "Large title with brand mark"], ["Full Artwork", "Full-bleed uploaded cover"]],
};

const TEMPLATE_FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gmstemplate,application/pdf,image/png,image/jpeg,image/webp,application/vnd.gms.catalogue-template+json";
const TEMPLATE_FILE_EXTENSIONS = [
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gmstemplate",
];

function exportDateTime(value: string | null) {
  if (!value) return "—";
  return formatApiDate(value, "en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    second: "2-digit", hourCycle: "h23",
  });
}

const EXPORT_FORMATS: Record<string, { short: string; label: string; description: string }> = {
  print_pdf: { short: "PDF", label: "Print PDF", description: "High-resolution catalogue for print" },
  web_pdf: { short: "PDF", label: "Web PDF", description: "Optimised catalogue for sharing online" },
  png: { short: "PNG", label: "PNG image", description: "High-resolution page image" },
  jpeg: { short: "JPG", label: "JPEG image", description: "Compressed page image" },
  template: { short: "TPL", label: "Catalogue template", description: "Reusable catalogue design file" },
};

function exportFormat(exportType: string) {
  return EXPORT_FORMATS[exportType] || {
    short: exportType.slice(0, 4).toUpperCase(),
    label: exportType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    description: "Catalogue Studio export",
  };
}

function exportStatus(status: string) {
  if (status === "completed") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "running") return "Creating";
  if (status === "queued") return "Queued";
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function exportFileSize(fileSize: number | null) {
  if (fileSize === null) return "—";
  return fileSize < 1024 * 1024
    ? `${Math.max(1, Math.round(fileSize / 1024))} KB`
    : `${(fileSize / 1024 / 1024).toFixed(1)} MB`;
}

function ExportCard({ job, deleting, retrying, onDelete, onRetry }: { job: StudioExportJob; deleting: boolean; retrying: boolean; onDelete: (job: StudioExportJob) => void; onRetry: (job: StudioExportJob) => void }) {
  const format = exportFormat(job.export_type);
  const fileName = job.storage_key?.split(/[\\/]/).pop() || `${format.label} export`;
  return <article className={styles.exportCard} data-status={job.status}>
    <header className={styles.exportCardHeader}>
      <span className={styles.exportFileIcon} data-format={format.short}>{format.short}<small>FILE</small></span>
      <div className={styles.exportCardTitle}><span>Catalogue export</span><h2>{format.label}</h2><p>{format.description}</p></div>
      <strong className={styles.exportStatus} data-status={job.status}><i aria-hidden="true" />{exportStatus(job.status)}</strong>
    </header>
    <p className={styles.exportFileName} title={fileName}>{fileName}</p>
    <dl className={styles.exportTimes}>
      <div><dt>Created</dt><dd><time dateTime={job.created_at}>{exportDateTime(job.created_at)}</time></dd></div>
      {job.started_at && <div><dt>Started</dt><dd><time dateTime={job.started_at}>{exportDateTime(job.started_at)}</time></dd></div>}
      {job.completed_at && <div><dt>{job.status === "failed" ? "Failed" : "Completed"}</dt><dd><time dateTime={job.completed_at}>{exportDateTime(job.completed_at)}</time></dd></div>}
      <div><dt>File size</dt><dd>{exportFileSize(job.file_size)}</dd></div><div><dt>Timezone</dt><dd>Bangkok (UTC+7)</dd></div>
    </dl>
    {job.status === "completed" && <div className={styles.exportActions}><a className={styles.primaryAction} href={`${API_ORIGIN}/api/v1/catalogue-studio/exports/${job.id}/content`}><span aria-hidden="true">↓</span> Download</a><button type="button" className={styles.dangerAction} aria-label={format.short === "PDF" ? "Delete PDF" : `Delete ${format.label}`} onClick={() => onDelete(job)} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</button></div>}
    {job.status === "failed" && <><p className={styles.exportFailure} role="alert">{job.error_message || "Export failed. Please retry it."}</p><div className={styles.exportActions}><button type="button" className={styles.primaryAction} onClick={() => onRetry(job)} disabled={retrying || deleting}>{retrying ? "Retrying…" : "Retry export"}</button><button type="button" className={styles.dangerAction} aria-label={`Remove failed ${format.label} export`} onClick={() => onDelete(job)} disabled={deleting || retrying}>{deleting ? "Removing…" : "Remove failed export"}</button></div></>}
  </article>;
}

type LibraryTemplate = Pick<StudioTemplate, "id" | "name" | "description" | "visibility_scope" | "version"> & Partial<Pick<StudioTemplate, "template_data_json">>;

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function templatePreviewPages(template: LibraryTemplate): StudioPage[] {
  const data = template.template_data_json || {};
  const rawPages = Array.isArray(data.pages) ? data.pages : [];
  return rawPages.flatMap((rawPage, index) => {
    if (!rawPage || typeof rawPage !== "object") return [];
    const metadata = rawPage as Record<string, unknown>;
    const rawDocument = metadata.pageData || metadata.page_data_json || rawPage;
    if (!rawDocument || typeof rawDocument !== "object") return [];
    const document = rawDocument as Partial<StudioPageDocument>;
    const canvas = document.canvas && typeof document.canvas === "object" ? document.canvas : undefined;
    const width = numberValue(metadata.width ?? canvas?.width, 1123);
    const height = numberValue(metadata.height ?? canvas?.height, 794);
    const pageId = String(document.pageId || metadata.id || `template-page-${index + 1}`);
    const pageType = String(document.pageType || metadata.page_type || "blank") as StudioPageType;
    const pageName = String(document.name || metadata.page_name || `Page ${index + 1}`);
    const backgroundColor = String(canvas?.backgroundColor || metadata.background_color || "#FFFFFF");
    const pageDocument: StudioPageDocument = {
      pageId,
      pageType,
      name: pageName,
      canvas: {
        width,
        height,
        backgroundColor,
        gridSize: numberValue(canvas?.gridSize, 16),
        showGrid: Boolean(canvas?.showGrid),
        showGuides: Boolean(canvas?.showGuides),
        showSafeArea: Boolean(canvas?.showSafeArea),
        bleed: Math.max(0, Number(canvas?.bleed || 0)),
      },
      elements: Array.isArray(document.elements) ? document.elements : [],
      dataMode: document.dataMode === "snapshot" ? "snapshot" : "live",
    };
    return [{
      id: pageId,
      design_id: `template-${template.id}`,
      page_type: pageType,
      page_name: pageName,
      display_order: numberValue(metadata.display_order, index + 1),
      width,
      height,
      orientation: String(metadata.orientation || (width >= height ? "landscape" : "portrait")),
      background_color: backgroundColor,
      page_data_json: pageDocument,
      is_visible: metadata.is_visible !== false,
      is_locked: Boolean(metadata.is_locked),
      created_at: String(metadata.created_at || ""),
      updated_at: String(metadata.updated_at || ""),
    } satisfies StudioPage];
  }).filter((page) => page.is_visible).sort((left, right) => left.display_order - right.display_order);
}

function TemplatePreviewDialog({ template, onClose }: { template: LibraryTemplate; onClose: () => void }) {
  const pages = templatePreviewPages(template);
  const [pageIndex, setPageIndex] = useState(0);
  const page = pages[pageIndex];
  const previewScale = page ? Math.min(1, 780 / page.width, 570 / page.height) : 1;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  return <div className={styles.templatePreviewBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={styles.templatePreviewDialog} role="dialog" aria-modal="true" aria-label={`Preview ${template.name}`}>
      <header className={styles.templatePreviewHeader}>
        <div><span>Template preview</span><h2>{template.name}</h2><p>{template.description}</p></div>
        <button type="button" onClick={onClose} aria-label="Close template preview">×</button>
      </header>
      <div className={styles.templatePreviewBody}>
        {pages.length > 0 && <nav className={styles.templatePreviewPages} aria-label="Template pages">
          {pages.map((item, index) => <button type="button" data-active={index === pageIndex} onClick={() => setPageIndex(index)} key={item.id}>
            <span>{index + 1}</span><strong>{item.page_name}</strong>
          </button>)}
        </nav>}
        <div className={styles.templatePreviewCanvas}>
          {page ? <CataloguePageRenderer designId={`template-${template.id}`} page={page} pageNumber={pageIndex + 1} mode="desktop" scale={previewScale} />
            : <div className={styles.templatePreviewEmpty}><strong>No preview pages available</strong><p>This template can still be selected, but it does not contain a saved page snapshot.</p></div>}
        </div>
      </div>
      <footer className={styles.templatePreviewFooter}>
        <span>{pages.length > 0 ? `Page ${pageIndex + 1} of ${pages.length}` : "No saved pages"}</span>
        <div>
          <button type="button" className={styles.secondaryAction} disabled={pageIndex === 0} onClick={() => setPageIndex((current) => Math.max(0, current - 1))}>Previous</button>
          <button type="button" className={styles.secondaryAction} disabled={pageIndex >= pages.length - 1} onClick={() => setPageIndex((current) => Math.min(pages.length - 1, current + 1))}>Next</button>
          <Link className={styles.primaryAction} href={`/catalogue-studio/new?templateId=${template.id}`}>Use this template</Link>
        </div>
      </footer>
    </section>
  </div>;
}

function TemplateCard({ template, onPreview }: { template: LibraryTemplate; onPreview: (template: LibraryTemplate) => void }) {
  const data = template.template_data_json || {};
  const governance = data.governance && typeof data.governance === "object" ? data.governance as Record<string, unknown> : {};
  const pages = Array.isArray(data.pages) ? data.pages.length : 0;
  const displayPageCount = Math.max(1, pages);
  const selectable = !template.id.startsWith("placeholder-");
  const searchText = `${template.name} ${template.description}`.toLowerCase();
  const templateType = searchText.includes("promotion")
    ? "promotion"
    : searchText.includes("multi-brand") || searchText.includes("multi brand")
      ? "multi-brand"
      : searchText.includes("cover")
        ? "cover"
        : "catalogue";
  const templateTypeLabel = templateType === "multi-brand"
    ? "Multi-brand"
    : templateType.charAt(0).toUpperCase() + templateType.slice(1);

  return <article className={`${styles.designCard} ${styles.templateLibraryCard}`} data-type={templateType}>
    <div className={styles.designThumb}>
      <div className={styles.designPreviewTopline}>
        <span>{templateTypeLabel}</span>
        <b>{displayPageCount} {displayPageCount === 1 ? "page" : "pages"}</b>
      </div>
      <span className={styles.designPreviewSheet} aria-hidden="true"><i /><i /><i /></span>
      <strong>{template.name}</strong>
      <small>Editable catalogue studio template</small>
    </div>
    <div className={styles.designCardBody}>
      <div className={styles.designCardHeading}>
        <div><span>Ready to customise</span><h2 title={template.name}>{template.name}</h2></div>
        <b data-status="published">v{template.version}</b>
      </div>
      <p className={styles.templateCardDescription}>{template.description}</p>
      {governance.brandLocked === true && <p className={styles.templateGovernanceNotice}><span aria-hidden="true">&#10003;</span> Brand governed <small>Arial &middot; GMS palette &middot; {displayPageCount} complete {displayPageCount === 1 ? "page" : "pages"}</small></p>}
      <footer className={styles.templateCardFooter}>
        <span><strong>{template.visibility_scope}</strong><small>Template access</small></span>
        {selectable && <div className={styles.templateCardActions}>
          <button type="button" className={styles.secondaryAction} onClick={() => onPreview(template)}><span aria-hidden="true">&#9678;</span> Preview</button>
          <Link className={styles.primaryAction} href={`/catalogue-studio/new?templateId=${template.id}`}>Use template <span aria-hidden="true">&rarr;</span></Link>
        </div>}
      </footer>
    </div>
  </article>;
}

export function StudioLibrary({ mode }: { mode: "templates" | "product_card" | "cover" | "media" | "exports" }) {
  const [templates, setTemplates] = useState<StudioTemplate[]>([]);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [exports, setExports] = useState<StudioExportJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [deletingExportId, setDeletingExportId] = useState<string | null>(null);
  const [retryingExportId, setRetryingExportId] = useState<string | null>(null);
  const [exportError, setExportError] = useState("");
  const [templateImporting, setTemplateImporting] = useState(false);
  const [templateImportError, setTemplateImportError] = useState("");
  const [templateImportNotice, setTemplateImportNotice] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<LibraryTemplate | null>(null);
  useEffect(() => {
    if (mode === "media") void getStudioAssets().then(setAssets);
    else if (mode === "exports") void getStudioExports().then(setExports);
    else void getStudioTemplates(mode === "templates" ? undefined : mode).then(setTemplates);
  }, [mode]);
  const hasPendingExports = exports.some((job) => job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (mode !== "exports") return;
    const refresh = () => {
      if (document.visibilityState === "visible") void getStudioExports().then(setExports);
    };
    const timer = hasPendingExports ? window.setInterval(refresh, 2_000) : null;
    window.addEventListener("focus", refresh);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [hasPendingExports, mode]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const asset = await uploadStudioAsset(file, file.type.startsWith("video/") ? "product_video" : "user_upload", file.name);
      setAssets((current) => [asset, ...current]);
    } finally {
      setBusy(false); event.target.value = "";
    }
  }

  async function uploadTemplate(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    setTemplateImportError("");
    setTemplateImportNotice("");
    const lowerName = file.name.toLowerCase();
    if (!TEMPLATE_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      setTemplateImportError(
        "Choose a PDF, PNG, JPG, WebP, or GMS Template file.",
      );
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setTemplateImportError("Template files may not exceed 20 MB.");
      return;
    }
    if (mode === "cover" && lowerName.endsWith(".gmstemplate")) {
      try {
        const envelope = JSON.parse(await file.text()) as {
          format?: string;
          schema_version?: number;
          template?: { template_type?: string };
        };
        if (envelope.format !== "gms-catalogue-studio" || envelope.schema_version !== 1 || envelope.template?.template_type !== "cover") {
          setTemplateImportError("Choose a cover template exported from Catalogue Studio.");
          return;
        }
      } catch {
        setTemplateImportError(
          "This GMS Catalogue Template file is damaged or unreadable.",
        );
        return;
      }
    }
    setTemplateImporting(true);
    try {
      const imported = await importStudioTemplate(
        file,
        mode === "cover" ? "cover" : "catalogue",
      );
      setTemplates((current) => [imported, ...current.filter((item) => item.id !== imported.id)]);
      setTemplateImportNotice(`${imported.name} was uploaded and is ready to use.`);
    } catch (error) {
      setTemplateImportError(error instanceof Error ? error.message : "The template could not be uploaded.");
    } finally {
      setTemplateImporting(false);
    }
  }

  async function removeExport(job: StudioExportJob) {
    const type = job.export_type.replaceAll("_", " ").toUpperCase();
    if (!window.confirm(`Delete this ${type} export? The downloaded file and its history record will be permanently removed.`)) return;
    setDeletingExportId(job.id);
    setExportError("");
    try {
      await deleteStudioExport(job.id);
      setExports((current) => current.filter((item) => item.id !== job.id));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The export could not be deleted.");
    } finally {
      setDeletingExportId(null);
    }
  }

  async function retryExport(job: StudioExportJob) {
    setRetryingExportId(job.id);
    setExportError("");
    try {
      const retried = await retryStudioExport(job.id);
      setExports((current) => current.map((item) => item.id === retried.id ? retried : item));
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The export could not be retried.");
    } finally {
      setRetryingExportId(null);
    }
  }

  const title = mode === "media" ? "Media Library" : mode === "exports" ? "Export History" : mode === "product_card" ? "Product Card Templates" : mode === "cover" ? "Cover Templates" : "Template Library";
  const description = mode === "exports"
    ? "Download completed files, check export details and remove files you no longer need."
    : "Company-safe building blocks stored separately from published catalogue snapshots.";
  const placeholders: LibraryTemplate[] = (PLACEHOLDER_TEMPLATES[mode] || []).map(([name, description], index) => ({ id: `placeholder-${index}`, name, description, visibility_scope: "company", version: 1 }));
  const libraryTemplates: LibraryTemplate[] = mode === "templates" ? templates : [...placeholders, ...templates];

  return <main className={styles.studioHome}>
    <header className={styles.studioHeader}><Link className={styles.studioTitleLink} href="/dashboard" aria-label="Back to Dashboard">GMS · Catalogue Studio</Link><nav><Link href="/catalogue-studio">My Designs</Link><Link href="/catalogue-studio/templates">Templates</Link><Link href="/catalogue-studio/templates/product-cards">Product Cards</Link><Link href="/catalogue-studio/templates/covers">Covers</Link><Link href="/catalogue-studio/media">Media</Link><Link href="/catalogue-studio/exports">Exports</Link></nav><Link href="/catalogue-studio/new">+ Create</Link></header>
    <div className={styles.studioContent}>
      <section className={`${styles.studioHero} ${mode === "exports" ? styles.exportHero : ""}`}>
        <div className={styles.studioHeroCopy}>
          <span>{mode === "exports" ? "Generated files" : "Reusable design system"}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {(mode === "templates" || mode === "cover") && <aside className={styles.templateUploadAction}>
          <span>{mode === "cover" ? "Your cover" : "Your template"}</span>
          <strong>{mode === "cover" ? "Add your cover template" : "Import a saved template"}</strong>
          <p>{mode === "cover" ? "Choose a PDF or image. For PDFs, the first page becomes the cover." : "Choose a PDF or image. Each PDF page becomes a template page you can build on."}</p>
          <label className={styles.primaryAction}>
            {templateImporting ? "Importing…" : mode === "cover" ? "↑ Choose cover file" : "↑ Choose template file"}
            <input
              hidden
              type="file"
              accept={TEMPLATE_FILE_ACCEPT}
              disabled={templateImporting}
              onChange={(event) => void uploadTemplate(event)}
            />
          </label>
          <small>PDF, PNG, JPG, or WebP · Maximum 20 MB</small>
        </aside>}
        {mode === "media" && <label className={styles.primaryAction}>{busy ? "Uploading…" : "+ Upload asset"}<input hidden type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,application/pdf" onChange={(event) => void upload(event)} /></label>}
      </section>
      {(mode === "templates" || mode === "cover") && templateImportError && <p className={styles.libraryError} role="alert">{templateImportError}</p>}
      {(mode === "templates" || mode === "cover") && templateImportNotice && <p className={styles.librarySuccess} role="status">{templateImportNotice}</p>}
      {mode === "media" ? <div className={styles.studioGrid}>{assets.map((asset) => <article className={styles.designCard} key={asset.id}>{asset.mime_type.startsWith("image/") ? <div className={styles.designThumb} style={{ backgroundImage: `url(${API_ORIGIN}${asset.url})`, backgroundSize: "cover", backgroundPosition: "center" }} /> : <div className={styles.designThumb}>{asset.mime_type.startsWith("video/") ? "VIDEO" : "DOCUMENT"}</div>}<h2>{asset.original_filename}</h2><p>{asset.asset_type} · {Math.round(asset.file_size / 1024)} KB</p></article>)}</div>
        : mode === "exports" ? <>{exportError && <p className={styles.libraryError} role="alert">{exportError}</p>}{exports.length ? <div className={styles.exportGrid}>{exports.map((job) => <ExportCard job={job} deleting={deletingExportId === job.id} retrying={retryingExportId === job.id} onDelete={(item) => void removeExport(item)} onRetry={(item) => void retryExport(item)} key={job.id} />)}</div> : <section className={styles.emptyCard}><span className={styles.emptyIcon}>↓</span><h2>No exports yet</h2><p>Create a PDF or image from a catalogue design and it will appear here.</p><Link className={styles.primaryAction} href="/catalogue-studio">Open my designs</Link></section>}</>
          : <section className={styles.templateLibrarySection}>
            <header className={styles.templateLibraryHeader}>
              <div><span>Curated starting points</span><h2>{mode === "templates" ? "Catalogue templates" : title}</h2><p>Preview the complete layout, then create an editable copy for your catalogue.</p></div>
              <strong>{libraryTemplates.length} {libraryTemplates.length === 1 ? "template" : "templates"}</strong>
            </header>
            <div className={`${styles.studioGrid} ${styles.templateLibraryGrid}`}>{libraryTemplates.map((template) => <TemplateCard template={template} onPreview={setPreviewTemplate} key={template.id} />)}</div>
          </section>}
    </div>
    {previewTemplate && <TemplatePreviewDialog template={previewTemplate} onClose={() => setPreviewTemplate(null)} />}
  </main>;
}
