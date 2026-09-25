"use client";
/* eslint-disable @next/next/no-img-element */

import {
  type CSSProperties,
  FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  API_ORIGIN,
  API_URL,
  type CataloguePreviewProduct,
  type PublicCatalogue,
} from "@/lib/api";
import { hydratePublicStudioDesign } from "@/lib/public-studio-pricing";
import { CatalogueProductCard } from "@/components/catalogue-product-card";
import { CatalogueExploreLink } from "@/components/catalogue-explore-link";
import { CatalogueOnlineCover } from "@/components/catalogue-online-cover";
import {
  CatalogueImageDialog,
  type CatalogueImageSelection,
} from "@/components/catalogue-image-dialog";
import { ProductVideoModal } from "@/components/product-video-player";
import { T, useLanguage } from "@/lib/i18n";
import { CataloguePageRenderer, type PreviewImageSelection } from "@/app/catalogue-studio/studio-preview";
import type { StudioDesign } from "@/lib/studio-api";
import { CatalogueSidebar, useCatalogueCurrentSection } from "@/components/catalogue-sidebar";
import sidebarStyles from "@/components/catalogue-sidebar.module.css";
import styles from "./public-catalogue.module.css";

const CEFLAR_BRAND_IMAGE =
  "https://pim-cdn0.ofm.co.th/brands/original/64acffd8f41e6df81f5a0d0a.jpg";

function mediaUrl(path?: string | null) {
  return !path ? null : path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
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
function productName(
  product: CataloguePreviewProduct,
  language: "en" | "th",
): string {
  return (
    (language === "th"
      ? product.name_th || product.name || product.name_en
      : product.name_en || product.name || product.name_th) || "Product"
  );
}
function catalogueBrandImage(catalogue: PublicCatalogue): string | null {
  const uploadedLogo = catalogue.cover?.assets.find(
    (asset) => asset.asset_type === "brand_logo",
  );
  const uploadedLogoUrl = mediaUrl(
    uploadedLogo?.preview_url || uploadedLogo?.file_url,
  );
  if (uploadedLogoUrl) return uploadedLogoUrl;

  const catalogueBrands = [
    catalogue.title,
    ...catalogue.products.map((product) => product.brand || ""),
  ]
    .join(" ")
    .toLocaleLowerCase();

  return catalogueBrands.includes("ceflar") ? CEFLAR_BRAND_IMAGE : null;
}

export function PublicCatalogueViewer({ token }: { token: string }) {
  const { language, setLanguage, t } = useLanguage();
  const [catalogue, setCatalogue] = useState<PublicCatalogue | null>(null);
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadingCategory, setDownloadingCategory] = useState("");
  const [studioPdfUrl, setStudioPdfUrl] = useState("");
  const [studioPage, setStudioPage] = useState(1);
  const [studioDesign, setStudioDesign] = useState<StudioDesign | null>(null);
  const [publicBookletFullscreen, setPublicBookletFullscreen] = useState(false);
  const [publicBookletDragX, setPublicBookletDragX] = useState(0);
  const [publicBookletDragY, setPublicBookletDragY] = useState(0);
  const [publicBookletDragAnchorY, setPublicBookletDragAnchorY] = useState(50);
  const [publicBookletZoomDelta, setPublicBookletZoomDelta] = useState(0);
  const [publicBookletPagesOpen, setPublicBookletPagesOpen] = useState(true);
  const [publicBookletLastPageNotice, setPublicBookletLastPageNotice] = useState(false);
  const [publicBookletMobile, setPublicBookletMobile] = useState(false);
  const [imageSelection, setImageSelection] = useState<CatalogueImageSelection | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedCategorySlug, setSelectedCategorySlug] = useState("");
  const [playing, setPlaying] = useState<{
    product: CataloguePreviewProduct;
    trigger: HTMLButtonElement;
  } | null>(null);
  const lastStudioWheelAt = useRef(0);
  const publicBookletRef = useRef<HTMLDivElement | null>(null);
  const publicBookletDragStart = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressPublicBookletClick = useRef(false);
  const publicBookletNoticeTimer = useRef<number | null>(null);

  const openStudioImage = useCallback((selection: PreviewImageSelection) => {
    setImageSelection({
      productName: selection.title,
      productCode: selection.subtitle || selection.title,
      images: selection.images,
      index: selection.index,
      returnFocus:
        document.activeElement instanceof HTMLButtonElement
          ? document.activeElement
          : null,
    });
  }, []);

  const showPublicBookletLastPage = useCallback(() => {
    setPublicBookletLastPageNotice(true);
    if (publicBookletNoticeTimer.current !== null) window.clearTimeout(publicBookletNoticeTimer.current);
    publicBookletNoticeTimer.current = window.setTimeout(() => {
      setPublicBookletLastPageNotice(false);
      publicBookletNoticeTimer.current = null;
    }, 1_600);
  }, []);

  useEffect(() => () => {
    if (publicBookletNoticeTimer.current !== null) window.clearTimeout(publicBookletNoticeTimer.current);
  }, []);

  useEffect(() => {
    const update = () => setPublicBookletMobile(window.innerWidth <= 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const load = useCallback(
    async (submittedPassword = "", background = false) => {
      if (!background) {
        setLoading(true);
        setError("");
      }
      try {
        const response = await fetch(
          `${API_URL}/v1/public/catalogues/${encodeURIComponent(token)}`,
          {
            headers: submittedPassword
              ? { "X-Catalogue-Password": submittedPassword }
              : undefined,
            cache: "no-store",
          },
        );
        if (response.status === 401) {
          setNeedsPassword(true);
          return;
        }
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(
            body?.detail || "This catalogue link is unavailable.",
          );
        }
        const data = (await response.json()) as PublicCatalogue;
        setCatalogue(data);
        setNeedsPassword(false);
        document.title = `${data.title} | GMS Catalogue`;
      } catch (caught) {
        if (!background) setError(
          caught instanceof Error
            ? caught.message
            : "This catalogue could not be loaded.",
        );
      } finally {
        if (!background) setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!catalogue) return;
    const timer = window.setInterval(() => void load(password, true), 180_000);
    return () => window.clearInterval(timer);
  }, [catalogue, load, password]);

  const visibleProducts = useMemo(
    () => catalogue?.products.filter(
      (product) => product.product_status !== "inactive",
    ) ?? [],
    [catalogue],
  );

  const allSections = useMemo(() => {
    if (!catalogue) return [];
    const categories = catalogue.categories?.length
      ? catalogue.categories
      : Array.from(
          new Set(
            visibleProducts
              .map((item) => item.category_name)
              .filter(Boolean),
          ),
        ).map((name, index) => ({
          slug: slug(name || "Products"),
          name: name || "Products",
          description: "",
          display_order: index + 1,
          product_count: 0,
          show_product_count: true,
          default_expanded: true,
        }));
    return categories
      .map((category) => ({
        ...category,
        products: visibleProducts.filter(
          (product) =>
            product.category_name === category.name ||
            product.categories.includes(category.name),
        ),
      }))
      .filter((section) => section.products.length);
  }, [catalogue, visibleProducts]);

  const activeCategorySlug = allSections.some((section) => section.slug === selectedCategorySlug)
    ? selectedCategorySlug
    : allSections[0]?.slug || "";
  const activeSection = allSections.find((section) => section.slug === activeCategorySlug);
  const sections = useMemo(() => {
    if (!activeSection) return [];
    const needle = query.trim().toLocaleLowerCase();
    const products = needle
      ? activeSection.products.filter((product) =>
          [
            product.name,
            product.name_en,
            product.name_th,
            product.code,
            product.brand,
            product.category_name,
            product.barcode,
            product.description,
          ].some((value) => value?.toLocaleLowerCase().includes(needle)),
        )
      : activeSection.products;
    return products.length ? [{ ...activeSection, products }] : [];
  }, [activeSection, query]);

  useEffect(() => {
    if (catalogue?.studio_design_id || allSections.length === 0) return;
    const syncCategoryFromLocation = () => {
      const hashId = window.location.hash.replace(/^#/, "");
      const hashSection = allSections.find((section) => `category-${section.slug}` === hashId);
      setSelectedCategorySlug((current) =>
        hashSection?.slug || (allSections.some((section) => section.slug === current) ? current : allSections[0].slug),
      );
    };
    syncCategoryFromLocation();
    window.addEventListener("hashchange", syncCategoryFromLocation);
    return () => window.removeEventListener("hashchange", syncCategoryFromLocation);
  }, [allSections, catalogue?.studio_design_id]);

  const studioCategoryPages = useMemo(() => {
    if (!catalogue || !studioDesign) return [];
    const visiblePages = studioDesign.pages.filter((page) => page.is_visible);
    const grouped = new Map<string, { pageNumber: number; pageNumbers: number[]; name: string; slug: string; productCodes: Set<string> }>();
    visiblePages.forEach((page, index) => {
      if (["cover", "promotion"].includes(page.page_type)) return;
      const products = new Map<string, CataloguePreviewProduct>();
      const savedCategories = new Set<string>();
      for (const element of page.page_data_json.elements) {
        const sku = String(element.style.productSku || "").trim();
        const savedCategory = String(element.style.productCategory || "").trim();
        const product = visibleProducts.find(
          (item) => item.code === sku || (item.id && item.id === element.productId),
        );
        if (product) products.set(product.code, product);
        if (savedCategory) savedCategories.add(savedCategory);
      }
      const navigationCategory = page.page_data_json.navigationCategory?.trim();
      if (!products.size && !savedCategories.size && !navigationCategory) return;
      const categories = new Set(savedCategories);
      for (const product of products.values()) {
        if (product.category_name) categories.add(product.category_name);
        else if (product.categories[0]) categories.add(product.categories[0]);
      }
      const name = navigationCategory || Array.from(categories).join(" / ") || page.page_name || "Products";
      const key = name.toLocaleLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        existing.pageNumbers.push(index + 1);
        for (const code of products.keys()) existing.productCodes.add(code);
      } else {
        grouped.set(key, {
          pageNumber: index + 1,
          pageNumbers: [index + 1],
          name,
          slug: `${slug(name)}-${page.id}`,
          productCodes: new Set(products.keys()),
        });
      }
    });
    return Array.from(grouped.values()).map(({ productCodes, ...section }) => ({
      ...section,
      productCount: productCodes.size,
    }));
  }, [catalogue, studioDesign, visibleProducts]);

  useEffect(() => {
    if (!catalogue?.studio_design_id || !studioDesign || studioDesign.catalogue_type !== "booklet") return;
    const pageCount = Math.max(1, studioDesign.pages.filter((page) => page.is_visible).length);
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) < 20) return;
      if ((event.target as Element | null)?.closest('dialog, [role="dialog"], [data-catalogue-navigation]')) return;
      const now = Date.now();
      if (now - lastStudioWheelAt.current < 450) return;
      const direction = event.deltaY > 0 ? 1 : -1;
      const bookletLastPage = publicBookletMobile ? pageCount : pageCount % 2 === 0 ? pageCount : Math.max(1, pageCount - 1);
      if (studioDesign.catalogue_type === "booklet" && direction > 0 && studioPage >= bookletLastPage) {
        event.preventDefault();
        showPublicBookletLastPage();
        return;
      }
      const next = direction > 0
        ? Math.min(bookletLastPage, studioPage + (publicBookletMobile ? 1 : studioPage === 1 ? 1 : 2))
        : publicBookletMobile ? Math.max(1, studioPage - 1) : studioPage <= 2 ? 1 : Math.max(2, studioPage - 2);
      if (next === studioPage) return;
      event.preventDefault();
      lastStudioWheelAt.current = now;
      setStudioPage(next);
      window.document.getElementById("studio-catalogue")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [catalogue?.studio_design_id, publicBookletMobile, showPublicBookletLastPage, studioDesign, studioPage]);

  useEffect(() => {
    const updateFullscreen = () => setPublicBookletFullscreen(document.fullscreenElement === publicBookletRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  useEffect(() => {
    if (studioDesign?.catalogue_type !== "booklet") return;
    const pageCount = studioDesign.pages.filter((page) => page.is_visible).length;
    const lastSpread = publicBookletMobile ? pageCount : pageCount % 2 === 0 ? pageCount : Math.max(1, pageCount - 1);
    const turnWithKeyboard = (event: KeyboardEvent) => {
      if ((event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return;
      if (event.key === "ArrowLeft") setStudioPage((current) => publicBookletMobile ? Math.max(1, current - 1) : current <= 2 ? 1 : Math.max(2, current - 2));
      if (event.key === "ArrowRight") {
        if (studioPage >= lastSpread) showPublicBookletLastPage();
        else setStudioPage(publicBookletMobile ? Math.min(lastSpread, studioPage + 1) : studioPage === 1 ? 2 : Math.min(lastSpread, studioPage + 2));
      }
      if (event.key === "Home") setStudioPage(1);
      if (event.key === "End") setStudioPage(lastSpread);
    };
    window.addEventListener("keydown", turnWithKeyboard);
    return () => window.removeEventListener("keydown", turnWithKeyboard);
  }, [publicBookletMobile, showPublicBookletLastPage, studioDesign, studioPage]);

  useEffect(() => {
    if (!catalogue?.studio_design_id) return;
    let disposed = false;
    let objectUrl = "";
    void fetch(`${API_URL}/v1/public/catalogues/${encodeURIComponent(token)}/pdf?inline=true`, {
      cache: "no-store",
      headers: password ? { "X-Catalogue-Password": password } : undefined,
    }).then((response) => {
      if (!response.ok) throw new Error(`Studio catalogue rendering failed (${response.status}).`);
      return response.blob();
    }).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setStudioPdfUrl(objectUrl);
    }).catch((caught) => {
      if (!disposed) setError(caught instanceof Error ? caught.message : "Studio catalogue rendering failed.");
    });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [catalogue?.studio_design_id, password, token]);

  useEffect(() => {
    if (!catalogue?.studio_design_id) return;
    let disposed = false;
    void fetch(`${API_URL}/v1/public/catalogues/${encodeURIComponent(token)}/studio`, {
      cache: "no-store",
      headers: password ? { "X-Catalogue-Password": password } : undefined,
    }).then((response) => {
      if (!response.ok) throw new Error(`Interactive Studio catalogue failed (${response.status}).`);
      return response.json() as Promise<StudioDesign>;
    }).then((source) => {
      if (disposed) return;
      setStudioDesign(hydratePublicStudioDesign(source, catalogue, token));
    }).catch((caught) => { if (!disposed) setError(caught instanceof Error ? caught.message : "Interactive Studio catalogue failed."); });
    return () => { disposed = true; };
  }, [catalogue, password, token]);

  const navigationSectionIds = useMemo(() => catalogue?.studio_design_id
    ? (studioDesign?.pages.filter((page) => page.is_visible) || []).map((_, index) => `studio-page-${index + 1}`)
    : ["cover", ...(activeSection ? [`category-${activeSection.slug}`] : [])], [activeSection, catalogue?.studio_design_id, studioDesign]);
  const [currentSection, setCurrentSection] = useCatalogueCurrentSection(navigationSectionIds);
  const [categoryQuery, setCategoryQuery] = useState("");

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    await load(password);
  }
  async function downloadPdf() {
    if (!catalogue || downloading) return;
    setDownloading(true);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/v1/public/catalogues/${encodeURIComponent(token)}/pdf`,
        {
          headers: password ? { "X-Catalogue-Password": password } : undefined,
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || "PDF download failed.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${catalogue.title}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "PDF download failed.",
      );
    } finally {
      setDownloading(false);
    }
  }
  async function downloadCategoryExcel(categorySlug: string, categoryName: string) {
    if (!catalogue || downloadingCategory) return;
    setDownloadingCategory(categorySlug);
    setError("");
    try {
      const response = await fetch(
        `${API_URL}/v1/public/catalogues/${encodeURIComponent(token)}/categories/${encodeURIComponent(categorySlug)}/excel`,
        { headers: password ? { "X-Catalogue-Password": password } : undefined },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `Could not download ${categoryName}.`);
      }
      const disposition = response.headers.get("Content-Disposition") || "";
      const matchedFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = matchedFilename || `${catalogue.title}-${categoryName}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `Could not download ${categoryName}.`);
    } finally {
      setDownloadingCategory("");
    }
  }
  if (loading && !catalogue)
    return (
      <main className={styles.state}>
        <div className={styles.spinner} />
        <h1>
          <T>Opening catalogue</T>
        </h1>
        <p>
          <T>Please wait a moment.</T>
        </p>
      </main>
    );
  if (needsPassword && !catalogue)
    return (
      <main className={styles.state}>
        <div className={styles.lock}>●</div>
        <h1>
          <T>Password protected</T>
        </h1>
        <p>
          <T>Enter the password supplied with this catalogue link.</T>
        </p>
        <form onSubmit={submitPassword}>
          <input
            autoFocus
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("Catalogue password")}
          />
          <button type="submit" disabled={loading}>
            {t(loading ? "Checking…" : "Open catalogue")}
          </button>
        </form>
        {error && <strong>{error}</strong>}
      </main>
    );
  if (!catalogue)
    return (
      <main className={styles.state}>
        <div className={styles.lock}>!</div>
        <h1>
          <T>Catalogue unavailable</T>
        </h1>
        <p>{error || t("The link may have expired or been revoked.")}</p>
        <button type="button" onClick={() => void load(password)}>
          <T>Try again</T>
        </button>
      </main>
    );

  const mobileLanguageActions = <>
    <button type="button" data-active={language === "en"} onClick={() => setLanguage("en")}><T>EN</T></button>
    <button type="button" data-active={language === "th"} onClick={() => setLanguage("th")}>ไทย</button>
  </>;

  if (catalogue.studio_design_id) {
    const visibleStudioPages = studioDesign?.pages.filter((page) => page.is_visible) || [];
    const hasStudioCoverPage = visibleStudioPages.some((page) => page.page_type === "cover");
    const coverPageIndex = visibleStudioPages.findIndex((page) => page.page_type === "cover");
    const coverPageNumber = coverPageIndex + 1;
    const studioCoverPage = visibleStudioPages[coverPageIndex];
    const studioPromotionPages = visibleStudioPages.flatMap((page, index) =>
      page.page_type === "promotion" ? [{ page, pageNumber: index + 1 }] : [],
    );
    const firstCataloguePageNumber = visibleStudioPages.findIndex(
      (page) => !["cover", "promotion"].includes(page.page_type),
    ) + 1 || coverPageNumber;
    const studioCoverScale = studioCoverPage ? Math.min(52 / studioCoverPage.width, 52 / studioCoverPage.height) : 0;
    const studioPageCount = visibleStudioPages.length || 1;
    const isBooklet = studioDesign?.catalogue_type === "booklet";
    const bookletStartPage = publicBookletMobile ? studioPage : studioPage <= 1 ? 1 : studioPage % 2 === 0 ? studioPage : studioPage - 1;
    const publicBookletPages = publicBookletMobile ? visibleStudioPages.slice(studioPage - 1, studioPage) : studioPage <= 1 ? visibleStudioPages.slice(0, 1) : visibleStudioPages.slice(bookletStartPage - 1, bookletStartPage + 1);
    const openStudioPage = (page: number, behavior: ScrollBehavior = "smooth") => {
      const boundedPage = Math.min(studioPageCount, Math.max(1, page));
      setCurrentSection(`studio-page-${boundedPage}`);
      setStudioPage(isBooklet && !publicBookletMobile && boundedPage > 1 ? (boundedPage % 2 === 0 ? boundedPage : boundedPage - 1) : boundedPage);
      const scrollTarget = window.document.getElementById(isBooklet ? "studio-catalogue" : `studio-page-${boundedPage}`);
      scrollTarget?.scrollIntoView?.({ behavior, block: "start" });
    };
    const publicBookletLastSpread = publicBookletMobile ? studioPageCount : studioPageCount % 2 === 0 ? studioPageCount : Math.max(1, studioPageCount - 1);
    const previousPublicBookletSpread = () => openStudioPage(publicBookletMobile ? studioPage - 1 : studioPage <= 2 ? 1 : studioPage - 2);
    const nextPublicBookletSpread = () => {
      if (studioPage >= publicBookletLastSpread) {
        showPublicBookletLastPage();
        return;
      }
      openStudioPage(publicBookletMobile ? studioPage + 1 : studioPage === 1 ? 2 : studioPage + 2);
    };
    const publicBookletDragProgress = Math.min(1, Math.abs(publicBookletDragX) / 320);
    const publicBookletBaseScale = publicBookletMobile && typeof window !== "undefined" && publicBookletPages[0]
      ? Math.max(.18, Math.min(.9, (window.innerWidth - 6) / publicBookletPages[0].width))
      : publicBookletFullscreen ? .76 : typeof window !== "undefined" && window.innerWidth <= 1280 ? .54 : .66;
    const publicBookletScale = Math.max(.32, Math.min(.9, publicBookletBaseScale + publicBookletZoomDelta));
    const startPublicBookletDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      const anchorY = bounds.height > 0 ? ((event.clientY - bounds.top) / bounds.height) * 100 : 50;
      publicBookletDragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      setPublicBookletDragAnchorY(Math.max(8, Math.min(92, anchorY)));
      suppressPublicBookletClick.current = false;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    };
    const movePublicBookletDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = publicBookletDragStart.current;
      if (!start || start.pointerId !== event.pointerId) return;
      const horizontalDistance = event.clientX - start.x;
      const verticalDistance = event.clientY - start.y;
      if (Math.abs(horizontalDistance) <= Math.abs(verticalDistance) && Math.abs(horizontalDistance) < 12) return;
      event.preventDefault();
      const limitedDistance = Math.max(-340, Math.min(340, horizontalDistance));
      setPublicBookletDragX(limitedDistance);
      setPublicBookletDragY(Math.max(-90, Math.min(90, verticalDistance)));
      if (Math.abs(limitedDistance) >= 8) suppressPublicBookletClick.current = true;
    };
    const finishPublicBookletDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = publicBookletDragStart.current;
      if (!start || start.pointerId !== event.pointerId) return;
      const dragDistance = event.clientX - start.x;
      publicBookletDragStart.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (dragDistance <= -52) nextPublicBookletSpread();
      else if (dragDistance >= 52 && studioPage > 1) previousPublicBookletSpread();
      setPublicBookletDragX(0);
      setPublicBookletDragY(0);
    };
    const cancelPublicBookletDrag = () => {
      publicBookletDragStart.current = null;
      setPublicBookletDragX(0);
      setPublicBookletDragY(0);
    };
    const togglePublicBookletFullscreen = () => {
      if (document.fullscreenElement === publicBookletRef.current) {
        void document.exitFullscreen?.();
        return;
      }
      void publicBookletRef.current?.requestFullscreen?.();
    };
    const navigationPage = isBooklet ? studioPage : Number(currentSection.replace("studio-page-", "")) || studioPage;
    return <div className={`${styles.page} ${sidebarStyles.layout}`}>
      <CatalogueSidebar title={catalogue.title} subtitle={`${catalogue.product_count} ${t("products")}`}
        logo={studioCoverPage ? <div role="img" aria-label={`${catalogue.title} cover preview`} style={{ width: 44, height: 44, overflow: "hidden" }}><CataloguePageRenderer designId={catalogue.studio_design_id} page={studioCoverPage} pageNumber={1} mode="pdf" scale={studioCoverScale} renderOnly instanceId="studio-sidebar-cover" /></div> : undefined}
        searchLabel={t("Search categories")} searchValue={categoryQuery} onSearchChange={setCategoryQuery}
        mobileActions={mobileLanguageActions}
        utilities={[
          { id: "cover", label: t("Back to Cover"), badge: "⌂", href: "#studio-catalogue", active: navigationPage === coverPageNumber, onSelect: () => openStudioPage(coverPageNumber) },
          ...studioPromotionPages.map(({ page, pageNumber }) => ({ id: page.id, label: page.page_name || t("Promotion"), badge: "%", href: "#studio-catalogue", active: navigationPage === pageNumber, onSelect: () => openStudioPage(pageNumber) })),
        ]}
        categories={studioCategoryPages.filter((section) => section.name.toLocaleLowerCase().includes(categoryQuery.trim().toLocaleLowerCase())).map((section) => ({
          id: section.slug, label: section.name, href: "#studio-catalogue", count: section.productCount || section.pageNumbers.length,
          countLabel: section.productCount > 0 ? `${section.productCount} ${t("products")}` : t(section.pageNumbers.length === 1 ? "{{count}} page" : "{{count}} pages", { count: section.pageNumbers.length }),
          countText: section.productCount > 0 ? undefined : t(section.pageNumbers.length === 1 ? "{{count}} page" : "{{count}} pages", { count: section.pageNumbers.length }), active: section.pageNumbers.includes(navigationPage), onSelect: () => openStudioPage(section.pageNumber),
        }))} />
      <div className={sidebarStyles.content}>
      <header className={`${styles.toolbar} ${sidebarStyles.viewerToolbar}`}>
        <div className={sidebarStyles.desktopToolbarActions}>
          <button type="button" data-active={language === "en"} onClick={() => setLanguage("en")}><T>EN</T></button>
          <button type="button" data-active={language === "th"} onClick={() => setLanguage("th")}>ไทย</button>
          {catalogue.allow_pdf_download && <button className={sidebarStyles.mobileToolbarAction} type="button" onClick={() => void downloadPdf()} disabled={downloading}>{t(downloading ? "Creating…" : "Download PDF")}</button>}
          {catalogue.allow_print && <button className={sidebarStyles.mobileToolbarAction} type="button" onClick={() => studioPdfUrl && window.open(studioPdfUrl, "_blank", "noopener,noreferrer")}><T>Print</T></button>}
        </div>
      </header>
      {catalogue.customer_name && (
        <div className={styles.customerPriceContext} role="status">
          <div>
            <span><T>Customer pricing</T></span>
            <strong>{t("Prices for {{customer}}", { customer: catalogue.customer_name })}</strong>
          </div>
          <small><T>Correct brand prices are applied automatically from this secure link.</T></small>
        </div>
      )}
      {error && <div className={styles.error}>{error}<button type="button" onClick={() => setError("")}>×</button></div>}
      <div className={`${sidebarStyles.body} ${sidebarStyles.pagedBody}`}>

        <main id="studio-catalogue" className={`${styles.studioCatalogueViewer} ${isBooklet ? styles.publicBookletViewer : ""}`}>
          {studioDesign && !hasStudioCoverPage && catalogue.online_cover && <CatalogueOnlineCover cover={catalogue.online_cover} title={catalogue.title} productCount={catalogue.product_count} exploreHref={`#studio-page-${firstCataloguePageNumber}`} exploreLabel={t("Explore products")} productsLabel={t("products")} onExplore={isBooklet ? (behavior) => openStudioPage(firstCataloguePageNumber, behavior) : undefined} fallback={null} />}
          {studioDesign ? isBooklet ? <div ref={publicBookletRef} className={styles.publicBooklet} data-mobile-page={publicBookletMobile}>
            {publicBookletLastPageNotice && <div className={styles.publicBookletLastPage} role="status">LAST PAGE</div>}
            <div className={styles.publicBookletStage}>
              <button type="button" aria-label="Previous booklet page" disabled={studioPage === 1} onClick={previousPublicBookletSpread}>‹</button>
              <div className={styles.publicBookletSpread} data-cover={studioPage === 1} data-dragging={publicBookletDragX !== 0} role="group" aria-label="Drag booklet pages left or right to turn" onPointerDown={startPublicBookletDrag} onPointerMove={movePublicBookletDrag} onPointerUp={finishPublicBookletDrag} onPointerCancel={cancelPublicBookletDrag} onClickCapture={(event) => { if (suppressPublicBookletClick.current) { event.preventDefault(); event.stopPropagation(); suppressPublicBookletClick.current = false; } }} style={{ transform: `translate(${publicBookletDragX * .035}px, ${publicBookletDragY * .05}px)` }}>{publicBookletPages.map((page, index) => {
                const turningForward = publicBookletDragX < 0 && (studioPage === 1 || index === publicBookletPages.length - 1);
                const turningBackward = publicBookletDragX > 0 && studioPage > 1 && index === 0;
                const turning = turningForward || turningBackward;
                const turnAngle = publicBookletDragProgress * 62 * (turningForward ? -1 : 1);
                const verticalFlex = publicBookletDragY * -.065;
                const paperCompression = 1 - publicBookletDragProgress * .16;
                const peelDepth = `${Math.round(10 + publicBookletDragProgress * 76)}%`;
                const peelShoulder = `${Math.round(2 + publicBookletDragProgress * 32)}%`;
                const outerCorners = `${Math.round(8 + publicBookletDragProgress * 34)}px`;
                const currentPageNumber = bookletStartPage + index;
                const behindPageIndex = turningForward
                  ? publicBookletMobile || studioPage === 1
                    ? currentPageNumber
                    : currentPageNumber + 1
                  : publicBookletMobile
                    ? currentPageNumber - 2
                    : Math.max(0, currentPageNumber - 3);
                const behindPage = turning ? visibleStudioPages[behindPageIndex] : undefined;
                return <div className={styles.publicBookletLeaf} key={page.id} data-side={studioPage === 1 ? "cover" : index === 0 ? "left" : "right"} data-turning={turning} data-turn-direction={turningForward ? "forward" : turningBackward ? "backward" : undefined} style={turning ? { transformOrigin: `${turningForward ? "left" : "right"} ${publicBookletDragAnchorY}%`, transform: `perspective(1250px) rotateY(${turnAngle}deg) rotateX(${verticalFlex}deg) skewY(${turnAngle * -.04}deg) scaleX(${paperCompression})`, borderRadius: turningForward ? `2px ${outerCorners} ${outerCorners} 2px` : `${outerCorners} 2px 2px ${outerCorners}`, "--booklet-turn-progress": publicBookletDragProgress * .92, "--booklet-turn-shadow": `${publicBookletDragProgress * 42}px`, "--booklet-turn-brightness": 1 - publicBookletDragProgress * .12, "--booklet-curl-y": `${publicBookletDragAnchorY}%`, "--booklet-peel-depth": peelDepth, "--booklet-peel-shoulder": peelShoulder } as CSSProperties : undefined}>
                  {behindPage && <div className={styles.publicBookletUnderlay} aria-hidden="true"><CataloguePageRenderer designId={studioDesign.id} page={behindPage} pageNumber={behindPageIndex + 1} mode="booklet" scale={publicBookletScale} renderOnly /></div>}
                  <div className={styles.publicBookletSurface}><CatalogueOnlineCover cover={currentPageNumber === coverPageNumber ? catalogue.online_cover : null} title={catalogue.title} productCount={catalogue.product_count} exploreHref={`#studio-page-${firstCataloguePageNumber}`} exploreLabel={t("Explore products")} productsLabel={t("products")} onExplore={(behavior) => openStudioPage(firstCataloguePageNumber, behavior)} frameStyle={{ width: page.width * publicBookletScale, height: page.height * publicBookletScale }} fallback={<CataloguePageRenderer designId={studioDesign.id} page={page} pageNumber={currentPageNumber} mode="booklet" scale={publicBookletScale} onOpenProductImage={openStudioImage} previewProductImageSize={300} />} /></div>
                </div>;
              })}</div>
              <button type="button" aria-label="Next booklet page" data-at-end={studioPage >= publicBookletLastSpread} onClick={nextPublicBookletSpread}>›</button>
            </div>
            <div className={styles.publicBookletStatus}><button type="button" aria-label="Zoom out" onClick={() => setPublicBookletZoomDelta((current) => current - .05)}>−</button><strong>{Math.round(publicBookletScale * 100)}%</strong><button type="button" aria-label="Zoom in" onClick={() => setPublicBookletZoomDelta((current) => current + .05)}>+</button><i /><button type="button" onClick={() => setPublicBookletZoomDelta(0)}>Fit</button><i /><span>{publicBookletPages.length > 1 ? `${bookletStartPage}–${Math.min(studioPageCount, bookletStartPage + 1)} / ${studioPageCount}` : `1 / ${studioPageCount}`}</span><button type="button" onClick={togglePublicBookletFullscreen}>{publicBookletFullscreen ? "Exit full screen" : "⛶ Full screen"}</button></div>
            <div className={styles.publicBookletPages}><button type="button" aria-expanded={publicBookletPagesOpen} onClick={() => setPublicBookletPagesOpen((current) => !current)}>Pages <span aria-hidden="true">{publicBookletPagesOpen ? "⌄" : "⌃"}</span></button>{publicBookletPagesOpen && <div className={styles.publicBookletThumbnails}>{visibleStudioPages.map((page, index) => <button type="button" key={page.id} data-active={index + 1 === studioPage || (!publicBookletMobile && studioPage > 1 && index + 1 === studioPage + 1)} aria-label={`Open page ${index + 1}: ${page.page_name}`} onClick={() => openStudioPage(index + 1)}><CataloguePageRenderer designId={studioDesign.id} page={page} pageNumber={index + 1} mode="booklet" scale={.055} renderOnly /><span>{index + 1}</span></button>)}</div>}</div>
          </div> : <div className={styles.publicStudioPages}>{visibleStudioPages.map((page, index) => <section id={`studio-page-${index + 1}`} className={styles.publicStudioPage} data-active={index + 1 === studioPage} aria-label={`Page ${index + 1}: ${page.page_name}`} key={page.id}><CatalogueOnlineCover cover={index === coverPageIndex ? catalogue.online_cover : null} title={catalogue.title} productCount={catalogue.product_count} exploreHref={`#studio-page-${firstCataloguePageNumber}`} exploreLabel={t("Explore products")} productsLabel={t("products")} fallback={<CataloguePageRenderer designId={studioDesign.id} page={page} pageNumber={index + 1} mode="desktop" scale={.72} onOpenProductImage={openStudioImage} previewProductImageSize={300} />} /></section>)}</div> : <div className={styles.studioCatalogueLoading}><div className={styles.spinner} /><strong>Preparing the interactive Studio design…</strong></div>}
        </main>
      </div>
      {imageSelection && (
        <CatalogueImageDialog
          selection={imageSelection}
          requestHeaders={password ? { "X-Catalogue-Password": password } : undefined}
          onClose={() => setImageSelection(null)}
        />
      )}
      </div>
    </div>;
  }

  const coverImage = catalogue.cover?.assets.find((asset) =>
    ["full_cover", "background"].includes(asset.asset_type),
  );
  const coverImageUrl = mediaUrl(coverImage?.preview_url || coverImage?.file_url);
  const brandImage = catalogueBrandImage(catalogue);
  const coverBackgroundImage = brandImage || coverImageUrl;
  return (
    <div className={`${styles.page} ${sidebarStyles.layout}`}>
      <CatalogueSidebar title={catalogue.title} subtitle={`${catalogue.product_count} ${t("products")}`}
        logo={coverImageUrl ? <img src={coverImageUrl} alt={`${catalogue.title} cover`} /> : brandImage ? <img src={brandImage} alt={`${catalogue.title} brand`} /> : undefined}
        searchLabel={t("Search products")} searchPlaceholder={t("Search products")} searchHint={activeSection ? t("Search within {{category}}", { category: activeSection.name }) : undefined} searchValue={query} onSearchChange={setQuery}
        mobileActions={mobileLanguageActions}
        utilities={[
          { id: "cover", label: t("Back to Cover"), badge: "⌂", href: "#cover", active: currentSection === "cover", onSelect: () => { setCurrentSection("cover"); document.getElementById("cover")?.scrollIntoView?.({ behavior: "smooth", block: "start" }); history.replaceState(null, "", "#cover"); } },
        ]}
        categories={allSections.map((section) => ({
          id: section.slug, label: section.name, href: `#category-${section.slug}`,
          count: section.show_product_count ? section.products.length : undefined,
          countLabel: section.show_product_count ? `${section.products.length} ${t("products")}` : undefined,
          action: catalogue.allow_pdf_download ? {
            label: `Download ${section.name} as Excel`,
            onSelect: () => void downloadCategoryExcel(section.slug, section.name),
            busy: downloadingCategory === section.slug,
            disabled: Boolean(downloadingCategory && downloadingCategory !== section.slug),
          } : undefined,
          active: activeCategorySlug === section.slug,
          onSelect: () => {
            setSelectedCategorySlug(section.slug);
            setQuery("");
            setCurrentSection(`category-${section.slug}`);
            history.replaceState(null, "", `#category-${section.slug}`);
            window.requestAnimationFrame(() => document.getElementById(`category-${section.slug}`)?.scrollIntoView?.({ behavior: "smooth", block: "start" }));
          },
        }))} />
      <div className={sidebarStyles.content}>
      <header className={`${styles.toolbar} ${sidebarStyles.viewerToolbar}`}>
        <div className={sidebarStyles.desktopToolbarActions}>
          <button
            type="button"
            data-active={language === "en"}
            onClick={() => setLanguage("en")}
          >
            <T>EN</T>
          </button>
          <button
            type="button"
            data-active={language === "th"}
            onClick={() => setLanguage("th")}
          >
            ไทย
          </button>
          {catalogue.allow_pdf_download && (
            <button
              className={sidebarStyles.mobileToolbarAction}
              type="button"
              onClick={() => void downloadPdf()}
              disabled={downloading}
            >
              {t(downloading ? "Creating…" : "Download PDF")}
            </button>
          )}
          {catalogue.allow_print && (
            <button className={sidebarStyles.mobileToolbarAction} type="button" onClick={() => window.print()}>
              <T>Print</T>
            </button>
          )}
        </div>
      </header>
      {catalogue.customer_name && (
        <div className={styles.customerPriceContext} role="status">
          <div>
            <span><T>Customer pricing</T></span>
            <strong>{t("Prices for {{customer}}", { customer: catalogue.customer_name })}</strong>
          </div>
          <small><T>Correct brand prices are applied automatically from this secure link.</T></small>
        </div>
      )}
      {error && (
        <div className={styles.error}>
          {error}
          <button type="button" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      <div className={sidebarStyles.body}>

        <main>
          <div id="cover"><CatalogueOnlineCover cover={catalogue.online_cover} title={catalogue.title} productCount={catalogue.product_count} exploreHref={activeSection ? `#category-${activeSection.slug}` : "#products"} exploreLabel={t("Explore products")} productsLabel={t("products")} fallback={
          <section
            className={styles.cover}
            data-has-artwork={Boolean(coverBackgroundImage)}
            data-logo-layout={coverBackgroundImage ? "background-watermark" : undefined}
          >
          {coverBackgroundImage && (
            <img
              className={styles.coverBrandWatermark}
              data-catalogue-brand-watermark={brandImage ? "true" : undefined}
              data-catalogue-cover-artwork={!brandImage && coverImageUrl ? "true" : undefined}
              src={coverBackgroundImage}
              alt=""
              aria-hidden="true"
            />
          )}
          <div className={styles.coverCopy}>
            <h1>{catalogue.title}</h1>
            <CatalogueExploreLink
              href={activeSection ? `#category-${activeSection.slug}` : "#products"}
              label={t("Explore products")}
            />
          </div>
          <div className={styles.coverVisual}>
            <aside>
              <strong>{catalogue.product_count}</strong>
              <span>{t("products")}</span>
            </aside>
          </div>
        </section>
          } /></div>

          <div id="products" className={styles.content}>
          {sections.map((section) => (
            <section
              id={`category-${section.slug}`}
              key={section.slug}
              className={styles.section}
            >
              <header>
                <h2>{section.name}</h2>
                <strong>
                  {section.products.length} {t("products")}
                </strong>
              </header>
              <div
                className={`${styles.grid} ${styles.erpGrid}`}
              >
                {section.products.map((product) => (
                  <CatalogueProductCard
                    key={`${section.slug}-${product.id || product.code}`}
                    product={product}
                    showPrices={catalogue.show_prices}
                    catalogueCurrency={catalogue.currency}
                    locale={language === "th" ? "th-TH" : "en-US"}
                    cardStyle={catalogue.product_card_style}
                    cardTheme={catalogue.product_card_theme}
                    retailPriceOverride={catalogue.customer_name ? product.price ?? null : undefined}
                    onPlay={(trigger) => setPlaying({ product, trigger })}
                    onOpenImages={setImageSelection}
                  />
                ))}
              </div>
            </section>
          ))}
          </div>
          {!sections.length && (
            <section className={styles.empty}>
              <h2>{t("No products found")}</h2>
              <p>
                {query
                  ? t("Try a different search.")
                  : t("No published products are available in this catalogue.")}
              </p>
            </section>
          )}
        </main>
      </div>
      <footer className={styles.footer}>
        <strong>{catalogue.title}</strong>
        <span>
          <T>Version</T> {catalogue.version}
        </span>
      </footer>
      {playing?.product.video && (
        <ProductVideoModal
          video={playing.product.video}
          title={
            playing.product.video.title ||
            productName(playing.product, language)
          }
          returnFocus={playing.trigger}
          onClose={() => setPlaying(null)}
        />
      )}
      {imageSelection && (
        <CatalogueImageDialog
          selection={imageSelection}
          requestHeaders={password ? { "X-Catalogue-Password": password } : undefined}
          onClose={() => setImageSelection(null)}
        />
      )}
      </div>
    </div>
  );
}
