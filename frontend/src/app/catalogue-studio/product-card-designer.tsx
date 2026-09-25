"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  createStudioProductCardTemplate,
  getStudioProductCardTemplates,
  updateStudioProductCardTemplate,
  type StudioProductCardTemplate,
  type StudioProductCardTemplatePayload,
} from "@/lib/studio-api";
import { ProductCardTemplateSample } from "./product-card-template-gallery";
import styles from "./studio.module.css";

const LAYOUTS = [
  ["image_above", "Image Above", "Large image with details below"],
  ["image_left", "Image Left", "Horizontal product story"],
  ["erp_detail", "ERP Detail Table", "Rounded card with image, code, barcode and stock"],
  ["minimal", "Minimal", "Compact product and price"],
  ["specification", "Specification", "Detailed fields and specifications"],
  ["price_focus", "Price Focus", "Prominent approved price"],
  ["promotion", "Promotion", "Badge and promotional message"],
  ["no_price", "No Price", "No monetary elements"],
  ["video", "Product Video", "Video indicator and QR"],
  ["horizontal", "Horizontal", "Wide landscape card"],
  ["compact_grid", "Compact Grid", "Dense multi-product layout"],
] as const;

const AVAILABLE_FIELDS = ["image", "code", "barcode", "name_en", "name_th", "description", "brand", "category", "model", "warranty", "price", "stock", "badge", "video", "qr_code"];

function templateFields(template: StudioProductCardTemplate) {
  const raw = template.template_data_json.includedFields ?? template.template_data_json.fields;
  if (!Array.isArray(raw)) return ["image", "code", "name_en", "price"];
  return raw
    .map(String)
    .map((field) => field === "name" ? "name_en" : field)
    .filter((field) => AVAILABLE_FIELDS.includes(field));
}

function templateColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;
}

function templateNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function editableLayout(template: StudioProductCardTemplate) {
  const style = template.template_data_json.style || {};
  const candidate = String(style.cardLayout || template.template_data_json.layout || template.template_type);
  if (candidate === "classic" || candidate === "standard") return "image_above";
  return LAYOUTS.some(([id]) => id === candidate) ? candidate : "image_above";
}

function templateGovernance(template: StudioProductCardTemplate) {
  const value = template.template_data_json.governance;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function governedStyleIsLocked(governance: Record<string, unknown>, key: string) {
  return Array.isArray(governance.lockedStyleKeys) && governance.lockedStyleKeys.map(String).includes(key);
}

function importedProductCardPayload(decoded: unknown, fileName: string): StudioProductCardTemplatePayload {
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("The template JSON must contain an object.");
  const envelope = decoded as Record<string, unknown>;
  if (envelope.format && !["gms-product-card-template", "gms-catalogue-studio"].includes(String(envelope.format))) {
    throw new Error("This is not a supported Catalogue Studio template file.");
  }
  const raw = envelope.template && typeof envelope.template === "object" && !Array.isArray(envelope.template)
    ? envelope.template as Record<string, unknown>
    : envelope;
  const declaredType = String(raw.template_type ?? raw.templateType ?? "");
  if (envelope.format === "gms-catalogue-studio" && declaredType !== "product_card") {
    throw new Error("Choose a product-card template, not a complete catalogue template.");
  }
  const data = raw.template_data ?? raw.templateData ?? raw.template_data_json;
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The product-card template has no editable template data.");
  const cardWidth = templateNumber(raw.card_width ?? raw.cardWidth, 320);
  const cardHeight = templateNumber(raw.card_height ?? raw.cardHeight, 420);
  if (cardWidth < 80 || cardWidth > 3000 || cardHeight < 80 || cardHeight > 3000) throw new Error("Card width and height must be between 80 and 3,000 pixels.");
  const priceMode = String(raw.price_mode ?? raw.priceMode ?? "one_price");
  const layoutMode = String(raw.layout_mode ?? raw.layoutMode ?? "responsive");
  const dimensionUnit = String(raw.dimension_unit ?? raw.dimensionUnit ?? "px");
  return {
    name: String(raw.name || fileName.replace(/\.json$/i, "")).trim().slice(0, 180) || "Imported Product Card",
    description: String(raw.description || "Imported editable product-card template").slice(0, 2000),
    template_type: declaredType && declaredType !== "product_card" ? declaredType.slice(0, 40) : "standard",
    template_data: data as Record<string, unknown>,
    card_width: cardWidth,
    card_height: cardHeight,
    border_radius: Math.min(1000, Math.max(0, templateNumber(raw.border_radius ?? raw.borderRadius, 16))),
    dimension_unit: dimensionUnit === "mm" || dimensionUnit === "%" ? dimensionUnit : "px",
    layout_mode: layoutMode === "fixed" || layoutMode === "freeform" ? layoutMode : "responsive",
    min_width: Math.min(cardWidth, Math.max(40, templateNumber(raw.min_width ?? raw.minWidth, 120))),
    min_height: Math.min(cardHeight, Math.max(40, templateNumber(raw.min_height ?? raw.minHeight, 100))),
    price_mode: priceMode === "two_prices" || priceMode === "no_price" ? priceMode : "one_price",
    visibility_scope: "only_me",
    is_company_template: false,
    change_note: "Imported from user JSON file",
  };
}

export function ProductCardDesigner() {
  const designerRef = useRef<HTMLDivElement>(null);
  const [templates, setTemplates] = useState<StudioProductCardTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<StudioProductCardTemplate | null>(null);
  const [layout, setLayout] = useState("image_above");
  const [name, setName] = useState("My Product Card");
  const [width, setWidth] = useState(320);
  const [height, setHeight] = useState(420);
  const [radius, setRadius] = useState(16);
  const [background, setBackground] = useState("#FFFFFF");
  const [border, setBorder] = useState("#CFE0D5");
  const [fields, setFields] = useState(["image", "code", "name_en", "description", "price", "stock"]);
  const [governance, setGovernance] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void getStudioProductCardTemplates().then(setTemplates).catch(() => {
      setMessage("Saved product card templates could not be loaded.");
    });
  }, []);

  function openTemplate(template: StudioProductCardTemplate) {
    const style = template.template_data_json.style || {};
    setEditingTemplate(template);
    setLayout(editableLayout(template));
    setName(template.is_company_template ? `${template.name} Copy` : template.name);
    setWidth(template.card_width);
    setHeight(template.card_height);
    setRadius(templateNumber(style.borderRadius, template.border_radius));
    setBackground(templateColor(style.backgroundColor, "#FFFFFF"));
    setBorder(templateColor(style.borderColor, "#CFE0D5"));
    setFields(templateFields(template));
    setGovernance(templateGovernance(template));
    setMessage(
      template.is_company_template
        ? `${template.name} loaded. Saving creates your editable personal copy.`
        : `${template.name} opened for editing.`,
    );
    designerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function toggleField(field: string) {
    const required = Array.isArray(governance.requiredFields) ? governance.requiredFields.map(String).map((item) => item === "name" ? "name_en" : item) : [];
    if (fields.includes(field) && required.includes(field)) {
      setMessage(`${field.replaceAll("_", " ")} is required by this company template.`);
      return;
    }
    setFields((current) => current.includes(field) ? current.filter((item) => item !== field) : [...current, field]);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const payload: StudioProductCardTemplatePayload = {
        name,
        description: `${LAYOUTS.find((item) => item[0] === layout)?.[1] || "Custom"} product card`,
        template_type: layout,
        card_width: width,
        card_height: height,
        border_radius: radius,
        price_mode: fields.includes("price") ? "one_price" : "no_price",
        template_data: {
          schemaVersion: 3,
          includedFields: fields,
          bindings: Object.fromEntries(fields.map((field) => [field, `product.${field}`])),
          ...(Object.keys(governance).length ? { governance } : {}),
          style: {
            cardLayout: layout,
            backgroundColor: background,
            borderColor: border,
            borderRadius: radius,
            borderTopLeftRadius: radius,
            borderTopRightRadius: radius,
            borderBottomLeftRadius: radius,
            borderBottomRightRadius: radius,
            objectFit: "contain",
            detailAccentColor: "#F9A83B",
            showProductImage: fields.includes("image"),
            showProductName: fields.includes("name_en") || fields.includes("name_th"),
            showProductSku: fields.includes("code"),
            showProductBarcode: fields.includes("barcode"),
            showProductStock: fields.includes("stock"),
            showProductPrice: fields.includes("price"),
          },
        },
      };
      const updatingPersonalTemplate = editingTemplate !== null && !editingTemplate.is_company_template;
      const saved = updatingPersonalTemplate
        ? await updateStudioProductCardTemplate(editingTemplate.id, { ...payload, change_note: "Updated in Product Card Designer" })
        : await createStudioProductCardTemplate(payload);
      setTemplates((current) => updatingPersonalTemplate
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...current]);
      setEditingTemplate(saved);
      setMessage(updatingPersonalTemplate ? "Product card template updated." : "Product card template saved as your editable copy.");
    } catch {
      setMessage("The product card template could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function importProductCard(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    if (!file.name.toLocaleLowerCase().endsWith(".json")) {
      setMessage("Upload an editable product-card template in JSON format.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage("Product-card template files may not exceed 5 MB.");
      return;
    }
    setImporting(true);
    try {
      const payload = importedProductCardPayload(JSON.parse(await file.text()), file.name);
      const imported = await createStudioProductCardTemplate(payload);
      setTemplates((current) => [imported, ...current.filter((item) => item.id !== imported.id)]);
      openTemplate(imported);
      setMessage(`${imported.name} was uploaded as your private editable template.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The product-card template could not be uploaded.");
    } finally {
      setImporting(false);
    }
  }

  return <main className={styles.studioHome}>
    <header className={styles.studioHeader}>
      <Link className={styles.studioTitleLink} href="/dashboard" aria-label="Back to Dashboard">GMS · Product Card Designer</Link>
      <nav><Link href="/catalogue-studio">My Designs</Link><Link href="/catalogue-studio/templates">Templates</Link><Link href="/catalogue-studio/media">Media</Link></nav>
      <Link href="/catalogue-studio">Done</Link>
    </header>
    <div className={styles.cardDesigner} ref={designerRef}>
      <aside>
        <h2>Starting layouts</h2>
        {LAYOUTS.map(([id, label, description]) => <button key={id} data-active={layout === id} onClick={() => setLayout(id)}><strong>{label}</strong><span>{description}</span></button>)}
      </aside>
      <section>
        <div className={styles.cardDesignerHeading}>
          <div><span>{editingTemplate ? "EDITING SAVED TEMPLATE" : "LIVE SAMPLE DATA"}</span><h1>{name}</h1></div>
          <button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : editingTemplate?.is_company_template ? "Save as my copy" : editingTemplate ? "Save changes" : "Save template"}
          </button>
        </div>
        {message && <p className={styles.cardDesignerMessage} role="status">{message}</p>}
        <div className={styles.cardStage}>
          <article className={`${styles.productCardPreview} ${layout === "erp_detail" ? styles.erpDetailCard : ""}`} data-layout={layout} style={{ width, minHeight: height, borderRadius: radius, background, borderColor: border }}>
            {layout === "erp_detail" ? <>
              <header style={{ backgroundColor: "#F9A83B" }}><span>↓</span><strong>Sample Catalogue Product</strong></header>
              <div className={styles.erpDetailBody}>
                <div className={styles.erpDetailMedia}><b>10 LITER</b>{fields.includes("image") && <div className={styles.sampleImage}>PRODUCT IMAGE</div>}<strong>GMS-10001</strong></div>
                <table><thead><tr><th>Code</th><th>Barcode</th><th>Stock</th></tr></thead><tbody><tr><td>GMS-10001</td><td>8859900012345</td><td>48</td></tr></tbody></table>
              </div>
              <footer><div>{fields.includes("description") && <span>ERP product description</span>}</div>{fields.includes("price") && <strong style={{ backgroundColor: "#F9A83B" }}>THB 1,290.00</strong>}</footer>
            </> : <>
              {fields.includes("image") && <div className={styles.sampleImage}>PRODUCT IMAGE</div>}
              <div className={styles.sampleDetails}>
                {fields.includes("code") && <small>GMS-10001</small>}
                {fields.includes("name_en") && <h2>Sample Catalogue Product</h2>}
                {fields.includes("name_th") && <h3>สินค้าตัวอย่าง</h3>}
                {fields.includes("description") && <p>Customer-facing description from the Product Master.</p>}
                {fields.includes("brand") && <p>Brand: GMS</p>}
                {fields.includes("category") && <p>Category: Home</p>}
                {fields.includes("model") && <p>Model: 2027</p>}
                {fields.includes("warranty") && <p>Warranty: 1 year</p>}
                {fields.includes("price") && <strong>THB 1,290.00</strong>}
                {fields.includes("stock") && <small>In stock: 48</small>}
                {fields.includes("badge") && <i>NEW</i>}
                {fields.includes("video") && <span>▶ Video</span>}
                {fields.includes("qr_code") && <span>▦ QR code</span>}
              </div>
            </>}
          </article>
        </div>
      </section>
      <aside className={styles.cardProperties}>
        <h2>Card properties</h2>
        <label>Template name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <div><label>Width<input type="number" min="80" max="3000" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label><label>Height<input type="number" min="80" max="3000" value={height} onChange={(event) => setHeight(Number(event.target.value))} /></label></div>
        <label>Corner radius<input type="range" min="0" max="100" value={radius} onChange={(event) => setRadius(Number(event.target.value))} /><span>{radius}px</span></label>
        <label>Background<input type="color" value={background} disabled={governedStyleIsLocked(governance, "backgroundColor")} onChange={(event) => setBackground(event.target.value.toUpperCase())} /></label>
        <label>Border<input type="color" value={border} disabled={governedStyleIsLocked(governance, "borderColor")} onChange={(event) => setBorder(event.target.value.toUpperCase())} /></label>
        <h3>Product fields</h3>
        {governance.brandLocked === true && <p className={styles.templateGovernanceNotice}>GMS font, palette and required ERP fields are protected in this approved template.</p>}
        <div className={styles.cardFields}>{AVAILABLE_FIELDS.map((field) => {
          const required = Array.isArray(governance.requiredFields) && governance.requiredFields.map(String).map((item) => item === "name" ? "name_en" : item).includes(field);
          return <label key={field}><input type="checkbox" checked={fields.includes(field)} disabled={required} onChange={() => toggleField(field)} />{field.replaceAll("_", " ")}{required ? " (required)" : ""}</label>;
        })}</div>
      </aside>
    </div>
    <section className={styles.savedCards}>
      <div className={styles.savedCardsHeading}>
        <div><span>REUSABLE PRODUCT CARDS</span><h2>Saved templates</h2><p>Select a card to load it into the designer above.</p></div>
        <div className={styles.savedCardsActions}>
          <strong>{templates.length} templates</strong>
          <label className={styles.primaryAction} aria-disabled={importing}>
            {importing ? "Uploading…" : "Upload product-card template"}
            <input hidden type="file" accept=".json,application/json" disabled={importing} onChange={(event) => void importProductCard(event)} />
          </label>
        </div>
      </div>
      <div className={styles.studioGrid}>
        {templates.map((template) => <button
          type="button"
          className={`${styles.designCard} ${styles.savedTemplateCard}`}
          data-active={editingTemplate?.id === template.id}
          key={template.id}
          onClick={() => openTemplate(template)}
          aria-label={`Open ${template.name}`}
        >
          <div className={styles.designThumb}><ProductCardTemplateSample template={template}/></div>
          <div className={styles.savedTemplateBody}>
            <div><span>{template.is_company_template ? "COMPANY TEMPLATE" : "MY TEMPLATE"}</span><h2>{template.name}</h2><p>{template.card_width} × {template.card_height} · {template.border_radius}px radius</p></div>
            <strong>{template.is_company_template ? "Open as editable copy" : "Open and edit"}<b aria-hidden="true">→</b></strong>
          </div>
        </button>)}
      </div>
    </section>
  </main>;
}
