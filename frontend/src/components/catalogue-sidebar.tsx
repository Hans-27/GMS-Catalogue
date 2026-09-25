"use client";
/* eslint-disable @next/next/no-img-element */

import { isValidElement, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { applicationBranding } from "@/lib/branding";
import { useLanguage } from "@/lib/i18n";
import styles from "./catalogue-sidebar.module.css";

export type CatalogueSidebarItem = {
  id: string;
  label: string;
  badge?: string;
  href?: string;
  count?: number;
  countText?: string;
  countLabel?: string;
  active?: boolean;
  onSelect?: () => void;
  action?: {
    label: string;
    onSelect: () => void;
    icon?: ReactNode;
    disabled?: boolean;
    busy?: boolean;
  };
};

type CatalogueSidebarProps = {
  title: string;
  subtitle?: string;
  logo?: ReactNode;
  searchLabel: string;
  searchPlaceholder?: string;
  searchHint?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  categories: CatalogueSidebarItem[];
  utilities?: CatalogueSidebarItem[];
  navigationLabel?: string;
  mobileActions?: ReactNode;
  footer?: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
};

/** Presentation only: counts, search semantics and navigation remain view-owned. */
export function CatalogueSidebar({ title, subtitle, logo, searchLabel, searchPlaceholder, searchHint, searchValue, onSearchChange, categories, utilities = [], navigationLabel, mobileActions, footer, collapsed = false, onToggleCollapse }: CatalogueSidebarProps) {
  const { t } = useLanguage();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [failedLogoSource, setFailedLogoSource] = useState("");
  const logoSource = isValidElement<{ src?: string }>(logo) && logo.type === "img" ? logo.props.src?.trim() || "" : null;
  const visibleLogo = logoSource === null ? logo : logoSource && logoSource !== failedLogoSource ? logo : null;
  const dialog = useRef<HTMLDialogElement>(null);
  const label = navigationLabel || t("Catalogue categories");

  useEffect(() => {
    if (!open || !dialog.current) return;
    const panel = dialog.current;
    const returnFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    if (typeof panel.showModal === "function") panel.showModal();
    else panel.setAttribute("open", "");
    document.body.style.overflow = "hidden";
    panel.querySelector<HTMLInputElement>("input")?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(panel.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, [tabindex="0"]'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const resize = () => { if (window.innerWidth > 900) setOpen(false); };
    panel.addEventListener("keydown", keyboard);
    window.addEventListener("resize", resize);
    return () => {
      panel.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", resize);
      if (typeof panel.close === "function") panel.close();
      else panel.removeAttribute("open");
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, [open]);

  function row(item: CatalogueSidebarItem, compact: boolean) {
    const identity = <><i aria-hidden="true">{item.badge || item.label.slice(0, 2).toUpperCase()}</i><span className={styles.rowLabel}>{item.label}</span></>;
    const count = item.count !== undefined && <small className={styles.count}>{item.countText ?? item.count}</small>;
    const select = () => { item.onSelect?.(); setOpen(false); };
    const props = {
      className: styles.row,
      "data-active": Boolean(item.active),
      "aria-current": item.active ? "page" as const : undefined,
      "aria-label": item.countLabel ? `${item.label}, ${item.countLabel}` : item.label,
      title: compact ? item.label : undefined,
    };
    const navigation = item.href
      ? <a key={item.id} {...props} href={item.href} onClick={(event) => { if (item.onSelect) event.preventDefault(); select(); }}>{identity}{!item.action && count}</a>
      : <button key={item.id} {...props} type="button" onClick={select}>{identity}{!item.action && count}</button>;
    if (!item.action) return navigation;
    return <div key={item.id} className={styles.actionRow} data-active={Boolean(item.active)}>
      {navigation}
      <button
        type="button"
        className={styles.rowAction}
        aria-label={item.action.label}
        title={item.action.label}
        disabled={item.action.disabled || item.action.busy}
        aria-busy={item.action.busy || undefined}
        onClick={(event) => { event.stopPropagation(); item.action?.onSelect(); }}
      ><span aria-hidden="true">{item.action.icon ?? "↓"}</span></button>
      {count}
    </div>;
  }

  function contents(mobile: boolean) {
    const compact = collapsed && !mobile;
    return <>
      <div className={styles.identity} title={title}>
        <div className={styles.logo} onErrorCapture={(event) => {
          if (logoSource && (event.target as HTMLImageElement).getAttribute("src") === logoSource) setFailedLogoSource(logoSource);
        }}>{visibleLogo || <img src={applicationBranding.defaultLogo} alt={applicationBranding.logoAlt} />}</div>
        <div className={styles.identityText}><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
      </div>
      <div className={styles.searchGroup}>
        <label className={styles.searchLabel} htmlFor={`${id}-${mobile ? "mobile" : "desktop"}-search`}>{searchLabel}</label>
        <div className={styles.search}>
          <span aria-hidden="true">⌕</span>
          <input
            id={`${id}-${mobile ? "mobile" : "desktop"}-search`}
            type="search"
            aria-label={searchLabel}
            placeholder={searchPlaceholder || searchLabel}
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
          />
          {searchValue && (
            <button type="button" className={styles.searchClear} aria-label={t("Clear search")} onClick={() => onSearchChange("")}>×</button>
          )}
        </div>
        {searchHint && <small className={styles.searchHint}>{searchHint}</small>}
      </div>
      <nav className={styles.navigation} aria-label={label}>
        {utilities.length > 0 && <div className={styles.utilities}>{utilities.map((item) => row(item, compact))}</div>}
        <p className={styles.heading}>{t("PRODUCT CATEGORIES")}</p>
        <div className={styles.categoryScroll} role="region" aria-label={t("PRODUCT CATEGORIES")} tabIndex={0}>
          {categories.map((item) => row(item, compact))}
          {categories.length === 0 && <p className={styles.empty}>{t("No matching categories.")}</p>}
        </div>
      </nav>
      {footer && <div className={styles.footer}>{footer}</div>}
      {onToggleCollapse && !mobile && <button type="button" className={styles.collapse} onClick={onToggleCollapse} aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")} aria-expanded={!collapsed}><span aria-hidden="true">{collapsed ? "›" : "‹"}</span>{!collapsed && t("Collapse sidebar")}</button>}
    </>;
  }

  return <>
    <div className={styles.mobileBar} data-has-actions={Boolean(mobileActions)}>
      <a className={styles.mobileBrand} href="/dashboard" aria-label={t("Back to Dashboard")}>
        <img src={applicationBranding.defaultLogo} alt={applicationBranding.logoAlt} />
      </a>
      <div className={`${styles.search} ${styles.mobileSearch}`}>
        <span aria-hidden="true">⌕</span>
        <input
          id={`${id}-mobile-header-search`}
          type="search"
          aria-label={searchLabel}
          placeholder={searchPlaceholder || searchLabel}
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {searchValue && (
          <button type="button" className={styles.searchClear} aria-label={t("Clear search")} onClick={() => onSearchChange("")}>×</button>
        )}
      </div>
      {mobileActions && <div className={styles.mobileActions}>{mobileActions}</div>}
    </div>
    <div className={styles.mobileMenuBar}>
      <button className={styles.mobileMenuButton} type="button" aria-label={t("Categories")} aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)}><span aria-hidden="true">☰</span></button>
    </div>
    <aside className={styles.sidebar} aria-label={label} data-collapsed={collapsed} data-catalogue-navigation>{contents(false)}</aside>
    <dialog id={id} ref={dialog} className={styles.drawer} aria-label={label} data-catalogue-navigation onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      {open && <div className={styles.drawerContent}><button type="button" className={styles.close} aria-label={t("Close categories")} onClick={() => setOpen(false)}>×</button>{contents(true)}</div>}
    </dialog>
  </>;
}

/** Observe document sections, not product/price data. Safe in render-only environments. */
export function useCatalogueCurrentSection(sectionIds: string[]) {
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || sectionIds.length === 0) return;
    const elements = sectionIds.map((sectionId) => document.getElementById(sectionId)).filter((element): element is HTMLElement => Boolean(element));
    const update = () => {
      const top = window.innerHeight * .15;
      const bottom = window.innerHeight * .85;
      let current: HTMLElement | undefined;
      let best = 0;
      for (const element of elements) {
        const bounds = element.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(bounds.bottom, bottom) - Math.max(bounds.top, top));
        const score = bounds.height > 0 ? overlap / bounds.height : 0;
        if (score > best) { best = score; current = element; }
      }
      if (current) setSelected(current.id);
    };
    // Threshold callbacks can leave old ratios cached. Measure current geometry,
    // including lower-visible final sections, at most once per scroll frame.
    let frame = 0;
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; update(); });
    };
    const observer = new IntersectionObserver(update, { rootMargin: "-15% 0px -15%", threshold: [0, .05, .35] });
    elements.forEach((element) => observer.observe(element));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [sectionIds]);
  return [sectionIds.includes(selected) ? selected : sectionIds[0] || "", setSelected] as const;
}
