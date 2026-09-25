"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  API_ORIGIN,
  getGlobalProductCards,
  type GlobalProductCardPage,
} from "@/lib/api";
import styles from "./product-cards.module.css";

function imageUrl(value: string | null) {
  if (!value) return "";
  return value.startsWith("http") ? value : `${API_ORIGIN}${value}`;
}

export function ProductCardManager() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<GlobalProductCardPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      getGlobalProductCards({ q: query, pageSize: 36 })
        .then((result) => { if (!controller.signal.aborted) setPage(result); })
        .catch((reason: Error) => { if (!controller.signal.aborted) setError(reason.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  return <main className={styles.workspace}>
    <header className={styles.topbar}>
      <Link href="/dashboard">← Dashboard</Link>
      <div><span>CONTENT</span><h1>Product Cards</h1></div>
      <p>Edit a product once and publish the card to every catalogue that contains it.</p>
    </header>
    <section className={styles.managerPanel}>
      <div className={styles.managerHeading}>
        <div><h2>Product card library</h2><p>ERP stock, barcode, product code and synchronized prices stay locked.</p></div>
        <label className={styles.search}><span>Search</span><input value={query} onChange={(event) => { setError(""); setQuery(event.target.value); }} placeholder="Product name, code or barcode" /></label>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading ? <p className={styles.state}>Loading product cards…</p> : page?.items.length ?
        <div className={styles.cardGrid}>{page.items.map((item) => <article className={styles.productTile} key={item.product_id}>
          <div className={styles.thumbnail}>{item.primary_image_url ? <img src={imageUrl(item.primary_image_url)} alt="" /> : <span>No image</span>}</div>
          <div className={styles.tileBody}>
            <div className={styles.statusRow}><span data-published={item.is_published}>{item.is_published ? `Published v${item.active_version}` : item.has_draft ? "Draft" : "Not customized"}</span><small>{item.affected_catalogue_count} catalogues</small></div>
            <h3>{item.name}</h3><p>{item.code}{item.brand ? ` · ${item.brand}` : ""}</p>
            <Link href={`/product-cards/${item.product_id}/edit`}>Edit product card <span aria-hidden="true">→</span></Link>
          </div>
        </article>)}</div> : <p className={styles.state}>No products match your search.</p>}
    </section>
  </main>;
}
