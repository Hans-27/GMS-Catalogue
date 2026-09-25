"use client";

import { type CSSProperties, useState } from "react";
import type { StudioProductCardTemplate } from "@/lib/studio-api";
import { useStudioSidebarCopy } from "@/lib/studio-sidebar-copy";
import { StudioLibrarySearch } from "./studio-tool-sidebar";
import sidebarStyles from "./studio-tool-sidebar.module.css";
import styles from "./studio.module.css";

type Props = {
  templates: StudioProductCardTemplate[];
  loading: boolean;
  onUse:(template:StudioProductCardTemplate)=>void;
  onPreview:(template:StudioProductCardTemplate)=>void;
  onDuplicate?:(template:StudioProductCardTemplate)=>void;
  onDelete?:(template:StudioProductCardTemplate)=>void;
  onRename?:(template:StudioProductCardTemplate)=>void;
  onShare?:(template:StudioProductCardTemplate)=>void;
  onVersions?:(template:StudioProductCardTemplate)=>void;
  onCreateScratch:()=>void;
  canUse?:boolean;
  compact?:boolean;
};

function templateFields(template:StudioProductCardTemplate){
  const value = template.template_data_json.includedFields;
  return Array.isArray(value) ? value.map(String) : [];
}

function templateGovernance(template:StudioProductCardTemplate){
  const value=template.template_data_json.governance;
  return value&&typeof value==="object"?value as Record<string,unknown>:{};
}

type TemplatePreviewStyle = CSSProperties & {
  "--template-accent": string;
  "--template-name": string;
  "--template-price": string;
  "--template-meta": string;
};

function textStyleValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function numberStyleValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function templatePreviewStyle(template: StudioProductCardTemplate): TemplatePreviewStyle {
  const style = template.template_data_json.style || {};
  const shadowBlur = Math.max(0, numberStyleValue(style.shadowBlur, 8));
  const shadowOpacity = Math.max(0, Math.min(100, numberStyleValue(style.shadowOpacity, 18)));
  const shadowColor = textStyleValue(style.shadowColor, "#123D29");
  return {
    backgroundColor: textStyleValue(style.backgroundColor, "#FFFFFF"),
    borderColor: textStyleValue(style.borderColor, "#BDD0C4"),
    borderWidth: Math.max(0, numberStyleValue(style.borderWidth, 1)),
    borderRadius: Math.max(0, numberStyleValue(style.borderRadius, template.border_radius)),
    boxShadow: shadowBlur
      ? `0 7px ${shadowBlur}px color-mix(in srgb, ${shadowColor} ${Math.round(shadowOpacity)}%, transparent)`
      : "none",
    "--template-accent": textStyleValue(style.accentColor || style.detailAccentColor, "#2EAF68"),
    "--template-name": textStyleValue(style.productNameColor, "#173C29"),
    "--template-price": textStyleValue(style.productPriceColor, "#0E7A43"),
    "--template-meta": textStyleValue(style.productMetaColor, "#60746A"),
  };
}

export function ProductCardTemplateSample({ template }: { template: StudioProductCardTemplate }) {
  const fields = templateFields(template);
  const style = template.template_data_json.style || {};
  const layout = textStyleValue(style.cardLayout, template.template_type);
  const hasImage = fields.length === 0 || fields.includes("image");
  const hasCode = fields.includes("code");
  return <span className={styles.cardTemplateSample} data-layout={layout} style={templatePreviewStyle(template)}>
    {hasImage && <i>{layout === "erp_detail" ? "ERP IMAGE" : "IMAGE"}</i>}
    <strong>Sample product</strong>
    {hasCode && <em>SKU-0001</em>}
    <small>{template.price_mode === "no_price" ? "Product details" : template.price_mode === "two_prices" ? "THB 990 / 1,290" : "THB 990"}</small>
  </span>;
}

export function ProductCardTemplateGallery({templates,loading,onUse,onPreview,onDuplicate,onDelete,onRename,onShare,onVersions,onCreateScratch,canUse=true,compact=false}:Props){
  const [menu,setMenu] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const copy = useStudioSidebarCopy();
  const needle = query.trim().toLocaleLowerCase();
  const matches = templates.filter((template) => `${template.name} ${template.description || ""}`.toLocaleLowerCase().includes(needle));
  return <div className={styles.cardTemplateLibrary}>
    <StudioLibrarySearch label={copy.searchLayouts} value={query} onChange={(value) => { setQuery(value); setMenu(null); }} />
    <div className={styles.cardTemplateHeader}>
      {!compact && <div><h3>Product Card Templates</h3><p>Reusable ERP-bound cards. Using a template creates an independent card instance.</p></div>}
      {canUse && <button onClick={onCreateScratch}>+ From scratch</button>}
    </div>
    {loading && <p className={styles.libraryHint}>Loading product card templates…</p>}
    {!loading && templates.length === 0 && <p className={styles.libraryHint}>No templates are available for your account.</p>}
    {!loading && templates.length > 0 && matches.length === 0 && <p className={sidebarStyles.empty} role="status">{copy.noLayouts}</p>}
    <div className={styles.cardTemplateGrid}>{matches.map(template => {
      const fields = templateFields(template);
      const governance = templateGovernance(template);
      const required = Array.isArray(governance.requiredFields) ? governance.requiredFields.map(String) : [];
      return <article key={template.id} className={styles.cardTemplateItem}>
        <button className={styles.cardTemplatePreview} onClick={()=>onPreview(template)} aria-label={`Preview ${template.name}`}>
          <ProductCardTemplateSample template={template} />
        </button>
        <div className={styles.cardTemplateMeta}><div><strong>{template.name}</strong><span>{template.template_type.replaceAll("_"," ")} · {template.card_width} × {template.card_height} {template.dimension_unit}</span></div><span className={styles.templateBadge}>{template.is_company_template ? "System" : "Personal"}</span></div>
        <p>{fields.length ? fields.join(", ") : "Custom fields"}</p>
        {typeof template.template_data_json.recommendedFor === "string" && <p><strong>Best for:</strong> {template.template_data_json.recommendedFor}</p>}
        {governance.brandLocked === true && <p className={styles.templateGovernance}><strong>Brand locked</strong><span>Arial · GMS palette · {required.length} required ERP fields</span></p>}
        <div className={styles.cardTemplateActions}>
          <button onClick={()=>onPreview(template)}>Preview</button>
          {canUse && <button className={styles.primaryAction} onClick={()=>onUse(template)}>Use Template</button>}
          <button aria-label={`Actions for ${template.name}`} onClick={()=>setMenu(menu===template.id?null:template.id)}>•••</button>
        </div>
        {menu === template.id && <div className={styles.cardTemplateMenu}>
          {canUse && <button onClick={()=>{onUse(template);setMenu(null);}}>Use Template</button>}
          <button onClick={()=>{onPreview(template);setMenu(null);}}>Preview</button>
          {onVersions && <button onClick={()=>{onVersions(template);setMenu(null);}}>View / Restore Versions</button>}
          {!template.is_company_template && onRename && <button onClick={()=>{onRename(template);setMenu(null);}}>Edit / Rename</button>}
          {onDuplicate && <button onClick={()=>{onDuplicate(template);setMenu(null);}}>Duplicate / Save as New</button>}
          {!template.is_company_template && onShare && <button onClick={()=>{onShare(template);setMenu(null);}}>Share with company</button>}
          {!template.is_company_template && onDelete && <button onClick={()=>{onDelete(template);setMenu(null);}}>Delete</button>}
        </div>}
      </article>;
    })}</div>
  </div>;
}
