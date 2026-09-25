/* eslint-disable @next/next/no-img-element -- Native img fixtures verify original catalogue-logo fallback. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogueSidebar, useCatalogueCurrentSection } from "./catalogue-sidebar";
import { LanguageProvider, LanguageSwitcher } from "@/lib/i18n";

const common = { title: "Illustrative catalogue", searchLabel: "Search products", searchValue: "", onSearchChange: vi.fn() };
const sectionIds = ["section-a", "section-b"];
function ObservedSections() {
  const [current] = useCatalogueCurrentSection(sectionIds);
  return <><output aria-label="Current section">{current}</output><section id="section-a" /><section id="section-b" /></>;
}

describe("CatalogueSidebar", () => {
  afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); document.body.style.overflow = ""; });

  it("retains still-visible sections across partial observer entry batches", () => {
    let notify: IntersectionObserverCallback;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe = vi.fn(); disconnect = vi.fn();
    });
    render(<ObservedSections />);
    const entry = (id: string, isIntersecting: boolean, intersectionRatio: number): IntersectionObserverEntry => {
      const target = document.getElementById(id)!;
      const bounds = new DOMRect(0, isIntersecting ? innerHeight * .85 - intersectionRatio * 1000 : innerHeight, 100, 1000);
      target.getBoundingClientRect = () => bounds;
      return { target, isIntersecting, intersectionRatio, time: 0, boundingClientRect: bounds, intersectionRect: new DOMRect(), rootBounds: null };
    };
    act(() => notify([entry("section-a", true, .1), entry("section-b", true, .06)], {} as IntersectionObserver));
    expect(screen.getByLabelText("Current section")).toHaveTextContent("section-a");
    act(() => notify([entry("section-a", false, 0)], {} as IntersectionObserver));
    expect(screen.getByLabelText("Current section")).toHaveTextContent("section-b");
  });

  it("refreshes visible geometry on scroll even when no observer threshold changes", async () => {
    let notify: IntersectionObserverCallback;
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {} disconnect() {}
    });
    render(<ObservedSections />);
    const first = document.getElementById("section-a")!;
    const second = document.getElementById("section-b")!;
    let firstBounds = new DOMRect(0, innerHeight * .15, 100, 500);
    let secondBounds = new DOMRect(0, innerHeight * .85 - 200, 100, 500);
    first.getBoundingClientRect = () => firstBounds;
    second.getBoundingClientRect = () => secondBounds;
    const entry = (target: Element, ratio: number, bounds: DOMRect): IntersectionObserverEntry => ({ target, isIntersecting: true, intersectionRatio: ratio, boundingClientRect: bounds, intersectionRect: bounds, rootBounds: null, time: 0 });
    act(() => notify([entry(first, .9, firstBounds), entry(second, .4, secondBounds)], {} as IntersectionObserver));
    expect(screen.getByLabelText("Current section")).toHaveTextContent("section-a");
    // Both scores stay in the same >.35 observer bucket; there is no new callback.
    firstBounds = new DOMRect(0, innerHeight * .15 - 310, 100, 500);
    secondBounds = new DOMRect(0, innerHeight * .15, 100, 500);
    fireEvent.scroll(window);
    await waitFor(() => expect(screen.getByLabelText("Current section")).toHaveTextContent("section-b"));
  });

  it("falls back to the existing GMS logo when a supplied logo is empty or fails", () => {
    const { rerender } = render(<CatalogueSidebar {...common} categories={[]} logo={<img src="/missing-brand.png" alt="Saved brand" />} />);
    fireEvent.error(screen.getByRole("img", { name: "Saved brand" }));
    expect(screen.getByRole("img", { name: "G.M.S. Corporation Co., Ltd." })).toHaveAttribute("src", "/branding/gms-corporation-logo-v1.jpg");
    rerender(<CatalogueSidebar {...common} categories={[]} logo={<img src="" alt="Empty brand" />} />);
    expect(screen.queryByRole("img", { name: "Empty brand" })).not.toBeInTheDocument();
  });

  it("shows zero counts and preserves explicit page counts without inventing products", () => {
    render(<CatalogueSidebar {...common} categories={[{ id: "empty", label: "Empty", count: 0, countLabel: "0 products" }, { id: "paged", label: "Paged", count: 3, countLabel: "3 pages", active: true }]} />);
    expect(screen.getByRole("button", { name: "Empty, 0 products" })).toHaveTextContent("0");
    expect(screen.getByRole("button", { name: "Paged, 3 pages" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps search controlled and delegates filtering to the viewer", () => {
    const change = vi.fn();
    const { container } = render(<CatalogueSidebar {...common} onSearchChange={change} categories={[]} />);
    fireEvent.change(within(container.querySelector("aside")!).getByRole("searchbox"), { target: { value: "adapter" } });
    expect(change).toHaveBeenCalledWith("adapter");
    expect(screen.getByText("No matching categories.")).toBeInTheDocument();
  });

  it("places the GMS logo and search in the mobile header with Categories in the row below", () => {
    const change = vi.fn();
    const { container } = render(<CatalogueSidebar {...common} onSearchChange={change} categories={[]} />);
    const mobileTrigger = container.querySelector<HTMLButtonElement>("button[aria-controls]")!;
    const mobileSearch = container.querySelector<HTMLInputElement>('input[id$="mobile-header-search"]')!;
    const mobileHeader = mobileSearch.parentElement!.parentElement!;

    // CSS media queries are not evaluated by jsdom, so the mobile bar remains
    // visually hidden here; its labelled search structure is still testable.
    const search = within(mobileHeader).getByLabelText("Search products");
    expect(within(mobileHeader).getByRole("link", { name: "Back to Dashboard", hidden: true })).toContainElement(
      within(mobileHeader).getByRole("img", { name: "G.M.S. Corporation Co., Ltd.", hidden: true }),
    );
    expect(within(mobileHeader).queryByRole("button", { name: "Categories" })).not.toBeInTheDocument();
    expect(mobileTrigger.parentElement?.previousElementSibling).toBe(mobileHeader);
    expect(search).toHaveAttribute("type", "search");
    fireEvent.change(search, { target: { value: "mouse" } });

    expect(change).toHaveBeenCalledWith("mouse");
    expect(within(mobileHeader).queryByText("Illustrative catalogue")).not.toBeInTheDocument();
  });

  it("keeps a category action separate from navigation", () => {
    const select = vi.fn();
    const download = vi.fn();
    render(<CatalogueSidebar {...common} categories={[{
      id: "adapter",
      label: "Adapter",
      href: "#category-adapter",
      count: 4,
      countLabel: "4 products",
      onSelect: select,
      action: { label: "Download Adapter as Excel", onSelect: download },
    }]} />);

    fireEvent.click(screen.getByRole("button", { name: "Download Adapter as Excel" }));
    expect(download).toHaveBeenCalledOnce();
    expect(select).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Adapter, 4 products" })).toHaveAttribute("href", "#category-adapter");
  });

  it("opens a labelled drawer, closes on Escape and restores focus and body scrolling", () => {
    const { container } = render(<CatalogueSidebar {...common} categories={[{ id: "adapter", label: "Adapter" }]} />);
    // jsdom has no responsive layout; the actual mobile trigger is exercised in Chrome.
    const trigger = container.querySelector<HTMLButtonElement>("button[aria-controls]")!;
    trigger.focus();
    fireEvent.click(trigger);
    const drawer = screen.getByRole("dialog", { name: "Catalogue categories" });
    const search = within(drawer).getByRole("searchbox");
    expect(search).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(search, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes the drawer after navigating and confines tabbing", () => {
    const select = vi.fn();
    const { container } = render(<CatalogueSidebar {...common} categories={[{ id: "adapter", label: "Adapter", onSelect: select }]} />);
    fireEvent.click(container.querySelector<HTMLButtonElement>("button[aria-controls]")!);
    const drawer = screen.getByRole("dialog");
    const category = within(drawer).getByRole("button", { name: "Adapter" });
    category.focus();
    fireEvent.keyDown(category, { key: "Tab" });
    expect(within(drawer).getByRole("button", { name: "Close categories" })).toHaveFocus();
    fireEvent.click(category);
    expect(select).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preserves optional collapse without adding it for other viewers", () => {
    const toggle = vi.fn();
    const { rerender } = render(<CatalogueSidebar {...common} categories={[]} collapsed onToggleCollapse={toggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Expand sidebar" }));
    expect(toggle).toHaveBeenCalledOnce();
    rerender(<CatalogueSidebar {...common} categories={[]} />);
    expect(screen.queryByRole("button", { name: "Collapse sidebar" })).not.toBeInTheDocument();
  });

  it("translates shared navigation controls and empty state to Thai", async () => {
    render(<LanguageProvider><LanguageSwitcher /><CatalogueSidebar {...common} categories={[]} /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "ไทย" }));
    expect(await screen.findByRole("complementary", { name: "หมวดหมู่แคตตาล็อก" })).toBeInTheDocument();
    expect(screen.getByText("ไม่พบหมวดหมู่ที่ตรงกัน")).toBeInTheDocument();
  });
});
