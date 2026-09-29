import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, ThemeSelector } from "./theme";

const STORAGE_KEY = "gms-management-theme-v1";

function mediaQuery(initialMatches = false) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  return {
    get matches() { return matches; },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    change(nextMatches: boolean) {
      matches = nextMatches;
      listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent));
    },
  };
}

describe("management theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => vi.unstubAllGlobals());

  it("defaults to the system theme and follows operating-system changes", async () => {
    const media = mediaQuery(false);
    vi.stubGlobal("matchMedia", vi.fn(() => media));

    render(<ThemeProvider><ThemeSelector /></ThemeProvider>);

    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "light"));

    media.change(true);
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
  });

  it("applies and persists an explicit preference", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery(false)));
    const first = render(<ThemeProvider><ThemeSelector /></ThemeProvider>);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));

    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");
    first.unmount();

    render(<ThemeProvider><ThemeSelector /></ThemeProvider>);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("falls back safely when the stored value is invalid", async () => {
    window.localStorage.setItem(STORAGE_KEY, "sepia");
    vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery(true)));

    render(<ThemeProvider><ThemeSelector /></ThemeProvider>);

    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(document.documentElement).toHaveAttribute("data-theme", "dark"));
  });
});
