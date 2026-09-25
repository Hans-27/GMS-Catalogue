import { fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applicationBranding } from "@/lib/branding";
import { LanguageProvider } from "@/lib/i18n";
import { APP_ROUTES, type DashboardView } from "@/lib/routes";
import { DashboardSidebar } from "./dashboard-sidebar";

vi.mock("next/link", () => ({
  default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a>,
}));

const user = {
  id: "user-1",
  username: "superadmin",
  email: "superadmin@example.com",
  full_name: "Super Administrator",
  roles: ["superadmin"],
  permissions: ["dashboard.view", "catalogue.view", "prices.view"],
};

const navigationItems = [
  ["overview", "OV", "Overview"],
  ["products", "PR", "Products"],
  ["pricing", "PM", "Price Lists"],
] as Array<readonly [DashboardView, string, string]>;

function Harness({ collapsed = false, initialMobileOpen = false }: { collapsed?: boolean; initialMobileOpen?: boolean }) {
  const [active, setActive] = useState<DashboardView>("products");
  const [mobileOpen, setMobileOpen] = useState(initialMobileOpen);
  return (
    <LanguageProvider>
      <DashboardSidebar
        activeView={active}
        navigationItems={navigationItems}
        productCount={12}
        inReviewCount={2}
        user={user}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onNavigate={setActive}
        onBrandNavigate={() => setActive("overview")}
        onToggleCollapsed={vi.fn()}
        onCloseMobile={() => setMobileOpen(false)}
      />
    </LanguageProvider>
  );
}

describe("DashboardSidebar brand navigation", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", APP_ROUTES.overview);
    window.localStorage.setItem("gms-catalogue-language", "th");
    Object.defineProperty(window, "scrollTo", { configurable: true, value: vi.fn() });
  });

  it("makes the full expanded brand area an accessible link to the shared Overview route", () => {
    render(<Harness />);
    const brand = screen.getByRole("link", { name: "Go to Overview" });
    expect(brand).toHaveAttribute("href", APP_ROUTES.overview);
    expect(within(brand).getByRole("img", { name: applicationBranding.companyName })).toBeInTheDocument();
    expect(within(brand).getByText(applicationBranding.companyName)).toBeInTheDocument();
    expect(within(brand).getByText(applicationBranding.applicationName)).toBeInTheDocument();
  });

  it("returns to Overview, activates its menu item, preserves auth and language, and avoids a same-route reload", () => {
    render(<Harness />);
    const brand = screen.getByRole("link", { name: "Go to Overview" });
    expect(fireEvent.click(brand)).toBe(false);
    expect(screen.getByRole("link", { name: /^Dashboard/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Super Administrator")).toBeInTheDocument();
    expect(window.localStorage.getItem("gms-catalogue-language")).toBe("th");
  });

  it("keeps the collapsed logo clickable and supplies its tooltip", () => {
    render(<Harness collapsed />);
    const brand = screen.getByRole("link", { name: "Go to Overview" });
    expect(brand).toHaveAttribute("title", "Go to Overview");
    fireEvent.click(brand);
    expect(screen.getByRole("link", { name: /^Dashboard/ })).toHaveAttribute("aria-current", "page");
  });

  it("gives dashboard modules real URLs while keeping same-page navigation fast", () => {
    render(<Harness />);
    const products = screen.getByRole("link", { name: /^Products/ });
    expect(products).toHaveAttribute("href", "/dashboard?view=products");
    expect(fireEvent.click(products)).toBe(false);
    expect(products).toHaveAttribute("aria-current", "page");
  });

  it("uses the Thai baht symbol for Price Lists", () => {
    render(<Harness />);
    const priceLists = screen.getByRole("link", { name: /^Price Lists/ });
    expect(within(priceLists).getByText("฿")).toBeInTheDocument();
    expect(priceLists).not.toHaveTextContent("$");
  });

  it("closes the mobile drawer after brand navigation", () => {
    render(<Harness initialMobileOpen />);
    expect(screen.getByLabelText("Close navigation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Go to Overview" }));
    expect(screen.queryByLabelText("Close navigation")).not.toBeInTheDocument();
  });

  it("supports keyboard Enter activation", () => {
    render(<Harness />);
    const brand = screen.getByRole("link", { name: "Go to Overview" });
    brand.focus();
    expect(brand).toHaveFocus();
    fireEvent.keyDown(brand, { key: "Enter" });
    expect(screen.getByRole("link", { name: /^Dashboard/ })).toHaveAttribute("aria-current", "page");
  });

  it("shows Sales users catalogues and read-only system tools", () => {
    render(
      <LanguageProvider>
        <DashboardSidebar
          activeView="catalogues"
          navigationItems={[["overview", "OV", "Overview"], ["products", "PR", "Products"], ["catalogues", "CM", "Catalogues"]]}
          productCount={12}
          inReviewCount={2}
          user={{
            ...user,
            roles: ["sales_user"],
            permissions: [
              "dashboard.view",
              "products.view",
              "catalogues.view",
              "data_sync.view",
              "system_metrics.view",
              "settings.view",
            ],
          }}
          collapsed={false}
          mobileOpen={false}
          onNavigate={vi.fn()}
          onBrandNavigate={vi.fn()}
          onToggleCollapsed={vi.fn()}
          onCloseMobile={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByRole("link", { name: "Go to Catalogues" })).toHaveAttribute("href", APP_ROUTES.catalogues);
    expect(screen.getByRole("link", { name: "Catalogues" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Data Synchronization" })).toHaveAttribute("href", APP_ROUTES.dataSync);
    expect(screen.getByRole("link", { name: "System Health" })).toHaveAttribute("href", APP_ROUTES.systemHealth);
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", APP_ROUTES.settings);
    expect(screen.queryByRole("link", { name: /^Dashboard/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Products/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toBeInTheDocument();
  });

  it("shows the standalone Product Cards workspace to Sales Admin", () => {
    render(
      <LanguageProvider>
        <DashboardSidebar
          activeView="catalogues"
          navigationItems={[["catalogues", "CM", "Catalogues"]]}
          productCount={12}
          inReviewCount={0}
          user={{ ...user, roles: ["sales_manager"], permissions: ["catalogues.view", "product_cards.view"] }}
          collapsed={false}
          mobileOpen={false}
          onNavigate={vi.fn()}
          onBrandNavigate={vi.fn()}
          onToggleCollapsed={vi.fn()}
          onCloseMobile={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByRole("link", { name: "Product Cards" })).toHaveAttribute("href", APP_ROUTES.productCards);
  });

  it("gives Customer accounts a catalogue-only navigation", () => {
    render(
      <LanguageProvider>
        <DashboardSidebar
          activeView="catalogues"
          navigationItems={[["catalogues", "CM", "Catalogues"]]}
          productCount={0}
          inReviewCount={0}
          user={{
            ...user,
            full_name: "Shared Customer",
            roles: ["customer_user"],
            permissions: ["catalogues.view", "catalogues.preview"],
          }}
          collapsed={false}
          mobileOpen={false}
          onNavigate={vi.fn()}
          onBrandNavigate={vi.fn()}
          onToggleCollapsed={vi.fn()}
          onCloseMobile={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByRole("link", { name: "Go to Catalogues" })).toHaveAttribute("href", APP_ROUTES.catalogues);
    expect(screen.getByRole("link", { name: "Catalogues" })).toBeInTheDocument();
    expect(screen.getByText("Customer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Dashboard/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Data Synchronization" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  it("keeps the navigation scrollable without showing a scrollbar", () => {
    const css = readFileSync(join(process.cwd(), "src/app/dashboard/dashboard.module.css"), "utf8");
    expect(css).toMatch(/\.sidebar nav\s*\{[\s\S]*?overflow-y:\s*auto;[\s\S]*?scrollbar-width:\s*none;/);
    expect(css).toMatch(/\.sidebar nav::\-webkit-scrollbar\s*\{[\s\S]*?display:\s*none;/);
  });
});
