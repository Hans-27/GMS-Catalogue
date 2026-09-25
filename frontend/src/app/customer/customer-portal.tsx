"use client";
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ApplicationLogo } from "@/components/application-logo";
import { isCustomerUser } from "@/lib/access";
import {
  API_ORIGIN,
  ApiError,
  getCurrentUser,
  getCustomerPortal,
  logout,
  type CustomerPortalCatalogue,
  type CustomerPortalPromotion,
  type CustomerPortalResponse,
} from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import styles from "./customer-portal.module.css";

type PortalView = "home" | "catalogues" | "promotions" | "saved" | "downloads" | "help";
const ACCESS_STORAGE_KEY = "gms-customer-access";

const copy = {
  en: {
    portal: "Customer Portal", home: "Home", catalogues: "Catalogues", promotions: "Promotions", saved: "Saved", downloads: "Downloads", help: "Help",
    search: "Search catalogues, brands or promotions", browse: "Browse catalogues", viewPromotions: "View promotions", pricingApplied: "Prices matched automatically to your account.",
    published: "Published", open: "Open catalogue", download: "Download PDF", yourCatalogues: "Your catalogues", recent: "Recently viewed", pricing: "Account pricing",
    pricingDetail: "Correct brand prices are applied automatically. No setup needed.", allCatalogues: "All catalogues", activePromotions: "Active promotions", savedCatalogues: "Saved catalogues",
    downloaded: "Recent downloads", helpTitle: "How can we help?", helpText: "Contact GMS support if you cannot open a catalogue or the displayed price does not match your account.",
    emailSupport: "Email support", signOut: "Sign out", menu: "Open navigation", closeMenu: "Close navigation", accountMenu: "Open customer account menu", accountDetails: "Account details", priceProfile: "Price profile", customerCode: "Customer code", accessTitle: "Open your customer portal",
    accessText: "Enter the secure customer access code supplied by GMS.", accessCode: "Customer access code", continue: "Continue", loading: "Preparing your catalogues…",
    noCatalogues: "No published catalogues are available for this customer profile.", noPromotions: "There are no active promotions right now.", noSaved: "Save a catalogue to find it quickly here.",
    noDownloads: "Downloaded catalogues will appear here.", featured: "Featured promotion", validUntil: "Valid until", viewPromotion: "View promotion", save: "Save",
    removeSaved: "Remove from saved", customerAccount: "Customer account", growing: "Growing Together for a Smarter Tomorrow",
  },
  th: {
    portal: "พอร์ทัลลูกค้า", home: "หน้าหลัก", catalogues: "แคตตาล็อก", promotions: "โปรโมชั่น", saved: "บันทึกไว้", downloads: "ดาวน์โหลด", help: "ช่วยเหลือ",
    search: "ค้นหาแคตตาล็อก สินค้า หรือแบรนด์", browse: "ดูแคตตาล็อก", viewPromotions: "ดูโปรโมชั่น", pricingApplied: "ระบบเลือกราคาที่ตรงกับบัญชีของคุณโดยอัตโนมัติ",
    published: "เผยแพร่แล้ว", open: "เปิดแคตตาล็อก", download: "ดาวน์โหลด PDF", yourCatalogues: "แคตตาล็อกของคุณ", recent: "ดูล่าสุด", pricing: "ราคาสำหรับบัญชี",
    pricingDetail: "ระบบใช้ราคาแต่ละแบรนด์ที่ถูกต้องโดยอัตโนมัติ ไม่ต้องตั้งค่าเพิ่ม", allCatalogues: "แคตตาล็อกทั้งหมด", activePromotions: "โปรโมชั่นที่ใช้งาน", savedCatalogues: "แคตตาล็อกที่บันทึก",
    downloaded: "ดาวน์โหลดล่าสุด", helpTitle: "ให้เราช่วยอะไรได้บ้าง", helpText: "ติดต่อฝ่ายสนับสนุน GMS หากเปิดแคตตาล็อกไม่ได้ หรือราคาไม่ตรงกับบัญชีของคุณ",
    emailSupport: "อีเมลถึงฝ่ายสนับสนุน", signOut: "ออกจากระบบ", menu: "เปิดเมนู", closeMenu: "ปิดเมนู", accountMenu: "เปิดเมนูบัญชีลูกค้า", accountDetails: "รายละเอียดบัญชี", priceProfile: "โปรไฟล์ราคา", customerCode: "รหัสลูกค้า", accessTitle: "เปิดพอร์ทัลลูกค้า",
    accessText: "กรอกรหัสเข้าใช้งานที่ปลอดภัยซึ่งได้รับจาก GMS", accessCode: "รหัสเข้าใช้งานของลูกค้า", continue: "ดำเนินการต่อ", loading: "กำลังเตรียมแคตตาล็อก…",
    noCatalogues: "ยังไม่มีแคตตาล็อกที่เผยแพร่สำหรับลูกค้านี้", noPromotions: "ขณะนี้ไม่มีโปรโมชั่นที่ใช้งาน", noSaved: "บันทึกแคตตาล็อกเพื่อกลับมาดูได้รวดเร็ว",
    noDownloads: "แคตตาล็อกที่ดาวน์โหลดจะแสดงที่นี่", featured: "โปรโมชั่นแนะนำ", validUntil: "ใช้ได้ถึง", viewPromotion: "ดูโปรโมชั่น", save: "บันทึก",
    removeSaved: "นำออกจากรายการบันทึก", customerAccount: "บัญชีลูกค้า", growing: "เติบโตไปด้วยกัน เพื่อวันพรุ่งนี้ที่ชาญฉลาดกว่า",
  },
} as const;

function Icon({ name }: { name: PortalView | "search" | "download" | "price" | "menu" | "close" | "logout" }) {
  const paths: Record<string, ReactNode> = {
    home: <><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10M9.5 20v-6h5v6"/></>,
    catalogues: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v18H7.5A3.5 3.5 0 0 0 4 23Z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v18h4.5A3.5 3.5 0 0 1 20 23Z"/></>,
    promotions: <><path d="M20 13 13 20l-9-9V4h7Z"/><circle cx="8" cy="8" r="1"/></>, saved: <path d="M6 3h12v18l-6-4-6 4Z"/>,
    downloads: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M4 19v2h16v-2"/></>, help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.5 2.1c-.9.5-1.3 1-1.3 2M12 17h.01"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>, download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5"/><path d="M4 19v2h16v-2"/></>,
    price: <><path d="M20 13 13 20l-9-9V4h7Z"/><circle cx="8" cy="8" r="1"/></>, menu: <path d="M4 7h16M4 12h16M4 17h16"/>, close: <path d="m6 6 12 12M18 6 6 18"/>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function normalizeAccessCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed, window.location.origin);
    const match = url.pathname.match(/\/c\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : trimmed;
  } catch { return trimmed; }
}

function mediaUrl(value: string | null) {
  if (!value) return null;
  return value.startsWith("http") ? value : `${API_ORIGIN}${value}`;
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function storageList(key: string): string[] {
  try { return JSON.parse(window.localStorage.getItem(key) || "[]") as string[]; }
  catch { return []; }
}

export function CustomerPortal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { language, locale, setLanguage } = useLanguage();
  const text = copy[language];
  const [portal, setPortal] = useState<CustomerPortalResponse | null>(null);
  const [accessInput, setAccessInput] = useState("");
  const [needsAccess, setNeedsAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PortalView>("home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [downloadIds, setDownloadIds] = useState<string[]>([]);
  const [accountOpen, setAccountOpen] = useState(false);

  async function loadPortal(rawAccess: string) {
    const access = normalizeAccessCode(rawAccess);
    if (!access) { setNeedsAccess(true); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const data = await getCustomerPortal(access);
      window.sessionStorage.setItem(ACCESS_STORAGE_KEY, access);
      setPortal(data); setNeedsAccess(false);
      const suffix = data.customer.code;
      setSavedIds(storageList(`gms-customer-saved:${suffix}`));
      setRecentIds(storageList(`gms-customer-recent:${suffix}`));
      setDownloadIds(storageList(`gms-customer-downloads:${suffix}`));
      if (window.location.search) window.history.replaceState({}, "", "/customer");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "The customer portal is unavailable. Please try again.");
      setNeedsAccess(true);
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let active = true;
    void getCurrentUser().then((user) => {
      if (!active) return;
      if (!isCustomerUser(user)) { router.replace("/dashboard"); return; }
      const access = searchParams.get("access") || window.sessionStorage.getItem(ACCESS_STORAGE_KEY) || "";
      void loadPortal(access);
    }).catch(() => {
      const requestedAccess = searchParams.get("access");
      const next = requestedAccess ? `/customer?access=${encodeURIComponent(requestedAccess)}` : "/customer";
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    });
    return () => { active = false; };
  }, [router, searchParams]);

  const filteredCatalogues = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!portal || !term) return portal?.catalogues || [];
    return portal.catalogues.filter((item) => `${item.title} ${item.brand || ""} ${item.description}`.toLocaleLowerCase().includes(term));
  }, [portal, query]);
  const filteredPromotions = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!portal || !term) return portal?.promotions || [];
    return portal.promotions.filter((item) => `${item.name} ${item.description}`.toLocaleLowerCase().includes(term));
  }, [portal, query]);

  function saveLists(kind: "saved" | "recent" | "downloads", ids: string[]) {
    if (portal) window.localStorage.setItem(`gms-customer-${kind}:${portal.customer.code}`, JSON.stringify(ids.slice(0, 12)));
  }
  function toggleSaved(id: string) { const next = savedIds.includes(id) ? savedIds.filter((item) => item !== id) : [id, ...savedIds]; setSavedIds(next); saveLists("saved", next); }
  function rememberOpen(id: string) { const next = [id, ...recentIds.filter((item) => item !== id)]; setRecentIds(next); saveLists("recent", next); }
  function rememberDownload(id: string) { const next = [id, ...downloadIds.filter((item) => item !== id)]; setDownloadIds(next); saveLists("downloads", next); }
  function navigate(next: PortalView) { setView(next); setMobileOpen(false); setAccountOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function signOut() { try { await logout(); } finally { window.sessionStorage.removeItem(ACCESS_STORAGE_KEY); router.replace("/login"); } }

  if (loading) return <main className={styles.loading}><ApplicationLogo priority/><p>{text.loading}</p></main>;
  if (needsAccess || !portal) return <AccessScreen accessInput={accessInput} setAccessInput={setAccessInput} error={error} text={text} onSubmit={() => void loadPortal(accessInput)}/>;

  const featured = portal.promotions[0];
  const savedCatalogues = portal.catalogues.filter((item) => savedIds.includes(item.id));
  const recentCatalogues = recentIds.map((id) => portal.catalogues.find((item) => item.id === id)).filter(Boolean) as CustomerPortalCatalogue[];
  const downloadedCatalogues = downloadIds.map((id) => portal.catalogues.find((item) => item.id === id)).filter(Boolean) as CustomerPortalCatalogue[];
  const visibleCatalogues = view === "saved" ? savedCatalogues : view === "downloads" ? downloadedCatalogues : filteredCatalogues;
  const navItems: Array<[PortalView, string]> = [["home", text.home], ["catalogues", text.catalogues], ["promotions", text.promotions], ["saved", text.saved], ["downloads", text.downloads], ["help", text.help]];

  const catalogueCard = (item: CustomerPortalCatalogue) => <CatalogueCard key={item.id} item={item} text={text} locale={locale} saved={savedIds.includes(item.id)} onSave={() => toggleSaved(item.id)} onOpen={() => rememberOpen(item.id)} onDownload={() => rememberDownload(item.id)}/>;

  return <div className={styles.portal}>
    <aside className={styles.sidebar} data-open={mobileOpen}>
      <div className={styles.sidebarBrand}><ApplicationLogo priority/><div><strong>GMS</strong><span>{text.portal}</span></div><button type="button" onClick={() => setMobileOpen(false)} aria-label={text.closeMenu}><Icon name="close"/></button></div>
      <nav aria-label="Customer portal">{navItems.map(([key, label]) => <button type="button" key={key} data-active={view === key} aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)}><Icon name={key}/><span>{label}</span>{key === "saved" && savedIds.length ? <small>{savedIds.length}</small> : null}</button>)}</nav>
      <div className={styles.sidebarFooter}><button type="button" onClick={() => navigate("home")}><span className={styles.customerMark}>{portal.customer.name.slice(0, 2).toUpperCase()}</span><span><strong>{portal.customer.name}</strong><small>{text.customerAccount}</small></span><b aria-hidden="true">›</b></button><p>{text.growing}</p></div>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <button className={styles.menuButton} type="button" onClick={() => setMobileOpen(true)} aria-label={text.menu}><Icon name="menu"/></button>
        <label className={styles.search}><Icon name="search"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search}/></label>
        <div className={styles.topActions}>
          <div className={styles.language} role="group" aria-label="Language"><button type="button" data-active={language === "en"} onClick={() => setLanguage("en")}>EN</button><span>|</span><button type="button" data-active={language === "th"} onClick={() => setLanguage("th")}>ไทย</button></div>
          <a href="mailto:it.support@gms.co.th"><Icon name="help"/>{text.help}</a>
          <div className={styles.profileWrap}>
            <button className={styles.profileButton} type="button" aria-label={text.accountMenu} aria-expanded={accountOpen} aria-haspopup="menu" onClick={() => setAccountOpen((open) => !open)}><span className={styles.profileIcon}>{portal.customer.name.slice(0, 1)}</span><span>{portal.customer.name}</span><b aria-hidden="true">⌄</b></button>
            {accountOpen ? <div className={styles.accountMenu} role="menu">
              <p>{text.accountDetails}</p>
              <strong>{portal.customer.name}</strong>
              <dl><div><dt>{text.priceProfile}</dt><dd>{portal.customer.audience_name}</dd></div><div><dt>{text.customerCode}</dt><dd>{portal.customer.code}</dd></div></dl>
              <button type="button" role="menuitem" onClick={() => void signOut()}><Icon name="logout"/>{text.signOut}</button>
            </div> : null}
          </div>
        </div>
      </header>
      <main className={styles.main}>
        {view === "home" ? <>
          <section className={styles.hero}>
            <div className={styles.welcome}><p className={styles.eyebrow}>{text.customerAccount}</p><h1>{language === "th" ? `สวัสดี ${portal.customer.name}` : `Good morning, ${portal.customer.name}`}</h1><p>{language === "th" ? "แคตตาล็อก โปรโมชั่น และราคาสำหรับบัญชีของคุณอยู่ในที่เดียว" : "Your published catalogues, promotions and account prices in one place."}</p><div className={styles.priceContext}><Icon name="price"/><strong>{portal.customer.audience_name} pricing</strong><span>{text.pricingApplied}</span></div><div className={styles.welcomeActions}><button type="button" onClick={() => navigate("catalogues")}><Icon name="catalogues"/>{text.browse}<span>→</span></button><button type="button" onClick={() => navigate("promotions")}><Icon name="promotions"/>{text.viewPromotions}</button></div></div>
            <div className={styles.heroSummary}><span>{text.accountDetails}</span><strong>{portal.customer.name}</strong><small>{portal.customer.code}</small><div><Icon name="price"/><p><b>{portal.customer.audience_name}</b>{text.pricingApplied}</p></div></div>
            <section className={styles.metrics} aria-label="Account summary"><p><Icon name="catalogues"/><strong>{portal.catalogues.length}</strong><span>{language === "th" ? `${portal.catalogues.length} แคตตาล็อกพร้อมใช้งาน` : `${portal.catalogues.length} available catalogue${portal.catalogues.length === 1 ? "" : "s"}`}</span></p><p><Icon name="promotions"/><strong>{portal.promotions.length}</strong><span>{language === "th" ? `${portal.promotions.length} โปรโมชั่นที่ใช้งาน` : `${portal.promotions.length} active promotion${portal.promotions.length === 1 ? "" : "s"}`}</span></p><p><Icon name="download"/><strong>{downloadIds.length}</strong><span>{text.downloaded}</span></p></section>
          </section>
          {featured ? <section className={styles.featured} style={featured.cover_url ? { backgroundImage: `linear-gradient(90deg, rgba(249,250,248,.98) 0%, rgba(249,250,248,.86) 42%, rgba(249,250,248,.05) 78%), url(${mediaUrl(featured.cover_url)})` } : undefined}><span>{text.featured}</span><h2>{featured.name}</h2><p>{featured.description}</p><small>{text.validUntil} {formatDate(featured.end_at, locale)}</small><a href={featured.public_url} target="_blank" rel="noreferrer">{text.viewPromotion} →</a></section> : null}
          <section><div className={styles.sectionHeading}><h2>{text.yourCatalogues}</h2><button type="button" onClick={() => navigate("catalogues")}>{text.allCatalogues} →</button></div>{filteredCatalogues.length ? <div className={styles.catalogueGrid}>{filteredCatalogues.slice(0, 3).map(catalogueCard)}</div> : <div className={styles.empty}>{text.noCatalogues}</div>}</section>
          <div className={styles.lowerGrid}><section className={styles.recentPanel}><div className={styles.sectionHeading}><h2>{text.recent}</h2></div>{recentCatalogues.length ? recentCatalogues.slice(0, 3).map((item) => <a href={item.public_url} key={item.id} target="_blank" rel="noreferrer" onClick={() => rememberOpen(item.id)}><span>{item.brand?.slice(0, 2).toUpperCase() || "GM"}</span><div><strong>{item.title}</strong><small>{formatDate(item.updated_at, locale)}</small></div><b>→</b></a>) : <p className={styles.subtle}>{language === "th" ? "แคตตาล็อกที่คุณเปิดจะปรากฏที่นี่" : "Catalogues you open will appear here."}</p>}</section><section className={styles.pricingPanel}><Icon name="price"/><div><h2>{text.pricing}</h2><p>{text.pricingDetail}</p><ul>{portal.brand_prices.slice(0, 4).map((item) => <li key={item.brand}>{item.brand} → {item.price_list_code}</li>)}</ul></div></section></div>
        </> : null}
        {view === "catalogues" || view === "saved" || view === "downloads" ? <section><PageHeading title={view === "catalogues" ? text.allCatalogues : view === "saved" ? text.savedCatalogues : text.downloaded} eyebrow={text.portal}/>{visibleCatalogues.length ? <div className={styles.catalogueGrid}>{visibleCatalogues.map(catalogueCard)}</div> : <div className={styles.empty}>{view === "saved" ? text.noSaved : view === "downloads" ? text.noDownloads : text.noCatalogues}</div>}</section> : null}
        {view === "promotions" ? <section><PageHeading title={text.activePromotions} eyebrow={text.portal}/><PromotionCards items={filteredPromotions} text={text} locale={locale}/></section> : null}
        {view === "help" ? <section className={styles.helpPanel}><Icon name="help"/><p className={styles.eyebrow}>GMS Support</p><h1>{text.helpTitle}</h1><p>{text.helpText}</p><a href="mailto:it.support@gms.co.th?subject=Customer portal support">{text.emailSupport}</a><small>it.support@gms.co.th</small></section> : null}
      </main>
    </div>
    {mobileOpen ? <button className={styles.backdrop} type="button" aria-label={text.closeMenu} onClick={() => setMobileOpen(false)}/> : null}
  </div>;
}

type Copy = (typeof copy)["en"] | (typeof copy)["th"];

function AccessScreen({ accessInput, setAccessInput, error, text, onSubmit }: { accessInput: string; setAccessInput: (value: string) => void; error: string; text: Copy; onSubmit: () => void }) {
  return <main className={styles.accessPage}><section className={styles.accessCard}><ApplicationLogo priority/><p className={styles.eyebrow}>GMS {text.portal}</p><h1>{text.accessTitle}</h1><p>{text.accessText}</p><form onSubmit={(event: FormEvent) => { event.preventDefault(); onSubmit(); }}><label htmlFor="customer-access">{text.accessCode}</label><input id="customer-access" value={accessInput} onChange={(event) => setAccessInput(event.target.value)} minLength={20} required autoFocus/>{error && <p className={styles.formError} role="alert">{error}</p>}<button type="submit">{text.continue}<span aria-hidden="true">→</span></button></form></section></main>;
}

function PageHeading({ title, eyebrow }: { title: string; eyebrow: string }) { return <div className={styles.pageHeading}><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1></div>; }

function CatalogueCard({ item, text, locale, saved, onSave, onOpen, onDownload }: { item: CustomerPortalCatalogue; text: Copy; locale: string; saved: boolean; onSave: () => void; onOpen: () => void; onDownload: () => void }) {
  const cover = mediaUrl(item.cover_url);
  return <article className={styles.catalogueCard}><div className={styles.catalogueCover} data-fallback={!cover}>{cover ? <img src={cover} alt={`${item.title} cover`}/> : <div><span>{item.brand || "GMS"}</span><strong>{item.title}</strong></div>}<button type="button" className={styles.saveButton} aria-label={saved ? text.removeSaved : text.save} aria-pressed={saved} onClick={onSave}><Icon name="saved"/></button></div><div className={styles.catalogueBody}><p className={styles.brand}>{item.brand || "GMS Catalogue"}</p><h3>{item.title}</h3><div className={styles.meta}><span>{text.published}</span><time>{formatDate(item.updated_at, locale)}</time></div><a className={styles.primaryAction} href={item.public_url} target="_blank" rel="noreferrer" onClick={onOpen}>{text.open}<span aria-hidden="true">→</span></a>{item.allow_pdf_download && item.pdf_url ? <a className={styles.secondaryAction} href={mediaUrl(item.pdf_url) || item.pdf_url} onClick={onDownload}><Icon name="download"/>{text.download}</a> : null}</div></article>;
}

function PromotionCards({ items, text, locale }: { items: CustomerPortalPromotion[]; text: Copy; locale: string }) {
  if (!items.length) return <div className={styles.empty}>{text.noPromotions}</div>;
  return <div className={styles.promotionGrid}>{items.map((item) => <article key={item.id} className={styles.promotionCard} style={item.cover_url ? { backgroundImage: `linear-gradient(90deg, rgba(4,57,38,.94), rgba(4,57,38,.28)), url(${mediaUrl(item.cover_url)})` } : undefined}><span>{text.activePromotions}</span><h3>{item.name}</h3><p>{item.description}</p><small>{text.validUntil} {formatDate(item.end_at, locale)}</small><a href={item.public_url} target="_blank" rel="noreferrer">{text.viewPromotion} →</a></article>)}</div>;
}
