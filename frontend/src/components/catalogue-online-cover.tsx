"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, type CSSProperties, type ReactNode } from "react";
import { API_ORIGIN } from "@/lib/api";
import { CatalogueExploreLink } from "./catalogue-explore-link";
import styles from "./catalogue-online-cover.module.css";

type Props = {
  cover: { url: string; width: number; height: number } | null | undefined;
  title: string;
  productCount: number;
  exploreHref: string;
  exploreLabel: string;
  productsLabel: string;
  onExplore?: (behavior: ScrollBehavior) => void;
  frameStyle?: CSSProperties;
  fallback: ReactNode;
};

/** Finished artwork is online-only; existing cover markup remains the print source. */
export function CatalogueOnlineCover({ cover, title, productCount, exploreHref, exploreLabel, productsLabel, onExplore, frameStyle, fallback }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!cover || failedUrl === cover.url) return <>{fallback}</>;
  const url = /^https?:\/\//.test(cover.url) ? cover.url : `${API_ORIGIN}${cover.url}`;
  return <>
    <section className={`${styles.cover} ${frameStyle ? styles.framed : ""}`} style={frameStyle} aria-label={`${title} online cover`}>
      <img src={url} width={cover.width} height={cover.height} alt={`${title} online cover`} onError={() => setFailedUrl(cover.url)} />
      <footer><CatalogueExploreLink href={exploreHref} label={exploreLabel} onExplore={onExplore} /><span>{productCount.toLocaleString()} {productsLabel}</span></footer>
    </section>
    <div className={styles.printFallback} aria-hidden="true">{fallback}</div>
  </>;
}
