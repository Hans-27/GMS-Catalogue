"use client";

import Link from "next/link";
import type { KeyboardEvent, MouseEvent } from "react";
import { ApplicationLogo } from "@/components/application-logo";
import { accountTypeLabel, canAccessAny, isCataloguePortalUser, isSalesUser } from "@/lib/access";
import type { AuthenticatedUser } from "@/lib/api";
import { applicationBranding } from "@/lib/branding";
import { useLanguage } from "@/lib/i18n";
import { APP_ROUTES, SIDEBAR_GROUPS, type DashboardView, type SidebarRouteItem } from "@/lib/routes";
import styles from "./dashboard.module.css";

type NavigationItem = readonly [DashboardView, string, string];

type Props = {
  activeView: DashboardView;
  navigationItems: NavigationItem[];
  productCount: number;
  inReviewCount: number;
  user: AuthenticatedUser;
  collapsed: boolean;
  mobileOpen: boolean;
  onNavigate: (view: DashboardView) => void;
  onBrandNavigate: () => void;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

const NAV_ICON_PATHS: Record<string, string[]> = {
  OV: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5", "M9 21v-7h6v7"],
  CM: ["M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22Z", "M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22Z"],
  DS: ["m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10Z", "m14.5 7.5 3 3"],
  PR: ["m12 2 9 5-9 5-9-5Z", "m3 7 9 5 9-5", "M3 7v10l9 5 9-5V7", "M12 12v10"],
  CA: ["M4 4h6v6H4Z", "M14 4h6v6h-6Z", "M4 14h6v6H4Z", "M14 14h6v6h-6Z"],
  MD: ["M4 4h16v16H4Z", "m4 15 4.5-5 3.5 4 2.5-3 5.5 6", "M16 8h.01"],
  PC: ["M4 5h16v14H4Z", "M4 9h16", "M8 13h4", "M8 16h8"],
  PO: ["m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"],
  OR: ["M4 21V7l8-4 8 4v14", "M9 21v-5h6v5", "M8 9h.01M12 9h.01M16 9h.01M8 12h.01M12 12h.01M16 12h.01"],
  US: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M22 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
  SY: ["M20 7h-5V2", "M4 17h5v5", "M20 7a8 8 0 0 0-13.7-3", "M4 17a8 8 0 0 0 13.7 3"],
  SH: ["M3 12h4l2.2-5 4.1 10 2.2-5H21"],
  SE: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"],
};

function NavigationIcon({ name }: { name: string }) {
  if (name === "PM") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <text
          x="12"
          y="17.5"
          textAnchor="middle"
          fill="currentColor"
          stroke="none"
          fontSize="18"
          fontWeight="800"
        >
          ฿
        </text>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {(NAV_ICON_PATHS[name] ?? NAV_ICON_PATHS.CA).map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

export function DashboardSidebar({
  activeView,
  navigationItems,
  productCount,
  inReviewCount,
  user,
  collapsed,
  mobileOpen,
  onNavigate,
  onBrandNavigate,
  onToggleCollapsed,
  onCloseMobile,
}: Props) {
  const { t } = useLanguage();
  const salesOnly = isSalesUser(user);
  const cataloguePortalOnly = isCataloguePortalUser(user);
  const hasOverview = !cataloguePortalOnly && navigationItems.some(([view]) => view === "overview");
  const allowedViews = new Set(navigationItems.map(([view]) => view));
  const visibleGroups = SIDEBAR_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        canAccessAny(user, item.permissions) &&
        (!item.dashboardView || allowedViews.has(item.dashboardView)) &&
        (!salesOnly ||
          item.dashboardView === "catalogues" ||
          item.href === APP_ROUTES.productCards ||
          group.label === "System"),
    ),
  })).filter((group) => group.items.length > 0);

  function activateBrand() {
    if (cataloguePortalOnly) onNavigate("catalogues");
    else if (hasOverview) onBrandNavigate();
    else if (navigationItems[0]) onNavigate(navigationItems[0][0]);
    onCloseMobile();
  }

  function brandClicked(event: MouseEvent<HTMLAnchorElement>) {
    activateBrand();
    if (
      window.location.pathname === APP_ROUTES.overview &&
      !window.location.search
    ) {
      event.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function brandKeyDown(event: KeyboardEvent<HTMLAnchorElement>) {
    if (event.key !== "Enter") return;
    activateBrand();
  }

  function selectView(view: DashboardView) {
    onNavigate(view);
    onCloseMobile();
  }

  function dashboardLinkClicked(event: MouseEvent<HTMLAnchorElement>, item: SidebarRouteItem) {
    if (!item.dashboardView) return;
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) return;
    if (item.dashboardView === "overview") {
      brandClicked(event);
      return;
    }
    event.preventDefault();
    const target = new URL(item.href, window.location.origin);
    window.history.pushState({}, "", `${target.pathname}${target.search}${target.hash}`);
    selectView(item.dashboardView);
  }

  return (
    <>
      {mobileOpen && (
        <button
          className={styles.sidebarBackdrop}
          type="button"
          aria-label="Close navigation"
          onClick={onCloseMobile}
        />
      )}
      <aside
        id="application-sidebar"
        className={styles.sidebar}
        data-collapsed={collapsed}
        data-mobile-open={mobileOpen}
        aria-label="Application sidebar"
      >
        <Link
          className={styles.brand}
          href={cataloguePortalOnly ? APP_ROUTES.catalogues : APP_ROUTES.overview}
          aria-label={cataloguePortalOnly ? "Go to Catalogues" : "Go to Overview"}
          title={collapsed ? (cataloguePortalOnly ? "Go to Catalogues" : "Go to Overview") : undefined}
          onClick={brandClicked}
          onKeyDown={brandKeyDown}
        >
          <span className={styles.logo}>
            <ApplicationLogo priority />
          </span>
          <span className={styles.brandText}>
            <strong>{applicationBranding.companyName}</strong>
            <span>{applicationBranding.applicationName}</span>
          </span>
        </Link>
        <nav aria-label="Catalogue navigation">
          {visibleGroups.map((group) => (
            <section className={styles.sidebarNavigationSection} key={group.label} aria-label={t(group.label)}>
              <span className={styles.navSectionLabel}>{t(group.label)}</span>
              {group.items.map((item) => (
                <Link
                  key={`${group.label}:${item.href}`}
                  className={item.dashboardView && activeView === item.dashboardView ? styles.activeNav : ""}
                  href={item.href}
                  aria-current={item.dashboardView && activeView === item.dashboardView ? "page" : undefined}
                  onClick={(event) => {
                    dashboardLinkClicked(event, item);
                    if (!item.dashboardView) onCloseMobile();
                  }}
                >
                  <span><NavigationIcon name={item.icon} /></span>
                  <span className={styles.navLabel}>{t(item.label)}</span>
                  {item.dashboardView === "products" && <small>{productCount}</small>}
                  {item.dashboardView === "overview" && inReviewCount > 0 && <i>{inReviewCount}</i>}
                </Link>
              ))}
            </section>
          ))}
        </nav>
        <button
          className={styles.collapseSidebar}
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : undefined}
        >
          <span aria-hidden="true">{collapsed ? ">" : "<"}</span>
          <span className={styles.navLabel}>
            {collapsed ? "Expand" : "Collapse"}
          </span>
        </button>
        <div className={styles.sidebarFoot}>
          <span>{t("Signed in as")}</span>
          <strong>{user.full_name}</strong>
          <small>{accountTypeLabel(user)}</small>
        </div>
      </aside>
    </>
  );
}
