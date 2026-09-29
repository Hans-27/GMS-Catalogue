"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import styles from "./theme.module.css";
import { useLanguage } from "./i18n";

export type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "gms-management-theme-v1";
const DARK_QUERY = "(prefers-color-scheme: dark)";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function validPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function storedPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return validPreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setPreferenceState(storedPreference());
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const apply = (next: ResolvedTheme) => {
      setResolvedTheme(next);
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
    };

    apply(resolveTheme(preference));
    if (preference !== "system" || !window.matchMedia) return;

    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) =>
      apply(event.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Theme changes still apply in memory when storage is unavailable.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

export function ThemeSelector({ className = "" }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const { t } = useLanguage();
  const options: ThemePreference[] = ["light", "dark", "system"];

  return (
    <div
      className={`${styles.selector} ${className}`.trim()}
      role="group"
      aria-label={t("Appearance")}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={preference === option}
          onClick={() => setPreference(option)}
        >
          {t(option.slice(0, 1).toUpperCase() + option.slice(1))}
        </button>
      ))}
    </div>
  );
}

