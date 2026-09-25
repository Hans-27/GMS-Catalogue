import type { StudioElement, StudioPageDocument, StudioProductCardTemplate } from "@/lib/studio-api";

export type ProductCardSizePreset = "small" | "medium" | "large" | "full" | "half" | "third" | "quarter" | "a4-1" | "a4-2" | "a4-4" | "a4-6" | "a4-8";

export function pixelsToPercent(value:number,total:number){ return total > 0 ? value / total * 100 : 0; }
export function percentToPixels(value:number,total:number){ return value / 100 * total; }
export function pixelsToMillimeters(value:number){ return value * 25.4 / 96; }
export function millimetersToPixels(value:number){ return value * 96 / 25.4; }

export function cardPresetSize(preset:ProductCardSizePreset,pageWidth:number,pageHeight:number){
  const margin = Math.max(20, Math.min(pageWidth, pageHeight) * .035);
  const gap = 16;
  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2;
  if (preset === "small") return { width: Math.min(240, availableWidth), height: Math.min(260, availableHeight) };
  if (preset === "medium") return { width: Math.min(340, availableWidth), height: Math.min(400, availableHeight) };
  if (preset === "large") return { width: Math.min(480, availableWidth), height: Math.min(560, availableHeight) };
  if (preset === "full" || preset === "a4-1") return { width: availableWidth, height: availableHeight };
  if (preset === "half" || preset === "a4-2") return { width: availableWidth, height: (availableHeight - gap) / 2 };
  if (preset === "third") return { width: (availableWidth - gap * 2) / 3, height: availableHeight };
  if (preset === "quarter" || preset === "a4-4") return { width: (availableWidth - gap) / 2, height: (availableHeight - gap) / 2 };
  if (preset === "a4-6") return { width: (availableWidth - gap) / 2, height: (availableHeight - gap * 2) / 3 };
  return { width: (availableWidth - gap) / 2, height: (availableHeight - gap * 3) / 4 };
}

export function templateStyle(template:StudioProductCardTemplate){
  const source = template.template_data_json.style || {};
  const governance = template.template_data_json.governance;
  const governed = governance && typeof governance === "object" ? governance as Record<string, unknown> : {};
  const lockedStyleKeys = Array.isArray(governed.lockedStyleKeys) ? governed.lockedStyleKeys.map(String) : [];
  const requiredFields = Array.isArray(governed.requiredFields) ? governed.requiredFields.map(String) : [];
  const result:Record<string,string|number|boolean|null> = { ...source, borderRadius: template.border_radius,
    layoutMode: template.layout_mode, minWidth: template.min_width, minHeight: template.min_height,
    lockAspectRatio: false, templateVersion: template.current_version, priceMode: template.price_mode,
    governanceProfile: typeof governed.profile === "string" ? governed.profile : "",
    governedStyleKeys: lockedStyleKeys.join(","), governedRequiredFields: requiredFields.join(","),
  };
  for (const key of lockedStyleKeys) {
    const value = source[key];
    if (["string", "number", "boolean"].includes(typeof value) || value === null) {
      result[`governed${key.charAt(0).toUpperCase()}${key.slice(1)}`] = value as string|number|boolean|null;
    }
  }
  return result;
}

export function fitInsidePage(element:StudioElement,document:StudioPageDocument):StudioElement{
  const minimumWidth = pixelsToPercent(1, document.canvas.width);
  const minimumHeight = pixelsToPercent(1, document.canvas.height);
  const width = Math.min(100, Math.max(minimumWidth, element.widthPercent));
  const height = Math.min(100, Math.max(minimumHeight, element.heightPercent));
  return { ...element, widthPercent: width, heightPercent: height,
    xPercent: Math.max(0, Math.min(100 - width, element.xPercent)),
    yPercent: Math.max(0, Math.min(100 - height, element.yPercent)) };
}

export function applyCardPreset(element:StudioElement,document:StudioPageDocument,preset:ProductCardSizePreset){
  const size = cardPresetSize(preset, document.canvas.width, document.canvas.height);
  return fitInsidePage({ ...element,
    widthPercent: pixelsToPercent(size.width, document.canvas.width),
    heightPercent: pixelsToPercent(size.height, document.canvas.height),
  }, document);
}

export type AutoLayoutOptions = { columns:number; cardWidth:number; cardHeight:number; horizontalGap:number; verticalGap:number; margin:number };

export function autoLayoutProductCards(document:StudioPageDocument,selectedIds:string[],options:AutoLayoutOptions){
  const columns = Math.max(1, Math.floor(options.columns));
  const cards = document.elements.filter(element => selectedIds.includes(element.id) && element.type === "product_card");
  const availableWidth = document.canvas.width - options.margin * 2;
  const maxWidth = (availableWidth - options.horizontalGap * (columns - 1)) / columns;
  const width = Math.min(Math.max(40, options.cardWidth), Math.max(40, maxWidth));
  const height = Math.max(40, options.cardHeight);
  const laidOut = new Map(cards.map((card,index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = options.margin + column * (width + options.horizontalGap);
    const y = options.margin + row * (height + options.verticalGap);
    return [card.id, fitInsidePage({ ...card,
      xPercent: pixelsToPercent(x, document.canvas.width), yPercent: pixelsToPercent(y, document.canvas.height),
      widthPercent: pixelsToPercent(width, document.canvas.width), heightPercent: pixelsToPercent(height, document.canvas.height),
    }, document)] as const;
  }));
  return { ...document, elements: document.elements.map(element => laidOut.get(element.id) || element), overflowCount: cards.filter((_,index) => options.margin + Math.floor(index / columns) * (height + options.verticalGap) + height > document.canvas.height - options.margin).length };
}
