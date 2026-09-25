"use client";

import Link from "next/link";
import Image from "next/image";
import { accountTypeLabel, canAccess, canAccessAny } from "@/lib/access";
import {
  API_ORIGIN,
  type AuthenticatedUser,
  type DashboardAttentionItem,
  type DashboardOverview,
} from "@/lib/api";
import { formatApiDate } from "@/lib/date-time";
import { useLanguage } from "@/lib/i18n";
import styles from "./dashboard.module.css";

type Props = {
  user: AuthenticatedUser;
  overview: DashboardOverview | null;
  loading: boolean;
  syncing: boolean;
  onOpenProductQueue: (filters: {
    productStatus?: "active" | "inactive" | "all";
    workflowStatus?: string;
    needs?: string;
  }) => void;
  onOpenProduct: (id: string) => void;
  onOpenCatalogues: (status?: string) => void;
  onOpenUsers: () => void;
  onAddProduct: () => void;
  onRunSync: () => void;
};

function greeting(now: Date) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function relativeSyncTime(value: string | null, locale: string) {
  if (!value) return "No successful synchronization yet";
  const date = new Date(value);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 60) return formatter.format(-seconds, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return formatter.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return formatter.format(-hours, "hour");
  return formatter.format(-Math.round(hours / 24), "day");
}

function imageUrl(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${API_ORIGIN}${value.startsWith("/") ? value : `/${value}`}`;
}

function SummarySkeleton() {
  return (
    <>
      <section className={styles.personalizedHeroSkeleton} aria-label="Loading dashboard overview" aria-busy="true" />
      <section className={styles.dashboardSummaryGrid} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div className={styles.dashboardCardSkeleton} key={index} />
        ))}
      </section>
    </>
  );
}

function attentionAction(
  item: DashboardAttentionItem,
  onOpenProductQueue: Props["onOpenProductQueue"],
  onOpenCatalogues: Props["onOpenCatalogues"],
) {
  if (item.target === "products") {
    onOpenProductQueue({ needs: item.filter_value });
  } else if (item.target === "catalogues") {
    onOpenCatalogues(item.filter_value);
  } else {
    window.location.assign(`/promotions?${item.filter_name}=${encodeURIComponent(item.filter_value)}`);
  }
}

export function DashboardOverviewPanel({
  user,
  overview,
  loading,
  syncing,
  onOpenProductQueue,
  onOpenProduct,
  onOpenCatalogues,
  onOpenUsers,
  onAddProduct,
  onRunSync,
}: Props) {
  const { locale, t } = useLanguage();
  if (loading) return <SummarySkeleton />;
  if (!overview) return null;

  const attentionTotal = overview.attention.reduce((total, item) => total + item.count, 0);
  const summaryCards = [
    {
      key: "active",
      label: "Active Products",
      value: overview.summary.active_products,
      support: "Available for catalogue use",
      icon: "AP",
      action: () => onOpenProductQueue({ productStatus: "active" }),
    },
    {
      key: "draft-catalogues",
      label: "Draft Catalogues",
      value: overview.summary.draft_catalogues,
      support: "Work still in progress",
      icon: "DC",
      action: () => onOpenCatalogues("draft"),
    },
    {
      key: "published-catalogues",
      label: "Published Catalogues",
      value: overview.summary.published_catalogues,
      support: "Available published versions",
      icon: "PC",
      action: () => onOpenCatalogues("published"),
    },
    {
      key: "promotions",
      label: "Active Promotions",
      value: overview.summary.active_promotions,
      support: "Running now",
      icon: "PR",
      action: () => window.location.assign("/promotions?status=active"),
    },
    {
      key: "approvals",
      label: "Pending My Approval",
      value: overview.summary.pending_my_approval,
      support: "Waiting for your decision",
      icon: "RV",
      action: () => onOpenProductQueue({ workflowStatus: "in_review" }),
    },
    ...(overview.attention.length ? [{
      key: "attention",
      label: "Products Requiring Attention",
      value: attentionTotal,
      support: "Images, prices or descriptions missing",
      icon: "!",
      action: () => onOpenProductQueue({}),
    }] : [{
      key: "inactive",
      label: "Inactive Products",
      value: overview.summary.inactive_products,
      support: "Retained and hidden from customers",
      icon: "IP",
      action: () => onOpenProductQueue({ productStatus: "inactive" as const }),
    }]),
  ].filter((card) => card.value !== null);

  const sync = overview.sync_status;
  const now = new Date();
  const firstName = user.full_name.trim().split(/\s+/)[0] || user.username;

  return (
    <div className={styles.modernOverview}>
      <section className={styles.personalizedHero}>
        <div>
          <span className={styles.eyebrow}>{t("Your catalogue workspace")}</span>
          <h2>{t("{{greeting}}, {{name}}", { greeting: t(greeting(now)), name: firstName })}</h2>
          <p>
            {[user.department, user.position, accountTypeLabel(user)].filter(Boolean).join(" · ") ||
              t("Your assigned catalogue workspace")}
          </p>
        </div>
        <button
          className={styles.heroSyncStatus}
          type="button"
          data-status={sync.safe_status}
          disabled={!sync.can_open_details}
          onClick={() => sync.can_open_details && window.location.assign("/admin/settings/data-sync")}
          aria-label={`${sync.display_label}. ${relativeSyncTime(sync.last_successful_at, locale)}`}
        >
          <i aria-hidden="true" />
          <span>
            <strong>{t(sync.display_label)}</strong>
            <small>{t("Last stock and price sync: {{time}}", { time: relativeSyncTime(sync.last_successful_at, locale) })}</small>
          </span>
          {sync.can_open_details && <b aria-hidden="true">›</b>}
        </button>
      </section>

      <section className={styles.permissionQuickActions} aria-labelledby="quick-actions-heading">
        <div className={styles.sectionHeadingCompact}>
          <div>
            <span className={styles.eyebrow}>{t("Get started")}</span>
            <h3 id="quick-actions-heading">{t("Quick Actions")}</h3>
          </div>
        </div>
        <div className={styles.quickActionGrid}>
          {canAccess(user, "products.create") && (
            <button type="button" data-primary="true" onClick={onAddProduct}>
              <strong>{t("Add Product")}</strong>
              <small>{t("Create a product master record")}</small>
            </button>
          )}
          {canAccessAny(user, ["catalogue_designs.create", "catalogue_designs.edit"]) && (
            <Link href="/catalogue-studio" target="_blank" rel="noopener noreferrer">
              <strong>{t("Open Catalogue Studio")}</strong>
              <small>{t("Design in a new tab")}</small>
            </Link>
          )}
          {canAccess(user, "promotions.create") && (
            <Link href="/promotions/new">
              <strong>{t("Create Promotion")}</strong>
              <small>{t("Plan dates and products")}</small>
            </Link>
          )}
          {canAccess(user, "product_images.upload") && (
            <button type="button" onClick={() => onOpenProductQueue({ needs: "image" })}>
              <strong>{t("Upload Product Images")}</strong>
              <small>{t("Open the missing-image queue")}</small>
            </button>
          )}
          {canAccess(user, "data_sync.run") && (
            <button type="button" disabled={syncing} onClick={onRunSync}>
              <strong>{syncing ? t("Synchronizing...") : t("Sync Data Now")}</strong>
              <small>{t("Refresh ERP product data")}</small>
            </button>
          )}
          {canAccess(user, "users.create") && (
            <button type="button" onClick={onOpenUsers}>
              <strong>{t("Create User")}</strong>
              <small>{t("Open user administration")}</small>
            </button>
          )}
          {canAccess(user, "system_metrics.view") && (
            <Link href="/admin/settings/system-health">
              <strong>{t("Open System Health")}</strong>
              <small>{t("Review service health")}</small>
            </Link>
          )}
        </div>
      </section>

      <section className={styles.dashboardSummaryGrid} aria-label={t("Workspace summary")}> 
        {summaryCards.map((card) => (
          <button type="button" key={card.key} onClick={card.action}>
            <span aria-hidden="true">{card.icon}</span>
            <small>{t(card.label)}</small>
            <strong>{card.value?.toLocaleString(locale)}</strong>
            <p>{t(card.support)}</p>
            <b aria-hidden="true">›</b>
          </button>
        ))}
      </section>

      {overview.product_metrics && (
        <div className={styles.dashboardInsightsGrid}>
          <section className={styles.dashboardSectionCard}>
            <div className={styles.sectionHeadingCompact}><div><span className={styles.eyebrow}>{t("Product quality")}</span><h3>{t("Product Readiness")}</h3></div><button type="button" onClick={() => onOpenProductQueue({})}>{t("View all products")}</button></div>
            <div className={styles.readinessPanel}>
              <div className={styles.readinessRing} style={{ "--readiness": `${overview.product_metrics.completion_rate}%` } as React.CSSProperties}>
                <strong>{Math.round(overview.product_metrics.completion_rate)}%</strong>
                <small>{t("ready")}</small>
              </div>
              <dl className={styles.readinessLegend}>
                <div><dt>{t("Active products")}</dt><dd>{overview.product_metrics.active_products.toLocaleString(locale)}</dd></div>
                <div><dt>{t("Missing images")}</dt><dd>{overview.product_metrics.missing_images.toLocaleString(locale)}</dd></div>
                <div><dt>{t("Missing descriptions")}</dt><dd>{overview.product_metrics.missing_descriptions.toLocaleString(locale)}</dd></div>
                <div><dt>{t("Missing categories")}</dt><dd>{overview.product_metrics.missing_categories.toLocaleString(locale)}</dd></div>
              </dl>
            </div>
          </section>
          <section className={styles.dashboardSectionCard}>
            <div className={styles.sectionHeadingCompact}><div><span className={styles.eyebrow}>{t("Catalogue workflow")}</span><h3>{t("Catalogue Status")}</h3></div><button type="button" onClick={() => onOpenCatalogues()}>{t("View all catalogues")}</button></div>
            <div className={styles.catalogueStatusPanel}>
              <strong>{((overview.summary.published_catalogues || 0) + (overview.summary.draft_catalogues || 0)).toLocaleString(locale)}<small>{t("Total")}</small></strong>
              <dl><div><dt>{t("Published")}</dt><dd>{overview.summary.published_catalogues?.toLocaleString(locale) || 0}</dd></div><div><dt>{t("Draft")}</dt><dd>{overview.summary.draft_catalogues?.toLocaleString(locale) || 0}</dd></div><div><dt>{t("Pending my approval")}</dt><dd>{overview.summary.pending_my_approval?.toLocaleString(locale) || 0}</dd></div></dl>
            </div>
          </section>
          <section className={styles.dashboardSectionCard}>
            <div className={styles.sectionHeadingCompact}><div><span className={styles.eyebrow}>{t("ERP connection")}</span><h3>{t("Stock & Price Synchronization")}</h3></div></div>
            <div className={styles.syncOverviewPanel}><span data-status={sync.safe_status}><i />{t(sync.display_label)}</span><p>{t("Last successful sync")} <strong>{relativeSyncTime(sync.last_successful_at, locale)}</strong></p>{canAccess(user, "data_sync.run") && <button type="button" disabled={syncing} onClick={onRunSync}>{syncing ? t("Synchronizing...") : t("Sync now")}</button>}</div>
          </section>
        </div>
      )}

      {overview.attention.length > 0 && (
        <section className={styles.attentionCardsSection} aria-labelledby="attention-heading">
          <div className={styles.sectionHeadingCompact}>
            <div><span className={styles.eyebrow}>{t("Data quality")}</span><h3 id="attention-heading">{t("Requires Attention")}</h3></div>
            <button type="button" onClick={() => onOpenProductQueue({})}>{t("View all products")}</button>
          </div>
          <div className={styles.attentionCardGrid}>
            {overview.attention.slice(0, 6).map((item) => (
              <button key={item.key} type="button" data-severity={item.severity} onClick={() => attentionAction(item, onOpenProductQueue, onOpenCatalogues)}>
                <span>{item.count.toLocaleString(locale)}</span><strong>{t(item.title)}</strong><small>{t(titleCase(item.severity))}</small><b aria-hidden="true">›</b>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className={styles.dashboardTwoColumn}>
        <section className={styles.dashboardSectionCard}>
          <div className={styles.sectionHeadingCompact}>
            <div><span className={styles.eyebrow}>{t("Personal queue")}</span><h3>{t("My Work")}</h3></div>
          </div>
          <div className={styles.myWorkList}>
            {overview.my_work.map((item) => (
              <Link key={`${item.item_type}-${item.id}`} href={item.href} target={item.item_type === "studio_design" ? "_blank" : undefined} rel={item.item_type === "studio_design" ? "noopener noreferrer" : undefined}>
                <span data-priority={item.priority}>{item.item_type === "studio_design" ? "DS" : item.item_type === "promotion" ? "PR" : "CM"}</span>
                <div><strong>{item.name}</strong><small>{t(titleCase(item.status))} · {formatApiDate(item.updated_at, locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</small></div>
                <b>{t(item.action)} ›</b>
              </Link>
            ))}
            {!overview.my_work.length && <div className={styles.dashboardEmptyState}><strong>{t("You are all caught up")}</strong><span>{t("No assigned work needs attention right now.")}</span></div>}
          </div>
        </section>

        <section className={styles.dashboardSectionCard}>
          <div className={styles.sectionHeadingCompact}>
            <div><span className={styles.eyebrow}>{t("Product quality")}</span><h3>{t("Products Requiring Attention")}</h3></div>
          </div>
          <div className={styles.productAttentionTable} role="table" aria-label={t("Products Requiring Attention")}>
            {overview.attention.slice(0, 5).map((item) => (
              <button role="row" type="button" key={`row-${item.key}`} onClick={() => attentionAction(item, onOpenProductQueue, onOpenCatalogues)}>
                <span role="cell" data-severity={item.severity}>{item.severity === "critical" ? "!" : item.severity === "warning" ? "△" : "i"}</span>
                <span role="cell"><strong>{t(item.title)}</strong><small>{t("Open a filtered, server-side work queue")}</small></span>
                <b role="cell">{item.count.toLocaleString(locale)}</b>
                <i role="cell" aria-hidden="true">›</i>
              </button>
            ))}
            {!overview.attention.length && <div className={styles.dashboardEmptyState}><strong>{t("No quality issues found")}</strong><span>{t("Product content is in good shape.")}</span></div>}
          </div>
        </section>
      </div>

      {overview.recent_catalogues.length > 0 && (
        <section className={styles.dashboardSectionCard}>
          <div className={styles.sectionHeadingCompact}>
            <div><span className={styles.eyebrow}>{t("Recently changed")}</span><h3>{t("Recent Catalogues")}</h3></div>
            <button type="button" onClick={() => onOpenCatalogues()}>{t("View all")}</button>
          </div>
          <div className={styles.recentCatalogueGrid}>
            {overview.recent_catalogues.map((catalogue) => (
              <article key={catalogue.id}>
                <div className={styles.catalogueMiniCover}><span>{catalogue.brand?.slice(0, 2).toUpperCase() || "MB"}</span><small>{catalogue.brand_mode === "multi" ? t("Multi-brand") : t("Single brand")}</small></div>
                <div className={styles.catalogueCardBody}>
                  <span data-status={catalogue.status}>{t(titleCase(catalogue.status))}</span>
                  <h4>{catalogue.title}</h4>
                  <p>{catalogue.product_count.toLocaleString(locale)} {t("products")} &middot; {t(titleCase(catalogue.price_mode))}</p>
                  <small>{catalogue.updated_by ? t("Updated by {{name}}", { name: catalogue.updated_by }) : t("Recently updated")} &middot; {formatApiDate(catalogue.updated_at, locale, { day: "2-digit", month: "short" })}</small>
                </div>
                <footer>
                  <Link href={catalogue.href}>{t(catalogue.primary_action)}</Link>
                  {catalogue.studio_href && <Link href={catalogue.studio_href} target="_blank" rel="noopener noreferrer">{t("Open Studio")} &#8599;</Link>}
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className={styles.dashboardTwoColumn}>
        {overview.recent_products.length > 0 && (
          <section className={styles.dashboardSectionCard}>
            <div className={styles.sectionHeadingCompact}><div><span className={styles.eyebrow}>{t("Product master")}</span><h3>{t("Recently Updated Products")}</h3></div><button type="button" onClick={() => onOpenProductQueue({})}>{t("View all")}</button></div>
            <div className={styles.recentProductRows}>
              {overview.recent_products.map((product) => {
                const source = imageUrl(product.image_url);
                return <button type="button" key={product.id} onClick={() => onOpenProduct(product.id)}>
                  <span className={styles.recentProductImage}>{source ? <Image src={source} alt="" width={44} height={44} unoptimized /> : product.name.slice(0, 1)}</span>
                  <span><small>{product.code} &middot; {product.brand || t("No brand")}</small><strong>{product.name}</strong><i>{product.category || t("Uncategorized")} &middot; {t("Stock")} {product.stock.toLocaleString(locale)}</i></span>
                  <span data-status={product.status}>{t(titleCase(product.status))}</span>
                  {product.price !== null && <b>{product.currency || "THB"} {Number(product.price).toLocaleString(locale, { minimumFractionDigits: 2 })}</b>}
                </button>;
              })}
            </div>
          </section>
        )}

        {overview.upcoming_promotions.length > 0 && (
          <section className={styles.dashboardSectionCard}>
            <div className={styles.sectionHeadingCompact}><div><span className={styles.eyebrow}>{t("Asia/Bangkok schedule")}</span><h3>{t("Upcoming Promotions")}</h3></div><Link href="/promotions/calendar">{t("Calendar")}</Link></div>
            <div className={styles.promotionScheduleList}>
              {overview.upcoming_promotions.map((promotion) => (
                <Link href={promotion.href} key={promotion.id}>
                  <time dateTime={promotion.start_at}><strong>{formatApiDate(promotion.start_at, locale, { day: "2-digit" })}</strong><small>{formatApiDate(promotion.start_at, locale, { month: "short" })}</small></time>
                  <span><strong>{promotion.name}</strong><small>{promotion.occasion || promotion.brands.join(", ") || t("Promotion")}</small></span>
                  <i data-status={promotion.status}>{t(titleCase(promotion.status))}</i>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {overview.system_health && (
        <section className={styles.dashboardSectionCard}>
          <div className={styles.sectionHeadingCompact}><div><span className={styles.eyebrow}>{t("SuperAdmin")}</span><h3>{t("System Health")}</h3></div><Link href="/admin/settings/system-health">{t("Open details")}</Link></div>
          <div className={styles.systemHealthGrid}>
            {[
              ["CPU", overview.system_health.cpu_percent, "%"],
              ["Memory", overview.system_health.memory_percent, "%"],
              ["Disk", overview.system_health.disk_percent, "%"],
              ["Database", overview.system_health.database_response_ms, " ms"],
              ["API", overview.system_health.api_response_ms, " ms"],
              ["Failed logins", overview.system_health.recent_failed_logins, ""],
            ].map(([label, value, suffix]) => <article key={String(label)}><span>{t(String(label))}</span><strong>{value ?? "—"}{value !== null ? suffix : ""}</strong></article>)}
          </div>
        </section>
      )}
    </div>
  );
}
