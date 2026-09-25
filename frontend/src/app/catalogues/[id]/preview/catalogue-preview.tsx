"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  API_ORIGIN,
  ApiError,
  changeProductStatus,
  downloadCatalogueExport,
  getCurrentUser,
  previewCatalogue,
  recordCataloguePrint,
  type AuthenticatedUser,
  type CataloguePreview,
  type CataloguePreviewProduct,
  type UserCataloguePriceMapping,
} from "@/lib/api";
import { T, LanguageSwitcher, useLanguage } from "@/lib/i18n";
import { applicationBranding } from "@/lib/branding";
import { CATALOGUE_PDF_CONFIG } from "@/lib/catalogue-pdf";
import { canAccess, isSuperAdmin } from "@/lib/access";
import { copyTextToClipboard } from "@/lib/clipboard";
import { CatalogueProductCard } from "@/components/catalogue-product-card";
import {
  CatalogueImageDialog,
  type CatalogueImageSelection,
} from "@/components/catalogue-image-dialog";
import { ProductVideoModal } from "@/components/product-video-player";
import { CatalogueSidebar, useCatalogueCurrentSection } from "@/components/catalogue-sidebar";
import sidebarStyles from "@/components/catalogue-sidebar.module.css";
import styles from "./preview.module.css";

function mediaUrl(path?: string | null) {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
}

function hasPermission(user: AuthenticatedUser | null, permission: string) {
  return canAccess(user, permission);
}

function slug(value: string) {
  return (
    value
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9\u0E00-\u0E7F]+/g, "-")
      .replace(/^-|-$/g, "") || "products"
  );
}

function isCustomerLevelLabel(
  value: string | null | undefined,
  preview: CataloguePreview,
) {
  const candidate = value?.trim().toLocaleLowerCase();
  if (!candidate) return false;
  return [preview.audience, preview.price_list?.name]
    .map((label) => label?.trim().toLocaleLowerCase())
    .filter(Boolean)
    .includes(candidate);
}

function LoadingSkeleton() {
  const { t } = useLanguage();
  return (
    <main
      className={styles.loadingPage}
      aria-label={t("Loading catalogue preview")}
    >
      <aside />
      <section>
        {Array.from({ length: 7 }, (_, index) => (
          <i key={index} />
        ))}
      </section>
    </main>
  );
}

function CoverPage({
  preview,
  onStart,
}: {
  preview: CataloguePreview;
  onStart: () => void;
}) {
  const { t } = useLanguage();
  const cover = preview.cover;
  if (!cover) return null;
  const backgroundType =
    cover.cover_mode === "full_image" ? "full_cover" : "background";
  const background = cover.assets.find(
    (asset) => asset.asset_type === backgroundType,
  );
  const brandAsset = cover.assets.find(
    (asset) => asset.asset_type === "brand_logo",
  );
  const companyAsset = cover.assets.find(
    (asset) => asset.asset_type === "secondary_logo",
  );
  const usesCurrentDefault =
    cover.default_company_logo_version === applicationBranding.logoVersion;
  const showDefaultLogo =
    usesCurrentDefault &&
    ((cover.show_brand_logo && !brandAsset) ||
      (cover.show_company_logo && Boolean(brandAsset) && !companyAsset));
  const titleTransform =
    cover.title_alignment === "center"
      ? "translateX(-50%)"
      : cover.title_alignment === "right"
        ? "translateX(-100%)"
        : "none";
  const visibleSubtitle = isCustomerLevelLabel(cover.subtitle, preview)
    ? ""
    : cover.subtitle;
  const visibleCollectionName = isCustomerLevelLabel(
    cover.collection_name,
    preview,
  )
    ? ""
    : cover.collection_name;
  const visibleCompanyName = isCustomerLevelLabel(cover.company_name, preview)
    ? ""
    : cover.company_name;
  return (
    <section
      id="cover"
      className={styles.coverPage}
      aria-label={t("Catalogue title page")}
    >
      <div
        className={styles.generatedCover}
        style={{ background: cover.background_color }}
      >
        <i />
        <small>
          {visibleCollectionName || visibleCompanyName || "PRODUCT COLLECTION"}
        </small>
      </div>
      {background && (
        <img
          src={mediaUrl(background.preview_url || background.file_url) || ""}
          alt={background.alt_text || cover.cover_alt_text || preview.title}
          style={{
            objectFit: cover.background_fit === "contain" ? "contain" : "cover",
            objectPosition: `${background.position_x_percent}% ${background.position_y_percent}%`,
          }}
        />
      )}
      <i
        className={styles.savedOverlay}
        style={{
          backgroundColor: cover.overlay_color,
          opacity: cover.overlay_opacity,
        }}
      />
      {showDefaultLogo && (
        <img
          className={styles.defaultLogo}
          src={applicationBranding.defaultLogo}
          alt={applicationBranding.logoAlt}
          data-secondary={Boolean(brandAsset)}
        />
      )}
      {cover.assets
        .filter(
          (asset) => !["background", "full_cover"].includes(asset.asset_type),
        )
        .sort((a, b) => a.z_index - b.z_index)
        .map((asset) => {
          if (asset.asset_type === "brand_logo" && !cover.show_brand_logo)
            return null;
          if (asset.asset_type === "secondary_logo" && !cover.show_company_logo)
            return null;
          return (
            <img
              key={asset.id || `${asset.asset_type}-${asset.original_filename}`}
              className={styles.savedAsset}
              src={mediaUrl(asset.preview_url || asset.file_url) || ""}
              alt={asset.alt_text}
              style={{
                left: `${asset.position_x_percent}%`,
                top: `${asset.position_y_percent}%`,
                width: `${asset.width_percent}%`,
                height: `${asset.height_percent}%`,
                opacity: asset.opacity,
                transform: `translate(-50%,-50%) rotate(${asset.rotation}deg)`,
                zIndex: asset.z_index,
              }}
            />
          );
        })}
      {(cover.show_catalogue_name || cover.show_catalogue_year) && (
        <h1
          className={styles.savedTitle}
          style={{
            left: `${cover.title_position_x_percent}%`,
            top: `${cover.title_position_y_percent}%`,
            width: `${cover.title_width_percent}%`,
            color: cover.title_color,
            fontSize: `${cover.title_font_size}px`,
            textAlign: cover.title_alignment,
            transform: titleTransform,
            zIndex: cover.title_z_index,
          }}
        >
          {cover.show_catalogue_name && <strong>{cover.catalogue_name}</strong>}
          {cover.show_catalogue_year && cover.catalogue_year && (
            <strong>{cover.catalogue_year}</strong>
          )}
        </h1>
      )}
      {cover.show_subtitle && visibleSubtitle && (
        <p
          className={styles.savedSubtitle}
          style={{
            left: `${cover.subtitle_position_x_percent}%`,
            top: `${cover.subtitle_position_y_percent}%`,
            color: cover.subtitle_color,
            fontSize: `${cover.subtitle_font_size}px`,
            textAlign: cover.title_alignment,
            transform: titleTransform,
          }}
        >
          {visibleSubtitle}
        </p>
      )}
      {cover.show_start_button && (
        <button className={styles.savedStart} type="button" onClick={onStart}>
          <T>Start Catalogue</T> <span aria-hidden="true">↓</span>
        </button>
      )}
    </section>
  );
}

export function CataloguePreviewPage({
  catalogueId,
  version,
  shareUrl,
}: {
  catalogueId: string;
  version?: number;
  shareUrl?: string;
}) {
  const router = useRouter();
  const replaceRoute = router.replace;
  const root = useRef<HTMLDivElement>(null);
  const { language, locale, t } = useLanguage();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [preview, setPreview] = useState<CataloguePreview | null>(null);
  const priceMappings: UserCataloguePriceMapping[] = [];
  const [audienceTypeId, setAudienceTypeId] = useState<number | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [playing, setPlaying] = useState<{
    product: CataloguePreviewProduct;
    trigger: HTMLButtonElement;
  } | null>(null);
  const [imageSelection, setImageSelection] = useState<CatalogueImageSelection | null>(null);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);
  const canManageProductStatus = isSuperAdmin(user);

  const load = useCallback(async (background = false) => {
    if (!background) {
      setLoading(true);
      setError("");
    }
    try {
      const currentUser = await getCurrentUser();
      const data = await previewCatalogue(
        catalogueId,
        version,
        undefined,
        isSuperAdmin(currentUser),
      );
      setUser(currentUser);
      if (
        data.studio_preview_href &&
        canAccess(currentUser, "catalogue_designs.view")
      ) {
        replaceRoute(data.studio_preview_href);
        return;
      }
      setPreview(data);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401)
        return replaceRoute("/login");
      if (!background) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The catalogue could not be loaded.",
        );
      }
    } finally {
      if (!background) setLoading(false);
    }
  }, [catalogueId, replaceRoute, setError, setLoading, setPreview, setUser, version]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!preview) return;
    const timer = window.setInterval(() => void load(true), 180_000);
    return () => window.clearInterval(timer);
  }, [load, preview]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!preview) return;
    const previous = document.title;
    document.title = `${preview.title} | Catalogue Preview`;
    return () => {
      document.title = previous;
    };
  }, [preview]);

  const visibleProducts = useMemo(() => {
    if (!preview) return [];
    return canManageProductStatus
      ? preview.products
      : preview.products.filter((product) => product.product_status !== "inactive");
  }, [canManageProductStatus, preview]);

  const allSections = useMemo(() => {
    if (!preview) return [];
    const configured = preview.categories?.length
      ? preview.categories
      : Array.from(
          new Set(visibleProducts.flatMap((product) => product.categories)),
        ).map((name, index) => ({
          slug: slug(name),
          name,
          description: "",
          banner_url: undefined,
          display_order: index + 1,
          product_count: visibleProducts.filter((product) =>
            product.categories.includes(name),
          ).length,
          show_product_count: true,
          default_expanded: false,
        }));
    return configured
      .map((category) => ({
        ...category,
        products: visibleProducts.filter(
          (product) =>
            product.categories.includes(category.name) ||
            product.category_name === category.name,
        ),
      }))
      .filter((category) => category.products.length > 0);
  }, [preview, visibleProducts]);

  const selectedCategory = allSections.some((section) => section.slug === selectedCategorySlug)
    ? selectedCategorySlug
    : allSections[0]?.slug || "";
  const selectedSection = allSections.find((section) => section.slug === selectedCategory);
  const sections = useMemo(() => {
    if (!selectedSection) return [];
    const needle = query.trim().toLocaleLowerCase();
    const products = !needle
      ? selectedSection.products
      : selectedSection.products.filter((item) =>
          [
            item.name,
            item.name_th,
            item.name_en,
            item.code,
            item.brand,
            item.barcode,
            item.description,
            ...item.categories,
          ].some((value) => value?.toLocaleLowerCase().includes(needle)),
        );
    return products.length ? [{ ...selectedSection, products }] : [];
  }, [query, selectedSection]);

  const navigationSectionIds = useMemo(() => ["cover", ...(selectedSection ? [`category-${selectedSection.slug}`] : [])], [selectedSection]);
  const [activeSection, setActiveSection] = useCatalogueCurrentSection(navigationSectionIds);
  const active = activeSection.replace(/^category-/, "");

  useEffect(() => {
    if (!preview || allSections.length === 0) return;
    const hash = decodeURIComponent(window.location.hash.replace(/^#category-/, ""));
    const matchingSection = allSections.find((section) => section.slug === hash);
    const timer = matchingSection ? window.setTimeout(
      () => {
        setSelectedCategorySlug(matchingSection.slug);
        document.getElementById(`category-${matchingSection.slug}`)?.scrollIntoView();
      },
      80,
    ) : undefined;
    return () => window.clearTimeout(timer);
  }, [allSections, preview]);

  function navigate(target: "cover" | "all" | string) {
    const id =
      target === "cover"
        ? "cover"
        : target === "all"
          ? selectedSection
            ? `category-${selectedSection.slug}`
            : "cover"
          : `category-${target}`;
    if (target !== "cover" && target !== "all") {
      setSelectedCategorySlug(target);
      setQuery("");
    }
    window.requestAnimationFrame(() => document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (target === "cover")
      history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    else if (target !== "all")
      history.replaceState(null, "", `#category-${target}`);
    setActiveSection(id);
  }

  async function downloadPdf() {
    if (!preview || downloading) return;
    setDownloading(true);
    setError("");
    try {
      const result = await downloadCatalogueExport(
        catalogueId,
        "pdf",
        preview.version,
        {
          language: preview.language === "en-th" ? "en-th" : language,
          includeCover: true,
          includeTableOfContents: true,
          paperSize: CATALOGUE_PDF_CONFIG.paperSize,
          orientation: CATALOGUE_PDF_CONFIG.orientation,
        },
      );
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("PDF downloaded successfully.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "PDF generation failed.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function printCatalogue() {
    if (!preview || printing) return;
    setPrinting(true);
    try {
      await recordCataloguePrint(catalogueId, preview.version);
      window.print();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Printing failed.");
    } finally {
      setPrinting(false);
    }
  }

  async function updateProductStatus(
    product: CataloguePreviewProduct,
    status: "active" | "inactive",
  ) {
    if (!canManageProductStatus || !product.id || updatingProductId) return;
    let note = "Reactivated from the internal catalogue preview.";
    if (status === "inactive") {
      const response = window.prompt(
        t("Enter the reason for disabling {{product}}.", {
          product: product.name_en || product.name || product.code,
        }),
      );
      note = response?.trim() || "";
      if (!note) {
        setNotice(t("A reason is required to disable a product."));
        return;
      }
    }

    setUpdatingProductId(product.id);
    setError("");
    try {
      await changeProductStatus(product.id, {
        status,
        reason: status === "inactive" ? "other" : undefined,
        note,
      });
      setPreview((current) => current ? {
        ...current,
        products: current.products.map((item) =>
          item.id === product.id ? { ...item, product_status: status } : item
        ),
      } : current);
      setNotice(
        status === "active"
          ? t("Product enabled.")
          : t("Product disabled."),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : t("Product status could not be changed."),
      );
    } finally {
      setUpdatingProductId(null);
    }
  }

  if (loading) return <LoadingSkeleton />;
  if (!preview)
    return (
      <main className={styles.statePage}>
        <b>!</b>
        <h1>
          <T>We could not open this catalogue</T>
        </h1>
        <p>{error}</p>
        <button type="button" onClick={() => void load()}>
          <T>Try again</T>
        </button>
        <button
          type="button"
          onClick={() => router.push("/dashboard?view=catalogues")}
        >
          <T>Back to catalogues</T>
        </button>
      </main>
    );
  const canPdf = hasPermission(user, "catalogues.export_pdf");
  const canPrint = hasPermission(user, "catalogues.print");
  const configuredName = preview.cover?.catalogue_name || preview.title;
  const visibleCoverSubtitle = isCustomerLevelLabel(
    preview.cover?.subtitle,
    preview,
  )
    ? ""
    : preview.cover?.subtitle;
  const configuredDetail =
    preview.cover?.catalogue_year || visibleCoverSubtitle || t("Catalogue");
  const sidebarLogo = preview.cover?.assets.find(
    (asset) => asset.asset_type === "brand_logo",
  );
  const footerActions = (
      <div className={styles.navActions}>
        {canPdf && (
          <button
            type="button"
            aria-label={t(downloading ? "Generating PDF" : "Download PDF")}
            onClick={() => void downloadPdf()}
            disabled={downloading}
          >
            {t(downloading ? "Creating PDF…" : "⇩ Download PDF")}
          </button>
        )}
        {canPrint && (
          <button
            type="button"
            aria-label={t("Print")}
            onClick={() => void printCatalogue()}
            disabled={printing}
          >
            <T>Print catalogue</T>
          </button>
        )}
      </div>
  );

  return (
    <div className={`${styles.previewPage} ${sidebarStyles.layout}`} ref={root} data-collapsed={collapsed}>
      <CatalogueSidebar title={configuredName} subtitle={configuredDetail}
        logo={sidebarLogo ? <img src={mediaUrl(sidebarLogo.preview_url || sidebarLogo.file_url) || ""} alt={sidebarLogo.alt_text || configuredName} /> : undefined}
        searchLabel={t("Search products")} searchPlaceholder={t("Search products")} searchHint={selectedSection ? t("Search within {{category}}", { category: selectedSection.name }) : undefined} searchValue={query} onSearchChange={setQuery}
        collapsed={collapsed} onToggleCollapse={() => setCollapsed((value) => !value)} footer={footerActions}
        utilities={[
          { id: "cover", label: t("Back to Cover"), badge: "⌂", active: active === "cover", onSelect: () => navigate("cover") },
        ]}
        categories={allSections.map((section) => ({
          id: section.slug, label: section.name, active: selectedCategory === section.slug, count: section.show_product_count ? section.products.length : undefined,
          countLabel: section.show_product_count ? `${section.products.length} ${t("products")}` : undefined, onSelect: () => navigate(section.slug),
        }))} />
      <div className={`${styles.viewer} ${sidebarStyles.content}`}>
        <header className={`${styles.previewHeader} ${sidebarStyles.internalToolbar}`}>

          <div>
            <span>
              {preview.is_draft
                ? t("DRAFT PREVIEW")
                : t("PUBLISHED · VERSION {{version}}", {
                    version: preview.version || "",
                  })}
            </span>
            <h1>{preview.title}</h1>
          </div>
          <div>
            {shareUrl && hasPermission(user, "catalogue_share_links.copy") && (
              <button
                className={styles.salesStickyCopy}
                type="button"
                onClick={async () => {
                  if (!(await copyTextToClipboard(shareUrl))) return;
                  setLinkCopied(true);
                  setNotice(t("Link copied!"));
                  window.setTimeout(() => setLinkCopied(false), 1800);
                }}
              >
                {linkCopied ? t("Link copied!") : t("Copy Link")}
              </button>
            )}
            {priceMappings.length > 0 && (
              <label className={styles.priceMappingSelect}>
                <span><T>Customer level</T></span>
                <select
                  aria-label={t("Customer level")}
                  value={audienceTypeId || ""}
                  onChange={(event) =>
                    setAudienceTypeId(Number(event.target.value))
                  }
                >
                  {priceMappings.map((mapping) => (
                    <option
                      key={mapping.audience_type_id}
                      value={mapping.audience_type_id}
                    >
                      {mapping.audience_code === "vip"
                        ? t("VIP BKK")
                        : mapping.audience_name.replace(
                            /^(?:SP\d+|SRP)\s*(?:Â?·)?\s*/i,
                            "",
                          )}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => root.current?.requestFullscreen()}
            >
              <T>Full screen</T>
            </button>
            <button
              type="button"
              aria-label={t("Close Preview")}
              onClick={() => router.push("/dashboard?view=catalogues")}
            >
              <T>Close</T>
            </button>
          </div>
        </header>
        {error && (
          <div className={styles.inlineError} role="alert">
            {error}
            <button type="button" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {canPdf && (
          <div className={styles.pdfFormatBanner}>
            <T>PDF format:</T>{" "}
            <strong>
              <T>A4 Landscape</T>
            </strong>{" "}
            <T>· Cover and content pages:</T> {CATALOGUE_PDF_CONFIG.widthMm} ×{" "}
            {CATALOGUE_PDF_CONFIG.heightMm} <T>mm</T>
          </div>
        )}
        <main id="catalogue-print-area" className={styles.catalogueDocument}>
          <CoverPage
            preview={preview}
            onStart={() => navigate(selectedSection?.slug || "all")}
          />
          <section className={styles.introduction}>
            <span>{preview.title}</span>
            <h2>
              {preview.description ||
                t(
                  "A carefully selected product collection for its intended audience.",
                )}
            </h2>
            <dl>
              <div>
                <dt>
                  <T>Products</T>
                </dt>
                <dd>{visibleProducts.length}</dd>
              </div>
              <div>
                <dt>
                  <T>Categories</T>
                </dt>
                <dd>{allSections.length}</dd>
              </div>
            </dl>
          </section>
          {sections.map((section) => (
            <section
              id={`category-${section.slug}`}
              className={styles.categorySection}
              key={section.slug}
              data-category={section.slug}
            >
              {section.banner_url && (
                <div
                  className={styles.categoryBanner}
                  style={{
                    backgroundImage: `url(${mediaUrl(section.banner_url)})`,
                  }}
                />
              )}
              <header>
                <h2>{section.name}</h2>
                <strong>
                  {section.products.length} <T>products</T>
                </strong>
              </header>
              <div
                className={`${styles.productGrid} ${styles.erpProductGrid}`}
              >
                {section.products.map((product) => (
                  <CatalogueProductCard
                    key={`${section.slug}-${product.code}`}
                    product={product}
                    showPrices={preview.show_prices}
                    catalogueCurrency={preview.currency}
                    locale={locale}
                    cardStyle={preview.product_card_style}
                    cardTheme={preview.product_card_theme}
                    onPlay={(trigger) => setPlaying({ product, trigger })}
                    onOpenImages={setImageSelection}
                    canManageStatus={canManageProductStatus}
                    statusUpdating={updatingProductId === product.id}
                    onStatusChange={canManageProductStatus
                      ? (status) => void updateProductStatus(product, status)
                      : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
          {!sections.length && (
            <section className={styles.emptyState}>
              <b>⌕</b>
              <h2>
                {t(
                  query
                    ? "No products found"
                    : "This catalogue has no visible products",
                )}
              </h2>
              <p>
                {t(
                  query
                    ? "Try another product name, code, brand, or category."
                    : "Add products and categories in the catalogue builder.",
                )}
              </p>
              {query && (
                <button type="button" onClick={() => setQuery("")}>
                  <T>Clear search</T>
                </button>
              )}
            </section>
          )}
          <footer className={styles.documentFooter}>
            <strong>{preview.title}</strong>
            <span>
              {visibleProducts.length} <T>products ·</T>{" "}
              {preview.version
                ? t("Version {{version}}", { version: preview.version })
                : t("Draft preview")}
            </span>
          </footer>
        </main>
      </div>
      {playing?.product.video && (
        <ProductVideoModal
          video={playing.product.video}
          title={playing.product.video.title || playing.product.name}
          returnFocus={playing.trigger}
          onClose={() => setPlaying(null)}
        />
      )}
      {imageSelection && (
        <CatalogueImageDialog
          selection={imageSelection}
          onClose={() => setImageSelection(null)}
        />
      )}
      {notice && (
        <div className={styles.notice} role="status">
          <span aria-hidden="true">✓</span>
          {t(notice)}
        </div>
      )}
    </div>
  );
}
