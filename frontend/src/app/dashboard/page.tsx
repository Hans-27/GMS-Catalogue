"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ApplicationLogo } from "@/components/application-logo";
import { type DashboardView } from "@/lib/routes";
import {
  allowedNavigation,
  canAccess,
  canAccessAny,
  isSalesAdmin,
  isSuperAdmin,
  isCataloguePortalUser,
  isCustomerUser,
} from "@/lib/access";
import {
  API_ORIGIN,
  ApiError,
  changeProductStatus,
  createCategory,
  createProduct,
  createProductVideo,
  deleteProductVideo,
  deleteProductImage,
  getActivity,
  getCatalogueStats,
  getCategories,
  getCurrentUser,
  getDashboardOverview,
  getDashboardSyncStatus,
  getMyCataloguePriceMappings,
  getErpProductImages,
  getProduct,
  getProducts,
  logout,
  importErpProductImage,
  performWorkflowAction,
  runProductSync,
  setPrimaryImage,
  updateProductContent,
  updateProductMasterData,
  uploadProductImage,
  updateProductVideo,
  setFeaturedProductVideo,
  updateCategory,
  updateBrandStatus,
  uploadProductVideoThumbnail,
  replaceProductVideo,
  uploadProductVideoCaption,
  type ActivityItem,
  type AuthenticatedUser,
  type CatalogueContentPayload,
  type CatalogueStats,
  type DashboardOverview,
  type DashboardSyncStatus,
  type GlobalSearchItem,
  type Category,
  type ErpProductImageCandidate,
  type UserCataloguePriceMapping,
  type ProductDetail,
  type ProductCreatePayload,
  type ProductListItem,
  type ProductMasterPayload,
  type ProductVideo,
  type ProductPage,
  type WorkflowStatus,
} from "@/lib/api";
import {
  DEMO_ENVIRONMENT_LABEL,
  DEMO_REVIEW_MESSAGE,
  DEMO_VERSION,
} from "@/lib/demo-config";
import { LanguageSwitcher, T, useLanguage } from "@/lib/i18n";
import styles from "./dashboard.module.css";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardOverviewPanel } from "./dashboard-overview";
import { CategoryManagement } from "./category-management";
import { EntityStatusControl } from "./entity-status-control";
import { GlobalSearch } from "./global-search";
import {
  ProductLifecycleBadge,
  ProductStatusDialog,
} from "./product-lifecycle";
import { formatApiDate, parseApiDate } from "@/lib/date-time";

// Administration modules are large, independent workspaces. Loading them only
// when selected keeps the overview/product bundle small and responsive.
const UserManagement = dynamic(() =>
  import("./user-management").then((module) => module.UserManagement),
);
const OrganizationManagement = dynamic(() =>
  import("./organization-management").then(
    (module) => module.OrganizationManagement,
  ),
);
const PriceManagement = dynamic(() =>
  import("./price-management").then((module) => module.PriceManagement),
);
const CatalogueManagement = dynamic(() =>
  import("@/features/catalogues/catalogue-management").then(
    (module) => module.CatalogueManagement,
  ),
);
const FeedbackManagement = dynamic(() =>
  import("./feedback-management").then((module) => module.FeedbackManagement),
);
const ProductVideoPlayer = dynamic(() =>
  import("@/components/product-video-player").then(
    (module) => module.ProductVideoPlayer,
  ),
);

type View = DashboardView;

const CUSTOMER_PRICE_LABELS: Record<string, string> = {
  normal: "Normal",
  vip: "VIP BKK",
  big_customer_vip: "Big Customer",
  srp: "Retail",
  sp5: "Dealer",
  sp6: "Wholesale",
  vvip: "VVIP",
  vip_province: "VIP Province",
  no_price: "No Price",
};

function customerPriceLabel(
  value: string | null | undefined,
  audienceCode?: string,
) {
  if (audienceCode && CUSTOMER_PRICE_LABELS[audienceCode]) {
    return CUSTOMER_PRICE_LABELS[audienceCode];
  }
  return (
    value
      ?.replace(/^(?:SP\d+|SRP)\s*(?:[·-])?\s*/i, "")
      .trim() || "Customer price"
  );
}

const EMPTY_STATS: CatalogueStats = {
  total_products: 0,
  active_products: 0,
  inactive_products: null,
  products_missing_from_source: null,
  products_with_stale_stock: null,
  products_with_stale_prices: null,
  current_sync_status: null,
  last_successful_sync: null,
  last_failed_sync: null,
  draft: 0,
  in_review: 0,
  approved: 0,
  published: 0,
  hidden: 0,
  missing_images: 0,
  missing_descriptions: 0,
  missing_categories: 0,
  ready_products: 0,
  completion_rate: 0,
};

const EMPTY_PAGE: ProductPage = {
  items: [],
  brands: [],
  total: 0,
  page: 1,
  page_size: 20,
  pages: 1,
};

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
};

const PRODUCT_IMAGE_MAX_SIZE_MB = 50;

function formatDate(value: string | null, locale = "en-GB") {
  if (!value) return "Not yet";
  return formatApiDate(value, locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: string, locale = "en-GB") {
  return formatApiDate(value, locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isStaleSynchronization(value: string | null) {
  return !value || Date.now() - parseApiDate(value).getTime() >= 6 * 60 * 1000;
}

function formatPrice(value: string | null, currency = "THB") {
  if (!value) return "—";
  return new Intl.NumberFormat("en-TH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function imageUrl(path: string | null) {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API_ORIGIN}${path}`;
}

function humanizeAction(action: string) {
  return action
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function productDisplayName(product: {
  erp_name: string;
  display_name: string;
}) {
  return product.display_name || product.erp_name;
}

function productLifecycleSource(product: ProductListItem): string {
  return product.lifecycle_status_source === "erp_discontinued"
      ? "ERP marked inactive"
      : product.lifecycle_status_source === "missing_from_erp"
        ? "Missing from ERP"
        : product.lifecycle_status_source === "manual"
          ? "Changed manually"
          : "ERP active";
}

const ERP_DETAIL_LABELS: Record<string, string> = {
  model: "Model / POS name",
  dimensions: "Size (W × L × H), as recorded in ERP",
  gross_weight: "Gross weight, as recorded in ERP",
  net_weight: "Net weight, as recorded in ERP",
  pack_size: "Pack size",
  warranty: "Warranty",
  remark: "ERP remark",
  how_to_use: "How to use",
};

function StatusBadge({ status }: { status: WorkflowStatus }) {
  const { t } = useLanguage();
  return (
    <span className={`${styles.status} ${styles[`status_${status}`]}`}>
      <i />
      {t(STATUS_LABELS[status])}
    </span>
  );
}

function ProductThumb({ product }: { product: ProductListItem }) {
  const { t } = useLanguage();
  const sources = (product.image_urls?.length
    ? product.image_urls
    : product.primary_image_url
      ? [product.primary_image_url]
      : []
  ).map(imageUrl).filter((value): value is string => Boolean(value));
  const source = sources[0] || null;
  if (source) {
    return (
      <div
        className={styles.productThumb}
        title={t("{{count}} product images", { count: sources.length })}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={source} alt="" />
        {sources.length > 1 && (
          <span className={styles.productImageCount}>+{sources.length - 1}</span>
        )}
      </div>
    );
  }
  return (
    <div className={`${styles.productThumb} ${styles.productPlaceholder}`}>
      {productDisplayName(product).slice(0, 1)}
    </div>
  );
}

const EMPTY_PRODUCT_DRAFT: ProductCreatePayload = {
  sku: "",
  name: "",
  brand: null,
  barcode: null,
  unit: "piece",
  erp_category: null,
  price: null,
  stock_quantity: 0,
  short_description: "",
  long_description: "",
  category_ids: [],
};

function ProductCreateModal({
  categories,
  canManageVideos,
  onClose,
  onCreated,
}: {
  categories: Category[];
  canManageVideos: boolean;
  onClose: () => void;
  onCreated: (product: ProductDetail, message?: string) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<ProductCreatePayload>(EMPTY_PRODUCT_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageAltText, setImageAltText] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [newVideoSource, setNewVideoSource] = useState<"upload" | "external">(
    "upload",
  );
  const [newVideoFile, setNewVideoFile] = useState<File | null>(null);
  const [newVideoUrl, setNewVideoUrl] = useState("");
  const [newVideoTitle, setNewVideoTitle] = useState("");
  const [newVideoProgress, setNewVideoProgress] = useState<number | null>(null);
  const canSubmit = Boolean(
    draft.sku.trim() && draft.name.trim() && draft.unit.trim(),
  );

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  function selectProductImage(file: File | undefined) {
    setLocalError("");
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setImageFile(null);
      setImagePreview("");
      setLocalError("Choose a JPEG, PNG or WebP product image.");
      return;
    }
    if (file.size > PRODUCT_IMAGE_MAX_SIZE_MB * 1024 * 1024) {
      setImageFile(null);
      setImagePreview("");
      setLocalError(
        t("The product image must be {{count}} MB or smaller.", {
          count: PRODUCT_IMAGE_MAX_SIZE_MB,
        }),
      );
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      setLocalError("SKU, product name and unit are required.");
      return;
    }

    setIsSaving(true);
    setLocalError("");
    try {
      let product = await createProduct({
        ...draft,
        sku: draft.sku.trim(),
        name: draft.name.trim(),
        brand: draft.brand?.trim() || null,
        barcode: draft.barcode?.trim() || null,
        unit: draft.unit.trim(),
        erp_category: draft.erp_category?.trim() || null,
        price: draft.price || null,
        short_description: draft.short_description.trim(),
        long_description: draft.long_description.trim(),
      });
      if (imageFile) {
        try {
          await uploadProductImage(
            product.id,
            imageFile,
            imageAltText.trim() || draft.name.trim(),
          );
          product = await getProduct(product.id);
        } catch (imageError) {
          const reason =
            imageError instanceof ApiError
              ? imageError.message
              : "the image could not be uploaded";
          await onCreated(
            product,
            `Product created, but ${reason}. Open Images to try again.`,
          );
          return;
        }
      }
      if (canManageVideos && (newVideoFile || newVideoUrl.trim())) {
        const upload = createProductVideo(
          product.id,
          {
            source_type: newVideoSource,
            file: newVideoFile,
            external_url: newVideoUrl.trim(),
            title_en: newVideoTitle.trim() || draft.name.trim(),
            is_featured: true,
            is_active: true,
            show_in_catalogue: true,
            show_in_public_catalogue: false,
            show_controls: true,
            allow_download: false,
            autoplay: false,
            muted: false,
            loop: false,
          },
          setNewVideoProgress,
        );
        try {
          await upload.promise;
          product = await getProduct(product.id);
        } catch (videoError) {
          const reason =
            videoError instanceof ApiError
              ? videoError.message
              : "the video could not be uploaded";
          await onCreated(
            product,
            `Product created, but ${reason}. Open Product videos to try again.`,
          );
          return;
        } finally {
          setNewVideoProgress(null);
        }
      }
      await onCreated(
        product,
        imageFile
          ? "Product and primary image created successfully."
          : undefined,
      );
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not create the product.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.editorBackdrop} role="presentation">
      <aside
        className={`${styles.editor} ${styles.createProductDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-product-title"
      >
        <div className={styles.editorHeader}>
          <div>
            <span>{t("Catalogue administrator")}</span>
            <h2 id="new-product-title">{t("Add a new product")}</h2>
            <p>
              {t(
                "Create the product record, then add images and publishing details.",
              )}
            </p>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            onClick={onClose}
            aria-label={t("Close new product form")}
            disabled={isSaving}
          >
            ×
          </button>
        </div>

        {localError && (
          <div className={styles.inlineError} role="alert">
            {localError}
          </div>
        )}

        <form className={styles.createProductForm} onSubmit={submitProduct}>
          <div className={styles.createProductBody}>
            <section className={styles.formSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>{t("Product identity")}</span>
                  <h3>{t("Source information")}</h3>
                </div>
                <small>{t("Required fields are marked *")}</small>
              </div>
              <div className={styles.createProductGrid}>
                <label className={styles.inputGroup}>
                  <span>
                    <T>SKU *</T>
                  </span>
                  <input
                    value={draft.sku}
                    maxLength={80}
                    required
                    autoFocus
                    placeholder="e.g. GMS-BV-015"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        sku: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span>{t("Product name")} *</span>
                  <input
                    value={draft.name}
                    maxLength={255}
                    required
                    placeholder={t("Customer-facing product name")}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span>{t("Brand")}</span>
                  <input
                    value={draft.brand ?? ""}
                    maxLength={120}
                    placeholder={t("Optional")}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        brand: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span>{t("Barcode")}</span>
                  <input
                    value={draft.barcode ?? ""}
                    maxLength={80}
                    placeholder={t("Optional")}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        barcode: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span>{t("Unit")} *</span>
                  <input
                    value={draft.unit}
                    maxLength={30}
                    required
                    placeholder="piece"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        unit: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span>{t("ERP category")}</span>
                  <input
                    value={draft.erp_category ?? ""}
                    maxLength={120}
                    placeholder={t("Optional")}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        erp_category: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span>{t("Price (THB)")}</span>
                  <input
                    type="number"
                    value={draft.price ?? ""}
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        price: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.inputGroup}>
                  <span>{t("Quantity")}</span>
                  <input
                    type="number"
                    value={draft.stock_quantity}
                    min="0"
                    step="1"
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        stock_quantity: Math.max(
                          0,
                          Number.parseInt(event.target.value || "0", 10),
                        ),
                      }))
                    }
                  />
                </label>
              </div>
            </section>

            {canManageVideos && (
              <section className={styles.formSection}>
                <div className={styles.sectionHeading}>
                  <div>
                    <span>{t("Product media")}</span>
                    <h3>{t("Product video")}</h3>
                  </div>
                  <small>{t("Optional · MP4/WebM or approved link")}</small>
                </div>
                <div className={styles.videoUploader}>
                  <div className={styles.videoSourceTabs}>
                    <button
                      type="button"
                      data-active={newVideoSource === "upload"}
                      onClick={() => setNewVideoSource("upload")}
                    >
                      {t("Upload video")}
                    </button>
                    <button
                      type="button"
                      data-active={newVideoSource === "external"}
                      onClick={() => setNewVideoSource("external")}
                    >
                      {t("External link")}
                    </button>
                  </div>
                  {newVideoSource === "upload" ? (
                    <label
                      className={styles.videoDrop}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        setNewVideoFile(event.dataTransfer.files?.[0] || null);
                      }}
                    >
                      <span>
                        {t("Drag and drop or browse for an MP4 or WebM file")}
                      </span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,.mp4,.webm"
                        disabled={isSaving}
                        onChange={(event) =>
                          setNewVideoFile(event.target.files?.[0] || null)
                        }
                      />
                      {newVideoFile && (
                        <small>
                          {newVideoFile.name} ·{" "}
                          {(newVideoFile.size / 1024 / 1024).toFixed(1)}{" "}
                          <T>MB</T>
                        </small>
                      )}
                    </label>
                  ) : (
                    <label className={styles.inputGroup}>
                      <span>{t("YouTube or Vimeo URL")}</span>
                      <input
                        type="url"
                        value={newVideoUrl}
                        onChange={(event) => setNewVideoUrl(event.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </label>
                  )}
                  <label className={styles.inputGroup}>
                    <span>{t("Video title")}</span>
                    <input
                      value={newVideoTitle}
                      maxLength={255}
                      onChange={(event) => setNewVideoTitle(event.target.value)}
                      placeholder={draft.name}
                    />
                  </label>
                  {newVideoProgress !== null && (
                    <div className={styles.uploadProgress}>
                      <span style={{ width: `${newVideoProgress}%` }} />
                      <strong>{newVideoProgress}%</strong>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>{t("Product media")}</span>
                  <h3>{t("Main product image")}</h3>
                </div>
                <small>
                  {t("JPEG, PNG or WebP · maximum {{count}} MB", {
                    count: PRODUCT_IMAGE_MAX_SIZE_MB,
                  })}
                </small>
              </div>
              <div className={styles.createProductMedia}>
                <div className={styles.createProductImagePreview}>
                  {imagePreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imagePreview} alt="Selected product preview" />
                  ) : (
                    <div>
                      <strong>{t("No image selected")}</strong>
                      <span>
                        {t("The first image becomes the primary image.")}
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <label className={styles.inputGroup}>
                    <span>{t("Select product image")}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={isSaving}
                      onChange={(event) =>
                        selectProductImage(event.target.files?.[0])
                      }
                    />
                  </label>
                  <label className={styles.inputGroup}>
                    <span>{t("Image description")}</span>
                    <input
                      type="text"
                      value={imageAltText}
                      maxLength={255}
                      disabled={isSaving}
                      placeholder={
                        draft.name.trim() || t("Describe the product image")
                      }
                      onChange={(event) => setImageAltText(event.target.value)}
                    />
                    <small>
                      {t("Used as accessible alt text in the catalogue.")}
                    </small>
                  </label>
                </div>
              </div>
            </section>

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>{t("Catalogue copy")}</span>
                  <h3>{t("Descriptions")}</h3>
                </div>
              </div>
              <label className={styles.inputGroup}>
                <span>{t("Short description")}</span>
                <textarea
                  rows={3}
                  maxLength={320}
                  value={draft.short_description}
                  placeholder={t("A concise summary for product lists.")}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      short_description: event.target.value,
                    }))
                  }
                />
                <small>{draft.short_description.length}/320</small>
              </label>
              <label className={styles.inputGroup}>
                <span>{t("Long description")}</span>
                <textarea
                  rows={6}
                  maxLength={12000}
                  value={draft.long_description}
                  placeholder={t(
                    "Detailed product information for the catalogue.",
                  )}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      long_description: event.target.value,
                    }))
                  }
                />
              </label>
            </section>

            <section className={styles.formSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>{t("Organisation")}</span>
                  <h3>{t("Categories")}</h3>
                </div>
                <small>{t("Select all that apply")}</small>
              </div>
              <div className={styles.categoryPicker}>
                {categories.map((category) => (
                  <label key={category.id}>
                    <input
                      type="checkbox"
                      checked={draft.category_ids.includes(category.id)}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          category_ids: event.target.checked
                            ? [...current.category_ids, category.id]
                            : current.category_ids.filter(
                                (categoryId) => categoryId !== category.id,
                              ),
                        }))
                      }
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
                {!categories.length && (
                  <p className={styles.mutedHelp}>
                    <T>
                      No active categories are available. You can assign one
                      later.
                    </T>
                  </p>
                )}
              </div>
            </section>
          </div>

          <div className={styles.editorFooter}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={onClose}
              disabled={isSaving}
            >
              {t("Cancel")}
            </button>
            <button
              className={styles.primaryButton}
              type="submit"
              disabled={isSaving || !canSubmit}
            >
              {isSaving ? t("Creating product...") : t("Create product")}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function ProductEditor({
  product,
  categories,
  canApprove,
  canEditCatalogue,
  canEditMasterData,
  canChangeStatus,
  canViewVideos,
  canManageVideos,
  canDeleteVideos,
  canPublishVideos,
  onClose,
  onUpdated,
}: {
  product: ProductDetail;
  categories: Category[];
  canApprove: boolean;
  canEditCatalogue: boolean;
  canEditMasterData: boolean;
  canChangeStatus: boolean;
  canViewVideos: boolean;
  canManageVideos: boolean;
  canDeleteVideos: boolean;
  canPublishVideos: boolean;
  onClose: () => void;
  onUpdated: (product: ProductDetail, message: string) => Promise<void>;
}) {
  const { locale, t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<CatalogueContentPayload>({
    display_name: product.display_name || product.erp_name,
    short_description: product.short_description,
    long_description: product.long_description,
    seo_title: product.seo_title,
    seo_description: product.seo_description,
    visibility: product.visibility,
    is_featured: product.is_featured,
    category_ids: product.categories.map((category) => category.id),
  });
  const [masterDraft, setMasterDraft] = useState<ProductMasterPayload>({
    erp_name: product.erp_name,
    brand: product.brand,
    barcode: product.barcode,
    erp_category: product.erp_category,
    price: product.price,
    stock_quantity: product.stock_quantity,
  });
  const [altText, setAltText] = useState("");
  const [erpImages, setErpImages] = useState<ErpProductImageCandidate[] | null>(
    null,
  );
  const [selectedErpImage, setSelectedErpImage] = useState<number | null>(null);
  const [makeErpImagePrimary, setMakeErpImagePrimary] = useState(true);
  const [isLoadingErpImages, setIsLoadingErpImages] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const [statusDialog, setStatusDialog] = useState<
    "inactive" | "active" | null
  >(null);
  const [inactiveReason, setInactiveReason] = useState("discontinued");
  const [statusNote, setStatusNote] = useState("");
  const videoFileRef = useRef<HTMLInputElement>(null);
  const quickVideoInputRef = useRef<HTMLInputElement>(null);
  const videoCancelRef = useRef<(() => void) | null>(null);
  const [videoSource, setVideoSource] = useState<"upload" | "external">(
    "upload",
  );
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitleEn, setVideoTitleEn] = useState("");
  const [videoTitleTh, setVideoTitleTh] = useState("");
  const [videoDescription, setVideoDescription] = useState("");
  const [videoAltText, setVideoAltText] = useState("");
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [showVideoPublicly, setShowVideoPublicly] = useState(false);
  const contentIsValid = Boolean(draft.display_name.trim());
  const contentIsDirty =
    draft.display_name !== (product.display_name || product.erp_name) ||
    draft.short_description !== product.short_description ||
    draft.long_description !== product.long_description ||
    draft.seo_title !== product.seo_title ||
    draft.seo_description !== product.seo_description ||
    draft.is_featured !== product.is_featured ||
    draft.category_ids.length !== product.categories.length ||
    draft.category_ids.some(
      (categoryId) =>
        !product.categories.some((category) => category.id === categoryId),
    );

  const workflowAction = useMemo(() => {
    if (product.workflow_status === "draft" && canEditCatalogue)
      return "submit";
    if (product.workflow_status === "in_review" && canApprove) return "approve";
    if (product.workflow_status === "approved" && canApprove) return "publish";
    if (product.workflow_status === "published" && canApprove)
      return "unpublish";
    return null;
  }, [canApprove, canEditCatalogue, product.workflow_status]);

  function contentPayload(): CatalogueContentPayload {
    return {
      ...draft,
      display_name: draft.display_name.trim(),
      visibility: product.workflow_status === "published" ? "public" : "hidden",
    };
  }

  async function saveContent() {
    if (!canEditCatalogue) return;
    if (!contentIsValid) {
      setLocalError("Product name is required.");
      return;
    }
    setIsSaving(true);
    setLocalError("");
    try {
      const updated = await updateProductContent(product.id, contentPayload());
      await onUpdated(updated, "Catalogue content saved.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not save the product.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveMasterData() {
    if (!canEditMasterData) return;
    setIsSaving(true);
    setLocalError("");
    try {
      const updated = await updateProductMasterData(product.id, {
        ...masterDraft,
        brand: masterDraft.brand || null,
        barcode: masterDraft.barcode || null,
        erp_category: masterDraft.erp_category || null,
        price: masterDraft.price || null,
      });
      await onUpdated(updated, "Product source data saved.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not save the source data.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function moveWorkflow() {
    if (!workflowAction) return;
    if (canEditCatalogue && !contentIsValid) {
      setLocalError("Add a product name before continuing.");
      return;
    }
    setIsSaving(true);
    setLocalError("");
    try {
      if (canEditCatalogue && contentIsDirty) {
        const saved = await updateProductContent(product.id, contentPayload());
        if (product.workflow_status !== "draft") {
          await onUpdated(
            saved,
            "Changes saved as a draft. Submit the updated product for review.",
          );
          return;
        }
      }
      const updated = await performWorkflowAction(product.id, workflowAction);
      const messages = {
        submit: "Product submitted for review.",
        approve: "Product approved.",
        publish: "Product published.",
        unpublish: "Product returned to draft.",
      };
      await onUpdated(updated, messages[workflowAction]);
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not update the workflow.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadImage(file: File) {
    if (!canEditCatalogue) return;
    setIsSaving(true);
    setLocalError("");
    try {
      await uploadProductImage(product.id, file, altText);
      const updated = await getProduct(product.id);
      setAltText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await onUpdated(updated, "Product image uploaded.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not upload the image.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function loadErpImages() {
    setIsLoadingErpImages(true);
    setLocalError("");
    try {
      const candidates = await getErpProductImages(product.id);
      setErpImages(candidates);
      setSelectedErpImage(
        candidates.find((candidate) => candidate.supported)?.slot ?? null,
      );
      setMakeErpImagePrimary(!product.images.length);
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? t(error.message)
          : t("Could not load images from ERP."),
      );
    } finally {
      setIsLoadingErpImages(false);
    }
  }

  async function saveErpImage() {
    if (selectedErpImage === null) return;
    setIsSaving(true);
    setLocalError("");
    try {
      await importErpProductImage(product.id, selectedErpImage, {
        alt_text:
          altText.trim() ||
          t("{{product}} product image from ERP", {
            product: productDisplayName(product),
          }),
        make_primary: makeErpImagePrimary,
      });
      const updated = await getProduct(product.id);
      setAltText("");
      await onUpdated(updated, t("Selected ERP image saved."));
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? t(error.message)
          : t("Could not save the ERP image."),
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadQuickVideo(file: File) {
    if (!canManageVideos) return;
    setIsSaving(true);
    setLocalError("");
    setVideoProgress(0);
    const upload = createProductVideo(
      product.id,
      {
        source_type: "upload",
        file,
        external_url: "",
        title_en: productDisplayName(product),
        title_th: "",
        description: "",
        alt_text: `Product video for ${productDisplayName(product)}`,
        is_featured: true,
        is_active: true,
        show_in_catalogue: true,
        show_in_public_catalogue: false,
        show_controls: true,
        allow_download: false,
        autoplay: false,
        muted: false,
        loop: false,
      },
      setVideoProgress,
    );
    videoCancelRef.current = upload.cancel;
    try {
      await upload.promise;
      if (quickVideoInputRef.current) quickVideoInputRef.current.value = "";
      await onUpdated(
        await getProduct(product.id),
        t("Product video uploaded."),
      );
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : t("Could not upload the product video."),
      );
    } finally {
      setIsSaving(false);
      setVideoProgress(null);
      videoCancelRef.current = null;
    }
  }

  async function makePrimary(imageId: string) {
    if (!canEditCatalogue) return;
    setIsSaving(true);
    setLocalError("");
    try {
      await setPrimaryImage(product.id, imageId);
      await onUpdated(await getProduct(product.id), "Primary image updated.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not update the image.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeImage(imageId: string) {
    if (!canEditCatalogue) return;
    if (!window.confirm("Remove this product image?")) return;
    setIsSaving(true);
    setLocalError("");
    try {
      await deleteProductImage(product.id, imageId);
      await onUpdated(await getProduct(product.id), "Product image removed.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not remove the image.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function addVideo() {
    if (!canManageVideos) return;
    if (videoSource === "upload" && !videoFile) {
      setLocalError("Choose an MP4 or WebM video file.");
      return;
    }
    if (videoSource === "external" && !videoUrl.trim()) {
      setLocalError("Enter an approved YouTube or Vimeo URL.");
      return;
    }
    setIsSaving(true);
    setLocalError("");
    setVideoProgress(0);
    const upload = createProductVideo(
      product.id,
      {
        source_type: videoSource,
        file: videoFile,
        external_url: videoUrl.trim(),
        title_en: videoTitleEn.trim(),
        title_th: videoTitleTh.trim(),
        description: videoDescription.trim(),
        alt_text: videoAltText.trim(),
        is_featured: true,
        is_active: true,
        show_in_catalogue: true,
        show_in_public_catalogue: canPublishVideos && showVideoPublicly,
        show_controls: true,
        allow_download: false,
        autoplay: false,
        muted: false,
        loop: false,
      },
      setVideoProgress,
    );
    videoCancelRef.current = upload.cancel;
    try {
      await upload.promise;
      setVideoFile(null);
      setVideoUrl("");
      setVideoTitleEn("");
      setVideoTitleTh("");
      setVideoDescription("");
      setVideoAltText("");
      if (videoFileRef.current) videoFileRef.current.value = "";
      await onUpdated(await getProduct(product.id), "Product video added.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "The video could not be uploaded. Please try again.",
      );
    } finally {
      setIsSaving(false);
      setVideoProgress(null);
      videoCancelRef.current = null;
    }
  }

  async function editVideo(
    video: ProductVideo,
    changes: Parameters<typeof updateProductVideo>[2],
    message: string,
  ) {
    setIsSaving(true);
    setLocalError("");
    try {
      await updateProductVideo(product.id, video.id, changes);
      await onUpdated(await getProduct(product.id), message);
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not update the video.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function featureVideo(video: ProductVideo) {
    setIsSaving(true);
    setLocalError("");
    try {
      await setFeaturedProductVideo(product.id, video.id);
      await onUpdated(await getProduct(product.id), "Featured video updated.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not feature the video.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removeVideo(video: ProductVideo) {
    if (
      !window.confirm(
        `Remove ${video.title_en || video.original_filename || "this video"}?`,
      )
    )
      return;
    setIsSaving(true);
    setLocalError("");
    try {
      await deleteProductVideo(product.id, video.id);
      await onUpdated(await getProduct(product.id), "Product video removed.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not remove the video.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadVideoThumbnail(video: ProductVideo, file: File) {
    setIsSaving(true);
    setLocalError("");
    try {
      await uploadProductVideoThumbnail(product.id, video.id, file);
      await onUpdated(await getProduct(product.id), "Video thumbnail updated.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not upload the thumbnail.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function replaceVideoFile(video: ProductVideo, file: File) {
    setIsSaving(true);
    setLocalError("");
    try {
      await replaceProductVideo(product.id, video.id, file);
      await onUpdated(await getProduct(product.id), "Product video replaced.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not replace the video.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function uploadVideoCaptionFile(video: ProductVideo, file: File) {
    setIsSaving(true);
    setLocalError("");
    try {
      await uploadProductVideoCaption(product.id, video.id, file);
      await onUpdated(await getProduct(product.id), "Video captions updated.");
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not upload captions.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmStatusChange() {
    if (!statusDialog || !canChangeStatus) return;
    const nextStatus = statusDialog;
    setIsSaving(true);
    setLocalError("");
    try {
      const updated = await changeProductStatus(product.id, {
        status: nextStatus,
        reason: nextStatus === "inactive" ? inactiveReason : "",
        note: statusNote,
      });
      setStatusDialog(null);
      setStatusNote("");
      await onUpdated(
        updated,
        nextStatus === "inactive"
          ? "Product marked inactive."
          : "Product reactivated.",
      );
    } catch (error) {
      setLocalError(
        error instanceof ApiError
          ? error.message
          : "Could not change product status.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.editorBackdrop} role="presentation">
      <aside
        className={styles.editor}
        aria-label={`Edit ${productDisplayName(product)}`}
      >
        <div className={styles.editorHeader}>
          <div>
            <span>
              <T>Catalogue editor</T>
            </span>
            <label className={styles.editorNameField}>
              <span>
                <T>Product name</T>
              </span>
              <input
                value={draft.display_name}
                maxLength={255}
                required
                disabled={!canEditCatalogue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    display_name: event.target.value,
                  }))
                }
                aria-label="Product display name"
              />
            </label>
            <p>
              {product.sku} <T>· Version</T> {product.version}
            </p>
          </div>
          <button
            className={styles.iconButton}
            type="button"
            onClick={onClose}
            aria-label="Close editor"
          >
            ×
          </button>
        </div>

        <div className={styles.editorStatusRow}>
          <ProductLifecycleBadge status={product.product_status} />
          <StatusBadge status={product.workflow_status} />
          <span>
            <T>ERP updated</T> {formatDate(product.erp_updated_at, locale)} ·{" "}
            {product.stock_quantity} <T>in stock</T>
          </span>
          <span
            className={styles.syncLine}
            data-warning={
              product.source_sync_status !== "synced" ||
              isStaleSynchronization(product.stock_last_synced_at)
            }
          >
            <T>Last synchronized:</T>{" "}
            {product.stock_last_synced_at
              ? formatDateTime(product.stock_last_synced_at, locale)
              : t("not yet")}
            {isStaleSynchronization(product.stock_last_synced_at)
              ? " · stock and price information may be outdated"
              : ""}
          </span>
          {canChangeStatus && (
            <button
              className={styles.statusActionButton}
              type="button"
              onClick={() =>
                setStatusDialog(
                  product.product_status === "active" ? "inactive" : "active",
                )
              }
            >
              {t(
                product.product_status === "active"
                  ? "Mark Inactive"
                  : "Reactivate",
              )}
            </button>
          )}
        </div>

        {product.product_status === "inactive" && (
          <div className={styles.inactiveBanner}>
            <strong>
              <T>
                This product is inactive and is hidden from customer-facing
                catalogue content.
              </T>
            </strong>
            <span>
              {product.inactive_reason?.replaceAll("_", " ")}
              {product.inactive_note ? ` · ${product.inactive_note}` : ""}
            </span>
            {product.catalogue_assignments.length > 0 && (
              <span>
                <T>Assigned catalogues:</T>{" "}
                {product.catalogue_assignments
                  .map((item) => `${item.title} (${item.status})`)
                  .join(", ")}
              </span>
            )}
          </div>
        )}

        {statusDialog && (
          <ProductStatusDialog
            nextStatus={statusDialog}
            reason={inactiveReason}
            note={statusNote}
            saving={isSaving}
            onReason={setInactiveReason}
            onNote={setStatusNote}
            onCancel={() => setStatusDialog(null)}
            onConfirm={() => void confirmStatusChange()}
          />
        )}

        {localError && (
          <div className={styles.inlineError} role="alert">
            {localError}
          </div>
        )}

        <div className={styles.editorBody}>
          <section className={styles.formSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span>
                  <T>ERP product data</T>
                </span>
                <h3>
                  <T>Source information</T>
                </h3>
              </div>
              <small>
                {canEditMasterData
                  ? t("Administrator editable")
                  : t("Read only")}
              </small>
            </div>
            <div className={styles.erpGrid}>
              <label>
                <span>
                  <T>ERP product name</T>
                </span>
                <input
                  value={masterDraft.erp_name}
                  maxLength={255}
                  disabled={!canEditMasterData}
                  onChange={(event) =>
                    setMasterDraft((current) => ({
                      ...current,
                      erp_name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label>
                <span>
                  <T>Brand</T>
                </span>
                <input
                  value={masterDraft.brand ?? ""}
                  maxLength={120}
                  disabled={!canEditMasterData}
                  placeholder={t("Not supplied")}
                  onChange={(event) =>
                    setMasterDraft((current) => ({
                      ...current,
                      brand: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>
                  <T>Barcode</T>
                </span>
                <input
                  value={masterDraft.barcode ?? ""}
                  maxLength={80}
                  disabled={!canEditMasterData}
                  placeholder={t("Not supplied")}
                  onChange={(event) =>
                    setMasterDraft((current) => ({
                      ...current,
                      barcode: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>
                  <T>ERP category</T>
                </span>
                <input
                  value={masterDraft.erp_category ?? ""}
                  maxLength={120}
                  disabled={!canEditMasterData}
                  placeholder={t("Not supplied")}
                  onChange={(event) =>
                    setMasterDraft((current) => ({
                      ...current,
                      erp_category: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>
                  <T>Price</T>
                </span>
                <input
                  type="number"
                  value={masterDraft.price ?? ""}
                  min="0"
                  step="0.01"
                  disabled={!canEditMasterData}
                  placeholder="0.00"
                  onChange={(event) =>
                    setMasterDraft((current) => ({
                      ...current,
                      price: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>
                  <T>Quantity</T>
                </span>
                <input
                  type="number"
                  value={masterDraft.stock_quantity}
                  min="0"
                  step="1"
                  disabled={!canEditMasterData}
                  onChange={(event) =>
                    setMasterDraft((current) => ({
                      ...current,
                      stock_quantity: Math.max(
                        0,
                        Number.parseInt(event.target.value || "0", 10),
                      ),
                    }))
                  }
                />
              </label>
              {Object.entries(product.erp_details || {}).map(([key, value]) => (
                <div key={key} className={styles.erpDetailValue}>
                  <span>{t(ERP_DETAIL_LABELS[key] || humanizeAction(key))}</span>
                  <strong title={value}>{value}</strong>
                </div>
              ))}
            </div>
            {canEditMasterData && (
              <div className={styles.masterSaveRow}>
                <span>
                  <T>
                    These fields update the product master record and audit log.
                  </T>
                </span>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  disabled={isSaving || !masterDraft.erp_name.trim()}
                  onClick={saveMasterData}
                >
                  {isSaving ? t("Saving...") : t("Save source data")}
                </button>
              </div>
            )}
          </section>

          {canViewVideos && (
            <section className={styles.formSection}>
              <div className={styles.sectionHeading}>
                <div>
                  <span>
                    <T>Media library</T>
                  </span>
                  <h3>
                    <T>Product videos</T>
                  </h3>
                </div>
                <small>
                  {product.videos.length} {t("videos")} <T>· MP4/WebM</T>{" "}
                  {t("up to 100 MB")}
                </small>
              </div>
              <p className={styles.mutedHelp}>
                <T>
                  Compatible files are stored as uploaded. Add a thumbnail when
                  needed.
                </T>
              </p>
              <div className={styles.videoLibrary}>
                {product.videos.map((video) => (
                  <article key={video.id} className={styles.videoCard}>
                    <ProductVideoPlayer
                      video={video}
                      title={
                        video.title_en ||
                        video.title_th ||
                        productDisplayName(product)
                      }
                    />
                    <div className={styles.videoMeta}>
                      <div>
                        <strong>
                          {video.title_en ||
                            video.title_th ||
                            video.original_filename ||
                            "Product video"}
                        </strong>
                        <small>
                          {video.provider} · {video.processing_status} ·{" "}
                          {video.file_size
                            ? `${(video.file_size / 1024 / 1024).toFixed(1)} MB`
                            : "External"}
                          {video.duration_seconds
                            ? ` · ${Math.round(video.duration_seconds)} sec`
                            : ""}
                        </small>
                      </div>
                      {video.is_featured && (
                        <span>
                          <T>Featured</T>
                        </span>
                      )}
                    </div>
                    {canManageVideos && (
                      <div className={styles.videoFields}>
                        <label>
                          <span>
                            <T>English title</T>
                          </span>
                          <input
                            defaultValue={video.title_en}
                            maxLength={255}
                            onBlur={(event) => {
                              if (event.target.value !== video.title_en)
                                void editVideo(
                                  video,
                                  { title_en: event.target.value },
                                  "Video title updated.",
                                );
                            }}
                          />
                        </label>
                        <label>
                          <span>
                            <T>Thai title</T>
                          </span>
                          <input
                            defaultValue={video.title_th}
                            maxLength={255}
                            onBlur={(event) => {
                              if (event.target.value !== video.title_th)
                                void editVideo(
                                  video,
                                  { title_th: event.target.value },
                                  "Video title updated.",
                                );
                            }}
                          />
                        </label>
                        <label className={styles.videoWide}>
                          <span>
                            <T>Description</T>
                          </span>
                          <textarea
                            rows={2}
                            defaultValue={video.description}
                            maxLength={12000}
                            onBlur={(event) => {
                              if (event.target.value !== video.description)
                                void editVideo(
                                  video,
                                  { description: event.target.value },
                                  "Video description updated.",
                                );
                            }}
                          />
                        </label>
                        <label>
                          <span>
                            <T>Thumbnail</T>
                          </span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={isSaving}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file) void uploadVideoThumbnail(video, file);
                            }}
                          />
                        </label>
                        <label>
                          <span>
                            <T>Replace video</T>
                          </span>
                          <input
                            type="file"
                            accept="video/mp4,video/webm,.mp4,.webm"
                            disabled={isSaving}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (
                                file &&
                                window.confirm(
                                  "Replace the current video file?",
                                )
                              )
                                void replaceVideoFile(video, file);
                            }}
                          />
                        </label>
                        <label>
                          <span>
                            <T>Captions (WebVTT)</T>
                          </span>
                          <input
                            type="file"
                            accept="text/vtt,.vtt"
                            disabled={isSaving}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (file)
                                void uploadVideoCaptionFile(video, file);
                            }}
                          />
                        </label>
                      </div>
                    )}
                    <div className={styles.videoOptions}>
                      <label>
                        <input
                          type="checkbox"
                          checked={video.is_active}
                          disabled={!canManageVideos || isSaving}
                          onChange={(event) =>
                            void editVideo(
                              video,
                              { is_active: event.target.checked },
                              event.target.checked
                                ? "Video activated."
                                : "Video deactivated.",
                            )
                          }
                        />{" "}
                        <T>Active</T>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={video.show_in_catalogue}
                          disabled={!canManageVideos || isSaving}
                          onChange={(event) =>
                            void editVideo(
                              video,
                              { show_in_catalogue: event.target.checked },
                              "Catalogue visibility updated.",
                            )
                          }
                        />{" "}
                        <T>Catalogue</T>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={video.show_in_public_catalogue}
                          disabled={!canPublishVideos || isSaving}
                          onChange={(event) =>
                            void editVideo(
                              video,
                              {
                                show_in_public_catalogue: event.target.checked,
                              },
                              "Public visibility updated.",
                            )
                          }
                        />{" "}
                        <T>Public links</T>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={video.show_controls}
                          disabled={!canManageVideos || isSaving}
                          onChange={(event) =>
                            void editVideo(
                              video,
                              { show_controls: event.target.checked },
                              "Player controls updated.",
                            )
                          }
                        />{" "}
                        <T>Controls</T>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={video.allow_download}
                          disabled={!canManageVideos || isSaving}
                          onChange={(event) =>
                            void editVideo(
                              video,
                              { allow_download: event.target.checked },
                              "Download setting updated.",
                            )
                          }
                        />{" "}
                        <T>Allow download</T>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={video.autoplay}
                          disabled={!canManageVideos || isSaving}
                          onChange={(event) =>
                            void editVideo(
                              video,
                              {
                                autoplay: event.target.checked,
                                muted: event.target.checked
                                  ? true
                                  : video.muted,
                              },
                              "Autoplay setting updated.",
                            )
                          }
                        />{" "}
                        <T>Autoplay (muted)</T>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={video.muted}
                          disabled={
                            !canManageVideos || isSaving || video.autoplay
                          }
                          onChange={(event) =>
                            void editVideo(
                              video,
                              { muted: event.target.checked },
                              "Muted setting updated.",
                            )
                          }
                        />{" "}
                        <T>Muted</T>
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={video.loop}
                          disabled={!canManageVideos || isSaving}
                          onChange={(event) =>
                            void editVideo(
                              video,
                              { loop: event.target.checked },
                              "Loop setting updated.",
                            )
                          }
                        />{" "}
                        <T>Loop</T>
                      </label>
                    </div>
                    {(canManageVideos || canDeleteVideos) && (
                      <div className={styles.videoActions}>
                        {canManageVideos && !video.is_featured && (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => void featureVideo(video)}
                          >
                            <T>Set featured</T>
                          </button>
                        )}
                        {canDeleteVideos && (
                          <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => void removeVideo(video)}
                          >
                            <T>Remove</T>
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
                {!product.videos.length && (
                  <div className={styles.emptyMedia}>
                    <strong>
                      <T>No product video yet</T>
                    </strong>
                    <span>
                      <T>
                        Upload an MP4/WebM or add an approved YouTube or Vimeo
                        link.
                      </T>
                    </span>
                  </div>
                )}
              </div>
              {canManageVideos && (
                <div className={styles.videoUploader}>
                  <div className={styles.videoSourceTabs}>
                    <button
                      type="button"
                      data-active={videoSource === "upload"}
                      onClick={() => setVideoSource("upload")}
                    >
                      <T>Upload video</T>
                    </button>
                    <button
                      type="button"
                      data-active={videoSource === "external"}
                      onClick={() => setVideoSource("external")}
                    >
                      <T>External link</T>
                    </button>
                  </div>
                  {videoSource === "upload" ? (
                    <label
                      className={styles.videoDrop}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        setVideoFile(event.dataTransfer.files?.[0] || null);
                      }}
                    >
                      <span>
                        <T>Drag and drop or browse for an MP4/WebM file</T>
                      </span>
                      <input
                        ref={videoFileRef}
                        type="file"
                        accept="video/mp4,video/webm,.mp4,.webm"
                        disabled={isSaving}
                        onChange={(event) =>
                          setVideoFile(event.target.files?.[0] || null)
                        }
                      />
                      {videoFile && (
                        <small>
                          {videoFile.name} ·{" "}
                          {(videoFile.size / 1024 / 1024).toFixed(1)} <T>MB</T>
                        </small>
                      )}
                    </label>
                  ) : (
                    <label className={styles.inputGroup}>
                      <span>
                        <T>YouTube or Vimeo HTTPS URL</T>
                      </span>
                      <input
                        type="url"
                        value={videoUrl}
                        onChange={(event) => setVideoUrl(event.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                      />
                    </label>
                  )}
                  <div className={styles.videoFields}>
                    <label>
                      <span>
                        <T>English title</T>
                      </span>
                      <input
                        value={videoTitleEn}
                        maxLength={255}
                        onChange={(event) =>
                          setVideoTitleEn(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>
                        <T>Thai title</T>
                      </span>
                      <input
                        value={videoTitleTh}
                        maxLength={255}
                        onChange={(event) =>
                          setVideoTitleTh(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>
                        <T>Alternative text</T>
                      </span>
                      <input
                        value={videoAltText}
                        maxLength={255}
                        onChange={(event) =>
                          setVideoAltText(event.target.value)
                        }
                      />
                    </label>
                    <label className={styles.videoWide}>
                      <span>
                        <T>Description</T>
                      </span>
                      <textarea
                        rows={2}
                        value={videoDescription}
                        onChange={(event) =>
                          setVideoDescription(event.target.value)
                        }
                      />
                    </label>
                  </div>
                  {canPublishVideos && (
                    <label className={styles.switchRow}>
                      <span>
                        <strong>
                          <T>Visible in public catalogue links</T>
                        </strong>
                        <small>
                          <T>
                            Still requires a published catalogue and valid share
                            link.
                          </T>
                        </small>
                      </span>
                      <input
                        type="checkbox"
                        checked={showVideoPublicly}
                        onChange={(event) =>
                          setShowVideoPublicly(event.target.checked)
                        }
                      />
                    </label>
                  )}
                  {videoProgress !== null && (
                    <div className={styles.uploadProgress}>
                      <span style={{ width: `${videoProgress}%` }} />
                      <strong>{videoProgress}%</strong>
                    </div>
                  )}
                  <div className={styles.videoActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={isSaving}
                      onClick={() => void addVideo()}
                    >
                      {isSaving ? t("Uploading...") : t("Add product video")}
                    </button>
                    {videoProgress !== null && (
                      <button
                        type="button"
                        onClick={() => videoCancelRef.current?.()}
                      >
                        <T>Cancel upload</T>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className={styles.formSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span>
                  <T>Customer-facing copy</T>
                </span>
                <h3>
                  <T>Product content</T>
                </h3>
              </div>
              <small>
                <T>Managed by catalogue</T>
              </small>
            </div>
            <label className={styles.inputGroup}>
              <span>
                <T>Short description</T>
              </span>
              <textarea
                rows={3}
                maxLength={320}
                value={draft.short_description}
                disabled={!canEditCatalogue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    short_description: event.target.value,
                  }))
                }
              />
              <small>{draft.short_description.length}/320</small>
            </label>
            <label className={styles.inputGroup}>
              <span>
                <T>Long description</T>
              </span>
              <textarea
                rows={7}
                maxLength={12000}
                value={draft.long_description}
                disabled={!canEditCatalogue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    long_description: event.target.value,
                  }))
                }
              />
            </label>
            <label className={styles.inputGroup}>
              <span>
                <T>SEO title</T>
              </span>
              <input
                maxLength={180}
                value={draft.seo_title}
                disabled={!canEditCatalogue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    seo_title: event.target.value,
                  }))
                }
              />
            </label>
            <label className={styles.inputGroup}>
              <span>
                <T>SEO description</T>
              </span>
              <textarea
                rows={3}
                maxLength={320}
                value={draft.seo_description}
                disabled={!canEditCatalogue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    seo_description: event.target.value,
                  }))
                }
              />
            </label>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span>
                  <T>Organisation</T>
                </span>
                <h3>
                  <T>Categories and merchandising</T>
                </h3>
              </div>
            </div>
            <div className={styles.categoryPicker}>
              {categories.map((category) => (
                <label key={category.id}>
                  <input
                    type="checkbox"
                    checked={draft.category_ids.includes(category.id)}
                    disabled={!canEditCatalogue}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        category_ids: event.target.checked
                          ? [...current.category_ids, category.id]
                          : current.category_ids.filter(
                              (categoryId) => categoryId !== category.id,
                            ),
                      }))
                    }
                  />
                  <span>{category.name}</span>
                </label>
              ))}
            </div>
            <label className={styles.switchRow}>
              <span>
                <strong>
                  <T>Featured product</T>
                </strong>
                <small>
                  <T>Highlight this product in catalogue placements.</T>
                </small>
              </span>
              <input
                type="checkbox"
                checked={draft.is_featured}
                disabled={!canEditCatalogue}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    is_featured: event.target.checked,
                  }))
                }
              />
            </label>
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span>
                  <T>Media library</T>
                </span>
                <h3>
                  <T>Product images</T>
                </h3>
              </div>
              <small>
                {product.images.length} {t("images")}
              </small>
            </div>
            <div className={styles.imageGrid}>
              {product.images.map((image) => (
                <article key={image.id} className={styles.imageCard}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl(image.public_url) || ""}
                    alt={image.alt_text}
                  />
                  <div>
                    <span>
                      {image.is_primary ? t("Primary") : image.file_name}
                    </span>
                    <div>
                      {canEditCatalogue && !image.is_primary && (
                        <button
                          type="button"
                          onClick={() => makePrimary(image.id)}
                          disabled={isSaving}
                        >
                          <T>Make primary</T>
                        </button>
                      )}
                      {canEditCatalogue && (
                        <button
                          type="button"
                          onClick={() => removeImage(image.id)}
                          disabled={isSaving}
                        >
                          <T>Remove</T>
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
              {!product.images.length && (
                <div className={styles.emptyMedia}>
                  <strong>
                    <T>No images yet</T>
                  </strong>
                  <span>
                    <T>Upload the first product image below.</T>
                  </span>
                </div>
              )}
            </div>
            {canEditCatalogue && (
              <div className={styles.erpImagePicker}>
                <div className={styles.erpImagePickerHeader}>
                  <div>
                    <strong>
                      <T>Images from ERP</T>
                    </strong>
                    <small>
                      <T>
                        Load the product images stored in ERP, choose one, and
                        save it to this catalogue.
                      </T>
                    </small>
                  </div>
                  <button
                    className={styles.secondaryButton}
                    type="button"
                    onClick={() => void loadErpImages()}
                    disabled={isSaving || isLoadingErpImages}
                  >
                    {t(
                      isLoadingErpImages
                        ? "Loading ERP images..."
                        : erpImages
                          ? "Reload ERP images"
                          : "Load ERP images",
                    )}
                  </button>
                </div>

                {erpImages && erpImages.length > 0 && (
                  <>
                    <div className={styles.erpImageGrid}>
                      {erpImages.map((candidate) => (
                        <label
                          key={candidate.slot}
                          className={styles.erpImageCandidate}
                          data-selected={selectedErpImage === candidate.slot}
                          data-supported={candidate.supported}
                        >
                          <input
                            type="radio"
                            name={`erp-image-${product.id}`}
                            value={candidate.slot}
                            checked={selectedErpImage === candidate.slot}
                            disabled={!candidate.supported || isSaving}
                            onChange={() =>
                              setSelectedErpImage(candidate.slot)
                            }
                          />
                          {candidate.supported ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl(candidate.preview_url) || ""}
                              alt={
                                candidate.description ||
                                t("ERP image {{slot}}", {
                                  slot: candidate.slot,
                                })
                              }
                              loading="lazy"
                            />
                          ) : (
                            <span className={styles.erpImageUnsupported}>
                              <T>Unsupported image</T>
                            </span>
                          )}
                          <span>
                            <strong>
                              {candidate.description ||
                                t("ERP image {{slot}}", {
                                  slot: candidate.slot,
                                })}
                            </strong>
                            <small>
                              {(candidate.file_size / 1024).toFixed(0)} KB
                            </small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className={styles.erpImageSaveRow}>
                      <label>
                        <input
                          type="checkbox"
                          checked={makeErpImagePrimary}
                          disabled={isSaving}
                          onChange={(event) =>
                            setMakeErpImagePrimary(event.target.checked)
                          }
                        />
                        <T>Use as primary product image</T>
                      </label>
                      <button
                        className={styles.primaryButton}
                        type="button"
                        disabled={selectedErpImage === null || isSaving}
                        onClick={() => void saveErpImage()}
                      >
                        {t(isSaving ? "Saving..." : "Save selected ERP image")}
                      </button>
                    </div>
                  </>
                )}
                {erpImages && erpImages.length === 0 && (
                  <div className={styles.erpImageEmpty}>
                    <T>No product images were found in ERP for this item.</T>
                  </div>
                )}
              </div>
            )}
            {(canEditCatalogue || canManageVideos) && (
              <div className={styles.mediaUploadGrid}>
                {canEditCatalogue && (
                  <label className={styles.mediaUploadField}>
                    <span>
                      <T>Add product image</T>
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadImage(file);
                      }}
                      disabled={isSaving}
                    />
                    <small>
                      {t("JPG, PNG or WebP · maximum {{count}} MB", {
                        count: PRODUCT_IMAGE_MAX_SIZE_MB,
                      })}
                    </small>
                  </label>
                )}
                {canManageVideos && (
                  <label className={styles.mediaUploadField}>
                    <span>
                      <T>Add product video</T>
                    </span>
                    <input
                      ref={quickVideoInputRef}
                      type="file"
                      accept="video/mp4,video/webm,.mp4,.webm"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadQuickVideo(file);
                      }}
                      disabled={isSaving}
                    />
                    <small>
                      <T>MP4/WebM ·</T> <T>up to 100 MB</T>
                    </small>
                  </label>
                )}
                {canEditCatalogue && (
                  <label
                    className={`${styles.mediaUploadField} ${styles.mediaUploadWide}`}
                  >
                    <span>
                      <T>Image description (optional)</T>
                    </span>
                    <input
                      type="text"
                      placeholder={t("Describe the product image")}
                      value={altText}
                      onChange={(event) => setAltText(event.target.value)}
                      maxLength={255}
                    />
                  </label>
                )}
                {videoProgress !== null && (
                  <div
                    className={`${styles.uploadProgress} ${styles.mediaUploadWide}`}
                  >
                    <span style={{ width: `${videoProgress}%` }} />
                    <strong>{videoProgress}%</strong>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className={styles.formSection}>
            <div className={styles.sectionHeading}>
              <div>
                <span>
                  <T>Publishing history</T>
                </span>
                <h3>
                  <T>Workflow timeline</T>
                </h3>
              </div>
            </div>
            <div className={styles.timelineGrid}>
              <div>
                <span>
                  <T>Submitted</T>
                </span>
                <strong>{formatDate(product.submitted_at, locale)}</strong>
              </div>
              <div>
                <span>
                  <T>Approved</T>
                </span>
                <strong>{formatDate(product.approved_at, locale)}</strong>
              </div>
              <div>
                <span>
                  <T>Published</T>
                </span>
                <strong>{formatDate(product.published_at, locale)}</strong>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.editorFooter}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={onClose}
          >
            <T>Close</T>
          </button>
          {canEditCatalogue && (
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={saveContent}
              disabled={isSaving || !contentIsValid}
            >
              {isSaving ? t("Working...") : t("Save draft")}
            </button>
          )}
          {workflowAction && (
            <button
              className={styles.primaryButton}
              type="button"
              onClick={moveWorkflow}
              disabled={isSaving || (canEditCatalogue && !contentIsValid)}
            >
              {
                {
                  submit: t("Submit for review"),
                  approve: t("Approve product"),
                  publish: t("Publish product"),
                  unpublish: t("Unpublish"),
                }[workflowAction]
              }
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { locale, t } = useLanguage();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [view, setView] = useState<View>("overview");
  const [stats, setStats] = useState<CatalogueStats>(EMPTY_STATS);
  const [products, setProducts] = useState<ProductPage>(EMPTY_PAGE);
  const [priceMappings, setPriceMappings] = useState<
    UserCataloguePriceMapping[]
  >([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(
    null,
  );
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);
  const [isGeneratingFromErp, setIsGeneratingFromErp] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [productStatusFilter, setProductStatusFilter] = useState<
    "active" | "inactive" | "all"
  >("active");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [needsFilter, setNeedsFilter] = useState("");
  const [priceLevelFilter, setPriceLevelFilter] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [updatingCategoryId, setUpdatingCategoryId] = useState<number | null>(
    null,
  );
  const [updatingBrandId, setUpdatingBrandId] = useState<number | null>(null);
  const [updatingProductId, setUpdatingProductId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [dashboardSync, setDashboardSync] =
    useState<DashboardSyncStatus | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [viewResetKey, setViewResetKey] = useState(0);
  const productRequestIdRef = useRef(0);
  const productSearchTimerRef = useRef<number | null>(null);

  const canApprove = canAccessAny(user, [
    "catalogues.approve",
    "catalogues.publish",
  ]);
  const canEditCatalogue = canAccess(user, "products.edit");
  const canEditCategories = canAccess(user, "categories.edit");
  const canEditBrands = canAccess(user, "brands.edit");
  const canEditMasterData = canAccess(user, "products.edit");
  const canViewInactive = isSuperAdmin(user);
  const canChangeStatus = isSuperAdmin(user);
  const canViewVideos = canAccess(user, "product_videos.view");
  const canManageVideos = canAccessAny(user, [
    "product_videos.upload",
    "product_videos.edit",
  ]);
  const canDeleteVideos = canAccess(user, "product_videos.delete");
  const canRunDataSync = canAccess(user, "data_sync.run");
  const canPublishVideos = canAccess(user, "product_videos.publish");
  const canManageUsers = canAccess(user, "users.view");
  const canManageOrganization = !isSalesAdmin(user) && canAccessAny(user, [
      "departments.view",
      "departments.manage",
      "positions.view",
      "positions.manage",
      "roles.view",
    ]);
  const canViewPricing = canAccess(user, "prices.view");
  const canViewCatalogues = canAccess(user, "catalogues.view");
  const canManageFeedback = canAccess(user, "feedback.manage");
  const canViewFeedback = canAccessAny(user, [
    "feedback.view_own",
    "feedback.view_all",
    "feedback.manage",
  ]);
  const canViewSettings = canAccessAny(user, [
    "settings.view",
    "settings.manage",
    "backups.view",
    "system_metrics.view",
    "system_information.view",
    "data_sync.view",
    "data_sync.run",
    "data_sync.configure",
  ]);
  const navigationItems: Array<[View, string, string]> = allowedNavigation(
    user,
  ).map(([viewName, icon, label]) => [viewName, icon, label]);
  useEffect(() => {
    let active = true;
    async function loadWorkspace() {
      try {
        const currentUser = await getCurrentUser();
        if (!active) return;
        if (isCustomerUser(currentUser)) {
          router.replace("/customer");
          return;
        }
        const catalogueAllowed = canAccess(currentUser, "products.view");
        const activityAllowed = canAccess(currentUser, "audit_logs.view");
        const dashboardAllowed = canAccess(currentUser, "dashboard.view");
        const categoriesAllowed = canAccess(currentUser, "categories.view");
        const defaultProductStatus = isSuperAdmin(currentUser) ? "all" : "active";
        let savedFilters: {
          query?: string;
          status?: string;
          productStatus?: "active" | "inactive" | "all";
          brand?: string;
          category?: string;
          needs?: string;
          priceLevel?: string;
        } = {};
        try {
          savedFilters = JSON.parse(
            window.localStorage.getItem(
              `gms-product-filters-v1:${currentUser.id}`,
            ) || "{}",
          );
        } catch {
          savedFilters = {};
        }
        const initialProductStatus = isSuperAdmin(currentUser)
          ? savedFilters.productStatus || defaultProductStatus
          : "active";
        setUser(currentUser);
        setQuery(savedFilters.query || "");
        setStatusFilter(savedFilters.status || "");
        setProductStatusFilter(initialProductStatus);
        setBrandFilter(savedFilters.brand || "");
        setCategoryFilter(savedFilters.category || "");
        setNeedsFilter(savedFilters.needs || "");
        setPriceLevelFilter(savedFilters.priceLevel || "");
        const storedOrRequestedView =
          new URLSearchParams(window.location.search).get("view") ||
          window.localStorage.getItem(`gms-dashboard-view:${currentUser.id}`);
        const requestedView =
          storedOrRequestedView === "permissions" && canAccess(currentUser, "users.view")
            ? "users"
            : storedOrRequestedView;
        const availableViews = allowedNavigation(currentUser).map(
          ([availableView]) => availableView,
        );
        const requested = availableViews.find(
          (availableView) => availableView === requestedView,
        );
        const initialView = (isCataloguePortalUser(currentUser) && availableViews.includes("catalogues")
          ? "catalogues"
          : requested) ??
          (availableViews.includes("overview") ? "overview" : availableViews[0]);
        if (initialView) setView(initialView);
        // Authentication is the only prerequisite for rendering the shell.
        // Large ERP catalogue queries continue in parallel so users can start
        // navigating immediately instead of waiting behind the slowest call.
        setIsLoading(false);

        const backgroundLoads: Promise<void>[] = [];
        if (dashboardAllowed && initialView === "overview") {
          setIsOverviewLoading(true);
          backgroundLoads.push(
            getDashboardOverview()
              .then((data) => {
                if (!active) return;
                setOverview(data);
                setDashboardSync(data.sync_status);
                if (data.product_metrics) setStats(data.product_metrics);
              })
              .finally(() => {
                if (active) setIsOverviewLoading(false);
              }),
          );
        } else if (dashboardAllowed && initialView === "products") {
          backgroundLoads.push(
            getCatalogueStats().then((data) => {
              if (active) setStats(data);
            }),
          );
        }
        if (dashboardAllowed && initialView !== "overview") {
          backgroundLoads.push(
            getDashboardSyncStatus().then((data) => {
              if (active) setDashboardSync(data);
            }),
          );
        }
        if (
          catalogueAllowed &&
          initialView === "products" &&
          !(
            initialView === "products" &&
            canAccess(currentUser, "prices.view")
          )
        ) {
          backgroundLoads.push(
            getProducts({
              q: savedFilters.query || undefined,
              status: savedFilters.status || undefined,
              productStatus: initialProductStatus,
              brand: savedFilters.brand || undefined,
              categoryId: savedFilters.category
                ? Number(savedFilters.category)
                : undefined,
              needs: savedFilters.needs || undefined,
              audienceTypeId: savedFilters.priceLevel
                ? Number(savedFilters.priceLevel)
                : undefined,
            }).then((data) => {
              if (active) setProducts(data);
            }),
          );
        }
        if (
          initialView === "products" &&
          canAccess(currentUser, "prices.view")
        ) {
          backgroundLoads.push(
            getMyCataloguePriceMappings().then(async (mappings) => {
              if (!active) return;
              setPriceMappings(mappings);
              const selectedCustomerLevel =
                savedFilters.priceLevel &&
                mappings.some(
                  (mapping) =>
                    String(mapping.audience_type_id) ===
                    savedFilters.priceLevel,
                )
                  ? savedFilters.priceLevel
                  : String(mappings[0]?.audience_type_id || "");
              setPriceLevelFilter(selectedCustomerLevel);
              const data = await getProducts({
                q: savedFilters.query || undefined,
                status: savedFilters.status || undefined,
                productStatus: initialProductStatus,
                brand: savedFilters.brand || undefined,
                categoryId: savedFilters.category
                  ? Number(savedFilters.category)
                  : undefined,
                needs: savedFilters.needs || undefined,
                audienceTypeId: selectedCustomerLevel
                  ? Number(selectedCustomerLevel)
                  : undefined,
              });
              if (active) setProducts(data);
            }),
          );
        }
        if (
          categoriesAllowed &&
          (initialView === "products" ||
            initialView === "categories")
        ) {
          backgroundLoads.push(
            getCategories(
              initialView === "categories",
              initialView === "categories",
            ).then((data) => {
              if (active) setCategories(data);
            }),
          );
        }
        if (
          activityAllowed &&
          initialView === "activity"
        ) {
          backgroundLoads.push(
            getActivity().then((data) => {
              if (active) setActivity(data);
            }),
          );
        }
        void Promise.allSettled(backgroundLoads).then((results) => {
          if (
            active &&
            results.length > 0 &&
            results.every((result) => result.status === "rejected")
          ) {
            setError("Could not load workspace data. Please refresh.");
          }
        });
      } catch {
        if (active) router.replace("/login");
      } finally {
        if (active) setIsLoading(false);
      }
    }
    void loadWorkspace();
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (!user) return;
    window.localStorage.setItem(`gms-dashboard-view:${user.id}`, view);
    const url = new URL(window.location.href);
    if (view === "overview") url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [user, view]);

  useEffect(() => {
    if (!user) return;
    function restoreViewFromHistory() {
      const requested = new URLSearchParams(window.location.search).get("view");
      const availableViews = allowedNavigation(user).map(([item]) => item);
      const nextView = requested
        ? availableViews.find((item) => item === requested)
        : availableViews.includes("overview")
          ? "overview"
          : availableViews[0];
      if (nextView) {
        setView(nextView);
        setViewResetKey((current) => current + 1);
        setMobileSidebarOpen(false);
        window.requestAnimationFrame(() =>
          window.scrollTo({ top: 0, left: 0, behavior: "auto" }),
        );
      }
    }
    window.addEventListener("popstate", restoreViewFromHistory);
    return () => window.removeEventListener("popstate", restoreViewFromHistory);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    window.localStorage.setItem(
      `gms-product-filters-v1:${user.id}`,
      JSON.stringify({
        query,
        status: statusFilter,
        productStatus: productStatusFilter,
        brand: brandFilter,
        category: categoryFilter,
        needs: needsFilter,
        priceLevel: priceLevelFilter,
      }),
    );
  }, [
    user,
    query,
    statusFilter,
    productStatusFilter,
    brandFilter,
    categoryFilter,
    needsFilter,
    priceLevelFilter,
  ]);

  useEffect(
    () => () => {
      if (productSearchTimerRef.current !== null) {
        window.clearTimeout(productSearchTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function refreshWorkspace(page = products.page) {
    if (!user) return;
    setIsRefreshing(true);
    try {
      if (view === "overview" && canAccess(user, "dashboard.view")) {
        const data = await getDashboardOverview();
        setOverview(data);
        setDashboardSync(data.sync_status);
        if (data.product_metrics) setStats(data.product_metrics);
        setToast(t("Dashboard data refreshed."));
        return;
      }
      const catalogueAllowed = canAccess(user, "products.view");
      const activityAllowed = canAccess(user, "audit_logs.view");
      const categoriesAllowed = canAccess(user, "categories.view");
      const dashboardAllowed = canAccess(user, "dashboard.view");
      const [statsData, productsData, categoriesData, activityData, syncData] =
        await Promise.all([
        dashboardAllowed ? getCatalogueStats() : Promise.resolve(EMPTY_STATS),
        catalogueAllowed
          ? getProducts({
              q: query,
              status: statusFilter,
              productStatus: productStatusFilter,
              brand: brandFilter,
              categoryId: categoryFilter ? Number(categoryFilter) : undefined,
              needs: needsFilter || undefined,
              audienceTypeId: priceLevelFilter
                ? Number(priceLevelFilter)
                : undefined,
              page,
            })
          : Promise.resolve(EMPTY_PAGE),
        categoriesAllowed
          ? getCategories(view === "categories", view === "categories")
          : Promise.resolve([]),
        activityAllowed ? getActivity() : Promise.resolve([]),
        dashboardAllowed ? getDashboardSyncStatus() : Promise.resolve(null),
      ]);
      setStats(statsData);
      setProducts(productsData);
      setCategories(categoriesData);
      setActivity(activityData);
      if (syncData) setDashboardSync(syncData);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Could not refresh the catalogue.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function loadProductList(
    overrides: {
      q?: string;
      status?: string;
      productStatus?: "active" | "inactive" | "all";
      brand?: string;
      categoryId?: string;
      needs?: string;
      customerLevelId?: string;
    } = {},
    page = 1,
  ) {
    if (!user || !canAccess(user, "products.view")) return;
    const requestId = ++productRequestIdRef.current;
    setIsRefreshing(true);
    setError("");
    try {
      const data = await getProducts({
        q: overrides.q ?? query,
        status: overrides.status ?? statusFilter,
        productStatus: overrides.productStatus ?? productStatusFilter,
        brand: overrides.brand ?? brandFilter,
        categoryId: Number(overrides.categoryId ?? categoryFilter) || undefined,
        needs: (overrides.needs ?? needsFilter) || undefined,
        audienceTypeId:
          Number(overrides.customerLevelId ?? priceLevelFilter) || undefined,
        page,
      });
      if (requestId === productRequestIdRef.current) setProducts(data);
    } catch (caughtError) {
      if (requestId === productRequestIdRef.current) {
        setError(
          caughtError instanceof ApiError
            ? caughtError.message
            : "Could not load the product list.",
        );
      }
    } finally {
      if (requestId === productRequestIdRef.current) setIsRefreshing(false);
    }
  }

  function handleProductSearchChange(value: string) {
    setQuery(value);
    if (productSearchTimerRef.current !== null) {
      window.clearTimeout(productSearchTimerRef.current);
    }
    productSearchTimerRef.current = window.setTimeout(() => {
      void loadProductList({ q: value });
    }, 350);
  }

  function clearProductFilters() {
    const productStatus = canViewInactive ? "all" : "active";
    const defaultCustomerLevel = String(
      priceMappings[0]?.audience_type_id || "",
    );
    setQuery("");
    setStatusFilter("");
    setProductStatusFilter(productStatus);
    setBrandFilter("");
    setCategoryFilter("");
    setNeedsFilter("");
    setPriceLevelFilter(defaultCustomerLevel);
    setSelectedProduct(null);
    void loadProductList({
      q: "",
      status: "",
      productStatus,
      brand: "",
      categoryId: "",
      needs: "",
      customerLevelId: defaultCustomerLevel,
    });
  }

  async function openProduct(productId: string) {
    setError("");
    try {
      setSelectedProduct(await getProduct(productId));
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Could not open the product.",
      );
    }
  }

  async function changeProductPriceLevel(value: string) {
    setPriceLevelFilter(value);
    await loadProductList({ customerLevelId: value });
  }

  async function openCategoryProducts(category: Category, brand?: string) {
    setCategoryFilter(String(category.id));
    setQuery("");
    setStatusFilter("");
    setBrandFilter(brand ?? "");
    setNeedsFilter("");
    setSelectedProduct(null);
    selectNavigationView("products");
    setIsRefreshing(true);
    setError("");
    try {
      setProducts(
        await getProducts({
          categoryId: category.id,
          brand: brand || undefined,
          productStatus: productStatusFilter,
          audienceTypeId: priceLevelFilter ? Number(priceLevelFilter) : undefined,
          page: 1,
        }),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : `Could not open ${category.name}.`,
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function showAllProducts() {
    setCategoryFilter("");
    setQuery("");
    setStatusFilter("");
    setBrandFilter("");
    setNeedsFilter("");
    setIsRefreshing(true);
    setError("");
    try {
      setProducts(
        await getProducts({
          productStatus: productStatusFilter,
          audienceTypeId: priceLevelFilter ? Number(priceLevelFilter) : undefined,
          page: 1,
        }),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Could not load the product list.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function openReadinessQueue(
    needs: string,
    productStatus: "active" | "inactive" | "all" = productStatusFilter,
  ) {
    const resolvedProductStatus =
      needs === "ready" && canViewInactive ? "all" : productStatus;
    setQuery("");
    setStatusFilter("");
    setBrandFilter("");
    setCategoryFilter("");
    setNeedsFilter(needs);
    setProductStatusFilter(resolvedProductStatus);
    setSelectedProduct(null);
    selectNavigationView("products");
    setIsRefreshing(true);
    setError("");
    try {
      setProducts(
        await getProducts({
          needs,
          productStatus: resolvedProductStatus,
          audienceTypeId: priceLevelFilter ? Number(priceLevelFilter) : undefined,
          page: 1,
        }),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Could not open the catalogue work queue.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function openLifecycleQueue(
    productStatus: "active" | "inactive" | "all",
  ) {
    setQuery("");
    setStatusFilter("");
    setProductStatusFilter(productStatus);
    setBrandFilter("");
    setCategoryFilter("");
    setNeedsFilter("");
    setSelectedProduct(null);
    selectNavigationView("products");
    await loadProductList({
      q: "",
      status: "",
      productStatus,
      brand: "",
      categoryId: "",
      needs: "",
    });
  }

  async function openWorkflowQueue(status: string) {
    const workflowProductStatus = isSuperAdmin(user)
      ? "all"
      : "active";
    setQuery("");
    setStatusFilter(status);
    setProductStatusFilter(workflowProductStatus);
    setBrandFilter("");
    setCategoryFilter("");
    setNeedsFilter("");
    setSelectedProduct(null);
    selectNavigationView("products");
    setIsRefreshing(true);
    setError("");
    try {
      setProducts(
        await getProducts({
          status,
          productStatus: workflowProductStatus,
          audienceTypeId: priceLevelFilter ? Number(priceLevelFilter) : undefined,
          page: 1,
        }),
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Could not open the publishing queue.",
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  function openDashboardProductQueue(filters: {
    productStatus?: "active" | "inactive" | "all";
    workflowStatus?: string;
    needs?: string;
  }) {
    if (filters.productStatus) {
      void openLifecycleQueue(filters.productStatus);
      return;
    }
    if (filters.workflowStatus) {
      void openWorkflowQueue(filters.workflowStatus);
      return;
    }
    if (filters.needs) {
      void openReadinessQueue(filters.needs);
      return;
    }
    setNeedsFilter("");
    selectSidebarView("products");
  }

  function openDashboardCatalogues(status = "") {
    const url = new URL(window.location.href);
    if (status) url.searchParams.set("status", status);
    else url.searchParams.delete("status");
    url.searchParams.delete("action");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    selectSidebarView("catalogues");
  }

  function addProductFromDashboard() {
    selectSidebarView("products");
    setSelectedProduct(null);
    setIsCreatingProduct(true);
  }

  async function handleProductUpdated(product: ProductDetail, message: string) {
    setSelectedProduct(product);
    setToast(message);
    await refreshWorkspace();
  }

  async function handleProductCreated(
    product: ProductDetail,
    message?: string,
  ) {
    setIsCreatingProduct(false);
    setToast(
      message ||
        "Product created. Add images or continue preparing its content.",
    );
    await refreshWorkspace(1);
    setSelectedProduct(product);
  }

  async function generateProductsFromErp() {
    if (!canRunDataSync || isGeneratingFromErp) return;
    if (
      !window.confirm(
        t(
          "Generate and update products from the current ERP product master now?",
        ),
      )
    )
      return;

    setIsGeneratingFromErp(true);
    setError("");
    try {
      const run = await runProductSync();
      if (run.status === "failed") {
        setError(
          run.error_summary || run.message || t("ERP product sync failed."),
        );
        return;
      }
      if (run.status === "running") {
        setToast(t("ERP product synchronization is already running."));
        return;
      }
      setToast(
        t("ERP products generated: {{created}} new, {{updated}} updated.", {
          created: run.rows_created,
          updated: run.rows_updated,
        }),
      );
      await refreshWorkspace(1);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : t("Could not generate products from ERP."),
      );
    } finally {
      setIsGeneratingFromErp(false);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    if (productSearchTimerRef.current !== null) {
      window.clearTimeout(productSearchTimerRef.current);
    }
    await loadProductList();
  }

  async function handleCreateCategory(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await createCategory({
        name: newCategoryName,
        description: newCategoryDescription,
      });
      setNewCategoryName("");
      setNewCategoryDescription("");
      setToast("Category created.");
      await refreshWorkspace();
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Could not create the category.",
      );
    }
  }

  async function handleCategoryStatusChange(
    category: Category,
    isActive: boolean,
    reason: string,
  ) {
    setError("");
    setUpdatingCategoryId(category.id);
    try {
      const updated = await updateCategory(
        category.id,
        isActive
          ? { is_active: true }
          : { is_active: false, inactive_reason: reason },
      );
      setCategories((current) =>
        current.map((item) =>
          item.id === category.id
            ? {
                ...item,
                ...updated,
                is_active: isActive,
                inactive_reason: isActive ? "" : reason,
                brands: updated.brands?.length ? updated.brands : item.brands,
              }
            : item,
        ),
      );
      setToast(
        `${category.name} ${t(isActive ? "activated" : "deactivated")}.`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : t("Could not update the category status."),
      );
      throw caughtError;
    } finally {
      setUpdatingCategoryId(null);
    }
  }

  async function handleBrandStatusChange(
    brand: Category["brands"][number],
    isActive: boolean,
    reason: string,
  ) {
    if (brand.id == null) return;
    setError("");
    setUpdatingBrandId(brand.id);
    try {
      const updated = await updateBrandStatus(brand.id, {
        is_active: isActive,
        inactive_reason: isActive ? "" : reason,
      });
      setCategories((current) =>
        current.map((category) => ({
          ...category,
          brands: category.brands.map((item) =>
            item.id === brand.id ||
            item.name.toLocaleLowerCase() === updated.name.toLocaleLowerCase()
              ? {
                  ...item,
                  id: updated.id,
                  is_active: updated.is_active,
                  inactive_reason: updated.inactive_reason,
                }
              : item,
          ),
        })),
      );
      setToast(`${brand.name} ${t(isActive ? "activated" : "deactivated")}.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : t("Could not update the brand status."),
      );
      throw caughtError;
    } finally {
      setUpdatingBrandId(null);
    }
  }

  async function handleProductStatusChange(
    product: ProductListItem,
    isActive: boolean,
    reason: string,
  ) {
    setError("");
    setUpdatingProductId(product.id);
    try {
      const updated = await changeProductStatus(product.id, {
        status: isActive ? "active" : "inactive",
        reason: isActive ? "" : "other",
        note: isActive ? "Re-enabled from product list." : reason,
      });
      setProducts((current) => {
        const shouldRemove =
          (productStatusFilter === "active" && !isActive) ||
          (productStatusFilter === "inactive" && isActive);
        const items = shouldRemove
          ? current.items.filter((item) => item.id !== product.id)
          : current.items.map((item) =>
              item.id === product.id
                ? {
                    ...item,
                    product_status: updated.product_status,
                    inactive_reason: updated.inactive_reason,
                    inactive_note: updated.inactive_note,
                    status_updated_at: updated.status_updated_at,
                  }
                : item,
            );
        return {
          ...current,
          items,
          total: shouldRemove ? Math.max(0, current.total - 1) : current.total,
        };
      });
      setToast(`${productDisplayName(product)} ${t(isActive ? "activated" : "deactivated")}.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : t("Could not update the product status."),
      );
      throw caughtError;
    } finally {
      setUpdatingProductId(null);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  function selectNavigationView(nextView: View) {
    if (nextView !== view) {
      const url = new URL(window.location.href);
      if (nextView === "overview") url.searchParams.delete("view");
      else url.searchParams.set("view", nextView);
      window.history.pushState(
        {},
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    setView(nextView);
    setMobileSidebarOpen(false);
    window.requestAnimationFrame(() =>
      window.scrollTo({ top: 0, left: 0, behavior: "auto" }),
    );
  }

  function selectSidebarView(nextView: View) {
    setViewResetKey((current) => current + 1);
    setSelectedProduct(null);
    setIsCreatingProduct(false);
    if (nextView === "products") {
      if (!categories.length) {
        void getCategories(false, false).then(setCategories).catch(() => undefined);
      }
      if (canViewPricing) {
        void getMyCataloguePriceMappings()
          .then((mappings) => {
            setPriceMappings(mappings);
            const selected = mappings.some(
              (mapping) =>
                String(mapping.audience_type_id) === priceLevelFilter,
            )
              ? priceLevelFilter
              : String(mappings[0]?.audience_type_id || "");
            setPriceLevelFilter(selected);
            return loadProductList({ customerLevelId: selected }, 1);
          })
          .catch(() => void loadProductList({}, 1));
      } else {
        void loadProductList({}, 1);
      }
    } else if (nextView === "categories") {
      void getCategories(true, true).then(setCategories).catch(() => undefined);
    } else if (nextView === "activity") {
      void getActivity().then(setActivity).catch(() => undefined);
    } else if (nextView === "overview") {
      setIsOverviewLoading(true);
      void getDashboardOverview()
        .then((data) => {
          setOverview(data);
          setDashboardSync(data.sync_status);
          if (data.product_metrics) setStats(data.product_metrics);
        })
        .catch((caughtError) => {
          setError(
            caughtError instanceof ApiError
              ? caughtError.message
              : t("Could not load the dashboard overview."),
          );
        })
        .finally(() => setIsOverviewLoading(false));
    }
    selectNavigationView(nextView);
  }

  function selectGlobalSearchResult(item: GlobalSearchItem) {
    if (item.kind === "product") {
      setQuery(item.search_value);
      setBrandFilter("");
      setCategoryFilter("");
      selectNavigationView("products");
      void loadProductList({ q: item.search_value, brand: "", categoryId: "" }, 1);
      void openProduct(item.id);
      return;
    }
    if (item.kind === "brand") {
      setQuery("");
      setBrandFilter(item.search_value);
      setCategoryFilter("");
      selectNavigationView("products");
      void loadProductList({ q: "", brand: item.search_value, categoryId: "" }, 1);
      return;
    }
    if (item.kind === "category") {
      setQuery("");
      setBrandFilter("");
      setCategoryFilter(item.search_value);
      selectNavigationView("products");
      void loadProductList({ q: "", brand: "", categoryId: item.search_value }, 1);
      return;
    }
    if (item.kind === "catalogue" && item.href.startsWith("/dashboard")) {
      const target = new URL(item.href, window.location.origin);
      window.history.pushState({}, "", `${target.pathname}${target.search}`);
      setViewResetKey((current) => current + 1);
      selectNavigationView("catalogues");
      return;
    }
    router.push(item.href);
  }

  function openOverview() {
    setQuery("");
    setStatusFilter("");
    setBrandFilter("");
    setCategoryFilter("");
    setNeedsFilter("");
    setSelectedProduct(null);
    setIsCreatingProduct(false);
    setMobileSidebarOpen(false);
    selectSidebarView("overview");
  }

  if (isLoading) {
    return (
      <main className={styles.loading}>
        <div className={styles.loadingMark}>
          <ApplicationLogo priority />
        </div>
        <span>{t("Preparing your catalogue workspace...")}</span>
      </main>
    );
  }

  if (!user) return null;

  if (!navigationItems.length && !canViewSettings) {
    return (
      <main className={styles.loading}>
        <div className={styles.loadingMark}>
          <ApplicationLogo priority />
        </div>
        <strong>
          <T>No modules are assigned to this account.</T>
        </strong>
        <span>
          <T>Ask a SuperAdmin to grant a role and data scope.</T>
        </span>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={() => void logout().then(() => router.replace("/login"))}
        >
          <T>Sign out</T>
        </button>
      </main>
    );
  }

  const reviewProducts = products.items.filter(
    (product) => product.workflow_status === "in_review",
  );
  const incompleteProducts = products.items.filter(
    (product) => !product.short_description || !product.primary_image_url,
  );
  const dashboardPublishedCount = stats.published;

  return (
    <main className={styles.app} data-sidebar-collapsed={sidebarCollapsed}>
      <DashboardSidebar
        activeView={view}
        navigationItems={navigationItems}
        productCount={stats.total_products}
        inReviewCount={stats.in_review}
        user={user}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onNavigate={selectSidebarView}
        onBrandNavigate={openOverview}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <button
            className={styles.mobileMenuButton}
            type="button"
            aria-label="Open navigation"
            aria-controls="application-sidebar"
            aria-expanded={mobileSidebarOpen}
            onClick={() => setMobileSidebarOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div className={styles.topbarIdentity}>
            <p>{t("Catalogue Department")}</p>
            <h1>
              {t(
                {
                  overview: "Workspace overview",
                  products: "Product catalogue",
                  categories: "Category management",
                  activity: "Activity history",
                  organization: "Organization & access",
                  users: "User control",
                  pricing: "Price management",
                  catalogues: "Catalogue management",
                  feedback: "Demo feedback",
                }[view],
              )}
            </h1>
            <div className={styles.demoHeaderMeta}>
              <span>{t(DEMO_ENVIRONMENT_LABEL)}</span>
              <small>{DEMO_VERSION}</small>
            </div>
          </div>
          <GlobalSearch onSelect={selectGlobalSearchResult} />
          <div className={styles.topActions}>
            {dashboardSync && (
              <button
                className={styles.headerSyncStatus}
                type="button"
                data-status={dashboardSync.safe_status}
                disabled={!dashboardSync.can_open_details}
                onClick={() =>
                  dashboardSync.can_open_details &&
                  router.push("/admin/settings/data-sync")
                }
                title={t("Stock and price synchronization status")}
              >
                <i aria-hidden="true" />
                <span>{t(dashboardSync.display_label)}</span>
              </button>
            )}
            <LanguageSwitcher />
            {["overview", "products", "categories", "activity"].includes(
              view,
            ) && (
              <button
                className={styles.refreshButton}
                type="button"
                onClick={() => refreshWorkspace()}
                disabled={isRefreshing}
              >
                {isRefreshing ? t("Refreshing...") : t("Refresh data")}
              </button>
            )}
            <button
              className={styles.avatarButton}
              type="button"
              onClick={handleLogout}
              title={t("Sign out")}
            >
              <span>{user.full_name.slice(0, 1).toUpperCase()}</span>
              <div>
                <strong>{user.full_name}</strong>
                <small>{t("Sign out")}</small>
              </div>
            </button>
          </div>
        </header>

        <div className={styles.demoReviewBanner} role="note">
          <span aria-hidden="true">
            <T>i</T>
          </span>
          <p>{t(DEMO_REVIEW_MESSAGE)}</p>
          <strong>{DEMO_VERSION}</strong>
        </div>

        {error && (
          <div className={styles.pageError} role="alert">
            <span>!</span>
            {error}
            <button type="button" onClick={() => setError("")}>
              {t("Dismiss")}
            </button>
          </div>
        )}

        <div className={styles.mainContent}>
          {view === "overview" && (
            <DashboardOverviewPanel
              user={user}
              overview={overview}
              loading={isOverviewLoading}
              syncing={isGeneratingFromErp}
              onOpenProductQueue={openDashboardProductQueue}
              onOpenProduct={(productId) => void openProduct(productId)}
              onOpenCatalogues={openDashboardCatalogues}
              onOpenUsers={() => selectSidebarView("users")}
              onAddProduct={addProductFromDashboard}
              onRunSync={() => void generateProductsFromErp()}
            />
          )}

          {view === "overview" && !overview && !isOverviewLoading && (
            <>
              <section className={styles.welcomeCard}>
                <div>
                  <p>
                    {t(
                      "Good catalogue work starts with clear product stories.",
                    )}
                  </p>
                  <h2>
                    {t("Welcome back, {{name}}.", {
                      name: user.full_name.split(" ")[0],
                    })}
                  </h2>
                  <span>
                    {stats.in_review
                      ? t(
                          stats.in_review === 1
                            ? "{{count}} product waiting for review."
                            : "{{count}} products waiting for review.",
                          { count: stats.in_review },
                        )
                      : t("Your review queue is clear.")}
                  </span>
                </div>
                <div
                  className={styles.completionRing}
                  style={{
                    background: `conic-gradient(#32b768 0% ${Math.min(100, Math.max(0, stats.completion_rate))}%, #e5f7eb ${Math.min(100, Math.max(0, stats.completion_rate))}% 100%)`,
                  }}
                >
                  <strong>{stats.completion_rate}%</strong>
                  <span>{t("Content ready")}</span>
                </div>
              </section>

              <section className={styles.metricGrid}>
                <article>
                  <span>{t("Total products")}</span>
                  <strong>{stats.total_products}</strong>
                  <small>{t("ERP product records")}</small>
                </article>
                <article>
                  <span>{t("Published")}</span>
                  <strong>{dashboardPublishedCount}</strong>
                  <small>{t("Active ERP products")}</small>
                </article>
                <article>
                  <span>{t("In review")}</span>
                  <strong>{stats.in_review}</strong>
                  <small>{t("Waiting for approval")}</small>
                </article>
                <article>
                  <span>{t("Needs media")}</span>
                  <strong>{stats.missing_images}</strong>
                  <small>{t("Products without images")}</small>
                </article>
              </section>

              <section
                className={styles.overviewQuickActions}
                aria-label={t("Quick actions")}
              >
                <strong>{t("Quick actions")}</strong>
                <button
                  type="button"
                  onClick={() => void openLifecycleQueue("active")}
                >
                  <span>{t("Active products")}</span>
                  <b>{stats.active_products ?? stats.total_products}</b>
                </button>
                {canViewInactive && (
                  <button
                    type="button"
                    onClick={() => void openLifecycleQueue("inactive")}
                  >
                    <span>{t("Inactive products")}</span>
                    <b>{stats.inactive_products ?? 0}</b>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void openReadinessQueue("image")}
                >
                  <span>{t("Missing images")}</span>
                  <b>{stats.missing_images}</b>
                </button>
                {canViewCatalogues && (
                  <button
                    type="button"
                    onClick={() => selectNavigationView("catalogues")}
                  >
                    <span>{t("Catalogues")}</span>
                    <b aria-hidden="true">→</b>
                  </button>
                )}
              </section>

              {stats.inactive_products !== null && (
                <section
                  className={styles.syncMetricGrid}
                  aria-label="Product lifecycle and synchronization metrics"
                >
                  <article>
                    <span>
                      <T>Active products</T>
                    </span>
                    <strong>{stats.active_products}</strong>
                    <small>
                      <T>Available for catalogue use</T>
                    </small>
                  </article>
                  <article>
                    <span>
                      <T>Inactive products</T>
                    </span>
                    <strong>{stats.inactive_products}</strong>
                    <small>
                      <T>Retained but customer-hidden</T>
                    </small>
                  </article>
                  {stats.products_missing_from_source !== null && (
                    <article>
                      <span>
                        <T>Missing from ERP</T>
                      </span>
                      <strong>{stats.products_missing_from_source}</strong>
                      <small>
                        <T>Records retained for review</T>
                      </small>
                    </article>
                  )}
                  {stats.products_with_stale_stock !== null && (
                    <article>
                      <span>
                        <T>Stale stock / prices</T>
                      </span>
                      <strong>
                        {stats.products_with_stale_stock} /{" "}
                        {stats.products_with_stale_prices ?? 0}
                      </strong>
                      <small>
                        {stats.last_successful_sync
                          ? t("Last sync {{date}}", {
                              date: formatDateTime(
                                stats.last_successful_sync,
                                locale,
                              ),
                            })
                          : t("No successful source sync recorded")}
                      </small>
                    </article>
                  )}
                </section>
              )}

              <div className={styles.overviewGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <span>
                        <T>Publishing workflow</T>
                      </span>
                      <h3>
                        <T>Content pipeline</T>
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectNavigationView("products")}
                    >
                      <T>View products</T>
                    </button>
                  </div>
                  <div className={styles.pipeline}>
                    {[
                      ["Draft", stats.draft, "draft"],
                      ["In review", stats.in_review, "in_review"],
                      ["Approved", stats.approved, "approved"],
                      ["Published", dashboardPublishedCount, "published"],
                    ].map(([label, count, statusName]) => (
                      <button
                        key={String(label)}
                        type="button"
                        onClick={() =>
                          void openWorkflowQueue(String(statusName))
                        }
                      >
                        <span>{t(String(label))}</span>
                        <strong>{count}</strong>
                        <i
                          style={{
                            width: `${Math.max(
                              8,
                              (Number(count) /
                                Math.max(1, stats.total_products)) *
                                100,
                            )}%`,
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </section>

                <section className={styles.panel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <span>
                        <T>Quality checks</T>
                      </span>
                      <h3>
                        <T>Needs attention</T>
                      </h3>
                    </div>
                  </div>
                  <div className={styles.attentionList}>
                    {(reviewProducts.length
                      ? reviewProducts
                      : incompleteProducts
                    )
                      .slice(0, 4)
                      .map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => openProduct(product.id)}
                        >
                          <ProductThumb product={product} />
                          <span>
                            <strong>{productDisplayName(product)}</strong>
                            <small>
                              {t(
                                product.workflow_status === "in_review"
                                  ? "Ready for review"
                                  : !product.primary_image_url
                                    ? "Missing product image"
                                    : "Content incomplete",
                              )}
                            </small>
                          </span>
                          <b>›</b>
                        </button>
                      ))}
                    {!reviewProducts.length && !incompleteProducts.length && (
                      <div className={styles.emptyState}>
                        <T>No quality issues found.</T>
                      </div>
                    )}
                  </div>
                </section>
              </div>

              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <span>
                      <T>Recent products</T>
                    </span>
                    <h3>
                      <T>Catalogue snapshot</T>
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => selectNavigationView("products")}
                  >
                    <T>Open library</T>
                  </button>
                </div>
                <div className={styles.compactProductGrid}>
                  {products.items.slice(0, 4).map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => openProduct(product.id)}
                    >
                      <ProductThumb product={product} />
                      <span>
                        <small>{product.sku}</small>
                        <strong>{productDisplayName(product)}</strong>
                        <StatusBadge status={product.workflow_status} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {view === "products" && (
            <section className={styles.productPanel}>
              <div className={styles.catalogueBuilder}>
                <div className={styles.builderIntro}>
                  <span>{t("Catalogue builder")}</span>
                  <h2>{t("Complete products one step at a time")}</h2>
                  <p>
                    {t(
                      "Open a work queue, select a product, add its customer content and media, then submit it for publishing.",
                    )}
                  </p>
                  <div className={styles.builderActions}>
                    {canEditMasterData && (
                      <button
                        className={`${styles.primaryButton} ${styles.newProductButton}`}
                        type="button"
                        onClick={() => {
                          setSelectedProduct(null);
                          setIsCreatingProduct(true);
                        }}
                      >
                        + {t("New product")}
                      </button>
                    )}
                    {canRunDataSync && (
                      <button
                        className={styles.secondaryButton}
                        type="button"
                        onClick={() => void generateProductsFromErp()}
                        disabled={isGeneratingFromErp || isRefreshing}
                      >
                        {isGeneratingFromErp
                          ? t("Generating from ERP...")
                          : t("Generate products from ERP")}
                      </button>
                    )}
                  </div>
                </div>
                <div className={styles.builderQueues}>
                  {(
                    [
                      [
                        "description",
                        "Missing descriptions",
                        stats.missing_descriptions,
                      ],
                      ["image", "Missing images", stats.missing_images],
                      [
                        "category",
                        "Missing categories",
                        stats.missing_categories,
                      ],
                      ["ready", "Ready products", stats.ready_products],
                    ] as const
                  ).map(([queue, label, count]) => (
                    <button
                      key={String(queue)}
                      type="button"
                      data-active={needsFilter === queue}
                      onClick={() => void openReadinessQueue(queue)}
                    >
                      <strong>{count}</strong>
                      <span>{t(label)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {categoryFilter && (
                <div className={styles.categoryContext}>
                  <div>
                    <span>{t("Category product list")}</span>
                    <h2>
                      {categories.find(
                        (category) => String(category.id) === categoryFilter,
                      )?.name ?? "Selected category"}
                    </h2>
                    <p>
                      {t(
                        "Select a product to add images, descriptions, details, categories and publishing information.",
                      )}
                    </p>
                  </div>
                  <button type="button" onClick={() => void showAllProducts()}>
                    {t("Show all products")}
                  </button>
                </div>
              )}
              <form className={styles.filterBar} onSubmit={handleSearch}>
                <label className={styles.searchBox}>
                  <span aria-hidden="true">⌕</span>
                  <input
                    type="search"
                    placeholder={t("Search by product, SKU, brand or barcode")}
                    value={query}
                    onChange={(event) =>
                      handleProductSearchChange(event.target.value)
                    }
                  />
                </label>
                <select
                  aria-label="Product lifecycle status"
                  value={productStatusFilter}
                  onChange={(event) => {
                    const value = event.target.value as
                      | "active"
                      | "inactive"
                      | "all";
                    setProductStatusFilter(value);
                    void loadProductList({ productStatus: value });
                  }}
                >
                  <option value="active">{t("Active products")}</option>
                  {canViewInactive && (
                    <option value="inactive">{t("Inactive products")}</option>
                  )}
                  {canViewInactive && (
                    <option value="all">{t("Active and inactive")}</option>
                  )}
                </select>
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setStatusFilter(value);
                    void loadProductList({ status: value });
                  }}
                >
                  <option value="">{t("All workflow states")}</option>
                  <option value="draft">{t("Draft")}</option>
                  <option value="in_review">{t("In review")}</option>
                  <option value="approved">{t("Approved")}</option>
                  <option value="published">{t("Published")}</option>
                </select>
                <select
                  value={categoryFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setCategoryFilter(value);
                    void loadProductList({ categoryId: value });
                  }}
                >
                  <option value="">{t("All categories")}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <select
                  value={brandFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setBrandFilter(value);
                    void loadProductList({ brand: value });
                  }}
                >
                  <option value="">{t("All brands")}</option>
                  {products.brands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
                {canViewPricing && (
                  <select
                    aria-label={t("Customer price level")}
                    value={priceLevelFilter}
                    onChange={(event) =>
                      void changeProductPriceLevel(event.target.value)
                    }
                  >
                    {!priceMappings.length && (
                      <option value="">{t("Customer price")}</option>
                    )}
                    {priceMappings.map((mapping) => (
                      <option
                        key={mapping.audience_type_id}
                        value={mapping.audience_type_id}
                      >
                        {t(
                          customerPriceLabel(
                            mapping.audience_name,
                            mapping.audience_code,
                          ),
                        )}
                      </option>
                    ))}
                  </select>
                )}
                <select
                  value={needsFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setNeedsFilter(value);
                    void loadProductList({ needs: value });
                  }}
                >
                  <option value="">{t("All completion states")}</option>
                  <option value="description">
                    {t("Missing description")}
                  </option>
                  <option value="image">{t("Missing image")}</option>
                  <option value="category">{t("Missing category")}</option>
                  <option value="ready">{t("Ready for workflow")}</option>
                  <option value="video">{t("Has video")}</option>
                  <option value="missing_video">{t("Missing video")}</option>
                  <option value="video_processing">
                    {t("Video processing")}
                  </option>
                  <option value="video_failed">{t("Video failed")}</option>
                  <option value="video_visible">
                    {t("Video visible in catalogue")}
                  </option>
                  <option value="video_hidden">{t("Video hidden")}</option>
                </select>
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={clearProductFilters}
                  disabled={isRefreshing}
                >
                  {t("Clear filters")}
                </button>
              </form>

              <div className={styles.tableMeta}>
                <span>
                  <strong>{products.total}</strong> {t("products")}
                </span>
                <small>
                  {canEditMasterData
                    ? t("Product data and catalogue content are editable")
                    : t("Select a product to complete its catalogue content")}
                </small>
              </div>

              <div className={styles.productTable}>
                <div className={styles.tableHead}>
                  <span>{t("Product")}</span>
                  <span>{t("Category")}</span>
                  <span>{t("Stock")}</span>
                  <span>{t("Price")}</span>
                  <span>{t("Lifecycle / Workflow")}</span>
                </div>
                {products.items.map((product) => (
                  <div
                    className={styles.tableRow}
                    key={product.id}
                    onClick={() => openProduct(product.id)}
                    onKeyDown={(event) => {
                      if (
                        event.target === event.currentTarget &&
                        (event.key === "Enter" || event.key === " ")
                      ) {
                        event.preventDefault();
                        void openProduct(product.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <span className={styles.productCell}>
                      <ProductThumb product={product} />
                      <span>
                        <strong>{productDisplayName(product)}</strong>
                        {canViewVideos && product.has_video && (
                          <span
                            className={styles.videoIndicator}
                            data-available="true"
                          >
                            <T>▶ Video</T>
                          </span>
                        )}
                        <small>
                          {product.sku} · {product.brand || "Unbranded"}
                        </small>
                        <em>
                          {product.short_description ||
                            t("No description yet — select to add details")}
                        </em>
                      </span>
                    </span>
                    <span>
                      {product.category_names.join(", ") || t("Uncategorised")}
                    </span>
                    <span
                      className={`${styles.stockCell} ${
                        product.stock_quantity === 0 ? styles.outOfStock : ""
                      }`}
                    >
                      <strong>{product.stock_quantity}</strong>
                      <small>
                        {product.stock_last_synced_at
                          ? t("Last synchronized: {{date}}", {
                              date: formatDate(
                                product.stock_last_synced_at,
                                locale,
                              ),
                            })
                          : t("Not synchronized")}
                      </small>
                    </span>
                    <span className={styles.productPriceCell}>
                      <strong>
                        {formatPrice(product.price, product.price_currency)}
                      </strong>
                      <small>
                        {t(
                          customerPriceLabel(
                            priceMappings.find(
                              (mapping) =>
                                String(mapping.audience_type_id) ===
                                priceLevelFilter,
                            )?.audience_name || product.price_list_name,
                            priceMappings.find(
                              (mapping) =>
                                String(mapping.audience_type_id) ===
                                priceLevelFilter,
                            )?.audience_code,
                          ),
                        )}
                      </small>
                    </span>
                    <span className={styles.lifecycleCell}>
                      <ProductLifecycleBadge status={product.product_status} />
                      <StatusBadge status={product.workflow_status} />
                      <small>
                        {t(productLifecycleSource(product))}
                        {product.legacy_catalogue_present
                          ? ` · ${t("Legacy catalogue included")}`
                          : ""}
                      </small>
                      {product.product_status === "inactive" &&
                        (product.inactive_note || product.inactive_reason) && (
                          <small className={styles.statusReason}>
                            {product.inactive_note || product.inactive_reason}
                          </small>
                        )}
                      {canChangeStatus && (
                        <span
                          className={styles.inlineStatusControl}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <EntityStatusControl
                            entityType="product"
                            entityName={productDisplayName(product)}
                            isActive={product.product_status === "active"}
                            inactiveReason={
                              product.inactive_note || product.inactive_reason
                            }
                            disabled={updatingProductId === product.id}
                            onChange={(isActive, reason) =>
                              handleProductStatusChange(
                                product,
                                isActive,
                                reason,
                              )
                            }
                          />
                        </span>
                      )}
                    </span>
                  </div>
                ))}
                {!products.items.length && (
                  <div className={styles.emptyState}>
                    {t("No products match these filters.")}
                  </div>
                )}
              </div>

              {products.pages > 1 && (
                <div className={styles.pagination}>
                  <button
                    type="button"
                    disabled={products.page <= 1}
                    onClick={() => refreshWorkspace(products.page - 1)}
                  >
                    {t("Previous")}
                  </button>
                  <span>
                    {t("Page {{page}} of {{pages}}", {
                      page: products.page,
                      pages: products.pages,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={products.page >= products.pages}
                    onClick={() => refreshWorkspace(products.page + 1)}
                  >
                    {t("Next")}
                  </button>
                </div>
              )}
            </section>
          )}

          {view === "categories" && (
            <div className={styles.categoryLayout}>
              <CategoryManagement
                categories={categories}
                canEdit={canEditCategories}
                canEditBrands={canEditBrands}
                updatingCategoryId={updatingCategoryId}
                updatingBrandId={updatingBrandId}
                onOpen={(category, brand) =>
                  void openCategoryProducts(category, brand)
                }
                onStatusChange={handleCategoryStatusChange}
                onBrandStatusChange={handleBrandStatusChange}
              />

              {canEditCategories && (
                <section className={`${styles.panel} ${styles.createCategory}`}>
                  <div className={styles.panelHeader}>
                    <div>
                      <span>{t("New taxonomy term")}</span>
                      <h3>{t("Create category")}</h3>
                    </div>
                  </div>
                  <form onSubmit={handleCreateCategory}>
                    <label className={styles.inputGroup}>
                      <span>{t("Category name")}</span>
                      <input
                        value={newCategoryName}
                        onChange={(event) =>
                          setNewCategoryName(event.target.value)
                        }
                        minLength={2}
                        maxLength={100}
                        required
                        placeholder={t("e.g. Frozen Foods")}
                      />
                    </label>
                    <label className={styles.inputGroup}>
                      <span>{t("Description")}</span>
                      <textarea
                        rows={5}
                        value={newCategoryDescription}
                        onChange={(event) =>
                          setNewCategoryDescription(event.target.value)
                        }
                        maxLength={320}
                        placeholder={t(
                          "Describe what belongs in this category.",
                        )}
                      />
                    </label>
                    <button className={styles.primaryButton} type="submit">
                      {t("Create category")}
                    </button>
                  </form>
                </section>
              )}
            </div>
          )}

          {view === "activity" && (
            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <div>
                  <span>{t("Audit trail")}</span>
                  <h3>{t("Recent catalogue activity")}</h3>
                </div>
                <small>
                  {activity.length} {t("events")}
                </small>
              </div>
              <div className={styles.activityList}>
                {activity.map((item) => (
                  <article key={item.id}>
                    <div className={styles.activityDot} />
                    <div>
                      <strong>{humanizeAction(item.action)}</strong>
                      <span>
                        {item.user_name || "System"}
                        {item.identifier ? ` · ${item.identifier}` : ""}
                      </span>
                    </div>
                    <time>{formatDateTime(item.created_at, locale)}</time>
                  </article>
                ))}
                {!activity.length && (
                  <div className={styles.emptyState}>
                    {t("Catalogue activity will appear here.")}
                  </div>
                )}
              </div>
            </section>
          )}

          {view === "users" && canManageUsers && (
            <UserManagement
              key={`users-${viewResetKey}`}
              currentUser={user}
              onToast={setToast}
            />
          )}

          {view === "organization" && canManageOrganization && (
            <OrganizationManagement
              key={`organization-${viewResetKey}`}
              currentUser={user}
              onToast={setToast}
            />
          )}

          {view === "pricing" && canViewPricing && (
            <PriceManagement
              key={`pricing-${viewResetKey}`}
              currentUser={user}
              onToast={setToast}
            />
          )}

          {view === "catalogues" && canViewCatalogues && (
            <CatalogueManagement
              key={`catalogues-${viewResetKey}`}
              currentUser={user}
              onToast={setToast}
            />
          )}

          {view === "feedback" && canViewFeedback && (
            <FeedbackManagement
              key={`feedback-${viewResetKey}`}
              currentUser={user}
              canManage={canManageFeedback}
              onToast={setToast}
            />
          )}
        </div>
      </div>

      {selectedProduct && (
        <ProductEditor
          key={`${selectedProduct.id}-${selectedProduct.version}-${selectedProduct.images.length}-${selectedProduct.videos.length}-${selectedProduct.status_updated_at}`}
          product={selectedProduct}
          categories={categories}
          canApprove={canApprove}
          canEditCatalogue={canEditCatalogue}
          canEditMasterData={canEditMasterData}
          canChangeStatus={canChangeStatus}
          canViewVideos={canViewVideos}
          canManageVideos={canManageVideos}
          canDeleteVideos={canDeleteVideos}
          canPublishVideos={canPublishVideos}
          onClose={() => setSelectedProduct(null)}
          onUpdated={handleProductUpdated}
        />
      )}

      {isCreatingProduct && canEditMasterData && (
        <ProductCreateModal
          categories={categories}
          canManageVideos={canManageVideos}
          onClose={() => setIsCreatingProduct(false)}
          onCreated={handleProductCreated}
        />
      )}

      {toast && (
        <div className={styles.toast} role="status">
          <span>✓</span>
          {toast}
        </div>
      )}
    </main>
  );
}
