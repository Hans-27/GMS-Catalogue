"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  API_ORIGIN,
  getGlobalProductCard,
  getGlobalProductCardVersions,
  publishGlobalProductCard,
  restoreGlobalProductCardVersion,
  saveGlobalProductCardDraft,
  type GlobalProductCardDetail,
  type GlobalProductCardVersion,
  type ProductCardPresentation,
} from "@/lib/api";
import { getStudioProductCardTemplates, type StudioProductCardTemplate } from "@/lib/studio-api";
import styles from "../../product-cards.module.css";

const DEFAULT_APPEARANCE = { accent_color: "#86e7c0", strong_color: "#0f7a45", surface_color: "#effcf4", border_color: "#159050", text_color: "#083923" };

function mediaUrl(value: string) { return value.startsWith("http") ? value : `${API_ORIGIN}${value}`; }

function startingPresentation(card: GlobalProductCardDetail): ProductCardPresentation {
  const source = Object.keys(card.draft).length ? card.draft : card.published || {};
  return {
    display_name: source.display_name || card.name,
    display_name_th: source.display_name_th || "",
    description: source.description || "",
    description_th: source.description_th || "",
    badge: source.badge || "",
    image_urls: source.image_urls?.length ? source.image_urls : card.images.map((image) => image.url),
    appearance: { ...DEFAULT_APPEARANCE, ...source.appearance },
    visible_fields: { model: true, warranty: true, barcode: true, stock: true, price: true, ...source.visible_fields },
  };
}

export function ProductCardEditor({ productId }: { productId: string }) {
  const [card, setCard] = useState<GlobalProductCardDetail | null>(null);
  const [presentation, setPresentation] = useState<ProductCardPresentation>({ appearance: DEFAULT_APPEARANCE });
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<StudioProductCardTemplate[]>([]);
  const [versions, setVersions] = useState<GlobalProductCardVersion[]>([]);
  const [busy, setBusy] = useState<"save" | "publish" | "restore" | "">("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      getGlobalProductCard(productId), getStudioProductCardTemplates(), getGlobalProductCardVersions(productId),
    ]).then(([detail, availableTemplates, history]) => {
      if (!active) return;
      setCard(detail); setPresentation(startingPresentation(detail)); setTemplateId(detail.template_id);
      setTemplates(availableTemplates.filter((item) => item.is_company_template && item.approval_status === "approved" && item.is_active));
      setVersions(history);
    }).catch((reason: Error) => { if (active) setError(reason.message || "Could not load product card."); });
    return () => { active = false; };
  }, [productId]);

  const appearance = { ...DEFAULT_APPEARANCE, ...presentation.appearance };
  const selectedImages = presentation.image_urls || [];
  const previewImage = selectedImages[0] || card?.images[0]?.url;
  const affectedNames = useMemo(() => card?.affected_catalogues.map((item) => item.title).join("\n") || "No catalogues currently contain this product.", [card]);

  function update<K extends keyof ProductCardPresentation>(key: K, value: ProductCardPresentation[K]) {
    setPresentation((current) => ({ ...current, [key]: value })); setMessage("");
  }
  function updateAppearance(key: keyof typeof DEFAULT_APPEARANCE, value: string) {
    setPresentation((current) => ({ ...current, appearance: { ...DEFAULT_APPEARANCE, ...current.appearance, [key]: value } }));
  }
  function selectTemplate(nextId: string) {
    setTemplateId(nextId || null);
    const template = templates.find((item) => item.id === nextId);
    if (!template) return;
    const style = template.template_data_json.style || {};
    const fields = new Set(Array.isArray(template.template_data_json.includedFields) ? template.template_data_json.includedFields : []);
    setPresentation((current) => ({
      ...current,
      appearance: {
        ...DEFAULT_APPEARANCE,
        ...current.appearance,
        surface_color: String(style.backgroundColor || current.appearance?.surface_color || DEFAULT_APPEARANCE.surface_color),
        border_color: String(style.borderColor || current.appearance?.border_color || DEFAULT_APPEARANCE.border_color),
        accent_color: String(style.accentColor || current.appearance?.accent_color || DEFAULT_APPEARANCE.accent_color),
        strong_color: String(style.detailAccentColor || style.productPriceColor || current.appearance?.strong_color || DEFAULT_APPEARANCE.strong_color),
        text_color: String(style.productNameColor || current.appearance?.text_color || DEFAULT_APPEARANCE.text_color),
      },
      visible_fields: fields.size ? {
        model: fields.has("code"), warranty: fields.has("description"), description: fields.has("description"),
        barcode: fields.has("barcode"), stock: fields.has("stock"), price: fields.has("price"),
      } : current.visible_fields,
      layout: String(style.cardLayout || template.template_type || current.layout || "standard"),
    }));
  }
  function toggleField(key: string) {
    setPresentation((current) => ({
      ...current,
      visible_fields: { ...current.visible_fields, [key]: current.visible_fields?.[key] === false },
    }));
  }
  function moveImage(index: number, direction: -1 | 1) {
    const next = [...selectedImages]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]]; update("image_urls", next);
  }
  function toggleImage(url: string) {
    update("image_urls", selectedImages.includes(url) ? selectedImages.filter((item) => item !== url) : [...selectedImages, url]);
  }
  async function saveDraft() {
    if (!card) return null;
    setBusy("save"); setError("");
    try {
      const saved = await saveGlobalProductCardDraft(productId, { template_id: templateId, revision: card.draft_revision, presentation });
      setCard(saved); setMessage("Draft saved."); return saved;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save draft."); return null; }
    finally { setBusy(""); }
  }
  async function publish() {
    if (!card) return;
    const confirmed = window.confirm(`Publish this card to ${card.affected_catalogue_count} catalogue(s)?\n\n${affectedNames}`);
    if (!confirmed) return;
    setBusy("publish"); setError("");
    try {
      const saved = await saveGlobalProductCardDraft(productId, { template_id: templateId, revision: card.draft_revision, presentation });
      const published = await publishGlobalProductCard(productId, saved.draft_revision);
      setCard(published); setVersions(await getGlobalProductCardVersions(productId)); setMessage(`Published globally as version ${published.active_version}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not publish product card."); }
    finally { setBusy(""); }
  }
  async function restore(version: GlobalProductCardVersion) {
    if (!window.confirm(`Restore and publish version ${version.version_number}?`)) return;
    setBusy("restore"); setError("");
    try { const restored = await restoreGlobalProductCardVersion(productId, version.id); setCard(restored); setPresentation(startingPresentation(restored)); setTemplateId(restored.template_id); setVersions(await getGlobalProductCardVersions(productId)); setMessage(`Version ${version.version_number} restored as version ${restored.active_version}.`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not restore version."); }
    finally { setBusy(""); }
  }

  if (error && !card) return <main className={styles.workspace}><p className={styles.error} role="alert">{error}</p><Link href="/product-cards">← Product Cards</Link></main>;
  if (!card) return <main className={styles.workspace}><p className={styles.state}>Loading editor…</p></main>;

  return <main className={styles.editorWorkspace}>
    <header className={styles.editorTopbar}>
      <Link href="/product-cards">← Product Cards</Link><div><span>GLOBAL PRODUCT CARD</span><h1>{card.name}</h1></div>
      <div className={styles.topActions}><button type="button" onClick={() => void saveDraft()} disabled={Boolean(busy)}>{busy === "save" ? "Saving…" : "Save draft"}</button><button className={styles.primary} type="button" onClick={() => void publish()} disabled={Boolean(busy)}>{busy === "publish" ? "Publishing…" : "Publish globally"}</button></div>
    </header>
    {(error || message) && <p className={error ? styles.error : styles.success} role={error ? "alert" : "status"}>{error || message}</p>}
    <div className={styles.editorLayout}>
      <aside className={styles.controls}>
        <section><h2>Design</h2><label>Approved card design<select value={templateId || ""} onChange={(event) => selectTemplate(event.target.value)}><option value="">Catalogue default</option>{templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className={styles.fieldToggles}>{["model", "warranty", "description", "barcode", "stock", "price"].map((field) => <label key={field}><input type="checkbox" checked={presentation.visible_fields?.[field] !== false} onChange={() => toggleField(field)} />{field}</label>)}</div></section>
        <section><h2>Content</h2><label>English display name<input value={presentation.display_name || ""} onChange={(event) => update("display_name", event.target.value)} /></label><label>Thai display name<input value={presentation.display_name_th || ""} onChange={(event) => update("display_name_th", event.target.value)} /></label><label>English description<textarea value={presentation.description || ""} onChange={(event) => update("description", event.target.value)} /></label><label>Thai description<textarea value={presentation.description_th || ""} onChange={(event) => update("description_th", event.target.value)} /></label><label>Badge<input value={presentation.badge || ""} onChange={(event) => update("badge", event.target.value)} placeholder="Optional" /></label></section>
        <section><h2>Colours</h2><div className={styles.colors}>{Object.entries(appearance).map(([key, value]) => <label key={key}>{key.replaceAll("_", " ")}<input type="color" value={value} onChange={(event) => updateAppearance(key as keyof typeof DEFAULT_APPEARANCE, event.target.value)} /></label>)}</div></section>
        <section><h2>Product images</h2><p>Choose synchronized images and set their order. The first image is the card cover.</p><div className={styles.imageList}>{card.images.map((image) => { const index = selectedImages.indexOf(image.url); return <div key={image.id} data-selected={index >= 0}><input type="checkbox" checked={index >= 0} onChange={() => toggleImage(image.url)} aria-label={`Use ${image.alt_text || "product image"}`} /><img src={mediaUrl(image.url)} alt={image.alt_text} /><span>{index >= 0 ? index + 1 : "Off"}</span><button type="button" disabled={index <= 0} onClick={() => moveImage(index, -1)}>↑</button><button type="button" disabled={index < 0 || index === selectedImages.length - 1} onClick={() => moveImage(index, 1)}>↓</button></div>; })}</div></section>
        <section className={styles.locked}><h2>Locked ERP fields</h2><p>These values remain synchronized and cannot be changed here.</p><dl><div><dt>Product code</dt><dd>{card.erp_fields.code}</dd></div><div><dt>Barcode</dt><dd>{card.erp_fields.barcode || "—"}</dd></div><div><dt>Present stock</dt><dd>{card.erp_fields.stock_quantity ?? "—"}</dd></div><div><dt>Synchronized price</dt><dd>{card.erp_fields.price || "Catalogue customer link"}</dd></div></dl></section>
      </aside>
      <section className={styles.previewArea}>
        <div className={styles.previewHeading}><div><span>LIVE PREVIEW</span><h2>Product card</h2></div><small>{card.affected_catalogue_count} catalogues will use the published version</small></div>
        <article className={styles.previewCard} style={{ "--accent": appearance.accent_color, "--strong": appearance.strong_color, "--surface": appearance.surface_color, "--border": appearance.border_color, "--text": appearance.text_color } as CSSProperties}>
          <header><h3>{presentation.display_name || card.name}</h3>{presentation.badge && <span>{presentation.badge}</span>}</header><div className={styles.previewBody}><div className={styles.previewImage}>{previewImage ? <img src={mediaUrl(previewImage)} alt="" /> : <span>No selected image</span>}</div><div><p className={styles.model}>Product code: {card.erp_fields.code}</p><p>{presentation.description || card.erp_fields.description}</p><table><thead><tr><th>BARCODE</th><th>STOCK</th><th>PRICE</th></tr></thead><tbody><tr><td>{card.erp_fields.barcode || "—"}</td><td>{card.erp_fields.stock_quantity ?? "—"}</td><td>{card.erp_fields.price || "By customer link"}</td></tr></tbody></table></div></div>
        </article>
        <section className={styles.affected}><h2>Publishing impact</h2>{card.affected_catalogues.length ? <ul>{card.affected_catalogues.map((item) => <li key={item.id}><span>{item.title}</span><small>{item.status}</small></li>)}</ul> : <p>No catalogues currently contain this product.</p>}</section>
        <section className={styles.history}><h2>Version history</h2>{versions.length ? versions.map((version) => <div key={version.id}><span><strong>Version {version.version_number}</strong><small>{new Date(version.published_at).toLocaleString()}</small></span><p>{version.change_note || "Published product card"}</p><button type="button" onClick={() => void restore(version)} disabled={Boolean(busy) || version.version_number === card.active_version}>{version.version_number === card.active_version ? "Current" : "Restore"}</button></div>) : <p>No published versions yet.</p>}</section>
      </section>
    </div>
  </main>;
}
