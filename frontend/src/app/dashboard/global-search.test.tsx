import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import { searchGlobally, type GlobalSearchItem } from "@/lib/api";
import { GlobalSearch } from "./global-search";


vi.mock("@/lib/api", () => ({ searchGlobally: vi.fn() }));

const product: GlobalSearchItem = {
  kind: "product",
  id: "product-1",
  title: "Mori Green Tea",
  subtitle: "SKU-1 · Mori",
  href: "/dashboard?view=products&q=SKU-1",
  search_value: "SKU-1",
};

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(searchGlobally).mockReset();
    vi.mocked(searchGlobally).mockResolvedValue({ query: "mori", groups: { products: [product] }, total: 1 });
  });

  afterEach(() => vi.useRealTimers());

  it("debounces requests, groups accessible results and selects a result", async () => {
    const onSelect = vi.fn();
    render(<LanguageProvider><GlobalSearch onSelect={onSelect} /></LanguageProvider>);
    const input = screen.getByRole("combobox", { name: "Global search" });
    fireEvent.change(input, { target: { value: "mori" } });
    expect(searchGlobally).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(searchGlobally).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Mori Green Tea")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /Mori Green Tea/ }));
    expect(onSelect).toHaveBeenCalledWith(product);
  });

  it("supports the slash shortcut and Escape", () => {
    render(<LanguageProvider><GlobalSearch onSelect={vi.fn()} /></LanguageProvider>);
    const input = screen.getByRole("combobox", { name: "Global search" });
    fireEvent.keyDown(window, { key: "/" });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "mo" } });
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("prevents account credentials from autofilling the global search", () => {
    render(<LanguageProvider><GlobalSearch onSelect={vi.fn()} /></LanguageProvider>);
    const input = screen.getByRole("combobox", { name: "Global search" });

    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("readonly");
    fireEvent.focus(input);
    expect(input).not.toHaveAttribute("readonly");
  });
});
