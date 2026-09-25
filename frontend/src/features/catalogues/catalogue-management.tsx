"use client";

/* eslint-disable @next/next/no-img-element -- Catalogue logos can require the signed-in browser session and must not be proxied by Next Image. */
import Link from "next/link";
import { T, useLanguage } from "@/lib/i18n";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  API_ORIGIN,
  ApiError,
  archiveCatalogue,
  activateCatalogueShareLink,
  createCatalogue,
  createCatalogueShareLink,
  deleteCatalogue,
  deleteCatalogueShareLink,
  downloadCatalogueExport,
  duplicateCatalogue,
  getCatalogue,
  getCatalogueCover,
  getCatalogueCategorySettings,
  getCatalogueAudienceTypes,
  getCatalogueBrandOptions,
  getCatalogueCardLinks,
  getCatalogueOnlineLinks,
  getCatalogueShareLinks,
  getCatalogues,
  getCatalogueVersions,
  generateErpBrandCatalogues,
  getPriceLists,
  getProducts,
  getProductVideos,
  publishCatalogue,
  regenerateCatalogueShareLink,
  revokeCatalogueShareLink,
  saveBrand,
  setCatalogueProducts,
  updateCatalogueCategorySettings,
  uploadCatalogueCategoryBanner,
  deleteCatalogueCategoryBanner,
  updateCatalogue,
  updateCatalogueShareLink,
  uploadCatalogueCoverAsset,
  type AuthenticatedUser,
  type CatalogueLanguage,
  type CatalogueAudienceType,
  type CatalogueBrandOption,
  type CatalogueCover,
  type CatalogueCategorySetting,
  type CataloguePayload,
  type CatalogueProductInput,
  type CatalogueStatus,
  type CatalogueVersion,
  type CatalogueShareLink,
  type ManagedCatalogue,
  type PriceList,
  type ProductListItem,
  type ProductVideo,
} from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import { formatApiDate, parseApiDate } from "@/lib/date-time";
import styles from "@/app/dashboard/dashboard.module.css";
import { CoverEditor } from "./cover-editor";
import { canAccess, isCataloguePortalUser, isCustomerUser, isSalesUser } from "@/lib/access";

type CatalogueDraft = {
  title: string;
  slug: string;
  description: string;
  brand: string;
  audience: string;
  price_list_id: string;
  show_prices: boolean;
  currency: string;
  language: CatalogueLanguage;
  status: CatalogueStatus;
  valid_from: string;
  valid_until: string;
  is_public: boolean;
};

const EMPTY_CATALOGUE: CatalogueDraft = {
  title: "",
  slug: "",
  description: "",
  brand: "",
  audience: "Internal",
  price_list_id: "",
  show_prices: false,
  currency: "THB",
  language: "en",
  status: "draft",
  valid_from: "",
  valid_until: "",
  is_public: false,
};

const CATALOGUES_PER_PAGE = 18;

const EMPTY_BRAND = {
  name: "",
  code: "",
  description: "",
};

function brandCode(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toUpperCase()
      .slice(0, 30) || "BRAND"
  );
}

function dateInput(value: string | null) {
  if (!value) return "";
  const date = parseApiDate(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function isoDate(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function catalogueDraft(catalogue: ManagedCatalogue): CatalogueDraft {
  return {
    title: catalogue.title,
    slug: catalogue.slug,
    description: catalogue.description,
    brand: catalogue.brand ?? "",
    audience: catalogue.audience,
    price_list_id: catalogue.price_list_id
      ? String(catalogue.price_list_id)
      : "",
    show_prices: catalogue.show_prices,
    currency: catalogue.currency,
    language: catalogue.language,
    status: catalogue.status,
    valid_from: dateInput(catalogue.valid_from),
    valid_until: dateInput(catalogue.valid_until),
    is_public: catalogue.is_public,
  };
}

function payloadFromDraft(draft: CatalogueDraft): CataloguePayload {
  return {
    title: draft.title.trim(),
    slug: draft.slug.trim() || null,
    description: draft.description.trim(),
    brand: draft.brand.trim() || null,
    audience: draft.audience.trim(),
    price_list_id: draft.price_list_id ? Number(draft.price_list_id) : null,
    show_prices: Boolean(draft.price_list_id && draft.show_prices),
    currency: draft.currency.trim().toUpperCase(),
    language: draft.language,
    valid_from: isoDate(draft.valid_from),
    valid_until: isoDate(draft.valid_until),
    is_public: draft.is_public,
  };
}

function formatDate(value: string | null, locale: string, includeTime = false) {
  if (!value) return "Not set";
  return formatApiDate(value, locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

function statusLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function initialCatalogueParameter(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

export function catalogueLinkLabel(value: string) {
  const label = value
    .replace(/^(?:SP\d+|SRP)\s*(?:[·•:–—-]\s*)?/i, "")
    .trim();
  return label.toUpperCase() === "VIP" ? "VIP BKK" : label;
}

export function catalogueCardShareLinks(
  catalogue: Pick<ManagedCatalogue, "catalogue_type" | "show_prices">,
  links: CatalogueShareLink[],
) {
  const visibleLinks = ["normal", "no_price"]
    .map((audienceCode) =>
      links.find(
        (link) => link.audience_code.toLowerCase() === audienceCode,
      ),
    )
    .filter((link): link is CatalogueShareLink => Boolean(link));
  if (catalogue.catalogue_type !== "booklet" || catalogue.show_prices) {
    return visibleLinks;
  }
  const catalogLink =
    visibleLinks.find((link) => link.audience_code.toLowerCase() === "no_price") ||
    visibleLinks[0];
  return catalogLink ? [catalogLink] : [];
}

export function CatalogueManagement({
  currentUser,
  onToast,
}: {
  currentUser: AuthenticatedUser;
  onToast: (message: string) => void;
}) {
  const { locale, t } = useLanguage();
  const router = useRouter();
  const [catalogues, setCatalogues] = useState<ManagedCatalogue[]>([]);
  const [selected, setSelected] = useState<ManagedCatalogue | null>(null);
  const [draft, setDraft] = useState<CatalogueDraft>(EMPTY_CATALOGUE);
  const [selectedProducts, setSelectedProducts] = useState<
    CatalogueProductInput[]
  >([]);
  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [videoOptions, setVideoOptions] = useState<
    Record<string, ProductVideo[]>
  >({});
  const [priceLists, setPriceLists] = useState<PriceList[]>([]);
  const [brandOptions, setBrandOptions] = useState<CatalogueBrandOption[]>([]);
  const [versions, setVersions] = useState<CatalogueVersion[]>([]);
  const [cover, setCover] = useState<CatalogueCover | null>(null);
  const [categorySettings, setCategorySettings] = useState<
    CatalogueCategorySetting[]
  >([]);
  const [categoryBrand, setCategoryBrand] = useState("");
  const [isLoadingBrand, setIsLoadingBrand] = useState(false);
  const [audienceTypes, setAudienceTypes] = useState<CatalogueAudienceType[]>(
    [],
  );
  const [shareLinks, setShareLinks] = useState<CatalogueShareLink[]>([]);
  const [cardLinks, setCardLinks] = useState<
    Record<string, CatalogueShareLink[]>
  >({});
  const [onlineLinks, setOnlineLinks] = useState<Record<string, string>>({});
  const isMounted = useRef(true);
  const [copiedLink, setCopiedLink] = useState("");
  const [linkAction, setLinkAction] = useState("");
  const [customerLinkName, setCustomerLinkName] = useState("");
  const [customerLinkAudience, setCustomerLinkAudience] = useState("");
  const [expandedCardLinks, setExpandedCardLinks] = useState<string[]>([]);
  const [openCardMenu, setOpenCardMenu] = useState<string | null>(null);
  const [uploadingCardLogo, setUploadingCardLogo] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [catalogueQuery, setCatalogueQuery] = useState("");
  const [catalogueStatus, setCatalogueStatus] = useState(() =>
    initialCatalogueParameter("status"),
  );
  const [catalogueSort, setCatalogueSort] = useState("az");
  const [cataloguePage, setCataloguePage] = useState(1);
  const [productQuery, setProductQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isGenerateConfirmOpen, setIsGenerateConfirmOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBrandDialogOpen, setIsBrandDialogOpen] = useState(false);
  const [isSavingBrand, setIsSavingBrand] = useState(false);
  const [newBrand, setNewBrand] = useState(EMPTY_BRAND);
  const [newBrandError, setNewBrandError] = useState("");
  const [error, setError] = useState("");

  const hasPermission = (permission: string) =>
    canAccess(currentUser, permission);
  const canCreate = hasPermission("catalogues.create");
  const canEdit = hasPermission("catalogues.edit");
  const canPublish = hasPermission("catalogues.publish");
  const canDuplicate = hasPermission("catalogues.duplicate");
  const canArchive = hasPermission("catalogues.archive");
  const canDelete = hasPermission("catalogues.delete");
  const canPreview = hasPermission("catalogues.preview");
  const canViewStudio = hasPermission("catalogue_designs.view");
  const canExportPdf = hasPermission("catalogues.export_pdf");
  const canExportExcel = hasPermission("catalogues.export_excel");
  const canViewCover = hasPermission("catalogues.cover.view");
  const canUploadCover = hasPermission("catalogues.cover.upload");
  const canEditCover = hasPermission("catalogues.cover.edit");
  const canDeleteCover = hasPermission("catalogues.cover.delete");
  const canPublishCover =
    hasPermission("catalogues.cover.publish") && canPublish;
  const canViewCategories = hasPermission("catalogue_categories.view");
  const canManageCategories = hasPermission("catalogue_categories.manage");
  const canViewShareLinks = hasPermission("catalogue_share_links.view");
  const canCreateShareLinks = hasPermission("catalogue_share_links.create");
  const canCreateBrand = hasPermission("brands.create");
  const canCopyShareLinks = hasPermission("catalogue_share_links.copy");
  const canEditShareLinks = hasPermission("catalogue_share_links.edit");
  const canRegenerateShareLinks = hasPermission(
    "catalogue_share_links.regenerate",
  );
  const canRevokeShareLinks = hasPermission("catalogue_share_links.revoke");
  const canDeleteShareLinks = hasPermission("catalogue_share_links.delete");
  const isReadOnlySales = isSalesUser(currentUser);
  const isReadOnlyCustomer = isCustomerUser(currentUser);
  const isReadOnlyPortal = isCataloguePortalUser(currentUser);

  useEffect(() => {
    isMounted.current = true;
    if (initialCatalogueParameter("action") === "create") {
      router.replace("/catalogue-studio/new");
    }
    return () => {
      isMounted.current = false;
    };
  }, [router]);

  const availableProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          !selectedProducts.some((item) => item.product_id === product.id),
      ),
    [products, selectedProducts],
  );
  const filteredCatalogues = useMemo(() => {
    const query = catalogueQuery.trim().toLocaleLowerCase(locale);
    return catalogues.filter((catalogue) => {
      const matchesQuery =
        !query ||
        [catalogue.title, catalogue.description, catalogue.brand ?? ""].some(
          (value) => value.toLocaleLowerCase(locale).includes(query),
        );
      const matchesStatus = isReadOnlyPortal
        ? catalogue.status === "published"
        : !catalogueStatus ||
          (catalogueStatus === "in_progress"
            ? ["draft", "wip"].includes(catalogue.status)
            : catalogue.status === catalogueStatus);
      return matchesQuery && matchesStatus;
    });
  }, [catalogueQuery, catalogueStatus, catalogues, isReadOnlyPortal, locale]);
  const sortedCatalogues = useMemo(() => {
    const sorted = [...filteredCatalogues];
    sorted.sort((left, right) => {
      if (catalogueSort === "za") {
        return right.title.localeCompare(left.title, locale, {
          sensitivity: "base",
          numeric: true,
        });
      }
      if (catalogueSort === "newest") {
        return Date.parse(right.updated_at) - Date.parse(left.updated_at);
      }
      if (catalogueSort === "oldest") {
        return Date.parse(left.updated_at) - Date.parse(right.updated_at);
      }
      if (catalogueSort === "products_desc") {
        return (
          right.product_count - left.product_count ||
          left.title.localeCompare(right.title, locale, {
            sensitivity: "base",
            numeric: true,
          })
        );
      }
      if (catalogueSort === "products_asc") {
        return (
          left.product_count - right.product_count ||
          left.title.localeCompare(right.title, locale, {
            sensitivity: "base",
            numeric: true,
          })
        );
      }
      return left.title.localeCompare(right.title, locale, {
        sensitivity: "base",
        numeric: true,
      });
    });
    return sorted;
  }, [catalogueSort, filteredCatalogues, locale]);
  const cataloguePages = Math.max(
    1,
    Math.ceil(sortedCatalogues.length / CATALOGUES_PER_PAGE),
  );
  const visibleCatalogues = useMemo(
    () =>
      sortedCatalogues.slice(
        (cataloguePage - 1) * CATALOGUES_PER_PAGE,
        cataloguePage * CATALOGUES_PER_PAGE,
      ),
    [cataloguePage, sortedCatalogues],
  );

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const catalogueData = await getCatalogues();
        if (!active) return;
        setCatalogues(catalogueData);
        setCataloguePage(1);
        setIsLoading(false);

        void getCatalogueOnlineLinks()
          .then((data) => {
            if (active) setOnlineLinks(data);
          })
          .catch(() => {
            // The internal preview remains available if no public link exists.
          });

        // Load the compact link data for every accessible catalogue once. The
        // cards are paginated only in the browser, so fetching links for just
        // the first visible page leaves later pages empty when a lazy request
        // is interrupted or fails. This remains a background request and does
        // not delay rendering the catalogue list.
        if (canViewShareLinks) {
          void getCatalogueCardLinks()
            .then((data) => {
              if (active) setCardLinks(data);
            })
            .catch(() => {
              // Link controls can still be managed from the catalogue editor
              // if this optional card summary request is unavailable.
            });
        }

        // Editor-only metadata must not delay the catalogue card list.
        void Promise.all([
          getPriceLists(),
          getProducts({ page: 1 }),
          canViewShareLinks ? getCatalogueAudienceTypes() : Promise.resolve([]),
          getCatalogueBrandOptions(),
        ])
          .then(([priceListData, productData, audienceData, brandData]) => {
            if (!active) return;
            setPriceLists(priceListData);
            setProducts(productData.items);
            setAudienceTypes(audienceData);
            setBrandOptions(brandData);
          })
          .catch(() => undefined);
      } catch (caughtError) {
        if (active) {
          setError(
            caughtError instanceof ApiError
              ? t(caughtError.message)
              : t("Could not load catalogue management."),
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [canViewShareLinks, t]);

  async function openCatalogue(catalogueId: string) {
    setIsLoading(true);
    setError("");
    try {
      const erpBrand =
        catalogues
          .find((catalogue) => catalogue.id === catalogueId)
          ?.brand?.trim() ?? "";
      const [
        detail,
        versionData,
        coverData,
        categoriesData,
        shareLinkData,
        productData,
      ] = await Promise.all([
        getCatalogue(catalogueId),
        getCatalogueVersions(catalogueId),
        canViewCover ? getCatalogueCover(catalogueId) : Promise.resolve(null),
        canViewCategories
          ? getCatalogueCategorySettings(catalogueId, erpBrand || undefined)
          : Promise.resolve([]),
        canViewShareLinks
          ? getCatalogueShareLinks(catalogueId)
          : Promise.resolve([]),
        getProducts({ brand: erpBrand || undefined, page: 1 }),
      ]);
      setSelected(detail);
      setDraft(catalogueDraft(detail));
      setSelectedProducts(
        detail.products.map((product) => ({
          product_id: product.product_id,
          section_title: product.section_title,
          override_description: product.override_description,
          hide_price: product.hide_price,
          include_video: product.include_video,
          selected_video_id: product.selected_video_id,
          video_title_override: product.video_title_override,
          video_description_override: product.video_description_override,
          video_display_mode: product.video_display_mode,
          video_thumbnail_mode: product.video_thumbnail_mode,
        })),
      );
      setVersions(versionData);
      setCover(coverData);
      setCategorySettings(categoriesData);
      setCategoryBrand(erpBrand || detail.brand?.trim() || "");
      setProducts(productData.items);
      setShareLinks(shareLinkData);
      setCustomerLinkName("");
      setCustomerLinkAudience("");
      setIsCreating(false);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not open the catalogue."),
      );
    } finally {
      setIsLoading(false);
    }
  }

  function filterCatalogues(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCataloguePage(1);
  }

  function applyCatalogueStatus(status: string) {
    setCatalogueStatus(status);
    setCataloguePage(1);
  }

  async function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const page = await getProducts({
        q: productQuery.trim(),
        brand: categoryBrand || undefined,
        page: 1,
      });
      setProducts(page.items);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not search products."),
      );
    }
  }

  async function changeCategoryBrand(brand: string) {
    if (!selected) return;
    setCategoryBrand(brand);
    setIsLoadingBrand(true);
    setError("");
    try {
      const [categoriesData, productData] = await Promise.all([
        getCatalogueCategorySettings(selected.id, brand || undefined),
        getProducts({
          q: productQuery.trim() || undefined,
          brand: brand || undefined,
          page: 1,
        }),
      ]);
      setCategorySettings(categoriesData);
      setProducts(productData.items);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not load ERP brand categories."),
      );
    } finally {
      setIsLoadingBrand(false);
    }
  }

  function openBrandDialog() {
    setNewBrand(EMPTY_BRAND);
    setNewBrandError("");
    setIsBrandDialogOpen(true);
  }

  async function createNewBrand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newBrand.name.trim();
    const code = newBrand.code.trim().toUpperCase();
    if (name.length < 2 || code.length < 2) {
      setNewBrandError(t("Enter a brand name and a unique brand code."));
      return;
    }
    setIsSavingBrand(true);
    setNewBrandError("");
    try {
      const saved = await saveBrand({
        name,
        code,
        description: newBrand.description.trim(),
        is_active: true,
      });
      const option: CatalogueBrandOption = {
        id: saved.id,
        name: saved.name,
        code: saved.code,
        product_count: 0,
      };
      setBrandOptions((current) =>
        [...current.filter((item) => item.id !== option.id), option].sort(
          (left, right) => left.name.localeCompare(right.name, locale),
        ),
      );
      setDraft((current) => ({ ...current, brand: saved.name }));
      setIsBrandDialogOpen(false);
      onToast(t("Brand created and selected."));
    } catch (caughtError) {
      setNewBrandError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not create the brand."),
      );
    } finally {
      setIsSavingBrand(false);
    }
  }

  async function generateAllBrandCatalogues() {
    setIsGenerating(true);
    setError("");
    try {
      const result = await generateErpBrandCatalogues();
      const [catalogueData, audienceData] = await Promise.all([
        getCatalogues(),
        canViewShareLinks ? getCatalogueAudienceTypes() : Promise.resolve([]),
      ]);
      setCatalogues(catalogueData);
      setCataloguePage(1);
      if (canViewShareLinks) {
        setCardLinks(await getCatalogueCardLinks());
      } else {
        setCardLinks({});
      }
      setAudienceTypes(audienceData);
      setIsGenerateConfirmOpen(false);
      onToast(
        t(
          "Generated {{created}} new and refreshed {{updated}} brand catalogues with {{products}} ERP products.",
          {
            created: result.created,
            updated: result.updated,
            products: result.product_count,
          },
        ),
      );
      if (result.warnings.length) {
        setError(result.warnings.join(" "));
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not generate ERP brand catalogues."),
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveCatalogueSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim()) {
      setError(t("Catalogue title is required."));
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const saved = selected
        ? await updateCatalogue(selected.id, {
            ...payloadFromDraft(draft),
            status: draft.status,
            expected_revision: selected.revision,
          })
        : await createCatalogue(payloadFromDraft(draft));
      setSelected(saved);
      setDraft(catalogueDraft(saved));
      setSelectedProducts(
        saved.products.map((product) => ({
          product_id: product.product_id,
          section_title: product.section_title,
          override_description: product.override_description,
          hide_price: product.hide_price,
          include_video: product.include_video,
          selected_video_id: product.selected_video_id,
          video_title_override: product.video_title_override,
          video_description_override: product.video_description_override,
          video_display_mode: product.video_display_mode,
          video_thumbnail_mode: product.video_thumbnail_mode,
        })),
      );
      setIsCreating(false);
      setCatalogues((current) => {
        const exists = current.some((item) => item.id === saved.id);
        return exists
          ? current.map((item) =>
              item.id === saved.id ? { ...saved, products: [] } : item,
            )
          : [{ ...saved, products: [] }, ...current];
      });
      const savedBrand = saved.brand?.trim() ?? "";
      if (canViewCategories && savedBrand !== categoryBrand) {
        setCategoryBrand(savedBrand);
        const [categoriesResult, productsResult] = await Promise.allSettled([
          getCatalogueCategorySettings(saved.id, savedBrand || undefined),
          getProducts({ brand: savedBrand || undefined, page: 1 }),
        ]);
        if (categoriesResult.status === "fulfilled") {
          setCategorySettings(categoriesResult.value);
        }
        if (productsResult.status === "fulfilled") {
          setProducts(productsResult.value.items);
        }
      }
      onToast(
        t(
          selected
            ? "Catalogue settings saved."
            : "Catalogue created. Add products next.",
        ),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not save the catalogue."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  function addProduct(product: ProductListItem) {
    setSelectedProducts((current) => [
      ...current,
      {
        product_id: product.id,
        section_title: "",
        override_description: "",
        hide_price: false,
        include_video: true,
        selected_video_id: null,
        video_title_override: "",
        video_description_override: "",
        video_display_mode: "product_detail",
        video_thumbnail_mode: "video_thumbnail",
      },
    ]);
  }

  function updateProduct(
    index: number,
    changes: Partial<CatalogueProductInput>,
  ) {
    setSelectedProducts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...changes } : item,
      ),
    );
  }

  async function loadVideoOptions(productId: string) {
    if (videoOptions[productId]) return;
    try {
      const videos = await getProductVideos(productId);
      setVideoOptions((current) => ({ ...current, [productId]: videos }));
    } catch {
      setVideoOptions((current) => ({ ...current, [productId]: [] }));
    }
  }

  function moveProduct(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= selectedProducts.length) return;
    setSelectedProducts((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  async function saveProducts() {
    if (!selected) return;
    setIsSaving(true);
    setError("");
    try {
      const saved = await setCatalogueProducts(selected.id, selectedProducts);
      setSelected(saved);
      setDraft(catalogueDraft(saved));
      setCatalogues((current) =>
        current.map((item) =>
          item.id === saved.id ? { ...saved, products: [] } : item,
        ),
      );
      if (canViewCategories)
        setCategorySettings(
          await getCatalogueCategorySettings(
            selected.id,
            categoryBrand || undefined,
          ),
        );
      onToast(t("Catalogue product order saved."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not save catalogue products."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= categorySettings.length) return;
    setCategorySettings((current) => {
      const next = [...current];
      [next[index], next[destination]] = [next[destination], next[index]];
      return next.map((item, itemIndex) => ({
        ...item,
        display_order: itemIndex + 1,
      }));
    });
  }

  async function saveCategories() {
    if (!selected) return;
    setIsSaving(true);
    setError("");
    try {
      const saved = await updateCatalogueCategorySettings(
        selected.id,
        categorySettings,
        categoryBrand || undefined,
      );
      setCategorySettings(saved);
      const detail = await getCatalogue(selected.id);
      setSelected(detail);
      setDraft(catalogueDraft(detail));
      onToast(t("Category presentation saved."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not save category presentation."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function changeCategoryBanner(categoryId: number, file?: File) {
    if (!selected || !file) return;
    setIsSaving(true);
    setError("");
    try {
      await uploadCatalogueCategoryBanner(selected.id, categoryId, file);
      setCategorySettings(
        await getCatalogueCategorySettings(
          selected.id,
          categoryBrand || undefined,
        ),
      );
      onToast(t("Category banner uploaded."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not upload the category banner."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeCategoryBanner(categoryId: number) {
    if (!selected) return;
    setIsSaving(true);
    try {
      await deleteCatalogueCategoryBanner(selected.id, categoryId);
      setCategorySettings(
        await getCatalogueCategorySettings(
          selected.id,
          categoryBrand || undefined,
        ),
      );
      onToast(t("Category banner removed."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not remove the category banner."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function showPreview() {
    if (!selected) return;
    router.push(`/catalogues/${selected.id}/preview`);
  }

  async function publish(skipConfirmation = false): Promise<boolean> {
    if (
      !selected ||
      (!skipConfirmation &&
        !window.confirm(t("Publish an immutable catalogue version now?")))
    )
      return false;
    setIsSaving(true);
    setError("");
    try {
      const version = await publishCatalogue(selected.id);
      const detail = await getCatalogue(selected.id);
      setSelected(detail);
      setDraft(catalogueDraft(detail));
      setVersions((current) => [version, ...current]);
      setCatalogues((current) =>
        current.map((item) =>
          item.id === detail.id ? { ...detail, products: [] } : item,
        ),
      );
      if (canViewShareLinks) {
        const [links, cards] = await Promise.all([
          getCatalogueShareLinks(selected.id),
          getCatalogueCardLinks([selected.id]),
        ]);
        setShareLinks(links);
        setCardLinks((current) => ({ ...current, ...cards }));
      }
      onToast(
        t("Catalogue version {{version}} published.", {
          version: version.version_number,
        }),
      );
      return true;
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not publish the catalogue."),
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function copyShareLink(link: CatalogueShareLink) {
    if (!link.public_url || link.status !== "active") return;
    const copied = await copyTextToClipboard(link.public_url);
    if (!copied) {
      setError(
        t(
          "Could not copy the catalogue link. Your browser may be blocking clipboard access.",
        ),
      );
      return;
    }
    const key = link.id || `${link.catalogue_id}:${link.audience_code}`;
    setCopiedLink(key);
    window.setTimeout(
      () => setCopiedLink((current) => (current === key ? "" : current)),
      1800,
    );
    onToast(
      t("{{customer}} catalogue link copied.", {
        customer: link.customer_name || link.audience_name,
      }),
    );
  }

  function replaceShareLink(link: CatalogueShareLink) {
    setShareLinks((current) =>
      [
        ...current.filter(
          (item) =>
            link.id
              ? item.id !== link.id
              : item.audience_type_id !== link.audience_type_id ||
                item.customer_code !== link.customer_code,
        ),
        link,
      ].sort((a, b) =>
        Number(Boolean(a.customer_code)) - Number(Boolean(b.customer_code)) ||
        a.audience_type_id - b.audience_type_id ||
        (a.customer_name || "").localeCompare(b.customer_name || ""),
      ),
    );
    if (!link.customer_code) {
      setCardLinks((current) => ({
        ...current,
        [link.catalogue_id]: (current[link.catalogue_id] || []).map((item) =>
          item.audience_type_id === link.audience_type_id ? link : item,
        ),
      }));
    }
  }

  async function createAndCopy(
    catalogue: ManagedCatalogue,
    link: CatalogueShareLink,
  ) {
    if (
      (!canCreateShareLinks && !canCopyShareLinks) ||
      catalogue.status !== "published"
    ) return;
    const key = `${catalogue.id}:${link.audience_code}`;
    setLinkAction(key);
    setError("");
    try {
      const created = await createCatalogueShareLink(catalogue.id, {
        audience_type_id: link.audience_type_id,
      });
      replaceShareLink(created);
      await copyShareLink(created);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not create the catalogue link."),
      );
    } finally {
      setLinkAction("");
    }
  }

  async function createCustomerLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || (!canCreateShareLinks && !canCopyShareLinks)) return;
    const customerName = customerLinkName.trim();
    const audienceTypeId = Number(
      customerLinkAudience ||
        audienceTypes.find((audience) => audience.is_active)?.id ||
        0,
    );
    if (!customerName) {
      setError(t("Enter the customer or company name."));
      return;
    }
    if (!audienceTypeId) {
      setError(t("Choose the customer price profile."));
      return;
    }
    setLinkAction("customer-link-new");
    setError("");
    try {
      const created = await createCatalogueShareLink(selected.id, {
        audience_type_id: audienceTypeId,
        customer_name: customerName,
      });
      replaceShareLink(created);
      setCustomerLinkName("");
      await copyShareLink(created);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not create the customer catalogue link."),
      );
    } finally {
      setLinkAction("");
    }
  }

  async function changeShareLink(
    link: CatalogueShareLink,
    action: "regenerate" | "revoke" | "activate" | "delete",
  ) {
    if (!selected || !link.id) return;
    if (
      (action === "regenerate" || action === "delete") &&
      !window.confirm(
        t(
          action === "delete"
            ? "Delete this catalogue link?"
            : "Regenerate this link? The old link will stop working.",
        ),
      )
    )
      return;
    setLinkAction(link.id);
    setError("");
    try {
      if (action === "delete") {
        await deleteCatalogueShareLink(selected.id, link.id);
        setShareLinks((current) =>
          current.filter((item) => item.id !== link.id),
        );
        const cards = await getCatalogueCardLinks([selected.id]);
        setCardLinks((current) => ({ ...current, ...cards }));
        onToast(t("Catalogue link deleted."));
      } else {
        const changed =
          action === "regenerate"
            ? await regenerateCatalogueShareLink(selected.id, link.id)
            : action === "revoke"
              ? await revokeCatalogueShareLink(selected.id, link.id)
              : await activateCatalogueShareLink(selected.id, link.id);
        replaceShareLink(changed);
        onToast(t("Catalogue link updated."));
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not update the catalogue link."),
      );
    } finally {
      setLinkAction("");
    }
  }

  async function patchShareLink(
    link: CatalogueShareLink,
    changes: Parameters<typeof updateCatalogueShareLink>[2],
  ) {
    if (!selected || !link.id) return;
    setLinkAction(link.id);
    setError("");
    try {
      replaceShareLink(
        await updateCatalogueShareLink(selected.id, link.id, changes),
      );
      onToast(t("Catalogue link settings saved."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not save catalogue link settings."),
      );
    } finally {
      setLinkAction("");
    }
  }

  async function duplicate() {
    if (!selected) return;
    setIsSaving(true);
    setError("");
    try {
      const copy = await duplicateCatalogue(selected.id);
      setCatalogues((current) => [{ ...copy, products: [] }, ...current]);
      await openCatalogue(copy.id);
      onToast(t("Catalogue duplicated as a new draft."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not duplicate the catalogue."),
      );
      setIsSaving(false);
    }
  }

  async function archive() {
    if (!selected || !window.confirm(t("Archive this catalogue?"))) return;
    setIsSaving(true);
    setError("");
    try {
      const saved = await archiveCatalogue(selected.id);
      setSelected(saved);
      setDraft(catalogueDraft(saved));
      setCatalogues((current) =>
        current.map((item) =>
          item.id === saved.id ? { ...saved, products: [] } : item,
        ),
      );
      onToast(t("Catalogue archived."));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not archive the catalogue."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeCatalogue() {
    if (!selected) return;
    setIsSaving(true);
    setError("");
    try {
      await deleteCatalogue(selected.id);
      setCatalogues((current) =>
        current.filter((item) => item.id !== selected.id),
      );
      setSelected(null);
      setIsCreating(false);
      setDraft(EMPTY_CATALOGUE);
      setSelectedProducts([]);
      setVersions([]);
      setCover(null);
      setCategorySettings([]);
      setCategoryBrand("");
      setShareLinks([]);
      setIsDeleteConfirmOpen(false);
      onToast(t("Catalogue deleted."));
    } catch (caughtError) {
      setIsDeleteConfirmOpen(false);
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not delete the catalogue."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadExport(format: "pdf" | "excel") {
    if (!selected) return;
    setIsSaving(true);
    setError("");
    try {
      const exported = await downloadCatalogueExport(selected.id, format);
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      onToast(
        t("{{format}} export downloaded.", {
          format: format === "pdf" ? "PDF" : "Excel",
        }),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? t(caughtError.message)
          : t("Could not export the catalogue."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !selected && !isCreating) {
    return (
      <div className={styles.userLoading}>
        <T>Loading catalogue management...</T>
      </div>
    );
  }

  if (selected || isCreating) {
    const selectedProductDetails = new Map(
      products.map((product) => [product.id, product]),
    );
    return (
      <>
        <div className={styles.builderTopbar}>
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setIsCreating(false);
              setError("");
            }}
          >
            ← {t("All catalogues")}
          </button>
          <div>
            <span>
              {isCreating
                ? t("New catalogue")
                : t("Version {{version}}", { version: selected?.version ?? 0 })}
            </span>
            <h2>{draft.title || t("Untitled catalogue")}</h2>
          </div>
          {selected && (
            <div className={styles.builderActions}>
              {canPreview && (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => void showPreview()}
                  disabled={isSaving}
                >
                  <T>Preview PDF</T>
                </button>
              )}
              {canExportPdf && (
                <button
                  type="button"
                  onClick={() => void downloadExport("pdf")}
                  disabled={isSaving}
                >
                  <T>PDF · A4 Landscape</T>
                </button>
              )}
              {canExportExcel && (
                <button
                  type="button"
                  onClick={() => void downloadExport("excel")}
                  disabled={isSaving}
                >
                  <T>Excel</T>
                </button>
              )}
              {canDuplicate && (
                <button
                  type="button"
                  onClick={() => void duplicate()}
                  disabled={isSaving}
                >
                  <T>Duplicate</T>
                </button>
              )}
              {canArchive && selected.status !== "archived" && (
                <button
                  type="button"
                  onClick={() => void archive()}
                  disabled={isSaving}
                >
                  <T>Archive</T>
                </button>
              )}
              {canPublish && (
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => void publish()}
                  disabled={isSaving || !selectedProducts.length}
                >
                  <T>Publish version</T>
                </button>
              )}
            </div>
          )}
        </div>

        {isBrandDialogOpen && (
          <div
            className={styles.catalogueDeleteBackdrop}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isSavingBrand) {
                setIsBrandDialogOpen(false);
              }
            }}
          >
            <section
              className={`${styles.catalogueDeleteDialog} ${styles.catalogueGenerateDialog}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="new-brand-title"
            >
              <div className={styles.catalogueGenerateIcon}>+</div>
              <span>
                <T>Brand setup</T>
              </span>
              <h3 id="new-brand-title">
                <T>Create a new brand</T>
              </h3>
              <p>
                <T>
                  Create the brand now and prepare its catalogue while ERP
                  products are being added.
                </T>
              </p>
              <form className={styles.newBrandForm} onSubmit={createNewBrand}>
                <label className={styles.inputGroup}>
                  <span>
                    <T>Brand name</T>
                  </span>
                  <input
                    autoFocus
                    required
                    minLength={2}
                    maxLength={120}
                    value={newBrand.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setNewBrand((current) => ({
                        ...current,
                        name,
                        code:
                          !current.code ||
                          current.code === brandCode(current.name)
                            ? brandCode(name)
                            : current.code,
                      }));
                    }}
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span>
                    <T>Brand code</T>
                  </span>
                  <input
                    aria-label={t("Brand code")}
                    required
                    minLength={2}
                    maxLength={30}
                    pattern="[A-Za-z0-9_-]+"
                    value={newBrand.code}
                    onChange={(event) =>
                      setNewBrand((current) => ({
                        ...current,
                        code: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                  <small>
                    <T>Use a short unique code, for example HANA.</T>
                  </small>
                </label>
                <label className={styles.inputGroup}>
                  <span>
                    <T>Description (optional)</T>
                  </span>
                  <textarea
                    maxLength={320}
                    value={newBrand.description}
                    onChange={(event) =>
                      setNewBrand((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <p className={styles.newBrandNote}>
                  <T>
                    This creates the brand in the catalogue platform. It does
                    not write the brand back to ERP.
                  </T>
                </p>
                {newBrandError && (
                  <p className={styles.newBrandError} role="alert">
                    {newBrandError}
                  </p>
                )}
                <footer>
                  <button
                    type="button"
                    disabled={isSavingBrand}
                    onClick={() => setIsBrandDialogOpen(false)}
                  >
                    <T>Cancel</T>
                  </button>
                  <button
                    className={styles.confirmGenerateButton}
                    type="submit"
                    disabled={isSavingBrand}
                  >
                    {t(
                      isSavingBrand ? "Creating brand..." : "Create and select",
                    )}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}

        {selected && isDeleteConfirmOpen && (
          <div
            className={styles.catalogueDeleteBackdrop}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !isSaving) {
                setIsDeleteConfirmOpen(false);
              }
            }}
          >
            <section
              className={styles.catalogueDeleteDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="catalogue-delete-title"
            >
              <div className={styles.catalogueDeleteIcon}>!</div>
              <span>
                <T>Permanent deletion</T>
              </span>
              <h3 id="catalogue-delete-title">
                <T>Delete this catalogue?</T>
              </h3>
              <p>
                {t(
                  'You are about to permanently delete "{{title}}". This action cannot be undone.',
                  { title: selected.title },
                )}
              </p>
              <p>
                <T>
                  Product selections, published versions, customer links and
                  cover settings will be removed. ERP product records will not
                  be deleted.
                </T>
              </p>
              {selected.studio_design_id && (
                <p>
                  <T>
                    The Catalogue Studio design will also be permanently
                    deleted.
                  </T>
                </p>
              )}
              <footer>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsDeleteConfirmOpen(false)}
                >
                  <T>Cancel</T>
                </button>
                <button
                  className={styles.confirmDeleteButton}
                  type="button"
                  disabled={isSaving}
                  onClick={() => void removeCatalogue()}
                >
                  {t(isSaving ? "Deleting..." : "Delete catalogue")}
                </button>
              </footer>
            </section>
          </div>
        )}

        {error && (
          <div className={styles.userError} role="alert">
            <span>!</span>
            {error}
            <button type="button" onClick={() => setError("")}>
              <T>Dismiss</T>
            </button>
          </div>
        )}

        <div className={styles.catalogueEditorGrid}>
          <section className={styles.commercePanel}>
            <div className={styles.commercePanelHeader}>
              <div>
                <span>
                  <T>Catalogue setup</T>
                </span>
                <h3>
                  <T>Catalogue identity</T>
                </h3>
              </div>
              {selected && (
                <b
                  className={styles.catalogueStatus}
                  data-status={selected.status}
                >
                  {statusLabel(selected.status)}
                </b>
              )}
            </div>
            <form
              className={styles.commerceFormGrid}
              onSubmit={saveCatalogueSettings}
            >
              <label className={styles.inputGroup}>
                <span>
                  <T>Catalogue title</T>
                </span>
                <input
                  required
                  minLength={2}
                  maxLength={220}
                  disabled={!canEdit && Boolean(selected)}
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.inputGroup}>
                <span>
                  <T>Slug (optional)</T>
                </span>
                <input
                  maxLength={240}
                  disabled={!canEdit && Boolean(selected)}
                  value={draft.slug}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      slug: event.target.value,
                    }))
                  }
                  placeholder={t("Generated from title")}
                />
              </label>
              <div
                className={`${styles.inputGroup} ${styles.commerceFullField}`}
              >
                <label htmlFor="catalogue-brand">
                  <T>Brand</T>
                </label>
                <div className={styles.brandSelectRow}>
                  <select
                    id="catalogue-brand"
                    disabled={!canEdit && Boolean(selected)}
                    value={draft.brand}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        brand: event.target.value,
                      }))
                    }
                  >
                    <option value="">{t("All brands")}</option>
                    {draft.brand &&
                    !brandOptions.some(
                      (brand) => brand.name === draft.brand,
                    ) ? (
                      <option value={draft.brand}>{draft.brand}</option>
                    ) : null}
                    {brandOptions.map((brand) => (
                      <option key={brand.id} value={brand.name}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                  {canCreateBrand && (!selected || canEdit) && (
                    <button type="button" onClick={openBrandDialog}>
                      <T>+ New brand</T>
                    </button>
                  )}
                </div>
              </div>
              <label
                className={`${styles.inputGroup} ${styles.commerceFullField}`}
              >
                <span>
                  <T>Valid from</T>
                </span>
                <input
                  type="datetime-local"
                  disabled={!canEdit && Boolean(selected)}
                  value={draft.valid_from}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      valid_from: event.target.value,
                    }))
                  }
                />
              </label>
              <label
                className={`${styles.inputGroup} ${styles.commerceFullField}`}
              >
                <span>
                  <T>Description</T>
                </span>
                <textarea
                  rows={5}
                  maxLength={12000}
                  disabled={!canEdit && Boolean(selected)}
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.commerceCheck}>
                <input
                  type="checkbox"
                  disabled={
                    (!canEdit && Boolean(selected)) ||
                    !priceLists.some(
                      (item) => item.is_active && !item.is_no_price,
                    )
                  }
                  checked={draft.show_prices}
                  onChange={(event) => {
                    const showPrices = event.target.checked;
                    setDraft((current) => {
                      if (!showPrices) {
                        return { ...current, show_prices: false };
                      }
                      const currentPriceList = priceLists.find(
                        (item) =>
                          item.id === Number(current.price_list_id) &&
                          item.is_active &&
                          !item.is_no_price,
                      );
                      const defaultPriceList =
                        currentPriceList ??
                        priceLists.find(
                          (item) =>
                            item.code === "NORMAL" &&
                            item.is_active &&
                            !item.is_no_price,
                        ) ??
                        priceLists.find(
                          (item) => item.is_active && !item.is_no_price,
                        );
                      if (!defaultPriceList) return current;
                      return {
                        ...current,
                        price_list_id: String(defaultPriceList.id),
                        currency: defaultPriceList.currency,
                        show_prices: true,
                      };
                    });
                  }}
                />
                <span>
                  <strong>
                    <T>Show prices</T>
                  </strong>
                  <small>
                    <T>
                      Uses SP1 / Normal by default and applies to preview and
                      published versions.
                    </T>
                  </small>
                </span>
              </label>
              <label className={styles.commerceCheck}>
                <input
                  type="checkbox"
                  disabled={!canEdit && Boolean(selected)}
                  checked={draft.is_public}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      is_public: event.target.checked,
                    }))
                  }
                />
                <span>
                  <strong>
                    <T>Public catalogue</T>
                  </strong>
                  <small>
                    <T>Marks this catalogue for public delivery.</T>
                  </small>
                </span>
              </label>
              {(isCreating ? canCreate : canEdit) && (
                <button
                  className={`${styles.primaryButton} ${styles.commerceFullField}`}
                  type="submit"
                  disabled={isSaving}
                >
                  {t(
                    isSaving
                      ? "Saving..."
                      : selected
                        ? "Save catalogue settings"
                        : "Create catalogue",
                  )}
                </button>
              )}
            </form>
          </section>

          {selected && (
            <section className={styles.commercePanel}>
              <div className={styles.commercePanelHeader}>
                <div>
                  <span>
                    <T>Published snapshots</T>
                  </span>
                  <h3>
                    <T>Version history</T>
                  </h3>
                </div>
                <small>
                  {versions.length} <T>versions</T>
                </small>
              </div>
              <div className={styles.versionList}>
                {versions.map((version) => (
                  <article key={version.id}>
                    <div>
                      <strong>
                        {t("Version {{version}}", {
                          version: version.version_number,
                        })}
                      </strong>
                      <span>
                        {t("Published {{date}}", {
                          date: formatDate(version.published_at, locale, true),
                        })}
                      </span>
                    </div>
                    <small>
                      {t("Immutable snapshot · {{count}} products", {
                        count: Array.isArray(version.snapshot.products)
                          ? version.snapshot.products.length
                          : 0,
                      })}
                    </small>
                    {canPreview && (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/catalogues/${selected.id}/preview?version=${version.version_number}`,
                          )
                        }
                      >
                        {t("Preview v{{version}}", {
                          version: version.version_number,
                        })}
                      </button>
                    )}
                  </article>
                ))}
                {!versions.length && (
                  <div className={styles.emptyState}>
                    <T>
                      Publish this catalogue to create its first immutable
                      version.
                    </T>
                  </div>
                )}
              </div>
            </section>
          )}

          {selected && canViewShareLinks && (
            <section
              className={`${styles.commercePanel} ${styles.shareLinkPanel}`}
            >
              <div className={styles.commercePanelHeader}>
                <div>
                  <span>
                    <T>Secure delivery</T>
                  </span>
                  <h3>
                    <T>Secure customer delivery</T>
                  </h3>
                  <p>
                    <T>
                      Create one private link per customer. Their link fixes the
                      customer price profile while each product still follows
                      its own brand mapping.
                    </T>
                  </p>
                </div>
                <div className={styles.shareLinkHeaderControls}>
                  <small>
                    {
                      shareLinks.filter((item) => item.status === "active")
                        .length
                    }{" "}
                    <T>active</T>
                  </small>
                  <label className={styles.shareLinkPriceList}>
                    <span>
                      <T>Price list</T>
                    </span>
                    <select
                      disabled={!canEdit}
                      value={draft.price_list_id}
                      onChange={(event) => {
                        const priceList = priceLists.find(
                          (item) => item.id === Number(event.target.value),
                        );
                        setDraft((current) => ({
                          ...current,
                          price_list_id: event.target.value,
                          currency: priceList?.currency ?? current.currency,
                          show_prices: priceList?.is_no_price
                            ? false
                            : current.show_prices,
                        }));
                      }}
                    >
                      <option value="">
                        <T>No price list</T>
                      </option>
                      {priceLists
                        .filter((item) => item.is_active)
                        .map((priceList) => (
                          <option key={priceList.id} value={priceList.id}>
                            {priceList.name}
                            {priceList.is_no_price ? " — hide prices" : ""}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </div>
              {(canCreateShareLinks || canCopyShareLinks) && (
                <form
                  className={styles.customerLinkComposer}
                  onSubmit={(event) => void createCustomerLink(event)}
                >
                  <div>
                    <span>
                      <T>Customer-specific link</T>
                    </span>
                    <strong>
                      <T>Create and copy in one step</T>
                    </strong>
                    <small>
                      <T>
                        The customer will not see or choose a price list.
                      </T>
                    </small>
                  </div>
                  <label>
                    <span>
                      <T>Customer or company</T>
                    </span>
                    <input
                      value={customerLinkName}
                      maxLength={160}
                      placeholder={t("Example: Siam Retail Co.")}
                      onChange={(event) =>
                        setCustomerLinkName(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>
                      <T>Price profile</T>
                    </span>
                    <select
                      value={
                        customerLinkAudience ||
                        String(
                          audienceTypes.find(
                            (audience) => audience.is_active,
                          )?.id || "",
                        )
                      }
                      onChange={(event) =>
                        setCustomerLinkAudience(event.target.value)
                      }
                    >
                      {audienceTypes
                        .filter((audience) => audience.is_active)
                        .map((audience) => (
                          <option key={audience.id} value={audience.id}>
                            {catalogueLinkLabel(audience.display_name)}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className={styles.primaryButton}
                    type="submit"
                    disabled={
                      selected.status !== "published" || Boolean(linkAction)
                    }
                  >
                    {linkAction === "customer-link-new"
                      ? t("Creating...")
                      : t("Create & copy link")}
                  </button>
                </form>
              )}
              <div className={styles.shareLinkSectionHeading}>
                <div>
                  <strong>
                    <T>Quick audience links</T>
                  </strong>
                  <small>
                    <T>Reusable shortcuts without a customer name.</T>
                  </small>
                </div>
              </div>
              <div className={styles.shareLinkList}>
                {audienceTypes
                  .filter((audience) => audience.is_active)
                  .map((audience) => {
                    const link = shareLinks.find(
                      (item) =>
                        item.audience_type_id === audience.id &&
                        !item.customer_code,
                    );
                    const placeholder = cardLinks[selected.id]?.find(
                      (item) => item.audience_type_id === audience.id,
                    );
                    if (!link)
                      return (
                        <article key={audience.id}>
                          <div>
                            <strong>{audience.display_name}</strong>
                            <small>
                              {audience.show_prices
                                ? audience.price_list_name
                                : t("No prices")}
                            </small>
                          </div>
                          <span
                            className={styles.linkStatus}
                            data-status="not_generated"
                          >
                            <T>Not generated</T>
                          </span>
                          {canCreateShareLinks && placeholder && (
                            <button
                              type="button"
                              disabled={
                                selected.status !== "published" ||
                                Boolean(linkAction)
                              }
                              onClick={() =>
                                void createAndCopy(selected, placeholder)
                              }
                            >
                              <T>Create & copy</T>
                            </button>
                          )}
                        </article>
                      );
                    return (
                      <article key={audience.id}>
                        <div>
                          <strong>{link.audience_name}</strong>
                          <small>
                            {link.show_prices
                              ? link.price_list_name
                              : t("No prices")}{" "}
                            · {link.view_count} {t("views")}
                          </small>
                        </div>
                        <span
                          className={styles.linkStatus}
                          data-status={link.status}
                        >
                          {t(statusLabel(link.status as CatalogueStatus))}
                        </span>
                        <label>
                          <span>
                            <T>Version</T>
                          </span>
                          <select
                            disabled={
                              !canEditShareLinks || linkAction === link.id
                            }
                            value={link.version_mode}
                            onChange={(event) =>
                              void patchShareLink(link, {
                                version_mode: event.target.value as
                                  "latest_published" | "fixed_published",
                                fixed_version_number:
                                  event.target.value === "fixed_published"
                                    ? versions[0]?.version_number
                                    : null,
                              })
                            }
                          >
                            <option value="latest_published">
                              <T>Latest published</T>
                            </option>
                            <option value="fixed_published">
                              <T>Fixed version</T>
                            </option>
                          </select>
                        </label>
                        <label>
                          <span>
                            <T>Expires</T>
                          </span>
                          <input
                            type="datetime-local"
                            disabled={
                              !canEditShareLinks || linkAction === link.id
                            }
                            defaultValue={dateInput(link.expires_at)}
                            onBlur={(event) =>
                              void patchShareLink(link, {
                                expires_at: isoDate(event.target.value),
                              })
                            }
                          />
                        </label>
                        <label className={styles.linkCheck}>
                          <input
                            type="checkbox"
                            checked={link.allow_pdf_download}
                            disabled={
                              !canEditShareLinks || linkAction === link.id
                            }
                            onChange={(event) =>
                              void patchShareLink(link, {
                                allow_pdf_download: event.target.checked,
                              })
                            }
                          />
                          <T>PDF</T>
                        </label>
                        <label className={styles.linkCheck}>
                          <input
                            type="checkbox"
                            checked={link.allow_print}
                            disabled={
                              !canEditShareLinks || linkAction === link.id
                            }
                            onChange={(event) =>
                              void patchShareLink(link, {
                                allow_print: event.target.checked,
                              })
                            }
                          />
                          <T>Print</T>
                        </label>
                        <div className={styles.shareLinkActions}>
                          {canCopyShareLinks && (
                            <button
                              className={styles.primaryButton}
                              type="button"
                              disabled={
                                !link.public_url || link.status !== "active"
                              }
                              onClick={() => void copyShareLink(link)}
                            >
                              {copiedLink === link.id
                                ? t("Copied")
                                : t("Copy link")}
                            </button>
                          )}
                          {canRegenerateShareLinks && (
                            <button
                              type="button"
                              onClick={() =>
                                void changeShareLink(link, "regenerate")
                              }
                            >
                              <T>Regenerate</T>
                            </button>
                          )}
                          {link.status === "active"
                            ? canRevokeShareLinks && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void changeShareLink(link, "revoke")
                                  }
                                >
                                  <T>Revoke</T>
                                </button>
                              )
                            : canEditShareLinks && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void changeShareLink(link, "activate")
                                  }
                                >
                                  <T>Activate</T>
                                </button>
                              )}
                          {canDeleteShareLinks && (
                            <button
                              type="button"
                              onClick={() =>
                                void changeShareLink(link, "delete")
                              }
                            >
                              <T>Delete</T>
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
              </div>
              {shareLinks.some((link) => Boolean(link.customer_code)) && (
                <>
                  <div className={styles.shareLinkSectionHeading}>
                    <div>
                      <strong>
                        <T>Customer links</T>
                      </strong>
                      <small>
                        <T>
                          Each recipient receives the correct brand prices from
                          their own secure link.
                        </T>
                      </small>
                    </div>
                    <span>
                      {
                        shareLinks.filter((link) =>
                          Boolean(link.customer_code),
                        ).length
                      }{" "}
                      <T>customers</T>
                    </span>
                  </div>
                  <div className={styles.customerLinkList}>
                    {shareLinks
                      .filter((link) => Boolean(link.customer_code))
                      .map((link) => (
                        <article key={link.id || link.customer_code || "link"}>
                          <div>
                            <strong>
                              {link.customer_name || link.customer_code}
                            </strong>
                            <small>
                              {catalogueLinkLabel(link.audience_name)} {" · "}
                              {t("Brand prices applied automatically")}
                            </small>
                          </div>
                          <span
                            className={styles.linkStatus}
                            data-status={link.status}
                          >
                            {t(statusLabel(link.status as CatalogueStatus))}
                          </span>
                          <small>
                            {link.view_count} {t("views")}
                          </small>
                          <div className={styles.shareLinkActions}>
                            {canCopyShareLinks && (
                              <button
                                className={styles.primaryButton}
                                type="button"
                                disabled={
                                  !link.public_url || link.status !== "active"
                                }
                                onClick={() => void copyShareLink(link)}
                              >
                                {copiedLink === link.id
                                  ? t("Copied")
                                  : t("Copy link")}
                              </button>
                            )}
                            {canRegenerateShareLinks && (
                              <button
                                type="button"
                                disabled={linkAction === link.id}
                                onClick={() =>
                                  void changeShareLink(link, "regenerate")
                                }
                              >
                                <T>Regenerate</T>
                              </button>
                            )}
                            {link.status === "active"
                              ? canRevokeShareLinks && (
                                  <button
                                    type="button"
                                    disabled={linkAction === link.id}
                                    onClick={() =>
                                      void changeShareLink(link, "revoke")
                                    }
                                  >
                                    <T>Revoke</T>
                                  </button>
                                )
                              : canEditShareLinks && (
                                  <button
                                    type="button"
                                    disabled={linkAction === link.id}
                                    onClick={() =>
                                      void changeShareLink(link, "activate")
                                    }
                                  >
                                    <T>Activate</T>
                                  </button>
                                )}
                            {canDeleteShareLinks && (
                              <button
                                type="button"
                                disabled={linkAction === link.id}
                                onClick={() =>
                                  void changeShareLink(link, "delete")
                                }
                              >
                                <T>Delete</T>
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        {selected && canViewCover && (
          <section
            className={`${styles.commercePanel} ${styles.presentationBuilder}`}
          >
            {cover && (
              <CoverEditor
                key={selected.id}
                catalogueId={selected.id}
                initialCover={cover}
                canUpload={canUploadCover}
                canEdit={canEditCover}
                canDelete={canDeleteCover}
                canPublish={canPublishCover}
                onChanged={(value) => {
                  setCover(value);
                  const title = [value.catalogue_name, value.catalogue_year]
                    .filter(Boolean)
                    .join(" ");
                  setDraft((current) => ({ ...current, title }));
                  setSelected((current) =>
                    current ? { ...current, title } : current,
                  );
                  setCatalogues((current) =>
                    current.map((item) =>
                      item.id === selected.id ? { ...item, title } : item,
                    ),
                  );
                }}
                onPublishCatalogue={() => publish(true)}
                onToast={onToast}
              />
            )}
          </section>
        )}

        {selected && canViewCategories && (
          <section
            className={`${styles.commercePanel} ${styles.presentationBuilder}`}
          >
            <div className={styles.commercePanelHeader}>
              <div>
                <span>
                  <T>3 · Categories</T>
                </span>
                <h3>
                  <T>Category navigation and sections</T>
                </h3>
                <p>
                  <T>
                    These names and descriptions apply only to this catalogue.
                    Product master categories are unchanged.
                  </T>
                </p>
              </div>
              <div className={styles.categoryHeaderActions}>
                <label className={styles.categoryBrandFilter}>
                  <span>
                    <T>ERP brand filter</T>
                  </span>
                  <select
                    value={categoryBrand}
                    disabled={isLoadingBrand}
                    onChange={(event) =>
                      void changeCategoryBrand(event.target.value)
                    }
                  >
                    <option value="">{t("All ERP brands")}</option>
                    {brandOptions.map((brand) => (
                      <option key={brand.id} value={brand.name}>
                        {brand.name} ({brand.product_count})
                      </option>
                    ))}
                  </select>
                  <small>
                    <T>
                      Categories and products are pulled from the selected ERP
                      brand.
                    </T>
                  </small>
                </label>
                <strong>
                  {categorySettings.length} <T>categories</T>
                </strong>
              </div>
            </div>
            <div className={styles.categorySettingList}>
              <div className={styles.categorySettingBrandHeading}>
                <div>
                  <span>
                    <T>ERP brand</T>
                  </span>
                  <h4>{categoryBrand || t("All ERP brands")}</h4>
                </div>
                <small>
                  {categorySettings.length} <T>categories from ERP</T>
                </small>
              </div>
              {categorySettings.map((category, index) => (
                <article key={category.category_id}>
                  <div className={styles.orderControls}>
                    <strong>{index + 1}</strong>
                    <button
                      type="button"
                      disabled={!canManageCategories || index === 0}
                      onClick={() => moveCategory(index, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      disabled={
                        !canManageCategories ||
                        index === categorySettings.length - 1
                      }
                      onClick={() => moveCategory(index, 1)}
                    >
                      ↓
                    </button>
                  </div>
                  <div>
                    <small>
                      {category.master_name} · {category.product_count}{" "}
                      <T>products</T>
                    </small>
                    <input
                      disabled={!canManageCategories}
                      value={category.display_name}
                      placeholder={category.master_name}
                      onChange={(event) =>
                        setCategorySettings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, display_name: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                    <textarea
                      disabled={!canManageCategories}
                      rows={2}
                      value={category.description}
                      placeholder={
                        category.master_description ||
                        "Catalogue-specific description"
                      }
                      onChange={(event) =>
                        setCategorySettings((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, description: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </div>
                  <div className={styles.categoryChecks}>
                    <label>
                      <input
                        disabled={!canManageCategories}
                        type="checkbox"
                        checked={category.is_visible}
                        onChange={(event) =>
                          setCategorySettings((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, is_visible: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />{" "}
                      <T>Visible</T>
                    </label>
                    <label>
                      <input
                        disabled={!canManageCategories}
                        type="checkbox"
                        checked={category.show_product_count}
                        onChange={(event) =>
                          setCategorySettings((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    show_product_count: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />{" "}
                      <T>Product count</T>
                    </label>
                    <label>
                      <input
                        disabled={!canManageCategories}
                        type="checkbox"
                        checked={category.default_expanded}
                        onChange={(event) =>
                          setCategorySettings((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    default_expanded: event.target.checked,
                                  }
                                : item,
                            ),
                          )
                        }
                      />{" "}
                      <T>Expanded</T>
                    </label>
                    {canManageCategories && (
                      <label className={styles.bannerUpload}>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) =>
                            void changeCategoryBanner(
                              category.category_id,
                              event.target.files?.[0],
                            )
                          }
                        />{" "}
                        {t(
                          category.banner_url ? "Replace banner" : "Add banner",
                        )}
                      </label>
                    )}
                    {category.banner_url && canManageCategories && (
                      <button
                        type="button"
                        onClick={() =>
                          void removeCategoryBanner(category.category_id)
                        }
                      >
                        <T>Remove banner</T>
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {!categorySettings.length && (
                <div className={styles.emptyState}>
                  {categoryBrand ? (
                    <T>
                      No selected catalogue products belong to this ERP brand.
                      Add products from the filtered product list first.
                    </T>
                  ) : (
                    <T>
                      Save catalogue products first. Categories are loaded
                      dynamically from those products.
                    </T>
                  )}
                </div>
              )}
            </div>
            {canManageCategories && categorySettings.length > 0 && (
              <div className={styles.builderSaveBar}>
                <span>
                  <T>Order controls the preview sidebar and published PDF.</T>
                </span>
                <button
                  className={styles.primaryButton}
                  type="button"
                  onClick={() => void saveCategories()}
                  disabled={isSaving}
                >
                  <T>Save category presentation</T>
                </button>
              </div>
            )}
          </section>
        )}

        {selected && (
          <section
            className={`${styles.commercePanel} ${styles.catalogueProductBuilder}`}
          >
            <div className={styles.commercePanelHeader}>
              <div>
                <span>
                  <T>Catalogue builder</T>
                </span>
                <h3>
                  <T>Select and order products</T>
                </h3>
                <p>
                  <T>
                    Arrange products from top to bottom. Add section labels or
                    catalogue-specific descriptions where needed.
                  </T>
                </p>
              </div>
              <strong>
                {selectedProducts.length} <T>selected</T>
              </strong>
            </div>
            <div className={styles.productBuilderGrid}>
              <aside>
                <form
                  className={styles.compactSearch}
                  onSubmit={searchProducts}
                >
                  <input
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder={t("Search products")}
                  />
                  <button type="submit">
                    <T>Search</T>
                  </button>
                </form>
                <div className={styles.productPickerList}>
                  {availableProducts.map((product) => (
                    <button
                      type="button"
                      key={product.id}
                      onClick={() => addProduct(product)}
                      disabled={!canEdit}
                    >
                      <span>
                        <strong>
                          {product.display_name || product.erp_name}
                        </strong>
                        <small>
                          {product.sku} · {product.brand || t("Unbranded")}
                        </small>
                      </span>
                      <b>+</b>
                    </button>
                  ))}
                  {!availableProducts.length && (
                    <div className={styles.emptyState}>
                      <T>
                        Search for more products or remove one from the
                        catalogue.
                      </T>
                    </div>
                  )}
                </div>
              </aside>
              <div className={styles.selectedProductList}>
                {selectedProducts.map((item, index) => {
                  const product = selected.products.find(
                    (current) => current.product_id === item.product_id,
                  );
                  const productListItem = selectedProductDetails.get(
                    item.product_id,
                  );
                  return (
                    <article key={item.product_id}>
                      <div className={styles.orderControls}>
                        <strong>{index + 1}</strong>
                        <button
                          type="button"
                          disabled={!canEdit || index === 0}
                          onClick={() => moveProduct(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={
                            !canEdit || index === selectedProducts.length - 1
                          }
                          onClick={() => moveProduct(index, 1)}
                        >
                          ↓
                        </button>
                      </div>
                      <div className={styles.selectedProductContent}>
                        <div>
                          <strong>
                            {product?.name ||
                              productListItem?.display_name ||
                              productListItem?.erp_name ||
                              "Selected product"}
                          </strong>
                          <small>{product?.sku || productListItem?.sku}</small>
                        </div>
                        <div className={styles.selectedProductFields}>
                          <input
                            disabled={!canEdit}
                            value={item.section_title}
                            maxLength={180}
                            onChange={(event) =>
                              updateProduct(index, {
                                section_title: event.target.value,
                              })
                            }
                            placeholder={t("Section title (optional)")}
                          />
                          <textarea
                            disabled={!canEdit}
                            rows={2}
                            maxLength={12000}
                            value={item.override_description}
                            onChange={(event) =>
                              updateProduct(index, {
                                override_description: event.target.value,
                              })
                            }
                            placeholder={t(
                              "Catalogue-specific description (optional)",
                            )}
                          />
                        </div>
                        <label>
                          <input
                            type="checkbox"
                            disabled={!canEdit || !draft.show_prices}
                            checked={item.hide_price}
                            onChange={(event) =>
                              updateProduct(index, {
                                hide_price: event.target.checked,
                              })
                            }
                          />{" "}
                          <T>Hide this product’s price</T>
                        </label>
                        <div className={styles.catalogueVideoSettings}>
                          <label>
                            <input
                              type="checkbox"
                              disabled={!canEdit || !productListItem?.has_video}
                              checked={item.include_video}
                              onChange={(event) => {
                                updateProduct(index, {
                                  include_video: event.target.checked,
                                });
                                if (event.target.checked)
                                  void loadVideoOptions(item.product_id);
                              }}
                            />{" "}
                            <T>Include product video</T>
                          </label>
                          {item.include_video && productListItem?.has_video && (
                            <>
                              <label>
                                <span>
                                  <T>Selected video</T>
                                </span>
                                <select
                                  disabled={!canEdit}
                                  value={item.selected_video_id || ""}
                                  onFocus={() =>
                                    void loadVideoOptions(item.product_id)
                                  }
                                  onChange={(event) =>
                                    updateProduct(index, {
                                      selected_video_id:
                                        event.target.value || null,
                                    })
                                  }
                                >
                                  <option value="">
                                    <T>Featured video</T>
                                  </option>
                                  {(videoOptions[item.product_id] || []).map(
                                    (video) => (
                                      <option key={video.id} value={video.id}>
                                        {video.title_en ||
                                          video.title_th ||
                                          video.original_filename ||
                                          "Product video"}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>
                              <label>
                                <span>
                                  <T>Video display</T>
                                </span>
                                <select
                                  disabled={!canEdit}
                                  value={item.video_display_mode}
                                  onChange={(event) =>
                                    updateProduct(index, {
                                      video_display_mode: event.target
                                        .value as CatalogueProductInput["video_display_mode"],
                                    })
                                  }
                                >
                                  <option value="card_icon">
                                    <T>Card play icon</T>
                                  </option>
                                  <option value="product_detail">
                                    <T>Product details</T>
                                  </option>
                                  <option value="media_section">
                                    <T>Separate media section</T>
                                  </option>
                                </select>
                              </label>
                              <label>
                                <span>
                                  <T>Video thumbnail</T>
                                </span>
                                <select
                                  disabled={!canEdit}
                                  value={item.video_thumbnail_mode}
                                  onChange={(event) =>
                                    updateProduct(index, {
                                      video_thumbnail_mode: event.target
                                        .value as CatalogueProductInput["video_thumbnail_mode"],
                                    })
                                  }
                                >
                                  <option value="video_thumbnail">
                                    <T>Video thumbnail</T>
                                  </option>
                                  <option value="product_image">
                                    <T>Main product image</T>
                                  </option>
                                  <option value="placeholder">
                                    <T>Video placeholder</T>
                                  </option>
                                </select>
                              </label>
                              <input
                                disabled={!canEdit}
                                value={item.video_title_override}
                                maxLength={255}
                                onChange={(event) =>
                                  updateProduct(index, {
                                    video_title_override: event.target.value,
                                  })
                                }
                                placeholder={t(
                                  "Catalogue-specific video title (optional)",
                                )}
                              />
                              <textarea
                                disabled={!canEdit}
                                rows={2}
                                maxLength={12000}
                                value={item.video_description_override}
                                onChange={(event) =>
                                  updateProduct(index, {
                                    video_description_override:
                                      event.target.value,
                                  })
                                }
                                placeholder={t(
                                  "Catalogue-specific video description (optional)",
                                )}
                              />
                            </>
                          )}
                        </div>
                      </div>
                      {canEdit && (
                        <button
                          className={styles.removeProductButton}
                          type="button"
                          onClick={() =>
                            setSelectedProducts((current) =>
                              current.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            )
                          }
                        >
                          <T>Remove</T>
                        </button>
                      )}
                    </article>
                  );
                })}
                {!selectedProducts.length && (
                  <div className={styles.emptyState}>
                    <T>
                      Add products from the left to begin building this
                      catalogue.
                    </T>
                  </div>
                )}
              </div>
            </div>
            {(canEdit || canDelete) && (
              <div className={styles.builderSaveBar}>
                {canDelete && (
                  <button
                    className={`${styles.dangerButton} ${styles.catalogueDeleteButton}`}
                    type="button"
                    disabled={isSaving}
                    onClick={() => setIsDeleteConfirmOpen(true)}
                  >
                    <T>Delete catalogue</T>
                  </button>
                )}
                {canEdit && (
                  <>
                    <span>
                      <T>
                        Save after changing products, order, sections or
                        descriptions.
                      </T>
                    </span>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      disabled={isSaving}
                      onClick={() => void saveProducts()}
                    >
                      {t(isSaving ? "Saving..." : "Save product order")}
                    </button>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </>
    );
  }

  return (
    <div className={isReadOnlyPortal ? styles.salesCataloguePortal : undefined}>
      <section className={styles.commerceHero}>
        <div>
          <span>
            <T>Catalogue management</T>
          </span>
          <h2>
            <T>Catalogues</T>
          </h2>
          <p>
            <T>
              {isReadOnlyCustomer
                ? "Browse and open published catalogues."
                : isReadOnlySales
                  ? "Browse published catalogues and copy a customer link."
                : "Create, manage and publish product catalogues for your customers."}
            </T>
          </p>
        </div>
      </section>
      {!isReadOnlyPortal && <section className={styles.catalogueStatusSummary} aria-label={t("Catalogue status summary")}>
        {([
          ["draft", "Draft", "✎"],
          ["pending_review", "Pending Review", "◷"],
          ["approved", "Approved", "✓"],
          ["published", "Published", "▣"],
          ["archived", "Archived", "□"],
          ["in_progress", "In progress", "…"],
        ] as const).map(([status, label, icon]) => <button key={status} type="button" aria-pressed={catalogueStatus === status} onClick={() => applyCatalogueStatus(catalogueStatus === status ? "" : status)}>
          <span data-status={status}>{icon}</span><strong>{catalogues.filter((item) => status === "in_progress" ? ["draft", "wip"].includes(item.status) : item.status === status).length}</strong><small><T>{label}</T></small>
        </button>)}
      </section>}
      {!isReadOnlyPortal && <nav className={styles.catalogueLibraryTabs} aria-label={t("Catalogue views")}>
        <button type="button" data-active={catalogueStatus === "" && !["newest", "products_desc"].includes(catalogueSort)} onClick={() => { applyCatalogueStatus(""); setCatalogueSort("az"); setCataloguePage(1); }}><T>All Catalogues</T></button>
        <button type="button" data-active={catalogueStatus === "" && catalogueSort === "newest"} onClick={() => { applyCatalogueStatus(""); setCatalogueSort("newest"); setCataloguePage(1); }}><T>Recently Updated</T></button>
        <button type="button" data-active={catalogueStatus === "" && catalogueSort === "products_desc"} onClick={() => { applyCatalogueStatus(""); setCatalogueSort("products_desc"); setCataloguePage(1); }}><T>Most Products</T></button>
      </nav>}
      <div className={styles.catalogueLegacyMetrics} aria-hidden="true">
        <div className={styles.commerceHeroMetrics}>
          <button
            type="button"
            aria-pressed={catalogueStatus === ""}
            onClick={() => applyCatalogueStatus("")}
          >
            <strong>{catalogues.length}</strong>
            <span>
              <T>Catalogues</T>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={catalogueStatus === "published"}
            onClick={() => applyCatalogueStatus("published")}
          >
            <strong>
              {catalogues.filter((item) => item.status === "published").length}
            </strong>
            <span>
              <T>Published</T>
            </span>
          </button>
          <button
            type="button"
            aria-pressed={catalogueStatus === "in_progress"}
            onClick={() => applyCatalogueStatus("in_progress")}
          >
            <strong>
              {
                catalogues.filter((item) =>
                  ["draft", "wip"].includes(item.status),
                ).length
              }
            </strong>
            <span>
              <T>In progress</T>
            </span>
          </button>
        </div>
      </div>
      <form className={styles.catalogueFilters} onSubmit={filterCatalogues}>
        <input
          type="search"
          value={catalogueQuery}
          aria-label={t("Search catalogues")}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setCatalogueQuery(nextQuery);
            setCataloguePage(1);
          }}
          placeholder={t("Search catalogues")}
        />
        {!isReadOnlyPortal && <select
          aria-label={t("Catalogue status")}
          value={catalogueStatus}
          onChange={(event) => applyCatalogueStatus(event.target.value)}
        >
          <option value="">
            <T>All statuses</T>
          </option>
          <option value="in_progress">
            <T>In progress</T>
          </option>
          {(
            [
              "draft",
              "pending_review",
              "approved",
              "published",
              "wip",
              "archived",
            ] as CatalogueStatus[]
          ).map((status) => (
            <option key={status} value={status}>
              {t(statusLabel(status))}
            </option>
          ))}
        </select>}
        <select
          aria-label={t("Sort catalogues")}
          value={catalogueSort}
          onChange={(event) => {
            setCatalogueSort(event.target.value);
            setCataloguePage(1);
          }}
        >
          <option value="az">{t("Name: A–Z")}</option>
          <option value="za">{t("Name: Z–A")}</option>
          <option value="newest">{t("Recently updated")}</option>
          <option value="oldest">{t("Oldest updated")}</option>
          <option value="products_desc">{t("Most products")}</option>
          <option value="products_asc">{t("Fewest products")}</option>
        </select>
        <button className={styles.secondaryButton} type="submit">
          <T>Apply filters</T>
        </button>
        {canCreate && canEdit && (
          <button
            className={styles.generateCataloguesButton}
            type="button"
            disabled={isGenerating}
            onClick={() => setIsGenerateConfirmOpen(true)}
          >
            <T>Generate all ERP brands</T>
          </button>
        )}
      </form>
      {isGenerateConfirmOpen && (
        <div
          className={styles.catalogueDeleteBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isGenerating) {
              setIsGenerateConfirmOpen(false);
            }
          }}
        >
          <section
            className={`${styles.catalogueDeleteDialog} ${styles.catalogueGenerateDialog}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="catalogue-generate-title"
          >
            <div className={styles.catalogueGenerateIcon}>↻</div>
            <span>
              <T>ERP catalogue automation</T>
            </span>
            <h3 id="catalogue-generate-title">
              <T>Generate catalogues for every ERP brand?</T>
            </h3>
            <p>
              <T>
                One draft catalogue will be created for every ERP brand that has
                active products. Existing auto-generated catalogues will be
                refreshed instead of duplicated.
              </T>
            </p>
            <ul className={styles.catalogueGenerateDetails}>
              <li>
                <T>All current ERP products, images and barcodes</T>
              </li>
              <li>
                <T>Legacy category order when the brand and category match</T>
              </li>
              <li>
                <T>All synchronized ERP customer price levels</T>
              </li>
            </ul>
            <p>
              <T>
                Manually created catalogues are not changed. Auto-generated
                catalogues remain drafts until you review and publish them.
              </T>
            </p>
            <footer>
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setIsGenerateConfirmOpen(false)}
              >
                <T>Cancel</T>
              </button>
              <button
                className={styles.confirmGenerateButton}
                type="button"
                disabled={isGenerating}
                onClick={() => void generateAllBrandCatalogues()}
              >
                {t(
                  isGenerating
                    ? "Generating catalogues..."
                    : "Generate catalogues",
                )}
              </button>
            </footer>
          </section>
        </div>
      )}
      {error && (
        <div className={styles.userError} role="alert">
          <span>!</span>
          {error}
          <button type="button" onClick={() => setError("")}>
            <T>Dismiss</T>
          </button>
        </div>
      )}
      <div className={styles.catalogueCardGrid}>
        {visibleCatalogues.map((catalogue) => {
          const availableCardLinks = catalogueCardShareLinks(catalogue, cardLinks[catalogue.id] || []);
          const linksExpanded = expandedCardLinks.includes(catalogue.id);
          const cardLinksId = `catalogue-links-${catalogue.id}`;
          const logoUrl = catalogue.brand_logo_url
            ? `${catalogue.brand_logo_url.startsWith("http") ? "" : API_ORIGIN}${catalogue.brand_logo_url}`
            : null;
          return (
          <article key={catalogue.id} className={styles.catalogueCard}>
            <div className={styles.catalogueCover}>
              <div className={styles.catalogueCoverIdentity}>
                <span>{catalogue.brand?.slice(0, 2).toUpperCase() || "GM"}</span>
                <small>{catalogue.catalogue_type === "booklet" ? t("Booklet") : t("Catalogue")}</small>
              </div>
              <div className={styles.catalogueCoverPreview}>
                {logoUrl ? (
                  <img src={logoUrl} alt={`${catalogue.brand || catalogue.title} logo`} />
                ) : (
                  <div className={styles.catalogueCoverFallback}>
                    <span>{catalogue.brand || "GMS"}</span>
                    <strong>{catalogue.catalogue_type === "booklet" ? t("Digital Booklet") : t("Product Catalogue")}</strong>
                    <i>{catalogue.catalogue_type === "booklet" ? "BOOKLET" : "CATALOGUE"}</i>
                  </div>
                )}
                {canUploadCover && (
                  <label className={styles.catalogueLogoUpload}>
                    {uploadingCardLogo === catalogue.id
                      ? t("Uploading...")
                      : logoUrl ? t("Change logo") : t("Add logo")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      aria-label={`${logoUrl ? t("Change logo for") : t("Add logo for")} ${catalogue.brand || catalogue.title}`}
                      disabled={uploadingCardLogo === catalogue.id}
                      onChange={async (event) => {
                        const input = event.currentTarget;
                        const file = input.files?.[0];
                        if (!file) return;
                        setUploadingCardLogo(catalogue.id);
                        setError("");
                        try {
                          const asset = await uploadCatalogueCoverAsset(
                            catalogue.id,
                            "brand_logo",
                            file,
                            `${catalogue.brand || catalogue.title} logo`,
                          );
                          setCatalogues((current) => current.map((item) =>
                            item.id === catalogue.id
                              ? { ...item, brand_logo_url: asset.preview_url }
                              : item,
                          ));
                        } catch (uploadError) {
                          setError(uploadError instanceof Error ? uploadError.message : t("Could not upload the brand logo."));
                        } finally {
                          setUploadingCardLogo(null);
                          input.value = "";
                        }
                      }}
                    />
                  </label>
                )}
              </div>
              {canViewShareLinks && (
                <div
                  className={styles.catalogueQuickLinks}
                  data-expanded={linksExpanded}
                >
                  <button
                    type="button"
                    className={styles.catalogueLinksDisclosure}
                    aria-expanded={linksExpanded}
                    aria-controls={cardLinksId}
                    aria-label={`Catalogue links for ${catalogue.title}`}
                    disabled={!availableCardLinks.length}
                    onClick={() =>
                      setExpandedCardLinks((current) =>
                        current.includes(catalogue.id)
                          ? current.filter((id) => id !== catalogue.id)
                          : [...current, catalogue.id],
                      )
                    }
                  >
                    <span className={styles.catalogueLinksDisclosureLabel}>
                      <T>Catalogue links</T>
                      <small>{availableCardLinks.length}</small>
                    </span>
                    <svg
                      className={styles.catalogueLinksChevron}
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                    >
                      <path d="m5 7.5 5 5 5-5" />
                    </svg>
                  </button>
                  {linksExpanded && (
                    <div className={styles.catalogueLinkList} id={cardLinksId}>
                      {availableCardLinks.map((link) => {
                        const key =
                          link.id || `${catalogue.id}:${link.audience_code}`;
                        const cardAudienceLabel =
                          link.audience_code.toLowerCase() === "normal"
                            ? "Price"
                            : catalogueLinkLabel(link.audience_name);
                        const unavailable =
                          catalogue.version < 1 ||
                          ["revoked", "expired"].includes(link.status);
                        return (
                          <button
                            type="button"
                            key={link.audience_type_id}
                            data-style={link.button_style_key}
                            disabled={
                              unavailable ||
                              Boolean(linkAction) ||
                              (link.status === "not_generated" &&
                                !canCreateShareLinks &&
                                !canCopyShareLinks) ||
                              (Boolean(link.id) && !canCopyShareLinks)
                            }
                            title={
                              unavailable
                                ? t(
                                    "Publish at least one version or activate this catalogue link first.",
                                  )
                                : link.status === "not_generated"
                                  ? t(
                                      "Create and copy this audience link for {{priceList}}",
                                      {
                                        priceList:
                                          link.price_list_name || t("No Price"),
                                      },
                                    )
                                  : t(
                                      "Copy {{audience}} link using {{priceList}}",
                                      {
                                        audience: cardAudienceLabel,
                                        priceList:
                                          link.price_list_name || t("No Price"),
                                      },
                                    )
                            }
                            onClick={() =>
                              link.id
                                ? void copyShareLink(link)
                                : void createAndCopy(catalogue, link)
                            }
                          >
                            <span>{copiedLink === key ? "✓" : "↗"}</span>
                            {copiedLink === key
                              ? t("Copied")
                              : catalogue.catalogue_type === "booklet" &&
                                  !catalogue.show_prices
                                ? t("Catalog")
                                : t(cardAudienceLabel)}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className={styles.catalogueCardBody}>
              <small>
                {catalogue.brand || t("All brands")} · {catalogue.audience}
              </small>
              <div className={styles.catalogueCardTitleRow}>
                <h3>{isReadOnlyPortal ? <Link href={`/catalogues/${catalogue.id}/preview${availableCardLinks[0]?.public_url ? `?share=${encodeURIComponent(availableCardLinks[0].public_url)}` : ""}`}>{catalogue.title}</Link> : catalogue.title}</h3>
                <b className={styles.catalogueStatus} data-status={catalogue.status}>{t(statusLabel(catalogue.status))}</b>
              </div>
              <p>
                {catalogue.description || t("No catalogue description yet.")}
              </p>
              <div className={styles.catalogueStats}>
                <span>
                  <strong>{catalogue.product_count}</strong> <T>products</T>
                </span>
                <span>
                  <strong>
                    <T>v</T>
                    {catalogue.version}
                  </strong>{" "}
                  <T>version</T>
                </span>
                {!isReadOnlyPortal && <span>
                  <strong>
                    {catalogue.show_prices
                      ? catalogue.price_list_name || catalogue.currency
                      : t("Hidden")}
                  </strong>{" "}
                  <T>pricing</T>
                </span>}
              </div>
            </div>
            <footer>
              <span>
                {t("Updated {{date}}", {
                  date: formatDate(catalogue.updated_at, locale),
                })}
              </span>
              <div className={styles.catalogueCardActions}>
                {onlineLinks[catalogue.id] && (
                  <a
                    className={styles.cataloguePreviewButton}
                    href={onlineLinks[catalogue.id]}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <T>View online</T>
                  </a>
                )}
                {canEdit && (
                  <Link
                    className={styles.catalogueStudioButton}
                    href={
                      catalogue.studio_editor_href ??
                      `/catalogues/${catalogue.id}/studio`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("Open Studio")}
                  >
                    <span className={styles.catalogueStudioIcon} aria-hidden="true">✦</span>
                    <strong><T>Open Studio</T></strong>
                    <span className={styles.catalogueStudioLaunch} aria-hidden="true">↗</span>
                  </Link>
                )}
                {canPreview && canViewStudio && catalogue.studio_preview_href ? (
                  <Link
                    className={styles.cataloguePreviewButton}
                    href={catalogue.studio_preview_href}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <T>Preview</T>
                  </Link>
                ) : canPreview ? (
                  <button
                    className={styles.cataloguePreviewButton}
                    type="button"
                    onClick={() =>
                      router.push(`/catalogues/${catalogue.id}/preview`)
                    }
                  >
                    <T>Preview</T>
                  </button>
                ) : null}
                {!catalogue.studio_design_id && (canEdit || canDelete) && (
                  <button
                    type="button"
                    onClick={() => void openCatalogue(catalogue.id)}
                  >
                    <T>Edit</T>
                  </button>
                )}
                {!isReadOnlyPortal && <div className={styles.catalogueMoreMenu}>
                  <button type="button" aria-label={t("More catalogue actions")} aria-expanded={openCardMenu === catalogue.id} onClick={() => setOpenCardMenu((current) => current === catalogue.id ? null : catalogue.id)}>•••</button>
                  {openCardMenu === catalogue.id && (
                    <div role="menu">
                      {(canEdit || canDelete) && <button type="button" role="menuitem" onClick={() => { setOpenCardMenu(null); void openCatalogue(catalogue.id); }}><T>Catalogue details</T></button>}
                    </div>
                  )}
                </div>}
              </div>
            </footer>
          </article>
        );})}
        {!catalogues.length && (
          <div className={`${styles.emptyState} ${styles.commercePanel}`}>
            <T>No catalogues match the selected filters.</T>
          </div>
        )}
      </div>
      {cataloguePages > 1 && (
        <div className={styles.pagination}>
          <button
            type="button"
            disabled={cataloguePage === 1}
            onClick={() => setCataloguePage((page) => Math.max(1, page - 1))}
          >
            <T>Previous</T>
          </button>
          <span>
            {t("Page {{page}} of {{pages}}", {
              page: cataloguePage,
              pages: cataloguePages,
            })}
          </span>
          <button
            type="button"
            disabled={cataloguePage === cataloguePages}
            onClick={() =>
              setCataloguePage((page) => Math.min(cataloguePages, page + 1))
            }
          >
            <T>Next</T>
          </button>
        </div>
      )}
    </div>
  );
}
