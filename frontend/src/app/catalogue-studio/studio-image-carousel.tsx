"use client";

/* eslint-disable @next/next/no-img-element -- The interactive/PDF carousel must preserve exact pixels for blob and data URLs. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, TouchEvent } from "react";
import { API_ORIGIN } from "@/lib/api";
import type { StudioCarouselConfig, StudioCarouselImage, StudioElement } from "@/lib/studio-api";
import styles from "./studio.module.css";

type CarouselMode = "editor" | "preview" | "public" | "pdf" | "print";

export function activeCarouselImages(element: StudioElement) {
  const unique = Array.from(new Map((element.carousel?.images || []).map((image) => [image.id, image])).values());
  return unique
    .filter((image) => image.isActive)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function carouselImageUrl(designId: string, element: StudioElement, image: StudioCarouselImage) {
  if (image.assetId) return `/api/catalogue-studio/asset-content?assetId=${encodeURIComponent(image.assetId)}`;
  if (image.url) return image.url.startsWith("http") ? image.url : `${API_ORIGIN}${image.url}`;
  const productId = image.productId || element.carousel?.productIds?.[0] || element.productId || element.carousel?.productId;
  if (productId && image.productImageId) {
    return `${API_ORIGIN}/api/v1/catalogue-studio/designs/${designId}/products/${productId}/images/${image.productImageId}`;
  }
  return "";
}

function staticImages(config: StudioCarouselConfig, images: StudioCarouselImage[]) {
  if (!images.length) return [];
  if (config.pdf.fallbackMode === "selected_cover") {
    return [images.find((image) => image.id === config.pdf.selectedImageId) || images[0]];
  }
  if (["image_grid", "contact_sheet"].includes(config.pdf.fallbackMode)) return images.slice(0, config.pdf.gridColumns * 2);
  return [images[0]];
}

export function StudioImageCarousel({ designId, element, mode = "preview", onIndexChange }: {
  designId: string;
  element: StudioElement;
  mode?: CarouselMode;
  onIndexChange?: (index: number) => void;
}) {
  const savedConfig = element.carousel;
  const config = useMemo(() => savedConfig ? ({
    ...savedConfig,
    transition: Object.assign({
      type: "slide", durationMs: 350, direction: "horizontal", easing: "ease", autoplay: false,
      autoplayDelayMs: 3000, loop: true, pauseOnHover: true, swipe: true,
    }, savedConfig.transition || {}),
    navigation: Object.assign({
      showArrows: true, showSingleImageArrows: false, arrowVisibility: "hover", arrowPosition: "inside",
      arrowSize: 36, arrowBackground: "#FFFFFF", arrowColor: "#126B3A", arrowOpacity: .96,
      arrowCornerRadius: 999, paginationType: "dots", paginationPosition: "inside_bottom",
      indicatorSize: 8, indicatorSpacing: 6, showImageCount: false,
    }, savedConfig.navigation || {}),
    display: Object.assign({
      fit: "contain", backgroundColor: "#FFFFFF", padding: 0, borderRadius: 8, loadingPlaceholder: "Loading image…",
    }, savedConfig.display || {}),
    pdf: Object.assign({ fallbackMode: "first_image", selectedImageId: null, gridColumns: 2 }, savedConfig.pdf || {}),
  } as StudioCarouselConfig) : undefined, [savedConfig]);
  const images = useMemo(() => activeCarouselImages(element), [element]);
  const initialIndex = Math.max(0, Math.min(Math.max(0, images.length - 1), config?.currentIndex || 0));
  const [storedIndex, setIndex] = useState(initialIndex);
  const index = Math.max(0, Math.min(Math.max(0, images.length - 1), storedIndex));
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const interactive = !["pdf", "print"].includes(mode);

  const navigate = useCallback((next: number, nextDirection?: 1 | -1) => {
    if (!config || images.length < 2) return;
    let resolved = next;
    if (config.transition.loop) resolved = (next + images.length) % images.length;
    else resolved = Math.max(0, Math.min(images.length - 1, next));
    if (resolved === index) return;
    setDirection(nextDirection || (resolved > index ? 1 : -1));
    setIndex(resolved);
    onIndexChange?.(resolved);
  }, [config, images.length, index, onIndexChange]);

  useEffect(() => {
    if (!interactive || mode === "editor" || images.length < 2 || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || hovered && config?.transition.pauseOnHover) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) navigate(index + 1 >= images.length ? 0 : index + 1, 1);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [config, hovered, images.length, index, interactive, mode, navigate]);

  if (!config) return null;
  if (!interactive) {
    const fallback = staticImages(config, images);
    const columns = Math.min(config.pdf.gridColumns, Math.max(1, fallback.length));
    return <div className={styles.carouselStaticGrid} data-fallback={config.pdf.fallbackMode} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, background: config.display.backgroundColor, padding: config.display.padding, borderRadius: config.display.borderRadius }}>
      {fallback.map((image) => <img key={image.id} src={carouselImageUrl(designId, element, image)} alt={image.altText || image.fileName} style={{ objectFit: image.fit === "custom" ? "cover" : image.fit, objectPosition: `${image.positionX}% ${image.positionY}%`, transform: `scale(${image.zoom})` }} />)}
    </div>;
  }
  if (!images.length) return <div className={styles.carouselEmpty} style={{ background: config.display.backgroundColor, borderRadius: config.display.borderRadius }}><strong>No images added</strong><span>Upload images or select images from a product.</span><b>Add Images</b></div>;

  const current = images[index] || images[0];
  const transition = config.transition.type;
  const duration = transition === "none" ? 0 : config.transition.durationMs;
  const showArrows = config.navigation.showArrows && config.navigation.arrowVisibility !== "hidden" && (images.length > 1 || config.navigation.showSingleImageArrows);
  const atStart = index === 0;
  const atEnd = index === images.length - 1;
  const arrowStyle: CSSProperties = {
    width: config.navigation.arrowSize,
    height: config.navigation.arrowSize,
    color: config.navigation.arrowColor,
    background: config.navigation.arrowBackground,
    opacity: config.navigation.arrowOpacity,
    borderRadius: config.navigation.arrowCornerRadius,
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); navigate(index - 1, -1); }
    if (event.key === "ArrowRight") { event.preventDefault(); navigate(index + 1, 1); }
    if (config.transition.direction === "vertical" && event.key === "ArrowUp") { event.preventDefault(); navigate(index - 1, -1); }
    if (config.transition.direction === "vertical" && event.key === "ArrowDown") { event.preventDefault(); navigate(index + 1, 1); }
  };
  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch || !config.transition.swipe) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const delta = config.transition.direction === "vertical" ? deltaY : deltaX;
    if (Math.abs(delta) < 42 || Math.abs(delta) < (config.transition.direction === "vertical" ? Math.abs(deltaX) : Math.abs(deltaY))) return;
    navigate(index + (delta < 0 ? 1 : -1), delta < 0 ? 1 : -1);
  };
  const animationClass = transition === "fade" ? styles.carouselFade : transition === "slide" ? (config.transition.direction === "vertical" ? styles.carouselSlideVertical : styles.carouselSlideHorizontal) : "";
  const pagination = config.navigation.paginationType;

  return <div
    className={`${styles.imageCarousel} ${config.navigation.arrowVisibility === "hover" ? styles.carouselHoverArrows : ""} ${config.navigation.arrowPosition === "outside" ? styles.carouselOutsideArrows : ""}`}
    role="region"
    aria-roledescription="carousel"
    aria-label={element.name || "Product image carousel"}
    tabIndex={0}
    onKeyDown={onKeyDown}
    onTouchStart={onTouchStart}
    onTouchEnd={onTouchEnd}
    onMouseEnter={() => setHovered(true)}
    onMouseLeave={() => setHovered(false)}
    style={{ background: config.display.backgroundColor, padding: config.display.padding, borderRadius: config.display.borderRadius, overflow: config.navigation.arrowPosition === "outside" ? "visible" : "hidden" }}
  >
    <img
      key={`${current.id}-${index}`}
      className={animationClass}
      data-direction={direction}
      src={carouselImageUrl(designId, element, current)}
      alt={current.altText || current.fileName}
      loading={index === 0 ? "eager" : "lazy"}
      style={{ objectFit: current.fit === "custom" ? "cover" : current.fit || config.display.fit, objectPosition: `${current.positionX}% ${current.positionY}%`, transform: `scale(${current.zoom})`, animationDuration: `${duration}ms`, animationTimingFunction: config.transition.easing, transitionDuration: `${duration}ms`, transitionTimingFunction: config.transition.easing }}
    />
    {showArrows && <>
      <button type="button" className={styles.carouselPrevious} style={arrowStyle} disabled={!config.transition.loop && atStart} aria-label="Previous image" onClick={(event) => { event.stopPropagation(); navigate(index - 1, -1); }}>{config.transition.direction === "vertical" ? "↑" : "<"}</button>
      <button type="button" className={styles.carouselNext} style={arrowStyle} disabled={!config.transition.loop && atEnd} aria-label="Next image" onClick={(event) => { event.stopPropagation(); navigate(index + 1, 1); }}>{config.transition.direction === "vertical" ? "↓" : ">"}</button>
    </>}
    {pagination !== "hidden" && <div className={`${styles.carouselPagination} ${styles[`carouselPagination_${config.navigation.paginationPosition}`]}`} style={{ gap: config.navigation.indicatorSpacing }}>
      {pagination === "numbers" ? <button type="button" aria-label={`Show image ${index + 1} of ${images.length}`}>{index + 1} / {images.length}</button> : images.map((image, itemIndex) => <button type="button" key={image.id} data-active={itemIndex === index} className={pagination === "thumbnails" ? styles.carouselThumbnailDot : styles.carouselDot} style={pagination === "dots" ? { width: config.navigation.indicatorSize, height: config.navigation.indicatorSize } : undefined} aria-label={`Show image ${itemIndex + 1} of ${images.length}`} onClick={(event) => { event.stopPropagation(); navigate(itemIndex, itemIndex >= index ? 1 : -1); }}>{pagination === "thumbnails" && <img src={carouselImageUrl(designId, element, image)} alt="" loading="lazy" />}</button>)}
    </div>}
    {config.navigation.showImageCount && <span className={styles.carouselImageCount}>{index + 1} / {images.length}</span>}
    <span className={styles.visuallyHidden} aria-live="polite">Image {index + 1} of {images.length}</span>
  </div>;
}
