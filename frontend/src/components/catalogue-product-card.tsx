"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import {
  API_ORIGIN,
  type CataloguePreview,
  type CataloguePreviewProduct,
} from "@/lib/api";
import { NO_PRODUCT_IMAGE_URL, productImageUrls } from "@/lib/product-image";
import { useLanguage } from "@/lib/i18n";
import type { CatalogueImageSelection } from "./catalogue-image-dialog";
import styles from "./catalogue-product-card.module.css";

type CatalogueCardTheme = NonNullable<CataloguePreview["product_card_theme"]>;

function mediaUrl(path?: string | null) {
  if (!path) return NO_PRODUCT_IMAGE_URL;
  if (path === NO_PRODUCT_IMAGE_URL || path.startsWith("http")) return path;
  return `${API_ORIGIN}${path}`;
}

function formatMoney(
  value: string | null | undefined,
  currency: string | undefined,
  locale: string,
) {
  if (value == null) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return null;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency || "THB",
  }).format(amount);
}

function detailValue(product: CataloguePreviewProduct, key: string) {
  const value = product.erp_details?.[key]?.trim();
  return value || null;
}

function hasPurchaseOrderQuantity(value: string | null) {
  if (!value) return false;
  const quantity = Number(value.replace(/,/g, ""));
  return Number.isFinite(quantity) ? quantity > 0 : true;
}

function inTransitOrderValue(
  product: CataloguePreviewProduct,
  translate: (key: string) => string,
) {
  const combined = detailValue(product, "intransit_order") || detailValue(product, "in_transit_order");
  if (combined) return combined;
  const inTransit = detailValue(product, "in_transit") || detailValue(product, "goods_in_transit");
  const ordered = detailValue(product, "ordered") || detailValue(product, "goods_ordered");
  const statuses = [
    hasPurchaseOrderQuantity(inTransit) ? `${translate("In Transit")} ${inTransit}` : null,
    hasPurchaseOrderQuantity(ordered) ? `${translate("Ordered")} ${ordered}` : null,
  ].filter(Boolean);
  return statuses.length ? statuses.join(" / ") : "—";
}

export function CatalogueProductCard({
  product,
  showPrices,
  catalogueCurrency,
  locale,
  onOpenImages,
  canManageStatus = false,
  statusUpdating = false,
  onStatusChange,
  retailPriceOverride,
}: {
  product: CataloguePreviewProduct;
  showPrices: boolean;
  catalogueCurrency?: string;
  locale: string;
  onPlay?: (button: HTMLButtonElement) => void;
  onOpenImages?: (selection: CatalogueImageSelection) => void;
  cardStyle?: "standard" | "erp_detail";
  cardTheme?: CatalogueCardTheme | null;
  canManageStatus?: boolean;
  statusUpdating?: boolean;
  onStatusChange?: (status: "active" | "inactive") => void;
  retailPriceOverride?: string | null;
}) {
  const { language, t } = useLanguage();
  const [imageIndex, setImageIndex] = useState(0);
  const sourceImages = productImageUrls(product.image_urls, product.main_image_url)
    .filter((url) => url !== NO_PRODUCT_IMAGE_URL);
  const images = (sourceImages.length ? sourceImages : [NO_PRODUCT_IMAGE_URL]).map(mediaUrl);
  const imageCount = images.length;
  const safeImageIndex = Math.max(0, Math.min(images.length - 1, imageIndex));
  const name =
    (language === "th"
      ? product.name_th || product.name || product.name_en
      : product.name_en || product.name || product.name_th) || t("Product");
  const model = detailValue(product, "model") || product.code || "—";
  const warranty = detailValue(product, "warranty") || "—";
  const wholesalePrice = formatMoney(
    product.wholesale_price,
    product.currency || catalogueCurrency,
    locale,
  );
  const onlinePrice = formatMoney(
    product.online_price,
    product.currency || catalogueCurrency,
    locale,
  );
  const retailPrice = formatMoney(
    retailPriceOverride === undefined ? product.retail_price : retailPriceOverride,
    product.currency || catalogueCurrency,
    locale,
  );
  const isActive = product.product_status !== "inactive";
  const nextStatus = isActive ? "inactive" : "active";
  const statusLabel = statusUpdating
    ? t("Updating {{product}} status", { product: name })
    : t("Set {{product}} {{status}}", { product: name, status: nextStatus });

  useEffect(() => {
    if (imageCount < 2) return;
    const timer = window.setInterval(() => {
      setImageIndex((current) => (current + 1) % imageCount);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [imageCount]);

  return (
    <article
      className={styles.card}
      data-catalogue-product-card
      data-card-template="catalogue-reference"
      data-order={product.display_order}
      data-product-status={canManageStatus ? product.product_status : undefined}
    >
      {canManageStatus && !isActive && (
        <strong className={styles.inactiveRibbon}>INACTIVE</strong>
      )}
      <div className={styles.imageWell}>
        <img src={images[safeImageIndex]} alt={name} loading="lazy" />
        {sourceImages.length > 0 && onOpenImages && (
          <button
            type="button"
            className={styles.imageOpenButton}
            aria-label={t("View and download images for {{product}}", { product: name })}
            onClick={(event) => onOpenImages({
              productName: name,
              productCode: product.code,
              images: images.map((url, index) => ({
                url,
                altText: `${name} image ${index + 1}`,
              })),
              index: safeImageIndex,
              returnFocus: event.currentTarget,
            })}
          />
        )}
        {sourceImages.length > 0 && (
          <small className={styles.imageCount} aria-label={`${safeImageIndex + 1} of ${imageCount} images`}>
            {safeImageIndex + 1}/{imageCount}
          </small>
        )}
      </div>

      <header className={styles.identity}>
        <h3>{name}</h3>
      </header>

      <div className={styles.details}>
        <div className={styles.metadata}>
          <span>{model}</span>
          <span>{warranty}</span>
        </div>

        {canManageStatus && onStatusChange && (
          <div className={styles.statusControl}>
            <span>{t("Product status")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              aria-label={statusLabel}
              disabled={statusUpdating}
              onClick={() => onStatusChange(nextStatus)}
            >
              <i aria-hidden="true" />
              <strong>{t(isActive ? "Active" : "Inactive")}</strong>
            </button>
          </div>
        )}

        <dl className={styles.facts} aria-label={t("Product stock and pricing")}>
          <div>
            <dt>{t("Stock")}</dt>
            <dd className={styles.liveStock} aria-live="polite">
              {product.stock_quantity === null || product.stock_quantity === undefined ? "—" : (
                <><i aria-hidden="true" />{product.stock_quantity.toLocaleString(locale)} {t("available")}</>
              )}
            </dd>
          </div>
          <div>
            <dt>{t("Barcode")}</dt>
            <dd>{product.barcode || "—"}</dd>
          </div>
          {showPrices && (
            <>
              <div>
                <dt>{t("Wholesale price")}</dt>
                <dd>{wholesalePrice || "—"}</dd>
              </div>
              <div>
                <dt className={styles.onlinePriceLabel}>
                  {t("Online price")}
                  <img src="/branding/shopee-logo.svg" alt="Shopee" />
                </dt>
                <dd>{onlinePrice || "—"}</dd>
              </div>
            </>
          )}
          <div>
            <dt>{t("Intransit / Order")}</dt>
            <dd>{inTransitOrderValue(product, t)}</dd>
          </div>
        </dl>
      </div>

      {showPrices && (
        <div className={styles.retailPrice} aria-label={`${t("Retail price")}: ${retailPrice || "—"}`}>
          <small>{t("Retail price")}</small>
          <strong>{retailPrice || "—"}</strong>
        </div>
      )}
    </article>
  );
}
