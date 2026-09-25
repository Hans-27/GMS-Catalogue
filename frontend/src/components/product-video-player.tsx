"use client";

import { useEffect, useRef, useState } from "react";
import { API_ORIGIN, type CataloguePreviewVideo, type ProductVideo } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import styles from "./product-video-player.module.css";

type Video = ProductVideo | CataloguePreviewVideo;

function mediaUrl(value?: string | null) {
  if (!value) return "";
  return value.startsWith("http") ? value : `${API_ORIGIN}${value}`;
}

export function ProductVideoPlayer({ video, title }: { video: Video; title?: string }) {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);
  const source = mediaUrl(video.playback_url);
  const externalFrame = video.provider === "youtube" || video.provider === "vimeo";
  if (!source) return <div className={styles.unavailable}>{t("This video is currently unavailable.")}</div>;
  if (externalFrame) {
    return <div className={styles.frame}><iframe src={source} title={title || ("title_en" in video ? video.title_en : video.title) || "Product video"} allow="fullscreen; picture-in-picture" allowFullScreen loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /></div>;
  }
  return <div className={styles.frame}>{failed ? <div className={styles.unavailable}>{t("The video could not be played. Please try again.")}</div> : <video
    controls={video.show_controls}
    controlsList={video.allow_download ? undefined : "nodownload"}
    preload="metadata"
    playsInline
    poster={mediaUrl(video.thumbnail_url)}
    autoPlay={video.autoplay}
    muted={video.autoplay ? true : video.muted}
    loop={video.loop}
    onError={() => setFailed(true)}
  >
    <source src={source} type={video.mime_type || undefined} />
    {video.caption_url && <track default kind="captions" src={mediaUrl(video.caption_url)} srcLang="en" label="English" />}
  </video>}</div>;
}

export function ProductVideoModal({ video, title, onClose, returnFocus }: { video: Video; title: string; onClose: () => void; returnFocus?: HTMLElement | null }) {
  const { t } = useLanguage();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); returnFocus?.focus(); };
  }, [onClose, returnFocus]);
  const description = "description" in video ? video.description : "";
  return <div className={styles.backdrop} role="presentation" onMouseDown={onClose}>
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="product-video-title" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><small>{t("PRODUCT VIDEO")}</small><h2 id="product-video-title">{title}</h2></div><button ref={close} type="button" onClick={onClose} aria-label={t("Close video")}>×</button></header>
      <ProductVideoPlayer video={video} title={title} />
      {description && <p>{description}</p>}
    </section>
  </div>;
}
