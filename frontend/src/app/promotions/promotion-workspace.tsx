"use client";
/* eslint-disable @next/next/no-img-element, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import { ApplicationLogo } from "@/components/application-logo";
import { canAccess, canAccessAny } from "@/lib/access";
import { copyTextToClipboard as copyText } from "@/lib/clipboard";
import {
  API_ORIGIN,
  API_URL,
  ApiError,
  createPromotion,
  createPromotionLink,
  createPromotionOccasion,
  deletePromotion,
  duplicatePromotion,
  getCurrentUser,
  getPromotion,
  getPromotionLinks,
  getPromotionMetadata,
  getPromotionOccasions,
  getPromotions,
  logout,
  promotionWorkflow,
  revokePromotionLink,
  updatePromotionOccasion,
  uploadPromotionMedia,
  type AuthenticatedUser,
  type Promotion,
  type PromotionMetadata,
  type PromotionOccasion,
  type PromotionPage,
  type PromotionPayload,
  type PromotionShareLink,
  type PromotionType,
} from "@/lib/api";
import { T, LanguageSwitcher, useLanguage } from "@/lib/i18n";
import styles from "./promotions.module.css";

type Mode =
  | "list"
  | "builder"
  | "detail"
  | "calendar"
  | "occasions"
  | "reports";
const PROMOTION_NAV = [
  ["Promotions", "/promotions", "promotions.view", "PR"],
  ["Calendar", "/promotions/calendar", "promotions.view", "CA"],
] as const;
const CREATE_PROMOTION_NAV = ["Create Promotion", "/promotions/new", "promotions.create", "+"] as const;
const PROMOTION_TOOL_NAV = [
  [
    "Special Occasions",
    "/promotions/occasions",
    "promotion_occasions.view",
    "OC",
  ],
  ["Reports", "/promotions/reports", "promotions.export", "RE"],
] as const;
const NAV = [...PROMOTION_NAV, CREATE_PROMOTION_NAV, ...PROMOTION_TOOL_NAV];
const EMPTY_PAGE: PromotionPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
  pages: 1,
  summary: {},
};

function mediaUrl(value: string | null) {
  if (!value) return null;
  return value.startsWith("http") ? value : `${API_ORIGIN}${value}`;
}
function dateTimeLocal(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "The request could not be completed.";
}
function money(value: string | number | null | undefined, currency = "THB") {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en-TH", { style: "currency", currency }).format(
        Number(value),
      );
}
function displayStatus(value: string) {
  return ["pending_review", "rejected", "approved"].includes(value)
    ? "draft"
    : value;
}
function statusText(value: string) {
  return displayStatus(value).replaceAll("_", " ");
}

function SidebarIcon({ icon }: { icon: string }) {
  if (icon === "+") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
  if (icon === "PR") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 13 13 20 4 11V4h7l9 9Z" /><path d="M8 8h.01" /></svg>;
  if (icon === "CA") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4m8-4v4M3 10h18" /></svg>;
  if (icon === "OC") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.3-4.5 2.3.9-5-3.6-3.5 5-.7Z" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V9m7 10V5m7 14v-7" /></svg>;
}

function Shell({
  user,
  children,
}: {
  user: AuthenticatedUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const mobileNavigationRef = useRef<HTMLElement>(null);
  const mobileNavigationButtonRef = useRef<HTMLButtonElement>(null);
  const availableNavigation = NAV.filter(([, , permission]) =>
    canAccess(user, permission),
  );
  const activeHref = availableNavigation
    .filter(([, href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b[1].length - a[1].length)[0]?.[1];
  const initials = user.full_name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const roleName = user.is_superadmin
    ? "Super Administrator"
    : statusText(user.roles[0] || "User");
  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    mobileNavigationRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMobileNavigationOpen(false);
      requestAnimationFrame(() => mobileNavigationButtonRef.current?.focus());
    };
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", close);
    };
  }, [mobileNavigationOpen]);
  const closeMobileNavigation = () => {
    setMobileNavigationOpen(false);
    requestAnimationFrame(() => mobileNavigationButtonRef.current?.focus());
  };
  const navLinks = (items: typeof PROMOTION_NAV | typeof PROMOTION_TOOL_NAV) =>
    items
      .filter(([, , permission]) => canAccess(user, permission))
      .map(([label, href, , icon]) => (
        <Link key={href} href={href} data-active={activeHref === href} onClick={() => setMobileNavigationOpen(false)}>
          <i aria-hidden="true"><SidebarIcon icon={icon} /></i>
          <span>{t(label)}</span>
          {activeHref === href && <b aria-hidden="true" />}
        </Link>
      ));
  return (
    <div className={styles.app}>
      <aside ref={mobileNavigationRef} className={styles.sidebar} data-open={mobileNavigationOpen} aria-label={t("Promotion workspace")}>
        <Link className={styles.brand} href="/dashboard" onClick={() => setMobileNavigationOpen(false)}>
          <span>
            <ApplicationLogo />
          </span>
          <span>
            <strong>
              <T>GMS Catalogue</T>
            </strong>
            <small>
              <T>Promotions</T>
            </small>
          </span>
        </Link>
        {canAccess(user, CREATE_PROMOTION_NAV[2]) && (
          <Link className={styles.sidebarCreate} href={CREATE_PROMOTION_NAV[1]} data-active={activeHref === CREATE_PROMOTION_NAV[1]}>
            <i><SidebarIcon icon="+" /></i>
            <span>
              <strong>{t("New promotion")}</strong>
              <small>{t("Start guided setup")}</small>
            </span>
          </Link>
        )}
        <nav className={styles.nav} aria-label={t("Promotion navigation")}>
          <small>{t("Manage")}</small>
          {navLinks(PROMOTION_NAV)}
          {PROMOTION_TOOL_NAV.some(([, , permission]) => canAccess(user, permission)) && (
            <small>{t("Tools")}</small>
          )}
          {navLinks(PROMOTION_TOOL_NAV)}
        </nav>
        <div className={styles.sidebarAccount}>
          <span className={styles.sidebarAvatar}>{initials || "U"}</span>
          <span className={styles.sidebarIdentity}>
            <strong>{user.full_name}</strong>
            <small>{t(roleName)}</small>
          </span>
          <button
            type="button"
            title={t("Sign out")}
            aria-label={t("Sign out")}
            onClick={() => void logout().then(() => router.replace("/login"))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5m5 5H3m11-8h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /></svg>
          </button>
        </div>
      </aside>
      {mobileNavigationOpen && <button type="button" className={styles.sidebarBackdrop} aria-label={t("Close promotion navigation")} onClick={closeMobileNavigation} />}
      <main className={styles.main}>
        <header className={styles.top}>
          <button ref={mobileNavigationButtonRef} type="button" className={styles.mobileMenuButton} aria-label={t("Open promotion navigation")} aria-expanded={mobileNavigationOpen} onClick={() => setMobileNavigationOpen(true)}>
            <span aria-hidden="true">☰</span>
          </button>
          <h1>{t("Promotion Management")}</h1>
          <div>
            <LanguageSwitcher />
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}

function Actions({
  promotion,
  user,
  onChanged,
}: {
  promotion: Promotion;
  user: AuthenticatedUser;
  onChanged: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  async function action(
    name:
      | "publish"
      | "pause"
      | "resume"
      | "cancel",
  ) {
    let reason = "";
    if (name === "cancel")
      reason = window.prompt(`${name} reason`)?.trim() || "";
    setBusy(true);
    try {
      await promotionWorkflow(promotion.id, name, reason);
      onChanged();
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function duplicate() {
    setBusy(true);
    try {
      const created = await duplicatePromotion(promotion.id);
      router.push(`/promotions/${created.id}/edit`);
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(`${t("Delete")} "${promotion.name_en}"?`)) return;
    setBusy(true);
    try {
      await deletePromotion(promotion.id);
      if (pathname.startsWith(`/promotions/${promotion.id}`)) {
        router.replace("/promotions");
      } else {
        onChanged();
      }
    } catch (error) {
      alert(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className={styles.actions}>
      <summary aria-label={t("Promotion actions")}>•••</summary>
      <div className={styles.menu}>
        <Link href={`/promotions/${promotion.id}`}>{t("View")}</Link>
        {canAccess(user, "promotions.edit") &&
          !["cancelled", "expired"].includes(promotion.status) && (
            <Link href={`/promotions/${promotion.id}/edit`}>{t("Edit")}</Link>
          )}
        {canAccess(user, "promotions.duplicate") && (
          <button disabled={busy} onClick={() => void duplicate()}>
            {t("Duplicate")}
          </button>
        )}
        <Link href={`/promotions/${promotion.id}/preview`}>{t("Preview")}</Link>
        {canAccess(user, "promotions.publish") &&
          ["draft", "rejected", "pending_review", "approved", "scheduled"].includes(promotion.status) && (
            <button onClick={() => void action("publish")}>
              {t("Publish")}
            </button>
          )}
        {canAccess(user, "promotions.pause") &&
          ["active", "scheduled"].includes(promotion.status) && (
            <button onClick={() => void action("pause")}>{t("Pause")}</button>
          )}
        {canAccess(user, "promotions.pause") &&
          promotion.status === "paused" && (
            <button onClick={() => void action("resume")}>{t("Resume")}</button>
          )}
        {canAccess(user, "promotions.cancel") &&
          !["cancelled", "expired"].includes(promotion.status) && (
            <button onClick={() => void action("cancel")}>{t("Cancel")}</button>
          )}
        {canAccess(user, "promotions.delete") &&
          ["draft", "rejected", "pending_review", "approved", "cancelled"].includes(promotion.status) && (
            <button type="button" className={styles.danger} disabled={busy} onClick={() => void remove()}>
              {t("Delete")}
            </button>
          )}
      </div>
    </details>
  );
}

function PromotionList({ user }: { user: AuthenticatedUser }) {
  const { t, language, locale } = useLanguage();
  const [data, setData] = useState(EMPTY_PAGE);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [totalPromotions, setTotalPromotions] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    try {
      const page = await getPromotions({ q, status, page_size: 60 });
      setData(page);
      if (!q && !status) setTotalPromotions(page.total);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [q, status]);
  const statusCards = [
    { value: "", label: "All promotions", count: totalPromotions, tone: "all" },
    { value: "active", label: "Active", count: data.summary.active || 0, tone: "active" },
    { value: "scheduled", label: "Scheduled", count: data.summary.scheduled || 0, tone: "scheduled" },
    { value: "draft", label: "Draft", count: data.summary.draft || 0, tone: "draft" },
  ];
  const secondaryStatus = ["paused", "expired", "cancelled"].includes(status)
    ? status
    : "";
  const activeFilterLabel = status ? statusText(status) : "All promotions";
  return (
    <section className={styles.promotionDashboard}>
      <div className={styles.promotionHero}>
        <div className={styles.promotionHeroCopy}>
          <span className={styles.eyebrow}>{t("PROMOTION WORKSPACE")}</span>
          <h2>{t("Promotions")}</h2>
          <p>{t("Create offers, schedule campaigns and track every promotion in one place.")}</p>
          <div className={styles.promotionHeroNote}>
            <strong>{data.summary.expiring_soon || 0}</strong>
            <span>{t("active promotions end within 7 days")}</span>
          </div>
        </div>
        <div className={styles.promotionHeroActions}>
          <Link className={styles.button} href="/promotions/calendar">{t("Open calendar")}</Link>
          {canAccess(user, "promotions.export") && (
            <a className={styles.button} href={`${API_URL}/v1/promotion-reports/export.csv`}>{t("Export CSV")}</a>
          )}
          {canAccess(user, "promotions.create") && (
            <Link className={styles.primary} href="/promotions/new">+ {t("Add Promotion")}</Link>
          )}
        </div>
      </div>

      <div className={styles.promotionOverview} aria-label={t("Filter promotions by status")}>
        {statusCards.map((item) => (
          <button
            type="button"
            key={item.value || "all"}
            data-active={status === item.value}
            data-tone={item.tone}
            aria-pressed={status === item.value}
            onClick={() => setStatus(item.value)}
          >
            <span className={styles.promotionStatusIcon} aria-hidden="true" />
            <span><strong>{item.count}</strong><small>{t(item.label)}</small></span>
          </button>
        ))}
      </div>

      <div className={styles.promotionWorkspaceBar}>
        <label className={styles.promotionSearch}>
          <span aria-hidden="true">⌕</span>
          <input
            aria-label={t("Search promotions")}
            placeholder={t("Search by promotion name or code")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {q && <button type="button" onClick={() => setQ("")} aria-label={t("Clear search")}>×</button>}
        </label>
        <select
          aria-label={t("More promotion statuses")}
          value={secondaryStatus}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t("More statuses")}</option>
          <option value="paused">{t("Paused")}</option>
          <option value="expired">{t("Expired")}</option>
          <option value="cancelled">{t("Cancelled")}</option>
        </select>
        <div className={styles.promotionViewToggle} aria-label={t("Choose view")}>
          <button type="button" data-active={view === "cards"} aria-pressed={view === "cards"} onClick={() => setView("cards")}>{t("Cards")}</button>
          <button type="button" data-active={view === "table"} aria-pressed={view === "table"} onClick={() => setView("table")}>{t("Table")}</button>
        </div>
      </div>

      <div className={styles.promotionResultsHeading}>
        <div><h3>{t(activeFilterLabel)}</h3><span>{data.total} {t(data.total === 1 ? "promotion" : "promotions")}</span></div>
        {(q || status) && <button type="button" onClick={() => { setQ(""); setStatus(""); }}>{t("Clear filters")}</button>}
      </div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {loading ? (
        <div className={styles.empty}>{t("Loading promotions…")}</div>
      ) : data.items.length === 0 ? (
        <div className={styles.empty}>
          {t("No promotions match these filters.")}
        </div>
      ) : view === "cards" ? (
        <div className={styles.promotionCardGrid}>
          {data.items.map((p) => (
            <article className={styles.promotionCard} key={p.id}>
              <div className={styles.promotionCardBanner}>
                {p.cover_url && (
                  <img
                    src={mediaUrl(p.cover_url) || ""}
                    alt={`${language === "th" && p.name_th ? p.name_th : p.name_en} ${t("promotion cover")}`}
                  />
                )}
                <span className={styles.promotionStatusBadge} data-status={displayStatus(p.status)}>{t(statusText(p.status))}</span>
                <div className={styles.promotionBannerText}>
                  <small>{t(p.occasion_name || "Custom promotion")}</small>
                  <strong>{p.short_title || (language === "th" && p.name_th ? p.name_th : p.name_en)}</strong>
                </div>
              </div>
              <div className={styles.promotionCardContent}>
                <small className={styles.code}>{p.code}</small>
                <h3>
                  {language === "th" && p.name_th ? p.name_th : p.name_en}
                </h3>
                <div className={styles.chips}>
                  {p.brands.slice(0, 3).map((b) => (
                    <span className={styles.chip} key={b.brand_id}>
                      {b.brand_name}
                    </span>
                  ))}
                  {p.audiences.map((a) => (
                    <span className={styles.chip} key={a.audience_type_id}>
                      {t(a.audience_name)}
                    </span>
                  ))}
                </div>
                <div className={styles.metrics}>
                  <span>
                    {new Date(p.start_at).toLocaleDateString(locale)} –{" "}
                    {new Date(p.end_at).toLocaleDateString(locale)}
                  </span>
                  <span>
                    {p.products.length} {t("products")}
                  </span>
                  <span>{t(p.promotion_type.replaceAll("_", " "))}</span>
                  <span>
                    {t("Priority")} {p.priority}
                  </span>
                </div>
                <footer className={styles.promotionCardFooter}>
                  <Link
                    className={styles.button}
                    href={`/promotions/${p.id}/preview`}
                  >
                    {t("Preview")}
                  </Link>
                  <Link className={styles.primary} href={`/promotions/${p.id}`}>
                    {t("Open")}
                  </Link>
                  <Actions
                    promotion={p}
                    user={user}
                    onChanged={() => void load()}
                  />
                </footer>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t("Promotion")}</th>
              <th>{t("Brands")}</th>
              <th>{t("Audience")}</th>
              <th>{t("Schedule")}</th>
              <th>{t("Status")}</th>
              <th>{t("Products")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>
                    {language === "th" && p.name_th ? p.name_th : p.name_en}
                  </strong>
                  <br />
                  <small>{p.code}</small>
                </td>
                <td>{p.brands.map((b) => b.brand_name).join(", ")}</td>
                <td>{p.audiences.map((a) => a.audience_name).join(", ")}</td>
                <td>
                  {new Date(p.start_at).toLocaleDateString(locale)} –{" "}
                  {new Date(p.end_at).toLocaleDateString(locale)}
                </td>
                <td>{t(statusText(p.status))}</td>
                <td>{p.products.length}</td>
                <td>
                  <Actions
                    promotion={p}
                    user={user}
                    onChanged={() => void load()}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const steps = [
  "Promotion details",
  "Products & offer",
  "Audience & placement",
  "Review & create",
];
function defaultPayload(): PromotionPayload {
  const start = new Date();
  start.setMinutes(start.getMinutes() + 10);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  return {
    name_en: "",
    name_th: "",
    short_title: "",
    description_en: "",
    description_th: "",
    occasion_id: null,
    promotion_type: "percentage",
    discount_percent: 10,
    discount_amount: null,
    promotion_price: null,
    priority: 50,
    base_price_change_behavior: "require_reapproval",
    department_id: null,
    team_id: null,
    start_at: new Date(dateTimeLocal(start)).toISOString(),
    end_at: new Date(dateTimeLocal(end)).toISOString(),
    timezone: "Asia/Bangkok",
    automatic_activation: true,
    automatic_expiration: true,
    repeat_annually: false,
    expiration_warning_days: 7,
    show_stock: true,
    hide_out_of_stock: false,
    minimum_stock: 0,
    stop_product_at_zero_stock: false,
    terms_en: "",
    terms_th: "",
    internal_note: "",
    is_active: true,
    brand_rules: [],
    products: [],
    audiences: [],
    catalogue_ids: [],
  };
}
function Builder({ id }: { id?: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(defaultPayload);
  const [meta, setMeta] = useState<PromotionMetadata | null>(null);
  const [knownProducts, setKnownProducts] = useState<
    PromotionMetadata["products"]
  >([]);
  const [browseBrand, setBrowseBrand] = useState<number | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [banner, setBanner] = useState<File | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [externalVideo, setExternalVideo] = useState("");
  const [initialExternalVideo, setInitialExternalVideo] = useState("");
  const [discount, setDiscount] = useState(10);
  function update<K extends keyof PromotionPayload>(
    key: K,
    value: PromotionPayload[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function selectOccasion(occasionId: number | null) {
    const occasion = meta?.occasions.find((item) => item.id === occasionId);
    if (!occasion || !occasion.default_start_month || !occasion.default_start_day || !occasion.default_end_month || !occasion.default_end_day) {
      update("occasion_id", occasionId);
      return;
    }
    let year = new Date().getFullYear();
    let start = new Date(year, occasion.default_start_month - 1, occasion.default_start_day, 0, 0);
    let end = new Date(year, occasion.default_end_month - 1, occasion.default_end_day + 1, 0, 0);
    if (end <= start) end = new Date(year + 1, occasion.default_end_month - 1, occasion.default_end_day + 1, 0, 0);
    if (end <= new Date()) {
      year += 1;
      start = new Date(year, occasion.default_start_month - 1, occasion.default_start_day, 0, 0);
      end = new Date(
        year + (occasion.default_end_month < occasion.default_start_month ? 1 : 0),
        occasion.default_end_month - 1,
        occasion.default_end_day + 1,
        0,
        0,
      );
    }
    setDraft((current) => ({
      ...current,
      occasion_id: occasionId,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      repeat_annually: occasion.recurring_annually,
    }));
  }
  async function load() {
    try {
      const [metadata, existing] = await Promise.all([
        getPromotionMetadata({ page_size: 200 }),
        id ? getPromotion(id) : Promise.resolve(null),
      ]);
      const requestedCatalogueId = typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("catalogueId") || "";
      const requestedCatalogueExists = metadata.catalogues.some(
        (catalogue) => catalogue.id === requestedCatalogueId,
      );
      setMeta(metadata);
      setKnownProducts(metadata.products);
      if (!existing) {
        setDraft((current) => ({
          ...current,
          audiences: metadata.audiences.map((audience) => ({
            audience_type_id: audience.id,
            price_list_id: audience.price_list_id,
            show_prices: audience.show_prices,
          })),
          catalogue_ids: requestedCatalogueExists
            ? [requestedCatalogueId]
            : current.catalogue_ids,
        }));
      }
      if (existing) {
        const uniqueProducts = [
          ...new Map(
            existing.products.map((row) => [row.product_id, row]),
          ).values(),
        ];
        const savedExternalVideo =
          existing.media.find((item) => item.media_type === "video")
            ?.external_url || "";
        setExternalVideo(savedExternalVideo);
        setInitialExternalVideo(savedExternalVideo);
        setBrowseBrand(existing.brands[0]?.brand_id || null);
        setDraft({
          code: existing.code,
          name_en: existing.name_en,
          name_th: existing.name_th,
          short_title: existing.short_title,
          description_en: existing.description_en,
          description_th: existing.description_th,
          occasion_id: existing.occasion_id,
          promotion_type: existing.promotion_type as PromotionType,
          priority: existing.priority,
          base_price_change_behavior:
            existing.base_price_change_behavior as PromotionPayload["base_price_change_behavior"],
          owner_user_id: existing.owner_user_id,
          department_id: existing.department_id,
          team_id: existing.team_id,
          start_at: existing.start_at,
          end_at: existing.end_at,
          timezone: existing.timezone,
          automatic_activation: existing.automatic_activation,
          automatic_expiration: existing.automatic_expiration,
          repeat_annually: existing.repeat_annually,
          expiration_warning_days: existing.expiration_warning_days,
          show_stock: existing.show_stock,
          hide_out_of_stock: existing.hide_out_of_stock,
          minimum_stock: existing.minimum_stock,
          stop_product_at_zero_stock: existing.stop_product_at_zero_stock,
          terms_en: existing.terms_en,
          terms_th: existing.terms_th,
          internal_note: existing.internal_note || "",
          is_active: existing.is_active,
          brand_rules: existing.brands.map((b) => ({
            brand_id: b.brand_id,
            include_all_active_products: b.include_all_active_products,
          })),
          products: uniqueProducts.map((p) => ({
            product_id: p.product_id,
            promotion_type: p.promotion_type as PromotionType,
            discount_percent:
              p.promotion_type === "percentage"
                ? Number(p.discount_percent)
                : null,
            discount_amount:
              p.promotion_type === "fixed_amount"
                ? Number(p.discount_amount)
                : null,
            promotion_price:
              p.promotion_type === "special_price"
                ? Number(p.promotion_price)
                : null,
            include_in_promotion: p.include_in_promotion,
          })),
          audiences: existing.audiences.map((a) => ({
            audience_type_id: a.audience_type_id,
            price_list_id: a.price_list_id,
            show_prices: a.show_prices,
          })),
          catalogue_ids: existing.catalogue_ids,
        });
        const first = existing.products[0];
        if (first)
          setDiscount(
            Number(
              first.promotion_type === "percentage"
                ? first.discount_percent
                : first.promotion_type === "fixed_amount"
                  ? first.discount_amount
                  : first.promotion_price,
            ) || 0,
          );
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  // Loading hydrates the controlled builder from persisted backend state.
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    const brandId = browseBrand || draft.brand_rules[0]?.brand_id;
    if (!brandId) return;
    const timer = setTimeout(
      () =>
        getPromotionMetadata({
          brand_id: brandId,
          q: productSearch,
          page_size: 200,
        })
          .then((result) => {
            setMeta((current) =>
              current
                ? {
                    ...current,
                    products: result.products,
                    product_total: result.product_total,
                  }
                : result,
            );
            setKnownProducts((current) => [
              ...new Map(
                [...current, ...result.products].map((product) => [
                  product.id,
                  product,
                ]),
              ).values(),
            ]);
          })
          .catch(() => {}),
      250,
    );
    return () => clearTimeout(timer);
  }, [productSearch, browseBrand, draft.brand_rules]);
  function toggleBrand(brandId: number, checked: boolean) {
    const nextRules = checked
      ? [
          ...draft.brand_rules,
          { brand_id: brandId, include_all_active_products: true },
        ]
      : draft.brand_rules.filter((row) => row.brand_id !== brandId);
    update("brand_rules", nextRules);
    if (checked) setBrowseBrand(brandId);
    if (!checked && meta) {
      if (browseBrand === brandId)
        setBrowseBrand(nextRules[0]?.brand_id || null);
      const name = meta.brands.find((b) => b.id === brandId)?.name;
      update(
        "products",
        draft.products.filter(
          (row) =>
            knownProducts.find((p) => p.id === row.product_id)?.brand !== name,
        ),
      );
    }
  }
  function toggleAudience(
    audience: {
      id: number;
      price_list_id: number | null;
      show_prices: boolean;
    },
    checked: boolean,
  ) {
    update(
      "audiences",
      checked
        ? [
            ...draft.audiences,
            {
              audience_type_id: audience.id,
              price_list_id: audience.price_list_id,
              show_prices: audience.show_prices,
            },
          ]
        : draft.audiences.filter((row) => row.audience_type_id !== audience.id),
    );
  }
  function toggleProduct(productId: string, checked: boolean) {
    update(
      "products",
      checked
        ? [
            ...draft.products,
            {
              product_id: productId,
              promotion_type: draft.promotion_type,
              discount_percent:
                draft.promotion_type === "percentage" ? discount : null,
              discount_amount:
                draft.promotion_type === "fixed_amount" ? discount : null,
              promotion_price:
                draft.promotion_type === "special_price" ? discount : null,
            },
          ]
        : draft.products.filter((row) => row.product_id !== productId),
    );
  }
  function pricingValue(value: number) {
    setDiscount(value);
    setDraft((current) => ({
      ...current,
      discount_percent: current.promotion_type === "percentage" ? value : null,
      discount_amount: current.promotion_type === "fixed_amount" ? value : null,
      promotion_price:
        current.promotion_type === "special_price" ? value : null,
      products: current.products.map((row) => ({
        ...row,
        promotion_type: current.promotion_type,
        discount_percent:
          current.promotion_type === "percentage" ? value : null,
        discount_amount:
          current.promotion_type === "fixed_amount" ? value : null,
        promotion_price:
          current.promotion_type === "special_price" ? value : null,
      })),
    }));
  }
  function stepIssue(targetStep = step) {
    if (targetStep === 0) {
      if (draft.name_en.trim().length < 2) return t("Enter a promotion name.");
      if (!draft.start_at || !draft.end_at || new Date(draft.end_at) <= new Date(draft.start_at)) {
        return t("Choose an end date after the start date.");
      }
    }
    if (targetStep === 1) {
      if (!draft.brand_rules.length) return t("Select at least one brand.");
      if (!draft.products.length && !draft.brand_rules.some((rule) => rule.include_all_active_products)) {
        return t("Select products or include all active products.");
      }
      if (discount <= 0) return t("Enter a discount or promotion price greater than zero.");
    }
    if (targetStep === 2 && !draft.audiences.length) return t("Select at least one customer group.");
    return "";
  }
  function continueToNextStep() {
    const issue = stepIssue();
    if (issue) {
      setError(issue);
      return;
    }
    setError("");
    setStep((current) => Math.min(steps.length - 1, current + 1));
  }
  async function save(event?: FormEvent) {
    event?.preventDefault();
    for (let targetStep = 0; targetStep < steps.length - 1; targetStep += 1) {
      const issue = stepIssue(targetStep);
      if (issue) {
        setStep(targetStep);
        setError(issue);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...draft,
        discount_percent:
          draft.promotion_type === "percentage" ? discount : null,
        discount_amount:
          draft.promotion_type === "fixed_amount" ? discount : null,
        promotion_price:
          draft.promotion_type === "special_price" ? discount : null,
        start_at: new Date(draft.start_at).toISOString(),
        end_at: new Date(draft.end_at).toISOString(),
        products: draft.products.map((row) => ({
          ...row,
          promotion_type: draft.promotion_type,
          discount_percent:
            draft.promotion_type === "percentage" ? discount : null,
          discount_amount:
            draft.promotion_type === "fixed_amount" ? discount : null,
          promotion_price:
            draft.promotion_type === "special_price" ? discount : null,
        })),
      };
      const saved = id
        ? await (await import("@/lib/api")).updatePromotion(id, payload)
        : await createPromotion(payload);
      if (banner)
        await uploadPromotionMedia(saved.id, "banner", banner, saved.name_en);
      if (video || (externalVideo && externalVideo !== initialExternalVideo))
        await uploadPromotionMedia(
          saved.id,
          "video",
          video,
          saved.name_en,
          externalVideo,
        );
      router.push(`/promotions/${saved.id}/preview`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return (
      <div className={styles.empty}>{t("Preparing Promotion Builder…")}</div>
    );
  if (!meta)
    return (
      <div className={styles.error}>
        {error || "Promotion data is unavailable."}
      </div>
    );
  const selectedProducts = knownProducts.filter((p) =>
    draft.products.some((row) => row.product_id === p.id),
  );
  return (
    <form onSubmit={save}>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            {t("GUIDED PROMOTION BUILDER")}
          </span>
          <h2>{t(id ? "Edit promotion" : "Create promotion")}</h2>
          <p>
            <T>Create a promotion in four simple steps. Optional settings can be added when needed.</T>
          </p>
        </div>
        <Link className={styles.button} href="/promotions">
          {t("Cancel")}
        </Link>
      </div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      <div className={styles.stepper}>
        {steps.map((label, index) => (
          <button
            type="button"
            data-active={step === index}
            key={label}
            onClick={() => index > step ? continueToNextStep() : setStep(index)}
            disabled={index > step + 1}
          >
            <span>{index + 1}</span>
            <strong>{t(label)}</strong>
            <small>{index < step ? t("Complete") : index === step ? t("Current step") : t("Not started")}</small>
          </button>
        ))}
      </div>
      <section className={styles.panel}>
        {step === 0 && (
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <T>Special occasion</T>
              <select
                value={draft.occasion_id || ""}
                onChange={(e) => selectOccasion(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">
                  <T>Choose occasion</T>
                </option>
                {meta.occasions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name_en} / {o.name_th}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <T>Name in English *</T>
              <input
                required
                value={draft.name_en}
                onChange={(e) => update("name_en", e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <T>Name in Thai</T>
              <input
                value={draft.name_th}
                onChange={(e) => update("name_th", e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <T>Short title</T>
              <input
                value={draft.short_title}
                onChange={(e) => update("short_title", e.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.span2}`}>
              <T>English description</T>
              <textarea
                value={draft.description_en}
                onChange={(e) => update("description_en", e.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.span2}`}>
              <T>Thai description</T>
              <textarea
                value={draft.description_th}
                onChange={(e) => update("description_th", e.target.value)}
              />
            </label>
            <details className={`${styles.advancedOptions} ${styles.span2}`}>
              <summary><T>Advanced settings</T></summary>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <T>Promotion code</T>
                  <input value={draft.code || ""} placeholder={t("Auto-generated")} onChange={(e) => update("code", e.target.value)} />
                </label>
                <label className={styles.field}>
                  <T>Priority (1–100)</T>
                  <input type="number" min="1" max="100" value={draft.priority} onChange={(e) => update("priority", Number(e.target.value))} />
                </label>
              </div>
            </details>
          </div>
        )}
        {step === 1 && (
          <>
            <h3>{t("Select brands")}</h3>
            <div className={styles.choiceGrid}>
              {meta.brands.map((b) => (
                <label className={styles.choice} key={b.id}>
                  <input
                    type="checkbox"
                    checked={draft.brand_rules.some(
                      (row) => row.brand_id === b.id,
                    )}
                    onChange={(e) => toggleBrand(b.id, e.target.checked)}
                  />
                  <span>
                    <strong>{b.name}</strong>
                    <small>{b.code}</small>
                  </span>
                </label>
              ))}
            </div>
            {draft.brand_rules.length > 0 && (
              <>
                <h3>{t("Products")}</h3>
                <div className={styles.productTools}>
                  <select
                    aria-label={t("Browse products by brand")}
                    value={browseBrand || draft.brand_rules[0]?.brand_id || ""}
                    onChange={(e) => setBrowseBrand(Number(e.target.value))}
                  >
                    {draft.brand_rules.map((rule) => {
                      const brand = meta.brands.find(
                        (item) => item.id === rule.brand_id,
                      );
                      return (
                        <option key={rule.brand_id} value={rule.brand_id}>
                          {brand?.name || `Brand ${rule.brand_id}`}
                        </option>
                      );
                    })}
                  </select>
                  <input
                    placeholder={t("Search code, barcode or name")}
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                  />
                  <button
                    className={styles.button}
                    type="button"
                    onClick={() =>
                      update("products", [
                        ...new Map(
                          [
                            ...draft.products,
                            ...meta.products.map((p) => ({
                              product_id: p.id,
                              promotion_type: draft.promotion_type,
                            })),
                          ].map((row) => [row.product_id, row]),
                        ).values(),
                      ])
                    }
                  >
                    <T>Select all filtered</T>
                  </button>
                  <button
                    className={styles.button}
                    type="button"
                    onClick={() => update("products", [])}
                  >
                    <T>Clear</T>
                  </button>
                  <label className={styles.choice}>
                    <input
                      type="checkbox"
                      checked={draft.brand_rules.every(
                        (row) => row.include_all_active_products,
                      )}
                      onChange={(e) =>
                        update(
                          "brand_rules",
                          draft.brand_rules.map((row) => ({
                            ...row,
                            include_all_active_products: e.target.checked,
                          })),
                        )
                      }
                    />

                    <T>Include all active products in selected brands</T>
                  </label>
                </div>
                <div className={styles.productList}>
                  {meta.products.map((p) => (
                    <label className={styles.productRow} key={p.id}>
                      <input
                        type="checkbox"
                        checked={draft.products.some(
                          (row) => row.product_id === p.id,
                        )}
                        onChange={(e) => toggleProduct(p.id, e.target.checked)}
                      />
                      {p.image_url ? (
                        <img src={mediaUrl(p.image_url) || ""} alt="" />
                      ) : (
                        <span className={styles.placeholder}>{p.name[0]}</span>
                      )}
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.code} · {p.category || "Uncategorized"}
                        </small>
                      </span>
                      <span>{p.brand}</span>
                      <span>{money(p.price)}</span>
                      <span>
                        {p.stock} <T>stock</T>
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <h3>{t("Customer groups and price lists")}</h3>
            <p className={styles.notice}>
              <T>
                Each audience receives only its mapped price list. No Price
                never receives numeric pricing.
              </T>
            </p>
            <div className={styles.choiceGrid}>
              {meta.audiences.map((a) => (
                <label className={styles.choice} key={a.id}>
                  <input
                    type="checkbox"
                    checked={draft.audiences.some(
                      (row) => row.audience_type_id === a.id,
                    )}
                    onChange={(e) => toggleAudience(a, e.target.checked)}
                  />
                  <span>
                    <strong>{a.name}</strong>
                    <small>
                      {a.show_prices
                        ? meta.price_lists.find((p) => p.id === a.price_list_id)
                            ?.name
                        : "Promotion message only — no prices"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <div className={styles.formGrid}>
            <div className={`${styles.sectionHeading} ${styles.span2}`}>
              <span>2B</span><div><h3><T>Set the offer</T></h3><p><T>One offer applies to every selected product.</T></p></div>
            </div>
            <label className={styles.field}>
              {t("Promotion type")}
              <select
                value={draft.promotion_type}
                onChange={(e) => {
                  update("promotion_type", e.target.value as PromotionType);
                  setDiscount(e.target.value === "percentage" ? 10 : 100);
                }}
              >
                <option value="percentage">
                  <T>Percentage Discount</T>
                </option>
                <option value="fixed_amount">
                  <T>Fixed Amount Discount</T>
                </option>
                <option value="special_price">
                  <T>Special Promotion Price</T>
                </option>
              </select>
            </label>
            <label className={styles.field}>
              {draft.promotion_type === "percentage"
                ? "Discount percentage"
                : draft.promotion_type === "fixed_amount"
                  ? "Discount amount (THB)"
                  : "Promotion price (THB)"}
              <input
                type="number"
                min="0"
                max={draft.promotion_type === "percentage" ? 100 : undefined}
                step="0.01"
                value={discount}
                onChange={(e) => pricingValue(Number(e.target.value))}
              />
            </label>
            <label className={`${styles.field} ${styles.span2}`}>
              <T>ERP base-price change behavior</T>
              <select
                value={draft.base_price_change_behavior}
                onChange={(e) =>
                  update(
                    "base_price_change_behavior",
                    e.target
                      .value as PromotionPayload["base_price_change_behavior"],
                  )
                }
              >
                <option value="require_reapproval">
                  <T>Return to Draft when ERP price changes (recommended)</T>
                </option>
                <option value="keep_approved">
                  <T>Keep current promotion price</T>
                </option>
                <option value="recalculate">
                  <T>Recalculate percentage/fixed discount</T>
                </option>
                <option value="pause_products">
                  <T>Pause affected products</T>
                </option>
              </select>
            </label>
            <div className={`${styles.pricePreview} ${styles.span2}`}>
              <strong>
                <T>Pricing preview</T>
              </strong>
              {selectedProducts.slice(0, 10).map((p) => {
                const base = Number(p.price || 0);
                const result =
                  draft.promotion_type === "percentage"
                    ? base * (1 - discount / 100)
                    : draft.promotion_type === "fixed_amount"
                      ? Math.max(0, base - discount)
                      : discount;
                return (
                  <p key={p.id}>
                    {p.code} · {money(base)} → <strong>{money(result)}</strong>
                  </p>
                );
              })}
              {selectedProducts.length === 0 && (
                <p>
                  <T>Select products to preview calculated prices.</T>
                </p>
              )}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className={styles.formGrid}>
            <div className={`${styles.sectionHeading} ${styles.span2}`}>
              <span><T>Optional</T></span><div><h3><T>Add promotion media</T></h3><p><T>Skip this section if no banner or video is needed.</T></p></div>
            </div>
            <label className={styles.field}>
              {t("Promotion cover")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setBanner(e.target.files?.[0] || null)}
              />
              <small>
                <T>JPG, PNG or WebP. A wide 16:6 image works best.</T>
              </small>
            </label>
            <label className={styles.field}>
              {t("Optional promotion video")}
              <input
                type="file"
                accept="video/mp4,video/webm"
                onChange={(e) => {
                  setVideo(e.target.files?.[0] || null);
                  if (e.target.files?.[0]) setExternalVideo("");
                }}
              />
              <small>
                <T>MP4 or WebM, using the existing secure media store.</T>
              </small>
            </label>
            <label className={`${styles.field} ${styles.span2}`}>
              <T>Or approved external video URL</T>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={externalVideo}
                onChange={(e) => {
                  setExternalVideo(e.target.value);
                  if (e.target.value) setVideo(null);
                }}
              />
              <small>
                <T>
                  YouTube, Vimeo, or a direct HTTPS MP4/WebM URL enabled by the
                  platform.
                </T>
              </small>
            </label>
          </div>
        )}
        {step === 2 && (
          <>
            <h3>{t("Catalogue placement")}</h3>
            <div className={styles.choiceGrid}>
              {meta.catalogues.map((c) => (
                <label className={styles.choice} key={c.id}>
                  <input
                    type="checkbox"
                    checked={draft.catalogue_ids.includes(c.id)}
                    onChange={(e) =>
                      update(
                        "catalogue_ids",
                        e.target.checked
                          ? [...draft.catalogue_ids, c.id]
                          : draft.catalogue_ids.filter((id) => id !== c.id),
                      )
                    }
                  />
                  <span>
                    <strong>{c.title}</strong>
                    <small>{c.status}</small>
                  </span>
                </label>
              ))}
            </div>
            <p className={styles.notice}>
              <T>
                With no catalogue selected, the promotion may appear in any
                catalogue containing an eligible product and audience.
              </T>
            </p>
          </>
        )}
        {step === 0 && (
          <div className={styles.formGrid}>
            <div className={`${styles.sectionHeading} ${styles.span2}`}>
              <span>1B</span><div><h3><T>Promotion schedule</T></h3><p><T>Publish once, then the promotion will activate and expire automatically on schedule.</T></p></div>
            </div>
            <label className={styles.field}>
              {t("Start date and time")} *
              <input
                required
                type="datetime-local"
                value={dateTimeLocal(new Date(draft.start_at))}
                onChange={(e) =>
                  update("start_at", new Date(e.target.value).toISOString())
                }
              />
              <small>
                <T>Start is inclusive.</T>
              </small>
            </label>
            <label className={styles.field}>
              {t("End date and time")} *
              <input
                required
                type="datetime-local"
                value={dateTimeLocal(new Date(draft.end_at))}
                onChange={(e) =>
                  update("end_at", new Date(e.target.value).toISOString())
                }
              />
              <small>
                <T>End is exclusive.</T>
              </small>
            </label>
            <label className={styles.field}>
              <T>Timezone</T>
              <select
                value={draft.timezone}
                onChange={(e) => update("timezone", e.target.value)}
              >
                <option value="Asia/Bangkok">
                  <T>Asia/Bangkok</T>
                </option>
                <option value="UTC">
                  <T>UTC</T>
                </option>
              </select>
            </label>
            <label className={styles.field}>
              <T>Expiration warning (days)</T>
              <input
                type="number"
                min="0"
                max="90"
                value={draft.expiration_warning_days}
                onChange={(e) =>
                  update("expiration_warning_days", Number(e.target.value))
                }
              />
            </label>
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={draft.automatic_activation}
                onChange={(e) =>
                  update("automatic_activation", e.target.checked)
                }
              />

              <T>Automatic activation at start time</T>
            </label>
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={draft.automatic_expiration}
                onChange={(e) =>
                  update("automatic_expiration", e.target.checked)
                }
              />

              <T>Automatic expiration</T>
            </label>
          </div>
        )}
        {step === 3 && (
          <div className={styles.formGrid}>
            <div className={`${styles.sectionHeading} ${styles.span2}`}>
              <span><T>Optional</T></span><div><h3><T>Terms and internal notes</T></h3><p><T>Add only the information customers or reviewers need.</T></p></div>
            </div>
            <label className={`${styles.field} ${styles.span2}`}>
              {t("Terms and conditions in English")}
              <textarea
                value={draft.terms_en}
                onChange={(e) => update("terms_en", e.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.span2}`}>
              {t("Terms and conditions in Thai")}
              <textarea
                value={draft.terms_th}
                onChange={(e) => update("terms_th", e.target.value)}
              />
            </label>
            <label className={`${styles.field} ${styles.span2}`}>
              <T>Internal note</T>
              <textarea
                value={draft.internal_note}
                onChange={(e) => update("internal_note", e.target.value)}
              />
            </label>
          </div>
        )}
        {step === 3 && (
          <>
            <div className={styles.previewHero}>
              <span>
                {meta.occasions.find((o) => o.id === draft.occasion_id)
                  ?.name_en || "Special Promotion"}
              </span>
              <h2>{draft.name_en || "Promotion name"}</h2>
              <p>
                {draft.short_title ||
                  draft.description_en ||
                  "Promotion details will appear here."}
              </p>
            </div>
            <div className={styles.previewProducts}>
              {selectedProducts.slice(0, 8).map((p) => (
                <article className={styles.previewProduct} key={p.id}>
                  {p.image_url && (
                    <img src={mediaUrl(p.image_url) || ""} alt="" />
                  )}
                  <small>{p.code}</small>
                  <h4>{p.name}</h4>
                  <span className={styles.oldPrice}>{money(p.price)}</span>
                  <span className={styles.promoPrice}>
                    {draft.promotion_type === "special_price"
                      ? money(discount)
                      : draft.promotion_type === "percentage"
                        ? `${discount}% off`
                        : `${money(discount)} off`}
                  </span>
                </article>
              ))}
            </div>
            <p className={styles.notice}>
              <T>
                Saving calls the backend calculation service. The saved preview
                contains audience-specific validated prices and conflict
                results.
              </T>
            </p>
          </>
        )}
        {step === 3 && (
          <>
            <h3>{t("Publishing readiness")}</h3>
            <div className={styles.choiceGrid}>
              <div className={styles.choice}>
                <span>
                  <strong>
                    {draft.name_en ? "✓" : "!"} <T>Basic information</T>
                  </strong>
                  <small>
                    <T>English name is required.</T>
                  </small>
                </span>
              </div>
              <div className={styles.choice}>
                <span>
                  <strong>
                    {draft.brand_rules.length ? "✓" : "!"} <T>Brand scope</T>
                  </strong>
                  <small>
                    {draft.brand_rules.length} <T>selected</T>
                  </small>
                </span>
              </div>
              <div className={styles.choice}>
                <span>
                  <strong>
                    {draft.products.length ||
                    draft.brand_rules.some((b) => b.include_all_active_products)
                      ? "✓"
                      : "!"}{" "}
                    <T>Product scope</T>
                  </strong>
                  <small>
                    {draft.products.length} <T>selected products</T>
                  </small>
                </span>
              </div>
              <div className={styles.choice}>
                <span>
                  <strong>
                    {draft.audiences.length ? "✓" : "!"} <T>Audiences</T>
                  </strong>
                  <small>
                    {draft.audiences.length} <T>selected</T>
                  </small>
                </span>
              </div>
            </div>
            <p className={styles.notice}>
              <T>
                Create the promotion as a draft, check the preview, then publish
                it directly when ready.
              </T>
            </p>
          </>
        )}
      </section>
      <footer className={styles.builderFooter}>
        <button
          className={styles.button}
          type="button"
          disabled={step === 0}
          onClick={() => setStep(Math.max(0, step - 1))}
        >
          ← {t("Previous")}
        </button>
        <div className={styles.buttons}>
          {step < steps.length - 1 && (
            <button
              className={styles.button}
              type="button"
              onClick={continueToNextStep}
            >
              {t("Continue")} →
            </button>
          )}
          {step === steps.length - 1 && <button className={styles.primary} disabled={saving} type="submit">
            {saving ? t("Saving…") : t(id ? "Save changes" : "Create promotion")}
          </button>}
        </div>
      </footer>
    </form>
  );
}

function Detail({ user, id }: { user: AuthenticatedUser; id: string }) {
  const { t, language, locale } = useLanguage();
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [links, setLinks] = useState<PromotionShareLink[]>([]);
  const [error, setError] = useState("");
  const [audience, setAudience] = useState<number | null>(null);
  const [previewViewport, setPreviewViewport] = useState<
    "desktop" | "tablet" | "mobile"
  >("desktop");
  async function load() {
    try {
      const item = await getPromotion(id);
      setPromotion(item);
      setAudience(
        (current) => current || item.audiences[0]?.audience_type_id || null,
      );
      if (canAccess(user, "promotions.manage_share_links")) {
        try {
          setLinks(await getPromotionLinks(id));
        } catch {
          setLinks([]);
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      getPromotion(id),
      canAccess(user, "promotions.manage_share_links")
        ? getPromotionLinks(id)
        : Promise.resolve([]),
    ])
      .then(([item, itemLinks]) => {
        if (!active) return;
        setPromotion(item);
        setAudience(
          (current) => current || item.audiences[0]?.audience_type_id || null,
        );
        setLinks(itemLinks);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [id, user]);
  if (error) return <div className={styles.error}>{error}</div>;
  if (!promotion)
    return <div className={styles.empty}>{t("Loading promotion…")}</div>;
  const rows = promotion.products.filter(
    (p) => !audience || p.audience_type_id === audience,
  );
  const banner = promotion.media.find((m) => m.media_type === "banner");
  const coverUrl = mediaUrl(promotion.cover_url || banner?.url || null);
  async function newLink() {
    if (!audience) return;
    try {
      await createPromotionLink(id, {
        audience_type_id: audience,
        expires_at: null,
        allow_pdf: true,
        allow_print: true,
      });
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }
  return (
    <>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            {t("PROMOTION PREVIEW")} · {promotion.code}
          </span>
          <h2>
            {language === "th" && promotion.name_th
              ? promotion.name_th
              : promotion.name_en}
          </h2>
          <p>
            {t(statusText(promotion.status))} ·{" "}
            {t(promotion.occasion_name || "Custom occasion")}
          </p>
        </div>
        <div className={styles.buttons}>
          <Link className={styles.button} href={`/promotions/${id}/edit`}>
            {t("Edit")}
          </Link>
          <Actions
            promotion={promotion}
            user={user}
            onChanged={() => void load()}
          />
        </div>
      </div>
      {promotion.conflicts.length > 0 && (
        <div className={styles.error}>
          {promotion.conflicts.length}{" "}
          <T>
            overlapping promotion conflict(s) must be resolved before publishing.
          </T>
        </div>
      )}
      <div className={styles.toolbar}>
        <strong>{t("Preview audience")}</strong>
        <select
          value={audience || ""}
          onChange={(e) => setAudience(Number(e.target.value))}
        >
          {promotion.audiences.map((a) => (
            <option key={a.audience_type_id} value={a.audience_type_id}>
              {t(a.audience_name)}
            </option>
          ))}
        </select>
        {(["desktop", "tablet", "mobile"] as const).map((viewport) => (
          <button
            key={viewport}
            className={styles.button}
            type="button"
            data-active={previewViewport === viewport}
            aria-pressed={previewViewport === viewport}
            onClick={() => setPreviewViewport(viewport)}
          >
            {t(viewport[0].toUpperCase() + viewport.slice(1))}
          </button>
        ))}
        <button
          className={styles.button}
          type="button"
          onClick={() => window.print()}
        >
          {t("PDF / Print preview")}
        </button>
      </div>
      <section
        className={`${styles.previewHero} ${styles.previewViewport}`}
        data-viewport={previewViewport}
        aria-label={`${promotion.name_en} promotion cover`}
        style={
          coverUrl
            ? {
                backgroundImage: `linear-gradient(90deg,#073b27cc,#073b2766),url("${coverUrl}")`,
              }
            : undefined
        }
      >
        <span>{t(promotion.occasion_name || "Limited Time")}</span>
        <h2>
          {language === "th" && promotion.name_th
            ? promotion.name_th
            : promotion.name_en}
        </h2>
        <p>
          {language === "th"
            ? promotion.description_th || promotion.short_title
            : promotion.short_title || promotion.description_en}
        </p>
        <small>
          {t("Valid")} {new Date(promotion.start_at).toLocaleString(locale)} –{" "}
          {new Date(promotion.end_at).toLocaleString(locale)}
        </small>
      </section>
      <div
        className={`${styles.previewProducts} ${styles.previewViewport}`}
        data-viewport={previewViewport}
      >
        {rows.map((p) => (
          <article className={styles.previewProduct} key={p.id}>
            <div className={styles.previewProductImage}>
              {p.image_url ? (
                <img
                  src={mediaUrl(p.image_url) || ""}
                  alt={`${p.product_name} product`}
                />
              ) : (
                <span>{t("No product image")}</span>
              )}
            </div>
            <small>
              {p.product_code} · {p.brand}
            </small>
            <h4>{p.product_name}</h4>
            {p.warning && <p className={styles.notice}>{p.warning}</p>}
            {promotion.audiences.find((a) => a.audience_type_id === audience)
              ?.show_prices ? (
              <>
                <span className={styles.oldPrice}>
                  {money(p.base_price, p.currency)}
                </span>
                <span className={styles.promoPrice}>
                  {money(p.promotion_price, p.currency)}
                </span>
                <p>
                  {t("Save")} {Number(p.discount_percent || 0).toFixed(0)}%
                </p>
              </>
            ) : (
              <strong>{t("Special Promotion")}</strong>
            )}
          </article>
        ))}
      </div>
      {canAccess(user, "promotions.manage_share_links") && (
        <section className={styles.panel}>
          <div className={styles.hero}>
            <div>
              <span className={styles.eyebrow}>{t("SECURE DELIVERY")}</span>
              <h3>{t("Audience promotion links")}</h3>
            </div>
            {["scheduled", "active"].includes(promotion.status) && (
              <button className={styles.primary} onClick={() => void newLink()}>
                {t("Create link for selected audience")}
              </button>
            )}
          </div>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <T>Audience</T>
                </th>
                <th>
                  <T>Status</T>
                </th>
                <th>
                  <T>Views</T>
                </th>
                <th>
                  <T>Expires</T>
                </th>
                <th>
                  <T>Actions</T>
                </th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td>{link.audience_name}</td>
                  <td>{link.status}</td>
                  <td>{link.view_count}</td>
                  <td>
                    {link.expires_at
                      ? new Date(link.expires_at).toLocaleString()
                      : "Never"}
                  </td>
                  <td>
                    <div className={styles.buttons}>
                      {link.url && (
                        <button
                          className={styles.button}
                          onClick={async () => {
                            await copyText(link.url!);
                            alert("Promotion link copied.");
                          }}
                        >
                          <T>Copy link</T>
                        </button>
                      )}
                      {link.status === "active" && (
                        <button
                          className={styles.danger}
                          onClick={async () => {
                            await revokePromotionLink(id, link.id);
                            await load();
                          }}
                        >
                          <T>Revoke</T>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function CalendarView() {
  const { t, language, locale } = useLanguage();
  const [data, setData] = useState(EMPTY_PAGE);
  const [mode, setMode] = useState("month");
  const [viewDate, setViewDate] = useState(() => new Date());
  useEffect(() => {
    getPromotions({ page_size: 100 })
      .then(setData)
      .catch(() => {});
  }, []);
  const today = new Date();
  const year = viewDate.getFullYear(),
    month = viewDate.getMonth();
  const start = new Date(year, month, 1);
  const gridStart = mode === "week"
    ? new Date(year, month, viewDate.getDate() - viewDate.getDay())
    : new Date(year, month, 1 - start.getDay());
  const cells = Array.from(
    { length: mode === "week" ? 7 : 42 },
    (_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i),
  );
  const monthNames = Array.from({ length: 12 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { month: "long" }).format(new Date(2024, index, 1)),
  );
  const weekdayNames = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2024, 0, 7 + index)),
  );
  const years = Array.from({ length: 11 }, (_, index) => year - 5 + index);
  const periodLabel = mode === "week"
    ? `${cells[0].toLocaleDateString(locale, { month: "short", day: "numeric" })} – ${cells[6].toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" })}`
    : new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(viewDate);
  const movePeriod = (direction: number) => {
    setViewDate((current) => mode === "week"
      ? new Date(current.getFullYear(), current.getMonth(), current.getDate() + direction * 7)
      : new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };
  return (
    <>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{t("SCHEDULE VISIBILITY")}</span>
          <h2>{t("Promotion calendar")}</h2>
          <p>{t("Review active periods and detect crowded campaign dates.")}</p>
        </div>
        <div className={styles.buttons}>
          {["month", "week", "list"].map((item) => (
            <button
              className={item === mode ? styles.primary : styles.button}
              key={item}
              onClick={() => setMode(item)}
              aria-pressed={item === mode}
            >
              {t(item)}
            </button>
          ))}
        </div>
      </div>
      {mode === "list" ? (
        <table className={styles.table}>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/promotions/${p.id}`}>
                    {language === "th" && p.name_th ? p.name_th : p.name_en}
                  </Link>
                </td>
                <td>{p.brands.map((b) => b.brand_name).join(", ")}</td>
                <td>{t(statusText(p.status))}</td>
                <td>{new Date(p.start_at).toLocaleString(locale)}</td>
                <td>{new Date(p.end_at).toLocaleString(locale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <section className={styles.calendarPanel} aria-label={t("Promotion calendar controls")}>
          <div className={styles.calendarToolbar}>
            <div className={styles.calendarPeriodNavigation}>
              <button type="button" onClick={() => movePeriod(-1)} aria-label={t(mode === "week" ? "Previous week" : "Previous month")}>‹</button>
              <button type="button" onClick={() => setViewDate(new Date())}>{t("Today")}</button>
              <button type="button" onClick={() => movePeriod(1)} aria-label={t(mode === "week" ? "Next week" : "Next month")}>›</button>
            </div>
            <h3 aria-live="polite">{periodLabel}</h3>
            <div className={styles.calendarSelectors}>
              <label>
                <span>{t("Month")}</span>
                <select aria-label={t("Month")} value={month} onChange={(event) => setViewDate(new Date(year, Number(event.target.value), 1))}>
                  {monthNames.map((name, index) => <option value={index} key={name}>{name}</option>)}
                </select>
              </label>
              <label>
                <span>{t("Year")}</span>
                <select aria-label={t("Year")} value={year} onChange={(event) => setViewDate(new Date(Number(event.target.value), month, 1))}>
                  {years.map((optionYear) => <option value={optionYear} key={optionYear}>{optionYear}</option>)}
                </select>
              </label>
            </div>
          </div>
          <div className={styles.calendarViewport}>
            <div className={styles.calendar} role="grid" aria-label={`${periodLabel} ${t("promotion calendar")}`}>
              {weekdayNames.map((weekday) => <div className={styles.weekday} role="columnheader" key={weekday}>{weekday}</div>)}
              {cells.map((day) => {
                const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
                const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
                const isToday = day.toDateString() === today.toDateString();
                return (
                  <div className={styles.day} data-outside={mode === "month" && day.getMonth() !== month} data-today={isToday} role="gridcell" key={day.toISOString()}>
                    <time dateTime={`${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`} aria-current={isToday ? "date" : undefined}>{day.getDate()}</time>
                    {data.items
                      .filter((p) => new Date(p.start_at) < dayEnd && new Date(p.end_at) >= dayStart)
                      .map((p) => (
                        <Link className={styles.event} href={`/promotions/${p.id}`} key={p.id}>
                          {language === "th" && p.name_th ? p.name_th : p.name_en}
                          <small>{t(statusText(p.status))}</small>
                        </Link>
                      ))}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function Occasions({ user }: { user: AuthenticatedUser }) {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<PromotionOccasion[]>([]);
  const [name, setName] = useState("");
  const [thai, setThai] = useState("");
  async function load() {
    setItems(await getPromotionOccasions());
  }
  useEffect(() => {
    void load();
  }, []);
  async function add(e: FormEvent) {
    e.preventDefault();
    await createPromotionOccasion({
      code: name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, ""),
      name_en: name,
      name_th: thai,
      description: "",
      icon_key: "calendar",
      default_banner_style: "default",
      recurring_annually: false,
      default_start_month: null,
      default_start_day: null,
      default_end_month: null,
      default_end_day: null,
      display_order: items.length * 10 + 10,
      is_active: true,
    });
    setName("");
    setThai("");
    await load();
  }
  return (
    <>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            {t("CONFIGURABLE MASTER DATA")}
          </span>
          <h2>{t("Special occasions")}</h2>
          <p>
            {t(
              "Names and annual defaults are stored in the database, not hard-coded in the form.",
            )}
          </p>
        </div>
      </div>
      {canAccess(user, "promotion_occasions.manage") && (
        <form className={styles.toolbar} onSubmit={add}>
          <input
            required
            placeholder={t("Occasion name in English")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder={t("Name in Thai")}
            value={thai}
            onChange={(e) => setThai(e.target.value)}
          />
          <button className={styles.primary} type="submit">
            {t("Add occasion")}
          </button>
        </form>
      )}
      <div className={styles.occasionGrid}>
        {items.map((o) => (
          <article className={styles.occasion} key={o.id}>
            <span className={styles.eyebrow}>{o.code}</span>
            <h3>{language === "th" && o.name_th ? o.name_th : o.name_en}</h3>
            <p>
              {language === "th" ? o.name_en : o.name_th || t("No Thai name")}
            </p>
            <small>
              {o.recurring_annually
                ? `Annual · ${o.default_start_day || "?"}/${o.default_start_month || "?"}`
                : t("Custom dates")}
            </small>
            {canAccess(user, "promotion_occasions.manage") && (
              <button
                className={styles.button}
                onClick={async () => {
                  await updatePromotionOccasion(o.id, {
                    is_active: !o.is_active,
                  });
                  await load();
                }}
              >
                {t(o.is_active ? "Deactivate" : "Activate")}
              </button>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function Reports() {
  const { t } = useLanguage();
  const [data, setData] = useState(EMPTY_PAGE);
  useEffect(() => {
    getPromotions({ page_size: 100 })
      .then(setData)
      .catch(() => {});
  }, []);
  const brands = new Map<string, number>();
  data.items.forEach((p) =>
    p.brands.forEach((b) =>
      brands.set(b.brand_name, (brands.get(b.brand_name) || 0) + 1),
    ),
  );
  return (
    <>
      <div className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>{t("PROMOTION INSIGHTS")}</span>
          <h2>{t("Promotion reports")}</h2>
          <p>
            {t(
              "Operational totals, brand activity, audience usage and conflict attention.",
            )}
          </p>
        </div>
        <a
          className={styles.primary}
          href={`${API_URL}/v1/promotion-reports/export.csv`}
        >
          {t("Export CSV")}
        </a>
      </div>
      <div className={styles.summary}>
        {Object.entries(data.summary).map(([key, value]) => (
          <article key={key}>
            <small>{t(statusText(key))}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className={styles.formGrid}>
        <section className={styles.panel}>
          <h3>{t("Promotions by brand")}</h3>
          {[...brands.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([brand, count]) => (
              <p key={brand}>
                <strong>{brand}</strong> · {count}
              </p>
            ))}
        </section>
        <section className={styles.panel}>
          <h3>{t("Quality checks")}</h3>
          <p>
            {data.items.reduce((n, p) => n + p.conflicts.length, 0)}{" "}
            <T>price conflicts</T>
          </p>
          <p>
            {
              data.items.filter((p) =>
                p.products.some((row) => row.product_status !== "active"),
              ).length
            }{" "}
            <T>promotions containing inactive products</T>
          </p>
          <p>
            {data.items.reduce(
              (n, p) =>
                n +
                p.products.filter((row) => row.warning?.includes("base price"))
                  .length,
              0,
            )}{" "}
            <T>ERP price-change warnings</T>
          </p>
        </section>
      </div>
    </>
  );
}

export function PromotionWorkspace({ mode, id }: { mode: Mode; id?: string }) {
  const router = useRouter();
  const { t } = useLanguage();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => router.replace("/login"));
  }, [router]);
  if (!user)
    return (
      <div className={styles.empty}>{t("Loading promotion workspace…")}</div>
    );
  if (
    !canAccessAny(user, [
      "promotions.view",
      "promotions.create",
      "promotions.publish",
      "promotion_occasions.view",
    ])
  )
    return (
      <div className={styles.empty}>
        {t("You do not have permission to open Promotion Management.")}
      </div>
    );
  return (
    <Shell user={user}>
      {mode === "list" && <PromotionList user={user} />}{" "}
      {mode === "builder" && <Builder id={id} />}{" "}
      {mode === "detail" && id && <Detail user={user} id={id} />}{" "}
      {mode === "calendar" && <CalendarView />}
      {mode === "occasions" && <Occasions user={user} />}{" "}
      {mode === "reports" && <Reports />}
    </Shell>
  );
}
