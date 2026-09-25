"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { ApplicationLogo } from "@/components/application-logo";
import {
  API_ORIGIN,
  API_URL,
  ApiError,
  getPublicPromotion,
  type PublicPromotion,
} from "@/lib/api";
import { T, LanguageSwitcher, useLanguage } from "@/lib/i18n";
import styles from "../../promotions/promotions.module.css";

function asset(value: string | null) {
  if (!value) return null;
  return value.startsWith("http") ? value : `${API_ORIGIN}${value}`;
}
function money(value: string | null, currency: string | null, locale: string) {
  return value == null
    ? ""
    : new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency || "THB",
      }).format(Number(value));
}
function videoPlayback(value: string | null) {
  const resolved = asset(value);
  if (!resolved) return null;
  try {
    const url = new URL(resolved);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const id =
        url.searchParams.get("v") ||
        url.pathname.split("/").filter(Boolean).pop();
      if (id)
        return {
          embed: true,
          src: `https://www.youtube-nocookie.com/embed/${id}`,
        };
    }
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      if (id)
        return {
          embed: true,
          src: `https://www.youtube-nocookie.com/embed/${id}`,
        };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = url.pathname
        .split("/")
        .filter(Boolean)
        .findLast((part) => /^\d+$/.test(part));
      if (id)
        return { embed: true, src: `https://player.vimeo.com/video/${id}` };
    }
  } catch {}
  return { embed: false, src: resolved };
}

export function PublicPromotionViewer({ token }: { token: string }) {
  const { language, locale, t } = useLanguage();
  const [promotion, setPromotion] = useState<PublicPromotion | null>(null);
  const [error, setError] = useState("");
  const thai = language === "th";
  useEffect(() => {
    getPublicPromotion(token)
      .then(setPromotion)
      .catch((error) =>
        setError(
          error instanceof ApiError
            ? error.message
            : "This promotion is unavailable.",
        ),
      );
  }, [token]);
  if (error)
    return (
      <main className={styles.public}>
        <div className={styles.publicMain}>
          <div className={styles.error}>{error}</div>
        </div>
      </main>
    );
  if (!promotion)
    return (
      <main className={styles.public}>
        <div className={styles.empty}>{t("Loading promotion…")}</div>
      </main>
    );
  const title =
    thai && promotion.name_th ? promotion.name_th : promotion.name_en;
  const description =
    thai && promotion.description_th
      ? promotion.description_th
      : promotion.description_en;
  const terms =
    thai && promotion.terms_th ? promotion.terms_th : promotion.terms_en;
  const video = videoPlayback(promotion.video_url);
  return (
    <main className={styles.public}>
      <header className={styles.publicHeader}>
        <span style={{ width: 120 }}>
          <ApplicationLogo />
        </span>
        <div className={styles.buttons}>
          <LanguageSwitcher />
          {promotion.allow_pdf && (
            <a
              className={styles.button}
              href={`${API_URL}/v1/public/promotions/${encodeURIComponent(token)}/pdf`}
            >
              {t("Download PDF")}
            </a>
          )}
          {promotion.allow_print && (
            <button className={styles.button} onClick={() => window.print()}>
              {t("Print")}
            </button>
          )}
        </div>
      </header>
      <div className={styles.publicMain}>
        <section
          className={styles.previewHero}
          style={
            promotion.banner_url
              ? {
                  backgroundImage: `linear-gradient(90deg,#073b27d9,#073b2770),url(${asset(promotion.banner_url)})`,
                }
              : undefined
          }
        >
          <span>{t(promotion.occasion_name || "Special Promotion")}</span>
          <h2>{title}</h2>
          <p>{promotion.short_title || description}</p>
          <small>
            {new Date(promotion.start_at).toLocaleString(locale)} –{" "}
            {new Date(promotion.end_at).toLocaleString(locale)} ·{" "}
            {t(promotion.audience)}
          </small>
        </section>
        {video && (
          <section className={styles.promotionVideo}>
            {video.embed ? (
              <iframe
                src={video.src}
                title={`${title} video`}
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <video controls preload="metadata" src={video.src}>
                <T>Your browser does not support this promotion video.</T>
              </video>
            )}
          </section>
        )}
        <section>
          <div className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>{t("ELIGIBLE PRODUCTS")}</span>
              <h2>
                {promotion.products.length} {t("products")}
              </h2>
            </div>
          </div>
          <div className={styles.publicGrid}>
            {promotion.products.map((product) => (
              <article className={styles.previewProduct} key={product.id}>
                {product.image_url ? (
                  <img
                    src={asset(product.image_url) || ""}
                    alt={product.name}
                  />
                ) : (
                  <div className={styles.placeholder}>{product.name[0]}</div>
                )}
                <small>
                  {product.code} · {product.brand}
                </small>
                <h3>
                  {thai && product.name_th ? product.name_th : product.name}
                </h3>
                {product.out_of_stock && (
                  <span className={styles.chip}>{t("Out of stock")}</span>
                )}
                {promotion.show_prices ? (
                  <>
                    <div>
                      <span className={styles.oldPrice}>
                        {money(product.base_price, product.currency, locale)}
                      </span>
                      <span className={styles.promoPrice}>
                        {money(
                          product.promotion_price,
                          product.currency,
                          locale,
                        )}
                      </span>
                    </div>
                    {product.discount_percent && (
                      <p>
                        {t("Save")}{" "}
                        {Number(product.discount_percent).toFixed(0)}%
                      </p>
                    )}
                  </>
                ) : (
                  <strong className={styles.promoPrice}>
                    {t(product.price_message || "Special Promotion")}
                  </strong>
                )}
              </article>
            ))}
          </div>
        </section>
        {terms && (
          <section className={styles.panel}>
            <span className={styles.eyebrow}>{t("TERMS AND CONDITIONS")}</span>
            <p style={{ whiteSpace: "pre-wrap" }}>{terms}</p>
          </section>
        )}
      </div>
    </main>
  );
}
