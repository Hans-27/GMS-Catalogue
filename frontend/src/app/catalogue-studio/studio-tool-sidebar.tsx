"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { useStudioSidebarCopy } from "@/lib/studio-sidebar-copy";
import styles from "./studio-tool-sidebar.module.css";

export type StudioToolTab = "elements" | "cards" | "fields" | "prices" | "products" | "media" | "pages" | "layers" | "cover";

type Props = {
  activeTab: StudioToolTab;
  onSelectTab: (tab: StudioToolTab) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  mainTabs: readonly StudioToolTab[];
  secondaryTabs: readonly StudioToolTab[];
  children: ReactNode;
};

const iconPaths: Record<StudioToolTab | "more" | "collapse" | "expand", ReactNode> = {
  products: <><path d="m12 3 8 4v10l-8 4-8-4V7l8-4Z" /><path d="m4 7 8 4 8-4M12 11v10M8 5l8 4" /></>,
  cover: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 7h8M8 17l3-4 2 2 3-4" /></>,
  elements: <><rect x="3" y="3" width="7" height="7" rx="1" /><circle cx="17" cy="6.5" r="3.5" /><path d="m6.5 14 4 7h-8l4-7Z" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  cards: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 8h18M11 8v12M6 12h2M6 16h2M14 12h4M14 16h4" /></>,
  media: <><path d="M12 15V3m-4 4 4-4 4 4M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></>,
  pages: <><rect x="7" y="3" width="14" height="16" rx="2" /><path d="M17 21H5a2 2 0 0 1-2-2V7M11 7h6M11 11h6M11 15h4" /></>,
  prices: <><path d="M12 3v18M17 6H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6" /></>,
  fields: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M10 9v11M3 14h18" /></>,
  layers: <><path d="m12 3 10 5-10 5L2 8l10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" /></>,
  more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  collapse: <><path d="m14 6-6 6 6 6" /></>,
  expand: <><path d="m10 6 6 6-6 6" /></>,
};

export function StudioToolIcon({ tool }: { tool: keyof typeof iconPaths }) {
  return <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{iconPaths[tool]}</svg>;
}

export function StudioLibrarySearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const copy = useStudioSidebarCopy();
  return <div className={styles.search}>
    <label htmlFor={id}>{label}</label>
    <div className={styles.searchBox}>
      <input id={id} type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} />
      {value && <button type="button" aria-label={copy.clear} onClick={() => onChange("")}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}
    </div>
  </div>;
}

function subscribeToNarrowLayout(callback: () => void) {
  const query = window.matchMedia?.("(max-width: 1279px)");
  query?.addEventListener("change", callback);
  return () => query?.removeEventListener("change", callback);
}

export function StudioToolSidebar({ activeTab, onSelectTab, collapsed, onCollapsedChange, mainTabs, secondaryTabs, children }: Props) {
  const copy = useStudioSidebarCopy();
  const [moreOpen, setMoreOpen] = useState(false);
  const narrow = useSyncExternalStore(subscribeToNarrowLayout, () => window.matchMedia?.("(max-width: 1279px)").matches ?? false, () => false);
  const panelId = useId();
  const headingId = useId();
  const railRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const modal = narrow && !collapsed;
  const advancedActive = secondaryTabs.includes(activeTab);
  const heading = moreOpen ? copy.more : copy[activeTab];
  const help = moreOpen ? copy.moreHelp : copy[`${activeTab}Help`];

  useEffect(() => {
    if (modal) closeRef.current?.focus();
  }, [modal, moreOpen, activeTab]);

  function collapsePanel() {
    onCollapsedChange(true);
    setMoreOpen(false);
    const trigger = triggerRef.current ?? railRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]') ?? railRef.current?.querySelector<HTMLButtonElement>("button");
    trigger?.focus();
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      collapsePanel();
    }
    if (!modal || event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((element) => !element.closest("[hidden]") && element.getAttribute("aria-hidden") !== "true");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  return <aside className={styles.sidebar} data-collapsed={collapsed}>
    <nav className={styles.rail} ref={railRef} aria-label={copy.navigation}>
      {mainTabs.map((tab) => <button type="button" key={tab} aria-pressed={activeTab === tab && !moreOpen} data-active={activeTab === tab && !moreOpen} aria-controls={panelId} onClick={(event) => {
        triggerRef.current = event.currentTarget;
        setMoreOpen(false); onCollapsedChange(false); onSelectTab(tab);
      }}><StudioToolIcon tool={tab} /><span>{copy[tab]}</span></button>)}
      {secondaryTabs.length > 0 && <button type="button" className={styles.moreButton} aria-pressed={advancedActive || moreOpen} aria-expanded={moreOpen && !collapsed} aria-controls={panelId} onClick={(event) => {
        triggerRef.current = event.currentTarget;
        setMoreOpen(true); onCollapsedChange(false);
      }}><StudioToolIcon tool="more" /><span>{copy.more}</span></button>}
      {collapsed && <button type="button" aria-label={copy.expand} onClick={() => onCollapsedChange(false)}><StudioToolIcon tool="expand" /></button>}
    </nav>
    {modal && <button type="button" className={styles.backdrop} aria-label={copy.dismiss} tabIndex={-1} onClick={collapsePanel} />}
    <div id={panelId} ref={panelRef} className={styles.panel} hidden={collapsed} role={modal ? "dialog" : "region"} aria-modal={modal || undefined} aria-labelledby={headingId} onKeyDown={onPanelKeyDown}>
      <header className={styles.panelHeader}>
        <div><h2 id={headingId}>{heading}</h2><p>{help}</p></div>
        <button ref={closeRef} type="button" aria-label={copy.collapse} title={copy.collapse} onClick={collapsePanel}><StudioToolIcon tool="collapse" /></button>
      </header>
      <div className={styles.panelContent}>
        {moreOpen && <div className={styles.secondaryTools}>{secondaryTabs.map((tab) => <button type="button" key={tab} onClick={() => { onSelectTab(tab); setMoreOpen(false); }}><StudioToolIcon tool={tab} /><span>{copy[tab]}</span></button>)}</div>}
        <div hidden={moreOpen}>{children}</div>
      </div>
    </div>
  </aside>;
}
