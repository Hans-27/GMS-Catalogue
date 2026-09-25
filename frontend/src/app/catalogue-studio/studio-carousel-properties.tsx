"use client";

/* eslint-disable @next/next/no-img-element -- Studio previews use authenticated blob/data URLs and exact canvas dimensions. */

import { useEffect } from "react";
import type { DragEvent } from "react";
import type { StudioAsset, StudioAvailableProduct, StudioCarouselConfig, StudioCarouselImage, StudioElement } from "@/lib/studio-api";
import { carouselImageUrl } from "./studio-image-carousel";
import styles from "./studio.module.css";

export type CarouselUploadState = {
  id: string;
  name: string;
  status: "uploading" | "success" | "failed" | "cancelled";
  error?: string;
};

type Props = {
  designId: string;
  element: StudioElement;
  products: StudioAvailableProduct[];
  productSearch?: string;
  selectedProduct: StudioAvailableProduct | null;
  assets: StudioAsset[];
  uploads: CarouselUploadState[];
  draggingImageId: string | null;
  canEdit: boolean;
  canUpload: boolean;
  canSelectProductImages: boolean;
  canReorder: boolean;
  canConfigureTransition: boolean;
  canConfigurePdf: boolean;
  onBindProduct: (productId: string) => void;
  onRemoveProduct?: (productId: string) => void;
  onProductSearch?: (query: string) => void;
  onToggleProductImage: (imageId: string, checked: boolean) => void;
  onUpload: (files: FileList | File[]) => void;
  onCancelUpload: (id: string) => void;
  onAddAsset: (assetId: string) => void;
  onPatch: (changes: Partial<StudioCarouselConfig>) => void;
  onPatchSection: <K extends "transition" | "navigation" | "display" | "pdf">(section: K, changes: Partial<StudioCarouselConfig[K]>) => void;
  onUpdateImage: (imageId: string, changes: Partial<StudioCarouselImage>) => void;
  onMoveImage: (imageId: string, destination: number) => void;
  onRemoveImage: (imageId: string) => void;
  onReplaceImage: (imageId: string, file?: File) => void;
  onDraggingImageId: (imageId: string | null) => void;
};

function sourceLabel(image: StudioCarouselImage) {
  if (image.sourceType === "product_image") return "ERP product";
  if (image.sourceType === "brand_media") return "Brand media";
  if (image.sourceType === "catalogue_media") return "Catalogue media";
  return "Upload";
}

export function StudioCarouselProperties(props: Props) {
  const { element, selectedProduct } = props;
  const config = element.carousel;
  const readOnly = !props.canEdit;
  const onPatchSection = props.onPatchSection;

  useEffect(() => {
    if (!config || readOnly || config.transition.autoplay && config.transition.autoplayDelayMs === 3000 && config.transition.loop) return;
    onPatchSection("transition", { autoplay: true, autoplayDelayMs: 3000, loop: true });
  }, [config, onPatchSection, readOnly]);

  if (!config) return null;
  const images = Array.from(new Map(config.images.map((image) => [image.id, image])).values()).sort((a, b) => a.displayOrder - b.displayOrder);
  const productImageIds = new Set(config.selectedImageIds);
  const boundProductIds = config.productIds || (config.productId ? [config.productId] : []);

  const dropImage = (event: DragEvent<HTMLElement>, targetIndex: number) => {
    event.preventDefault();
    if (props.draggingImageId) props.onMoveImage(props.draggingImageId, targetIndex);
    props.onDraggingImageId(null);
  };

  return <section className={styles.carouselProperties} aria-label="Image Carousel properties">
    <div className={styles.carouselPropertiesTitle}>
      <div><strong>Image Carousel</strong><small>Combine ERP and uploaded images in one ordered, accessible gallery.</small></div>
      <span>{images.filter((image) => image.isActive).length} active / {images.length}</span>
    </div>

    {props.canSelectProductImages && <fieldset className={styles.cardPropertyGroup} disabled={readOnly}>
      <legend>Product binding</legend>
      <label>Search products<input type="search" value={props.productSearch || ""} onChange={(event) => props.onProductSearch?.(event.target.value)} placeholder="Name, SKU, barcode, brand or category" /></label>
      <label>Add product<select value="" onChange={(event) => { if (event.target.value) props.onBindProduct(event.target.value); }}><option value="">Select another ERP product...</option>{props.products.filter((product) => !boundProductIds.includes(product.id)).map((product) => <option key={product.id} value={product.id}>{product.display_name || product.erp_name} - {product.sku}</option>)}</select></label>
      {boundProductIds.length > 0 && <div className={styles.carouselBoundProducts}>{boundProductIds.map((productId) => { const product = props.products.find((item) => item.id === productId); const image = images.find((item) => item.productId === productId); return <span key={productId}><b>{product?.display_name || product?.erp_name || image?.altText || productId}</b><button type="button" aria-label={`Remove ${product?.display_name || image?.altText || "product"}`} onClick={() => props.onRemoveProduct?.(productId)}>×</button></span>; })}</div>}
      {selectedProduct && <>
        <label className={styles.inlineCheck}><input type="checkbox" checked={config.autoIncludeNewImages} onChange={(event) => props.onPatch({ autoIncludeNewImages: event.target.checked })} /> Automatically include new ERP images</label>
        <div className={styles.carouselProductImages}>{selectedProduct.images.map((image) => <label key={image.id}>
          <input type="checkbox" checked={productImageIds.has(image.id)} onChange={(event) => props.onToggleProductImage(image.id, event.target.checked)} />
          <img src={image.url} alt={image.alt_text || selectedProduct.display_name || selectedProduct.erp_name} />
          <span>{image.file_name}</span>
        </label>)}</div>
        {!selectedProduct.images.length && <p className={styles.libraryHint}>This product has no synchronized ERP images.</p>}
        {props.canUpload && <label className={styles.carouselAddMoreImages}><strong>+ Add more images to this carousel</strong><small>Select multiple JPG, PNG or WebP files at once.</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files?.length) props.onUpload(event.target.files); event.target.value = ""; }} /></label>}
      </>}
    </fieldset>}

    {props.canUpload && <fieldset className={styles.cardPropertyGroup} disabled={readOnly}>
      <legend>Add images</legend>
      <label>Media Library<select defaultValue="" onChange={(event) => { props.onAddAsset(event.target.value); event.target.value = ""; }}><option value="">Choose an existing image...</option>{props.assets.filter((asset) => asset.mime_type.startsWith("image/")).map((asset) => <option key={asset.id} value={asset.id}>{asset.original_filename}</option>)}</select></label>
      <label className={styles.carouselDropZone} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (event.dataTransfer.files.length) props.onUpload(event.dataTransfer.files); }}>
        <strong>Upload multiple images</strong><span>Drop JPG, PNG or WebP files here, or browse.</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => { if (event.target.files?.length) props.onUpload(event.target.files); event.target.value = ""; }} />
      </label>
      {props.uploads.length > 0 && <div className={styles.carouselUploadList}>{props.uploads.map((upload) => <div key={upload.id} data-status={upload.status}><span>{upload.name}</span><small>{upload.error || upload.status}</small>{upload.status === "uploading" && <button type="button" onClick={() => props.onCancelUpload(upload.id)}>Cancel</button>}</div>)}</div>}
    </fieldset>}

    <fieldset className={styles.cardPropertyGroup} disabled={readOnly}>
      <legend>Images and order</legend>
      <div className={styles.carouselImageManager}>
        {images.map((image, index) => <article key={image.id} draggable={props.canReorder && !readOnly} data-dragging={props.draggingImageId === image.id} onDragStart={() => props.onDraggingImageId(image.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropImage(event, index)} onDragEnd={() => props.onDraggingImageId(null)}>
          <span className={styles.carouselImageDrag} aria-hidden="true">::</span>
          <img src={carouselImageUrl(props.designId, element, image)} alt={image.altText || image.fileName} />
          <div><strong>{image.fileName}</strong><small>{sourceLabel(image)} - position {index + 1}</small><input aria-label={`Alternative text for ${image.fileName}`} value={image.altText} placeholder="Alternative text" onChange={(event) => props.onUpdateImage(image.id, { altText: event.target.value })} /></div>
          <label className={styles.carouselActiveToggle}><input type="checkbox" checked={image.isActive} onChange={(event) => props.onUpdateImage(image.id, { isActive: event.target.checked })} /> Active</label>
          <div className={styles.carouselImageActions}>
            {props.canReorder && <><button type="button" onClick={() => props.onMoveImage(image.id, 0)} disabled={index === 0}>First</button><button type="button" onClick={() => props.onMoveImage(image.id, index - 1)} disabled={index === 0}>&lt;</button><button type="button" onClick={() => props.onMoveImage(image.id, index + 1)} disabled={index === images.length - 1}>&gt;</button><button type="button" onClick={() => props.onMoveImage(image.id, images.length - 1)} disabled={index === images.length - 1}>Last</button></>}
            {props.canUpload && <label>Replace<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { props.onReplaceImage(image.id, event.target.files?.[0]); event.target.value = ""; }} /></label>}
            <button type="button" onClick={() => props.onPatch({ images: [...images, { ...image, id: crypto.randomUUID(), displayOrder: images.length + 1 }] })}>Duplicate</button>
            <button type="button" className={styles.dangerButton} onClick={() => { if (window.confirm(`Remove ${image.fileName} from this carousel?`)) props.onRemoveImage(image.id); }}>Remove</button>
          </div>
          <details><summary>Image crop and fit</summary><label>Fit<select value={image.fit} onChange={(event) => props.onUpdateImage(image.id, { fit: event.target.value as StudioCarouselImage["fit"] })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option><option value="custom">Custom crop</option></select></label><label>Horizontal position<input type="range" min="0" max="100" value={image.positionX} onChange={(event) => props.onUpdateImage(image.id, { positionX: Number(event.target.value) })} /></label><label>Vertical position<input type="range" min="0" max="100" value={image.positionY} onChange={(event) => props.onUpdateImage(image.id, { positionY: Number(event.target.value) })} /></label><label>Zoom<input type="range" min="1" max="4" step="0.05" value={image.zoom} onChange={(event) => props.onUpdateImage(image.id, { zoom: Number(event.target.value) })} /></label></details>
        </article>)}
        {!images.length && <div className={styles.carouselManagerEmpty}>No images yet. Select a product or upload images above.</div>}
      </div>
      {images.length > 1 && props.canReorder && <div className={styles.imageToolActions}><button type="button" onClick={() => props.onPatch({ images: images.slice().reverse().map((image, index) => ({ ...image, displayOrder: index + 1 })) })}>Reverse order</button><button type="button" className={styles.dangerButton} onClick={() => { if (window.confirm("Remove every image from this carousel?")) props.onPatch({ images: [], selectedImageIds: [], currentIndex: 0 }); }}>Remove all</button></div>}
    </fieldset>

    {props.canConfigureTransition && <fieldset className={styles.cardPropertyGroup} disabled={readOnly}>
      <legend>Transition and interaction</legend>
      <div className={styles.propertyGrid}><label>Transition<select value={config.transition.type} onChange={(event) => props.onPatchSection("transition", { type: event.target.value as StudioCarouselConfig["transition"]["type"] })}><option value="slide">Slide</option><option value="fade">Fade</option><option value="none">None</option></select></label><label>Direction<select value={config.transition.direction} onChange={(event) => props.onPatchSection("transition", { direction: event.target.value as "horizontal" | "vertical" })}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label></div>
      <div className={styles.propertyGrid}><label>Duration (ms)<input type="number" min="0" max="5000" step="50" value={config.transition.durationMs} onChange={(event) => props.onPatchSection("transition", { durationMs: Number(event.target.value) })} /></label><label>Autoplay delay (ms)<input type="number" min="2000" max="60000" step="250" value={config.transition.autoplayDelayMs} onChange={(event) => props.onPatchSection("transition", { autoplayDelayMs: Number(event.target.value) })} /></label></div>
      <label>Easing<select value={config.transition.easing} onChange={(event) => props.onPatchSection("transition", { easing: event.target.value as StudioCarouselConfig["transition"]["easing"] })}><option value="ease">Ease</option><option value="ease-in">Ease in</option><option value="ease-out">Ease out</option><option value="ease-in-out">Ease in/out</option><option value="linear">Linear</option></select></label>
      <div className={styles.carouselChecks}><label><input type="checkbox" checked={config.transition.autoplay} onChange={(event) => props.onPatchSection("transition", { autoplay: event.target.checked })} /> Autoplay</label><label><input type="checkbox" checked={config.transition.loop} onChange={(event) => props.onPatchSection("transition", { loop: event.target.checked })} /> Loop</label><label><input type="checkbox" checked={config.transition.pauseOnHover} onChange={(event) => props.onPatchSection("transition", { pauseOnHover: event.target.checked })} /> Pause on hover</label><label><input type="checkbox" checked={config.transition.swipe} onChange={(event) => props.onPatchSection("transition", { swipe: event.target.checked })} /> Touch swipe</label></div>
    </fieldset>}

    <fieldset className={styles.cardPropertyGroup} disabled={readOnly}>
      <legend>Navigation and appearance</legend>
      <div className={styles.carouselChecks}><label><input type="checkbox" checked={config.navigation.showArrows} onChange={(event) => props.onPatchSection("navigation", { showArrows: event.target.checked })} /> Show arrows</label><label><input type="checkbox" checked={config.navigation.showSingleImageArrows} onChange={(event) => props.onPatchSection("navigation", { showSingleImageArrows: event.target.checked })} /> Show for one image</label><label><input type="checkbox" checked={config.navigation.showImageCount} onChange={(event) => props.onPatchSection("navigation", { showImageCount: event.target.checked })} /> Image count</label></div>
      <div className={styles.propertyGrid}><label>Arrow visibility<select value={config.navigation.arrowVisibility} onChange={(event) => props.onPatchSection("navigation", { arrowVisibility: event.target.value as StudioCarouselConfig["navigation"]["arrowVisibility"] })}><option value="always">Always</option><option value="hover">On hover</option><option value="hidden">Hidden</option></select></label><label>Arrow position<select value={config.navigation.arrowPosition} onChange={(event) => props.onPatchSection("navigation", { arrowPosition: event.target.value as "inside" | "outside" })}><option value="inside">Inside</option><option value="outside">Outside</option></select></label></div>
      <div className={styles.propertyGrid}><label>Arrow size<input type="number" min="20" max="96" value={config.navigation.arrowSize} onChange={(event) => props.onPatchSection("navigation", { arrowSize: Number(event.target.value) })} /></label><label>Arrow opacity<input type="range" min="0" max="1" step="0.05" value={config.navigation.arrowOpacity} onChange={(event) => props.onPatchSection("navigation", { arrowOpacity: Number(event.target.value) })} /></label></div>
      <div className={styles.propertyGrid}><label>Arrow color<input type="color" value={config.navigation.arrowColor} onChange={(event) => props.onPatchSection("navigation", { arrowColor: event.target.value })} /></label><label>Arrow background<input type="color" value={config.navigation.arrowBackground} onChange={(event) => props.onPatchSection("navigation", { arrowBackground: event.target.value })} /></label></div>
      <div className={styles.propertyGrid}><label>Pagination<select value={config.navigation.paginationType} onChange={(event) => props.onPatchSection("navigation", { paginationType: event.target.value as StudioCarouselConfig["navigation"]["paginationType"] })}><option value="dots">Dots</option><option value="numbers">Numbers</option><option value="thumbnails">Thumbnails</option><option value="hidden">Hidden</option></select></label><label>Pagination position<select value={config.navigation.paginationPosition} onChange={(event) => props.onPatchSection("navigation", { paginationPosition: event.target.value as StudioCarouselConfig["navigation"]["paginationPosition"] })}><option value="inside_bottom">Inside bottom</option><option value="outside_bottom">Outside bottom</option><option value="inside_top">Inside top</option></select></label></div>
      <div className={styles.propertyGrid}><label>Default fit<select value={config.display.fit} onChange={(event) => props.onPatchSection("display", { fit: event.target.value as StudioCarouselConfig["display"]["fit"] })}><option value="contain">Contain</option><option value="cover">Cover</option><option value="fill">Fill</option></select></label><label>Padding<input type="number" min="0" max="200" value={config.display.padding} onChange={(event) => props.onPatchSection("display", { padding: Number(event.target.value) })} /></label></div>
      <div className={styles.propertyGrid}><label>Background<input type="color" value={config.display.backgroundColor} onChange={(event) => props.onPatchSection("display", { backgroundColor: event.target.value })} /></label><label>Corner radius<input type="number" min="0" max="500" value={config.display.borderRadius} onChange={(event) => props.onPatchSection("display", { borderRadius: Number(event.target.value) })} /></label></div>
    </fieldset>

    {props.canConfigurePdf && <fieldset className={styles.cardPropertyGroup} disabled={readOnly}>
      <legend>PDF and print fallback</legend>
      <label>Static export mode<select value={config.pdf.fallbackMode} onChange={(event) => props.onPatchSection("pdf", { fallbackMode: event.target.value as StudioCarouselConfig["pdf"]["fallbackMode"] })}><option value="first_image">First image</option><option value="selected_cover">Selected cover image</option><option value="image_grid">Image grid</option><option value="contact_sheet">Contact sheet</option></select></label>
      {config.pdf.fallbackMode === "selected_cover" && <label>Cover image<select value={config.pdf.selectedImageId || ""} onChange={(event) => props.onPatchSection("pdf", { selectedImageId: event.target.value || null })}>{images.map((image) => <option key={image.id} value={image.id}>{image.fileName}</option>)}</select></label>}
      {["image_grid", "contact_sheet"].includes(config.pdf.fallbackMode) && <label>Grid columns<select value={config.pdf.gridColumns} onChange={(event) => props.onPatchSection("pdf", { gridColumns: Number(event.target.value) as 2 | 3 | 4 })}><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>}
      <p className={styles.libraryHint}>Interactive arrows are removed from PDFs and print. This fallback is stored in each published snapshot.</p>
    </fieldset>}
  </section>;
}
