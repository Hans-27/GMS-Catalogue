"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { searchGlobally, type GlobalSearchItem } from "@/lib/api";
import { useLanguage } from "@/lib/i18n";
import styles from "./dashboard.module.css";


type Props = {
  onSelect: (item: GlobalSearchItem) => void;
};


export function GlobalSearch({ onSelect }: Props) {
  const { t } = useLanguage();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [groups, setGroups] = useState<Record<string, GlobalSearchItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchActivated, setSearchActivated] = useState(false);
  const flattened = useMemo(() => Object.values(groups).flat(), [groups]);

  useEffect(() => {
    function shortcut(event: globalThis.KeyboardEvent) {
      const target = event.target;
      if (
        event.key !== "/" ||
        (target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']"))
      ) return;
      event.preventDefault();
      inputRef.current?.focus();
      setOpen(true);
    }
    function outside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", shortcut);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", shortcut);
      window.removeEventListener("pointerdown", outside);
    };
  }, []);

  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setFailed(false);
      void searchGlobally(value, controller.signal)
        .then((result) => {
          setGroups(result.groups);
          setActiveIndex(-1);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setGroups({});
          setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(item: GlobalSearchItem) {
    setOpen(false);
    setQuery("");
    setGroups({});
    onSelect(item);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!flattened.length || !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Enter") {
      const selected = flattened[activeIndex];
      if (selected) choose(selected);
      return;
    }
    setActiveIndex((current) => {
      if (event.key === "ArrowDown") return (current + 1) % flattened.length;
      return current <= 0 ? flattened.length - 1 : current - 1;
    });
  }

  const showPanel = open && (query.trim().length >= 2 || loading);
  let itemIndex = -1;

  return (
    <div className={styles.globalSearch} ref={rootRef}>
      <span aria-hidden="true" className={styles.globalSearchIcon}>&#128269;</span>
      <input
        ref={inputRef}
        type="search"
        name="catalogue-global-filter"
        autoComplete="one-time-code"
        data-1p-ignore="true"
        data-lpignore="true"
        data-bwignore="true"
        readOnly={!searchActivated}
        value={query}
        placeholder={t("Search products, catalogues, brands or categories")}
        aria-label={t("Global search")}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showPanel}
        aria-controls="global-search-results"
        aria-activedescendant={activeIndex >= 0 ? `global-search-result-${activeIndex}` : undefined}
        onFocus={() => {
          setSearchActivated(true);
          setOpen(true);
        }}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim().length < 2) {
            setGroups({});
            setLoading(false);
            setFailed(false);
          }
          setOpen(true);
        }}
        onKeyDown={keyDown}
      />
      <kbd>/</kbd>
      {showPanel && (
        <div className={styles.globalSearchPanel} id="global-search-results" role="listbox" aria-label={t("Search results")}>
          {loading && <div className={styles.globalSearchMessage} aria-live="polite">{t("Searching...")}</div>}
          {!loading && failed && <div className={styles.globalSearchMessage} role="alert">{t("Search is temporarily unavailable.")}</div>}
          {!loading && !failed && flattened.length === 0 && <div className={styles.globalSearchMessage}>{t("No accessible results found.")}</div>}
          {!loading && !failed && Object.entries(groups).map(([group, items]) => (
            <section key={group} aria-label={t(group)}>
              <h3>{t(group)}</h3>
              {items.map((item) => {
                itemIndex += 1;
                const index = itemIndex;
                return (
                  <button
                    type="button"
                    role="option"
                    id={`global-search-result-${index}`}
                    aria-selected={index === activeIndex}
                    data-active={index === activeIndex}
                    key={`${item.kind}:${item.id}`}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(item)}
                  >
                    <span aria-hidden="true">{item.kind.slice(0, 2).toUpperCase()}</span>
                    <i><strong>{item.title}</strong><small>{item.subtitle}</small></i>
                    <b aria-hidden="true">&#8594;</b>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
