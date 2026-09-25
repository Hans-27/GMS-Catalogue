"use client";

import { useEffect, useMemo, useState } from "react";
import { API_URL, type PublicCatalogue } from "@/lib/api";
import { hydratePublicStudioDesign } from "@/lib/public-studio-pricing";
import { getStudioRenderSnapshot, type StudioDesign, type StudioPage, type StudioRenderSnapshot } from "@/lib/studio-api";
import { CataloguePageRenderer } from "./studio-preview";

function toStudioPage(snapshot: StudioRenderSnapshot, page: StudioRenderSnapshot["pages"][number]): StudioPage {
  return {
    id: page.id,
    design_id: snapshot.design.id,
    page_type: page.pageType,
    page_name: page.pageName,
    display_order: page.displayOrder,
    width: page.width,
    height: page.height,
    orientation: page.orientation,
    background_color: page.backgroundColor,
    page_data_json: page.pageData,
    is_visible: page.isVisible,
    is_locked: page.isLocked,
    created_at: "",
    updated_at: "",
  };
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete) {
    return image.naturalWidth > 0
      ? image.decode?.().catch(() => undefined) || Promise.resolve()
      : Promise.reject(new Error(`Image failed to load: ${image.currentSrc || image.src}`));
  }
  return new Promise<void>((resolve, reject) => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => reject(new Error(`Image failed to load: ${image.currentSrc || image.src}`)), { once: true });
  });
}

async function waitForRenderAssets() {
  if (document.fonts?.ready) await document.fonts.ready;
  const startedAt = Date.now();
  while (document.querySelector('[data-studio-media-state="pending"]')) {
    if (Date.now() - startedAt > 30_000) throw new Error("Timed out while loading protected catalogue media.");
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  const failed = document.querySelector('[data-studio-media-state="error"]');
  if (failed) throw new Error("A protected Studio image could not be loaded for this saved catalogue version.");
  await Promise.all(Array.from(document.images).map(waitForImage));
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function publicDesignSnapshot(design: StudioDesign): StudioRenderSnapshot {
  return {
    design: {
      id: design.id,
      name: design.name,
      pageWidth: design.page_width,
      pageHeight: design.page_height,
      orientation: design.orientation,
      sizePreset: design.size_preset,
      dataMode: design.data_mode,
      catalogueType: design.catalogue_type,
      brandMode: design.brand_mode,
      startAt: design.start_at,
      endAt: design.end_at,
      timezone: design.timezone,
      promotionName: design.promotion_name,
      promotionStatus: design.promotion_status,
    },
    brands: design.selected_brands.map((item) => ({ brandId: item.brand_id, displayOrder: item.display_order, isVisible: item.is_visible })),
    priceSlots: design.price_slots.map((item) => ({ slotNumber: item.slot_number, priceListId: item.price_list_id, displayLabel: item.display_label, currencyDisplay: item.currency_display, decimalPlaces: item.decimal_places, isVisible: item.is_visible })),
    products: design.product_items.map((item) => ({ productId: item.product_id, displayOrder: item.display_order, isVisible: item.is_visible, selectedVideoId: item.selected_video_id })),
    pages: design.pages.map((page) => ({ id: page.id, pageType: page.page_type, pageName: page.page_name, displayOrder: page.display_order, width: page.width, height: page.height, orientation: page.orientation, backgroundColor: page.background_color, isVisible: page.is_visible, isLocked: page.is_locked, pageData: page.page_data_json })),
  };
}

export function PdfRenderDocument({ designId, versionId, pageId, publicToken = "" }: { designId: string; versionId: string; pageId: string; publicToken?: string }) {
  const [snapshot, setSnapshot] = useState<StudioRenderSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    const request = publicToken
      ? Promise.all([
          fetch(`${API_URL}/v1/public/catalogues/${encodeURIComponent(publicToken)}`, { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("The public catalogue price mapping could not be loaded.");
            return response.json() as Promise<PublicCatalogue>;
          }),
          fetch(`${API_URL}/v1/public/catalogues/${encodeURIComponent(publicToken)}/studio`, { cache: "no-store" }).then(async (response) => {
            if (!response.ok) throw new Error("The published Studio catalogue could not be loaded.");
            return response.json() as Promise<StudioDesign>;
          }),
        ]).then(([catalogue, design]) => publicDesignSnapshot(hydratePublicStudioDesign(design, catalogue, publicToken)))
      : getStudioRenderSnapshot(designId, versionId);
    void request
      .then((value) => { if (!disposed) setSnapshot(value); })
      .catch((caught: unknown) => { if (!disposed) setError(caught instanceof Error ? caught.message : "The saved catalogue version could not be loaded."); });
    return () => { disposed = true; };
  }, [designId, publicToken, versionId]);

  const visiblePages = useMemo(
    () => snapshot?.pages.filter((page) => page.isVisible).sort((left, right) => left.displayOrder - right.displayOrder) || [],
    [snapshot],
  );
  const selectedPage = visiblePages.find((page) => page.id === pageId);
  const pageNumber = Math.max(1, visiblePages.findIndex((page) => page.id === pageId) + 1);
  const hiddenProductIds = useMemo(
    () => new Set((snapshot?.products || []).filter((product) => !product.isVisible).map((product) => product.productId)),
    [snapshot],
  );

  useEffect(() => {
    if (error) {
      document.body.dataset.pdfError = error;
      delete document.body.dataset.pdfReady;
      return;
    }
    if (!snapshot || !selectedPage) return;
    let disposed = false;
    void waitForRenderAssets()
      .then(() => {
        if (disposed) return;
        document.body.dataset.pdfReady = "true";
        delete document.body.dataset.pdfError;
      })
      .catch((caught: unknown) => {
        if (disposed) return;
        document.body.dataset.pdfError = caught instanceof Error ? caught.message : "Catalogue assets did not finish loading.";
        delete document.body.dataset.pdfReady;
      });
    return () => { disposed = true; };
  }, [error, selectedPage, snapshot]);

  if (error) return <main role="alert">{error}</main>;
  if (!snapshot) return <main role="status">Preparing saved catalogue page…</main>;
  if (!selectedPage) return <main role="alert">The requested saved catalogue page does not exist or is hidden.</main>;

  const page = toStudioPage(snapshot, selectedPage);
  const background = page.page_data_json.canvas.backgroundColor || page.background_color || "#FFFFFF";
  const isLandscape = page.width > page.height;
  const physicalWidth = isLandscape ? "297mm" : "210mm";
  const physicalHeight = isLandscape ? "210mm" : "297mm";
  const physicalWidthPixels = (isLandscape ? 297 : 210) * 96 / 25.4;
  const physicalHeightPixels = (isLandscape ? 210 : 297) * 96 / 25.4;
  return <>
    <style>{`
      @page { size: ${physicalWidth} ${physicalHeight}; margin: 0; }
      html, body { width: ${physicalWidth}; height: ${physicalHeight}; margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: ${background}; }
      body > main { margin: 0; }
    `}</style>
    <main style={{ position: "relative", width: page.width, height: page.height, overflow: "hidden", background, transformOrigin: "top left", transform: `scale(${physicalWidthPixels / page.width}, ${physicalHeightPixels / page.height})` }}>
      <CataloguePageRenderer
        designId={designId}
        page={page}
        pageNumber={pageNumber}
        mode="pdf"
        scale={1}
        hiddenProductIds={hiddenProductIds}
        renderOnly
      />
    </main>
  </>;
}
