"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export const SIDEBAR_VISIBILITY_STORAGE_KEY = "gms-sidebar-hidden-items-v1";
const SIDEBAR_VISIBILITY_EVENT = "gms-sidebar-visibility-change";
const EMPTY_SNAPSHOT = "[]";

function snapshot() {
  if (typeof window === "undefined") return EMPTY_SNAPSHOT;
  try {
    return window.localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY) || EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function hiddenItems(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === SIDEBAR_VISIBILITY_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(SIDEBAR_VISIBILITY_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SIDEBAR_VISIBILITY_EVENT, listener);
  };
}

export function useSidebarVisibility() {
  const stored = useSyncExternalStore(subscribe, snapshot, () => EMPTY_SNAPSHOT);
  const hidden = useMemo(() => hiddenItems(stored), [stored]);
  const isVisible = useCallback((href: string) => !hidden.has(href), [hidden]);
  const setVisible = useCallback((href: string, visible: boolean) => {
    const next = hiddenItems(snapshot());
    if (visible) next.delete(href);
    else next.add(href);
    try {
      window.localStorage.setItem(
        SIDEBAR_VISIBILITY_STORAGE_KEY,
        JSON.stringify([...next]),
      );
    } catch {
      return false;
    }
    window.dispatchEvent(new Event(SIDEBAR_VISIBILITY_EVENT));
    return true;
  }, []);

  return { isVisible, setVisible };
}
