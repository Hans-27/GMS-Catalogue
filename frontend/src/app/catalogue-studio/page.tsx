"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";
import { canAccess } from "@/lib/access";
import { getStudioDesigns, type StudioDesignSummary } from "@/lib/studio-api";
import { ApplicationLogo } from "@/components/application-logo";
import styles from "./studio.module.css";

type StudioStatusFilter = "all" | "draft" | "published";
type StudioSort = "updated" | "name" | "created";
type StudioMetricFilter = "all" | "pages" | "products";

function readableError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "Catalogue Studio could not be loaded.";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function sizeLabel(design: StudioDesignSummary) {
  const preset = design.size_preset.replaceAll("_", " ").toUpperCase();
  return `${preset} · ${design.orientation}`;
}

export default function CatalogueStudioHome() {
  const router = useRouter();
  const [designs, setDesigns] = useState<StudioDesignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudioStatusFilter>("all");
  const [metricFilter, setMetricFilter] = useState<StudioMetricFilter>("all");
  const [sortBy, setSortBy] = useState<StudioSort>("updated");

  const loadDesigns = useCallback(() => {
    return Promise.all([getCurrentUser(), getStudioDesigns()])
      .then(([user, items]) => {
        if (!canAccess(user, "catalogue_designs.view")) {
          router.replace("/dashboard");
          return;
        }
        setDesigns(items);
      })
      .catch((loadError: unknown) => {
        setError(readableError(loadError));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [router]);

  function retryLoad() {
    setLoading(true);
    setError("");
    void loadDesigns();
  }

  useEffect(() => {
    void loadDesigns();
  }, [loadDesigns]);

  const totals = useMemo(
    () => ({
      designs: designs.length,
      published: designs.filter((item) => item.status === "published").length,
      pages: designs.reduce((sum, item) => sum + item.page_count, 0),
      products: designs.reduce((sum, item) => sum + item.product_count, 0),
    }),
    [designs],
  );

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return designs
      .filter(
        (item) =>
          (!normalized || item.name.toLocaleLowerCase().includes(normalized)) &&
          (statusFilter === "all" || item.status === statusFilter) &&
          (metricFilter === "all" ||
            (metricFilter === "pages" ? item.page_count > 0 : item.product_count > 0)),
      )
      .toSorted((left, right) => {
        if (sortBy === "name") return left.name.localeCompare(right.name);
        const field = sortBy === "created" ? "created_at" : "updated_at";
        return new Date(right[field]).getTime() - new Date(left[field]).getTime();
      });
  }, [designs, metricFilter, query, sortBy, statusFilter]);

  const hasFilters = Boolean(query.trim()) || statusFilter !== "all" || metricFilter !== "all";

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setMetricFilter("all");
  }

  function showMetric(metric: "designs" | "published" | "pages" | "products") {
    setQuery("");
    setStatusFilter(metric === "published" ? "published" : "all");
    setMetricFilter(metric === "pages" || metric === "products" ? metric : "all");
    window.requestAnimationFrame(() => {
      document.getElementById("design-heading")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <main className={styles.studioHome}>
      <header className={`${styles.studioHeader} ${styles.studioHomeHeader}`}>
        <Link className={styles.studioBrand} href="/dashboard" aria-label="Back to Dashboard">
          <ApplicationLogo className={styles.studioBrandLogo} compact priority />
          <strong>
            GMS <small>Catalogue Studio</small>
          </strong>
        </Link>
        <nav aria-label="Catalogue Studio">
          <Link className={styles.activeStudioNav} href="/catalogue-studio">
            My Designs
          </Link>
          <Link href="/catalogue-studio/templates">Templates</Link>
          <Link href="/catalogue-studio/templates/product-cards">Product Cards</Link>
          <Link href="/catalogue-studio/media">Media Library</Link>
          <Link href="/catalogue-studio/exports">Exports</Link>
        </nav>
        <Link className={styles.headerCreateAction} href="/catalogue-studio/new">
          <span aria-hidden="true">+</span> New catalogue
        </Link>
      </header>

      <div className={styles.studioContent}>
        <section className={styles.studioHero}>
          <div className={styles.studioHeroCopy}>
            <span>Catalogue Design Studio</span>
            <h1>Turn ERP products into polished catalogues.</h1>
            <p>
              Design covers, product pages and promotions with reusable templates,
              live product data and print-ready output.
            </p>
            <div className={styles.studioHeroActions}>
              <Link className={styles.primaryAction} href="/catalogue-studio/new">
                Create a catalogue <span aria-hidden="true">→</span>
              </Link>
              <Link className={styles.secondaryAction} href="/catalogue-studio/templates">
                Browse templates
              </Link>
            </div>
          </div>
          <dl className={styles.studioStats} aria-label="Studio summary">
            <div>
              <dt>Designs</dt>
              <dd><button type="button" onClick={() => showMetric("designs")} aria-label="Show all designs">{totals.designs}</button></dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd><button type="button" onClick={() => showMetric("published")} aria-label="Show published designs">{totals.published}</button></dd>
            </div>
            <div>
              <dt>Total pages</dt>
              <dd><button type="button" onClick={() => showMetric("pages")} aria-label="Show designs with pages">{totals.pages}</button></dd>
            </div>
            <div>
              <dt>Products placed</dt>
              <dd><button type="button" onClick={() => showMetric("products")} aria-label="Show designs with products">{totals.products}</button></dd>
            </div>
          </dl>
        </section>

        <section className={styles.designWorkspace} aria-labelledby="design-heading">
          <header className={styles.designWorkspaceHeader}>
            <div>
              <span>Your workspace</span>
              <h2 id="design-heading">Catalogue designs</h2>
              <p>Continue editing or start a new catalogue from a saved template.</p>
            </div>
            {!loading && !error && (
              <strong>{visible.length} of {designs.length}</strong>
            )}
          </header>

          <div className={styles.designToolbar}>
            <label className={styles.designSearch}>
              <span aria-hidden="true">⌕</span>
              <input
                aria-label="Search designs"
                type="search"
                placeholder="Search catalogue designs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  ×
                </button>
              )}
            </label>
            <label className={styles.designSelect}>
              <span>Status</span>
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StudioStatusFilter);
                  setMetricFilter("all");
                }}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </label>
            <label className={styles.designSelect}>
              <span>Sort</span>
              <select
                aria-label="Sort designs"
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as StudioSort)}
              >
                <option value="updated">Recently updated</option>
                <option value="created">Recently created</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
            {hasFilters && visible.length > 0 && (
              <button className={styles.clearDesignFilters} type="button" onClick={clearFilters}>
                Clear filters
              </button>
            )}
          </div>

          {loading ? (
            <div className={styles.studioSkeletonGrid} role="status" aria-label="Loading designs">
              {[0, 1, 2, 3].map((item) => <div key={item} />)}
            </div>
          ) : error ? (
            <div className={styles.emptyCard} role="alert">
              <span className={styles.emptyIcon} aria-hidden="true">!</span>
              <h2>Catalogue Studio is unavailable</h2>
              <p>{error}</p>
              <button className={styles.primaryAction} type="button" onClick={retryLoad}>
                Try again
              </button>
            </div>
          ) : visible.length ? (
            <div className={styles.studioGrid}>
              {visible.map((design) => (
                <Link
                  className={styles.designCard}
                  href={`/catalogue-studio/${design.id}/editor`}
                  key={design.id}
                  data-status={design.status}
                  data-type={design.catalogue_type}
                  aria-label={`Open ${design.name} in Studio`}
                >
                  <div className={styles.designThumb}>
                    <div className={styles.designPreviewTopline}>
                      <span>{design.catalogue_type === "promotion" ? "Promotion" : "Catalogue"}</span>
                      <b>{design.page_count} page{design.page_count === 1 ? "" : "s"}</b>
                    </div>
                    <div className={styles.designPreviewSheet} aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                    <strong>{design.name}</strong>
                    <small>{sizeLabel(design)}</small>
                  </div>
                  <div className={styles.designCardBody}>
                    <div className={styles.designCardHeading}>
                      <div>
                        <span>{design.brand_mode === "multiple" ? `${design.brand_count} brands` : "Single brand"}</span>
                        <h2>{design.name}</h2>
                      </div>
                      <b data-status={design.status}>{design.status}</b>
                    </div>
                    <dl className={styles.designCardMetrics}>
                      <div><dt>Pages</dt><dd>{design.page_count}</dd></div>
                      <div><dt>Products</dt><dd>{design.product_count}</dd></div>
                      <div><dt>Version</dt><dd>v{design.current_version}</dd></div>
                    </dl>
                    <footer>
                      <span>
                        Updated <time dateTime={design.updated_at}>{formatDate(design.updated_at)}</time>
                      </span>
                      <strong>Open Studio <b aria-hidden="true">→</b></strong>
                    </footer>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyCard}>
              <span className={styles.emptyIcon} aria-hidden="true">⌕</span>
              <h2>{hasFilters ? "No catalogue designs found" : "No catalogue designs yet"}</h2>
              <p>
                {hasFilters
                  ? "Try another search or clear the current filters."
                  : "Create your first visual catalogue from a blank page or reusable template."}
              </p>
              {hasFilters ? (
                <button className={styles.primaryAction} type="button" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <Link className={styles.primaryAction} href="/catalogue-studio/new">
                  Create catalogue
                </Link>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
