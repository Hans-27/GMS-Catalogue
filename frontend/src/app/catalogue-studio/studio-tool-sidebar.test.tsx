import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider, LanguageSwitcher } from "@/lib/i18n";
import { StudioToolSidebar, type StudioToolTab } from "./studio-tool-sidebar";

function Harness({ restricted = false }: { restricted?: boolean }) {
  const [tab, setTab] = useState<StudioToolTab>("products");
  const [collapsed, setCollapsed] = useState(false);
  return <StudioToolSidebar activeTab={tab} onSelectTab={setTab} collapsed={collapsed} onCollapsedChange={setCollapsed}
    mainTabs={restricted ? ["cover", "pages"] : ["products", "cover", "elements", "cards", "media", "pages"]}
    secondaryTabs={restricted ? [] : ["prices", "fields", "layers"]}>
    <input aria-label="Library query" defaultValue="" />
    <button type="button">Insert item</button>
  </StudioToolSidebar>;
}

afterEach(() => vi.unstubAllGlobals());

describe("Studio tool sidebar", () => {
  // Catches incorrect tab dispatch or a rail that only changes its highlight.
  it("opens the selected tool with its own heading", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Products" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Uploads" }));
    expect(screen.getByRole("heading", { name: "Uploads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Uploads" })).toHaveAttribute("aria-pressed", "true");
  });

  // Catches remounting/discarding tool contents when the panel is collapsed.
  it("retains library state when collapsed and reopens from the rail", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Library query"), { target: { value: "adapter" } });
    fireEvent.click(screen.getByRole("button", { name: "Collapse tool panel" }));
    expect(screen.getByLabelText("Library query")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    expect(screen.getByLabelText("Library query")).toBeVisible();
    expect(screen.getByLabelText("Library query")).toHaveValue("adapter");
  });

  // Catches losing an advanced selection when the secondary chooser closes.
  it("opens secondary tools and keeps their active heading", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "More tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Layers" }));
    expect(screen.getByRole("heading", { name: "Layers" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Layers" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More tools" })).toHaveAttribute("aria-pressed", "true");
  });

  // Catches accidentally exposing actions omitted by the permission owner.
  it("shows only permitted tools", () => {
    render(<Harness restricted />);
    expect(screen.getByRole("button", { name: "Cover" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Products" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More tools" })).not.toBeInTheDocument();
  });

  // Catches untranslated navigation and controls after a live language change.
  it("switches sidebar labels and dismissal controls to Thai", () => {
    render(<LanguageProvider><LanguageSwitcher /><Harness /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "ไทย" }));
    expect(screen.getByRole("button", { name: "สินค้า" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ยุบแผงเครื่องมือ" })).toBeInTheDocument();
  });

  // Catches a modal library without Escape/focus return or keyboard containment.
  it("dismisses the narrow-screen sheet with Escape and returns focus to its tool", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    render(<Harness />);
    const sheet = screen.getByRole("dialog", { name: "Products" });
    const close = screen.getByRole("button", { name: "Collapse tool panel" });
    close.focus();
    fireEvent.keyDown(sheet, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Insert item" })).toHaveFocus();
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Products" })).toHaveFocus();
  });
});
