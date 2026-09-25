import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "@/lib/i18n";
import type { AuthenticatedUser, DashboardOverview } from "@/lib/api";
import { DashboardOverviewPanel } from "./dashboard-overview";


const baseUser: AuthenticatedUser = {
  id: "user-1",
  username: "editor",
  email: "editor@example.com",
  full_name: "Narin Editor",
  roles: ["Catalogue Editor"],
  permissions: ["dashboard.view", "products.view", "products.create", "catalogues.view", "catalogue_designs.create"],
  department: "Catalogue",
  position: "Editor",
};

const overview: DashboardOverview = {
  summary: {
    active_products: 12,
    inactive_products: null,
    published_catalogues: 3,
    draft_catalogues: 2,
    active_promotions: null,
    pending_my_approval: null,
  },
  product_metrics: null,
  attention: [{
    key: "missing_image",
    title: "Products Missing Main Image",
    count: 4,
    severity: "warning",
    target: "products",
    filter_name: "needs",
    filter_value: "image",
  }],
  my_work: [],
  recent_catalogues: [],
  recent_products: [],
  upcoming_promotions: [],
  sync_status: {
    safe_status: "up_to_date",
    display_label: "Up to date",
    last_successful_at: new Date().toISOString(),
    technical_status: null,
    last_failed_at: null,
    can_open_details: false,
  },
  system_health: null,
};

function renderOverview(user = baseUser, data = overview) {
  const actions = {
    onOpenProductQueue: vi.fn(),
    onOpenProduct: vi.fn(),
    onOpenCatalogues: vi.fn(),
    onOpenUsers: vi.fn(),
    onAddProduct: vi.fn(),
    onRunSync: vi.fn(),
  };
  render(
    <LanguageProvider>
      <DashboardOverviewPanel user={user} overview={data} loading={false} syncing={false} {...actions} />
    </LanguageProvider>,
  );
  return actions;
}

describe("DashboardOverviewPanel", () => {
  beforeEach(() => window.localStorage.setItem("gms-catalogue-language", "en"));

  it("renders scoped cards and quick actions without restricted values", () => {
    const actions = renderOverview();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Narin");
    expect(screen.getByText("Active Products")).toBeInTheDocument();
    expect(screen.queryByText("Inactive Products")).not.toBeInTheDocument();
    expect(screen.queryByText("Active Promotions")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add Product/ }));
    expect(actions.onAddProduct).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Add Product/ })).toHaveAttribute("data-primary", "true");
    expect(screen.getByRole("link", { name: /Open Catalogue Studio/ })).toHaveAttribute("target", "_blank");
    expect(screen.queryByText("DS")).not.toBeInTheDocument();
    expect(screen.queryByText("PR")).not.toBeInTheDocument();
    expect(screen.queryByText("IM")).not.toBeInTheDocument();
    expect(screen.queryByText("System health")).not.toBeInTheDocument();
  });

  it("shows layout-matching loading skeletons", () => {
    const { container } = render(
      <LanguageProvider>
        <DashboardOverviewPanel
          user={baseUser}
          overview={null}
          loading
          syncing={false}
          onOpenProductQueue={vi.fn()}
          onOpenProduct={vi.fn()}
          onOpenCatalogues={vi.fn()}
          onOpenUsers={vi.fn()}
          onAddProduct={vi.fn()}
          onRunSync={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(container.querySelectorAll("[class*='dashboardCardSkeleton']").length).toBe(6);
  });
});
