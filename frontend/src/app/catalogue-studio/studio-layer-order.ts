import type { StudioPageDocument } from "@/lib/studio-api";

export const STUDIO_Z_INDEX_MIN = -10_000;
export const STUDIO_Z_INDEX_MAX = 10_000;

export function clampStudioZIndex(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(STUDIO_Z_INDEX_MAX, Math.max(STUDIO_Z_INDEX_MIN, Math.trunc(value)));
}

function normalizeFontWeight(value: unknown): "normal" | "bold" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "bold" || value === "bolder") return "bold";
  if (value === "normal" || value === "lighter") return "normal";

  const numericWeight = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numericWeight)) return numericWeight >= 600 ? "bold" : "normal";
  return "normal";
}

function normalizeFontStyle(value: unknown): "normal" | "italic" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return value === "italic" || value === "oblique" ? "italic" : "normal";
}

/**
 * Keeps layer values within the API contract without changing their visual order.
 * Returning the original object when nothing changed avoids unnecessary renders.
 */
export function normalizeStudioLayerValues(document: StudioPageDocument): StudioPageDocument {
  let changed = false;
  const elements = document.elements.map((element) => {
    const zIndex = clampStudioZIndex(element.zIndex);
    const fontWeight = normalizeFontWeight(element.style.fontWeight);
    const fontStyle = normalizeFontStyle(element.style.fontStyle);
    const weightChanged = fontWeight !== element.style.fontWeight;
    const styleChanged = fontStyle !== element.style.fontStyle;
    const legacyCombinedProductFrame = Boolean(element.groupId && element.style.quickProductBlockId && element.style.independentFrames !== true);
    if (zIndex === element.zIndex && !weightChanged && !styleChanged && !legacyCombinedProductFrame) return element;
    changed = true;
    return {
      ...element,
      ...(legacyCombinedProductFrame ? { groupId: null } : {}),
      zIndex,
      style: {
        ...element.style,
        ...(legacyCombinedProductFrame ? { independentFrames: true } : {}),
        ...(weightChanged ? { fontWeight: fontWeight ?? null } : {}),
        ...(styleChanged ? { fontStyle: fontStyle ?? null } : {}),
      },
    };
  });
  return changed ? { ...document, elements } : document;
}
